/**
 * Shared uPlot chart construction for all explorer pages, following the
 * project's chart rules: one measure per chart (never dual axes), series
 * colors from the validated categorical palette (CSS variables, re-read
 * on theme change), all text in ink tokens, recessive grid, and direct
 * labels on the curves — required because three light-mode series colors
 * sit below 3:1 contrast on the light surface (the palette validator's
 * "relief" condition), so identity must never ride on color alone.
 *
 * Rendering quality: uPlot's stock polyline stroke shows its data
 * vertices as kinks and thin-line aliasing. We take over series drawing
 * with a custom pass — midpoint-smoothed quadratic curves (removes the
 * vertex kinks), a wide low-alpha under-stroke (a soft glow that also
 * masks aliasing), then the crisp 2px core. Series that bring their own
 * uPlot path builder (e.g. the stepper staircase, where hard steps ARE
 * the message) keep uPlot's renderer untouched.
 *
 * Playback: setChartPlayback(u, t) lights a glowing head on every series
 * at time t with a short comet trail fading behind it — the x axis is
 * time, so the trail is an honest linear gradient along x.
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

/** Playback time per chart, read by the draw hook. */
const playbackTimes = new WeakMap<uPlot, number>();

/** Set (or clear with null) the playback instant highlighted on a chart. */
export function setChartPlayback(u: uPlot, t: number | null): void {
  if (t === null) playbackTimes.delete(u);
  else playbackTimes.set(u, t);
  u.redraw(false);
}

interface Pt {
  x: number;
  y: number;
}

/** Midpoint-smoothed path: quadratics through the data points' midpoints —
 * the classic cheap spline that kills polyline kinks without overshoot. */
function traceSmooth(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}

function seriesPoints(u: uPlot, si: number): Pt[] {
  const xs = u.data[0];
  const ys = u.data[si] as ArrayLike<number>;
  const pts: Pt[] = new Array(xs.length);
  for (let i = 0; i < xs.length; i++) {
    pts[i] = { x: u.valToPos(xs[i], "x", true), y: u.valToPos(ys[i], "y", true) };
  }
  return pts;
}

function drawSeriesAndEffects(u: uPlot, customPaths: (unknown | undefined)[]): void {
  const labels = u.series.slice(1).map((s) => s.label as string);
  const theme = readChartTheme(labels.length);
  const ctx = u.ctx;
  const dpr = window.devicePixelRatio || 1;
  const playbackT = playbackTimes.get(u);

  ctx.save();
  ctx.beginPath();
  ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
  ctx.clip();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (let si = 1; si < u.series.length; si++) {
    const hasOwnRenderer = customPaths[si - 1] !== undefined;
    const color = theme.series[si - 1];
    const pts = hasOwnRenderer ? null : seriesPoints(u, si);

    if (pts && pts.length > 1) {
      // Glow under-stroke, then crisp core.
      traceSmooth(ctx, pts);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = 7 * dpr;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();
    }

    if (playbackT !== undefined) {
      drawComet(u, si, color, playbackT, dpr);
    }
  }
  ctx.restore();

  drawDirectLabels(u, labels, theme, dpr);
}

/** Glowing head at (t, y(t)) with a short trail fading out behind it. */
function drawComet(u: uPlot, si: number, color: string, t: number, dpr: number): void {
  const xs = u.data[0];
  const ys = u.data[si] as ArrayLike<number>;
  const n = xs.length;
  if (n < 2) return;
  const span = xs[n - 1] - xs[0];
  if (span <= 0) return;
  const ctx = u.ctx;

  // Trail: the last ~8% of the time axis before t, alpha ramping in.
  const tailT = Math.max(xs[0], t - span * 0.08);
  const i0 = Math.max(0, Math.min(n - 2, Math.floor(((tailT - xs[0]) / span) * (n - 1))));
  const i1 = Math.max(0, Math.min(n - 2, Math.floor(((t - xs[0]) / span) * (n - 1))));
  const pts: Pt[] = [];
  for (let i = i0; i <= i1 + 1 && i < n; i++) {
    pts.push({ x: u.valToPos(xs[i], "x", true), y: u.valToPos(ys[i], "y", true) });
  }
  if (pts.length > 1) {
    const grad = ctx.createLinearGradient(pts[0].x, 0, pts[pts.length - 1].x, 0);
    grad.addColorStop(0, "transparent");
    grad.addColorStop(1, color);
    traceSmooth(ctx, pts);
    ctx.strokeStyle = grad;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 3.5 * dpr;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Head: interpolated position at exactly t, with a soft halo.
  const fx = ((t - xs[0]) / span) * (n - 1);
  const i = Math.max(0, Math.min(n - 2, Math.floor(fx)));
  const frac = Math.max(0, Math.min(1, fx - i));
  const y = ys[i] + (ys[i + 1] - ys[i]) * frac;
  const hx = u.valToPos(xs[i] + (xs[i + 1] - xs[i]) * frac, "x", true);
  const hy = u.valToPos(y, "y", true);
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 9 * dpr;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(hx, hy, 3.2 * dpr, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Direct labels: series names in ink with a surface halo, staggered along
 * the curves so they never stack even when series converge. */
function drawDirectLabels(u: uPlot, labels: string[], theme: ChartTheme, dpr: number): void {
  const ctx = u.ctx;
  ctx.save();
  ctx.font = `600 ${11 * dpr}px system-ui, sans-serif`;
  for (let si = 1; si < u.series.length; si++) {
    const xs = u.data[0];
    const ys = u.data[si] as ArrayLike<number>;
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
  /** A single-series chart needs no legend box — the title names it. */
  showLegend?: boolean;
  /** Optional per-series uPlot path builders (e.g. stepped staircases);
   * such series are rendered by uPlot itself, without glow/smoothing. */
  seriesPaths?: (uPlot.Series.PathBuilder | undefined)[];
}

export function makeProfileChart(opts: ProfileChartOptions): uPlot {
  const theme = readChartTheme(opts.seriesLabels.length);
  const axisStyle: uPlot.Axis = {
    stroke: theme.muted,
    grid: { stroke: theme.grid, width: 1 },
    ticks: { stroke: theme.axis, width: 1 },
  };
  const customPaths = opts.seriesLabels.map((_, i) => opts.seriesPaths?.[i]);
  return new uPlot(
    {
      width: opts.container.clientWidth,
      height: opts.height,
      padding: [12, 28, 0, 0],
      cursor: { sync: { key: opts.syncKey } },
      legend: { show: opts.showLegend ?? opts.seriesLabels.length > 1 },
      scales: { x: { time: false } },
      series: [
        { label: "t" },
        ...opts.seriesLabels.map((label, i) => ({
          label,
          stroke: theme.series[i], // legend swatch + hover point color
          width: 2,
          // Our draw hook renders glow-smoothed series; uPlot only draws
          // the ones that brought their own path builder.
          paths: customPaths[i] ?? (() => null),
        })),
      ],
      axes: [axisStyle, axisStyle],
      hooks: { draw: [(u) => drawSeriesAndEffects(u, customPaths)] },
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
