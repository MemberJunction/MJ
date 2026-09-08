/**
 * @fileoverview What changed about a record, in the shape a filter can reason about.
 *
 * **This is the contract transition filters were missing.** An entity action bound to `AfterUpdate`
 * has always been able to see the record's *current* state and nothing else — so "when an invoice
 * crosses 90 days" or "when Status becomes Approved" were unexpressible, and the workflow layer had
 * to refuse a `filter` outright rather than accept one it could not honor. Deciding those questions
 * needs the values on *both* sides of the save, which `BaseEntity` has tracked all along on each
 * `EntityField` — it was simply never carried to the place filters run.
 *
 * Deliberately a plain data shape rather than the live entity: a filter runs against a snapshot of
 * what happened, and handing it a mutable `BaseEntity` would let a predicate quietly alter the record
 * it was asked to judge.
 *
 * @module @memberjunction/actions-base
 */

/** The before/after picture of one save, as seen by a filter. */
export type EntityChangeContext = {
    /**
     * Field values as they were when the record was loaded. Empty on a create — there is no "before".
     */
    OldValues: Readonly<Record<string, unknown>>;

    /** Field values as they are now. */
    NewValues: Readonly<Record<string, unknown>>;

    /**
     * Names of fields whose value actually differs.
     *
     * Computed from a value comparison rather than from the dirty flag: a field can be assigned its
     * existing value and still read as dirty, and a filter that fired on that would be reporting a
     * change that did not happen.
     */
    ChangedFields: readonly string[];

    /** True when the record is being created, so every field is "new" and none of them changed. */
    IsCreate: boolean;
};

/** True when `fieldName` is among the fields that changed. Case-insensitive, as field names are. */
export function DidFieldChange(change: EntityChangeContext | undefined, fieldName: string): boolean {
    if (!change || !fieldName) {
        return false;
    }
    const wanted = fieldName.trim().toLowerCase();
    return change.ChangedFields.some((f) => f.toLowerCase() === wanted);
}

/**
 * True when `fieldName` changed AND its new value equals `value`.
 *
 * The equality is deliberately loose — a filter's configured value arrives as a string from
 * metadata, while the field may hold a number, boolean or date. Comparing raw would make
 * `Status = 1` never match a numeric 1, which is the kind of silent no-match that leaves someone
 * convinced their automation is broken rather than misconfigured.
 */
export function DidFieldChangeToValue(
    change: EntityChangeContext | undefined,
    fieldName: string,
    value: unknown,
): boolean {
    if (!DidFieldChange(change, fieldName)) {
        return false;
    }
    const actual = ReadFieldValue(change!.NewValues, fieldName);
    return LooseEquals(actual, value);
}

/** Reads a field from a values bag case-insensitively. */
export function ReadFieldValue(values: Readonly<Record<string, unknown>>, fieldName: string): unknown {
    const wanted = fieldName.trim().toLowerCase();
    const key = Object.keys(values).find((k) => k.toLowerCase() === wanted);
    return key === undefined ? undefined : values[key];
}

/**
 * Compares a field value to a configured one across the string boundary metadata forces.
 *
 * Null and undefined are treated as the same absence — a filter author writing "when Owner becomes
 * empty" should not have to know which one the provider produced.
 */
export function LooseEquals(actual: unknown, expected: unknown): boolean {
    if (actual === expected) {
        return true;
    }
    if (actual == null && expected == null) {
        return true;
    }
    if (actual == null || expected == null) {
        return false;
    }
    if (actual instanceof Date || expected instanceof Date) {
        const a = actual instanceof Date ? actual.getTime() : new Date(String(actual)).getTime();
        const b = expected instanceof Date ? expected.getTime() : new Date(String(expected)).getTime();
        return !Number.isNaN(a) && !Number.isNaN(b) && a === b;
    }
    if (typeof actual === 'boolean' || typeof expected === 'boolean') {
        return ToBool(actual) === ToBool(expected);
    }
    return String(actual).trim().toLowerCase() === String(expected).trim().toLowerCase();
}

/** Interprets the several ways a boolean arrives from metadata or a database. */
function ToBool(v: unknown): boolean {
    if (typeof v === 'boolean') return v;
    const s = String(v).trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
}

/** The minimum of a `BaseEntity` this builder needs — kept structural so this module stays free of
 *  a dependency on the entity layer, which would invert the package graph. */
export type ChangeTrackedEntity = {
    IsSaved: boolean;
    Fields: ReadonlyArray<{ Name: string; Value: unknown; OldValue: unknown }>;
};

/**
 * Builds the before/after picture from an entity about to be, or just, saved.
 *
 * Reads `EntityField.OldValue`, which `BaseEntity` has populated since the record was loaded — no
 * new tracking, just carrying what already exists to where filters run.
 *
 * `IsSaved === false` means a create, and a create has no "before": every field is reported as new
 * and `ChangedFields` is empty. Saying a field "changed" on insert would make a transition filter
 * fire on creation, which is the opposite of what "when Status BECOMES Approved" asks for — that
 * record's status did not become anything, it started that way.
 */
export function BuildEntityChangeContext(entity: ChangeTrackedEntity): EntityChangeContext {
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};
    const changed: string[] = [];
    const isCreate = !entity.IsSaved;

    for (const f of entity.Fields) {
        newValues[f.Name] = f.Value;
        if (isCreate) {
            continue;
        }
        oldValues[f.Name] = f.OldValue;
        // Compared by value rather than by the dirty flag: assigning a field its existing value
        // still marks it dirty, and a filter firing on that would report a change that never
        // happened.
        if (!LooseEquals(f.OldValue, f.Value)) {
            changed.push(f.Name);
        }
    }

    return { OldValues: oldValues, NewValues: newValues, ChangedFields: changed, IsCreate: isCreate };
}

/**
 * Wraps a filter expression as the body of an `ActionFilter.Code`.
 *
 * Two different authoring surfaces reach this: a workflow's `WorkflowEntityEventTrigger.filter` and
 * a Record Process's `OnChangeFilter`. Both mean the same thing — "only fire when this is true of
 * the change" — so both compile to one shape rather than each inventing its own dialect, and a user
 * who learns one has learned the other.
 *
 * It also lives on both sides of the check/store divide: the validator compiles the result to prove
 * it parses, and the reconciler persists exactly that string. Anything less than a shared function
 * admits the failure where a spec validates and then fails closed forever at runtime.
 *
 * The shorthands are destructured from the context rather than injected as separate function
 * arguments, so an author's expression sees exactly the names the field's documentation promises
 * and nothing else leaks in.
 */
export function BuildChangeFilterCode(filter: string): string {
    return [
        '// Generated from a change-filter expression. Edit the definition that owns this row,',
        '// not the row itself — re-saving the owner overwrites this code.',
        'const { OldValues, NewValues, DidFieldChange, DidFieldChangeToValue } = ActionFilterContext;',
        `return (${filter.trim()});`,
    ].join('\n');
}

/**
 * Whether a filter expression parses.
 *
 * Compiles but never invokes, so nothing in the expression can run here. `EvalError` is treated as
 * "cannot tell" rather than "invalid": under a Content-Security-Policy that forbids `new Function`,
 * every filter would otherwise be reported as broken in the browser while working perfectly on the
 * server that actually evaluates it.
 */
export function IsChangeFilterParseable(filter: string): { Parseable: boolean; Message?: string } {
    try {
        new Function('ActionFilterContext', BuildChangeFilterCode(filter));
        return { Parseable: true };
    } catch (e) {
        if (e instanceof EvalError) return { Parseable: true };
        return { Parseable: false, Message: e instanceof Error ? e.message : String(e) };
    }
}
