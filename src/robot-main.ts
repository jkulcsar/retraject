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
import "uplot/dist/uPlot.min.css";
import type uPlot from "uplot";
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
import {
  ALL_LAWS,
  LAWS,
  evaluateBlendedPath,
  planBlendedPath,
  sampleBlendedPath,
  type LawId,
  type MotionState,
} from "./trajectory";
import { evaluatePath, planPath, samplePath } from "./planner/path";
import { evaluateLineMove, planLineMove, sampleLineMove } from "./planner/cartesian";
import { addTimeCursor, makeProfileChart, setChartPlayback } from "./charts";

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

function gizmoTargetMatrix(): Matrix4 {
  ikTarget.updateMatrix();
  return new Matrix4().compose(ikTarget.position, ikTarget.quaternion, new Vector3(1, 1, 1));
}

function solveToTarget(): void {
  const target = gizmoTargetMatrix();
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
// The panel mirrors the page's mental model, numbered: 1·Pose sets where
// the joints ARE (forward kinematics), 2·Target commands where the tool
// SHOULD GO (inverse kinematics), 3·Program records poses into a playable
// path. Every control lives with the question it answers.

const JOINT_LIMITS = { maxVelocity: 90 * RAD, maxAcceleration: 180 * RAD };

const pane = new Pane({
  container: document.querySelector<HTMLElement>("#controls")!,
  title: "R6 arm",
});

const poseFolder = pane.addFolder({ title: "1 · Pose — joints (FK)" });
R6.joints.forEach((j, i) => {
  poseFolder.addBinding(anglesDeg, `j${i + 1}`, {
    label: j.name,
    min: Math.round(j.min * DEG),
    max: Math.round(j.max * DEG),
    step: 1,
  }).on("change", () => {
    ikStatus = "";
    apply();
  });
});
poseFolder.addBinding(options, "showFrames", { label: "show DH frames" }).on("change", () => {
  chain.frameHelpers.forEach((h) => (h.visible = options.showFrames));
});
poseFolder.addButton({ title: "home pose" }).on("click", () => {
  R6.joints.forEach((j, i) => (anglesDeg[`j${i + 1}`] = j.home * DEG));
  ikStatus = "";
  pane.refresh();
  apply();
});

const targetFolder = pane.addFolder({ title: "2 · Target — tool (IK)" });
targetFolder.addBinding(options, "mode", {
  label: "gizmo",
  options: { translate: "translate", rotate: "rotate" },
}).on("change", () => gizmo.setMode(options.mode));
targetFolder.addBinding(options, "branch", {
  label: "IK branch",
  options: Object.fromEntries([
    ["closest", "closest"],
    ...(["front", "back"] as const).flatMap((s) =>
      (["down", "up"] as const).flatMap((e) =>
        (["noflip", "flip"] as const).map((w) => [`${s}·${e}·${w}`, `${s}·${e}·${w}`]),
      ),
    ),
  ]),
}).on("change", () => solveToTarget());
targetFolder.addButton({ title: "move straight to target" }).on("click", () => {
  // MoveL: a straight Cartesian tool path from the current pose to the
  // gizmo, IK-solved per sample, eased with the quintic law.
  const result = planLineMove({
    robot: R6,
    startAngles: currentPose(),
    target: gizmoTargetMatrix(),
    law: LAWS.quintic,
    limits: CARTESIAN_LIMITS,
  });
  if (!result.ok) {
    updatePathStatus(
      `line move failed: ${result.reason} at ${(result.failedAtFraction * 100).toFixed(0)}% of the line`,
    );
    return;
  }
  const move = result.move;
  activePlan = {
    duration: move.duration,
    label: "Cartesian line to target (quintic), IK per sample",
    stateAt: (t) => evaluateLineMove(move, t),
    sample: (n) => sampleLineMove(move, n),
  };
  buildPathCharts();
  updatePathStatus();
  pathPlayback = { startMs: performance.now() };
});

// ---- path programming: the Phase-4 loop -----------------------------------
// Pose the robot (sliders or IK gizmo) → capture waypoints in joint space →
// a law per segment → planPath synchronizes all six joints per segment →
// playback drives the 3D robot while a time cursor sweeps the profile
// charts. This is the whole 1997 pipeline in one screen — with the
// Cartesian teaching the original never had.

/** One playable plan, whatever produced it — rest-to-rest segments, a
 * blended via path, or a Cartesian line move. Charts and playback only
 * see this surface. */
interface ActivePlan {
  duration: number;
  label: string;
  stateAt(t: number): MotionState[];
  sample(n: number): {
    time: Float64Array;
    position: Float64Array[];
    velocity: Float64Array[];
    acceleration: Float64Array[];
  };
}

const pathState = {
  law: "quintic" as LawId,
  blend: false,
  waypoints: [] as number[][],
  laws: [] as LawId[],
};
let activePlan: ActivePlan | null = null;
let pathPlayback: { startMs: number } | null = null;

const pathStatus = document.querySelector<HTMLElement>("#path-status")!;
const chartsRoot = document.querySelector<HTMLElement>("#path-charts")!;
const pathChartContainers = {
  position: document.querySelector<HTMLElement>("#path-chart-position")!,
  velocity: document.querySelector<HTMLElement>("#path-chart-velocity")!,
  acceleration: document.querySelector<HTMLElement>("#path-chart-acceleration")!,
};
let pathCharts: uPlot[] = [];
let timeCursors: ((t: number | null) => void)[] = [];

const PATH_LIMITS = R6.joints.map(() => JOINT_LIMITS);
/** Tool-point limits for Cartesian line moves: m/s, m/s². */
const CARTESIAN_LIMITS = { maxVelocity: 0.4, maxAcceleration: 0.8 };

function updatePathStatus(error?: string): void {
  const lines: string[] = [];
  if (pathState.waypoints.length > 0) {
    lines.push(`Path  ${pathState.waypoints.length} waypoints`);
    if (pathState.laws.length > 0 && !pathState.blend) {
      lines.push(`laws: ${pathState.laws.join(" → ")}`);
    }
  }
  if (activePlan) lines.push(`plan: ${activePlan.label}, ${activePlan.duration.toFixed(2)} s`);
  if (error) lines.push(`!! ${error}`);
  pathStatus.textContent = lines.join("\n") || "Path  no waypoints yet";
}

function buildPathCharts(): void {
  if (!activePlan) return;
  chartsRoot.hidden = false;
  const samples = activePlan.sample(600);
  const toDeg = (arrays: Float64Array[]) =>
    arrays.map((a) => Float64Array.from(a, (v) => v * DEG));
  pathCharts.forEach((c) => c.destroy());
  const labels = R6.joints.map((_, i) => `J${i + 1}`);
  const make = (container: HTMLElement, series: Float64Array[]) =>
    makeProfileChart({
      container,
      height: 170,
      data: [samples.time, ...series],
      seriesLabels: labels,
      syncKey: "retraject-path",
    });
  pathCharts = [
    make(pathChartContainers.position, toDeg(samples.position)),
    make(pathChartContainers.velocity, toDeg(samples.velocity)),
    make(pathChartContainers.acceleration, toDeg(samples.acceleration)),
  ];
  timeCursors = pathCharts.map((u) => {
    const line = addTimeCursor(u);
    // The thin line marks the instant; the comet head + trail on every
    // series make the playback readable at a glance.
    return (t: number | null) => {
      line(t);
      setChartPlayback(u, t);
    };
  });
}

function replanPath(): void {
  pathPlayback = null;
  activePlan = null;
  if (pathState.waypoints.length < 2) {
    chartsRoot.hidden = true;
    updatePathStatus();
    return;
  }
  try {
    if (pathState.blend) {
      const bp = planBlendedPath(pathState.waypoints, PATH_LIMITS);
      activePlan = {
        duration: bp.duration,
        label:
          "blended vias (linear + parabolic blends)" +
          (bp.timeScale > 1 ? `, time ×${bp.timeScale.toFixed(2)} to fit blends` : ""),
        stateAt: (t) => evaluateBlendedPath(bp, t),
        sample: (n) => sampleBlendedPath(bp, n),
      };
    } else {
      const p = planPath({
        waypoints: pathState.waypoints,
        laws: pathState.laws.map((id) => LAWS[id]),
        limits: PATH_LIMITS,
      });
      activePlan = {
        duration: p.duration,
        label: `${p.segments.length} rest-to-rest segments`,
        stateAt: (t) => evaluatePath(p, t),
        sample: (n) => samplePath(p, n),
      };
    }
  } catch (err) {
    chartsRoot.hidden = true;
    updatePathStatus((err as Error).message);
    return;
  }
  buildPathCharts();
  updatePathStatus();
}

const lawOptions = Object.fromEntries(ALL_LAWS.map((l) => [l.label, l.id]));
const pathFolder = pane.addFolder({ title: "3 · Program — teach & play" });
pathFolder.addBinding(pathState, "law", { label: "segment law", options: lawOptions });
pathFolder.addBinding(pathState, "blend", { label: "blend vias" }).on("change", replanPath);
pathFolder.addButton({ title: "add waypoint" }).on("click", () => {
  pathState.waypoints.push(currentPose());
  if (pathState.waypoints.length > 1) pathState.laws.push(pathState.law);
  replanPath();
});
pathFolder.addButton({ title: "undo waypoint" }).on("click", () => {
  pathState.waypoints.pop();
  pathState.laws = pathState.laws.slice(0, Math.max(0, pathState.waypoints.length - 1));
  replanPath();
});
pathFolder.addButton({ title: "clear path" }).on("click", () => {
  pathState.waypoints = [];
  pathState.laws = [];
  replanPath();
});
pathFolder.addButton({ title: "play path" }).on("click", () => {
  if (activePlan) pathPlayback = { startMs: performance.now() };
});
pathFolder.addButton({ title: "sample path" }).on("click", loadSamplePath);

/** A canned three-segment tour (also reachable via ?demo=path). */
function loadSamplePath(): void {
  pathState.waypoints = [
    homePose(R6),
    [70, -85, 100, 45, -60, 90].map((d) => d * RAD),
    [-40, 40, -55, -30, 60, -20].map((d) => d * RAD),
    homePose(R6),
  ];
  pathState.laws = ["quintic", "trapezoidal", "quintic"];
  replanPath();
  pathPlayback = { startMs: performance.now() };
}

// Theme flips and container resizes rebuild the canvas charts.
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => buildPathCharts());
let chartResizeQueued = false;
new ResizeObserver(() => {
  if (chartResizeQueued) return;
  chartResizeQueued = true;
  requestAnimationFrame(() => {
    chartResizeQueued = false;
    if (!chartsRoot.hidden) buildPathCharts();
  });
}).observe(chartsRoot);

// ---- frame loop -----------------------------------------------------------

view.onFrame((nowMs) => {
  if (pathPlayback && activePlan) {
    const t = Math.min((nowMs - pathPlayback.startMs) / 1000, activePlan.duration);
    activePlan.stateAt(t).forEach((state, i) => {
      anglesDeg[`j${i + 1}`] = state.position * DEG;
    });
    pane.refresh();
    apply();
    timeCursors.forEach((set) => set(t));
    if (t >= activePlan.duration) pathPlayback = null; // cursor stays at the end
  }
});

const demo = new URLSearchParams(location.search).get("demo");
if (demo === "path" || demo === "blend") {
  pathState.blend = demo === "blend";
  loadSamplePath();
}

apply();
updatePathStatus();
