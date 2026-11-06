/**
 * @fileoverview Durable security envelope contract for task graphs (`TaskSecurityEnvelope`).
 *
 * Carries bound action parameters, shared-room audience intersections, tenant/run scope context,
 * and monotonic taint state across durable `MJ: Tasks` rows so `TaskGraphDispatcher` enforces the
 * same security invariants as in-turn `BaseAgent` execution across restarts and worker boundaries.
 *
 * @module @memberjunction/ai-core-plus
 */
import { NormalizeUUID, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import type { AgentRunAudience, BoundActionParams, SecondaryScopeValue } from '../agent-types';

/**
 * Scalar or primitive-array values bound by the host for action parameters across a task graph.
 */
export type TaskBoundParamValue =
    | string
    | number
    | boolean
    | null
    | ReadonlyArray<string | number>;

/**
 * Parameter name -> bound value map enforced across task-graph action/agent/prompt nodes.
 */
export type TaskBoundParamMap = Record<string, TaskBoundParamValue>;

/**
 * Audience constraint carried across a durable task graph.
 */
export interface TaskAudienceEnvelope {
    readonly ReaderUserIDs: ReadonlyArray<string>;
    readonly Mode?: 'Intersection' | 'StrictSubset';
}

/**
 * Multi-tenant and secondary scope context carried across a durable task graph.
 */
export interface TaskTenantEnvelope {
    readonly PrimaryScopeEntityName?: string | null;
    readonly PrimaryScopeRecordID?: string | null;
    readonly SecondaryScopes?: Readonly<Record<string, unknown>> | null;
}

/**
 * Immutable security envelope persisted on a task graph parent and its child tasks.
 */
export interface TaskSecurityEnvelope {
    readonly Version?: 1;
    /**
     * Global parameter bindings applied to every action node in the graph regardless of ActionID.
     */
    readonly BoundActionParams?: Readonly<TaskBoundParamMap>;
    /**
     * Per-action parameter bindings (keyed by ActionID or `'*'`), preserving the structure of
     * `ExecuteAgentParams.boundActionParams`.
     */
    readonly BoundParamsByAction?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
    /**
     * Shared-room audience constraint; non-empty `ReaderUserIDs` causes non-audience-supporting
     * actions to fail closed with `AUDIENCE_UNSUPPORTED`.
     */
    readonly Audience?: TaskAudienceEnvelope;
    /**
     * Primary and secondary tenant scopes used to mint tenant-scoped providers and sub-agent runs.
     */
    readonly TenantContext?: TaskTenantEnvelope;
    /** Convenience alias for `TenantContext.PrimaryScopeEntityName`. */
    readonly PrimaryScopeEntityName?: string | null;
    /** Convenience alias for `TenantContext.PrimaryScopeRecordID`. */
    readonly PrimaryScopeRecordID?: string | null;
    /** Convenience alias for `TenantContext.SecondaryScopes`. */
    readonly SecondaryScopes?: Readonly<Record<string, SecondaryScopeValue>> | null;
    /**
     * Monotonic taint flag; once true on an upstream node, propagates to all downstream nodes
     * unless a completed `Human` (HITL approval) node intervenes.
     */
    readonly IsRunTainted?: boolean;
    /**
     * Optional allowlist of ActionIDs permitted to execute when `IsRunTainted` is `true`.
     * When `IsRunTainted === true`:
     * - If `AllowedEgressActionIDs` is omitted or empty, all action nodes are blocked unless
     *   explicitly allowlisted.
     * - If `AllowedEgressActionIDs` is provided, only actions whose ID matches an entry (via
     *   `UUIDsEqual`) are permitted.
     */
    readonly AllowedEgressActionIDs?: ReadonlyArray<string>;
}

/**
 * Result of applying a {@link TaskSecurityEnvelope}'s bound parameters onto a node's input payload.
 */
export interface TaskSecurityParamEnforcementResult {
    readonly Params: Record<string, unknown>;
    readonly OverriddenKeys: string[];
}

/**
 * Safely parses a serialized or raw {@link TaskSecurityEnvelope}, returning `undefined` when
 * absent or malformed.
 */
export function ParseTaskSecurityEnvelope(raw: unknown): TaskSecurityEnvelope | undefined {
    if (raw == null) {
        return undefined;
    }
    let candidate: unknown = raw;
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) {
            return undefined;
        }
        try {
            candidate = JSON.parse(trimmed);
        } catch {
            return undefined;
        }
    }
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        return undefined;
    }
    const obj = candidate as Record<string, unknown>;
    if (obj.Version !== undefined && obj.Version !== 1) {
        return undefined;
    }

    const boundActionParams = parseBoundParamMap(obj.BoundActionParams);
    const boundParamsByAction = parseBoundParamsByAction(obj.BoundParamsByAction);
    const audience = parseAudienceEnvelope(obj.Audience);
    const tenantContext = parseTenantEnvelope(obj.TenantContext) ?? parseTenantEnvelope(obj);
    const isRunTainted = typeof obj.IsRunTainted === 'boolean' ? obj.IsRunTainted : undefined;
    const allowedEgressActionIDs = Array.isArray(obj.AllowedEgressActionIDs)
        ? obj.AllowedEgressActionIDs.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        : undefined;

    if (
        !boundActionParams &&
        !boundParamsByAction &&
        !audience &&
        !tenantContext &&
        isRunTainted === undefined &&
        allowedEgressActionIDs === undefined
    ) {
        return undefined;
    }

    return {
        ...(obj.Version === 1 ? { Version: 1 as const } : {}),
        ...(boundActionParams ? { BoundActionParams: boundActionParams } : {}),
        ...(boundParamsByAction ? { BoundParamsByAction: boundParamsByAction } : {}),
        ...(audience ? { Audience: audience } : {}),
        ...(tenantContext ? {
            TenantContext: tenantContext,
            ...(tenantContext.PrimaryScopeEntityName ? { PrimaryScopeEntityName: tenantContext.PrimaryScopeEntityName } : {}),
            ...(tenantContext.PrimaryScopeRecordID ? { PrimaryScopeRecordID: tenantContext.PrimaryScopeRecordID } : {}),
            ...(tenantContext.SecondaryScopes ? { SecondaryScopes: tenantContext.SecondaryScopes as Readonly<Record<string, SecondaryScopeValue>> } : {}),
        } : {}),
        ...(isRunTainted !== undefined ? { IsRunTainted: isRunTainted } : {}),
        ...(allowedEgressActionIDs !== undefined ? { AllowedEgressActionIDs: allowedEgressActionIDs } : {}),
    };
}

/**
 * Serializes a {@link TaskSecurityEnvelope} to JSON, or returns `null` when undefined.
 */
export function SerializeTaskSecurityEnvelope(
    envelope: TaskSecurityEnvelope | null | undefined,
): string | null {
    if (!envelope) {
        return null;
    }
    return JSON.stringify(envelope);
}

/**
 * Merges two or more {@link TaskSecurityEnvelope} objects monotonically:
 * - Earlier (parent) bound parameters win over later (child) attempts to weaken or override them.
 * - `IsRunTainted` is monotonic (`parent.IsRunTainted || child.IsRunTainted`).
 * - `Audience.ReaderUserIDs` is the union of reader sets so intersection narrowing is preserved.
 * - `TenantContext` prefers the parent's tenant bindings when present.
 * - `AllowedEgressActionIDs` intersects allowlists when both are specified.
 */
export function MergeTaskSecurityEnvelopes(
    ...envelopes: Array<TaskSecurityEnvelope | null | undefined>
): TaskSecurityEnvelope | undefined {
    const valid = envelopes.filter((e): e is TaskSecurityEnvelope => e != null);
    if (valid.length === 0) {
        return undefined;
    }
    return valid.reduce((acc, next) => mergeTwoEnvelopes(acc, next));
}

function mergeTwoEnvelopes(
    parent: TaskSecurityEnvelope,
    child: TaskSecurityEnvelope,
): TaskSecurityEnvelope {
    const mergedBoundParams: TaskBoundParamMap = {
        ...(child.BoundActionParams ?? {}),
        ...(parent.BoundActionParams ?? {}),
    };

    const mergedByAction: Record<string, Readonly<Record<string, unknown>>> = {};
    for (const [actionKey, params] of Object.entries(child.BoundParamsByAction ?? {})) {
        mergedByAction[NormalizeUUID(actionKey)] = { ...params };
    }
    for (const [actionKey, params] of Object.entries(parent.BoundParamsByAction ?? {})) {
        const normKey = NormalizeUUID(actionKey);
        mergedByAction[normKey] = {
            ...(mergedByAction[normKey] ?? {}),
            ...params,
        };
    }

    let mergedAudience: TaskAudienceEnvelope | undefined;
    if (parent.Audience || child.Audience) {
        const seenReaders = new UUIDSet();
        const readers: string[] = [];
        const addReaders = (list?: ReadonlyArray<string>): void => {
            for (const id of list ?? []) {
                if (!seenReaders.Has(id)) {
                    seenReaders.Add(id);
                    readers.push(id);
                }
            }
        };
        addReaders(parent.Audience?.ReaderUserIDs);
        addReaders(child.Audience?.ReaderUserIDs);
        const mode = parent.Audience?.Mode ?? child.Audience?.Mode;
        mergedAudience = {
            ReaderUserIDs: readers,
            ...(mode ? { Mode: mode } : {}),
        };
    }

    const parentTenant = parent.TenantContext ?? parseTenantEnvelope(parent);
    const childTenant = child.TenantContext ?? parseTenantEnvelope(child);
    const mergedTenant: TaskTenantEnvelope | undefined =
        parentTenant || childTenant
            ? {
                  PrimaryScopeEntityName:
                      parentTenant?.PrimaryScopeEntityName ??
                      childTenant?.PrimaryScopeEntityName ??
                      null,
                  PrimaryScopeRecordID:
                      parentTenant?.PrimaryScopeRecordID ??
                      childTenant?.PrimaryScopeRecordID ??
                      null,
                  SecondaryScopes:
                      parentTenant?.SecondaryScopes || childTenant?.SecondaryScopes
                          ? {
                                ...(childTenant?.SecondaryScopes ?? {}),
                                ...(parentTenant?.SecondaryScopes ?? {}),
                            }
                          : null,
              }
            : undefined;

    const isRunTainted = Boolean(parent.IsRunTainted || child.IsRunTainted);

    let allowedEgress: ReadonlyArray<string> | undefined;
    if (parent.AllowedEgressActionIDs && child.AllowedEgressActionIDs) {
        const seenEgress = new UUIDSet(parent.AllowedEgressActionIDs);
        const combined: string[] = [...parent.AllowedEgressActionIDs];
        for (const childId of child.AllowedEgressActionIDs) {
            if (!seenEgress.Has(childId)) {
                seenEgress.Add(childId);
                combined.push(childId);
            }
        }
        allowedEgress = combined;
    } else {
        allowedEgress = parent.AllowedEgressActionIDs ?? child.AllowedEgressActionIDs;
    }

    return {
        ...(parent.Version === 1 || child.Version === 1 ? { Version: 1 as const } : {}),
        ...(Object.keys(mergedBoundParams).length > 0 ? { BoundActionParams: mergedBoundParams } : {}),
        ...(Object.keys(mergedByAction).length > 0 ? { BoundParamsByAction: mergedByAction } : {}),
        ...(mergedAudience ? { Audience: mergedAudience } : {}),
        ...(mergedTenant ? {
            TenantContext: mergedTenant,
            ...(mergedTenant.PrimaryScopeEntityName ? { PrimaryScopeEntityName: mergedTenant.PrimaryScopeEntityName } : {}),
            ...(mergedTenant.PrimaryScopeRecordID ? { PrimaryScopeRecordID: mergedTenant.PrimaryScopeRecordID } : {}),
            ...(mergedTenant.SecondaryScopes ? { SecondaryScopes: mergedTenant.SecondaryScopes as Readonly<Record<string, SecondaryScopeValue>> } : {}),
        } : {}),
        ...(isRunTainted ? { IsRunTainted: true } : parent.IsRunTainted === false || child.IsRunTainted === false ? { IsRunTainted: false } : {}),
        ...(allowedEgress !== undefined ? { AllowedEgressActionIDs: allowedEgress } : {}),
    };
}

/**
 * Enforces `BoundActionParams` and `BoundParamsByAction` from `envelope` onto `inputPayload`
 * (case-insensitively matching existing keys so LLM or dependency overrides cannot smuggle an
 * alternate casing past the binding).
 */
export function ApplyTaskSecurityEnvelopeToParams(
    inputPayload: Record<string, unknown> | null | undefined,
    envelope: TaskSecurityEnvelope | null | undefined,
    actionID?: string | null,
    actionName?: string | null,
): TaskSecurityParamEnforcementResult {
    const out: Record<string, unknown> = inputPayload ? { ...inputPayload } : {};
    const overriddenKeys: string[] = [];
    if (!envelope) {
        return { Params: out, OverriddenKeys: overriddenKeys };
    }

    const effectiveBindings: Record<string, unknown> = {};
    if (envelope.BoundActionParams) {
        for (const [key, val] of Object.entries(envelope.BoundActionParams)) {
            effectiveBindings[key] = val;
        }
    }
    if (envelope.BoundParamsByAction) {
        for (const [boundActionKey, boundMap] of Object.entries(envelope.BoundParamsByAction)) {
            const trimmedKey = boundActionKey.trim();
            const isWildcard = trimmedKey === '*';
            const matchesAction = Boolean(
                (actionID && UUIDsEqual(trimmedKey, actionID)) ||
                (actionName && trimmedKey.toLowerCase() === actionName.trim().toLowerCase()),
            );
            if (isWildcard || matchesAction) {
                for (const [key, val] of Object.entries(boundMap)) {
                    effectiveBindings[key] = val;
                }
            }
        }
    }

    for (const [boundKey, boundValue] of Object.entries(effectiveBindings)) {
        const boundLower = boundKey.toLowerCase();
        for (const existingKey of Object.keys(out)) {
            if (existingKey.toLowerCase() === boundLower) {
                if (!deepValuesEqual(out[existingKey], boundValue)) {
                    overriddenKeys.push(boundKey);
                }
                if (existingKey !== boundKey) {
                    delete out[existingKey];
                }
            }
        }
        out[boundKey] = boundValue;
    }

    return { Params: out, OverriddenKeys: overriddenKeys };
}

/**
 * Builds a {@link TaskSecurityEnvelope} from an agent run's active security state
 * (`boundActionParams`, `Audience`, `PrimaryScopeEntityName`, `PrimaryScopeRecordID`,
 * `SecondaryScopes`, and optional taint/egress settings). Returns `undefined` when no
 * security constraints are active on the run.
 */
export function BuildTaskSecurityEnvelopeFromAgentScope(options: {
    BoundActionParams?: BoundActionParams | TaskBoundParamMap;
    AudienceReaderUserIDs?: ReadonlyArray<string>;
    Audience?: AgentRunAudience;
    CallerUserID?: string | null;
    PrimaryScopeEntityName?: string | null;
    PrimaryScopeRecordID?: string | null;
    SecondaryScopes?: Record<string, SecondaryScopeValue> | null;
    IsRunTainted?: boolean;
    AllowedEgressActionIDs?: ReadonlyArray<string>;
    BaseEnvelope?: TaskSecurityEnvelope | null;
}): TaskSecurityEnvelope | undefined {
    const globalBound: TaskBoundParamMap = {};
    const byAction: Record<string, Record<string, unknown>> = {};

    if (options.BoundActionParams) {
        for (const [keyOrActionId, valOrParamMap] of Object.entries(options.BoundActionParams)) {
            if (isTaskBoundParamValue(valOrParamMap)) {
                globalBound[keyOrActionId] = valOrParamMap;
            } else if (valOrParamMap && typeof valOrParamMap === 'object' && !Array.isArray(valOrParamMap)) {
                byAction[keyOrActionId] = { ...(valOrParamMap as Record<string, unknown>) };
                if (keyOrActionId.trim() === '*') {
                    for (const [paramName, paramValue] of Object.entries(valOrParamMap as Record<string, unknown>)) {
                        if (isTaskBoundParamValue(paramValue)) {
                            globalBound[paramName] = paramValue;
                        }
                    }
                }
            }
        }
    }

    let audience: TaskAudienceEnvelope | undefined;
    if (options.AudienceReaderUserIDs && options.AudienceReaderUserIDs.length > 0) {
        const nonCallerReaders = options.AudienceReaderUserIDs.filter(
            (id) => typeof id === 'string' && id.trim().length > 0 && (!options.CallerUserID || !UUIDsEqual(id, options.CallerUserID)),
        );
        if (nonCallerReaders.length > 0) {
            audience = {
                Mode: 'Intersection',
                ReaderUserIDs: nonCallerReaders,
            };
        }
    } else if (options.Audience?.UserIDs && Array.isArray(options.Audience.UserIDs)) {
        const nonCallerReaders = options.Audience.UserIDs.filter(
            (id) => typeof id === 'string' && id.trim().length > 0 && (!options.CallerUserID || !UUIDsEqual(id, options.CallerUserID)),
        );
        if (nonCallerReaders.length > 0) {
            audience = {
                Mode: 'Intersection',
                ReaderUserIDs: nonCallerReaders,
            };
        }
    }

    const hasPrimaryScope = Boolean(
        (options.PrimaryScopeEntityName && options.PrimaryScopeEntityName.trim().length > 0) ||
            (options.PrimaryScopeRecordID && options.PrimaryScopeRecordID.trim().length > 0),
    );
    const hasSecondaryScopes = Boolean(
        options.SecondaryScopes && Object.keys(options.SecondaryScopes).length > 0,
    );
    const tenantContext: TaskTenantEnvelope | undefined =
        hasPrimaryScope || hasSecondaryScopes
            ? {
                  PrimaryScopeEntityName: options.PrimaryScopeEntityName ?? null,
                  PrimaryScopeRecordID: options.PrimaryScopeRecordID ?? null,
                  SecondaryScopes: options.SecondaryScopes ? { ...options.SecondaryScopes } : null,
              }
            : undefined;

    const hasAnyField =
        Object.keys(globalBound).length > 0 ||
        Object.keys(byAction).length > 0 ||
        audience !== undefined ||
        tenantContext !== undefined ||
        options.IsRunTainted === true ||
        options.AllowedEgressActionIDs !== undefined;

    const constructed: TaskSecurityEnvelope | undefined = hasAnyField
        ? {
              ...(Object.keys(globalBound).length > 0 ? { BoundActionParams: globalBound } : {}),
              ...(Object.keys(byAction).length > 0 ? { BoundParamsByAction: byAction } : {}),
              ...(audience ? { Audience: audience } : {}),
              ...(tenantContext ? {
                  TenantContext: tenantContext,
                  ...(options.PrimaryScopeEntityName ? { PrimaryScopeEntityName: options.PrimaryScopeEntityName } : {}),
                  ...(options.PrimaryScopeRecordID ? { PrimaryScopeRecordID: options.PrimaryScopeRecordID } : {}),
                  ...(options.SecondaryScopes ? { SecondaryScopes: { ...options.SecondaryScopes } } : {}),
              } : {}),
              ...(options.IsRunTainted !== undefined ? { IsRunTainted: options.IsRunTainted } : {}),
              ...(options.AllowedEgressActionIDs !== undefined
                  ? { AllowedEgressActionIDs: [...options.AllowedEgressActionIDs] }
                  : {}),
          }
        : undefined;

    return MergeTaskSecurityEnvelopes(options.BaseEnvelope, constructed);
}

function isTaskBoundParamValue(val: unknown): val is TaskBoundParamValue {
    if (val === null || typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        return true;
    }
    if (Array.isArray(val)) {
        return val.every((item) => typeof item === 'string' || typeof item === 'number');
    }
    return false;
}

function parseBoundParamMap(raw: unknown): TaskBoundParamMap | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const out: TaskBoundParamMap = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (isTaskBoundParamValue(v)) {
            out[k] = v;
        }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

function parseBoundParamsByAction(
    raw: unknown,
): Record<string, Readonly<Record<string, unknown>>> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const out: Record<string, Readonly<Record<string, unknown>>> = {};
    for (const [actionId, map] of Object.entries(raw as Record<string, unknown>)) {
        if (map && typeof map === 'object' && !Array.isArray(map)) {
            out[actionId] = { ...(map as Record<string, unknown>) };
        }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

function parseAudienceEnvelope(raw: unknown): TaskAudienceEnvelope | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const obj = raw as Record<string, unknown>;
    if (!Array.isArray(obj.ReaderUserIDs)) {
        return undefined;
    }
    const readers = obj.ReaderUserIDs.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    const mode = obj.Mode === 'StrictSubset' ? 'StrictSubset' : 'Intersection';
    return {
        ReaderUserIDs: readers,
        Mode: mode,
    };
}

function parseTenantEnvelope(raw: unknown): TaskTenantEnvelope | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const obj = raw as Record<string, unknown>;
    const primaryEntity = typeof obj.PrimaryScopeEntityName === 'string' ? obj.PrimaryScopeEntityName : null;
    const primaryRecord = typeof obj.PrimaryScopeRecordID === 'string' ? obj.PrimaryScopeRecordID : null;
    const secondary =
        obj.SecondaryScopes && typeof obj.SecondaryScopes === 'object' && !Array.isArray(obj.SecondaryScopes)
            ? { ...(obj.SecondaryScopes as Record<string, unknown>) }
            : null;
    if (!primaryEntity && !primaryRecord && !secondary) {
        return undefined;
    }
    return {
        PrimaryScopeEntityName: primaryEntity,
        PrimaryScopeRecordID: primaryRecord,
        SecondaryScopes: secondary,
    };
}

function deepValuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) {
        return true;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((item, idx) => deepValuesEqual(item, b[idx]));
    }
    return false;
}
