/**
 * The story page's live figures — computed by the same modules the
 * explorers use, not screenshots: the article's claims and the running
 * code cannot drift apart.
 */
import "./style.css";
import "uplot/dist/uPlot.min.css";
import type uPlot from "uplot";
import { makeProfileChart } from "./charts";
import { ALL_LAWS, evaluateSegment, planSegment } from "./trajectory";

const LIMITS = { maxVelocity: 40, maxAcceleration: 80 };
const DISTANCE = 90;
const N = 300;

const labels = ALL_LAWS.map((l) => l.label.split(" ")[0]);

/** Figure 1: normalized velocity shapes r′(τ). */
function shapesData(): (Float64Array | number[])[] {
  const tau = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) tau[i] = i / N;
  const series = ALL_LAWS.map((law) => {
    const shape = law.shape(DISTANCE, LIMITS);
    return Float64Array.from(tau, (t) => shape.dr(t));
  });
  return [tau, ...series];
}

/** Figure 2: the same move at each law's own minimum time. */
function raceData(): (Float64Array | number[])[] {
  const segments = ALL_LAWS.map((law) =>
    planSegment({ law, start: 0, end: DISTANCE, limits: LIMITS }),
  );
  const horizon = Math.max(...segments.map((s) => s.duration));
  const time = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) time[i] = (i * horizon) / N;
  const series = segments.map((segment) =>
    Float64Array.from(time, (t) => evaluateSegment(segment, t).position),
  );
  return [time, ...series];
}

const containers = {
  shapes: document.querySelector<HTMLElement>("#fig-shapes")!,
  race: document.querySelector<HTMLElement>("#fig-race")!,
};
let charts: uPlot[] = [];

function render(): void {
  charts.forEach((c) => c.destroy());
  charts = [
    makeProfileChart({
      container: containers.shapes,
      height: 230,
      data: shapesData() as never,
      seriesLabels: labels,
      syncKey: "retraject-story-shapes",
    }),
    makeProfileChart({
      container: containers.race,
      height: 230,
      data: raceData() as never,
      seriesLabels: labels,
      syncKey: "retraject-story-race",
    }),
  ];
}

let resizeQueued = false;
new ResizeObserver(() => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    render();
  });
}).observe(containers.shapes);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);

render();
