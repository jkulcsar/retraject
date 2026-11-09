// Presentation helpers shared by the build script and the page.
export function statsHTML(s) {
  const ok = s.minutes <= 40;
  const chip = ok ? '<span class="chip ok">within budget</span>' : '<span class="chip over">over budget</span>';
  return (
    `<div><dt>Drawing time</dt><dd>about ${Math.max(1, Math.round(s.minutes))} min ${chip}</dd></div>` +
    `<div><dt>Pen down</dt><dd>${s.penDownM.toFixed(1)} m of line</dd></div>` +
    `<div><dt>Pen up</dt><dd>${s.penUpM.toFixed(1)} m travel · ${s.lifts} lifts</dd></div>` +
    `<div><dt>Coverage</dt><dd>${Math.round(s.coverage * 100)}% of 5 mm squares</dd></div>` +
    `<div><dt>Densest spot</dt><dd>${Math.round(s.densestMm)} mm of line in a 5 mm square</dd></div>`
  );
}

// Sweeps run for hours with a ballpoint, so they get their own facts.
export function sweepStatsHTML(s, seconds, where) {
  const h = Math.floor(s.minutes / 60), m = Math.round(s.minutes % 60);
  const time = h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
  return (
    `<div><dt>Drawing time</dt><dd>about ${time}</dd></div>` +
    `<div><dt>Pen down</dt><dd>${Math.round(s.penDownM)} m of line</dd></div>` +
    `<div><dt>Pen up</dt><dd>${s.penUpM.toFixed(1)} m travel · ${s.lifts} lifts</dd></div>` +
    `<div><dt>Densest spot</dt><dd>${Math.round(s.densestMm)} mm of line in a 5 mm square</dd></div>` +
    `<div><dt>Computed</dt><dd>in ${seconds.toFixed(1)} s ${where}</dd></div>`
  );
}
