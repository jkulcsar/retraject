// Builds living-picture-generators.html: default pictures baked in as static SVG,
// the generator code inlined so the page can compute new variations itself.
import { readFileSync, writeFileSync } from 'node:fs';
import { make, toSVG } from './gen.js';
import { statsHTML } from './present.js';

const here = new URL('.', import.meta.url).pathname;
const genSrc = readFileSync(here + 'gen.js', 'utf8');
const presentSrc = readFileSync(here + 'present.js', 'utf8');

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

const tpl = readFileSync(here + 'page.html', 'utf8');
const out = tpl
  .replace('<!--CARDS-->', cardsHTML)
  .replace('<!--SERIES-->', seriesHTML)
  .replace('/*GENJS*/', () => genSrc + '\n' + presentSrc);
writeFileSync(here + 'living-picture-generators.html', out);
console.log('written', (out.length / 1024).toFixed(0), 'KB');
