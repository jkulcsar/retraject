/**
 * Virtual stepper explorer. The right column pairs two eras deliberately:
 * the blue DOS panel reproduces what this layer looked like in 1997 —
 * Joint::DumpOut's tab-separated TCA columns, the "Steps to execute /
 * Steps resulted" audit, FindOutQuantum's tick count, and the '*'/'|'
 * stripes the ISR painted into video memory as pulses fired — while the
 * charts underneath are the representation the algorithm never had.
 */
import "./style.css";
import "uplot/dist/uPlot.min.css";
import uPlot from "uplot";
import { Pane } from "tweakpane";
import { makeProfileChart } from "./charts";
import { ALL_LAWS, LAWS, planSegment, type LawId } from "./trajectory";
import { quantizeSegment, sampleStaircase, type StepperOptions } from "./stepper/tca";

const PIT_HZ = 1193180; // the 8253's input clock — see legacy/JOINT.CPP #define MHZ

const params = {
  law: "quintic" as LawId,
  distance: 90, // degrees, from 0
  maxVelocity: 40,
  maxAcceleration: 80,
  stepsPerDeg: 10,
  quantumHz: 2000,
  divisions: 24,
  countdown1997: false,
};

const dosPanel = document.querySelector<HTMLElement>("#dos-panel")!;
const chartContainers = {
  staircase: document.querySelector<HTMLElement>("#chart-staircase")!,
  error: document.querySelector<HTMLElement>("#chart-error")!,
};
let charts: uPlot[] = [];

function stepperOptions(): StepperOptions {
  return {
    stepsPerUnit: params.stepsPerDeg,
    quantumHz: params.quantumHz,
    divisions: params.divisions,
    timing: params.countdown1997 ? "division-constant" : "per-step",
  };
}

/** The 1997 console, reproduced: DumpOut + FindOutQuantum + the video-
 * memory pulse stripes (the ISR alternated '*' and '|' per 80-column
 * row of screen memory at B800:0000). */
function renderDosPanel(
  duration: number,
  tcas: number[],
  stepsToExecute: number,
  stepsResulted: number,
  saturated: boolean,
): void {
  const lines: string[] = [];
  lines.push(`Trajectory Time: ${duration.toFixed(4)}\t\tLambda: 1`);
  lines.push("");
  const tcaText = tcas.map((v) => String(v).padStart(6)).join("");
  for (let i = 0; i < tcaText.length; i += 78) lines.push(tcaText.slice(i, i + 78));
  lines.push("");
  lines.push(`Steps to execute : ${stepsToExecute}`);
  lines.push(`Steps resulted from the TCA: ${stepsResulted}`);
  lines.push(`\nQuantum is ${String(Math.round(PIT_HZ / params.quantumHz)).padStart(10)} ticks.`);
  if (saturated) {
    lines.push(`\n!! step rate saturated: ${stepsToExecute - stepsResulted} steps lost`);
  }
  lines.push("");
  // Video-memory stripes: one character per emitted pulse, 78 per row,
  // alternating '*' and '|' rows exactly as legacy/ROBOT.CPP handler() did.
  let remaining = stepsResulted;
  let glyph = "*";
  while (remaining > 0) {
    const row = Math.min(78, remaining);
    lines.push(glyph.repeat(row));
    remaining -= row;
    glyph = glyph === "*" ? "|" : "*";
  }
  dosPanel.textContent = lines.join("\n");
}

function render(): void {
  const segment = planSegment({
    law: LAWS[params.law],
    start: 0,
    end: params.distance,
    limits: { maxVelocity: params.maxVelocity, maxAcceleration: params.maxAcceleration },
  });
  const opts = stepperOptions();
  let quantized;
  try {
    quantized = quantizeSegment(segment, opts);
  } catch (err) {
    dosPanel.textContent = `!! ${(err as Error).message}`;
    return;
  }
  const samples = sampleStaircase(segment, quantized, opts, 900);

  renderDosPanel(
    segment.duration,
    quantized.divisions.map((d) => d.tca),
    quantized.stepsToExecute,
    quantized.stepsResulted,
    quantized.saturated,
  );

  charts.forEach((c) => c.destroy());
  charts = [
    makeProfileChart({
      container: chartContainers.staircase,
      height: 240,
      data: [samples.time, samples.ideal, samples.staircase],
      seriesLabels: ["ideal", "stepper"],
      syncKey: "retraject-stepper",
      seriesPaths: [undefined, uPlot.paths!.stepped!({ align: 1 })],
    }),
    makeProfileChart({
      container: chartContainers.error,
      height: 170,
      data: [samples.time, samples.errorSteps],
      seriesLabels: ["error"],
      syncKey: "retraject-stepper",
      showLegend: false,
    }),
  ];
}

const pane = new Pane({
  container: document.querySelector<HTMLElement>("#controls")!,
  title: "Virtual stepper",
});
pane.addBinding(params, "law", {
  options: Object.fromEntries(ALL_LAWS.map((l) => [l.label, l.id])),
});
pane.addBinding(params, "distance", { min: 5, max: 180, step: 1 });
pane.addBinding(params, "maxVelocity", { label: "max vel", min: 5, max: 120, step: 1 });
pane.addBinding(params, "maxAcceleration", { label: "max acc", min: 10, max: 400, step: 1 });
const motor = pane.addFolder({ title: "Motor & timer" });
motor.addBinding(params, "stepsPerDeg", { label: "steps/deg", min: 0.5, max: 50, step: 0.5 });
motor.addBinding(params, "quantumHz", { label: "interrupts/s", min: 100, max: 20000, step: 100 });
motor.addBinding(params, "divisions", { min: 4, max: 64, step: 1 });
motor.addBinding(params, "countdown1997", { label: "1997 countdown" });
pane.on("change", render);

let resizeQueued = false;
new ResizeObserver(() => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    render();
  });
}).observe(chartContainers.staircase);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);

render();
