/**
 * Trajectory profile explorer — the modern counterpart of the 1997 BGI plot
 * in legacy/TRAJECT.CPP Trajectory::Show(), which drew position, speed and
 * acceleration once, in white, on a 640×480 EGA screen, and waited for a
 * keypress. Here the same three profiles are live: every control change
 * replans the segments and redraws.
 *
 * Chart design follows the project's dataviz rules: three separate charts
 * instead of one dual-axis chart (one measure per axis), series colors from
 * the validated 3-slot categorical palette, all text in ink tokens, and
 * direct labels on the curves so identity never rides on color alone.
 */
import "./style.css";
import "uplot/dist/uPlot.min.css";
import uPlot from "uplot";
import { Pane } from "tweakpane";
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

function themeColors() {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim();
  return {
    surface: v("--surface"),
    ink: v("--ink"),
    muted: v("--ink-muted"),
    grid: v("--grid"),
    axis: v("--axis"),
    series: [v("--series-1"), v("--series-2"), v("--series-3")],
  };
}

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

/** Direct labels: series name in ink with a surface-colored halo, placed on
 * the curve at staggered fractions so the three labels never stack. This is
 * the "relief" the palette validation demands for the light-mode aqua. */
function drawDirectLabels(u: uPlot): void {
  const theme = themeColors();
  const ctx = u.ctx;
  const dpr = window.devicePixelRatio || 1;
  const fractions = [0.22, 0.5, 0.78];
  ctx.save();
  ctx.font = `600 ${11 * dpr}px system-ui, sans-serif`;
  for (let si = 1; si < u.series.length; si++) {
    const xs = u.data[0];
    const ys = u.data[si] as ArrayLike<number>;
    const idx = Math.round((xs.length - 1) * fractions[(si - 1) % fractions.length]);
    const x = u.valToPos(xs[idx], "x", true) + 5 * dpr;
    const y = u.valToPos(ys[idx], "y", true) - 5 * dpr;
    const label = u.series[si].label as string;
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = theme.surface;
    ctx.strokeText(label, x, y);
    ctx.fillStyle = theme.ink;
    ctx.fillText(label, x, y);
  }
  ctx.restore();
}

function makeChart(container: HTMLElement, height: number, data: uPlot.AlignedData): uPlot {
  const theme = themeColors();
  const axisStyle: uPlot.Axis = {
    stroke: theme.muted,
    grid: { stroke: theme.grid, width: 1 },
    ticks: { stroke: theme.axis, width: 1 },
  };
  return new uPlot(
    {
      width: container.clientWidth,
      height,
      padding: [12, 28, 0, 0],
      cursor: { sync: { key: "retraject" } },
      scales: { x: { time: false } },
      series: [
        { label: "t" },
        ...JOINT_LABELS.map((label, i) => ({
          label,
          stroke: theme.series[i],
          width: 2,
        })),
      ],
      axes: [axisStyle, axisStyle],
      hooks: { draw: [drawDirectLabels] },
    },
    data,
    container,
  );
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
  charts = [
    makeChart(chartContainers.position, 220, [data.time, ...data.position]),
    makeChart(chartContainers.velocity, 170, [data.time, ...data.velocity]),
    makeChart(chartContainers.acceleration, 170, [data.time, ...data.acceleration]),
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
