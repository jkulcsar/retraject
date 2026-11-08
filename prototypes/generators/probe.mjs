import { make, toSVG, GENERATORS } from './gen.js';
for (const key of Object.keys(GENERATORS)) {
  const t0 = performance.now();
  const r = make(key);
  const ms = performance.now() - t0;
  const s = r.stats;
  const svg = toSVG(r.paths);
  console.log(`${key.padEnd(12)} ${ms.toFixed(0).padStart(5)} ms  down ${s.penDownM.toFixed(1)} m  up ${s.penUpM.toFixed(1)} m  lifts ${String(s.lifts).padStart(4)}  ${s.minutes.toFixed(1)} min  cover ${(s.coverage*100).toFixed(0)}%  densest ${s.densestMm.toFixed(0)} mm  svg ${(svg.length/1024).toFixed(0)} KB`);
}
