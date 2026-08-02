/**
 * The virtual stepper — a faithful software model of the 1997 execution
 * layer, the part of the thesis that ran closest to the metal:
 *
 *   legacy/JOINT.CPP  ComputeNQPD  — quanta (timer interrupts) per division
 *   legacy/JOINT.CPP  ComputeTCA   — the Time Constant Array: for every
 *                                    division of a trajectory, a countdown
 *                                    reload value; every TCA-th interrupt
 *                                    emits one motor step pulse
 *   legacy/ROBOT.CPP  handler()    — the INT 08h ISR: decrement, pulse the
 *                                    LPT1 port on zero, reload
 *
 * In 1997 this layer had no graphical representation at all: it existed
 * as Joint::DumpOut's number columns on the DOS console and as the '*'
 * and '|' debug characters the ISR wrote straight into video memory at
 * B800:0000. The stepper explorer renders it for the first time.
 *
 * What the model shows, educationally: a continuous trajectory law must
 * become a finite pulse train. Time is chopped into DIVISIONS (the 1997
 * sampling grid, clamped to ~20 by the divisions bug — here configurable);
 * each division gets an integer step budget from the sampled positions
 * (with cumulative error feedback, the modern form of the 1997 iError
 * term), and the budget becomes a countdown constant TCA = ⌊quanta/steps⌋.
 * The reconstruction is a position STAIRCASE whose distance from the ideal
 * curve is the quantization error — bounded by about one step when the
 * pulse rate suffices, and visibly degrading when it does not.
 */
import type { Segment } from "../trajectory";
import { evaluateSegment } from "../trajectory";

export interface StepperOptions {
  /** Motor resolution: steps per position unit (e.g. steps per degree). */
  stepsPerUnit: number;
  /** Virtual timer-interrupt rate in Hz (1997: the 8253 reprogrammed to
   * `quantum` ticks of its 1.19318 MHz clock; see FindOutQuantum). */
  quantumHz: number;
  /** Divisions per segment — the 1997 sampling grid. */
  divisions: number;
  /**
   * Pulse timing scheme — an archaeology toggle:
   *
   * "division-constant" replays TRAJECT faithfully: one countdown value
   * per division, so the actual step rate is quantized to ⌊quanta/steps⌋
   * interrupts per step and the staircase ripples ahead of the curve by
   * up to the flooring granularity mid-division (re-anchoring at every
   * boundary). This ripple is REAL 1997 behavior, not a porting bug.
   *
   * "per-step" (default) spreads each division's budget uniformly with a
   * Bresenham distribution — one interrupt index per step, error ≈ one
   * step. This is where the author's own earlier prototype pointed:
   * legacy-adjacent TIMER/TIME00.C precomputed a timer constant PER STEP;
   * TRAJECT compressed that to per-division constants to save memory and
   * paid in ripple. The explorer lets you see both.
   */
  timing?: "division-constant" | "per-step";
}

export interface TCADivision {
  index: number;
  tStart: number;
  tEnd: number;
  /** NQPD: timer interrupts available in this division. */
  quanta: number;
  /** Integer step budget after cumulative error correction. */
  budget: number;
  /** The Time Constant: interrupts per step (quanta+1 encodes "no pulse",
   * the 1997 `+1 to avoid an impuls when this constant reaches 0`). */
  tca: number;
  /** Steps the countdown simulation actually emitted. */
  emitted: number;
}

export interface StepPulse {
  t: number;
  direction: 1 | -1;
}

export interface QuantizedSegment {
  divisions: TCADivision[];
  pulses: StepPulse[];
  direction: 1 | -1;
  /** m_dwStepsToExecute: what the move requires. */
  stepsToExecute: number;
  /** m_dwStepsResulted: what the pulse train delivers. Equal to
   * stepsToExecute unless the pulse rate saturates (see `saturated`). */
  stepsResulted: number;
  /** True when some division demanded more steps than it had interrupts —
   * the virtual motor's maximum step rate was exceeded. */
  saturated: boolean;
  /** Seconds per timer interrupt. */
  quantum: number;
}

export function quantizeSegment(segment: Segment, options: StepperOptions): QuantizedSegment {
  const { stepsPerUnit, quantumHz, divisions } = options;
  if (!(stepsPerUnit > 0) || !(quantumHz > 0) || !Number.isInteger(divisions) || divisions < 1) {
    throw new RangeError(
      `Invalid stepper options: stepsPerUnit=${stepsPerUnit}, quantumHz=${quantumHz}, divisions=${divisions}`,
    );
  }
  const T = segment.duration;
  const quantum = 1 / quantumHz;
  const totalQuanta = Math.floor(T / quantum);
  const quanta = Math.floor(totalQuanta / divisions); // NQPD
  if (T > 0 && quanta < 1) {
    throw new RangeError(
      `Quantum too coarse: ${totalQuanta} interrupts cannot fill ${divisions} divisions`,
    );
  }

  const distance = segment.end - segment.start;
  const direction: 1 | -1 = distance < 0 ? -1 : 1;
  const stepsToExecute = Math.round(Math.abs(distance) * stepsPerUnit);

  // Cumulative step targets at division boundaries, from the sampled law —
  // rounding the *cumulative* progress is the error feedback that keeps
  // the train honest (the 1997 iError term, perfected: no drift can
  // accumulate because every division re-anchors to the true curve).
  const cumTarget: number[] = [];
  for (let i = 0; i <= divisions; i++) {
    const t = (i * T) / divisions;
    const progress = Math.abs(evaluateSegment(segment, t).position - segment.start);
    cumTarget.push(Math.round(progress * stepsPerUnit));
  }

  const out: TCADivision[] = [];
  const pulses: StepPulse[] = [];
  let emittedTotal = 0;
  let saturated = false;

  for (let i = 0; i < divisions; i++) {
    const tStart = (i * T) / divisions;
    const tEnd = ((i + 1) * T) / divisions;
    const budget = Math.max(0, cumTarget[i + 1] - emittedTotal);
    if (budget > quanta) saturated = true;
    // ⌊NQPD / budget⌋, clamped to ≥1; an idle division gets NQPD+1 so the
    // countdown cannot reach zero inside it — the 1997 comment verbatim:
    // "we add one to this constant to void an impuls (a step) to the
    // motor when this constant reaches 0".
    const tca = budget > 0 ? Math.max(1, Math.floor(quanta / budget)) : quanta + 1;

    let emitted = 0;
    if ((options.timing ?? "per-step") === "division-constant") {
      // The ISR, replayed: every interrupt decrements; zero pulses the
      // port and reloads. The segment-total guard is the 1997 `uiSteps <=
      // abs(fFinalPos - fInitPos)` cap that stops a division from
      // overshooting the whole move.
      let countdown = tca;
      for (let k = 1; k <= quanta; k++) {
        countdown--;
        if (countdown <= 0) {
          if (emittedTotal < stepsToExecute) {
            pulses.push({ t: tStart + k * quantum, direction });
            emitted++;
            emittedTotal++;
          }
          countdown = tca;
        }
      }
    } else {
      // Per-step (Bresenham) timing: step j of the budget fires at
      // interrupt ⌈j·quanta/budget⌉ — integer interrupt indices, uniform
      // average spacing, no rate flooring. Saturation drops steps that
      // would need a second pulse in the same interrupt.
      let lastIdx = 0;
      for (let j = 1; j <= budget; j++) {
        const idx = Math.max(lastIdx + 1, Math.ceil((j * quanta) / budget));
        if (idx > quanta) break;
        pulses.push({ t: tStart + idx * quantum, direction });
        emitted++;
        emittedTotal++;
        lastIdx = idx;
      }
    }
    out.push({ index: i, tStart, tEnd, quanta, budget, tca, emitted });
  }

  return {
    divisions: out,
    pulses,
    direction,
    stepsToExecute,
    stepsResulted: emittedTotal,
    saturated,
    quantum,
  };
}

export interface StaircaseSamples {
  time: Float64Array;
  /** The ideal (continuous) position of the law. */
  ideal: Float64Array;
  /** The reconstructed stepper position (counts pulses). */
  staircase: Float64Array;
  /** Quantization error in STEPS (staircase − ideal, × stepsPerUnit). */
  errorSteps: Float64Array;
}

/** Reconstruct the staircase the pulse train produces and its distance
 * from the ideal curve, for charting. */
export function sampleStaircase(
  segment: Segment,
  quantized: QuantizedSegment,
  options: StepperOptions,
  n: number,
): StaircaseSamples {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`Sample count must be a positive integer, got ${n}`);
  }
  const T = segment.duration;
  const time = new Float64Array(n + 1);
  const ideal = new Float64Array(n + 1);
  const staircase = new Float64Array(n + 1);
  const errorSteps = new Float64Array(n + 1);
  let pulseIdx = 0;
  let stepsSoFar = 0;
  for (let i = 0; i <= n; i++) {
    const t = i === n ? T : (i * T) / n;
    while (pulseIdx < quantized.pulses.length && quantized.pulses[pulseIdx].t <= t) {
      stepsSoFar++;
      pulseIdx++;
    }
    const stair =
      segment.start + (quantized.direction * stepsSoFar) / options.stepsPerUnit;
    const exact = evaluateSegment(segment, t).position;
    time[i] = t;
    ideal[i] = exact;
    staircase[i] = stair;
    errorSteps[i] = (stair - exact) * options.stepsPerUnit;
  }
  return { time, ideal, staircase, errorSteps };
}
