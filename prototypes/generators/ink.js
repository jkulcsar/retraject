// Ink preview: how stacked pen lines look on paper. Plain SVG strokes do not
// darken where lines pile up; real ink does. This splats every line into a
// grid as ink area per pixel, then turns that into colour with Beer–Lambert
// absorption (each layer of ink takes away a fraction of the light).

export const INKS = {
  blue: { paper: [248, 247, 243], absorb: [1.25, 1.05, 0.22] }, // ballpoint blue (PowerTank-like)
  black: { paper: [248, 247, 243], absorb: [1.1, 1.1, 1.1] },
  sepia: { paper: [248, 245, 236], absorb: [0.5, 0.75, 1.1] },
};

// paths in mm; box = {x0, y0, w, h} in mm; ppm = pixels per mm; pen = line width (mm)
export function inkRaster(paths, { box, ppm = 4, pen = 0.35, ink = 'blue' }) {
  const W = Math.round(box.w * ppm), H = Math.round(box.h * ppm);
  const dens = new Float32Array(W * H);
  const step = 0.5; // sample spacing along a line, in pixels
  const area = pen * ppm * step; // ink area (px²) deposited per sample
  for (const p of paths) {
    for (let i = 1; i < p.length; i++) {
      const ax = (p[i - 1][0] - box.x0) * ppm, ay = (p[i - 1][1] - box.y0) * ppm;
      const bx = (p[i][0] - box.x0) * ppm, by = (p[i][1] - box.y0) * ppm;
      const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(L / step));
      const w = (area * L) / (n * step);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, x = ax + t * (bx - ax) - 0.5, y = ay + t * (by - ay) - 0.5;
        const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
        if (xi < 0 || yi < 0 || xi >= W - 1 || yi >= H - 1) continue;
        const o = yi * W + xi;
        dens[o] += w * (1 - fx) * (1 - fy);
        dens[o + 1] += w * fx * (1 - fy);
        dens[o + W] += w * (1 - fx) * fy;
        dens[o + W + 1] += w * fx * fy;
      }
    }
  }
  const gray = toGray(dens);
  return { W, H, dens, gray, rgba: colorize(gray, ink) };
}

// Ink density stored as one byte per pixel: g = 255·e^(−0.35·d). Pages ship
// this grey image (a third of the size of a colour one) and colour it on load.
const GRAY_K = 0.35;

export function toGray(dens) {
  const g = new Uint8Array(dens.length);
  for (let i = 0; i < dens.length; i++) g[i] = Math.round(255 * Math.exp(-GRAY_K * dens[i]));
  return g;
}

export function colorize(gray, ink = 'blue') {
  const { paper, absorb } = INKS[ink] || INKS.blue;
  const lut = new Uint8ClampedArray(256 * 3);
  for (let g = 0; g < 256; g++) {
    const d = -Math.log(Math.max(g, 0.5) / 255) / GRAY_K;
    for (let c = 0; c < 3; c++) lut[3 * g + c] = paper[c] * Math.exp(-absorb[c] * d);
  }
  const rgba = new Uint8ClampedArray(gray.length * 4);
  for (let i = 0; i < gray.length; i++) {
    const o = 3 * gray[i];
    rgba[4 * i] = lut[o]; rgba[4 * i + 1] = lut[o + 1]; rgba[4 * i + 2] = lut[o + 2]; rgba[4 * i + 3] = 255;
  }
  return rgba;
}
