/**
 * Pure query builders, resolution, diffing, and SQL emission for syncing `EntityIndex` and
 * `EntityIndexField` metadata from the database catalog (#6801).
 *
 * Rules:
 * - Only tracks indexes on tables corresponding to non-virtual MJ `Entities` (`SchemaName` + `BaseTable`).
 * - Indexes named `IDX_AUTO_MJ_FKEY_*` are tagged `Source = 'CodeGen'`; others default to `'Database'`.
 * - Stored rows with `Status IN ('Proposed', 'Rejected')` are NEVER deleted by CodeGen sync.
 * - When a `Proposed` index appears in the database (matching by name or normalized field signature),
 *   it is promoted in place to `Status = 'Active'` (preserving its `Source` and `Description`).
 */

import type {
   CatalogIndex,
   IndexFieldRole,
   IndexSortDirection,
   NormalizedIndexType,
   SQLDialect,
} from '@memberjunction/sql-dialect';
import { EXPRESSION_KEY_PART } from '@memberjunction/sql-dialect';
import { NormalizeUUID, ordinalCompare } from '@memberjunction/global';
import type { EntityIndexSource, EntityIndexStatus } from '@memberjunction/core';

/** Naming prefix for CodeGen-generated foreign key indexes. */
export const CODEGEN_AUTO_FKEY_INDEX_PREFIX = 'IDX_AUTO_MJ_FKEY_';

/** Minimal Entity projection needed to map catalog tables to `EntityID`. */
export interface IndexSyncEntityRef {
   ID: string;
   SchemaName: string;
   BaseTable: string;
   VirtualEntity: boolean;
}

/** Minimal EntityField projection needed to map index column names to `EntityFieldID`. */
export interface IndexSyncEntityFieldRef {
   ID: string;
   EntityID: string;
   Name: string;
}

/** Desired `EntityIndexField` row resolved from the database catalog. */
export interface DesiredEntityIndexField {
   EntityFieldID: string | null;
   Expression: string | null;
   Sequence: number;
   Role: IndexFieldRole;
   SortDirection: IndexSortDirection;
}

/** Desired `EntityIndex` row resolved from the database catalog. */
export interface DesiredEntityIndex {
   EntityID: string;
   Name: string;
   IndexType: NormalizedIndexType;
   NativeType: string;
   IsUnique: boolean;
   IsPrimaryKey: boolean;
   IsClustered: boolean;
   FilterDefinition: string | null;
   HasExpressions: boolean;
   Source: EntityIndexSource;
   Status: EntityIndexStatus;
   Fields: DesiredEntityIndexField[];
}

/** Stored `EntityIndex` row read from the database. */
export interface StoredEntityIndex {
   ID: string;
   EntityID: string;
   Name: string;
   IndexType: string;
   NativeType: string;
   IsUnique: boolean;
   IsPrimaryKey: boolean;
   IsClustered: boolean;
   FilterDefinition: string | null;
   HasExpressions: boolean;
   Source: EntityIndexSource;
   Status: EntityIndexStatus;
   Description: string | null;
}

/** Stored `EntityIndexField` row read from the database. */
export interface StoredEntityIndexField {
   ID: string;
   EntityIndexID: string;
   EntityFieldID: string | null;
   Expression: string | null;
   Sequence: number;
   Role: IndexFieldRole;
   SortDirection: IndexSortDirection;
}

/** Update plan for an existing `EntityIndex` row (including `Proposed` → `Active` promotions). */
export interface EntityIndexUpdate {
   ID: string;
   Desired: DesiredEntityIndex;
   /** True when columns on `EntityIndex` itself changed (including status promotion). */
   HeaderChanged: boolean;
   /** True when `EntityIndexField` rows for this index must be replaced. */
   FieldsChanged: boolean;
   /** True when this update promotes a `Proposed` row to `Active`. */
   PromotedFromProposed: boolean;
}

/** Diff between catalog indexes and stored `EntityIndex` / `EntityIndexField` rows. */
export interface EntityIndexSyncChanges {
   Inserts: DesiredEntityIndex[];
   Updates: EntityIndexUpdate[];
   Deletes: StoredEntityIndex[];
}

function schemaFilterSQL(dialect: SQLDialect, excludeSchemas: string[]): string {
   if (excludeSchemas.length === 0) {
      return '';
   }
   const list = excludeSchemas.map((s) => dialect.QuoteStringLiteral(s)).join(', ');
   return `AND e.${dialect.QuoteIdentifier('SchemaName')} NOT IN (${list})`;
}

/** Reads entities outside `excludeSchemas` so catalog tables can be matched to `EntityID`. */
export function BuildEntitiesForIndexSyncSQL(dialect: SQLDialect, mjCoreSchema: string, excludeSchemas: string[]): string {
   const q = (name: string) => dialect.QuoteIdentifier(name);
   return `SELECT e.${q('ID')}, e.${q('SchemaName')}, e.${q('BaseTable')}, e.${q('VirtualEntity')}
FROM ${dialect.QuoteSchema(mjCoreSchema, 'Entity')} e
WHERE 1 = 1
   ${schemaFilterSQL(dialect, excludeSchemas)}`;
}

/** Reads entity fields outside `excludeSchemas` so catalog columns can be matched to `EntityFieldID`. */
export function BuildEntityFieldsForIndexSyncSQL(dialect: SQLDialect, mjCoreSchema: string, excludeSchemas: string[]): string {
   const q = (name: string) => dialect.QuoteIdentifier(name);
   return `SELECT ef.${q('ID')}, ef.${q('EntityID')}, ef.${q('Name')}
FROM ${dialect.QuoteSchema(mjCoreSchema, 'EntityField')} ef
INNER JOIN ${dialect.QuoteSchema(mjCoreSchema, 'Entity')} e ON e.${q('ID')} = ef.${q('EntityID')}
WHERE 1 = 1
   ${schemaFilterSQL(dialect, excludeSchemas)}`;
}

/** Reads stored `EntityIndex` rows for entities outside `excludeSchemas`. */
export function BuildStoredEntityIndexesSQL(dialect: SQLDialect, mjCoreSchema: string, excludeSchemas: string[]): string {
   const q = (name: string) => dialect.QuoteIdentifier(name);
   return `SELECT idx.${q('ID')}, idx.${q('EntityID')}, idx.${q('Name')}, idx.${q('IndexType')}, idx.${q('NativeType')},
       idx.${q('IsUnique')}, idx.${q('IsPrimaryKey')}, idx.${q('IsClustered')}, idx.${q('FilterDefinition')},
       idx.${q('HasExpressions')}, idx.${q('Source')}, idx.${q('Status')}, idx.${q('Description')}
FROM ${dialect.QuoteSchema(mjCoreSchema, 'EntityIndex')} idx
INNER JOIN ${dialect.QuoteSchema(mjCoreSchema, 'Entity')} e ON e.${q('ID')} = idx.${q('EntityID')}
WHERE 1 = 1
   ${schemaFilterSQL(dialect, excludeSchemas)}`;
}

/** Reads stored `EntityIndexField` rows for entities outside `excludeSchemas`. */
export function BuildStoredEntityIndexFieldsSQL(dialect: SQLDialect, mjCoreSchema: string, excludeSchemas: string[]): string {
   const q = (name: string) => dialect.QuoteIdentifier(name);
   return `SELECT f.${q('ID')}, f.${q('EntityIndexID')}, f.${q('EntityFieldID')}, f.${q('Expression')},
       f.${q('Sequence')}, f.${q('Role')}, f.${q('SortDirection')}
FROM ${dialect.QuoteSchema(mjCoreSchema, 'EntityIndexField')} f
INNER JOIN ${dialect.QuoteSchema(mjCoreSchema, 'EntityIndex')} idx ON idx.${q('ID')} = f.${q('EntityIndexID')}
INNER JOIN ${dialect.QuoteSchema(mjCoreSchema, 'Entity')} e ON e.${q('ID')} = idx.${q('EntityID')}
WHERE 1 = 1
   ${schemaFilterSQL(dialect, excludeSchemas)}`;
}

function tableKey(schemaName: string, tableName: string): string {
   return `${schemaName.trim().toLowerCase()}.${tableName.trim().toLowerCase()}`;
}

function entityIndexKey(entityID: string, indexName: string): string {
   return `${NormalizeUUID(entityID)}|${indexName.trim().toLowerCase()}`;
}

function normalizeExpr(value: string | null | undefined): string {
   return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Computes a normalized structural signature for an index so a `Proposed` index can be matched
 * to a newly created database index even if the DBA chose a different index name.
 */
export function ComputeIndexSignature(
   entityID: string,
   indexType: string,
   isUnique: boolean,
   filterDefinition: string | null,
   fields: ReadonlyArray<Pick<DesiredEntityIndexField, 'EntityFieldID' | 'Expression' | 'Sequence' | 'Role' | 'SortDirection'>>,
): string {
   const sorted = [...fields].sort((a, b) => a.Sequence - b.Sequence);
   const fieldParts = sorted.map((f) => {
      const target = f.EntityFieldID ? `col:${NormalizeUUID(f.EntityFieldID)}` : `expr:${normalizeExpr(f.Expression)}`;
      return `${f.Role}:${target}:${f.SortDirection}`;
   });
   return [
      NormalizeUUID(entityID),
      indexType.trim().toLowerCase(),
      isUnique ? '1' : '0',
      normalizeExpr(filterDefinition),
      fieldParts.join(','),
   ].join('|');
}

/** Returns `'CodeGen'` for `IDX_AUTO_MJ_FKEY_*` indexes and `'Database'` otherwise. */
export function ClassifyCatalogIndexSource(indexName: string): EntityIndexSource {
   return indexName.toUpperCase().startsWith(CODEGEN_AUTO_FKEY_INDEX_PREFIX) ? 'CodeGen' : 'Database';
}

/**
 * Resolves raw {@link CatalogIndex} records against MJ `Entities` and `EntityFields`.
 * Indexes on non-entity tables or virtual entities are ignored. Output is deterministically sorted.
 */
export function ResolveDesiredEntityIndexes(
   catalogIndexes: readonly CatalogIndex[],
   entities: readonly IndexSyncEntityRef[],
   entityFields: readonly IndexSyncEntityFieldRef[],
): DesiredEntityIndex[] {
   const entityByTable = new Map<string, IndexSyncEntityRef>();
   for (const e of entities) {
      if (!e.VirtualEntity) {
         const key = tableKey(e.SchemaName, e.BaseTable);
         if (!entityByTable.has(key)) {
            entityByTable.set(key, e);
         }
      }
   }

   const fieldByEntityAndName = new Map<string, string>();
   for (const f of entityFields) {
      fieldByEntityAndName.set(`${NormalizeUUID(f.EntityID)}|${f.Name.trim().toLowerCase()}`, f.ID);
   }

   const resolved: DesiredEntityIndex[] = [];
   for (const ci of catalogIndexes) {
      const entity = entityByTable.get(tableKey(ci.SchemaName, ci.TableName));
      if (!entity) {
         continue;
      }
      const fields = resolveIndexFields(ci, entity.ID, fieldByEntityAndName);
      resolved.push({
         EntityID: entity.ID,
         Name: ci.IndexName,
         IndexType: ci.IndexType,
         NativeType: ci.NativeType,
         IsUnique: ci.IsUnique,
         IsPrimaryKey: ci.IsPrimaryKey,
         IsClustered: ci.IsClustered,
         FilterDefinition: ci.FilterDefinition ?? null,
         HasExpressions: ci.HasExpressions || fields.some((f) => f.EntityFieldID === null),
         Source: ClassifyCatalogIndexSource(ci.IndexName),
         Status: 'Active',
         Fields: fields,
      });
   }

   return resolved.sort((a, b) => ordinalCompare(entityIndexKey(a.EntityID, a.Name), entityIndexKey(b.EntityID, b.Name)));
}

function resolveIndexFields(
   catalogIndex: CatalogIndex,
   entityID: string,
   fieldByEntityAndName: Map<string, string>,
): DesiredEntityIndexField[] {
   const entityKey = NormalizeUUID(entityID);
   const ordered = [...catalogIndex.Fields].sort((a, b) => a.Sequence - b.Sequence);
   const result: DesiredEntityIndexField[] = [];
   let seq = 1;

   for (const f of ordered) {
      if (f.ColumnName === null) {
         result.push({
            EntityFieldID: null,
            Expression: f.Expression ?? EXPRESSION_KEY_PART,
            Sequence: seq++,
            Role: f.Role,
            SortDirection: f.SortDirection,
         });
         continue;
      }
      const fieldID = fieldByEntityAndName.get(`${entityKey}|${f.ColumnName.trim().toLowerCase()}`);
      if (!fieldID) {
         continue;
      }
      result.push({
         EntityFieldID: fieldID,
         Expression: null,
         Sequence: seq++,
         Role: f.Role,
         SortDirection: f.SortDirection,
      });
   }
   return result;
}

function fieldsEqual(
   desired: readonly DesiredEntityIndexField[],
   stored: readonly StoredEntityIndexField[],
): boolean {
   if (desired.length !== stored.length) {
      return false;
   }
   const sortedStored = [...stored].sort((a, b) => a.Sequence - b.Sequence);
   for (let i = 0; i < desired.length; i++) {
      const d = desired[i];
      const s = sortedStored[i];
      const dFieldId = d.EntityFieldID ? NormalizeUUID(d.EntityFieldID) : null;
      const sFieldId = s.EntityFieldID ? NormalizeUUID(s.EntityFieldID) : null;
      if (
         d.Sequence !== s.Sequence ||
         d.Role !== s.Role ||
         d.SortDirection !== s.SortDirection ||
         dFieldId !== sFieldId ||
         (d.Expression ?? null) !== (s.Expression ?? null)
      ) {
         return false;
      }
   }
   return true;
}

function headerEqual(desired: DesiredEntityIndex, stored: StoredEntityIndex): boolean {
   return (
      desired.Name === stored.Name &&
      desired.IndexType === stored.IndexType &&
      desired.NativeType === stored.NativeType &&
      desired.IsUnique === stored.IsUnique &&
      desired.IsPrimaryKey === stored.IsPrimaryKey &&
      desired.IsClustered === stored.IsClustered &&
      (desired.FilterDefinition ?? null) === (stored.FilterDefinition ?? null) &&
      desired.HasExpressions === stored.HasExpressions &&
      desired.Source === stored.Source &&
      desired.Status === stored.Status
   );
}

/**
 * Computes inserts, updates (including `Proposed` → `Active` promotions), and deletes needed to
 * bring stored `EntityIndex` + `EntityIndexField` rows into sync with the database catalog.
 *
 * `Proposed` and `Rejected` rows are NEVER deleted.
 */
export function DiffEntityIndexes(
   desired: readonly DesiredEntityIndex[],
   storedIndexes: readonly StoredEntityIndex[],
   storedFields: readonly StoredEntityIndexField[],
): EntityIndexSyncChanges {
   const fieldsByIndexId = new Map<string, StoredEntityIndexField[]>();
   for (const f of storedFields) {
      const k = NormalizeUUID(f.EntityIndexID);
      const list = fieldsByIndexId.get(k);
      if (list) {
         list.push(f);
      } else {
         fieldsByIndexId.set(k, [f]);
      }
   }

   const changes: EntityIndexSyncChanges = { Inserts: [], Updates: [], Deletes: [] };
   const storedByName = new Map<string, StoredEntityIndex>();
   const proposedBySignature = new Map<string, StoredEntityIndex>();
   const matchedStoredIds = new Set<string>();

   for (const s of storedIndexes) {
      const nameKey = entityIndexKey(s.EntityID, s.Name);
      if (storedByName.has(nameKey)) {
         if (s.Status === 'Active') {
            changes.Deletes.push(s);
         }
         continue;
      }
      storedByName.set(nameKey, s);
      if (s.Status === 'Proposed') {
         const sig = ComputeIndexSignature(
            s.EntityID,
            s.IndexType,
            s.IsUnique,
            s.FilterDefinition,
            fieldsByIndexId.get(NormalizeUUID(s.ID)) ?? [],
         );
         if (!proposedBySignature.has(sig)) {
            proposedBySignature.set(sig, s);
         }
      }
   }

   for (const d of desired) {
      const match = findStoredMatch(d, storedByName, proposedBySignature, matchedStoredIds);
      if (!match) {
         changes.Inserts.push(d);
         continue;
      }

      matchedStoredIds.add(NormalizeUUID(match.ID));
      const promoted = match.Status === 'Proposed';
      const effectiveSource: EntityIndexSource =
         d.Source === 'CodeGen'
            ? 'CodeGen'
            : (promoted && match.Source === 'DBAutoDoc' ? 'DBAutoDoc' : d.Source);
      const effectiveDesired: DesiredEntityIndex = {
         ...d,
         EntityID: match.EntityID,
         Source: effectiveSource,
         Status: 'Active',
      };
      const existingFields = fieldsByIndexId.get(NormalizeUUID(match.ID)) ?? [];
      const hdrChanged = !headerEqual(effectiveDesired, match);
      const fldChanged = !fieldsEqual(effectiveDesired.Fields, existingFields);

      if (hdrChanged || fldChanged) {
         changes.Updates.push({
            ID: match.ID,
            Desired: effectiveDesired,
            HeaderChanged: hdrChanged,
            FieldsChanged: fldChanged,
            PromotedFromProposed: promoted,
         });
      }
   }

   // Delete ONLY Active rows that no longer exist in the database; preserve Proposed and Rejected.
   for (const s of storedIndexes) {
      if (s.Status === 'Active' && !matchedStoredIds.has(NormalizeUUID(s.ID)) && !changes.Deletes.includes(s)) {
         changes.Deletes.push(s);
      }
   }

   return changes;
}

function findStoredMatch(
   desired: DesiredEntityIndex,
   storedByName: Map<string, StoredEntityIndex>,
   proposedBySignature: Map<string, StoredEntityIndex>,
   matchedStoredIds: Set<string>,
): StoredEntityIndex | null {
   const byName = storedByName.get(entityIndexKey(desired.EntityID, desired.Name));
   if (byName && !matchedStoredIds.has(NormalizeUUID(byName.ID))) {
      return byName;
   }
   const sig = ComputeIndexSignature(
      desired.EntityID,
      desired.IndexType,
      desired.IsUnique,
      desired.FilterDefinition,
      desired.Fields,
   );
   const bySig = proposedBySignature.get(sig);
   if (bySig && !matchedStoredIds.has(NormalizeUUID(bySig.ID))) {
      return bySig;
   }
   return null;
}

function stringLiteral(dialect: SQLDialect, value: string | null): string {
   return value === null ? 'NULL' : `${dialect.StringLiteralPrefix(value)}${dialect.QuoteStringLiteral(value)}`;
}

function buildFieldInsertSQL(
   dialect: SQLDialect,
   fieldTable: string,
   indexID: string,
   field: DesiredEntityIndexField,
   newId: () => string,
): string {
   const q = (name: string) => dialect.QuoteIdentifier(name);
   return (
      `INSERT INTO ${fieldTable} ` +
      `(${q('ID')}, ${q('EntityIndexID')}, ${q('EntityFieldID')}, ${q('Expression')}, ${q('Sequence')}, ${q('Role')}, ${q('SortDirection')}) ` +
      `VALUES (${dialect.QuoteStringLiteral(newId())}, ${dialect.QuoteStringLiteral(indexID)}, ` +
      `${field.EntityFieldID === null ? 'NULL' : dialect.QuoteStringLiteral(field.EntityFieldID)}, ` +
      `${stringLiteral(dialect, field.Expression)}, ${field.Sequence}, ` +
      `${dialect.QuoteStringLiteral(field.Role)}, ${dialect.QuoteStringLiteral(field.SortDirection)})`
   );
}

/**
 * Emits dialect-aware SQL statements to apply {@link EntityIndexSyncChanges} in safe order:
 * deletes first (cascading to `EntityIndexField`), then updates, then inserts.
 */
export function BuildEntityIndexSyncSQL(
   dialect: SQLDialect,
   mjCoreSchema: string,
   changes: EntityIndexSyncChanges,
   newId: () => string,
): string[] {
   const q = (name: string) => dialect.QuoteIdentifier(name);
   const indexTable = dialect.QuoteSchema(mjCoreSchema, 'EntityIndex');
   const fieldTable = dialect.QuoteSchema(mjCoreSchema, 'EntityIndexField');
   const statements: string[] = [];

   for (const d of changes.Deletes) {
      statements.push(`DELETE FROM ${indexTable} WHERE ${q('ID')} = ${dialect.QuoteStringLiteral(d.ID)}`);
   }

   for (const u of changes.Updates) {
      const idx = u.Desired;
      if (u.HeaderChanged) {
         statements.push(
            `UPDATE ${indexTable} SET ` +
            `${q('Name')} = ${stringLiteral(dialect, idx.Name)}, ` +
            `${q('IndexType')} = ${dialect.QuoteStringLiteral(idx.IndexType)}, ` +
            `${q('NativeType')} = ${stringLiteral(dialect, idx.NativeType)}, ` +
            `${q('IsUnique')} = ${dialect.BooleanLiteral(idx.IsUnique)}, ` +
            `${q('IsPrimaryKey')} = ${dialect.BooleanLiteral(idx.IsPrimaryKey)}, ` +
            `${q('IsClustered')} = ${dialect.BooleanLiteral(idx.IsClustered)}, ` +
            `${q('FilterDefinition')} = ${stringLiteral(dialect, idx.FilterDefinition)}, ` +
            `${q('HasExpressions')} = ${dialect.BooleanLiteral(idx.HasExpressions)}, ` +
            `${q('Source')} = ${dialect.QuoteStringLiteral(idx.Source)}, ` +
            `${q('Status')} = ${dialect.QuoteStringLiteral(idx.Status)} ` +
            `WHERE ${q('ID')} = ${dialect.QuoteStringLiteral(u.ID)}`,
         );
      }
      if (u.FieldsChanged) {
         statements.push(`DELETE FROM ${fieldTable} WHERE ${q('EntityIndexID')} = ${dialect.QuoteStringLiteral(u.ID)}`);
         for (const f of idx.Fields) {
            statements.push(buildFieldInsertSQL(dialect, fieldTable, u.ID, f, newId));
         }
      }
   }

   for (const ins of changes.Inserts) {
      const indexID = newId();
      statements.push(
         `INSERT INTO ${indexTable} ` +
         `(${q('ID')}, ${q('EntityID')}, ${q('Name')}, ${q('IndexType')}, ${q('NativeType')}, ` +
         `${q('IsUnique')}, ${q('IsPrimaryKey')}, ${q('IsClustered')}, ${q('FilterDefinition')}, ` +
         `${q('HasExpressions')}, ${q('Source')}, ${q('Status')}) ` +
         `VALUES (${dialect.QuoteStringLiteral(indexID)}, ${dialect.QuoteStringLiteral(ins.EntityID)}, ` +
         `${stringLiteral(dialect, ins.Name)}, ${dialect.QuoteStringLiteral(ins.IndexType)}, ` +
         `${stringLiteral(dialect, ins.NativeType)}, ${dialect.BooleanLiteral(ins.IsUnique)}, ` +
         `${dialect.BooleanLiteral(ins.IsPrimaryKey)}, ${dialect.BooleanLiteral(ins.IsClustered)}, ` +
         `${stringLiteral(dialect, ins.FilterDefinition)}, ${dialect.BooleanLiteral(ins.HasExpressions)}, ` +
         `${dialect.QuoteStringLiteral(ins.Source)}, ${dialect.QuoteStringLiteral(ins.Status)})`,
      );
      for (const f of ins.Fields) {
         statements.push(buildFieldInsertSQL(dialect, fieldTable, indexID, f, newId));
      }
   }

   return statements;
}
