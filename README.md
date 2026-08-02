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

## Documentation trail

This project is educational on purpose, and the documentation is written to
be read *next to the code it explains* — every module carries its own
document; this list is the map:

| Document | What it teaches |
|---|---|
| [`REVIVAL.md`](REVIVAL.md) | The founding study: what the 1997 code contains, what ports and what must be written fresh, the technology choices, and the overall roadmap (§4) |
| [`legacy/README.md`](legacy/README.md) | Provenance of the 1997 snapshot |
| [`src/trajectory/README.md`](src/trajectory/README.md) | The trajectory mathematics: the normalized-shape abstraction, all five interpolation laws with their minimum-time derivations, multi-joint synchronization, every deliberate departure from the 1997 code, and the testing strategy |

So far the trajectory core is ported and tested (68 tests), with an
interactive profile explorer to play with it; forward/inverse kinematics
and the three.js robot are next — see the roadmap in
[`REVIVAL.md`](REVIVAL.md) §4.

## The profile explorer

`npm run dev` opens an interactive playground: three joints, five
interpolation laws, live position/velocity/acceleration charts. Things
worth trying:

- Toggle **synchronize** — the fast joints' velocity curves flatten (the
  λ time-scaling at work) while their position curves keep their shape.
- Give a joint a short move on the **Trapezoidal** law — the cruise phase
  vanishes and the profile degrades into the bang-bang triangle.
- Compare **Quintic** against **Bang-bang** at equal limits — smoothness
  is bought with time.

## Development

```sh
npm install
npm run dev     # Vite dev server
npm test        # Vitest
npm run build   # production build
```

## AI assistance

This project has been possible thanks to AI collaboration. The analysis of the
1997 legacy sources, the feasibility study ([`REVIVAL.md`](REVIVAL.md)), the
repository setup, and parts of the implementation and documentation are
produced with [Claude Code](https://claude.com/claude-code) running Anthropic's
**Claude Fable 5** model (`claude-fable-5`), beginning August 2026. Later
phases may use newer Claude models; this section will be kept up to date.
Direction, review, and final decisions are human.

This note is the project-wide attribution — individual commits are not
separately signed.
