import { describe, expect, it } from "vitest";
import { LAWS, type JointLimits } from "../trajectory";
import { forwardKinematics, positionOf, solveSphericalWrist, closestSolution, R6, homePose } from "../kinematics";
import { evaluatePath, planPath, samplePath } from "./path";

/**
 * Planner tests prove the timeline algebra (segment windows, cumulative
 * times, waypoint hits) and — in the final test — the full Phase-4
 * pipeline: Cartesian targets → analytic IK with branch continuity →
 * multi-segment synchronized path → evaluated joint states whose forward
 * kinematics land back on the taught Cartesian targets. The 1997 loop,
 * closed with the layer it never had.
 */

const limits3: JointLimits[] = [
  { maxVelocity: 2, maxAcceleration: 4 },
  { maxVelocity: 3, maxAcceleration: 6 },
  { maxVelocity: 1.5, maxAcceleration: 2 },
];

const spec3 = () => ({
  waypoints: [
    [0, 0.5, -0.4],
    [1.2, -0.3, 0.6],
    [0.4, 0.9, 0.1],
    [0, 0.5, -0.4],
  ],
  laws: [LAWS.quintic, LAWS.trapezoidal, LAWS.cubic],
  limits: limits3,
});

describe("planPath", () => {
  it("builds one synchronized segment group per waypoint pair", () => {
    const path = planPath(spec3());
    expect(path.segments).toHaveLength(3);
    expect(path.jointCount).toBe(3);
    for (const group of path.segments) {
      expect(group).toHaveLength(3);
      // Synchronization within the segment: one shared duration…
      expect(new Set(group.map((s) => s.duration)).size).toBe(1);
      // …dictated by the slowest joint.
      expect(group[0].duration).toBe(Math.max(...group.map((s) => s.minimumDuration)));
    }
  });

  it("accumulates segment times into a global timeline", () => {
    const path = planPath(spec3());
    expect(path.times[0]).toBe(0);
    for (let k = 0; k < 3; k++) {
      expect(path.times[k + 1] - path.times[k]).toBeCloseTo(path.segments[k][0].duration, 12);
    }
    expect(path.duration).toBeCloseTo(path.times[3], 12);
  });

  it("passes exactly through every waypoint at its segment boundary", () => {
    const spec = spec3();
    const path = planPath(spec);
    spec.waypoints.forEach((waypoint, k) => {
      const states = evaluatePath(path, path.times[k]);
      states.forEach((state, j) => {
        expect(state.position).toBeCloseTo(waypoint[j], 9);
        // Rest-to-rest laws: the robot stops at every waypoint.
        expect(Math.abs(state.velocity)).toBeLessThan(1e-9);
      });
    });
  });

  it("supports a different law on every segment", () => {
    const path = planPath(spec3());
    expect(path.segments.map((g) => g[0].law.id)).toEqual(["quintic", "trapezoidal", "cubic"]);
  });

  it("clamps evaluation outside the timeline to the end waypoints", () => {
    const spec = spec3();
    const path = planPath(spec);
    evaluatePath(path, -5).forEach((s, j) => expect(s.position).toBeCloseTo(spec.waypoints[0][j], 12));
    evaluatePath(path, path.duration + 5).forEach((s, j) =>
      expect(s.position).toBeCloseTo(spec.waypoints[3][j], 12),
    );
  });

  it("tolerates zero-length segments (repeated waypoints)", () => {
    const path = planPath({
      waypoints: [
        [0, 0, 0],
        [0, 0, 0],
        [1, 1, 1],
      ],
      laws: [LAWS.cubic, LAWS.cubic],
      limits: limits3,
    });
    expect(path.times[1]).toBe(0);
    expect(path.duration).toBeGreaterThan(0);
    evaluatePath(path, path.duration / 2).forEach((s) => expect(Number.isFinite(s.position)).toBe(true));
  });

  it("rejects malformed specs loudly", () => {
    const spec = spec3();
    expect(() => planPath({ ...spec, waypoints: [spec.waypoints[0]] })).toThrow(/at least 2/);
    expect(() => planPath({ ...spec, laws: [LAWS.cubic] })).toThrow(/segment laws/);
    expect(() => planPath({ ...spec, waypoints: [[0, 0], [1, 1], [2, 2], [3, 3]] })).toThrow(/joint values/);
  });
});

describe("samplePath", () => {
  it("produces fence-post samples with exact ends", () => {
    const spec = spec3();
    const path = planPath(spec);
    const samples = samplePath(path, 200);
    expect(samples.time).toHaveLength(201);
    expect(samples.time[200]).toBe(path.duration);
    samples.position.forEach((pos, j) => {
      expect(pos[0]).toBeCloseTo(spec.waypoints[0][j], 9);
      expect(pos[200]).toBeCloseTo(spec.waypoints[3][j], 9);
    });
  });
});

describe("the Phase-4 pipeline: Cartesian teaching through IK to playback", () => {
  it("a taught Cartesian path replays through the taught poses", () => {
    // Teach: four Cartesian targets derived from known joint poses (as the
    // gizmo would produce), solved with branch continuity like the UI does.
    const teachPoses = [
      homePose(R6),
      [0.6, 0.9, -0.7, 0.4, 0.8, 0.2],
      [-0.4, 0.7, -0.9, -0.6, 1.0, -0.3],
      homePose(R6),
    ];
    const waypoints: number[][] = [teachPoses[0]];
    for (let k = 1; k < teachPoses.length; k++) {
      const target = forwardKinematics(R6.joints, teachPoses[k])[6];
      const solution = closestSolution(solveSphericalWrist(R6, target), waypoints[k - 1]);
      expect(solution).not.toBeNull();
      waypoints.push(solution!.angles);
    }

    // Plan and replay: at every waypoint time, the robot's forward
    // kinematics must land on the taught Cartesian pose.
    const path = planPath({
      waypoints,
      laws: [LAWS.quintic, LAWS.trapezoidal, LAWS.quintic],
      limits: R6.joints.map(() => ({ maxVelocity: 1.5, maxAcceleration: 3 })),
    });
    teachPoses.forEach((pose, k) => {
      const taught = positionOf(forwardKinematics(R6.joints, pose)[6]);
      const replayed = evaluatePath(path, path.times[k]).map((s) => s.position);
      const reached = positionOf(forwardKinematics(R6.joints, replayed)[6]);
      expect(reached.x).toBeCloseTo(taught.x, 8);
      expect(reached.y).toBeCloseTo(taught.y, 8);
      expect(reached.z).toBeCloseTo(taught.z, 8);
    });
    // And the mid-segment motion respects every joint's limits.
    const samples = samplePath(path, 2000);
    samples.velocity.forEach((v) => {
      const peak = Math.max(...Array.from(v, Math.abs));
      expect(peak).toBeLessThanOrEqual(1.5 * (1 + 1e-9));
    });
  });
});
