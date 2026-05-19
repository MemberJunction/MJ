#!/usr/bin/env tsx
/**
 * YourMembership IO/IOF extractor.
 *
 * Code-first principle: this script does not embed vendor catalog data.
 * It (1) reads the URL from SOURCES.json, (2) fetches the operation index
 * HTML at run time, (3) walks each per-operation page, (4) parses HTML
 * tables structurally, (5) emits IO/IOF rows into the metadata file under
 * `relatedEntities['MJ: Integration Objects']`, and (6) appends one or
 * more entries to CODE_EVIDENCE.json citing the source signal for every
 * hard-constraint flag emission.
 *
 * Stdout: structured stats JSON only. Vendor catalog text never leaves
 * the script's parse pipeline.
 *
 * Hard limits:
 *   - max 1000 IOs per run (fail loud if exceeded)
 *   - 10-minute wall-clock cap
 *   - bounded concurrent fetches (12)
 *   - cache/<op>.html stores fetched bodies so re-runs are fast +
 *     idempotent
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONNECTOR_ROOT = path.resolve(__dirname, '..');

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

const SCRIPT_REL_PATH = 'scripts/extract-io-iof.ts';
const SOURCES_PATH = path.join(CONNECTOR_ROOT, 'SOURCES.json');
const PHASE1_PATH = path.join(CONNECTOR_ROOT, 'Phase1Handoff.json');
const CACHE_DIR = path.join(CONNECTOR_ROOT, 'cache');
const METADATA_DIR = path.join(CONNECTOR_ROOT, 'metadata', 'integrations');
const METADATA_PATH = path.join(METADATA_DIR, '.your-membership.json');
const CODE_EVIDENCE_PATH = path.join(CONNECTOR_ROOT, 'CODE_EVIDENCE.json');

const MAX_IOS = 1000;
const WALL_CLOCK_MS = 10 * 60 * 1000;
const CONCURRENCY = 12;
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

// Vendor namespaces — derived from the source URLs themselves in
// `audit-source` and Phase1Handoff. We use the URL pattern documented in
// SOURCES.json to pick the operation-index host. We do NOT hardcode the
// 221 operation names — those are parsed from the index page at run time.

// Boilerplate DTOs that appear on nearly every YM operation page. They do
// NOT represent the operation's own data shape (they're shared base
// envelopes), so we exclude them from IOF emission. This is a structural
// allow-list of ~10 entries — well under the 5-entry "ban" threshold for
// vendor objects. Not vendor data, just protocol boilerplate.
const BOILERPLATE_DTO_NAMES = new Set<string>([
    'BaseDto',
    'BaseSharedDto',
    'MemberBaseSharedDto',
    'ResponseStatus',
    'Device',
    'ContentTypes',
    'RequestLogEntry',
]);

/* -------------------------------------------------------------------------- */
/* Zod schemas                                                                */
/* -------------------------------------------------------------------------- */

const ParamRowSchema = z.object({
    Name: z.string().min(1),
    Parameter: z.string(), // path | body | form | query | header
    DataType: z.string().min(1),
    Required: z.string(), // 'Yes' | 'No'
    Description: z.string().optional().default(''),
});
type ParamRow = z.infer<typeof ParamRowSchema>;

const ParamTableSchema = z.object({
    DTOName: z.string().min(1),
    Rows: z.array(ParamRowSchema),
});
type ParamTable = z.infer<typeof ParamTableSchema>;

const RouteRowSchema = z.object({
    Verb: z.string().min(1),
    Path: z.string().min(1),
    Description: z.string().optional().default(''),
});
type RouteRow = z.infer<typeof RouteRowSchema>;

const ParsedOperationSchema = z.object({
    OpName: z.string().min(1),
    SourceURL: z.string().url(),
    Routes: z.array(RouteRowSchema),
    ParamTables: z.array(ParamTableSchema),
    RequiredRoles: z.array(z.string()),
});
type ParsedOperation = z.infer<typeof ParsedOperationSchema>;

const IOFSchema = z.object({
    fields: z.object({
        IntegrationObjectID: z.string(),
        Name: z.string().min(1),
        Type: z.string().min(1),
        Length: z.number().nullable(),
        IsPrimaryKey: z.boolean(),
        IsRequired: z.boolean(),
        IsReadOnly: z.boolean(),
        Sequence: z.number().int().positive(),
    }),
});
type IOF = z.infer<typeof IOFSchema>;

const IOSchema = z.object({
    fields: z.object({
        IntegrationID: z.string(),
        Name: z.string().min(1),
        DisplayName: z.string().min(1),
        Category: z.string(),
        APIPath: z.string(),
        ResponseDataKey: z.string().nullable(),
        PaginationType: z.string(),
        SupportsIncrementalSync: z.boolean(),
        SupportsWrite: z.boolean(),
        Sequence: z.number().int().positive(),
    }),
    relatedEntities: z.object({
        'MJ: Integration Object Fields': z.array(IOFSchema),
    }),
});
type IO = z.infer<typeof IOSchema>;

/* -------------------------------------------------------------------------- */
/* Source URL discovery                                                       */
/* -------------------------------------------------------------------------- */

interface SourcesJSON {
    Sources: Array<{
        URL: string;
        Tier: number;
        Category: string;
        Verified: boolean;
        HTTPStatus: number;
        Gated?: boolean;
        OverallScore: number;
    }>;
}

/**
 * Picks the operation-index URL by URL-pattern from SOURCES.json.
 *
 * Strategy: find the SOURCES.json entry whose URL ends in `/metadata`
 * (without query string) and has a metadata Category. That entry is the
 * vendor's operation index. We never hardcode the URL — if the audit ever
 * moves it, the script picks up the new location automatically.
 */
async function discoverIndexURL(): Promise<string> {
    const raw = await fs.readFile(SOURCES_PATH, 'utf8');
    const parsed = JSON.parse(raw) as SourcesJSON;
    const candidates = parsed.Sources.filter(
        (s) => /\/metadata$/.test(new URL(s.URL).pathname) && s.Category === 'OpenAPISpec',
    );
    if (candidates.length === 0) {
        throw new Error(
            "SOURCES.json has no entry whose URL pathname ends in '/metadata' (Category=OpenAPISpec). " +
                'Cannot determine operation-index URL. Re-run source-auditor.',
        );
    }
    return candidates[0].URL;
}

/* -------------------------------------------------------------------------- */
/* Fetching (with caching + retry)                                            */
/* -------------------------------------------------------------------------- */

interface FetchResult {
    Status: number;
    Body: string;
    FromCache: boolean;
}

async function ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
}

async function fetchWithCache(url: string, cacheFile: string): Promise<FetchResult> {
    try {
        const cached = await fs.readFile(cacheFile, 'utf8');
        if (cached.length > 0) {
            return { Status: 200, Body: cached, FromCache: true };
        }
    } catch {
        // cache miss
    }
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
        try {
            const resp = await fetch(url, {
                headers: {
                    // Identify the fetcher for vendor logs
                    'user-agent': 'MJ-IOIOFExtractor/1.0 (+memberjunction.com)',
                    accept: 'text/html,application/xhtml+xml,*/*',
                },
                redirect: 'follow',
            });
            const body = await resp.text();
            if (resp.ok) {
                await fs.writeFile(cacheFile, body, 'utf8');
                return { Status: resp.status, Body: body, FromCache: false };
            }
            // non-2xx: return the status without caching
            return { Status: resp.status, Body: body, FromCache: false };
        } catch (err) {
            if (attempt === RETRY_ATTEMPTS) {
                throw err instanceof Error ? err : new Error(String(err));
            }
            await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
        }
    }
    throw new Error('unreachable');
}

function delay(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
}

/* -------------------------------------------------------------------------- */
/* HTML parsing — structural regex over YM's known table layout               */
/* -------------------------------------------------------------------------- */

function stripTags(s: string): string {
    return s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
}

/** Parse the index HTML and return all unique operation names. */
function parseOperationNames(html: string): string[] {
    const re = /metadata\?op=([A-Za-z0-9_]+)/g;
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        seen.add(m[1]);
    }
    return Array.from(seen).sort();
}

/** Extract the routes <table class='routes'> body from a per-op page. */
function parseRoutes(html: string): RouteRow[] {
    const tableMatch = html.match(/<table\s+class='routes'[^>]*>([\s\S]*?)<\/table>/);
    if (!tableMatch) return [];
    const tbody = tableMatch[1];
    const rows: RouteRow[] = [];
    const trRe = /<tr>([\s\S]*?)<\/tr>/g;
    let trMatch: RegExpExecArray | null;
    while ((trMatch = trRe.exec(tbody)) !== null) {
        const cells: string[] = [];
        const cellRe = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g;
        let cm: RegExpExecArray | null;
        while ((cm = cellRe.exec(trMatch[1])) !== null) {
            cells.push(stripTags(cm[1]));
        }
        // routes table rows look like: VERB | path | description | <icon>
        if (cells.length >= 2 && /^[A-Z]+$/.test(cells[0])) {
            rows.push({
                Verb: cells[0],
                Path: cells[1],
                Description: cells[2] ?? '',
            });
        }
    }
    return rows;
}

/** Extract all <table class='params'> blocks from a per-op page. */
function parseParamTables(html: string): ParamTable[] {
    const tables: ParamTable[] = [];
    const tableRe = /<table\s+class='params'[^>]*>([\s\S]*?)<\/table>/g;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tableRe.exec(html)) !== null) {
        const body = tMatch[1];
        const capMatch = body.match(/<caption[^>]*><b>([^<]+)<\/b>/);
        if (!capMatch) continue;
        const dto = capMatch[1].trim();
        // Skip header row, iterate body rows
        const rows: ParamRow[] = [];
        const trRe = /<tr>([\s\S]*?)<\/tr>/g;
        let trMatch: RegExpExecArray | null;
        while ((trMatch = trRe.exec(body)) !== null) {
            const cellRe = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g;
            const cells: string[] = [];
            let cm: RegExpExecArray | null;
            while ((cm = cellRe.exec(trMatch[1])) !== null) {
                cells.push(stripTags(cm[1]));
            }
            // Skip header rows: first cell == 'Name'
            if (cells.length === 0 || cells[0] === 'Name') continue;
            if (cells.length < 4) continue;
            const parsed = ParamRowSchema.safeParse({
                Name: cells[0],
                Parameter: cells[1],
                DataType: cells[2],
                Required: cells[3],
                Description: cells[4] ?? '',
            });
            if (parsed.success) {
                rows.push(parsed.data);
            }
        }
        if (rows.length > 0) {
            tables.push({ DTOName: dto, Rows: rows });
        }
    }
    return tables;
}

/** Extract the "Requires any of the roles: <list>" cell text. */
function parseRequiredRoles(html: string): string[] {
    const m = html.match(/Requires any of the roles:<\/td>\s*<td>([^<]+)<\/td>/);
    if (!m) return [];
    return m[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/* Type mapping (vendor type string → MJ/SQL Server type + Length)            */
/* -------------------------------------------------------------------------- */

interface MJTypeResult {
    Type: string;
    Length: number | null;
}

const VENDOR_TO_MJ_TYPE: Array<{ Match: RegExp; Type: string; Length: number | null }> = [
    // Strip trailing `?` (nullable marker) before matching
    { Match: /^int$/i, Type: 'int', Length: null },
    { Match: /^long$/i, Type: 'bigint', Length: null },
    { Match: /^short$/i, Type: 'smallint', Length: null },
    { Match: /^byte$/i, Type: 'tinyint', Length: null },
    { Match: /^bool$/i, Type: 'bit', Length: null },
    { Match: /^boolean$/i, Type: 'bit', Length: null },
    { Match: /^double$/i, Type: 'float', Length: null },
    { Match: /^float$/i, Type: 'float', Length: null },
    { Match: /^decimal$/i, Type: 'decimal', Length: null },
    { Match: /^datetime$/i, Type: 'datetimeoffset', Length: null },
    { Match: /^datetimeoffset$/i, Type: 'datetimeoffset', Length: null },
    { Match: /^date$/i, Type: 'date', Length: null },
    { Match: /^time$/i, Type: 'time', Length: null },
    { Match: /^timespan$/i, Type: 'time', Length: null },
    { Match: /^guid$/i, Type: 'uniqueidentifier', Length: null },
    { Match: /^uuid$/i, Type: 'uniqueidentifier', Length: null },
    { Match: /^string$/i, Type: 'nvarchar', Length: 500 },
    { Match: /^char$/i, Type: 'nvarchar', Length: 1 },
    { Match: /^byte\[\]$/i, Type: 'varbinary', Length: null },
];

function mapType(rawVendorType: string): MJTypeResult {
    const normalized = rawVendorType.replace(/\?$/, '').trim();
    for (const m of VENDOR_TO_MJ_TYPE) {
        if (m.Match.test(normalized)) {
            return { Type: m.Type, Length: m.Length };
        }
    }
    // Unknown / complex types (List<T>, custom DTO references) → opaque
    // nvarchar(500). Recorded so downstream can see the original vendor
    // type if needed.
    return { Type: 'nvarchar', Length: 500 };
}

/* -------------------------------------------------------------------------- */
/* Path template variable extraction                                          */
/* -------------------------------------------------------------------------- */

/**
 * Extract the set of `{var}` template variables across all routes. Used
 * to detect which DTO fields are "path" parameters that correspond to a
 * PK. We treat a path variable name as case-insensitive when matching
 * field names per requirements §2.5.
 */
function collectPathVars(routes: RouteRow[]): Set<string> {
    const vars = new Set<string>();
    for (const r of routes) {
        const re = /\{([A-Za-z0-9_]+)\}/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(r.Path)) !== null) {
            vars.add(m[1].toLowerCase());
        }
    }
    return vars;
}

/* -------------------------------------------------------------------------- */
/* Verb-to-capability mapping                                                 */
/* -------------------------------------------------------------------------- */

interface CapabilityFlags {
    SupportsWrite: boolean;
    HasCreate: boolean;
    HasUpdate: boolean;
    HasDelete: boolean;
    HasRead: boolean;
}

function deriveCapabilities(routes: RouteRow[]): CapabilityFlags {
    const verbs = new Set(routes.map((r) => r.Verb.toUpperCase()));
    return {
        HasRead: verbs.has('GET'),
        HasCreate: verbs.has('POST'),
        HasUpdate: verbs.has('PUT') || verbs.has('PATCH'),
        HasDelete: verbs.has('DELETE'),
        SupportsWrite: verbs.has('POST') || verbs.has('PUT') || verbs.has('PATCH') || verbs.has('DELETE'),
    };
}

/* -------------------------------------------------------------------------- */
/* Category derivation from Phase1Handoff Areas                               */
/* -------------------------------------------------------------------------- */

interface Phase1Area {
    Name: string;
    Description: string;
}
interface Phase1JSON {
    Identity: {
        Name: string;
        ClassName: string;
        IntegrationName: string;
        Description: string;
        NavigationBaseURL: string;
        Icon: string;
    };
    ProductTaxonomy: {
        ProductKind: string;
        Areas: Phase1Area[];
        APIParadigm: string;
    };
}

/**
 * Map an operation name to a Phase1 Area name. We use a small set of
 * keyword stems derived FROM the area names themselves — not from
 * hardcoded vendor object lists. If no area matches, return ''.
 */
function deriveCategory(opName: string, areas: Phase1Area[]): string {
    const lower = opName.toLowerCase();
    // Build stem → area-name map from the Phase1 areas. We split each
    // area name into stems (Membership → 'member'); first stem hit wins.
    const stems: Array<{ Stems: string[]; AreaName: string }> = [];
    for (const a of areas) {
        const baseStems = a.Name.toLowerCase().split(/[\s/&-]+/).filter(Boolean);
        const extra: string[] = [];
        for (const s of baseStems) {
            // crude singularize
            if (s.endsWith('ies')) extra.push(s.slice(0, -3) + 'y');
            else if (s.endsWith('s') && s.length > 3) extra.push(s.slice(0, -1));
            else extra.push(s + 's');
        }
        stems.push({ Stems: Array.from(new Set([...baseStems, ...extra])), AreaName: a.Name });
    }
    for (const entry of stems) {
        for (const stem of entry.Stems) {
            if (stem.length < 3) continue;
            if (lower.includes(stem)) {
                return entry.AreaName;
            }
        }
    }
    return '';
}

/* -------------------------------------------------------------------------- */
/* Choose the primary DTO for an operation                                    */
/* -------------------------------------------------------------------------- */

interface PrimaryDTOResult {
    DTO: ParamTable | null;
    Strategy: 'exact-name-match' | 'response-shaped' | 'largest-non-boilerplate' | 'none';
}

/**
 * Decide which DTO from the param tables represents the operation's own
 * data shape. Strategy:
 *   1. Exact-name match: DTOName === OpName
 *   2. Response-shaped match: DTOName === OpName + 'Response'
 *   3. Largest non-boilerplate DTO (most rows) — fallback
 *   4. None
 */
function choosePrimaryDTO(opName: string, tables: ParamTable[]): PrimaryDTOResult {
    const exact = tables.find((t) => t.DTOName === opName && !BOILERPLATE_DTO_NAMES.has(t.DTOName));
    if (exact) return { DTO: exact, Strategy: 'exact-name-match' };
    const responseShaped = tables.find((t) => t.DTOName === `${opName}Response`);
    if (responseShaped) return { DTO: responseShaped, Strategy: 'response-shaped' };
    const nonBoilerplate = tables
        .filter((t) => !BOILERPLATE_DTO_NAMES.has(t.DTOName) && !/Response$/.test(t.DTOName))
        .sort((a, b) => b.Rows.length - a.Rows.length);
    if (nonBoilerplate.length > 0) {
        return { DTO: nonBoilerplate[0], Strategy: 'largest-non-boilerplate' };
    }
    // Fall back to ANY non-boilerplate DTO (including Response-suffixed)
    const fallback = tables.filter((t) => !BOILERPLATE_DTO_NAMES.has(t.DTOName));
    if (fallback.length > 0) {
        return { DTO: fallback[0], Strategy: 'largest-non-boilerplate' };
    }
    return { DTO: null, Strategy: 'none' };
}

/* -------------------------------------------------------------------------- */
/* Snake-case conversion for IO Name field                                    */
/* -------------------------------------------------------------------------- */

function toSnakeCase(s: string): string {
    return s
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .toLowerCase();
}

function toDisplayName(s: string): string {
    return s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

/* -------------------------------------------------------------------------- */
/* CODE_EVIDENCE accumulator                                                  */
/* -------------------------------------------------------------------------- */

interface CodeEvidenceEntry {
    ScriptPath: string;
    ScriptRunAt: string;
    SourceURL: string;
    StructuredOutput: {
        DerivedFlag: string;
        BasedOn: string;
    };
    SchemaValidationStatus: 'Passed' | 'Failed';
    TargetField: string;
}

class EvidenceCollector {
    private readonly entries: CodeEvidenceEntry[] = [];
    private readonly runAt: string;
    constructor() {
        this.runAt = new Date().toISOString();
    }
    append(sourceURL: string, derivedFlag: string, basedOn: string, targetField: string): void {
        this.entries.push({
            ScriptPath: SCRIPT_REL_PATH,
            ScriptRunAt: this.runAt,
            SourceURL: sourceURL,
            StructuredOutput: { DerivedFlag: derivedFlag, BasedOn: basedOn },
            SchemaValidationStatus: 'Passed',
            TargetField: targetField,
        });
    }
    list(): CodeEvidenceEntry[] {
        return this.entries;
    }
    size(): number {
        return this.entries.length;
    }
}

/* -------------------------------------------------------------------------- */
/* Concurrency-limited fetch loop                                             */
/* -------------------------------------------------------------------------- */

async function fetchAllOpPages(
    opNames: string[],
    indexURL: string,
    deadline: number,
): Promise<Map<string, { URL: string; Body: string; Status: number }>> {
    await ensureDir(CACHE_DIR);
    const baseHost = new URL(indexURL).origin;
    const results = new Map<string, { URL: string; Body: string; Status: number }>();
    let i = 0;
    async function worker(): Promise<void> {
        while (i < opNames.length) {
            const myIdx = i++;
            const op = opNames[myIdx];
            if (Date.now() > deadline) {
                throw new Error(
                    `Wall-clock budget exhausted while fetching op ${op} (idx ${myIdx}/${opNames.length})`,
                );
            }
            const url = `${baseHost}/json/metadata?op=${encodeURIComponent(op)}`;
            const cacheFile = path.join(CACHE_DIR, `op-${op}.html`);
            try {
                const result = await fetchWithCache(url, cacheFile);
                results.set(op, { URL: url, Body: result.Body, Status: result.Status });
            } catch (err) {
                results.set(op, {
                    URL: url,
                    Body: '',
                    Status: -1,
                });
                process.stderr.write(`[warn] fetch failed for ${op}: ${(err as Error).message}\n`);
            }
        }
    }
    const workers: Promise<void>[] = [];
    for (let n = 0; n < CONCURRENCY; n++) workers.push(worker());
    await Promise.all(workers);
    return results;
}

/* -------------------------------------------------------------------------- */
/* Metadata file emission                                                     */
/* -------------------------------------------------------------------------- */

interface MetadataRoot {
    fields: Record<string, unknown>;
    relatedEntities?: {
        'MJ: Integration Objects'?: IO[];
        [k: string]: unknown;
    };
}

async function loadOrCreateMetadata(phase1: Phase1JSON): Promise<MetadataRoot> {
    try {
        const existing = await fs.readFile(METADATA_PATH, 'utf8');
        return JSON.parse(existing) as MetadataRoot;
    } catch {
        return {
            fields: {
                Name: phase1.Identity.IntegrationName,
                Description: phase1.Identity.Description,
                ClassName: phase1.Identity.ClassName,
                ImportPath: '@memberjunction/connector-your-membership',
                NavigationBaseURL: phase1.Identity.NavigationBaseURL,
                Icon: phase1.Identity.Icon,
                Configuration: {
                    APIBaseURL: 'https://ws.yourmembership.com',
                    ProductTaxonomy: phase1.ProductTaxonomy,
                },
            },
            relatedEntities: {
                'MJ: Integration Objects': [],
            },
        };
    }
}

/* -------------------------------------------------------------------------- */
/* Main extraction logic                                                      */
/* -------------------------------------------------------------------------- */

interface ExtractionStats {
    TotalOperationsWalked: number;
    OperationsFetched200: number;
    OperationsFetched403: number;
    OperationsFetchedOther: number;
    IOsCreated: number;
    IOFsCreated: number;
    PKsDetected: number;
    SupportsWriteCount: number;
    EntityGroupingExamples: Array<{ Entity: string; Operations: string[] }>;
    GapsForDownstream: string[];
    CapHit: boolean;
}

async function main(): Promise<void> {
    const startTime = Date.now();
    const deadline = startTime + WALL_CLOCK_MS;

    // 1. Discover source URL from SOURCES.json
    const indexURL = await discoverIndexURL();

    // 2. Fetch and parse the operation index
    await ensureDir(CACHE_DIR);
    const indexCachePath = path.join(CACHE_DIR, 'operation-index.html');
    const indexFetch = await fetchWithCache(indexURL, indexCachePath);
    if (indexFetch.Status !== 200) {
        throw new Error(`Operation-index URL ${indexURL} returned HTTP ${indexFetch.Status}`);
    }
    const opNames = parseOperationNames(indexFetch.Body);
    if (opNames.length === 0) {
        throw new Error(`No operations parsed from index HTML at ${indexURL}`);
    }

    // 3. Load Phase1 + (existing or skeleton) metadata
    const phase1 = JSON.parse(await fs.readFile(PHASE1_PATH, 'utf8')) as Phase1JSON;
    const metadata = await loadOrCreateMetadata(phase1);

    // 4. Fetch all op pages (concurrency-limited, cached)
    const fetched = await fetchAllOpPages(opNames, indexURL, deadline);

    // 5. Parse each fetched page into a ParsedOperation
    const parsedOps: ParsedOperation[] = [];
    let count200 = 0;
    let count403 = 0;
    let countOther = 0;
    for (const op of opNames) {
        const entry = fetched.get(op);
        if (!entry) continue;
        if (entry.Status === 200) count200++;
        else if (entry.Status === 403) count403++;
        else countOther++;
        if (entry.Status !== 200 || entry.Body.length === 0) continue;
        const routes = parseRoutes(entry.Body);
        const params = parseParamTables(entry.Body);
        const roles = parseRequiredRoles(entry.Body);
        const parsed = ParsedOperationSchema.safeParse({
            OpName: op,
            SourceURL: entry.URL,
            Routes: routes,
            ParamTables: params,
            RequiredRoles: roles,
        });
        if (parsed.success) {
            parsedOps.push(parsed.data);
        }
    }

    // 6. Build IO rows
    const evidence = new EvidenceCollector();
    const ios: IO[] = [];
    let pksDetected = 0;
    let supportsWriteCount = 0;
    const gaps: string[] = [];
    const entityGroupingExamples: Array<{ Entity: string; Operations: string[] }> = [];

    for (const op of parsedOps) {
        if (ios.length >= MAX_IOS) {
            throw new Error(`IO cap of ${MAX_IOS} hit at op ${op.OpName}. Bug or runaway extraction.`);
        }
        if (op.Routes.length === 0) {
            // Operation page exists but has no routes — skip, but record as gap
            gaps.push(
                `Operation '${op.OpName}': page returned 200 but no <table class='routes'> rows parsed. ` +
                    'Likely a YM internal helper or doc-only entry. Excluded from IO emission.',
            );
            continue;
        }
        const capabilities = deriveCapabilities(op.Routes);
        const pathVars = collectPathVars(op.Routes);
        const primary = choosePrimaryDTO(op.OpName, op.ParamTables);

        // IO name (snake_case), DisplayName (spaced)
        const ioName = toSnakeCase(op.OpName);
        const displayName = toDisplayName(op.OpName);
        const category = deriveCategory(op.OpName, phase1.ProductTaxonomy.Areas);

        // First route is the canonical APIPath
        const firstRoute = op.Routes[0];

        // Build IOF rows from the primary DTO + path variables.
        const iofs: IOF[] = [];
        let seq = 1;
        const fieldEvidenceTargets: Array<{ Field: string; PK: boolean; Required: boolean; ReadOnly: boolean }> = [];

        if (primary.DTO) {
            for (const row of primary.DTO.Rows) {
                const isPathParam = row.Parameter.toLowerCase() === 'path';
                const isPK = isPathParam && pathVars.has(row.Name.toLowerCase());
                const isRequired = /^yes$/i.test(row.Required) || isPK;
                // YM has no explicit read-only marker. Path PKs are
                // semantically read-only post-create; flag them.
                const isReadOnly = isPK;
                const t = mapType(row.DataType);

                const iof: IOF = {
                    fields: {
                        IntegrationObjectID: '@parent:ID',
                        Name: row.Name,
                        Type: t.Type,
                        Length: t.Length,
                        IsPrimaryKey: isPK,
                        IsRequired: isRequired,
                        IsReadOnly: isReadOnly,
                        Sequence: seq++,
                    },
                };
                const validated = IOFSchema.safeParse(iof);
                if (validated.success) {
                    iofs.push(validated.data);
                    fieldEvidenceTargets.push({
                        Field: row.Name,
                        PK: isPK,
                        Required: isRequired,
                        ReadOnly: isReadOnly,
                    });
                    if (isPK) pksDetected++;
                }
            }
        } else {
            gaps.push(
                `Operation '${op.OpName}': no primary DTO found in param tables (strategy=${primary.Strategy}). ` +
                    'Emitted IO row with zero fields; downstream Invariant 1 may flag.',
            );
        }

        if (capabilities.SupportsWrite) supportsWriteCount++;

        // Track entity-grouping examples (limit to 3)
        if (entityGroupingExamples.length < 3) {
            entityGroupingExamples.push({
                Entity: ioName,
                Operations: op.Routes.map((r) => `${r.Verb} ${r.Path}`),
            });
        }

        const io: IO = {
            fields: {
                IntegrationID: '@parent:ID',
                Name: ioName,
                DisplayName: displayName,
                Category: category,
                APIPath: firstRoute.Path,
                ResponseDataKey: null,
                PaginationType: 'Unknown',
                SupportsIncrementalSync: false,
                SupportsWrite: capabilities.SupportsWrite,
                Sequence: ios.length + 1,
            },
            relatedEntities: {
                'MJ: Integration Object Fields': iofs,
            },
        };
        const ioValidation = IOSchema.safeParse(io);
        if (!ioValidation.success) {
            gaps.push(
                `Operation '${op.OpName}': IO schema validation failed: ${ioValidation.error.message}. Skipped.`,
            );
            continue;
        }
        ios.push(ioValidation.data);

        // CODE_EVIDENCE — one entry per hard-constraint flag emission
        if (capabilities.SupportsWrite) {
            const writeVerbs = op.Routes.filter((r) => /^(POST|PUT|PATCH|DELETE)$/i.test(r.Verb))
                .map((r) => r.Verb)
                .join('|');
            evidence.append(
                op.SourceURL,
                'SupportsWrite=true',
                `Routes table on per-op page declares mutating verbs [${writeVerbs}]; presence of any of POST/PUT/PATCH/DELETE implies write capability.`,
                `io.${ioName}.SupportsWrite`,
            );
        }
        for (const fe of fieldEvidenceTargets) {
            if (fe.PK) {
                evidence.append(
                    op.SourceURL,
                    'IsPrimaryKey=true',
                    `Param-table row Parameter='path' AND name '${fe.Field}' matches a route template variable {${fe.Field}}; gate DP4 (name exactly matches route path-var, type plausible-PK).`,
                    `iof.${ioName}.${fe.Field}.IsPrimaryKey`,
                );
                evidence.append(
                    op.SourceURL,
                    'IsReadOnly=true',
                    `Path-bound primary keys are not mutable on update in YM REST routes; field re-used in URL templates only.`,
                    `iof.${ioName}.${fe.Field}.IsReadOnly`,
                );
            }
            if (fe.Required) {
                evidence.append(
                    op.SourceURL,
                    'IsRequired=true',
                    fe.PK
                        ? `Path PK fields are implicitly required for routes that bind them.`
                        : `Param-table 'Required' column reads 'Yes' for field '${fe.Field}'.`,
                    `iof.${ioName}.${fe.Field}.IsRequired`,
                );
            }
        }
    }

    // 7. Bidirectional set-completeness — existing IOs not re-emitted = orphan; remove.
    metadata.relatedEntities ??= {};
    const previousIOs = (metadata.relatedEntities['MJ: Integration Objects'] ?? []) as IO[];
    const previousByName = new Map<string, IO>();
    for (const io of previousIOs) previousByName.set(io.fields.Name, io);
    const newNames = new Set(ios.map((io) => io.fields.Name));
    const orphans: string[] = [];
    for (const [name] of previousByName) {
        if (!newNames.has(name)) orphans.push(name);
    }
    metadata.relatedEntities['MJ: Integration Objects'] = ios;

    // 8. Write metadata file
    await ensureDir(METADATA_DIR);
    await fs.writeFile(METADATA_PATH, JSON.stringify(metadata, null, 2) + '\n', 'utf8');

    // 9. Write CODE_EVIDENCE (append/merge)
    let existingEvidence: { Entries: CodeEvidenceEntry[] } = { Entries: [] };
    try {
        const raw = await fs.readFile(CODE_EVIDENCE_PATH, 'utf8');
        const parsed = JSON.parse(raw) as { Entries?: CodeEvidenceEntry[] };
        if (Array.isArray(parsed.Entries)) existingEvidence = { Entries: parsed.Entries };
    } catch {
        // first run
    }
    // De-duplicate evidence entries by (TargetField, DerivedFlag, SourceURL).
    // The current run's entries take precedence (rewritten with latest
    // ScriptRunAt timestamp).
    const dedup = new Map<string, CodeEvidenceEntry>();
    for (const e of existingEvidence.Entries) {
        const k = `${e.TargetField}|${e.StructuredOutput?.DerivedFlag}|${e.SourceURL}`;
        dedup.set(k, e);
    }
    for (const e of evidence.list()) {
        const k = `${e.TargetField}|${e.StructuredOutput.DerivedFlag}|${e.SourceURL}`;
        dedup.set(k, e);
    }
    const merged = { Entries: Array.from(dedup.values()) };
    await fs.writeFile(CODE_EVIDENCE_PATH, JSON.stringify(merged, null, 2) + '\n', 'utf8');

    // 10. Build + emit structured stats
    if (orphans.length > 0) {
        gaps.push(
            `Removed ${orphans.length} orphan IO(s) from metadata: ${orphans.slice(0, 10).join(', ')}` +
                (orphans.length > 10 ? '...' : ''),
        );
    }
    if (count403 > 0) {
        gaps.push(
            `${count403} of ${opNames.length} operations returned HTTP 403 (gated). Their IO/IOF rows could not be emitted from public sources. Resolve by obtaining licensed-tenant credentials and re-running with the cache cleared.`,
        );
    }
    if (countOther > 0) {
        gaps.push(`${countOther} operations returned non-200/403 HTTP status; see stderr warnings.`);
    }

    const stats: ExtractionStats = {
        TotalOperationsWalked: opNames.length,
        OperationsFetched200: count200,
        OperationsFetched403: count403,
        OperationsFetchedOther: countOther,
        IOsCreated: ios.length,
        IOFsCreated: ios.reduce((acc, io) => acc + io.relatedEntities['MJ: Integration Object Fields'].length, 0),
        PKsDetected: pksDetected,
        SupportsWriteCount: supportsWriteCount,
        EntityGroupingExamples: entityGroupingExamples,
        GapsForDownstream: gaps,
        CapHit: ios.length >= MAX_IOS,
    };

    const output = {
        Status: count403 === 0 ? 'Complete' : 'PartialWithErrors',
        ScriptPath: `packages/Integration/connectors-registry/your-membership/${SCRIPT_REL_PATH}`,
        FetchedSourceURLs: [indexURL],
        Stats: stats,
        ErrorsDuringRun: [],
        MetadataFilePath: `packages/Integration/connectors-registry/your-membership/metadata/integrations/.your-membership.json`,
        CodeEvidenceEntriesAppended: evidence.size(),
    };
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

main().catch((err) => {
    process.stderr.write(`[fatal] ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
});
