// spec-conformance.mjs (consensus A6 producer) — the free, deterministic credential-free check that
// auto-catches the wrong-paths class (GrowthZone 17-wrong-paths). DISTINCT from "fields were parsed from
// the spec": this asserts the connector's REQUESTS conform — every emitted (path, method) the connector
// will call (APIPath GET + the per-operation Create/Update/Delete paths+methods) must match a (path,
// method) the vendor's OpenAPI/Swagger declares, template-aware. Emits journal.specConformance, which
// floor-check's `spec-conformance` rung consumes. NO LLM — pure parse + set-diff.
//
// Usage: node spec-conformance.mjs <openapi-spec.json> <vendor.integration.json>  → JSON on stdout.
import { readFileSync } from 'node:fs';

// Normalize a path for template-agnostic comparison: any {placeholder} → {}, trim trailing slash,
// lowercase, collapse a leading version segment difference is NOT done (versions are real). Query strings
// stripped. So /contacts/{ContactID} and /contacts/{id} both → /contacts/{}.
export function normPath(p) {
  if (typeof p !== 'string') return '';
  let s = p.split('?')[0].trim();
  s = s.replace(/\{[^}]*\}/g, '{}').replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '{}'); // {x} and :x styles
  s = s.replace(/\/+$/, '').toLowerCase();
  return s.startsWith('/') ? s : '/' + s;
}

// Extract the (method, normPath) set the SPEC declares.
export function specPairs(spec) {
  const out = new Set();
  const paths = spec && spec.paths && typeof spec.paths === 'object' ? spec.paths : {};
  for (const [p, ops] of Object.entries(paths)) {
    if (!ops || typeof ops !== 'object') continue;
    for (const m of Object.keys(ops)) {
      if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(m.toLowerCase())) {
        out.add(`${m.toUpperCase()} ${normPath(p)}`);
      }
    }
  }
  return out;
}

// Extract the (method, normPath) requests the CONNECTOR will make from its IO metadata rows.
export function connectorPairs(metadata) {
  const reqs = [];
  const ios = collectIORows(metadata);
  for (const io of ios) {
    const f = io.fields ?? io;
    const add = (path, method) => { if (path) reqs.push({ method: (method || 'GET').toUpperCase(), path, normalized: `${(method || 'GET').toUpperCase()} ${normPath(path)}`, io: f.Name }); };
    add(f.APIPath, 'GET');                                   // list/fetch
    if (f.SupportsCreate) add(f.CreateAPIPath, f.CreateMethod || 'POST');
    if (f.SupportsUpdate) add(f.UpdateAPIPath, f.UpdateMethod || 'PATCH');
    if (f.SupportsDelete) add(f.DeleteAPIPath, f.DeleteMethod || 'DELETE');
  }
  return reqs;
}

// mj-sync metadata can nest IO rows under relatedEntities; gather them robustly.
function collectIORows(metadata) {
  const rows = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const f = node.fields ?? null;
    if (f && (f.APIPath || f.Name) && (f.IntegrationObjectID !== undefined || f.APIPath !== undefined)) rows.push(node);
    for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v);
  };
  walk(metadata.relatedEntities ?? metadata);
  // de-dup by Name
  const seen = new Set(); return rows.filter(r => { const n = (r.fields ?? r).Name; if (!n || seen.has(n)) return false; seen.add(n); return true; });
}

export function diffConformance(spec, metadata) {
  const declared = specPairs(spec);
  const requests = connectorPairs(metadata);
  const nonConforming = requests.filter(r => r.path && !declared.has(r.normalized))
    .map(r => ({ io: r.io, method: r.method, path: r.path, reason: 'no matching (method, path) in the OpenAPI spec' }));
  const conforming = requests.length - nonConforming.length;
  return {
    pass: nonConforming.length === 0 && requests.length > 0,
    total: requests.length, conforming, nonConformingCount: nonConforming.length,
    nonConforming, specPathCount: declared.size,
    ceiling: nonConforming.length === 0 ? 'openapi-contract-validated' : 'format-verified-no-creds',
  };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const [specPath, metaPath] = process.argv.slice(2);
  if (!specPath || !metaPath) { console.error('usage: spec-conformance.mjs <spec.json> <vendor.integration.json>'); process.exit(2); }
  let spec, metadata;
  try { spec = JSON.parse(readFileSync(specPath, 'utf8')); } catch (e) { console.error(`spec unreadable: ${e.message}`); process.exit(2); }
  try { metadata = JSON.parse(readFileSync(metaPath, 'utf8')); } catch (e) { console.error(`metadata unreadable: ${e.message}`); process.exit(2); }
  const result = diffConformance(spec, metadata);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.pass ? 0 : 1);
}
