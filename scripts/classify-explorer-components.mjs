#!/usr/bin/env node
/**
 * One-off Phase-3 scoping tool. Classifies every Explorer component into the buckets the Phase-3
 * "definition of done" uses, so we can compute IN-SCOPE coverage (not raw %-of-all) and emit the
 * deferral register. Buckets (priority order):
 *   covered            — has a *.dom.test.ts sibling
 *   deferred:generated — lives under a /generated/ dir (CodeGen output; not hand-unit-tested)
 *   deferred:page      — a page-level view: extends BaseResource... OR template uses mj-page-x chrome
 *   deferred:singleton — reads a static singleton for data (SharedService.Instance / *Engine.Instance)
 *   in-scope           — everything else: unit-DOM-testable, the grind target
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = 'packages/Angular/Explorer';
function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.component.ts') && !e.name.endsWith('.dom.test.ts')) acc.push(p);
  }
  return acc;
}

/**
 * Judgment-call deferrals the structural heuristics below can't cleanly detect. Each entry was
 * individually reviewed; the value is the reason recorded in the register. `covered` still wins
 * over this (a real spec sibling always re-buckets to covered), so listing one here is safe.
 */
const MANUAL_DEFERRALS = {
  RedirectComponent: 'Auth redirect shim — ngOnInit performs route-navigation side-effects, no renderable surface to assert.',
  OAuthCallbackComponent: 'OAuth callback handler — ngOnInit consumes URL params and performs auth/navigation side-effects; integration-shaped.',
  MJExplorerAppComponent: 'Application root/bootstrap shell — wires MJNotificationService + global providers and app-wide chrome; integration-shaped.',
  SharingCenterDialogHostComponent: 'Imperative dialog-host service component — opened programmatically by a host service, not rendered from inputs.',
  SingleRecordComponent: 'Resource-page host — resolves a route/resource and delegates to the resource component via global navigation/provider; page-level (browser/e2e).',
  SingleQueryComponent: 'Resource-page host — resolves a route/resource and delegates via global navigation/provider; page-level (browser/e2e).',
  SingleListDetailComponent: 'Resource-page host — resolves a route/resource and delegates via global navigation/provider; page-level (browser/e2e).',
  SingleSearchResultComponent: 'Resource-page host — resolves a route/resource and delegates via global navigation/provider; page-level (browser/e2e).',
  CategoriesListViewComponent: 'Inline nested-SCSS `styles:[...]` block that jsdom cannot parse ("Could not parse CSS stylesheet"), which freezes the view after first render — not fixable without editing component source.',
  AgentAdvancedSettingsDialogComponent: 'Component class body is entirely commented out (deprecated/superseded) — no active template or logic to test.',
  TemplateEditorComponent: 'Reads TemplateEngineBase.Instance.TemplateContentTypes (static-singleton data source) in ngOnInit — cannot be constructed in isolation without a production refactor to inject that engine.',
  UpdateNotificationComponent: 'Lives in the `service-worker` package, which is node-only (no `@analogjs/vite-plugin-angular`, no `@memberjunction/ng-test-utils`, node-only vitest preset). Its entire output is inside an `@if (updateAvailable$ | async)` block that needs the Angular AOT compile path; wiring that up would require editing package.json + vitest.config + a new tsconfig.spec.json. The backing `UpdateNotificationService` has its own logic tests.',
};

const rows = walk(ROOT).map((f) => {
  const ts = readFileSync(f, 'utf-8');
  const htmlPath = f.replace(/\.ts$/, '.html');
  const tpl = ts + (existsSync(htmlPath) ? readFileSync(htmlPath, 'utf-8') : '');
  const name = (ts.match(/export class (\w+)/) || [])[1] || f;
  let bucket;
  if (existsSync(f.replace(/\.component\.ts$/, '.component.dom.test.ts'))) bucket = 'covered';
  else if (MANUAL_DEFERRALS[name]) bucket = 'deferred:manual';
  else if (/\/generated\//.test(f)) bucket = 'deferred:generated';
  // Custom entity forms that extend a CodeGen-generated *FormComponent (registered via
  // @RegisterClass(BaseFormComponent, ...)) — rendering needs the full generated form-field stack.
  else if (/@RegisterClass\(\s*BaseFormComponent/.test(ts) || /extends\s+MJ\w*FormComponent\b/.test(ts)) bucket = 'deferred:form';
  // Page-level: extends a BaseResource/Admin/Navigation/Dashboard base, is registered as a resource
  // or navigation component, or wires the mj-page-* chrome set.
  // Heuristic audit (Phase 4): `mj-page-header` also substring-matches `mj-page-header-interior`
  // (a sub-page widget, not page chrome). Measured impact: ZERO — every current user of
  // header-interior also matches real chrome or a page base class, so no component is bucketed
  // page-level by the substring alone. Re-measure before tightening if that ever changes.
  // Likewise `\w*Engine\w*.Instance` (below) matches ANY usage, incl. click-handler-only; a spec
  // sibling always wins (covered is checked first), so writing the spec un-defers such a component
  // (see EntityLinkPillComponent). The deferred:singleton list is the Phase-3.5 hand-audit target.
  else if (
    /extends\s+Base(Resource|Admin|Navigation|Dashboard)\w*/.test(ts) ||
    /@RegisterClass\(\s*Base(Resource|Navigation)Component/.test(ts) ||
    /mj-page-layout|mj-page-header|mj-page-body/.test(tpl)
  ) bucket = 'deferred:page';
  // Static-singleton data source: reads a *Engine.Instance (or SharedService.Instance) for DATA in
  // the component, so it can't be constructed in isolation without a production refactor to inject it.
  else if (/\b\w*Engine\w*\.Instance\b/.test(ts) || /\bSharedService\.Instance\b/.test(ts)) bucket = 'deferred:singleton';
  else bucket = 'in-scope';
  return { name, bucket, rel: f.replace(ROOT + '/', ''), reason: MANUAL_DEFERRALS[name] };
});

const by = (b) => rows.filter((r) => r.bucket === b);
const inScope = by('in-scope');
const covered = by('covered');
const denom = inScope.length + covered.length;
console.log(`Explorer components: ${rows.length}`);
console.log(`  covered:            ${covered.length}`);
console.log(`  in-scope (uncov'd): ${inScope.length}`);
console.log(`  deferred:generated: ${by('deferred:generated').length}`);
console.log(`  deferred:form:      ${by('deferred:form').length}`);
console.log(`  deferred:page:      ${by('deferred:page').length}`);
console.log(`  deferred:singleton: ${by('deferred:singleton').length}`);
console.log(`  deferred:manual:    ${by('deferred:manual').length}`);
console.log(`\nIN-SCOPE coverage: ${covered.length}/${denom} = ${denom ? Math.round((covered.length / denom) * 100) : 0}%  (bar: 85%)`);
console.log(`To hit 85%: cover ${Math.max(0, Math.ceil(denom * 0.85) - covered.length)} more of the ${inScope.length} in-scope.\n`);
if (process.argv.includes('--list-inscope')) {
  console.log('IN-SCOPE (uncovered) — the grind list:');
  for (const r of inScope.sort((a, b) => a.rel.localeCompare(b.rel))) console.log(`  ${r.name}  ${r.rel}`);
}

// CI coverage gate (Phase 4): `--min <pct>` exits non-zero when in-scope coverage falls below
// the threshold. New components land as in-scope-uncovered by default (deferral requires an
// explicit heuristic match or a reviewed MANUAL_DEFERRALS entry), so this catches "shipped a
// testable Explorer component without a DOM spec" at PR time. Start lenient, ratchet up.
const minIdx = process.argv.indexOf('--min');
if (minIdx !== -1) {
  const min = Number(process.argv[minIdx + 1]);
  if (!Number.isFinite(min) || min < 0 || min > 100) {
    console.error(`--min requires a percentage 0-100, got: ${process.argv[minIdx + 1]}`);
    process.exit(2);
  }
  const pct = denom ? (covered.length / denom) * 100 : 100;
  if (pct < min) {
    console.error(`\n❌ In-scope DOM coverage ${pct.toFixed(1)}% is below the --min ${min}% gate.`);
    console.error(`   Cover ${Math.ceil((min / 100) * denom) - covered.length} more component(s) — run with --list-inscope for the list,`);
    console.error(`   or (only if genuinely untestable) add a reviewed deferral. See plans/testing/phase-3-explorer-deferral-register.md.`);
    process.exit(1);
  }
  console.log(`✅ Coverage gate: ${pct.toFixed(1)}% >= ${min}%.`);
}

if (process.argv.includes('--register')) {
  const section = (title, why, list) =>
    `\n## ${title} (${list.length})\n\n${why}\n\n${list.map((r) => `- \`${r.name}\` — ${r.rel}`).sort().join('\n')}\n`;
  // Manual deferrals carry a per-component reason (not a shared bucket rationale).
  const manualSection = (list) =>
    `\n## Deferred — reviewed individually (${list.length})\n\nEach reviewed by hand; not detectable by a structural heuristic. Reason is per-component.\n\n${list
      .map((r) => `- \`${r.name}\` — ${r.rel}\n  - ${r.reason}`)
      .sort()
      .join('\n')}\n`;
  const md = `# Phase 3 — Explorer DOM-test deferral register

Auto-generated by \`scripts/classify-explorer-components.mjs --register\`. Satisfies the Phase-3
"no silent gaps" criterion: every Explorer component is either **covered** by a DOM spec or listed
here with a reason. Regenerate after adding specs.

- **Total Explorer components:** ${rows.length}
- **Covered:** ${covered.length}
- **In-scope, uncovered:** ${inScope.length}
- **Deferred:** ${by('deferred:generated').length + by('deferred:form').length + by('deferred:page').length + by('deferred:singleton').length + by('deferred:manual').length}
- **In-scope coverage:** ${covered.length}/${denom} (${denom ? Math.round((covered.length / denom) * 100) : 0}%) — bar is 85%
${section('Deferred — CodeGen-generated', 'Auto-generated entity forms under `/generated/`. Regenerated by CodeGen; hand-writing DOM specs against generated output is an anti-pattern (churns on every regen). Excluded from the in-scope denominator.', by('deferred:generated'))}${section('Deferred — custom entity form (extends generated form)', 'Custom entity forms registered via `@RegisterClass(BaseFormComponent, ...)` that extend a CodeGen-generated `*FormComponent`. Rendering requires the full generated form-field stack + `mj-record-form-container` + configured entity metadata — integration-shaped; the custom logic is exercised by the browser/e2e form suite.', by('deferred:form'))}${section('Deferred — page-level / integration', 'Full-page resource/admin/navigation/dashboard views (extend `BaseResource*` / `BaseAdmin*` / `BaseNavigation*` / `BaseDashboard`, or registered as a resource/navigation component) or components wired to the `mj-page-*` chrome set. Integration-shaped; belong in the browser/e2e suite, not unit DOM.', by('deferred:page'))}${section('Deferred — static-singleton data source', 'Load data directly from a static singleton (`*Engine.Instance` / `SharedService.Instance`) in the component, so they cannot be constructed in isolation without a production refactor to *inject* those services. Candidate for a follow-up "inject-the-singleton" pass (Phase 3.5), after which they become in-scope.', by('deferred:singleton'))}${manualSection(by('deferred:manual'))}`;
  const out = 'plans/testing/phase-3-explorer-deferral-register.md';
  writeFileSync(out, md);
  console.log(`\nWrote ${out}`);
}
