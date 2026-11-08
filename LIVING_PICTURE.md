# Living picture — the build plan

*Phase 3 of [`HARDWARE.md`](HARDWARE.md) ("the rig") made concrete. A pen
plotter inside a deep picture frame, under glass. It hangs on a wall or
lies on a desk, draws a new picture every few hours, keeps every drawing
on a paper roll, and later rolls them back into view one by one. When it
isn't drawing, all you see is the picture. The trajectory mathematics of
1997, leaving a trace on the wall.*

This is a slow build: many weekends, one phase at a time. Every phase
ends with a **gate**, a test that has to pass before the next phase
starts, and the risky parts are tested on the bench before anything is
built around them.

## 1. What we are building

| | |
|---|---|
| Mechanism | CoreXY on V-slot extrusion, after [PlotteRXY](https://github.com/jamescarruthers/PlotteRXY) |
| Picture | about 46 × 33 cm, landscape, drawn on a 42 cm paper roll |
| Frame | shadow box about 75 × 56 × 11 cm, 7–10 kg, glass front |
| Drive | the bench Pi (§2 of `HARDWARE.md`), pigpio waveforms, 3 stepper drivers |
| Motors | M1, M2: CoreXY. M3: paper take-up. Pen lift: a servo |
| Colours | one pen first, a capped pen rack with 4–6 colours later |
| Operation | schedules stored on the Pi and played on a timer; no cloud, no browser at run time |

Layers, front to back: glass, mat (passe-partout), the CoreXY mechanism,
paper, backing board. At rest, the gantry, carriage and pen rack park
behind the mat border; the Pi and drivers sit behind the backing board.

## 2. Decisions already made, and why

| Decision | Why |
|---|---|
| CoreXY, after PlotteRXY | Rigid, both motors fixed; the only researched design with a priced BOM, a size formula and squaring and belt-tension steps |
| Hung landscape, gantry beam vertical | The beam's weight rests on the bottom rail's wheels; the belts only hold the light pen carriage |
| Servo pen lift on a spring-loaded holder | Keeps the carriage light and frees M3 for the paper; the spring sets pen pressure in any orientation |
| Paper: catch-free spring supply roll, worm-geared take-up | The spring keeps tension and rewinds; the worm gear holds when unpowered, because a plain NEMA17 is back-driven by the spring |
| Replay found by margin marks | Step counts alone drift (slip, humidity, a changing roll diameter); a pigment bar read by a TCRT5000 sensor gives a fixed reference |
| TMC2209 drivers in the frame | Every quiet build in the research uses Trinamic drivers; they fit the same carrier boards in step/dir mode |
| Schedules stored on the Pi | Two commercial wall robots (Scribit, iBoardbot) stopped working when their makers' servers went down |
| Pen rack that caps the pens | Pens dry out between drawings; HP's 1979 pen changer (US 4,135,245) both swapped and capped pens |

### The motors question

No different motors are needed for the CoreXY axes. Stepper noise comes
mostly from the driver's current control, from speed, and from the
frame's resonance, not from the motor itself. The plan for quiet is
TMC2209 drivers in their quiet StealthChop mode, slow drawing speeds,
moderate belt tension, and a damped box. The 17HS4401s on order stay.
The exception is the paper take-up: its final motor is a NEMA17 with a
worm gearbox (around 1:20–1:50), bought in Phase 1.

## 3. How we work

- **You** order, wire, assemble, test, and send photos and measurements.
- **Claude** writes the software (the Pi bridge and player, the browser
  side), the OpenSCAD models for custom printed parts, the calculations
  and the documentation, and reviews photos.
- One change at a time, verified before the next. Results go into this
  file's phase sections as they happen.
- Printed parts are batched per phase, since the printer is borrowed.
- Bench safety rules in `HARDWARE.md` §8.2 apply throughout.

## 4. Phases

Weekend counts are rough; nothing here is on a clock.

### Phase 0: the bench works (2–3 weekends)

`HARDWARE.md` phases 1 and 2. This is the software foundation everything
else stands on.

1. Order the kit (`HARDWARE.md` §8.1). Set Vref on one driver with no
   motor connected, then wire one axis on the breadboard.
2. Make pigpio's daemon a system service on the Pi that starts at boot.
3. Claude writes the bridge: a Python service in a virtual environment,
   WebSocket in, padded pigpio waves out, with `ACK`, `ESTOP`, a
   stop-on-disconnect, and a `DONE` report that carries per-axis step
   counts.
4. Claude writes the browser side: `src/hardware/socket.ts` and
   `encode.ts`, plus a hardware panel in the explorer.
5. First move: one axis, one quintic profile, filmed in slow motion.
6. Wire the second and third axes; run a taught path on all three.

**Gate:** the per-axis step counts reported by the Pi match the planned
counts exactly, over ten runs; a there-and-back move returns each shaft
to its paper pointer.

### Phase 1: retire the big risks (2–3 weekends, partly in parallel)

The concept's riskiest parts, tested before anything is built around
them.

**1A, cap test** (start first; it runs by itself for three days):
1. Buy 2–3 candidate pens: Staedtler pigment liner 308, Staedtler triplus
   334, a Sakura Micron.
2. Print simple caps with a silicone or closed-cell foam insert
   (Claude provides the OpenSCAD model).
3. Cap them pointing sideways, as on the wall, for 72 hours; then draw.

**Gate:** at least one pen starts a clean line on the first stroke after
72 hours.

**1B, paper rig** (on the bench, no plotter needed):
1. Buy a catch-free spring roller (an insect-screen spring roller, or a
   roller blind with its catch removed), a 42 cm paper roll, a TCRT5000
   sensor module, and a NEMA17 worm-gear motor.
2. Build a simple board: supply roll at the top, a rounded-edge backing
   board, take-up spool at the bottom driven by the worm-gear motor.
3. Claude adds paper commands to the bridge: advance by steps, read the
   sensor, and creep onto a mark's edge, always from the same direction.
4. Draw marks by hand with a pigment pen, run 20 advance-and-rewind
   cycles, and measure where each mark stops.

**Gate:** every mark stops within 1 mm of its first position over 20
cycles; the paper lies flat on the board with no curl lifting it.

**1C, noise baseline:**
1. Buy two TMC2209 SilentStepSticks (about CHF 14 each at DigiKey).
2. Fit one to a carrier: DIP switch 3 off, logic at 3.3 V, Vref about
   1.1 V for 0.8 A.
3. Measure one motor at 1 m with a phone sound meter, DRV8825 versus
   TMC2209, at several speeds.

**Gate:** the TMC2209 is clearly quieter; we have numbers to compare the
finished frame against.

### Phase 2: the flat plotter (4–6 weekends)

Build the CoreXY mechanics and draw on a desk first, where gravity still
helps the pen.

1. Size it: PlotteRXY's rule (X rail = paper width + 260 mm, Y rail =
   paper length + 200 mm), adjusted to a 46 × 33 cm drawing area.
2. Order the PlotteRXY parts: V-slot (not plain 2020) cut to length with
   tapped ends, V-wheels with eccentric spacers (more than the BOM lists),
   GT2 belt and pulleys, fasteners. Print its parts (about 13 h of PETG).
3. Claude designs the pen holder this frame needs: a spring-loaded
   slider for one fineliner, with the servo pulling it back (about
   20–35 g of pen force).
4. Assemble, square the frame with the eccentric nuts, tension the belts
   moderately.
5. Homing with hall sensors and magnets (silent, no clicking switches).
6. Claude adds the plotter software:
   - the CoreXY mapping (`A = k·(x + y)`, `B = k·(x − y)`);
   - SVG import flattened to about 0.1 mm;
   - path ordering with reversal and joining (0.15–0.5 mm);
   - timed pen up and down, with the servo pulse switched off after each
     move;
   - starting speeds from saxi's defaults (pen down 50 mm/s at 200
     mm/s², pen up 200 mm/s at 400 mm/s²).
7. Calibrate steps per mm and check squareness with a drawn test square.

**Gate:** an A3 drawing; a square drawn ten times on top of itself shows
one line, under 0.3 mm spread.

### Phase 3: upright (1–2 weekends)

1. Mount the plotter on a board and stand it upright, landscape, beam
   vertical.
2. Add the ADXL345 tilt sensor; the software picks the park border and
   the pen preload from gravity's direction.
3. Test parking: drive to the padded stop at the bottom, switch the
   drivers off, and check that nothing moves.
4. Tune the pen spring until upright drawings match the desk drawings.

**Gate:** the Phase 2 test drawing comes out the same upright as flat;
the carriage stays parked with the drivers off.

### Phase 4: paper and the living cycle (3–4 weekends)

1. Move the Phase 1B rig into the plotter: supply roll above, take-up
   below, the backing board behind the drawing area.
2. The plotter draws its own registration mark in the hidden margin
   after each picture.
3. Claude writes the player on the Pi:
   - schedules uploaded once from the browser and stored on the SD card;
   - a systemd timer for live mode (draw, cap, park, advance) and
     gallery mode (rewind to the previous mark, show);
   - quiet hours;
   - resuming correctly after a power cut;
   - a log you can read from the browser.

**Gate:** ten pictures drawn on the schedule, then replayed in order,
each landing within 1 mm of where it was drawn, with a power cut in the
middle.

### Phase 5: the frame (3–5 weekends)

1. Build the shadow box from wood: 75 × 56 cm, 10–12 cm deep. Its
   interior grows to fit the mechanism, so measure the built plotter
   first.
2. Cut the mat; choose glazing: anti-reflective glass, or anti-static
   anti-reflective acrylic (lighter, safer for a heavy wall box).
3. Hinge the glass and mat together as a front door with magnets and a
   felt gasket, for pens and paper.
4. Hide everything:
   - only a flat three-wire ribbon moves, to the servo;
   - the Pi and drivers go behind the backing board;
   - light comes from the top and bottom edges only, so the gantry casts
     no shadow.
5. Power: one supply for everything. A 12 V supply of at least 3 A, with
   a 12 → 5 V buck module for the Pi and servo. The bench supply's 1.5 A
   is too tight for motors, Pi and servo together.
6. Fit the TMC2209s in place of the DRV8825s.
7. Hang it on a French cleat into the studs.

**Gate:** at rest, nothing technical is visible from the front; a full
live cycle runs on the wall; noise at 1 m is at or below the Phase 1C
TMC2209 baseline.

### Phase 6: colours (3–5 weekends)

1. Claude designs the pen holders and rack: each pen permanently in its
   own holder with a magnet face and a three-point seat; a rack along the
   bottom border with forks, detent magnets, a silicone cap and a sensor
   in every slot.
2. Print, fit four holders, calibrate each pen's offset.
3. Claude extends the player: one layer per stroke colour, a pick, verify,
   draw, return sequence, light colours first.

**Gate:** a four-colour drawing registers within 0.2 mm between colours;
50 pick-and-park cycles each upright and flat with no miss.

### Phase 7: living with it (ongoing)

- Content: generative drawings, and retraject's own tool paths as
  pictures.
- A playlist page in the browser.
- Watching pens wear out, paper choices, seasonal humidity.

## 5. GPIO and power plan (draft)

| Function | BCM GPIO | Header pin |
|---|---|---|
| M1 STEP / DIR | 17 / 27 | 11 / 13 |
| M2 STEP / DIR | 22 / 23 | 15 / 16 |
| M3 STEP / DIR | 24 / 25 | 18 / 22 |
| Driver enable, shared | 5 (pulled up at boot, plus 10 kΩ to 3V3) | 29 |
| Pen servo | 12 | 32 |
| Home sensors X / Y (hall) | 6 / 16 | 31 / 36 |
| Paper mark sensor (TCRT5000) | 20 | 38 |
| Tilt sensor ADXL345 (I2C) | 2 / 3 | 3 / 5 |
| Pen rack slot sensors (Phase 6) | 19, 26, 21, 13 | 35, 37, 40, 33 |

Power every sensor module (hall sensors, TCRT5000, ADXL345) from the Pi's
3.3 V, never 5 V. A module fed 5 V drives 5 V into the Pi's pins, which
are not 5 V tolerant.

The enable line sits on a GPIO that is pulled up while the Pi boots, so
the drivers stay disabled until the bridge takes over. Step and direction
pins are on GPIOs that are pulled down at boot. The servo uses pigpio's
`gpioServo`, never hardware PWM, which would cancel the running step
waves.

## 6. Shopping by phase

| Phase | Item | Approx. |
|---|---|---|
| 0 | bench kit, both phases (`HARDWARE.md` §8.1) | CHF 107.50 |
| 1A | 2–3 candidate pens, silicone or foam for caps | CHF 15 |
| 1B | catch-free spring roller (or a blind to strip) | CHF 30–40 |
| 1B | 42 cm paper roll (e.g. HP Q1446A, 90 g, 45.7 m) | to price |
| 1B | TCRT5000 module, NEMA17 worm-gear motor | to price |
| 1C | 2 × TMC2209 SilentStepStick (DigiKey) | CHF 28 |
| 2 | PlotteRXY mechanics (V-slot, wheels, belts, pulleys, fasteners, PETG) | ≈ £125 |
| 2 | hall sensors and magnets, SG90 or MG90S servo | CHF 15 |
| 3 | ADXL345 module | to price |
| 5 | wood, mat board, AR glass or acrylic, hinges, magnets, French cleat | to price |
| 5 | 12 V / 3 A supply, 12 → 5 V buck module, LED strip | to price |
| 5 | 1 more TMC2209 | CHF 14 |
| 6 | magnets, steel balls, silicone caps, 4 slot sensors | CHF 20–40 |

"To price" items get priced when their phase starts; prices move.

## 7. Risks and the test that retires each

| Risk | Retired by |
|---|---|
| Pens dry out between drawings | 1A cap test |
| Paper roll drifts or curls | 1B paper rig |
| Too loud for a living room | 1C noise baseline, checked again at the Phase 5 gate |
| Gravity: carriage creeps, pen pressure changes | Phase 3 gate |
| Replay lands off target | Phase 4 gate |
| Pen changer misses or drops pens | Phase 6 gate |

## 8. Open decisions

- **Picture size.** 46 × 33 cm is the default; larger means a heavier,
  bigger frame.
- **Frame material and finish.** Wood is assumed; the look is yours.
- **Glazing.** Glass looks best, acrylic weighs half and doesn't
  shatter.
- **Lighting.** Edge LEDs make the drawing visible at night, but need
  hiding too.
