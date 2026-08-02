import type { JointLimits, Shape, TrajectoryLaw } from "../law";
import { assertValidLimits } from "../law";

/**
 * Bang-bang law: full acceleration for the first half, full deceleration
 * for the second. Port of legacy/BANGBANG.CPP.
 *
 *   τ ≤ ½ :  r = 2τ²             r′ = 4τ         r″ = +4
 *   τ > ½ :  r = −1 + 4τ − 2τ²   r′ = 4(1 − τ)   r″ = −4
 *
 * This is the time-optimal profile when only an acceleration limit exists;
 * the price is the instantaneous acceleration reversal at τ = ½ (infinite
 * jerk). Peak values: r′max = 2 at the midpoint, |r″| = 4 throughout, so
 *
 *   T_min = max( 2|D| / v_max,  2·√(|D| / a_max) )
 *
 * matching legacy/BANGBANG.CPP m_ComputeTrajectoryTime. Note that a
 * bang-bang profile is exactly a trapezoidal profile whose cruise phase
 * has shrunk to nothing — the trapezoidal law's "triangular" fallback
 * (trapezoidal.ts) produces this same shape.
 */
const shape: Shape = {
  r: (tau) => (tau <= 0.5 ? 2 * tau * tau : -1 + (4 - 2 * tau) * tau),
  dr: (tau) => (tau <= 0.5 ? 4 * tau : 4 * (1 - tau)),
  ddr: (tau) => (tau <= 0.5 ? 4 : -4),
};

export const bangBang: TrajectoryLaw = {
  id: "bangBang",
  label: "Bang-bang",
  legacySource: "BANGBANG.CPP",
  minimumDuration(distance: number, limits: JointLimits): number {
    assertValidLimits(limits);
    const d = Math.abs(distance);
    return Math.max(
      (2 * d) / limits.maxVelocity,
      2 * Math.sqrt(d / limits.maxAcceleration),
    );
  },
  shape: () => shape,
};
