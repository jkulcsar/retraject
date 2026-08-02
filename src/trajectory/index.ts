/**
 * Public surface of the trajectory module — the 2026 port of the 1997
 * trajectory-generation core. See README.md in this folder for the
 * mathematics and the design decisions.
 */
export type { JointLimits, LawId, Shape, TrajectoryLaw } from "./law";
export { ALL_LAWS, LAWS, bangBang, cubic, linear, quintic, trapezoidal } from "./laws";
export type { MotionState, SampledSegment, Segment, SegmentSpec } from "./segment";
export { evaluateSegment, planSegment, sampleSegment } from "./segment";
export type { JointMove } from "./synchronize";
export { synchronizeMoves } from "./synchronize";
export type { BlendedPath } from "./blend";
export { evaluateBlendedPath, planBlendedPath, sampleBlendedPath } from "./blend";
