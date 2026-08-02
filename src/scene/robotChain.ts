/**
 * Builds the robot as a three.js scene graph whose structure IS the
 * kinematic chain: for every joint i the graph contains
 *
 *   jointGroup_i            — rotation.z = θᵢ        (the RotZ(θᵢ) factor)
 *     └─ staticGroup_i      — fixed matrix           (TransZ(dᵢ)·TransX(aᵢ)·RotX(αᵢ))
 *          └─ jointGroup_i+1 …
 *
 * so three.js's own matrix composition performs the DH product A₁·…·A₆.
 * This gives a strong cross-check for free: the test suite compares the
 * TCP node's matrixWorld against forwardKinematics() — two independent
 * composition paths over the same parameters must agree to machine
 * precision. A robot that renders correctly here *is* the FK being right.
 *
 * This module builds only Groups and geometry (no renderer, no DOM), so
 * it runs headless under Vitest.
 */
import {
  AxesHelper,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from "three";
import type { RobotModel } from "../kinematics";

const LINK_COLOR = 0xb9b8b3;
const JOINT_COLOR = 0x2a78d6; // categorical slot 1, same identity as chart J-series
const TCP_COLOR = 0xe34948;

export interface RobotChain {
  /** Add this to the scene (it is z-up; the view rotates it into y-up). */
  root: Group;
  /** One rotation group per joint; rotation.z is the joint angle. */
  jointGroups: Group[];
  /** Node at the tool flange; matrixWorld equals the FK's final frame. */
  tcp: Object3D;
  /** Per-frame axis triads, hidden by default. */
  frameHelpers: AxesHelper[];
  setPose(thetas: readonly number[]): void;
}

export function buildRobotChain(robot: RobotModel): RobotChain {
  const linkMaterial = new MeshStandardMaterial({ color: LINK_COLOR });
  const jointMaterial = new MeshStandardMaterial({ color: JOINT_COLOR });
  const root = new Group();
  root.name = `${robot.name}-root`;

  const jointGroups: Group[] = [];
  const frameHelpers: AxesHelper[] = [];

  const baseAxes = new AxesHelper(0.12);
  baseAxes.visible = false;
  root.add(baseAxes);
  frameHelpers.push(baseAxes);

  let parent: Object3D = root;
  robot.joints.forEach((joint, i) => {
    const jointGroup = new Group();
    jointGroup.name = joint.name;
    parent.add(jointGroup);
    jointGroups.push(jointGroup);

    // Visuals live in jointGroup space (i.e. after RotZ(θ)): a sphere at
    // the joint axis, a cylinder along z covering the d-offset, and one
    // along x covering the a-offset — together they trace the frame path
    // (0,0,0) → (0,0,d) → (a,0,d), which is where the next joint sits.
    const radius = 0.045 - i * 0.004;
    jointGroup.add(new Mesh(new SphereGeometry(radius * 1.35, 24, 16), jointMaterial));
    if (Math.abs(joint.d) > 0.02) {
      const cyl = new Mesh(
        new CylinderGeometry(radius, radius, Math.abs(joint.d), 20),
        linkMaterial,
      );
      cyl.rotation.x = Math.PI / 2; // three.js cylinders are y-aligned; stand it along z
      cyl.position.set(0, 0, joint.d / 2);
      jointGroup.add(cyl);
    }
    if (Math.abs(joint.a) > 0.02) {
      const cyl = new Mesh(
        new CylinderGeometry(radius, radius, Math.abs(joint.a), 20),
        linkMaterial,
      );
      cyl.rotation.z = Math.PI / 2; // lay it along x
      cyl.position.set(joint.a / 2, 0, joint.d);
      jointGroup.add(cyl);
    }

    // The constant remainder of the DH transform, applied as a raw matrix.
    const staticGroup = new Group();
    staticGroup.matrixAutoUpdate = false;
    staticGroup.matrix
      .makeTranslation(joint.a, 0, joint.d)
      .multiply(new Matrix4().makeRotationX(joint.alpha));
    jointGroup.add(staticGroup);

    const axes = new AxesHelper(0.09);
    axes.visible = false;
    staticGroup.add(axes);
    frameHelpers.push(axes);

    parent = staticGroup;
  });

  const tcp = new Mesh(new SphereGeometry(0.02, 16, 12), new MeshStandardMaterial({ color: TCP_COLOR }));
  tcp.name = "tcp";
  parent.add(tcp);

  return {
    root,
    jointGroups,
    tcp,
    frameHelpers,
    setPose(thetas: readonly number[]): void {
      if (thetas.length !== jointGroups.length) {
        throw new RangeError(`Expected ${jointGroups.length} joint angles, got ${thetas.length}`);
      }
      thetas.forEach((theta, i) => {
        jointGroups[i].rotation.z = theta;
      });
    },
  };
}
