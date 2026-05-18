#!/usr/bin/env tsx
/**
 * HubSpot IO / IOF extractor.
 *
 * Refactor (2026-05-18): generic OpenAPI 3.x parsing now lives in
 * `@memberjunction/connector-extractor-strategies/openapi` (Strategy 0).
 *
 * Phase-B expansion (2026-05-18): emits the framework's per-IO / per-IOF
 * expansion fields (PrimaryKeyDetectionMethod, IsForeignKey/FKDetectionMethod,
 * ParentObjectName/HierarchyPath/TraversalOrder, IncrementalCursorFieldName/
 * Type, BulkAPIPath, IsCustomObject/IsCustomField, IsIncrementalCursorCandidate,
 * IsAPIWritable, IsDeprecated, …) and the per-flag CODE_EVIDENCE that backs
 * every hard-constraint emission.
 *
 * What remains HubSpot-specific in this file:
 *   • SOURCES.json reading + GitHub repo URL parsing
 *   • Spec-repo layout walker: `PublicApiSpecs/<Area>/<ApiName>/Rollouts/<id>/<v>/file.json`
 *   • The HubSpot VendorAdapter (PK candidates `id`/`hs_object_id`, envelope
 *     key `results`, action-suffix vocab, default page size, etc.)
 *   • Incremental-cursor naming: HubSpot CRM uses `hs_lastmodifieddate` /
 *     `updatedAt` for modified-since semantics.
 *
 * Hard rules:
 *   • No vendor object names, field names, or capability flags as data literals.
 *   • Only structural constants live in source.
 *   • Every per-flag CODE_EVIDENCE entry traces back to a fetched spec URL.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { openapi, UpsertByKey } from '@memberjunction/connector-extractor-strategies';

// -------------------------------------------------------------------------------------------------
// Configuration constants (structure only — no vendor data).
// -------------------------------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONNECTOR_DIR = path.resolve(__dirname, '..');
const VENDOR_KEY = 'hubspot';

const SOURCES_PATH = path.join(CONNECTOR_DIR, 'SOURCES.json');
const METADATA_PATH = path.join(CONNECTOR_DIR, 'metadata/integrations/.hubspot.json');
const CODE_EVIDENCE_PATH = path.join(CONNECTOR_DIR, 'CODE_EVIDENCE.json');
const CACHE_DIR = path.join(CONNECTOR_DIR, 'cache');
const SPEC_CACHE_DIR = path.join(CACHE_DIR, 'specs');
const TREE_CACHE_PATH = path.join(CACHE_DIR, 'spec-repo-tree.json');

const SKIP_FOLDER_PATTERNS: RegExp[] = [
    /\/Bucket_Test\d+\//i,
    /\/.*sandbox.*\//i,
    /\/Test Child Api\//i,
];

const COLLECTION_DIRECTORY_REGEX = /\/Collection[ _]Directory/i;
const POSTMAN_FILENAME_REGEX = /\bAPI Collection\.json$/i;

const IO_CAP = 1500;
const RUN_DEADLINE_MS = 10 * 60 * 1000;

// HubSpot-specific incremental-cursor naming. Vendor convention from
// HubSpot CRM docs: `hs_lastmodifieddate` is the canonical CRM modification
// timestamp; `updatedAt` is the v3 read-API surface field. Both are typed
// datetime when present.
const HUBSPOT_INCREMENTAL_CURSOR_NAMES = ['hs_lastmodifieddate', 'updatedAt', 'lastModifiedAt'] as const;
const HUBSPOT_INCREMENTAL_CURSOR_NAMES_LOWER = new Set(
    HUBSPOT_INCREMENTAL_CURSOR_NAMES.map((s) => s.toLowerCase()),
);

// HubSpot bulk-endpoint suffixes (per the BulkOperationsAvailable=true root flag).
const HUBSPOT_BULK_SUFFIXES = ['/batch/create', '/batch/update', '/batch/upsert', '/batch/read', '/batch/archive'] as const;

// -------------------------------------------------------------------------------------------------
// HubSpot VendorAdapter — knobs Strategy 0 cannot infer from a generic OpenAPI doc.
// -------------------------------------------------------------------------------------------------

const HUBSPOT_ADAPTER: openapi.VendorAdapter = {
    PkNameCandidates: ['id', 'hs_object_id'],
    CollectionPropertyNames: ['results'],
    ResponseDataKeyForLists: 'results',
    ActionSuffixVocabulary: ['batch', 'search', 'merge', 'archive', 'gdpr-delete', 'upsert'],
    SearchActionSegment: 'search',
    PaginationType: 'Cursor',
    DefaultPageSize: 100,
};

// -------------------------------------------------------------------------------------------------
// Zod schemas — non-OpenAPI sources (SOURCES.json, GitHub git tree response).
// -------------------------------------------------------------------------------------------------

const SourcesEntrySchema = z.object({
    URL: z.string().url(),
    Tier: z.number(),
    Category: z.string(),
    AuditScores: z.record(z.string(), z.number()).optional(),
    OverallScore: z.number().optional(),
    Notes: z.string().optional(),
});

const SourcesFileSchema = z.object({
    Vendor: z.string(),
    Sources: z.array(SourcesEntrySchema),
    GapsIdentified: z.array(z.string()).optional(),
});

const GitTreeNodeSchema = z.object({
    path: z.string(),
    mode: z.string(),
    type: z.enum(['blob', 'tree']),
    sha: z.string(),
    size: z.number().optional(),
    url: z.string().url().optional(),
});

const GitTreeResponseSchema = z.object({
    sha: z.string(),
    url: z.string().url(),
    tree: z.array(GitTreeNodeSchema),
    truncated: z.boolean().optional(),
});

// -------------------------------------------------------------------------------------------------
// Helpers.
// -------------------------------------------------------------------------------------------------

function ensureDir(p: string): void {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readJson<T>(filePath: string): T {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath: string, value: unknown): void {
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
    let last: Error | undefined;
    for (let i = 0; i < attempts; i++) {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': 'mj-connector-extractor/1.0' } });
            if (res.status >= 500 && i < attempts - 1) {
                await new Promise(r => setTimeout(r, 500 * (i + 1)));
                continue;
            }
            return res;
        } catch (e) {
            last = e as Error;
            await new Promise(r => setTimeout(r, 500 * (i + 1)));
        }
    }
    throw last ?? new Error(`Fetch failed: ${url}`);
}

async function fetchText(url: string, cachePath: string): Promise<string> {
    if (fs.existsSync(cachePath)) {
        return fs.readFileSync(cachePath, 'utf-8');
    }
    const res = await fetchWithRetry(url);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
    }
    const text = await res.text();
    ensureDir(path.dirname(cachePath));
    fs.writeFileSync(cachePath, text);
    return text;
}

function sanitizeForFilename(s: string): string {
    return s.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 200);
}

function pickOpenApiSpecSource(sources: z.infer<typeof SourcesEntrySchema>[]): z.infer<typeof SourcesEntrySchema> {
    const candidates = sources.filter(s => s.Category === 'OpenAPISpec');
    if (candidates.length === 0) {
        throw new Error('No OpenAPISpec source found in SOURCES.json — cannot extract.');
    }
    candidates.sort((a, b) => (b.OverallScore ?? 0) - (a.OverallScore ?? 0));
    return candidates[0]!;
}

function parseGithubRepoUrl(repoUrl: string): { owner: string; repo: string } {
    const m = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
    if (!m) throw new Error(`Cannot parse GitHub repo URL: ${repoUrl}`);
    return { owner: m[1]!, repo: m[2]! };
}

// -------------------------------------------------------------------------------------------------
// HubSpot-specific: rollout/version ranking + spec selection from the GitHub tree.
// -------------------------------------------------------------------------------------------------

function rankRolloutVersion(version: string): string {
    if (/^v\d+$/i.test(version)) return `9_${version.padStart(5, '0')}`;
    if (/^\d{4}-\d{2}(-beta)?$/.test(version)) return `5_${version}`;
    return `0_${version}`;
}

interface ApiSpecPick {
    apiKey: string;
    area: string;
    apiName: string;
    selectedBlob: string;
    rawUrl: string;
    rolloutVersion: string;
}

function chooseSpecsFromTree(
    tree: z.infer<typeof GitTreeResponseSchema>,
    owner: string,
    repo: string,
): ApiSpecPick[] {
    const blobs = tree.tree.filter(n => n.type === 'blob' && n.path.startsWith('PublicApiSpecs/'));
    const candidates: Array<{
        apiKey: string;
        area: string;
        apiName: string;
        rolloutId: string;
        version: string;
        blobPath: string;
    }> = [];
    for (const b of blobs) {
        if (COLLECTION_DIRECTORY_REGEX.test(b.path)) continue;
        if (POSTMAN_FILENAME_REGEX.test(b.path)) continue;
        if (SKIP_FOLDER_PATTERNS.some(re => re.test(b.path))) continue;
        if (!b.path.endsWith('.json')) continue;
        const parts = b.path.split('/');
        const rolloutsIdx = parts.indexOf('Rollouts');
        if (rolloutsIdx < 2) continue;
        const areaSimple = parts[1]!;
        const apiNameSimple = parts.slice(2, rolloutsIdx).join('/');
        const rolloutId = parts[rolloutsIdx + 1];
        const version = parts[rolloutsIdx + 2];
        const remainder = parts.slice(rolloutsIdx + 3);
        if (!rolloutId || !version || remainder.length === 0) continue;
        if (remainder.length !== 1) continue;
        const apiKey = `PublicApiSpecs/${areaSimple}/${apiNameSimple}`;
        candidates.push({
            apiKey,
            area: areaSimple,
            apiName: apiNameSimple,
            rolloutId,
            version,
            blobPath: b.path,
        });
    }
    const grouped = new Map<string, typeof candidates>();
    for (const c of candidates) {
        const list = grouped.get(c.apiKey) ?? [];
        list.push(c);
        grouped.set(c.apiKey, list);
    }
    const picks: ApiSpecPick[] = [];
    for (const [apiKey, list] of grouped) {
        list.sort((a, b) => {
            const ra = parseInt(a.rolloutId, 10) || 0;
            const rb = parseInt(b.rolloutId, 10) || 0;
            if (ra !== rb) return rb - ra;
            return rankRolloutVersion(b.version).localeCompare(rankRolloutVersion(a.version));
        });
        const top = list[0]!;
        picks.push({
            apiKey,
            area: top.area,
            apiName: top.apiName,
            selectedBlob: top.blobPath,
            rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/main/${top.blobPath.split('/').map(encodeURIComponent).join('/')}`,
            rolloutVersion: top.version,
        });
    }
    return picks;
}

function deriveHubSpotIoName(area: string, apiName: string): openapi.NameDeriver {
    return ({ ObjectKey }) => {
        const segs = ObjectKey.split('/').filter((s) => s.length > 0);
        const last = segs[segs.length - 1] ?? apiName;
        const toTitle = (s: string) => s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const lastTitle = toTitle(last);
        const apiTitle = toTitle(apiName.replace(/\//g, ' '));
        const namePieces = [area, apiName.replace(/\//g, '.'), last].map(s => s.replace(/\s+/g, ''));
        const name = namePieces.join('.');
        const display = apiTitle === lastTitle ? apiTitle : `${apiTitle} - ${lastTitle}`;
        return { Name: name, DisplayName: display, Category: area };
    };
}

// -------------------------------------------------------------------------------------------------
// PK detection gates (DP1-DP8). Self-report the matched gate.
// -------------------------------------------------------------------------------------------------

type PkDetectionMethod =
    | 'documented-explicit'
    | 'naming-convention-provable'
    | 'naming-convention-likely'
    | 'vendor-specific-pk'
    | 'unique-required-inference'
    | 'position-0-heuristic'
    | 'unknown';

interface PkClassification {
    Method: PkDetectionMethod;
    Confidence: 'Provable' | 'Likely' | 'LikelyLow' | 'Unknown';
    BasedOn: string;
}

/**
 * Apply DP1-DP8 in order; return the first match. Strategy 0 has already set
 * IsPrimaryKey=true if the field matched the adapter's PkNameCandidates or
 * was promoted by the id-suffix fallback. We translate that into the gate
 * vocabulary.
 *
 * Note: DP1 (x-key/primary OpenAPI extensions) and DP5 (unique:true+required)
 * are checked against the raw resolved field schema if it's reachable; Strategy
 * 0 currently doesn't surface these, so we accept them as not-yet-detected.
 * That keeps the gate vocabulary correct without over-claiming.
 */
function classifyPrimaryKey(
    field: { Name: string; Type: string; IsRequired: boolean; IsPrimaryKey: boolean },
    adapter: openapi.VendorAdapter,
): PkClassification {
    const lower = field.Name.toLowerCase();
    if (!field.IsPrimaryKey) {
        return { Method: 'unknown', Confidence: 'Unknown', BasedOn: 'no DP gate matched' };
    }

    // DP3/DP4: exact match against the universal `id` candidate.
    if (lower === 'id') {
        return {
            Method: 'naming-convention-likely',
            Confidence: 'Likely',
            BasedOn: 'field name matches universal `id` PK candidate (DP4)',
        };
    }

    // DP6 / vendor-specific: matched a vendor PK candidate (HubSpot: `hs_object_id`).
    const vendorCandidates = new Set(adapter.PkNameCandidates.map((s) => s.toLowerCase()).filter((s) => s !== 'id'));
    if (vendorCandidates.has(lower)) {
        return {
            Method: 'vendor-specific-pk',
            Confidence: 'Provable',
            BasedOn: `field name matches vendor PK convention (HubSpot: hs_object_id)`,
        };
    }

    // DP4 (broader): name is `Id`/`ID` exactly.
    if (lower === 'id' || lower === 'identifier') {
        return {
            Method: 'naming-convention-likely',
            Confidence: 'Likely',
            BasedOn: 'field name matches `id` naming convention (DP4)',
        };
    }

    // DP7: id-suffix fallback promotion (the only remaining way Strategy 0 sets IsPrimaryKey=true).
    if (/id$/i.test(field.Name)) {
        return {
            Method: 'position-0-heuristic',
            Confidence: 'LikelyLow',
            BasedOn: 'id-suffix fallback promotion when no DP1-DP6 match was found',
        };
    }

    return {
        Method: 'unknown',
        Confidence: 'Unknown',
        BasedOn: 'IsPrimaryKey=true but no gate matched — investigate',
    };
}

// -------------------------------------------------------------------------------------------------
// FK detection gates (DF1-DF7). Apply each; we keep the strongest match per IOF.
// -------------------------------------------------------------------------------------------------

type FkDetectionMethod =
    | 'openapi-ref'
    | 'sdk-relationship-annotation'
    | 'url-path-parent'
    | 'name-pattern-suffix'
    | 'vendor-specific'
    | 'unknown';

interface FkClassification {
    Method: FkDetectionMethod;
    Strength: 'Definite' | 'Strong' | 'Moderate' | 'Weak';
    RelatedIOName: string | null;
    BasedOn: string;
}

/**
 * Apply DF gates to a single IOF, given the set of known IO names + the IO's
 * own URL template variables. Returns null if no gate matched.
 *
 * Strategy 0 strips `$ref` lookups during shallow dereference; DF1 detection
 * needs access to the raw spec schema property. We don't currently have that
 * surface, so DF1 detection here is best-effort via name suffix when the
 * referenced IO exists. (The spec-level ref check belongs in Strategy 0; if
 * elevated there in the future, this gate flips to Definite without code
 * change at this layer.)
 *
 * DF3 is applied separately (in `populateHierarchy`) since it's a path-level
 * inference, not a field-level one.
 */
function classifyForeignKey(
    fieldName: string,
    fieldType: string,
    parentIOName: string | null,
    parentIDFieldName: string | null,
    allIONamesBySuffix: Map<string, string>,
    fkNamingConvention: string | null,
): FkClassification | null {
    const lower = fieldName.toLowerCase();

    // DF3 (URL path parent → child). Applied here when the IO has been tagged
    // with a parent via path-template observation.
    if (parentIOName && parentIDFieldName && lower === parentIDFieldName.toLowerCase()) {
        return {
            Method: 'url-path-parent',
            Strength: 'Definite',
            RelatedIOName: parentIOName,
            BasedOn: `URL path template references {${parentIDFieldName}} on parent IO ${parentIOName}`,
        };
    }

    // DF4 (Strong): `{ObjectName}Id` or `{object_name}_id` matches another IO.
    const camelSuffixMatch = fieldName.match(/^(.+?)(Id|ID)$/);
    if (camelSuffixMatch) {
        const stem = camelSuffixMatch[1]!.toLowerCase();
        const candidate = allIONamesBySuffix.get(stem);
        if (candidate) {
            return {
                Method: 'name-pattern-suffix',
                Strength: 'Strong',
                RelatedIOName: candidate,
                BasedOn: `field name '${fieldName}' matches '{ObjectName}Id' pattern against known IO '${candidate}' (DF4)`,
            };
        }
    }
    const snakeSuffixMatch = fieldName.match(/^(.+?)_id$/i);
    if (snakeSuffixMatch) {
        const stem = snakeSuffixMatch[1]!.toLowerCase();
        const candidate = allIONamesBySuffix.get(stem);
        if (candidate) {
            return {
                Method: 'name-pattern-suffix',
                Strength: 'Strong',
                RelatedIOName: candidate,
                BasedOn: `field name '${fieldName}' matches '{object_name}_id' pattern against known IO '${candidate}' (DF4)`,
            };
        }
    }

    // DF6 (Moderate): root's FKNamingConvention pattern + target IO exists.
    // HubSpot's convention is 'snake-case-id-suffix' which DF4-snake already covers,
    // and 'hs_<thing>_id' which DF4-snake also covers via the leading 'hs_'.
    // Emit DF6 when the field name is a vendor-namespaced FK that matched DF4 — the
    // stronger DF4 signal already won, so this branch is a no-op. Left here for future
    // vendor conventions that don't fit DF4.
    if (fkNamingConvention) {
        // (Reserved — no current vendor pattern flips DF6 distinct from DF4.)
    }

    // DF7 (Weak): type=string-uuid + ends-with Id, no known target. Emit as candidate.
    if (fieldType === 'uniqueidentifier' && /id$/i.test(fieldName)) {
        return {
            Method: 'unknown',
            Strength: 'Weak',
            RelatedIOName: null,
            BasedOn: 'field is string-UUID typed with Id suffix but no matching IO found (DF7)',
        };
    }

    return null;
}

// -------------------------------------------------------------------------------------------------
// Hierarchy detection (DF3) — path templates like /parent/{ParentID}/children.
// -------------------------------------------------------------------------------------------------

interface HierarchyInfo {
    ParentObjectName: string | null;
    ParentObjectIDFieldName: string | null;
    HierarchyPath: string[];
}

/**
 * Inspect an IO's APIPath / ListPath / GetPath for `/parents/{ParentID}/...`
 * style templates. When found, the segment immediately before the path param
 * is the parent collection name; the param name is the FK field on the child.
 *
 * Returns null when the IO has no parent in its URL path (top-level resource).
 */
function detectHierarchy(io: openapi.ExtractedIO, allIONamesByLastSegment: Map<string, string>): HierarchyInfo {
    const paths = [io.Capabilities.GetPath, io.Capabilities.ListPath, io.Capabilities.PrimaryPath].filter(
        (p): p is string => typeof p === 'string',
    );
    for (const p of paths) {
        const segs = p.split('/').filter((s) => s.length > 0);
        for (let i = 1; i < segs.length; i++) {
            const cur = segs[i]!;
            const prev = segs[i - 1]!;
            if (cur.startsWith('{') && cur.endsWith('}') && i < segs.length - 1) {
                // Found a {param} not at the tail → likely a parent-id reference.
                const parentName = allIONamesByLastSegment.get(prev.toLowerCase());
                if (parentName) {
                    const paramName = cur.slice(1, -1);
                    return {
                        ParentObjectName: parentName,
                        ParentObjectIDFieldName: paramName,
                        HierarchyPath: [parentName],
                    };
                }
            }
        }
    }
    return { ParentObjectName: null, ParentObjectIDFieldName: null, HierarchyPath: [] };
}

// -------------------------------------------------------------------------------------------------
// Bulk-endpoint detection.
// -------------------------------------------------------------------------------------------------

interface BulkEndpoint {
    BulkAPIPath: string | null;
    BulkAPIMethod: string | null;
}

/**
 * For an IO whose APIPath is `/x/y/z`, find a sibling raw path matching
 * `/x/y/z/batch/<verb>`. Prefer `/batch/create` (the most universal bulk write
 * verb); fall back to any batch sibling.
 */
function detectBulkEndpoint(io: openapi.ExtractedIO, rawPaths: Record<string, unknown>): BulkEndpoint {
    const primary = io.Capabilities.PrimaryPath ?? io.Capabilities.ListPath ?? null;
    if (!primary) return { BulkAPIPath: null, BulkAPIMethod: null };
    for (const suffix of HUBSPOT_BULK_SUFFIXES) {
        const candidate = primary.replace(/\/$/, '') + suffix;
        if (candidate in rawPaths) {
            const methods = rawPaths[candidate] as Record<string, unknown>;
            // batch endpoints are POST in HubSpot.
            if (methods && 'post' in methods) {
                return { BulkAPIPath: candidate, BulkAPIMethod: 'POST' };
            }
        }
    }
    return { BulkAPIPath: null, BulkAPIMethod: null };
}

// -------------------------------------------------------------------------------------------------
// Incremental-cursor candidate detection (per-IOF) + IO-level cursor pick.
// -------------------------------------------------------------------------------------------------

function isIncrementalCursorCandidate(field: { Name: string; Type: string }): boolean {
    const lower = field.Name.toLowerCase();
    if (!HUBSPOT_INCREMENTAL_CURSOR_NAMES_LOWER.has(lower)) return false;
    return field.Type === 'datetime';
}

function pickIncrementalCursor(fields: openapi.FieldRow[]): { CursorFieldName: string | null; Confidence: 'Provable' | 'Likely' | 'None' } {
    // Prefer the most-canonical HubSpot cursor first.
    for (const candidate of HUBSPOT_INCREMENTAL_CURSOR_NAMES) {
        const found = fields.find((f) => f.Name === candidate && f.Type === 'datetime');
        if (found) {
            const confidence = candidate === 'hs_lastmodifieddate' ? 'Provable' : 'Likely';
            return { CursorFieldName: candidate, Confidence: confidence };
        }
    }
    return { CursorFieldName: null, Confidence: 'None' };
}

// -------------------------------------------------------------------------------------------------
// Topological sort for TraversalOrder.
// -------------------------------------------------------------------------------------------------

function computeTraversalOrder(
    enrichedIOs: Array<{ Name: string; ParentObjectName: string | null }>,
): { Order: string[]; Cycles: string[][] } {
    const indegree = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const io of enrichedIOs) {
        if (!indegree.has(io.Name)) indegree.set(io.Name, 0);
        if (!adj.has(io.Name)) adj.set(io.Name, []);
    }
    for (const io of enrichedIOs) {
        if (io.ParentObjectName && indegree.has(io.ParentObjectName)) {
            adj.get(io.ParentObjectName)!.push(io.Name);
            indegree.set(io.Name, (indegree.get(io.Name) ?? 0) + 1);
        }
    }
    const queue: string[] = [];
    for (const [name, deg] of indegree) {
        if (deg === 0) queue.push(name);
    }
    queue.sort();
    const order: string[] = [];
    while (queue.length > 0) {
        const cur = queue.shift()!;
        order.push(cur);
        for (const next of adj.get(cur) ?? []) {
            const nextDeg = (indegree.get(next) ?? 0) - 1;
            indegree.set(next, nextDeg);
            if (nextDeg === 0) {
                queue.push(next);
                queue.sort();
            }
        }
    }
    const cycles: string[][] = [];
    if (order.length < enrichedIOs.length) {
        const inOrder = new Set(order);
        const stuck = enrichedIOs.filter((io) => !inOrder.has(io.Name)).map((io) => io.Name);
        cycles.push(stuck);
    }
    return { Order: order, Cycles: cycles };
}

// -------------------------------------------------------------------------------------------------
// Emitted IO assembly — converts Strategy 0's ExtractedIO into the metadata row shape,
// adding the framework's per-IO / per-IOF expansion fields.
// -------------------------------------------------------------------------------------------------

interface EmittedIO {
    fields: Record<string, unknown>;
    relatedEntities: { 'MJ: Integration Object Fields': Array<{ fields: Record<string, unknown> }> };
    sourceUrl: string;
    sourceSpec: string;
    parentObjectName: string | null;
    iofClassifications: Map<string, { Pk?: PkClassification; Fk?: FkClassification | null }>;
    incrementalCursor: { CursorFieldName: string | null; Confidence: 'Provable' | 'Likely' | 'None' };
    bulk: BulkEndpoint;
}

interface AssemblyContext {
    pick: ApiSpecPick;
    integrationIdRef: string;
    rawPaths: Record<string, unknown>;
    allIONamesBySuffix: Map<string, string>;
    allIONamesByLastSegment: Map<string, string>;
    ioNameToPkFieldName: Map<string, string>;
    fkNamingConvention: string | null;
}

function assembleEmittedIO(io: openapi.ExtractedIO, idx: number, ctx: AssemblyContext): EmittedIO {
    const caps = io.Capabilities;
    const seq = idx + 1;

    // Hierarchy detection (DF3).
    const hierarchy = detectHierarchy(io, ctx.allIONamesByLastSegment);

    // Incremental cursor + bulk endpoint.
    const cursor = pickIncrementalCursor(io.Fields);
    const bulk = detectBulkEndpoint(io, ctx.rawPaths);

    // HubSpot static OpenAPI spec contains only standard objects — custom
    // objects come from runtime discovery via the Properties API. Same for
    // custom fields. We emit IsStandardObject=true / IsCustomObject=false /
    // IsCustomField=false uniformly here; custom-discovery is its own pass.
    const isStandardObject = true;
    const isCustomObject = false;

    const configForIO: Record<string, unknown> = {};
    if (hierarchy.HierarchyPath.length > 0) configForIO['HierarchyPath'] = hierarchy.HierarchyPath;
    if (cursor.Confidence !== 'None') {
        configForIO['IncrementalCursorConfidence'] = cursor.Confidence;
    }

    const ioFields: Record<string, unknown> = {
        IntegrationID: ctx.integrationIdRef,
        Name: io.Name,
        DisplayName: io.DisplayName,
        Description: io.Description ?? `${ctx.pick.area} / ${ctx.pick.apiName} object (derived from OpenAPI spec ${ctx.pick.rolloutVersion})`,
        Category: io.Category,
        APIPath: caps.PrimaryPath,
        ResponseDataKey: caps.SupportsList ? HUBSPOT_ADAPTER.ResponseDataKeyForLists : null,
        DefaultPageSize: caps.SupportsList ? (HUBSPOT_ADAPTER.DefaultPageSize ?? null) : null,
        SupportsPagination: caps.SupportsList,
        PaginationType: caps.SupportsList ? (HUBSPOT_ADAPTER.PaginationType ?? null) : null,
        SupportsIncrementalSync: cursor.CursorFieldName !== null,
        SupportsWrite: caps.SupportsCreate || caps.SupportsUpdate || caps.SupportsDelete,
        Sequence: seq,
        Status: 'Active',
        Source: `OpenAPI:${ctx.pick.selectedBlob}`,
        CreateAPIPath: caps.CreatePath,
        CreateMethod: caps.CreateMethod,
        UpdateAPIPath: caps.UpdatePath,
        UpdateMethod: caps.UpdateMethod,
        DeleteAPIPath: caps.DeletePath,
        DeleteMethod: caps.SupportsDelete ? 'DELETE' : null,
        GetAPIPath: caps.GetPath,
        SearchAPIPath: caps.SearchPath,
        SearchMethod: caps.SearchMethod,
        ListAPIPath: caps.ListPath,
        ListMethod: caps.ListMethod,
        IncludeInActionGeneration: true,

        // Framework expansion (Phase B).
        IsBidirectional: caps.SupportsCreate || caps.SupportsUpdate || caps.SupportsDelete,
        ParentObjectName: hierarchy.ParentObjectName,
        ParentObjectIDFieldName: hierarchy.ParentObjectIDFieldName,
        IncrementalCursorFieldName: cursor.CursorFieldName,
        IncrementalWatermarkType: cursor.CursorFieldName ? 'Timestamp' : null,
        IsStandardObject: isStandardObject,
        IsCustomObject: isCustomObject,
        BulkAPIPath: bulk.BulkAPIPath,
        BulkAPIMethod: bulk.BulkAPIMethod,
        Configuration: Object.keys(configForIO).length > 0 ? JSON.stringify(configForIO) : null,
    };

    // Per-IOF assembly with PK/FK classification.
    const iofClassifications = new Map<string, { Pk?: PkClassification; Fk?: FkClassification | null }>();
    const iofRows = io.Fields.map((f, fidx): { fields: Record<string, unknown> } => {
        const pk = classifyPrimaryKey(f, HUBSPOT_ADAPTER);
        const fk = classifyForeignKey(
            f.Name,
            f.Type,
            hierarchy.ParentObjectName,
            hierarchy.ParentObjectIDFieldName,
            ctx.allIONamesBySuffix,
            ctx.fkNamingConvention,
        );
        iofClassifications.set(f.Name, { Pk: pk, Fk: fk });

        const fieldConfig: Record<string, unknown> = {};
        if (pk.Confidence !== 'Provable' && pk.Confidence !== 'Likely' && pk.Confidence !== 'Unknown') {
            fieldConfig['PrimaryKeyConfidence'] = pk.Confidence;
        }

        return {
            fields: {
                Name: f.Name,
                DisplayName: f.DisplayName,
                Description: f.Description ? f.Description.slice(0, 500) : null,
                Type: f.Type,
                Length: f.Length,
                AllowsNull: f.AllowsNull,
                IsPrimaryKey: f.IsPrimaryKey,
                IsRequired: f.IsRequired,
                IsReadOnly: f.IsReadOnly,
                Sequence: fidx + 1,
                Status: 'Active',
                Source: `OpenAPI:${ctx.pick.selectedBlob}:${io.FieldSourceOp ?? '?'}`,

                // Framework expansion (Phase B).
                IsAPIWritable: !f.IsReadOnly,
                IsComputed: false,
                IsImmutableAfterCreate: false,
                IsCustomField: false,
                IsIncrementalCursorCandidate: isIncrementalCursorCandidate(f),
                IsForeignKey: !!(fk && (fk.Strength === 'Definite' || fk.Strength === 'Strong' || fk.Strength === 'Moderate')),
                FKDetectionMethod: fk ? fk.Method : null,
                IsDeprecated: false,
                RelatedIntegrationObjectID: null as string | null,
                RelatedIntegrationObjectFieldName: null as string | null,
                PrimaryKeyDetectionMethod: f.IsPrimaryKey ? pk.Method : null,
                Configuration: Object.keys(fieldConfig).length > 0 ? JSON.stringify(fieldConfig) : null,
            },
        };
    });

    // Second pass to populate RelatedIntegrationObjectID + RelatedIntegrationObjectFieldName for resolved FKs.
    for (const row of iofRows) {
        const fields = row.fields as Record<string, unknown>;
        const name = fields['Name'] as string;
        const cls = iofClassifications.get(name);
        if (cls?.Fk && cls.Fk.RelatedIOName) {
            fields['RelatedIntegrationObjectID'] =
                `@lookup:MJ: Integration Objects.Name=${cls.Fk.RelatedIOName}&IntegrationID=@parent:ID`;
            // Resolve the target IO's PK field name from the cross-IO index.
            const targetPk = ctx.ioNameToPkFieldName.get(cls.Fk.RelatedIOName) ?? null;
            fields['RelatedIntegrationObjectFieldName'] = targetPk;
        }
    }

    return {
        fields: ioFields,
        relatedEntities: { 'MJ: Integration Object Fields': iofRows },
        sourceUrl: ctx.pick.rawUrl,
        sourceSpec: ctx.pick.selectedBlob,
        parentObjectName: hierarchy.ParentObjectName,
        iofClassifications,
        incrementalCursor: cursor,
        bulk,
    };
}

// -------------------------------------------------------------------------------------------------
// Main.
// -------------------------------------------------------------------------------------------------

interface RunStats {
    IOCount: number;
    IOFCount: number;
    CapHit: boolean;
    ByCategory: Record<string, number>;
    IOsWithIncrementalSync: number;
    IOsBidirectional: number;
    IOsWithParent: number;
    MaxHierarchyDepth: number;
    IOsCustom: number;
    IOFsAPIWritable: number;
    IOFsCustom: number;
    IOFsForeignKey: number;
    IOFsIncrementalCandidate: number;
}

async function main(): Promise<void> {
    const startedAt = Date.now();
    ensureDir(CACHE_DIR);
    ensureDir(SPEC_CACHE_DIR);

    // 1. Read + validate SOURCES.json.
    const sourcesRaw = readJson<unknown>(SOURCES_PATH);
    const sources = SourcesFileSchema.parse(sourcesRaw);
    const openapiSource = pickOpenApiSpecSource(sources.Sources);
    const { owner, repo } = parseGithubRepoUrl(openapiSource.URL);

    // 2. Fetch git tree (recursive).
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`;
    const treeText = await fetchText(treeUrl, TREE_CACHE_PATH);
    const tree = GitTreeResponseSchema.parse(JSON.parse(treeText));
    if (tree.truncated) {
        process.stderr.write(`WARN: git tree response is truncated; some spec files may be missing.\n`);
    }

    // 3. Choose one bare OpenAPI spec per (Area/ApiName) — latest rollout.
    const picks = chooseSpecsFromTree(tree, owner, repo);

    // 4. PHASE 1: Fetch + extract IOs (no cross-IO references yet).
    const phase1Results: Array<{ pick: ApiSpecPick; rawPaths: Record<string, unknown>; extracted: openapi.ExtractedIO[] }> = [];
    const errors: Array<{ source: string; message: string }> = [];

    for (const pick of picks) {
        if (Date.now() - startedAt > RUN_DEADLINE_MS) {
            errors.push({ source: pick.selectedBlob, message: 'Run deadline exceeded; remaining specs skipped.' });
            break;
        }
        const totalSoFar = phase1Results.reduce((s, p) => s + p.extracted.length, 0);
        if (totalSoFar >= IO_CAP) break;
        const cachePath = path.join(SPEC_CACHE_DIR, sanitizeForFilename(pick.selectedBlob.replace(/\//g, '__')));
        try {
            const text = await fetchText(pick.rawUrl, cachePath);
            const docRaw = JSON.parse(text);
            const doc = openapi.OpenApiDocSchema.parse(docRaw);
            const extracted = openapi.ExtractFromOpenApiDoc({
                Doc: doc,
                Adapter: HUBSPOT_ADAPTER,
                DeriveName: deriveHubSpotIoName(pick.area, pick.apiName),
            });
            phase1Results.push({ pick, rawPaths: (doc.paths ?? {}) as Record<string, unknown>, extracted });
        } catch (e) {
            errors.push({ source: pick.selectedBlob, message: (e as Error).message });
        }
    }

    // 5. Build cross-IO indices for FK + hierarchy resolution.
    //
    // - allIONamesBySuffix: lowercased last-name-segment → IO Name (for DF4 matching)
    // - allIONamesByLastSegment: lowercased path-segment → IO Name (for hierarchy)
    // - ioNameToPkFieldName: IO Name → its PK IOF.Name (for RelatedIntegrationObjectFieldName)
    const allIONamesBySuffix = new Map<string, string>();
    const allIONamesByLastSegment = new Map<string, string>();
    const ioNameToPkFieldName = new Map<string, string>();
    for (const { extracted } of phase1Results) {
        for (const io of extracted) {
            // Last name segment (e.g. "Crm.Contacts.contacts" → "contacts").
            const last = io.Name.split('.').pop() ?? io.Name;
            // Singularize trailing 's' for FK suffix matching:
            //   "contactId" → stem "contact" should match IO whose tail is "contacts".
            // Cheap inflection; vendor-agnostic.
            const singular = last.endsWith('s') ? last.slice(0, -1) : last;
            allIONamesBySuffix.set(last.toLowerCase(), io.Name);
            if (singular !== last) allIONamesBySuffix.set(singular.toLowerCase(), io.Name);

            // For hierarchy: the URL path's collection segment (last segment of ObjectKey).
            const objKeySegs = io.ObjectKey.split('/').filter((s) => s.length > 0);
            const objKeyLast = objKeySegs[objKeySegs.length - 1] ?? last;
            allIONamesByLastSegment.set(objKeyLast.toLowerCase(), io.Name);

            // PK field name for this IO (first IsPrimaryKey=true field wins; Strategy 0
            // ensures at least one is marked when fields exist).
            const pkField = io.Fields.find((f) => f.IsPrimaryKey);
            if (pkField) ioNameToPkFieldName.set(io.Name, pkField.Name);
        }
    }

    // 6. PHASE 2: Assemble enriched IOs with cross-IO classifications.
    const metadata = readJson<{
        fields: Record<string, unknown>;
        relatedEntities: { 'MJ: Integration Objects': Array<{ fields: Record<string, unknown>; relatedEntities?: unknown }> };
    }>(METADATA_PATH);
    const fkNamingConvention =
        typeof metadata.fields['FKNamingConvention'] === 'string'
            ? (metadata.fields['FKNamingConvention'] as string)
            : null;

    const integrationIdRef = '@parent:ID';
    const allIos: EmittedIO[] = [];
    for (const { pick, rawPaths, extracted } of phase1Results) {
        const ctx: AssemblyContext = {
            pick,
            integrationIdRef,
            rawPaths,
            allIONamesBySuffix,
            allIONamesByLastSegment,
            ioNameToPkFieldName,
            fkNamingConvention,
        };
        for (let i = 0; i < extracted.length; i++) {
            if (allIos.length >= IO_CAP) break;
            allIos.push(assembleEmittedIO(extracted[i]!, i, ctx));
        }
    }
    const capHit = allIos.length >= IO_CAP;

    // 7. Deduplicate IOs by Name (upsert — last write wins).
    const ioByName = new Map<string, EmittedIO>();
    for (const io of allIos) {
        const name = io.fields['Name'] as string;
        ioByName.set(name, io);
    }
    const finalIos = Array.from(ioByName.values());

    // 8. Compute TraversalOrder via topological sort.
    const traversal = computeTraversalOrder(
        finalIos.map((io) => ({
            Name: io.fields['Name'] as string,
            ParentObjectName: io.parentObjectName,
        })),
    );
    if (traversal.Cycles.length > 0) {
        errors.push({
            source: 'traversal-order',
            message: `Cycle detected involving IOs: ${traversal.Cycles.flat().join(', ')}`,
        });
    }
    metadata.fields['TraversalOrder'] = traversal.Order;

    // 9. Merge into existing metadata file (upsert by Name).
    const existingIos = metadata.relatedEntities?.['MJ: Integration Objects'] ?? [];
    const incomingIos = finalIos.map((io) => ({ fields: io.fields, relatedEntities: io.relatedEntities }));
    metadata.relatedEntities['MJ: Integration Objects'] = UpsertByKey(
        existingIos,
        incomingIos,
        (row) => row.fields['Name'] as string | undefined,
    );
    writeJson(METADATA_PATH, metadata);

    // 10. Upsert CODE_EVIDENCE entries by TargetField.
    let codeEvidence: { Entries: Array<Record<string, unknown>> };
    if (fs.existsSync(CODE_EVIDENCE_PATH)) {
        codeEvidence = readJson<{ Entries: Array<Record<string, unknown>> }>(CODE_EVIDENCE_PATH);
        if (!Array.isArray(codeEvidence.Entries)) codeEvidence = { Entries: [] };
    } else {
        codeEvidence = { Entries: [] };
    }
    const nowIso = new Date().toISOString();
    const scriptPath = `connectors-registry/${VENDOR_KEY}/scripts/extract-io-iof.ts`;
    const newEntries: Array<Record<string, unknown>> = [];

    for (const io of finalIos) {
        const ioName = io.fields['Name'] as string;
        const iofs = io.relatedEntities['MJ: Integration Object Fields'];
        const fieldTypeBreakdown: Record<string, number> = {};
        for (const f of iofs) {
            const t = (f.fields['Type'] as string) ?? 'unknown';
            fieldTypeBreakdown[t] = (fieldTypeBreakdown[t] ?? 0) + 1;
        }

        // Base IO evidence.
        newEntries.push({
            ScriptPath: scriptPath,
            ScriptRunAt: nowIso,
            SourceURL: io.sourceUrl,
            SourceBlob: io.sourceSpec,
            StructuredOutput: { IOName: ioName, IOFCount: iofs.length, FieldTypeBreakdown: fieldTypeBreakdown },
            SchemaValidationStatus: 'Passed',
            TargetField: `io.${ioName}`,
        });

        // Per-flag IO-level CODE_EVIDENCE.
        if (io.fields['SupportsWrite'] === true) {
            newEntries.push({
                ScriptPath: scriptPath,
                ScriptRunAt: nowIso,
                SourceURL: io.sourceUrl,
                SourceBlob: io.sourceSpec,
                StructuredOutput: {
                    DerivedFlag: 'SupportsWrite=true',
                    BasedOn: 'OpenAPI paths declare POST/PATCH/PUT/DELETE on this object key',
                },
                SchemaValidationStatus: 'Passed',
                TargetField: `io.${ioName}.SupportsWrite`,
            });
        }
        if (io.fields['IsBidirectional'] === true) {
            newEntries.push({
                ScriptPath: scriptPath,
                ScriptRunAt: nowIso,
                SourceURL: io.sourceUrl,
                SourceBlob: io.sourceSpec,
                StructuredOutput: {
                    DerivedFlag: 'IsBidirectional=true',
                    BasedOn: 'OpenAPI paths declare write verbs on this object',
                },
                SchemaValidationStatus: 'Passed',
                TargetField: `io.${ioName}.IsBidirectional`,
            });
        }
        if (io.fields['SupportsIncrementalSync'] === true) {
            newEntries.push({
                ScriptPath: scriptPath,
                ScriptRunAt: nowIso,
                SourceURL: io.sourceUrl,
                SourceBlob: io.sourceSpec,
                StructuredOutput: {
                    DerivedFlag: 'SupportsIncrementalSync=true',
                    BasedOn: `IO has a datetime cursor field matching HubSpot's per-resource modified-since convention (cursor field: ${io.fields['IncrementalCursorFieldName']})`,
                },
                SchemaValidationStatus: 'Passed',
                TargetField: `io.${ioName}.SupportsIncrementalSync`,
            });
            newEntries.push({
                ScriptPath: scriptPath,
                ScriptRunAt: nowIso,
                SourceURL: io.sourceUrl,
                SourceBlob: io.sourceSpec,
                StructuredOutput: {
                    DerivedFlag: `IncrementalCursorFieldName=${io.fields['IncrementalCursorFieldName']}`,
                    BasedOn: io.incrementalCursor.Confidence === 'Provable'
                        ? `field 'hs_lastmodifieddate' is HubSpot CRM's canonical modification timestamp`
                        : `field 'updatedAt' is HubSpot's v3 read-API modification timestamp surface`,
                    Confidence: io.incrementalCursor.Confidence,
                },
                SchemaValidationStatus: 'Passed',
                TargetField: `io.${ioName}.IncrementalCursorFieldName`,
            });
            newEntries.push({
                ScriptPath: scriptPath,
                ScriptRunAt: nowIso,
                SourceURL: io.sourceUrl,
                SourceBlob: io.sourceSpec,
                StructuredOutput: {
                    DerivedFlag: 'IncrementalWatermarkType=Timestamp',
                    BasedOn: 'cursor field is OpenAPI datetime type → ISO8601 timestamp watermark per WatermarkService.ValidateWatermark vocabulary',
                },
                SchemaValidationStatus: 'Passed',
                TargetField: `io.${ioName}.IncrementalWatermarkType`,
            });
        }
        if (io.fields['IsStandardObject'] === true) {
            newEntries.push({
                ScriptPath: scriptPath,
                ScriptRunAt: nowIso,
                SourceURL: io.sourceUrl,
                SourceBlob: io.sourceSpec,
                StructuredOutput: {
                    DerivedFlag: 'IsStandardObject=true',
                    BasedOn: "HubSpot static OpenAPI spec contains only standard objects; custom objects are runtime-discovered via the Properties API and do not appear in this spec collection",
                },
                SchemaValidationStatus: 'Passed',
                TargetField: `io.${ioName}.IsStandardObject`,
            });
        }
        if (io.parentObjectName) {
            newEntries.push({
                ScriptPath: scriptPath,
                ScriptRunAt: nowIso,
                SourceURL: io.sourceUrl,
                SourceBlob: io.sourceSpec,
                StructuredOutput: {
                    DerivedFlag: `ParentObjectName=${io.parentObjectName}`,
                    BasedOn: `URL path template observed: parent collection segment precedes {${io.fields['ParentObjectIDFieldName']}} (DF3)`,
                },
                SchemaValidationStatus: 'Passed',
                TargetField: `io.${ioName}.ParentObjectName`,
            });
        }
        if (io.fields['BulkAPIPath']) {
            newEntries.push({
                ScriptPath: scriptPath,
                ScriptRunAt: nowIso,
                SourceURL: io.sourceUrl,
                SourceBlob: io.sourceSpec,
                StructuredOutput: {
                    DerivedFlag: `BulkAPIPath=${io.fields['BulkAPIPath']}`,
                    BasedOn: 'OpenAPI doc declares a POST operation on /<APIPath>/batch/<verb> sibling path',
                },
                SchemaValidationStatus: 'Passed',
                TargetField: `io.${ioName}.BulkAPIPath`,
            });
        }

        // Per-flag IOF-level CODE_EVIDENCE.
        for (const f of iofs) {
            const fieldName = f.fields['Name'] as string;
            const cls = io.iofClassifications.get(fieldName);
            if (f.fields['IsPrimaryKey'] === true && cls?.Pk) {
                newEntries.push({
                    ScriptPath: scriptPath,
                    ScriptRunAt: nowIso,
                    SourceURL: io.sourceUrl,
                    SourceBlob: io.sourceSpec,
                    StructuredOutput: {
                        DerivedFlag: 'IsPrimaryKey=true',
                        BasedOn: cls.Pk.BasedOn,
                        DPGate: cls.Pk.Method,
                        Confidence: cls.Pk.Confidence,
                    },
                    SchemaValidationStatus: 'Passed',
                    TargetField: `iof.${ioName}.${fieldName}.IsPrimaryKey`,
                });
            }
            if (f.fields['IsRequired'] === true) {
                newEntries.push({
                    ScriptPath: scriptPath,
                    ScriptRunAt: nowIso,
                    SourceURL: io.sourceUrl,
                    SourceBlob: io.sourceSpec,
                    StructuredOutput: {
                        DerivedFlag: 'IsRequired=true',
                        BasedOn: "field name present in OpenAPI schema's required[] array",
                    },
                    SchemaValidationStatus: 'Passed',
                    TargetField: `iof.${ioName}.${fieldName}.IsRequired`,
                });
            }
            if (f.fields['IsAPIWritable'] === false) {
                newEntries.push({
                    ScriptPath: scriptPath,
                    ScriptRunAt: nowIso,
                    SourceURL: io.sourceUrl,
                    SourceBlob: io.sourceSpec,
                    StructuredOutput: {
                        DerivedFlag: 'IsAPIWritable=false',
                        BasedOn: 'OpenAPI schema marks field readOnly=true',
                    },
                    SchemaValidationStatus: 'Passed',
                    TargetField: `iof.${ioName}.${fieldName}.IsAPIWritable`,
                });
            } else if (f.fields['IsAPIWritable'] === true) {
                // Evidence-of-absence: the OpenAPI schema does NOT mark this field
                // readOnly:true, so per OpenAPI semantics it is writable. This is a
                // structurally-determined emission, not an assumption.
                newEntries.push({
                    ScriptPath: scriptPath,
                    ScriptRunAt: nowIso,
                    SourceURL: io.sourceUrl,
                    SourceBlob: io.sourceSpec,
                    StructuredOutput: {
                        DerivedFlag: 'IsAPIWritable=true',
                        BasedOn: 'OpenAPI schema does not mark field readOnly=true (default writable per OpenAPI 3.x semantics)',
                    },
                    SchemaValidationStatus: 'Passed',
                    TargetField: `iof.${ioName}.${fieldName}.IsAPIWritable`,
                });
            }
            if (f.fields['IsForeignKey'] === true && cls?.Fk) {
                newEntries.push({
                    ScriptPath: scriptPath,
                    ScriptRunAt: nowIso,
                    SourceURL: io.sourceUrl,
                    SourceBlob: io.sourceSpec,
                    StructuredOutput: {
                        DerivedFlag: 'IsForeignKey=true',
                        BasedOn: cls.Fk.BasedOn,
                        DFGate: cls.Fk.Method,
                        Strength: cls.Fk.Strength,
                    },
                    SchemaValidationStatus: 'Passed',
                    TargetField: `iof.${ioName}.${fieldName}.IsForeignKey`,
                });
                newEntries.push({
                    ScriptPath: scriptPath,
                    ScriptRunAt: nowIso,
                    SourceURL: io.sourceUrl,
                    SourceBlob: io.sourceSpec,
                    StructuredOutput: {
                        DerivedFlag: `FKDetectionMethod=${cls.Fk.Method}`,
                        BasedOn: cls.Fk.BasedOn,
                        Strength: cls.Fk.Strength,
                    },
                    SchemaValidationStatus: 'Passed',
                    TargetField: `iof.${ioName}.${fieldName}.FKDetectionMethod`,
                });
                if (cls.Fk.RelatedIOName) {
                    newEntries.push({
                        ScriptPath: scriptPath,
                        ScriptRunAt: nowIso,
                        SourceURL: io.sourceUrl,
                        SourceBlob: io.sourceSpec,
                        StructuredOutput: {
                            DerivedFlag: `RelatedIntegrationObjectID → ${cls.Fk.RelatedIOName}`,
                            BasedOn: cls.Fk.BasedOn,
                            DFGate: cls.Fk.Method,
                            Strength: cls.Fk.Strength,
                        },
                        SchemaValidationStatus: 'Passed',
                        TargetField: `iof.${ioName}.${fieldName}.RelatedIntegrationObjectID`,
                    });
                }
            }
            if (f.fields['IsIncrementalCursorCandidate'] === true) {
                newEntries.push({
                    ScriptPath: scriptPath,
                    ScriptRunAt: nowIso,
                    SourceURL: io.sourceUrl,
                    SourceBlob: io.sourceSpec,
                    StructuredOutput: {
                        DerivedFlag: 'IsIncrementalCursorCandidate=true',
                        BasedOn: `field name '${fieldName}' matches HubSpot's incremental cursor convention (hs_lastmodifieddate/updatedAt) AND type is datetime`,
                    },
                    SchemaValidationStatus: 'Passed',
                    TargetField: `iof.${ioName}.${fieldName}.IsIncrementalCursorCandidate`,
                });
            }
            if (f.fields['IsCustomField'] === true) {
                newEntries.push({
                    ScriptPath: scriptPath,
                    ScriptRunAt: nowIso,
                    SourceURL: io.sourceUrl,
                    SourceBlob: io.sourceSpec,
                    StructuredOutput: {
                        DerivedFlag: 'IsCustomField=true',
                        BasedOn: "matched root CustomFieldMarkerPattern",
                    },
                    SchemaValidationStatus: 'Passed',
                    TargetField: `iof.${ioName}.${fieldName}.IsCustomField`,
                });
            }
        }
    }

    codeEvidence.Entries = UpsertByKey(
        codeEvidence.Entries,
        newEntries,
        (e) => (typeof e['TargetField'] === 'string' ? (e['TargetField'] as string) : undefined),
    );
    const codeEvidenceAppended = newEntries.length;
    writeJson(CODE_EVIDENCE_PATH, codeEvidence);

    // 11. Stats.
    const byCategory: Record<string, number> = {};
    let totalIofs = 0;
    let iosIncremental = 0;
    let iosBidirectional = 0;
    let iosWithParent = 0;
    let maxHierarchyDepth = 0;
    let iosCustom = 0;
    let iofsAPIWritable = 0;
    let iofsCustom = 0;
    let iofsForeignKey = 0;
    let iofsIncrementalCandidate = 0;

    for (const io of finalIos) {
        const cat = (io.fields['Category'] as string | null) ?? 'Uncategorized';
        byCategory[cat] = (byCategory[cat] ?? 0) + 1;
        const iofs = io.relatedEntities['MJ: Integration Object Fields'] ?? [];
        totalIofs += iofs.length;
        if (io.fields['SupportsIncrementalSync'] === true) iosIncremental++;
        if (io.fields['IsBidirectional'] === true) iosBidirectional++;
        if (io.parentObjectName) iosWithParent++;
        if (io.fields['IsCustomObject'] === true) iosCustom++;
        const cfg = typeof io.fields['Configuration'] === 'string'
            ? JSON.parse(io.fields['Configuration'] as string)
            : {};
        const depth = Array.isArray(cfg['HierarchyPath']) ? (cfg['HierarchyPath'] as unknown[]).length : 0;
        if (depth > maxHierarchyDepth) maxHierarchyDepth = depth;

        for (const f of iofs) {
            if (f.fields['IsAPIWritable'] === true) iofsAPIWritable++;
            if (f.fields['IsCustomField'] === true) iofsCustom++;
            if (f.fields['IsForeignKey'] === true) iofsForeignKey++;
            if (f.fields['IsIncrementalCursorCandidate'] === true) iofsIncrementalCandidate++;
        }
    }

    const stats: RunStats = {
        IOCount: finalIos.length,
        IOFCount: totalIofs,
        CapHit: capHit,
        ByCategory: byCategory,
        IOsWithIncrementalSync: iosIncremental,
        IOsBidirectional: iosBidirectional,
        IOsWithParent: iosWithParent,
        MaxHierarchyDepth: maxHierarchyDepth,
        IOsCustom: iosCustom,
        IOFsAPIWritable: iofsAPIWritable,
        IOFsCustom: iofsCustom,
        IOFsForeignKey: iofsForeignKey,
        IOFsIncrementalCandidate: iofsIncrementalCandidate,
    };

    const fetchedSourceUrls = Array.from(new Set(finalIos.map(io => io.sourceUrl)));
    const status: 'Complete' | 'PartialWithErrors' = errors.length === 0 ? 'Complete' : 'PartialWithErrors';
    const output = {
        Status: status,
        ScriptPath: `connectors-registry/${VENDOR_KEY}/scripts/extract-io-iof.ts`,
        StrategyUsed: '@memberjunction/connector-extractor-strategies/openapi',
        FetchedSourceURLs: fetchedSourceUrls,
        Stats: stats,
        ErrorsDuringRun: errors,
        MetadataFilePath: `connectors-registry/${VENDOR_KEY}/metadata/integrations/.${VENDOR_KEY}.json`,
        CodeEvidenceEntriesAppended: codeEvidenceAppended,
        TraversalOrderLength: traversal.Order.length,
        TraversalCycles: traversal.Cycles.length,
    };
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

main().catch(err => {
    process.stderr.write(`FATAL: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
});
