/**
 * SECURITY — which output columns of a saved query a field-level security restricted caller must
 * not receive, and dropping them from the rows. Used only for queries whose denied columns can
 * reach the output through a projection star (`projectionStars.ts`); a query that names a denied
 * field is refused before it runs.
 *
 * The output columns come from the database's own description of the rendered statement
 * (`DescribeStatement`), mapped through MJ metadata: the source schema and view (or table, or an
 * alternate base view) name an entity, the source column one of its fields. The description is
 * the same for every caller, so the provider keeps it per rendered statement and dialect
 * (`StatementMemo`); which columns a caller loses is worked out per call.
 */
import type { EntityInfo, UserInfo } from '@memberjunction/core';
import { ReferenceMayNameField } from '@memberjunction/core';
import type { DescribedColumn } from '../describeStatement.js';

/** Folded `schema.object` → the entities whose base view, base table or alternate base view it is. */
function relationIndex(catalog: readonly EntityInfo[]): Map<string, EntityInfo[]> {
    const index = new Map<string, EntityInfo[]>();
    const add = (schema: string | null | undefined, name: string | null | undefined, entity: EntityInfo): void => {
        if (!name) return;
        const key = `${(schema ?? '').toLowerCase()}.${name.toLowerCase()}`;
        const list = index.get(key) ?? [];
        if (!list.includes(entity)) list.push(entity);
        index.set(key, list);
    };
    for (const entity of catalog) {
        add(entity.SchemaName, entity.BaseView, entity);
        add(entity.SchemaName, entity.BaseTable, entity);
        for (const view of entity.AlternateBaseViews ?? []) add(view.SchemaName ?? entity.SchemaName, view.ViewName, entity);
    }
    return index;
}

/**
 * The output column names `user` must not receive:
 * - every column whose source is a field the user is denied on the entity that source names;
 * - every column whose source names no entity, or that has no source, whose name may name a
 *   field the user is denied on any of `readEntities` (a conservative catch for a pass-through
 *   the database did not trace).
 *
 * @param columns The description of the rendered statement
 * @param catalog Every entity the provider knows
 * @param readEntities The entities the statement reads
 * @param user The caller
 */
export function WithheldColumnNames(
    columns: readonly DescribedColumn[],
    catalog: readonly EntityInfo[],
    readEntities: readonly EntityInfo[],
    user: UserInfo,
): Set<string> {
    const index = relationIndex(catalog);
    const deniedByEntity = new Map<EntityInfo, Set<string>>();
    const deniedOf = (entity: EntityInfo): Set<string> => {
        let denied = deniedByEntity.get(entity);
        if (!denied) {
            denied = entity.FieldLevelSecurityApplies ? entity.GetDeniedReadFields(user) : new Set<string>();
            deniedByEntity.set(entity, denied);
        }
        return denied;
    };
    const withheld = new Set<string>();
    for (const column of columns) {
        const entities = column.Source ? index.get(`${column.Source.Schema.toLowerCase()}.${column.Source.Object.toLowerCase()}`) : undefined;
        const denied = entities
            ? entities.some(e => deniedOf(e).has(column.Source!.Column.toLowerCase()))
            : readEntities.some(e => [...deniedOf(e)].some(name => ReferenceMayNameField(column.Name, name)));
        if (denied) withheld.add(column.Name);
    }
    return withheld;
}

/**
 * The names in `rows` that `columns` does not describe: a sign the statement's shape changed
 * since it was described.
 */
export function UndescribedColumnNames(rows: readonly Record<string, unknown>[], columns: readonly DescribedColumn[]): Set<string> {
    const described = new Set(columns.map(c => c.Name));
    const unknown = new Set<string>();
    for (const row of rows) {
        for (const name of Object.keys(row)) {
            if (!described.has(name)) unknown.add(name);
        }
    }
    return unknown;
}

/** `rows` without the `withheld` columns, as new row objects; `rows` itself when nothing is withheld. */
export function WithholdColumns<T extends Record<string, unknown>>(rows: readonly T[], withheld: ReadonlySet<string>): T[] {
    if (withheld.size === 0) return rows as T[];
    return rows.map(row => {
        const kept: Record<string, unknown> = {};
        for (const [name, value] of Object.entries(row)) {
            if (!withheld.has(name)) kept[name] = value;
        }
        return kept as T;
    });
}
