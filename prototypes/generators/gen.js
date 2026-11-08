// Living picture: generator prototypes (2026-11-08).
// Pure functions: parameters and a seed in, polylines in millimetres out.
// The drawing area is 460 × 330 mm; y grows downward, as in SVG.

export const FRAME = { W: 460, H: 330, M: 8 };
const TAU = Math.PI * 2;

export function innerBox() {
  const { W, H, M } = FRAME;
  return { x0: M, y0: M, x1: W - M, y1: H - M };
}

// ---------- randomness ----------
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function noise2(seed) {
  const r = rng(seed);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const grad = (h, x, y) => {
    switch (h & 7) {
      case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
      case 4: return x; case 5: return -x; case 6: return y; default: return -y;
    }
  };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    const xf = Math.floor(x), yf = Math.floor(y);
    const X = xf & 255, Y = yf & 255;
    x -= xf; y -= yf;
    const u = fade(x), v = fade(y);
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1], ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    const l1 = grad(aa, x, y) + u * (grad(ba, x - 1, y) - grad(aa, x, y));
    const l2 = grad(ab, x, y - 1) + u * (grad(bb, x - 1, y - 1) - grad(ab, x, y - 1));
    return l1 + v * (l2 - l1);
  };
}

// ---------- contour lines (marching squares, stitched into polylines) ----------
export function contours(f, levels, step = 2, box = innerBox()) {
  const { x0, y0, x1, y1 } = box;
  const nx = Math.max(2, Math.round((x1 - x0) / step));
  const ny = Math.max(2, Math.round((y1 - y0) / step));
  const dx = (x1 - x0) / nx, dy = (y1 - y0) / ny, NX = nx + 1;
  const val = new Float64Array(NX * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) val[j * NX + i] = f(x0 + i * dx, y0 + j * dy);
  const HOFF = nx * (ny + 1);
  const hId = (i, j) => j * nx + i;
  const vId = (i, j) => HOFF + j * NX + i;
  const out = [];
  for (const L of levels) {
    const pts = new Map();
    const point = (id) => {
      let p = pts.get(id);
      if (p) return p;
      let ia, ja, ib, jb;
      if (id < HOFF) { ja = Math.floor(id / nx); ia = id - ja * nx; ib = ia + 1; jb = ja; }
      else { const k = id - HOFF; ja = Math.floor(k / NX); ia = k - ja * NX; ib = ia; jb = ja + 1; }
      const va = val[ja * NX + ia], vb = val[jb * NX + ib];
      const t = (L - va) / (vb - va);
      p = [x0 + (ia + t * (ib - ia)) * dx, y0 + (ja + t * (jb - ja)) * dy];
      pts.set(id, p);
      return p;
    };
    const segA = [], segB = [];
    const add = (e1, e2) => { segA.push(e1); segB.push(e2); };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = val[j * NX + i], b = val[j * NX + i + 1], c = val[(j + 1) * NX + i + 1], d = val[(j + 1) * NX + i];
      if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d))) continue;
      const idx = (a > L ? 1 : 0) | (b > L ? 2 : 0) | (c > L ? 4 : 0) | (d > L ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const bot = hId(i, j), top = hId(i, j + 1), lef = vId(i, j), rig = vId(i + 1, j);
      switch (idx) {
        case 1: case 14: add(lef, bot); break;
        case 2: case 13: add(bot, rig); break;
        case 3: case 12: add(lef, rig); break;
        case 4: case 11: add(rig, top); break;
        case 6: case 9: add(bot, top); break;
        case 7: case 8: add(lef, top); break;
        case 5: if ((a + b + c + d) / 4 > L) { add(bot, rig); add(lef, top); } else { add(lef, bot); add(rig, top); } break;
        case 10: if ((a + b + c + d) / 4 > L) { add(lef, bot); add(rig, top); } else { add(bot, rig); add(lef, top); } break;
      }
    }
    const byEdge = new Map();
    const link = (e, s) => { const l = byEdge.get(e); if (l) l.push(s); else byEdge.set(e, [s]); };
    for (let s = 0; s < segA.length; s++) { link(segA[s], s); link(segB[s], s); }
    const used = new Uint8Array(segA.length);
    const nextFrom = (edge) => {
      const l = byEdge.get(edge);
      if (l) for (const o of l) if (!used[o]) return o;
      return -1;
    };
    for (let s0 = 0; s0 < segA.length; s0++) {
      if (used[s0]) continue;
      used[s0] = 1;
      const fwd = [segA[s0], segB[s0]];
      let e = segB[s0];
      for (;;) { const n = nextFrom(e); if (n < 0) break; used[n] = 1; e = segA[n] === e ? segB[n] : segA[n]; fwd.push(e); }
      const back = [];
      e = segA[s0];
      for (;;) { const n = nextFrom(e); if (n < 0) break; used[n] = 1; e = segA[n] === e ? segB[n] : segA[n]; back.push(e); }
      out.push(back.reverse().concat(fwd).map(point));
    }
  }
  return out;
}

// ---------- composer ----------
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function lengthOf(p) { let s = 0; for (let i = 1; i < p.length; i++) s += dist(p[i - 1], p[i]); return s; }

export function simplify(pts, tol = 0.1) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d;
      if (L2 === 0) d = (px - ax) ** 2 + (py - ay) ** 2;
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
        const qx = ax + t * dx - px, qy = ay + t * dy - py;
        d = qx * qx + qy * qy;
      }
      if (d > best) { best = d; bi = i; }
    }
    if (best > t2) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

function clip(paths, box = innerBox()) {
  const out = [];
  const ins = (p) => p[0] >= box.x0 - 0.01 && p[0] <= box.x1 + 0.01 && p[1] >= box.y0 - 0.01 && p[1] <= box.y1 + 0.01;
  for (const p of paths) {
    let cur = [];
    for (const q of p) {
      if (ins(q)) cur.push(q);
      else { if (cur.length > 1) out.push(cur); cur = []; }
    }
    if (cur.length > 1) out.push(cur);
  }
  return out;
}

export function order(paths, start = [0, FRAME.H]) {
  const left = paths.slice();
  const out = [];
  let p = start;
  while (left.length) {
    let bi = 0, bd = Infinity, rev = false;
    for (let i = 0; i < left.length; i++) {
      const q = left[i], a = q[0], b = q[q.length - 1];
      const da = (a[0] - p[0]) ** 2 + (a[1] - p[1]) ** 2;
      const db = (b[0] - p[0]) ** 2 + (b[1] - p[1]) ** 2;
      if (da < bd) { bd = da; bi = i; rev = false; }
      if (db < bd) { bd = db; bi = i; rev = true; }
    }
    let q = left.splice(bi, 1)[0];
    if (rev) q = q.slice().reverse();
    out.push(q);
    p = q[q.length - 1];
  }
  return out;
}

// Ink limiter: at most maxMm of line per 5 mm square (a 0.3 mm pen then covers
// at most about half the square). Lines are broken where they would overfill a square.
export function inkLimit(paths, maxMm = 45, cell = 5) {
  const gw = Math.ceil(FRAME.W / cell), gh = Math.ceil(FRAME.H / cell);
  const ink = new Float64Array(gw * gh);
  const out = [];
  for (const p of paths) {
    let cur = [p[0]];
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i], L = dist(a, b);
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

function join(paths, gap = 0.3) {
  const out = [];
  for (const p of paths) {
    const last = out[out.length - 1];
    if (last && dist(last[last.length - 1], p[0]) <= gap) out[out.length - 1] = last.concat(p.slice(1));
    else out.push(p);
  }
  return out;
}

// Drawing-time and ink statistics. Speeds from the plan: pen down 50 mm/s,
// pen up 200 mm/s, 0.24 s per lift (0.12 s up + 0.12 s down).
export function stats(paths) {
  let down = 0, up = 0, pos = [0, FRAME.H];
  const cell = 5, gw = Math.ceil(FRAME.W / cell), gh = Math.ceil(FRAME.H / cell);
  const ink = new Float64Array(gw * gh);
  for (const p of paths) {
    up += dist(pos, p[0]);
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i], L = dist(a, b);
      down += L;
      const n = Math.max(1, Math.ceil(L));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const x = a[0] + t * (b[0] - a[0]), y = a[1] + t * (b[1] - a[1]);
        const ci = Math.min(gw - 1, Math.max(0, Math.floor(x / cell)));
        const cj = Math.min(gh - 1, Math.max(0, Math.floor(y / cell)));
        ink[cj * gw + ci] += L / n;
      }
    }
    pos = p[p.length - 1];
  }
  up += dist(pos, [0, FRAME.H]);
  const b = innerBox();
  let cells = 0, inked = 0, densest = 0;
  for (let j = Math.ceil(b.y0 / cell); j < Math.floor(b.y1 / cell); j++)
    for (let i = Math.ceil(b.x0 / cell); i < Math.floor(b.x1 / cell); i++) {
      cells++;
      const v = ink[j * gw + i];
      if (v > 0) inked++;
      if (v > densest) densest = v;
    }
  const lifts = paths.length;
  const seconds = down / 50 + up / 200 + lifts * 0.24;
  return {
    penDownM: down / 1000, penUpM: up / 1000, lifts,
    minutes: seconds / 60, coverage: inked / cells, densestMm: densest,
  };
}

export function compose(raw) {
  let paths = raw.filter((p) => p && p.length >= 2);
  paths = clip(paths);
  paths = inkLimit(paths, 45);
  paths = paths.map((p) => simplify(p, 0.1)).filter((p) => p.length >= 2 && lengthOf(p) > 1);
  paths = order(paths);
  paths = join(paths, 0.3);
  return { paths, stats: stats(paths) };
}

export function toSVG(paths, { label = '' } = {}) {
  const r = (v) => Math.round(v * 10);
  let d = '';
  for (const p of paths) {
    let px = r(p[0][0]), py = r(p[0][1]);
    d += 'M' + px / 10 + ' ' + py / 10;
    for (let i = 1; i < p.length; i++) {
      const qx = r(p[i][0]), qy = r(p[i][1]);
      if (qx === px && qy === py) continue;
      d += 'l' + (qx - px) / 10 + ' ' + (qy - py) / 10;
      px = qx; py = qy;
    }
  }
  return `<svg viewBox="0 0 ${FRAME.W} ${FRAME.H}" role="img" aria-label="${label}"><path class="inkline" d="${d}"/></svg>`;
}

// ---------- generators ----------
function chladni({ n = 3, m = 7, levels = 4 }) {
  const { W, H, M } = FRAME, w = W - 2 * M, h = H - 2 * M;
  const f = (x, y) => {
    const X = (x - M) / w, Y = (y - M) / h;
    return Math.cos(n * Math.PI * X) * Math.cos(m * Math.PI * Y) - Math.cos(m * Math.PI * X) * Math.cos(n * Math.PI * Y);
  };
  const L = [];
  for (let k = -levels; k <= levels; k++) L.push((k * 1.8) / (levels + 1));
  return contours(f, L, 1.5);
}

function cylinder({ g = 0.5, dpsi = 0.07 }) {
  const { W, H, M } = FRAME;
  const s = (H - 2 * M) / 6, cx = W / 2 - 0.9 * s, cy = H / 2, a = 1;
  const G = g * 4 * Math.PI * a; // circulation, as a fraction of 4πUa with U = a = 1
  const f = (x, y) => {
    const X = (x - cx) / s, Y = (cy - y) / s, r2 = X * X + Y * Y;
    if (r2 <= a * a) return NaN;
    return Y * (1 - (a * a) / r2) + (G / TAU) * Math.log(Math.sqrt(r2) / a);
  };
  let lo = Infinity, hi = -Infinity;
  const b = innerBox();
  for (let x = b.x0; x <= b.x1; x += 4) for (let y = b.y0; y <= b.y1; y += 4) {
    const v = f(x, y);
    if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  }
  const levels = [];
  for (let L = Math.floor(lo / dpsi) * dpsi + dpsi / 2; L < hi; L += dpsi) levels.push(L);
  const paths = contours(f, levels, 1.5);
  const circ = [];
  for (let k = 0; k <= 120; k++) { const t = (k / 120) * TAU; circ.push([cx + a * s * Math.cos(t), cy - a * s * Math.sin(t)]); }
  paths.push(circ);
  return paths;
}

function vortex({ u0 = 0.3, shift = 0, n = 64 }) {
  const { H, M } = FRAME;
  const s = (H - 2 * M) / 2.4, l = 1, h = 0.281;
  const cx = M - shift * s, cy = H / 2;
  const row = (X, Y, x0, y0, g) => {
    const c = Math.cosh((TAU * (Y - y0)) / l) - Math.cos((TAU * (X - x0)) / l);
    if (c < 4e-3) return NaN;
    return (g / (2 * TAU)) * Math.log(c);
  };
  const f = (x, y) => {
    const X = (x - cx) / s, Y = (cy - y) / s;
    const p = row(X, Y, 0, h / 2, 1), q = row(X, Y, l / 2, -h / 2, -1);
    if (!Number.isFinite(p) || !Number.isFinite(q)) return NaN;
    return p + q + u0 * Y;
  };
  const vals = [];
  const b = innerBox();
  for (let x = b.x0; x <= b.x1; x += 3) for (let y = b.y0; y <= b.y1; y += 3) { const v = f(x, y); if (Number.isFinite(v)) vals.push(v); }
  vals.sort((p, q) => p - q);
  const lo = vals[Math.floor(vals.length * 0.015)], hi = vals[Math.floor(vals.length * 0.985)];
  const levels = [];
  for (let k = 0; k < n; k++) levels.push(lo + ((k + 0.5) * (hi - lo)) / n);
  return contours(f, levels, 1.5);
}

function invNorm(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p <= 1 - pl) { const q = p - 0.5, r = q * q; return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

// Bohmian trajectories behind a double slit: two free Gaussian packets
// (ħ = m = 1, exact time evolution); each trajectory follows dq/dt = Im(ψ'/ψ).
function bohm({ d = 5, sigma = 0.5, T = 20, n = 32 }) {
  const { W, H, M } = FRAME;
  const sources = [d / 2, -d / 2];
  const s2 = sigma * sigma;
  const vel = (q, t) => {
    const sim = t / (2 * s2), sm2 = 1 + sim * sim;
    const isre = 1 / sm2, isim = -sim / sm2;
    const mod = Math.pow(sm2, -0.25), ang = -0.5 * Math.atan2(sim, 1);
    const hre = mod * Math.cos(ang), him = mod * Math.sin(ang);
    let pre = 0, pim = 0, dre = 0, dim = 0;
    for (const qj of sources) {
      const u = q - qj, k = -(u * u) / (4 * s2);
      const ex = Math.exp(k * isre), eim = k * isim;
      const cre = ex * Math.cos(eim), cim = ex * Math.sin(eim);
      const jre = hre * cre - him * cim, jim = hre * cim + him * cre;
      const fre = -(u / (2 * s2)) * isre, fim = -(u / (2 * s2)) * isim;
      dre += fre * jre - fim * jim; dim += fre * jim + fim * jre;
      pre += jre; pim += jim;
    }
    const m2 = pre * pre + pim * pim;
    if (!(m2 > 1e-300)) return 0;
    return Math.max(-80, Math.min(80, (dim * pre - dre * pim) / m2));
  };
  const steps = 2400, dt = T / steps;
  const trajs = [];
  for (const qj of sources) for (let i = 0; i < n; i++) {
    let q = qj + sigma * invNorm((i + 0.5) / n), t = 0;
    const tr = [[0, q]];
    for (let k = 0; k < steps; k++) {
      const k1 = vel(q, t), k2 = vel(q + 0.5 * dt * k1, t + 0.5 * dt);
      const k3 = vel(q + 0.5 * dt * k2, t + 0.5 * dt), k4 = vel(q + dt * k3, t + dt);
      q += (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
      t += dt;
      if (k % 2 === 1) tr.push([t, q]);
    }
    trajs.push(tr);
  }
  // Scale to the 80th-percentile trajectory, so a few fast outliers don't squeeze
  // the interference bands into the middle; the composer clips the outliers.
  const reach = trajs.map((tr) => tr.reduce((m, [, q]) => Math.max(m, Math.abs(q)), 0)).sort((a, b) => a - b);
  const qmax = reach[Math.floor(reach.length * 0.8)] * 1.05;
  const sy = (H / 2 - M) / qmax;
  const X = (t) => M + (t / T) * (W - 2 * M), Y = (q) => H / 2 - q * sy;
  const paths = trajs.map((tr) => tr.map(([t, q]) => [X(t), Y(q)]));
  const wall = M + 0.01, open = 2.2 * sigma;
  const yTop = Y(d / 2 + open), yTopIn = Y(d / 2 - open), yBotIn = Y(-d / 2 + open), yBot = Y(-d / 2 - open);
  paths.push([[wall, M], [wall, yTop]], [[wall, yTopIn], [wall, yBotIn]], [[wall, yBot], [wall, H - M]]);
  return paths;
}

function harmonograph({ seed = 7 }) {
  const r = rng(seed);
  const ratios = [[2, 3], [3, 4], [1, 2], [3, 5], [4, 5], [2, 5], [1, 3]];
  const [p, q] = ratios[Math.floor(r() * ratios.length)];
  // Small detuning and similar damping give the classic nested loops.
  const det = 0.002 + r() * 0.006;
  const d0 = 0.007 + r() * 0.004;
  const comp = (f) => [f, r() * TAU, d0 * (0.9 + r() * 0.2), 0.75 + r() * 0.25];
  const cx = [comp(p), comp(q * (1 + det))], cy = [comp(q), comp(p * (1 - det))];
  const ev = (cs, t) => cs.reduce((s, [f, ph, dm, A]) => s + A * Math.sin(f * t + ph) * Math.exp(-dm * t), 0);
  const tMax = Math.log(1 / 0.42) / Math.max(...[...cx, ...cy].map((c) => c[2]));
  const pts = [];
  for (let t = 0; t < tMax; t += 0.02) pts.push([ev(cx, t), ev(cy, t)]);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const b = innerBox();
  const sc = 0.97 * Math.min((b.x1 - b.x0) / (x1 - x0), (b.y1 - b.y0) / (y1 - y0));
  const mx = (b.x0 + b.x1) / 2 - sc * (x0 + x1) / 2, my = (b.y0 + b.y1) / 2 - sc * (y0 + y1) / 2;
  let line = pts.map(([x, y]) => [mx + sc * x, my + sc * y]);
  // budget: keep the pen-down length under 55 m by trimming the decayed tail
  let acc = 0;
  for (let i = 1; i < line.length; i++) { acc += dist(line[i - 1], line[i]); if (acc > 55000) { line = line.slice(0, i); break; } }
  return [line];
}

// Curl noise: the curl of a smooth noise field is divergence-free, so it looks
// like fluid flow; streamlines are placed evenly with the Jobard–Lefer method.
function curl({ seed = 3, scale = 150, dsep = 3.6 }) {
  const nz = noise2(seed), nz2 = noise2(seed + 101);
  const phi = (x, y) => nz(x / scale, y / scale) + 0.45 * nz2(x / (scale * 0.45), y / (scale * 0.45));
  const e = 0.5;
  const dir = (x, y) => {
    const vx = (phi(x, y + e) - phi(x, y - e)) / (2 * e);
    const vy = -(phi(x + e, y) - phi(x - e, y)) / (2 * e);
    const m = Math.hypot(vx, vy);
    return m < 1e-7 ? null : [vx / m, vy / m];
  };
  const box = innerBox(), dtest = 0.55 * dsep, step = 0.8;
  const cell = dsep, gw = Math.ceil((box.x1 - box.x0) / cell) + 1, gh = Math.ceil((box.y1 - box.y0) / cell) + 1;
  const grid = Array.from({ length: gw * gh }, () => []);
  const cidx = (x, y) => [Math.floor((x - box.x0) / cell), Math.floor((y - box.y0) / cell)];
  const near = (g, x, y, d, skipAfter = Infinity) => {
    const [cx, cy] = cidx(x, y), d2 = d * d;
    for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
      if (i < 0 || j < 0 || i >= gw || j >= gh) continue;
      const list = g instanceof Map ? g.get(j * gw + i) : g[j * gw + i];
      if (!list) continue;
      for (const pt of list) if ((pt[2] === undefined || pt[2] < skipAfter) && (pt[0] - x) ** 2 + (pt[1] - y) ** 2 < d2) return true;
    }
    return false;
  };
  const inside = (x, y) => x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1;
  const integrate = (x, y, sgn) => {
    const pts = [];
    const self = new Map();
    for (let k = 0; k < 4000; k++) {
      const d1 = dir(x, y); if (!d1) break;
      const d2 = dir(x + 0.5 * step * sgn * d1[0], y + 0.5 * step * sgn * d1[1]); if (!d2) break;
      const nx = x + step * sgn * d2[0], ny = y + step * sgn * d2[1];
      if (!inside(nx, ny) || near(grid, nx, ny, dtest) || near(self, nx, ny, dtest, k - 12)) break;
      pts.push([nx, ny]);
      const [ci, cj] = cidx(nx, ny), key = cj * gw + ci;
      const l = self.get(key); if (l) l.push([nx, ny, k]); else self.set(key, [[nx, ny, k]]);
      x = nx; y = ny;
    }
    return pts;
  };
  const r = rng(seed * 7 + 1);
  const lines = [], queue = [];
  const tryTrace = (sx, sy) => {
    if (!inside(sx, sy) || near(grid, sx, sy, dsep * 0.98)) return;
    const fwd = integrate(sx, sy, 1), bwd = integrate(sx, sy, -1);
    const line = bwd.reverse().concat([[sx, sy]], fwd);
    if (line.length < 14) return;
    for (const [x, y] of line) { const [i, j] = cidx(x, y); grid[j * gw + i].push([x, y]); }
    lines.push(line);
    for (let i = 2; i < line.length - 2; i += 3) {
      const tx = line[i + 1][0] - line[i - 1][0], ty = line[i + 1][1] - line[i - 1][1], tm = Math.hypot(tx, ty) || 1;
      const nx = -ty / tm, ny = tx / tm;
      queue.push([line[i][0] + nx * dsep, line[i][1] + ny * dsep], [line[i][0] - nx * dsep, line[i][1] - ny * dsep]);
    }
  };
  tryTrace((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2);
  for (let round = 0; round < 2; round++) {
    while (queue.length) { const [x, y] = queue.shift(); tryTrace(x, y); }
    for (let k = 0; k < 400; k++) tryTrace(box.x0 + r() * (box.x1 - box.x0), box.y0 + r() * (box.y1 - box.y0));
  }
  while (queue.length) { const [x, y] = queue.shift(); tryTrace(x, y); }
  return lines;
}

// ---------- catalogue ----------
const CHLADNI_PAIRS = [[1, 4], [2, 5], [3, 7], [2, 7], [4, 7], [1, 6], [3, 8], [5, 8], [2, 9], [4, 9], [5, 9], [3, 10]];

export const GENERATORS = {
  chladni: {
    run: chladni,
    defaults: { n: 3, m: 7, levels: 7 },
    vary(seed) { const r = rng(seed); const [n, m] = CHLADNI_PAIRS[Math.floor(r() * CHLADNI_PAIRS.length)]; return { n, m, levels: 5 + Math.floor(r() * 4) }; },
    label: (p) => `modes n = ${p.n}, m = ${p.m} · ${2 * p.levels + 1} contour levels`,
  },
  cylinder: {
    run: cylinder,
    defaults: { g: 0.55, dpsi: 0.07 },
    vary(seed) { const r = rng(seed); return { g: Math.round(r() * 100) / 100, dpsi: 0.06 + Math.round(r() * 3) * 0.01 }; },
    label: (p) => `circulation Γ = ${p.g.toFixed(2)} × 4πUa · Δψ = ${p.dpsi.toFixed(2)}`,
  },
  vortex: {
    run: vortex,
    defaults: { u0: 0.3, shift: 0, n: 64 },
    vary(seed) { const r = rng(seed); return { u0: Math.round((0.1 + r() * 0.5) * 100) / 100, shift: Math.round(r() * 100) / 100, n: 52 + Math.floor(r() * 24) }; },
    label: (p) => `background flow ${p.u0.toFixed(2)} · ${p.n} streamline levels · h/l = 0.281`,
  },
  bohm: {
    run: bohm,
    defaults: { d: 5, sigma: 0.5, T: 20, n: 32 },
    vary(seed) { const r = rng(seed); return { d: Math.round((3 + r() * 5) * 10) / 10, sigma: Math.round((0.35 + r() * 0.4) * 100) / 100, T: 20, n: 28 + Math.floor(r() * 10) }; },
    label: (p) => `slit separation ${p.d} · packet width σ = ${p.sigma} · ${2 * p.n} trajectories`,
  },
  harmonograph: {
    run: harmonograph,
    defaults: { seed: 11 },
    vary(seed) { return { seed }; },
    label: (p) => `seed ${p.seed} · one continuous line`,
  },
  curl: {
    run: curl,
    defaults: { seed: 5, scale: 150, dsep: 3.6 },
    vary(seed) { const r = rng(seed); return { seed, scale: 110 + Math.round(r() * 90), dsep: 3.6 }; },
    label: (p) => `seed ${p.seed} · noise scale ${p.scale} mm · line spacing ${p.dsep} mm`,
  },
};

export function make(key, params) {
  const g = GENERATORS[key];
  const p = params || g.defaults;
  const { paths, stats } = compose(g.run(p));
  return { key, params: p, label: g.label(p), paths, stats };
}
