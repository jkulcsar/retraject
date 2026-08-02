import { describe, expect, it } from "vitest";
import { forwardKinematics } from "./dh";
import { R6, homePose } from "./robot";
import { dhEvaluator } from "./dls";
import {
  eigenSymmetric3,
  geometricJacobian,
  manipulability6,
  translationalManipulability,
} from "./jacobian";

/**
 * The Jacobian's gold-standard check is finite differences of the forward
 * kinematics: column i must equal the TCP's motion under an infinitesimal
 * change of joint i — position rows directly, orientation rows via the
 * skew-symmetric part of Ṙ·Rᵀ. The eigensolver is checked against its own
 * definition (A·v = λ·v, orthonormal V), and manipulability against the
 * determinant identity w² = det(JᵥJᵥᵀ).
 */

function randomPoses(count: number): number[][] {
  let seed = 0x0345;
  const next = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 2 ** 32);
  return Array.from({ length: count }, () =>
    R6.joints.map((j) => j.min + next() * (j.max - j.min)),
  );
}

const evalR6 = dhEvaluator(R6);

function jacobianAt(angles: number[]): number[][] {
  const pose = evalR6(angles);
  const e = pose.tcp.elements;
  return geometricJacobian(pose.joints, [e[12], e[13], e[14]]);
}

describe("geometricJacobian", () => {
  it("matches finite differences of the forward kinematics, all six rows", () => {
    const h = 1e-6;
    for (const pose of randomPoses(10)) {
      const J = jacobianAt(pose);
      for (let i = 0; i < 6; i++) {
        const plus = forwardKinematics(R6.joints, pose.map((t, k) => (k === i ? t + h : t)))[6];
        const minus = forwardKinematics(R6.joints, pose.map((t, k) => (k === i ? t - h : t)))[6];
        // Position rows: central difference of the translation.
        for (let r = 0; r < 3; r++) {
          const fd = (plus.elements[12 + r] - minus.elements[12 + r]) / (2 * h);
          expect(Math.abs(J[r][i] - fd)).toBeLessThan(1e-6);
        }
        // Orientation rows: ω from the skew part of ΔR·Rᵀ.
        const R = forwardKinematics(R6.joints, pose)[6];
        const dR = Array.from({ length: 3 }, (_, r) =>
          Array.from({ length: 3 }, (_, c) => {
            const idx = c * 4 + r;
            return (plus.elements[idx] - minus.elements[idx]) / (2 * h);
          }),
        );
        const Rm = Array.from({ length: 3 }, (_, r) =>
          Array.from({ length: 3 }, (_, c) => R.elements[c * 4 + r]),
        );
        const W = Array.from({ length: 3 }, (_, r) =>
          Array.from({ length: 3 }, (_, c) => dR[r][0] * Rm[c][0] + dR[r][1] * Rm[c][1] + dR[r][2] * Rm[c][2]),
        );
        const omega = [(W[2][1] - W[1][2]) / 2, (W[0][2] - W[2][0]) / 2, (W[1][0] - W[0][1]) / 2];
        for (let r = 0; r < 3; r++) {
          expect(Math.abs(J[3 + r][i] - omega[r])).toBeLessThan(1e-6);
        }
      }
    }
  });
});

describe("eigenSymmetric3", () => {
  it("satisfies A·v = λ·v with orthonormal vectors, values sorted descending", () => {
    let seed = 42;
    const next = () => ((seed = (seed * 48271) % 2147483647), seed / 2147483647 - 0.5);
    for (let trial = 0; trial < 20; trial++) {
      const B = Array.from({ length: 3 }, () => Array.from({ length: 3 }, next));
      // A = BᵀB is symmetric positive semi-definite.
      const A = Array.from({ length: 3 }, (_, r) =>
        Array.from({ length: 3 }, (_, c) => B[0][r] * B[0][c] + B[1][r] * B[1][c] + B[2][r] * B[2][c]),
      );
      const { values, vectors } = eigenSymmetric3(A);
      expect(values[0]).toBeGreaterThanOrEqual(values[1]);
      expect(values[1]).toBeGreaterThanOrEqual(values[2]);
      for (let k = 0; k < 3; k++) {
        const v = vectors[k];
        for (let r = 0; r < 3; r++) {
          const av = A[r][0] * v[0] + A[r][1] * v[1] + A[r][2] * v[2];
          expect(av).toBeCloseTo(values[k] * v[r], 9);
        }
        for (let j = k; j < 3; j++) {
          const dot = v[0] * vectors[j][0] + v[1] * vectors[j][1] + v[2] * vectors[j][2];
          expect(dot).toBeCloseTo(k === j ? 1 : 0, 9);
        }
      }
    }
  });
});

describe("translationalManipulability", () => {
  it("its measure equals sqrt(det(Jv·Jvᵀ))", () => {
    for (const pose of randomPoses(8)) {
      const J = jacobianAt(pose);
      const m = translationalManipulability(J);
      const A = Array.from({ length: 3 }, (_, r) =>
        Array.from({ length: 3 }, (_, c) => {
          let s = 0;
          for (let k = 0; k < 6; k++) s += J[r][k] * J[c][k];
          return s;
        }),
      );
      const det =
        A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
        A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
        A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
      expect(m.measure).toBeCloseTo(Math.sqrt(Math.max(0, det)), 9);
      expect(m.radii[0]).toBeGreaterThanOrEqual(m.radii[2]);
    }
  });

  it("the TRANSLATIONAL ellipsoid does NOT collapse at the elbow singularity (the wrist still translates the tool)", () => {
    // This is the finding that shaped the API: translational capability
    // survives the arm singularity via the flange lever; only the full
    // 6D measure sees the rank loss. Assert the survival explicitly.
    const psi = Math.atan2(R6.joints[3].d, R6.joints[2].a);
    const straight = [0, 0.9, -psi, 0.3, 0.5, 0];
    const wSing = translationalManipulability(jacobianAt(straight)).measure;
    const wHome = translationalManipulability(jacobianAt(homePose(R6))).measure;
    expect(wSing).toBeGreaterThan(wHome / 5);
  });
});

describe("manipulability6 (full 6D measure)", () => {
  const wAt = (pose: number[]) => manipulability6(jacobianAt(pose));

  it("plunges at the elbow-straight singularity", () => {
    const psi = Math.atan2(R6.joints[3].d, R6.joints[2].a);
    expect(wAt([0, 0.9, -psi, 0.3, 0.5, 0])).toBeLessThan(wAt(homePose(R6)) / 1e4);
  });

  it("plunges at the wrist singularity (θ5 = 0 aligns axes 4 and 6)", () => {
    expect(wAt([0.3, 0.9, -0.7, 0.4, 0, 0.2])).toBeLessThan(wAt(homePose(R6)) / 1e4);
  });

  it("is healthy at generic poses", () => {
    for (const pose of randomPoses(5)) {
      expect(wAt(pose)).toBeGreaterThan(0);
    }
  });
});
