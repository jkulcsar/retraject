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
  evaluateSegment,
  synchronizeMoves,
  type LawId,
  type Segment,
} from "./trajectory";
import { evaluatePath, planPath, samplePath, type PlannedPath } from "./planner/path";
import { addTimeCursor, makeProfileChart } from "./charts";

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

// ---- path programming: the Phase-4 loop -----------------------------------
// Pose the robot (sliders or IK gizmo) → capture waypoints in joint space →
// a law per segment → planPath synchronizes all six joints per segment →
// playback drives the 3D robot while a time cursor sweeps the profile
// charts. This is the whole 1997 pipeline in one screen — with the
// Cartesian teaching the original never had.

const pathState = { law: "quintic" as LawId, waypoints: [] as number[][], laws: [] as LawId[] };
let plannedPath: PlannedPath | null = null;
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

function updatePathStatus(): void {
  if (pathState.waypoints.length === 0) {
    pathStatus.textContent = "Path  no waypoints yet";
    return;
  }
  const laws = pathState.laws.map((id) => id);
  pathStatus.textContent =
    `Path  ${pathState.waypoints.length} waypoints` +
    (plannedPath
      ? `, ${plannedPath.segments.length} segments, ${plannedPath.duration.toFixed(2)} s`
      : "") +
    (laws.length ? `\nlaws: ${laws.join(" → ")}` : "");
}

function buildPathCharts(): void {
  if (!plannedPath) return;
  chartsRoot.hidden = false;
  const samples = samplePath(plannedPath, 600);
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
  timeCursors = pathCharts.map(addTimeCursor);
}

function replanPath(): void {
  pathPlayback = null;
  if (pathState.waypoints.length < 2) {
    plannedPath = null;
    chartsRoot.hidden = true;
    updatePathStatus();
    return;
  }
  plannedPath = planPath({
    waypoints: pathState.waypoints,
    laws: pathState.laws.map((id) => LAWS[id]),
    limits: PATH_LIMITS,
  });
  buildPathCharts();
  updatePathStatus();
}

const lawOptions = Object.fromEntries(ALL_LAWS.map((l) => [l.label, l.id]));
const pathFolder = pane.addFolder({ title: "Path programming" });
pathFolder.addBinding(pathState, "law", { label: "segment law", options: lawOptions });
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
  if (plannedPath) pathPlayback = { startMs: performance.now() };
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
  if (playback) {
    const t = (nowMs - playback.startMs) / 1000;
    playback.segments.forEach((segment, i) => {
      anglesDeg[`j${i + 1}`] = evaluateSegment(segment, t).position * DEG;
    });
    pane.refresh();
    apply();
    if (t >= playback.duration) playback = null;
  }
  if (pathPlayback && plannedPath) {
    const t = Math.min((nowMs - pathPlayback.startMs) / 1000, plannedPath.duration);
    evaluatePath(plannedPath, t).forEach((state, i) => {
      anglesDeg[`j${i + 1}`] = state.position * DEG;
    });
    pane.refresh();
    apply();
    timeCursors.forEach((set) => set(t));
    if (t >= plannedPath.duration) pathPlayback = null; // cursor stays at the end
  }
});

if (new URLSearchParams(location.search).get("demo") === "path") loadSamplePath();

apply();
updatePathStatus();
