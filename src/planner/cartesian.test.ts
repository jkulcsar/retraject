import { describe, expect, it } from "vitest";
import { Matrix4, Quaternion, Vector3 } from "three";
import { LAWS } from "../trajectory";
import { R6, forwardKinematics, homePose } from "../kinematics";
import { evaluateLineMove, planLineMove, sampleLineMove } from "./cartesian";

/**
 * A line move's promise is geometric: whatever the joints do, the TOOL
 * travels a straight line with slerped orientation, at the chosen law's
 * profile within the Cartesian limits. All assertions here check the
 * task space (via FK of the produced joint samples) — the joint space is
 * merely whatever the geometry demands.
 */

const CART = { maxVelocity: 0.3, maxAcceleration: 0.6 }; // m/s, m/s²

/** A comfortable target: the home TCP shifted and re-oriented mildly. */
function nearbyTarget(): Matrix4 {
  const home = forwardKinematics(R6.joints, homePose(R6))[6];
  const p = new Vector3().setFromMatrixPosition(home).add(new Vector3(0.1, 0.15, -0.2));
  const q = new Quaternion()
    .setFromRotationMatrix(home)
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.4));
  return new Matrix4().compose(p, q, new Vector3(1, 1, 1));
}

describe("planLineMove", () => {
  it("keeps the TCP exactly on the straight line, ends on both poses", () => {
    const result = planLineMove({
      robot: R6,
      startAngles: homePose(R6),
      target: nearbyTarget(),
      law: LAWS.quintic,
      limits: CART,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { move } = result;

    const start = forwardKinematics(R6.joints, homePose(R6))[6];
    const p0 = new Vector3().setFromMatrixPosition(start);
    const p1 = new Vector3().setFromMatrixPosition(nearbyTarget());
    const dir = new Vector3().subVectors(p1, p0).normalize();

    for (let i = 0; i <= move.time.length - 1; i += 10) {
      const pose = move.angles.map((a) => a[i]);
      const p = new Vector3().setFromMatrixPosition(forwardKinematics(R6.joints, pose)[6]);
      const toP = new Vector3().subVectors(p, p0);
      const offLine = toP.clone().sub(dir.clone().multiplyScalar(toP.dot(dir))).length();
      expect(offLine).toBeLessThan(1e-9);
    }
    const endPose = move.angles.map((a) => a[a.length - 1]);
    const pEnd = new Vector3().setFromMatrixPosition(forwardKinematics(R6.joints, endPose)[6]);
    expect(pEnd.distanceTo(p1)).toBeLessThan(1e-9);
  });

  it("slerps the orientation: the rotation fraction follows the law's shape", () => {
    const target = nearbyTarget();
    const result = planLineMove({
      robot: R6,
      startAngles: homePose(R6),
      target,
      law: LAWS.cubic,
      limits: CART,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const start = forwardKinematics(R6.joints, homePose(R6))[6];
    const q0 = new Quaternion().setFromRotationMatrix(start);
    const q1 = new Quaternion().setFromRotationMatrix(target);
    const total = q0.angleTo(q1);
    const n = result.move.time.length - 1;
    for (const i of [0, 50, 100, 150, n]) {
      const tau = i / n;
      const f = LAWS.cubic.shape(1, CART).r(tau);
      const pose = result.move.angles.map((a) => a[i]);
      const q = new Quaternion().setFromRotationMatrix(forwardKinematics(R6.joints, pose)[6]);
      expect(q0.angleTo(q)).toBeCloseTo(f * total, 6);
    }
  });

  it("respects the Cartesian speed limit along the line", () => {
    const result = planLineMove({
      robot: R6,
      startAngles: homePose(R6),
      target: nearbyTarget(),
      law: LAWS.trapezoidal,
      limits: CART,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { move } = result;
    const n = move.time.length - 1;
    let worst = 0;
    let prev = new Vector3().setFromMatrixPosition(
      forwardKinematics(R6.joints, move.angles.map((a) => a[0]))[6],
    );
    for (let i = 1; i <= n; i++) {
      const p = new Vector3().setFromMatrixPosition(
        forwardKinematics(R6.joints, move.angles.map((a) => a[i]))[6],
      );
      worst = Math.max(worst, p.distanceTo(prev) / (move.time[i] - move.time[i - 1]));
      prev = p;
    }
    expect(worst).toBeLessThanOrEqual(CART.maxVelocity * (1 + 1e-3));
  });

  it("keeps adjacent joint samples continuous (no branch teleports)", () => {
    const result = planLineMove({
      robot: R6,
      startAngles: homePose(R6),
      target: nearbyTarget(),
      law: LAWS.quintic,
      limits: CART,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { move } = result;
    for (const a of move.angles) {
      for (let i = 1; i < a.length; i++) {
        expect(Math.abs(a[i] - a[i - 1])).toBeLessThan(0.35);
      }
    }
  });

  it("reports a line that leaves the workspace, with the failure fraction", () => {
    const far = new Matrix4().makeTranslation(2.0, 0, 0.5); // well beyond ~0.92 m reach
    const result = planLineMove({
      robot: R6,
      startAngles: homePose(R6),
      target: far,
      law: LAWS.quintic,
      limits: CART,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failedAtFraction).toBeGreaterThan(0);
    expect(result.failedAtFraction).toBeLessThanOrEqual(1);
  });

  it("handles a zero-length move (already at the target)", () => {
    const home = homePose(R6);
    const target = forwardKinematics(R6.joints, home)[6];
    const result = planLineMove({ robot: R6, startAngles: home, target, law: LAWS.quintic, limits: CART });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.move.duration).toBe(0);
    const states = evaluateLineMove(result.move, 0);
    states.forEach((s, j) => expect(s.position).toBeCloseTo(home[j], 6));
  });

  it("samples with exact fence-post ends", () => {
    const result = planLineMove({
      robot: R6,
      startAngles: homePose(R6),
      target: nearbyTarget(),
      law: LAWS.quintic,
      limits: CART,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const s = sampleLineMove(result.move, 100);
    expect(s.time[100]).toBe(result.move.duration);
    s.position.forEach((p, j) => {
      expect(p[0]).toBeCloseTo(homePose(R6)[j], 9);
    });
  });
});
