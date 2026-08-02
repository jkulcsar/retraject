# The trajectory module — mathematics and design decisions

This folder is the 2026 port of the 1997 trajectory-generation core
(`legacy/TRAJECT.*`, `legacy/{LINEAR,THIRD,FIFTH,BANGBANG,TRAPEZ}.CPP`,
and the synchronization half of `legacy/ROBOT.CPP`). This document explains
the mathematics the code implements and every decision where the port
diverges from its ancestor. It is written to be read next to the sources —
each section names the files it describes.

## 1. The problem

A robot joint must move from position q₀ to q₁. Two physical limits
constrain it: a maximum velocity v_max and a maximum acceleration a_max
(the 1997 code calls them KV and KA). A *trajectory law* decides how the
motion is distributed over time — dash off immediately or ease in and out —
and the planner must answer two questions: *what is the fastest the move
can be done?* and *what does the motion look like at any instant?*

## 2. The core abstraction: the normalized shape r(τ) — `law.ts`

Every law here is a function

```
r : [0,1] → [0,1],    r(0) = 0,    r(1) = 1
```

giving the *fraction of the move completed* at *normalized time*
τ = t/T. The actual motion follows by pure scaling (chain rule), with
D = q₁ − q₀ the signed distance:

```
q(t) = q₀ + D·r(τ)      position
v(t) = (D/T)·r′(τ)      velocity      — one factor of 1/T per derivative
a(t) = (D/T²)·r″(τ)     acceleration
```

**Why this is the central design decision of the port.** The 1997 design
gave every law three virtual methods (`m_ComputePosition`, `m_ComputeSpeed`,
`m_ComputeAcceleration`) — fifteen sampling loops that differed only in the
polynomial inside. Factoring out r(τ) leaves each law as *pure math* (a few
lines in `laws/*.ts`) and one generic evaluator (`evaluateSegment` in
`segment.ts`). It also makes two properties fall out for free:

- **Time-scaling.** Executing the same shape over a longer T divides all
  velocities by T and accelerations by T². Stretch a feasible trajectory
  and it stays feasible. The 1997 code implemented this per law as the λ
  ("lambda") factor — e.g. `legacy/FIFTH.CPP m_ComputeLambda` scales KA by
  λ = (T_min/T)²; here it is just the 1/T and 1/T² in the formulas.
- **Direction-independence.** All sign handling lives in D. The laws never
  see direction (the 1997 `m_uiDirection`/`SGN(D())` bookkeeping is gone).

## 3. The five laws — `laws/*.ts`

Each law is defined by its shape and characterized by two numbers: the peak
of r′ (how fast it must go mid-move to average out to the distance) and the
peak of |r″|. Larger peaks mean a *less* efficient use of the limits — the
smoother the law, the longer the minimum time.

| Law | r(τ) | peak r′ | peak \|r″\| | Character |
|---|---|---|---|---|
| Linear (`linear.ts`) | τ | 1 | 0 (∞ at ends) | Constant velocity; velocity *steps* at both ends — physically unrealizable at the boundaries, kept as the baseline |
| Cubic (`cubic.ts`) | 3τ² − 2τ³ | 3/2 | 6 | Smoothstep: starts/ends at rest, but acceleration steps at the ends |
| Quintic (`quintic.ts`) | 10τ³ − 15τ⁴ + 6τ⁵ | 15/8 | 10/√3 | Minimum-jerk: velocity *and* acceleration are zero at the ends; the smoothest, and the slowest at equal limits |
| Bang-bang (`bangBang.ts`) | 2τ² ∕ mirrored | 2 | 4 | Full accel, then full brake: time-optimal under an acceleration limit alone; infinite jerk at the switch |
| Trapezoidal (`trapezoidal.ts`) | piecewise, see below | 1/(1−f) | 1/(f(1−f)) | Ramp–cruise–ramp: the industrial standard; most efficient use of *both* limits |

**Deriving a minimum duration** (every `minimumDuration` in `laws/` follows
this template): the velocity constraint requires
(|D|/T)·r′max ≤ v_max → T ≥ r′max·|D|/v_max; the acceleration constraint
(|D|/T²)·|r″|max ≤ a_max → T ≥ √(|r″|max·|D|/a_max). Take the larger.
For example the quintic: T_min = max( 15|D|/(8·v_max), √(10|D|/(√3·a_max)) ) —
compare `legacy/FIFTH.CPP m_ComputeTrajectoryTime`, which is this exact
expression. The test suite pins all five to their 1997 closed forms
("golden formulas" in `trajectory.test.ts`).

**The trapezoid's extra parameter.** The polynomial laws have one fixed
shape; the trapezoid's proportions depend on the move. We reduce it to a
single number f = t_ramp/T ∈ (0, ½]. Normalization (the area under r′ must
be 1) forces the cruise height to p = 1/(1−f); the three pieces are then
determined (see the derivation in `trapezoidal.ts`). At minimum time,
f = v_max²/(v_max² + a_max·|D|); as |D| grows, f → 0 (all cruise), and at
the boundary |D| = v_max²/a_max, f = ½ — the cruise vanishes and the
trapezoid *is* the bang-bang triangle. A test asserts that identity.

### 3.1 Verification of the 1997 formulas (August 2026)

The golden tests prove the port matches 1997; two further checks prove 1997
itself was right:

**Independent numeric re-derivation.** Taking only the shape definitions
and extracting peak |r′| and |r″| by dense numerical differentiation
reproduces every constant the legacy closed forms imply: 1 (linear),
3/2 and 6 (cubic), 15/8 and 10/√3 ≈ 5.7735027 (quintic, peak at
τ = (3±√3)/6), 2 and 4 (bang-bang); the trapezoid's T = KV/KA + |D|/KV
re-derives exactly from ramp-distance kinematics.

**Today's literature.** The cubic peak matches the worked example in
Clemson's open robotics textbook (v_peak = 3D/2T). The quintic is the
classic **"3-4-5 polynomial"** of cam and servo-drive design — the
standard derivation f(z) = 6z⁵ − 15z⁴ + 10z³ is this law verbatim — and is
also the minimum-jerk trajectory (every minimum-jerk point-to-point motion
is a 5th-order polynomial). The trapezoidal three-phase timing with
triangular fallback is the industry-standard point-to-point profile
(e.g. MATLAB's `trapveltraj`, PMD's motion-profile mathematics). Sources:
[Clemson open textbook — Trajectory Generation](https://opentextbooks.clemson.edu/wangrobotics/chapter/trajectory-generation/),
[Nolte — Motion Laws for Cam Gears and Servo Drives](https://nolte-nc-kurventechnik.hier-im-netz.de/en/motion-laws.html),
[MechDesigner — Polynomial 3-4-5 Motion-Law](http://mechdesigner.support/mt-motion-law-polynomial345.htm),
[PMD — Mathematics of Motion Control Profiles](https://www.pmdcorp.com/resources/type/articles/get/mathematics-of-motion-control-profiles-article),
[MathWorks — Trapezoidal Velocity Profile Trajectory](https://www.mathworks.com/help/robotics/ug/design-a-trajectory-with-velocity-limits-using-a-trapezoidal-velocity-profile.html).

## 4. Synchronization — `synchronize.ts`

A coordinated robot motion needs every joint to start and finish together.
Each joint has its own minimum time; since trajectories can be stretched
but never compressed, the only common duration is the *maximum of the
minimums*. `synchronizeMoves` computes it and plans every joint with it —
that is the whole algorithm, and it is correct *because* of the
time-scaling property of §2: a stretched joint's velocities shrink by
T_min/T and accelerations by (T_min/T)², so its limits still hold.

This one function replaces `Robot::SetUpTime` (`legacy/ROBOT.CPP`) *plus*
all five per-law `m_ComputeLambda` implementations. The interactive
explorer's **synchronize** toggle exists to make this visible: switch it on
and the fast joints' velocity curves flatten while their position curves
keep their shape.

## 5. Departures from 1997 — deliberate, and documented

| What | 1997 behavior | Port behavior | Why |
|---|---|---|---|
| Short trapezoid moves | `legacy/TRAPEZ.CPP` returns T = 0 and all-zero profiles when \|D\| ≤ KV²/KA | Triangular profile (= bang-bang), T = 2√(\|D\|/a_max) | The 1997 code left the no-cruise case unhandled; the triangular profile is its correct limit |
| Stretching a trapezoid | Rescales KA via a bespoke λ = (T_min−τ)/(T−τ) while keeping KV | Shape-preserving dilation: f frozen, both v and a scale down | Uniform with every other law under the r(τ) abstraction; simpler to reason about. Alternative (keep a_max, shrink ramps) noted in `trapezoidal.ts` as a possible refinement |
| Sampling | `time += step` float accumulation; `m_ComputeDivisions` has an integer-division unit bug that clamps every segment to 20 samples | Closed-form t = i·T/n, caller-chosen n | Accumulation drifts one rounding error per step; the unit bug made the sample count meaningless |
| `SPLINE.CPP` | A byte-identical copy of `FIFTH.CPP` under another name | Not ported | One quintic is enough; the duplication was almost certainly a historical accident |
| Direction | Tracked explicitly (`FORWARD`/`BACKWARD`, `SGN(D())` branches) | Signed D throughout | The sign algebra does the bookkeeping for free |
| Class hierarchy | `Trajectory` base + 5 subclasses × 3 virtual compute methods | 5 shape definitions + 1 generic evaluator | See §2 |
| Continuous vs sampled | Profiles baked into arrays at plan time | Segments stay continuous functions; sampling is a separate concern (`sampleSegment`) | The renderer asks at 60 Hz, tests ask anywhere; arrays would fix a resolution prematurely |

One 1997 detail survives on purpose: `sampleSegment` produces **n + 1**
values for n intervals — the fence-post fact behind the legacy comment
`m_uiNrOfValues = m_uiDivisions + 1; // Why? Please read Project Notes!`
(`legacy/TRAJECT.CPP`). The project notes are lost; the answer was
fence-posts.

## 6. Testing strategy — `trajectory.test.ts`

Five test families, each proving a different kind of correctness:

1. **Shape invariants** — r(0)=0, r(1)=1, monotonicity, midpoint symmetry,
   rest at the ends (per law), zero end-acceleration (quintic only). These
   are the *defining* properties; a law failing one is not that law.
2. **Derivative cross-check** — r′ and r″ are compared against central
   differences of r. Boundary tests can't catch a wrong middle coefficient;
   numerical differentiation catches any algebra slip anywhere.
3. **Golden formulas** — minimum durations pinned to the 1997 closed forms,
   with the legacy file cited in the test name. This is the contract that
   the port *is* a port.
4. **Feasibility and minimality** — at T_min, densely sampled profiles must
   stay within limits **and** touch at least one limit (else T_min wouldn't
   be minimal). Run in both regimes: long move (velocity-limited) and short
   move (acceleration-limited).
5. **Time-scaling and synchronization** — doubling T halves v and quarters
   a; synchronized joints share one duration, the slowest runs at its own
   minimum, and every stretched joint still respects its own limits.

## 7. Units

The module is unit-agnostic by design: positions, velocities and
accelerations just have to be *consistent* (degrees, deg/s, deg/s² — or
steps, as in 1997, when the stepper-emulation layer arrives). No unit
conversions happen anywhere in this module; that is also why the 1997
divisions bug (µs vs timer-tick confusion) has no modern counterpart to
hide in.
