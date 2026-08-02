# Driving real stepper motors — the plan

*The last homage: in 1997 the point of all this mathematics was that a
physical robot moved. This document is the engineering plan for closing
that loop with 2026 hardware — the browser takes the place of the DOS
machine, a USB microcontroller takes the place of the 8253 timer and the
LPT1 port. Nothing here is speculative; every piece is commodity.*

## 1. The shape of the problem

The 1997 stack was: trajectory math → TCA pulse schedule → timer
interrupt → parallel-port step/direction bits → motor drivers → RIP02.
The revival already has the first two layers running in the browser
(`src/trajectory`, `src/planner`, `src/stepper/tca.ts` produces exact
per-pulse timestamps). What a browser cannot do is the third: no page can
generate hard-real-time pulses — USB and OS scheduling add milliseconds
of jitter, and steppers care about microseconds.

The answer is the same division of labor Klipper uses for 3D printers:
**the host computes the full timed pulse schedule ahead of time; a
microcontroller executes it from a buffer with hardware timing.** Our
host is a web page. This is architecturally identical to 1997 — TCA
tables precomputed, ISR executes — with the ISR moved into a $5 chip
that does nothing else.

## 2. Recommended architecture

```
browser (existing code)                    microcontroller             power stage
┌─────────────────────────┐   Web Serial   ┌──────────────┐   step/dir  ┌──────────┐
│ planner → quantizeSegment│ ──────────────▶│ ring buffer  │ ───────────▶│ A4988 /  │──▶ NEMA17
│ pulse schedule (µs, axis)│  chunked,      │ + hw timer   │  per axis   │ DRV8825  │    motors
│ progress UI, e-stop      │  flow-controlled│ (RP2040 PIO) │             │ drivers  │
└─────────────────────────┘                └──────────────┘             └──────────┘
```

- **Browser side** (new `src/hardware/`): a Web Serial wrapper, an
  encoder that merges the per-joint `QuantizedSegment` pulse lists into
  one time-sorted stream of `(Δt µs, step-mask, dir-mask)` records — the
  direct descendant of the 1997 `bCommByte` that packed step and
  direction bits for three motors — and a small transfer protocol.
- **Microcontroller**: Raspberry Pi Pico (RP2040, ~$5). Its PIO state
  machines clock out step pulses with **zero CPU jitter** — the cleanest
  2026 answer to "reprogram the 8253". (Fallback: any Arduino with a
  16-bit timer ISR works to ~20 kHz aggregate step rate.)
- **Drivers**: A4988 or DRV8825 breakouts (~$2 each) or a CNC shield;
  NEMA17 motors (~$10 each); one 12–24 V PSU. Full three-axis bench:
  **under $80**.

## 3. The protocol (host ↔ MCU)

Binary, framed, credit-based — small enough to specify completely:

| Frame | Payload | Direction |
|---|---|---|
| `HELLO` | protocol version, axis count, max buffer | MCU → host on connect |
| `CHUNK n` | n × (Δt: uint16 µs, stepMask: uint8, dirMask: uint8) | host → MCU |
| `ACK k` | chunks consumed since last ACK | MCU → host (flow control) |
| `START` / `STOP` | — | host → MCU |
| `ESTOP` | — | host → MCU, also on serial break |
| `DONE` | pulses executed, µs elapsed | MCU → host |

Flow control is the part 1997 never needed (the schedule lived in RAM):
the host keeps the MCU's ring buffer between ⅓ and ⅔ full, sending a new
`CHUNK` per `ACK`. A 4 KB buffer holds ~1000 pulse records ≈ several
seconds of typical motion — USB hiccups vanish inside it. `Δt` as uint16
µs caps one record at 65 ms; longer gaps emit zero-mask keepalive
records (exactly the NQPD+1 "no pulse" trick, reborn).

## 4. Firmware sketch (RP2040)

1. Core 0: USB serial — parse frames, fill ring buffer, send `ACK`s.
2. Core 1 (or PIO + DMA): pop records; busy-wait on a µs hardware timer
   to each absolute timestamp; write dir bits, assert step bits ≥ 2 µs
   (A4988 minimum ~1 µs; the 1997 code's three `uiTemp++` delay lines
   were this exact concern), clear.
3. `ESTOP`: flush buffer, step lines low, report position lost.

~200 lines of C (or MicroPython at reduced max step rate for a first
bench). No kinematics on the chip, ever — the host owns all math, the
chip owns only time. That boundary is the whole design.

## 5. Browser-side changes (small)

- `src/hardware/serial.ts` — connect/disconnect (Web Serial is
  Chromium-only: feature-detect and show a notice elsewhere), framing,
  the credit loop, progress events.
- `src/hardware/encode.ts` — `PlannedPath` → per-joint
  `quantizeSegment(…, { timing: "per-step" })` → merge-sort into the
  record stream. Pure function, unit-testable against the existing TCA
  tests' invariants (total steps per axis conserved, monotone time).
- Explorer UI: a "hardware" folder — connect, steps/rev + microstepping
  per axis, dry-run (LEDs), run, e-stop. The 3D sim replays the same
  schedule simultaneously: the screen robot and the bench motors moving
  in lockstep is the money shot.

## 6. Honest constraints

- **Open loop.** Steppers lose steps silently under overload — exactly
  as in 1997. The planner's acceleration limits are the first defense;
  conservative velocity limits the second; optional endstop homing the
  third. (Closed-loop upgrade path: cheap magnetic encoders, but that is
  a different project.)
- **Rates.** A4988 + ½-microstepping + NEMA17 tops out around 10–20 kHz
  per axis comfortably; our default virtual quantum (2 kHz) is far
  inside. The `saturated` flag in `tca.ts` maps directly to "this move
  exceeds the physical motor".
- **Browser support.** Web Serial ships in Chrome/Edge only. Acceptable
  for a bench tool; the page must degrade gracefully.
- **Safety.** Low-voltage DC, current-limited drivers, no blades — but
  set driver Vref properly and never hot-unplug a stepper.

## 7. Phases

1. **One axis on the bench** (a weekend): Pico + one driver + one motor.
   Firmware echo test, then a single quintic move streamed and executed.
   Success = a phone-slow-motion video of the motor easing in and out.
2. **Three axes, synchronized** (a second weekend): the merged-stream
   encoder, a taught path from the robot page running on three motors —
   the RIP02's axis count, reborn.
3. **The rig** (open-ended): three motors on an actual mechanism — the
   dream candidate is a small pen plotter drawing the TCP path of a
   taught program, so the trajectory mathematics leaves a physical trace
   on paper. The 1997 thesis, with a souvenir.

## 8. Bill of materials (3-axis bench)

| Item | Qty | ~Cost |
|---|---|---|
| Raspberry Pi Pico | 1 | $5 |
| A4988/DRV8825 driver breakout | 3 | $6 |
| NEMA17 stepper (1.8°, ~1.5 A) | 3 | $30 |
| 12–24 V / 5 A PSU | 1 | $20 |
| Breadboard, wiring, capacitors | — | $10 |
| **Total** | | **≈ $71** |
