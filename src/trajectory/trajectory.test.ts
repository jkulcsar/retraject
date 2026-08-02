import { describe, expect, it } from "vitest";
import type { JointLimits, Shape, TrajectoryLaw } from "./law";
import { ALL_LAWS, LAWS } from "./laws";
import { evaluateSegment, planSegment, sampleSegment } from "./segment";
import { synchronizeMoves } from "./synchronize";

/**
 * Testing strategy (see also README.md §6 in this folder):
 *
 * 1. Shape invariants  — every law's r(τ) must satisfy the boundary and
 *    smoothness conditions that define it.
 * 2. Derivative consistency — dr and ddr are cross-checked against
 *    numerical differentiation of r, catching algebra slips that boundary
 *    checks cannot see.
 * 3. Golden formulas — minimum durations are pinned to the 1997 closed
 *    forms, keeping the port honest against legacy/{LAW}.CPP.
 * 4. Feasibility & minimality — at T_min the profile must respect the
 *    limits AND have at least one limit active (otherwise T_min would not
 *    be minimal).
 * 5. Time-scaling — stretching a segment must scale v by 1/k and a by 1/k²,
 *    the property multi-joint synchronization relies on.
 */

const LIMITS_V_BINDING: JointLimits = { maxVelocity: 5, maxAcceleration: 1000 };
const LIMITS_A_BINDING: JointLimits = { maxVelocity: 1000, maxAcceleration: 2 };
const D_LONG = 100;
const D_SHORT = 1;

/** Shapes to test per law: the polynomial laws are move-independent; the
 * trapezoid is exercised in both its cruise and triangular regimes. */
function shapesUnderTest(law: TrajectoryLaw): { label: string; shape: Shape; breakpoints: number[] }[] {
  if (law.id !== "trapezoidal") {
    const breakpoints = law.id === "bangBang" ? [0.5] : [];
    return [{ label: law.id, shape: law.shape(D_LONG, LIMITS_V_BINDING), breakpoints }];
  }
  const cruise = { maxVelocity: 5, maxAcceleration: 10 }; // 100 > 5²/10: cruise phase exists
  const fCruise =
    cruise.maxVelocity / cruise.maxAcceleration / LAWS.trapezoidal.minimumDuration(D_LONG, cruise);
  return [
    {
      label: "trapezoidal (cruise)",
      shape: law.shape(D_LONG, cruise),
      breakpoints: [fCruise, 1 - fCruise],
    },
    {
      label: "trapezoidal (triangular)",
      shape: law.shape(D_SHORT, LIMITS_A_BINDING), // 1 ≤ 1000²/2: no cruise phase
      breakpoints: [0.5],
    },
  ];
}

function centralDiff(f: (x: number) => number, x: number, h: number): number {
  return (f(x + h) - f(x - h)) / (2 * h);
}

describe.each(ALL_LAWS.map((law) => [law.id, law] as const))("law %s", (_id, law) => {
  describe.each(shapesUnderTest(law))("shape invariants: $label", ({ shape, breakpoints }) => {
    it("starts at r(0)=0 and ends at r(1)=1", () => {
      expect(shape.r(0)).toBeCloseTo(0, 12);
      expect(shape.r(1)).toBeCloseTo(1, 12);
    });

    it("is monotonically non-decreasing", () => {
      let prev = shape.r(0);
      for (let i = 1; i <= 200; i++) {
        const cur = shape.r(i / 200);
        expect(cur).toBeGreaterThanOrEqual(prev - 1e-12);
        prev = cur;
      }
    });

    it("is symmetric: r(τ) + r(1−τ) = 1", () => {
      // All five laws are symmetric about the midpoint — decelerating is
      // accelerating played backwards. (A law with asymmetric ramps would
      // legitimately fail this; none of the 1997 laws had them.)
      for (let i = 0; i <= 100; i++) {
        const tau = i / 100;
        expect(shape.r(tau) + shape.r(1 - tau)).toBeCloseTo(1, 9);
      }
    });

    if (law.id !== "linear") {
      it("starts and ends at rest: r′(0) = r′(1) = 0", () => {
        expect(shape.dr(0)).toBeCloseTo(0, 12);
        expect(shape.dr(1)).toBeCloseTo(0, 12);
      });
    }

    if (law.id === "quintic") {
      it("has zero end accelerations: r″(0) = r″(1) = 0 (minimum-jerk hallmark)", () => {
        expect(shape.ddr(0)).toBeCloseTo(0, 12);
        expect(shape.ddr(1)).toBeCloseTo(0, 12);
      });
    }

    it("has analytically correct derivatives (central-difference cross-check)", () => {
      const h = 1e-6;
      for (let i = 1; i < 200; i++) {
        const tau = i / 200;
        // Numerical differentiation straddling a piecewise breakpoint mixes
        // two different polynomials — skip a small neighborhood around each.
        if (breakpoints.some((b) => Math.abs(tau - b) < 1e-3)) continue;
        const drNum = centralDiff(shape.r, tau, h);
        const ddrNum = centralDiff(shape.dr, tau, h);
        expect(Math.abs(shape.dr(tau) - drNum)).toBeLessThan(1e-5);
        expect(Math.abs(shape.ddr(tau) - ddrNum)).toBeLessThan(1e-4);
      }
    });
  });

  it("has zero minimum duration for a zero-distance move", () => {
    expect(law.minimumDuration(0, LIMITS_V_BINDING)).toBe(0);
  });

  it("rejects non-positive limits", () => {
    expect(() => law.minimumDuration(1, { maxVelocity: 0, maxAcceleration: 1 })).toThrow(RangeError);
    expect(() => law.minimumDuration(1, { maxVelocity: 1, maxAcceleration: -5 })).toThrow(RangeError);
  });

  describe.each([
    ["velocity-binding", D_LONG, LIMITS_V_BINDING],
    ["acceleration-binding", D_SHORT, LIMITS_A_BINDING],
  ] as const)("minimum duration, %s regime", (_regime, distance, limits) => {
    it("yields a feasible profile with at least one limit active (minimality)", () => {
      const segment = planSegment({ law, start: 0, end: distance, limits });
      const { velocity, acceleration } = sampleSegment(segment, 4000);
      const vMax = Math.max(...Array.from(velocity, Math.abs));
      const aMax = Math.max(...Array.from(acceleration, Math.abs));

      expect(vMax).toBeLessThanOrEqual(limits.maxVelocity * (1 + 1e-9));
      // The linear law's endpoint acceleration impulses are unrepresentable
      // (reported as 0, see laws/linear.ts) — its interior acceleration is
      // trivially 0, so the acceleration bound only means something for the
      // other four laws.
      if (law.id !== "linear") {
        expect(aMax).toBeLessThanOrEqual(limits.maxAcceleration * (1 + 1e-9));
      }
      const velocityActive = vMax >= limits.maxVelocity * 0.995;
      const accelerationActive = aMax >= limits.maxAcceleration * 0.995;
      expect(velocityActive || accelerationActive).toBe(true);
    });
  });
});

describe("golden formulas from 1997", () => {
  const limits: JointLimits = { maxVelocity: 3, maxAcceleration: 7 };
  const d = 42;

  it("linear: T = |D|/KV (legacy/LINEAR.CPP:57)", () => {
    expect(LAWS.linear.minimumDuration(d, limits)).toBeCloseTo(d / 3, 12);
  });

  it("cubic: T = max(3|D|/2KV, √(6|D|/KA)) (legacy/THIRD.CPP:62)", () => {
    expect(LAWS.cubic.minimumDuration(d, limits)).toBeCloseTo(
      Math.max((3 * d) / (2 * 3), Math.sqrt((6 * d) / 7)),
      12,
    );
  });

  it("quintic: T = max(15|D|/8KV, √(10|D|/(√3·KA))) (legacy/FIFTH.CPP:69)", () => {
    expect(LAWS.quintic.minimumDuration(d, limits)).toBeCloseTo(
      Math.max((15 * d) / (8 * 3), Math.sqrt((10 * d) / (Math.sqrt(3) * 7))),
      12,
    );
  });

  it("bang-bang: T = max(2|D|/KV, 2√(|D|/KA)) (legacy/BANGBANG.CPP:78)", () => {
    expect(LAWS.bangBang.minimumDuration(d, limits)).toBeCloseTo(
      Math.max((2 * d) / 3, 2 * Math.sqrt(d / 7)),
      12,
    );
  });

  it("trapezoidal, cruise regime: T = KV/KA + |D|/KV (legacy/TRAPEZ.CPP:25)", () => {
    // 42 > 3²/7, so a cruise phase exists and the 1997 formula applies.
    expect(LAWS.trapezoidal.minimumDuration(d, limits)).toBeCloseTo(3 / 7 + d / 3, 12);
  });

  it("trapezoidal, short move: triangular fallback (fixes the 1997 T=0 gap)", () => {
    // 1 ≤ 3²/7 would make legacy/TRAPEZ.CPP return 0 and emit an all-zero
    // profile; the port degrades to the time-optimal triangular profile.
    expect(LAWS.trapezoidal.minimumDuration(1, limits)).toBeCloseTo(2 * Math.sqrt(1 / 7), 12);
  });
});

describe("trapezoidal specifics", () => {
  it("triangular fallback is exactly the bang-bang shape", () => {
    const triangular = LAWS.trapezoidal.shape(D_SHORT, LIMITS_A_BINDING);
    const bang = LAWS.bangBang.shape(D_SHORT, LIMITS_A_BINDING);
    for (let i = 0; i <= 100; i++) {
      const tau = i / 100;
      expect(triangular.r(tau)).toBeCloseTo(bang.r(tau), 12);
      expect(triangular.dr(tau)).toBeCloseTo(bang.dr(tau), 12);
    }
  });

  it("at minimum duration, cruises exactly at maxVelocity and ramps exactly at maxAcceleration", () => {
    const limits: JointLimits = { maxVelocity: 5, maxAcceleration: 10 };
    const segment = planSegment({ law: LAWS.trapezoidal, start: 0, end: D_LONG, limits });
    const mid = evaluateSegment(segment, segment.duration / 2);
    expect(mid.velocity).toBeCloseTo(limits.maxVelocity, 9);
    const inRamp = evaluateSegment(segment, segment.duration / 100);
    expect(inRamp.acceleration).toBeCloseTo(limits.maxAcceleration, 9);
  });
});

describe("segment planning and evaluation", () => {
  const limits: JointLimits = { maxVelocity: 5, maxAcceleration: 10 };

  it("defaults to the law's minimum duration", () => {
    const segment = planSegment({ law: LAWS.cubic, start: 10, end: 30, limits });
    expect(segment.duration).toBe(segment.minimumDuration);
  });

  it("rejects durations below the minimum — trajectories stretch, never compress", () => {
    const tMin = LAWS.cubic.minimumDuration(20, limits);
    expect(() =>
      planSegment({ law: LAWS.cubic, start: 10, end: 30, limits, duration: tMin / 2 }),
    ).toThrow(RangeError);
  });

  it("time-scaling: doubling the duration halves velocity and quarters acceleration", () => {
    const base = planSegment({ law: LAWS.cubic, start: 0, end: 20, limits });
    const slow = planSegment({
      law: LAWS.cubic,
      start: 0,
      end: 20,
      limits,
      duration: 2 * base.duration,
    });
    // Compare at the same normalized instant τ = ¼ of each segment.
    const vBase = evaluateSegment(base, base.duration / 4);
    const vSlow = evaluateSegment(slow, slow.duration / 4);
    expect(vSlow.velocity).toBeCloseTo(vBase.velocity / 2, 9);
    expect(vSlow.acceleration).toBeCloseTo(vBase.acceleration / 4, 9);
    expect(vSlow.position).toBeCloseTo(vBase.position, 9);
  });

  it("handles negative-direction moves (end < start)", () => {
    const segment = planSegment({ law: LAWS.quintic, start: 30, end: 10, limits });
    const mid = evaluateSegment(segment, segment.duration / 2);
    expect(mid.position).toBeCloseTo(20, 9);
    expect(mid.velocity).toBeLessThan(0);
    expect(evaluateSegment(segment, segment.duration).position).toBeCloseTo(10, 12);
  });

  it("clamps evaluation outside [0, duration] to the endpoints", () => {
    const segment = planSegment({ law: LAWS.cubic, start: 0, end: 20, limits });
    expect(evaluateSegment(segment, -1).position).toBe(0);
    expect(evaluateSegment(segment, segment.duration + 1).position).toBeCloseTo(20, 12);
  });

  it("holds position for a zero-distance move", () => {
    const segment = planSegment({ law: LAWS.trapezoidal, start: 7, end: 7, limits });
    expect(segment.duration).toBe(0);
    expect(evaluateSegment(segment, 0)).toEqual({ position: 7, velocity: 0, acceleration: 0 });
  });

  it("samples n+1 fence-post values with exact endpoints", () => {
    const segment = planSegment({ law: LAWS.quintic, start: 0, end: 20, limits });
    const samples = sampleSegment(segment, 50);
    expect(samples.time).toHaveLength(51);
    expect(samples.time[50]).toBe(segment.duration); // closed form, no drift
    expect(samples.position[0]).toBe(0);
    expect(samples.position[50]).toBeCloseTo(20, 12);
  });
});

describe("multi-joint synchronization (Robot::SetUpTime, legacy/ROBOT.CPP)", () => {
  const moves = [
    { law: LAWS.trapezoidal, start: 0, end: 90, limits: { maxVelocity: 30, maxAcceleration: 60 } },
    { law: LAWS.quintic, start: -45, end: 45, limits: { maxVelocity: 40, maxAcceleration: 80 } },
    { law: LAWS.cubic, start: 10, end: 15, limits: { maxVelocity: 25, maxAcceleration: 50 } },
  ];

  it("gives every joint the same duration: that of the slowest joint", () => {
    const segments = synchronizeMoves(moves);
    const durations = segments.map((s) => s.duration);
    expect(new Set(durations).size).toBe(1);
    const slowestMinimum = Math.max(...segments.map((s) => s.minimumDuration));
    expect(durations[0]).toBe(slowestMinimum);
    // Exactly one joint runs at its own minimum — it dictated the pace.
    expect(segments.some((s) => s.duration === s.minimumDuration)).toBe(true);
  });

  it("keeps every stretched joint within its own limits", () => {
    for (const segment of synchronizeMoves(moves)) {
      const { velocity, acceleration } = sampleSegment(segment, 2000);
      const vMax = Math.max(...Array.from(velocity, Math.abs));
      const aMax = Math.max(...Array.from(acceleration, Math.abs));
      expect(vMax).toBeLessThanOrEqual(segment.limits.maxVelocity * (1 + 1e-9));
      expect(aMax).toBeLessThanOrEqual(segment.limits.maxAcceleration * (1 + 1e-9));
    }
  });

  it("is a no-op for a single move", () => {
    const [segment] = synchronizeMoves([moves[0]]);
    expect(segment.duration).toBe(segment.minimumDuration);
  });
});
