import {
    BaseEntity,
    EntityInfo,
    Metadata,
    OmitDeniedFieldKeys,
    ProjectEntityValuesForUser,
    ReadableFieldsTransportKey,
    RecordChangeMetadataSource,
    UserInfo
} from "@memberjunction/core";
import { ActionParam } from "./ActionEngine-Base";

/**
 * ============================================================================
 * ACTION PARAMETER FIELD SECURITY — the backstop applied to action parameter
 * values before they leave the server or are persisted.
 * ============================================================================
 *
 * An action that loads its data as its context user hands back values that are
 * already narrowed. This backstop covers the actions that do not: rows taken from
 * an engine cache, loaded as the system user, or built before the user was known.
 * It is applied for ONE principal — the one the values are about to reach.
 *
 * Two kinds of value are projected:
 *
 * 1. **Entity objects** (`BaseEntity`, at any depth) become their field values
 *    projected against their OWN entity for the given user, whatever user the
 *    object was loaded for — but only when the user may read that entity at all.
 *    An object of an entity the user cannot read is never turned into values;
 *    see {@link ProjectActionParamValuesOptions.UnreadableEntityObjects}.
 * 2. **Plain objects that look like a row of an entity** the user is denied
 *    fields on. A plain object carries no entity type, so the match is
 *    deliberately conservative — see {@link IsEntityShapedRow}. When a row
 *    matches several such entities, the keys denied on ANY of them are removed.
 *
 * Only keys are ever REMOVED; no other value is rewritten. A user denied nothing
 * on any entity with field security skips the row matching entirely, and a
 * value with nothing to change is returned by reference.
 */

/**
 * The share of a plain object's keys that must be field names of an entity for
 * the object to be treated as a row of it. High enough that an object merely
 * sharing `ID` and `Name` with an entity, among keys of its own, is left alone.
 */
export const ENTITY_ROW_FIELD_KEY_RATIO = 0.8;

/**
 * How deep into nested arrays and plain objects the backstop looks. Action
 * output is a parameter value holding rows, or an envelope holding rows; a few
 * levels cover both, and the limit bounds the walk over cyclic or very deep values.
 */
export const ACTION_PARAM_PROJECTION_MAX_DEPTH = 6;

/**
 * Options for {@link ProjectActionParamValuesForUser}.
 */
export interface ProjectActionParamValuesOptions {
    /**
     * What becomes of an entity object whose entity the user may not read:
     *
     * - `'null'` (the default) replaces it with `null`, for a destination that would
     *   otherwise serialize the object's internal state, such as `JSON.stringify`.
     * - `'keep'` returns it untouched, for a destination whose serializer already
     *   drops class instances (`CopyScalarsAndArrays`), so its output stays exactly
     *   what it was before entity objects were projected.
     */
    UnreadableEntityObjects?: 'null' | 'keep';
}

/** An entity the user is denied fields on, with the key spellings a row of it may use. */
interface RestrictedEntityShape {
    Entity: EntityInfo;
    /** Lowercased `Name` and `CodeName` of every denied field. */
    Denied: ReadonlySet<string>;
    /** Lowercased `Name` and `CodeName` of every field. */
    FieldKeys: ReadonlySet<string>;
    /** Per primary key field, its lowercased `Name` and `CodeName`. */
    PrimaryKeyKeys: ReadonlyArray<ReadonlyArray<string>>;
}

/** Per-call state: the user, the metadata source, and the restricted entities, built once. */
class ProjectionContext {
    private _shapes: RestrictedEntityShape[] | null = null;
    private readonly _deniedByKeySignature = new Map<string, ReadonlySet<string> | null>();

    constructor(
        public readonly User: UserInfo,
        public readonly Provider: RecordChangeMetadataSource,
        public readonly KeepUnreadableEntityObjects: boolean
    ) {}

    /** The entities with field security on which this user is denied at least one field. */
    public get Shapes(): RestrictedEntityShape[] {
        this._shapes ??= buildRestrictedEntityShapes(this.Provider.Entities ?? [], this.User);
        return this._shapes;
    }

    /** The keys to remove from a plain object, or null when it is not a row of a restricted entity. */
    public DeniedKeysFor(row: Record<string, unknown>): ReadonlySet<string> | null {
        if (this.Shapes.length === 0) {
            return null;
        }
        const keys = normalizedRowKeys(row);
        const signature = keys.slice().sort().join('\u0000');
        if (!this._deniedByKeySignature.has(signature)) {
            this._deniedByKeySignature.set(signature, deniedUnionForKeys(keys, this.Shapes));
        }
        return this._deniedByKeySignature.get(signature) ?? null;
    }
}

/**
 * Action parameters with every value projected for `user` as described on this module.
 *
 * @param params The parameters, as an action returned them.
 * @param user The principal the values are about to reach. When absent the values
 *        go to server-internal code, which field security trusts, and the parameters
 *        are returned unchanged.
 * @param provider Metadata source for the entity list and the Record Changes payload
 *        projection. Defaults to the global provider.
 * @param options See {@link ProjectActionParamValuesOptions}.
 * @returns The original array when nothing changed; otherwise a new array whose
 *          changed parameters are copies. The input is never modified.
 */
export function ProjectActionParamValuesForUser(
    params: ActionParam[] | null | undefined,
    user: UserInfo | null | undefined,
    provider?: RecordChangeMetadataSource | null,
    options?: ProjectActionParamValuesOptions
): ActionParam[] | null | undefined {
    if (!params?.length || !user) {
        return params;
    }
    const keepUnreadable = options?.UnreadableEntityObjects === 'keep';
    const context = new ProjectionContext(user, provider ?? new Metadata(), keepUnreadable);
    const projected = params.map((param) => {
        const value: unknown = param?.Value;
        const narrowed = projectValue(value, context, 0);
        return narrowed === value ? param : { ...param, Value: narrowed };
    });
    return projected.some((p, i) => p !== params[i]) ? projected : params;
}

/**
 * True when `row` is treated as a row of `shape`'s entity: it carries every primary
 * key field of the entity, and at least {@link ENTITY_ROW_FIELD_KEY_RATIO} of its
 * keys are field names of the entity. Keys match by `Name` or `CodeName`, ignoring
 * case and surrounding whitespace; the readable-fields transport marker is not counted.
 */
export function IsEntityShapedRow(row: Record<string, unknown>, entity: EntityInfo): boolean {
    const shape = buildShape(entity, new Set<string>());
    return !!shape && matchesShape(normalizedRowKeys(row), shape);
}

function projectValue(value: unknown, context: ProjectionContext, depth: number): unknown {
    if (value === null || typeof value !== 'object' || depth > ACTION_PARAM_PROJECTION_MAX_DEPTH) {
        return value;
    }
    if (value instanceof BaseEntity) {
        return projectEntityObject(value, context);
    }
    if (Array.isArray(value)) {
        return projectArray(value, context, depth);
    }
    return isPlainObject(value) ? projectPlainObject(value, context, depth) : value;
}

/**
 * An entity object's field values, projected against its own entity for the context's user. When
 * the user may not read the entity at all, the object is not turned into values: field projection
 * narrows what a reader of the entity sees, and must not hand a non-reader data it never had.
 */
function projectEntityObject(entity: BaseEntity, context: ProjectionContext): Record<string, unknown> | BaseEntity | null {
    if (!entity.EntityInfo?.GetUserPermisions(context.User)?.CanRead) {
        return context.KeepUnreadableEntityObjects ? entity : null;
    }
    // fls-guard: projected for the recipient on the next line
    const values: Record<string, unknown> = entity.GetAll();
    return ProjectEntityValuesForUser(context.Provider, entity.EntityInfo, values, context.User) ?? values;
}

function projectArray(items: unknown[], context: ProjectionContext, depth: number): unknown[] {
    const projected = items.map((item) => projectValue(item, context, depth + 1));
    return projected.some((item, i) => item !== items[i]) ? projected : items;
}

/** Removes the keys denied on any entity the object is a row of, then descends into its values. */
function projectPlainObject(row: Record<string, unknown>, context: ProjectionContext, depth: number): Record<string, unknown> {
    const narrowed = OmitDeniedFieldKeys(row, context.DeniedKeysFor(row));
    let copy: Record<string, unknown> | null = narrowed === row ? null : narrowed;
    for (const key of Object.keys(narrowed)) {
        const value = narrowed[key];
        const projected = projectValue(value, context, depth + 1);
        if (projected !== value) {
            copy ??= { ...narrowed };
            copy[key] = projected;
        }
    }
    return copy ?? row;
}

function isPlainObject(value: object): value is Record<string, unknown> {
    const prototype: object | null = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

/** The restricted shapes for `user`: entities whose field security applies and denies the user something. */
function buildRestrictedEntityShapes(entities: EntityInfo[], user: UserInfo): RestrictedEntityShape[] {
    const shapes: RestrictedEntityShape[] = [];
    for (const entity of entities) {
        if (!entity?.FieldLevelSecurityApplies) {
            continue;
        }
        const denied = entity.GetDeniedReadFields(user);
        const shape = denied.size > 0 ? buildShape(entity, denied) : null;
        if (shape) {
            shapes.push(shape);
        }
    }
    return shapes;
}

/** The key spellings of `entity`, or null when it has no primary key to recognize a row by. */
function buildShape(entity: EntityInfo, denied: ReadonlySet<string>): RestrictedEntityShape | null {
    const primaryKeys = entity.PrimaryKeys ?? [];
    if (primaryKeys.length === 0) {
        return null;
    }
    const FieldKeys = new Set<string>();
    for (const field of entity.Fields ?? []) {
        for (const spelling of fieldSpellings(field.Name, field.CodeName)) {
            FieldKeys.add(spelling);
        }
    }
    const PrimaryKeyKeys = primaryKeys.map((pk) => fieldSpellings(pk.Name, pk.CodeName));
    return { Entity: entity, Denied: denied, FieldKeys, PrimaryKeyKeys };
}

function fieldSpellings(name: string | null | undefined, codeName: string | null | undefined): string[] {
    return [name, codeName].filter((s): s is string => !!s).map((s) => s.trim().toLowerCase());
}

function normalizedRowKeys(row: Record<string, unknown>): string[] {
    const marker = ReadableFieldsTransportKey.toLowerCase();
    return Object.keys(row).map((k) => k.trim().toLowerCase()).filter((k) => k !== marker);
}

function matchesShape(keys: string[], shape: RestrictedEntityShape): boolean {
    if (keys.length === 0) {
        return false;
    }
    const keySet = new Set(keys);
    if (!shape.PrimaryKeyKeys.every((spellings) => spellings.some((s) => keySet.has(s)))) {
        return false;
    }
    const fieldKeyCount = keys.filter((k) => shape.FieldKeys.has(k)).length;
    return fieldKeyCount / keys.length >= ENTITY_ROW_FIELD_KEY_RATIO;
}

/** The union of the denied sets of every restricted entity the keys match, or null when none match. */
function deniedUnionForKeys(keys: string[], shapes: RestrictedEntityShape[]): ReadonlySet<string> | null {
    let union: Set<string> | null = null;
    for (const shape of shapes) {
        if (!matchesShape(keys, shape)) {
            continue;
        }
        union ??= new Set<string>();
        for (const name of shape.Denied) {
            union.add(name);
        }
    }
    return union;
}
