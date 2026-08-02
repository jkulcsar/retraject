import type { JointLimits, Shape, TrajectoryLaw } from "../law";
import { assertValidLimits } from "../law";

/**
 * Quintic law ("Fifth" in 1997): r(τ) = 10τ³ − 15τ⁴ + 6τ⁵.
 *
 * Port of legacy/FIFTH.CPP (legacy/SPLINE.CPP is a byte-for-byte duplicate
 * of the same math; the port keeps one copy). The unique quintic with zero
 * velocity AND zero acceleration at both ends — also known as the
 * minimum-jerk profile, the smoothest of the five laws and the reason
 * human arm movements are often modeled with it.
 *
 * Peak values of the shape:
 *   r′ peaks at τ = ½:              r′max  = 15/8
 *   r″ peaks at τ = (3 ± √3)/6:     |r″|max = 10/√3
 *
 * Hence
 *   T_min = max( 15|D| / (8·v_max),  √(10|D| / (√3·a_max)) )
 * matching legacy/FIFTH.CPP m_ComputeTrajectoryTime.
 */
const shape: Shape = {
  r: (tau) => ((10 + (-15 + 6 * tau) * tau) * tau) * tau * tau,
  dr: (tau) => 30 * tau * tau * (1 + tau * (-2 + tau)),
  ddr: (tau) => 60 * tau * (1 + tau * (-3 + 2 * tau)),
};

export const quintic: TrajectoryLaw = {
  id: "quintic",
  label: "Quintic (Fifth)",
  legacySource: "FIFTH.CPP",
  minimumDuration(distance: number, limits: JointLimits): number {
    assertValidLimits(limits);
    const d = Math.abs(distance);
    return Math.max(
      (15 * d) / (8 * limits.maxVelocity),
      Math.sqrt((10 * d) / (Math.sqrt(3) * limits.maxAcceleration)),
    );
  },
  shape: () => shape,
};
