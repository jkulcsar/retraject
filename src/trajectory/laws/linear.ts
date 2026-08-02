import type { JointLimits, Shape, TrajectoryLaw } from "../law";
import { assertValidLimits } from "../law";

/**
 * Linear (constant-velocity) law: r(τ) = τ.
 *
 * Port of legacy/LINEAR.CPP. The whole move runs at constant velocity D/T,
 * so the only binding limit is maxVelocity: T_min = |D| / v_max
 * (legacy/LINEAR.CPP m_ComputeTrajectoryTime).
 *
 * Honest caveat, same as in 1997: the velocity steps from 0 to D/T
 * instantaneously at both ends, i.e. the acceleration is a Dirac impulse
 * there. We report ddr = 0 everywhere (as the legacy code did); no real
 * actuator can follow this law exactly. It is kept as the pedagogical
 * baseline the smoother laws improve upon.
 */
const shape: Shape = {
  r: (tau) => tau,
  dr: () => 1,
  ddr: () => 0,
};

export const linear: TrajectoryLaw = {
  id: "linear",
  label: "Linear",
  legacySource: "LINEAR.CPP",
  minimumDuration(distance: number, limits: JointLimits): number {
    assertValidLimits(limits);
    return Math.abs(distance) / limits.maxVelocity;
  },
  shape: () => shape,
};
