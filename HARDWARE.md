# Driving real stepper motors — the plan

*The last homage: in 1997 the point of all this mathematics was that a
physical robot moved. This document is the engineering plan for closing
that loop with hardware already on the shelf — the browser takes the
place of the DOS machine, a 2014 Raspberry Pi takes the place of the
8253 timer and the LPT1 port. Nothing here is speculative; every piece
is commodity.*

## 1. The shape of the problem

The 1997 stack was: trajectory math → TCA pulse schedule → timer
interrupt → parallel-port step/direction bits → motor drivers → RIP02.
The revival already has the first two layers running in the browser
(`src/trajectory`, `src/planner`, `src/stepper/tca.ts` produces exact
per-pulse timestamps). What a browser cannot do is the third: no page can
generate hard-real-time pulses — USB, network and OS scheduling add
milliseconds of jitter, and steppers care about microseconds.

The answer is the same division of labor Klipper uses for 3D printers:
**the host computes the full timed pulse schedule ahead of time; a
dedicated executor replays it from a buffer with hardware timing.** Our
host is a web page. This is architecturally identical to 1997 — TCA
tables precomputed, ISR executes — and the executor is a Raspberry Pi 1
Model B+ from 2014 whose DMA engine replays the schedule paced by a
hardware clock: the 8253, reprogrammed, inside a general-purpose
computer driving its own pins, as the DOS machine drove LPT1.

## 2. Recommended architecture

```
browser (existing code)                 Raspberry Pi 1 B+ (on the LAN)       power stage
┌──────────────────────────┐ WebSocket ┌─────────────────────────┐ step/dir ┌──────────┐
│ planner → quantizeSegment│──────────▶│ bridge  →  pigpiod      │─────────▶│ DRV8825  │──▶ NEMA17
│ pulse schedule (µs, axis)│  chunked, │ records → DMA waveforms │ per axis │ drivers  │    motors
│ progress UI, e-stop      │  flow ctl │ (hardware-clock paced)  │          │          │
└──────────────────────────┘           └─────────────────────────┘          └──────────┘
```

- **Browser side** (new `src/hardware/`): a WebSocket wrapper, an
  encoder that merges the per-joint `QuantizedSegment` pulse lists into
  one time-sorted stream of `(Δt µs, step-mask, dir-mask)` records — the
  direct descendant of the 1997 `bCommByte` that packed step and
  direction bits for three motors — and a small transfer protocol.
- **Executor**: a Raspberry Pi 1 Model B+ (owned; two on hand) running
  Raspberry Pi OS Lite 32-bit. Two pieces, deliberately separate:
  - **pigpiod**, the pigpio daemon, runs as a host service. It owns the
    DMA engine and the GPIO registers, so it is closer to a driver than
    an app, and only one instance can run.
  - **The bridge** is a small unprivileged Python service: WebSocket in,
    pigpio waveforms out, talking to pigpiod over its local socket.

  pigpio's pulse format — set these pins, clear those, wait N µs — is
  almost exactly our record. Waves are built in fixed-size padded slots
  (`gpioWaveCreatePad`) and queued with `PI_WAVE_MODE_ONE_SHOT_SYNC`, so
  one slot transmits while the next is filled: pigpio's documented
  pattern for "infinite wave sequences".
- **Verified on the bench Pi (2026-11-08):** pigpio v79 was built from
  source on Raspberry Pi OS Lite 32-bit (Trixie, kernel 6.18) on a Pi 1
  Model B+ rev 1.2. Its self-test `x_pigpio` passed every group,
  including all wave tests: generic waves, repeat and stop, padded wave
  slots freed and reused, and wave chains. Reported limits: 12,000
  pulses per wave, 25,016 DMA control blocks.
- **Fallback executor**: a Raspberry Pi Pico (RP2040/RP2350, ~$5) with
  its PIO state machines (§4.2). Its timing is tighter, and Web Serial
  would let the public GitHub Pages explorer drive the bench directly.
  Switch if pigpio ever stops building: it is unmaintained (last release
  v79, docs dated 2023), dropped from the Trixie archive, and has no
  Pi 5 support.
- **Drivers**: A4988 or DRV8825 breakouts (~$2 each) or a CNC shield;
  NEMA17 motors (~$10 each); one 12–24 V PSU. Full three-axis bench:
  **under $70** with the owned Pi (a priced, beginner-proofed kit is in
  §8.1).

## 3. The protocol (host ↔ executor)

Binary, framed, credit-based — small enough to specify completely. Each
frame travels as one binary WebSocket message:

| Frame | Payload | Direction |
|---|---|---|
| `HELLO` | protocol version, axis count, max buffer | executor → host on connect |
| `CHUNK n` | n × (Δt: uint16 µs, stepMask: uint8, dirMask: uint8) | host → executor |
| `ACK k` | chunks consumed since last ACK | executor → host (flow control) |
| `START` / `STOP` | — | host → executor |
| `ESTOP` | — | host → executor, also implied when the WebSocket closes |
| `DONE` | pulses executed, µs elapsed | executor → host |

Flow control is the part 1997 never needed (the schedule lived in RAM):
the host keeps the executor's buffer between ⅓ and ⅔ full, sending a new
`CHUNK` per `ACK`. On the Pi the buffer is two padded wave slots. Each
slot gets half of pigpio's 25,016 DMA control blocks; at about two
control blocks per pulse and two to three pulses per record, that is
about 2,000 records, or roughly a second of motion at a 2 kHz aggregate
step rate. Network hiccups vanish inside it. `Δt` as uint16 µs caps one
record at 65 ms; longer gaps emit zero-mask keepalive records (exactly
the NQPD+1 "no pulse" trick, reborn).

## 4. Executor sketch

### 4.1 Raspberry Pi (pigpio)

1. **pigpiod**, set up once: build pigpio v79 from source (`make`,
   `sudo make install`, `sudo ldconfig`) and run it as a systemd service.
2. **The bridge**, for each `CHUNK`:
   - Turn each record into pulses. One pulse clears the previous step
     bits and sets the new direction bits; the next raises the step bits.
   - Add the pulses to the next padded wave. `gpioWaveCreatePad(50, 50, 0)`
     gives two slots with half the resources each.
   - Queue the wave with `PI_WAVE_MODE_ONE_SHOT_SYNC`.
   - When `gpioWaveTxAt()` reports the new slot transmitting, delete the
     old one and send `ACK`.
3. **Pulse timing.** pigpio's waves are "accurate to a few
   microseconds", so step pulses are 10 µs high and at least 10 µs low,
   and direction changes land at least 5 µs before the step edge. That
   is well inside the DRV8825's limits (≥ 1.9 µs high and low, ≥ 650 ns
   direction setup) and the A4988's (~1 µs), and 10 µs pulses still fit
   at 20 kHz per axis (a 50 µs period). The 1997 code's three `uiTemp++`
   delay lines were this exact concern.
4. **`ESTOP`, or the WebSocket closing:** `gpioWaveTxStop`, step lines
   low, report position lost. If the bridge itself dies, the slot already
   queued finishes (at most about a second) and motion stops. The 12 V
   switch is the hard stop.

Pin map. All step and direction pins are GPIOs that default to pull-down
at power-on, so they sit low while the Pi boots:

| Signal | BCM GPIO | Header pin |
|---|---|---|
| Axis 1 STEP / DIR | 17 / 27 | 11 / 13 |
| Axis 2 STEP / DIR | 22 / 23 | 15 / 16 |
| Axis 3 STEP / DIR | 24 / 25 | 18 / 22 |
| Driver logic supply | 3V3 | 1 (or 17) |
| Ground | GND | 6 (or 9, 14, 20, 25) |

The bridge is a small Python service. No kinematics on the Pi, ever —
the host owns all math, the executor owns only time. That boundary is
the whole design.

### 4.2 Fallback: Pico firmware (RP2040/RP2350)

1. Core 0: USB serial — parse frames, fill ring buffer, send `ACK`s.
2. Core 1 (or PIO + DMA): pop records; busy-wait on a µs hardware timer
   to each absolute timestamp; write dir bits, assert step bits for
   3–5 µs, clear, and keep them low at least as long (the DRV8825's
   ≥ 1.9 µs makes a bare 2 µs too tight). Direction must settle before
   the step edge (≥ 650 ns on the DRV8825).
3. `ESTOP`: flush buffer, step lines low, report position lost.

~200 lines of C (or MicroPython at reduced max step rate for a first
bench). The transport becomes Web Serial (a Chromium-only API) instead
of a WebSocket; the protocol is unchanged.

## 5. Browser-side changes (small)

- `src/hardware/socket.ts` — connect/disconnect to the Pi's WebSocket,
  framing, the credit loop, progress events. WebSocket works in every
  browser, but **the page must not be the public HTTPS one**: an HTTPS
  page can't open an unencrypted `ws://` connection (mixed content), and
  Chrome 147+ also asks for local-network permission. Run the explorer
  from the development machine (`npm run dev`, served on
  `http://localhost`), or let the Pi serve the built site.
- `src/hardware/encode.ts` — `PlannedPath` → per-joint
  `quantizeSegment(…, { timing: "per-step" })` → merge-sort into the
  record stream. Pure function, unit-testable against the existing TCA
  tests' invariants (total steps per axis conserved, monotone time).
- Explorer UI: a "hardware" folder — connect (the Pi's address, e.g.
  `<hostname>.local`), steps/rev + microstepping per axis, dry-run
  (LEDs), run, e-stop. The 3D sim replays the same schedule
  simultaneously: the screen robot and the bench motors moving in
  lockstep is the money shot.

## 6. Honest constraints

- **Open loop.** Steppers lose steps silently under overload — exactly
  as in 1997. The planner's acceleration limits are the first defense;
  conservative velocity limits the second; optional endstop homing the
  third. (Closed-loop upgrade path: cheap magnetic encoders, but that is
  a different project.)
- **Rates.** A4988 + ½-microstepping + NEMA17 tops out around 10–20 kHz
  per axis comfortably; our default virtual quantum (2 kHz) is far
  inside. The `saturated` flag in `tca.ts` maps directly to "this move
  exceeds the physical motor". On the Pi, the unmeasured link is how fast
  the bridge (Python on a 700 MHz core) can build waves; measure it in
  Phase 1.
- **Where the page runs.** The bench version runs from `localhost` or
  from the Pi, not from GitHub Pages (§5). Acceptable for a bench tool;
  the public page must degrade gracefully.
- **pigpio's future.** It works today on the Pi 1, built from source.
  The Pico fallback (§4.2) is the exit if that stops being true.
- **Safety.** Low-voltage DC, current-limited drivers, no blades — but
  set driver Vref properly and never hot-unplug a stepper. The Pi's
  GPIOs are 3.3 V and unprotected: 12 V on a header pin destroys the Pi.

## 7. Phases

1. **One axis on the bench** (a weekend): Pi + one driver + one motor.
   Bridge echo test, then a single quintic move streamed and executed.
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
| Raspberry Pi 1 Model B+ (owned) | 1 | $0 |
| A4988/DRV8825 driver breakout | 3 | $6 |
| NEMA17 stepper (1.8°, ~1.5 A) | 3 | $30 |
| 12–24 V / 5 A PSU | 1 | $20 |
| Breadboard, wiring, capacitors | — | $10 |
| **Total** | | **≈ $66** |

With the fallback Pico instead of the Pi, add about $5.

### 8.1 A sourced kit (October 2026, revised November 2026)

The table above is the generic shape. This is the same bench priced at
one shop that stocks every part (bastelgarage.ch; CHF incl. VAT, read
from the product pages on 2026-10-25), adjusted for a builder with no
soldering iron and no bench supply. Revised 2026-11-08, with prices and
stock re-checked that day:
- the owned Pi replaces the Pico 2H (CHF 9.90) and its USB cable
  (CHF 10.90);
- an owned multimeter and an owned 12 V / 1.5 A supply replace the XL830L
  and the 12 V / 4 A supply (CHF 18.90 each);
- the full-size breadboard is sold out, and a half-size one is enough
  here.

**Phase 1, one axis: CHF 46.30**

| Item | Product | CHF |
|---|---|---|
| Executor | Raspberry Pi 1 Model B+ with 64 GB card, USB charger, micro-USB cable, Ethernet cable | owned |
| Driver | DRV8825 module, stick-on heatsink included | 7.90 |
| Driver carrier | single-driver carrier for DRV8825/A4988: 12–24 V motor supply, 3–5.5 V logic; screw terminal, 100 µF capacitor, microstepping DIP switches and 4-pin XH motor socket as described in October (the current page text lists only the two voltages) | 4.90 |
| Motor | NEMA17 17HS4401: 1.8°, 1.7 A/phase, 0.45 Nm | 14.90 |
| Motor cable | 6-pin PH2.0 → 4-pin XH2.54, 1 m | 2.90 |
| Power | 12 V / 1.5 A DC plug-in supply | owned |
| Jack adapter | 5.5/2.1 mm DC socket with screw terminals (match the supply's plug) | 1.90 |
| Multimeter | any digital multimeter with a 2 V (or auto) DC range and a 200 Ω range | owned |
| Breadboard | half size, 400 points: only shares 3V3 and GND between the carriers | 4.90 |
| Jumper wires | Dupont set, 20 cm, 20 each of M/M, M/F and F/F (F/F joins the Pi's header to the carrier) | 8.90 |

**Phase 2, two more axes: CHF 61.20.** 2 × driver, 2 × carrier,
2 × motor, 2 × cable. The owned 12 V / 1.5 A supply covers all three
motors at bench loads. A chopper driver draws roughly the power the motor
uses, not its coil current: about 0.3–0.4 A per motor at 1.0–1.2 A coil
current, so around 1 A for three. If a loaded mechanism later runs fast,
watch for the supply cutting out.

**Both phases in one order: CHF 107.50**, which clears the CHF 80
free-shipping threshold. Below it, shipping costs CHF 6.90 (Economy) or
CHF 8.90 (Priority).

What changed against the generic table, and why:

- **The owned Pi as executor** (§2). It needs no new parts, only the
  F/F jumpers that are in the kit anyway.
- **DRV8825, not A4988.** It takes the Pi's 3.3 V logic directly and
  carries ~1.5 A per phase without a fan (A4988: ~1 A). Run the 1.7 A
  motor at 1.0–1.2 A: Vref 0.50–0.60 V with the usual R100 sense
  resistors (I = 2 × Vref).
- **Carrier boards instead of bare breakouts.** The motor supply never
  touches the breadboard, and the ≥ 47 µF bulk capacitor the driver
  needs is already on the board.
- **A closed plug-in supply** instead of an open-frame PSU: no mains
  wiring anywhere. It must be DC (`12V ⎓` on the label); an old AC
  adapter would destroy the driver.
- **A multimeter**, without which the current limit cannot be set.
- **If the fallback Pico is ever needed:** a Pico 2H (RP2350, headers
  pre-soldered, CHF 9.90; same PIO with 12 state machines instead of 8,
  SDK target `pico2`) plus a micro-B **data** cable whose other end fits
  the host (USB-C on current Macs). One caveat: RP2350 erratum E9 makes the internal
  pull-downs unreliable on early chip steppings. That touches endstop and
  e-stop inputs, not step/dir outputs; use external resistors there. An
  RP2040 Pico H works just as well.

### 8.2 First-bench rules

1. Never connect or disconnect a motor while its driver is powered: it
   can destroy the driver.
2. Set Vref with no motor connected; then power off, connect the motor,
   power on.
3. Keep 12 V off the breadboard and away from the Pi: jack adapter →
   carrier screw terminal, nothing else. Before the first connection,
   measure the jack adapter's terminals: +12 V must be on the + terminal.
   The carriers have no reverse-polarity protection.
4. Feed the carrier's logic pin from the Pi's 3V3 (header pin 1 or 17),
   never 5 V, and tie the Pi's GND (pin 6) to the carrier's GND.
5. Before the first power-up, check with the multimeter: RST and SLP
   must be bridged on the carrier (otherwise the driver never steps),
   and each motor coil pair reads ~1–2 Ω with the cross pairs open.
6. Fit the stick-on heatsink so that it bridges no pins.
7. Switch the 12 V supply on only after the Pi has booted and the bridge
   is running, and off before the Pi shuts down or reboots. While the Pi
   boots (about a minute on a Pi 1), nothing drives its pins.
8. Shut the Pi down (`sudo shutdown -h now`) before pulling its power,
   to protect the SD card.

Sources: Pololu product pages for the DRV8825 (#2133) and the A4988
(#1182); the TI DRV8825 datasheet (STEP timing); the pigpio C interface
and download pages (waves, padded waves, self-tests); the BCM2835 ARM
Peripherals datasheet (power-on pull states, table 6-31); Raspberry Pi's
Pico-series documentation and its RP2350 A4 stepping note.
