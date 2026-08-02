# retraject

**1997, revisited in 2026.** A modern reimplementation of *Traject* — my
bachelor-thesis robot trajectory planner — as an interactive web application:
the algorithms in TypeScript, and a three.js scene animating a six-jointed
robot in sync with the computed axis motions.

The name is *re-* + *traject(ory)*: a revival of the DOS-era project, and the
act of re-tracing its trajectories.

## The two halves

| | |
|---|---|
| [`legacy/`](legacy/) | The unmodified 1997 sources (Borland C++, MS-DOS): five joint-space interpolation laws, cross-joint time synchronization, stepper-pulse quantization, and an interrupt-driven executor that drove a real 3-axis robot over the parallel port. Kept byte-identical as the reference oracle. |
| `src/` | The 2026 implementation: the same trajectory mathematics ported to strict TypeScript with tests, plus what the original never had — forward and inverse kinematics for a 6R arm and a live 3D visualization. |

[`REVIVAL.md`](REVIVAL.md) is the bridge between them: a full analysis of the
archived code, what ports and what must be written fresh, and the phased plan
this repository follows.

## Status

- [x] Phase 0 — repository setup: legacy snapshot, feasibility study, TypeScript/Vite scaffold
- [ ] Phase 1 — port the five trajectory laws + λ-synchronization, with tests and profile charts
- [ ] Phase 2 — robot model (URDF), forward kinematics, three.js scene
- [ ] Phase 3 — inverse kinematics: analytic spherical-wrist solver + damped-least-squares
- [ ] Phase 4 — integration: waypoints, per-segment law selection, synchronized 3D + chart playback
- [ ] Phase 5 — flourishes: virtual-stepper emulation, Cartesian line moves, angle-stream export

## Development

```sh
npm install
npm run dev     # Vite dev server
npm test        # Vitest
npm run build   # production build
```
