// enumerate-catalog.mjs — the shared DETERMINISTIC record-type enumerator.
//
// WHY THIS EXISTS (the Salesforce-11-of-1,694 / Path-LMS-16-of-93 failure class):
// the object UNIVERSE must be a function of the source's own machine-readable model,
// never an agent's in-context recital. Three roles reference this file as the single
// source of the record-type universe (source-auditor, ioiof-extractor, code-builder),
// and floor-check runs it ITSELF over the saved source artifact to reconcile the
// declared scope against reality — so the count is removed from agent judgment.
//
// THE RULE: enumerate RECORD TYPES, not ENTRY POINTS. An API exposes a few doors
// (GraphQL query fields, REST collection roots) but the syncable data lives in the
// record types reachable through them. Path LMS = 16 query doors but ~93 record types.
// So the universe = every record-bearing object/complex type the schema defines
// (has fields), EXCLUDING: scalars, enums, inputs, interfaces-without-fields, the
// operation roots (Query/Mutation/Subscription), GraphQL introspection internals
// (__-prefixed), and Relay pagination plumbing (*Connection / *Edge / PageInfo) —
// the node INSIDE an edge is the record, the wrapper is not a table.
//
// Pure Node built-ins — no npm parser deps, so it runs anywhere the workshop runs.
// Returns { format, recordTypes: string[], count, confidence: 'high'|'low' }.
// confidence='low' means a best-effort scrape (YAML/HTML) that floor-check must treat
// as non-authoritative (warn, never hard-fail a thin-scope verdict on a low-confidence
// count — a false under-count would wrongly pass, a false over-count would wrongly fail).

import { readFileSync } from 'node:fs';

const OPERATION_ROOTS = new Set(['Query', 'Mutation', 'Subscription', 'query', 'mutation', 'subscription']);
// Relay pagination plumbing + common envelope wrappers — not syncable tables.
const PLUMBING_RE = /(Connection|Edge|PageInfo|_?PageInfo|ConnectionPageInfo)$/;
const isPlumbing = (name) => PLUMBING_RE.test(name) || name === 'PageInfo';
const isInternal = (name) => name.startsWith('__');

function dedupeSorted(names) {
    return [...new Set(names.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// ── GraphQL introspection JSON ({ __schema: { types: [...] } } or { data: { __schema } }) ──
function fromIntrospection(json) {
    const schema = json.__schema ?? json.data?.__schema;
    if (!schema || !Array.isArray(schema.types)) return null;
    const rootNames = new Set(
        [schema.queryType?.name, schema.mutationType?.name, schema.subscriptionType?.name].filter(Boolean),
    );
    const recordTypes = schema.types
        // OBJECT and INTERFACE both carry fields and back real record sets (an `interface Activity`
        // implemented by several types IS a syncable shape). Exclude SCALAR/ENUM/INPUT_OBJECT/UNION
        // (UNION has no own fields — its members are already enumerated as their own OBJECTs).
        .filter((t) => t && (t.kind === 'OBJECT' || t.kind === 'INTERFACE'))
        .map((t) => t.name)
        .filter((n) => n && !isInternal(n) && !rootNames.has(n) && !isPlumbing(n))
        // a record type must actually carry fields (an empty type is not a table)
        .filter((n) => {
            const t = schema.types.find((x) => x.name === n);
            return Array.isArray(t.fields) && t.fields.length > 0;
        });
    const fieldCount = recordTypes.reduce((sum, n) => {
        const t = schema.types.find((x) => x.name === n);
        return sum + (Array.isArray(t.fields) ? t.fields.length : 0);
    }, 0);
    return { format: 'graphql-introspection', recordTypes: dedupeSorted(recordTypes), fieldCount, confidence: 'high' };
}

// ── OpenAPI / Swagger JSON (components.schemas | definitions) ──
function fromOpenAPIJson(json) {
    if (!(json.openapi || json.swagger || json.paths)) return null;
    const schemas = json.components?.schemas ?? json.definitions ?? {};
    const names = Object.keys(schemas).filter((n) => {
        const s = schemas[n];
        if (!s || typeof s !== 'object') return false;
        // a record type is an object schema (has properties or is type:object); skip pure enums / primitive aliases
        const isObject = s.type === 'object' || !!s.properties || !!s.allOf || (!s.type && !s.enum);
        return isObject && !s.enum;
    });
    const fieldCount = names.reduce((sum, n) => {
        const props = schemas[n]?.properties;
        return sum + (props && typeof props === 'object' ? Object.keys(props).length : 0);
    }, 0);
    return { format: 'openapi-json', recordTypes: dedupeSorted(names), fieldCount, confidence: 'high' };
}

// ── GraphQL SDL text (`type X { ... }`, `interface X { ... }`, `extend type X`) ──
function fromSDL(text) {
    if (!/\b(?:type|interface)\s+[A-Za-z_]\w*\s*(?:implements[^{]+)?\{/.test(text)) return null;
    const names = [];
    let fieldCount = 0;
    // both `type` and `interface` are record-bearing; `input`/`enum`/`scalar`/`union` are not matched
    const re = /\b(?:extend\s+)?(?:type|interface)\s+([A-Za-z_]\w*)\s*(?:implements[^{]+)?\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const name = m[1];
        const body = m[2];
        if (OPERATION_ROOTS.has(name) || isInternal(name) || isPlumbing(name)) continue;
        const fieldLines = (body.match(/[A-Za-z_]\w*\s*(?:\([^)]*\))?\s*:/g) || []).length; // `name:` / `name(args):` declarations
        if (fieldLines === 0) continue;   // must declare at least one field
        names.push(name);
        fieldCount += fieldLines;
    }
    if (names.length === 0) return null;
    return { format: 'graphql-sdl', recordTypes: dedupeSorted(names), fieldCount, confidence: 'high' };
}

// ── Postman collection JSON (v2.x: { info, item: [...] }) — the record universe is the set of
// resources addressed by requests. Many vendors ship ONLY a Postman collection (no OpenAPI/SDL),
// so without this the universe would silently read as 0 for them. We derive resource names from
// request URL path segments (skipping ids/version/templated/query segments) + folder names, and
// union them — a high-confidence STRUCTURAL read (the collection is the vendor's own machine model),
// though coarser than a typed schema, so we keep it 'high' only when it yields a real resource set.
function fromPostman(json) {
    if (!json || !json.info || !Array.isArray(json.item)) return null;
    const resources = new Set();
    const isIdish = (seg) =>
        !seg ||
        /^[:{]/.test(seg) ||                                    // :id  {{var}}  {id}
        /^v?\d+$/i.test(seg) ||                                 // v1 v2 2  (version/id)
        /^[0-9a-f]{8,}$/i.test(seg) ||                          // hex/uuid-ish id
        seg.startsWith('?') || seg.includes('=');               // query fragment
    const singularize = (s) => s.replace(/ies$/i, 'y').replace(/s$/i, '');
    const collectURL = (url) => {
        const raw = typeof url === 'string' ? url : url?.raw ?? '';
        if (!raw) return;
        const afterHost = raw.replace(/^[a-z]+:\/\/[^/]+/i, '').split('?')[0];
        for (const seg of afterHost.split('/')) {
            const s = seg.trim();
            if (isIdish(s)) continue;
            if (/^[A-Za-z][\w.-]*$/.test(s) && !['api', 'rest', 'public', 'services'].includes(s.toLowerCase())) {
                resources.add(singularize(s));
            }
        }
    };
    const walk = (items) => {
        for (const it of items ?? []) {
            if (Array.isArray(it.item)) walk(it.item);          // a folder → recurse (folder name is a weak signal; URLs are primary)
            if (it.request) collectURL(it.request.url);
        }
    };
    walk(json.item);
    const recordTypes = dedupeSorted([...resources]);
    if (recordTypes.length === 0) return null;
    return { format: 'postman', recordTypes, confidence: 'high' };
}

// ── XSD (xs:complexType name="X") ──
function fromXSD(text) {
    if (!/<xs:complexType/i.test(text) && !/<xsd:complexType/i.test(text)) return null;
    const names = [];
    const re = /<(?:xs|xsd):complexType\b[^>]*\bname\s*=\s*"([^"]+)"/gi;
    let m;
    while ((m = re.exec(text)) !== null) names.push(m[1]);
    if (names.length === 0) return null;
    return { format: 'xsd', recordTypes: dedupeSorted(names), confidence: 'high' };
}

// ── OpenAPI YAML (best-effort: top-level keys under components:/schemas: or definitions:) ──
function fromOpenAPIYaml(text) {
    if (!/^\s*(openapi|swagger)\s*:/m.test(text) && !/^\s*paths\s*:/m.test(text)) return null;
    const lines = text.split(/\r?\n/);
    const names = [];
    // find a `schemas:` (under components) or top-level `definitions:` block and collect its direct children
    for (let i = 0; i < lines.length; i++) {
        const key = lines[i].match(/^(\s*)(schemas|definitions)\s*:\s*$/);
        if (!key) continue;
        const baseIndent = key[1].length;
        const childIndent = baseIndent + 2;
        for (let j = i + 1; j < lines.length; j++) {
            if (/^\s*$/.test(lines[j]) || /^\s*#/.test(lines[j])) continue;
            const indent = lines[j].match(/^(\s*)/)[1].length;
            if (indent <= baseIndent) break;                 // dedent out of the block
            const child = lines[j].match(/^(\s*)([A-Za-z_][\w.-]*)\s*:\s*$/);
            if (child && child[1].length === childIndent) names.push(child[2]);
        }
    }
    if (names.length === 0) return null;
    return { format: 'openapi-yaml', recordTypes: dedupeSorted(names), confidence: 'low' };
}

// ── SpectaQL / GraphDoc / Redoc HTML (best-effort: type anchors / definition ids) ──
function fromHTML(text) {
    if (!/<html|<!doctype html|<body/i.test(text)) return null;
    const names = new Set();
    // SpectaQL: id="definition-Account" / GraphDoc: href="#definition-Account" / Redoc: id="tag/Account"
    for (const re of [
        /id\s*=\s*"(?:definition|type|schema)-([A-Za-z_]\w*)"/gi,
        /href\s*=\s*"#(?:definition|type)-([A-Za-z_]\w*)"/gi,
    ]) {
        let m;
        while ((m = re.exec(text)) !== null) {
            const n = m[1];
            if (!OPERATION_ROOTS.has(n) && !isInternal(n) && !isPlumbing(n)) names.add(n);
        }
    }
    if (names.size === 0) return null;
    return { format: 'spectaql-html', recordTypes: dedupeSorted([...names]), confidence: 'low' };
}

/**
 * Enumerate the record-type universe from a source's machine-readable model.
 * @param {string} sourceText raw text of an OpenAPI/Swagger doc, GraphQL SDL,
 *   GraphQL introspection JSON, XSD, or SpectaQL/GraphDoc HTML.
 * @returns {{format:string, recordTypes:string[], count:number, confidence:'high'|'low'}}
 */
export function enumerateCatalog(sourceText) {
    if (typeof sourceText !== 'string' || sourceText.trim() === '') {
        return { format: 'unknown', recordTypes: [], count: 0, confidence: 'low' };
    }
    let json = null;
    try { json = JSON.parse(sourceText); } catch { /* not JSON */ }

    const attempts = [];
    if (json && typeof json === 'object') {
        attempts.push(() => fromIntrospection(json));
        attempts.push(() => fromOpenAPIJson(json));
        attempts.push(() => fromPostman(json));
    }
    attempts.push(() => fromSDL(sourceText));
    attempts.push(() => fromXSD(sourceText));
    attempts.push(() => fromOpenAPIYaml(sourceText));
    attempts.push(() => fromHTML(sourceText));

    for (const attempt of attempts) {
        const r = attempt();
        if (r && r.recordTypes.length > 0) return { ...r, count: r.recordTypes.length };
    }
    return { format: 'unrecognized', recordTypes: [], count: 0, confidence: 'low' };
}

/**
 * Read a file and enumerate it. Returns the same shape plus `sourcePath`.
 * Returns count:0 / confidence:'low' (never throws) when the file is unreadable —
 * floor-check treats a count it cannot obtain as "universe unmeasured", which is
 * itself a flagged condition rather than a silent pass.
 */
export function enumerateCatalogFile(sourcePath) {
    let text = '';
    try { text = readFileSync(sourcePath, 'utf8'); }
    catch { return { format: 'unreadable', recordTypes: [], count: 0, confidence: 'low', sourcePath }; }
    return { ...enumerateCatalog(text), sourcePath };
}

/**
 * Enumerate the UNION of record types across multiple authoritative source files.
 * The real universe is everything every machine-readable source exposes — a vendor may
 * ship an OpenAPI doc AND an SDL AND a Postman collection, each surfacing types the
 * others omit. Unions the names; reports `confidence:'high'` iff at least one source
 * read high-confidence (a typed/structural model anchored the count); `perSource` lets
 * floor-check show exactly which artifact contributed what.
 * @param {string[]} sourcePaths
 * @returns {{recordTypes:string[], count:number, confidence:'high'|'low', perSource:Array<{sourcePath,format,count,confidence}>}}
 */
export function enumerateCatalogFiles(sourcePaths) {
    const paths = (sourcePaths ?? []).filter((p) => typeof p === 'string' && p.trim() !== '');
    const union = new Set();
    const perSource = [];
    let anyHigh = false;
    let fieldCount = 0;
    for (const p of paths) {
        const r = enumerateCatalogFile(p);
        for (const n of r.recordTypes) union.add(n);
        if (r.confidence === 'high' && r.count > 0) anyHigh = true;
        if (typeof r.fieldCount === 'number') fieldCount = Math.max(fieldCount, r.fieldCount); // max across sources (the richest single model), not sum (avoids double-counting shared types)
        perSource.push({ sourcePath: p, format: r.format, count: r.count, fieldCount: r.fieldCount ?? null, confidence: r.confidence });
    }
    const recordTypes = dedupeSorted([...union]);
    return { recordTypes, count: recordTypes.length, fieldCount, confidence: anyHigh ? 'high' : 'low', perSource };
}

// CLI: `node enumerate-catalog.mjs <file...>` → prints JSON. One file → single-source shape;
// multiple files → union shape with perSource breakdown.
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    if (args.length === 0) { process.stderr.write('usage: node enumerate-catalog.mjs <source-file...>\n'); process.exit(2); }
    const out = args.length === 1 ? enumerateCatalogFile(args[0]) : enumerateCatalogFiles(args);
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}
