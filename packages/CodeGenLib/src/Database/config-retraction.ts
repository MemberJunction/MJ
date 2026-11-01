/**
 * Planning for the retraction of what CodeGen wrote from `additionalSchemaInfo` once the file stops
 * declaring it (#4535): soft foreign keys, value lists, and organic keys with their related entities
 * and bridge views.
 *
 * Every function here is pure. `ManageMetadataBase` loads the database state, calls these to decide
 * what to remove, then reports the plan (by default) or applies it (`retractRemovedSoftKeys`).
 *
 * Two rules bound every plan:
 * - Only entities whose table the file still lists are considered, so a truncated or partial file
 *   cannot wipe a schema.
 * - Only rows CodeGen wrote from the file are removed. Value lists and organic keys carry that in
 *   their `Source` column (`Config`); soft foreign keys carry it in `IsSoftForeignKey`.
 */

/** Where an EntityFieldValue row came from. Mirrors the CHECK constraint on `EntityFieldValue.Source`. */
export type EntityFieldValueSource = 'Check' | 'Config' | 'Manual';

/** Where an EntityOrganicKey row came from. Mirrors the CHECK constraint on `EntityOrganicKey.Source`. */
export type EntityOrganicKeySource = 'Config' | 'Manual';

/** An entity, as far as matching a config entry to it needs. */
export interface ConfigEntityRef {
   ID: string;
   Name: string;
   SchemaName: string;
   BaseTable: string;
}

/** Lower-cased and trimmed, for comparing names and IDs the way SQL Server's default collation does. */
export function NormalizeKey(value: string | null | undefined): string {
   return (value ?? '').trim().toLowerCase();
}

/** The key a field is matched on: its entity's ID and its name. */
export function FieldKey(entityID: string, fieldName: string): string {
   return `${NormalizeKey(entityID)}|${NormalizeKey(fieldName)}`;
}

/**
 * Resolves a config entry to an entity: by SchemaName + BaseTable, else (when `allowNameFallback`) by
 * entity Name. The soft key and value-list passes match on the table only; the organic-key pass also
 * accepts an entity name, so retraction resolves each kind the way its writer did.
 */
export function ResolveConfigEntity(
   entities: readonly ConfigEntityRef[],
   schemaName: string,
   tableName: string,
   allowNameFallback: boolean,
): ConfigEntityRef | null {
   const schema = NormalizeKey(schemaName);
   const table = NormalizeKey(tableName);
   const byTable = entities.find(e => NormalizeKey(e.SchemaName) === schema && NormalizeKey(e.BaseTable) === table);
   if (byTable) {
      return byTable;
   }
   return allowNameFallback ? entities.find(e => NormalizeKey(e.Name) === table) ?? null : null;
}

/** An existing EntityFieldValue row, as far as deciding who owns the list needs. */
export interface ExistingFieldValue {
   Value: string;
   Source: string;
}

/**
 * What the config value-list pass does with one declared field.
 * - `Sync`: the list is empty or the file already owns it; make it match the file.
 * - `Adopt`: rows of unknown origin hold exactly the declared values; stamp them `Config`, then sync.
 * - `SkipCheck`: a CHECK constraint owns the list.
 * - `SkipManual`: rows not written from the file hold a different list; leave them.
 */
export type ConfigValueListAction = 'Sync' | 'Adopt' | 'SkipCheck' | 'SkipManual';

/**
 * Decides whether the config file may write a field's value list. A CHECK constraint always wins.
 * Rows of another origin are adopted only when they hold exactly the values the file declares, which
 * is what a list CodeGen wrote from the file before `Source` existed looks like.
 */
export function DecideConfigValueListAction(existing: readonly ExistingFieldValue[], configValues: readonly string[]): ConfigValueListAction {
   if (existing.some(r => NormalizeKey(r.Source) === 'check')) {
      return 'SkipCheck';
   }
   if (existing.every(r => NormalizeKey(r.Source) === 'config')) {
      return 'Sync';
   }
   const have = new Set(existing.map(r => r.Value));
   const want = new Set(configValues);
   const same = have.size === want.size && [...want].every(v => have.has(v));
   return same ? 'Adopt' : 'SkipManual';
}

/**
 * The items on listed entities that the file no longer declares. Used for soft foreign keys and for
 * value lists: the caller passes only rows CodeGen wrote from the file.
 * @param declaredFields keys built with {@link FieldKey}
 */
export function SelectUndeclaredFields<T extends { EntityID: string; FieldName: string }>(
   items: readonly T[],
   listedEntityIDs: ReadonlySet<string>,
   declaredFields: ReadonlySet<string>,
): T[] {
   return items.filter(i =>
      listedEntityIDs.has(NormalizeKey(i.EntityID)) &&
      !declaredFields.has(FieldKey(i.EntityID, i.FieldName)));
}

/** One organic key joined to one of its related-entity rows (or to none: the Related* fields are null). */
export interface OrganicKeyStateRow {
   KeyID: string;
   KeyName: string;
   KeySource: string;
   EntityID: string;
   EntityName: string;
   SchemaName: string;
   BaseTable: string;
   RelatedRowID: string | null;
   RelatedEntityID: string | null;
   RelatedEntityName: string | null;
   RelatedSchemaName: string | null;
   RelatedBaseTable: string | null;
   TransitiveObjectName: string | null;
}

/** An organic key the file declares, resolved to entity IDs. */
export interface DeclaredOrganicKey {
   EntityID: string;
   Name: string;
   /**
    * The related entities the file declares for the key. Null when one of them did not resolve to an
    * entity: the key was not applied this run, so its related rows are left alone.
    */
   RelatedEntityIDs: ReadonlySet<string> | null;
}

export interface OrganicKeyRetractionInput {
   /** Organic key state before this run's config pass wrote anything. */
   Before: readonly OrganicKeyStateRow[];
   /** Organic key state after the config pass. */
   After: readonly OrganicKeyStateRow[];
   /** Normalized IDs of the entities whose table the file lists. */
   ListedEntityIDs: ReadonlySet<string>;
   Declared: readonly DeclaredOrganicKey[];
   /** Bridge objects the file still declares, normalized with {@link NormalizeObjectName}. */
   DeclaredTransitiveObjects: ReadonlySet<string>;
}

export interface OrganicKeyRetractionPlan {
   /** One row per key to remove, with all of its related rows. */
   Keys: OrganicKeyStateRow[];
   /** Related rows to remove from keys the file still declares. */
   RelatedRows: OrganicKeyStateRow[];
   /** Bridge objects (as recorded in TransitiveObjectName) nothing references once the plan is applied. */
   BridgeObjects: string[];
}

/** A schema-qualified object name with brackets and quotes removed, lower-cased. */
export function NormalizeObjectName(name: string): string {
   return NormalizeKey(name.replace(/[[\]"`]/g, ''));
}

/** Splits `schema.object` (optionally bracketed or quoted). Null when there is no schema part. */
export function ParseObjectName(name: string): { SchemaName: string; ObjectName: string } | null {
   const cleaned = name.replace(/[[\]"`]/g, '').trim();
   const dot = cleaned.lastIndexOf('.');
   if (dot <= 0 || dot === cleaned.length - 1) {
      return null;
   }
   return { SchemaName: cleaned.slice(0, dot), ObjectName: cleaned.slice(dot + 1) };
}

/**
 * Plans the organic-key retraction:
 * - a `Config` key on a listed entity that the file no longer names is removed with its related rows
 *   (this covers renamed keys: the old name is no longer declared);
 * - a related row of a declared `Config` key whose related entity the file no longer lists is removed;
 * - a bridge object that a `Config` key referenced before or after this run, that no remaining row
 *   references and that the file no longer declares, is returned for dropping. A related row whose
 *   shape changed from transitive to direct is updated in place by the config pass, so its old bridge
 *   view shows up here through `Before`.
 */
export function PlanOrganicKeyRetraction(input: OrganicKeyRetractionInput): OrganicKeyRetractionPlan {
   const declaredByKey = new Map<string, DeclaredOrganicKey>();
   for (const d of input.Declared) {
      declaredByKey.set(`${NormalizeKey(d.EntityID)}|${NormalizeKey(d.Name)}`, d);
   }

   const afterByKey = new Map<string, OrganicKeyStateRow[]>();
   for (const row of input.After) {
      const id = NormalizeKey(row.KeyID);
      const rows = afterByKey.get(id) ?? [];
      rows.push(row);
      afterByKey.set(id, rows);
   }

   const keys: OrganicKeyStateRow[] = [];
   const relatedRows: OrganicKeyStateRow[] = [];
   const removedRowIDs = new Set<string>();
   const configKeyIDs = new Set<string>();

   for (const [keyID, rows] of afterByKey) {
      const first = rows[0];
      if (NormalizeKey(first.KeySource) !== 'config') {
         continue;
      }
      configKeyIDs.add(keyID);
      if (!input.ListedEntityIDs.has(NormalizeKey(first.EntityID))) {
         continue;
      }
      const declared = declaredByKey.get(`${NormalizeKey(first.EntityID)}|${NormalizeKey(first.KeyName)}`);
      if (!declared) {
         keys.push(first);
         for (const r of rows) {
            if (r.RelatedRowID) {
               removedRowIDs.add(NormalizeKey(r.RelatedRowID));
            }
         }
         continue;
      }
      if (!declared.RelatedEntityIDs) {
         continue;
      }
      const wanted = new Set([...declared.RelatedEntityIDs].map(NormalizeKey));
      for (const r of rows) {
         if (r.RelatedRowID && r.RelatedEntityID && !wanted.has(NormalizeKey(r.RelatedEntityID))) {
            relatedRows.push(r);
            removedRowIDs.add(NormalizeKey(r.RelatedRowID));
         }
      }
   }

   const stillReferenced = new Set<string>();
   for (const r of input.After) {
      if (r.RelatedRowID && r.TransitiveObjectName && !removedRowIDs.has(NormalizeKey(r.RelatedRowID))) {
         stillReferenced.add(NormalizeObjectName(r.TransitiveObjectName));
      }
   }

   const bridgeObjects = new Map<string, string>();
   for (const r of [...input.Before, ...input.After]) {
      if (!r.TransitiveObjectName || !configKeyIDs.has(NormalizeKey(r.KeyID))) {
         continue;
      }
      const normalized = NormalizeObjectName(r.TransitiveObjectName);
      if (stillReferenced.has(normalized) || input.DeclaredTransitiveObjects.has(normalized) || bridgeObjects.has(normalized)) {
         continue;
      }
      bridgeObjects.set(normalized, r.TransitiveObjectName);
   }

   return { Keys: keys, RelatedRows: relatedRows, BridgeObjects: [...bridgeObjects.values()] };
}
