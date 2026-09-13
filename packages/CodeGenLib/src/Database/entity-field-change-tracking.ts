import { ordinalCompare } from '@memberjunction/global';

/** Columns the schema sync may rewrite. `Sequence` is deliberately absent: a renumber is not a change (FM3). */
export const TRACKED_FIELD_COLUMNS = [
   'Description',
   'Type',
   'Length',
   'Precision',
   'Scale',
   'AllowsNull',
   'DefaultValue',
   'AutoIncrement',
   'IsVirtual',
   'IsComputed',
   'RelatedEntityID',
   'RelatedEntityFieldName',
   'IsPrimaryKey',
   'IsUnique',
   'AllowUpdateAPI',
] as const;

export type FieldChangeReason = typeof TRACKED_FIELD_COLUMNS[number];

/** Reasons that re-open DisplayName (§3.4). */
export const DISPLAYNAME_REOPEN_REASONS: ReadonlySet<FieldChangeReason> = new Set(['Description']);

/** Reasons that re-open the type-derived columns (§3.4). */
export const TYPE_REOPEN_REASONS: ReadonlySet<FieldChangeReason> = new Set(['Type', 'Length', 'Precision', 'Scale', 'AllowsNull']);

export interface EntityFieldSnapshotRow {
   ID: string;
   EntityID: string;
   EntityName: string;
   Name: string;
   Description: string | null;
   Type: string;
   Length: number | null;
   Precision: number | null;
   Scale: number | null;
   AllowsNull: boolean;
   DefaultValue: string | null;
   AutoIncrement: boolean;
   IsVirtual: boolean;
   IsComputed: boolean;
   RelatedEntityID: string | null;
   RelatedEntityFieldName: string | null;
   IsPrimaryKey: boolean;
   IsUnique: boolean;
   AllowUpdateAPI: boolean;
}

export interface EntityFieldChange {
   entityID: string;
   entityName: string;
   fieldID: string;
   fieldName: string;
   reasons: FieldChangeReason[];
}

/**
 * Normalizes a field value according to column comparison semantics:
 * - Description, DefaultValue, RelatedEntityFieldName: trimmed strings, null ≡ ''
 * - RelatedEntityID: trimmed, lowercased, null ≡ ''
 * - Boolean/bit columns: coerced with Boolean()
 * - Numbers: number or null
 * - Strings: trimmed
 */
export function normalizeSnapshotValue(column: FieldChangeReason, value: unknown): unknown {
   if (column === 'Description' || column === 'DefaultValue' || column === 'RelatedEntityFieldName') {
      if (value === null || value === undefined) return '';
      return String(value).trim();
   }
   if (column === 'RelatedEntityID') {
      if (value === null || value === undefined) return '';
      return String(value).trim().toLowerCase();
   }
   if (
      column === 'AllowsNull' ||
      column === 'AutoIncrement' ||
      column === 'IsVirtual' ||
      column === 'IsComputed' ||
      column === 'IsPrimaryKey' ||
      column === 'IsUnique' ||
      column === 'AllowUpdateAPI'
   ) {
      if (value === null || value === undefined) return false;
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'string') {
         const s = value.trim().toLowerCase();
         return s === '1' || s === 'true';
      }
      return Boolean(value);
   }
   if (column === 'Length' || column === 'Precision' || column === 'Scale') {
      if (value === null || value === undefined || value === '') return null;
      const n = Number(value);
      return isNaN(n) ? null : n;
   }
   if (column === 'Type') {
      if (value === null || value === undefined) return '';
      return String(value).trim();
   }
   return value;
}

/**
 * Compares before and after snapshots of EntityField rows.
 * Rows keyed by ID. A row only in `after` is new this run and is not a change;
 * `isNew` excludes the INSERT sites' rows too.
 * A row only in `before` was deleted and is ignored.
 * Returns changes sorted by entityName then fieldName using ordinalCompare.
 */
export function diffEntityFieldSnapshots(
   before: ReadonlyMap<string, EntityFieldSnapshotRow>,
   after: ReadonlyMap<string, EntityFieldSnapshotRow>,
   isNew: (entityID: string, name: string) => boolean,
): EntityFieldChange[] {
   const changes: EntityFieldChange[] = [];

   for (const [id, afterRow] of after) {
      const beforeRow = before.get(id);
      if (!beforeRow) {
         // Present only in after -> newly inserted this run, not a modification
         continue;
      }

      if (isNew(afterRow.EntityID, afterRow.Name)) {
         // Explicitly registered as a new field this run
         continue;
      }

      const reasons: FieldChangeReason[] = [];
      for (const col of TRACKED_FIELD_COLUMNS) {
         const bVal = normalizeSnapshotValue(col, beforeRow[col]);
         const aVal = normalizeSnapshotValue(col, afterRow[col]);
         if (bVal !== aVal) {
            reasons.push(col);
         }
      }

      if (reasons.length > 0) {
         changes.push({
            entityID: afterRow.EntityID,
            entityName: afterRow.EntityName,
            fieldID: afterRow.ID,
            fieldName: afterRow.Name,
            reasons,
         });
      }
   }

   // Sort output by entityName, then fieldName, using ordinalCompare (C5)
   return changes.sort((a, b) => {
      const entityCmp = ordinalCompare(a.entityName, b.entityName);
      if (entityCmp !== 0) return entityCmp;
      return ordinalCompare(a.fieldName, b.fieldName);
   });
}
