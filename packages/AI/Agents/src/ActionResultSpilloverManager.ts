/**
 * @fileoverview Lazy, KV-cache-preserving artifact spillover manager for action outputs.
 *
 * Keeps `_ARTIFACT_MANIFEST` untouched while full action results remain inline in conversation
 * history, and materializes queryable artifacts into {@link ArtifactToolManager} only when inline
 * content is actually compacted, stubbed, or removed. Pending spillover entries stay completely
 * private to each manager instance (keyed by message metadata reference), so ephemeral handles
 * never leak into serializable `AgentChatMessageMetadata` or across sub-agent boundaries.
 *
 * @module @memberjunction/ai-agents
 */

import { LogError } from '@memberjunction/core';
import type { ActionOutputTrustLevel, ActionParam } from '@memberjunction/actions-base';
import type { AgentChatMessage, AgentChatMessageMetadata, InputArtifact } from '@memberjunction/ai-core-plus';
import type { ResolvedActionExpirationConfig } from './ActionLifecycleResolver';
import type { ArtifactToolManager } from './ArtifactToolManager';

/**
 * Character and row thresholds deciding when an action output warrants spillover registration
 * in `ArtifactToolManager`.
 */
export interface ActionSpilloverThresholds {
    CharThreshold: number;
    RowThreshold: number;
}

/**
 * Inputs for queuing or registering spillover artifacts for an action output.
 */
export interface ActionOutputSpilloverInput {
    ActionName: string;
    OutputParams: ActionParam[];
    Message?: string;
    StepNumber: number;
    ExpirationConfig?: ResolvedActionExpirationConfig;
    TrustLevel?: ActionOutputTrustLevel;
    /** Explicit external provenance label (e.g. from an extracted `<untrusted_external_data>` envelope). */
    SourceName?: string;
}

interface PendingSpilloverEntry {
    Input: ActionOutputSpilloverInput;
    ArtifactManager: ArtifactToolManager;
}

type SpilloverTrustMetadata = Partial<Pick<InputArtifact, 'trustLevel' | 'sourceName'>>;

const SPILLOVER_COMPACT_LENGTH_FALLBACK = 500;
const SPILLOVER_COMPACT_CHAR_RATIO = 0.75;
const SPILLOVER_COMPACT_MIN_CHARS = 200;
const SPILLOVER_EXPIRING_CHAR_THRESHOLD = 500;
const SPILLOVER_PERSISTENT_CHAR_THRESHOLD = 4000;
const SPILLOVER_EXPIRING_ROW_THRESHOLD = 5;
const SPILLOVER_PERSISTENT_ROW_THRESHOLD = 25;

function isPlainRecord(val: unknown): val is Record<string, unknown> {
    return val !== null && typeof val === 'object' && !Array.isArray(val);
}

function isJsonContainer(val: unknown): val is unknown[] | Record<string, unknown> {
    return Array.isArray(val) || isPlainRecord(val);
}

function isTabularRowArray(val: unknown): val is Array<Record<string, unknown>> {
    return Array.isArray(val) && val.length > 0 && val.every(isPlainRecord);
}

function isSpilloverStringParam(val: unknown, charThreshold: number): val is string {
    return (
        typeof val === 'string' &&
        val.length >= charThreshold &&
        !val.startsWith('[Media output') &&
        !val.startsWith('[File output')
    );
}

function estimatePrimitiveJsonChars(node: unknown): number | null {
    if (node === null) {
        return 4;
    }
    if (typeof node === 'string') {
        return node.length + 2;
    }
    if (typeof node === 'number' || typeof node === 'boolean') {
        return String(node).length;
    }
    if (node instanceof Date) {
        return 26;
    }
    return typeof node === 'object' ? null : 0;
}

/**
 * Estimates whether pretty-printed JSON (`JSON.stringify(val, null, 2)`) meets `charThreshold`
 * without eagerly serializing huge nested objects at spillover queue time. Tracks active ancestors
 * for cycle safety while counting shared DAG references and skipping `undefined` object properties
 * (matching `JSON.stringify`).
 */
function exceedsJsonCharBudget(val: unknown, charThreshold: number): boolean {
    const state = { chars: 0, ancestors: new Set<object>() };
    const visit = (node: unknown, depth: number): boolean => {
        if (state.chars >= charThreshold) {
            return true;
        }
        const primitiveChars = estimatePrimitiveJsonChars(node);
        if (primitiveChars !== null) {
            state.chars += primitiveChars;
            return state.chars >= charThreshold;
        }
        if (!isJsonContainer(node) || state.ancestors.has(node)) {
            return false;
        }
        state.ancestors.add(node);
        try {
            state.chars += 2;
            if (Array.isArray(node)) {
                return node.some(item => {
                    state.chars += 2 + depth * 2 + (item === undefined ? 4 : 0);
                    return item === undefined ? state.chars >= charThreshold : visit(item, depth + 1);
                });
            }
            return Object.keys(node).some(k => {
                const propVal = node[k];
                if (propVal === undefined) {
                    return false;
                }
                state.chars += k.length + 5 + depth * 2;
                return visit(propVal, depth + 1);
            });
        } finally {
            state.ancestors.delete(node);
        }
    };
    return visit(val, 1);
}

/**
 * Serializes an action output payload to JSON without allowing circular references or `BigInt`
 * values to crash compaction or context recovery.
 */
function safeJsonStringify(value: unknown, pretty: boolean, contextLabel: string): string | undefined {
    try {
        // fls-guard: action output params already scoped to the run's contextUser and audience in ExecuteSingleAction
        return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
    } catch (err) {
        LogError(
            `ActionResultSpilloverManager: skipping non-JSON-serializable ${contextLabel}: ${err instanceof Error ? err.message : String(err)}`
        );
        return undefined;
    }
}

/**
 * Cheap strict-JSON check for spilled string payloads: verifies matching `{...}` or `[...]`
 * delimiters before parsing so large bracket-prefixed logs or markdown skip JSON parsing entirely.
 */
function isJsonStringPayload(trimmed: string): boolean {
    const hasObjectDelimiters = trimmed.startsWith('{') && trimmed.endsWith('}');
    const hasArrayDelimiters = trimmed.startsWith('[') && trimmed.endsWith(']');
    if (!hasObjectDelimiters && !hasArrayDelimiters) {
        return false;
    }
    try {
        const parsed: unknown = JSON.parse(trimmed);
        return parsed !== null && typeof parsed === 'object';
    } catch {
        return false;
    }
}

function wouldTabularRowsSpillOver(
    rows: Array<Record<string, unknown>>,
    thresholds: ActionSpilloverThresholds
): boolean {
    if (rows.length >= thresholds.RowThreshold) {
        return true;
    }
    let approxChars = 2;
    for (let i = 0; i < rows.length; i++) {
        const rowJson = safeJsonStringify(rows[i], false, 'tabular row');
        if (rowJson === undefined) {
            return false;
        }
        approxChars += rowJson.length + (i > 0 ? 1 : 0);
        if (approxChars >= thresholds.CharThreshold) {
            return true;
        }
    }
    return false;
}

function inferSnapshotColumns(
    firstRow: Record<string, unknown>,
    rawColumns?: Array<Record<string, unknown>>
): Array<{ field: string; sqlBaseType: string }> {
    if (rawColumns && rawColumns.length > 0) {
        return rawColumns
            .map(c => ({
                field: String(c.ColumnName ?? c.field ?? c.Name ?? ''),
                sqlBaseType: String(c.DataType ?? c.sqlBaseType ?? 'nvarchar'),
            }))
            .filter(c => c.field.length > 0);
    }
    return Object.keys(firstRow).map(field => ({
        field,
        sqlBaseType:
            typeof firstRow[field] === 'number'
                ? 'float'
                : typeof firstRow[field] === 'boolean'
                    ? 'bit'
                    : 'nvarchar',
    }));
}

function extractRawColumnsMetadata(outputParams: ActionParam[]): Array<Record<string, unknown>> | undefined {
    const columnsParam = outputParams.find(
        p => p.Name?.trim().toLowerCase() === 'columns' && Array.isArray(p.Value)
    );
    if (!Array.isArray(columnsParam?.Value)) {
        return undefined;
    }
    const records = columnsParam.Value.filter(isPlainRecord);
    return records.length > 0 ? records : undefined;
}

function buildTabularSpilloverArtifacts(
    actionName: string,
    outputParams: ActionParam[],
    stepNumber: number,
    thresholds: ActionSpilloverThresholds,
    trustMetadata: SpilloverTrustMetadata
): InputArtifact[] {
    const rawColumns = extractRawColumnsMetadata(outputParams);
    const artifacts: InputArtifact[] = [];

    for (const param of outputParams) {
        if (param.Name?.trim().toLowerCase() === 'columns' || !isTabularRowArray(param.Value)) {
            continue;
        }
        const rows = param.Value;
        if (!wouldTabularRowsSpillOver(rows, thresholds)) {
            continue;
        }
        const tableName = param.Name || 'Results';
        const columns = inferSnapshotColumns(rows[0], rawColumns);
        const snapshotJson = safeJsonStringify(
            { tables: [{ name: tableName, columns, rows, metadata: { rowCount: rows.length } }] },
            false,
            `tabular spillover for '${actionName}.${tableName}'`
        );
        if (!snapshotJson) {
            continue;
        }
        artifacts.push({
            name: `${actionName} — ${tableName} (Step ${stepNumber})`,
            typeName: 'Data Snapshot',
            toolLibraryClass: 'DataSnapshotToolLibrary',
            mimeType: 'application/json',
            content: snapshotJson,
            description: `${rows.length} row(s) returned by action "${actionName}" (${tableName}). Queryable via get_tables, get_schema, get_rows, search_rows, filter, aggregate, group_aggregate, compute, or get_full.`,
            deliveryMode: 'ToolsOnly',
            forceToolsOnly: true,
            ...trustMetadata,
        });
    }
    return artifacts;
}

function buildStringSpilloverArtifact(
    actionName: string,
    paramName: string,
    val: string,
    stepNumber: number,
    trustMetadata: SpilloverTrustMetadata
): InputArtifact {
    const lowerName = paramName.trim().toLowerCase();
    const trimmed = val.trim();
    const isJsonString = isJsonStringPayload(trimmed);
    const isCsv =
        !isJsonString &&
        (lowerName.includes('csv') ||
            (lowerName === 'formattedresults' && trimmed.includes(',') && trimmed.includes('\n')));
    return {
        name: `${actionName} — ${paramName} (Step ${stepNumber})`,
        typeName: isJsonString ? 'JSON' : isCsv ? 'CSV' : 'Text',
        toolLibraryClass: isJsonString ? 'JSONToolLibrary' : isCsv ? 'CSVToolLibrary' : 'TextToolLibrary',
        mimeType: isJsonString ? 'application/json' : isCsv ? 'text/csv' : 'text/plain',
        content: val,
        description: `Output from action "${actionName}" (${paramName}, ${val.length} chars).`,
        deliveryMode: 'ToolsOnly',
        forceToolsOnly: true,
        ...trustMetadata,
    };
}

function buildSingleParamSpilloverArtifact(
    actionName: string,
    param: ActionParam,
    stepNumber: number,
    charThreshold: number,
    trustMetadata: SpilloverTrustMetadata
): InputArtifact | undefined {
    const val = param.Value;
    if (val == null || isTabularRowArray(val)) {
        return undefined;
    }
    if (typeof val === 'object') {
        const serialized = safeJsonStringify(val, true, `object spillover for '${actionName}.${param.Name}'`);
        if (!serialized || serialized.length < charThreshold) {
            return undefined;
        }
        return {
            name: `${actionName} — ${param.Name} (Step ${stepNumber})`,
            typeName: 'JSON',
            toolLibraryClass: 'JSONToolLibrary',
            mimeType: 'application/json',
            content: serialized,
            description: `Structured JSON output from action "${actionName}" (${param.Name}). Queryable via json_path, json_keys, json_search, json_iterate, or get_full.`,
            deliveryMode: 'ToolsOnly',
            forceToolsOnly: true,
            ...trustMetadata,
        };
    }
    if (!isSpilloverStringParam(val, charThreshold)) {
        return undefined;
    }
    return buildStringSpilloverArtifact(actionName, param.Name || 'Output', val, stepNumber, trustMetadata);
}

function buildParamSpilloverArtifacts(
    actionName: string,
    outputParams: ActionParam[],
    stepNumber: number,
    charThreshold: number,
    skipTabularDuplicates: boolean,
    trustMetadata: SpilloverTrustMetadata
): InputArtifact[] {
    const artifacts: InputArtifact[] = [];
    for (const param of outputParams) {
        const lowerName = (param.Name || '').trim().toLowerCase();
        if (lowerName === 'columns' || (skipTabularDuplicates && (lowerName === 'formattedresults' || lowerName === 'results'))) {
            continue;
        }
        const artifact = buildSingleParamSpilloverArtifact(actionName, param, stepNumber, charThreshold, trustMetadata);
        if (artifact) {
            artifacts.push(artifact);
        }
    }
    return artifacts;
}

function buildMessageSpilloverArtifact(
    actionName: string,
    message: string | undefined,
    stepNumber: number,
    charThreshold: number,
    trustMetadata: SpilloverTrustMetadata
): InputArtifact | undefined {
    if (typeof message !== 'string' || message.length < charThreshold) {
        return undefined;
    }
    const isJsonString = isJsonStringPayload(message.trim());
    return {
        name: `${actionName} — Output (Step ${stepNumber})`,
        typeName: isJsonString ? 'JSON' : 'Text',
        toolLibraryClass: isJsonString ? 'JSONToolLibrary' : 'TextToolLibrary',
        mimeType: isJsonString ? 'application/json' : 'text/plain',
        content: message,
        description: `Full message output from action "${actionName}" (${message.length} chars). Queryable via grep, get_lines, or get_full.`,
        deliveryMode: 'ToolsOnly',
        forceToolsOnly: true,
        ...trustMetadata,
    };
}

function isParamEligibleForSpillover(
    param: ActionParam,
    thresholds: ActionSpilloverThresholds
): boolean {
    const lowerName = (param.Name || '').trim().toLowerCase();
    if (lowerName === 'columns') {
        return false;
    }
    const val = param.Value;
    if (val == null) {
        return false;
    }
    if (isTabularRowArray(val)) {
        return wouldTabularRowsSpillOver(val, thresholds);
    }
    if (typeof val === 'object') {
        return exceedsJsonCharBudget(val, thresholds.CharThreshold);
    }
    return isSpilloverStringParam(val, thresholds.CharThreshold);
}

/**
 * Manages lazy, KV-cache-preserving spillover of large or expirable action outputs into an
 * {@link ArtifactToolManager}. Keeps `_ARTIFACT_MANIFEST` untouched while full results stay
 * inline, and materializes artifacts only when inline content is compacted, stubbed, or removed.
 */
export class ActionResultSpilloverManager {
    private pendingByMetadata = new Map<AgentChatMessageMetadata, PendingSpilloverEntry[]>();

    /**
     * Computes character and row spillover thresholds from resolved action expiration settings.
     * In `Compact` mode, only large outputs that compaction (`CompactLength`) would truncate
     * spill over into artifacts, keeping tiny lookup results out of `_ARTIFACT_MANIFEST`.
     */
    public static ResolveThresholds(
        expirationConfig?: ResolvedActionExpirationConfig
    ): ActionSpilloverThresholds {
        const willExpire = expirationConfig != null && expirationConfig.ExpirationMode !== 'None';
        const isCompact = willExpire && expirationConfig.ExpirationMode === 'Compact';
        const CharThreshold = isCompact
            ? Math.max(
                Math.floor(
                    (expirationConfig.CompactLength ?? SPILLOVER_COMPACT_LENGTH_FALLBACK) *
                        SPILLOVER_COMPACT_CHAR_RATIO
                ),
                SPILLOVER_COMPACT_MIN_CHARS
            )
            : willExpire
                ? SPILLOVER_EXPIRING_CHAR_THRESHOLD
                : SPILLOVER_PERSISTENT_CHAR_THRESHOLD;
        const RowThreshold = isCompact
            ? Number.MAX_SAFE_INTEGER
            : willExpire
                ? SPILLOVER_EXPIRING_ROW_THRESHOLD
                : SPILLOVER_PERSISTENT_ROW_THRESHOLD;
        return { CharThreshold, RowThreshold };
    }

    /**
     * Formats the standardized inline hint reminding the model which materialized artifact handle(s)
     * hold the full queryable output after compaction or stubbing.
     */
    public static FormatSpilloverHint(
        artifactIds: readonly string[] | undefined,
        hasArtifacts: boolean,
        style: 'sentence' | 'semicolon' = 'sentence'
    ): string {
        if (!hasArtifacts || !artifactIds || artifactIds.length === 0) {
            return '';
        }
        const joined = artifactIds.join(', ');
        return style === 'semicolon'
            ? `; full output remains queryable via artifact tools on Artifact ${joined}`
            : ` Full output remains queryable via artifact tools on Artifact ${joined}.`;
    }

    /** Number of unmaterialized deferred spillover entries currently queued for this run. */
    public get PendingCount(): number {
        let count = 0;
        for (const entries of this.pendingByMetadata.values()) {
            count += entries.length;
        }
        return count;
    }

    /** Number of unmaterialized deferred spillover entries queued on this manager for `message`. */
    public PendingCountFor(message?: AgentChatMessage): number {
        const meta = message?.metadata;
        return meta ? (this.pendingByMetadata.get(meta)?.length ?? 0) : 0;
    }

    /** True when `message` has at least one deferred spillover entry queued on this manager. */
    public HasPending(message?: AgentChatMessage): boolean {
        return this.PendingCountFor(message) > 0;
    }

    /** Discards all unmaterialized deferred spillover entries (called on run start/end). */
    public Clear(): void {
        this.pendingByMetadata.clear();
    }

    /**
     * Moves any queued deferred spillover entries from `from` onto `to` (called when two adjacent
     * native `role: 'tool'` turns are merged into a single provider-valid tool turn).
     */
    public TransferPending(
        from: AgentChatMessageMetadata | undefined,
        to: AgentChatMessageMetadata | undefined
    ): void {
        if (!from || !to || from === to) {
            return;
        }
        const entries = this.pendingByMetadata.get(from);
        if (!entries || entries.length === 0) {
            return;
        }
        this.pendingByMetadata.delete(from);
        const existing = this.pendingByMetadata.get(to);
        if (existing) {
            existing.push(...entries);
        } else {
            this.pendingByMetadata.set(to, [...entries]);
        }
    }

    /**
     * Pure predicate indicating whether the given action output warrants spillover registration,
     * using incremental sizing to avoid eager serialization of large arrays or nested objects.
     */
    public WouldSpillOver(
        outputParams: ActionParam[],
        message: string | undefined,
        expirationConfig?: ResolvedActionExpirationConfig
    ): boolean {
        const thresholds = ActionResultSpilloverManager.ResolveThresholds(expirationConfig);
        for (const param of outputParams) {
            if (isParamEligibleForSpillover(param, thresholds)) {
                return true;
            }
        }
        return typeof message === 'string' && message.length >= thresholds.CharThreshold;
    }

    /**
     * Builds the `InputArtifact` definitions that would be registered for an action output.
     */
    public CollectCandidates(input: ActionOutputSpilloverInput): InputArtifact[] {
        const trustLevel = input.TrustLevel ?? 'Trusted';
        const trustMetadata: SpilloverTrustMetadata =
            trustLevel !== 'Trusted'
                ? { trustLevel, sourceName: input.SourceName ?? `action:${input.ActionName}` }
                : {};
        const thresholds = ActionResultSpilloverManager.ResolveThresholds(input.ExpirationConfig);
        const tabular = buildTabularSpilloverArtifacts(
            input.ActionName,
            input.OutputParams,
            input.StepNumber,
            thresholds,
            trustMetadata
        );
        const paramArtifacts = buildParamSpilloverArtifacts(
            input.ActionName,
            input.OutputParams,
            input.StepNumber,
            thresholds.CharThreshold,
            tabular.length > 0,
            trustMetadata
        );
        const combined = [...tabular, ...paramArtifacts];
        if (combined.length > 0) {
            return combined;
        }
        const msgArtifact = buildMessageSpilloverArtifact(
            input.ActionName,
            input.Message,
            input.StepNumber,
            thresholds.CharThreshold,
            trustMetadata
        );
        return msgArtifact ? [msgArtifact] : [];
    }

    /**
     * Defers artifact spillover registration for `metadata` until the inline message is compacted,
     * removed, or recovered. Returns `true` when queued, or `false` when the output is below
     * spillover thresholds.
     */
    public QueueDeferred(
        metadata: AgentChatMessageMetadata,
        input: ActionOutputSpilloverInput,
        artifactManager: ArtifactToolManager
    ): boolean {
        if (!this.WouldSpillOver(input.OutputParams, input.Message, input.ExpirationConfig)) {
            return false;
        }
        const capturedInput: ActionOutputSpilloverInput = {
            ...input,
            OutputParams: input.OutputParams.map(param => ({ ...param })),
        };
        const entry: PendingSpilloverEntry = {
            Input: capturedInput,
            ArtifactManager: artifactManager,
        };
        const existing = this.pendingByMetadata.get(metadata);
        if (existing) {
            existing.push(entry);
        } else {
            this.pendingByMetadata.set(metadata, [entry]);
        }
        return true;
    }

    /**
     * Materializes deferred spillovers tracked for `message.metadata`, populates
     * `message.metadata.artifactIds`, and clears the consumed pending entries.
     */
    public Materialize(message?: AgentChatMessage): string[] {
        const meta = message?.metadata;
        const existing = meta?.artifactIds ?? [];
        if (!meta) {
            return existing;
        }
        const pending = this.pendingByMetadata.get(meta);
        if (!pending || pending.length === 0) {
            return existing;
        }
        this.pendingByMetadata.delete(meta);

        const materialized: string[] = [...existing];
        for (const entry of pending) {
            for (const candidate of this.CollectCandidates(entry.Input)) {
                const id = entry.ArtifactManager.RegisterArtifact(candidate);
                if (!materialized.includes(id)) {
                    materialized.push(id);
                }
            }
        }
        if (materialized.length > 0) {
            meta.artifactIds = materialized;
        }
        return materialized;
    }

    /**
     * Immediately registers spillover artifacts into `artifactManager` (useful for callers/tests
     * that intentionally materialize outside the deferred compaction lifecycle).
     */
    public RegisterImmediate(
        input: ActionOutputSpilloverInput,
        artifactManager: ArtifactToolManager
    ): string[] {
        return this.CollectCandidates(input).map(candidate => artifactManager.RegisterArtifact(candidate));
    }
}
