/**
 * Kinematics explorer page. Two ways to drive the arm, deliberately dual:
 *
 *   FORWARD:  joint sliders → chain.setPose → the TCP readout and the
 *             target gizmo follow (computed by forwardKinematics).
 *   INVERSE:  drag the gizmo → solveSphericalWrist finds all branches →
 *             one is picked (closest by default, or a pinned branch) and
 *             the sliders follow the solution.
 *
 * The gizmo turning red means "no usable solution": geometrically out of
 * reach, or every solution on the requested branch violates joint limits.
 * The robot then simply holds — exactly what a real controller does.
 *
 * "demo move" plays a synchronized quintic trajectory from the trajectory
 * module through all six joints — the Phase-4 promise in miniature.
 */
import "./style.css";
import {
  AxesHelper,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { Pane } from "tweakpane";
import { createRobotView } from "./scene/robotView";
import { buildRobotChain } from "./scene/robotChain";
import {
  R6,
  closestSolution,
  forwardKinematics,
  homePose,
  positionOf,
  solveSphericalWrist,
  type IKSolution,
} from "./kinematics";
import { LAWS, evaluateSegment, synchronizeMoves, type Segment } from "./trajectory";

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const REACHABLE_COLOR = 0x2a78d6;
const UNREACHABLE_COLOR = 0xe34948;

// ---- scene ----------------------------------------------------------------

const viewport = document.querySelector<HTMLElement>("#viewport")!;
const view = createRobotView(viewport);
const chain = buildRobotChain(R6);
view.zUp.add(chain.root);

function surfaceColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--surface").trim();
}
view.setBackground(surfaceColor());
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () =>
  view.setBackground(surfaceColor()),
);

// ---- IK target gizmo ------------------------------------------------------

// The target lives under the z-up adapter as a direct child, so its LOCAL
// matrix is a pose in robot base coordinates — exactly what the solver
// expects, no conversion anywhere.
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

// ---- state ----------------------------------------------------------------

const anglesDeg: Record<string, number> = {};
R6.joints.forEach((j, i) => (anglesDeg[`j${i + 1}`] = j.home * DEG));
const options = { showFrames: false, branch: "closest", mode: "translate" as "translate" | "rotate" };

const readout = document.querySelector<HTMLElement>("#tcp-readout")!;
let ikStatus = "";

const currentPose = (): number[] => R6.joints.map((_, i) => anglesDeg[`j${i + 1}`] * RAD);

const branchLabel = (s: IKSolution): string =>
  `${s.branch.shoulder}·${s.branch.elbow}·${s.branch.wrist}`;

/** Push the model state everywhere: robot pose, TCP readout, and (unless
 * the change came FROM the gizmo) the gizmo itself, which follows the TCP. */
function apply(syncGizmo = true): void {
  const pose = currentPose();
  chain.setPose(pose);
  const tcpFrame = forwardKinematics(R6.joints, pose)[6];
  const tcp = positionOf(tcpFrame);
  readout.textContent =
    `TCP  x ${tcp.x.toFixed(3)}  y ${tcp.y.toFixed(3)}  z ${tcp.z.toFixed(3)} m` +
    (ikStatus ? `\n${ikStatus}` : "");
  if (syncGizmo) {
    ikTarget.position.setFromMatrixPosition(tcpFrame);
    ikTarget.quaternion.setFromRotationMatrix(tcpFrame);
    targetBall.material.color.set(REACHABLE_COLOR);
  }
}

// ---- inverse kinematics ---------------------------------------------------

function solveToTarget(): void {
  ikTarget.updateMatrix();
  const target = new Matrix4().compose(
    ikTarget.position,
    ikTarget.quaternion,
    new Vector3(1, 1, 1),
  );
  const solutions = solveSphericalWrist(R6, target);

  let pick: IKSolution | null = null;
  if (options.branch === "closest") {
    pick = closestSolution(solutions, currentPose());
    if (pick && !pick.withinLimits) pick = null;
  } else {
    pick = solutions.find((s) => branchLabel(s) === options.branch && s.withinLimits) ?? null;
  }

  if (pick) {
    pick.angles.forEach((t, i) => (anglesDeg[`j${i + 1}`] = t * DEG));
    ikStatus = `IK  ${solutions.length} solutions, using ${branchLabel(pick)}` +
      (pick.wristSingular ? " (wrist singular)" : "");
    targetBall.material.color.set(REACHABLE_COLOR);
    apply(false); // the gizmo is already where the user dragged it
    pane.refresh();
  } else {
    ikStatus = solutions.length === 0
      ? "IK  target out of reach"
      : `IK  ${solutions.length} solutions, none usable on '${options.branch}' within joint limits`;
    targetBall.material.color.set(UNREACHABLE_COLOR);
    apply(false); // robot holds its pose; only the readout changes
  }
}

// ---- controls -------------------------------------------------------------

const pane = new Pane({
  container: document.querySelector<HTMLElement>("#controls")!,
  title: "R6 arm",
});
R6.joints.forEach((j, i) => {
  pane.addBinding(anglesDeg, `j${i + 1}`, {
    label: j.name,
    min: Math.round(j.min * DEG),
    max: Math.round(j.max * DEG),
    step: 1,
  }).on("change", () => {
    ikStatus = "";
    apply();
  });
});

const ikFolder = pane.addFolder({ title: "Inverse kinematics" });
ikFolder.addBinding(options, "mode", {
  label: "gizmo",
  options: { translate: "translate", rotate: "rotate" },
}).on("change", () => gizmo.setMode(options.mode));
ikFolder.addBinding(options, "branch", {
  label: "branch",
  options: Object.fromEntries([
    ["closest", "closest"],
    ...(["front", "back"] as const).flatMap((s) =>
      (["down", "up"] as const).flatMap((e) =>
        (["noflip", "flip"] as const).map((w) => [`${s}·${e}·${w}`, `${s}·${e}·${w}`]),
      ),
    ),
  ]),
}).on("change", () => solveToTarget());

pane.addBinding(options, "showFrames", { label: "show frames" }).on("change", () => {
  chain.frameHelpers.forEach((h) => (h.visible = options.showFrames));
});

// ---- motion playback ------------------------------------------------------

const POSE_B = [70, -85, 100, 45, -60, 90].map((d) => d * RAD);
const JOINT_LIMITS = { maxVelocity: 90 * RAD, maxAcceleration: 180 * RAD };

let playback: { segments: Segment[]; startMs: number; duration: number } | null = null;
let target: "A" | "B" = "B";

pane.addButton({ title: "home" }).on("click", () => {
  R6.joints.forEach((j, i) => (anglesDeg[`j${i + 1}`] = j.home * DEG));
  ikStatus = "";
  pane.refresh();
  apply();
  target = "B";
});

pane.addButton({ title: "demo move" }).on("click", () => {
  const goal = target === "B" ? POSE_B : homePose(R6);
  target = target === "B" ? "A" : "B";
  const segments = synchronizeMoves(
    currentPose().map((start, i) => ({
      law: LAWS.quintic,
      start,
      end: goal[i],
      limits: JOINT_LIMITS,
    })),
  );
  playback = {
    segments,
    startMs: performance.now(),
    duration: segments[0]?.duration ?? 0,
  };
});

view.onFrame((nowMs) => {
  if (!playback) return;
  const t = (nowMs - playback.startMs) / 1000;
  playback.segments.forEach((segment, i) => {
    anglesDeg[`j${i + 1}`] = evaluateSegment(segment, t).position * DEG;
  });
  pane.refresh();
  apply();
  if (t >= playback.duration) playback = null;
});

apply();
