// =============================================================================
// derive-template-var-parents.mjs — AGENT-ARC root-cause fix for the nested-object defect.
//
// THE BUG (caught by the all-object test): a connector with a template-var APIPath
// (`/events/{eventCode}/attendees/`) cannot SYNC unless its child IO declares how to resolve `{eventCode}`
// to a parent object. The engine resolves ONLY via authored metadata — `Configuration.parentObjectName`
// (deploy-safe by-name) or an exact-name FK — and LOUDLY skips otherwise (engine §19: NO runtime guess,
// because a PK-name guess silently bound the wrong parent → cross-owner corruption). The extractor never
// authored that metadata, so every nested object synced 0 rows in production (the lazy 2-record test
// only ever touched the FLAT objects, so it shipped broken — e.g. PheedLoop's 19 nested streams).
//
// THE FIX (deterministic, NOT a guess): the parent is EXPLICIT in the path structure. For a SINGLE
// template-var path, `{var}`'s parent is the IO whose APIPath equals the path truncated right before the
// `{var}` segment. Emit `Configuration.parentObjectName` (+ `parentObjectIDFieldName = var`) so the
// engine resolves it safely. Reading the path's literal structure is authoring, not guessing.
//
// Runs as: (a) a back-fill over an existing connector's metadata file, AND (b) the same function is the
// arc's post-extraction normalization (so NEW builds emit it too). Multi-var paths (2+ {var}) need
// per-var FK fields — reported as `multiVar` for follow-up, never silently mis-resolved to one parent.
//
// Usage: node derive-template-var-parents.mjs <path-to/.<vendor>.integration.json> [--write]
//        (omit --write for a dry run that prints what WOULD change)
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';

const norm = (p) => '/' + String(p || '').replace(/^\/+|\/+$/g, '') + '/'; // '/events/' canonical, trailing slash

/**
 * Derive Configuration.parentObjectName for every SINGLE template-var IO from the path structure.
 * Pure: mutates the passed IO array in place and returns a structured report.
 * @param {Array<{fields:Record<string,any>}>} ios  IO records ({ fields: { Name, APIPath, Configuration } })
 */
export function deriveTemplateVarParents(ios) {
  const byPath = new Map();
  for (const io of ios) {
    const ap = io?.fields?.APIPath;
    if (ap && !String(ap).includes('{')) byPath.set(norm(ap), io.fields.Name); // only FLAT paths are parent candidates
  }
  const report = { resolved: [], multiVar: [], unresolved: [] };
  for (const io of ios) {
    const f = io?.fields;
    if (!f) continue;
    const ap = String(f.APIPath || '');
    if (!ap.includes('{')) continue;
    const segs = ap.split('/');
    const varIdxs = segs.map((s, i) => (/^\{.*\}$/.test(s) ? i : -1)).filter((i) => i >= 0);
    if (varIdxs.length === 0) continue;
    if (varIdxs.length > 1) { report.multiVar.push({ object: f.Name, apiPath: ap, vars: varIdxs.map((i) => segs[i]) }); continue; }
    const vi = varIdxs[0];
    const varName = segs[vi].replace(/^\{|\}$/g, '');
    const parentPath = norm(segs.slice(0, vi).join('/')); // '/events/{eventCode}/attendees/' -> '/events/'
    const parentName = byPath.get(parentPath);
    if (!parentName) { report.unresolved.push({ object: f.Name, apiPath: ap, parentPath, var: varName }); continue; }
    const cfg = (f.Configuration && typeof f.Configuration === 'object') ? f.Configuration : {};
    if (cfg.parentObjectName === parentName && cfg.parentObjectIDFieldName === varName) continue; // already set
    cfg.parentObjectName = parentName;
    cfg.parentObjectIDFieldName = varName;
    f.Configuration = cfg;
    report.resolved.push({ object: f.Name, apiPath: ap, parentObjectName: parentName, var: varName });
  }
  return report;
}

// --- CLI back-fill -----------------------------------------------------------
const file = process.argv[2];
const write = process.argv.includes('--write');
if (file) {
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  const rec = Array.isArray(doc) ? doc[0] : doc;
  const ios = rec?.relatedEntities?.['MJ: Integration Objects'] || [];
  const report = deriveTemplateVarParents(ios);
  console.log(JSON.stringify({
    file, ioCount: ios.length,
    resolved: report.resolved.length, multiVar: report.multiVar.length, unresolved: report.unresolved.length,
    resolvedDetail: report.resolved, multiVarDetail: report.multiVar, unresolvedDetail: report.unresolved,
  }, null, 2));
  if (write && report.resolved.length) { writeFileSync(file, JSON.stringify(doc, null, 2) + '\n'); console.log(`\n✅ wrote ${report.resolved.length} parentObjectName declaration(s) to ${file}`); }
  else if (!write) console.log('\n(dry run — pass --write to apply)');
}
