# The virtual stepper — resurrecting the 1997 execution layer

Of all the modules, this one is pure homage: nothing here is needed to
drive the three.js robot. It exists because the most hard-won part of the
1997 thesis was not the math — it was getting the math *out of the
computer*: onto a timer interrupt, through the parallel port, into three
stepper motors of the RIP02. And that layer never had a picture. It lived
as `Joint::DumpOut`'s number columns on the DOS console and as the `*`/`|`
debug characters the interrupt handler wrote straight into video memory at
`B800:0000`. The stepper explorer gives it its first graphical
representation — with the DOS console reproduced beside the charts, in the
handler's own white-on-blue.

## 1. The 1997 pipeline, restated

A sampled trajectory had to become motor pulses:

1. **Divisions** (`legacy/TRAJECT.CPP m_ComputeDivisions`): each segment's
   time chopped into a coarse grid (clamped to ~20 by the units bug).
2. **NQPD** (`legacy/JOINT.CPP ComputeNQPD`): how many timer interrupts
   ("quanta") fit in one division — the 8253 was reprogrammed to fire
   every `quantum` ticks of its 1.19318 MHz clock, self-calibrated by
   `Robot::FindOutQuantum` measuring its own ISR's execution time.
3. **TCA** (`ComputeTCA`): per division, a countdown constant
   ⌊NQPD / steps⌋ — every TCA-th interrupt, one step pulse; idle
   divisions get NQPD+1 so the countdown can never fire ("*we add one to
   this constant to void an impuls*", as the original comment puts it).
   An error term (`iError`) fed accumulated step shortfall back into the
   next division's constant.
4. **The ISR** (`legacy/ROBOT.CPP handler`): decrement, on zero pulse the
   LPT1 step/direction bits and reload — while `DumpOut` had printed, for
   audit, `Steps to execute` against `Steps resulted from the TCA`.

`quantizeSegment` ports this pipeline with the error feedback perfected
(budgets derive from *cumulative* rounded targets, so drift cannot
accumulate), and `sampleStaircase` reconstructs what the motor actually
does: a position staircase whose distance from the ideal curve is the
quantization error.

## 2. The two timing modes — an archaeology toggle

- **`division-constant`** replays 1997 faithfully: one countdown value per
  division. Because ⌊NQPD/steps⌋ floors the rate, the actual step rate is
  wrong by up to the flooring granularity and the staircase *ripples*
  ahead of the curve mid-division, re-anchoring at every boundary. On the
  explorer's default move this peaks around ten steps. **This ripple is
  real 1997 behavior**, discovered when this port's first
  one-step-accuracy test failed at eleven.
- **`per-step`** (default) spreads each division's budget with a Bresenham
  distribution — step j at interrupt ⌈j·NQPD/steps⌉ — bringing the error
  down to roughly a step. The historical irony: the thesis's own
  precursor, `TIMER/TIME00.C`, precomputed a timer constant *per step*;
  TRAJECT compressed that to per-division constants (memory was scarce)
  and paid in ripple. The toggle lets you watch the trade.

Error anatomy (tested): ±½ step of boundary rounding plus the deviation of
a uniform in-division spread from the curved profile — which shrinks as
divisions increase. That is the 1997 `m_uiMaxDivisions` knob, quantified.
When a division demands more steps than it has interrupts, the model
reports **saturation** honestly (steps lost, flagged) — the virtual
motor's maximum step rate, exceeded.

## 3. What the tests prove — `tca.test.ts`

Exact step delivery (`stepsResulted === stepsToExecute`) for every law,
both directions, both timing modes; staircase error bounds and their
improvement with division count; exact TCA-spaced pulse intervals in
faithful mode; the faithful ripple measurably exceeding per-step error
while still re-anchoring; idle-division NQPD+1 encoding; honest
saturation; zero-distance moves.
