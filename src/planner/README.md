# The planner module — closing the 1997 loop

This is the integration layer: it takes what the other two modules provide
— trajectory laws from `src/trajectory`, poses from `src/kinematics` — and
assembles them into the thing the thesis was actually about: a robot
executing a programmed multi-waypoint motion. It is deliberately the
*smallest* module in the project, because if the layers below are designed
right, integration should be almost nothing. It is.

## 1. Heritage: the 1997 data model

The original architecture already had this shape (legacy/JOINT.H): a
`Robot` held `Joint`s, and each Joint held an **array** of trajectories —
`m_ppTrajectory`, one per waypoint pair, `m_uiNrOfTrajectories =
points − 1` — while `Robot::SetUpTime` walked the segments equalizing
every joint's time per segment. `planPath` is that exact loop, expressed
over the modern primitives:

```
for each segment k:  synchronizeMoves(all joints, waypoint k → k+1, law k)
times = cumulative sum of segment durations
```

The result is a `PlannedPath`: a 2D array of Segments
(`segments[k][j]` = joint j's synchronized segment k) plus a timeline.
`evaluatePath(path, t)` finds the segment window containing t and
evaluates every joint at local time — the playback loop and the chart
sampler both stand on this one function.

## 2. Joint space in, Cartesian above

Waypoints arrive in **joint space**. Cartesian teaching lives a layer up:
the explorer poses the robot with the IK gizmo, and "add waypoint"
captures the *joint* pose the solver produced. This is precisely the
division of labor of an industrial teach pendant — the operator thinks in
Cartesian, the program stores joint values — and it is why this module
imports nothing from `src/kinematics`: by the time a waypoint exists, the
kinematics has already spoken. (The pipeline test still exercises the
whole chain end-to-end: Cartesian targets → branch-continuous IK →
planned path → replayed FK landing back on the taught poses.)

## 3. Rest-to-rest, faithfully

Every law in `src/trajectory` starts and ends at zero velocity, so the
robot **stops at every waypoint** — exactly as the 1997 system did, since
its Joints concatenated independent rest-to-rest trajectories. The
classic refinement is via-point *blending* (parabolic blends or spline
knots that pass near waypoints without stopping); it is deliberately out
of scope here because it changes the trajectory laws themselves, not the
planner — the honest place for it is a future extension of
`src/trajectory`, listed in §5.

## 4. What the tests prove — `path.test.ts`

- **Timeline algebra**: one synchronized group per waypoint pair, shared
  duration dictated by the slowest joint, cumulative times summing to the
  total, waypoints hit exactly (position to 1e-9, velocity zero) at their
  boundary instants, clamping outside the timeline.
- **Heterogeneous laws** per segment, and degenerate (zero-length)
  segments tolerated.
- **The Phase-4 pipeline**: four Cartesian poses taught through the
  analytic IK with `closestSolution` continuity, planned with mixed laws,
  then replayed — at every waypoint time the forward kinematics of the
  evaluated joint states lands back on the taught Cartesian position, and
  the sampled motion respects every joint's velocity limit throughout.

## 5. Cartesian line moves — `cartesian.ts`

The joint-space planner above makes straight lines in *joint* space,
which are arcs in the workspace. `planLineMove` is the industrial "MoveL":
the TOOL POSE is interpolated — position on the straight segment,
orientation by quaternion slerp, one trajectory law's shape easing both —
and the analytic IK runs at every sample with branch continuity (the
previous sample seeds `closestSolution`). The joint motion is whatever
the line demands; it has no closed form, which is why the result is a
dense sample table and derivatives come from finite differences.

The educational sting is that a straight line is not free, and the module
reports the three ways it fails, each with the fraction of the line where
it happened: the line exits the workspace (`out-of-reach`), demands
configurations beyond the joints (`joint-limits`), or grazes a
singularity where adjacent IK solutions jump (`configuration-jump`).
That is exactly what a real controller's "cannot execute linear motion"
message means. Tests assert the whole contract in task space, through
forward kinematics of the produced samples: TCP colinear to 1e-9,
shape-faithful slerp, Cartesian speed limit held, no branch teleports.

## 6. The flourishes, delivered

The three extensions once listed here as future work now exist: via-point
blending in [`../trajectory/README.md`](../trajectory/README.md) §7
(LSPB — the robot no longer stops at vias), Cartesian line moves above,
and the virtual-stepper homage in
[`../stepper/README.md`](../stepper/README.md) — the 1997 TCA pulse
quantization, graphically rendered for the first time, DOS console
included.
