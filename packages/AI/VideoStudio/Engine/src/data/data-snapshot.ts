/**
 * @fileoverview Server-side data snapshot capture and loading for MemberJunction Video Studio
 * (Plan §10.1, §10.2, §10.4; VS-DAT-1).
 *
 * All reads execute strictly as `options.ContextUser` through `RunView.RunViews`,
 * `RunQuery.RunQueries`, and `ReadStoredFile`. Raw SQL is never constructed or executed.
 *
 * @module @memberjunction/video-studio
 */

import {
    IMetadataProvider,
    IRunQueryProvider,
    IRunViewProvider,
    Metadata,
    NormalizeToTables,
    RunQuery,
    RunQueryParams,
    RunView,
    RunViewParams,
    RunViewResult,
    UserInfo,
} from '@memberjunction/core';
import { EscapeSQLString, IsValidUUID, UUIDsEqual } from '@memberjunction/global';
import {
    DataBindingValue,
    DataDeltaValue,
    DataScalarValue,
    DataSeriesPoint,
    DataTableCellValue,
    DataTableRow,
    VideoDataBinding,
    VideoDataSnapshot,
} from '@memberjunction/video-studio-core';
import { ReadStoredFile, StoreFile } from '../storage.js';

/**
 * Maximum number of rows fetched per `VideoDataBinding` (`MaxRows` passed to `RunViews` / `RunQueries`).
 * When a binding returns at least this many rows, a `'RowsTruncated'` warning is emitted.
 */
export const MAX_ROWS_PER_BINDING = 500;

/**
 * Default maximum UTF-8 byte length of `JSON.stringify(Values)` stored inline on `VideoDataSnapshot.Inline`
 * (64 KiB). Larger payloads are uploaded via {@link StoreFile} and referenced by `FileID`.
 */
export const SNAPSHOT_INLINE_MAX_BYTES = 65536;

/**
 * Severity level for a {@link DataSnapshotIssue}.
 */
export type DataSnapshotIssueSeverity = 'Error' | 'Warning';

/**
 * Diagnostic issue emitted during {@link CaptureDataSnapshot}.
 */
export interface DataSnapshotIssue {
    /** `'Error'` when a binding failed to resolve; `'Warning'` for non-fatal conditions. */
    Severity: DataSnapshotIssueSeverity;
    /**
     * Machine-readable issue code (e.g., `'RowsTruncated'`, `'SnapshotStoredInline'`,
     * `'MissingViewFields'`, `'UnknownEntity'`, `'UnknownField'`, `'InvalidQueryID'`,
     * `'InvalidArtifactVersionID'`, `'ArtifactEmptyRows'`, `'MissingInlineValue'`,
     * `'DeltaNotNumeric'`, `'SeriesValueNotNumeric'`, `'BindingReadFailed'`).
     */
    Code: string;
    /** Key of the `VideoDataBinding` that triggered the issue, when scoped to one binding. */
    BindingKey?: string;
    /** Human-readable explanation of the issue. */
    Message: string;
}

/**
 * Options for {@link CaptureDataSnapshot}.
 */
export interface CaptureDataSnapshotOptions {
    /** Server-side caller user context governing all entity, query, and storage reads. */
    ContextUser: UserInfo;
    /** Optional metadata provider override for `RunView`, `RunQuery`, and storage operations. */
    Provider?: IMetadataProvider;
    /** Optional `MJ: File Storage Accounts` ID to target when uploading oversized snapshots. */
    StorageAccountID?: string;
    /**
     * Optional UTF-8 byte threshold above which `Values` is uploaded to storage instead of kept inline.
     * Defaults to {@link SNAPSHOT_INLINE_MAX_BYTES}.
     */
    InlineMaxBytes?: number;
}

/**
 * Return value of {@link CaptureDataSnapshot}.
 */
export interface CaptureDataSnapshotResult {
    /**
     * Frozen snapshot metadata and inline or file-backed values.
     * Omitted only when `bindings` is empty (`bindings.length === 0`).
     */
    Snapshot?: VideoDataSnapshot;
    /** Map from `VideoDataBinding.Key` to its frozen shaped value. */
    Values: Record<string, unknown>;
    /** Issues encountered while resolving or persisting the snapshot. */
    Issues: DataSnapshotIssue[];
}

/**
 * Options for {@link LoadDataSnapshotValues}.
 */
export interface LoadDataSnapshotOptions {
    /** Server-side caller user context governing storage reads for file-backed snapshots. */
    ContextUser: UserInfo;
    /** Optional metadata provider override. */
    Provider?: IMetadataProvider;
}

/**
 * Row shape returned by `MJ: Artifact Versions` simple view reads.
 */
interface ArtifactVersionSimpleRow {
    ID?: string;
    Content?: string | null;
    ContentMode?: string | null;
    FileID?: string | null;
    MimeType?: string | null;
}

/**
 * Validated `'View'` binding queued for the single batched `RunViews` call.
 */
interface PendingViewBinding {
    Binding: VideoDataBinding;
    EntityName: string;
    Fields: string[];
    ExtraFilter?: string;
    ParamIndex: number;
}

/**
 * Validated `'Artifact'` binding queued against the shared `MJ: Artifact Versions` read.
 */
interface PendingArtifactBinding {
    Binding: VideoDataBinding;
    ArtifactVersionID: string;
}

/**
 * Validated `'Query'` binding queued for the single batched `RunQueries` call.
 */
interface PendingQueryBinding {
    Binding: VideoDataBinding;
    QueryID: string;
    Parameters?: Record<string, unknown>;
    ParamIndex: number;
}

/**
 * Executes all `VideoDataBinding` entries as `options.ContextUser` and freezes their shaped
 * values into a `VideoDataSnapshot`.
 *
 * - Issues at most **one** `RunView.RunViews` call (combining all valid `'View'` bindings and at
 *   most one `'MJ: Artifact Versions'` read for all valid `'Artifact'` bindings).
 * - Issues at most **one** `RunQuery.RunQueries` call (combining all valid `'Query'` bindings).
 * - Never executes raw SQL.
 * - Never throws: any validation failure, permission denial, `Success: false`, or parse error is
 *   recorded as an `'Error'` in `Issues` while remaining bindings continue to capture.
 */
export async function CaptureDataSnapshot(
    bindings: VideoDataBinding[],
    callerInline: Record<string, unknown> | undefined,
    options: CaptureDataSnapshotOptions,
): Promise<CaptureDataSnapshotResult> {
    if (bindings.length === 0) {
        return { Values: {}, Issues: [] };
    }

    const asOf = new Date().toISOString();
    const values: Record<string, unknown> = {};
    const issues: DataSnapshotIssue[] = [];
    const sourceSet = new Set<string>();

    const pendingViews: PendingViewBinding[] = [];
    const pendingArtifacts: PendingArtifactBinding[] = [];
    const pendingQueries: PendingQueryBinding[] = [];

    // 1. Pre-validate bindings and resolve Inline bindings immediately.
    for (const binding of bindings) {
        const kind = binding.Source?.Kind;
        if (kind === 'View') {
            validateAndQueueViewBinding(binding, options, pendingViews, issues);
        } else if (kind === 'Artifact') {
            validateAndQueueArtifactBinding(binding, pendingArtifacts, issues);
        } else if (kind === 'Query') {
            validateAndQueueQueryBinding(binding, pendingQueries, issues);
        } else if (kind === 'Inline') {
            resolveInlineBinding(binding, callerInline, values, sourceSet, issues);
        } else {
            issues.push({
                Severity: 'Error',
                Code: 'UnsupportedBindingKind',
                BindingKey: binding.Key,
                Message: `Binding "${binding.Key}" has unsupported source kind "${String(kind)}".`,
            });
        }
    }

    // 2. Execute at most ONE RunViews call for all valid View bindings + one MJ: Artifact Versions read.
    await executeBatchedViewsAndArtifacts(
        pendingViews,
        pendingArtifacts,
        options,
        values,
        sourceSet,
        issues,
    );

    // 3. Execute at most ONE RunQueries call for all valid Query bindings.
    await executeBatchedQueries(
        pendingQueries,
        options,
        values,
        sourceSet,
        issues,
    );

    // 4. Assemble VideoDataSnapshot (inline vs MJStorage file).
    const sources = Array.from(sourceSet).sort();
    const snapshot = await buildSnapshot(values, asOf, sources, options, issues);

    return {
        Snapshot: snapshot,
        Values: values,
        Issues: issues,
    };
}

/**
 * Loads the frozen `Values` map from a {@link VideoDataSnapshot}.
 *
 * Returns `snapshot.Inline` directly when present; otherwise reads the JSON file referenced by
 * `snapshot.FileID` as `options.ContextUser` via {@link ReadStoredFile} and parses it.
 */
export async function LoadDataSnapshotValues(
    snapshot: VideoDataSnapshot,
    options: LoadDataSnapshotOptions,
): Promise<Record<string, unknown>> {
    if (snapshot.Inline !== undefined) {
        return snapshot.Inline;
    }
    if (snapshot.FileID) {
        const buffer = await ReadStoredFile(
            snapshot.FileID,
            options.ContextUser,
            options.Provider,
        );
        const parsed: unknown = JSON.parse(buffer.toString('utf8'));
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error(
                `Stored data snapshot file "${snapshot.FileID}" did not contain a JSON object.`,
            );
        }
        return parsed as Record<string, unknown>;
    }
    throw new Error('VideoDataSnapshot has neither Inline values nor a FileID.');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function validateAndQueueViewBinding(
    binding: VideoDataBinding,
    options: CaptureDataSnapshotOptions,
    pendingViews: PendingViewBinding[],
    issues: DataSnapshotIssue[],
): void {
    const entityName = binding.Source.EntityName?.trim();
    if (!entityName) {
        issues.push({
            Severity: 'Error',
            Code: 'MissingEntityName',
            BindingKey: binding.Key,
            Message: `View binding "${binding.Key}" is missing required Source.EntityName.`,
        });
        return;
    }

    const fields = binding.Source.Fields?.filter((f) => typeof f === 'string' && f.trim().length > 0);
    if (!fields || fields.length === 0) {
        issues.push({
            Severity: 'Error',
            Code: 'MissingViewFields',
            BindingKey: binding.Key,
            Message: `View binding "${binding.Key}" on "${entityName}" must specify a non-empty Source.Fields list.`,
        });
        return;
    }

    const provider = options.Provider ?? Metadata.Provider; // global-provider-ok: caller-supplied provider preferred; global is the documented last-resort fallback
    const entity = provider?.EntityByName
        ? provider.EntityByName(entityName)
        : provider?.Entities?.find((e) => e.Name.trim().toLowerCase() === entityName.toLowerCase());
    if (!entity || entity.Status?.trim().toLowerCase() === 'disabled') {
        issues.push({
            Severity: 'Error',
            Code: 'UnknownEntity',
            BindingKey: binding.Key,
            Message: `View binding "${binding.Key}" references unknown or disabled entity "${entityName}".`,
        });
        return;
    }

    const canonicalFieldByLower = new Map<string, string>();
    for (const ef of entity.Fields ?? []) {
        canonicalFieldByLower.set(ef.Name.trim().toLowerCase(), ef.Name);
    }
    const unknownFields = fields.filter((f) => !canonicalFieldByLower.has(f.trim().toLowerCase()));
    if (unknownFields.length > 0) {
        issues.push({
            Severity: 'Error',
            Code: 'UnknownField',
            BindingKey: binding.Key,
            Message: `View binding "${binding.Key}" on "${entityName}" references unknown field(s): ${unknownFields.map((f) => `"${f}"`).join(', ')}.`,
        });
        return;
    }

    const canonicalFields = fields.map(
        (f) => canonicalFieldByLower.get(f.trim().toLowerCase()) ?? f.trim(),
    );

    pendingViews.push({
        Binding: binding,
        EntityName: entity.Name ?? entityName,
        Fields: canonicalFields,
        ExtraFilter: binding.Source.ExtraFilter,
        ParamIndex: pendingViews.length,
    });
}

function validateAndQueueArtifactBinding(
    binding: VideoDataBinding,
    pendingArtifacts: PendingArtifactBinding[],
    issues: DataSnapshotIssue[],
): void {
    const artifactVersionId = binding.Source.ArtifactVersionID?.trim() ?? '';
    if (!IsValidUUID(artifactVersionId)) {
        issues.push({
            Severity: 'Error',
            Code: 'InvalidArtifactVersionID',
            BindingKey: binding.Key,
            Message: `Artifact binding "${binding.Key}" has an invalid Source.ArtifactVersionID "${artifactVersionId}".`,
        });
        return;
    }

    pendingArtifacts.push({
        Binding: binding,
        ArtifactVersionID: artifactVersionId,
    });
}

function validateAndQueueQueryBinding(
    binding: VideoDataBinding,
    pendingQueries: PendingQueryBinding[],
    issues: DataSnapshotIssue[],
): void {
    const queryId = binding.Source.QueryID?.trim() ?? '';
    if (!IsValidUUID(queryId)) {
        issues.push({
            Severity: 'Error',
            Code: 'InvalidQueryID',
            BindingKey: binding.Key,
            Message: `Query binding "${binding.Key}" has an invalid Source.QueryID "${queryId}".`,
        });
        return;
    }

    pendingQueries.push({
        Binding: binding,
        QueryID: queryId,
        Parameters: binding.Source.Parameters,
        ParamIndex: pendingQueries.length,
    });
}

function resolveInlineBinding(
    binding: VideoDataBinding,
    callerInline: Record<string, unknown> | undefined,
    values: Record<string, unknown>,
    sourceSet: Set<string>,
    issues: DataSnapshotIssue[],
): void {
    if (
        !callerInline ||
        !Object.prototype.hasOwnProperty.call(callerInline, binding.Key) ||
        callerInline[binding.Key] === undefined
    ) {
        issues.push({
            Severity: 'Error',
            Code: 'MissingInlineValue',
            BindingKey: binding.Key,
            Message: `Inline binding "${binding.Key}" is missing from caller-supplied inline data.`,
        });
        return;
    }

    values[binding.Key] = callerInline[binding.Key];
    sourceSet.add(`Inline:${binding.Key}`);
}

async function executeBatchedViewsAndArtifacts(
    pendingViews: PendingViewBinding[],
    pendingArtifacts: PendingArtifactBinding[],
    options: CaptureDataSnapshotOptions,
    values: Record<string, unknown>,
    sourceSet: Set<string>,
    issues: DataSnapshotIssue[],
): Promise<void> {
    if (pendingViews.length === 0 && pendingArtifacts.length === 0) {
        return;
    }

    const viewParams: RunViewParams[] = pendingViews.map((pv) => ({
        EntityName: pv.EntityName,
        ExtraFilter: pv.ExtraFilter,
        Fields: pv.Fields,
        ResultType: 'simple',
        MaxRows: MAX_ROWS_PER_BINDING,
    }));

    let artifactParamIndex = -1;
    if (pendingArtifacts.length > 0) {
        const uniqueIds: string[] = [];
        for (const pa of pendingArtifacts) {
            if (!uniqueIds.some((id) => UUIDsEqual(id, pa.ArtifactVersionID))) {
                uniqueIds.push(pa.ArtifactVersionID);
            }
        }
        const inList = uniqueIds.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
        artifactParamIndex = viewParams.length;
        viewParams.push({
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ID IN (${inList})`,
            Fields: ['ID', 'Content', 'ContentMode', 'FileID', 'MimeType'],
            ResultType: 'simple',
            MaxRows: MAX_ROWS_PER_BINDING,
        });
    }

    let results: RunViewResult[];
    try {
        const rv = new RunView(options.Provider as unknown as IRunViewProvider);
        results = await rv.RunViews(viewParams, options.ContextUser);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        for (const pv of pendingViews) {
            issues.push({
                Severity: 'Error',
                Code: 'BindingReadFailed',
                BindingKey: pv.Binding.Key,
                Message: `View binding "${pv.Binding.Key}" on "${pv.EntityName}" failed: ${message}`,
            });
        }
        for (const pa of pendingArtifacts) {
            issues.push({
                Severity: 'Error',
                Code: 'BindingReadFailed',
                BindingKey: pa.Binding.Key,
                Message: `Artifact binding "${pa.Binding.Key}" (${pa.ArtifactVersionID}) failed: ${message}`,
            });
        }
        return;
    }

    // Process each View binding result.
    for (const pv of pendingViews) {
        const res = results[pv.ParamIndex];
        if (!res || !res.Success) {
            issues.push({
                Severity: 'Error',
                Code: 'BindingReadFailed',
                BindingKey: pv.Binding.Key,
                Message: `View binding "${pv.Binding.Key}" on "${pv.EntityName}" failed: ${res?.ErrorMessage ?? 'RunViews returned no result'}`,
            });
            continue;
        }

        const rawRows = (res.Results ?? []) as Record<string, unknown>[];
        const rows = applyRowCap(rawRows, pv.Binding.Key, issues);
        const shaped = shapeRows(rows, pv.Binding, pv.Fields, issues);
        if (shaped !== undefined) {
            values[pv.Binding.Key] = shaped;
            sourceSet.add(`View:${pv.EntityName}`);
        }
    }

    // Process each Artifact binding result.
    if (artifactParamIndex >= 0) {
        const artifactRes = results[artifactParamIndex];
        await processArtifactBindings(
            pendingArtifacts,
            artifactRes,
            options,
            values,
            sourceSet,
            issues,
        );
    }
}

async function processArtifactBindings(
    pendingArtifacts: PendingArtifactBinding[],
    artifactRes: RunViewResult | undefined,
    options: CaptureDataSnapshotOptions,
    values: Record<string, unknown>,
    sourceSet: Set<string>,
    issues: DataSnapshotIssue[],
): Promise<void> {
    if (!artifactRes || !artifactRes.Success) {
        for (const pa of pendingArtifacts) {
            issues.push({
                Severity: 'Error',
                Code: 'BindingReadFailed',
                BindingKey: pa.Binding.Key,
                Message: `Artifact binding "${pa.Binding.Key}" (${pa.ArtifactVersionID}) failed: ${artifactRes?.ErrorMessage ?? 'MJ: Artifact Versions read failed'}`,
            });
        }
        return;
    }

    const versionRows = (artifactRes.Results ?? []) as ArtifactVersionSimpleRow[];

    for (const pa of pendingArtifacts) {
        const row = versionRows.find((r) => UUIDsEqual(String(r.ID ?? ''), pa.ArtifactVersionID));
        if (!row) {
            issues.push({
                Severity: 'Error',
                Code: 'BindingReadFailed',
                BindingKey: pa.Binding.Key,
                Message: `Artifact version "${pa.ArtifactVersionID}" for binding "${pa.Binding.Key}" was not found or access was denied.`,
            });
            continue;
        }

        try {
            const parsed = await parseArtifactVersionContent(row, options);
            const tables = NormalizeToTables(parsed);
            const rawRows = (tables[0]?.rows ?? []) as Record<string, unknown>[];
            if (rawRows.length === 0) {
                issues.push({
                    Severity: 'Error',
                    Code: 'ArtifactEmptyRows',
                    BindingKey: pa.Binding.Key,
                    Message: `Artifact binding "${pa.Binding.Key}" (${pa.ArtifactVersionID}) contained no data rows.`,
                });
                continue;
            }

            const rows = applyRowCap(rawRows, pa.Binding.Key, issues);
            const explicitFields = pa.Binding.Source.Fields?.filter(
                (f) => typeof f === 'string' && f.trim().length > 0,
            );
            const shaped = shapeRows(rows, pa.Binding, explicitFields, issues);
            if (shaped !== undefined) {
                values[pa.Binding.Key] = shaped;
                sourceSet.add(`Artifact:${pa.ArtifactVersionID}`);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            issues.push({
                Severity: 'Error',
                Code: 'BindingReadFailed',
                BindingKey: pa.Binding.Key,
                Message: `Artifact binding "${pa.Binding.Key}" (${pa.ArtifactVersionID}) failed: ${message}`,
            });
        }
    }
}

async function parseArtifactVersionContent(
    row: ArtifactVersionSimpleRow,
    options: CaptureDataSnapshotOptions,
): Promise<Record<string, unknown>> {
    const mode = String(row.ContentMode ?? 'Text').trim().toLowerCase();
    let rawJson: string;
    if (mode === 'file') {
        const fileId = row.FileID?.trim() ?? '';
        if (!fileId) {
            throw new Error('Artifact version has ContentMode="File" but no FileID.');
        }
        const buffer = await ReadStoredFile(fileId, options.ContextUser, options.Provider);
        rawJson = buffer.toString('utf8');
    } else {
        if (typeof row.Content !== 'string' || row.Content.trim().length === 0) {
            throw new Error('Artifact version has empty Content.');
        }
        rawJson = row.Content;
    }

    const parsed: unknown = JSON.parse(rawJson);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Artifact version content did not parse to a JSON object.');
    }
    return parsed as Record<string, unknown>;
}

async function executeBatchedQueries(
    pendingQueries: PendingQueryBinding[],
    options: CaptureDataSnapshotOptions,
    values: Record<string, unknown>,
    sourceSet: Set<string>,
    issues: DataSnapshotIssue[],
): Promise<void> {
    if (pendingQueries.length === 0) {
        return;
    }

    const queryParams: RunQueryParams[] = pendingQueries.map((pq) => ({
        QueryID: pq.QueryID,
        Parameters: pq.Parameters,
        MaxRows: MAX_ROWS_PER_BINDING,
    }));

    let results;
    try {
        const rq = new RunQuery(options.Provider as unknown as IRunQueryProvider);
        results = await rq.RunQueries(queryParams, options.ContextUser);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        for (const pq of pendingQueries) {
            issues.push({
                Severity: 'Error',
                Code: 'BindingReadFailed',
                BindingKey: pq.Binding.Key,
                Message: `Query binding "${pq.Binding.Key}" (${pq.QueryID}) failed: ${message}`,
            });
        }
        return;
    }

    for (const pq of pendingQueries) {
        const res = results[pq.ParamIndex];
        if (!res || !res.Success) {
            issues.push({
                Severity: 'Error',
                Code: 'BindingReadFailed',
                BindingKey: pq.Binding.Key,
                Message: `Query binding "${pq.Binding.Key}" (${pq.QueryID}) failed: ${res?.ErrorMessage ?? 'RunQueries returned no result'}`,
            });
            continue;
        }

        const rawRows = (res.Results ?? []) as Record<string, unknown>[];
        const rows = applyRowCap(rawRows, pq.Binding.Key, issues);
        const explicitFields = pq.Binding.Source.Fields?.filter(
            (f) => typeof f === 'string' && f.trim().length > 0,
        );
        const shaped = shapeRows(rows, pq.Binding, explicitFields, issues);
        if (shaped !== undefined) {
            values[pq.Binding.Key] = shaped;
            sourceSet.add(`Query:${pq.QueryID}`);
        }
    }
}

function applyRowCap(
    rawRows: Record<string, unknown>[],
    bindingKey: string,
    issues: DataSnapshotIssue[],
): Record<string, unknown>[] {
    if (rawRows.length >= MAX_ROWS_PER_BINDING) {
        issues.push({
            Severity: 'Warning',
            Code: 'RowsTruncated',
            BindingKey: bindingKey,
            Message: `Binding "${bindingKey}" returned ${rawRows.length} rows and was capped at ${MAX_ROWS_PER_BINDING}.`,
        });
        return rawRows.slice(0, MAX_ROWS_PER_BINDING);
    }
    return rawRows;
}

function shapeRows(
    rows: Record<string, unknown>[],
    binding: VideoDataBinding,
    explicitFields: string[] | undefined,
    issues: DataSnapshotIssue[],
): DataBindingValue | undefined {
    const orderedFields =
        explicitFields && explicitFields.length > 0
            ? explicitFields
            : rows.length > 0
              ? Object.keys(rows[0])
              : [];

    switch (binding.Shape) {
        case 'Scalar':
            return shapeScalar(rows, orderedFields);
        case 'Series':
            return shapeSeries(rows, orderedFields, binding.Key, issues);
        case 'Table':
            return shapeTable(rows, explicitFields);
        case 'Delta':
            return shapeDelta(rows, orderedFields, binding.Key, issues);
        default:
            return shapeScalar(rows, orderedFields);
    }
}

function shapeScalar(
    rows: Record<string, unknown>[],
    orderedFields: string[],
): DataScalarValue {
    if (rows.length === 0 || orderedFields.length === 0) {
        return null;
    }
    const raw = rows[0][orderedFields[0]];
    if (raw === null || raw === undefined) {
        return null;
    }
    if (typeof raw === 'number') {
        return Number.isFinite(raw) ? raw : null;
    }
    if (typeof raw === 'string') {
        return raw;
    }
    if (raw instanceof Date) {
        return raw.toISOString();
    }
    return String(raw);
}

function parseFiniteNumber(raw: unknown): number | undefined {
    if (typeof raw === 'number') {
        return Number.isFinite(raw) ? raw : undefined;
    }
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.length === 0) {
            return undefined;
        }
        const n = Number(trimmed);
        return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
}

function shapeSeries(
    rows: Record<string, unknown>[],
    orderedFields: string[],
    bindingKey: string,
    issues: DataSnapshotIssue[],
): DataSeriesPoint[] | undefined {
    const points: DataSeriesPoint[] = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const fields = orderedFields.length > 0 ? orderedFields : Object.keys(row);
        const rawLabel = fields[0] !== undefined ? row[fields[0]] : undefined;
        const rawValue = fields[1] !== undefined ? row[fields[1]] : undefined;
        const numericValue = parseFiniteNumber(rawValue);
        if (numericValue === undefined) {
            issues.push({
                Severity: 'Error',
                Code: 'SeriesValueNotNumeric',
                BindingKey: bindingKey,
                Message: `Series binding "${bindingKey}" has a non-numeric value at row ${i} (field "${fields[1] ?? ''}").`,
            });
            return undefined;
        }
        const label =
            rawLabel === null || rawLabel === undefined
                ? ''
                : rawLabel instanceof Date
                  ? rawLabel.toISOString()
                  : String(rawLabel);
        points.push({
            Label: label,
            Value: numericValue,
        });
    }
    return points;
}

function shapeTable(
    rows: Record<string, unknown>[],
    explicitFields?: string[],
): DataTableRow[] {
    return rows.map((row) => {
        const fields =
            explicitFields && explicitFields.length > 0
                ? explicitFields
                : Object.keys(row);
        const shapedRow: DataTableRow = {};
        for (const field of fields) {
            shapedRow[field] = coerceTableCell(row[field]);
        }
        return shapedRow;
    });
}

function coerceTableCell(raw: unknown): DataTableCellValue {
    if (raw === null || raw === undefined) {
        return null;
    }
    if (typeof raw === 'string' || typeof raw === 'boolean') {
        return raw;
    }
    if (typeof raw === 'number') {
        return Number.isFinite(raw) ? raw : null;
    }
    if (raw instanceof Date) {
        return raw.toISOString();
    }
    return String(raw);
}

function shapeDelta(
    rows: Record<string, unknown>[],
    orderedFields: string[],
    bindingKey: string,
    issues: DataSnapshotIssue[],
): DataDeltaValue | undefined {
    if (rows.length === 0) {
        issues.push({
            Severity: 'Error',
            Code: 'DeltaNotNumeric',
            BindingKey: bindingKey,
            Message: `Delta binding "${bindingKey}" returned no rows; requires a first row with two numeric fields.`,
        });
        return undefined;
    }
    const firstRow = rows[0];
    const candidateFields =
        orderedFields.length > 0 ? orderedFields : Object.keys(firstRow);

    const numericValues: number[] = [];
    for (const field of candidateFields) {
        const val = firstRow[field];
        if (typeof val === 'number' && Number.isFinite(val)) {
            numericValues.push(val);
            if (numericValues.length === 2) {
                break;
            }
        }
    }

    // Fallback: if fewer than two strictly number-typed columns were found, coerce numeric strings.
    if (numericValues.length < 2) {
        numericValues.length = 0;
        for (const field of candidateFields) {
            const parsed = parseFiniteNumber(firstRow[field]);
            if (parsed !== undefined) {
                numericValues.push(parsed);
                if (numericValues.length === 2) {
                    break;
                }
            }
        }
    }

    if (numericValues.length < 2) {
        issues.push({
            Severity: 'Error',
            Code: 'DeltaNotNumeric',
            BindingKey: bindingKey,
            Message: `Delta binding "${bindingKey}" requires a first row with at least two numeric fields (found ${numericValues.length}).`,
        });
        return undefined;
    }

    const current = numericValues[0];
    const previous = numericValues[1];
    const change = current - previous;
    const changePercent = previous === 0 ? null : change / previous;

    return {
        Current: current,
        Previous: previous,
        Change: change,
        ChangePercent: changePercent,
    };
}

async function buildSnapshot(
    values: Record<string, unknown>,
    asOf: string,
    sources: string[],
    options: CaptureDataSnapshotOptions,
    issues: DataSnapshotIssue[],
): Promise<VideoDataSnapshot> {
    const maxBytes = options.InlineMaxBytes ?? SNAPSHOT_INLINE_MAX_BYTES;
    const serialized = JSON.stringify(values);
    const byteLength = Buffer.byteLength(serialized, 'utf8');

    if (byteLength <= maxBytes) {
        return {
            Inline: values,
            AsOf: asOf,
            Sources: sources,
        };
    }

    const fileId = await StoreFile({
        Content: Buffer.from(serialized, 'utf8'),
        FileName: 'data-snapshot.json',
        MimeType: 'application/json',
        Description: `Video Studio data snapshot as of ${asOf}`,
        ContextUser: options.ContextUser,
        StorageAccountID: options.StorageAccountID,
        Provider: options.Provider,
    });

    if (fileId) {
        return {
            FileID: fileId,
            AsOf: asOf,
            Sources: sources,
        };
    }

    issues.push({
        Severity: 'Warning',
        Code: 'SnapshotStoredInline',
        Message: `Data snapshot (${byteLength} bytes) exceeded inline limit (${maxBytes} bytes), but storage upload was unavailable; falling back to inline snapshot.`,
    });

    return {
        Inline: values,
        AsOf: asOf,
        Sources: sources,
    };
}
