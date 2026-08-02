/**
 * URDF explorer: load any URDF robot, drive its joints, and command its
 * tool with the GENERIC machinery — geometric Jacobian from world joint
 * frames, DLS inverse kinematics via FKEvaluator, manipulability — none
 * of which knows anything about the loaded robot's structure. That is
 * the whole demonstration: the analytic solver is a specialist (it
 * refuses non-spherical wrists, loudly), the numeric stack is a
 * generalist. The bundled UR5e, whose wrist axes do not intersect, is a
 * robot only the generalist can serve.
 */
import "./style.css";
import { Matrix4, Mesh, MeshBasicMaterial, SphereGeometry, Vector3, AxesHelper, Group } from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { Pane } from "tweakpane";
import URDFLoader from "urdf-loader";
import type { URDFJoint, URDFRobot } from "urdf-loader";
import { createRobotView } from "./scene/robotView";
import {
  geometricJacobian,
  manipulability6,
  solveDLSWith,
  translationalManipulability,
  type FKEvaluator,
} from "./kinematics";

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const REACHABLE_COLOR = 0x2a78d6;
const UNREACHABLE_COLOR = 0xe34948;
const ELLIPSOID_SCALE = 0.35;

const viewport = document.querySelector<HTMLElement>("#viewport")!;
const readout = document.querySelector<HTMLElement>("#tcp-readout")!;
const view = createRobotView(viewport);

function surfaceColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--surface").trim();
}
view.setBackground(surfaceColor());
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () =>
  view.setBackground(surfaceColor()),
);

// IK target gizmo (same pattern as the R6 page: local matrix = base coords).
const ikTarget = new Group();
const targetBall = new Mesh(
  new SphereGeometry(0.028, 16, 12),
  new MeshBasicMaterial({ color: REACHABLE_COLOR, wireframe: true }),
);
ikTarget.add(targetBall);
ikTarget.add(new AxesHelper(0.09));
view.zUp.add(ikTarget);
const gizmo = new TransformControls(view.camera, view.domElement);
gizmo.attach(ikTarget);
gizmo.setSize(0.75);
view.scene.add(gizmo.getHelper());
gizmo.addEventListener("dragging-changed", (e) => {
  view.orbit.enabled = !(e as unknown as { value: boolean }).value;
});
gizmo.addEventListener("objectChange", () => solveToTarget());

const manipEllipsoid = new Mesh(
  new SphereGeometry(1, 32, 16),
  new MeshBasicMaterial({ color: REACHABLE_COLOR, transparent: true, opacity: 0.2, depthWrite: false }),
);
manipEllipsoid.matrixAutoUpdate = false;
manipEllipsoid.visible = false;
view.zUp.add(manipEllipsoid);

// ---- robot state ----------------------------------------------------------

let robot: URDFRobot | null = null;
let joints: URDFJoint[] = [];
let toolNode: import("three").Object3D | null = null;
let evalFK: FKEvaluator = () => ({ tcp: new Matrix4(), joints: [] });
let anglesDeg: Record<string, number> = {};
let pane: Pane | null = null;
const options = { showManipulability: false, mode: "translate" as "translate" | "rotate" };

const currentAngles = (): number[] => joints.map((_, i) => anglesDeg[`j${i + 1}`] * RAD);

/** The deepest link is the tool if no conventionally-named one exists. */
function findToolNode(r: URDFRobot): import("three").Object3D {
  for (const name of ["tool0", "tcp", "ee_link", "flange", "tool"]) {
    if (r.links[name]) return r.links[name];
  }
  let best: import("three").Object3D = r;
  let bestDepth = -1;
  Object.values(r.links).forEach((link) => {
    let depth = 0;
    for (let n: import("three").Object3D | null = link; n && n !== r; n = n.parent) depth++;
    if (depth > bestDepth) {
      bestDepth = depth;
      best = link;
    }
  });
  return best;
}

function makeEvaluator(): FKEvaluator {
  // The gizmo's local frame under zUp IS robot base coordinates, so all
  // world matrices are pulled back through zUp⁻¹.
  const zUpInv = new Matrix4();
  const scratch = new Matrix4();
  const axis = new Vector3();
  return (angles) => {
    joints.forEach((j, i) => j.setJointValue(angles[i]));
    view.zUp.updateMatrixWorld(true);
    zUpInv.copy(view.zUp.matrixWorld).invert();
    const frames = joints.map((j) => {
      scratch.multiplyMatrices(zUpInv, j.matrixWorld);
      const e = scratch.elements;
      // The joint's own rotation is about its axis, so rotating the axis
      // by the joint's world rotation is invariant — safe either way.
      axis.copy(j.axis).applyMatrix4(scratch).sub(new Vector3(e[12], e[13], e[14])).normalize();
      return { axis: [axis.x, axis.y, axis.z], origin: [e[12], e[13], e[14]] };
    });
    const tcp = new Matrix4().multiplyMatrices(zUpInv, toolNode!.matrixWorld);
    return { tcp, joints: frames };
  };
}

function apply(syncGizmo = true, status = ""): void {
  const pe = evalFK(currentAngles());
  const e = pe.tcp.elements;
  const J = geometricJacobian(pe.joints, [e[12], e[13], e[14]]);
  const w6 = manipulability6(J);
  readout.textContent =
    `TCP  x ${e[12].toFixed(3)}  y ${e[13].toFixed(3)}  z ${e[14].toFixed(3)} m` +
    `   ·   manip ${w6.toExponential(1)}${w6 < 1e-4 ? "  ⚠ near singular" : ""}` +
    (status ? `\n${status}` : "");
  if (manipEllipsoid.visible) {
    const m = translationalManipulability(J);
    const [r1, r2, r3] = m.radii.map((r) => Math.max(1e-4, r * ELLIPSOID_SCALE));
    manipEllipsoid.matrix.makeBasis(
      new Vector3(...m.axes[0]).multiplyScalar(r1),
      new Vector3(...m.axes[1]).multiplyScalar(r2),
      new Vector3(...m.axes[2]).multiplyScalar(r3),
    );
    manipEllipsoid.matrix.setPosition(e[12], e[13], e[14]);
  }
  if (syncGizmo) {
    ikTarget.position.setFromMatrixPosition(pe.tcp);
    ikTarget.quaternion.setFromRotationMatrix(pe.tcp);
    targetBall.material.color.set(REACHABLE_COLOR);
  }
}

function solveToTarget(): void {
  if (!robot) return;
  ikTarget.updateMatrix();
  const target = new Matrix4().compose(ikTarget.position, ikTarget.quaternion, new Vector3(1, 1, 1));
  const result = solveDLSWith(evalFK, target, currentAngles());
  // Respect the URDF's joint limits after the fact: clamp, then check
  // whether the clamped pose still reaches. DLS itself is limit-blind.
  const clamped = result.angles.map((a, i) =>
    Math.min(joints[i].limit.upper as number, Math.max(joints[i].limit.lower as number, a)),
  );
  const reached = evalFK(clamped).tcp;
  const dx = reached.elements[12] - target.elements[12];
  const dy = reached.elements[13] - target.elements[13];
  const dz = reached.elements[14] - target.elements[14];
  const posErr = Math.hypot(dx, dy, dz);
  if (result.converged && posErr < 5e-3) {
    clamped.forEach((a, i) => (anglesDeg[`j${i + 1}`] = a * DEG));
    pane?.refresh();
    targetBall.material.color.set(REACHABLE_COLOR);
    apply(false, `DLS converged in ${result.iterations} iterations`);
  } else {
    targetBall.material.color.set(UNREACHABLE_COLOR);
    apply(false, `DLS could not reach the target (residual ${(posErr * 1000).toFixed(1)} mm)`);
  }
}

// ---- robot loading --------------------------------------------------------

function setRobot(r: URDFRobot, label: string): void {
  if (robot) view.zUp.remove(robot);
  robot = r;
  view.zUp.add(r);
  joints = Object.values(r.joints)
    .filter((j) => j.jointType === "revolute" || j.jointType === "continuous")
    .sort((a, b) => a.urdfName.localeCompare(b.urdfName));
  toolNode = findToolNode(r);
  evalFK = makeEvaluator();

  anglesDeg = {};
  joints.forEach((_, i) => (anglesDeg[`j${i + 1}`] = 0));

  pane?.dispose();
  pane = new Pane({ container: document.querySelector<HTMLElement>("#controls")!, title: label });
  joints.forEach((j, i) => {
    const lower = Number.isFinite(j.limit.lower) ? (j.limit.lower as number) : -Math.PI;
    const upper = Number.isFinite(j.limit.upper) ? (j.limit.upper as number) : Math.PI;
    pane!
      .addBinding(anglesDeg, `j${i + 1}`, {
        label: j.urdfName,
        min: Math.round(lower * DEG),
        max: Math.round(upper * DEG),
        step: 1,
      })
      .on("change", () => apply());
  });
  pane.addBinding(options, "mode", {
    label: "gizmo",
    options: { translate: "translate", rotate: "rotate" },
  }).on("change", () => gizmo.setMode(options.mode));
  pane.addBinding(options, "showManipulability", { label: "manipulability" }).on("change", () => {
    manipEllipsoid.visible = options.showManipulability;
    apply(false);
  });
  pane.addButton({ title: "zero pose" }).on("click", () => {
    joints.forEach((_, i) => (anglesDeg[`j${i + 1}`] = 0));
    pane!.refresh();
    apply();
  });

  // A friendly starting pose for arms — including a bent wrist, because a
  // straight one (θ5 = 0 on a UR) starts the page AT the wrist
  // singularity and the readout dutifully says so.
  if (joints.length >= 5) {
    anglesDeg.j2 = -60;
    anglesDeg.j3 = 60;
    anglesDeg.j5 = -50;
    pane.refresh();
  }
  apply();
}

const fileInput = document.querySelector<HTMLInputElement>("#urdf-file")!;
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    const parsed = new URDFLoader().parse(await file.text());
    setRobot(parsed, file.name);
  } catch (err) {
    readout.textContent = `!! could not parse ${file.name}: ${(err as Error).message}`;
  }
});

fetch("./ur5e.urdf")
  .then((r) => r.text())
  .then((text) => setRobot(new URDFLoader().parse(text), "UR5e (DH-derived)"))
  .catch((err) => (readout.textContent = `!! failed to load bundled UR5e: ${err}`));
