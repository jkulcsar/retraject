/**
 * Core abstractions for joint-space trajectory generation.
 *
 * The 1997 code (legacy/TRAJECT.H) modeled each interpolation law as a
 * subclass of `Trajectory` with three virtual methods — m_ComputePosition,
 * m_ComputeSpeed, m_ComputeAcceleration — so every law carried three nearly
 * identical sampling loops. The modern port factors out the one thing that
 * actually differs between laws: a *normalized shape function*
 *
 *     r : [0,1] → [0,1],   r(0) = 0,   r(1) = 1
 *
 * describing what fraction of the move is complete at normalized time
 * τ = t / T. Position, velocity and acceleration for any move then follow
 * from the chain rule, identically for every law:
 *
 *     q(t) = q₀ + D·r(τ)          with D = q₁ − q₀ (signed distance)
 *     v(t) = (D/T)·r′(τ)
 *     a(t) = (D/T²)·r″(τ)
 *
 * The T and T² denominators are the *time-scaling property*: stretching a
 * trajectory to k× its duration divides velocities by k and accelerations
 * by k². The 1997 code implemented this per law as a λ ("lambda") factor
 * (see e.g. legacy/FIFTH.CPP m_ComputeLambda, which scales KA by λ²); here
 * it falls out of the formulas for free, which is what makes multi-joint
 * synchronization (synchronize.ts) a one-liner.
 */

/** Kinematic limits of one joint. Units are the caller's choice (steps,
 * degrees, radians…) as long as they are consistent: if positions are in
 * degrees and time in seconds, velocity is deg/s and acceleration deg/s². */
export interface JointLimits {
  /** Maximum absolute velocity, > 0. The 1997 code calls this KV. */
  readonly maxVelocity: number;
  /** Maximum absolute acceleration, > 0. The 1997 code calls this KA. */
  readonly maxAcceleration: number;
}

/**
 * A normalized motion shape and its first two derivatives with respect to
 * normalized time τ ∈ [0,1]. Implementations must satisfy r(0)=0, r(1)=1;
 * the test suite verifies this and cross-checks dr/ddr against numerical
 * differentiation of r.
 */
export interface Shape {
  r(tau: number): number;
  dr(tau: number): number;
  ddr(tau: number): number;
}

export type LawId = "linear" | "cubic" | "quintic" | "bangBang" | "trapezoidal";

/**
 * One interpolation law. `shape` receives the move's distance and limits
 * because some laws (trapezoidal) choose their internal proportions per
 * move; the polynomial laws return a constant shape.
 */
export interface TrajectoryLaw {
  readonly id: LawId;
  readonly label: string;
  /** Legacy counterpart in ../../legacy/, for cross-reference. */
  readonly legacySource: string;
  /**
   * The shortest duration in which |distance| can be covered without
   * exceeding the limits. Each law derives this by equating its peak
   * normalized velocity/acceleration with the limits — the derivations
   * are in README.md next to this file. Returns 0 for zero distance.
   */
  minimumDuration(distance: number, limits: JointLimits): number;
  shape(distance: number, limits: JointLimits): Shape;
}

export function assertValidLimits(limits: JointLimits): void {
  if (!(limits.maxVelocity > 0) || !(limits.maxAcceleration > 0)) {
    throw new RangeError(
      `Joint limits must be positive, got maxVelocity=${limits.maxVelocity}, ` +
        `maxAcceleration=${limits.maxAcceleration}`,
    );
  }
}
