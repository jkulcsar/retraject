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
| [`src/trajectory/README.md`](src/trajectory/README.md) | The trajectory mathematics: the normalized-shape abstraction, all five interpolation laws with their minimum-time derivations (verified against today's literature in §3.1), multi-joint synchronization, every deliberate departure from the 1997 code, and the testing strategy |
| [`src/kinematics/README.md`](src/kinematics/README.md) | The layer 1997 never had: Denavit–Hartenberg parameters, the R6 arm and its spherical wrist, the scene-graph-equals-math design of the 3D robot, the analytic inverse kinematics with its eight branches and singularities, and the damped-least-squares solver that cross-checks it |
| [`src/planner/README.md`](src/planner/README.md) | The integration layer closing the 1997 loop: multi-segment path planning over the trajectory primitives (the modern `Robot::SetUpTime`), teach-pendant Cartesian programming through the IK, rest-to-rest fidelity, and the end-to-end pipeline test |

The core arc of the revival is **complete**: trajectory laws, forward and
inverse kinematics, and multi-segment path playback are built and tested
(97 tests), all live in the explorers. What remains on the roadmap in
[`REVIVAL.md`](REVIVAL.md) §4 are the flourishes — via-point blending,
Cartesian-line moves, the virtual-stepper homage.

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

## The kinematics explorer

`npm run dev` then open `/robot.html`: the R6 six-axis arm in three.js,
drivable both ways — joint sliders (forward kinematics) or a draggable
target gizmo (inverse kinematics, solved analytically on every frame of
the drag). Pin one of the eight IK branches to see shoulder/elbow/wrist
alternatives; a red target means unreachable and the robot holds. Toggle
**show frames** for the Denavit–Hartenberg triads.

Then program it like a teach pendant: pose, **add waypoint**, pick a law
per segment, **play path** — the robot replays the synchronized motion
while a time cursor sweeps the six-joint profile charts below the scene
(**sample path** or `/robot.html?demo=path` loads a canned three-segment
tour whose middle segment is trapezoidal — you can see its velocity
plateau between the quintic bells). This screen is the 1997 thesis,
complete: pose → plan → profiles → motion.

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
