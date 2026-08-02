/**
 * Multi-segment path planning — the integration layer that finally
 * reunites the two halves of the project, and the direct heir of the 1997
 * data model: there, a Robot held Joints and each Joint held an ARRAY of
 * trajectories, one per waypoint pair (legacy/JOINT.H: m_ppTrajectory,
 * m_uiNrOfTrajectories = points − 1), with Robot::SetUpTime equalizing
 * times segment by segment. This module is that loop, expressed over the
 * modern Segment/synchronizeMoves primitives:
 *
 *   waypoints (joint space) ──per segment──▶ synchronizeMoves ──▶ timeline
 *
 * Waypoints arrive in JOINT space. Cartesian teaching happens a layer
 * above: pose the robot with the IK gizmo, capture the joint pose (the UI
 * does exactly this) — the same division of labor as an industrial teach
 * pendant, and the reason this module needs no kinematics import.
 *
 * Fidelity note: like every 1997 law, ours are rest-to-rest, so the robot
 * comes to a stop at every waypoint. Blending through via-points without
 * stopping (spline knots, parabolic blends) is the classic extension and
 * deliberately out of scope — it changes the laws, not just the planner.
 */
import type { JointLimits, MotionState, Segment, TrajectoryLaw } from "../trajectory";
import { evaluateSegment, synchronizeMoves } from "../trajectory";

export interface PathSpec {
  /** waypoints[k][j] = position of joint j at waypoint k. At least two. */
  waypoints: readonly (readonly number[])[];
  /** laws[k] = interpolation law of segment k; length = waypoints − 1. */
  laws: readonly TrajectoryLaw[];
  /** Per-joint limits; length defines the joint count. */
  limits: readonly JointLimits[];
}

export interface PlannedPath {
  /** segments[k][j] = joint j's synchronized segment k. */
  segments: Segment[][];
  /** Cumulative start time of each segment, with the total appended:
   * times[k] ≤ t < times[k+1] selects segment k. Length = segments + 1. */
  times: number[];
  duration: number;
  jointCount: number;
}

export function planPath(spec: PathSpec): PlannedPath {
  const { waypoints, laws, limits } = spec;
  if (waypoints.length < 2) {
    throw new RangeError(`A path needs at least 2 waypoints, got ${waypoints.length}`);
  }
  if (laws.length !== waypoints.length - 1) {
    throw new RangeError(
      `${waypoints.length} waypoints need ${waypoints.length - 1} segment laws, got ${laws.length}`,
    );
  }
  for (const w of waypoints) {
    if (w.length !== limits.length) {
      throw new RangeError(
        `Waypoint has ${w.length} joint values but ${limits.length} joints are configured`,
      );
    }
  }

  const segments: Segment[][] = [];
  const times: number[] = [0];
  for (let k = 0; k < waypoints.length - 1; k++) {
    // Robot::SetUpTime, one segment at a time: every joint gets the
    // duration of the slowest joint on THIS segment.
    const group = synchronizeMoves(
      limits.map((jointLimits, j) => ({
        law: laws[k],
        start: waypoints[k][j],
        end: waypoints[k + 1][j],
        limits: jointLimits,
      })),
    );
    segments.push(group);
    times.push(times[k] + (group[0]?.duration ?? 0));
  }
  return { segments, times, duration: times[times.length - 1], jointCount: limits.length };
}

/** State of every joint at global path time t (clamped to [0, duration]). */
export function evaluatePath(path: PlannedPath, t: number): MotionState[] {
  const clamped = Math.min(Math.max(t, 0), path.duration);
  // Linear scan — paths have a handful of segments; find the one whose
  // window contains t (the last segment owns its right edge).
  let k = 0;
  while (k < path.segments.length - 1 && clamped >= path.times[k + 1]) k++;
  const local = clamped - path.times[k];
  return path.segments[k].map((segment) => evaluateSegment(segment, local));
}

export interface SampledPath {
  time: Float64Array;
  /** One array per joint, n+1 fence-post samples each. */
  position: Float64Array[];
  velocity: Float64Array[];
  acceleration: Float64Array[];
}

/** Sample the whole path for charting, n+1 fence-post values. */
export function samplePath(path: PlannedPath, n: number): SampledPath {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`Sample count must be a positive integer, got ${n}`);
  }
  const time = new Float64Array(n + 1);
  const position = Array.from({ length: path.jointCount }, () => new Float64Array(n + 1));
  const velocity = Array.from({ length: path.jointCount }, () => new Float64Array(n + 1));
  const acceleration = Array.from({ length: path.jointCount }, () => new Float64Array(n + 1));
  for (let i = 0; i <= n; i++) {
    // Pin the last sample to the exact duration: (n·T)/n can differ from
    // T by one ULP, and the endpoint should be the endpoint.
    const t = i === n ? path.duration : (i * path.duration) / n;
    time[i] = t;
    evaluatePath(path, t).forEach((state, j) => {
      position[j][i] = state.position;
      velocity[j][i] = state.velocity;
      acceleration[j][i] = state.acceleration;
    });
  }
  return { time, position, velocity, acceleration };
}
