import { describe, expect, it } from "vitest";
import { Matrix4 } from "three";
import { dhMatrix, forwardKinematics, positionOf } from "./dh";
import { R6, WRIST_FRAME, homePose } from "./robot";
import { buildRobotChain } from "../scene/robotChain";

/**
 * Validation strategy (see README.md §5 in this folder):
 *
 * 1. An INDEPENDENT forward kinematics lives in this file: plain row-major
 *    number[16] arrays, the DH transform built as the literal product of
 *    four elementary matrices. The module's closed-form dhMatrix and its
 *    three.js-based FK must agree with it to machine precision — two
 *    implementations, two matrix conventions, one answer.
 * 2. Property tests that hold for ANY correct FK of this arm: rotation
 *    orthonormality, the spherical-wrist invariance, the flange offset,
 *    base-joint equivariance, and the reach bound.
 * 3. The scene graph in src/scene/robotChain.ts is compared frame-by-frame
 *    against forwardKinematics — the 3D robot on screen is exactly the
 *    math, or this test fails.
 */

// ---- independent reference implementation (no three.js) -------------------

type M = number[]; // 4×4, row-major

function mul(a: M, b: M): M {
  const c = new Array<number>(16).fill(0);
  for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++)
      for (let col = 0; col < 4; col++) c[r * 4 + col] += a[r * 4 + k] * b[k * 4 + col];
  return c;
}
const I: M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const rotZ = (t: number): M => [Math.cos(t), -Math.sin(t), 0, 0, Math.sin(t), Math.cos(t), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const rotX = (t: number): M => [1, 0, 0, 0, 0, Math.cos(t), -Math.sin(t), 0, 0, Math.sin(t), Math.cos(t), 0, 0, 0, 0, 1];
const transZ = (d: number): M => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, d, 0, 0, 0, 1];
const transX = (a: number): M => [1, 0, 0, a, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** The DH transform by definition: RotZ(θ)·TransZ(d)·TransX(a)·RotX(α). */
function dhReference(a: number, alpha: number, d: number, theta: number): M {
  return mul(mul(mul(rotZ(theta), transZ(d)), transX(a)), rotX(alpha));
}

function fkReference(thetas: readonly number[]): M {
  return R6.joints.reduce(
    (acc, j, i) => mul(acc, dhReference(j.a, j.alpha, j.d, thetas[i])),
    I,
  );
}

/** three.js Matrix4 stores column-major; read entry (row, col). */
const el = (m: Matrix4, row: number, col: number): number => m.elements[col * 4 + row];

function expectMatricesEqual(actual: Matrix4, reference: M, digits = 12): void {
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      expect(el(actual, r, c)).toBeCloseTo(reference[r * 4 + c], digits);
}

/** Deterministic pseudo-random poses inside the joint limits. */
function randomPoses(count: number): number[][] {
  let seed = 0x1997;
  const next = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 2 ** 32);
  return Array.from({ length: count }, () =>
    R6.joints.map((j) => j.min + next() * (j.max - j.min)),
  );
}

// ---- tests ----------------------------------------------------------------

describe("dhMatrix (closed form vs elementary-matrix definition)", () => {
  it("matches RotZ·TransZ·TransX·RotX for a spread of parameters", () => {
    for (const [a, alpha, d, theta] of [
      [0, 0, 0, 0],
      [0.4, Math.PI / 2, 0.35, 0.7],
      [0.05, -Math.PI / 2, 0, -2.1],
      [0.2, Math.PI / 4, -0.1, 3.0],
    ]) {
      expectMatricesEqual(dhMatrix({ a, alpha, d }, theta), dhReference(a, alpha, d, theta));
    }
  });
});

describe("forwardKinematics of the R6 arm", () => {
  const poses = randomPoses(25);

  it("agrees with the independent reference implementation", () => {
    for (const pose of poses) {
      const frames = forwardKinematics(R6.joints, pose);
      expectMatricesEqual(frames[6], fkReference(pose));
    }
  });

  it("produces proper rotations (orthonormal, det = +1)", () => {
    for (const pose of poses) {
      const tcpFrame = forwardKinematics(R6.joints, pose)[6];
      // R·Rᵀ = I …
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++) {
          let dot = 0;
          for (let k = 0; k < 3; k++) dot += el(tcpFrame, r, k) * el(tcpFrame, c, k);
          expect(dot).toBeCloseTo(r === c ? 1 : 0, 12);
        }
      // … and no reflection.
      expect(tcpFrame.determinant()).toBeCloseTo(1, 12);
    }
  });

  it("has a spherical wrist: the wrist center ignores θ4, θ5, θ6", () => {
    // This is Pieper's condition, the property the future closed-form IK
    // will decouple position and orientation on.
    const arm = [0.3, -0.9, 1.1]; // θ1..θ3 fixed
    const reference = positionOf(
      forwardKinematics(R6.joints, [...arm, 0, 0, 0])[WRIST_FRAME],
    );
    for (const wrist of [[1.2, -0.5, 2.0], [-2.8, 1.0, -1.3], [0.4, 0.4, 0.4]]) {
      const p = positionOf(forwardKinematics(R6.joints, [...arm, ...wrist])[WRIST_FRAME]);
      expect(p.x).toBeCloseTo(reference.x, 12);
      expect(p.y).toBeCloseTo(reference.y, 12);
      expect(p.z).toBeCloseTo(reference.z, 12);
    }
  });

  it("keeps the flange exactly d6 from the wrist center in every pose", () => {
    const d6 = R6.joints[5].d;
    for (const pose of poses) {
      const frames = forwardKinematics(R6.joints, pose);
      const wrist = positionOf(frames[WRIST_FRAME]);
      const tcp = positionOf(frames[6]);
      const dist = Math.hypot(tcp.x - wrist.x, tcp.y - wrist.y, tcp.z - wrist.z);
      expect(dist).toBeCloseTo(d6, 12);
    }
  });

  it("is equivariant in the base joint: adding φ to θ1 rotates the TCP about z0", () => {
    const phi = 0.83;
    for (const pose of poses.slice(0, 8)) {
      const p = positionOf(forwardKinematics(R6.joints, pose)[6]);
      const rotatedPose = [pose[0] + phi, ...pose.slice(1)];
      const q = positionOf(forwardKinematics(R6.joints, rotatedPose)[6]);
      expect(q.x).toBeCloseTo(p.x * Math.cos(phi) - p.y * Math.sin(phi), 12);
      expect(q.y).toBeCloseTo(p.x * Math.sin(phi) + p.y * Math.cos(phi), 12);
      expect(q.z).toBeCloseTo(p.z, 12);
    }
  });

  it("never reaches beyond the sum of its link translations", () => {
    const maxReach = R6.joints.reduce((s, j) => s + Math.abs(j.a) + Math.abs(j.d), 0);
    for (const pose of poses) {
      const p = positionOf(forwardKinematics(R6.joints, pose)[6]);
      expect(Math.hypot(p.x, p.y, p.z)).toBeLessThanOrEqual(maxReach + 1e-12);
    }
  });

  it("rejects a pose with the wrong number of angles", () => {
    expect(() => forwardKinematics(R6.joints, [0, 0, 0])).toThrow(RangeError);
  });
});

describe("scene graph = kinematic chain (src/scene/robotChain.ts)", () => {
  it("the TCP node's world matrix equals the FK result, frame by frame", () => {
    const chain = buildRobotChain(R6);
    for (const pose of [homePose(R6), ...randomPoses(5)]) {
      chain.setPose(pose);
      chain.root.updateMatrixWorld(true);
      const frames = forwardKinematics(R6.joints, pose);
      // Every frame helper sits at its DH frame…
      chain.frameHelpers.forEach((helper, i) => {
        for (let r = 0; r < 4; r++)
          for (let c = 0; c < 4; c++)
            expect(el(helper.matrixWorld, r, c)).toBeCloseTo(el(frames[i], r, c), 12);
      });
      // …and the TCP node at the final one.
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++)
          expect(el(chain.tcp.matrixWorld, r, c)).toBeCloseTo(el(frames[6], r, c), 12);
    }
  });
});
