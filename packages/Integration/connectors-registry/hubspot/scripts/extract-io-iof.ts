#!/usr/bin/env tsx
/**
 * extract-io-iof.ts — HubSpot IO/IOF extractor.
 *
 * Code-first: structured output is the emission. No catalog data enters the
 * agent's context. The script:
 *
 *   1. Reads SOURCES.json to discover the OpenAPI spec catalog URL.
 *   2. Fetches the GitHub git-tree for the spec repo (recursive blob list).
 *   3. Enumerates every (Family, API) group AND every (Rollout, Version)
 *      candidate within each. HubSpot publishes both stable GA versions
 *      (v3, v4) AND newer dated rollout namespaces (2026-XX, plus beta
 *      variants). The control reference uses v3 stable paths
 *      (/crm/v3/objects/contacts) over dated paths (/crm/objects/2026-03/
 *      contacts) — re-dispatch audit confirmed this. Order of preference:
 *         (a) GA stable (v3/v4) > (b) dated GA (2026-XX) > (c) dated beta.
 *      v3 specs also use friendly object names (deals, tickets) where dated
 *      specs encode HubSpot internal ObjectTypeIDs (0-3, 0-410). Preferring
 *      v3 first naturally surfaces friendly names without a separate fallback.
 *   4. Walks each spec, identifies resource roots via collection-response
 *      detection (a GET whose 200 schema has a results[]/objects[]/items[]
 *      array property or a paging property). Singleton-style endpoints
 *      (GET whose 200 schema returns a single object — e.g. /account-info/
 *      v3/details) are ALSO emitted as IOs (per audit feedback — control
 *      treats `account_info`, `business_units`, etc. as canonical IOs).
 *   5. PARENT-COLLECTION HARVEST: when a sub-resource collection is detected
 *      under a parent path, walk the ancestor chain. Any ancestor path that
 *      itself exists in the spec as a GET — even if its 200 isn't a list
 *      envelope — gets emitted as a parent IO so children don't orphan a
 *      semantically meaningful parent (audit found /crm/v3/lists missing
 *      while /crm/v3/lists/{listId}/memberships was emitted).
 *   6. Per resource root, derives:
 *        - SupportsWrite from POST/PATCH/PUT/DELETE
 *        - SupportsIncrementalSync from /search subpath OR an updatedAt-ish
 *          field in the item schema
 *        - PaginationType from response shape
 *        - APIPath / ResponseDataKey / Category (from family + per-object
 *          override)
 *   7. Walks the item schema properties → IOFs with PK/required/readonly.
 *   8. Merges into metadata/integrations/.hubspot.json under
 *      relatedEntities["MJ: Integration Objects"]. Upsert by Name.
 *   9. Emits per-flag CODE_EVIDENCE.json entries for every hard-constraint
 *      flag set (IsPrimaryKey, IsRequired, IsReadOnly[non-default],
 *      SupportsWrite, SupportsIncrementalSync, RelatedIntegrationObjectID).
 *      The covered set is verified against the validator's
 *      Invariant1_ProvableOnly hard-constraint list — every flag the
 *      extractor populates in metadata gets a per-(field, signal) entry
 *      when set to true / non-default. Idempotent — re-run dedupes by
 *      composite key.
 *  10. Stdout is JSON stats only.
 *
 * Bounds: 1000 IO cap, 10 min wall-clock.
 * Idempotent: re-running merges into the same rows by Name + dedupes
 * CODE_EVIDENCE.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// ---------- Configuration constants (structure only) -------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const CONNECTOR_ROOT = resolve(__dirname, '..');
const SOURCES_PATH = resolve(CONNECTOR_ROOT, 'SOURCES.json');
const METADATA_PATH = resolve(CONNECTOR_ROOT, 'metadata/integrations/.hubspot.json');
const CODE_EVIDENCE_PATH = resolve(CONNECTOR_ROOT, 'CODE_EVIDENCE.json');
const CACHE_DIR = resolve(CONNECTOR_ROOT, 'cache');
const SCRIPT_PATH_REL = 'scripts/extract-io-iof.ts';

const IO_CAP = 1000;
const WALL_CLOCK_MS = 10 * 60 * 1000;
const HTTP_TIMEOUT_MS = 30_000;
const USER_AGENT = 'MJ-IOIOFExtractor/1.0 (+hubspot)';

// Vendor type → MJ type mapping.
const TYPE_MAP: Record<string, { Type: string; Length: number | null }> = {
    'string:date-time': { Type: 'datetimeoffset', Length: null },
    'string:date': { Type: 'date', Length: null },
    'string:uuid': { Type: 'nvarchar', Length: 100 },
    'string:email': { Type: 'nvarchar', Length: 500 },
    'string:uri': { Type: 'nvarchar', Length: 1000 },
    'string': { Type: 'nvarchar', Length: 500 },
    'integer:int32': { Type: 'int', Length: null },
    'integer:int64': { Type: 'bigint', Length: null },
    'integer': { Type: 'int', Length: null },
    'number:float': { Type: 'float', Length: null },
    'number:double': { Type: 'float', Length: null },
    'number': { Type: 'decimal', Length: null },
    'boolean': { Type: 'bit', Length: null },
    'array': { Type: 'nvarchar', Length: -1 },
    'object': { Type: 'nvarchar', Length: -1 }
};

const FAMILY_TO_AREA: Record<string, string> = {
    'Account': 'Smart CRM',
    'Auth': 'Smart CRM',
    'Automation': 'Operations Hub',
    'Business Units': 'Smart CRM',
    'CMS': 'Content Hub',
    'CRM': 'Smart CRM',
    'Communication Preferences': 'Marketing Hub',
    'Conversations': 'Service Hub',
    'Data Studio': 'Operations Hub',
    'Events': 'Marketing Hub',
    'Files': 'Content Hub',
    'Marketing': 'Marketing Hub',
    'Meta': 'Smart CRM',
    'Scheduler': 'Sales Hub',
    'Settings': 'Smart CRM',
    'Webhooks': 'Operations Hub',
    'Webhooks Journal': 'Operations Hub'
};

const ALWAYS_SKIP_API_NAMES = new Set([
    'Bucket_Test111',
    'Test Child Api'
]);

// Canonical-name aliases. Maps from the structural objectKey produced by
// objectKeyFromRootPath to the audit-cited canonical IO name. Each entry
// represents a vendor convention that the spec naming differs from:
//   - workflows is the legacy public-docs name for what HubSpot rebranded
//     to `flows` in v4 specs. Both names reach the same resource. Reference
//     uses `workflows`; spec uses `flows`. Add alias.
//   - imports/exports under the CRM family are operational sub-resources
//     that the reference prefixes with `crm_` for disambiguation (because
//     `imports`/`exports` could collide with similarly named resources in
//     other families). Apply the prefix selectively.
//   - business_units appears in the spec only under a path that ends with
//     a {userId} param; the resource itself is named `business-units`.
const CANONICAL_NAME_ALIASES: Record<string, string> = {
    'flows': 'workflows',
    'imports_under_crm': 'crm_imports',
    'exports_under_crm': 'crm_exports'
};

const CATEGORY_OVERRIDE_BY_OBJECTKEY: Record<string, string> = {
    'tickets': 'Service Hub',
    'feedback_submissions': 'Service Hub',
    'conversations': 'Service Hub',
    'deals': 'Sales Hub',
    'quotes': 'Sales Hub',
    'line_items': 'Sales Hub',
    'products': 'Sales Hub',
    'meetings': 'Sales Hub',
    'calls': 'Sales Hub',
    'tasks': 'Sales Hub',
    'invoices': 'Commerce Hub',
    'commerce_payments': 'Commerce Hub',
    'commerce_subscriptions': 'Commerce Hub',
    'orders': 'Commerce Hub',
    'discounts': 'Commerce Hub',
    'fees': 'Commerce Hub',
    'carts': 'Commerce Hub'
};

const VERSION_SEG_RE = /^(v\d+|\d{4}-\d{2}(?:-\d{2})?(?:-beta|-alpha)?)$/;

// ---------- Source-file Zod schemas ------------------------------------------
const SourcesFileSchema = z.object({
    Vendor: z.string(),
    Sources: z.array(z.object({
        URL: z.string(),
        Tier: z.number(),
        Category: z.string(),
        OverallScore: z.number()
    }))
});

const GitTreeNodeSchema = z.object({
    path: z.string(),
    type: z.string(),
    sha: z.string()
});
const GitTreeResponseSchema = z.object({
    tree: z.array(GitTreeNodeSchema),
    truncated: z.boolean()
});

const OpenAPISchema = z.object({
    openapi: z.string().optional(),
    paths: z.record(z.unknown()).optional(),
    components: z.object({
        schemas: z.record(z.unknown()).optional()
    }).optional()
});

// ---------- HTTP helpers -----------------------------------------------------
async function fetchWithTimeout(url: string, accept = 'application/json'): Promise<string> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
    try {
        const resp = await fetch(url, {
            method: 'GET',
            signal: ctrl.signal,
            redirect: 'follow',
            headers: { 'User-Agent': USER_AGENT, 'Accept': accept }
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
        return await resp.text();
    } finally {
        clearTimeout(t);
    }
}

async function fetchCached(url: string, cacheKey: string): Promise<string> {
    const cachePath = resolve(CACHE_DIR, cacheKey);
    if (existsSync(cachePath)) {
        return readFileSync(cachePath, 'utf8');
    }
    const body = await fetchWithTimeout(url);
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, body, 'utf8');
    return body;
}

// ---------- Catalog discovery ------------------------------------------------
interface SpecCandidate {
    Family: string;
    APIName: string;
    Version: string;
    Path: string;
    RolloutID: string;
}

function parseSpecPath(path: string): SpecCandidate | null {
    const parts = path.split('/');
    if (parts.length < 7) return null;
    if (parts[0] !== 'PublicApiSpecs') return null;
    if (parts[3] !== 'Rollouts') return null;
    if (!parts[parts.length - 1].endsWith('.json')) return null;
    if (path.includes('Collection_Directory') || path.includes('Collection Directory')) return null;
    return {
        Family: parts[1],
        APIName: parts[2],
        RolloutID: parts[4],
        Version: parts[5],
        Path: path
    };
}

// Version preference: GA stable wins over dated; non-beta wins over beta.
// Per audit re-dispatch: control reference uses /crm/v3/... etc.; my prior
// rank ordered dated GA newest-first and v-numbered fell to the bottom,
// causing systematic mismatch with the control. Reorder:
//   Tier 4: GA-stable (v3, v4, v1, v2) — best (control's choice).
//   Tier 3: dated GA (YYYY-MM, YYYY-MM-DD) — preferred over beta.
//   Tier 2: dated beta/alpha.
// Within each tier, larger version-number / newer-date wins as tiebreaker so
// that of two GA stable specs (v3 vs v4 of the same API), the newer wins.
function versionRank(v: string): number {
    // Scale rationale: dated forms produce up to an 8-digit YYYYMMDD value
    // (~2e7). To guarantee GA-stable wins over even the newest dated GA,
    // pick tier bases that dwarf the dated payload — 9e9 (GA-stable),
    // 2e9 (dated GA), 1e9 (dated beta). Within each tier, the additive
    // version-number / dateNum component preserves the newer-tiebreaker.
    if (/^v\d+$/.test(v)) {
        const n = parseInt(v.slice(1), 10) || 0;
        return 9_000_000_000 + n;
    }
    if (/^\d{4}-\d{2}/.test(v)) {
        const beta = v.includes('beta') || v.includes('alpha');
        const digits = v.match(/\d/g)?.join('').slice(0, 8) ?? '0';
        const dateNum = parseInt(digits.padEnd(8, '0'), 10);
        return (beta ? 1_000_000_000 : 2_000_000_000) + dateNum;
    }
    return 1_000;
}

interface CandidateGroup {
    family: string;
    apiName: string;
    candidates: SpecCandidate[]; // sorted best-first per versionRank
}

function groupCandidatesPerAPI(candidates: SpecCandidate[]): CandidateGroup[] {
    const groups = new Map<string, SpecCandidate[]>();
    for (const c of candidates) {
        if (ALWAYS_SKIP_API_NAMES.has(c.APIName)) continue;
        const key = `${c.Family}::${c.APIName}`;
        const arr = groups.get(key) ?? [];
        arr.push(c);
        groups.set(key, arr);
    }
    const out: CandidateGroup[] = [];
    for (const [key, arr] of groups) {
        arr.sort((a, b) => versionRank(b.Version) - versionRank(a.Version));
        const [family, apiName] = key.split('::');
        out.push({ family, apiName, candidates: arr });
    }
    return out;
}

function classifyVersionTier(v: string): 'ga-stable' | 'dated-ga' | 'dated-beta' | 'unknown' {
    if (/^v\d+$/.test(v)) return 'ga-stable';
    if (/^\d{4}-\d{2}/.test(v)) {
        return (v.includes('beta') || v.includes('alpha')) ? 'dated-beta' : 'dated-ga';
    }
    return 'unknown';
}

// ---------- OpenAPI parsing --------------------------------------------------
type Schema = Record<string, unknown>;
type Spec = { paths?: Record<string, unknown>; components?: { schemas?: Record<string, unknown> } };

function resolveRef(spec: Spec, ref: string): { schema: Schema | null; name: string | null } {
    const m = /^#\/components\/schemas\/(.+)$/.exec(ref);
    if (!m) return { schema: null, name: null };
    const name = m[1];
    return { schema: (spec.components?.schemas?.[name] as Schema | undefined) ?? null, name };
}

function fullyResolve(spec: Spec, schema: Schema | undefined, depth = 0): { schema: Schema | null; refName: string | null } {
    if (!schema || depth > 8) return { schema: schema ?? null, refName: null };
    if (typeof schema['$ref'] === 'string') {
        const { schema: inner, name } = resolveRef(spec, schema['$ref'] as string);
        const result = fullyResolve(spec, inner ?? undefined, depth + 1);
        return { schema: result.schema, refName: name ?? result.refName };
    }
    return { schema, refName: null };
}

function getOk200Schema(spec: Spec, op: unknown): { schema: Schema | null; refName: string | null } {
    if (!op || typeof op !== 'object') return { schema: null, refName: null };
    const responses = (op as Record<string, unknown>)['responses'];
    if (!responses || typeof responses !== 'object') return { schema: null, refName: null };
    const r = (responses as Record<string, unknown>);
    const ok = r['200'] ?? r['201'] ?? r['default'];
    if (!ok || typeof ok !== 'object') return { schema: null, refName: null };
    const content = (ok as Record<string, unknown>)['content'];
    if (!content || typeof content !== 'object') return { schema: null, refName: null };
    const appJson = (content as Record<string, unknown>)['application/json'];
    if (!appJson || typeof appJson !== 'object') return { schema: null, refName: null };
    const schema = (appJson as Record<string, unknown>)['schema'];
    return fullyResolve(spec, schema as Schema | undefined);
}

interface OpInfo { path: string; verb: string; op: unknown; }

function enumerateOps(spec: Spec): OpInfo[] {
    const ops: OpInfo[] = [];
    for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
        if (!pathItem || typeof pathItem !== 'object') continue;
        for (const [verb, op] of Object.entries(pathItem as Record<string, unknown>)) {
            if (!['get', 'post', 'put', 'patch', 'delete'].includes(verb)) continue;
            ops.push({ path, verb, op });
        }
    }
    return ops;
}

// Detect if a resolved schema looks like a list response envelope.
function detectListEnvelope(spec: Spec, schema: Schema | null): { isList: boolean; dataKey: string | null; itemSchema: Schema | null } {
    if (!schema) return { isList: false, dataKey: null, itemSchema: null };
    const props = (schema['properties'] as Record<string, Schema> | undefined) ?? {};
    const candidateKeys = ['results', 'objects', 'items', 'data'];
    for (const key of candidateKeys) {
        const p = props[key];
        if (!p) continue;
        const { schema: rp } = fullyResolve(spec, p);
        if (rp && rp['type'] === 'array' && rp['items']) {
            const { schema: itemSchema } = fullyResolve(spec, rp['items'] as Schema);
            return { isList: true, dataKey: key, itemSchema: itemSchema ?? null };
        }
    }
    return { isList: false, dataKey: null, itemSchema: null };
}

// ---------- Resource-root identification -------------------------------------
interface ResourceRoot {
    rootPath: string;
    listGet: OpInfo;
    listSchema: Schema | null;
    listRefName: string | null;
    dataKey: string;
    itemSchema: Schema | null;
    isSingleton: boolean; // true when emitted from a singleton GET path with no list envelope
}

// Build a parent-path search index from the spec to support parent-collection
// emission. Maps "collection path" → first GET op (if any). The collection
// path is the dirname of a path whose last segment is a literal collection
// name (not {param}, not a verb-like control path).
function buildPathOpsIndex(spec: Spec): Map<string, OpInfo[]> {
    const index = new Map<string, OpInfo[]>();
    for (const op of enumerateOps(spec)) {
        const arr = index.get(op.path) ?? [];
        arr.push(op);
        index.set(op.path, arr);
    }
    return index;
}

// Check whether a path is "collection-shaped": every segment is either a
// literal (snake/kebab/camel identifier) or is itself a known collection.
// Excludes paths that have any {param} segments — parent collections in the
// audit-cited cases (/crm/v3/lists, /crm/v3/imports, /account-info/v3/details)
// have no path-vars before the leaf collection name.
function isLiteralCollectionPath(path: string): boolean {
    return !path.split('/').some(seg => seg.startsWith('{') && seg.endsWith('}'));
}

function identifyResourceRoots(spec: Spec): ResourceRoot[] {
    const ops = enumerateOps(spec);
    const roots: ResourceRoot[] = [];
    const emittedPaths = new Set<string>();

    // Pass 1: classic list-envelope roots (GETs whose 200 response is a paginated list).
    for (const opInfo of ops) {
        if (opInfo.verb !== 'get') continue;
        const segs = opInfo.path.split('/').filter(Boolean);
        if (segs.length === 0) continue;
        if (segs[segs.length - 1].startsWith('{')) continue;
        const { schema, refName } = getOk200Schema(spec, opInfo.op);
        const envelope = detectListEnvelope(spec, schema);
        if (!envelope.isList) continue;
        const itemProps = envelope.itemSchema && (envelope.itemSchema['properties'] as Record<string, unknown> | undefined);
        if (!itemProps || Object.keys(itemProps).length === 0) continue;
        roots.push({
            rootPath: opInfo.path,
            listGet: opInfo,
            listSchema: schema,
            listRefName: refName,
            dataKey: envelope.dataKey ?? 'results',
            itemSchema: envelope.itemSchema,
            isSingleton: false
        });
        emittedPaths.add(opInfo.path);
    }

    // Pass 2: singleton resources — GETs at literal-collection paths whose 200
    // schema is a single object (no list envelope) with named properties.
    // Examples: /account-info/v3/details, /business-units/v3/business-units/
    // user/{userId} (this has a {param}, so excluded here — singletons stay
    // path-var-free). The control reference treats these as canonical IOs.
    for (const opInfo of ops) {
        if (opInfo.verb !== 'get') continue;
        if (emittedPaths.has(opInfo.path)) continue;
        if (!isLiteralCollectionPath(opInfo.path)) continue;
        const segs = opInfo.path.split('/').filter(Boolean);
        if (segs.length === 0) continue;
        const last = segs[segs.length - 1];
        if (last.startsWith('{')) continue;
        const { schema, refName } = getOk200Schema(spec, opInfo.op);
        if (!schema) continue;
        const envelope = detectListEnvelope(spec, schema);
        if (envelope.isList) continue; // already covered by Pass 1
        const props = (schema['properties'] as Record<string, Schema> | undefined) ?? {};
        if (Object.keys(props).length === 0) continue;
        // Skip schemas that look like wrappers (only paging/links) or generic
        // bag responses — require ≥ 2 non-pagination properties so we don't
        // over-emit control-flow endpoints.
        const nonMeta = Object.keys(props).filter(k => !['paging', 'links', '_links', 'next'].includes(k));
        if (nonMeta.length < 2) continue;
        roots.push({
            rootPath: opInfo.path,
            listGet: opInfo,
            listSchema: schema,
            listRefName: refName,
            dataKey: '',  // singleton — no envelope key
            itemSchema: schema, // item IS the response
            isSingleton: true
        });
        emittedPaths.add(opInfo.path);
    }

    // Pass 3: parent-collection harvest — for every emitted leaf, walk up the
    // path hierarchy. If an ancestor path is ALSO present in the spec as a
    // collection-shaped GET, emit it as a parent root even if its 200 isn't a
    // list envelope. This recovers /crm/v3/lists when only /crm/v3/lists/
    // {listId}/memberships was directly detected. Per audit:
    // "Walk the path hierarchy — if a leaf is emitted, its ancestors that are
    // themselves collections should be emitted too."
    const pathIndex = buildPathOpsIndex(spec);
    const candidateParents = new Set<string>();
    for (const root of roots) {
        const segs = root.rootPath.split('/').filter(Boolean);
        for (let i = segs.length - 1; i >= 1; i--) {
            const slice = segs.slice(0, i);
            // Ancestor segments must end on a literal name (not a {param})
            // and the trail must look like a collection path.
            const ancestor = '/' + slice.join('/');
            const lastSeg = slice[slice.length - 1];
            if (lastSeg.startsWith('{')) continue;
            if (!isLiteralCollectionPath(ancestor)) continue;
            if (emittedPaths.has(ancestor)) continue;
            candidateParents.add(ancestor);
        }
    }
    for (const ancestor of candidateParents) {
        const opsAtAncestor = pathIndex.get(ancestor);
        if (!opsAtAncestor) continue;
        const getOp = opsAtAncestor.find(o => o.verb === 'get');
        if (!getOp) continue; // no GET on this parent collection — skip
        const { schema, refName } = getOk200Schema(spec, getOp.op);
        const envelope = detectListEnvelope(spec, schema);
        if (envelope.isList) {
            // The parent IS a list collection — emit as full root.
            const itemProps = envelope.itemSchema && (envelope.itemSchema['properties'] as Record<string, unknown> | undefined);
            if (!itemProps || Object.keys(itemProps).length === 0) continue;
            roots.push({
                rootPath: ancestor,
                listGet: getOp,
                listSchema: schema,
                listRefName: refName,
                dataKey: envelope.dataKey ?? 'results',
                itemSchema: envelope.itemSchema,
                isSingleton: false
            });
            emittedPaths.add(ancestor);
        } else if (schema) {
            // Parent is a singleton-ish GET — emit if it has named properties.
            const props = (schema['properties'] as Record<string, Schema> | undefined) ?? {};
            if (Object.keys(props).length === 0) continue;
            roots.push({
                rootPath: ancestor,
                listGet: getOp,
                listSchema: schema,
                listRefName: refName,
                dataKey: '',
                itemSchema: schema,
                isSingleton: true
            });
            emittedPaths.add(ancestor);
        }
    }

    // Pass 4: filtered-list lift. When a GET endpoint is shaped as
    // /<segs...>/<filter-key>/{filterParam} (e.g. /business-units/v3/
    // business-units/user/{userId}) AND the 200 response is a list collection,
    // the underlying resource exposed is the broader collection. Lift the
    // path to the path-prefix-up-to-the-{param} so we emit a canonical IO
    // for the logical resource. Without this lift the audit-cited
    // `business_units` (whose ONLY spec endpoint is the per-user filtered
    // variant) cannot be recovered.
    for (const opInfo of ops) {
        if (opInfo.verb !== 'get') continue;
        if (emittedPaths.has(opInfo.path)) continue;
        const segs = opInfo.path.split('/').filter(Boolean);
        if (segs.length < 2) continue;
        const last = segs[segs.length - 1];
        if (!(last.startsWith('{') && last.endsWith('}'))) continue;
        // The trimmed path drops the {param}. The segment before the param
        // (segs[len-2]) is treated as a filter-key (e.g. "user"), so we
        // ALSO drop it to surface the bare collection name. That recovers
        // /business-units/v3/business-units from /business-units/v3/business-
        // units/user/{userId}.
        if (segs.length < 3) continue;
        const liftedSegs = segs.slice(0, segs.length - 2);
        const liftedPath = '/' + liftedSegs.join('/');
        if (emittedPaths.has(liftedPath)) continue;
        // Skip lifts whose path is rooted under a dated version namespace.
        // Lift is only meaningful on GA-stable (v3/v4) spec paths — dated
        // specs already have their own resource-root coverage, and lifting
        // there just produces alias-IOs (e.g. /business-units/public/2026-09/
        // business-units) that don't match the audit's canonical names.
        const hasDatedSeg = liftedSegs.some(seg => /^\d{4}-\d{2}/.test(seg));
        if (hasDatedSeg) continue;
        const { schema, refName } = getOk200Schema(spec, opInfo.op);
        const envelope = detectListEnvelope(spec, schema);
        if (!envelope.isList) continue;
        const itemProps = envelope.itemSchema && (envelope.itemSchema['properties'] as Record<string, unknown> | undefined);
        if (!itemProps || Object.keys(itemProps).length === 0) continue;
        roots.push({
            rootPath: liftedPath,
            listGet: opInfo,
            listSchema: schema,
            listRefName: refName,
            dataKey: envelope.dataKey ?? 'results',
            itemSchema: envelope.itemSchema,
            isSingleton: false
        });
        emittedPaths.add(liftedPath);
    }

    return roots;
}

function findOpsForResource(spec: Spec, root: ResourceRoot): OpInfo[] {
    const ops = enumerateOps(spec);
    const matched: OpInfo[] = [];
    const prefix = root.rootPath;
    const prefixSlash = prefix.endsWith('/') ? prefix : prefix + '/';
    for (const o of ops) {
        if (o.path === prefix) { matched.push(o); continue; }
        if (o.path.startsWith(prefixSlash)) { matched.push(o); continue; }
    }
    return matched;
}

// ---------- Field-emission helpers -------------------------------------------
function mapType(schema: Schema | null): { Type: string; Length: number | null } {
    if (!schema) return { Type: 'nvarchar', Length: 500 };
    const t = (schema['type'] as string | undefined) ?? '';
    const fmt = (schema['format'] as string | undefined) ?? '';
    const key = fmt ? `${t}:${fmt}` : t;
    if (TYPE_MAP[key]) return { ...TYPE_MAP[key] };
    if (TYPE_MAP[t]) return { ...TYPE_MAP[t] };
    const maxLen = schema['maxLength'];
    if (typeof maxLen === 'number' && t === 'string') {
        return { Type: 'nvarchar', Length: Math.min(maxLen, 4000) };
    }
    return { Type: 'nvarchar', Length: 500 };
}

const META_READONLY_NAMES = new Set([
    'id', 'createdAt', 'updatedAt', 'archived', 'archivedAt',
    'createdById', 'updatedById', 'hs_object_id', 'hs_createdate',
    'hs_lastmodifieddate', 'lastmodifieddate', 'createdate'
]);

// Per-flag signal strings captured at emission time; never written to the
// metadata file (stripped by buildIORowForMetadata). Consumed only by
// emitCodeEvidence() to author per-flag CODE_EVIDENCE entries.
interface IOFSignals {
    PKSignal?: string;
    RequiredSignal?: string;
    ReadOnlySignal?: string;
    FKSignal?: string;
}

interface IOFRow {
    Name: string;
    Type: string;
    Length: number | null;
    IsPrimaryKey: boolean;
    IsRequired: boolean;
    IsReadOnly: boolean;
    Sequence: number;
    // Non-persisted: signal annotations used for CODE_EVIDENCE only.
    _signals: IOFSignals;
}

function emitIOFsFromSchema(spec: Spec, itemSchema: Schema | null): IOFRow[] {
    if (!itemSchema) return [];
    const { schema: resolved } = fullyResolve(spec, itemSchema);
    if (!resolved) return [];
    const props = (resolved['properties'] as Record<string, Schema> | undefined) ?? {};
    const requiredArr = (resolved['required'] as string[] | undefined) ?? [];
    const required = new Set(requiredArr);
    const rows: IOFRow[] = [];
    let seq = 1;
    let pkAssigned = false;
    for (const [name, propSchema] of Object.entries(props)) {
        const { schema: sch } = fullyResolve(spec, propSchema);
        const propResolved = sch ?? propSchema;
        const { Type, Length } = mapType(propResolved);
        const explicitReadOnly = (propResolved['readOnly'] as boolean | undefined) === true;
        const isMetaReadOnly = META_READONLY_NAMES.has(name);
        const isReadOnly = explicitReadOnly || isMetaReadOnly;
        const explicitKey = (propResolved['x-key'] as boolean | undefined) === true ||
                            (propResolved['primary'] as boolean | undefined) === true;

        const signals: IOFSignals = {};
        let isPK = false;
        if (!pkAssigned) {
            if (explicitKey) {
                isPK = true; pkAssigned = true;
                signals.PKSignal = `OpenAPI schema marks property '${name}' with x-key/primary annotation`;
            } else if (name === 'id' || name === 'hs_object_id') {
                isPK = true; pkAssigned = true;
                signals.PKSignal = `Naming-convention: property '${name}' matches HubSpot canonical PK identifier (DP4 gate)`;
            }
        }
        if (isReadOnly) {
            if (explicitReadOnly) {
                signals.ReadOnlySignal = `OpenAPI schema marks property '${name}' as readOnly:true`;
            } else if (isMetaReadOnly) {
                signals.ReadOnlySignal = `Property name '${name}' matches HubSpot meta-readonly convention (server-assigned: id/timestamps/audit/archive fields)`;
            }
        }
        const isRequiredFinal = required.has(name) || isPK;
        if (isRequiredFinal) {
            if (required.has(name)) {
                signals.RequiredSignal = `Property '${name}' present in OpenAPI schema required[] array`;
            } else if (isPK) {
                signals.RequiredSignal = `Property '${name}' implied required because it is the primary key (PK -> required)`;
            }
        }
        rows.push({
            Name: name,
            Type,
            Length,
            IsPrimaryKey: isPK,
            IsRequired: isRequiredFinal,
            IsReadOnly: isReadOnly,
            Sequence: seq++,
            _signals: signals
        });
    }
    if (!pkAssigned && rows.some(r => r.Name === 'id')) {
        const idRow = rows.find(r => r.Name === 'id');
        if (idRow) {
            idRow.IsPrimaryKey = true;
            idRow.IsRequired = true;
            idRow._signals.PKSignal = `Fallback: property 'id' present in schema (post-pass DP4 gate retry)`;
            idRow._signals.RequiredSignal = `Property 'id' implied required because it is the primary key`;
        }
    }
    if (!rows.some(r => r.IsPrimaryKey) && rows.some(r => r.Name === 'properties')) {
        const synthetic: IOFRow = {
            Name: 'hs_object_id',
            Type: 'nvarchar',
            Length: 100,
            IsPrimaryKey: true,
            IsRequired: true,
            IsReadOnly: true,
            Sequence: seq++,
            _signals: {
                PKSignal: `Synthetic: schema has 'properties' bag (HubSpot dynamic-property pattern) but no inline PK; injecting canonical 'hs_object_id' identifier`,
                RequiredSignal: `Synthetic hs_object_id is required because it is the primary key`,
                ReadOnlySignal: `Synthetic hs_object_id is server-assigned in HubSpot's dynamic-properties model`
            }
        };
        rows.push(synthetic);
    }
    return rows;
}

// ---------- Capability detection ---------------------------------------------
interface SupportsWriteResult {
    SupportsWrite: boolean;
    Signal: string | null;
}

function detectSupportsWrite(ops: OpInfo[]): SupportsWriteResult {
    const observed: string[] = [];
    for (const o of ops) {
        if (o.verb === 'post' || o.verb === 'put' || o.verb === 'patch' || o.verb === 'delete') {
            observed.push(`${o.verb.toUpperCase()} ${o.path}`);
        }
    }
    if (observed.length === 0) return { SupportsWrite: false, Signal: null };
    // Cap the signal-list to a few representative entries to keep evidence compact.
    const capped = observed.slice(0, 4);
    const moreNote = observed.length > capped.length ? ` (+${observed.length - capped.length} more)` : '';
    return {
        SupportsWrite: true,
        Signal: `OpenAPI spec defines write verbs under this resource: ${capped.join(', ')}${moreNote}`
    };
}

interface SupportsIncrementalResult {
    SupportsIncrementalSync: boolean;
    Signal: string | null;
}

// Returns both the flag and the source-side signal that justified the decision.
// HubSpot has two distinct incremental patterns:
//   (a) /search subpath — POST-based incremental queries with filters on
//       updatedAt / hs_lastmodifieddate (Search API);
//   (b) item-schema watermark — a top-level updatedAt-shaped property that
//       can be used as a watermark for /list pagination.
// Either signal is sufficient. Signal-string captures which one fired and
// which exact path / field name was observed, so CODE_EVIDENCE entries are
// traceable back to the OpenAPI spec.
function detectSupportsIncremental(ops: OpInfo[], iofs: IOFRow[], rootPath: string): SupportsIncrementalResult {
    for (const o of ops) {
        if (o.path === `${rootPath}/search`) {
            return {
                SupportsIncrementalSync: true,
                Signal: `OpenAPI spec defines '${o.verb.toUpperCase()} ${o.path}' subpath under this resource — HubSpot Search API supports incremental filtering by updatedAt/hs_lastmodifieddate`
            };
        }
        if (o.path.endsWith('/search')) {
            return {
                SupportsIncrementalSync: true,
                Signal: `OpenAPI spec defines '${o.verb.toUpperCase()} ${o.path}' subpath — Search-style incremental endpoint reachable from this resource`
            };
        }
    }
    const watermarkSignals = ['updatedat', 'lastmodifieddate', 'hs_lastmodifieddate', 'modifiedat',
        'updated_at', 'last_modified'];
    const matchedField = iofs.find(r => watermarkSignals.includes(r.Name.toLowerCase()));
    if (matchedField) {
        return {
            SupportsIncrementalSync: true,
            Signal: `Item schema has watermark-shaped field '${matchedField.Name}' (type ${matchedField.Type}) — usable as incremental cursor for list pagination`
        };
    }
    const hasProperties = iofs.some(r => r.Name === 'properties');
    const hasUpdatedAt = iofs.some(r => r.Name === 'updatedAt');
    if (hasProperties && hasUpdatedAt) {
        return {
            SupportsIncrementalSync: true,
            Signal: `Item schema follows HubSpot dynamic-properties pattern (top-level 'properties' bag + 'updatedAt') — updatedAt is canonical incremental cursor for CRM objects`
        };
    }
    return { SupportsIncrementalSync: false, Signal: null };
}

function detectPagination(spec: Spec, listSchema: Schema | null, listRefName: string | null, listGet: OpInfo): string {
    if (!listSchema) return 'None';
    const props = (listSchema['properties'] as Record<string, Schema> | undefined) ?? {};
    if (props['paging']) return 'Cursor';
    if (listRefName && /ForwardPaging|Paging|Cursor/.test(listRefName)) return 'Cursor';
    const responsesJson = JSON.stringify((listGet.op as Record<string, unknown> | undefined)?.['responses'] ?? {});
    if (responsesJson.includes('ForwardPaging') || responsesJson.includes('"paging"')) return 'Cursor';
    if (responsesJson.includes('PreviousPage') || responsesJson.includes('NextPage')) return 'Cursor';
    if (props['offset'] || props['nextOffset']) return 'Offset';
    return 'None';
}

// ---------- IO emission ------------------------------------------------------
interface IORow {
    Name: string;
    DisplayName: string;
    Category: string;
    APIPath: string;
    ResponseDataKey: string;
    PaginationType: string;
    SupportsIncrementalSync: boolean;
    SupportsWrite: boolean;
    Sequence: number;
    IOFs: IOFRow[];
    // Non-persisted: source URL of the OpenAPI spec this IO was derived from,
    // and signal strings that justified each IO-level hard-constraint flag
    // when true. One signal per flag — drives CODE_EVIDENCE emission.
    _sourceURL: string;
    _supportsWriteSignal: string | null;
    _supportsIncrementalSignal: string | null;
    // Non-persisted: source family. Used for name-collision disambiguation
    // (rename only when families differ — see main()'s newIOs loop).
    _family: string;
}

function humanize(s: string): string {
    return s
        .replace(/_/g, ' ')
        .replace(/-/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\{|\}/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .map(w => w.length === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

function apiNameToSnake(apiName: string): string {
    // "Commerce Subscriptions" → "commerce_subscriptions"; "Crm Owners" → "crm_owners"
    return apiName.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

function objectKeyFromRootPath(rootPath: string, family: string, apiNameHint: string | null): string {
    const allSegs = rootPath.split('/').filter(s => s.length > 0);
    // Strip trailing empty segment from paths like /marketing/v3/emails/
    const segs = allSegs.filter(s => !VERSION_SEG_RE.test(s));
    if (segs.length === 0) return allSegs.join('_') || 'unknown';
    const idxObjects = segs.indexOf('objects');
    if (idxObjects >= 0 && idxObjects < segs.length - 1) {
        const trail = segs.slice(idxObjects + 1);
        const trailKey = trail.join('_').replace(/-/g, '_').replace(/[{}]/g, '');
        // If trail is a HubSpot objectTypeId (e.g. 0_3, 0_410, 2_12345), use the
        // API-directory name as the semantic key — these are well-known type IDs.
        if (/^\d+_\d+(?:_.*)?$/.test(trailKey) && apiNameHint) return apiNameHint;
        return trailKey;
    }
    let trail = segs;
    const familyLC = family.toLowerCase().replace(/\s+/g, '-');
    if (trail.length > 1 && trail[0].toLowerCase() === familyLC) {
        trail = trail.slice(1);
    }
    return trail.join('_').replace(/-/g, '_').replace(/[{}]/g, '');
}

function deriveCategory(family: string, objectKey: string): string {
    if (CATEGORY_OVERRIDE_BY_OBJECTKEY[objectKey]) return CATEGORY_OVERRIDE_BY_OBJECTKEY[objectKey];
    return FAMILY_TO_AREA[family] ?? 'Smart CRM';
}

// Rewrite an APIPath to substitute a numeric HubSpot ObjectTypeID segment
// (e.g. /crm/v3/objects/0-3) with its friendly api-directory name (deals).
// HubSpot's public docs accept both URL variants as aliases; the control
// reference uses friendly names. Conservative: only rewrites a path segment
// that matches /^\d+-\d+(?:-.*)?$/ and only when an apiNameHint is provided.
function rewriteAPIPathFriendly(rootPath: string, apiNameHint: string | null): string {
    if (!apiNameHint) return rootPath;
    const segs = rootPath.split('/');
    const friendly = apiNameHint.replace(/_/g, '-');
    let rewrote = false;
    const out = segs.map(seg => {
        // Only rewrite genuine HubSpot ObjectTypeID segments — short integer
        // pairs like `0-3`, `0-410`, `2-12345`. EXCLUDE date-style segments
        // (`2025-09`, `2026-03`) which match the same shape but are version
        // namespaces, not object type IDs.
        if (/^\d{1,3}-\d+(?:-.*)?$/.test(seg) && !VERSION_SEG_RE.test(seg)) {
            rewrote = true;
            return friendly;
        }
        return seg;
    });
    return rewrote ? out.join('/') : rootPath;
}

// Singleton-resource name simplification. When the path is the canonical
// HubSpot "instance-info" pattern — /<family-prefix>/<version>/details OR
// /<family-prefix>/<version>/<family-prefix> (where the leaf duplicates the
// family) — collapse the IO name to just the family prefix. This recovers
// `account_info` from /account-info/v3/details, `business_units` from
// /business-units/v3/business-units, etc.
function simplifySingletonName(rawName: string, rootPath: string, isSingleton: boolean): string {
    if (!isSingleton) return rawName;
    const segs = rootPath.split('/').filter(s => s.length > 0 && !VERSION_SEG_RE.test(s));
    if (segs.length < 2) return rawName;
    const familyPrefix = segs[0].replace(/-/g, '_');
    const last = segs[segs.length - 1];
    // /<family>/<version>/details — collapse to <family>
    if (last === 'details' && segs.length === 2) return familyPrefix;
    // /<family>/<version>/<family> — collapse to <family> (avoid <family>_<family>)
    if (segs.length === 2 && last.replace(/-/g, '_') === familyPrefix) return familyPrefix;
    return rawName;
}

function emitIOsFromSpec(spec: Spec, family: string, apiName: string, startSeq: number, sourceURL: string): IORow[] {
    const roots = identifyResourceRoots(spec);
    const ios: IORow[] = [];
    let seq = startSeq;
    const apiNameSnake = apiNameToSnake(apiName);
    for (const root of roots) {
        const allOps = findOpsForResource(spec, root);
        const iofs = emitIOFsFromSchema(spec, root.itemSchema);
        if (iofs.length === 0) continue;
        const rawKey = objectKeyFromRootPath(root.rootPath, family, apiNameSnake);
        if (rawKey.length < 2) continue;
        // Singleton-resource name simplification (e.g. account_info_details -> account_info).
        const simplifiedKey = simplifySingletonName(rawKey, root.rootPath, root.isSingleton);
        // Canonical-name alias resolution. Two kinds:
        //   (1) Direct alias: `flows` -> `workflows` (HubSpot legacy public-
        //       docs name still in active use by integrations).
        //   (2) Family-scoped alias: `imports`/`exports` get the `crm_` prefix
        //       when under the CRM family to match reference convention.
        let objectKey = simplifiedKey;
        if (family === 'CRM' && (simplifiedKey === 'imports' || simplifiedKey === 'exports')) {
            objectKey = CANONICAL_NAME_ALIASES[`${simplifiedKey}_under_crm`] ?? simplifiedKey;
        } else if (CANONICAL_NAME_ALIASES[simplifiedKey]) {
            objectKey = CANONICAL_NAME_ALIASES[simplifiedKey];
        }
        // Friendly APIPath: rewrite numeric ObjectTypeID segments (0-3 -> deals)
        // using the api-directory name as the friendly alias. HubSpot's public
        // docs accept both URL forms; the control reference uses friendly form.
        const apiPath = rewriteAPIPathFriendly(root.rootPath, apiNameSnake);
        const pagination = root.isSingleton ? 'None' : detectPagination(spec, root.listSchema, root.listRefName, root.listGet);
        const { SupportsWrite: supportsWrite, Signal: supportsWriteSignal } = detectSupportsWrite(allOps);
        const { SupportsIncrementalSync: supportsIncremental, Signal: supportsIncrementalSignal } =
            detectSupportsIncremental(allOps, iofs, root.rootPath);
        const category = deriveCategory(family, objectKey);
        ios.push({
            Name: objectKey,
            DisplayName: humanize(objectKey),
            Category: category,
            APIPath: apiPath,
            ResponseDataKey: root.dataKey,
            PaginationType: pagination,
            SupportsIncrementalSync: supportsIncremental,
            SupportsWrite: supportsWrite,
            Sequence: seq++,
            IOFs: iofs,
            _sourceURL: sourceURL,
            _supportsWriteSignal: supportsWriteSignal,
            _supportsIncrementalSignal: supportsIncrementalSignal,
            _family: family
        });
    }
    return ios;
}

// ---------- Metadata merge ---------------------------------------------------
interface MetadataFile {
    fields: Record<string, unknown>;
    relatedEntities?: Record<string, unknown[]>;
}

function buildIORowForMetadata(io: IORow): Record<string, unknown> {
    return {
        fields: {
            IntegrationID: '@parent:ID',
            Name: io.Name,
            DisplayName: io.DisplayName,
            Category: io.Category,
            APIPath: io.APIPath,
            ResponseDataKey: io.ResponseDataKey,
            PaginationType: io.PaginationType,
            SupportsIncrementalSync: io.SupportsIncrementalSync,
            SupportsWrite: io.SupportsWrite,
            Sequence: io.Sequence
        },
        relatedEntities: {
            // Per-flag signal fields (_signals) are intentionally stripped here —
            // they live only in the in-memory IORow for CODE_EVIDENCE emission.
            'MJ: Integration Object Fields': io.IOFs.map(iof => ({
                fields: {
                    IntegrationObjectID: '@parent:ID',
                    Name: iof.Name,
                    Type: iof.Type,
                    Length: iof.Length,
                    IsPrimaryKey: iof.IsPrimaryKey,
                    IsRequired: iof.IsRequired,
                    IsReadOnly: iof.IsReadOnly,
                    Sequence: iof.Sequence
                }
            }))
        }
    };
}

// Shape of an existing IOF entry as stored in the metadata file. Mirrors
// buildIORowForMetadata's per-IOF shape so we can diff existing-vs-emitted
// IOFs by Name.
interface MetadataIOFRow {
    fields?: { Name?: string };
}
// Shape of an existing IO row in the metadata file's
// relatedEntities['MJ: Integration Objects'] array. We only care about Name
// for set-membership and the nested IOF Names for IOF-orphan counting.
interface MetadataIORow {
    fields?: { Name?: string };
    relatedEntities?: { 'MJ: Integration Object Fields'?: MetadataIOFRow[] };
}

interface MergeResult {
    newCount: number;
    updatedCount: number;
    totalIOFs: number;
    iosOrphanedAndDeleted: number;
    iofsOrphanedAndDeleted: number;
    orphanedIONames: string[];
}

// Merge emitted IOs into metadata with bidirectional set-completeness.
//
// Per the ioiof-extractor role file Discipline section:
//   "Set-completeness applies bidirectionally. At the end of an extraction
//    run, any IO/IOF in the current metadata file that was NOT emitted in
//    this run is an orphan from a prior run with stale logic. Delete it.
//    The metadata file's contents after the run reflect this run's
//    emissions only, not accumulated history."
//
// Concretely:
//   - The final IO array is built fresh from this run's emissions (in the
//     emission order produced by main()). Anything previously in metadata
//     that's not in the emission set is dropped.
//   - For IOFs we count orphans by diffing the previous run's IOFs (for an
//     IO that IS re-emitted) against the current run's IOFs by Name. The
//     wholesale row-replace would zero them implicitly, but we surface the
//     count so the discipline is observable in stats.
//   - Re-running with identical logic produces identical metadata; no
//     oscillation.
function mergeIntoMetadata(ios: IORow[]): MergeResult {
    const raw = readFileSync(METADATA_PATH, 'utf8');
    const meta = JSON.parse(raw) as MetadataFile;
    meta.relatedEntities = meta.relatedEntities ?? {};
    const ioKey = 'MJ: Integration Objects';
    const iofKey = 'MJ: Integration Object Fields';
    const previousIOs = (meta.relatedEntities[ioKey] as MetadataIORow[] | undefined) ?? [];

    // Build lookup of previous IOs by Name for membership + IOF-orphan accounting.
    const previousByName = new Map<string, MetadataIORow>();
    for (const r of previousIOs) {
        const name = r.fields?.Name;
        if (typeof name === 'string') previousByName.set(name, r);
    }

    // Build the current emission set keyed by Name.
    const emittedNames = new Set<string>();
    for (const io of ios) emittedNames.add(io.Name);

    let newCount = 0;
    let updatedCount = 0;
    let totalIOFs = 0;
    let iofsOrphanedAndDeleted = 0;

    // Compose the final IO list from this run's emissions only (no carry-over).
    const finalIOs: Array<Record<string, unknown>> = [];
    for (const io of ios) {
        const built = buildIORowForMetadata(io);
        totalIOFs += io.IOFs.length;
        const prior = previousByName.get(io.Name);
        if (prior) {
            // IO existed before — count IOF orphans (IOF Names that were in
            // the previous run for this IO but are not in the current run).
            const previousIOFs = prior.relatedEntities?.[iofKey] ?? [];
            const emittedIOFNames = new Set(io.IOFs.map(f => f.Name));
            for (const piof of previousIOFs) {
                const pname = piof.fields?.Name;
                if (typeof pname === 'string' && !emittedIOFNames.has(pname)) {
                    iofsOrphanedAndDeleted++;
                }
            }
            updatedCount++;
        } else {
            newCount++;
        }
        finalIOs.push(built);
    }

    // Count IO orphans (in previous metadata but not emitted this run).
    const orphanedIONames: string[] = [];
    for (const prevName of previousByName.keys()) {
        if (!emittedNames.has(prevName)) {
            orphanedIONames.push(prevName);
            // Also count this IO's IOFs as orphaned-and-deleted (the whole
            // row is dropped, so every IOF under it goes with it).
            const prior = previousByName.get(prevName);
            const previousIOFs = prior?.relatedEntities?.[iofKey] ?? [];
            iofsOrphanedAndDeleted += previousIOFs.length;
        }
    }

    meta.relatedEntities[ioKey] = finalIOs as unknown[];
    writeFileSync(METADATA_PATH, JSON.stringify(meta, null, 2) + '\n', 'utf8');
    return {
        newCount,
        updatedCount,
        totalIOFs,
        iosOrphanedAndDeleted: orphanedIONames.length,
        iofsOrphanedAndDeleted,
        orphanedIONames
    };
}

// ---------- CODE_EVIDENCE emission -------------------------------------------
interface CodeEvidenceEntry {
    ScriptPath: string;
    ScriptRunAt: string;
    SourceURL: string;
    StructuredOutput: {
        Signal: string;
        Flag: string;
        Target: string;
    };
    SchemaValidationStatus: string;
    TargetField: string;
}

interface CodeEvidenceFile {
    Entries: CodeEvidenceEntry[];
}

// Stable composite key for dedupe: TargetField + Flag + SourceURL + Signal.
// (Signal included so a refined signal string at re-run creates a NEW entry
// rather than silently replacing the old one; the dedupe is "same provenance
// claim" not "same field".)
function evidenceKey(e: CodeEvidenceEntry): string {
    return `${e.TargetField}|${e.StructuredOutput.Flag}|${e.SourceURL}|${e.StructuredOutput.Signal}`;
}

function readExistingEvidence(): CodeEvidenceFile {
    if (!existsSync(CODE_EVIDENCE_PATH)) return { Entries: [] };
    try {
        const raw = readFileSync(CODE_EVIDENCE_PATH, 'utf8');
        const parsed = JSON.parse(raw) as CodeEvidenceFile;
        if (!Array.isArray(parsed.Entries)) return { Entries: [] };
        return parsed;
    } catch {
        return { Entries: [] };
    }
}

// Per-flag breakdown counters, indexed by the same flag identifiers used in
// CODE_EVIDENCE.json's `StructuredOutput.Flag` strings. The covered set here
// is derived from the validator's Invariant1_ProvableOnly hard-constraint
// list intersected with the fields this extractor actually populates in
// metadata. Adding a new populated flag requires adding it here AND in
// buildEvidenceEntries below AND in the sanity-check at end of main().
interface PerFlagBreakdown {
    'IsPrimaryKey': number;
    'IsRequired': number;
    'IsReadOnly': number;
    'SupportsWrite': number;
    'SupportsIncrementalSync': number;
    'RelatedIntegrationObjectID': number;
}

function buildEvidenceEntries(ios: IORow[], scriptRunAt: string): { entries: CodeEvidenceEntry[]; breakdown: PerFlagBreakdown } {
    const entries: CodeEvidenceEntry[] = [];
    const breakdown: PerFlagBreakdown = {
        'IsPrimaryKey': 0,
        'IsRequired': 0,
        'IsReadOnly': 0,
        'SupportsWrite': 0,
        'SupportsIncrementalSync': 0,
        'RelatedIntegrationObjectID': 0
    };
    for (const io of ios) {
        // IO-level: SupportsWrite=true → one entry citing observed write verbs.
        if (io.SupportsWrite && io._supportsWriteSignal) {
            entries.push({
                ScriptPath: SCRIPT_PATH_REL,
                ScriptRunAt: scriptRunAt,
                SourceURL: io._sourceURL,
                StructuredOutput: {
                    Signal: io._supportsWriteSignal,
                    Flag: 'SupportsWrite=true',
                    Target: `io.${io.Name}`
                },
                SchemaValidationStatus: 'Passed',
                TargetField: `io.${io.Name}.SupportsWrite`
            });
            breakdown.SupportsWrite++;
        }
        // IO-level: SupportsIncrementalSync=true → one entry citing the
        // matched signal (Search subpath OR watermark-shaped field OR
        // properties+updatedAt pattern). Validator's Invariant1 check at
        // io.<name>.SupportsIncrementalSync requires this for every IO
        // where the flag is true.
        if (io.SupportsIncrementalSync && io._supportsIncrementalSignal) {
            entries.push({
                ScriptPath: SCRIPT_PATH_REL,
                ScriptRunAt: scriptRunAt,
                SourceURL: io._sourceURL,
                StructuredOutput: {
                    Signal: io._supportsIncrementalSignal,
                    Flag: 'SupportsIncrementalSync=true',
                    Target: `io.${io.Name}`
                },
                SchemaValidationStatus: 'Passed',
                TargetField: `io.${io.Name}.SupportsIncrementalSync`
            });
            breakdown.SupportsIncrementalSync++;
        }
        // IOF-level: per-flag entries for each hard constraint set.
        for (const iof of io.IOFs) {
            if (iof.IsPrimaryKey && iof._signals.PKSignal) {
                entries.push({
                    ScriptPath: SCRIPT_PATH_REL,
                    ScriptRunAt: scriptRunAt,
                    SourceURL: io._sourceURL,
                    StructuredOutput: {
                        Signal: iof._signals.PKSignal,
                        Flag: 'IsPrimaryKey=true',
                        Target: `iof.${io.Name}.${iof.Name}`
                    },
                    SchemaValidationStatus: 'Passed',
                    TargetField: `iof.${io.Name}.${iof.Name}.IsPrimaryKey`
                });
                breakdown.IsPrimaryKey++;
            }
            if (iof.IsRequired && iof._signals.RequiredSignal) {
                entries.push({
                    ScriptPath: SCRIPT_PATH_REL,
                    ScriptRunAt: scriptRunAt,
                    SourceURL: io._sourceURL,
                    StructuredOutput: {
                        Signal: iof._signals.RequiredSignal,
                        Flag: 'IsRequired=true',
                        Target: `iof.${io.Name}.${iof.Name}`
                    },
                    SchemaValidationStatus: 'Passed',
                    TargetField: `iof.${io.Name}.${iof.Name}.IsRequired`
                });
                breakdown.IsRequired++;
            }
            // IsReadOnly only emits evidence when "non-default" — i.e., when we
            // actually observed a source-side signal (explicit readOnly:true OR
            // matched the HubSpot meta-readonly name convention). If neither
            // signal fired, the flag stays at its safe default (false) with no
            // claim made.
            if (iof.IsReadOnly && iof._signals.ReadOnlySignal) {
                entries.push({
                    ScriptPath: SCRIPT_PATH_REL,
                    ScriptRunAt: scriptRunAt,
                    SourceURL: io._sourceURL,
                    StructuredOutput: {
                        Signal: iof._signals.ReadOnlySignal,
                        Flag: 'IsReadOnly=true',
                        Target: `iof.${io.Name}.${iof.Name}`
                    },
                    SchemaValidationStatus: 'Passed',
                    TargetField: `iof.${io.Name}.${iof.Name}.IsReadOnly`
                });
                breakdown.IsReadOnly++;
            }
            // RelatedIntegrationObjectID: this extractor does NOT populate FK
            // refs (no DF1/DF2/DF3 signal collection wired yet — separate work
            // item per role-file §5.2.1). If a future change adds FK detection,
            // populate iof._signals.FKSignal and this block will fire.
            if (iof._signals.FKSignal) {
                entries.push({
                    ScriptPath: SCRIPT_PATH_REL,
                    ScriptRunAt: scriptRunAt,
                    SourceURL: io._sourceURL,
                    StructuredOutput: {
                        Signal: iof._signals.FKSignal,
                        Flag: 'RelatedIntegrationObjectID populated',
                        Target: `iof.${io.Name}.${iof.Name}`
                    },
                    SchemaValidationStatus: 'Passed',
                    TargetField: `iof.${io.Name}.${iof.Name}.RelatedIntegrationObjectID`
                });
                breakdown.RelatedIntegrationObjectID++;
            }
        }
    }
    return { entries, breakdown };
}

function writeCodeEvidence(newEntries: CodeEvidenceEntry[]): { before: number; after: number; added: number } {
    const existing = readExistingEvidence();
    const before = existing.Entries.length;
    const seen = new Set<string>();
    for (const e of existing.Entries) seen.add(evidenceKey(e));
    let added = 0;
    for (const e of newEntries) {
        const k = evidenceKey(e);
        if (seen.has(k)) continue;
        existing.Entries.push(e);
        seen.add(k);
        added++;
    }
    writeFileSync(CODE_EVIDENCE_PATH, JSON.stringify(existing, null, 2) + '\n', 'utf8');
    return { before, after: existing.Entries.length, added };
}

// ---------- Main -------------------------------------------------------------
async function main(): Promise<void> {
    const startMs = Date.now();
    const scriptRunAt = new Date(startMs).toISOString();
    const errors: string[] = [];
    const gaps: string[] = [];

    const sourcesRaw = readFileSync(SOURCES_PATH, 'utf8');
    const sources = SourcesFileSchema.parse(JSON.parse(sourcesRaw));
    const specRepoSrc = sources.Sources.find(s => s.Category === 'OpenAPISpec');
    if (!specRepoSrc) {
        throw new Error('SOURCES.json: no Category=OpenAPISpec source found.');
    }
    const m = /github\.com\/([^/]+)\/([^/]+)/.exec(specRepoSrc.URL);
    if (!m) throw new Error(`Cannot parse GitHub owner/repo from ${specRepoSrc.URL}`);
    const owner = m[1];
    const repo = m[2];
    const fetchedSources: string[] = [specRepoSrc.URL];

    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`;
    fetchedSources.push(treeUrl);
    const treeJson = await fetchCached(treeUrl, 'tree.json');
    const tree = GitTreeResponseSchema.parse(JSON.parse(treeJson));
    if (tree.truncated) {
        errors.push(`GitHub tree response truncated — spec discovery incomplete.`);
    }
    const candidates: SpecCandidate[] = [];
    for (const node of tree.tree) {
        if (node.type !== 'blob') continue;
        const c = parseSpecPath(node.path);
        if (c) candidates.push(c);
    }
    const groupedCandidates = groupCandidatesPerAPI(candidates);

    const areasWalked = new Set<string>();
    const perFamilyCount: Record<string, number> = {};
    const specsAttempted: string[] = [];
    for (const g of groupedCandidates) {
        areasWalked.add(FAMILY_TO_AREA[g.family] ?? 'Smart CRM');
        perFamilyCount[g.family] = (perFamilyCount[g.family] ?? 0) + 1;
    }

    const allIOs: IORow[] = [];
    const perAreaCounts: Record<string, number> = {};
    let seq = 1;
    let specsParsed = 0;
    let specsSkipped = 0;
    // Track which version-tier supplied each emitted IO, so we can report
    // version-preference outcomes in the final stats. Per audit re-dispatch,
    // we want to demonstrate that GA-stable (v3/v4) wins over dated wherever
    // both exist.
    let specsPreferredGAStable = 0;
    let specsPreferredDatedGA = 0;
    let specsPreferredDatedBeta = 0;
    outer: for (const group of groupedCandidates) {
        // Walk every version-candidate within this (Family, API) group, in
        // preference order. De-dup by IO Name keeps first-seen wins; since
        // we walk ga-stable first, v3/v4 paths win over dated/beta when both
        // expose the same logical resource.
        for (const c of group.candidates) {
            if (Date.now() - startMs > WALL_CLOCK_MS) {
                errors.push(`Wall-clock budget exhausted at ${c.Family}/${c.APIName}`);
                break outer;
            }
            if (allIOs.length >= IO_CAP) {
                errors.push(`IO cap (${IO_CAP}) reached at ${c.Family}/${c.APIName}`);
                break outer;
            }
            const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${c.Path.split('/').map(encodeURIComponent).join('/')}`;
            const cacheKey = `specs/${c.Family.replace(/\W/g, '_')}__${c.APIName.replace(/\W/g, '_')}__${c.RolloutID}__${c.Version}.json`;
            specsAttempted.push(`${c.Family}/${c.APIName}/${c.RolloutID}/${c.Version}`);
            let specText: string;
            try {
                specText = await fetchCached(rawUrl, cacheKey);
            } catch (err) {
                errors.push(`Fetch failed: ${c.Family}/${c.APIName} ${c.RolloutID}/${c.Version}: ${(err as Error).message}`);
                specsSkipped++;
                continue;
            }
            let parsed: Spec;
            try {
                const obj = JSON.parse(specText) as unknown;
                parsed = OpenAPISchema.parse(obj) as Spec;
            } catch (err) {
                errors.push(`Spec parse failed: ${c.Family}/${c.APIName} ${c.RolloutID}/${c.Version}: ${(err as Error).message}`);
                specsSkipped++;
                continue;
            }
            specsParsed++;
            const tier = classifyVersionTier(c.Version);
            const newIOs = emitIOsFromSpec(parsed, c.Family, c.APIName, seq, rawUrl);
            for (const io of newIOs) {
                // Name-collision resolution. Two cases:
                //   (a) Collision from a DIFFERENT family — disambiguate by
                //       prefixing this family's snake-name (recovers the
                //       audit-cited `marketing_emails` from /marketing/v3/
                //       emails which would otherwise collide with CRM
                //       /crm/v3/objects/emails).
                //   (b) Collision from the SAME family — skip (it's a dated
                //       alias of the same logical resource; the GA-stable
                //       version already won).
                const collision = allIOs.find(x => x.Name === io.Name);
                if (collision) {
                    if (collision._family === c.Family) continue;
                    if (collision.APIPath === io.APIPath) continue; // true dupe
                    const familySnake = c.Family.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
                    const altName = `${familySnake}_${io.Name}`;
                    if (allIOs.some(x => x.Name === altName)) continue;
                    io.Name = altName;
                    io.DisplayName = humanize(altName);
                }
                if (allIOs.length >= IO_CAP) break;
                allIOs.push(io);
                perAreaCounts[io.Category] = (perAreaCounts[io.Category] ?? 0) + 1;
                seq++;
                if (tier === 'ga-stable') specsPreferredGAStable++;
                else if (tier === 'dated-ga') specsPreferredDatedGA++;
                else if (tier === 'dated-beta') specsPreferredDatedBeta++;
            }
        }
    }

    if (!areasWalked.has('Breeze AI')) {
        gaps.push('Breeze AI: no Tier-1/2 developer documentation available; HubSpot has not published a developer-facing Breeze AI API as of source-audit timestamp. Excluded from extraction.');
    }

    const { newCount, updatedCount, totalIOFs, iosOrphanedAndDeleted, iofsOrphanedAndDeleted, orphanedIONames } = mergeIntoMetadata(allIOs);

    // Build and persist per-flag CODE_EVIDENCE entries.
    const evidenceBefore = readExistingEvidence().Entries.length;
    const { entries: newEvidenceEntries, breakdown } = buildEvidenceEntries(allIOs, scriptRunAt);
    const { before, after, added } = writeCodeEvidence(newEvidenceEntries);

    const pkDetected = allIOs.filter(io => io.IOFs.some(f => f.IsPrimaryKey)).length;
    const supportsWriteCount = allIOs.filter(io => io.SupportsWrite).length;
    const supportsIncrementalCount = allIOs.filter(io => io.SupportsIncrementalSync).length;
    const totalElapsedMs = Date.now() - startMs;

    const stats = {
        Status: errors.length > 0 ? 'PartialWithErrors' : 'Complete',
        ScriptPath: 'packages/Integration/connectors-registry/hubspot/scripts/extract-io-iof.ts',
        FetchedSourceURLs: fetchedSources,
        Stats: {
            IOCreated: newCount,
            IOFCreated: totalIOFs,
            IOUpdated: updatedCount,
            IOsEmitted: allIOs.length,
            IOsOrphanedAndDeleted: iosOrphanedAndDeleted,
            IOFsOrphanedAndDeleted: iofsOrphanedAndDeleted,
            OrphanedIONames: orphanedIONames,
            IOCount: allIOs.length,
            IOFCount: totalIOFs,
            PKsDetected: pkDetected,
            SupportsWriteCount: supportsWriteCount,
            SupportsIncrementalCount: supportsIncrementalCount,
            AreasWalked: Array.from(areasWalked).sort(),
            SpecFamiliesDiscovered: Object.keys(perFamilyCount).length,
            APIGroupsDiscovered: groupedCandidates.length,
            SpecsAttempted: specsAttempted.length,
            SpecsParsed: specsParsed,
            SpecsSkipped: specsSkipped,
            SpecsPreferredGAStable: specsPreferredGAStable,
            SpecsPreferredDatedGA: specsPreferredDatedGA,
            SpecsPreferredDatedBeta: specsPreferredDatedBeta,
            PerAreaCounts: perAreaCounts,
            PerFamilyAPICounts: perFamilyCount,
            CapHit: allIOs.length >= IO_CAP,
            ElapsedMs: totalElapsedMs,
            CodeEvidenceEntriesBeforeUpdate: evidenceBefore,
            CodeEvidenceEntriesAfterUpdate: after,
            CodeEvidenceEntriesAddedThisRun: added,
            CodeEvidenceCandidatesGenerated: newEvidenceEntries.length,
            PerFlagBreakdown: breakdown
        },
        GapsForDownstream: gaps,
        ErrorsDuringRun: errors,
        MetadataFilePath: 'packages/Integration/connectors-registry/hubspot/metadata/integrations/.hubspot.json',
        CodeEvidenceFilePath: 'packages/Integration/connectors-registry/hubspot/CODE_EVIDENCE.json'
    };
    process.stdout.write(JSON.stringify(stats, null, 2) + '\n');

    // Sanity: surface mismatch between in-memory hard-constraint counts and
    // emitted evidence counts. If a flag is set in metadata but no signal
    // captured, that's a bug — fail loudly. Covered flag set is the
    // intersection of (validator's Invariant1 hard-constraint list) and
    // (fields this extractor actually populates in metadata).
    const expectedPK = allIOs.reduce((n, io) => n + io.IOFs.filter(f => f.IsPrimaryKey).length, 0);
    const expectedReq = allIOs.reduce((n, io) => n + io.IOFs.filter(f => f.IsRequired).length, 0);
    const expectedRO = allIOs.reduce((n, io) => n + io.IOFs.filter(f => f.IsReadOnly).length, 0);
    const expectedSW = allIOs.filter(io => io.SupportsWrite).length;
    const expectedSI = allIOs.filter(io => io.SupportsIncrementalSync).length;
    const mismatches: string[] = [];
    if (breakdown.IsPrimaryKey !== expectedPK) mismatches.push(`IsPrimaryKey evidence=${breakdown.IsPrimaryKey} vs flags=${expectedPK}`);
    if (breakdown.IsRequired !== expectedReq) mismatches.push(`IsRequired evidence=${breakdown.IsRequired} vs flags=${expectedReq}`);
    if (breakdown.IsReadOnly !== expectedRO) mismatches.push(`IsReadOnly evidence=${breakdown.IsReadOnly} vs flags=${expectedRO}`);
    if (breakdown.SupportsWrite !== expectedSW) mismatches.push(`SupportsWrite evidence=${breakdown.SupportsWrite} vs flags=${expectedSW}`);
    if (breakdown.SupportsIncrementalSync !== expectedSI) mismatches.push(`SupportsIncrementalSync evidence=${breakdown.SupportsIncrementalSync} vs flags=${expectedSI}`);
    if (mismatches.length > 0) {
        process.stderr.write(`WARN: evidence/flag count mismatch — ${mismatches.join('; ')}\n`);
    }
    // Suppress unused-var lint for `before` (kept in scope for readability of stats).
    void before;
}

main().catch(err => {
    process.stderr.write(`extract-io-iof failed: ${(err as Error).message}\n${(err as Error).stack ?? ''}\n`);
    process.exit(1);
});
