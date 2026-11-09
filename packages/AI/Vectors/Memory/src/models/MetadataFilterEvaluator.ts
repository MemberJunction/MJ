/**
 * Evaluates a vector-database metadata filter in memory, for drivers that hold their vectors
 * in-process (`SimpleVectorDatabase`) and so have no remote store to push the filter to.
 *
 * The language is the Pinecone / MongoDB-style object every MJ caller builds — `VectorSearchProvider`
 * and `VectorMetadataFilter.ToNativeFilter` produce it, and a search scope's rendered
 * `MetadataFilter` is written in it:
 *
 * ```json
 * { "$and": [ { "Entity": { "$in": ["Members", "Accounts"] } }, { "OrganizationID": "8F2C…" } ] }
 * ```
 *
 * | Form | Meaning |
 * |---|---|
 * | `{ Field: value }` | equality (same as `{ Field: { $eq: value } }`) |
 * | `$eq`, `$ne` | equal / not equal |
 * | `$gt`, `$gte`, `$lt`, `$lte` | ordering — numbers, dates (as instants) or strings |
 * | `$in`, `$nin` | membership in an array of values |
 * | `$exists` | the field is present (non-null) or absent |
 * | `$and`, `$or` | every / any of an array of sub-filters |
 *
 * Several conditions in one object must all hold. A field whose value is an array (a list of tags)
 * matches `$eq` / `$in` when any element matches, and `$ne` / `$nin` when none does. An absent field
 * fails every condition except `$ne`, `$nin`, `$exists: false` and equality with `null`, as in MongoDB.
 *
 * **Fail closed.** A filter is where a search scope's tenant and permission push-down lives, so an
 * operator this evaluator does not understand is reported as `unsupported` — the caller must refuse
 * the query rather than run it unfiltered. The filter is validated once, up front, by
 * {@link CompileMetadataFilter}; evaluating the compiled predicate never throws.
 *
 * Browser-safe: no Node APIs.
 *
 * @module MetadataFilterEvaluator
 */
import { IsValidUUID, UUIDsEqual } from '@memberjunction/global';

/** Reads one field of the record a filter is evaluated against; `undefined` when it has none. */
export type MetadataFieldReader = (field: string) => unknown;

/** A compiled filter: true when the record the reader describes passes it. */
export type MetadataFilterPredicate = (read: MetadataFieldReader) => boolean;

/** The outcome of {@link CompileMetadataFilter}. */
export type MetadataFilterCompilation =
    /** No filter was given (null, undefined or `{}`): every record passes. */
    | { Status: 'none' }
    /** A valid filter. */
    | { Status: 'ok'; Predicate: MetadataFilterPredicate }
    /** A filter was given that this evaluator cannot apply. The caller must not run the query unfiltered. */
    | { Status: 'unsupported'; Reason: string };

/** A scalar a filter can compare against. */
type FilterScalar = string | number | boolean | null;

const COMPARISON_OPERATORS = new Set(['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$exists']);

/** Thrown inside compilation only; turned into an `unsupported` result by {@link CompileMetadataFilter}. */
class UnsupportedFilterError extends Error {}

/**
 * Validates `filter` and compiles it into a predicate.
 *
 * @param filter - The filter object (`QueryOptions.filter`), or nothing.
 * @returns `none` when there is nothing to apply, `ok` with the predicate, or `unsupported` with the
 *   reason — an unknown operator, a non-array `$and` / `$in`, a nested object used as a value, and so on.
 *
 * @example
 * ```typescript
 * const compiled = CompileMetadataFilter({ Entity: { $in: ['Members'] }, Status: 'Active' });
 * if (compiled.Status === 'ok') {
 *     const keep = compiled.Predicate(field => row[field]);
 * }
 * ```
 */
export function CompileMetadataFilter(filter: object | null | undefined): MetadataFilterCompilation {
    if (filter == null) return { Status: 'none' };
    if (!isPlainObject(filter)) {
        return { Status: 'unsupported', Reason: `a metadata filter must be an object, got ${describe(filter)}` };
    }
    if (Object.keys(filter).length === 0) return { Status: 'none' };
    try {
        return { Status: 'ok', Predicate: compileObject(filter) };
    } catch (e) {
        if (e instanceof UnsupportedFilterError) return { Status: 'unsupported', Reason: e.message };
        throw e;
    }
}

/** One filter object: every key (logical operator or field) must hold. */
function compileObject(filter: Record<string, unknown>): MetadataFilterPredicate {
    const parts: MetadataFilterPredicate[] = [];
    for (const [key, value] of Object.entries(filter)) {
        parts.push(key.startsWith('$') ? compileLogical(key, value) : compileField(key, value));
    }
    return read => parts.every(part => part(read));
}

/** `$and` / `$or` over an array of sub-filters. */
function compileLogical(operator: string, value: unknown): MetadataFilterPredicate {
    if (operator !== '$and' && operator !== '$or') {
        throw new UnsupportedFilterError(`unsupported logical operator "${operator}"`);
    }
    if (!Array.isArray(value) || value.length === 0) {
        throw new UnsupportedFilterError(`"${operator}" needs a non-empty array of filters`);
    }
    const parts = value.map((sub, i) => {
        if (!isPlainObject(sub)) throw new UnsupportedFilterError(`"${operator}[${i}]" must be an object, got ${describe(sub)}`);
        return compileObject(sub);
    });
    return operator === '$and'
        ? read => parts.every(part => part(read))
        : read => parts.some(part => part(read));
}

/** One field's condition: a bare value (equality) or an object of comparison operators. */
function compileField(field: string, condition: unknown): MetadataFilterPredicate {
    if (!isPlainObject(condition)) {
        const equals = equalsPredicate(toScalar(condition, field));
        return read => equals(read(field));
    }
    const operators = Object.entries(condition);
    if (operators.length === 0) throw new UnsupportedFilterError(`"${field}" has an empty condition object`);
    const parts = operators.map(([op, operand]) => compileOperator(field, op, operand));
    return read => {
        const actual = read(field);
        return parts.every(part => part(actual));
    };
}

/** One comparison operator applied to a field's value. */
function compileOperator(field: string, op: string, operand: unknown): (actual: unknown) => boolean {
    if (!COMPARISON_OPERATORS.has(op)) throw new UnsupportedFilterError(`unsupported operator "${op}" on "${field}"`);
    const path = `${field}.${op}`;
    switch (op) {
        case '$eq': return equalsPredicate(toScalar(operand, path));
        case '$ne': { const equals = equalsPredicate(toScalar(operand, path)); return actual => !equals(actual); }
        case '$in': { const vs = toScalarArray(operand, path); return actual => matchesAny(actual, a => vs.some(v => valuesEqual(a, v))); }
        case '$nin': { const vs = toScalarArray(operand, path); return actual => !matchesAny(actual, a => vs.some(v => valuesEqual(a, v))); }
        case '$exists': {
            if (typeof operand !== 'boolean') throw new UnsupportedFilterError(`"${path}" needs true or false`);
            return actual => (actual != null) === operand;
        }
        default: {
            const v = toScalar(operand, path);
            if (v === null || typeof v === 'boolean') throw new UnsupportedFilterError(`"${path}" needs a number, date or string`);
            return actual => matchesAny(actual, a => orderingHolds(op, compare(a, v)));
        }
    }
}

/**
 * Equality with one filter scalar. `null` matches a null or absent field (as in MongoDB); any other
 * value matches the field, or any element of an array-valued field.
 */
function equalsPredicate(expected: FilterScalar): (actual: unknown) => boolean {
    if (expected === null) return actual => actual == null;
    return actual => matchesAny(actual, a => valuesEqual(a, expected));
}

/** For an array-valued field, true when any element matches; for a scalar, whether it matches. Absent never matches. */
function matchesAny(actual: unknown, test: (value: unknown) => boolean): boolean {
    if (actual === undefined || actual === null) return false;
    return Array.isArray(actual) ? actual.some(test) : test(actual);
}

/**
 * Equality between a record value and a filter scalar. Two UUIDs compare case-insensitively (SQL
 * Server returns them upper case, PostgreSQL lower case); a `Date` compares by instant with an ISO
 * string or epoch number; everything else is strict.
 */
function valuesEqual(actual: unknown, expected: FilterScalar): boolean {
    if (expected === null) return actual == null;
    if (actual instanceof Date) {
        const instant = toInstant(expected);
        return instant !== null && actual.getTime() === instant;
    }
    if (typeof actual === 'string' && typeof expected === 'string') {
        return actual === expected || (IsValidUUID(actual) && IsValidUUID(expected) && UUIDsEqual(actual, expected));
    }
    return actual === expected;
}

/** Orders a record value against a filter scalar: negative, 0 or positive, or null when they cannot be compared. */
function compare(actual: unknown, expected: string | number): number | null {
    if (actual instanceof Date) {
        const instant = toInstant(expected);
        return instant === null ? null : actual.getTime() - instant;
    }
    if (typeof actual === 'number' && typeof expected === 'number') return actual - expected;
    if (typeof actual === 'string' && typeof expected === 'string') return actual < expected ? -1 : actual > expected ? 1 : 0;
    return null;
}

function orderingHolds(op: string, order: number | null): boolean {
    if (order === null || Number.isNaN(order)) return false;
    switch (op) {
        case '$gt': return order > 0;
        case '$gte': return order >= 0;
        case '$lt': return order < 0;
        default: return order <= 0; // $lte — the only remaining ordering operator
    }
}

/** An epoch-ms instant from a filter scalar (a number, or a parseable date string), or null. */
function toInstant(value: FilterScalar): number | null {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const ms = Date.parse(value);
        return Number.isNaN(ms) ? null : ms;
    }
    return null;
}

/** A filter operand as a scalar; `path` names it in the error (`Entity.$in[0]`). */
function toScalar(value: unknown, path: string): FilterScalar {
    if (value === null) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Date) return value.toISOString();
    throw new UnsupportedFilterError(`"${path}" must be a string, number, boolean or null, got ${describe(value)}`);
}

function toScalarArray(value: unknown, path: string): FilterScalar[] {
    if (!Array.isArray(value)) throw new UnsupportedFilterError(`"${path}" needs an array, got ${describe(value)}`);
    return value.map((v, i) => toScalar(v, `${path}[${i}]`));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function describe(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'an array';
    return typeof value === 'object' ? 'an object' : typeof value;
}
