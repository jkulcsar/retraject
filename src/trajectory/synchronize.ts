import type { JointLimits, TrajectoryLaw } from "./law";
import type { Segment } from "./segment";
import { planSegment } from "./segment";

/**
 * Multi-joint synchronization — the port of Robot::SetUpTime
 * (legacy/ROBOT.CPP) and of the per-law λ machinery it triggered.
 *
 * Problem: each joint of the robot has its own move and its own minimum
 * feasible time, but a coordinated motion must have every joint start and
 * finish together. Solution: every joint gets the duration of the slowest
 * one (durations can only be stretched, never compressed below a joint's
 * minimum, so the maximum is the only common choice).
 *
 * Why the stretched joints still respect their limits — the time-scaling
 * argument the 1997 λ factors implemented case by case: evaluating a shape
 * with duration T instead of T_min multiplies all velocities by T_min/T ≤ 1
 * and all accelerations by (T_min/T)² ≤ 1. A profile feasible at T_min is
 * therefore feasible at any T ≥ T_min. The test suite verifies this
 * numerically for every law.
 */
export interface JointMove {
  law: TrajectoryLaw;
  start: number;
  end: number;
  limits: JointLimits;
}

export function synchronizeMoves(moves: readonly JointMove[]): Segment[] {
  const duration = moves.reduce(
    (t, m) => Math.max(t, m.law.minimumDuration(m.end - m.start, m.limits)),
    0,
  );
  return moves.map((m) => planSegment({ ...m, duration }));
}
