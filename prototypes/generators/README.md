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

```sh
node prototypes/generators/probe.mjs      # budget numbers per family
node prototypes/generators/build.mjs      # writes the preview page next to the sources
```

The families are:
- **Chladni figures:** nodal and contour lines.
- **Flow past a spinning cylinder:** potential flow with circulation.
- **Kármán vortex street:** two periodic vortex rows.
- **Bohmian double slit:** trajectories of two free Gaussian packets, exact evolution, RK4.
- **Harmonograph:** damped sines, one continuous line.
- **Curl-noise flow:** evenly spaced streamlines, Jobard–Lefer.

What the prototype established (2026-11-08):
- Each family computes in tens of milliseconds in Node or a browser, so a
  Pi 1 needs only seconds.
- Drawing times come out at 5–25 minutes at the plan's speeds.
- Without the ink limiter, Bohmian trajectories put 142 mm of line into
  one 5 mm square at the slits. The limiter caps this at about 45 mm.
