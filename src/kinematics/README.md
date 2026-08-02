# The kinematics module — the layer 1997 never had

The archived thesis code moved joints — it planned and executed *joint
space* motion, but nothing in it knew where the tool ended up in the
world. Waypoints were typed in per joint, in motor steps
(see REVIVAL.md §1). This module adds the missing geometric layer:
**forward kinematics** (joint angles → tool pose), on which inverse
kinematics (tool pose → joint angles, the thesis subject proper) will be
built next.

## 1. Denavit–Hartenberg parameters — `dh.ts`

A serial robot is a chain of links connected by joints. To compute where
the end of the chain is, each link needs a coordinate frame and a
transform to the next. The insight of Denavit & Hartenberg (1955) is that
by placing frames cleverly (zᵢ along joint axis i+1, xᵢ along the common
normal), the transform between consecutive frames needs only **four**
numbers instead of six:

| symbol | name | meaning |
|---|---|---|
| θᵢ | joint angle | rotation about zᵢ₋₁ — *the variable*, for a revolute joint |
| dᵢ | link offset | displacement along zᵢ₋₁ |
| aᵢ | link length | displacement along xᵢ |
| αᵢ | link twist | rotation about xᵢ |

```
Aᵢ = RotZ(θᵢ) · TransZ(dᵢ) · TransX(aᵢ) · RotX(αᵢ)
```

`dhMatrix` implements the product in closed form; the pose of frame n in
the base frame is the running product A₁·…·Aₙ (`forwardKinematics`, which
returns *every* intermediate frame — the 3D view needs them all).

**Convention warning, documented because it bites:** this is the
*standard* (distal) DH convention of the classic textbooks (Spong,
Siciliano). Craig's *modified* DH orders the elementary transforms
differently (RotX·TransX·RotZ·TransZ with shifted indices); parameters
from one convention are silently wrong in the other. Every DH table you
import from a datasheet must be checked for which convention it uses.

## 2. The R6 arm — `robot.ts`

The RIP02's geometry isn't recorded in the archive (and it had only three
driven axes), so the revival defines its own six-axis arm:

| i | joint | aᵢ (m) | αᵢ | dᵢ (m) |
|---|---|---|---|---|
| 1 | base yaw | 0 | +90° | 0.35 |
| 2 | shoulder | 0.40 | 0 | 0 |
| 3 | elbow | 0.05 | −90° | 0 |
| 4 | forearm roll | 0 | +90° | 0.35 |
| 5 | wrist pitch | 0 | −90° | 0 |
| 6 | flange roll | 0 | 0 | 0.12 |

The load-bearing design choice is the **spherical wrist**: a₄ = a₅ = 0 and
d₅ = 0 make the axes of joints 4, 5, 6 intersect in one point (the wrist
center = the shared origin of frames 4 and 5). This is *Pieper's
condition*: a 6R arm with three concurrent wrist axes has closed-form
inverse kinematics, because the wrist center's position depends only on
θ₁, θ₂, θ₃ (a RotZ never moves its own origin) while the tool orientation
is absorbed by the wrist. Position and orientation decouple; each
subproblem is solvable in closed form. Nearly every industrial 6-axis arm
is built this way for exactly this reason, and the upcoming IK module
will stand on it — the test suite already verifies the invariance.

## 3. The scene graph IS the kinematic chain — `../scene/robotChain.ts`

The 3D robot is not a model that happens to look like the math — it *is*
the math. Each joint contributes two scene-graph nodes:

```
jointGroup_i        rotation.z = θᵢ                  (the RotZ(θᵢ) factor)
 └─ staticGroup_i   fixed matrix TransZ·TransX·RotX  (the constant remainder)
      └─ jointGroup_i+1 …
```

three.js's world-matrix composition then computes A₁·…·A₆ on its own, and
a test compares every node's `matrixWorld` against `forwardKinematics` to
12 decimal places. Link geometry (cylinders along the d- and a-offsets)
is attached to the same nodes, so what renders is what the matrices say —
there is no second description of the robot that could drift out of sync.

One graphics-only wrinkle lives in `../scene/robotView.ts`: robotics is
z-up, three.js is y-up. A single adapter group rotated −90° about x
converts one into the other, so the mathematics never has to know about
the graphics convention.

## 4. Validation strategy — `kinematics.test.ts`

Forward kinematics bugs are notoriously quiet — a flipped sign produces a
robot that looks almost right. The defense is layered:

1. **Two independent implementations.** The test file contains its own FK:
   plain row-major arrays, the DH transform built as the literal product
   of four elementary matrices (the *definition*), reduced with its own
   multiply. The module's closed-form, three.js-based FK must match it to
   machine precision. Different code, different matrix storage
   conventions, same numbers.
2. **Properties any correct FK must have:** rotation parts orthonormal
   with determinant +1; the wrist center invariant under θ₄, θ₅, θ₆; the
   flange always exactly d₆ from the wrist center; adding φ to θ₁
   rotating the TCP by φ about the base axis; reach never exceeding the
   sum of link translations.
3. **Scene-graph equivalence** (§3) — the rendered robot equals the math.

## 5. Inverse kinematics — `ik.ts`

Forward kinematics is a function; inverse kinematics is an *equation*:
given a desired tool pose T = [R | p], find every θ with FK(θ) = T. For a
general 6R chain no closed form exists — but the spherical wrist (§2) was
chosen precisely so one does. The solution decouples into two halves:

**Position half (θ₁, θ₂, θ₃).** The wrist center is found by walking back
from the TCP along the approach axis: p_w = p − d₆·(R·ẑ). Its position
depends only on the first three joints:

- **θ₁ = atan2(p_wy, p_wx)** — the R6 has no shoulder offset, so the arm
  plane always contains the base axis. The *shoulder-back* branch reaches
  the same point over the other shoulder: θ₁+π with the planar reach r
  negated.
- **θ₂, θ₃** solve a planar two-link problem — with a twist worth
  noticing: the elbow-to-wrist segment is not a simple link but a rigid
  L-piece (a₃ out, then d₄ across). Treating it as one link of length
  L₃ = √(a₃²+d₄²) with a built-in bend ψ = atan2(d₄, a₃) reduces the
  geometry to the textbook 2R arm: the law of cosines gives the elbow
  angle, ± its arccos giving the *elbow-down/up* branches, and
  θ₃ = (bend) − ψ undoes the substitution.

**Orientation half (θ₄, θ₅, θ₆).** With θ₁–θ₃ fixed, R₀₃ is known, and
the wrist must supply R₃₆ = R₀₃ᵀ·R. Multiplying out the wrist's DH
rotations gives RotZ(θ₄)·RotX(90°)·RotZ(θ₅)·RotX(−90°)·RotZ(θ₆), and the
inner conjugation collapses beautifully:

```
RotX(90°)·RotZ(θ₅)·RotX(−90°) = RotY(−θ₅)
```

(rotating the frame, rotating about z, rotating back = rotating about the
image of z, which is −y). So R₃₆ = RotZ(θ₄)·RotY(−θ₅)·RotZ(θ₆) — a ZYZ
Euler decomposition, read off with three atan2 calls, with the ±β pair
giving the *wrist-flip* branches.

2 shoulder × 2 elbow × 2 wrist = **up to eight solutions**, all returned;
`closestSolution` picks per policy (nearest in joint space, joint limits
respected), which is what keeps interactive dragging continuous — the arm
never teleports between branches.

**Singularities** — where solutions stop being isolated:
- *Shoulder*: wrist center on the base axis → θ₁ arbitrary (solver picks
  0 and drops the shoulder pair).
- *Wrist*: θ₅ = 0 aligns axes 4 and 6 → only θ₄+θ₆ is determined (solver
  parks θ₄ = 0 and flags the solution `wristSingular`).
- *Elbow*: the workspace boundary, where down and up coincide.

The decisive test is the **FK∘IK round trip**: every returned solution,
fed back through `forwardKinematics`, must reproduce the target to 1e-9.
One wrong sign anywhere in the derivation breaks it for some branch;
thirty random targets × eight branches leave nowhere to hide.

## 6. Damped least squares — `dls.ts`

The numerical counterpart: knows nothing of the R6's structure, only FK
and its derivatives, which makes it (a) an *independent* check on the
analytic algebra (the tests require both to land on the same branches)
and (b) the general method that survives when closed form does not — DLS
is the workhorse of modern robotics and character animation.

Linearize FK with the geometric Jacobian (column i is the TCP twist per
unit velocity of joint i: [zᵢ₋₁ × (p − pᵢ₋₁); zᵢ₋₁]), then iterate

```
Δθ = Jᵀ (J Jᵀ + λ²I)⁻¹ e
```

with e the 6D pose error. The damping λ² is the interesting part: λ = 0
is the pseudoinverse — fastest, but it explodes where J loses rank. Near
a singularity the damped step stays bounded and simply *slows down* along
the lost direction (error there shrinks by λ²/(σ²+λ²) per iteration).
That graceful degradation is why real controllers damp — and why the test
suite deliberately includes targets whose wrist center passes millimeters
from the base axis. λ = 0.01 was tuned on exactly those: generic poses
converge in ~10 iterations, the near-singular ones in under 50.

## 7. Where it leads

The integration layer that consumes this module — Cartesian waypoints
taught through the IK, planned per segment, played back with synchronized
profile charts — lives in [`../planner/README.md`](../planner/README.md).
