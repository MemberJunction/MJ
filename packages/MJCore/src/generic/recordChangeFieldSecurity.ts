import { EntityInfo } from "./entityInfo";
import { UserInfo } from "./securityInfo";

/**
 * The two metadata lookups this projector needs, and nothing else.
 *
 * Narrower than `IMetadataProvider` on purpose: both `ProviderBase` (which passes `this`) and
 * `Metadata` (which the GraphQL resolvers fall back to) satisfy this, while only the first
 * satisfies the full provider interface. Asking for exactly what is used keeps the resolver half
 * from having to invent a provider it does not have.
 */
export interface RecordChangeMetadataSource {
    readonly Entities: EntityInfo[];
    EntityByID(entityID: string): EntityInfo | undefined;
}

/**
 * The audit entity whose rows carry OTHER entities' field values. Matched by name rather than by
 * ID because every other enforcement point in this feature keys off the entity name too, and a
 * name is the thing a reader can check against metadata without a lookup.
 */
export const RecordChangesEntityName = 'MJ: Record Changes';

/**
 * The Record Change column naming the entity a row is ABOUT. Everything in this module hangs off
 * it: it is what makes the denied set per-ROW rather than per-result.
 */
export const RecordChangeEntityIDField = 'EntityID';

/**
 * Payload columns holding a JSON object keyed by the target entity's field names — projected
 * key by key against the denied set. `ChangesJSON` is `{ [field]: { field, oldValue, newValue } }`;
 * `FullRecordJSON` is a flat whole-row snapshot. Both are top-level-keyed by field name, which is
 * what lets one projection handle them.
 */
export const RecordChangeJSONPayloadFields = ['ChangesJSON', 'FullRecordJSON'] as const;

/**
 * The human-prose payload column — withheld outright, never redacted. See
 * {@link RecordChangeFieldSecurityProjector}.
 */
export const RecordChangeProsePayloadField = 'ChangesDescription';

/**
 * Every payload column this module touches, for callers that need to act on the set as a whole —
 * notably the write guard, which must refuse a narrowed value coming back in.
 */
export const RecordChangePayloadFields: readonly string[] = [
    ...RecordChangeJSONPayloadFields,
    RecordChangeProsePayloadField,
];

/**
 * Outcome of projecting one JSON payload column: either a value to write back, or a decision to
 * withhold the column entirely because the payload could not be inspected.
 *
 * Deliberately an interface with an optional `Value` rather than a discriminated union — MJCore
 * compiles without `strictNullChecks`, under which TypeScript does not narrow a union on a
 * boolean discriminant, so the union shape would force a cast at every read.
 */
export interface RecordChangePayloadProjection {
    /** When true the caller drops the column; `Value` carries nothing. */
    Withhold: boolean;
    /** The value to write back. Meaningful only when {@link Withhold} is false. */
    Value?: unknown;
}

/**
 * Narrows one Record Change JSON payload to the fields the caller may read.
 *
 * **Withholds rather than guesses.** A payload that is not a string, or is a string that does not
 * parse, or parses to something other than a plain object, is a payload this cannot prove is
 * clean — so the column is dropped instead of passed through. A null/undefined/empty value is
 * kept as-is: there is nothing stored to leak, and `ChangesJSON` is legitimately `''` on rows
 * whose diff produced nothing.
 *
 * @param raw the column's stored value
 * @param deniedLowercase field names the caller may not read, already lowercased
 */
export function ProjectRecordChangePayloadJSON(raw: unknown, deniedLowercase: Set<string>): RecordChangePayloadProjection {
    if (raw === null || raw === undefined) {
        return { Withhold: false, Value: raw };
    }
    if (typeof raw !== 'string') {
        return { Withhold: true };
    }
    if (raw.trim().length === 0) {
        return { Withhold: false, Value: raw };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { Withhold: true };
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { Withhold: true };
    }

    const source = parsed as Record<string, unknown>;
    const kept: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
        if (deniedLowercase.has(key.trim().toLowerCase())) {
            continue;
        }
        if (isDeniedChangeEntry(source[key], deniedLowercase)) {
            continue;
        }
        kept[key] = source[key];
    }
    return { Withhold: false, Value: JSON.stringify(kept) };
}

/**
 * A `ChangesJSON` entry is `{ field, oldValue, newValue }` stored under a key that is that same
 * field name, so the key check already catches it. This second check costs one property read and
 * covers the case where the two disagree — a payload written by something other than
 * `DatabaseProviderBase.DiffObjects`, or hand-edited. Where they disagree, the entry is dropped.
 */
function isDeniedChangeEntry(value: unknown, deniedLowercase: Set<string>): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const field = (value as Record<string, unknown>)['field'];
    return typeof field === 'string' && deniedLowercase.has(field.trim().toLowerCase());
}

/**
 * The row keys this projector acts on, in whatever casing they actually arrived in. Resolved once
 * from the first row and reused, mirroring `ProviderBase.OmitFieldsFromRows`' probe: a RunView
 * result is homogeneous, so scanning `Object.keys` per row would buy nothing.
 */
type RecordChangePayloadKeys = {
    /** Keys present for {@link RecordChangeJSONPayloadFields}. */
    JSON: string[];
    /** Key present for {@link RecordChangeProsePayloadField}, or null when not selected. */
    Prose: string | null;
    /** Key present for {@link RecordChangeEntityIDField}, or null when not selected. */
    EntityID: string | null;
};

/**
 * Field-level security for the payload columns of `MJ: Record Changes`.
 *
 * ## Why this is not `ProviderBase.ApplyFieldSecurityProjection`
 *
 * Every other FLS enforcement point computes the denied set against **the entity being read**. A
 * Record Change row is about a DIFFERENT entity — the one named by its own `EntityID` column —
 * and `MJ: Record Changes` itself has field security switched off in every default deployment.
 * The main projection therefore short-circuits on `EnableFieldLevelSecurity` and returns the row
 * untouched, with a denied field's old and new values sitting in `ChangesJSON` in plain text.
 * That is the leak this closes: a user with entity-level read on the audit trail could read a
 * salary they were denied on `MJ: Employees` straight out of it, in the default configuration.
 *
 * ## What happens to each column
 *
 * | Column | Treatment |
 * |---|---|
 * | `ChangesJSON` | projected — denied field keys dropped |
 * | `FullRecordJSON` | projected — same, it is a whole-row snapshot |
 * | `ChangesDescription` | **withheld entirely** whenever the caller is denied anything on the target entity |
 *
 * `ChangesDescription` is human prose ("Salary changed from 100000 to 120000"). Redacting prose
 * on the fly leaks on the first value that appears in an unexpected form, and regenerating it
 * from the filtered JSON is a larger surface than this is worth. Withholding the whole column is
 * coarse and it is safe, which is the right trade for a field whose only job is to be readable
 * text — and callers already degrade, the record-changes UI falling back to 'Changes made'.
 *
 * ## Rows in one result span different entities
 *
 * `EntityID` varies row to row, and `EntityInfo.GetDeniedReadFields` walks every field on the
 * entity — its documented performance contract is that it must not be called in a row loop. Every
 * lookup here is memoized on the raw `EntityID` string for the projector's lifetime, which is one
 * request. Construct one projector per request, never one per row.
 */
export class RecordChangeFieldSecurityProjector {
    private readonly deniedByEntityID = new Map<string, Set<string> | null>();
    private carriesDenials: boolean | null = null;
    private payloadKeys: RecordChangePayloadKeys | null | undefined = undefined;

    constructor(
        private readonly provider: RecordChangeMetadataSource,
        private readonly user: UserInfo
    ) {}

    /**
     * Whether an entity is the audit trail this projector guards. Callers gate on this before
     * constructing a projector, so nothing is paid on the other 99% of reads.
     */
    public static IsRecordChangesEntity(entity: EntityInfo | null | undefined): boolean {
        return entity?.Name?.trim().toLowerCase() === RecordChangesEntityName.toLowerCase();
    }

    /**
     * Projects a whole result set. Returns the ORIGINAL array when nothing needed changing, so an
     * unrestricted caller's rows are never rebuilt — and, on the cache-hit paths, so the cache's
     * own frozen objects are handed back by reference exactly as they are today.
     */
    public ProjectRows<T>(rows: T[]): T[] {
        if (!rows?.length || !this.callerCarriesDenials()) {
            return rows;
        }
        let mutated = false;
        const projected = rows.map((row) => {
            const next = this.projectOne(row);
            if (next !== row) {
                mutated = true;
            }
            return next;
        });
        return mutated ? projected : rows;
    }

    /**
     * Single-row form, for the GraphQL read boundary. Returns the original object untouched when
     * there is nothing to project.
     */
    public ProjectRow<T>(row: T): T {
        if (!row || !this.callerCarriesDenials()) {
            return row;
        }
        return this.projectOne(row);
    }

    /**
     * Whether this caller is denied ANY field on ANY field-security-enabled entity.
     *
     * The whole projector is a no-op for everyone else, and this gate is what makes that true —
     * including for the fail-closed branch in {@link deniedFieldsFor}, which would otherwise blank
     * audit rows on deployments that never enabled field security at all. Cost is one pass over
     * the entity list plus one denied-set walk per ENABLED entity, and the flag is off on every
     * entity an administrator has not explicitly opted in.
     *
     * Public because the WRITE side needs the same question: a caller who could have been served a
     * narrowed payload must not be allowed to write one back. See
     * `ResolverBase.StripRecordChangePayloadFromClientInput`.
     */
    public CallerCarriesAnyDenial(): boolean {
        return this.callerCarriesDenials();
    }

    private callerCarriesDenials(): boolean {
        if (this.carriesDenials === null) {
            this.carriesDenials = this.provider.Entities.some(
                (e) => e.EnableFieldLevelSecurity && e.GetDeniedReadFields(this.user).size > 0
            );
        }
        return this.carriesDenials;
    }

    private projectOne<T>(row: T): T {
        const source = row as Record<string, unknown>;
        if (!source || typeof source !== 'object') {
            return row;
        }
        const keys = this.resolvePayloadKeys(source);
        if (!keys) {
            return row; // the caller selected none of the payload columns — nothing to protect
        }
        const denied = this.deniedFieldsFor(source, keys);
        if (denied !== null && denied.size === 0) {
            return row; // caller reads every field on the entity this row is about
        }

        const projected: Record<string, unknown> = { ...source };
        if (keys.Prose) {
            delete projected[keys.Prose];
        }
        for (const key of keys.JSON) {
            if (denied === null) {
                delete projected[key];
                continue;
            }
            const result = ProjectRecordChangePayloadJSON(source[key], denied);
            if (result.Withhold) {
                delete projected[key];
            } else {
                projected[key] = result.Value;
            }
        }
        return projected as T;
    }

    /**
     * The denied-read set for the entity a Record Change row is ABOUT, or `null` to fail closed.
     *
     * **`null` drops all three payload columns.** Two shapes reach it and both have to. The first
     * is an `EntityID` that no longer resolves to a known entity. The second is the one that
     * decides the policy: a row that does not carry `EntityID` at all. A caller can ask for
     * `Fields: ['ChangesJSON']` and nothing else, and field narrowing runs BEFORE this projection
     * — so failing open on a missing `EntityID` would be a one-parameter bypass of the entire
     * control.
     *
     * The cost of failing closed is paid only by callers who already carry denials somewhere (see
     * {@link callerCarriesDenials}), and lands on audit rows for entities that are gone from
     * metadata — rows for which no caller can render an entity name either way.
     */
    private deniedFieldsFor(source: Record<string, unknown>, keys: RecordChangePayloadKeys): Set<string> | null {
        if (!keys.EntityID) {
            return null;
        }
        const rawEntityID = source[keys.EntityID];
        if (typeof rawEntityID !== 'string' || rawEntityID.trim().length === 0) {
            return null;
        }
        const cached = this.deniedByEntityID.get(rawEntityID);
        if (cached !== undefined) {
            return cached;
        }
        const entity = this.provider.EntityByID(rawEntityID);
        const denied = entity ? entity.GetDeniedReadFields(this.user) : null;
        this.deniedByEntityID.set(rawEntityID, denied);
        return denied;
    }

    /**
     * Resolves the row's actual key casing once. Returns null — cached as null — when the rows
     * carry no payload column at all, which makes every later row a single map read.
     */
    private resolvePayloadKeys(source: Record<string, unknown>): RecordChangePayloadKeys | null {
        if (this.payloadKeys !== undefined) {
            return this.payloadKeys;
        }
        const byLowerName = new Map<string, string>();
        for (const key of Object.keys(source)) {
            byLowerName.set(key.trim().toLowerCase(), key);
        }
        const jsonKeys = RecordChangeJSONPayloadFields
            .map((name) => byLowerName.get(name.toLowerCase()))
            .filter((key): key is string => key !== undefined);
        const proseKey = byLowerName.get(RecordChangeProsePayloadField.toLowerCase()) ?? null;

        this.payloadKeys = (jsonKeys.length === 0 && proseKey === null)
            ? null
            : {
                JSON: jsonKeys,
                Prose: proseKey,
                EntityID: byLowerName.get(RecordChangeEntityIDField.toLowerCase()) ?? null,
            };
        return this.payloadKeys;
    }
}
