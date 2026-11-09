// Builds living-picture-generators.html: default pictures baked in as static SVG,
// the generator code inlined so the page can compute new variations itself.
import { readFileSync, writeFileSync } from 'node:fs';
import { make, toSVG } from './gen.js';
import { statsHTML, sweepStatsHTML } from './present.js';
import { sweep, sheetSteps, composeSweep, SWEEP_PRESETS, SWEEP_DEFAULTS } from './sweep.js';
import { inkRaster } from './ink.js';
import { pngGray } from './render.mjs';

const here = new URL('.', import.meta.url).pathname;
const genSrc = readFileSync(here + 'gen.js', 'utf8');
const presentSrc = readFileSync(here + 'present.js', 'utf8');
// sweep.js imports from gen.js; inlined into the same module, those names already exist
const sweepSrc = readFileSync(here + 'sweep.js', 'utf8').replace(/^import .*$/m, '');
const inkSrc = readFileSync(here + 'ink.js', 'utf8');
const grayURI = (img) => 'data:image/png;base64,' + pngGray(img.W, img.H, img.gray).toString('base64');

const CARDS = [
  { key: 'chladni', tag: 'Waves · vibrating plate', title: 'Chladni figure',
    text: 'Sand on a vibrating plate gathers on the lines that stay still. Each pair of mode numbers gives a new figure; the contour lines around the nodal line trace the shape of the plate.',
    formula: 'cos(nπx)·cos(mπy) − cos(mπx)·cos(nπy) = c' },
  { key: 'cylinder', tag: 'Fluids · potential flow', title: 'Flow past a spinning cylinder',
    text: 'Streamlines of an ideal fluid around a cylinder. Spin adds circulation: the flow speeds up over the top and slows underneath, and the cylinder feels lift, the Magnus effect.',
    formula: 'ψ = U·y·(1 − a²/r²) + (Γ/2π)·ln(r/a)' },
  { key: 'vortex', tag: 'Fluids · vortex rows', title: 'Kármán vortex street',
    text: 'The alternating eddies behind a post in a stream, drawn as the streamlines of two staggered rows of vortices at von Kármán’s stable spacing.',
    formula: 'ψ = Σ ±(Γ/4π)·ln[cosh(2π(y ∓ h/2)/l) − cos(2π(x − x₀)/l)] + U₀·y' },
  { key: 'bohm', tag: 'Quantum · trajectories', title: 'Bohmian double slit',
    text: 'Particle paths behind two slits in Bohm’s formulation of quantum mechanics. The paths never cross, yet they gather into the bands of the interference pattern. The composer thinned the crowded region at the slits.',
    formula: 'dq/dt = (ħ/m)·Im(∂ψ/∂q ÷ ψ), ψ = two spreading Gaussian packets' },
  { key: 'harmonograph', tag: 'Dynamics · damped pendulums', title: 'Harmonograph',
    text: 'The Victorian drawing machine: swinging pendulums move pen and paper, and their slowly fading motion draws one continuous line.',
    formula: 'x = Σ Aᵢ·sin(fᵢt + φᵢ)·e^(−dᵢt), y likewise' },
  { key: 'curl', tag: 'Fluids · evenly spaced streamlines', title: 'Curl-noise flow',
    text: 'The curl of a smooth random field has no sources or sinks, so it moves like an incompressible fluid. Streamlines are placed a fixed distance apart (Jobard–Lefer), which fills the frame evenly.',
    formula: 'v = (∂φ/∂y, −∂φ/∂x), φ = smooth noise' },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

let cardsHTML = '';
for (const c of CARDS) {
  const r = make(c.key);
  cardsHTML += `
      <article class="card" data-gen="${c.key}" data-seed="100">
        <header><span class="tag">${c.tag}</span><h3>${c.title}</h3></header>
        <div class="art"><div class="matb"><div class="sheet" data-role="svg">${toSVG(r.paths, { label: c.title })}</div></div></div>
        <div class="row">
          <p class="params" data-role="label">${esc(r.label)}</p>
          <button type="button" id="next-${c.key}">New variation</button>
        </div>
        <p class="text">${c.text}</p>
        <p class="formula">${esc(c.formula)}</p>
        <dl class="facts" data-role="stats">${statsHTML(r.stats)}</dl>
      </article>`;
}

const series = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
let seriesHTML = '';
series.forEach((g, i) => {
  const r = make('cylinder', { g, dpsi: 0.09 });
  seriesHTML += `
        <li><div class="art small"><div class="matb"><div class="sheet">${toSVG(r.paths, { label: `Picture ${i + 1}: circulation ${g} times 4πUa` })}</div></div></div>
        <span class="cap"><b>${String(i + 1).padStart(2, '0')}</b> Γ = ${g.toFixed(1)} × 4πUa</span></li>`;
});

// ---------- sweeps ----------
const SWEEP_BOX = { x0: 0, y0: 0, w: 350, h: 330 };
let sweepHTML = '';
for (const [key, pr] of Object.entries(SWEEP_PRESETS)) {
  const t0 = Date.now();
  const { paths, stats } = composeSweep(sweep(pr.params));
  const seconds = (Date.now() - t0) / 1000;
  const img = inkRaster(paths, { box: SWEEP_BOX, ppm: 3, pen: 0.35 });
  const seed = pr.params.seed ?? SWEEP_DEFAULTS.seed;
  console.log(`sweep ${key}: ${seconds.toFixed(1)} s, ${stats.penDownM.toFixed(0)} m`);
  sweepHTML += `
      <article class="card" data-sweep="${key}" data-seed="${seed}">
        <header><span class="tag">${esc(pr.note)}</span><h3>${pr.title}</h3></header>
        <div class="art"><div class="matb"><div class="sheet"><canvas data-role="img" data-gray="${grayURI(img)}" width="${img.W}" height="${img.H}" role="img" aria-label="${pr.title}: stacked pen lines forming translucent veils around a central hole, previewed as ballpoint ink"></canvas></div></div></div>
        <div class="row">
          <p class="params" data-role="label">seed ${seed}</p>
          <button type="button">New variation</button>
        </div>
        <dl class="facts" data-role="stats">${sweepStatsHTML(stats, seconds, 'on the build machine')}</dl>
      </article>`;
}

// One sheet, built up snapshot by snapshot
const COUNTS = [1, 4, 15, 55];
const steps = sheetSteps(SWEEP_PRESETS.veils.params, 3, COUNTS);
let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
for (const q of steps[steps.length - 1]) for (const [x, y] of q) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
const side = Math.max(bx1 - bx0, by1 - by0) + 16;
const stepBox = { x0: (bx0 + bx1 - side) / 2, y0: (by0 + by1 - side) / 2, w: side, h: side };
let stepsHTML = '';
steps.forEach((paths, i) => {
  const img = inkRaster(paths, { box: stepBox, ppm: Math.min(6, 520 / side), pen: 0.35 });
  const n = COUNTS[i];
  stepsHTML += `
        <li><div class="art small"><div class="matb"><div class="sheet"><canvas data-gray="${grayURI(img)}" width="${img.W}" height="${img.H}" role="img" aria-label="One sheet after ${n} snapshot${n > 1 ? 's' : ''}"></canvas></div></div></div>
        <span class="cap"><b>${String(n).padStart(2, '0')}</b> snapshot${n > 1 ? 's' : ''}</span></li>`;
});

const tpl = readFileSync(here + 'page.html', 'utf8');
const out = tpl
  .replace('<!--CARDS-->', cardsHTML)
  .replace('<!--SERIES-->', seriesHTML)
  .replace('<!--SWEEPS-->', sweepHTML)
  .replace('<!--STEPS-->', stepsHTML)
  .replace('/*GENJS*/', () => genSrc + '\n' + presentSrc + '\n' + sweepSrc + '\n' + inkSrc);
writeFileSync(here + 'living-picture-generators.html', out);
console.log('written', (out.length / 1024).toFixed(0), 'KB');
