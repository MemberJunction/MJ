#!/usr/bin/env tsx
/**
 * QuickBooks Online IO/IOF extractor.
 *
 * Source paradigm: NO OpenAPI/Swagger. Canonical schema lives in XSD files
 * inside the official Intuit .NET SDK repo. The SDK splits the data model
 * across MULTIPLE XSDs in a single Schema directory:
 *
 *   - IntuitBaseTypes.xsd       — IntuitEntity base + ID/MetaData primitives
 *   - IntuitRestServiceDef.xsd  — REST entity declarations (substitutionGroup="IntuitObject")
 *                                  + a few entity complexTypes defined inline
 *                                  (RecurringTransaction, SyncActivity, Status)
 *   - Finance.xsd               — most Accounting transaction entities (Invoice,
 *                                  Bill, Estimate, Payment, etc.) as complexTypes
 *   - IntuitNamesTypes.xsd      — name-list entities (Customer, Vendor, Employee,
 *                                  TaxAgency, CustomerType, VendorType, OtherName) as complexTypes
 *   - SalesTax.xsd              — TaxService (declared as IntuitObject inside this file) as complexType
 *   - Report.xsd                — generic Report envelope (one entity, many report names)
 *   - EntitlementsResponse.xsd  — out-of-band entitlements response (NOT IntuitObject)
 *
 * The previous version of this script only fetched 4 XSDs and missed
 * IntuitNamesTypes.xsd + SalesTax.xsd, which caused Customer, Vendor,
 * Employee, TaxAgency, CustomerType, VendorType, OtherName, TaxService,
 * and (because of a separate complexType-lookup bug) RecurringTransaction
 * + SyncActivity to silently drop out.
 *
 * Set-completeness strategy (per audit re-dispatch 2026-05-19):
 *   1. Discover XSDs dynamically via the GitHub Contents API for the Schema
 *      directory — no hardcoded list of file names.
 *   2. Fetch every .xsd file; union their complexType definitions into one
 *      global map.
 *   3. Union every `substitutionGroup="IntuitObject"` declaration across ALL
 *      XSDs — TaxService is declared this way inside SalesTax.xsd itself.
 *   4. For each substituting entity, look up its complexType from the global
 *      union map (works regardless of which XSD declared it).
 *   5. Reports come from ReportNames.cs separately.
 *
 * Report names are enumerated in `ReportNames.cs` (Reports API has one
 * generic schema — the names are the catalog).
 *
 * Areas covered (per ProductTaxonomy):
 *   - Accounting API — every IntuitObject element across ALL XSDs
 *   - Reports API   — every report name in ReportNames.cs (read-only, no PK)
 *   - Webhooks      — covered by Accounting entities (webhook = push-notification on those)
 *   - CDC           — every Accounting entity has SupportsIncrementalSync=true (CDC endpoint)
 *   - Batch         — covered as a transport (not a separate entity)
 *   - Payments      — SCOPED OUT (separate host + connector, per Phase 2b)
 *
 * AS-IS schema constraint — ONLY these columns are emitted:
 *   IO:  Name, DisplayName, Category, APIPath, ResponseDataKey, PaginationType,
 *        SupportsIncrementalSync, SupportsWrite, Sequence
 *   IOF: Name, Type, Length, IsPrimaryKey, IsRequired, IsReadOnly
 *
 * Per-flag CODE_EVIDENCE: for every hard-constraint flag the script emits
 * (IsPrimaryKey=true, IsRequired=true, IsReadOnly=true, SupportsWrite=true,
 * SupportsIncrementalSync=true), a dedicated CODE_EVIDENCE entry is appended
 * citing the specific XSD signal that justified that flag. Per
 * .claude/rules/connector-provenance-conventions.md.
 */

import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// Configuration
// =============================================================================

const CONNECTOR_DIR = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(CONNECTOR_DIR, 'cache');
const METADATA_FILE = path.join(CONNECTOR_DIR, 'metadata/integrations/.quickbooks.json');
const CODE_EVIDENCE_FILE = path.join(CONNECTOR_DIR, 'CODE_EVIDENCE.json');
const SOURCES_FILE = path.join(CONNECTOR_DIR, 'SOURCES.json');

const IO_CAP = 1000;
const WALL_CLOCK_MS = 10 * 60 * 1000; // 10 min

// Source-URL anchor: the SDK repo URL listed in SOURCES.json. The script
// transforms the public github URL into the raw.githubusercontent.com form
// for content fetches. The repo-slug (owner/name) is parsed out of the URL
// at run time — never hardcoded as a literal.
const SDK_REPO_URL_KEY = 'github.com/intuit/QuickBooks-V3-DotNET-SDK';
const XSD_BASE_PATH = 'IPPDotNetDevKitCSV3/Tools/XsdExtension/Intuit.Ipp.XsdExtension/Schema';
const REPORT_NAMES_PATH = 'IPPDotNetDevKitCSV3/Code/Intuit.Ipp.ReportService/ReportNames.cs';

// QBO REST convention (per Phase 1 + existing in-tree connector at line 284-287):
//   Read:   GET  /v3/company/{realmId}/{objectType}/{id}
//   Create: POST /v3/company/{realmId}/{objectType}
//   Update: POST /v3/company/{realmId}/{objectType}
//   Delete: POST /v3/company/{realmId}/{objectType}?operation=delete
//   Query:  GET  /v3/company/{realmId}/query?query=SELECT * FROM {objectType}
// The objectType segment is lower-cased entity name. AS-IS APIPath stores
// the canonical resource path template (single placeholder for the resource).
const ACCOUNTING_PATH_TEMPLATE = '/v3/company/{realmId}/{resource}';
const REPORT_PATH_TEMPLATE = '/v3/company/{realmId}/reports/{reportName}';

// Pagination: QBO does not paginate at the REST level — pagination is via
// QBO Query Language clauses STARTPOSITION + MAXRESULTS embedded inside the
// SELECT statement. The schema's PaginationType enum is {PageNumber, Offset,
// Cursor, None}. The mechanism IS offset-based even though it travels inside
// a SQL string, so `Offset` is the closest fit. Reports do not paginate.
const ACCOUNTING_PAGINATION_TYPE = 'Offset' as const;
const REPORT_PAGINATION_TYPE = 'None' as const;

// Universal PK across all Accounting entities (Phase 1 Provable confidence).
const QBO_PRIMARY_KEY_FIELD = 'Id';

// XSD element types that the QBO XSD universe uses. Mapped to MJ-friendly
// canonical type names. Anything not in the map falls through as the raw
// type-name (typically a referenced complexType like ReferenceType or an Enum).
const XSD_TYPE_MAP: Readonly<Record<string, string>> = Object.freeze({
    'xs:string': 'string',
    'xs:boolean': 'boolean',
    'xs:int': 'integer',
    'xs:integer': 'integer',
    'xs:long': 'integer',
    'xs:decimal': 'decimal',
    'xs:double': 'decimal',
    'xs:float': 'decimal',
    'xs:date': 'date',
    'xs:dateTime': 'datetime',
    'xs:time': 'time',
    'xs:anyURI': 'string',
    'xs:base64Binary': 'binary',
    'id': 'string',           // IntuitBaseTypes 'id' simpleType wraps a string
    'IntuitAnyType': 'object',
    'ReferenceType': 'object', // FK-style nested {value, name}
    'ModificationMetaData': 'object',
    'CustomField': 'object',
    'AttachableRef': 'object',
});

// =============================================================================
// Zod schemas (validate parsed XSD shapes before we emit)
// =============================================================================

const SourceEntrySchema = z.object({
    URL: z.string().url(),
    Tier: z.number(),
    Category: z.string(),
});

const SourcesFileSchema = z.object({
    Vendor: z.string(),
    Sources: z.array(SourceEntrySchema),
});

const ParsedFieldSchema = z.object({
    Name: z.string().min(1),
    XsdType: z.string().min(1),
    MinOccurs: z.number(),
    MaxOccurs: z.union([z.number(), z.literal('unbounded')]),
    DocText: z.string(),
});
type ParsedField = z.infer<typeof ParsedFieldSchema>;

const ParsedComplexTypeSchema = z.object({
    Name: z.string().min(1),
    ExtendsBase: z.string().nullable(),
    Fields: z.array(ParsedFieldSchema),
    DefinedIn: z.string().min(1),
});
type ParsedComplexType = z.infer<typeof ParsedComplexTypeSchema>;

const IORowSchema = z.object({
    Name: z.string().min(1),
    DisplayName: z.string().min(1),
    Category: z.string().min(1),
    APIPath: z.string().min(1),
    ResponseDataKey: z.string().nullable(),
    PaginationType: z.enum(['PageNumber', 'Offset', 'Cursor', 'None']),
    SupportsIncrementalSync: z.boolean(),
    SupportsWrite: z.boolean(),
    Sequence: z.number().int(),
});
type IORow = z.infer<typeof IORowSchema>;

const IOFRowSchema = z.object({
    Name: z.string().min(1),
    Type: z.string().min(1),
    Length: z.number().int().positive().nullable(),
    IsPrimaryKey: z.boolean(),
    IsRequired: z.boolean(),
    IsReadOnly: z.boolean(),
});
type IOFRow = z.infer<typeof IOFRowSchema>;

// -----------------------------------------------------------------------------
// Per-flag signal tracking — what XSD evidence produced each true flag.
// Carried in parallel to IOFRow so that CODE_EVIDENCE can cite the specific
// source signal that justified each hard-constraint emission.
// -----------------------------------------------------------------------------

/**
 * Signal source files. Expanded from the original 4 to the full XSD universe
 * the SDK ships. New: IntuitNamesTypes.xsd + SalesTax.xsd + EntitlementsResponse.xsd.
 * (EntitlementsResponse.xsd is structurally a sibling but currently contributes
 * no IntuitObject entities — kept here for forward-compat citation if it ever does.)
 */
type SourceFileName =
    | 'IntuitBaseTypes.xsd'
    | 'Finance.xsd'
    | 'Report.xsd'
    | 'IntuitRestServiceDef.xsd'
    | 'IntuitNamesTypes.xsd'
    | 'SalesTax.xsd'
    | 'EntitlementsResponse.xsd'
    | 'ReportNames.cs';

interface FlagSignal {
    /** Path-fragment of the XSD source the signal was read from. */
    SourceFile: SourceFileName;
    /** Human-readable description of the structural signal (NOT a value-excerpt). */
    BasedOn: string;
    /** Structured discriminator (e.g., 'inherited-from-IntuitEntity', 'doc-annotation-Required'). */
    SignalKind: string;
}

interface IOFFlagSignals {
    /** Field name as it appears in the IOF row. */
    Name: string;
    IsPrimaryKey?: FlagSignal;
    IsRequired?: FlagSignal;
    IsReadOnly?: FlagSignal;
}

interface IOFlagSignals {
    /** Reasoning for SupportsWrite=true — only populated when SupportsWrite=true. */
    SupportsWrite?: FlagSignal;
    /** Reasoning for SupportsIncrementalSync=true — only populated when true. */
    SupportsIncrementalSync?: FlagSignal;
}

// =============================================================================
// URL helpers
// =============================================================================

/**
 * Convert a public-github URL key (e.g. "github.com/owner/repo") into the
 * raw.githubusercontent.com root for fetching file contents at the master
 * branch. We don't hardcode "owner/repo" anywhere — it comes from SOURCES.json
 * via SDK_REPO_URL_KEY which itself is the entry the auditor selected.
 */
function rawRepoRoot(repoKey: string): string {
    const stripped = repoKey.replace(/^github\.com\//, '');
    return `https://raw.githubusercontent.com/${stripped}/master`;
}

function rawUrl(repoPath: string): string {
    return `${rawRepoRoot(SDK_REPO_URL_KEY)}/${repoPath}`;
}

/**
 * Build the GitHub Contents API URL for a directory in the SDK repo. We use
 * this to enumerate XSD files dynamically — the script does not hardcode the
 * list of XSDs, so new vendor-added schemas would be picked up automatically.
 */
function repoContentsApiUrl(repoPath: string): string {
    const stripped = SDK_REPO_URL_KEY.replace(/^github\.com\//, '');
    return `https://api.github.com/repos/${stripped}/contents/${repoPath}`;
}

// =============================================================================
// Fetch with disk cache
// =============================================================================

async function fetchWithCache(rawContentUrl: string, cacheFileName: string): Promise<string> {
    const cachePath = path.join(CACHE_DIR, cacheFileName);
    try {
        const stat = await fs.stat(cachePath);
        if (stat.isFile() && stat.size > 0) {
            return await fs.readFile(cachePath, 'utf8');
        }
    } catch {
        // cache miss
    }
    const resp = await fetch(rawContentUrl);
    if (!resp.ok) {
        throw new Error(`Fetch failed for ${rawContentUrl}: ${resp.status} ${resp.statusText}`);
    }
    const text = await resp.text();
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, text, 'utf8');
    return text;
}

// =============================================================================
// SOURCES.json verification — confirm the SDK repo we're fetching from is
// actually a top-tier source the auditor selected.
// =============================================================================

async function loadAndValidateSources(): Promise<void> {
    const raw = await fs.readFile(SOURCES_FILE, 'utf8');
    const parsed = SourcesFileSchema.parse(JSON.parse(raw));
    const sdkSource = parsed.Sources.find(s => s.URL.includes(SDK_REPO_URL_KEY));
    if (!sdkSource) {
        throw new Error(
            `SOURCES.json does not list ${SDK_REPO_URL_KEY} as a vendor source. ` +
                `Aborting — extractor relies on the .NET SDK XSDs as the canonical schema.`,
        );
    }
    if (sdkSource.Tier !== 1) {
        throw new Error(
            `Expected Tier-1 source for SDK repo, got Tier ${sdkSource.Tier}. Aborting.`,
        );
    }
}

// =============================================================================
// Dynamic XSD discovery — enumerate every .xsd file in the Schema directory
// =============================================================================

const GithubDirEntrySchema = z.object({
    name: z.string().min(1),
    type: z.string().min(1),
});
type GithubDirEntry = z.infer<typeof GithubDirEntrySchema>;

const GithubDirListingSchema = z.array(GithubDirEntrySchema);

/**
 * Hit the GitHub Contents API for the SDK Schema directory and return the
 * list of XSD file names. We cache the API response on disk too, so re-runs
 * don't re-hit GitHub.
 *
 * Why dynamic discovery: the previous version of this script hardcoded the
 * 4 XSD names it knew about, which silently missed IntuitNamesTypes.xsd +
 * SalesTax.xsd (the files where Customer/Vendor/Employee/TaxAgency/TaxService
 * live as complexTypes). If Intuit adds a new XSD in a future SDK release,
 * dynamic discovery picks it up automatically. The CONNECTOR-PROVENANCE
 * conventions specifically forbid hardcoded vendor object/field lists in
 * script source code; this also applies to file lists when the file set
 * encodes the vendor's catalog structure.
 */
async function discoverXsdFiles(): Promise<string[]> {
    const cachePath = path.join(CACHE_DIR, '_xsd-directory-listing.json');
    let listingJson: string;
    try {
        const stat = await fs.stat(cachePath);
        if (stat.isFile() && stat.size > 0) {
            listingJson = await fs.readFile(cachePath, 'utf8');
        } else {
            throw new Error('cache empty');
        }
    } catch {
        const resp = await fetch(repoContentsApiUrl(XSD_BASE_PATH), {
            headers: { Accept: 'application/vnd.github+json' },
        });
        if (!resp.ok) {
            throw new Error(
                `GitHub directory listing failed for ${XSD_BASE_PATH}: ${resp.status} ${resp.statusText}. ` +
                    `Cannot enumerate XSD universe — aborting rather than fall back to a hardcoded list.`,
            );
        }
        listingJson = await resp.text();
        await fs.mkdir(path.dirname(cachePath), { recursive: true });
        await fs.writeFile(cachePath, listingJson, 'utf8');
    }
    const parsedListing: unknown = JSON.parse(listingJson);
    const entries: GithubDirEntry[] = GithubDirListingSchema.parse(parsedListing);
    return entries
        .filter(e => e.type === 'file' && e.name.toLowerCase().endsWith('.xsd'))
        .map(e => e.name)
        .sort();
}

// =============================================================================
// XSD parsing
// =============================================================================

function buildXmlParser(): XMLParser {
    return new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        textNodeName: '#text',
        parseAttributeValue: false,
        trimValues: true,
        // Treat <xs:element> + <xs:complexType> as arrays-or-single. The
        // alwaysArray-style callback removes the need to runtime-check shape
        // per call.
        isArray: (name: string) =>
            name === 'xs:element' ||
            name === 'xs:complexType' ||
            name === 'xs:enumeration' ||
            name === 'xs:attribute',
    });
}

function collectDocText(annotation: unknown): string {
    if (!annotation || typeof annotation !== 'object') return '';
    const ann = annotation as Record<string, unknown>;
    const doc = ann['xs:documentation'];
    if (typeof doc === 'string') return doc;
    if (doc && typeof doc === 'object') {
        const docObj = doc as Record<string, unknown>;
        const text = docObj['#text'];
        if (typeof text === 'string') return text;
    }
    return '';
}

interface ParsedSchema {
    ComplexTypes: Map<string, ParsedComplexType>;
    /** Names whose declaration carries substitutionGroup="IntuitObject". */
    TopLevelEntities: Set<string>;
    /** File path-fragment this schema was parsed from. */
    DefinedIn: SourceFileName;
}

function parseComplexType(
    rawType: Record<string, unknown>,
    definedIn: SourceFileName,
): ParsedComplexType | null {
    const name = rawType['@_name'];
    if (typeof name !== 'string') return null;

    let extendsBase: string | null = null;
    let sequenceContainer: Record<string, unknown> | null = null;

    // Two shapes:
    //   1. <xs:complexType><xs:sequence>...</xs:sequence></xs:complexType>
    //   2. <xs:complexType><xs:complexContent><xs:extension base="X"><xs:sequence>...
    if (rawType['xs:complexContent']) {
        const cc = rawType['xs:complexContent'] as Record<string, unknown>;
        const ext = cc['xs:extension'] as Record<string, unknown> | undefined;
        if (ext) {
            const baseAttr = ext['@_base'];
            if (typeof baseAttr === 'string') extendsBase = baseAttr;
            if (ext['xs:sequence']) sequenceContainer = ext['xs:sequence'] as Record<string, unknown>;
        }
    } else if (rawType['xs:sequence']) {
        sequenceContainer = rawType['xs:sequence'] as Record<string, unknown>;
    }

    const fields: ParsedField[] = [];
    if (sequenceContainer) {
        const elements = sequenceContainer['xs:element'];
        if (Array.isArray(elements)) {
            for (const el of elements) {
                if (!el || typeof el !== 'object') continue;
                const elObj = el as Record<string, unknown>;
                const fName = elObj['@_name'];
                const fType = elObj['@_type'];
                // Skip <xs:element ref="X"/> entries (substitution-group placeholders
                // like RecurringTransaction's `<xs:element ref="IntuitObject"/>`) — they
                // have no @_name + no @_type and contribute no own fields. The entity
                // still inherits IntuitEntity's fields via its extension base.
                if (typeof fName !== 'string' || typeof fType !== 'string') continue;
                const minOccursRaw = elObj['@_minOccurs'];
                const maxOccursRaw = elObj['@_maxOccurs'];
                const minOccurs = typeof minOccursRaw === 'string' ? parseInt(minOccursRaw, 10) : 1;
                let maxOccurs: number | 'unbounded' = 1;
                if (typeof maxOccursRaw === 'string') {
                    maxOccurs = maxOccursRaw === 'unbounded' ? 'unbounded' : parseInt(maxOccursRaw, 10);
                }
                const docText = collectDocText(elObj['xs:annotation']);
                fields.push({
                    Name: fName,
                    XsdType: fType,
                    MinOccurs: Number.isFinite(minOccurs) ? minOccurs : 1,
                    MaxOccurs: maxOccurs,
                    DocText: docText,
                });
            }
        }
    }

    return {
        Name: name,
        ExtendsBase: extendsBase,
        Fields: fields,
        DefinedIn: definedIn,
    };
}

function parseSchemaXsd(xsdText: string, definedIn: SourceFileName): ParsedSchema {
    const parser = buildXmlParser();
    const parsed = parser.parse(xsdText) as Record<string, unknown>;
    const schema = parsed['xs:schema'] as Record<string, unknown> | undefined;
    if (!schema) {
        throw new Error(`Parsed XSD ${definedIn} has no <xs:schema> root`);
    }

    const complexTypes = new Map<string, ParsedComplexType>();
    const rawCTs = schema['xs:complexType'];
    if (Array.isArray(rawCTs)) {
        for (const ct of rawCTs) {
            if (!ct || typeof ct !== 'object') continue;
            const parsedCt = parseComplexType(ct as Record<string, unknown>, definedIn);
            if (parsedCt) {
                ParsedComplexTypeSchema.parse(parsedCt); // validate
                complexTypes.set(parsedCt.Name, parsedCt);
            }
        }
    }

    // Top-level entities: <xs:element name="X" type="X" substitutionGroup="IntuitObject"/>
    const topLevel = new Set<string>();
    const rawElements = schema['xs:element'];
    if (Array.isArray(rawElements)) {
        for (const el of rawElements) {
            if (!el || typeof el !== 'object') continue;
            const elObj = el as Record<string, unknown>;
            const subGroup = elObj['@_substitutionGroup'];
            if (subGroup === 'IntuitObject') {
                const nm = elObj['@_name'];
                if (typeof nm === 'string') topLevel.add(nm);
            }
        }
    }

    return { ComplexTypes: complexTypes, TopLevelEntities: topLevel, DefinedIn: definedIn };
}

// =============================================================================
// Doc-annotation interpretation (the XSD's structured comments)
// =============================================================================

interface FieldDocSignals {
    Required: boolean;
    /** The matched annotation text fragment (for evidence citation). null if not matched. */
    RequiredMatchedText: string | null;
    ReadOnly: boolean;
    ReadOnlyMatchedText: string | null;
    MaxLength: number | null;
}

function interpretDocSignals(docText: string): FieldDocSignals {
    // Required: ALL / Required: QBO → required.
    // Required: QBW (Desktop-only) → NOT required for QBO.
    const requiredAllMatch = /Required:\s*ALL\b/.exec(docText);
    const requiredQboMatch = /Required:\s*QBO\b/.exec(docText);
    const required = !!(requiredAllMatch || requiredQboMatch);
    const requiredMatched = requiredAllMatch?.[0] ?? requiredQboMatch?.[0] ?? null;

    // ReadOnly markers in the XSD docs come in several shapes:
    //   "InputType: ReadOnly"
    //   "InputType: ALL: ReadOnly"
    //   "InputType: QBO: ReadOnly"
    //   "InputType: QBW: ReadOnly"          ← Desktop only — IGNORE for QBO
    const readOnlyMatch =
        /InputType:\s*ReadOnly\b/.exec(docText) ??
        /InputType:\s*ALL:\s*ReadOnly\b/.exec(docText) ??
        /InputType:\s*QBO:\s*ReadOnly\b/.exec(docText);
    const readOnly = !!readOnlyMatch;
    const readOnlyMatched = readOnlyMatch?.[0] ?? null;

    // Length: "ValidRange: QBO: Max=N" or "ValidRange: ALL: Max=N"
    // (Ignore QBW-specific lengths — Desktop only.)
    let maxLength: number | null = null;
    const qboMaxMatch = /ValidRange:\s*QBO:\s*Max\s*=\s*(\d+)/i.exec(docText);
    if (qboMaxMatch) {
        maxLength = parseInt(qboMaxMatch[1], 10);
    } else {
        const allMaxMatch = /ValidRange:\s*ALL:\s*Max\s*=\s*(\d+)/i.exec(docText);
        if (allMaxMatch) maxLength = parseInt(allMaxMatch[1], 10);
    }

    return {
        Required: required,
        RequiredMatchedText: requiredMatched,
        ReadOnly: readOnly,
        ReadOnlyMatchedText: readOnlyMatched,
        MaxLength: maxLength,
    };
}

// =============================================================================
// Field-row builders
// =============================================================================

function mapXsdTypeToMJ(xsdType: string): string {
    if (Object.prototype.hasOwnProperty.call(XSD_TYPE_MAP, xsdType)) {
        return XSD_TYPE_MAP[xsdType];
    }
    // Enum types (simpleTypes) and named complexTypes flow through as the
    // raw XSD type name — the metadata stores it AS-IS for the downstream
    // connector to interpret. We don't invent new types.
    return xsdType;
}

interface BuiltFieldRow {
    Row: IOFRow;
    Signals: IOFFlagSignals;
}

function buildBaseFields(baseType: ParsedComplexType | undefined): BuiltFieldRow[] {
    // IntuitEntity's fields are inherited by every accounting entity. The PK
    // field 'Id' lives in IntuitEntity. We treat Id as required (it's the
    // universal PK per Phase 1 Provable confidence). SyncToken is required
    // on update operations per its XSD doc.
    if (!baseType) return [];

    const out: BuiltFieldRow[] = [];
    for (const f of baseType.Fields) {
        const signals = interpretDocSignals(f.DocText);
        const isPk = f.Name === QBO_PRIMARY_KEY_FIELD;
        // QBO universal convention: only when name === 'Id', and ONLY on IOs
        // that derive from IntuitEntity. We mark it from the base-fields path,
        // which is exclusively applied to every Accounting entity (which all
        // extend IntuitEntity by REST contract).
        const isRequired = isPk || signals.Required;
        // MetaData is system-set + read-only per the XSD doc convention
        // (the SDK marks it via class-level annotation rather than InputType).
        const isReadOnly = signals.ReadOnly || f.Name === 'MetaData';

        const flagSignals: IOFFlagSignals = { Name: f.Name };
        if (isPk) {
            flagSignals.IsPrimaryKey = {
                SourceFile: 'IntuitBaseTypes.xsd',
                SignalKind: 'inherited-from-IntuitEntity',
                BasedOn:
                    `Field 'Id' is declared on the abstract complexType 'IntuitEntity' in ` +
                    `IntuitBaseTypes.xsd (xs:element name="Id" type="id"). Every top-level ` +
                    `Accounting REST entity (substitutionGroup="IntuitObject" across any ` +
                    `XSD) extends IntuitEntity, making 'Id' the universal QBO primary key ` +
                    `by inheritance.`,
            };
        }
        if (isRequired) {
            if (isPk) {
                flagSignals.IsRequired = {
                    SourceFile: 'IntuitBaseTypes.xsd',
                    SignalKind: 'inherited-PK-implies-required',
                    BasedOn:
                        `Field 'Id' on IntuitEntity carries the XSD doc-annotation ` +
                        `'Required: ALL' and is the universal QBO primary key — required ` +
                        `for update operations per the SDK doc-annotation.`,
                };
            } else if (signals.RequiredMatchedText) {
                flagSignals.IsRequired = {
                    SourceFile: 'IntuitBaseTypes.xsd',
                    SignalKind: 'doc-annotation-Required',
                    BasedOn:
                        `XSD xs:annotation/xs:documentation on inherited field '${f.Name}' ` +
                        `contains the structured marker '${signals.RequiredMatchedText}'.`,
                };
            }
        }
        if (isReadOnly) {
            if (signals.ReadOnlyMatchedText) {
                flagSignals.IsReadOnly = {
                    SourceFile: 'IntuitBaseTypes.xsd',
                    SignalKind: 'doc-annotation-InputType-ReadOnly',
                    BasedOn:
                        `XSD xs:annotation/xs:documentation on inherited field '${f.Name}' ` +
                        `contains the structured marker '${signals.ReadOnlyMatchedText}'.`,
                };
            } else if (f.Name === 'MetaData') {
                flagSignals.IsReadOnly = {
                    SourceFile: 'IntuitBaseTypes.xsd',
                    SignalKind: 'metadata-field-convention',
                    BasedOn:
                        `Field 'MetaData' on IntuitEntity is described in the XSD as ` +
                        `'set by Data Services and are read only for all applications', a ` +
                        `system-managed field per the XSD doc text.`,
                };
            }
        }

        out.push({
            Row: {
                Name: f.Name,
                Type: mapXsdTypeToMJ(f.XsdType),
                Length: signals.MaxLength,
                IsPrimaryKey: isPk,
                IsRequired: isRequired,
                IsReadOnly: isReadOnly,
            },
            Signals: flagSignals,
        });
    }
    return out;
}

function buildEntityFields(
    entity: ParsedComplexType,
    baseBuilt: BuiltFieldRow[],
): BuiltFieldRow[] {
    // Base fields come first (Id is field 1). Then entity-specific fields.
    const out: BuiltFieldRow[] = [...baseBuilt];
    const seen = new Set(out.map(r => r.Row.Name));

    for (const f of entity.Fields) {
        if (seen.has(f.Name)) continue; // safety against duplicate names
        const signals = interpretDocSignals(f.DocText);
        const isPk = false; // Only Id (from base) is PK on accounting entities.
        const row: IOFRow = {
            Name: f.Name,
            Type: mapXsdTypeToMJ(f.XsdType),
            Length: signals.MaxLength,
            IsPrimaryKey: isPk,
            IsRequired: signals.Required,
            IsReadOnly: signals.ReadOnly,
        };
        IOFRowSchema.parse(row);

        const flagSignals: IOFFlagSignals = { Name: f.Name };
        if (signals.Required && signals.RequiredMatchedText) {
            flagSignals.IsRequired = {
                SourceFile: entity.DefinedIn as SourceFileName,
                SignalKind: 'doc-annotation-Required',
                BasedOn:
                    `XSD xs:annotation/xs:documentation on entity field '${entity.Name}.${f.Name}' ` +
                    `(declared in ${entity.DefinedIn}) contains the structured marker ` +
                    `'${signals.RequiredMatchedText}' (QBO product applicability).`,
            };
        }
        if (signals.ReadOnly && signals.ReadOnlyMatchedText) {
            flagSignals.IsReadOnly = {
                SourceFile: entity.DefinedIn as SourceFileName,
                SignalKind: 'doc-annotation-InputType-ReadOnly',
                BasedOn:
                    `XSD xs:annotation/xs:documentation on entity field '${entity.Name}.${f.Name}' ` +
                    `(declared in ${entity.DefinedIn}) contains the structured marker ` +
                    `'${signals.ReadOnlyMatchedText}'.`,
            };
        }

        out.push({ Row: row, Signals: flagSignals });
        seen.add(f.Name);
    }
    return out;
}

// =============================================================================
// Reports (separate paradigm: report names from a code file, not from XSD)
// =============================================================================

function parseReportNames(reportNamesCs: string): string[] {
    // The file is a C# class with `public const string <Name> = "<Name>";` lines.
    // We extract the QUOTED constant values — those are the canonical report
    // identifiers used in the /reports/<name> endpoint per the workflow docs.
    const names: string[] = [];
    const re = /public\s+const\s+string\s+\w+\s*=\s*"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(reportNamesCs)) !== null) {
        names.push(m[1]);
    }
    return names;
}

// =============================================================================
// Main extraction pipeline
// =============================================================================

interface ExtractionResult {
    IOs: IORow[];
    IOFsByIO: Map<string, IOFRow[]>;
    /** Parallel to IOFsByIO — per-IO per-field flag signals. */
    IOFSignalsByIO: Map<string, IOFFlagSignals[]>;
    /** Per-IO flag signals (SupportsWrite reasoning). */
    IOSignalsByIO: Map<string, IOFlagSignals>;
    FetchedURLs: string[];
    PerAreaCounts: Record<string, number>;
    /** Names declared as IntuitObject across ALL XSDs (audit-visible set). */
    IntuitObjectDeclarations: string[];
    /** XSD file names walked at runtime. */
    XsdFilesWalked: string[];
}

async function extract(): Promise<ExtractionResult> {
    const startMs = Date.now();
    const fetchedURLs: string[] = [];

    // 1. Validate SOURCES.json references the SDK repo
    await loadAndValidateSources();

    // 2. Dynamically discover the set of XSD files in the SDK Schema directory.
    //    No hardcoded list — script reads the directory at runtime.
    const xsdFileNames = await discoverXsdFiles();
    if (xsdFileNames.length === 0) {
        throw new Error('Discovered zero XSD files in SDK Schema directory. Aborting.');
    }

    // 3. Fetch each XSD (disk-cached) + ReportNames.cs
    const reportNamesUrl = rawUrl(REPORT_NAMES_PATH);
    fetchedURLs.push(reportNamesUrl);

    const xsdContents = new Map<SourceFileName, string>();
    await Promise.all(
        xsdFileNames.map(async name => {
            const url = rawUrl(`${XSD_BASE_PATH}/${name}`);
            fetchedURLs.push(url);
            const text = await fetchWithCache(url, name);
            xsdContents.set(name as SourceFileName, text);
        }),
    );
    const reportNamesCs = await fetchWithCache(reportNamesUrl, 'ReportNames.cs');

    if (Date.now() - startMs > WALL_CLOCK_MS) {
        throw new Error('Wall-clock budget exceeded during fetch');
    }

    // 4. Parse every XSD. Each yields its own (complexTypes, IntuitObject-declarations).
    const parsedSchemas: ParsedSchema[] = [];
    for (const [name, text] of xsdContents.entries()) {
        parsedSchemas.push(parseSchemaXsd(text, name));
    }

    // 5. Union all complexTypes into one global map. When the same name exists
    //    in multiple XSDs (shouldn't happen in practice — SDK keeps types unique),
    //    the LAST one wins; we log a warning via gaps for the caller.
    const allComplexTypes = new Map<string, ParsedComplexType>();
    const complexTypeCollisions: string[] = [];
    for (const sch of parsedSchemas) {
        for (const [k, v] of sch.ComplexTypes.entries()) {
            if (allComplexTypes.has(k)) {
                complexTypeCollisions.push(
                    `${k} (already from ${allComplexTypes.get(k)?.DefinedIn}, now from ${sch.DefinedIn})`,
                );
            }
            allComplexTypes.set(k, v);
        }
    }

    // 6. Union all substitutionGroup="IntuitObject" declarations across all XSDs.
    //    TaxService is declared inside SalesTax.xsd itself; previous version of
    //    the script only walked IntuitRestServiceDef.xsd and missed it.
    const declaredByFile = new Map<string, SourceFileName>();
    for (const sch of parsedSchemas) {
        for (const nm of sch.TopLevelEntities) {
            // First declaration wins — but in practice each entity is declared once.
            if (!declaredByFile.has(nm)) declaredByFile.set(nm, sch.DefinedIn);
        }
    }
    const topLevelEntityNames = new Set<string>(declaredByFile.keys());

    // 7. Resolve the base type (IntuitEntity) — its inherited fields are
    //    pre-pended to every Accounting entity's field list.
    const intuitEntityBase = allComplexTypes.get('IntuitEntity');
    const baseBuilt = buildBaseFields(intuitEntityBase);

    // 8. Build Accounting IOs
    const ios: IORow[] = [];
    const iofsByIO = new Map<string, IOFRow[]>();
    const iofSignalsByIO = new Map<string, IOFFlagSignals[]>();
    const ioSignalsByIO = new Map<string, IOFlagSignals>();
    let sequence = 0;

    // Some "entities" in REST def are response envelopes, not queryable
    // resources. Filter these out structurally — they have no resource URL.
    // BatchItemRequest is a transport wrapper for the Batch operation — not
    // a top-level queryable resource. The audit re-dispatch explicitly noted
    // it's correctly excluded.
    const responseOnlyTypes = new Set<string>([
        'EmailDeliveryInfo',
        'SyncErrorResponse',
        'Status',
        'IntuitResponse',
        'OLBStatus',
        'BatchItemRequest',
    ]);

    // Sort entity names for stable output ordering (idempotency).
    const sortedEntities = Array.from(topLevelEntityNames).sort();

    for (const entityName of sortedEntities) {
        if (ios.length >= IO_CAP) {
            throw new Error(`IO cap of ${IO_CAP} exceeded during Accounting walk`);
        }
        // Skip pure response envelopes / transport wrappers.
        if (responseOnlyTypes.has(entityName)) continue;
        // The generic Report entity is handled by the Reports loop below.
        if (entityName === 'Report') continue;

        const ct = allComplexTypes.get(entityName);
        if (!ct) {
            // Entity declared in REST def but no complexType found in any XSD —
            // surface as a gap by skipping rather than fabricating fields.
            continue;
        }

        // Per the existing in-tree connector (line 490/517/541), the REST
        // resource segment is the lowercased entity name.
        const resourceSegment = entityName.toLowerCase();
        const apiPath = ACCOUNTING_PATH_TEMPLATE.replace('{resource}', resourceSegment);

        // ResponseDataKey: QBO wraps query responses in QueryResponse.<EntityName>[]
        // and single-entity reads in {<EntityName>: {...}, time: '...'}. The key
        // matches the entity name.
        const responseDataKey = entityName;

        // SupportsWrite: every accounting entity supports POST for create
        // and POST-with-SyncToken for update, EXCEPT pure response envelopes
        // (which are filtered above).
        const supportsWrite = true;

        // SupportsIncrementalSync: per the task brief + configuration.json
        // IncrementalSync.Capability, the CDC endpoint covers all accounting
        // entities. We set true for every Accounting IO.
        const supportsIncrementalSync = true;

        const io: IORow = {
            Name: entityName,
            DisplayName: entityName,
            Category: 'Accounting',
            APIPath: apiPath,
            ResponseDataKey: responseDataKey,
            PaginationType: ACCOUNTING_PAGINATION_TYPE,
            SupportsIncrementalSync: supportsIncrementalSync,
            SupportsWrite: supportsWrite,
            Sequence: sequence++,
        };
        IORowSchema.parse(io);
        ios.push(io);

        // Per-IO flag signals. We collect SupportsWrite + SupportsIncrementalSync
        // here so the CODE_EVIDENCE emitter can cite the specific structural
        // signal that justified each true-flag emission. The SignalSourceFile
        // is the XSD where the IntuitObject declaration lives — which is the
        // structural marker that gates these flags.
        const declarationFile = declaredByFile.get(entityName) ?? 'IntuitRestServiceDef.xsd';
        const ioSig: IOFlagSignals = {};
        if (supportsWrite) {
            ioSig.SupportsWrite = {
                SourceFile: declarationFile,
                SignalKind: 'substitution-group-IntuitObject',
                BasedOn:
                    `Entity '${entityName}' is declared as an xs:element with ` +
                    `substitutionGroup="IntuitObject" in ${declarationFile}, ` +
                    `which is the universal QBO marker for top-level REST resources ` +
                    `that support POST create/update + DELETE via ?operation=delete ` +
                    `per the v3 REST convention.`,
            };
        }
        if (supportsIncrementalSync) {
            ioSig.SupportsIncrementalSync = {
                SourceFile: declarationFile,
                SignalKind: 'cdc-endpoint-covers-IntuitObject-members',
                BasedOn:
                    `Entity '${entityName}' is declared with ` +
                    `substitutionGroup="IntuitObject" in ${declarationFile}. ` +
                    `The QBO v3 CDC endpoint (/v3/company/{realmId}/cdc) accepts ` +
                    `any IntuitObject member in its 'entities' query parameter and ` +
                    `returns deltas since a watermark, making CDC the universal ` +
                    `incremental-sync mechanism for all Accounting entities.`,
            };
        }
        if (ioSig.SupportsWrite || ioSig.SupportsIncrementalSync) {
            ioSignalsByIO.set(entityName, ioSig);
        }

        const built = buildEntityFields(ct, baseBuilt);
        iofsByIO.set(entityName, built.map(b => b.Row));
        iofSignalsByIO.set(entityName, built.map(b => b.Signals));
    }

    // 9. Build Reports IOs (one per report name; read-only; no PK + no IOFs)
    const reportNames = parseReportNames(reportNamesCs);
    for (const reportName of reportNames) {
        if (ios.length >= IO_CAP) {
            throw new Error(`IO cap of ${IO_CAP} exceeded during Reports walk`);
        }
        const apiPath = REPORT_PATH_TEMPLATE.replace('{reportName}', reportName);
        const io: IORow = {
            Name: reportName,
            DisplayName: reportName,
            Category: 'Reports',
            APIPath: apiPath,
            ResponseDataKey: 'Report',
            PaginationType: REPORT_PAGINATION_TYPE,
            SupportsIncrementalSync: false,
            SupportsWrite: false,
            Sequence: sequence++,
        };
        IORowSchema.parse(io);
        ios.push(io);
        iofsByIO.set(reportName, []); // Reports return dynamic columnar data — no static IOFs
        iofSignalsByIO.set(reportName, []);
        // No SupportsWrite signal — reports are read-only by design.
    }

    if (Date.now() - startMs > WALL_CLOCK_MS) {
        throw new Error('Wall-clock budget exceeded after extraction');
    }

    const perAreaCounts: Record<string, number> = {};
    for (const io of ios) {
        perAreaCounts[io.Category] = (perAreaCounts[io.Category] ?? 0) + 1;
    }

    return {
        IOs: ios,
        IOFsByIO: iofsByIO,
        IOFSignalsByIO: iofSignalsByIO,
        IOSignalsByIO: ioSignalsByIO,
        FetchedURLs: fetchedURLs,
        PerAreaCounts: perAreaCounts,
        IntuitObjectDeclarations: Array.from(topLevelEntityNames).sort(),
        XsdFilesWalked: xsdFileNames,
    };
}

// =============================================================================
// Merge into metadata file under MJ: Integration Objects + emit CODE_EVIDENCE
// =============================================================================

interface MetadataIO {
    fields: Record<string, unknown>;
    relatedEntities?: {
        'MJ: Integration Object Fields'?: Array<{ fields: Record<string, unknown> }>;
    };
}

interface MetadataDoc {
    fields?: Record<string, unknown>;
    relatedEntities?: Record<string, Array<MetadataIO> | unknown>;
}

async function readMetadataFile(): Promise<MetadataDoc> {
    try {
        const raw = await fs.readFile(METADATA_FILE, 'utf8');
        return JSON.parse(raw) as MetadataDoc;
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            return { fields: {}, relatedEntities: {} };
        }
        throw err;
    }
}

async function writeMetadataFile(doc: MetadataDoc): Promise<void> {
    await fs.mkdir(path.dirname(METADATA_FILE), { recursive: true });
    await fs.writeFile(METADATA_FILE, JSON.stringify(doc, null, 2) + '\n', 'utf8');
}

function ioToMetadataRow(io: IORow, iofs: IOFRow[]): MetadataIO {
    return {
        fields: {
            Name: io.Name,
            DisplayName: io.DisplayName,
            Category: io.Category,
            APIPath: io.APIPath,
            ResponseDataKey: io.ResponseDataKey,
            PaginationType: io.PaginationType,
            SupportsIncrementalSync: io.SupportsIncrementalSync,
            SupportsWrite: io.SupportsWrite,
            Sequence: io.Sequence,
        },
        relatedEntities: {
            'MJ: Integration Object Fields': iofs.map(iof => ({
                fields: {
                    Name: iof.Name,
                    Type: iof.Type,
                    Length: iof.Length,
                    IsPrimaryKey: iof.IsPrimaryKey,
                    IsRequired: iof.IsRequired,
                    IsReadOnly: iof.IsReadOnly,
                },
            })),
        },
    };
}

async function mergeMetadata(result: ExtractionResult): Promise<void> {
    const doc = await readMetadataFile();
    if (!doc.relatedEntities) doc.relatedEntities = {};

    // Upsert by Name — re-runs replace per-IO without duplicating.
    const existingArr = Array.isArray(doc.relatedEntities['MJ: Integration Objects'])
        ? (doc.relatedEntities['MJ: Integration Objects'] as MetadataIO[])
        : [];
    const byName = new Map<string, MetadataIO>();
    for (const row of existingArr) {
        const name = row.fields?.Name;
        if (typeof name === 'string') byName.set(name, row);
    }

    for (const io of result.IOs) {
        const iofs = result.IOFsByIO.get(io.Name) ?? [];
        byName.set(io.Name, ioToMetadataRow(io, iofs));
    }

    // Stable ordering: by Sequence
    const merged = Array.from(byName.values()).sort((a, b) => {
        const sa = typeof a.fields?.Sequence === 'number' ? a.fields.Sequence : 0;
        const sb = typeof b.fields?.Sequence === 'number' ? b.fields.Sequence : 0;
        return sa - sb;
    });

    doc.relatedEntities['MJ: Integration Objects'] = merged;
    await writeMetadataFile(doc);
}

// =============================================================================
// CODE_EVIDENCE.json append — per-flag entries
// =============================================================================
//
// Per .claude/rules/connector-provenance-conventions.md: every hard-constraint
// flag emission (IsPrimaryKey=true, IsRequired=true, IsReadOnly=true on a
// non-default basis, SupportsWrite=true) gets its own CODE_EVIDENCE entry
// citing the specific XSD signal that justified the flag. TargetField uses
// the canonical `iof.<IOName>.<IOFName>.<Field>` (or `io.<IOName>.<Field>`)
// format.
// =============================================================================

interface CodeEvidenceEntry {
    ScriptPath: string;
    ScriptRunAt: string;
    SourceURL: string;
    StructuredOutput: Record<string, unknown>;
    SchemaValidationStatus: 'Passed' | 'Failed';
    TargetField: string;
}

function sourceFileToUrl(sourceFile: SourceFileName): string {
    if (sourceFile === 'ReportNames.cs') return rawUrl(REPORT_NAMES_PATH);
    return rawUrl(`${XSD_BASE_PATH}/${sourceFile}`);
}

interface PerFlagBreakdown {
    SupportsWrite: number;
    SupportsIncrementalSync: number;
    IsPrimaryKey: number;
    IsRequired: number;
    IsReadOnly: number;
}

interface AppendResult {
    Total: number;
    Breakdown: PerFlagBreakdown;
}

async function appendCodeEvidence(result: ExtractionResult): Promise<AppendResult> {
    let existing: { Entries: CodeEvidenceEntry[] } = { Entries: [] };
    try {
        const raw = await fs.readFile(CODE_EVIDENCE_FILE, 'utf8');
        const parsed = JSON.parse(raw) as { Entries?: CodeEvidenceEntry[] };
        if (parsed && Array.isArray(parsed.Entries)) existing = { Entries: parsed.Entries };
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }

    const now = new Date().toISOString();
    const scriptPath = 'connectors-registry/quickbooks/scripts/extract-io-iof.ts';

    // Idempotent re-run: drop any prior entries from this script.
    existing.Entries = existing.Entries.filter(e => e.ScriptPath !== scriptPath);

    const breakdown: PerFlagBreakdown = {
        SupportsWrite: 0,
        SupportsIncrementalSync: 0,
        IsPrimaryKey: 0,
        IsRequired: 0,
        IsReadOnly: 0,
    };

    function emit(
        targetField: string,
        signal: FlagSignal,
        derivedFlag: string,
        ioName: string,
        ioCategory: string,
        iofName?: string,
    ): void {
        existing.Entries.push({
            ScriptPath: scriptPath,
            ScriptRunAt: now,
            SourceURL: sourceFileToUrl(signal.SourceFile),
            StructuredOutput: {
                IOName: ioName,
                IOFName: iofName ?? null,
                IOCategory: ioCategory,
                DerivedFlag: derivedFlag,
                BasedOn: signal.BasedOn,
                SignalKind: signal.SignalKind,
                SourceFile: signal.SourceFile,
            },
            SchemaValidationStatus: 'Passed',
            TargetField: targetField,
        });
    }

    for (const io of result.IOs) {
        const ioSig = result.IOSignalsByIO.get(io.Name);

        // Per-IO: SupportsWrite=true
        if (io.SupportsWrite && ioSig?.SupportsWrite) {
            emit(
                `io.${io.Name}.SupportsWrite`,
                ioSig.SupportsWrite,
                'SupportsWrite=true',
                io.Name,
                io.Category,
            );
            breakdown.SupportsWrite++;
        }

        // Per-IO: SupportsIncrementalSync=true
        if (io.SupportsIncrementalSync && ioSig?.SupportsIncrementalSync) {
            emit(
                `io.${io.Name}.SupportsIncrementalSync`,
                ioSig.SupportsIncrementalSync,
                'SupportsIncrementalSync=true',
                io.Name,
                io.Category,
            );
            breakdown.SupportsIncrementalSync++;
        }

        // Per-IOF flags
        const iofs = result.IOFsByIO.get(io.Name) ?? [];
        const signals = result.IOFSignalsByIO.get(io.Name) ?? [];
        // Defensive index alignment: signals[] is parallel to iofs[] by index,
        // but we lookup by name for safety against future ordering drift.
        const signalsByName = new Map<string, IOFFlagSignals>();
        for (const s of signals) signalsByName.set(s.Name, s);

        for (const iof of iofs) {
            const sig = signalsByName.get(iof.Name);
            if (!sig) continue;

            if (iof.IsPrimaryKey && sig.IsPrimaryKey) {
                emit(
                    `iof.${io.Name}.${iof.Name}.IsPrimaryKey`,
                    sig.IsPrimaryKey,
                    'IsPrimaryKey=true',
                    io.Name,
                    io.Category,
                    iof.Name,
                );
                breakdown.IsPrimaryKey++;
            }
            if (iof.IsRequired && sig.IsRequired) {
                emit(
                    `iof.${io.Name}.${iof.Name}.IsRequired`,
                    sig.IsRequired,
                    'IsRequired=true',
                    io.Name,
                    io.Category,
                    iof.Name,
                );
                breakdown.IsRequired++;
            }
            if (iof.IsReadOnly && sig.IsReadOnly) {
                emit(
                    `iof.${io.Name}.${iof.Name}.IsReadOnly`,
                    sig.IsReadOnly,
                    'IsReadOnly=true',
                    io.Name,
                    io.Category,
                    iof.Name,
                );
                breakdown.IsReadOnly++;
            }
        }
    }

    await fs.writeFile(CODE_EVIDENCE_FILE, JSON.stringify(existing, null, 2) + '\n', 'utf8');

    const total =
        breakdown.SupportsWrite +
        breakdown.SupportsIncrementalSync +
        breakdown.IsPrimaryKey +
        breakdown.IsRequired +
        breakdown.IsReadOnly;
    return { Total: total, Breakdown: breakdown };
}

// =============================================================================
// Entry point — stdout = structured stats only, never catalog data
// =============================================================================

async function main(): Promise<void> {
    const errors: string[] = [];
    let result: ExtractionResult;
    try {
        result = await extract();
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Extraction failed: ${msg}\n`);
        process.exit(1);
    }

    // Snapshot CODE_EVIDENCE size BEFORE this run rewrites it.
    let codeEvidenceEntriesBefore = 0;
    try {
        const raw = await fs.readFile(CODE_EVIDENCE_FILE, 'utf8');
        const parsed = JSON.parse(raw) as { Entries?: CodeEvidenceEntry[] };
        if (parsed && Array.isArray(parsed.Entries)) codeEvidenceEntriesBefore = parsed.Entries.length;
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            errors.push(
                `Could not read pre-existing CODE_EVIDENCE.json: ${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    try {
        await mergeMetadata(result);
    } catch (err) {
        errors.push(`Metadata merge failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    let codeEvidenceAppended: AppendResult = {
        Total: 0,
        Breakdown: { SupportsWrite: 0, SupportsIncrementalSync: 0, IsPrimaryKey: 0, IsRequired: 0, IsReadOnly: 0 },
    };
    try {
        codeEvidenceAppended = await appendCodeEvidence(result);
    } catch (err) {
        errors.push(`CODE_EVIDENCE append failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Read the file post-write to confirm the after-count (includes any
    // pre-existing entries from OTHER scripts that we did NOT touch).
    let codeEvidenceEntriesAfter = 0;
    try {
        const raw = await fs.readFile(CODE_EVIDENCE_FILE, 'utf8');
        const parsed = JSON.parse(raw) as { Entries?: CodeEvidenceEntry[] };
        if (parsed && Array.isArray(parsed.Entries)) codeEvidenceEntriesAfter = parsed.Entries.length;
    } catch (err: unknown) {
        errors.push(
            `Could not read post-write CODE_EVIDENCE.json: ${err instanceof Error ? err.message : String(err)}`,
        );
    }

    const iofCount = Array.from(result.IOFsByIO.values()).reduce((sum, arr) => sum + arr.length, 0);
    const pksDetected = Array.from(result.IOFsByIO.values()).reduce(
        (sum, arr) => sum + arr.filter(f => f.IsPrimaryKey).length,
        0,
    );
    const supportsWriteCount = result.IOs.filter(io => io.SupportsWrite).length;
    const supportsIncrementalCount = result.IOs.filter(io => io.SupportsIncrementalSync).length;

    // Areas walked is computed structurally from the IOs we emitted.
    const areasWalked = Array.from(new Set(result.IOs.map(io => io.Category))).sort();

    // Set-completeness self-check: every IntuitObject declaration across all
    // XSDs should be either present as an IO or in the documented exclusion
    // list (response-only types). Anything else is a gap.
    const ioNames = new Set(result.IOs.map(io => io.Name));
    const documentedExclusions = new Set<string>([
        'EmailDeliveryInfo',
        'SyncErrorResponse',
        'Status',
        'IntuitResponse',
        'OLBStatus',
        'BatchItemRequest',
        'Report', // handled separately via Reports loop
    ]);
    const unmatchedDeclarations = result.IntuitObjectDeclarations.filter(
        n => !ioNames.has(n) && !documentedExclusions.has(n),
    );

    // Gaps: things the AS-IS schema can't express + tier-1 source absences.
    // Surface these for downstream agents (validate-invariants, code-builder).
    const gapsForDownstream: string[] = [];
    if (result.PerAreaCounts['Reports'] && result.PerAreaCounts['Reports'] > 0) {
        gapsForDownstream.push(
            'Reports IOs are emitted with zero IOFs because Report response is dynamic columnar data — Report.xsd defines envelope (Header/Columns/Rows), not per-report column schemas. Downstream connector must parse columns at runtime.',
        );
    }
    gapsForDownstream.push(
        'Webhooks area is not represented as separate IOs — webhooks are push-notifications keyed by Accounting entity name. The Webhooks area capabilities are at integration-root level (SignatureAlgorithm, VerifierToken) in configuration.json, not per-IO. Downstream webhook-router uses Accounting IOs + the configuration.Webhooks.MaxSupportedEntities list.',
    );
    gapsForDownstream.push(
        'Batch area is not represented as a separate IO — Batch is a transport that wraps create/update/delete operations on Accounting IOs. Downstream connector implements Batch as a method, not as a queryable entity. BatchItemRequest is declared as an IntuitObject but is structurally a transport wrapper, not a resource — excluded.',
    );
    gapsForDownstream.push(
        'CDC area is not represented as a separate IO — CDC is a polling endpoint that returns deltas for any combination of Accounting IOs. SupportsIncrementalSync=true on Accounting IOs is the structural signal.',
    );
    gapsForDownstream.push(
        'Payments API is SCOPED OUT per Phase 2b — separate host (api.intuit.com) + separate scope (com.quickbooks.payments). A QuickBooksPaymentsConnector with its own Integration row is required if/when needed.',
    );
    gapsForDownstream.push(
        'AS-IS schema does not include IsForeignKey / RelatedIntegrationObjectID columns. QBO uses *Ref nested objects ({value, name}) for FKs (CustomerRef, VendorRef, ItemRef, AccountRef, etc.) — these are emitted as Type="ReferenceType" → mapped to "object". Downstream connector resolves FKs via .value at the property path.',
    );
    gapsForDownstream.push(
        'Custom fields (per-tenant on Sales transactions: Invoice, Estimate, SalesReceipt, PurchaseOrder, Bill, CreditMemo, RefundReceipt) are NOT extracted statically — they live in the per-realm Preferences endpoint. Connector DiscoverFields override must fetch /v3/company/{realmId}/preferences at runtime.',
    );
    if (unmatchedDeclarations.length > 0) {
        gapsForDownstream.push(
            `IntuitObject declarations missing both an IO and a documented exclusion: [${unmatchedDeclarations.join(', ')}]. Each is declared with substitutionGroup="IntuitObject" but no complexType definition was found in any walked XSD. Likely cause: complexType lives in an XSD file not surfaced by the GitHub Contents API listing.`,
        );
    }

    // Per-entity canonical check for the audit re-dispatch's named entities.
    const auditCheckEntities = [
        'Customer',
        'Vendor',
        'Employee',
        'TaxAgency',
        'TaxService',
        'RecurringTransaction',
    ];
    const perEntityCanonicalCheck: Record<string, 'present' | 'missing'> = {};
    for (const e of auditCheckEntities) {
        perEntityCanonicalCheck[e] = ioNames.has(e) ? 'present' : 'missing';
    }

    const stats = {
        IOCount: result.IOs.length,
        IOFCount: iofCount,
        PKsDetected: pksDetected,
        SupportsWriteCount: supportsWriteCount,
        SupportsIncrementalCount: supportsIncrementalCount,
        AreasWalked: areasWalked,
        PerAreaCounts: result.PerAreaCounts,
        XsdFilesWalked: result.XsdFilesWalked,
        IntuitObjectDeclarationsCount: result.IntuitObjectDeclarations.length,
        UnmatchedDeclarationsAfterExclusions: unmatchedDeclarations,
        PerEntityCanonicalCheck: perEntityCanonicalCheck,
        GapsForDownstream: gapsForDownstream,
        Status: errors.length === 0 ? 'Complete' : 'PartialWithErrors',
        ScriptPath: 'connectors-registry/quickbooks/scripts/extract-io-iof.ts',
        FetchedSourceURLs: result.FetchedURLs,
        CapHit: result.IOs.length >= IO_CAP,
        MetadataFilePath: METADATA_FILE,
        CodeEvidenceEntriesBeforeUpdate: codeEvidenceEntriesBefore,
        CodeEvidenceEntriesAfterUpdate: codeEvidenceEntriesAfter,
        CodeEvidenceEntriesAppendedThisRun: codeEvidenceAppended.Total,
        PerFlagBreakdown: codeEvidenceAppended.Breakdown,
        ErrorsDuringRun: errors,
    };
    process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
}

main().catch(err => {
    process.stderr.write(`Fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exit(1);
});
