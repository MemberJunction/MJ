/**
 * Comprehensive per-connector matrix runner. Drives connectorE2EMock for each connector in
 * RUN_DIRS (comma-sep registry dir names) and extracts EVERY matrix cell into an anti-vacuous
 * pass/fail/skip verdict. Writes /tmp/retest-<dir>.json (full result) + /tmp/retest-row-<dir>.json
 * (the compact row). A cell is:
 *   - 'pass'  : the cell's steps ran and all asserted ok (real measured outcome)
 *   - 'fail'  : a step asserted false (e.g. completeness with destRows==0 where data exists)
 *   - 'skip'  : the cell ran but legitimately could not exercise the path (carries skipReason)
 *   - '-'     : the cell was not present in the result (mode/connector shape)
 *
 * Anti-vacuous rule for forward.completeness: a connector with applied objects whose dest rows
 * are ALL zero is a FAIL, not a pass — surfaced as completeness "Nobj/Kok/Z>0".
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { connectorE2EMock } from '../plans.mjs';

const cfg = JSON.parse(readFileSync('/tmp/matrix-config.json', 'utf8'));
const NAME = Object.fromEntries(cfg.map(c => [c.dir, c.name]));
const CT = Object.fromEntries(cfg.map(c => [c.dir, c.credTypeID]));

const base = {
  E2E_MODE: 'mock',
  E2E_REGEN_FIXTURES: 'true',          // E6 — fixtures from deployed metadata
  HS_LIVE_GRAPHQL_URL: process.env.HS_LIVE_GRAPHQL_URL || 'http://localhost:4021/',
  HS_LIVE_PLATFORM: 'sqlserver',
  HS_LIVE_COMPANY_ID: process.env.HS_LIVE_COMPANY_ID || 'C0FFEE00-0000-4000-8000-000000000013',
  HS_LIVE_DB_HOST: 'localhost',
  HS_LIVE_DB_PORT: process.env.DB_PORT || '1444',
  HS_LIVE_DB_NAME: process.env.DB_DATABASE || 'MJ_CONN_E2E',
  HS_LIVE_DB_USER: process.env.DB_USERNAME || 'sa',
  HS_LIVE_MJ_SCHEMA: '__mj',
};

const arr = (st, k) => (Array.isArray(st[k]) ? st[k] : (st[k] ? [st[k]] : []));

// Classify a list of step objects into pass | fail | skip | '-'.
// A step with skipReason that is ok:true => contributes 'skip'. Any ok:false => 'fail'.
function classify(steps) {
  if (!steps || steps.length === 0) return '-';
  let anyFail = false, anyReal = false, anySkip = false;
  for (const s of steps) {
    const isSkip = !!(s.skipReason || s.skipped || (s.details && s.details.skipReason));
    if (s.ok === false) { anyFail = true; anyReal = true; }
    else if (isSkip) { anySkip = true; }
    else if (s.ok === true) { anyReal = true; }
  }
  if (anyFail) return 'fail';
  if (anyReal && !anySkip) return 'pass';
  if (anyReal && anySkip) return 'pass';   // some real asserts + some skips => still a meaningful pass
  if (anySkip) return 'skip';
  return '-';
}

for (const dir of (process.env.RUN_DIRS || '').split(',').filter(Boolean)) {
  Object.assign(process.env, base, {
    E2E_CONNECTOR: dir,
    E2E_INTEGRATION: NAME[dir],
    HS_LIVE_CREDTYPE_ID: CT[dir] || '',
  });
  const row = { dir, name: NAME[dir] };
  try {
    const r = await connectorE2EMock({ dbPassword: process.env.DB_PASSWORD, mjSystemKey: process.env.MJ_API_KEY }, x => x);
    writeFileSync(`/tmp/retest-${dir}.json`, JSON.stringify(r, null, 2));
    const st = r.steps || {};

    // setup — step() spreads detail to top level, so read fields directly off the step object
    const setupStep = st.setup;
    row.topOk = r.ok;
    row.error = r.error ? String(r.error).slice(0, 300) : null;
    row.setupErr = setupStep?.error || setupStep?.applyAll?.error || null;
    row.mapsFull = setupStep?.fullCatalogMapCount ?? setupStep?.applyAll?.mapsCreated ?? null;
    row.mapsSync = setupStep?.syncSubsetCount ?? null;
    row.cells = {};
    row.cells.setup = setupStep ? (setupStep.ok ? 'pass' : 'fail') : '-';

    // forward + completeness (anti-vacuous)
    const fwd = arr(st, 'forward');
    const compl = fwd.filter(x => x.name === 'forward.completeness' || (x.name || '').includes('completeness'));
    const withData = compl.filter(x => (x.details?.destRows ?? x.destRows ?? 0) > 0);
    const complOk = compl.filter(x => x.ok);
    row.completeness = `${compl.length}obj/${complOk.length}ok/${withData.length}>0`;
    // forward FAILS if there are completeness checks but NONE produced rows (vacuous), or any asserted false
    if (fwd.length === 0) row.cells.forward = '-';
    else if (fwd.some(x => x.ok === false)) row.cells.forward = 'fail';
    else if (compl.length > 0 && withData.length === 0) row.cells.forward = 'fail';
    else row.cells.forward = 'pass';

    // each remaining cell via classify
    row.cells.delta = classify(arr(st, 'delta'));
    row.cells.idempotency = classify(arr(st, 'idempotent'));
    row.cells.watermark = classify(arr(st, 'watermark'));
    row.cells.pagination = classify(arr(st, 'pagination'));
    row.cells.discoverOverlay = classify(arr(st, 'discoverOverlay'));
    row.cells.discoverColumns = classify(arr(st, 'discoverColumns'));
    row.cells.dag = classify(arr(st, 'dag'));
    row.cells.merkle = classify(arr(st, 'merkle'));
    row.cells.rateLimit = classify(arr(st, 'rateLimit'));
    row.cells.concurrency = classify(arr(st, 'concurrency'));
    row.cells.retry = classify(arr(st, 'retry'));
    row.cells.bidirectional = classify(arr(st, 'bidirectional'));
    row.cells.backward = classify(arr(st, 'backward'));
    row.cells.teardown = classify(arr(st, 'teardown'));

    // capture skip reasons for the report
    row.skipReasons = {};
    for (const [k, key] of [
      ['watermark', 'watermark'], ['discoverOverlay', 'discoverOverlay'], ['discoverColumns', 'discoverColumns'],
      ['bidirectional', 'bidirectional'], ['merkle', 'merkle'], ['rateLimit', 'rateLimit'], ['retry', 'retry'],
      ['pagination', 'pagination'], ['concurrency', 'concurrency'],
    ]) {
      const sr = arr(st, key).map(s => s.skipReason || s.details?.skipReason).filter(Boolean);
      if (sr.length) row.skipReasons[k] = sr[0].slice(0, 200);
    }
  } catch (e) {
    row.error = String(e?.stack || e?.message || e).slice(0, 400);
    row.cells = {};
  }
  writeFileSync(`/tmp/retest-row-${dir}.json`, JSON.stringify(row, null, 2));
  console.log(JSON.stringify({ dir: row.dir, topOk: row.topOk, completeness: row.completeness, mapsFull: row.mapsFull, error: row.error, setupErr: row.setupErr }));
}
