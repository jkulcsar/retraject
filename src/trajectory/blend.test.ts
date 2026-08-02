import { describe, expect, it } from "vitest";
import type { JointLimits } from "./law";
import { evaluateBlendedPath, planBlendedPath, sampleBlendedPath } from "./blend";

/**
 * The blended path's contract rests on two exact closed-form properties
 * (corner-cut distance Δv·tb/8; rejoining the ideal line outside ramps)
 * plus the promises that justify its existence: nonzero velocity at the
 * vias, C¹ continuity, and limits respected even when the timeline had
 * to be stretched to fit the blends.
 */

const limits: JointLimits[] = [
  { maxVelocity: 30, maxAcceleration: 60 },
  { maxVelocity: 40, maxAcceleration: 80 },
  { maxVelocity: 25, maxAcceleration: 50 },
];

const waypoints = [
  [0, -45, 10],
  [90, 45, 15],
  [40, 0, -20],
  [70, 20, 5],
];

describe("planBlendedPath", () => {
  const path = planBlendedPath(waypoints, limits);

  it("starts and ends exactly at the terminal waypoints, at rest", () => {
    const first = evaluateBlendedPath(path, 0);
    const last = evaluateBlendedPath(path, path.duration);
    first.forEach((s, j) => {
      expect(s.position).toBeCloseTo(waypoints[0][j], 12);
      expect(s.velocity).toBeCloseTo(0, 12);
    });
    last.forEach((s, j) => {
      expect(s.position).toBeCloseTo(waypoints[3][j], 9);
      expect(s.velocity).toBeCloseTo(0, 9);
    });
  });

  it("does NOT stop at interior vias — the whole point of blending", () => {
    for (const k of [1, 2]) {
      const states = evaluateBlendedPath(path, path.viaTimes[k]);
      const speed = Math.max(...states.map((s) => Math.abs(s.velocity)));
      expect(speed).toBeGreaterThan(1);
    }
  });

  it("cuts each via corner by exactly Δv·tb/8 (the closed-form price of not stopping)", () => {
    for (const k of [1, 2]) {
      const tb = path.blendDurations[k];
      const states = evaluateBlendedPath(path, path.viaTimes[k]);
      states.forEach((s, j) => {
        const dv = path.velocities[k][j] - path.velocities[k - 1][j];
        expect(s.position - waypoints[k][j]).toBeCloseTo((dv * tb) / 8, 9);
      });
    }
  });

  it("lies exactly on the ideal straight line outside the blend windows", () => {
    for (let k = 0; k < 3; k++) {
      // Midpoint between ramp k's end and ramp k+1's start is pure plateau.
      const t =
        (path.viaTimes[k] + path.blendDurations[k] / 2 +
          path.viaTimes[k + 1] - path.blendDurations[k + 1] / 2) / 2;
      const states = evaluateBlendedPath(path, t);
      states.forEach((s, j) => {
        const ideal = waypoints[k][j] + path.velocities[k][j] * (t - path.viaTimes[k]);
        expect(s.position).toBeCloseTo(ideal, 10);
        expect(s.velocity).toBeCloseTo(path.velocities[k][j], 12);
        expect(s.acceleration).toBe(0);
      });
    }
  });

  it("is C¹: velocity is continuous everywhere", () => {
    const h = 1e-6;
    for (let i = 1; i < 400; i++) {
      const t = (i / 400) * path.duration;
      const before = evaluateBlendedPath(path, t - h);
      const after = evaluateBlendedPath(path, t + h);
      const aMax = Math.max(...limits.map((l) => l.maxAcceleration));
      before.forEach((s, j) => {
        expect(Math.abs(after[j].velocity - s.velocity)).toBeLessThanOrEqual(aMax * 2 * h + 1e-9);
      });
    }
  });

  it("respects every joint's velocity and acceleration limits", () => {
    const s = sampleBlendedPath(path, 3000);
    s.velocity.forEach((v, j) => {
      expect(Math.max(...Array.from(v, Math.abs))).toBeLessThanOrEqual(
        limits[j].maxVelocity * (1 + 1e-9),
      );
    });
    s.acceleration.forEach((a, j) => {
      expect(Math.max(...Array.from(a, Math.abs))).toBeLessThanOrEqual(
        limits[j].maxAcceleration * (1 + 1e-6),
      );
    });
  });

  it("stretches time by one factor when blends would overlap, and stays feasible", () => {
    // Brutal acceleration limits force long blends into short segments.
    const tight = limits.map((l) => ({ ...l, maxAcceleration: l.maxAcceleration / 50 }));
    const stretched = planBlendedPath(waypoints, tight);
    expect(stretched.timeScale).toBeGreaterThan(1);
    // Ramps must not overlap after the stretch…
    for (let k = 0; k < 3; k++) {
      const gap = stretched.viaTimes[k + 1] - stretched.viaTimes[k];
      expect(
        (stretched.blendDurations[k] + stretched.blendDurations[k + 1]) / 2,
      ).toBeLessThanOrEqual(gap * (1 + 1e-9));
    }
    // …and the limits still hold.
    const s = sampleBlendedPath(stretched, 2000);
    s.acceleration.forEach((a, j) => {
      expect(Math.max(...Array.from(a, Math.abs))).toBeLessThanOrEqual(
        tight[j].maxAcceleration * (1 + 1e-6),
      );
    });
  });

  it("rejects malformed inputs loudly", () => {
    expect(() => planBlendedPath([waypoints[0]], limits)).toThrow(/at least 2/);
    expect(() => planBlendedPath([waypoints[0], waypoints[0]], limits)).toThrow(/identical/);
    expect(() => planBlendedPath([[0, 0], [1, 1]], limits)).toThrow(/joint values/);
  });
});
