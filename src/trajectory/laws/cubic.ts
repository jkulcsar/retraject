import type { JointLimits, Shape, TrajectoryLaw } from "../law";
import { assertValidLimits } from "../law";

/**
 * Cubic law ("Third" in 1997): r(τ) = 3τ² − 2τ³.
 *
 * Port of legacy/THIRD.CPP. The unique cubic with r(0)=0, r(1)=1 and zero
 * velocity at both ends — the classic smoothstep. Acceleration is nonzero
 * at the endpoints (ddr(0) = 6), so the motion starts with a jerk-free but
 * acceleration-stepped profile.
 *
 * Peak values of the shape (drive the minimum-duration derivation):
 *   r′ peaks at τ = ½:      r′max = 3/2       →  v_max = 3|D| / (2T)
 *   r″ peaks at τ = 0, 1:   |r″|max = 6       →  a_max = 6|D| / T²
 *
 * Solving each for T and taking the larger gives
 *   T_min = max( 3|D| / (2·v_max),  √(6|D| / a_max) )
 * which is exactly legacy/THIRD.CPP m_ComputeTrajectoryTime.
 */
const shape: Shape = {
  r: (tau) => (3 - 2 * tau) * tau * tau,
  dr: (tau) => 6 * tau * (1 - tau),
  ddr: (tau) => 6 - 12 * tau,
};

export const cubic: TrajectoryLaw = {
  id: "cubic",
  label: "Cubic (Third)",
  legacySource: "THIRD.CPP",
  minimumDuration(distance: number, limits: JointLimits): number {
    assertValidLimits(limits);
    const d = Math.abs(distance);
    return Math.max(
      (3 * d) / (2 * limits.maxVelocity),
      Math.sqrt((6 * d) / limits.maxAcceleration),
    );
  },
  shape: () => shape,
};
