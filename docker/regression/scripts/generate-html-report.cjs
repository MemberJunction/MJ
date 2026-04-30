#!/usr/bin/env node
// Generate an HTML screenshot gallery with lightbox + action overlay.
//
// Usage: RUN_DIR=/path/to/run TIMESTAMP=20260416T... node generate-html-report.cjs
//
// Reads:  RUN_DIR/results.json, RUN_DIR/screenshots/<test>/steps.json
// Writes: RUN_DIR/report.html

const fs = require('fs');
const path = require('path');

const runDir = process.env.RUN_DIR;
const timestamp = process.env.TIMESTAMP;

if (!runDir) { console.error('RUN_DIR not set'); process.exit(1); }

try {
  const r = JSON.parse(fs.readFileSync(path.join(runDir, 'results.json'), 'utf8'));
  const screenshotsDir = path.join(runDir, 'screenshots');

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const statusBadge = s => {
    const colors = { Passed: '#16a34a', Failed: '#dc2626', Timeout: '#ea580c', Error: '#dc2626', Skipped: '#6b7280' };
    return `<span class="badge" style="background:${colors[s] || '#6b7280'}">${esc(s)}</span>`;
  };

  const sections = [];

  for (const t of (r.testResults || [])) {
    const safeName = t.testName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const testDir = path.join(screenshotsDir, safeName);

    // Load step metadata if available
    let stepsData = [];
    const stepsFile = path.join(testDir, 'steps.json');
    if (fs.existsSync(stepsFile)) {
      try { stepsData = JSON.parse(fs.readFileSync(stepsFile, 'utf8')); } catch {}
    }
    const stepMap = {};
    for (const s of stepsData) { stepMap[s.file] = s; }

    let screenshots = [];
    if (fs.existsSync(testDir)) {
      screenshots = fs.readdirSync(testDir).filter(f => f.endsWith('.png')).sort();
    }

    const goalOracle = (t.oracleResults || []).find(o => o.oracleType === 'goal-completion');
    const judgeReason = goalOracle?.details?.reason || goalOracle?.details?.judgeReason || '';

    const oracleRows = (t.oracleResults || []).map(o =>
      `<tr><td>${esc(o.oracleType)}</td>` +
      `<td>${o.passed ? '<span class="pass">PASS</span>' : '<span class="fail">FAIL</span>'}</td>` +
      `<td>${o.score != null ? (o.score * 100).toFixed(0) + '%' : '-'}</td>` +
      `<td>${esc((o.message || '').substring(0, 200))}</td></tr>`
    ).join('');

    // Build gallery with data attributes for the lightbox.
    // Actions are full JSON objects (with coordinates/bbox) — base64-encode to avoid HTML escaping issues.
    const gallery = screenshots.map(f => {
      const relPath = `screenshots/${safeName}/${f}`;
      const meta = stepMap[f] || {};
      const reasoning = esc(meta.reasoning || '');
      const actionsB64 = Buffer.from(JSON.stringify(meta.actions || [])).toString('base64');
      const url = esc(meta.url || '');
      const stepNum = meta.step || f.replace(/\D/g, '');
      return `<div class="shot" data-src="${relPath}" data-step="${stepNum}" ` +
             `data-reasoning="${reasoning}" data-actions-b64="${actionsB64}" data-url="${url}" ` +
             `onclick="openLightbox(this)">` +
             `<img loading="lazy" src="${relPath}" alt="Step ${stepNum}">` +
             `<span class="shot-label">Step ${stepNum}</span></div>`;
    }).join('');

    sections.push(
      `<details class="test ${t.status === 'Passed' ? 'test-pass' : 'test-fail'}" ${t.status === 'Passed' ? '' : 'open'}>` +
      `<summary>${statusBadge(t.status)}` +
      `<span class="test-name">${esc(t.testName)}</span>` +
      `<span class="test-meta">` +
      `score: ${t.score != null ? (t.score * 100).toFixed(0) + '%' : '-'}` +
      ` \u00b7 steps: ${goalOracle?.details?.totalSteps ?? '-'}` +
      ` \u00b7 ${t.durationMs != null ? Math.round(t.durationMs / 1000) + 's' : '-'}` +
      ` \u00b7 screenshots: ${screenshots.length}` +
      `</span></summary>` +
      `<div class="test-body">` +
      (judgeReason ? `<p class="judge-reason"><strong>Judge:</strong> ${esc(judgeReason)}</p>` : '') +
      `<table class="oracles"><thead><tr><th>Oracle</th><th>Result</th><th>Score</th><th>Message</th></tr></thead><tbody>${oracleRows}</tbody></table>` +
      (screenshots.length > 0 ? `<div class="gallery">${gallery}</div>` : '<p class="no-shots">No screenshots.</p>') +
      `</div></details>`
    );
  }

  const passedCount = (r.testResults || []).filter(t => t.status === 'Passed').length;
  const failedCount = (r.testResults || []).filter(t => t.status !== 'Passed').length;
  const overallStatus = failedCount === 0 ? 'PASSED' : 'FAILED';

  // ─── CSS ─────────────────────────────────────────────────

  const css = `
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:1400px;margin:2rem auto;padding:0 1.5rem;color:#1f2937;background:#f9fafb}
h1{margin:0 0 .5rem;font-size:1.75rem}.subtitle{color:#6b7280;margin-bottom:1.5rem}
.summary{display:flex;gap:2rem;padding:1rem 1.25rem;background:#fff;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:1.5rem;flex-wrap:wrap}
.summary div{font-size:.875rem;color:#6b7280}.summary div strong{display:block;font-size:1.25rem;color:#1f2937;margin-top:.125rem}
.status-PASSED{color:#16a34a!important}.status-FAILED{color:#dc2626!important}
.badge{display:inline-block;color:#fff;padding:.125rem .5rem;border-radius:4px;font-size:.7rem;font-weight:600;letter-spacing:.05em;margin-right:.5rem}
.test{background:#fff;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:.75rem;overflow:hidden}
.test-pass{border-left:3px solid #16a34a}.test-fail{border-left:3px solid #dc2626}
summary{padding:.75rem 1rem;cursor:pointer;font-size:.95rem;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;list-style:none}
summary::-webkit-details-marker{display:none}
.test-name{font-weight:600;flex:1}.test-meta{color:#6b7280;font-size:.8rem;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.test-body{padding:1rem;border-top:1px solid #f3f4f6;background:#fafafa}
.judge-reason{background:#fff;padding:.75rem 1rem;border-left:3px solid #6b7280;margin:0 0 1rem;font-size:.875rem;color:#374151}
table.oracles{width:100%;border-collapse:collapse;font-size:.8rem;background:#fff;margin-bottom:1rem;border:1px solid #e5e7eb}
table.oracles th,table.oracles td{padding:.5rem .75rem;text-align:left;border-bottom:1px solid #f3f4f6}
table.oracles th{background:#f9fafb;font-weight:600}
.pass{color:#16a34a;font-weight:600}.fail{color:#dc2626;font-weight:600}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.75rem}
.shot{display:block;background:#fff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;cursor:pointer;transition:transform .1s ease,box-shadow .1s ease}
.shot:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.08)}
.shot img{display:block;width:100%;height:auto;background:#f3f4f6}
.shot-label{display:block;padding:.375rem .5rem;font-size:.7rem;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#6b7280;text-align:center;background:#fafafa;border-top:1px solid #f3f4f6}
.no-shots{color:#9ca3af;font-style:italic;margin:0}
footer{margin-top:2rem;padding-top:1rem;border-top:1px solid #e5e7eb;color:#6b7280;font-size:.8rem;text-align:center}

/* Lightbox */
.lightbox-overlay{display:none;position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.75);backdrop-filter:blur(4px);justify-content:center;align-items:flex-start;padding:2rem;overflow-y:auto}
.lightbox-overlay.active{display:flex}
.lightbox{background:#fff;border-radius:12px;max-width:1100px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden}
.lb-header{display:flex;justify-content:space-between;align-items:center;padding:.75rem 1.25rem;background:#1f2937;color:#fff;font-size:.875rem;font-weight:600}
.lb-close{background:none;border:none;color:#fff;font-size:1.5rem;cursor:pointer;padding:0 .25rem;line-height:1}
.lb-close:hover{color:#f87171}
.lb-body{display:flex;gap:0}
.lb-img-wrap{flex:1;min-width:0;background:#111;display:flex;align-items:center;justify-content:center;position:relative}
.lb-img-wrap img{display:block;max-width:100%;max-height:75vh;object-fit:contain}
.lb-sidebar{width:340px;flex-shrink:0;padding:1.25rem;border-left:1px solid #e5e7eb;overflow-y:auto;max-height:75vh;font-size:.85rem}
.lb-section{margin-bottom:1rem}
.lb-section-title{font-weight:700;font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:.375rem}
.lb-reasoning{color:#374151;line-height:1.5}
.lb-actions{list-style:none;padding:0;margin:0}
.lb-actions li{padding:.375rem .625rem;background:#f3f4f6;border-radius:4px;margin-bottom:.375rem;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.75rem;color:#1f2937}
.lb-url{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.75rem;color:#6b7280;word-break:break-all}
.lb-nav{display:flex;gap:.5rem;padding:.75rem 1.25rem;background:#f9fafb;border-top:1px solid #e5e7eb;justify-content:center}
.lb-nav button{padding:.375rem 1rem;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:.8rem;color:#374151}
.lb-nav button:hover{background:#f3f4f6}
.lb-nav button:disabled{opacity:.4;cursor:default}
.lb-nav button.active{background:#1f2937;color:#fff;border-color:#1f2937}

/* Action overlay — SVG uses viewBox 0 0 1000 1000 matching the controller coordinate space */
.action-overlay{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;display:none}
.action-overlay.visible{display:block}
.action-overlay svg{width:100%;height:100%}
.ov-click{fill:rgba(239,68,68,.35);stroke:#ef4444;stroke-width:2}
.ov-bbox{fill:rgba(59,130,246,.12);stroke:#3b82f6;stroke-width:2;stroke-dasharray:6,3}
.ov-click-label,.ov-type-label,.ov-scroll-label,.ov-nav-label{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;fill:#fff;paint-order:stroke;stroke:#000;stroke-width:3px;stroke-linejoin:round}
.ov-scroll-arrow{stroke:#a855f7;stroke-width:3;fill:none;marker-end:url(#arrowhead)}
.ov-type-box{fill:rgba(16,185,129,.25);stroke:#10b981;stroke-width:2;rx:4}
.ov-nav-box{fill:rgba(245,158,11,.2);stroke:#f59e0b;stroke-width:2;rx:4}
.ov-wait-box{fill:rgba(107,114,128,.2);stroke:#6b7280;stroke-width:2;rx:4}
.ov-keypress-box{fill:rgba(139,92,246,.25);stroke:#8b5cf6;stroke-width:2;rx:4}

@media(max-width:768px){.lb-body{flex-direction:column}.lb-sidebar{width:100%;max-height:40vh;border-left:none;border-top:1px solid #e5e7eb}}
`;

  // ─── Client-side JS ──────────────────────────────────────

  const js = `
var lbData = []; var lbIdx = 0; var overlayVisible = false;

function openLightbox(el) {
  var gallery = el.closest('.gallery');
  if (!gallery) return;
  lbData = Array.from(gallery.querySelectorAll('.shot')).map(function(s) {
    var actions = [];
    try { actions = JSON.parse(atob(s.dataset.actionsB64 || '')); } catch(e) {}
    return { src: s.dataset.src, step: s.dataset.step, reasoning: s.dataset.reasoning || '',
             actions: actions, url: s.dataset.url || '' };
  });
  lbIdx = lbData.indexOf(lbData.find(function(d) { return d.src === el.dataset.src; })) || 0;
  overlayVisible = false;
  renderLightbox();
  document.getElementById('lightbox-overlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightbox-overlay').classList.remove('active');
  document.body.style.overflow = '';
}

function lbPrev() { if (lbIdx > 0) { lbIdx--; renderLightbox(); } }
function lbNext() { if (lbIdx < lbData.length - 1) { lbIdx++; renderLightbox(); } }

function toggleOverlay() {
  overlayVisible = !overlayVisible;
  var ov = document.getElementById('action-overlay');
  var btn = document.getElementById('lb-overlay-btn');
  if (overlayVisible) { ov.classList.add('visible'); btn.classList.add('active'); }
  else { ov.classList.remove('visible'); btn.classList.remove('active'); }
}

function actionLabel(a) {
  switch (a.type) {
    case 'Click': return (a.clickCount > 1 ? 'Dbl-' : '') + (a.button === 'right' ? 'Right-' : '') + 'Click';
    case 'Type': return 'Type: "' + (a.text || '').substring(0, 25) + (a.text && a.text.length > 25 ? '...' : '') + '"';
    case 'Scroll': return 'Scroll(' + (a.deltaX||0) + ',' + (a.deltaY||0) + ')';
    case 'Wait': return 'Wait ' + (a.durationMs||0) + 'ms';
    case 'Navigate': return 'Navigate';
    case 'Keypress': case 'KeyDown': case 'KeyUp': return a.type + ': ' + (a.key||'');
    default: return a.type;
  }
}

function buildOverlaySvg(actions) {
  // All coordinates are in a 1000x1000 normalized space.
  // The SVG viewBox matches, so it scales to the image automatically.
  var els = [];
  els.push('<defs><marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#a855f7"/></marker></defs>');
  var labelIdx = 0;
  for (var i = 0; i < actions.length; i++) {
    var a = actions[i];
    var label = actionLabel(a);
    labelIdx++;
    switch (a.type) {
      case 'Click': {
        var cx = a.x || 0, cy = a.y || 0;
        els.push('<circle cx="'+cx+'" cy="'+cy+'" r="18" class="ov-click"/>');
        els.push('<circle cx="'+cx+'" cy="'+cy+'" r="4" fill="#ef4444"/>');
        if (a.bbox) {
          els.push('<rect x="'+a.bbox.xMin+'" y="'+a.bbox.yMin+'" width="'+(a.bbox.xMax-a.bbox.xMin)+'" height="'+(a.bbox.yMax-a.bbox.yMin)+'" class="ov-bbox"/>');
        }
        var ly = Math.max(cy - 28, 16);
        els.push('<text x="'+cx+'" y="'+ly+'" text-anchor="middle" class="ov-click-label">'+labelIdx+'. '+label+'</text>');
        break;
      }
      case 'Type': {
        var ty = 30 + labelIdx * 28;
        els.push('<rect x="20" y="'+(ty-16)+'" width="960" height="24" class="ov-type-box"/>');
        els.push('<text x="30" y="'+ty+'" class="ov-type-label">'+labelIdx+'. '+label+'</text>');
        break;
      }
      case 'Scroll': {
        var sx = 500, sy1 = 400, sy2 = 400 + Math.min(Math.max(a.deltaY || 0, -200), 200);
        if (a.deltaY !== 0) els.push('<line x1="'+sx+'" y1="'+sy1+'" x2="'+sx+'" y2="'+sy2+'" class="ov-scroll-arrow"/>');
        if (a.deltaX !== 0) {
          var sx2 = 500 + Math.min(Math.max(a.deltaX || 0, -200), 200);
          els.push('<line x1="'+sx+'" y1="500" x2="'+sx2+'" y2="500" class="ov-scroll-arrow"/>');
        }
        els.push('<text x="500" y="'+(Math.min(sy1,sy2)-12)+'" text-anchor="middle" class="ov-scroll-label">'+labelIdx+'. '+label+'</text>');
        break;
      }
      case 'Navigate': {
        var ny = 30 + labelIdx * 28;
        els.push('<rect x="20" y="'+(ny-16)+'" width="960" height="24" class="ov-nav-box"/>');
        var navText = label + (a.url ? ': ' + a.url.substring(0, 60) : '');
        els.push('<text x="30" y="'+ny+'" class="ov-nav-label">'+labelIdx+'. '+navText+'</text>');
        break;
      }
      case 'Wait': {
        var wy = 30 + labelIdx * 28;
        els.push('<rect x="20" y="'+(wy-16)+'" width="960" height="24" class="ov-wait-box"/>');
        els.push('<text x="30" y="'+wy+'" class="ov-nav-label">'+labelIdx+'. '+label+'</text>');
        break;
      }
      case 'Keypress': case 'KeyDown': case 'KeyUp': {
        var ky = 30 + labelIdx * 28;
        els.push('<rect x="20" y="'+(ky-16)+'" width="960" height="24" class="ov-keypress-box"/>');
        els.push('<text x="30" y="'+ky+'" class="ov-nav-label">'+labelIdx+'. '+label+'</text>');
        break;
      }
      case 'GoBack': case 'GoForward': case 'Refresh': {
        var ry = 30 + labelIdx * 28;
        els.push('<rect x="20" y="'+(ry-16)+'" width="960" height="24" class="ov-nav-box"/>');
        els.push('<text x="30" y="'+ry+'" class="ov-nav-label">'+labelIdx+'. '+a.type+'</text>');
        break;
      }
    }
  }
  return '<svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet">' + els.join('') + '</svg>';
}

function renderLightbox() {
  var d = lbData[lbIdx]; if (!d) return;
  document.getElementById('lb-img').src = d.src;
  document.getElementById('lb-title').textContent = 'Step ' + d.step + ' of ' + lbData.length;
  document.getElementById('lb-reasoning').textContent = d.reasoning || '(no reasoning recorded)';

  var al = document.getElementById('lb-actions');
  if (d.actions.length > 0) {
    al.innerHTML = d.actions.map(function(a, i) {
      return '<li>' + (i+1) + '. ' + actionLabel(a) + '</li>';
    }).join('');
  } else {
    al.innerHTML = '<li style="color:#9ca3af;font-style:italic">No actions</li>';
  }

  document.getElementById('lb-url').textContent = d.url || '(unknown)';
  document.getElementById('lb-prev').disabled = lbIdx === 0;
  document.getElementById('lb-next').disabled = lbIdx === lbData.length - 1;

  var ov = document.getElementById('action-overlay');
  ov.innerHTML = buildOverlaySvg(d.actions);
  if (overlayVisible) ov.classList.add('visible'); else ov.classList.remove('visible');
  var btn = document.getElementById('lb-overlay-btn');
  if (overlayVisible) btn.classList.add('active'); else btn.classList.remove('active');
  btn.style.display = d.actions.length > 0 ? '' : 'none';
}

document.addEventListener('keydown', function(e) {
  if (!document.getElementById('lightbox-overlay').classList.contains('active')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') lbPrev();
  if (e.key === 'ArrowRight') lbNext();
  if (e.key === 'o' || e.key === 'O') toggleOverlay();
});
`;

  // ─── Lightbox HTML ───────────────────────────────────────

  const lightboxHtml = `
<div id="lightbox-overlay" class="lightbox-overlay" onclick="if(event.target===this)closeLightbox()">
<div class="lightbox">
<div class="lb-header"><span id="lb-title">Step</span><button class="lb-close" onclick="closeLightbox()">&times;</button></div>
<div class="lb-body">
<div class="lb-img-wrap">
<img id="lb-img" src="" alt="Step screenshot">
<div id="action-overlay" class="action-overlay"></div>
</div>
<div class="lb-sidebar">
<div class="lb-section"><div class="lb-section-title">URL</div><div id="lb-url" class="lb-url"></div></div>
<div class="lb-section"><div class="lb-section-title">Reasoning</div><div id="lb-reasoning" class="lb-reasoning"></div></div>
<div class="lb-section"><div class="lb-section-title">Actions Taken</div><ul id="lb-actions" class="lb-actions"></ul></div>
</div></div>
<div class="lb-nav">
<button id="lb-prev" onclick="lbPrev()">&#8592; Previous</button>
<button id="lb-overlay-btn" onclick="toggleOverlay()" title="Toggle action overlay (O)">&#128065; Show Actions</button>
<button id="lb-next" onclick="lbNext()">Next &#8594;</button>
</div></div></div>`;

  // ─── Assemble HTML ───────────────────────────────────────

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MJ Regression Report \u2014 ${esc(timestamp)}</title>
<style>${css}</style>
</head>
<body>
<h1>MJ Explorer Regression Report</h1>
<p class="subtitle">Run ${esc(timestamp)} \u00b7 ${esc(r.suiteName || 'Suite')}</p>
<div class="summary">
<div>Status<strong class="status-${overallStatus}">${overallStatus}</strong></div>
<div>Passed<strong>${passedCount} / ${r.totalTests || 0}</strong></div>
<div>Failed<strong>${failedCount}</strong></div>
<div>Average Score<strong>${((r.averageScore || 0) * 100).toFixed(1)}%</strong></div>
<div>Duration<strong>${Math.round((r.durationMs || 0) / 1000)}s</strong></div>
</div>
${sections.join('\n')}
${lightboxHtml}
<footer>Generated by MJ Regression Test Runner \u00b7 click any screenshot to view details \u00b7 press O to toggle action overlay</footer>
<script>${js}</script>
</body>
</html>
`;

  fs.writeFileSync(path.join(runDir, 'report.html'), html);
  console.log('  \u2713 HTML gallery saved to ' + path.join(runDir, 'report.html'));
} catch (err) {
  console.error('  WARNING: HTML gallery generation failed:', err.message);
  console.error(err.stack);
}
