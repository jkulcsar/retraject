# Traject Revival — Feasibility Study and Modernization Plan

*Written August 2026, based on a full read of the archived sources (~6,000 lines). Those sources live unmodified in [`legacy/`](legacy/); all file names below refer to that folder.*

**Goal:** resurrect the 1997 bachelor-thesis trajectory planner with modern technology — algorithms in TypeScript, and a three.js UI showing a six-jointed robot animated in sync with the computed axis motions. The value is educational and serves as an inverse-kinematics refresher with potential application in current work.

## 1. What the archived code contains

The architecture is a clean three-level hierarchy:

```
Robot  (N joints, M waypoints, global timing)          ROBOT.CPP/H
 └── Joint  (M−1 segments, stepper quantization)       JOINT.CPP/H
      └── Trajectory  (abstract base class)            TRAJECT.CPP/H
           ├── Linear     r(τ) = τ                     LINEAR.CPP
           ├── Third      r(τ) = 3τ² − 2τ³             THIRD.CPP
           ├── Fifth      r(τ) = 10τ³ − 15τ⁴ + 6τ⁵     FIFTH.CPP  (SPLINE.CPP is an identical copy)
           ├── BangBang   ±constant max acceleration   BANGBANG.CPP
           └── Trapez     trapezoidal velocity profile TRAPEZ.CPP
```

Four layers, with very different fates in a modern port:

1. **Interpolation laws** (~1,000 lines). Each law computes its minimal feasible segment time from max speed `KV` and max acceleration `KA` (e.g. quintic: `T = max(15|D|/8KV, √(10|D|/(√3·KA)))`), then samples position/velocity/acceleration arrays. Textbook-correct joint-space trajectory generation. **Fully portable.**

2. **Cross-joint synchronization** (`Robot::SetUpTime` + each law's `m_ComputeLambda`). For every segment, all joints are stretched to the slowest joint's time; each law rescales itself with a λ factor (velocity-limited laws scale `KV` by λ, acceleration-limited laws scale `KA` by λ²). This coordinated-motion logic is the most valuable surviving idea. **Fully portable.**

3. **Stepper quantization and real-time execution** (`Joint::ComputeTCA`, `Robot::Command`). Position samples become "time constant arrays" — inter-pulse countdown values with accumulated-step error correction — executed by hooking INT 08h, reprogramming the 8253 timer, and pulsing step/direction bits to the 3-axis RIP02 robot over LPT1. `Robot::FindOutQuantum` even self-calibrates by measuring its own interrupt-handler execution time against the hardware clock. **Not portable, and not needed** — the browser render loop replaces the ISR — but worth preserving as an optional "virtual stepper" emulation mode.

4. **GUI** (`MAIN.CPP`, `XVIEW.H`, `MAINFACE.CPP`). Built on *XView-PC* (A.C.M. de Queiroz, UFRJ, 1992–94), a DOS clone of Sun's XView toolkit over Borland BGI/EGAVGA. Unrestorable, and the GUI main was never finished (`Compute()` is stubbed; `MAIN_OLD.CPP` is the working console version). **Total rewrite, zero loss.**

### Key finding: the inverse kinematics is not in the archive

There is no IK in the surviving code — no trigonometry, no Denavit–Hartenberg matrices, no Cartesian coordinates anywhere. Waypoints are entered directly per joint, in joint space (motor steps). Whatever IK derivation the thesis contained exists only on paper. This does not hurt the revival: the IK layer becomes a fresh build rather than a port, which is exactly the refresher goal.

### Port caveats (fix, don't replicate)

- `Trajectory::m_ComputeDivisions` has an integer-division unit bug (`quantum / 1193180` truncates to zero), so every segment effectively always clamped to 20 samples.
- `Trapez` returns all-zero profiles when the move is too short to reach cruise speed — the triangular-profile case is unhandled.
- `Joint::ComputeTCA` uses flat indexing that assumes every segment has the same number of divisions.
- Sampling accumulates `time += step` in `float`; a rewrite should compute `t = i·T/N` directly.

All trivial to fix in a clean rewrite backed by tests.

## 2. Feasibility verdict

**Highly feasible, well-scoped for a hobby project.**

- The portable core is ~1,500 lines of self-contained float math with no I/O dependencies; it shrinks to roughly 500–800 lines of clean TypeScript and is ideal unit-test material (closed-form laws with known analytic derivatives).
- The two things the 1997 hardware fought hardest for — real-time pulse timing and graphics — are free in 2026. A browser renders a full 3D scene at 60+ fps; analytic 6R IK solves in microseconds.
- The genuinely new work (FK/IK for a six-jointed arm) is a known, bounded problem with excellent literature.
- Everything runs client-side; the deliverable is a static site.

The only real risk is scope creep in UI and robot-model polish, mitigated by the phasing in §4.

Rough effort split: ~20% porting the trajectory laws with tests, ~30% kinematics (FK, analytic IK, numerical fallback), ~30% three.js scene and robot model, ~20% UI/state/chart glue.

## 3. Technology stack

| Layer | Choice | Rationale / alternatives |
|---|---|---|
| Language | **TypeScript, strict mode** | The math is small — WASM/Rust would be overkill (the original ran on a 386). Types pay off in kinematics code: branded types for joint-space vs Cartesian vectors prevent a whole bug class |
| Build | **Vite** | Zero-config, instant HMR |
| 3D engine | **three.js** | Mature, and the robotics-web ecosystem targets it. Babylon.js is the credible alternative but has less robotics tooling |
| Robot model | **URDF via `urdf-loader`** (NASA JPL) | Load a real 6R robot description (UR5e, KUKA iiwa, ABB IRB — public URDFs with meshes exist) instead of hand-modeling. Correct link frames and joint limits for free; FK can be validated against the loader's articulation. Fallback: a stylized RIP02 tribute from three.js primitives |
| Kinematics | **Hand-rolled** (that is the point) | FK: DH parameters or product of exponentials using three.js `Matrix4`/`Quaternion`. IK: analytic closed-form for a spherical-wrist 6R (Pieper's method, 8 solution branches) plus a damped-least-squares Jacobian solver (~60 lines) for comparison. Existing JS IK libraries are FABRIK-style character-animation tools — wrong for industrial arms |
| UI | **(a)** vanilla TS + **Tweakpane**, or **(b)** React + react-three-fiber + drei | Start with (a) — least friction, closest in spirit to the original; adopt (b) if the control surface grows (waypoint tables, per-segment law selection) |
| Charts | **uPlot** | Tiny and fast; live-scrubbing position/velocity/acceleration plots synchronized with the 3D animation — the heir of the BGI `Trajectory::Show()` |
| Interaction | three.js `TransformControls` | Drag a TCP target gizmo; IK follows in real time |
| Testing | **Vitest** | Boundary conditions per law (r(0)=0, r(1)=1, v(0)=v(T)=0, max-accel at analytic locations); round-trip FK∘IK ≡ identity across the workspace |
| Deployment | Static (GitHub Pages / Netlify) | No backend, ever |

## 4. Phasing

1. **Port the math** — the five laws plus λ-synchronization as pure functions, Vitest suite, uPlot profile viewer. This alone resurrects the verifiable heart of the thesis.
2. **Forward kinematics + scene** — URDF robot in three.js, joint sliders, own FK validated against the model.
3. **Inverse kinematics** — analytic spherical-wrist solver with branch selection (elbow up/down, wrist flip), then the DLS numerical solver; drag-the-gizmo demo, singularity visualization.
4. **Integration** — Cartesian and joint-space waypoint lists, per-segment law choice, synchronized playback: the robot animating while a cursor sweeps the profile charts. The "1997 thesis, but real" milestone.
5. **Optional flourishes** — virtual-stepper TCA emulation showing discretization error (homage to the LPT1 code), straight-line Cartesian moves with IK per sample, joint-angle stream export.

## 5. Relevance beyond nostalgia

The interpolation laws written in 1997 (trapezoidal, quintic/S-curve) are what industrial motion controllers and ROS trajectory planners still use, and λ time-synchronization is the same idea as modern time-optimal path parameterization. The Jacobian/DLS solver added in Phase 3 is the standard tool in current robotics and character-animation stacks — the piece most likely to transfer directly into present-day work.
