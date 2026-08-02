/**
 * Analytic inverse kinematics for the R6 arm — the heart of the revival.
 *
 * Given a desired tool pose T = [R | p], find all joint-angle vectors that
 * reach it. Closed form exists because the R6 has a spherical wrist
 * (Pieper's condition, see robot.ts): the wrist-center position depends
 * only on θ₁θ₂θ₃, the residual orientation only on θ₄θ₅θ₆, so a 6D
 * problem decouples into two 3D ones. The full derivation with diagrams
 * is in README.md §5; the steps are:
 *
 *   1. Wrist center:  p_w = p − d₆·(R·ẑ)  — walk back from the TCP along
 *      the approach axis.
 *   2. θ₁ = atan2(p_wy, p_wx)  (plus the "shoulder-back" branch θ₁+π).
 *   3. θ₂, θ₃: in the arm plane this is a two-link problem with links a₂
 *      and L₃ = √(a₃²+d₄²) — the elbow-to-wrist segment is rigid with a
 *      built-in bend ψ = atan2(d₄, a₃), so the law of cosines gives the
 *      elbow angle (± → elbow-down/up branches).
 *   4. θ₄, θ₅, θ₆: R₃₆ = R₀₃ᵀ·R reduces — via the conjugation identity
 *      RotX(90°)·RotZ(θ₅)·RotX(−90°) = RotY(−θ₅) — to the Euler-like
 *      product RotZ(θ₄)·RotY(−θ₅)·RotZ(θ₆), read off with atan2
 *      (± → wrist-flip branches).
 *
 * 2 × 2 × 2 = up to eight solutions. Every solution returned is exact:
 * the test suite feeds each one back through forwardKinematics and
 * requires the original pose to 1e-9 — the FK∘IK round trip is the
 * contract of this module.
 */
import { Matrix4 } from "three";
import { forwardKinematics } from "./dh";
import type { RobotModel } from "./robot";

export interface IKBranch {
  shoulder: "front" | "back";
  elbow: "down" | "up";
  wrist: "noflip" | "flip";
}

export interface IKSolution {
  /** Joint angles, wrapped to (−π, π]. */
  angles: number[];
  branch: IKBranch;
  /** True when every angle respects the model's joint limits. */
  withinLimits: boolean;
  /** True when θ₅ ≈ 0 aligned axes 4 and 6 (wrist singularity): θ₄ was
   * chosen by convention (0) and only θ₄+θ₆ is geometrically meaningful. */
  wristSingular: boolean;
}

const EPS = 1e-9;
/** Sin(θ₅) below this counts as the wrist singularity. */
const WRIST_SING_EPS = 1e-7;

/** Wrap an angle to (−π, π]. */
export function wrapAngle(theta: number): number {
  let t = theta % (2 * Math.PI);
  if (t <= -Math.PI) t += 2 * Math.PI;
  if (t > Math.PI) t -= 2 * Math.PI;
  return t;
}

/** Entry (row, col) of a column-major three.js Matrix4. */
const el = (m: Matrix4, row: number, col: number): number => m.elements[col * 4 + row];

/**
 * The solver is closed-form *for this structure*; refuse anything else
 * loudly rather than return garbage. (A general 6R has no closed form —
 * that is what dls.ts is for.)
 */
function structuralConstants(robot: RobotModel) {
  const j = robot.joints;
  const near = (v: number, w: number) => Math.abs(v - w) < EPS;
  const ok =
    j.length === 6 &&
    near(j[0].a, 0) &&
    near(j[1].d, 0) &&
    near(j[2].d, 0) &&
    near(j[3].a, 0) &&
    near(j[4].a, 0) &&
    near(j[4].d, 0) &&
    near(j[1].alpha, 0) &&
    near(j[0].alpha, Math.PI / 2) &&
    near(j[2].alpha, -Math.PI / 2) &&
    near(j[3].alpha, Math.PI / 2) &&
    near(j[4].alpha, -Math.PI / 2) &&
    near(j[5].alpha, 0) &&
    near(j[5].a, 0);
  if (!ok) {
    throw new Error(
      `solveSphericalWrist is specific to the R6 structure ` +
        `(spherical wrist, planar arm); '${robot.name}' does not match`,
    );
  }
  return { d1: j[0].d, a2: j[1].a, a3: j[2].a, d4: j[3].d, d6: j[5].d };
}

/**
 * All inverse-kinematic solutions for the target TCP pose (a homogeneous
 * transform in base coordinates). Unreachable targets return []. Branches
 * outside joint limits are returned too (flagged) — which solutions are
 * *usable* is the caller's policy, which ones *exist* is geometry.
 */
export function solveSphericalWrist(robot: RobotModel, target: Matrix4): IKSolution[] {
  const { d1, a2, a3, d4, d6 } = structuralConstants(robot);

  // 1. Wrist center: back off d6 along the approach axis (R·ẑ).
  const px = el(target, 0, 3) - d6 * el(target, 0, 2);
  const py = el(target, 1, 3) - d6 * el(target, 1, 2);
  const pz = el(target, 2, 3) - d6 * el(target, 2, 2);

  const rho = Math.hypot(px, py);
  // Shoulder singularity: wrist center on the base axis → θ₁ is arbitrary
  // (every value works); we fix θ₁=0 and lose the shoulder branch pair.
  const shoulderSingular = rho < EPS;
  const theta1Front = shoulderSingular ? 0 : Math.atan2(py, px);

  const L3 = Math.hypot(a3, d4); // rigid elbow→wrist segment…
  const psi = Math.atan2(d4, a3); // …with its built-in bend

  const h = pz - d1;
  const solutions: IKSolution[] = [];

  for (const shoulder of ["front", "back"] as const) {
    if (shoulder === "back" && shoulderSingular) continue;
    // The "back" branch looks at the wrist center over the other shoulder:
    // θ₁ rotates by π and the planar reach r flips sign.
    const theta1 = shoulder === "front" ? theta1Front : wrapAngle(theta1Front + Math.PI);
    const r = shoulder === "front" ? rho : -rho;

    // 2-link geometry in the (r, h) arm plane: a₂ then L₃.
    const cosElbow = (r * r + h * h - a2 * a2 - L3 * L3) / (2 * a2 * L3);
    if (cosElbow > 1 + 1e-12 || cosElbow < -1 - 1e-12) continue; // out of reach
    const gamma = Math.acos(Math.min(1, Math.max(-1, cosElbow)));

    for (const elbow of ["down", "up"] as const) {
      const bend = elbow === "down" ? gamma : -gamma; // = θ₃ + ψ
      const theta3 = wrapAngle(bend - psi);
      const theta2 = wrapAngle(
        Math.atan2(h, r) - Math.atan2(L3 * Math.sin(bend), a2 + L3 * Math.cos(bend)),
      );

      // 4. Residual wrist rotation R₃₆ = R₀₃ᵀ·R = RotZ(θ₄)·RotY(−θ₅)·RotZ(θ₆).
      const r03 = forwardKinematics(robot.joints.slice(0, 3), [theta1, theta2, theta3])[3];
      const m = new Matrix4()
        .extractRotation(r03)
        .transpose()
        .multiply(new Matrix4().extractRotation(target));

      const m13 = el(m, 0, 2);
      const m23 = el(m, 1, 2);
      const m33 = el(m, 2, 2);
      const sinBeta = Math.hypot(m13, m23);

      if (sinBeta < WRIST_SING_EPS) {
        // Wrist singularity: axes 4 and 6 aligned; only the sum (θ₅=0)
        // or difference (θ₅=π) of θ₄, θ₆ is determined. Convention: θ₄=0.
        const theta5 = m33 > 0 ? 0 : Math.PI;
        const theta6 = wrapAngle(Math.atan2(el(m, 1, 0), el(m, 1, 1)));
        pushSolution(solutions, robot, [theta1, theta2, theta3, 0, theta5, theta6], {
          shoulder,
          elbow,
          wrist: "noflip",
        }, true);
        continue; // the flip branch collapses onto this one
      }

      for (const wrist of ["noflip", "flip"] as const) {
        // β = ±atan2(sinβ, m33); θ₅ = −β. See README §5 for the element map.
        const sign = wrist === "noflip" ? 1 : -1;
        const theta5 = wrapAngle(-sign * Math.atan2(sinBeta, m33));
        const theta4 = Math.atan2(sign * m23, sign * m13);
        const theta6 = Math.atan2(sign * el(m, 2, 1), -sign * el(m, 2, 0));
        pushSolution(solutions, robot, [theta1, theta2, theta3, theta4, theta5, theta6], {
          shoulder,
          elbow,
          wrist,
        }, false);
      }
    }
  }
  return solutions;
}

function pushSolution(
  out: IKSolution[],
  robot: RobotModel,
  angles: number[],
  branch: IKBranch,
  wristSingular: boolean,
): void {
  const wrapped = angles.map(wrapAngle);
  const withinLimits = wrapped.every(
    (t, i) => t >= robot.joints[i].min - EPS && t <= robot.joints[i].max + EPS,
  );
  out.push({ angles: wrapped, branch, withinLimits, wristSingular });
}

/**
 * Pick the solution closest to a reference pose (sum of squared wrapped
 * joint differences, all joints weighted equally). Solutions within joint
 * limits win over out-of-limit ones regardless of distance — reachable in
 * theory but not by this robot is still unusable. Returns null for [].
 *
 * This is what makes interactive dragging feel continuous: re-solving
 * from scratch every frame, the branch that tracks the current pose wins,
 * so the arm never teleports between elbow-up and elbow-down.
 */
export function closestSolution(
  solutions: readonly IKSolution[],
  reference: readonly number[],
): IKSolution | null {
  const usable = solutions.filter((s) => s.withinLimits);
  const pool = usable.length > 0 ? usable : solutions;
  let best: IKSolution | null = null;
  let bestDist = Infinity;
  for (const s of pool) {
    const dist = s.angles.reduce((acc, t, i) => {
      const d = wrapAngle(t - reference[i]);
      return acc + d * d;
    }, 0);
    if (dist < bestDist) {
      bestDist = dist;
      best = s;
    }
  }
  return best;
}
