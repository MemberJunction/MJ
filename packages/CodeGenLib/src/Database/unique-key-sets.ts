import type { SQLDialect } from '@memberjunction/sql-dialect';
import { NormalizeUUID, ordinalCompare } from '@memberjunction/global';

/**
 * Unique keys as column sets (#4536).
 *
 * `EntityField.IsUnique` says a column is unique on its own. A composite unique index or
 * constraint is a property of a SET of columns, so CodeGen records each one as a row of
 * `EntityUniqueKey` (Name = the index or constraint name, FieldNames = its key columns in key
 * order, FilterDefinition = its predicate when filtered/partial). Primary keys are not recorded:
 * `EntityField.IsPrimaryKey` already carries them.
 *
 * CodeGen owns the table. Every run reads `vwTableUniqueKeys`, compares it with the stored rows of
 * the entities in scope, and inserts, updates or deletes so the two match. The functions here are
 * the pure part of that: the queries, the grouping, the diff and the write statements.
 */

/** Separator between the column names stored in `EntityUniqueKey.FieldNames`. */
export const UNIQUE_KEY_FIELD_SEPARATOR = ',';

/** One key column of a unique index, as read from `vwTableUniqueKeys` joined to its entity. */
export interface CatalogUniqueKeyColumn {
   EntityID: string;
   IndexName: string;
   ColumnName: string;
   KeyOrdinal: number;
   FilterDefinition: string | null;
}

/** A unique key as stored in `EntityUniqueKey`, without its ID. */
export interface UniqueKeySet {
   EntityID: string;
   Name: string;
   FieldNames: string;
   FilterDefinition: string | null;
}

/** A stored `EntityUniqueKey` row. */
export interface StoredUniqueKeySet extends UniqueKeySet {
   ID: string;
}

/** What it takes to make the stored rows match the catalog. */
export interface UniqueKeySetChanges {
   Inserts: UniqueKeySet[];
   /** Stored rows to rewrite: the ID of the stored row with the catalog's values. */
   Updates: StoredUniqueKeySet[];
   Deletes: StoredUniqueKeySet[];
}

function schemaFilterSQL(dialect: SQLDialect, excludeSchemas: string[]): string {
   if (excludeSchemas.length === 0) {
      return '';
   }
   const list = excludeSchemas.map(s => dialect.QuoteStringLiteral(s)).join(', ');
   return `AND e.${dialect.QuoteIdentifier('SchemaName')} NOT IN (${list})`;
}

/**
 * Key columns of every unique index on the base table of a non-virtual entity outside
 * `excludeSchemas`. `excludeSchemas` already carries the include-scope (see schema-scope.ts).
 */
export function BuildCatalogUniqueKeyColumnsSQL(dialect: SQLDialect, mjCoreSchema: string, excludeSchemas: string[]): string {
   const q = (name: string) => dialect.QuoteIdentifier(name);
   return `SELECT e.${q('ID')} AS ${q('EntityID')},
       uk.${q('IndexName')} AS ${q('IndexName')},
       uk.${q('ColumnName')} AS ${q('ColumnName')},
       uk.${q('KeyOrdinal')} AS ${q('KeyOrdinal')},
       uk.${q('FilterDefinition')} AS ${q('FilterDefinition')}
FROM ${dialect.QuoteSchema(mjCoreSchema, 'vwTableUniqueKeys')} uk
INNER JOIN ${dialect.QuoteSchema(mjCoreSchema, 'Entity')} e
   ON e.${q('SchemaName')} = uk.${q('SchemaName')} AND e.${q('BaseTable')} = uk.${q('TableName')}
WHERE e.${q('VirtualEntity')} = ${dialect.BooleanLiteral(false)}
   ${schemaFilterSQL(dialect, excludeSchemas)}`;
}

/**
 * The stored `EntityUniqueKey` rows of every entity outside `excludeSchemas`, virtual entities
 * included: a virtual entity has no catalog keys, so any row it holds is stale.
 */
export function BuildStoredUniqueKeySetsSQL(dialect: SQLDialect, mjCoreSchema: string, excludeSchemas: string[]): string {
   const q = (name: string) => dialect.QuoteIdentifier(name);
   return `SELECT k.${q('ID')}, k.${q('EntityID')}, k.${q('Name')}, k.${q('FieldNames')}, k.${q('FilterDefinition')}
FROM ${dialect.QuoteSchema(mjCoreSchema, 'EntityUniqueKey')} k
INNER JOIN ${dialect.QuoteSchema(mjCoreSchema, 'Entity')} e ON e.${q('ID')} = k.${q('EntityID')}
WHERE 1 = 1
   ${schemaFilterSQL(dialect, excludeSchemas)}`;
}

function keyOf(entityID: string, name: string): string {
   return `${NormalizeUUID(entityID)}|${name.toLowerCase()}`;
}

/**
 * Groups catalog key columns into one key set per (entity, index), columns in key order.
 * Output is sorted by entity and name so the emitted SQL is deterministic.
 */
export function GroupUniqueKeyColumns(columns: CatalogUniqueKeyColumn[]): UniqueKeySet[] {
   const groups = new Map<string, { set: UniqueKeySet; columns: CatalogUniqueKeyColumn[] }>();
   for (const c of columns) {
      const k = keyOf(c.EntityID, c.IndexName);
      let g = groups.get(k);
      if (!g) {
         g = { set: { EntityID: c.EntityID, Name: c.IndexName, FieldNames: '', FilterDefinition: c.FilterDefinition ?? null }, columns: [] };
         groups.set(k, g);
      }
      g.columns.push(c);
   }
   const result: UniqueKeySet[] = [];
   for (const g of groups.values()) {
      const ordered = [...g.columns].sort((a, b) => a.KeyOrdinal - b.KeyOrdinal);
      g.set.FieldNames = ordered.map(c => c.ColumnName).join(UNIQUE_KEY_FIELD_SEPARATOR);
      result.push(g.set);
   }
   return result.sort((a, b) => ordinalCompare(keyOf(a.EntityID, a.Name), keyOf(b.EntityID, b.Name)));
}

function sameValues(a: UniqueKeySet, b: UniqueKeySet): boolean {
   return a.Name === b.Name
      && a.FieldNames === b.FieldNames
      && (a.FilterDefinition ?? null) === (b.FilterDefinition ?? null);
}

/**
 * Compares the catalog's key sets with the stored rows. Rows are matched by entity and name
 * (case-insensitive, as SQL Server compares index names): a key whose columns or filter changed is
 * updated in place, a key no longer in the catalog is deleted, a new key is inserted. A renamed
 * index is a delete plus an insert. Duplicate stored rows for one key (not expected; the table has
 * a unique constraint on EntityID + Name) are deleted beyond the first.
 */
export function DiffUniqueKeySets(desired: UniqueKeySet[], stored: StoredUniqueKeySet[]): UniqueKeySetChanges {
   const storedByKey = new Map<string, StoredUniqueKeySet>();
   const changes: UniqueKeySetChanges = { Inserts: [], Updates: [], Deletes: [] };
   for (const s of stored) {
      const k = keyOf(s.EntityID, s.Name);
      if (storedByKey.has(k)) {
         changes.Deletes.push(s);
      } else {
         storedByKey.set(k, s);
      }
   }
   for (const d of desired) {
      const k = keyOf(d.EntityID, d.Name);
      const s = storedByKey.get(k);
      if (!s) {
         changes.Inserts.push(d);
         continue;
      }
      storedByKey.delete(k);
      if (!sameValues(d, s)) {
         changes.Updates.push({ ...d, ID: s.ID, EntityID: s.EntityID });
      }
   }
   changes.Deletes.push(...storedByKey.values());
   return changes;
}

function stringLiteral(dialect: SQLDialect, value: string | null): string {
   return value === null ? 'NULL' : `${dialect.StringLiteralPrefix(value)}${dialect.QuoteStringLiteral(value)}`;
}

/**
 * The statements that apply `changes`, deletes first. `newID` supplies the ID of each inserted row;
 * IDs are explicit so the statements can be appended to a migration and replayed.
 */
export function BuildUniqueKeySetSyncSQL(dialect: SQLDialect, mjCoreSchema: string, changes: UniqueKeySetChanges, newID: () => string): string[] {
   const q = (name: string) => dialect.QuoteIdentifier(name);
   const table = dialect.QuoteSchema(mjCoreSchema, 'EntityUniqueKey');
   const statements: string[] = [];
   for (const d of changes.Deletes) {
      statements.push(`DELETE FROM ${table} WHERE ${q('ID')} = '${d.ID}'`);
   }
   for (const u of changes.Updates) {
      statements.push(`UPDATE ${table} SET ${q('Name')} = ${stringLiteral(dialect, u.Name)}, ${q('FieldNames')} = ${stringLiteral(dialect, u.FieldNames)}, ${q('FilterDefinition')} = ${stringLiteral(dialect, u.FilterDefinition)}, ${q('__mj_UpdatedAt')} = ${dialect.CurrentTimestampUTC()} WHERE ${q('ID')} = '${u.ID}'`);
   }
   for (const i of changes.Inserts) {
      statements.push(`INSERT INTO ${table} (${q('ID')}, ${q('EntityID')}, ${q('Name')}, ${q('FieldNames')}, ${q('FilterDefinition')}) VALUES ('${newID()}', '${i.EntityID}', ${stringLiteral(dialect, i.Name)}, ${stringLiteral(dialect, i.FieldNames)}, ${stringLiteral(dialect, i.FilterDefinition)})`);
   }
   return statements;
}
