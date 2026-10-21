import { EntityInfo, FieldSecurityError, ReadableFieldsTransportKey } from './entityInfo';
import { UserInfo } from './securityInfo';
import { RecordChangeFieldSecurityProjector, RecordChangeMetadataSource } from './recordChangeFieldSecurity';

/**
 * Options for {@link ProjectEntityValuesForUser} and {@link ProjectEntityValueRowsForUser}.
 */
export type ProjectEntityValuesOptions = {
    /**
     * Append {@link ReadableFieldsTransportKey} naming the fields this caller MAY read.
     *
     * Set this for transports whose consumer is an MJ client: it is what lets the client turn a
     * withheld field into `NotLoaded` rather than loading a null over a real value. Leave it off
     * for transports whose consumer is not an MJ client (REST, MCP, A2A), where an unrecognized
     * key is noise rather than signal.
     *
     * The key is appended only when the caller is denied something, matching the GraphQL
     * resolvers: an unrestricted caller's payload is returned untouched.
     */
    includeReadableFields?: boolean;
};

/**
 * Returns `values` without the keys `denied` names, matched case- and whitespace-insensitively.
 *
 * `denied` is a denied-field set as {@link EntityInfo.GetDeniedReadFields} builds it: lowercased,
 * holding both the `Name` and the `CodeName` of every denied field. Because the match is against
 * the row's OWN keys, a row keyed by either spelling, in any case, is narrowed.
 *
 * Returns a shallow COPY when a key was removed and the original object by reference when none
 * was, so a row that is already narrow costs nothing. The input is never modified, which is what
 * makes this safe on frozen, shared cache rows.
 */
export function OmitDeniedFieldKeys<T extends object>(values: T, denied: ReadonlySet<string> | null | undefined): T {
    if (!values || typeof values !== 'object' || !denied || denied.size === 0) {
        return values;
    }
    const source = values as Record<string, unknown>;
    let copy: Record<string, unknown> | null = null;
    for (const key of Object.keys(source)) {
        if (!denied.has(key.trim().toLowerCase())) {
            continue;
        }
        copy ??= { ...source };
        delete copy[key];
    }
    return (copy ?? values) as T;
}

/**
 * The denied-READ set for `user` on `entityInfo`, or null when field security does not apply:
 * the entity has it switched off, there is no user, or the user is denied nothing.
 */
function deniedReadFieldsFor(entityInfo: EntityInfo, user: UserInfo): Set<string> | null {
    if (!entityInfo.EnableFieldLevelSecurity) {
        return null;
    }
    const denied = entityInfo.GetDeniedReadFields(user);
    return denied.size > 0 ? denied : null;
}

/** The names of the fields a caller with this denied set may read, for {@link ReadableFieldsTransportKey}. */
function readableFieldNames(entityInfo: EntityInfo, denied: ReadonlySet<string>): string[] {
    return entityInfo.Fields
        .filter((f) => !denied.has(f.Name.trim().toLowerCase()))
        .map((f) => f.Name);
}

/** Field-security narrowing for one row: omission plus the optional readable-fields marker. */
function narrowRow<T extends object>(row: T, denied: ReadonlySet<string>, readable: string[] | null): T {
    const narrowed = OmitDeniedFieldKeys(row, denied);
    if (!readable) {
        return narrowed;
    }
    const withMarker: Record<string, unknown> = narrowed === row
        ? { ...(row as Record<string, unknown>) }
        : (narrowed as Record<string, unknown>);
    withMarker[ReadableFieldsTransportKey] = readable;
    return withMarker as T;
}

/**
 * Projects a plain object of entity field values down to what `user` may READ.
 *
 * **The one output projection every transport uses**, so that no transport can apply only half
 * of it. Three things are applied, matching what the GraphQL resolvers' field mapping does:
 *
 * 1. **Denied read fields are omitted**, under both the `Name` and `CodeName` spellings and in any
 *    case, because callers reach here with rows keyed either way. Omitted rather than nulled:
 *    a null is indistinguishable from a real value.
 * 2. **{@link ReadableFieldsTransportKey}** is appended when `includeReadableFields` is set and
 *    the caller is denied something (see the option).
 * 3. **The Record Changes payload projection**, which is keyed on the entity each ROW is about
 *    rather than on the entity being queried. `MJ: Record Changes` normally has field security
 *    off, so step 1 is a no-op for it, while its payload columns carry other entities' values.
 *
 * An entity object built for a restricted user does not hold denied values in the first place,
 * so on that path this is defence in depth. It is the primary control for values that did not
 * come from such an object: a system-identity load, a raw provider row, or a cached payload.
 *
 * Returns a COPY whenever anything changed, and the original object by reference when nothing
 * did, so unrestricted callers pay nothing and frozen cache rows are never written to.
 *
 * @param provider Metadata source, used to resolve the per-row target entity for Record Changes.
 * @param entityInfo The entity the values belong to. When absent the values are returned unchanged.
 * @param values The field values. Never modified.
 * @param user The caller. When absent this is server-internal code, which field security trusts
 *             with full values, and the values are returned unchanged.
 * @param options See {@link ProjectEntityValuesOptions}.
 */
export function ProjectEntityValuesForUser<T extends object>(
    provider: RecordChangeMetadataSource,
    entityInfo: EntityInfo | null | undefined,
    values: T | null | undefined,
    user: UserInfo | null | undefined,
    options?: ProjectEntityValuesOptions
): T | null | undefined {
    if (!values || typeof values !== 'object' || !entityInfo || !user) {
        return values;
    }
    const projected = ProjectEntityValueRowsForUser(provider, entityInfo, [values], user, options);
    return projected?.[0] ?? values;
}

/**
 * Array form of {@link ProjectEntityValuesForUser}. The denied set, the readable-fields list and
 * the Record Changes projector are each built ONCE for the whole set: the projector memoizes its
 * per-entity lookups for its own lifetime, and a denied set walks every field of the entity, so
 * building either per row turns a per-request cost into a per-row one.
 *
 * Returns the ORIGINAL array when no row needed changing.
 */
export function ProjectEntityValueRowsForUser<T extends object>(
    provider: RecordChangeMetadataSource,
    entityInfo: EntityInfo | null | undefined,
    rows: T[] | null | undefined,
    user: UserInfo | null | undefined,
    options?: ProjectEntityValuesOptions
): T[] | null | undefined {
    if (!rows?.length || !entityInfo || !user) {
        return rows;
    }
    const denied = deniedReadFieldsFor(entityInfo, user);
    const isRecordChanges = RecordChangeFieldSecurityProjector.IsRecordChangesEntity(entityInfo);
    if (!denied && !isRecordChanges) {
        return rows;
    }

    let projected: T[] = rows;
    if (denied) {
        const readable = options?.includeReadableFields ? readableFieldNames(entityInfo, denied) : null;
        projected = rows.map((row) => narrowRow(row, denied, readable));
    }
    if (isRecordChanges) {
        projected = new RecordChangeFieldSecurityProjector(provider, user).ProjectRows(projected);
    }
    return projected.some((row, i) => row !== rows[i]) ? projected : rows;
}

/**
 * Keys a transport adds to client input that are not entity fields, and that
 * {@link AssertClientInputWritableForUser} therefore must not treat as unknown.
 */
export const ClientInputTransportKeys: readonly string[] = [
    'OldValues___',
    ReadableFieldsTransportKey,
    'RestoreContext___',
    'CloneContext___',
    // The companion payload key, spelled out rather than imported: the module that defines it
    // imports BaseEntity, which imports this module, and this array is built at load time.
    'Companions___',
    '__typename',
];

/** Options for {@link AssertClientInputWritableForUser}. */
export type ClientInputGateOptions = {
    /** Extra non-field keys this transport legitimately sends, accepted alongside {@link ClientInputTransportKeys}. */
    additionalAllowedKeys?: readonly string[];
};

/**
 * The wording for refusing a key in client input. Deliberately the SAME for a key that names a
 * field the caller cannot read and a key that names no field at all, so the refusal cannot be
 * used to learn which columns exist.
 */
export function FieldSecurityClientInputMessage(key: string, entityName: string): string {
    return `Field '${key}' cannot be written on entity '${entityName}'.`;
}

/** Every key that names a field of `entityInfo` or of an IS-A ancestor, lowercased, by Name and CodeName. */
function knownFieldKeys(entityInfo: EntityInfo): Set<string> {
    const known = new Set<string>();
    for (const entity of [entityInfo, ...(entityInfo.ParentChain ?? [])]) {
        for (const f of entity.Fields) {
            known.add(f.Name.trim().toLowerCase());
            known.add(f.CodeName.trim().toLowerCase());
        }
    }
    return known;
}

/**
 * The write-side gate for transports that apply client input with `SetMany`: throws a
 * {@link FieldSecurityError} when the input carries a key the caller may not send.
 *
 * Applies only to a caller who is denied at least one field on the entity. For that caller, a key
 * is refused when it names a field they cannot READ, or when it names no field at all; both get
 * the identical {@link FieldSecurityClientInputMessage}. Treating unknown keys the same way is
 * what keeps the refusal from revealing whether a column exists: refusing only denied keys would
 * answer "does `Salary` exist?" for any key a caller cares to try.
 *
 * Rejection rather than silent removal: a client holding a denied value can only have fabricated
 * it, because no response it received contained one, so there is no legitimate request to save.
 *
 * Keys in {@link ClientInputTransportKeys}, and any in `options.additionalAllowedKeys`, are
 * accepted. Matching is case- and whitespace-insensitive, by Name and CodeName, like `SetMany`.
 * Callers who are denied nothing, or input for an entity without field security, are unaffected,
 * so `SetMany`'s ordinary handling of unknown keys still applies to them.
 *
 * @param entityInfo The entity the input will be applied to.
 * @param values The client input. Never modified.
 * @param user The caller. When absent the gate does nothing (server-internal code).
 * @param options See {@link ClientInputGateOptions}.
 */
export function AssertClientInputWritableForUser(
    entityInfo: EntityInfo | null | undefined,
    values: Record<string, unknown> | null | undefined,
    user: UserInfo | null | undefined,
    options?: ClientInputGateOptions
): void {
    if (!values || typeof values !== 'object' || !entityInfo || !user) {
        return;
    }
    const denied = deniedReadFieldsFor(entityInfo, user);
    if (!denied) {
        return;
    }
    const allowed = new Set(
        [...ClientInputTransportKeys, ...(options?.additionalAllowedKeys ?? [])].map((k) => k.trim().toLowerCase())
    );
    const known = knownFieldKeys(entityInfo);
    for (const key of Object.keys(values)) {
        const normalized = key.trim().toLowerCase();
        if (allowed.has(normalized)) {
            continue;
        }
        if (denied.has(normalized) || !known.has(normalized)) {
            throw new FieldSecurityError(key, entityInfo.Name, FieldSecurityClientInputMessage(key, entityInfo.Name));
        }
    }
}
