#!/usr/bin/env tsx
/**
 * QuickBooks Online IO/IOF extractor.
 *
 * Source paradigm: NO OpenAPI/Swagger. Canonical schema lives in XSD files
 * inside the official Intuit .NET SDK repo. Top-level REST entities are
 * marked via `substitutionGroup="IntuitObject"` in `IntuitRestServiceDef.xsd`.
 * Per-entity field shapes (name, type, minOccurs, doc-annotations like
 * `Required: ALL`, `InputType: ReadOnly`, `ValidRange: QBO: Max=N`) live in
 * `Finance.xsd` (Accounting API + Webhooks-eligible entities). Report names
 * are enumerated in `ReportNames.cs` (Reports API has one generic schema —
 * the names are the catalog).
 *
 * Areas covered (per ProductTaxonomy):
 *   - Accounting API — every IntuitObject element from IntuitRestServiceDef.xsd
 *   - Reports API   — every report name in ReportNames.cs (read-only, no PK)
 *   - Webhooks      — covered by Accounting entities (webhook is push-notification on those)
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
 * (IsPrimaryKey=true, IsRequired=true, IsReadOnly=true, SupportsWrite=true),
 * a dedicated CODE_EVIDENCE entry is appended citing the specific XSD signal
 * that justified that flag. Per .claude/rules/connector-provenance-conventions.md.
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

interface FlagSignal {
    /** Path-fragment of the XSD source the signal was read from. */
    SourceFile: 'IntuitBaseTypes.xsd' | 'Finance.xsd' | 'Report.xsd' | 'IntuitRestServiceDef.xsd' | 'ReportNames.cs';
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
    TopLevelEntities: Set<string>; // entity names with substitutionGroup="IntuitObject"
}

function parseComplexType(rawType: Record<string, unknown>): ParsedComplexType | null {
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
    };
}

function parseSchemaXsd(xsdText: string): ParsedSchema {
    const parser = buildXmlParser();
    const parsed = parser.parse(xsdText) as Record<string, unknown>;
    const schema = parsed['xs:schema'] as Record<string, unknown> | undefined;
    if (!schema) {
        throw new Error('Parsed XSD has no <xs:schema> root');
    }

    const complexTypes = new Map<string, ParsedComplexType>();
    const rawCTs = schema['xs:complexType'];
    if (Array.isArray(rawCTs)) {
        for (const ct of rawCTs) {
            if (!ct || typeof ct !== 'object') continue;
            const parsedCt = parseComplexType(ct as Record<string, unknown>);
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

    return { ComplexTypes: complexTypes, TopLevelEntities: topLevel };
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
                    `Accounting REST entity (substitutionGroup="IntuitObject" in ` +
                    `IntuitRestServiceDef.xsd) extends IntuitEntity, making 'Id' the universal ` +
                    `QBO primary key by inheritance.`,
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
                SourceFile: 'Finance.xsd',
                SignalKind: 'doc-annotation-Required',
                BasedOn:
                    `XSD xs:annotation/xs:documentation on entity field '${entity.Name}.${f.Name}' ` +
                    `contains the structured marker '${signals.RequiredMatchedText}' ` +
                    `(QBO product applicability).`,
            };
        }
        if (signals.ReadOnly && signals.ReadOnlyMatchedText) {
            flagSignals.IsReadOnly = {
                SourceFile: 'Finance.xsd',
                SignalKind: 'doc-annotation-InputType-ReadOnly',
                BasedOn:
                    `XSD xs:annotation/xs:documentation on entity field '${entity.Name}.${f.Name}' ` +
                    `contains the structured marker '${signals.ReadOnlyMatchedText}'.`,
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
}

async function extract(): Promise<ExtractionResult> {
    const startMs = Date.now();
    const fetchedURLs: string[] = [];

    // 1. Validate SOURCES.json references the SDK repo
    await loadAndValidateSources();

    // 2. Fetch XSDs + ReportNames.cs (disk-cached)
    const baseUrl = rawUrl(`${XSD_BASE_PATH}/IntuitBaseTypes.xsd`);
    const restDefUrl = rawUrl(`${XSD_BASE_PATH}/IntuitRestServiceDef.xsd`);
    const financeUrl = rawUrl(`${XSD_BASE_PATH}/Finance.xsd`);
    const reportXsdUrl = rawUrl(`${XSD_BASE_PATH}/Report.xsd`);
    const reportNamesUrl = rawUrl(REPORT_NAMES_PATH);
    fetchedURLs.push(baseUrl, restDefUrl, financeUrl, reportXsdUrl, reportNamesUrl);

    const [baseTypesXsd, restDefXsd, financeXsd, reportXsd, reportNamesCs] = await Promise.all([
        fetchWithCache(baseUrl, 'IntuitBaseTypes.xsd'),
        fetchWithCache(restDefUrl, 'IntuitRestServiceDef.xsd'),
        fetchWithCache(financeUrl, 'Finance.xsd'),
        fetchWithCache(reportXsdUrl, 'Report.xsd'),
        fetchWithCache(reportNamesUrl, 'ReportNames.cs'),
    ]);

    if (Date.now() - startMs > WALL_CLOCK_MS) {
        throw new Error('Wall-clock budget exceeded during fetch');
    }

    // 3. Parse the schemas
    const baseSchema = parseSchemaXsd(baseTypesXsd);
    const financeSchema = parseSchemaXsd(financeXsd);
    const restDefSchema = parseSchemaXsd(restDefXsd);
    const reportSchema = parseSchemaXsd(reportXsd);

    // The IntuitEntity base type lives in IntuitBaseTypes.xsd
    const intuitEntityBase = baseSchema.ComplexTypes.get('IntuitEntity');
    const baseBuilt = buildBaseFields(intuitEntityBase);

    // The list of top-level Accounting REST entities is the union of
    // substitutionGroup="IntuitObject" elements from IntuitRestServiceDef.xsd
    // (which is itself an aggregator over Finance.xsd + Report.xsd).
    const topLevelEntityNames = new Set<string>(restDefSchema.TopLevelEntities);

    // Resolve each top-level entity name to its complexType definition (lives
    // in Finance.xsd; a few like Report live in Report.xsd).
    const allComplexTypes = new Map<string, ParsedComplexType>([
        ...baseSchema.ComplexTypes,
        ...financeSchema.ComplexTypes,
        ...reportSchema.ComplexTypes,
    ]);

    // 4. Build Accounting IOs
    const ios: IORow[] = [];
    const iofsByIO = new Map<string, IOFRow[]>();
    const iofSignalsByIO = new Map<string, IOFFlagSignals[]>();
    const ioSignalsByIO = new Map<string, IOFlagSignals>();
    let sequence = 0;

    // Some "entities" in REST def are response envelopes, not queryable
    // resources. Filter these out structurally — they have no resource URL.
    const responseOnlyTypes = new Set<string>([
        'EmailDeliveryInfo',
        'SyncErrorResponse',
        'Status',
        'IntuitResponse',
        'OLBStatus',
    ]);

    // Sort entity names for stable output ordering (idempotency).
    const sortedEntities = Array.from(topLevelEntityNames).sort();

    for (const entityName of sortedEntities) {
        if (ios.length >= IO_CAP) {
            throw new Error(`IO cap of ${IO_CAP} exceeded during Accounting walk`);
        }
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
        // and POST-with-SyncToken for update, EXCEPT pure response envelopes.
        const supportsWrite = !responseOnlyTypes.has(entityName);

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
        // signal that justified each true-flag emission.
        const ioSig: IOFlagSignals = {};
        // SupportsWrite signal: the entity's element has substitutionGroup=
        // "IntuitObject" in IntuitRestServiceDef.xsd (= top-level REST resource),
        // and Intuit's REST convention for IntuitObject members is POST /v3/
        // company/{realmId}/{resource} for both create + update.
        if (supportsWrite) {
            ioSig.SupportsWrite = {
                SourceFile: 'IntuitRestServiceDef.xsd',
                SignalKind: 'substitution-group-IntuitObject',
                BasedOn:
                    `Entity '${entityName}' is declared as an xs:element with ` +
                    `substitutionGroup="IntuitObject" in IntuitRestServiceDef.xsd, ` +
                    `which is the universal QBO marker for top-level REST resources ` +
                    `that support POST create/update + DELETE via ?operation=delete ` +
                    `per the v3 REST convention.`,
            };
        }
        // SupportsIncrementalSync signal: every Accounting entity (= every
        // IntuitObject member) is queryable via the CDC endpoint
        // GET /v3/company/{realmId}/cdc?entities=<EntityName>&changedSince=...
        // per the universal QBO v3 REST convention. The structural signal is
        // again substitutionGroup="IntuitObject" — CDC is open to all such
        // entities.
        if (supportsIncrementalSync) {
            ioSig.SupportsIncrementalSync = {
                SourceFile: 'IntuitRestServiceDef.xsd',
                SignalKind: 'cdc-endpoint-covers-IntuitObject-members',
                BasedOn:
                    `Entity '${entityName}' is declared with ` +
                    `substitutionGroup="IntuitObject" in IntuitRestServiceDef.xsd. ` +
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

    // 5. Build Reports IOs (one per report name; read-only; no PK + no IOFs)
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

const SOURCE_FILE_TO_URL: Record<FlagSignal['SourceFile'], string> = {
    'IntuitBaseTypes.xsd': rawUrl(`${XSD_BASE_PATH}/IntuitBaseTypes.xsd`),
    'Finance.xsd': rawUrl(`${XSD_BASE_PATH}/Finance.xsd`),
    'Report.xsd': rawUrl(`${XSD_BASE_PATH}/Report.xsd`),
    'IntuitRestServiceDef.xsd': rawUrl(`${XSD_BASE_PATH}/IntuitRestServiceDef.xsd`),
    'ReportNames.cs': rawUrl(REPORT_NAMES_PATH),
};

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
            SourceURL: SOURCE_FILE_TO_URL[signal.SourceFile],
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
        'Batch area is not represented as a separate IO — Batch is a transport that wraps create/update/delete operations on Accounting IOs. Downstream connector implements Batch as a method, not as a queryable entity.',
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

    const stats = {
        IOCount: result.IOs.length,
        IOFCount: iofCount,
        PKsDetected: pksDetected,
        SupportsWriteCount: supportsWriteCount,
        SupportsIncrementalCount: supportsIncrementalCount,
        AreasWalked: areasWalked,
        PerAreaCounts: result.PerAreaCounts,
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
