/**
 * Shared uPlot chart construction for both explorer pages, following the
 * project's chart rules: one measure per chart (never dual axes), series
 * colors from the validated categorical palette (CSS variables, re-read
 * on theme change), all text in ink tokens, recessive grid, and direct
 * labels on the curves — required because three light-mode series colors
 * sit below 3:1 contrast on the light surface (the palette validator's
 * "relief" condition), so identity must never ride on color alone.
 */
import uPlot from "uplot";

export interface ChartTheme {
  surface: string;
  ink: string;
  muted: string;
  grid: string;
  axis: string;
  series: string[];
}

export function readChartTheme(seriesCount: number): ChartTheme {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim();
  return {
    surface: v("--surface"),
    ink: v("--ink"),
    muted: v("--ink-muted"),
    grid: v("--grid"),
    axis: v("--axis"),
    series: Array.from({ length: seriesCount }, (_, i) => v(`--series-${i + 1}`)),
  };
}

/** Direct labels: series names in ink with a surface halo, staggered along
 * the curves so they never stack even when series converge. */
function drawDirectLabels(u: uPlot): void {
  const labels = u.series.slice(1).map((s) => s.label as string);
  const theme = readChartTheme(labels.length);
  const ctx = u.ctx;
  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  ctx.font = `600 ${11 * dpr}px system-ui, sans-serif`;
  for (let si = 1; si < u.series.length; si++) {
    const xs = u.data[0];
    const ys = u.data[si] as ArrayLike<number>;
    // Spread label anchors across 15%–85% of the time axis.
    const fraction = 0.15 + (0.7 * (si - 1)) / Math.max(1, u.series.length - 2);
    const idx = Math.round((xs.length - 1) * fraction);
    const x = u.valToPos(xs[idx], "x", true) + 5 * dpr;
    const y = u.valToPos(ys[idx], "y", true) - 5 * dpr;
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = theme.surface;
    ctx.strokeText(labels[si - 1], x, y);
    ctx.fillStyle = theme.ink;
    ctx.fillText(labels[si - 1], x, y);
  }
  ctx.restore();
}

export interface ProfileChartOptions {
  container: HTMLElement;
  height: number;
  data: uPlot.AlignedData;
  seriesLabels: string[];
  /** Charts sharing a sync key share one crosshair. */
  syncKey: string;
}

export function makeProfileChart(opts: ProfileChartOptions): uPlot {
  const theme = readChartTheme(opts.seriesLabels.length);
  const axisStyle: uPlot.Axis = {
    stroke: theme.muted,
    grid: { stroke: theme.grid, width: 1 },
    ticks: { stroke: theme.axis, width: 1 },
  };
  return new uPlot(
    {
      width: opts.container.clientWidth,
      height: opts.height,
      padding: [12, 28, 0, 0],
      cursor: { sync: { key: opts.syncKey } },
      scales: { x: { time: false } },
      series: [
        { label: "t" },
        ...opts.seriesLabels.map((label, i) => ({
          label,
          stroke: theme.series[i],
          width: 2,
        })),
      ],
      axes: [axisStyle, axisStyle],
      hooks: { draw: [drawDirectLabels] },
    },
    opts.data,
    opts.container,
  );
}

/** A vertical playback-time indicator inside a chart's plot area. Returns
 * a setter taking the current time (or null to hide). */
export function addTimeCursor(u: uPlot): (t: number | null) => void {
  const line = document.createElement("div");
  line.className = "time-cursor";
  u.over.appendChild(line);
  return (t) => {
    if (t === null) {
      line.style.display = "none";
      return;
    }
    line.style.display = "block";
    line.style.transform = `translateX(${u.valToPos(t, "x")}px)`;
  };
}
