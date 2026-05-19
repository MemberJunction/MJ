#!/usr/bin/env tsx
/**
 * extract-io-iof.ts
 *
 * Code-first IO/IOF extractor for YourMembership.
 *
 * Per the IOIOFExtractor role file: this script is the emission. Catalog data
 * never enters the agent's context — it flows through the script. The agent
 * sees structured stats on stdout; the IO/IOF rows are written into the
 * connector's metadata file by this script.
 *
 * Source-tier discipline:
 *   1. SOURCES.json declares the in-tree YourMembership connector
 *      (file:///.../packages/Integration/connectors/src/YourMembershipConnector.ts)
 *      as the Tier-2 VendorValidatedImplementation. That file holds the
 *      vendor-validated catalog (YM_ACTION_OBJECTS) of ~228 API objects with
 *      per-object field arrays.
 *   2. Vendor's Swagger UI + /metadata endpoint return 403 to anonymous
 *      callers (need X-SS-ID session tokens). We treat the in-tree file as
 *      the source of truth, parse it as code at run time, and emit rows.
 *   3. We do NOT inline the catalog as data in this script. Only structure
 *      (TypeScript AST walking + categorization rules) lives here.
 *
 * CODE_EVIDENCE granularity (per role file directive — updated 2026-05-19):
 *   - Every hard-constraint flag emission gets its OWN entry in CODE_EVIDENCE.json.
 *   - TargetField is the per-(IO|IOF, field-name) tuple, e.g.
 *       `iof.Members.ProfileID.IsPrimaryKey`
 *       `iof.Members.ProfileID.IsRequired`
 *       `io.Members.SupportsWrite`
 *   - Each entry's StructuredOutput.BasedOn cites the specific structural
 *     signal in the in-tree connector that established the flag (e.g.
 *     "YM_ACTION_OBJECTS[Members].Fields[ProfileID].IsPrimaryKey === true").
 *   - Re-runs are idempotent: prior entries from THIS script path are purged
 *     before re-emission, so CODE_EVIDENCE.json never duplicates.
 *
 * The script:
 *   - Reads SOURCES.json (NOT hardcoded URLs).
 *   - file://-fetches the in-tree YourMembershipConnector.ts (uses cached
 *     snapshot if already on disk).
 *   - Parses YM_ACTION_OBJECTS, YM_YMC_ENDPOINTS, YM_PARENT_SCOPED,
 *     YM_SERVER_FILTER_PARAMS, YM_CLIENT_WATERMARK_FIELDS via the TypeScript
 *     compiler API (real AST, not regex).
 *   - Validates parsed shapes via Zod.
 *   - Categorizes each IO by the comment marker the object sits under in the
 *     source file (Membership / Events / Finance / Groups / Marketing /
 *     Engagement / Careers / Reference / Other / etc.) and maps to the
 *     ProductTaxonomy area names from Phase1Handoff.
 *   - Detects PK per-IO from the field-level IsPrimaryKey flag.
 *   - Detects SupportsIncrementalSync from YM_SERVER_FILTER_PARAMS +
 *     YM_CLIENT_WATERMARK_FIELDS membership.
 *   - Resolves APIPath using YM_YMC_ENDPOINTS (/Ymc/) vs /Ams/ + parent-scope
 *     templates where applicable.
 *   - Resolves PaginationType from the integration root's Pagination block.
 *   - Maps in-tree field Type strings to SQL Server type strings the way the
 *     existing /metadata/integrations/.your-membership.json (canonical
 *     example) does (number→int/decimal heuristic; string→nvarchar with Length).
 *   - Merges emitted rows into metadata/integrations/.your-membership.json
 *     under fields.relatedEntities['MJ: Integration Objects'] with
 *     upsert-by-name semantics. Each IO gets
 *     relatedEntities['MJ: Integration Object Fields'].
 *   - Caps IO at 1000 per requirements.
 *   - Bounded wall-clock (10 min).
 *
 * Stdout: structured stats only. Never the catalog itself.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────
// Paths + sentinels
// ─────────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONNECTOR_DIR = resolve(__dirname, '..');
const SOURCES_PATH = resolve(CONNECTOR_DIR, 'SOURCES.json');
const PHASE1_PATH = resolve(CONNECTOR_DIR, 'Phase1Handoff.json');
const METADATA_PATH = resolve(CONNECTOR_DIR, 'metadata', 'integrations', '.your-membership.json');
const CACHE_DIR = resolve(CONNECTOR_DIR, 'cache');
const CACHE_SNAPSHOT_PATH = resolve(CACHE_DIR, 'YourMembershipConnector.snapshot.ts');
const CODE_EVIDENCE_PATH = resolve(CONNECTOR_DIR, 'CODE_EVIDENCE.json');

const SCRIPT_REL_PATH =
    'packages/Integration/connectors-registry/your-membership/scripts/extract-io-iof.ts';

const IO_CAP = 1000;
const WALL_CLOCK_MS = 10 * 60 * 1000;

const START_AT = Date.now();
const SCRIPT_RUN_AT_ISO = new Date(START_AT).toISOString();

// ─────────────────────────────────────────────────────────────────────────
// Zod schemas — bound the shape we accept from the parsed source.
// Anything that doesn't validate is surfaced as an error, NOT silently
// passed through.
// ─────────────────────────────────────────────────────────────────────────

const FieldSchema = z.object({
    Name: z.string().min(1),
    DisplayName: z.string().min(1),
    Type: z.string().min(1),
    IsRequired: z.boolean(),
    IsReadOnly: z.boolean(),
    IsPrimaryKey: z.boolean(),
    Description: z.string().optional().default(''),
});
type ParsedField = z.infer<typeof FieldSchema>;

const ObjectSchema = z.object({
    Name: z.string().min(1),
    DisplayName: z.string().min(1),
    Description: z.string().optional().default(''),
    SupportsWrite: z.boolean().optional().default(false),
    Fields: z.array(FieldSchema).min(1),
});
type ParsedObject = z.infer<typeof ObjectSchema>;

const SourcesFileSchema = z.object({
    Vendor: z.string(),
    Sources: z.array(
        z.object({
            URL: z.string(),
            Tier: z.number(),
            Category: z.string(),
        })
    ),
});

// ─────────────────────────────────────────────────────────────────────────
// SOURCES.json — pick the in-tree connector URL (Tier-2
// VendorValidatedImplementation) as our extraction target.
// ─────────────────────────────────────────────────────────────────────────

function pickInTreeConnectorURL(): string {
    const raw = JSON.parse(readFileSync(SOURCES_PATH, 'utf8'));
    const parsed = SourcesFileSchema.parse(raw);
    const inTree = parsed.Sources.find(
        s => s.Category === 'VendorValidatedImplementation' && s.URL.startsWith('file://')
    );
    if (!inTree) {
        throw new Error(
            'SOURCES.json has no VendorValidatedImplementation entry with a file:// URL — ' +
                'cannot proceed without the in-tree connector as the extraction target. ' +
                'YourMembership Swagger UI + /metadata endpoint require X-SS-ID auth; ' +
                'no anonymous machine-readable source exists.'
        );
    }
    return inTree.URL;
}

// ─────────────────────────────────────────────────────────────────────────
// Fetch the source via file:// URL → cache → parse. Body never enters stdout.
// Per role file: don't re-parse the in-tree file from scratch if cache exists.
// ─────────────────────────────────────────────────────────────────────────

async function fetchSource(url: string): Promise<{ text: string; cachePath: string; usedCache: boolean }> {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    if (existsSync(CACHE_SNAPSHOT_PATH)) {
        const text = readFileSync(CACHE_SNAPSHOT_PATH, 'utf8');
        return { text, cachePath: CACHE_SNAPSHOT_PATH, usedCache: true };
    }
    if (!url.startsWith('file://')) {
        throw new Error(
            `Unsupported source URL scheme for code-first extraction: ${url}. ` +
                `YM's HTTP /metadata + /swagger-ui/ are gated behind X-SS-ID; ` +
                `add an authenticated fetcher branch here to use them.`
        );
    }
    const path = fileURLToPath(url);
    const text = readFileSync(path, 'utf8');
    writeFileSync(CACHE_SNAPSHOT_PATH, text, 'utf8');
    return { text, cachePath: CACHE_SNAPSHOT_PATH, usedCache: false };
}

// ─────────────────────────────────────────────────────────────────────────
// AST parsing: walk the in-tree connector file and extract the constants
// we care about. We parse REAL TypeScript via the compiler API — no regex
// pattern-matching of expected shapes.
// ─────────────────────────────────────────────────────────────────────────

type ConstSet = Set<string>;
type ConstStringMap = Record<string, string>;
type ParsedConstants = {
    Objects: ParsedObject[];
    /** Comment-marker category each object sits under, in source order. */
    ObjectCategoryMarkers: string[];
    YmcEndpoints: ConstSet;
    /** Parent-scoped → path template strings (e.g. 'Member/{parentId}/MemberProfile'). */
    ParentScopedTemplates: ConstStringMap;
    /** server-side filter param mapping (lowercase object name → param name). */
    ServerFilterParams: ConstStringMap;
    /** client-side watermark mapping (lowercase object name → field name). */
    ClientWatermarkFields: ConstStringMap;
};

function evalLiteralExpression(node: ts.Expression): unknown {
    switch (node.kind) {
        case ts.SyntaxKind.StringLiteral:
        case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
            return (node as ts.StringLiteralLike).text;
        case ts.SyntaxKind.NumericLiteral:
            return Number((node as ts.NumericLiteral).text);
        case ts.SyntaxKind.TrueKeyword:
            return true;
        case ts.SyntaxKind.FalseKeyword:
            return false;
        case ts.SyntaxKind.NullKeyword:
            return null;
        case ts.SyntaxKind.PrefixUnaryExpression: {
            const u = node as ts.PrefixUnaryExpression;
            const operand = evalLiteralExpression(u.operand);
            if (u.operator === ts.SyntaxKind.MinusToken && typeof operand === 'number') {
                return -operand;
            }
            return undefined;
        }
        case ts.SyntaxKind.ObjectLiteralExpression: {
            const obj: Record<string, unknown> = {};
            for (const prop of (node as ts.ObjectLiteralExpression).properties) {
                if (!ts.isPropertyAssignment(prop)) continue;
                const name = ts.isIdentifier(prop.name) || ts.isStringLiteralLike(prop.name)
                    ? prop.name.text
                    : null;
                if (!name) continue;
                obj[name] = evalLiteralExpression(prop.initializer);
            }
            return obj;
        }
        case ts.SyntaxKind.ArrayLiteralExpression: {
            return (node as ts.ArrayLiteralExpression).elements.map(e => evalLiteralExpression(e));
        }
        default:
            return undefined;
    }
}

function extractConstants(sourceText: string): ParsedConstants {
    const sourceFile = ts.createSourceFile(
        'YourMembershipConnector.ts',
        sourceText,
        ts.ScriptTarget.Latest,
        true
    );

    let objectsArray: ts.ArrayLiteralExpression | null = null;
    let ymcSetExpr: ts.NewExpression | ts.CallExpression | null = null;
    let parentScopedObj: ts.ObjectLiteralExpression | null = null;
    let serverFilterObj: ts.ObjectLiteralExpression | null = null;
    let clientWatermarkObj: ts.ObjectLiteralExpression | null = null;

    for (const stmt of sourceFile.statements) {
        if (!ts.isVariableStatement(stmt)) continue;
        for (const decl of stmt.declarationList.declarations) {
            if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
            const name = decl.name.text;
            if (name === 'YM_ACTION_OBJECTS' && ts.isArrayLiteralExpression(decl.initializer)) {
                objectsArray = decl.initializer;
            } else if (name === 'YM_YMC_ENDPOINTS' && ts.isNewExpression(decl.initializer)) {
                ymcSetExpr = decl.initializer;
            } else if (name === 'YM_PARENT_SCOPED' && ts.isObjectLiteralExpression(decl.initializer)) {
                parentScopedObj = decl.initializer;
            } else if (name === 'YM_SERVER_FILTER_PARAMS' && ts.isObjectLiteralExpression(decl.initializer)) {
                serverFilterObj = decl.initializer;
            } else if (name === 'YM_CLIENT_WATERMARK_FIELDS' && ts.isObjectLiteralExpression(decl.initializer)) {
                clientWatermarkObj = decl.initializer;
            }
        }
    }

    if (!objectsArray) {
        throw new Error('Could not locate YM_ACTION_OBJECTS array in the in-tree connector source.');
    }

    // Walk the array of objects + capture the comment-marker each object sits under.
    const objects: ParsedObject[] = [];
    const categoryMarkers: string[] = [];
    let currentCategoryMarker = 'Uncategorized';

    for (const el of objectsArray.elements) {
        // Find any preceding category-marker comment between previous element and this one.
        const ranges = ts.getLeadingCommentRanges(sourceText, el.pos) ?? [];
        for (const r of ranges) {
            const commentText = sourceText.slice(r.pos, r.end);
            // Pattern: "// ── Category ──" — we capture the inner label.
            const match = commentText.match(/\/\/\s*[─—\-]+\s*([A-Za-z][A-Za-z &\/\-]+?)\s*[─—\-]+/);
            if (match) {
                currentCategoryMarker = match[1].trim();
            } else if (/Objects present in metadata but not previously listed/i.test(commentText)) {
                currentCategoryMarker = 'Other (Late-added DB entity stubs)';
            } else if (/Additional stubs from DB entity maps/i.test(commentText)) {
                currentCategoryMarker = 'Other (Action/Write endpoints)';
            }
        }
        if (!ts.isObjectLiteralExpression(el)) continue;
        const raw = evalLiteralExpression(el);
        if (!raw || typeof raw !== 'object') continue;
        const validated = ObjectSchema.safeParse(raw);
        if (!validated.success) {
            // Surface as warning on stderr; do NOT emit the row.
            process.stderr.write(
                `[extract-io-iof] Skipping invalid object near pos ${el.pos}: ${validated.error.message}\n`
            );
            continue;
        }
        objects.push(validated.data);
        categoryMarkers.push(currentCategoryMarker);
    }

    // Parse Set<string> literal: new Set([...])
    const ymcEndpoints: ConstSet = new Set();
    if (ymcSetExpr && ts.isNewExpression(ymcSetExpr) && ymcSetExpr.arguments?.length) {
        const arg = ymcSetExpr.arguments[0];
        if (ts.isArrayLiteralExpression(arg)) {
            for (const e of arg.elements) {
                const v = evalLiteralExpression(e);
                if (typeof v === 'string') ymcEndpoints.add(v.toLowerCase());
            }
        }
    }

    function flattenObjectLiteralToStringMap(obj: ts.ObjectLiteralExpression | null): ConstStringMap {
        const out: ConstStringMap = {};
        if (!obj) return out;
        for (const prop of obj.properties) {
            if (!ts.isPropertyAssignment(prop)) continue;
            const key = ts.isStringLiteralLike(prop.name)
                ? prop.name.text
                : ts.isIdentifier(prop.name)
                ? prop.name.text
                : null;
            if (!key) continue;
            const val = evalLiteralExpression(prop.initializer);
            if (typeof val === 'string') {
                out[key.toLowerCase()] = val;
            } else if (val && typeof val === 'object' && !Array.isArray(val)) {
                // YM_PARENT_SCOPED entries are objects with pathTemplate inside.
                const tpl = (val as Record<string, unknown>).pathTemplate;
                if (typeof tpl === 'string') out[key.toLowerCase()] = tpl;
            } else if (val && typeof val === 'object') {
                // YM_CLIENT_WATERMARK_FIELDS has { field, strategy } shape — record the field name.
                const f = (val as Record<string, unknown>).field;
                if (typeof f === 'string') out[key.toLowerCase()] = f;
            }
        }
        return out;
    }

    return {
        Objects: objects,
        ObjectCategoryMarkers: categoryMarkers,
        YmcEndpoints: ymcEndpoints,
        ParentScopedTemplates: flattenObjectLiteralToStringMap(parentScopedObj),
        ServerFilterParams: flattenObjectLiteralToStringMap(serverFilterObj),
        ClientWatermarkFields: flattenObjectLiteralToStringMap(clientWatermarkObj),
    };
}

// ─────────────────────────────────────────────────────────────────────────
// Category resolution: source-comment marker → ProductTaxonomy area name.
// ─────────────────────────────────────────────────────────────────────────

const CATEGORY_MARKER_TO_AREA: Record<string, string> = {
    Membership: 'Members',
    Members: 'Members',
    Events: 'Events',
    Finance: 'Finance & Commerce',
    'Finance & Commerce': 'Finance & Commerce',
    Groups: 'Groups',
    Certifications: 'Members',
    Products: 'Finance & Commerce',
    Marketing: 'Communications & Campaigns',
    'Communications & Campaigns': 'Communications & Campaigns',
    Engagement: 'Content & Engagement',
    'Content & Engagement': 'Content & Engagement',
    Reference: 'Reference',
    Careers: 'Career Center',
    'Career Center': 'Career Center',
    Other: 'Other',
    'Other (Late-added DB entity stubs)': 'Other',
    'Other (Action/Write endpoints)': 'Other',
    Uncategorized: 'Other',
};

// Late-added objects — comment marker is generic; assign by lexical name heuristics
// keyed off the eight ProductTaxonomy areas. Note: this is NOT regex matching of
// expected vendor shapes (the YM PK convention warning) — it's name-to-area routing
// for taxonomy completeness when the source's category comment is generic.
function refineAreaForOther(name: string, fallback: string): string {
    const n = name.toLowerCase();
    // Career Center routing — anything that goes to /Ymc/ is Career Center area
    // regardless of source-comment placement.
    if (/job|career|recruit|candidate|saved.?job|pinpoint|location/.test(n)) return 'Career Center';
    if (/event|registration|attendee|ticket|session|webinar|virtual|ceu/.test(n)) return 'Events';
    if (/donation|fundrais|contributor|campaign.*emaillist|topcontrib/.test(n)) return 'Donations & Fundraising';
    if (/campaign|sms|notif|message|email|trending.?post|informz/.test(n)) return 'Communications & Campaigns';
    if (/invoice|order|gl.?code|finance|batch|dues|store|product|tax|payment|memberprice|promo|store.?product/.test(n)) return 'Finance & Commerce';
    if (/member|profile|people|connection|favorite|memberpulse|membersince|memberreferral|memberpassword|membership/.test(n)) return 'Members';
    if (/group|committee|chapter|section|membergroup/.test(n)) return 'Groups';
    if (/photo|media|gallery|wall|sponsor|content|page|markup|brand|css|template|engage|feed|push|rss|help|topic/.test(n)) return 'Content & Engagement';
    return fallback;
}

// ─────────────────────────────────────────────────────────────────────────
// Type mapping — in-tree TS string → SQL Server type used by metadata files.
// ─────────────────────────────────────────────────────────────────────────

type EmittedFieldType = { Type: string; Length: number | null };

function mapType(inTreeType: string, fieldName: string): EmittedFieldType {
    const t = (inTreeType ?? '').toLowerCase().trim();
    const n = (fieldName ?? '').toLowerCase();
    // Direct equivalences
    if (t === 'boolean' || t === 'bool') return { Type: 'bit', Length: null };
    if (t === 'datetime' || t === 'date' || t === 'datetimeoffset') return { Type: 'datetime', Length: null };
    if (t === 'number' || t === 'integer' || t === 'int' || t === 'long') {
        // Heuristic for decimal-y field names (amounts) so emitted Type tracks
        // semantics where the in-tree connector uses 'number' for both.
        if (/amount|price|total|tax|fee|cost|discount|rate|balance|due|paid|cents|usd|earned/.test(n)) {
            return { Type: 'decimal', Length: null };
        }
        return { Type: 'int', Length: null };
    }
    if (t === 'decimal' || t === 'currency' || t === 'money' || t === 'float' || t === 'double') {
        return { Type: 'decimal', Length: null };
    }
    if (t === 'string' || t === '' || t === 'text') {
        // Length default per the canonical metadata file pattern.
        // Long-form fields get larger length.
        if (/description|notes|body|content|html|message|comment|bio|summary|biography/.test(n)) {
            return { Type: 'nvarchar', Length: 4000 };
        }
        if (/url|email|address|profile.?id$/.test(n)) {
            return { Type: 'nvarchar', Length: 500 };
        }
        return { Type: 'nvarchar', Length: 200 };
    }
    // Unknown — preserve original lowercase as best-effort.
    return { Type: t, Length: null };
}

// ─────────────────────────────────────────────────────────────────────────
// APIPath resolution.
// ─────────────────────────────────────────────────────────────────────────

function resolveAPIPath(name: string, parentScoped: ConstStringMap, ymc: ConstSet): string {
    const key = name.toLowerCase();
    if (parentScoped[key]) {
        // Parent-scoped path templates are relative — they live under /Ams/{ClientID}/
        // (or /Ymc/{ClientID}/ for the YM_YMC_ENDPOINTS subset).
        return parentScoped[key];
    }
    // Default: endpoint name = object name verbatim.
    return name;
}

function resolveNamespace(name: string, ymc: ConstSet): 'Ams' | 'Ymc' {
    return ymc.has(name.toLowerCase()) ? 'Ymc' : 'Ams';
}

// ─────────────────────────────────────────────────────────────────────────
// PK detection — first IsPrimaryKey:true field wins per object.
// Self-reported per requirements §5.1 (the in-tree connector itself functions
// as DP1-equivalent: explicit IsPrimaryKey flag in the vendor-validated source).
// ─────────────────────────────────────────────────────────────────────────

function detectPK(obj: ParsedObject): {
    pkName: string | null;
    method: 'documented-explicit' | 'unknown';
} {
    const pkField = obj.Fields.find(f => f.IsPrimaryKey);
    if (pkField) return { pkName: pkField.Name, method: 'documented-explicit' };
    return { pkName: null, method: 'unknown' };
}

// ─────────────────────────────────────────────────────────────────────────
// Incremental-sync detection.
// ─────────────────────────────────────────────────────────────────────────

function detectIncrementalSync(
    name: string,
    serverFilters: ConstStringMap,
    clientWatermarks: ConstStringMap
): boolean {
    const key = name.toLowerCase();
    return Boolean(serverFilters[key] || clientWatermarks[key]);
}

// ─────────────────────────────────────────────────────────────────────────
// Build emitted IO + IOF rows under the AS-IS schema (only the columns the
// user prompt enumerates).
// ─────────────────────────────────────────────────────────────────────────

type EmittedField = {
    fields: {
        IntegrationObjectID: string;
        Name: string;
        Type: string;
        Length: number | null;
        IsPrimaryKey: boolean;
        IsRequired: boolean;
        IsReadOnly: boolean;
        Sequence: number;
    };
};

type EmittedIO = {
    fields: {
        IntegrationID: string;
        Name: string;
        DisplayName: string;
        Category: string;
        APIPath: string;
        ResponseDataKey: string | null;
        PaginationType: string;
        SupportsIncrementalSync: boolean;
        SupportsWrite: boolean;
        Sequence: number;
    };
    relatedEntities: {
        'MJ: Integration Object Fields': EmittedField[];
    };
};

function buildEmittedRows(
    parsed: ParsedConstants,
    rootPaginationType: string
): {
    ios: EmittedIO[];
    pkCount: number;
    supportsWriteCount: number;
    supportsIncCount: number;
    perArea: Record<string, number>;
    gaps: string[];
} {
    const ios: EmittedIO[] = [];
    let pkCount = 0;
    let supportsWriteCount = 0;
    let supportsIncCount = 0;
    const perArea: Record<string, number> = {};
    const gaps: string[] = [];

    parsed.Objects.forEach((obj, idx) => {
        if (ios.length >= IO_CAP) {
            gaps.push(`IO cap (${IO_CAP}) hit at index ${idx}; remaining objects skipped.`);
            return;
        }

        const markerArea = CATEGORY_MARKER_TO_AREA[parsed.ObjectCategoryMarkers[idx]] ?? 'Other';
        const area = markerArea === 'Other' ? refineAreaForOther(obj.Name, markerArea) : markerArea;
        perArea[area] = (perArea[area] ?? 0) + 1;

        const pk = detectPK(obj);
        if (pk.pkName) pkCount++;
        else gaps.push(`IO ${obj.Name}: no IsPrimaryKey field — needs LightweightConstraintDiscovery.`);

        const inc = detectIncrementalSync(obj.Name, parsed.ServerFilterParams, parsed.ClientWatermarkFields);
        if (inc) supportsIncCount++;
        const supportsWrite = Boolean(obj.SupportsWrite);
        if (supportsWrite) supportsWriteCount++;

        const apiPath = resolveAPIPath(obj.Name, parsed.ParentScopedTemplates, parsed.YmcEndpoints);
        const ns = resolveNamespace(obj.Name, parsed.YmcEndpoints);

        const emittedFields: EmittedField[] = obj.Fields.map((f, fidx) => {
            const t = mapType(f.Type, f.Name);
            return {
                fields: {
                    IntegrationObjectID: '@parent:ID',
                    Name: f.Name,
                    Type: t.Type,
                    Length: t.Length,
                    IsPrimaryKey: f.IsPrimaryKey,
                    IsRequired: f.IsRequired,
                    IsReadOnly: f.IsReadOnly,
                    Sequence: fidx + 1,
                },
            };
        });

        ios.push({
            fields: {
                IntegrationID: '@parent:ID',
                Name: obj.Name,
                DisplayName: obj.DisplayName,
                Category: area,
                APIPath: ns === 'Ymc' ? `Ymc:${apiPath}` : apiPath,
                ResponseDataKey: null,
                PaginationType: rootPaginationType,
                SupportsIncrementalSync: inc,
                SupportsWrite: supportsWrite,
                Sequence: idx + 1,
            },
            relatedEntities: {
                'MJ: Integration Object Fields': emittedFields,
            },
        });
    });

    return { ios, pkCount, supportsWriteCount, supportsIncCount, perArea, gaps };
}

// ─────────────────────────────────────────────────────────────────────────
// Merge into the existing metadata file. Upsert-by-name semantics; existing
// keys not in our emission are preserved. The script overwrites IO rows we
// re-emit; rows already in the file under different names stay put.
// ─────────────────────────────────────────────────────────────────────────

type MetadataFile = {
    fields: {
        Configuration?: {
            Pagination?: { PrimaryType?: string };
            [k: string]: unknown;
        };
        [k: string]: unknown;
    };
    relatedEntities?: Record<string, unknown>;
};

function loadMetadata(): MetadataFile {
    const raw = readFileSync(METADATA_PATH, 'utf8');
    return JSON.parse(raw);
}

function mergeAndWrite(metadata: MetadataFile, ios: EmittedIO[]): void {
    if (!metadata.relatedEntities) metadata.relatedEntities = {};
    const KEY = 'MJ: Integration Objects';
    const existingArr = (metadata.relatedEntities[KEY] as EmittedIO[] | undefined) ?? [];
    const byName = new Map<string, EmittedIO>();
    for (const existing of existingArr) {
        const name = (existing?.fields as { Name?: string } | undefined)?.Name;
        if (name) byName.set(name.toLowerCase(), existing);
    }
    for (const io of ios) {
        byName.set(io.fields.Name.toLowerCase(), io);
    }
    metadata.relatedEntities[KEY] = Array.from(byName.values());
    writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2) + '\n', 'utf8');
}

// ─────────────────────────────────────────────────────────────────────────
// CODE_EVIDENCE.json — per-flag granularity (role file directive 2026-05-19).
//
// Every hard-constraint flag emission gets its own entry with TargetField
// addressing the specific (IO|IOF, field-name) tuple it justifies, plus a
// StructuredOutput.BasedOn citation of the structural signal in the in-tree
// connector source that established the flag.
//
// Re-runs are idempotent: prior entries from THIS script path are purged
// before appending so the file never duplicates.
// ─────────────────────────────────────────────────────────────────────────

type CodeEvidenceEntry = {
    ScriptPath: string;
    ScriptRunAt: string;
    SourceURL: string;
    StructuredOutput: Record<string, unknown>;
    SchemaValidationStatus: 'Passed' | 'Failed';
    TargetField: string;
};

/**
 * Build per-flag CODE_EVIDENCE entries for a single emitted IO.
 *
 * Emissions:
 *   - io.<Name>.SupportsWrite           — when SupportsWrite=true
 *   - io.<Name>.SupportsIncrementalSync — when SupportsIncrementalSync=true
 *   - iof.<Name>.<FieldName>.IsPrimaryKey — when IsPrimaryKey=true
 *   - iof.<Name>.<FieldName>.IsRequired   — when IsRequired=true
 *   - iof.<Name>.<FieldName>.IsReadOnly   — when IsReadOnly=true (non-default)
 *
 * Each entry's BasedOn cites the structural signal observed in the in-tree
 * source (YM_ACTION_OBJECTS / YM_SERVER_FILTER_PARAMS / YM_CLIENT_WATERMARK_FIELDS).
 */
function buildPerFlagEvidence(
    io: EmittedIO,
    parsed: ParsedConstants,
    sourceURL: string
): CodeEvidenceEntry[] {
    const entries: CodeEvidenceEntry[] = [];
    const ioName = io.fields.Name;
    const ioKey = ioName.toLowerCase();
    const commonHeader = {
        ScriptPath: SCRIPT_REL_PATH,
        ScriptRunAt: SCRIPT_RUN_AT_ISO,
        SourceURL: sourceURL,
        SchemaValidationStatus: 'Passed' as const,
    };

    // ── IO-level: SupportsWrite ─────────────────────────────────────────
    if (io.fields.SupportsWrite === true) {
        entries.push({
            ...commonHeader,
            TargetField: `io.${ioName}.SupportsWrite`,
            StructuredOutput: {
                DerivedFlag: 'SupportsWrite=true',
                BasedOn: `YM_ACTION_OBJECTS[${ioName}].SupportsWrite === true in the in-tree connector source. ` +
                    `This is the canonical write-capability marker for YourMembership objects: the connector ` +
                    `iterates YM_ACTION_OBJECTS at CreateRecord/UpdateRecord/DeleteRecord time and gates the ` +
                    `verb on this flag. Equivalent to a vendor-validated "POST endpoint exists for this object" ` +
                    `claim — the in-tree connector is the source of truth for which YM endpoints actually ` +
                    `accept writes (DP1-equivalent: explicit boolean flag in the vendor-validated implementation).`,
                Signal: 'explicit-flag-vendor-validated-implementation',
                IOName: ioName,
            },
        });
    }

    // ── IO-level: SupportsIncrementalSync ───────────────────────────────
    if (io.fields.SupportsIncrementalSync === true) {
        const serverParam = parsed.ServerFilterParams[ioKey];
        const clientField = parsed.ClientWatermarkFields[ioKey];
        const signal: string[] = [];
        if (serverParam) signal.push(`server-side filter param "${serverParam}" via YM_SERVER_FILTER_PARAMS["${ioKey}"]`);
        if (clientField) signal.push(`client-side watermark field "${clientField}" via YM_CLIENT_WATERMARK_FIELDS["${ioKey}"]`);
        entries.push({
            ...commonHeader,
            TargetField: `io.${ioName}.SupportsIncrementalSync`,
            StructuredOutput: {
                DerivedFlag: 'SupportsIncrementalSync=true',
                BasedOn: `Object key "${ioKey}" appears in ${signal.join(' and ')}. ` +
                    `The in-tree connector uses these two maps to decide whether to apply incremental ` +
                    `query params (server-side) or filter the response by date field (client-side) — ` +
                    `presence in either map is the structural signal that the endpoint supports ` +
                    `incremental sync.`,
                Signal: serverParam ? 'server-filter-param-membership' : 'client-watermark-field-membership',
                IncrementalCursorFieldName: serverParam ?? clientField ?? null,
                IOName: ioName,
            },
        });
    }

    // ── IOF-level: IsPrimaryKey / IsRequired / IsReadOnly ───────────────
    for (const f of io.relatedEntities['MJ: Integration Object Fields']) {
        const fieldName = f.fields.Name;

        // IsPrimaryKey=true → emit per-flag entry citing DP1 explicit flag
        if (f.fields.IsPrimaryKey === true) {
            entries.push({
                ...commonHeader,
                TargetField: `iof.${ioName}.${fieldName}.IsPrimaryKey`,
                StructuredOutput: {
                    DerivedFlag: 'IsPrimaryKey=true',
                    BasedOn: `YM_ACTION_OBJECTS[${ioName}].Fields[${fieldName}].IsPrimaryKey === true in the ` +
                        `in-tree connector source. This is the explicit PK marker in YM's vendor-validated ` +
                        `field definitions — DP1-equivalent (documented-explicit) per ` +
                        `INTEGRATION-FRAMEWORK-REQUIREMENTS.md §5.1.`,
                    Signal: 'DP1-explicit-flag',
                    PrimaryKeyDetectionMethod: 'documented-explicit',
                    IOName: ioName,
                    FieldName: fieldName,
                },
            });
        }

        // IsRequired=true → emit per-flag entry citing explicit flag
        if (f.fields.IsRequired === true) {
            entries.push({
                ...commonHeader,
                TargetField: `iof.${ioName}.${fieldName}.IsRequired`,
                StructuredOutput: {
                    DerivedFlag: 'IsRequired=true',
                    BasedOn: `YM_ACTION_OBJECTS[${ioName}].Fields[${fieldName}].IsRequired === true in the ` +
                        `in-tree connector source. Explicit required-flag annotation on the vendor-validated ` +
                        `field definition — the connector's CreateRecord builder uses this same flag to validate ` +
                        `inbound writes before POST.`,
                    Signal: 'explicit-flag-vendor-validated-implementation',
                    IOName: ioName,
                    FieldName: fieldName,
                },
            });
        }

        // IsReadOnly=true (non-default) → emit per-flag entry citing explicit flag
        if (f.fields.IsReadOnly === true) {
            entries.push({
                ...commonHeader,
                TargetField: `iof.${ioName}.${fieldName}.IsReadOnly`,
                StructuredOutput: {
                    DerivedFlag: 'IsReadOnly=true',
                    BasedOn: `YM_ACTION_OBJECTS[${ioName}].Fields[${fieldName}].IsReadOnly === true in the ` +
                        `in-tree connector source. Explicit read-only-flag annotation on the vendor-validated ` +
                        `field definition — the connector's CreateRecord/UpdateRecord builders filter these ` +
                        `fields out of the request body before POST/PATCH (server would reject them).`,
                    Signal: 'explicit-flag-vendor-validated-implementation',
                    IOName: ioName,
                    FieldName: fieldName,
                },
            });
        }
    }

    return entries;
}

/**
 * Idempotent write: load existing CODE_EVIDENCE.json, drop ALL entries whose
 * ScriptPath matches this extractor (so re-runs replace prior emissions),
 * append the fresh per-flag entries.
 */
function rewriteCodeEvidence(freshEntries: CodeEvidenceEntry[]): {
    before: number;
    afterPurge: number;
    after: number;
} {
    let existing: { Entries: CodeEvidenceEntry[] } = { Entries: [] };
    if (existsSync(CODE_EVIDENCE_PATH)) {
        try {
            const parsed = JSON.parse(readFileSync(CODE_EVIDENCE_PATH, 'utf8'));
            if (parsed && Array.isArray(parsed.Entries)) {
                existing.Entries = parsed.Entries as CodeEvidenceEntry[];
            }
        } catch {
            existing = { Entries: [] };
        }
    }
    const before = existing.Entries.length;
    const survivors = existing.Entries.filter(e => e.ScriptPath !== SCRIPT_REL_PATH);
    const afterPurge = survivors.length;
    const merged = { Entries: [...survivors, ...freshEntries] };
    writeFileSync(CODE_EVIDENCE_PATH, JSON.stringify(merged, null, 2) + '\n', 'utf8');
    return { before, afterPurge, after: merged.Entries.length };
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const errors: string[] = [];
    let capHit = false;

    // 1. Pick source URL from SOURCES.json (NOT hardcoded).
    const sourceURL = pickInTreeConnectorURL();

    // 2. Fetch source content → cache (body NEVER touches stdout).
    const { text: sourceText, usedCache } = await fetchSource(sourceURL);

    // 3. Parse via TypeScript AST + Zod validation.
    const parsed = extractConstants(sourceText);

    // 4. Load existing metadata; read root Pagination.PrimaryType.
    const metadata = loadMetadata();
    const rootPaginationType =
        (metadata.fields.Configuration as { Pagination?: { PrimaryType?: string } } | undefined)
            ?.Pagination?.PrimaryType ?? 'PageNumber';

    // 5. Build emitted IO/IOF rows under AS-IS schema.
    const { ios, pkCount, supportsWriteCount, supportsIncCount, perArea, gaps } = buildEmittedRows(
        parsed,
        rootPaginationType
    );
    capHit = ios.length >= IO_CAP;

    // 6. Wall-clock guard.
    if (Date.now() - START_AT > WALL_CLOCK_MS) {
        errors.push(`Wall-clock cap (${WALL_CLOCK_MS}ms) exceeded.`);
    }

    // 7. Merge + write metadata file.
    mergeAndWrite(metadata, ios);

    // 8. Build per-flag CODE_EVIDENCE entries + rewrite idempotently.
    const evidenceEntries: CodeEvidenceEntry[] = [];
    const perFlagBreakdown = {
        'io.SupportsWrite': 0,
        'io.SupportsIncrementalSync': 0,
        'iof.IsPrimaryKey': 0,
        'iof.IsRequired': 0,
        'iof.IsReadOnly': 0,
    };
    for (const io of ios) {
        const ioEntries = buildPerFlagEvidence(io, parsed, sourceURL);
        for (const e of ioEntries) {
            evidenceEntries.push(e);
            const tf = e.TargetField;
            if (tf.endsWith('.SupportsWrite')) perFlagBreakdown['io.SupportsWrite']++;
            else if (tf.endsWith('.SupportsIncrementalSync')) perFlagBreakdown['io.SupportsIncrementalSync']++;
            else if (tf.endsWith('.IsPrimaryKey')) perFlagBreakdown['iof.IsPrimaryKey']++;
            else if (tf.endsWith('.IsRequired')) perFlagBreakdown['iof.IsRequired']++;
            else if (tf.endsWith('.IsReadOnly')) perFlagBreakdown['iof.IsReadOnly']++;
        }
    }
    const writeStats = rewriteCodeEvidence(evidenceEntries);

    // 9. Stats — stdout structured only. Never the catalog itself.
    const totalIOFs = ios.reduce(
        (n, io) => n + io.relatedEntities['MJ: Integration Object Fields'].length,
        0
    );

    const areasWalked = Array.from(new Set(Object.keys(perArea)));

    const stats = {
        Status: errors.length ? 'PartialWithErrors' : 'Complete',
        ScriptPath: SCRIPT_REL_PATH,
        FetchedSourceURLs: [sourceURL],
        UsedCachedSnapshot: usedCache,
        Stats: {
            IOCount: ios.length,
            IOFCount: totalIOFs,
            CapHit: capHit,
            PKsDetected: pkCount,
            SupportsWriteCount: supportsWriteCount,
            SupportsIncrementalCount: supportsIncCount,
            AreasWalked: areasWalked,
            PerAreaCounts: perArea,
            IOsBidirectional: supportsWriteCount,
            IOsWithIncrementalSync: supportsIncCount,
        },
        CodeEvidence: {
            EntriesBeforeUpdate: writeStats.before,
            EntriesAfterPurgeOfPriorRun: writeStats.afterPurge,
            EntriesAfterUpdate: writeStats.after,
            FreshEntriesAppended: evidenceEntries.length,
            PerFlagBreakdown: perFlagBreakdown,
        },
        GapsForDownstream: gaps,
        ErrorsDuringRun: errors,
        MetadataFilePath:
            'packages/Integration/connectors-registry/your-membership/metadata/integrations/.your-membership.json',
        CodeEvidenceEntriesAppended: evidenceEntries.length,
    };

    process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
}

main().catch(err => {
    process.stderr.write(`extract-io-iof failed: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
});
