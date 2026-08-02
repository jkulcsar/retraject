/**
 * Forward kinematics via Denavit–Hartenberg parameters.
 *
 * This is the layer the 1997 project never had: the archived code moved
 * joints, but nothing in it knew where the tool ended up in space. See
 * README.md in this folder for the full story; the short version:
 *
 * The DH convention (1955) attaches a coordinate frame to every link such
 * that exactly FOUR numbers describe the transform from frame i−1 to
 * frame i — a rotation θ about z, a slide d along z, a slide a along the
 * new x, and a twist α about that x:
 *
 *     Aᵢ = RotZ(θᵢ) · TransZ(dᵢ) · TransX(aᵢ) · RotX(αᵢ)
 *
 * For a revolute joint, θ is the variable and (d, a, α) are constants of
 * the mechanism. Multiplying the matrices out gives the classic closed
 * form used in `dhMatrix` below. We use the *standard* (distal) DH
 * convention, as in the classic textbooks (Spong, Siciliano) — not
 * Craig's "modified" DH, which orders the elementary transforms
 * differently; mixing the two is the traditional way to lose a day.
 */
import { Matrix4 } from "three";

/** Constant DH parameters of one link (the joint angle θ is the variable). */
export interface DHLink {
  /** Link length: offset along xᵢ (m). */
  a: number;
  /** Link twist: rotation about xᵢ (rad). */
  alpha: number;
  /** Link offset: displacement along zᵢ₋₁ (m). */
  d: number;
}

/**
 * The homogeneous transform from frame i−1 to frame i, written out as the
 * standard DH matrix (the product RotZ·TransZ·TransX·RotX expanded):
 *
 *     ⎡ cθ  −sθ·cα   sθ·sα   a·cθ ⎤
 *     ⎢ sθ   cθ·cα  −cθ·sα   a·sθ ⎥
 *     ⎢  0    sα      cα       d  ⎥
 *     ⎣  0     0       0       1  ⎦
 *
 * The test suite rebuilds this from the four elementary matrices and
 * checks both constructions agree — the closed form is an optimization,
 * the product is the definition.
 */
export function dhMatrix(link: DHLink, theta: number): Matrix4 {
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const ca = Math.cos(link.alpha);
  const sa = Math.sin(link.alpha);
  // Matrix4.set takes row-major arguments (three.js stores column-major
  // internally; set() exists precisely so humans can write rows).
  return new Matrix4().set(
    ct, -st * ca,  st * sa, link.a * ct,
    st,  ct * ca, -ct * sa, link.a * st,
     0,       sa,       ca, link.d,
     0,        0,        0, 1,
  );
}

/**
 * Forward kinematics: cumulative frames of the chain.
 *
 * Returns n+1 matrices: frames[0] is the base (identity), frames[i] is
 * the pose of frame i in base coordinates (A₁·…·Aᵢ), and frames[n] is the
 * tool flange (TCP). Returning every intermediate frame instead of just
 * the TCP costs nothing and is exactly what the 3D view needs to place
 * link geometry and frame axes.
 */
export function forwardKinematics(links: readonly DHLink[], thetas: readonly number[]): Matrix4[] {
  if (links.length !== thetas.length) {
    throw new RangeError(
      `Chain has ${links.length} links but ${thetas.length} joint angles were given`,
    );
  }
  const frames: Matrix4[] = [new Matrix4()];
  for (let i = 0; i < links.length; i++) {
    frames.push(new Matrix4().multiplyMatrices(frames[i], dhMatrix(links[i], thetas[i])));
  }
  return frames;
}

/** Convenience: position (last column) of a homogeneous transform. */
export function positionOf(m: Matrix4): { x: number; y: number; z: number } {
  const e = m.elements; // column-major: translation lives in elements 12..14
  return { x: e[12], y: e[13], z: e[14] };
}
