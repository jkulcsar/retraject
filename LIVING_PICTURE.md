# Living picture — the build plan

*Phase 3 of [`HARDWARE.md`](HARDWARE.md) ("the rig") made concrete. A pen
plotter in a box with a glass front. It hangs on a wall or lies on a
desk, draws a new picture every few hours, keeps every drawing on a paper
roll, and later rolls them back into view one by one. When it isn't
drawing, all you see is the picture. The trajectory mathematics of 1997,
leaving a trace on the wall.*

This is a slow build: many weekends, one phase at a time. Every phase
ends with a **gate**, a test that has to pass before the next phase
starts, and the risky parts are tested on the bench before anything is
built around them.

**Two versions.**
- **v1 (this plan)** lives in a bought box: an IKEA BESTÅ shelf with a
  GLASSVIK glass door. It is the cheapest and quickest way to prove the
  whole living cycle, with a picture of about 35 × 33 cm.
- **v2** comes once v1 works: a frame of its own, built on the plotter's
  aluminium frame, for a 46 × 33 cm landscape picture. Its design is
  kept below, ready.

## 1. What we are building

| | |
|---|---|
| Mechanism | CoreXY on V-slot extrusion, after [PlotteRXY](https://github.com/jamescarruthers/PlotteRXY) |
| Picture | v1: about 35 × 33 cm; v2: 46 × 33 cm landscape. Both drawn on a 42 cm paper roll |
| Box | v1: IKEA BESTÅ shelf with GLASSVIK door, 60 × 64 × 22 cm, about 16 kg with the mechanism. v2: own frame, about 76 × 57 × 11 cm, 8–9 kg |
| Drive | the bench Pi (§2 of `HARDWARE.md`), pigpio waveforms, 3 stepper drivers |
| Motors | M1, M2: CoreXY. M3: paper take-up. Pen lift: a servo |
| Colours | one pen first, a capped pen rack with 4–6 colours later |
| Operation | schedules stored on the Pi and played on a timer; no cloud, no browser at run time |

Layers, front to back: glazing, mat (passe-partout), the CoreXY
mechanism, paper, backing board. At rest, the gantry, carriage and pen rack park
behind the mat border; the Pi and drivers sit behind the backing board.

## 2. Decisions already made, and why

| Decision | Why |
|---|---|
| CoreXY, after PlotteRXY | Rigid, both motors fixed; the only researched design with a priced BOM, a size formula and squaring and belt-tension steps |
| Gantry beam vertical when hanging | The beam's weight rests on the bottom rail's wheels; the belts only hold the light pen carriage |
| v1 box: IKEA BESTÅ shelf with GLASSVIK door | CHF 108 plus a CHF 10 wall rail. One door of clear safety glass in an aluminium frame, so no glass work; about 18 cm deep inside. The quickest way to prove the living cycle; its smaller picture is v2's job |
| v1: plotter turned inside the box | Turning the plotter rather than the box gives about 35 × 33 cm instead of 30 × 40, and keeps the gantry beam vertical; the door stays hinged at the side |
| Servo pen lift on a spring-loaded holder | Keeps the carriage light and frees M3 for the paper; the spring sets pen pressure in any orientation |
| Paper: catch-free spring supply roll, worm-geared take-up | The spring keeps tension and rewinds; the worm gear holds when unpowered, because a plain NEMA17 is back-driven by the spring |
| Replay found by margin marks | Step counts alone drift (slip, humidity, a changing roll diameter); a pigment bar read by a TCRT5000 sensor gives a fixed reference |
| TMC2209 drivers in the frame | Every quiet build in the research uses Trinamic drivers; they fit the same carrier boards in step/dir mode |
| Schedules stored on the Pi | Two commercial wall robots (Scribit, iBoardbot) stopped working when their makers' servers went down |
| Pen rack that caps the pens | Pens dry out between drawings; HP's 1979 pen changer (US 4,135,245) both swapped and capped pens |
| v2: box built on the plotter's aluminium frame, thin panels | The extrusion ring is already a stiff frame of the right size; panels screw into its slots, saving a separate box and about 2 kg |
| v2: acrylic only for the glazing | It is denser than plywood, so it saves nothing as panels; as glazing it saves about 1 kg over glass and cannot shatter |

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
2. Make pigpio's daemon a system service on the Pi that starts at boot
   (the bridge's `install.sh` does this).
3. **Done:** Claude wrote the bridge, [`pi/bridge/`](pi/bridge/): a
   Python service on the system Python (plus apt's `python3-websockets`),
   WebSocket in, padded pigpio waves out, with `ACK`, `ESTOP`, a
   stop-on-disconnect, and a `DONE` report that carries per-axis step
   counts. On the Pi: `sh install.sh`, then `bench_waves.py --pigpio`
   (can a Pi 1 build waves fast enough?) and `send_move.py`.
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

**1A, pen test** (start first; the cap part runs by itself for three days):
1. Buy 2–3 candidate fineliners (Staedtler pigment liner 308, Staedtler
   triplus 334, a Sakura Micron) and a pressurised ballpoint, the Uni
   PowerTank that Stoli draws with. A pressurised ballpoint writes on a
   vertical sheet and does not dry out uncapped, so it may need no cap.
2. Print simple caps with a silicone or closed-cell foam insert
   (Claude provides the OpenSCAD model).
3. Cap the fineliners pointing sideways, as on the wall, for 72 hours;
   leave the ballpoint uncapped; then draw.
4. Stack test, by hand with a ruler on the candidate paper: patches of
   1, 2, 4, 8 and 16 coverings of parallel lines about 1 mm apart. Note
   where each pen soaks, pills or tears the paper. This sets the ink cap
   per pen and paper, which decides how dark the sweeps (§5) may get.

**Gate:** at least one pen starts a clean line on the first stroke after
72 hours, and the stack test gives an ink cap for that pen.

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

1. Buy the BESTÅ box first and measure its inside (about 56 cm wide and
   60 cm high, empty, without the glass shelf). In v1 the box sets the
   plotter's size:
   - Apply PlotteRXY's rule (X rail = drawing length + 260 mm, Y rail =
     drawing width + 200 mm) with the X axis vertical, so the gantry beam
     hangs vertical.
   - That gives a drawing area of about 35 × 33 cm, with a little
     clearance to the box.
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

**Gate:** a full-size drawing; a square drawn ten times on top of itself
shows one line, under 0.3 mm spread.

### Phase 3: upright (1–2 weekends)

1. Mount the plotter in the BESTÅ box and stand it upright, gantry beam
   vertical. Claude designs printed brackets that fix the rails to the
   box's sides and back.
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

### Phase 5: the v1 enclosure, IKEA BESTÅ (1–2 weekends)

The plotter already sits in the box since Phase 3. This phase turns the
box into a picture.

1. **Mat:** have a framer cut a mat to the GLASSVIK door's opening, with
   a window of about 35 × 33 cm. Its borders (about 10–13 cm) cover
   exactly the space the motors, the parked gantry and later the pen rack
   need. A black mat matches the black door frame; white is the classic.
2. Hold the mat behind the glass on magnets, so it lifts off when the
   door opens for pens and paper.
3. **Power:** one 12 V supply of at least 3 A for everything, with a
   12 → 5 V buck module for the Pi and servo. The bench supply's 1.5 A is
   too tight for motors, Pi and servo together. One cable leaves through
   a hole in the back.
4. Mount the Pi and drivers on the back panel inside, with one connector
   per motor and sensor.
5. Fit the TMC2209s in place of the DRV8825s.
6. Hide everything:
   - only a flat three-wire ribbon moves, to the servo;
   - light, if any, comes from the top and bottom edges only, so the
     gantry casts no shadow.
7. Wall: the BESTÅ wall rail, screwed into proper wall plugs. With the
   mechanism the box weighs about 16 kg (the empty shelf and door are
   about 11 kg). Desk: lay it on its back on felt pads.

**Gate:**
- At rest, nothing technical is visible from the front.
- A full live cycle runs on the wall.
- Noise at 1 m is at or below the Phase 1C TMC2209 baseline.
- Pens and a paper roll can be changed through the door in under five
  minutes.

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

- Content: the generator engine (§5) grows new families. It is pure
  software, so it can grow at any time, independently of the hardware
  phases.
- A playlist page in the browser.
- Watching pens wear out, paper choices, seasonal humidity.

### v2: the own frame (after v1 works, 4–6 weekends)

Once the living cycle runs in v1, v2 gives the full 46 × 33 cm landscape
picture. The plotter is rebuilt or extended to that size, and the box is
built **on** its aluminium frame rather than around it. The CoreXY's 2040
rectangle is already a stiff ring the size of the picture frame (about
76 × 57 cm), so thin panels screw straight into its slots with M5 T-nuts.
No separate box, no joinery, no glue, and about 2 kg lighter than a
classic box.

**Structure, front to back:**

| Part | Material | Fixed to |
|---|---|---|
| Front door: bezel, glazing, mat | slim wood or aluminium moulding; 3 mm anti-reflective acrylic; mat board | hinges on the left, magnets on the right |
| Side panels (4), about 110 mm deep | 4 mm poplar plywood, or 3 mm aluminium composite | the extrusion's outer slots at the front; printed corner brackets at the back |
| Backing board | 5 mm aluminium composite or plywood, rounded top and bottom edges | standoffs from the extrusion, set to the pen's reach |
| Paper rolls | supply above, take-up below the backing board | drop-in brackets on the side extrusions, reachable through the front door |
| Electronics plate | 4 mm plywood | standoffs behind the backing board |
| Back panel | 4 mm poplar plywood with ventilation slots and one cable exit | the corner brackets; removable with 8 screws |
| French cleat | 18 mm hardwood batten cut at 45° | bolted through the back panel to the top extrusion, never to the plywood alone |

**Weight budget (estimates from material densities):**

| Part | kg |
|---|---|
| Extrusion frame (about 2.5 m of 2040 plus the 2020 beam) | 2.3 |
| Three motors | 0.85 |
| Carriage, wheels, belts, printed parts | 0.6 |
| Paper rolls and spring roller | 0.6 |
| Backing board | 0.3–1.0 |
| Pi, drivers, wiring | 0.3 |
| Panels and bezel | 1.2–1.8 |
| Glazing: 3 mm acrylic (or 2.5 mm glass) | 1.5 (2.6) |
| **Total** | **≈ 8–9 (9.5 with glass)** |

A classic box of 12 mm solid wood would add about 2 kg. Acrylic panels
would not save weight either: acrylic is denser than plywood (3 mm
acrylic ≈ 3.6 kg/m², 4 mm poplar plywood ≈ 1.8 kg/m²), bendier at the
same thickness, cracks at screws, attracts dust, and clear sides would
show the mechanism. Acrylic belongs only in the glazing, where it saves
about 1 kg over glass and cannot shatter.

**Requirements the design must meet:**
- Pens and paper are reached through the front door, without tools and
  without taking the frame off the wall.
- The cleat hangs from the aluminium frame, so the plywood never carries
  the weight.
- The mat clears the parked gantry by a few millimetres; nothing touches
  the drawn side of the paper.
- One power cord leaves the box; ventilation slots at the top and bottom
  of the back.
- The same box works lying on its back on a desk.

**Steps:**
1. Freeze the dimensions from the finished plotter: the extrusion ring,
   the gantry's front clearance, the pen's reach to the paper, and the
   space the rolls and electronics need behind the backing board.
2. Claude draws the enclosure:
   - panel outlines with every hole, as DXF files for laser cutting;
   - the mat window, about 44 × 31 cm, which leaves 13–16 cm borders to
     hide the parked parts;
   - standoff positions;
   - the printed parts: back corner brackets, roll brackets, hinge
     blocks, cable guides.
3. Order:
   - laser-cut panels (poplar plywood, or aluminium composite from a sign
     maker);
   - the mat, cut by a framer;
   - anti-reflective acrylic cut to size;
   - the bezel moulding, or have the framer build the door frame;
   - hinges, neodymium magnets, felt tape;
   - M5 standoffs, T-nuts and screws;
   - the cleat batten.
4. Move the electronics onto their plate behind the backing board, with
   one connector per motor and sensor, so the back panel and the door
   come off without rewiring.
5. Fit the side panels to the extrusion ring, then the printed back
   corner brackets.
6. Fit the back panel. Run the single power cord out through a strain
   relief, and line the inside of the panels with thin felt to damp
   resonance.
7. Assemble the door: acrylic and mat in the bezel, a felt gasket at the
   back. Hang it on the left, add magnets on the right, and check the
   clearance to the parked gantry.
8. Power: one 12 V supply of at least 3 A for everything, with a
   12 → 5 V buck module for the Pi and servo. The bench supply's 1.5 A is
   too tight for motors, Pi and servo together.
9. Move the electronics and the TMC2209 drivers over from v1.
10. Hide everything:
    - only a flat three-wire ribbon moves, to the servo;
    - light, if any, comes from the top and bottom edges only, so the
      gantry casts no shadow.
11. Wall: a matching cleat into studs or proper wall plugs, and a felt
    spacer at the bottom. Desk: four rubber feet on the back panel, at
    the standoff points.

**Gate:**
- At rest, nothing technical is visible from the front.
- A full live cycle runs on the wall.
- Noise at 1 m is at or below the Phase 1C TMC2209 baseline.
- Pens and a paper roll can be changed through the door in under five
  minutes.

## 5. The content engine

Without uploads, the frame still has something to draw: an engine that
generates pictures from mathematics and physics, sized to the frame.
Uploaded SVG or DXF drawings join the same queue and pass through the
same steps.

**Pipeline:** generator → composer → path order → budget check →
planner → player.
- **Generators** draw *for* the frame. They receive the drawing area
  (about 35 × 33 cm in v1, 46 × 33 cm in v2) and its margins, and return polylines in millimetres.
  Each is a pure function of its parameters and a seed, so every picture
  can be reproduced, and each is logged.
- **The composer** clips to the drawing area and simplifies lines (about
  0.1 mm). It joins ends that nearly touch (0.15–0.5 mm), and controls
  density through each generator's spacing parameter: a line spacing of
  roughly 1.5–4 mm for a 0.3 mm pen.
- **Path order:** nearest-neighbour ordering with reversal, to cut
  pen-up travel.
- **Budget check:** pen-down length, pen-up travel and the number of pen
  lifts give an estimated drawing time (pen down 50 mm/s, pen up
  200 mm/s, 0.24 s per lift). A picture is thinned or regenerated if:
  - its drawing time exceeds its family's budget (about 40 minutes for
    the fineliner families; sweeps are planned as drawings of an hour or
    more);
  - it leaves large areas empty;
  - it piles up ink in one spot.

  An ink limiter keeps every 5 mm square under a cap, breaking a line
  where it would overfill a square: about 45 mm of line for a fineliner,
  and for the ballpoint whatever the 1A stack test allows (the sweeps
  prototype uses 300 mm as a placeholder). The prototype showed it is
  needed: Bohmian trajectories crowd at the slits, and a harmonograph's
  fading centre gets heavy. Good fineliner pictures took 5–25 minutes.
- **Planner and player** are unchanged; the engine only produces paths.

**Families**, all drawn as lines: streamlines, contour lines, nodal lines
and trajectories, which is what a pen draws best.

| Family | Mathematics | A natural series for one roll |
|---|---|---|
| Chladni figures | nodal and contour lines of cos(nπx)·cos(mπy) − cos(mπx)·cos(nπy) | the mode pairs (n, m), climbing |
| Flow past a spinning cylinder | streamlines ψ = U·y·(1 − a²/r²) + (Γ/2π)·ln(r/a) | circulation Γ from 0 to 4πUa: symmetric flow becomes lift |
| Kármán vortex street | streamlines of two staggered vortex rows, h/l ≈ 0.281 | background flow, or time steps |
| Bohmian double slit | trajectories dq/dt = Im(∂ψ/∂q ÷ ψ) of two free Gaussian packets (exact solution) | slit separation, or packet width |
| Harmonograph | damped sums of sines: one continuous line | frequency ratio and detuning |
| Curl-noise flow | evenly spaced streamlines (Jobard–Lefer) of a divergence-free noise field | noise seed or scale |
| Sweeps | arcs of fluid carried by RK4 through a vortex with kinematic-simulation turbulence (Kolmogorov spectrum), optionally a breathing ring of satellite vortices; each arc drawn every few steps | the seed, or the turbulence strength |
| Retraject's own | taught tool paths, fields of manipulability ellipses | one taught program, step by step |

**Sweeps, after Stoli.** Stoli's drawings get their depth from stacking,
not from a richer formula: one line drawn hundreds of times, each copy
moved a little by a slowly changing flow. The stack reads as a
translucent veil, darker where copies bunch up, with a dark crease and a
crosshatch where the veil folds. Three things follow for the build:
- **The pen.** It takes a pressurised ballpoint, as Stoli uses; a
  fineliner would soak the paper. The 1A pen test now covers it.
- **The budget.** A sweep draws 80–210 m of line, about 30–80 minutes;
  richer ones run for hours. The frame computes the next picture while
  the current one hangs.
- **Compute.** The prototype computes a sweep in 1–11 s on a Mac, so
  minutes on a Pi 1. Computing longer buys more sheets and finer flow.

**Series and the roll.**
- A curator picks a family and a parameter sweep for each roll, so the
  10–20 pictures on it form a series, not a random sequence.
- Gallery mode then plays the roll back like a slow flip-book, one frame
  every few hours.
- It avoids repeating a family on consecutive rolls.

**Signature.** Each picture can carry a small caption in the margin,
drawn with a single-stroke Hershey font (fonts made for plotters):
family, parameters, seed and date.

**Code, and where it runs.** Generators are written in TypeScript as pure
functions. The browser can preview exactly what the frame will draw,
and the same code can later run headless. Where it runs headless is an
open decision (§9).

## 6. GPIO and power plan (draft)

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

## 7. Shopping by phase

| Phase | Item | Approx. |
|---|---|---|
| 0 | bench kit, both phases (`HARDWARE.md` §8.1) | CHF 107.50 |
| 1A | 2–3 candidate fineliners, a Uni PowerTank pressurised ballpoint, silicone or foam for caps | CHF 25 |
| 1B | catch-free spring roller (or a blind to strip) | CHF 30–40 |
| 1B | 42 cm paper roll (e.g. HP Q1446A, 90 g, 45.7 m) | to price |
| 1B | TCRT5000 module, NEMA17 worm-gear motor | to price |
| 1C | 2 × TMC2209 SilentStepStick (DigiKey) | CHF 28 |
| 2 | IKEA BESTÅ shelf with GLASSVIK door, plus wall rail, bought first: it sets the plotter's size | CHF 118 |
| 2 | PlotteRXY mechanics (V-slot, wheels, belts, pulleys, fasteners, PETG), sized to the box | ≈ £100–125 |
| 2 | hall sensors and magnets, SG90 or MG90S servo | CHF 15 |
| 3 | ADXL345 module | to price |
| 5 | mat cut by a framer, magnets, felt pads | to price |
| 5 | 12 V / 3 A supply, 12 → 5 V buck module, LED strip | to price |
| 5 | 1 more TMC2209 | CHF 14 |
| 6 | magnets, steel balls, silicone caps, 4 slot sensors | CHF 20–40 |
| v2 | laser-cut panels, mat board, AR acrylic, bezel moulding, hinges, magnets, M5 standoffs and T-nuts, cleat batten, longer extrusions | to price |

"To price" items get priced when their phase starts; prices move.

## 8. Risks and the test that retires each

| Risk | Retired by |
|---|---|
| Pens dry out between drawings | 1A pen test (caps; or a pressurised ballpoint) |
| Stacked lines soak or pill the paper | 1A stack test, which sets the ink cap |
| Paper roll drifts or curls | 1B paper rig |
| Too loud for a living room | 1C noise baseline, checked again at the Phase 5 gate |
| Gravity: carriage creeps, pen pressure changes | Phase 3 gate |
| Replay lands off target | Phase 4 gate |
| Pen changer misses or drops pens | Phase 6 gate |

## 9. Open decisions

- **Picture size.** v1 is set by the BESTÅ box: about 35 × 33 cm. v2:
  46 × 33 cm by default; larger means a heavier, bigger frame.
- **Mat colour (v1).** Black matches the GLASSVIK door frame; white is
  the classic gallery look.
- **Panels and finish (v2).** Poplar plywood (lightest, paintable or
  veneered) or aluminium composite (a modern, flat look, cut by a sign
  maker). The look is yours.
- **Glazing (v2).** Anti-reflective acrylic is the default; glass looks a
  little crisper but weighs about 1 kg more and can shatter.
- **Lighting.** Edge LEDs make the drawing visible at night, but need
  hiding too.
- **How the content engine runs on the Pi 1 without a browser (§5).**
  The Pi 1 is the preferred host. The prototype generators take tens of
  milliseconds each in a browser, so a couple of seconds on a Pi 1,
  against 5–25 minutes of drawing. Two routes:
  - Port the generators and the planner to Python. The maths modules
    were written to be portable.
  - Run the TypeScript code under Node.js, if a build for the Pi 1's
    ARMv6 processor still runs.

  A newer Pi inside the frame stays a fallback only.
