import type { JointLimits, Shape, TrajectoryLaw } from "../law";
import { assertValidLimits } from "../law";

/**
 * Trapezoidal velocity law: accelerate at a_max to cruise velocity, cruise,
 * decelerate at a_max. Port of legacy/TRAPEZ.CPP — the workhorse profile of
 * industrial motion controllers to this day.
 *
 * Unlike the polynomial laws, the trapezoid's *proportions* depend on the
 * move: a long move spends most of its time cruising, a short one never
 * reaches cruise velocity at all. We capture the proportions in a single
 * number f = (acceleration time) / (total time), f ∈ (0, ½], and build the
 * normalized shape from it. Requiring the velocity area to integrate to 1
 * fixes the normalized cruise velocity at p = 1/(1 − f):
 *
 *   τ < f       :  r′ = p·τ/f           r = p·τ² / (2f)          r″ = +p/f
 *   f ≤ τ ≤ 1−f :  r′ = p               r = p·(τ − f/2)          r″ = 0
 *   τ > 1−f     :  r′ = p·(1−τ)/f       r = 1 − p·(1−τ)²/(2f)    r″ = −p/f
 *
 * Minimum duration (legacy/TRAPEZ.CPP m_ComputeTrajectoryTime):
 * with ramp time τa = v_max / a_max, a cruise phase exists iff
 * |D| > v_max²/a_max, and then T_min = τa + |D|/v_max with
 * f = τa/T_min = v_max² / (v_max² + a_max·|D|).
 *
 * DIVERGENCE FROM 1997 — the short-move case: the legacy code returned
 * T = 0 and all-zero profiles when |D| ≤ v_max²/a_max (an unhandled case;
 * see REVIVAL.md §1 caveats). The port falls back to the *triangular*
 * profile: f = ½, accelerate to the midpoint and brake, i.e. exactly the
 * bang-bang shape with T_min = 2√(|D|/a_max).
 *
 * DIVERGENCE FROM 1997 — stretching: when synchronization stretches a
 * segment beyond T_min, we keep f frozen (shape-preserving time dilation:
 * both velocity and acceleration scale down, ramps stay the same fraction
 * of the move). The legacy code instead rescaled KA with a bespoke λ
 * formula while keeping KV. Both are feasible; shape preservation is what
 * the r(τ) abstraction gives every other law, so the trapezoid follows
 * suit for uniformity. The alternative (keep a_max, lower cruise velocity,
 * ramps shrink relative to the move) is a possible future refinement.
 */
function trapezoidShape(f: number): Shape {
  const p = 1 / (1 - f); // normalized cruise velocity
  return {
    r: (tau) => {
      if (tau < f) return (p * tau * tau) / (2 * f);
      if (tau <= 1 - f) return p * (tau - f / 2);
      const rem = 1 - tau;
      return 1 - (p * rem * rem) / (2 * f);
    },
    dr: (tau) => {
      if (tau < f) return (p * tau) / f;
      if (tau <= 1 - f) return p;
      return (p * (1 - tau)) / f;
    },
    ddr: (tau) => {
      if (tau < f) return p / f;
      if (tau <= 1 - f) return 0;
      return -p / f;
    },
  };
}

/** True when the move is long enough to reach cruise velocity. */
function hasCruisePhase(distance: number, limits: JointLimits): boolean {
  return (
    Math.abs(distance) >
    (limits.maxVelocity * limits.maxVelocity) / limits.maxAcceleration
  );
}

function minDuration(distance: number, limits: JointLimits): number {
  const d = Math.abs(distance);
  if (hasCruisePhase(d, limits)) {
    return limits.maxVelocity / limits.maxAcceleration + d / limits.maxVelocity;
  }
  return 2 * Math.sqrt(d / limits.maxAcceleration); // triangular fallback
}

export const trapezoidal: TrajectoryLaw = {
  id: "trapezoidal",
  label: "Trapezoidal",
  legacySource: "TRAPEZ.CPP",
  minimumDuration(distance: number, limits: JointLimits): number {
    assertValidLimits(limits);
    return minDuration(distance, limits);
  },
  shape(distance: number, limits: JointLimits): Shape {
    assertValidLimits(limits);
    const d = Math.abs(distance);
    if (!hasCruisePhase(d, limits)) return trapezoidShape(0.5);
    const rampTime = limits.maxVelocity / limits.maxAcceleration;
    return trapezoidShape(rampTime / minDuration(d, limits));
  },
};
