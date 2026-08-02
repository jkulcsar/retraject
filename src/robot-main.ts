/**
 * Kinematics explorer page: joint sliders drive the R6 arm; the TCP
 * readout is computed by our forward kinematics (the same math the scene
 * graph replays); "demo move" is the first integration of the two project
 * halves — a synchronized quintic trajectory from the trajectory module,
 * played through the robot at render rate. This is, in miniature, the
 * Phase-4 promise: axis motions computed by the 1997 math, visualized on
 * a 2026 robot.
 */
import "./style.css";
import { Pane } from "tweakpane";
import { createRobotView } from "./scene/robotView";
import { buildRobotChain } from "./scene/robotChain";
import { R6, forwardKinematics, homePose, positionOf } from "./kinematics";
import { LAWS, evaluateSegment, synchronizeMoves, type Segment } from "./trajectory";

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

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

// ---- state ----------------------------------------------------------------

/** UI model: joint angles in degrees (humans think in degrees; the math
 * in radians — the conversion happens exactly once, here). */
const anglesDeg: Record<string, number> = {};
R6.joints.forEach((j, i) => (anglesDeg[`j${i + 1}`] = j.home * DEG));
const options = { showFrames: false };

const readout = document.querySelector<HTMLElement>("#tcp-readout")!;

function currentPose(): number[] {
  return R6.joints.map((_, i) => anglesDeg[`j${i + 1}`] * RAD);
}

function apply(): void {
  const pose = currentPose();
  chain.setPose(pose);
  const tcp = positionOf(forwardKinematics(R6.joints, pose)[6]);
  readout.textContent = `TCP  x ${tcp.x.toFixed(3)}  y ${tcp.y.toFixed(3)}  z ${tcp.z.toFixed(3)} m`;
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
  });
});
pane.addBinding(options, "showFrames", { label: "show frames" }).on("change", () => {
  chain.frameHelpers.forEach((h) => (h.visible = options.showFrames));
});
pane.on("change", apply);

// ---- motion playback ------------------------------------------------------

// Two poses to shuttle between; per-joint limits chosen around 90 °/s and
// 180 °/s² — sedate industrial-demo values.
const POSE_A = homePose(R6);
const POSE_B = [70, -85, 100, 45, -60, 90].map((d) => d * RAD);
const JOINT_LIMITS = { maxVelocity: 90 * RAD, maxAcceleration: 180 * RAD };

let playback: { segments: Segment[]; startMs: number; duration: number } | null = null;
let target: "A" | "B" = "B";

pane.addButton({ title: "home" }).on("click", () => {
  R6.joints.forEach((j, i) => (anglesDeg[`j${i + 1}`] = j.home * DEG));
  pane.refresh(); // refresh fires the change handlers, which apply()
  target = "B";
});

pane.addButton({ title: "demo move" }).on("click", () => {
  const goal = target === "B" ? POSE_B : POSE_A;
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
  if (t >= playback.duration) playback = null;
});

apply();
