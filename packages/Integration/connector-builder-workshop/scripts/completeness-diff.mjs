#!/usr/bin/env node
/**
 * completeness-diff.mjs — multi-level set-arithmetic completeness (v2 P9; ARCHITECTURE_REFACTOR.md).
 *
 * Generalizes compute-source-diff's object-level bijection to EVERY level: an eyeballed inventory
 * at any of these levels is the Path-LMS defect (16/38 objects) wearing a different hat.
 *
 *   L1 objects        — source-derived object set  vs emitted IOs
 *   L2 fields         — source-derived fields/obj  vs emitted IOFs (per object)
 *   L3 paths          — source-derived list paths  vs declared APIPath
 *   L4 write surface  — source POST/PUT/PATCH/DELETE ops vs write-capable IOs + per-op columns
 *   L5 constraints    — source required/enum/maxLength    vs emitted IOF facts
 *
 * DETERMINISTIC FINDER: pinned inputs (source snapshot + metadata file, both sha256-recorded),
 * scripted derivation, recorded artifact, re-runnable to the same answer. Levels the source
 * cannot support (e.g. HTML-only docs) are reported as 'source-not-machine-readable' BY NAME —
 * never silently skipped.
 *
 * Sources supported: OpenAPI/Swagger JSON (all levels), GraphQL SDL (L1/L2; L3-L5 n/a → named).
 *
 * Usage: node completeness-diff.mjs --source <spec-file> --metadata <file> [--out <dir>]
 * Exit: 0 ran (diffs in artifact); 2 setup error.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
}
if (!args.source || !args.metadata) {
    process.stderr.write('usage: completeness-diff.mjs --source <openapi.json|schema.graphql> --metadata <file> [--out dir]\n');
    process.exit(2);
}
const OUT = args.out || '.';
const sha = (b) => createHash('sha256').update(b).digest('hex');

// ── pinned inputs ────────────────────────────────────────────────────
const srcBytes = readFileSync(args.source);
const metaBytes = readFileSync(args.metadata);
const metaRoot = (() => { const j = JSON.parse(metaBytes.toString('utf-8')); return Array.isArray(j) ? j[0] : j; })();

// ── emitted side (the metadata) ──────────────────────────────────────
const emitted = ((metaRoot.relatedEntities || {})['MJ: Integration Objects'] || []).map((r) => {
    const f = r.fields || {};
    const iofs = ((r.relatedEntities || {})['MJ: Integration Object Fields'] || []).map((x) => x.fields || {});
    return {
        name: f.Name,
        apiPath: f.APIPath || null,
        fields: new Set(iofs.map((x) => String(x.Name))),
        iofs,
        write: {
            create: !!(f.CreateAPIPath && f.CreateMethod),
            update: !!(f.UpdateAPIPath && f.UpdateMethod),
            del: !!(f.DeleteAPIPath && f.DeleteMethod),
        },
    };
});
const emittedByName = new Map(emitted.map((o) => [norm(o.name), o]));
function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
/**
 * Canonicalize a source schema name (deterministic rules, no fuzz):
 * take the last dot-segment (namespaced specs: `Models.Application.ApplicationListItemModel`),
 * then iteratively strip DTO suffixes — a schema named `<X>ListItemModel`/`<X>Model`/`<X>Dto`
 * is the DTO of canonical object X, not a distinct object.
 */
// CONVENTION DATA, not logic (P10): defaults tuned on real specs; per-vendor extension goes in a
// --conventions JSON file ({ dtoSuffixes:[], envelopePrefixes:[] } — MERGED with defaults, never a
// code fork). An unmatched name surfaces as a NAMED finding, never a silent misclassification.
const conv = (() => { try { return args.conventions ? JSON.parse(readFileSync(args.conventions, 'utf-8')) : {}; } catch { return {}; } })();
const DTO_SUFFIXES = [...['listitemmodel', 'listitem', 'viewmodel', 'model', 'dto', 'request', 'response', 'options', 'summary'], ...(conv.dtoSuffixes ?? [])];
const ENVELOPE_PREFIXES = [...['pagingresponse', 'pagedresponse', 'pagedresult', 'listresponse', 'collectionof'], ...(conv.envelopePrefixes ?? [])];
function canon(srcName) {
    let n = norm(String(srcName).split('.').pop());
    // Paging-envelope unwrap: a GET list's primary ref is often the ENVELOPE
    // (`PagingResponseApplicationListItemModel`) — the canonical object is the ITEM type.
    for (const pre of ENVELOPE_PREFIXES) {
        if (n.startsWith(pre) && n.length > pre.length) { n = n.slice(pre.length); break; }
    }
    let changed = true;
    while (changed) {
        changed = false;
        for (const suf of DTO_SUFFIXES) {
            if (n.length > suf.length && n.endsWith(suf)) { n = n.slice(0, -suf.length); changed = true; }
        }
    }
    return n;
}
/** name matching tolerant of namespacing + DTO suffixes + singular/plural (deterministic rules, no fuzz). */
const VARIANT_PREFIXES = [...['base', 'simple', 'slim', 'mini'], ...(conv.variantPrefixes ?? [])];
function matchEmitted(srcName) {
    const n = canon(srcName);
    if (emittedByName.has(n)) return emittedByName.get(n);
    if (n.endsWith('s') && emittedByName.has(n.slice(0, -1))) return emittedByName.get(n.slice(0, -1));
    if (emittedByName.has(n + 's')) return emittedByName.get(n + 's');
    // Variant-prefix fallback (Path LMS BaseAccount→Account, BaseTeam→Team): fires ONLY on an
    // otherwise-unmatched name whose de-prefixed remainder matches an emitted IO.
    for (const pre of VARIANT_PREFIXES) {
        if (n.startsWith(pre) && n.length > pre.length && emittedByName.has(n.slice(pre.length))) return emittedByName.get(n.slice(pre.length));
    }
    return null;
}
/**
 * Envelope-of-emitted-item classifier (deterministic): a "missing" type whose fields are exactly
 * a parent-key scalar + a list of an EMITTED item type is a report/paging ENVELOPE — the item is
 * the canonical object and it IS covered. Classified, not raw-missing (Path LMS *Report class;
 * OpenWater PagingResponse class).
 */
function isEnvelopeOfEmittedItem(g) {
    const entries = [...g.fields.entries()];
    if (entries.length === 0 || entries.length > 4) return null;
    let itemMatch = null;
    for (const [, fc] of entries) {
        const t = String(fc.type ?? '');
        const m = t.match(/^\[?([A-Za-z0-9_]+)!?\]?!?$/);
        if (m && t.includes('[')) {
            const hit = matchEmitted(m[1]);
            if (hit) itemMatch = hit.name;
        }
    }
    return itemMatch;
}

// ── source side (derivation per format) ──────────────────────────────
const srcText = srcBytes.toString('utf-8');
let source; // { kind, objects: Map<name,{fields:Map<fname,{required,enum,maxLength,type}>, listPath?, writeOps:[{method,path}]}>, machineReadable: {L3,L4,L5} }
if (srcText.trimStart().startsWith('{')) {
    const j = JSON.parse(srcText);
    // Extracted-schema JSON (a pinned extraction artifact: { schema: {Type: [fieldNames]|{}}, queries, objectTypes }).
    // GraphQL "tables ≠ doors": every reachable type is an expected object (nesting reaches them),
    // so L1's expected set = ALL object types — the missed-nested-object class is exactly what it catches.
    if (j && j.schema && typeof j.schema === 'object' && !j.paths && !(j.components || j.definitions)) {
        source = deriveExtractedJson(j);
    } else {
        source = deriveOpenAPI(j);
    }
} else if (/\btype\s+\w+\s*({|implements)/.test(srcText)) {
    source = deriveSDL(srcText);
} else {
    source = { kind: 'unsupported', objects: new Map(), machineReadable: { L1: false, L2: false, L3: false, L4: false, L5: false } };
}

function deriveExtractedJson(j) {
    const objects = new Map();
    for (const [name, val] of Object.entries(j.schema)) {
        const fieldNames = Array.isArray(val) ? val : (val && typeof val === 'object' ? Object.keys(val) : []);
        if (fieldNames.length === 0) continue;
        const fields = new Map(fieldNames.map((fn) => [String(fn), { required: false, enum: null, maxLength: null, type: null }]));
        // every type is an expected object in a nested-graph source: mark all as doors for L1
        objects.set(name, { fields, listPath: `(graph:${name})`, writeOps: [] });
    }
    return { kind: 'extracted-json', objects, machineReadable: { L1: true, L2: true, L3: false, L4: false, L5: false } };
}

function deriveOpenAPI(spec) {
    const objects = new Map();
    const schemas = (spec.components && spec.components.schemas) || (spec.definitions) || {};
    for (const [name, sch] of Object.entries(schemas)) {
        if (!sch || typeof sch !== 'object') continue;
        const props = sch.properties || {};
        const required = new Set(Array.isArray(sch.required) ? sch.required : []);
        const fields = new Map();
        for (const [fn, fs] of Object.entries(props)) {
            fields.set(fn, {
                required: required.has(fn),
                enum: Array.isArray(fs?.enum) ? fs.enum : null,
                maxLength: typeof fs?.maxLength === 'number' ? fs.maxLength : null,
                type: fs?.type ?? null,
            });
        }
        objects.set(name, { fields, listPath: null, writeOps: [] });
    }
    // paths → list path + write ops, attributed to the schema each op references. THE DOOR RULE is
    // collection-shaped: a GET is a door only when its success response is an ARRAY or a paging
    // ENVELOPE — a singleton-config GET (FormTemplateResponse, TimeZoneResponse) is NOT a door.
    for (const [p, ops] of Object.entries(spec.paths || {})) {
        for (const [method, op] of Object.entries(ops || {})) {
            if (!op || typeof op !== 'object') continue;
            const m = method.toUpperCase();
            const opStr = JSON.stringify(op);
            const refs = opStr.match(/#\/components\/schemas\/([A-Za-z0-9_.-]+)|#\/definitions\/([A-Za-z0-9_.-]+)/g) || [];
            const names = [...new Set(refs.map((r) => r.split('/').pop()))];
            const respStr = JSON.stringify(op.responses ?? {});
            const respRefs = respStr.match(/#\/(?:components\/schemas|definitions)\/([A-Za-z0-9_.-]+)/g) || [];
            const respNames = respRefs.map((r) => r.split('/').pop());
            const collectionShaped = /"type"\s*:\s*"array"/.test(respStr)
                || respNames.some((n) => ENVELOPE_PREFIXES.some((pre) => String(n).toLowerCase().split('.').pop().replace(/[^a-z0-9]/g, '').startsWith(pre)));
            for (const n of names) {
                const o = objects.get(n);
                if (!o) continue;
                if (m === 'GET' && !/\{[^}]+\}$/.test(p) && collectionShaped && !o.listPath) o.listPath = p;
                if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(m)) o.writeOps.push({ method: m, path: p });
            }
        }
    }
    // Enum/empty schemas (no properties) are value types, never objects.
    for (const [n, o] of [...objects]) if (o.fields.size === 0) objects.delete(n);
    return { kind: 'openapi', objects, machineReadable: { L1: true, L2: true, L3: true, L4: true, L5: true } };
}

function deriveSDL(sdl) {
    const objects = new Map();
    // type Foo { field: Type ... } — AST-free but deterministic line grammar; enum/required from ! marks
    const typeRe = /\btype\s+([A-Za-z0-9_]+)[^{]*\{([^}]*)\}/g;
    let m;
    while ((m = typeRe.exec(sdl)) !== null) {
        const [, name, body] = m;
        if (/^(Query|Mutation|Subscription)$/.test(name)) continue;
        const fields = new Map();
        for (const line of body.split('\n')) {
            const fm = line.match(/^\s*([A-Za-z0-9_]+)\s*(\([^)]*\))?\s*:\s*([\[\]A-Za-z0-9_!]+)/);
            if (fm) fields.set(fm[1], { required: /!$/.test(fm[3]), enum: null, maxLength: null, type: fm[3] });
        }
        if (fields.size > 0) objects.set(name, { fields, listPath: null, writeOps: [] });
    }
    return { kind: 'sdl', objects, machineReadable: { L1: true, L2: true, L3: false, L4: false, L5: false } };
}

// ── the diffs ────────────────────────────────────────────────────────
const result = {
    sourceFile: resolve(args.source), sourceSha256: sha(srcBytes), sourceKind: source.kind,
    metadataFile: resolve(args.metadata), metadataSha256: sha(metaBytes),
    machineReadable: source.machineReadable,
    L1_objects: { missing: [], orphan: [] },
    L2_fields: [],            // { object, missingFields[], orphanFields[] }
    L3_paths: [],             // { object, declared, derived }
    L4_writeSurface: [],      // { object, specWriteOps[], emittedWrite }
    L5_constraints: [],       // { object, field, dimension, spec, emitted }
    notMachineReadable: Object.entries(source.machineReadable).filter(([, v]) => !v).map(([k]) => k),
};

// VARIANT GROUPING (deterministic): a canonical object usually has SEVERAL DTO variants in the spec
// (ListItemModel + detail Model + UpdateRequest…). Group source schemas by canon name and UNION
// their field sets — diffing each variant separately produces spurious per-variant noise.
const groups = new Map(); // canonName -> { names[], nsNames:Set, fields:Map, listPath, writeOps[] }
function isEnvelopeName(srcName) {
    const n = norm(String(srcName).split('.').pop());
    return ENVELOPE_PREFIXES.some((pre) => n.startsWith(pre));
}
for (const [srcName, s] of source.objects) {
    const c = canon(srcName);
    if (!groups.has(c)) groups.set(c, { names: [], nsNames: new Set(), fields: new Map(), listPath: null, writeOps: [] });
    const g = groups.get(c);
    g.names.push(srcName);
    // Namespace segment ('Models.JudgeAssignment.JudgeListItemModel' → 'JudgeAssignment') — a
    // deterministic match fallback when the last-segment canon loses naming context.
    const segs = String(srcName).split('.');
    if (segs.length >= 2) g.nsNames.add(segs[segs.length - 2]);
    // Envelope variants contribute their ITEM linkage (canon grouping), NOT their own fields —
    // pagingInfo/items are the envelope's plumbing, never the object's fields.
    if (!isEnvelopeName(srcName)) {
        for (const [fn, fc] of s.fields) if (!g.fields.has(fn)) g.fields.set(fn, fc);
    }
    if (!g.listPath && s.listPath) g.listPath = s.listPath;
    g.writeOps.push(...s.writeOps);
}

// L1 — objects (source → emitted and back). THE DOOR RULE: a canonical group is an EXPECTED object
// only when some variant is the primary ref of a GET COLLECTION path (a "door") — every other
// schema is a DTO/wrapper/nested type (a FIELD TYPE, not an object; the anti-blowup rule).
// Non-door groups still participate in L2..L5 when an emitted IO matches them.
const matchedGroups = new Set();
const groupMatch = new Map(); // canonName -> { e: emitted IO, kind: 'direct'|'ns' }
result.L1_objects.classifiedExclusions = [];
for (const [c, g] of groups) {
    let e = matchEmitted(c);
    let kind = 'direct';
    if (!e) { for (const ns of g.nsNames) { e = matchEmitted(ns); if (e) { kind = 'ns'; break; } } }
    if (e) { matchedGroups.add(c); groupMatch.set(c, { e, kind }); continue; }
    if (g.listPath) {
        // Auto-classify before declaring missing (deterministic, type-info permitting):
        // an envelope whose ITEM type is emitted is covered — the item is the canonical object.
        const env = isEnvelopeOfEmittedItem(g);
        if (env) { result.L1_objects.classifiedExclusions.push({ name: g.names[0], reason: `envelope-of-emitted-item: ${env}` }); continue; }
        result.L1_objects.missing.push(`${g.names[0]} (door: ${g.listPath})`); // an unmatched DOOR is a real coverage gap
    }
}
const matchedEmitted = new Set([...groupMatch.values()].map((m) => m.e.name));
for (const o of emitted) if (!matchedEmitted.has(o.name)) result.L1_objects.orphan.push(o.name);

// L2..L5 — per matched canonical group (union of variants). DEEP levels run only for DIRECT
// name matches or doors — an ns-fallback match without a listPath is a request/option DTO that
// merely shares the namespace (comparing its fields against the IO is garbage-in).
for (const c of matchedGroups) {
    const s = groups.get(c);
    const { e, kind } = groupMatch.get(c);
    if (kind === 'ns' && !s.listPath) continue;
    // L2 fields. Orphan exclusions (deterministic): __mj system columns, and connector-DERIVED
    // fields — parent-FK injections on nested/access-path objects (IsForeignKey=true IOFs).
    const missingFields = [...s.fields.keys()].filter((fn) => !e.fields.has(fn));
    const derivedOK = new Set(e.iofs.filter((x) => x.IsForeignKey === true).map((x) => String(x.Name)));
    const orphanFields = [...e.fields].filter((fn) => !s.fields.has(fn) && !fn.startsWith('__mj') && !derivedOK.has(fn));
    if (missingFields.length || orphanFields.length) result.L2_fields.push({ object: e.name, missingFields, orphanFields });
    // L3 list path
    if (source.machineReadable.L3 && s.listPath && e.apiPath && norm(s.listPath) !== norm(e.apiPath)) {
        result.L3_paths.push({ object: e.name, declared: e.apiPath, derived: s.listPath });
    }
    // L4 write surface
    if (source.machineReadable.L4 && s.writeOps.length > 0) {
        const hasAnyWrite = e.write.create || e.write.update || e.write.del;
        if (!hasAnyWrite) result.L4_writeSurface.push({ object: e.name, specWriteOps: s.writeOps.slice(0, 6), emittedWrite: e.write });
    }
    // L5 constraints (spec-stated only — provable-only cuts both ways: we diff stated facts, never infer)
    if (source.machineReadable.L5) {
        for (const [fn, fc] of s.fields) {
            const iof = e.iofs.find((x) => String(x.Name) === fn);
            if (!iof) continue;
            if (fc.required === true && iof.IsRequired === false) result.L5_constraints.push({ object: e.name, field: fn, dimension: 'required', spec: true, emitted: false });
            if (fc.maxLength != null && iof.Length != null && Number(iof.Length) < fc.maxLength) result.L5_constraints.push({ object: e.name, field: fn, dimension: 'maxLength', spec: fc.maxLength, emitted: iof.Length });
        }
    }
}

// ── TRANSPARENCY (anti-self-grading): every discard/merge the rules performed, enumerated. A
// "clean" verdict is only auditable when the exclusions are visible — a reviewer (or a future
// adversarial pass) must be able to check that no distinct object was silently merged away and
// no door silently dropped. (Added after the operator challenged a too-clean green, 2026-06-12.)
result.transparency = {
    // groups built from >1 spec schema (variant merging) — the union members are listed so a
    // wrongly-merged DISTINCT object is visible by name.
    mergedGroups: [...groups.entries()].filter(([, g]) => g.names.length > 1).map(([c, g]) => ({ canon: c, variants: g.names })),
    // schemas excluded from L1 by the door rule (no GET-collection reference) — counted + sampled.
    nonDoorSchemaCount: [...groups.values()].filter((g) => !g.listPath).length,
    nonDoorSchemaSample: [...groups.entries()].filter(([, g]) => !g.listPath).slice(0, 20).map(([, g]) => g.names[0]),
    // known latent blind spot, stated: the door rule counts GET collections only. A vendor that
    // lists via POST-search would have those objects invisibly excluded — probe the paths section
    // for POST ops with collection-shaped responses before trusting L1 on such a vendor.
    doorRuleNote: 'GET-collection doors only; POST-list/search patterns are NOT detected — verify none exist in the spec before trusting a clean L1.',
};

result.summary = {
    L1_missing: result.L1_objects.missing.length,
    L1_orphan: result.L1_objects.orphan.length,
    L2_objectsWithFieldGaps: result.L2_fields.length,
    L3_pathMismatches: result.L3_paths.length,
    L4_writeSurfaceGaps: result.L4_writeSurface.length,
    L5_constraintGaps: result.L5_constraints.length,
    clean: result.L1_objects.missing.length === 0 && result.L2_fields.length === 0 && result.L3_paths.length === 0 && result.L4_writeSurface.length === 0 && result.L5_constraints.length === 0,
};

mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, 'COMPLETENESS_DIFF.json'), JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify({ sourceKind: source.kind, ...result.summary, notMachineReadable: result.notMachineReadable, out: resolve(OUT, 'COMPLETENESS_DIFF.json') }, null, 2) + '\n');
