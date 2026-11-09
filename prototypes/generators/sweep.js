// Sweeps: lines of fluid carried through a vortex flow, drawn as stacked
// snapshots (2026-11-08). Pure functions; units in millimetres; y down.
//
// The look comes from stacking, not from the formula: each sheet starts as a
// short arc of fluid particles, and every few time steps the whole arc is
// drawn where it is now. Hundreds of nearly identical curves read as a veil,
// darker where they bunch up, with a fold (a dark crease and a crosshatch)
// where the sheet turns over itself.
//
// The flow: a central vortex whose core turns almost rigidly, an optional
// ring of satellite vortices that orbits and breathes (Aref's chaotic
// advection), and kinematic-simulation turbulence (Fung et al. 1992): random
// divergence-free waves with Kolmogorov's k^(−5/3) energy spectrum.

import { rng, simplify, order } from './gen.js';

const TWO_PI = Math.PI * 2;

// The v1 cabinet's drawing area (LIVING_PICTURE.md): about 350 × 330 mm.
export const SWEEP_FRAME = { W: 350, H: 330, M: 8 };

// ---------- the flow ----------
// Velocity of a vortex of circulation g with a smooth core (Lamb–Oseen).
function addVortex(out, x, y, vx, vy, g, core2) {
  const dx = x - vx, dy = y - vy, r2 = dx * dx + dy * dy + 1e-9;
  const k = (g / (TWO_PI * r2)) * (1 - Math.exp(-r2 / core2));
  out[0] += -k * dy;
  out[1] += k * dx;
}

// Each wave moves fluid perpendicular to its own wave vector, so the sum has
// no sources or sinks. With `symmetric`, every wave is repeated K times
// around the centre and the turbulence keeps K-fold symmetry.
function turbulence(r, { turb, R, modes, lmin, lmax, tfreq, symmetric, K }) {
  if (!turb || !modes) return null;
  const kmin = TWO_PI / lmax, kmax = TWO_PI / lmin, list = [];
  let e2 = 0;
  for (let n = 0; n < modes; n++) {
    const k = kmin * (kmax / kmin) ** ((n + r()) / modes);
    const dk = (k * Math.log(kmax / kmin)) / modes;
    const a = Math.sqrt(k ** (-5 / 3) * dk);
    const th = r() * TWO_PI, ph = r() * TWO_PI, w = tfreq * (k / kmin) ** (2 / 3);
    const copies = symmetric ? K : 1;
    for (let c = 0; c < copies; c++) {
      const t = th + (TWO_PI * c) / K;
      list.push([a, k * Math.cos(t), k * Math.sin(t), -Math.sin(t), Math.cos(t), w, ph]);
    }
    e2 += a * a * copies;
  }
  const scale = (turb * R) / Math.sqrt(e2 / 2); // rms speed = turb × the vortex's speed at R
  for (const m of list) m[0] *= scale;
  return list;
}

export function sweepField(p, r) {
  const { K, R, eps, omega, Gs, core0, cores } = p;
  const G0 = TWO_PI * R * R; // the central vortex turns fluid at radius R once per 2π time units
  const c02 = core0 * core0, cs2 = cores * cores, gS = Gs * G0;
  const sats = new Float64Array(2 * K);
  const phase = r() * TWO_PI;
  const waves = turbulence(r, p);
  let now = 0;
  return {
    at(t) {
      now = t;
      if (!gS) return;
      const rr = R * (1 + eps * Math.sin(omega * t + phase));
      for (let k = 0; k < K; k++) {
        const a = t + (TWO_PI * k) / K; // the ring orbits with the fluid at R
        sats[2 * k] = rr * Math.cos(a);
        sats[2 * k + 1] = rr * Math.sin(a);
      }
    },
    vel(x, y, out) {
      out[0] = 0; out[1] = 0;
      addVortex(out, x, y, 0, 0, G0, c02);
      if (gS) for (let k = 0; k < K; k++) addVortex(out, x, y, sats[2 * k], sats[2 * k + 1], gS, cs2);
      if (waves) {
        for (let i = 0; i < waves.length; i++) {
          const m = waves[i], c = m[0] * Math.cos(m[1] * x + m[2] * y + m[5] * now + m[6]);
          out[0] += c * m[3]; out[1] += c * m[4];
        }
      }
    },
  };
}

// ---------- carrying a line of fluid ----------
function scratch(n) {
  return { k1: new Float64Array(n), k2: new Float64Array(n), k3: new Float64Array(n), k4: new Float64Array(n), q: new Float64Array(n) };
}

// One fourth-order Runge–Kutta step for every particle (flat x0, y0, x1, y1, ...).
function rk4(field, pts, t, dt, s) {
  const n = pts.length, v = [0, 0], { k1, k2, k3, k4, q } = s;
  field.at(t);
  for (let i = 0; i < n; i += 2) { field.vel(pts[i], pts[i + 1], v); k1[i] = v[0]; k1[i + 1] = v[1]; }
  field.at(t + dt / 2);
  for (let i = 0; i < n; i++) q[i] = pts[i] + (dt / 2) * k1[i];
  for (let i = 0; i < n; i += 2) { field.vel(q[i], q[i + 1], v); k2[i] = v[0]; k2[i + 1] = v[1]; }
  for (let i = 0; i < n; i++) q[i] = pts[i] + (dt / 2) * k2[i];
  for (let i = 0; i < n; i += 2) { field.vel(q[i], q[i + 1], v); k3[i] = v[0]; k3[i + 1] = v[1]; }
  field.at(t + dt);
  for (let i = 0; i < n; i++) q[i] = pts[i] + dt * k3[i];
  for (let i = 0; i < n; i += 2) { field.vel(q[i], q[i + 1], v); k4[i] = v[0]; k4[i + 1] = v[1]; }
  for (let i = 0; i < n; i++) pts[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
}

// Insert particles where neighbours drift apart (Catmull–Rom midpoints keep
// the curve smooth), up to maxPts particles.
function refine(pts, maxGap, maxPts) {
  const n = pts.length / 2;
  if (n >= maxPts) return pts;
  const g2 = maxGap * maxGap;
  let need = 0;
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[2 * i + 2] - pts[2 * i], dy = pts[2 * i + 3] - pts[2 * i + 1];
    if (dx * dx + dy * dy > g2) need++;
  }
  if (!need) return pts;
  need = Math.min(need, maxPts - n);
  const out = new Float64Array(2 * (n + need));
  let o = 0, added = 0;
  for (let i = 0; i < n; i++) {
    const ax = pts[2 * i], ay = pts[2 * i + 1];
    out[o++] = ax; out[o++] = ay;
    if (i === n - 1 || added >= need) continue;
    const bx = pts[2 * i + 2], by = pts[2 * i + 3];
    if ((bx - ax) ** 2 + (by - ay) ** 2 <= g2) continue;
    const px = i > 0 ? pts[2 * i - 2] : 2 * ax - bx, py = i > 0 ? pts[2 * i - 1] : 2 * ay - by;
    const nx = i < n - 2 ? pts[2 * i + 4] : 2 * bx - ax, ny = i < n - 2 ? pts[2 * i + 5] : 2 * by - ay;
    out[o++] = (-px + 9 * ax + 9 * bx - nx) / 16;
    out[o++] = (-py + 9 * ay + 9 * by - ny) / 16;
    added++;
  }
  return out.subarray(0, o);
}

// A snapshot as polylines: broken where neighbours are too far apart (the
// curve stretched faster than refinement followed) and inside the hole.
function snapshot(pts, breakGap, hole) {
  const n = pts.length / 2, b2 = breakGap * breakGap, h2 = hole * hole, out = [];
  let cur = [];
  for (let i = 0; i < n; i++) {
    const x = pts[2 * i], y = pts[2 * i + 1];
    if (x * x + y * y < h2) { if (cur.length > 1) out.push(cur); cur = []; continue; }
    if (cur.length) {
      const [px, py] = cur[cur.length - 1];
      if ((x - px) ** 2 + (y - py) ** 2 > b2) { if (cur.length > 1) out.push(cur); cur = []; }
    }
    cur.push([x, y]);
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

// ---------- parameters ----------
export const SWEEP_DEFAULTS = {
  seed: 21,
  K: 6, // satellites, and the symmetry order when symmetric
  R: 60, // satellite ring radius; the vortex speed there sets the time unit (mm)
  eps: 0.18, omega: 3, // the ring breathes ±eps at this frequency
  Gs: 0, // satellite strength relative to the central vortex (0 = no ring)
  core0: 40, cores: 7, // core radii: central, satellites (mm)
  turb: 0.5, // turbulence rms speed, relative to the vortex speed at R
  modes: 10, lmin: 50, lmax: 200, // turbulent waves and their wavelengths (mm)
  tfreq: 0.6, // how fast the largest eddies change
  sheets: 16, // seeds; each sweeps one veil
  spokes: true, // seeds start at the hole and point outward; false: scattered between rin and rout
  rin: 50, rout: 115,
  Lmin: 60, Lmax: 150, // seed lengths (mm)
  tilt: 1.2, // seed direction: radial ± this (radians; spokes use 30 % of it)
  bend: 0.8, // seeds are arcs turning this much along their length (radians)
  symmetric: false, // seeds and turbulence repeat K-fold
  jitter: 0.01, // symmetric copies differ by this much (radians); chaos does the rest
  hole: 14, // nothing is drawn inside this radius (mm)
  warm: 0.1, // the flow shapes each seed this long before the first snapshot
  T: 2.5, // drawing time, in time units (the ring orbits once per 2π)
  tspread: 6, // sheets start at random moments of the flow within this time
  snaps: 55, // snapshots per sheet
  dt: 0.004,
  maxGap: 1.0, maxPts: 4000, breakGap: 3, // refinement and breaks (mm)
  fit: 150, // shrink so that 99.5 % of the line lies within this radius (mm)
};

export const SWEEP_PRESETS = {
  veils: { title: 'Veils', params: {}, note: 'sixteen sheets from the hole, turbulence, no symmetry' },
  pinwheel: { title: 'Pinwheel', params: { Gs: 0, turb: 0.35, lmin: 60, lmax: 240, Lmin: 80, Lmax: 130, sheets: 12, snaps: 70, seed: 3, symmetric: true },
    note: 'two sheets per arm, six-fold symmetric flow' },
  folds: { title: 'Folds', params: { Gs: -0.12, turb: 0.4, lmin: 60, lmax: 240, Lmin: 80, Lmax: 140, sheets: 10, snaps: 70, seed: 4, T: 3, K: 5, symmetric: true },
    note: 'a breathing ring of five counter-rotating vortices folds the sheets' },
  wreath: { title: 'Wreath', params: { Gs: 0, turb: 0.35, lmin: 60, lmax: 240, spokes: false, sheets: 10, snaps: 70, seed: 7, K: 5, symmetric: true },
    note: 'scattered sheets that never reach the centre' },
  rose: { title: 'Rose', params: { Gs: 0, turb: 0.45, lmin: 60, lmax: 240, Lmin: 70, Lmax: 120, sheets: 10, snaps: 70, seed: 9, K: 5, core0: 30, symmetric: true },
    note: 'a tighter core winds the sheets into petals' },
  satellites: { title: 'Satellites', params: { Gs: -0.25, turb: 0.35, lmin: 60, lmax: 240, spokes: false, rin: 70, rout: 120, Lmin: 70, Lmax: 130, sheets: 12, snaps: 70, seed: 2, symmetric: true },
    note: 'strong satellites trap fluid in a dark ring' },
};

// ---------- the generator ----------
function seedArcs(p, r) {
  const base = p.symmetric ? Math.max(1, Math.round(p.sheets / p.K)) : p.sheets;
  const out = [];
  for (let i = 0; i < base; i++) {
    const L = p.Lmin + r() * (p.Lmax - p.Lmin), t0 = r() * p.tspread;
    let rad = p.rin + r() * (p.rout - p.rin), tilt = (r() - 0.5) * 2 * p.tilt;
    const ang = r() * TWO_PI, bend = p.bend * (r() < 0.5 ? -1 : 1);
    if (p.spokes) { rad = p.hole + 2 + L / 2; tilt *= 0.3; }
    const copies = p.symmetric ? p.K : 1;
    for (let c = 0; c < copies; c++) {
      const a = ang + (TWO_PI * c) / p.K + (c ? (r() - 0.5) * 2 * p.jitter : 0);
      // a symmetric copy starts when the ring has turned by the same angle
      out.push({ rad, ang: a, tilt, L, bend, t0: p.symmetric ? t0 + (TWO_PI * c) / p.K : t0 });
    }
  }
  return out;
}

function arcPoints(sd, maxGap) {
  const n = Math.max(8, Math.round(sd.L / maxGap)), ds = sd.L / (n - 1), dir = sd.ang + sd.tilt;
  const arc = [];
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) {
    const a = dir + sd.bend * (i / (n - 1) - 0.5);
    arc.push([x, y]); x += ds * Math.cos(a); y += ds * Math.sin(a);
  }
  const [ox, oy] = arc[n >> 1], mx = sd.rad * Math.cos(sd.ang), my = sd.rad * Math.sin(sd.ang);
  const pts = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) { pts[2 * i] = arc[i][0] - ox + mx; pts[2 * i + 1] = arc[i][1] - oy + my; }
  return pts;
}

// One sheet: its snapshots, each a list of polylines (centred coordinates).
function runSheet(p, field, sd) {
  const warmSteps = Math.round(p.warm / p.dt), steps = warmSteps + Math.round(p.T / p.dt);
  const every = Math.max(1, Math.round((steps - warmSteps) / p.snaps));
  let pts = arcPoints(sd, p.maxGap), s = scratch(pts.length);
  const snaps = [];
  for (let step = 0; step <= steps; step++) {
    if (step >= warmSteps && (step - warmSteps) % every === 0) snaps.push(snapshot(pts, p.breakGap, p.hole));
    if (step === steps) break;
    rk4(field, pts, sd.t0 + step * p.dt, p.dt, s);
    if (step % 4 === 3) {
      const before = pts.length;
      pts = refine(pts, p.maxGap, p.maxPts);
      if (pts.length !== before) s = scratch(pts.length);
    }
  }
  return snaps;
}

function prepare(params) {
  const p = { ...SWEEP_DEFAULTS, ...params };
  const r = rng(p.seed * 7919 + 17);
  const field = sweepField(p, r);
  return { p, field, seeds: seedArcs(p, r) };
}

// Interleave the sheets (every first snapshot, then every second, ...) so an
// ink limit thins all sheets alike; shrink to fit; move to the frame centre.
function assemble(p, sheets) {
  const paths = [];
  const longest = Math.max(0, ...sheets.map((sh) => sh.length));
  for (let i = 0; i < longest; i++) for (const sh of sheets) if (sh[i]) paths.push(...sh[i]);
  let k = 1;
  if (p.fit) {
    const radii = [];
    for (const q of paths) for (let i = 0; i < q.length; i += 4) radii.push(Math.hypot(q[i][0], q[i][1]));
    radii.sort((a, b) => a - b);
    k = Math.min(1, p.fit / (radii[Math.floor(radii.length * 0.995)] || p.fit));
  }
  const cx = SWEEP_FRAME.W / 2, cy = SWEEP_FRAME.H / 2;
  return paths.map((q) => q.map(([x, y]) => [cx + k * x, cy + k * y]));
}

export function sweep(params = {}) {
  const { p, field, seeds } = prepare(params);
  return assemble(p, seeds.map((sd) => runSheet(p, field, sd)));
}

// The same, yielding between sheets so a page stays responsive.
export async function sweepAsync(params = {}, onProgress = () => {}) {
  const { p, field, seeds } = prepare(params);
  const sheets = [];
  for (let i = 0; i < seeds.length; i++) {
    onProgress(i / seeds.length);
    await new Promise((res) => setTimeout(res, 0));
    sheets.push(runSheet(p, field, seeds[i]));
  }
  onProgress(1);
  return assemble(p, sheets);
}

// The first n snapshots of one sheet, for the step-by-step figure.
export function sheetSteps(params, sheetIndex, counts) {
  const { p, field, seeds } = prepare(params);
  const snaps = runSheet(p, field, seeds[sheetIndex]);
  return counts.map((n) => assemble({ ...p, fit: 0 }, [snaps.slice(0, n)]));
}

// ---------- composing for the pen ----------
const span = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// At most maxMm of line per 5 mm square, in drawing-time order: a sheet thins
// out where the paper is already full instead of soaking it.
export function inkCap(paths, maxMm, cell = 5) {
  const gw = Math.ceil(SWEEP_FRAME.W / cell), gh = Math.ceil(SWEEP_FRAME.H / cell);
  const ink = new Float64Array(gw * gh), out = [];
  for (const p of paths) {
    let cur = [p[0]];
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i], L = span(a, b);
      const ci = Math.min(gw - 1, Math.max(0, Math.floor((a[0] + b[0]) / 2 / cell)));
      const cj = Math.min(gh - 1, Math.max(0, Math.floor((a[1] + b[1]) / 2 / cell)));
      const k = cj * gw + ci;
      if (ink[k] + L > maxMm) { if (cur.length > 1) out.push(cur); cur = [b]; continue; }
      ink[k] += L;
      cur.push(b);
    }
    if (cur.length > 1) out.push(cur);
  }
  return out;
}

function inside(paths) {
  const { W, H, M } = SWEEP_FRAME, out = [];
  for (const p of paths) {
    let cur = [];
    for (const q of p) {
      if (q[0] >= M && q[0] <= W - M && q[1] >= M && q[1] <= H - M) cur.push(q);
      else { if (cur.length > 1) out.push(cur); cur = []; }
    }
    if (cur.length > 1) out.push(cur);
  }
  return out;
}

// Drawing budget for a ballpoint: pen down 50 mm/s, up 200 mm/s, 0.24 s per lift.
export function sweepStats(paths) {
  let down = 0, up = 0, pos = [0, SWEEP_FRAME.H];
  const cell = 5, gw = Math.ceil(SWEEP_FRAME.W / cell), gh = Math.ceil(SWEEP_FRAME.H / cell);
  const ink = new Float64Array(gw * gh);
  for (const p of paths) {
    up += span(pos, p[0]);
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i], L = span(a, b), n = Math.max(1, Math.ceil(L));
      down += L;
      for (let k = 0; k < n; k++) { // a simplified segment can cross several squares
        const t = (k + 0.5) / n;
        const ci = Math.min(gw - 1, Math.max(0, Math.floor((a[0] + t * (b[0] - a[0])) / cell)));
        const cj = Math.min(gh - 1, Math.max(0, Math.floor((a[1] + t * (b[1] - a[1])) / cell)));
        ink[cj * gw + ci] += L / n;
      }
    }
    pos = p[p.length - 1];
  }
  let densest = 0;
  for (const v of ink) densest = Math.max(densest, v);
  return { penDownM: down / 1000, penUpM: up / 1000, lifts: paths.length,
    minutes: (down / 50 + up / 200 + paths.length * 0.24) / 60, densestMm: densest };
}

export function composeSweep(raw, { maxMm = 300 } = {}) {
  let paths = inside(raw);
  if (maxMm) paths = inkCap(paths, maxMm);
  paths = paths.map((p) => simplify(p, 0.05)).filter((p) => p.length >= 2);
  paths = order(paths, [0, SWEEP_FRAME.H]);
  return { paths, stats: sweepStats(paths) };
}
