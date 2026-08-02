/**
 * Public surface of the kinematics module. See README.md in this folder
 * for the Denavit–Hartenberg convention, the R6 arm's geometry, and the
 * validation strategy.
 */
export type { DHLink } from "./dh";
export { dhMatrix, forwardKinematics, positionOf } from "./dh";
export type { JointSpec, RobotModel } from "./robot";
export { R6, WRIST_FRAME, homePose } from "./robot";
