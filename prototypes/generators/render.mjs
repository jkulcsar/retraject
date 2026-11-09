// Render a sweep to PNG with the ink preview, and print its budget.
//   node prototypes/generators/render.mjs out.png '{"seed":3,"K":5}'
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { sweep, composeSweep } from './sweep.js';
import { inkRaster } from './ink.js';
import { lengthOf } from './gen.js';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function png(W, H, rgba) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const s = 4 * (y * W + x), d = y * (W * 3 + 1) + 1 + 3 * x;
      raw[d] = rgba[s]; raw[d + 1] = rgba[s + 1]; raw[d + 2] = rgba[s + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

export function pngGray(W, H, gray) {
  const raw = Buffer.alloc((W + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W + 1)] = 0;
    for (let x = 0; x < W; x++) raw[y * (W + 1) + 1 + x] = gray[y * W + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

export function budget(paths) {
  let down = 0, up = 0, pos = [0, 330];
  for (const p of paths) { up += Math.hypot(p[0][0] - pos[0], p[0][1] - pos[1]); down += lengthOf(p); pos = p[p.length - 1]; }
  const minutes = (down / 50 + up / 200 + paths.length * 0.24) / 60;
  return { metres: down / 1000, lifts: paths.length, minutes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] || 'sweep.png';
  const params = JSON.parse(process.argv[3] || '{}');
  const t0 = Date.now();
  const { paths } = composeSweep(sweep(params));
  const t1 = Date.now();
  const img = inkRaster(paths, { box: { x0: 0, y0: 0, w: 350, h: 330 }, ppm: params.ppm || 3, pen: 0.35 });
  writeFileSync(out, png(img.W, img.H, img.rgba));
  const b = budget(paths);
  let maxd = 0; for (const d of img.dens) if (d > maxd) maxd = d;
  console.log(`${out}: computed in ${((t1 - t0) / 1000).toFixed(1)} s, ${b.metres.toFixed(0)} m of line, ` +
    `${b.lifts} lifts, ~${(b.minutes / 60).toFixed(1)} h at 50 mm/s, peak ink ${maxd.toFixed(1)} px²/px²`);
}
