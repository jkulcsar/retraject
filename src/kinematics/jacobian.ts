/**
 * Geometric Jacobian and manipulability — deliberately written in plain
 * number arrays with NO three.js (or any) dependency: this module is
 * designed for lift-and-port to other languages (C#, Rust). Everything
 * here is loops, cross products, and a 3×3 Jacobi eigensolver.
 *
 * The geometric Jacobian J (6×n) maps joint velocities to the tool twist:
 * column i of a revolute joint is [ zᵢ×(p−oᵢ) ; zᵢ ] where zᵢ is the
 * joint's world axis, oᵢ a point on it, p the TCP. It is THE object of
 * modern robot control — DLS inverse kinematics iterates on it, and
 * manipulability analysis reads the robot's instantaneous capability
 * from it.
 *
 * The VELOCITY ELLIPSOID makes that capability visible: push unit joint
 * speed ‖q̇‖=1 in every direction and the TCP velocities Jᵥq̇ trace an
 * ellipsoid whose semi-axes are the singular values of Jᵥ (obtained here
 * as eigenpairs of the 3×3 JᵥJᵥᵀ). Near a singularity one axis collapses:
 * the flat direction IS the direction the robot is losing. Yoshikawa's
 * manipulability measure w = √det(JᵥJᵥᵀ) = σ₁σ₂σ₃ compresses it to one
 * number that plunges toward zero as any singularity approaches.
 */

/** One revolute joint's instantaneous world-frame data. */
export interface JointAxisFrame {
  /** Unit rotation axis in world coordinates. */
  axis: readonly number[];
  /** A point on the axis (the joint origin) in world coordinates. */
  origin: readonly number[];
}

/** 6×n geometric Jacobian for revolute joints (rows: vx vy vz wx wy wz). */
export function geometricJacobian(
  joints: readonly JointAxisFrame[],
  tcp: readonly number[],
): number[][] {
  const J = Array.from({ length: 6 }, () => new Array<number>(joints.length).fill(0));
  joints.forEach((joint, i) => {
    const [ax, ay, az] = joint.axis;
    const rx = tcp[0] - joint.origin[0];
    const ry = tcp[1] - joint.origin[1];
    const rz = tcp[2] - joint.origin[2];
    // z × (p − o)
    J[0][i] = ay * rz - az * ry;
    J[1][i] = az * rx - ax * rz;
    J[2][i] = ax * ry - ay * rx;
    J[3][i] = ax;
    J[4][i] = ay;
    J[5][i] = az;
  });
  return J;
}

export interface EigenSymmetric3 {
  /** Eigenvalues, sorted descending. */
  values: number[];
  /** vectors[k] is the unit eigenvector for values[k]. */
  vectors: number[][];
}

/**
 * Eigen-decomposition of a symmetric 3×3 matrix by cyclic Jacobi
 * rotations — small, dependency-free, and unconditionally convergent for
 * symmetric input (each sweep drives the off-diagonal mass down
 * quadratically; a handful of sweeps reaches machine precision).
 */
export function eigenSymmetric3(m: readonly (readonly number[])[]): EigenSymmetric3 {
  const a = [
    [m[0][0], m[0][1], m[0][2]],
    [m[1][0], m[1][1], m[1][2]],
    [m[2][0], m[2][1], m[2][2]],
  ];
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++)
      for (let q = p + 1; q < 3; q++) off += a[p][q] * a[p][q];
    if (off < 1e-24) break;
    for (let p = 0; p < 2; p++) {
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-18) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 3; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i]);
  return {
    values: order.map((i) => a[i][i]),
    vectors: order.map((i) => [v[0][i], v[1][i], v[2][i]]),
  };
}

export interface Manipulability {
  /** Ellipsoid semi-axis lengths σ₁ ≥ σ₂ ≥ σ₃ (m/s per unit ‖q̇‖). */
  radii: number[];
  /** Unit directions of the semi-axes, world frame. */
  axes: number[][];
  /** Yoshikawa's measure w = σ₁σ₂σ₃ — plunges to 0 at a singularity. */
  measure: number;
}

/**
 * Yoshikawa's measure over the FULL 6×6 Jacobian: w = √det(J·Jᵀ).
 *
 * Subtle and worth knowing (a test taught us): the TCP's *translational*
 * ellipsoid does NOT collapse at the elbow-straight singularity, because
 * the wrist joints can still translate the tool through the flange
 * lever. What the singularity really destroys is the ability to translate
 * radially WHILE holding orientation — a rank loss only the full 6D
 * Jacobian sees. This measure plunges to zero at every singularity type
 * (elbow, shoulder, wrist), which makes it the honest single-number
 * indicator. Its unit mixes m and rad; use it relatively, not absolutely.
 */
export function manipulability6(J: readonly (readonly number[])[]): number {
  const n = J[0].length;
  const A = Array.from({ length: 6 }, (_, r) =>
    Array.from({ length: 6 }, (_, c) => {
      let s = 0;
      for (let k = 0; k < n; k++) s += J[r][k] * J[c][k];
      return s;
    }),
  );
  // det via LU with partial pivoting (portable, no dependencies).
  let det = 1;
  for (let col = 0; col < 6; col++) {
    let pivot = col;
    for (let row = col + 1; row < 6; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row;
    }
    if (pivot !== col) {
      [A[col], A[pivot]] = [A[pivot], A[col]];
      det = -det;
    }
    if (A[col][col] === 0) return 0;
    det *= A[col][col];
    for (let row = col + 1; row < 6; row++) {
      const f = A[row][col] / A[col][col];
      for (let k = col; k < 6; k++) A[row][k] -= f * A[col][k];
    }
  }
  return Math.sqrt(Math.max(0, det));
}

/** Velocity ellipsoid of the translational Jacobian (rows 0–2 of J). */
export function translationalManipulability(J: readonly (readonly number[])[]): Manipulability {
  const n = J[0].length;
  const A = Array.from({ length: 3 }, (_, r) =>
    Array.from({ length: 3 }, (_, c) => {
      let s = 0;
      for (let k = 0; k < n; k++) s += J[r][k] * J[c][k];
      return s;
    }),
  );
  const eig = eigenSymmetric3(A);
  const radii = eig.values.map((lambda) => Math.sqrt(Math.max(0, lambda)));
  return { radii, axes: eig.vectors, measure: radii[0] * radii[1] * radii[2] };
}
