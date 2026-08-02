/**
 * Trajectory profile explorer — the modern counterpart of the 1997 BGI plot
 * in legacy/TRAJECT.CPP Trajectory::Show(), which drew position, speed and
 * acceleration once, in white, on a 640×480 EGA screen, and waited for a
 * keypress. Here the same three profiles are live: every control change
 * replans the segments and redraws. Chart construction and the palette
 * rules live in charts.ts, shared with the kinematics explorer.
 */
import "./style.css";
import "uplot/dist/uPlot.min.css";
import type uPlot from "uplot";
import { Pane } from "tweakpane";
import { makeProfileChart } from "./charts";
import type { LawId } from "./trajectory";
import {
  ALL_LAWS,
  LAWS,
  evaluateSegment,
  planSegment,
  synchronizeMoves,
  type Segment,
} from "./trajectory";

interface JointParams {
  law: LawId;
  start: number;
  end: number;
  maxVelocity: number;
  maxAcceleration: number;
}

// Defaults chosen to tell the synchronization story: three different laws,
// very different move lengths, so unsynchronized durations differ visibly.
const joints: JointParams[] = [
  { law: "trapezoidal", start: 0, end: 90, maxVelocity: 30, maxAcceleration: 60 },
  { law: "quintic", start: -45, end: 45, maxVelocity: 40, maxAcceleration: 80 },
  { law: "cubic", start: 10, end: 15, maxVelocity: 25, maxAcceleration: 50 },
];
const settings = { synchronize: true };

const SAMPLES = 400;
const JOINT_LABELS = ["J1", "J2", "J3"];

function planAll(): Segment[] {
  const moves = joints.map((j) => ({
    law: LAWS[j.law],
    start: j.start,
    end: j.end,
    limits: { maxVelocity: j.maxVelocity, maxAcceleration: j.maxAcceleration },
  }));
  return settings.synchronize ? synchronizeMoves(moves) : moves.map((m) => planSegment(m));
}

interface ProfileData {
  time: Float64Array;
  position: Float64Array[];
  velocity: Float64Array[];
  acceleration: Float64Array[];
}

/**
 * Sample all joints on one shared time base spanning the slowest joint.
 * Joints that finish earlier simply hold position (evaluateSegment clamps),
 * which is precisely what unsynchronized motion looks like on real hardware.
 */
function sampleAll(segments: Segment[]): ProfileData {
  const horizon = Math.max(...segments.map((s) => s.duration)) || 1;
  const time = new Float64Array(SAMPLES + 1);
  const position = segments.map(() => new Float64Array(SAMPLES + 1));
  const velocity = segments.map(() => new Float64Array(SAMPLES + 1));
  const acceleration = segments.map(() => new Float64Array(SAMPLES + 1));
  for (let i = 0; i <= SAMPLES; i++) {
    const t = (i * horizon) / SAMPLES;
    time[i] = t;
    segments.forEach((segment, j) => {
      const state = evaluateSegment(segment, t);
      position[j][i] = state.position;
      velocity[j][i] = state.velocity;
      acceleration[j][i] = state.acceleration;
    });
  }
  return { time, position, velocity, acceleration };
}

const chartContainers = {
  position: document.querySelector<HTMLElement>("#chart-position")!,
  velocity: document.querySelector<HTMLElement>("#chart-velocity")!,
  acceleration: document.querySelector<HTMLElement>("#chart-acceleration")!,
};
let charts: uPlot[] = [];

function render(): void {
  const data = sampleAll(planAll());
  charts.forEach((c) => c.destroy());
  const make = (container: HTMLElement, height: number, series: Float64Array[]) =>
    makeProfileChart({
      container,
      height,
      data: [data.time, ...series],
      seriesLabels: JOINT_LABELS,
      syncKey: "retraject-profiles",
    });
  charts = [
    make(chartContainers.position, 220, data.position),
    make(chartContainers.velocity, 170, data.velocity),
    make(chartContainers.acceleration, 170, data.acceleration),
  ];
}

// ---- controls -------------------------------------------------------------

const lawOptions = Object.fromEntries(ALL_LAWS.map((law) => [law.label, law.id]));
const pane = new Pane({
  container: document.querySelector<HTMLElement>("#controls")!,
  title: "Joints",
});
pane.addBinding(settings, "synchronize", {
  label: "synchronize",
});
joints.forEach((joint, i) => {
  const folder = pane.addFolder({ title: `Joint ${i + 1}` });
  folder.addBinding(joint, "law", { options: lawOptions });
  folder.addBinding(joint, "start", { min: -180, max: 180, step: 1 });
  folder.addBinding(joint, "end", { min: -180, max: 180, step: 1 });
  folder.addBinding(joint, "maxVelocity", { label: "max vel", min: 1, max: 200, step: 1 });
  folder.addBinding(joint, "maxAcceleration", { label: "max acc", min: 1, max: 500, step: 1 });
});
pane.on("change", render);

// Redraw when the container resizes or the color scheme flips (the canvas
// bakes theme colors in at draw time, so a scheme change needs a rebuild).
let resizeQueued = false;
new ResizeObserver(() => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    render();
  });
}).observe(chartContainers.position);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);

render();
