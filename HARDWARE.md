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
  **under $80** (a priced, beginner-proofed kit is in §8.1).

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
   to each absolute timestamp; write dir bits, assert step bits for
   3–5 µs, clear, and keep them low at least as long. The DRV8825 needs
   ≥ 1.9 µs high and ≥ 1.9 µs low, so a bare 2 µs is too tight; the
   A4988 needs ~1 µs. Direction must also settle before the step edge
   (≥ 650 ns on the DRV8825). The 1997 code's three `uiTemp++` delay
   lines were this exact concern.
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

### 8.1 A sourced kit (October 2026)

The table above is the generic shape. This is the same bench priced at
one shop that stocks every part (bastelgarage.ch; CHF incl. VAT, read
from the product pages on 2026-10-25), adjusted for a builder with no
soldering iron and no bench supply.

**Phase 1, one axis: CHF 107.90** (free shipping above CHF 80)

| Item | Product | CHF |
|---|---|---|
| Microcontroller | Raspberry Pi Pico 2H: RP2350, headers pre-soldered | 9.90 |
| Driver | DRV8825 module, stick-on heatsink included | 7.90 |
| Driver carrier | single-driver carrier for DRV8825/A4988: 12–24 V screw terminal, 100 µF/35 V capacitor on board, microstepping DIP switches, 4-pin XH motor socket | 4.90 |
| Motor | NEMA17 17HS4401: 1.8°, 1.7 A/phase, 0.45 Nm | 14.90 |
| Motor cable | 6-pin PH2.0 → 4-pin XH2.54, 1 m | 2.90 |
| Power | 12 V / 4 A closed plug-in supply, 5.5/2.1 mm plug | 18.90 |
| Jack adapter | 5.5/2.1 mm DC socket with screw terminals | 1.90 |
| Multimeter | XL830L (200 mV and 2 V DC ranges, enough to set Vref) | 18.90 |
| USB cable | USB-A → micro-B **data** cable, 1.8 m | 10.90 |
| Breadboard | full size, 830 points | 7.90 |
| Jumper wires | Dupont set, M/M, M/F and F/F | 8.90 |

**Phase 2, two more axes: CHF 61.20.** 2 × driver, 2 × carrier,
2 × motor, 2 × cable. The 12 V / 4 A supply covers all three motors:
a chopper driver draws far less from the supply than its coil current.
Both phases in one order: CHF 169.10.

What changed against the generic table, and why:

- **Pico 2H instead of the RP2040 Pico.** Same PIO (12 state machines
  instead of 8), headers already soldered, same price class; the SDK
  build target becomes `pico2`. One caveat for later: RP2350 erratum E9
  makes the internal pull-downs unreliable on early chip steppings. That
  touches endstop and e-stop inputs, not step/dir outputs; use external
  resistors there. An RP2040 Pico H works just as well.
- **DRV8825, not A4988.** It takes the Pico's 3.3 V logic directly and
  carries ~1.5 A per phase without a fan (A4988: ~1 A). Run the 1.7 A
  motor at 1.0–1.2 A: Vref 0.50–0.60 V with the usual R100 sense
  resistors (I = 2 × Vref).
- **Carrier boards instead of bare breakouts.** The motor supply never
  touches the breadboard, and the ≥ 47 µF bulk capacitor the driver
  needs is already on the board.
- **A closed plug-in supply** instead of an open-frame PSU: no mains
  wiring anywhere.
- **A multimeter**, without which the current limit cannot be set.

### 8.2 First-bench rules

1. Never connect or disconnect a motor while its driver is powered: it
   can destroy the driver.
2. Set Vref with no motor connected; then power off, connect the motor,
   power on.
3. Keep 12 V off the breadboard: jack adapter → carrier screw terminal,
   nothing else.
4. Feed the carrier's logic pin from the Pico's 3V3(OUT), never VBUS or
   5 V, and tie the Pico's GND to the carrier's GND.
5. Before the first power-up, check with the multimeter: RST and SLP
   must be bridged on the carrier (otherwise the driver never steps),
   and each motor coil pair reads ~1–2 Ω with the cross pairs open.
6. Fit the stick-on heatsink so that it bridges no pins.
7. Web Serial needs a data cable; a charge-only cable shows no device.
   A USB-C-only host needs a USB-C → micro-B cable instead.

Sources: Pololu product pages for the DRV8825 (#2133) and the A4988
(#1182); the TI DRV8825 datasheet (STEP timing); Raspberry Pi's
Pico-series documentation and its RP2350 A4 stepping note.
