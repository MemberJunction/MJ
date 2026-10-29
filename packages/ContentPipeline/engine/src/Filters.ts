/**
 * @fileoverview RunView filters built from values, never by interpolating them.
 *
 * Thin wrappers over MJ's `FieldValueCollection.ToWhereClause()`, which quotes strings and dates,
 * doubles embedded quotes and renders `null` as `IS NULL`. Only constant, value-free SQL is ever
 * written by hand alongside these.
 *
 * @module @memberjunction/content-pipeline
 */

import { FieldValueCollection } from '@memberjunction/core';

/** Every field equals its value; a `null` value means `IS NULL`. */
export function WhereEqual(values: Record<string, unknown>): string {
    return FieldValueCollection.FromObject(values).ToWhereClause();
}

/**
 * The field equals any of the values — the repo's `(…) OR (…)` form of an IN list.
 *
 * An empty list matches nothing, rather than producing an empty filter that matches everything.
 */
export function WhereAnyOf(field: string, values: readonly unknown[]): string {
    return values.length === 0 ? '1=0' : values.map((value) => `(${WhereEqual({ [field]: value })})`).join(' OR ');
}
