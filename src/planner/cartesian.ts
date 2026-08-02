/**
 * Cartesian line moves — straight tool paths, the "MoveL" of industrial
 * robot languages, and something the joint-space 1997 system could not
 * express at all: its waypoint motion made straight lines in JOINT space,
 * which are arcs in the workspace.
 *
 * The construction: interpolate the TOOL POSE — position on the straight
 * segment p₀→p₁, orientation by quaternion slerp — with one trajectory
 * law's shape r(τ) driving both, so the tool eases along the line with
 * the chosen profile. Then run the analytic IK at every sample with
 * branch continuity (the previous sample seeds `closestSolution`), and
 * the joint motion is whatever the line demands.
 *
 * That last clause is the educational sting: a straight line is not free.
 * The IK can fail mid-line (the line exits the workspace), demand joint
 * configurations outside limits, or pass near a singularity where joint
 * velocities blow up (detected as a configuration jump between adjacent
 * samples). planLineMove reports all three honestly with the fraction of
 * the line where they occur — exactly what a real controller's "cannot
 * execute linear motion" error means.
 */
import { Matrix4, Quaternion, Vector3 } from "three";
import { forwardKinematics } from "../kinematics/dh";
import { closestSolution, solveSphericalWrist } from "../kinematics/ik";
import type { RobotModel } from "../kinematics/robot";
import type { JointLimits, MotionState, TrajectoryLaw } from "../trajectory";

export interface LineMoveSpec {
  robot: RobotModel;
  startAngles: readonly number[];
  /** Target TCP pose in base coordinates. */
  target: Matrix4;
  law: TrajectoryLaw;
  /** Cartesian limits of the tool point (m/s, m/s²). */
  limits: JointLimits;
  /** Limits for the orientation change (rad/s, rad/s²). */
  angularLimits?: JointLimits;
  /** IK sample count along the line (dense: playback interpolates). */
  samples?: number;
}

export interface LineMove {
  duration: number;
  jointCount: number;
  /** Dense joint-space result: time[i] with angles[j][i]. */
  time: Float64Array;
  angles: Float64Array[];
}

export type LineMoveResult =
  | { ok: true; move: LineMove }
  | { ok: false; reason: "out-of-reach" | "joint-limits" | "configuration-jump"; failedAtFraction: number };

/** Adjacent-sample joint jump beyond this (rad) means the line forced a
 * branch change or grazed a singularity — not executable continuously. */
const JUMP_THRESHOLD = 0.35;

export function planLineMove(spec: LineMoveSpec): LineMoveResult {
  const samples = spec.samples ?? 200;
  const startFrame = forwardKinematics(spec.robot.joints, spec.startAngles)[6];
  const p0 = new Vector3().setFromMatrixPosition(startFrame);
  const p1 = new Vector3().setFromMatrixPosition(spec.target);
  const q0 = new Quaternion().setFromRotationMatrix(startFrame);
  const q1 = new Quaternion().setFromRotationMatrix(spec.target);

  const length = p0.distanceTo(p1);
  const angle = q0.angleTo(q1);
  const angularLimits = spec.angularLimits ?? { maxVelocity: 2, maxAcceleration: 4 };

  // One duration serves both translation and rotation: the slower need
  // wins, and the law's shape eases both in lockstep (a rotation-only
  // move is legal: the shape is then built on the angle instead).
  const duration = Math.max(
    length > 0 ? spec.law.minimumDuration(length, spec.limits) : 0,
    angle > 0 ? spec.law.minimumDuration(angle, angularLimits) : 0,
  );
  const shape =
    length > 0 ? spec.law.shape(length, spec.limits) : spec.law.shape(angle, angularLimits);

  const time = new Float64Array(samples + 1);
  const angles = spec.startAngles.map(() => new Float64Array(samples + 1));
  let previous = [...spec.startAngles];

  const pose = new Matrix4();
  const p = new Vector3();
  const q = new Quaternion();
  for (let i = 0; i <= samples; i++) {
    const tau = i / samples;
    const f = duration > 0 ? shape.r(tau) : 1;
    p.lerpVectors(p0, p1, f);
    q.slerpQuaternions(q0, q1, f);
    pose.compose(p, q, new Vector3(1, 1, 1));

    const solutions = solveSphericalWrist(spec.robot, pose);
    if (solutions.length === 0) {
      return { ok: false, reason: "out-of-reach", failedAtFraction: tau };
    }
    const pick = closestSolution(solutions, previous);
    if (!pick || !pick.withinLimits) {
      return { ok: false, reason: "joint-limits", failedAtFraction: tau };
    }
    if (i > 0) {
      const jump = Math.max(...pick.angles.map((a, j) => Math.abs(a - previous[j])));
      if (jump > JUMP_THRESHOLD) {
        return { ok: false, reason: "configuration-jump", failedAtFraction: tau };
      }
    }
    time[i] = i === samples ? duration : tau * duration;
    pick.angles.forEach((a, j) => (angles[j][i] = a));
    previous = pick.angles;
  }
  return {
    ok: true,
    move: { duration, jointCount: spec.startAngles.length, time, angles },
  };
}

/** Joint state at time t, interpolated on the dense IK table; velocity
 * and acceleration come from finite differences of the table — the line
 * move has no closed joint-space form, that is its nature. */
export function evaluateLineMove(move: LineMove, t: number): MotionState[] {
  const n = move.time.length - 1;
  if (move.duration === 0 || n === 0) {
    return move.angles.map((a) => ({ position: a[0], velocity: 0, acceleration: 0 }));
  }
  const clamped = Math.min(Math.max(t, 0), move.duration);
  const x = (clamped / move.duration) * n;
  const i = Math.min(n - 1, Math.floor(x));
  const frac = x - i;
  const dt = move.duration / n;
  return move.angles.map((a) => {
    const position = a[i] + (a[i + 1] - a[i]) * frac;
    const velocity = (a[i + 1] - a[i]) / dt;
    const aPrev = i > 0 ? a[i - 1] : a[i];
    const aNext = i < n - 1 ? a[i + 2] : a[i + 1];
    const vBefore = (a[i] - aPrev) / dt;
    const vAfter = (aNext - a[i + 1]) / dt;
    return { position, velocity, acceleration: (vAfter - vBefore) / (2 * dt) };
  });
}

/** Fence-post samples, structurally matching the planner's SampledPath. */
export function sampleLineMove(move: LineMove, n: number) {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`Sample count must be a positive integer, got ${n}`);
  }
  const time = new Float64Array(n + 1);
  const position = Array.from({ length: move.jointCount }, () => new Float64Array(n + 1));
  const velocity = Array.from({ length: move.jointCount }, () => new Float64Array(n + 1));
  const acceleration = Array.from({ length: move.jointCount }, () => new Float64Array(n + 1));
  for (let i = 0; i <= n; i++) {
    const t = i === n ? move.duration : (i * move.duration) / n;
    time[i] = t;
    evaluateLineMove(move, t).forEach((state, j) => {
      position[j][i] = state.position;
      velocity[j][i] = state.velocity;
      acceleration[j][i] = state.acceleration;
    });
  }
  return { time, position, velocity, acceleration };
}
