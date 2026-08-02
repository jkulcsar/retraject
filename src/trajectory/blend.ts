/**
 * Via-point blending: linear segments with parabolic blends (LSPB through
 * via points) — the classic answer to the one motion-quality limit the
 * 1997 system had. Every law in laws/ is rest-to-rest, so a multi-waypoint
 * path stops dead at every waypoint. Blending treats interior waypoints as
 * VIA points: the joint keeps a constant velocity between them and rounds
 * each corner with a constant-acceleration parabola, never stopping.
 *
 * The model (uniform for endpoints and interior vias alike): per joint, a
 * plateau velocity per segment (vₖ = Δq/Tₖ), with plateau lists padded by
 * v=0 before the start and after the end; at every via k a linear velocity
 * ramp of duration tbₖ, CENTERED on the via time τₖ. Two classic
 * properties follow exactly (both are tests):
 *
 *   - Corner cutting: the blend misses the via corner by exactly
 *     Δv·tb/8 — the price of not stopping, in closed form.
 *   - Rejoining: outside the ramps the motion lies exactly on the ideal
 *     straight line through the via points; the parabola re-enters the
 *     line with matched position AND velocity.
 *
 * Synchronization: all joints share the via times and blend windows;
 * segment durations come from the slowest joint (as everywhere in this
 * project), blend durations from the largest velocity change against each
 * joint's acceleration limit. When blends would overlap ("segments too
 * short to blend"), the whole timeline is stretched by a single factor s —
 * velocities scale 1/s and blend needs 1/s², so the smallest feasible
 * s = √(worst blend-to-segment ratio) fixes every violation in one pass.
 */
import type { JointLimits } from "./law";
import type { MotionState } from "./segment";

export interface BlendedPath {
  jointCount: number;
  duration: number;
  /** Via passage times τ₀..τₙ (τ₀/τₙ are the endpoint pseudo-vias). */
  viaTimes: number[];
  /** Blend (ramp) duration at each via. */
  blendDurations: number[];
  /** Plateau velocity of each joint on each segment: velocities[k][j]. */
  velocities: number[][];
  waypoints: number[][];
  /** 1 when the limits allowed the nominal timing; >1 when the timeline
   * had to be stretched so the blends fit. */
  timeScale: number;
}

export function planBlendedPath(
  waypointsIn: readonly (readonly number[])[],
  limits: readonly JointLimits[],
): BlendedPath {
  const waypoints = waypointsIn.map((w) => [...w]);
  const n = waypoints.length - 1; // segments
  if (n < 1) throw new RangeError(`A blended path needs at least 2 waypoints, got ${waypoints.length}`);
  for (const w of waypoints) {
    if (w.length !== limits.length) {
      throw new RangeError(`Waypoint has ${w.length} joint values but ${limits.length} joints are configured`);
    }
  }

  // Nominal segment durations from the slowest joint at full speed.
  const T: number[] = [];
  for (let k = 0; k < n; k++) {
    let t = 0;
    for (let j = 0; j < limits.length; j++) {
      t = Math.max(t, Math.abs(waypoints[k + 1][j] - waypoints[k][j]) / limits[j].maxVelocity);
    }
    if (t === 0) {
      throw new RangeError(
        `Waypoints ${k} and ${k + 1} are identical — blending has no line to travel; remove the duplicate`,
      );
    }
    T.push(t);
  }

  const computeVelocities = (scale: number): number[][] =>
    Array.from({ length: n }, (_, k) =>
      limits.map((_, j) => (waypoints[k + 1][j] - waypoints[k][j]) / (T[k] * scale)),
    );

  const computeBlends = (velocities: number[][]): number[] => {
    const tb: number[] = [];
    for (let k = 0; k <= n; k++) {
      let t = 0;
      for (let j = 0; j < limits.length; j++) {
        const vPrev = k === 0 ? 0 : velocities[k - 1][j];
        const vNext = k === n ? 0 : velocities[k][j];
        t = Math.max(t, Math.abs(vNext - vPrev) / limits[j].maxAcceleration);
      }
      tb.push(t);
    }
    return tb;
  };

  // One-pass feasibility: consecutive ramps must not overlap. Stretching
  // time by s divides velocities by s and blend times by s, so the
  // blend-to-segment ratio falls as 1/s² — solve for the worst ratio.
  let velocities = computeVelocities(1);
  let tb = computeBlends(velocities);
  let ratio = 0;
  for (let k = 0; k < n; k++) ratio = Math.max(ratio, (tb[k] + tb[k + 1]) / (2 * T[k]));
  const timeScale = ratio > 1 ? Math.sqrt(ratio) * (1 + 1e-9) : 1;
  if (timeScale > 1) {
    for (let k = 0; k < n; k++) T[k] *= timeScale;
    velocities = computeVelocities(1); // T already scaled
    tb = computeBlends(velocities);
  }

  const viaTimes: number[] = [tb[0] / 2];
  for (let k = 0; k < n; k++) viaTimes.push(viaTimes[k] + T[k]);
  return {
    jointCount: limits.length,
    duration: viaTimes[n] + tb[n] / 2,
    viaTimes,
    blendDurations: tb,
    velocities,
    waypoints,
    timeScale,
  };
}

export function evaluateBlendedPath(path: BlendedPath, t: number): MotionState[] {
  const clamped = Math.min(Math.max(t, 0), path.duration);
  const n = path.waypoints.length - 1;
  return Array.from({ length: path.jointCount }, (_, j) => {
    // Which via's ramp, or which plateau, owns this instant?
    for (let k = 0; k <= n; k++) {
      const tau = path.viaTimes[k];
      const half = path.blendDurations[k] / 2;
      if (clamped < tau - half) {
        // Plateau of segment k (before via k): exactly on the ideal line.
        const v = k === 0 ? 0 : path.velocities[k - 1][j];
        const q = path.waypoints[k][j] + v * (clamped - tau);
        return { position: q, velocity: v, acceleration: 0 };
      }
      if (clamped <= tau + half || k === n) {
        // Inside ramp k: constant acceleration from vPrev to vNext.
        const vPrev = k === 0 ? 0 : path.velocities[k - 1][j];
        const vNext = k === n ? 0 : path.velocities[k][j];
        const tbk = path.blendDurations[k];
        if (tbk === 0) {
          // No velocity change here — seamless corner.
          return {
            position: path.waypoints[k][j] + vNext * (clamped - tau),
            velocity: vNext,
            acceleration: 0,
          };
        }
        const a = (vNext - vPrev) / tbk;
        const dt = clamped - (tau - half);
        const entry = path.waypoints[k][j] - vPrev * half; // on the incoming line
        return {
          position: entry + vPrev * dt + 0.5 * a * dt * dt,
          velocity: vPrev + a * dt,
          acceleration: a,
        };
      }
    }
    // Unreachable: the k === n ramp clause returns for any t ≤ duration.
    throw new Error("evaluateBlendedPath: time not covered by any region");
  });
}

/** Fence-post samples for charting; structurally identical to the
 * planner's SampledPath so the explorer can treat both alike. */
export function sampleBlendedPath(path: BlendedPath, n: number) {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`Sample count must be a positive integer, got ${n}`);
  }
  const time = new Float64Array(n + 1);
  const position = Array.from({ length: path.jointCount }, () => new Float64Array(n + 1));
  const velocity = Array.from({ length: path.jointCount }, () => new Float64Array(n + 1));
  const acceleration = Array.from({ length: path.jointCount }, () => new Float64Array(n + 1));
  for (let i = 0; i <= n; i++) {
    const t = i === n ? path.duration : (i * path.duration) / n;
    time[i] = t;
    evaluateBlendedPath(path, t).forEach((state, j) => {
      position[j][i] = state.position;
      velocity[j][i] = state.velocity;
      acceleration[j][i] = state.acceleration;
    });
  }
  return { time, position, velocity, acceleration };
}
