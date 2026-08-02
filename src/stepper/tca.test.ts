import { describe, expect, it } from "vitest";
import { LAWS, planSegment, type Segment } from "../trajectory";
import { quantizeSegment, sampleStaircase, type StepperOptions } from "./tca";

/**
 * The stepper model's contract, in 1997 terms: DumpOut printed
 * "Steps to execute" against "Steps resulted from the TCA" so you could
 * see whether the pulse train delivered the move. Here that comparison is
 * an assertion — plus bounds the console could never check: staircase
 * error at every instant, pulse spacing against the TCA constants, and
 * honest degradation when the virtual motor's step rate saturates.
 */

const OPTS: StepperOptions = { stepsPerUnit: 10, quantumHz: 2000, divisions: 24 };
const LIMITS = { maxVelocity: 40, maxAcceleration: 80 };

const seg = (law = LAWS.quintic, start = 0, end = 90): Segment =>
  planSegment({ law, start, end, limits: LIMITS });

describe("quantizeSegment", () => {
  it("delivers exactly the steps the move requires, for every law, direction and timing mode", () => {
    for (const timing of ["per-step", "division-constant"] as const) {
      for (const law of [LAWS.linear, LAWS.cubic, LAWS.quintic, LAWS.bangBang, LAWS.trapezoidal]) {
        for (const [start, end] of [[0, 90], [45, -30]] as const) {
          const q = quantizeSegment(seg(law, start, end), { ...OPTS, timing });
          expect(q.stepsToExecute).toBe(Math.round(Math.abs(end - start) * OPTS.stepsPerUnit));
          expect(q.stepsResulted).toBe(q.stepsToExecute);
          expect(q.saturated).toBe(false);
          expect(q.pulses).toHaveLength(q.stepsToExecute);
        }
      }
    }
  });

  it("per-step timing keeps the staircase within a few steps, improving with divisions", () => {
    // Error components: ±½ step of boundary rounding, plus the deviation
    // of a UNIFORM pulse spread from the CURVED profile inside one
    // division — which shrinks as divisions increase. That is the 1997
    // m_uiMaxDivisions knob, quantified.
    const segment = seg();
    const worstAt = (divisions: number) => {
      const opts = { ...OPTS, divisions };
      const s = sampleStaircase(segment, quantizeSegment(segment, opts), opts, 2000);
      return Math.max(...Array.from(s.errorSteps, Math.abs));
    };
    expect(worstAt(24)).toBeLessThanOrEqual(2.5);
    expect(worstAt(48)).toBeLessThan(worstAt(12));
    // And the staircase ends within half a step of the commanded position.
    const q = quantizeSegment(segment, OPTS);
    const s = sampleStaircase(segment, q, OPTS, 2000);
    expect(Math.abs(s.staircase[2000] - segment.end)).toBeLessThanOrEqual(
      0.5 / OPTS.stepsPerUnit + 1e-12,
    );
  });

  it("the faithful 1997 countdown ripples more than per-step timing, but re-anchors at boundaries", () => {
    const segment = seg();
    const faithful = quantizeSegment(segment, { ...OPTS, timing: "division-constant" });
    const modern = quantizeSegment(segment, OPTS);
    const sf = sampleStaircase(segment, faithful, OPTS, 4000);
    const sm = sampleStaircase(segment, modern, OPTS, 4000);
    const worstFaithful = Math.max(...Array.from(sf.errorSteps, Math.abs));
    const worstModern = Math.max(...Array.from(sm.errorSteps, Math.abs));
    // The ripple is the point: rate flooring makes the 1997 scheme
    // measurably worse mid-division…
    expect(worstFaithful).toBeGreaterThan(worstModern);
    // …but the cumulative error feedback still bounds it (well under the
    // per-division budget), and both trains deliver the full step count.
    expect(worstFaithful).toBeLessThan(30);
    expect(faithful.stepsResulted).toBe(modern.stepsResulted);
  });

  it("division-constant mode spaces pulses by exactly TCA interrupts inside a division", () => {
    const q = quantizeSegment(seg(), { ...OPTS, timing: "division-constant" });
    for (const d of q.divisions) {
      const inDiv = q.pulses.filter((p) => p.t > d.tStart && p.t <= d.tEnd + 1e-12);
      for (let i = 1; i < inDiv.length; i++) {
        expect(inDiv[i].t - inDiv[i - 1].t).toBeCloseTo(d.tca * q.quantum, 9);
      }
    }
  });

  it("emits monotone pulse times within the segment, direction matching the move", () => {
    const q = quantizeSegment(seg(LAWS.trapezoidal, 45, -30), OPTS);
    expect(q.direction).toBe(-1);
    for (let i = 0; i < q.pulses.length; i++) {
      expect(q.pulses[i].direction).toBe(-1);
      if (i > 0) expect(q.pulses[i].t).toBeGreaterThan(q.pulses[i - 1].t);
      expect(q.pulses[i].t).toBeGreaterThan(0);
      expect(q.pulses[i].t).toBeLessThanOrEqual(seg(LAWS.trapezoidal, 45, -30).duration + 1e-9);
    }
  });

  it("gives idle divisions the no-pulse constant NQPD+1 (the 1997 trick)", () => {
    // A quintic spends its first divisions barely moving: with a coarse
    // motor there are zero-budget divisions at the ends.
    const coarse = { ...OPTS, stepsPerUnit: 0.5 };
    const q = quantizeSegment(seg(), coarse);
    const idle = q.divisions.filter((d) => d.budget === 0);
    expect(idle.length).toBeGreaterThan(0);
    for (const d of idle) {
      expect(d.tca).toBe(d.quanta + 1);
      expect(d.emitted).toBe(0);
    }
  });

  it("reports saturation honestly when the step rate exceeds the interrupt rate", () => {
    const starved = { stepsPerUnit: 200, quantumHz: 300, divisions: 12 };
    const q = quantizeSegment(seg(), starved);
    expect(q.saturated).toBe(true);
    expect(q.stepsResulted).toBeLessThan(q.stepsToExecute);
    // Still sane: every emitted count fits its division's interrupt budget.
    for (const d of q.divisions) expect(d.emitted).toBeLessThanOrEqual(d.quanta);
  });

  it("handles a zero-distance move with an empty pulse train", () => {
    const q = quantizeSegment(seg(LAWS.cubic, 30, 30), OPTS);
    expect(q.stepsToExecute).toBe(0);
    expect(q.pulses).toHaveLength(0);
  });

  it("rejects nonsensical options loudly", () => {
    expect(() => quantizeSegment(seg(), { ...OPTS, stepsPerUnit: 0 })).toThrow(RangeError);
    expect(() => quantizeSegment(seg(), { ...OPTS, divisions: 0 })).toThrow(RangeError);
    expect(() => quantizeSegment(seg(), { ...OPTS, quantumHz: 2 })).toThrow(/too coarse/);
  });
});
