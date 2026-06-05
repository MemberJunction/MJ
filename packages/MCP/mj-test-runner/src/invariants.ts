/**
 * T1_InvariantValidator — deterministic structural-invariant checks for a
 * freshly-built connector.
 *
 * This module replaces the phantom `npx mj-validate-invariants` bin. Per the
 * testing-agent spec (`.claude/agents/testing-agent.md` §T1_InvariantValidator),
 * T1 was "inlined into this tier (formerly the retired `connector-validator`
 * package); now run as deterministic JS checks". This module IS that inline
 * implementation.
 *
 * Four invariants are checked (all pure / synchronous file reads):
 *  1. Three-way name match  — connector `.ts` `IntegrationName` getter, the
 *     `@RegisterClass` driver string, and the metadata Integration-root match.
 *  2. FK metadata correctness — every FK IOF's `RelatedIntegrationObjectID`
 *     `@lookup:` reference resolves against the emitted Integration-Object set.
 *  3. Capability ↔ method match — every IO declaring a write capability has the
 *     corresponding per-operation API path.
 *  4. PK/FK source-check matrix consistency (Gap 10) — every IO with a primary
 *     key has ≥ 1 source-check `yes` in EXTRACTION_REPORT_MATRIX, and the PK
 *     defer-rate across all IOs is ≤ 50%.
 *
 * Field names are taken from the real connector metadata file shape (verified
 * against `metadata/integrations/yourmembership/.yourmembership.integration.json`
 * and the `MJ: Integration Objects` / `MJ: Integration Object Fields` entity
 * schemas in `packages/MJCoreEntities/src/generated/entity_subclasses.ts`).
 *
 * @see .claude/agents/testing-agent.md §T1_InvariantValidator (lines 69-73)
 * @see .claude/rules/extractor-script-conventions.md § "Source-check matrix output"
 * @see packages/Integration/connector-builder-workshop/primitives/floor-check.workflow.js
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Public result contract ───────────────────────────────────────────

/** Status of the overall T1 run or any individual sub-check. */
export type InvariantStatus = 'Pass' | 'Fail';

/** A single structural finding produced by one of the four checks. */
export interface InvariantFinding {
    /** Which invariant raised this finding (e.g. `'ThreeWayName'`). */
    Check: string;
    /** Where the problem is (file path, IO name, or IOF locus). */
    Locus: string;
    /** Human-readable, non-secret description of the failure. */
    Summary: string;
}

/** Per-check structured outcome aggregated by {@link ValidateInvariants}. */
export interface InvariantCheckResult {
    Check: string;
    Status: InvariantStatus;
    Findings: InvariantFinding[];
}

/**
 * Aggregate result of running all four T1 invariants. The shape is designed to
 * map cleanly onto the test-runner's `TierHandlerResult` (Status / Output /
 * Errors / Details) with no casting.
 */
export interface InvariantValidationResult {
    Status: InvariantStatus;
    /** One-line-per-check human summary, suitable for the tier `Output` field. */
    Output: string;
    /** Flattened finding summaries, suitable for the tier `Errors` field. */
    Errors: string[];
    /** Structured per-check breakdown for programmatic consumers. */
    Details: Record<string, unknown>;
}

// ── Local metadata interfaces (NOT re-exported from mj-metadata) ──────
// Defined locally per the no-cross-package-re-export rule. They mirror the
// documented IntegrationMetadataFile shape but only the fields T1 reads.

/** A single `MJ: Integration Object Fields` row's `fields` block. */
interface IOFFields {
    Name?: string;
    IsPrimaryKey?: boolean;
    IsForeignKey?: boolean;
    RelatedIntegrationObjectID?: string | null;
    [key: string]: unknown;
}

/** A single `MJ: Integration Objects` row's `fields` block. */
interface IOFields {
    Name?: string;
    SupportsCreate?: boolean;
    SupportsUpdate?: boolean;
    SupportsDelete?: boolean;
    SupportsWrite?: boolean;
    CreateAPIPath?: string | null;
    UpdateAPIPath?: string | null;
    DeleteAPIPath?: string | null;
    [key: string]: unknown;
}

/** An IO node: its `fields` plus nested IOF rows. */
interface IONode {
    fields: IOFields;
    relatedEntities?: {
        'MJ: Integration Object Fields'?: Array<{ fields: IOFFields }>;
    };
}

/** Root integration metadata file shape (the subset T1 reads). */
interface IntegrationFile {
    fields: {
        Name?: string;
        ClassName?: string;
        [key: string]: unknown;
    };
    relatedEntities?: {
        'MJ: Integration Objects'?: IONode[];
    };
}

/**
 * The metadata file may be a single integration object or an array of them
 * (the mj-sync push convention emits a top-level array — see the real
 * `.yourmembership.integration.json`). We normalise to a single root.
 */
type MetadataFileContent = IntegrationFile | IntegrationFile[];

// ── Top-level aggregator ─────────────────────────────────────────────

/**
 * Run all four T1 structural invariants against a connector and aggregate the
 * results. Pure / deterministic: reads files synchronously, performs no network
 * or process calls.
 *
 * @param connector the registry directory name of the connector (e.g. `hubspot`)
 * @param registryRoot absolute path to the connectors-registry root
 * @returns an {@link InvariantValidationResult} — `Status: 'Fail'` if ANY check fails
 */
export function ValidateInvariants(connector: string, registryRoot: string): InvariantValidationResult {
    const integration = loadIntegrationFile(connector, registryRoot);
    if (!integration) {
        const summary = `No connector metadata file found for "${connector}" under ${resolve(registryRoot, connector)}`;
        return {
            Status: 'Fail',
            Output: summary,
            Errors: [summary],
            Details: { connector, metadataFileFound: false },
        };
    }

    const ios = integration.relatedEntities?.['MJ: Integration Objects'] ?? [];
    const checks: InvariantCheckResult[] = [
        checkThreeWayName(connector, registryRoot, integration),
        checkForeignKeyResolution(ios),
        checkCapabilityMethodMatch(ios),
        checkPkSourceMatrix(connector, registryRoot, ios),
    ];

    return aggregate(connector, checks);
}

/** Fold the four per-check results into the single tier-shaped result. */
function aggregate(connector: string, checks: InvariantCheckResult[]): InvariantValidationResult {
    const failed = checks.filter((c) => c.Status === 'Fail');
    const allFindings = checks.flatMap((c) => c.Findings);
    const output = checks
        .map((c) => `${c.Status === 'Pass' ? 'PASS' : 'FAIL'} ${c.Check}: ${c.Findings.length} finding(s)`)
        .join('\n');

    return {
        Status: failed.length === 0 ? 'Pass' : 'Fail',
        Output: output,
        Errors: allFindings.map((f) => `[${f.Check}] ${f.Locus}: ${f.Summary}`),
        Details: {
            connector,
            checks: checks.map((c) => ({ check: c.Check, status: c.Status, findings: c.Findings })),
        },
    };
}

// ── Check 1: Three-way name match ────────────────────────────────────

/**
 * Verify the connector identity is consistent across the connector `.ts`
 * source, the `@RegisterClass` decorator, and the metadata root.
 *
 * RECONSTRUCTED-ASSUMPTION: the spec (testing-agent.md line 70) states the
 * `IntegrationName` getter, the `@RegisterClass` driver string, and the
 * metadata `Name` must be "byte-identical". However every shipping connector
 * (and `connector-code-conventions.md` line 13-14) uses the `@RegisterClass`
 * driver string as the CLASS name (e.g. `'SalesforceConnector'`) while
 * `IntegrationName` returns the integration name (`'Salesforce'`). A literal
 * three-identical check would red-flag every real connector. We therefore
 * enforce the two genuine couplings the model actually maintains:
 *   (a) `IntegrationName` getter === metadata `fields.Name`, AND
 *   (b) `@RegisterClass` driver === parsed `class X` name === metadata `fields.ClassName`.
 * The connector `.ts` is optional — when absent (metadata-only run) only the
 * cross-file couplings that can be evaluated are checked, and a finding records
 * the missing source so the gap is visible rather than silently passed.
 */
function checkThreeWayName(connector: string, registryRoot: string, integration: IntegrationFile): InvariantCheckResult {
    const findings: InvariantFinding[] = [];
    const metaName = integration.fields.Name;
    const metaClassName = integration.fields.ClassName;

    const tsPath = findConnectorSourcePath(connector, registryRoot, metaClassName);
    if (!tsPath) {
        findings.push({
            Check: 'ThreeWayName',
            Locus: resolve(registryRoot, connector),
            Summary: `Connector .ts source not found (looked for ${metaClassName ?? '<ClassName>'} under src/); cannot verify IntegrationName getter / @RegisterClass driver against metadata.`,
        });
        return finalize('ThreeWayName', findings);
    }

    const src = readFileSync(tsPath, 'utf-8');
    const parsed = parseConnectorIdentity(src);

    addNameMismatchFinding(findings, tsPath, 'IntegrationName getter', parsed.IntegrationName, 'metadata fields.Name', metaName);
    addNameMismatchFinding(findings, tsPath, '@RegisterClass driver', parsed.RegisterClassDriver, 'metadata fields.ClassName', metaClassName);

    if (parsed.RegisterClassDriver && parsed.ClassName && parsed.RegisterClassDriver !== parsed.ClassName) {
        findings.push({
            Check: 'ThreeWayName',
            Locus: tsPath,
            Summary: `@RegisterClass driver "${parsed.RegisterClassDriver}" does not match declared class name "${parsed.ClassName}".`,
        });
    }

    return finalize('ThreeWayName', findings);
}

/** Push a finding when a parsed identity value disagrees with its metadata counterpart. */
function addNameMismatchFinding(
    findings: InvariantFinding[],
    locus: string,
    leftLabel: string,
    leftValue: string | undefined,
    rightLabel: string,
    rightValue: string | undefined,
): void {
    if (leftValue == null) {
        findings.push({ Check: 'ThreeWayName', Locus: locus, Summary: `Could not parse ${leftLabel} from connector source.` });
        return;
    }
    if (rightValue == null) {
        findings.push({ Check: 'ThreeWayName', Locus: locus, Summary: `${rightLabel} is missing from metadata; cannot match against ${leftLabel} "${leftValue}".` });
        return;
    }
    if (leftValue !== rightValue) {
        findings.push({
            Check: 'ThreeWayName',
            Locus: locus,
            Summary: `${leftLabel} "${leftValue}" !== ${rightLabel} "${rightValue}" (must be byte-identical).`,
        });
    }
}

/** Parsed identity values from a connector `.ts` source string. */
interface ConnectorIdentity {
    IntegrationName?: string;
    RegisterClassDriver?: string;
    ClassName?: string;
}

/**
 * Parse the connector identity tokens from source text without an AST:
 *  - the `IntegrationName` getter return literal,
 *  - the second string arg of `@RegisterClass(Base, '<driver>')`,
 *  - the declared `class X` name.
 */
function parseConnectorIdentity(src: string): ConnectorIdentity {
    return {
        IntegrationName: matchFirstGroup(src, /get\s+IntegrationName\s*\(\s*\)\s*:\s*string\s*\{\s*return\s*(['"`])([^'"`]*)\1/),
        RegisterClassDriver: matchRegisterClassDriver(src),
        ClassName: matchFirstGroup(src, /class\s+([A-Za-z_$][\w$]*)\s+extends\b/),
    };
}

/**
 * Extract the driver string (2nd argument) from a `@RegisterClass(...)` call.
 * Tolerates whitespace/newlines between the base-class arg and the driver
 * literal, and either quote style.
 */
function matchRegisterClassDriver(src: string): string | undefined {
    const m = src.match(/@RegisterClass\s*\(\s*[A-Za-z_$][\w$.]*\s*,\s*(['"`])([^'"`]*)\1/);
    return m ? m[2] : undefined;
}

/** Generic first-capture-group matcher. `IntegrationName` uses group 2 (quote is group 1). */
function matchFirstGroup(src: string, re: RegExp): string | undefined {
    const m = src.match(re);
    if (!m) return undefined;
    // For the IntegrationName regex the value is group 2; for the class regex it is group 1.
    return m[2] !== undefined ? m[2] : m[1];
}

// ── Check 2: FK metadata correctness ─────────────────────────────────

/**
 * For every IOF that is a foreign key, resolve its `RelatedIntegrationObjectID`
 * `@lookup:` reference against the emitted IO set (matched by IO `Name`,
 * case-insensitively). An IOF is treated as an FK when `IsForeignKey===true`
 * (the metadata-file flag) OR `RelatedIntegrationObjectID` is set (the persisted
 * entity column whose own description reads "Foreign key to another
 * IntegrationObject"). Either signal demands a resolvable target.
 */
function checkForeignKeyResolution(ios: IONode[]): InvariantCheckResult {
    const findings: InvariantFinding[] = [];
    const ioNames = new Set(ios.map((io) => (io.fields.Name ?? '').toLowerCase()).filter((n) => n.length > 0));

    for (const io of ios) {
        const ioName = io.fields.Name ?? '<unnamed-IO>';
        const iofs = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
        for (const iof of iofs) {
            const f = iof.fields;
            const isFk = f.IsForeignKey === true || (f.RelatedIntegrationObjectID != null && f.RelatedIntegrationObjectID !== '');
            if (!isFk) continue;

            const locus = `${ioName}.${f.Name ?? '<unnamed-IOF>'}`;
            if (f.RelatedIntegrationObjectID == null || f.RelatedIntegrationObjectID === '') {
                findings.push({ Check: 'ForeignKeyResolution', Locus: locus, Summary: 'IsForeignKey=true but RelatedIntegrationObjectID is null/empty.' });
                continue;
            }
            const target = extractLookupObjectName(f.RelatedIntegrationObjectID);
            if (!target) {
                findings.push({ Check: 'ForeignKeyResolution', Locus: locus, Summary: `Could not parse a target IO Name from RelatedIntegrationObjectID "${f.RelatedIntegrationObjectID}".` });
                continue;
            }
            if (!ioNames.has(target.toLowerCase())) {
                findings.push({ Check: 'ForeignKeyResolution', Locus: locus, Summary: `FK target IO "${target}" is not in the emitted Integration-Object set.` });
            }
        }
    }

    return finalize('ForeignKeyResolution', findings);
}

/**
 * Extract the top-level `Name=<value>` predicate of an
 * `@lookup:MJ: Integration Objects.<predicates>` reference. Predicates are
 * `&`-separated `key=value` pairs and may appear in any order, e.g. both
 * `...Name=AmsEvent&IntegrationID=@lookup:...` and
 * `...IntegrationID=@lookup:...Name=YourMembership&Name=Member` are valid.
 *
 * The nested `IntegrationID=@lookup:MJ: Integrations.Name=...` value also
 * contains a `Name=` token, but it lives INSIDE a single `&`-segment value
 * (the nested lookup carries no `&` of its own in the canonical form), so a
 * top-level `&`-split followed by a key==`Name` match never picks it up.
 *
 * @returns the target IO name, or `undefined` if not parseable
 */
function extractLookupObjectName(lookup: string): string | undefined {
    if (!lookup.startsWith('@lookup:')) return undefined;
    const dot = lookup.indexOf('.');
    if (dot < 0) return undefined;
    const predicateString = lookup.slice(dot + 1);

    for (const segment of predicateString.split('&')) {
        const eq = segment.indexOf('=');
        if (eq < 0) continue;
        const key = segment.slice(0, eq).trim();
        if (key === 'Name') {
            const value = segment.slice(eq + 1).trim();
            return value.length > 0 ? value : undefined;
        }
    }
    return undefined;
}

// ── Check 3: Capability ↔ method match ───────────────────────────────

/**
 * For every IO declaring a write capability, confirm the matching per-operation
 * API path is non-null: `SupportsCreate`→`CreateAPIPath`, `SupportsUpdate`→
 * `UpdateAPIPath`, `SupportsDelete`→`DeleteAPIPath`. These field names are the
 * ones the real connector metadata files emit (verified against
 * `.yourmembership.integration.json`).
 */
function checkCapabilityMethodMatch(ios: IONode[]): InvariantCheckResult {
    const findings: InvariantFinding[] = [];
    const ops: Array<{ flag: keyof IOFields; path: keyof IOFields; label: string }> = [
        { flag: 'SupportsCreate', path: 'CreateAPIPath', label: 'Create' },
        { flag: 'SupportsUpdate', path: 'UpdateAPIPath', label: 'Update' },
        { flag: 'SupportsDelete', path: 'DeleteAPIPath', label: 'Delete' },
    ];

    for (const io of ios) {
        const ioName = io.fields.Name ?? '<unnamed-IO>';
        for (const op of ops) {
            if (io.fields[op.flag] !== true) continue;
            const pathValue = io.fields[op.path];
            if (pathValue == null || pathValue === '') {
                findings.push({
                    Check: 'CapabilityMethodMatch',
                    Locus: ioName,
                    Summary: `Supports${op.label}=true but ${String(op.path)} is null/empty.`,
                });
            }
        }
    }

    return finalize('CapabilityMethodMatch', findings);
}

// ── Check 4: PK/FK source-check matrix consistency (Gap 10) ──────────

/** Columns of EXTRACTION_REPORT_MATRIX.csv that are source-checks (yes/no/n/a). */
const MATRIX_SOURCE_CHECK_COLUMNS = [
    'ExistingConnectorTs',
    'ExistingMetadataJson',
    'OpenAPIxPK',
    'OpenAPIPathOps',
    'OpenAPILocationHeader',
    'VendorDocsProseScan',
    'SDKTypes',
    'PostmanCommunity',
    'NamingConvention',
    'CrossIOMatch',
] as const;

/** One parsed matrix row keyed by header column name. */
type MatrixRow = Record<string, string>;

/**
 * Gap-10 matrix consistency. For every IO that has ≥ 1 PK IOF, its
 * EXTRACTION_REPORT_MATRIX row must show ≥ 1 source-check `yes`. An emitted PK
 * with an empty/absent matrix row is a fabrication signal → fail. Additionally,
 * if the PK defer-rate (`PKVerdict=defer`) exceeds 50% of matrix rows, the
 * producer was lazy across the multi-source sweep → fail.
 *
 * Matrix path + format per `extractor-script-conventions.md` and the floor-check
 * primitive: `<connector>/output/EXTRACTION_REPORT_MATRIX.csv`, header
 * `IOName,ExistingConnectorTs,...,PKVerdict,FKVerdict,EvidenceCount`.
 */
function checkPkSourceMatrix(connector: string, registryRoot: string, ios: IONode[]): InvariantCheckResult {
    const findings: InvariantFinding[] = [];
    const iosWithPK = ios.filter(hasPrimaryKey);

    const matrixPath = resolve(registryRoot, connector, 'output', 'EXTRACTION_REPORT_MATRIX.csv');
    if (!existsSync(matrixPath)) {
        // Empty matrix + emitted PK → red (spec). No PK emitted → no fabrication
        // risk, so a missing matrix is not itself a T1 failure here.
        if (iosWithPK.length > 0) {
            findings.push({
                Check: 'PkSourceMatrix',
                Locus: matrixPath,
                Summary: `EXTRACTION_REPORT_MATRIX.csv missing but ${iosWithPK.length} IO(s) emit a primary key (fabrication signal).`,
            });
        }
        return finalize('PkSourceMatrix', findings);
    }

    const rows = parseMatrixCsv(readFileSync(matrixPath, 'utf-8'));
    const rowsByIO = new Map(rows.map((r) => [(r['IOName'] ?? '').toLowerCase(), r]));

    for (const io of iosWithPK) {
        const ioName = io.fields.Name ?? '<unnamed-IO>';
        const row = rowsByIO.get(ioName.toLowerCase());
        if (!row) {
            findings.push({ Check: 'PkSourceMatrix', Locus: ioName, Summary: 'IO emits a primary key but has no EXTRACTION_REPORT_MATRIX row (fabrication signal).' });
            continue;
        }
        if (!rowHasAnySourceCheckYes(row)) {
            findings.push({ Check: 'PkSourceMatrix', Locus: ioName, Summary: 'IO emits a primary key but its matrix row shows no source-check `yes` (fabrication signal).' });
        }
    }

    addDeferRateFinding(findings, rows, matrixPath);
    return finalize('PkSourceMatrix', findings);
}

/** True when the IO has at least one IOF with `IsPrimaryKey===true`. */
function hasPrimaryKey(io: IONode): boolean {
    const iofs = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
    return iofs.some((iof) => iof.fields.IsPrimaryKey === true);
}

/** True when any source-check column of the row equals `yes` (case-insensitive). */
function rowHasAnySourceCheckYes(row: MatrixRow): boolean {
    return MATRIX_SOURCE_CHECK_COLUMNS.some((col) => (row[col] ?? '').trim().toLowerCase() === 'yes');
}

/** Append a finding when the PK defer-rate across matrix rows exceeds 50%. */
function addDeferRateFinding(findings: InvariantFinding[], rows: MatrixRow[], matrixPath: string): void {
    if (rows.length === 0) return;
    const deferred = rows.filter((r) => (r['PKVerdict'] ?? '').trim().toLowerCase() === 'defer').length;
    const rate = deferred / rows.length;
    if (rate > 0.5) {
        findings.push({
            Check: 'PkSourceMatrix',
            Locus: matrixPath,
            Summary: `PK defer-rate ${(rate * 100).toFixed(0)}% (${deferred}/${rows.length}) exceeds 50% — producer deferred PK classification across the multi-source sweep.`,
        });
    }
}

/**
 * Minimal CSV parser for EXTRACTION_REPORT_MATRIX.csv. The matrix columns are
 * simple tokens (`yes`/`no`/`n/a`/identifiers) with no embedded commas, quotes,
 * or newlines, so a split-based parse is sufficient and deterministic.
 */
function parseMatrixCsv(content: string): MatrixRow[] {
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];
    const header = lines[0].split(',').map((h) => h.trim());
    const rows: MatrixRow[] = [];
    for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(',').map((c) => c.trim());
        const row: MatrixRow = {};
        header.forEach((col, idx) => {
            row[col] = cells[idx] ?? '';
        });
        rows.push(row);
    }
    return rows;
}

// ── File loading + path resolution helpers ───────────────────────────

/**
 * Load + normalise the connector's integration metadata file. Tries the
 * candidate paths a connector may emit to, in priority order, and normalises a
 * top-level array (mj-sync push convention) to its first integration root.
 */
function loadIntegrationFile(connector: string, registryRoot: string): IntegrationFile | null {
    const connectorDir = resolve(registryRoot, connector);
    const candidates = [
        // Primary: the path MetadataFileStore writes within the registry.
        resolve(connectorDir, 'metadata/integrations', `.${connector}.json`),
        // mj-sync push convention variants seen in the repo's metadata/ tree.
        resolve(connectorDir, 'metadata/integrations', `.${connector}.integration.json`),
        resolve(connectorDir, 'metadata/integrations', connector, `.${connector}.integration.json`),
        resolve(connectorDir, `.${connector}.integration.json`),
        resolve(connectorDir, `.${connector}.json`),
    ];

    for (const path of candidates) {
        if (!existsSync(path)) continue;
        const content = JSON.parse(readFileSync(path, 'utf-8')) as MetadataFileContent;
        return normaliseIntegrationRoot(content);
    }
    return null;
}

/** Normalise array-wrapped metadata to a single integration root. */
function normaliseIntegrationRoot(content: MetadataFileContent): IntegrationFile | null {
    if (Array.isArray(content)) {
        return content.length > 0 ? content[0] : null;
    }
    return content;
}

/**
 * Locate the connector `.ts` source within the registry. Prefers the
 * convention path `<connector>/src/<ClassName>.ts`, then falls back to any
 * `*Connector.ts` under the connector's `src/`.
 */
function findConnectorSourcePath(connector: string, registryRoot: string, className?: string): string | undefined {
    const srcDir = resolve(registryRoot, connector, 'src');
    if (className) {
        const exact = resolve(srcDir, `${className}.ts`);
        if (existsSync(exact)) return exact;
    }
    const guess = resolve(srcDir, `${capitalize(connector)}Connector.ts`);
    if (existsSync(guess)) return guess;
    return undefined;
}

/** Uppercase the first character (for the `<Name>Connector.ts` guess). */
function capitalize(s: string): string {
    return s.length === 0 ? s : `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
}

/** Build a per-check result, deriving Pass/Fail from whether any findings exist. */
function finalize(check: string, findings: InvariantFinding[]): InvariantCheckResult {
    return { Check: check, Status: findings.length === 0 ? 'Pass' : 'Fail', Findings: findings };
}
