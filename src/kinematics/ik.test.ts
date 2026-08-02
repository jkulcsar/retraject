import { describe, expect, it } from "vitest";
import { Matrix4 } from "three";
import { forwardKinematics, positionOf } from "./dh";
import { R6 } from "./robot";
import { closestSolution, solveSphericalWrist, wrapAngle } from "./ik";
import { solveDLS } from "./dls";

/**
 * The decisive invariant is the FK∘IK round trip: every solution the
 * analytic solver returns, fed back through forward kinematics, must
 * reproduce the target pose to near machine precision. That single check
 * validates all the trigonometry at once — a wrong sign anywhere breaks
 * it for some branch. The DLS solver then re-derives the same answers
 * knowing nothing but FK and derivatives: two independent methods, one
 * geometry.
 */

function maxElementDiff(a: Matrix4, b: Matrix4): number {
  let max = 0;
  for (let i = 0; i < 16; i++) max = Math.max(max, Math.abs(a.elements[i] - b.elements[i]));
  return max;
}

function randomPoses(count: number, seedInit = 0x2026): number[][] {
  let seed = seedInit;
  const next = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 2 ** 32);
  return Array.from({ length: count }, () =>
    R6.joints.map((j) => j.min + next() * (j.max - j.min)),
  );
}

const anglesMatch = (a: readonly number[], b: readonly number[], tol = 1e-6) =>
  a.every((t, i) => Math.abs(wrapAngle(t - b[i])) < tol);

describe("analytic spherical-wrist IK", () => {
  const poses = randomPoses(30);

  it("round trip: every returned solution reproduces the target pose exactly", () => {
    for (const pose of poses) {
      const target = forwardKinematics(R6.joints, pose)[6];
      const solutions = solveSphericalWrist(R6, target);
      expect(solutions.length).toBeGreaterThan(0);
      for (const s of solutions) {
        const reached = forwardKinematics(R6.joints, s.angles)[6];
        expect(maxElementDiff(reached, target)).toBeLessThan(1e-9);
      }
    }
  });

  it("recovers the pose the target was made from (as one of the branches)", () => {
    for (const pose of poses) {
      const target = forwardKinematics(R6.joints, pose)[6];
      const solutions = solveSphericalWrist(R6, target);
      const hit = solutions.some((s) => anglesMatch(s.angles, pose));
      expect(hit).toBe(true);
    }
  });

  it("finds all eight branches for a generic reachable pose", () => {
    const target = forwardKinematics(R6.joints, [0.4, 0.8, -0.5, 1.1, -0.9, 0.6])[6];
    const solutions = solveSphericalWrist(R6, target);
    expect(solutions).toHaveLength(8);
    // All distinct as angle vectors, and the branch labels are unique.
    const labels = new Set(solutions.map((s) => `${s.branch.shoulder}/${s.branch.elbow}/${s.branch.wrist}`));
    expect(labels.size).toBe(8);
    for (let i = 0; i < solutions.length; i++)
      for (let j = i + 1; j < solutions.length; j++)
        expect(anglesMatch(solutions[i].angles, solutions[j].angles, 1e-4)).toBe(false);
  });

  it("returns no solutions for an unreachable target", () => {
    const target = new Matrix4().makeTranslation(2.5, 0, 0.35); // far outside reach (~0.92 m)
    expect(solveSphericalWrist(R6, target)).toHaveLength(0);
  });

  it("handles the wrist singularity (θ5 = 0) with the θ4 = 0 convention", () => {
    const pose = [0.3, 0.5, -0.2, 0.7, 0, 0.4]; // θ5 = 0 aligns axes 4 and 6
    const target = forwardKinematics(R6.joints, pose)[6];
    const solutions = solveSphericalWrist(R6, target);
    const singular = solutions.filter((s) => s.wristSingular);
    expect(singular.length).toBeGreaterThan(0);
    for (const s of solutions) {
      const reached = forwardKinematics(R6.joints, s.angles)[6];
      expect(maxElementDiff(reached, target)).toBeLessThan(1e-9);
    }
    // Only θ4+θ6 is meaningful there; the convention parks θ4 at 0 and the
    // singular solution still reaches the pose (checked above), with
    // θ4+θ6 preserving the original sum.
    const match = singular.find((s) => anglesMatch(s.angles.slice(0, 3), pose.slice(0, 3)));
    expect(match).toBeDefined();
    expect(Math.abs(wrapAngle(match!.angles[3] + match!.angles[5] - (pose[3] + pose[5])))).toBeLessThan(1e-6);
  });

  it("refuses a robot that does not match the closed-form structure", () => {
    const broken = { ...R6, joints: R6.joints.map((j, i) => (i === 4 ? { ...j, a: 0.1 } : j)) };
    expect(() => solveSphericalWrist(broken, new Matrix4())).toThrow(/specific to the R6 structure/);
  });
});

describe("closestSolution (branch continuity)", () => {
  it("picks the branch the reference pose is on", () => {
    for (const pose of randomPoses(10)) {
      const target = forwardKinematics(R6.joints, pose)[6];
      const best = closestSolution(solveSphericalWrist(R6, target), pose);
      expect(best).not.toBeNull();
      expect(anglesMatch(best!.angles, pose)).toBe(true);
    }
  });

  it("stays on the same branch under a small target motion (no teleporting)", () => {
    const pose = [0.4, 0.8, -0.5, 1.1, -0.9, 0.6];
    const target = forwardKinematics(R6.joints, pose)[6];
    const first = closestSolution(solveSphericalWrist(R6, target), pose)!;
    const nudged = target.clone().multiply(new Matrix4().makeTranslation(0.004, -0.003, 0.002));
    const second = closestSolution(solveSphericalWrist(R6, nudged), first.angles)!;
    expect(second.branch).toEqual(first.branch);
    expect(anglesMatch(second.angles, first.angles, 0.1)).toBe(true);
  });
});

describe("damped-least-squares IK (numerical cross-check)", () => {
  const poses = randomPoses(10, 0x1996);

  it("converges to the target pose from a perturbed seed", () => {
    // The random set deliberately includes poses whose wrist center passes
    // millimeters from the base axis (shoulder singularity) — the hard
    // regime where damping earns its keep. Tolerances are physical: 1e-7 m
    // is a tenth of a micrometre.
    let seed = 7;
    const noise = () => ((seed = (seed * 48271) % 2147483647), (seed / 2147483647 - 0.5) * 0.5);
    for (const pose of poses) {
      const target = forwardKinematics(R6.joints, pose)[6];
      const result = solveDLS(R6, target, pose.map((t) => t + noise()));
      expect(result.converged).toBe(true);
      const reached = forwardKinematics(R6.joints, result.angles)[6];
      expect(positionDistance(reached, target)).toBeLessThan(1e-7);
      expect(maxElementDiff(reached, target)).toBeLessThan(1e-6);
    }
  });

  it("agrees with the analytic solver: it lands on one of the eight branches", () => {
    for (const pose of poses) {
      const target = forwardKinematics(R6.joints, pose)[6];
      // Near the shoulder singularity θ1 is ill-conditioned and joint-space
      // branch identity blurs (pose-space accuracy is still asserted
      // above), so restrict the branch comparison to well-conditioned
      // poses: wrist center > 5 cm off the base axis.
      const wrist = positionOf(forwardKinematics(R6.joints, pose)[5]);
      if (Math.hypot(wrist.x, wrist.y) < 0.05) continue;
      const result = solveDLS(R6, target, pose.map((t) => t + 0.15));
      expect(result.converged).toBe(true);
      const analytic = solveSphericalWrist(R6, target);
      const onABranch = analytic.some((s) => anglesMatch(s.angles, result.angles, 1e-4));
      expect(onABranch).toBe(true);
    }
  });

  it("remains finite and accurate at the wrist singularity (where damping earns its keep)", () => {
    const pose = [0.3, 0.5, -0.2, 0.7, 0, 0.4];
    const target = forwardKinematics(R6.joints, pose)[6];
    const result = solveDLS(R6, target, pose.map((t) => t + 0.1));
    expect(result.angles.every(Number.isFinite)).toBe(true);
    expect(result.converged).toBe(true);
  });
});

function positionDistance(a: Matrix4, b: Matrix4): number {
  const pa = positionOf(a);
  const pb = positionOf(b);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
}
