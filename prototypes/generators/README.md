# Picture generators: prototype

The first prototype of the content engine described in
[`LIVING_PICTURE.md`](../../LIVING_PICTURE.md) §5: six generator families
that draw mathematics and physics for the frame's 46 × 33 cm drawing area.
It is plain JavaScript with no dependencies, written to be moved into
`src/generators/` as TypeScript, with tests, later.

| File | What it does |
|---|---|
| `gen.js` | Generators, plus the composer (clip, ink limit, simplify, order, join) and budget statistics. Pure functions, all units in millimetres |
| `present.js` | Formats the statistics for the page |
| `build.mjs` | Builds `living-picture-generators.html`: default pictures baked in as SVG, the generator code inlined so the page computes new variations itself |
| `page.html` | Template for that page |
| `probe.mjs` | Prints time, line length, lifts, coverage and densest spot for every family |
| `sweep.js` | Sweeps: arcs of fluid carried through a vortex flow and drawn as stacked snapshots, with presets, composer and budget, for v1's 350 × 330 mm area |
| `ink.js` | Ink preview: splats lines into a grid and colours it by Beer–Lambert absorption, so stacked lines darken as ink does |
| `render.mjs` | Renders one sweep to PNG with the ink preview and prints its budget |

```sh
node prototypes/generators/probe.mjs      # budget numbers per family
node prototypes/generators/build.mjs      # writes the preview page next to the sources
node prototypes/generators/render.mjs sweep.png '{"seed":5,"symmetric":true}'
```

The families are:
- **Chladni figures:** nodal and contour lines.
- **Flow past a spinning cylinder:** potential flow with circulation.
- **Kármán vortex street:** two periodic vortex rows.
- **Bohmian double slit:** trajectories of two free Gaussian packets, exact evolution, RK4.
- **Harmonograph:** damped sines, one continuous line.
- **Curl-noise flow:** evenly spaced streamlines, Jobard–Lefer.
- **Sweeps** (added after Stoli's wall plotter): a central vortex with a
  rigid core, kinematic-simulation turbulence (random divergence-free
  waves, Kolmogorov spectrum) and an optional breathing ring of satellite
  vortices. Arcs of fluid are carried with RK4, refined where they
  stretch, and drawn 55–70 times each. Six presets: Veils, Pinwheel,
  Folds, Wreath, Rose, Satellites.

What the prototype established (2026-11-08):
- Each family computes in tens of milliseconds in Node or a browser, so a
  Pi 1 needs only seconds.
- Drawing times come out at 5–25 minutes at the plan's speeds.
- Without the ink limiter, Bohmian trajectories put 142 mm of line into
  one 5 mm square at the slits. The limiter caps this at about 45 mm.

What the sweeps prototype established (2026-11-08):
- The look comes from stacking. Radial spokes in a plain vortex wind into
  a solid disc (2.4 km of line); short arcs, seeded at the hole or
  scattered, with turbulence of 50–240 mm wavelengths, give veils.
- A sweep draws 80–210 m of line, about 30–80 minutes at 50 mm/s, and
  computes in 1–11 s here, so minutes on a Pi 1.
- It needs a pressurised ballpoint and its own ink cap: the densest
  5 mm squares reach 280–1,000 mm of line before the cap (300 mm, a
  placeholder until the pen test).
- Previews ship as grey ink density and are coloured in the page, a third
  of the size of colour images.
