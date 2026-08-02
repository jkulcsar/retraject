import type { JointLimits, Shape, TrajectoryLaw } from "./law";
import { assertValidLimits } from "./law";

/**
 * A segment is one planned move of one joint: start → end under a given
 * law, with a concrete duration. This is the modern counterpart of the
 * legacy `Trajectory` instance after Robot::SetUpTime had assigned it a
 * (possibly stretched) time — except that where the 1997 code baked the
 * result into sampled arrays immediately, a Segment stays a continuous
 * function of time that can be evaluated at any t (the browser's render
 * loop will ask at ~60 Hz, tests ask wherever they please).
 */
export interface SegmentSpec {
  law: TrajectoryLaw;
  start: number;
  end: number;
  limits: JointLimits;
  /**
   * Optional imposed duration, e.g. from multi-joint synchronization.
   * Must be ≥ the law's minimum duration for this move: a trajectory can
   * always be executed more slowly than its minimum, never faster.
   */
  duration?: number;
}

export interface Segment {
  readonly law: TrajectoryLaw;
  readonly start: number;
  readonly end: number;
  readonly limits: JointLimits;
  /** The duration this segment will actually take. */
  readonly duration: number;
  /** The law's minimum feasible duration for this move (≤ duration). */
  readonly minimumDuration: number;
  readonly shape: Shape;
}

/** Instantaneous kinematic state of one joint. */
export interface MotionState {
  position: number;
  velocity: number;
  acceleration: number;
}

/** Tolerance for "duration ≥ minimum" checks, relative. Guards against
 * spurious rejections from floating-point noise when a synchronized T
 * equals a joint's own minimum. */
const DURATION_TOLERANCE = 1e-9;

export function planSegment(spec: SegmentSpec): Segment {
  assertValidLimits(spec.limits);
  const distance = spec.end - spec.start;
  const minimumDuration = spec.law.minimumDuration(distance, spec.limits);
  const duration = spec.duration ?? minimumDuration;
  if (duration < minimumDuration * (1 - DURATION_TOLERANCE)) {
    throw new RangeError(
      `Requested duration ${duration} is below the ${spec.law.label} law's ` +
        `minimum ${minimumDuration} for a move of ${distance}`,
    );
  }
  return {
    law: spec.law,
    start: spec.start,
    end: spec.end,
    limits: spec.limits,
    duration,
    minimumDuration,
    shape: spec.law.shape(distance, spec.limits),
  };
}

/**
 * Evaluate a segment at time t (clamped to [0, duration]) via the generic
 * chain-rule formulas — the single evaluator that replaces the fifteen
 * m_Compute{Position,Speed,Acceleration} methods of the 1997 class tree:
 *
 *   q(t) = q₀ + D·r(t/T),  v(t) = (D/T)·r′(t/T),  a(t) = (D/T²)·r″(t/T)
 */
export function evaluateSegment(segment: Segment, t: number): MotionState {
  const { duration: T } = segment;
  if (T === 0) {
    // Zero-distance (or degenerate) move: the joint simply holds position.
    return { position: segment.start, velocity: 0, acceleration: 0 };
  }
  const tau = Math.min(1, Math.max(0, t / T));
  const D = segment.end - segment.start;
  return {
    position: segment.start + D * segment.shape.r(tau),
    velocity: (D / T) * segment.shape.dr(tau),
    acceleration: (D / (T * T)) * segment.shape.ddr(tau),
  };
}

export interface SampledSegment {
  time: Float64Array;
  position: Float64Array;
  velocity: Float64Array;
  acceleration: Float64Array;
}

/**
 * Sample a segment at n+1 equidistant instants (fence-post counting: n
 * intervals need n+1 samples to include both endpoints — the 1997 code's
 * cryptic `m_uiNrOfValues = m_uiDivisions + 1; // Why? Please read Project
 * Notes!` in legacy/TRAJECT.CPP was exactly this).
 *
 * Each instant is computed as t = i·T/n rather than by accumulating
 * `time += step` as the legacy sampling loops did — accumulation drifts by
 * one rounding error per iteration, closed form does not.
 */
export function sampleSegment(segment: Segment, n: number): SampledSegment {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`Sample count must be a positive integer, got ${n}`);
  }
  const time = new Float64Array(n + 1);
  const position = new Float64Array(n + 1);
  const velocity = new Float64Array(n + 1);
  const acceleration = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const t = (i * segment.duration) / n;
    const state = evaluateSegment(segment, t);
    time[i] = t;
    position[i] = state.position;
    velocity[i] = state.velocity;
    acceleration[i] = state.acceleration;
  }
  return { time, position, velocity, acceleration };
}
