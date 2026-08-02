/**
 * The R6 arm — retraject's six-revolute-joint demonstration robot.
 *
 * The 1997 RIP02 had three driven axes and its geometry is not recorded in
 * the archive, so the revival defines its own arm: a classic 6R layout
 * with a SPHERICAL WRIST — the axes of joints 4, 5, 6 intersect in one
 * point (the wrist center). This is a deliberate, load-bearing choice:
 * Pieper's condition. A 6R arm with three concurrent wrist axes admits a
 * closed-form inverse kinematics solution (position decouples from
 * orientation at the wrist center), which is exactly what the upcoming IK
 * module will exploit. Nearly every industrial 6-axis arm is built this
 * way for the same reason.
 *
 * Kinematic structure (standard DH; z₀ points up, lengths in meters):
 *
 *   J1 base yaw      — vertical axis through the base column (d₁)
 *   J2 shoulder      — horizontal axis; upper arm of length a₂
 *   J3 elbow         — parallel to J2; short offset a₃, then the twist
 *                      α₃ = −90° turns z toward the forearm direction
 *   J4 forearm roll  — along the forearm (d₄)
 *   J5 wrist pitch   — perpendicular, through the wrist center
 *   J6 flange roll   — tool flange at distance d₆ from the wrist center
 *
 * Why the wrist center is where the axes meet: a₄ = a₅ = 0 and d₅ = 0
 * make the origins of frames 4 and 5 coincide, and that point does not
 * depend on θ₄, θ₅ or θ₆ (a RotZ never moves its own origin). The test
 * suite checks this invariance — it is the property the IK will stand on.
 */
import type { DHLink } from "./dh";

export interface JointSpec extends DHLink {
  name: string;
  /** Joint range, radians. */
  min: number;
  max: number;
  /** A comfortable default pose ("home" in the UI), radians. */
  home: number;
}

const deg = (v: number) => (v * Math.PI) / 180;

export interface RobotModel {
  name: string;
  joints: readonly JointSpec[];
}

export const R6: RobotModel = {
  name: "R6",
  joints: [
    { name: "J1 base",     a: 0,    alpha: deg(90),  d: 0.35, min: deg(-180), max: deg(180), home: deg(0) },
    { name: "J2 shoulder", a: 0.4,  alpha: 0,        d: 0,    min: deg(-120), max: deg(120), home: deg(50) },
    { name: "J3 elbow",    a: 0.05, alpha: deg(-90), d: 0,    min: deg(-140), max: deg(140), home: deg(-60) },
    { name: "J4 roll",     a: 0,    alpha: deg(90),  d: 0.35, min: deg(-180), max: deg(180), home: deg(0) },
    { name: "J5 pitch",    a: 0,    alpha: deg(-90), d: 0,    min: deg(-120), max: deg(120), home: deg(40) },
    { name: "J6 flange",   a: 0,    alpha: 0,        d: 0.12, min: deg(-180), max: deg(180), home: deg(0) },
  ],
};

/** Index (0-based) of the frame whose origin is the wrist center: frame 5,
 * i.e. frames[5] of forwardKinematics — origins of frames 4 and 5 coincide
 * by construction. */
export const WRIST_FRAME = 5;

export function homePose(robot: RobotModel): number[] {
  return robot.joints.map((j) => j.home);
}
