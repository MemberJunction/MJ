/**
 * @fileoverview The security envelope of a durable task graph (`TaskSecurityEnvelope`).
 *
 * A graph runs outside the agent run that wrote it: the dispatcher claims its nodes later, on any
 * server, as a background worker. Everything that bounded the run — the parameters the host bound,
 * the audience, the validated scope, the caller's tenant and the taint bit — would be lost at that
 * boundary, so the submitter writes it into `MJ: Tasks.SecurityEnvelope` on the graph's root and on
 * every child, and the dispatcher enforces it on each node.
 *
 * The envelope fails closed: a column that holds anything but a well-formed envelope of a known
 * version refuses the node ({@link ParseTaskSecurityEnvelope}), and two envelopes combine into the
 * stricter of the two or not at all ({@link MergeTaskSecurityEnvelopes}).
 *
 * @module @memberjunction/ai-core-plus
 */
import type { TenantContext } from '@memberjunction/core';
import { NormalizeUUID, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import type { BoundActionParams, SecondaryScopeValue } from '../agent-types';

/** The envelope format this code reads and writes. A stored envelope of any other version is refused. */
export const TASK_SECURITY_ENVELOPE_VERSION = 1;

/**
 * The result code of an action a tainted task-graph node may not run (its configuration says
 * `disallowWhenTainted`), refused by the action runner before the action executes. Never retried: the
 * node's taint does not change between attempts.
 */
export const TAINTED_EGRESS_BLOCKED = 'TAINTED_EGRESS_BLOCKED';

/**
 * The keys of `MJ: Tasks.Configuration.runtime` the dispatcher's security decisions read: a step's
 * recorded output taint, the parameters its action was given (what its compensation runs with), and
 * who completed a Human step (whether that completion clears taint). The dispatcher records the first
 * two through its guarded completion procedure, beneath the entity layer, and the third inside
 * {@link TASK_GRAPH_RUNTIME_SECURITY_OPERATION}; `MJTaskEntityServer` stamps `completedByUserID` itself
 * when anyone else completes a Human step, and refuses every other change to them.
 */
export const TASK_RUNTIME_SECURITY_KEYS: readonly string[] = ['isOutputTainted', 'actionInput', 'completedByUserID'];

/**
 * Server operation key (`ServerOperationScopeManager`) under which the task-graph dispatcher writes
 * {@link TASK_RUNTIME_SECURITY_KEYS} through the entity layer: settling a Human step from the answered
 * request, it records who answered. Client CRUD entry points (GraphQL, REST, transaction groups) run
 * inside a client CRUD boundary that masks every outer scope, and other server code (an action an agent
 * calls, Update Record included) never enters it, so only the dispatcher can.
 */
export const TASK_GRAPH_RUNTIME_SECURITY_OPERATION = 'TaskGraph.Dispatcher.WriteRuntimeSecurity';

/** Name of the `MJ: Task Types` row a task graph's workflow (parent) task is filed under. */
export const TASK_GRAPH_WORKFLOW_TYPE_NAME = 'AI Workflow';

/**
 * The run's validated scope, exactly as `BaseAgent` hands it to each action dispatch
 * (`ActionRunScope` in `@memberjunction/actions-base`, which the action runner passes on as `RunScope`).
 */
export interface TaskRunScope {
    /** The primary scope entity's name, or `null` when the run names none. */
    readonly PrimaryScopeEntityName: string | null;
    /** The run's tenant record ID, or `null` when the run has none. */
    readonly PrimaryScopeRecordID: string | null;
    /** The run's secondary dimensions, or `null` when it has none. */
    readonly SecondaryScopes: Readonly<Record<string, SecondaryScopeValue>> | null;
    /** The search scopes the host assigned the run; absent when it assigned none. Never empty when present. */
    readonly SearchScopeIDs?: readonly string[];
}

/** The readers a run's output reaches besides its caller (`ExecuteAgentParams.Audience`, `'Intersection'`). */
export interface TaskAudienceEnvelope {
    /** `MJ: Users` IDs of every reader besides the caller. Never empty. */
    readonly ReaderUserIDs: readonly string[];
}

/** A run's security constraints, persisted on a task graph's rows and enforced on every node. */
export interface TaskSecurityEnvelope {
    /** Always {@link TASK_SECURITY_ENVELOPE_VERSION}. */
    readonly Version: typeof TASK_SECURITY_ENVELOPE_VERSION;
    /** The run's bound action parameters, in `ExecuteAgentParams.boundActionParams`' shape: Action ID → name → value. */
    readonly BoundActionParams?: Readonly<BoundActionParams>;
    /** The run's audience, when it adds a reader beyond the caller. */
    readonly Audience?: TaskAudienceEnvelope;
    /** The run's validated scope, when it carries a tenant, a secondary dimension or host-assigned search scopes. */
    readonly RunScope?: TaskRunScope;
    /**
     * The caller's request-level tenant (`UserInfo.TenantContext`), when it had one. Each node runs as a
     * per-task clone of its user stamped with exactly this value, never as the shared user itself.
     */
    readonly CallerTenantContext?: TenantContext;
    /**
     * Whether the run had ingested `SemiTrusted` or `Untrusted` content. Monotonic within a graph: a
     * node's output is tainted when any of its inputs was, until a completed `Human` step reviews it.
     */
    readonly IsRunTainted: boolean;
}

/** What a stored envelope column holds. */
export type TaskSecurityEnvelopeParse =
    | { readonly Status: 'Absent' }
    | { readonly Status: 'Valid'; readonly Envelope: TaskSecurityEnvelope }
    | { readonly Status: 'Invalid'; readonly Reason: string };

/** Two envelopes combined: the stricter of the two, or the reason they cannot be combined. */
export type TaskSecurityEnvelopeMerge =
    | { readonly Success: true; readonly Envelope: TaskSecurityEnvelope | undefined }
    | { readonly Success: false; readonly Reason: string };

/** The run state {@link BuildTaskSecurityEnvelope} reads. */
export interface TaskSecurityEnvelopeSource {
    BoundActionParams?: BoundActionParams;
    /** Reader IDs the audience adds beyond the caller (`AgentAudienceReaderIDs`). */
    AudienceReaderUserIDs?: readonly string[];
    /** The run's validated scope. */
    RunScope?: TaskRunScope | null;
    /** The caller's `UserInfo.TenantContext`. */
    CallerTenantContext?: TenantContext;
    IsRunTainted?: boolean;
}

/** Result of applying an envelope's bound parameters to one action's input. */
export interface TaskSecurityParamEnforcementResult {
    readonly Params: Record<string, unknown>;
    /** Bound names whose input value differed from the binding and was replaced. */
    readonly OverriddenKeys: string[];
}

const ENVELOPE_KEYS: ReadonlySet<string> = new Set([
    'Version', 'BoundActionParams', 'Audience', 'RunScope', 'CallerTenantContext', 'IsRunTainted',
]);
const RUN_SCOPE_KEYS: ReadonlySet<string> = new Set([
    'PrimaryScopeEntityName', 'PrimaryScopeRecordID', 'SecondaryScopes', 'SearchScopeIDs',
]);
const TENANT_SOURCES: ReadonlySet<string> = new Set<TenantContext['Source']>(['header', 'linkedEntity', 'custom']);

/**
 * Reads a stored `SecurityEnvelope` column. `null`, `undefined` and blank text are `Absent`; anything
 * else must be a complete envelope of {@link TASK_SECURITY_ENVELOPE_VERSION}, or it is `Invalid`:
 * malformed JSON, an unknown version, an unknown key and a malformed part all refuse, because a
 * constraint this code cannot read is a constraint it cannot enforce.
 */
export function ParseTaskSecurityEnvelope(raw: string | null | undefined): TaskSecurityEnvelopeParse {
    if (raw == null || raw.trim().length === 0) {
        return { Status: 'Absent' };
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return invalid('it is not valid JSON');
    }
    if (!isPlainObject(parsed)) {
        return invalid('it is not a JSON object');
    }
    if (parsed.Version !== TASK_SECURITY_ENVELOPE_VERSION) {
        return invalid(`its Version is ${JSON.stringify(parsed.Version) ?? 'missing'}, not ${TASK_SECURITY_ENVELOPE_VERSION}`);
    }
    const unknownKey = Object.keys(parsed).find((key) => !ENVELOPE_KEYS.has(key));
    if (unknownKey) {
        return invalid(`it has an unknown key '${unknownKey}'`);
    }
    if (typeof parsed.IsRunTainted !== 'boolean') {
        return invalid('IsRunTainted is not a boolean');
    }
    const problem = boundParamsProblem(parsed.BoundActionParams)
        ?? audienceProblem(parsed.Audience)
        ?? runScopeProblem(parsed.RunScope)
        ?? tenantContextProblem(parsed.CallerTenantContext);
    if (problem) {
        return invalid(problem);
    }
    return { Status: 'Valid', Envelope: toEnvelope(parsed) };
}

/** Serializes an envelope for the `SecurityEnvelope` column; `null` for none. */
export function SerializeTaskSecurityEnvelope(envelope: TaskSecurityEnvelope | null | undefined): string | null {
    return envelope ? JSON.stringify(envelope) : null;
}

/**
 * Builds the envelope for a graph from its submitting run's state, or `undefined` when the run carries
 * no constraint (the column then stays `NULL`). The caller decides beforehand whether the run's state
 * can be carried at all ({@link TenantContextCarryProblem}).
 */
export function BuildTaskSecurityEnvelope(source: TaskSecurityEnvelopeSource): TaskSecurityEnvelope | undefined {
    const bound = nonEmptyBoundParams(source.BoundActionParams);
    const readers = source.AudienceReaderUserIDs?.filter((id) => id.trim().length > 0) ?? [];
    const runScope = constrainingRunScope(source.RunScope);
    const tenant = source.CallerTenantContext;
    const tainted = source.IsRunTainted === true;
    if (!bound && readers.length === 0 && !runScope && !tenant && !tainted) {
        return undefined;
    }
    return {
        Version: TASK_SECURITY_ENVELOPE_VERSION,
        ...(bound ? { BoundActionParams: bound } : {}),
        ...(readers.length > 0 ? { Audience: { ReaderUserIDs: [...readers] } } : {}),
        ...(runScope ? { RunScope: runScope } : {}),
        ...(tenant ? { CallerTenantContext: { ...tenant } } : {}),
        IsRunTainted: tainted,
    };
}

/**
 * Why a caller's `TenantContext` cannot travel in an envelope, or `null` when it can. It must be plain
 * JSON data with a `TenantID` and a known `Source`; a subtype's extra fields travel too, but a value
 * JSON cannot hold (a function, a `Date`, a class instance) would arrive changed, so it refuses instead.
 */
export function TenantContextCarryProblem(tenant: TenantContext | undefined): string | null {
    if (tenant === undefined) {
        return null;
    }
    if (!isJSONData(tenant)) {
        return 'the caller\'s tenant context holds a value that does not survive JSON';
    }
    return tenantContextProblem(tenant);
}

/**
 * Combines envelopes into the strictest one: bound parameters, audience readers and secondary
 * dimensions add up, host-assigned search scopes intersect, the tenant and the caller's tenant
 * context must agree, and taint is OR'd. Two envelopes that disagree on a value (a different tenant,
 * a parameter bound to two values, search scopes with nothing in common) do not combine.
 */
export function MergeTaskSecurityEnvelopes(
    ...envelopes: ReadonlyArray<TaskSecurityEnvelope | null | undefined>
): TaskSecurityEnvelopeMerge {
    let merged: TaskSecurityEnvelope | undefined;
    for (const next of envelopes) {
        if (!next) continue;
        if (!merged) {
            merged = next;
            continue;
        }
        const result = mergeTwo(merged, next);
        if (!result.Success) return result;
        merged = result.Envelope;
    }
    return { Success: true, Envelope: merged };
}

/**
 * Applies the envelope's bindings for one action to that action's input: each bound name is set to the
 * bound value, and an input key naming it in any other casing is removed, so neither an LLM-written node
 * input nor an upstream node's output can replace a bound value. Bindings are keyed by Action ID, exactly
 * as `ExecuteAgentParams.boundActionParams` are.
 */
export function ApplyTaskSecurityEnvelopeToParams(
    inputPayload: Record<string, unknown> | null | undefined,
    envelope: TaskSecurityEnvelope | null | undefined,
    actionID: string | null | undefined,
): TaskSecurityParamEnforcementResult {
    const out: Record<string, unknown> = inputPayload ? { ...inputPayload } : {};
    const overriddenKeys: string[] = [];
    const bindings = actionID ? bindingsForAction(envelope?.BoundActionParams, actionID) : undefined;
    for (const [boundKey, boundValue] of Object.entries(bindings ?? {})) {
        const boundLower = boundKey.toLowerCase();
        for (const existingKey of Object.keys(out)) {
            if (existingKey.toLowerCase() !== boundLower) continue;
            if (!jsonEqual(out[existingKey], boundValue)) {
                overriddenKeys.push(boundKey);
            }
            delete out[existingKey];
        }
        out[boundKey] = boundValue;
    }
    return { Params: out, OverriddenKeys: overriddenKeys };
}

function bindingsForAction(bound: Readonly<BoundActionParams> | undefined, actionID: string): Readonly<Record<string, unknown>> | undefined {
    const key = bound ? Object.keys(bound).find((id) => UUIDsEqual(id, actionID)) : undefined;
    return key && bound ? bound[key] : undefined;
}

function mergeTwo(a: TaskSecurityEnvelope, b: TaskSecurityEnvelope): TaskSecurityEnvelopeMerge {
    const bound = mergeBoundParams(a.BoundActionParams, b.BoundActionParams);
    if (typeof bound === 'string') return { Success: false, Reason: bound };
    const runScope = mergeRunScopes(a.RunScope, b.RunScope);
    if (typeof runScope === 'string') return { Success: false, Reason: runScope };
    if (a.CallerTenantContext && b.CallerTenantContext && !jsonEqual(a.CallerTenantContext, b.CallerTenantContext)) {
        return { Success: false, Reason: 'the envelopes name different caller tenant contexts' };
    }
    const tenant = a.CallerTenantContext ?? b.CallerTenantContext;
    const readers = unionIDs(a.Audience?.ReaderUserIDs, b.Audience?.ReaderUserIDs);
    return {
        Success: true,
        Envelope: {
            Version: TASK_SECURITY_ENVELOPE_VERSION,
            ...(bound ? { BoundActionParams: bound } : {}),
            ...(readers.length > 0 ? { Audience: { ReaderUserIDs: readers } } : {}),
            ...(runScope ? { RunScope: runScope } : {}),
            ...(tenant ? { CallerTenantContext: tenant } : {}),
            IsRunTainted: a.IsRunTainted || b.IsRunTainted,
        },
    };
}

/** Both envelopes' bindings, or the reason they conflict (one parameter bound to two values). */
function mergeBoundParams(
    a: Readonly<BoundActionParams> | undefined,
    b: Readonly<BoundActionParams> | undefined,
): BoundActionParams | undefined | string {
    if (!a || !b) return a ?? b;
    const merged: BoundActionParams = {};
    for (const [actionID, params] of Object.entries(a)) {
        merged[NormalizeUUID(actionID)] = { ...params };
    }
    for (const [actionID, params] of Object.entries(b)) {
        const target = merged[NormalizeUUID(actionID)] ?? {};
        for (const [name, value] of Object.entries(params)) {
            const existing = Object.keys(target).find((key) => key.toLowerCase() === name.toLowerCase());
            if (existing !== undefined && !jsonEqual(target[existing], value)) {
                return `parameter '${name}' of action ${actionID} is bound to two different values`;
            }
            target[existing ?? name] = value;
        }
        merged[NormalizeUUID(actionID)] = target;
    }
    return merged;
}

/** Both scopes combined, or the reason they conflict. */
function mergeRunScopes(a: TaskRunScope | undefined, b: TaskRunScope | undefined): TaskRunScope | undefined | string {
    if (!a || !b) return a ?? b;
    const entityName = agreeingValue(a.PrimaryScopeEntityName, b.PrimaryScopeEntityName, (x, y) => x.toLowerCase() === y.toLowerCase());
    const recordID = agreeingValue(a.PrimaryScopeRecordID, b.PrimaryScopeRecordID, (x, y) => x === y || UUIDsEqual(x, y));
    if (entityName.Conflict || recordID.Conflict) {
        return 'the envelopes name different tenants';
    }
    const secondary: Record<string, SecondaryScopeValue> = { ...(a.SecondaryScopes ?? {}) };
    for (const [dimension, value] of Object.entries(b.SecondaryScopes ?? {})) {
        if (dimension in secondary && !jsonEqual(secondary[dimension], value)) {
            return `the envelopes give secondary scope '${dimension}' different values`;
        }
        secondary[dimension] = value;
    }
    const searchScopeIDs = intersectSearchScopes(a.SearchScopeIDs, b.SearchScopeIDs);
    if (searchScopeIDs !== undefined && searchScopeIDs.length === 0) {
        // An empty list must never reach an action: "no search scopes assigned" widens Scoped Search.
        return 'the envelopes\' host-assigned search scopes have none in common';
    }
    return {
        PrimaryScopeEntityName: entityName.Value,
        PrimaryScopeRecordID: recordID.Value,
        SecondaryScopes: Object.keys(secondary).length > 0 ? secondary : null,
        ...(searchScopeIDs ? { SearchScopeIDs: searchScopeIDs } : {}),
    };
}

/** The one value two scopes agree on (either may be null), or a conflict when both are set and differ. */
function agreeingValue(
    a: string | null,
    b: string | null,
    same: (x: string, y: string) => boolean,
): { Value: string | null; Conflict: boolean } {
    if (a === null || b === null) return { Value: a ?? b, Conflict: false };
    return same(a, b) ? { Value: a, Conflict: false } : { Value: null, Conflict: true };
}

function intersectSearchScopes(a: readonly string[] | undefined, b: readonly string[] | undefined): string[] | undefined {
    if (!a || !b) return a ? [...a] : b ? [...b] : undefined;
    const inB = new UUIDSet(b);
    return a.filter((id) => inB.Has(id));
}

function unionIDs(a: readonly string[] | undefined, b: readonly string[] | undefined): string[] {
    const seen = new UUIDSet();
    const out: string[] = [];
    for (const id of [...(a ?? []), ...(b ?? [])]) {
        if (!seen.Has(id)) {
            seen.Add(id);
            out.push(id);
        }
    }
    return out;
}

function nonEmptyBoundParams(bound: BoundActionParams | undefined): BoundActionParams | undefined {
    if (!bound) return undefined;
    const out: BoundActionParams = {};
    for (const [actionID, params] of Object.entries(bound)) {
        if (params && Object.keys(params).length > 0) {
            out[actionID] = { ...params };
        }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

/** The scope when it bounds anything (a tenant, a secondary dimension or search scopes), copied; else undefined. */
function constrainingRunScope(scope: TaskRunScope | null | undefined): TaskRunScope | undefined {
    if (!scope) return undefined;
    const recordID = scope.PrimaryScopeRecordID?.trim() ? scope.PrimaryScopeRecordID : null;
    const secondary = scope.SecondaryScopes && Object.keys(scope.SecondaryScopes).length > 0
        ? Object.fromEntries(Object.entries(scope.SecondaryScopes).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v]))
        : null;
    const searchScopeIDs = scope.SearchScopeIDs && scope.SearchScopeIDs.length > 0 ? [...scope.SearchScopeIDs] : undefined;
    if (!recordID && !secondary && !searchScopeIDs) return undefined;
    return {
        PrimaryScopeEntityName: scope.PrimaryScopeEntityName ?? null,
        PrimaryScopeRecordID: recordID,
        SecondaryScopes: secondary,
        ...(searchScopeIDs ? { SearchScopeIDs: searchScopeIDs } : {}),
    };
}

/** Copies a parsed object, already checked part by part, into an envelope. */
function toEnvelope(parsed: Record<string, unknown>): TaskSecurityEnvelope {
    const runScope = isPlainObject(parsed.RunScope) ? parsed.RunScope : undefined;
    const audience = isPlainObject(parsed.Audience) ? parsed.Audience : undefined;
    return {
        Version: TASK_SECURITY_ENVELOPE_VERSION,
        ...(isPlainObject(parsed.BoundActionParams) ? { BoundActionParams: toBoundParams(parsed.BoundActionParams) } : {}),
        ...(audience ? { Audience: { ReaderUserIDs: toStrings(audience.ReaderUserIDs) } } : {}),
        ...(runScope ? { RunScope: toRunScope(runScope) } : {}),
        ...(isPlainObject(parsed.CallerTenantContext) ? { CallerTenantContext: toTenantContext(parsed.CallerTenantContext) } : {}),
        IsRunTainted: parsed.IsRunTainted === true,
    };
}

function toBoundParams(raw: Record<string, unknown>): BoundActionParams {
    const out: BoundActionParams = {};
    for (const [actionID, params] of Object.entries(raw)) {
        if (isPlainObject(params)) out[actionID] = { ...params };
    }
    return out;
}

function toRunScope(raw: Record<string, unknown>): TaskRunScope {
    const secondary: Record<string, SecondaryScopeValue> = {};
    for (const [key, value] of Object.entries(isPlainObject(raw.SecondaryScopes) ? raw.SecondaryScopes : {})) {
        if (isSecondaryScopeValue(value)) secondary[key] = value;
    }
    return {
        PrimaryScopeEntityName: typeof raw.PrimaryScopeEntityName === 'string' ? raw.PrimaryScopeEntityName : null,
        PrimaryScopeRecordID: typeof raw.PrimaryScopeRecordID === 'string' ? raw.PrimaryScopeRecordID : null,
        SecondaryScopes: isPlainObject(raw.SecondaryScopes) ? secondary : null,
        ...(Array.isArray(raw.SearchScopeIDs) ? { SearchScopeIDs: toStrings(raw.SearchScopeIDs) } : {}),
    };
}

function toTenantContext(raw: Record<string, unknown>): TenantContext {
    const source = raw.Source === 'header' || raw.Source === 'linkedEntity' ? raw.Source : 'custom';
    return { ...raw, TenantID: String(raw.TenantID), Source: source };
}

function toStrings(raw: unknown): string[] {
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
}

function boundParamsProblem(raw: unknown): string | null {
    if (raw === undefined) return null;
    if (!isPlainObject(raw)) return 'BoundActionParams is not an object';
    for (const [actionID, params] of Object.entries(raw)) {
        if (!isPlainObject(params)) return `BoundActionParams['${actionID}'] is not an object`;
        if (!isJSONData(params)) return `BoundActionParams['${actionID}'] holds a value that is not JSON data`;
    }
    return null;
}

function audienceProblem(raw: unknown): string | null {
    if (raw === undefined) return null;
    if (!isPlainObject(raw) || Object.keys(raw).some((key) => key !== 'ReaderUserIDs')) {
        return 'Audience is not { ReaderUserIDs }';
    }
    const readers = raw.ReaderUserIDs;
    if (!Array.isArray(readers) || readers.length === 0 || readers.some((id) => typeof id !== 'string' || id.trim().length === 0)) {
        return 'Audience.ReaderUserIDs is not a non-empty list of user IDs';
    }
    return null;
}

function runScopeProblem(raw: unknown): string | null {
    if (raw === undefined) return null;
    if (!isPlainObject(raw)) return 'RunScope is not an object';
    const unknownKey = Object.keys(raw).find((key) => !RUN_SCOPE_KEYS.has(key));
    if (unknownKey) return `RunScope has an unknown key '${unknownKey}'`;
    if (!isNullableString(raw.PrimaryScopeEntityName) || !isNullableString(raw.PrimaryScopeRecordID)) {
        return 'RunScope.PrimaryScopeEntityName and PrimaryScopeRecordID must be strings or null';
    }
    const secondary = raw.SecondaryScopes;
    if (secondary !== null && (!isPlainObject(secondary) || !Object.values(secondary).every(isSecondaryScopeValue))) {
        return 'RunScope.SecondaryScopes is not null or an object of scope values';
    }
    const search = raw.SearchScopeIDs;
    if (search !== undefined && (!Array.isArray(search) || search.length === 0 || search.some((id) => typeof id !== 'string' || id.trim().length === 0))) {
        return 'RunScope.SearchScopeIDs is not a non-empty list of IDs';
    }
    return null;
}

function tenantContextProblem(raw: unknown): string | null {
    if (raw === undefined) return null;
    if (!isPlainObject(raw)) return 'CallerTenantContext is not an object';
    if (typeof raw.TenantID !== 'string' || raw.TenantID.trim().length === 0) return 'CallerTenantContext.TenantID is not a non-blank string';
    if (typeof raw.Source !== 'string' || !TENANT_SOURCES.has(raw.Source)) return 'CallerTenantContext.Source is not a known tenant source';
    return null;
}

function isSecondaryScopeValue(value: unknown): value is SecondaryScopeValue {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        || (Array.isArray(value) && value.every((item) => typeof item === 'string'));
}

function isNullableString(value: unknown): value is string | null {
    return value === null || typeof value === 'string';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto: unknown = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/** True for values JSON round-trips unchanged: null, finite numbers, strings, booleans, arrays and plain objects of those. */
function isJSONData(value: unknown): boolean {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (Array.isArray(value)) return value.every(isJSONData);
    return isPlainObject(value) && Object.values(value).every(isJSONData);
}

function jsonEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

function invalid(reason: string): TaskSecurityEnvelopeParse {
    return { Status: 'Invalid', Reason: `The task's security envelope cannot be enforced: ${reason}.` };
}
