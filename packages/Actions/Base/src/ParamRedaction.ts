import { BaseEntity } from "@memberjunction/core";
import { MJActionParamEntity, MJEntityActionParamEntity } from "@memberjunction/core-entities";
import { UUIDsEqual } from "@memberjunction/global";
import { ActionParam } from "./ActionEngine-Base";

/**
 * ============================================================================
 * PARAMETER REDACTION — the single place action parameter values are made safe
 * to persist.
 * ============================================================================
 *
 * **THE INVARIANT: no code path may write a raw `ActionParam[]` to persistent
 * storage.** Every persister — `ActionExecutionLog.Params` / `.ResultParams`,
 * `QueueTask.Data`, and anything added later — routes through
 * {@link RedactParams} first. Redaction lives here, with the parameters, rather
 * than inside any one persister, because a persister-local implementation
 * covers exactly one door: routing entity-action `After*` invocations through
 * the queue would re-open the hole one layer down via `QueueTask.Data`.
 *
 * The posture is **fail-closed** for whole records and **opt-out** for
 * everything else, applied in this order:
 *
 * | # | Rule | Beats |
 * |---|---|---|
 * | 1 | An Entity Action binding whose `ValueType` is `'Entity Object'` or `'Entity Object Data'` is **never** logged. Whole records by definition. **No configuration can re-enable it.** | everything |
 * | 2 | `EntityActionParam.LogValue = 0` — per-binding suppression. `NULL` inherits rule 3. | rule 3 |
 * | 3 | `ActionParam.LogValue = 0` — the definition declares the parameter unloggable. Default `1`. | — |
 *
 * When a value is suppressed the log still records **the shape** — name, type,
 * value type, byte length, key count and truncated top-level keys — so
 * *"it was called with the 41-column deal row, not the 3-field summary"* stays
 * answerable without the payload being readable. **Shape, never values.** Only
 * top-level keys are walked: for a record those are column names, i.e. schema.
 * Deeper structure can encode content (a `Notes` object keyed by author), so it
 * is deliberately not descended into.
 */

/** Why a parameter's value was withheld from persistent storage. */
export type ParamRedactionReason =
    /** Rule 1 — the binding's `ValueType` passes a whole record. Not configurable. */
    | 'WholeRecordValueType'
    /** Rule 2 — `EntityActionParam.LogValue = 0` on this specific binding. */
    | 'BindingLogValueFalse'
    /** Rule 3 — `ActionParam.LogValue = 0` on the parameter definition. */
    | 'ParamLogValueFalse';

/**
 * The record written in place of a parameter whose value is suppressed. Carries
 * enough shape to diagnose a run and no content.
 */
export interface RedactedParam {
    /** The parameter name — always recorded, never redacted. */
    Name: string;
    /** Input / Output / Both — always recorded. */
    Type: 'Input' | 'Output' | 'Both';
    /** The Entity Action binding's `ValueType`, when the run came from a binding. */
    ValueType?: string;
    /** Always `false` — the marker that distinguishes a redaction record from a logged param. */
    Logged: false;
    /** Which rule suppressed the value. */
    Reason: ParamRedactionReason;
    /** UTF-8 byte length of the value's JSON form. `-1` when the value could not be serialized. */
    ByteLength: number;
    /** Number of top-level keys, for object values. */
    KeyCount?: number;
    /** Top-level key names, truncated at {@link MAX_REDACTED_KEYS}. Schema, not data. */
    Keys?: string[];
    /** True when {@link Keys} was truncated — so a very wide row can't reintroduce the size problem. */
    KeysElided?: boolean;
    /** Number of elements, for array values. */
    ItemCount?: number;
}

/** A parameter as persisted: either the parameter itself, or its redaction record. */
export type LoggedParam = ActionParam | RedactedParam;

/**
 * Upper bound on how many top-level key names a redaction record carries. A wide
 * record would otherwise reintroduce the size problem the redaction exists to solve.
 */
export const MAX_REDACTED_KEYS = 25;

/** The Entity Action `ValueType` values that pass a whole record and are therefore never logged. */
const WHOLE_RECORD_VALUE_TYPES = new Set(['entity object', 'entity object data']);

/** True when a redaction record (rather than a live parameter) is what's in hand. */
export function IsRedactedParam(param: LoggedParam): param is RedactedParam {
    return (param as RedactedParam).Logged === false;
}

/**
 * Produces the persistable form of an action's parameters, applying the three
 * redaction rules documented on this module.
 *
 * @param params The runtime parameters, as passed to (or returned by) the action.
 * @param actionParams The `ActionParam` definition rows for the action. When a
 *        runtime parameter has no matching definition its value is logged —
 *        `ActionParam.LogValue` defaults to `1`, and an undeclared parameter has
 *        no declaration to opt out with. Rule 1 does not depend on this lookup.
 * @param entityActionParams The `EntityActionParam` binding rows, when the run
 *        originated from an Entity Action. Omitted for direct invocations, in
 *        which case rules 1 and 2 cannot apply.
 */
export function RedactParams(
    params: ActionParam[] | undefined | null,
    actionParams?: MJActionParamEntity[] | null,
    entityActionParams?: MJEntityActionParamEntity[] | null
): LoggedParam[] {
    if (!params) {
        return [];
    }

    return params.map(p => {
        const definition = findDefinition(p.Name, actionParams);
        const binding = findBinding(definition, entityActionParams);
        const reason = resolveRedactionReason(definition, binding);
        if (!reason) {
            return p;
        }
        return buildRedactionRecord(p, binding, reason);
    });
}

/**
 * Convenience wrapper producing the JSON string persisters actually write. Kept
 * beside {@link RedactParams} so no caller is tempted to `JSON.stringify` a raw
 * `ActionParam[]` itself.
 */
export function RedactParamsToJSON(
    params: ActionParam[] | undefined | null,
    actionParams?: MJActionParamEntity[] | null,
    entityActionParams?: MJEntityActionParamEntity[] | null
): string {
    return JSON.stringify(RedactParams(params, actionParams, entityActionParams));
}

/** Case-insensitive lookup of a runtime parameter's definition row. */
function findDefinition(name: string, actionParams?: MJActionParamEntity[] | null): MJActionParamEntity | undefined {
    if (!actionParams || !name) {
        return undefined;
    }
    const target = name.trim().toLowerCase();
    return actionParams.find(ap => (ap.Name ?? '').trim().toLowerCase() === target);
}

/** Finds the Entity Action binding row that supplies this parameter, if the run came from a binding. */
function findBinding(
    definition: MJActionParamEntity | undefined,
    entityActionParams?: MJEntityActionParamEntity[] | null
): MJEntityActionParamEntity | undefined {
    if (!definition || !entityActionParams) {
        return undefined;
    }
    return entityActionParams.find(eap => UUIDsEqual(eap.ActionParamID, definition.ID));
}

/**
 * Applies the three rules in precedence order and returns the reason a value is
 * withheld, or `undefined` when it may be logged.
 */
function resolveRedactionReason(
    definition: MJActionParamEntity | undefined,
    binding: MJEntityActionParamEntity | undefined
): ParamRedactionReason | undefined {
    // Rule 1 — whole-record value types. Unconditional; nothing below can re-enable it.
    if (binding && WHOLE_RECORD_VALUE_TYPES.has((binding.ValueType ?? '').trim().toLowerCase())) {
        return 'WholeRecordValueType';
    }

    // Rule 2 — the binding's explicit override. NULL falls through to the definition.
    if (binding && binding.LogValue != null) {
        return binding.LogValue ? undefined : 'BindingLogValueFalse';
    }

    // Rule 3 — the definition. An absent definition means an undeclared parameter,
    // which has nothing to opt out with, so it is logged (LogValue's default is 1).
    if (definition && definition.LogValue === false) {
        return 'ParamLogValueFalse';
    }

    return undefined;
}

/** Builds the shape-only record persisted in place of a suppressed value. */
function buildRedactionRecord(
    param: ActionParam,
    binding: MJEntityActionParamEntity | undefined,
    reason: ParamRedactionReason
): RedactedParam {
    const record: RedactedParam = {
        Name: param.Name,
        Type: param.Type,
        Logged: false,
        Reason: reason,
        ByteLength: 0
    };
    if (binding?.ValueType) {
        record.ValueType = binding.ValueType;
    }
    describeShape(param.Value, record);
    return record;
}

/**
 * Fills the shape fields of a redaction record. A `BaseEntity` is described
 * through `GetAll()` — its fields are getters, not enumerable own properties, so
 * describing the instance directly would report a misleading empty shape (the
 * same trap `'Entity Object Data'` exists to avoid).
 */
function describeShape(value: unknown, record: RedactedParam): void {
    if (value === null || value === undefined) {
        record.ByteLength = 0;
        return;
    }

    const described = value instanceof BaseEntity ? value.GetAll() : value;
    record.ByteLength = utf8ByteLength(described);

    if (Array.isArray(described)) {
        record.ItemCount = described.length;
        return;
    }

    if (typeof described === 'object') {
        const keys = Object.keys(described as Record<string, unknown>);
        record.KeyCount = keys.length;
        record.Keys = keys.slice(0, MAX_REDACTED_KEYS);
        if (keys.length > MAX_REDACTED_KEYS) {
            record.KeysElided = true;
        }
    }
}

/**
 * UTF-8 byte length of a value's JSON form. Returns `-1` when the value cannot be
 * serialized (a circular reference, say) — a distinguishable signal rather than a
 * misleading zero, and never a reason to throw out of a logging path.
 */
function utf8ByteLength(value: unknown): number {
    try {
        const json = JSON.stringify(value);
        if (json === undefined) {
            return 0;
        }
        return new TextEncoder().encode(json).length;
    } catch {
        return -1;
    }
}
