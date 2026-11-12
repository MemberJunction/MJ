/**
 * Pure helpers for the organic-key config pass (#3815): resolve entities from one read, drop
 * duplicate related-entity entries, and tell whether a stored row already matches the file, so a
 * steady-state run issues a fixed number of reads and no writes.
 */
import { ConfigEntityRef, NormalizeKey } from './config-retraction';

/**
 * Entities indexed for config resolution: by SchemaName + BaseTable, else by entity Name. Same
 * precedence as {@link ResolveConfigEntity} with the name fallback, but each lookup is a map hit.
 */
export class ConfigEntityIndex {
   private readonly byTable = new Map<string, ConfigEntityRef>();
   private readonly byName = new Map<string, ConfigEntityRef>();

   constructor(entities: readonly ConfigEntityRef[]) {
      // First row wins on a collision, matching `Array.find` in ResolveConfigEntity.
      for (const entity of entities) {
         const tableKey = `${NormalizeKey(entity.SchemaName)}.${NormalizeKey(entity.BaseTable)}`;
         if (!this.byTable.has(tableKey)) {
            this.byTable.set(tableKey, entity);
         }
         const nameKey = NormalizeKey(entity.Name);
         if (!this.byName.has(nameKey)) {
            this.byName.set(nameKey, entity);
         }
      }
   }

   /** The entity a config entry names: by schema + table, else by entity name; null when neither matches. */
   public Resolve(schemaName: string, tableName: string): ConfigEntityRef | null {
      const table = NormalizeKey(tableName);
      return this.byTable.get(`${NormalizeKey(schemaName)}.${table}`) ?? this.byName.get(table) ?? null;
   }
}

/** The map key of an EntityOrganicKey row: its owning entity and its name. */
export function OrganicKeyRowKey(entityID: string, keyName: string): string {
   return `${NormalizeKey(entityID)}|${NormalizeKey(keyName)}`;
}

/** The map key of an EntityOrganicKeyRelatedEntity row: its key (entity + name) and its related entity. */
export function OrganicKeyRelatedRowKey(entityID: string, keyName: string, relatedEntityID: string): string {
   return `${OrganicKeyRowKey(entityID, keyName)}|${NormalizeKey(relatedEntityID)}`;
}

/** The compared columns of an EntityOrganicKey row. `ID` is null for a row this run inserted. */
export interface OrganicKeyRowValues {
   ID: string | null;
   MatchFieldNames: string;
   NormalizationStrategy: string;
   CustomNormalizationExpression: string | null;
   Description: string | null;
   Sequence: number;
   Status: string;
   Source: string;
}

/** The compared columns of an EntityOrganicKeyRelatedEntity row. `ID` is null for a row this run inserted. */
export interface OrganicKeyRelatedRowValues {
   ID: string | null;
   RelatedEntityFieldNames: string | null;
   TransitiveObjectName: string | null;
   TransitiveObjectMatchFieldNames: string | null;
   TransitiveObjectOutputFieldName: string | null;
   RelatedEntityJoinFieldName: string | null;
   DisplayName: string | null;
   DisplayLocation: string;
   Sequence: number;
}

/**
 * What the pass writes for a key. `CustomNormalizationExpression` and `Description` are undefined
 * when the file leaves them out: the UPDATE does not touch those columns then, so they don't count.
 */
export type DesiredOrganicKey = Omit<OrganicKeyRowValues, 'ID' | 'CustomNormalizationExpression' | 'Description'> & {
   CustomNormalizationExpression: string | undefined;
   Description: string | undefined;
};

/** True when the stored key differs from what the file declares in any column the UPDATE sets. */
export function OrganicKeyNeedsUpdate(existing: OrganicKeyRowValues, desired: DesiredOrganicKey): boolean {
   return (
      existing.MatchFieldNames !== desired.MatchFieldNames ||
      existing.NormalizationStrategy !== desired.NormalizationStrategy ||
      (desired.CustomNormalizationExpression !== undefined && existing.CustomNormalizationExpression !== desired.CustomNormalizationExpression) ||
      (desired.Description !== undefined && existing.Description !== desired.Description) ||
      existing.Sequence !== desired.Sequence ||
      existing.Status !== desired.Status ||
      existing.Source !== desired.Source
   );
}

/** True when the stored related-entity row differs from what the file declares in any column the UPDATE sets. */
export function OrganicKeyRelatedRowNeedsUpdate(existing: OrganicKeyRelatedRowValues, desired: Omit<OrganicKeyRelatedRowValues, 'ID'>): boolean {
   return (
      existing.RelatedEntityFieldNames !== desired.RelatedEntityFieldNames ||
      existing.TransitiveObjectName !== desired.TransitiveObjectName ||
      existing.TransitiveObjectMatchFieldNames !== desired.TransitiveObjectMatchFieldNames ||
      existing.TransitiveObjectOutputFieldName !== desired.TransitiveObjectOutputFieldName ||
      existing.RelatedEntityJoinFieldName !== desired.RelatedEntityJoinFieldName ||
      existing.DisplayName !== desired.DisplayName ||
      existing.DisplayLocation !== desired.DisplayLocation ||
      existing.Sequence !== desired.Sequence
   );
}

/**
 * Drops duplicate related-entity entries (same SchemaName + TableName, compared the way SQL Server's
 * default collation does) and keeps the LAST one, in its position: before this, each duplicate
 * overwrote the stored row in turn, so the last one is what an existing install already holds.
 * Returns the kept entries and the dropped ones.
 */
export function DedupeRelatedEntities<T extends { SchemaName: string; TableName: string }>(entries: readonly T[]): { Kept: T[]; Dropped: T[] } {
   const lastIndex = new Map<string, number>();
   entries.forEach((entry, index) => lastIndex.set(`${NormalizeKey(entry.SchemaName)}.${NormalizeKey(entry.TableName)}`, index));
   const kept: T[] = [];
   const dropped: T[] = [];
   entries.forEach((entry, index) => {
      if (lastIndex.get(`${NormalizeKey(entry.SchemaName)}.${NormalizeKey(entry.TableName)}`) === index) {
         kept.push(entry);
      } else {
         dropped.push(entry);
      }
   });
   return { Kept: kept, Dropped: dropped };
}
