/**
 * Damped-least-squares (DLS) inverse kinematics — the numerical
 * counterpart to ik.ts, also known as the Levenberg–Marquardt approach to
 * IK. Two reasons it exists here:
 *
 *   1. CROSS-CHECK. The analytic solver is a page of trigonometry; the
 *      DLS solver knows nothing but forward kinematics and derivatives.
 *      When both land on the same pose from the same target, each
 *      vouches for the other (the test suite does exactly this).
 *   2. GENERALITY. Closed form dies with the spherical wrist; DLS works
 *      for any chain FK can describe — and it is the standard tool in
 *      modern robotics and character animation, which makes it the most
 *      transferable piece of this project.
 *
 * The iteration: linearize FK around the current pose with the geometric
 * Jacobian J (6×n: TCP twist per unit joint velocity), then step
 *
 *     Δθ = Jᵀ (J Jᵀ + λ² I)⁻¹ e
 *
 * where e is the 6D pose error (position + orientation as an axis-angle
 * vector). With λ = 0 this is the pseudoinverse step — fastest, but it
 * explodes near singularities where J loses rank; the damping λ² trades a
 * little convergence speed for boundedness (as a singularity approaches,
 * the step aligns with what is still achievable instead of diverging).
 * That graceful degradation is exactly what the analytic solver cannot
 * offer, and why real controllers damp.
 */
import { Matrix4, Quaternion, Vector3 } from "three";
import { forwardKinematics } from "./dh";
import { geometricJacobian, type JointAxisFrame } from "./jacobian";
import type { RobotModel } from "./robot";

/** What one FK evaluation must provide for a DLS iteration: the tool pose
 * plus each joint's world axis and origin (for the Jacobian). Keeping
 * this a callback makes the solver work for ANY articulated chain — the
 * DH-based R6 here, a URDF-loaded robot elsewhere. */
export interface PoseEval {
  tcp: Matrix4;
  joints: JointAxisFrame[];
}
export type FKEvaluator = (angles: readonly number[]) => PoseEval;

/** FKEvaluator for a DH-parameterized robot model. */
export function dhEvaluator(robot: RobotModel): FKEvaluator {
  return (angles) => {
    const frames = forwardKinematics(robot.joints, angles);
    return {
      tcp: frames[frames.length - 1],
      joints: frames.slice(0, -1).map((f) => {
        const e = f.elements;
        return { axis: [e[8], e[9], e[10]], origin: [e[12], e[13], e[14]] };
      }),
    };
  };
}

export interface DLSOptions {
  /** Damping factor λ (rad-ish). Larger = more stable, slower. */
  lambda?: number;
  maxIterations?: number;
  /** Convergence thresholds: metres and radians. */
  positionTolerance?: number;
  orientationTolerance?: number;
  /** Per-iteration step clamp (rad), keeps the linearization honest. */
  maxStep?: number;
}

export interface DLSResult {
  angles: number[];
  converged: boolean;
  iterations: number;
  positionError: number;
  orientationError: number;
}

/** Orientation error as an axis-angle vector: log of R_target·R_currentᵀ. */
function orientationError(target: Matrix4, current: Matrix4, out: Vector3): void {
  const rErr = new Matrix4()
    .extractRotation(target)
    .multiply(new Matrix4().extractRotation(current).transpose());
  const q = new Quaternion().setFromRotationMatrix(rErr);
  // q = (sin(φ/2)·axis, cos(φ/2)); for small φ, 2·(qx,qy,qz) ≈ φ·axis.
  const sinHalf = Math.hypot(q.x, q.y, q.z);
  if (sinHalf < 1e-12) {
    out.set(0, 0, 0);
    return;
  }
  const angle = 2 * Math.atan2(sinHalf, q.w);
  out.set(q.x, q.y, q.z).multiplyScalar(angle / sinHalf);
}

/** Solve the 6×6 system A·x = b by Gaussian elimination with partial
 * pivoting. Six equations do not justify a linear-algebra dependency —
 * and writing it out keeps the whole solver inspectable. */
function solve6(A: number[][], b: number[]): number[] {
  const n = 6;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let row = col + 1; row < n; row++) {
      const f = M[row][col] / M[col][col];
      for (let k = col; k <= n; k++) M[row][k] -= f * M[col][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let s = M[row][n];
    for (let k = row + 1; k < n; k++) s -= M[row][k] * x[k];
    x[row] = s / M[row][row];
  }
  return x;
}

export function solveDLS(
  robot: RobotModel,
  target: Matrix4,
  seed: readonly number[],
  options: DLSOptions = {},
): DLSResult {
  return solveDLSWith(dhEvaluator(robot), target, seed, options);
}

/** The generic DLS core: works for any chain an FKEvaluator can describe
 * (the URDF explorer uses this directly — real industrial arms like the
 * UR series have offset wrists with no closed-form solution, which is
 * exactly the case numerical IK exists for). */
export function solveDLSWith(
  evalFK: FKEvaluator,
  target: Matrix4,
  seed: readonly number[],
  options: DLSOptions = {},
): DLSResult {
  // Defaults tuned empirically on the R6: λ = 0.01 converges in ~10
  // iterations on generic poses and in <50 even when the wrist center
  // passes millimeters from the base axis (the shoulder singularity,
  // where the damped step along the lost direction shrinks by only
  // λ²/(σ²+λ²) per iteration — larger λ stalls there for hundreds of
  // iterations). Tolerances are physical, not numerical: 1e-8 m is 10 nm.
  const {
    lambda = 0.01,
    maxIterations = 200,
    positionTolerance = 1e-8,
    orientationTolerance = 1e-8,
    maxStep = 0.3,
  } = options;
  const n = seed.length;
  const angles = [...seed];

  const targetPos = new Vector3().setFromMatrixPosition(target);
  const eo = new Vector3();

  let iterations = 0;
  for (; iterations < maxIterations; iterations++) {
    const pose = evalFK(angles);
    const tcpPos = new Vector3().setFromMatrixPosition(pose.tcp);

    const ep = new Vector3().subVectors(targetPos, tcpPos);
    orientationError(target, pose.tcp, eo);
    if (ep.length() < positionTolerance && eo.length() < orientationTolerance) {
      return {
        angles,
        converged: true,
        iterations,
        positionError: ep.length(),
        orientationError: eo.length(),
      };
    }

    const J = geometricJacobian(pose.joints, [tcpPos.x, tcpPos.y, tcpPos.z]);

    // (J Jᵀ + λ² I) y = e, then Δθ = Jᵀ y.
    const err = [ep.x, ep.y, ep.z, eo.x, eo.y, eo.z];
    const A: number[][] = Array.from({ length: 6 }, (_, r) =>
      Array.from({ length: 6 }, (_, c) => {
        let s = 0;
        for (let k = 0; k < n; k++) s += J[r][k] * J[c][k];
        return r === c ? s + lambda * lambda : s;
      }),
    );
    const y = solve6(A, err);
    for (let i = 0; i < n; i++) {
      let dTheta = 0;
      for (let r = 0; r < 6; r++) dTheta += J[r][i] * y[r];
      angles[i] += Math.max(-maxStep, Math.min(maxStep, dTheta));
    }
  }

  const pose = evalFK(angles);
  const ep = new Vector3().setFromMatrixPosition(pose.tcp).sub(targetPos).length();
  orientationError(target, pose.tcp, eo);
  return {
    angles,
    converged: false,
    iterations,
    positionError: ep,
    orientationError: eo.length(),
  };
}
