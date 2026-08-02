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

## 5. Next

Inverse kinematics: the analytic spherical-wrist solution (decompose at
the wrist center, solve θ₁–θ₃ from position geometry, extract θ₄–θ₆ from
the residual orientation, enumerate the elbow-up/down and wrist-flip
branches), plus a damped-least-squares numerical solver as the
general-purpose fallback and cross-check.
