/**
 * @file CloneKeys.ts
 * Primary-key handling for record cloning, for single-column and composite keys alike.
 *
 * A clone needs a new primary key for every row it creates. How that key is chosen depends on
 * the entity's key columns:
 *
 * - **mint**: a single UUID column (`uniqueidentifier`, or `uuid` on PostgreSQL) that is not itself
 *   a foreign key. The planner pre-mints a UUID so child rows can point at the copy before saving.
 * - **server**: a single auto-increment column. The database assigns it on insert; child rows
 *   reach it through their collection, which stamps the parent key at save time.
 * - **derived**: everything else, which is a composite key or a natural key. Each key column keeps
 *   the source row's value, except a column that is a foreign key to a row in the clone, which
 *   takes that row's new key. A junction row keyed by (UserID, RoleID) under a cloned user
 *   becomes (newUserID, RoleID). If no column changes, the copy would collide with its source,
 *   so the planner blocks that node. Two exceptions: a key column pointing at a cloned row whose
 *   key the database assigns counts as changed (it is left empty and filled at save), and a single
 *   UUID key that is also a foreign key (an IS-A subtype) whose parent is not in the clone gets a
 *   freshly minted UUID, because saving the subtype creates its parent row under that same ID.
 *
 * Record-id strings use the compact URL-segment form (`CompositeKey.ToCompactURLSegment`): the
 * bare value for a single-column key, `Field1|Value1||Field2|Value2` for a composite one.
 *
 * @see plans/record-cloning/README.md §3.5
 */

import { CompositeKey, EntityInfo, KeyValuePair } from '@memberjunction/core';
import type { CompositeKeyLike } from '@memberjunction/record-cloning-base';

/**
 * Builds a CompositeKey from pairs. Assigns `KeyValuePairs` directly because the constructor
 * drops every pair when the first value is empty (a column the database fills in at save).
 */
export function KeyFromPairs(pairs: KeyValuePair[]): CompositeKey {
    const key = new CompositeKey();
    key.KeyValuePairs = pairs;
    return key;
}

/** Whether a column holds UUIDs on any supported database (mirrors `EntityFieldInfo.IsUniqueIdentifier`). */
export function IsUuidColumn(field: { Type?: string } | undefined): boolean {
    const t = field?.Type?.trim().toLowerCase();
    return t === 'uniqueidentifier' || t === 'uuid';
}

/** How a clone gets its primary key. */
export type CloneKeyStrategy = 'mint' | 'server' | 'derived';

/** Chooses the key strategy for an entity from its primary key columns. */
export function KeyStrategyFor(entity: EntityInfo): CloneKeyStrategy {
    const keys = entity.PrimaryKeys ?? [];
    if (keys.length === 1) {
        // Read the column from Fields by name so partial key descriptors still carry type information.
        const pk = entity.Fields?.find((f) => f.Name.toLowerCase() === keys[0].Name.toLowerCase()) ?? keys[0];
        if (pk.AutoIncrement) return 'server';
        if (IsUuidColumn(pk) && !pk.RelatedEntityID) return 'mint';
    }
    return 'derived';
}

/** Builds a CompositeKey with every primary key column from any key shape the engine carries. */
export function ToCompositeKey(entity: EntityInfo, key: CompositeKeyLike | CompositeKey | string | null | undefined): CompositeKey {
    if (!key) return new CompositeKey();
    if (key instanceof CompositeKey) return key;
    if (typeof key === 'string') return CompositeKey.FromURLSegment(entity, key);
    return KeyFromPairs((key.KeyValuePairs ?? []).map((p) => new KeyValuePair(p.FieldName, p.Value)));
}

/** Record-id string for a key: the bare value for one column, the full segment for several. */
export function ToRecordKeyString(key: CompositeKeyLike | CompositeKey | string | null | undefined): string {
    if (!key) return '';
    if (typeof key === 'string') {
        if (!key.includes(CompositeKey.DefaultValueDelimiter)) return key;
        // 'ID|abc' or 'A|1||B|2': normalize to the compact form ('abc', or the full segment when composite).
        const parsed = new CompositeKey();
        parsed.SimpleLoadFromURLSegment(key);
        return parsed.KeyValuePairs.length > 0 ? parsed.ToCompactURLSegment() : key;
    }
    const ck = key instanceof CompositeKey ? key : KeyFromPairs((key.KeyValuePairs ?? []).map((p) => new KeyValuePair(p.FieldName, p.Value)));
    return ck.KeyValuePairs.length > 0 ? ck.ToCompactURLSegment() : '';
}

/**
 * The name of an entity's only primary key column. Foreign keys in MJ always reference a
 * single-column key, so code that joins a child to its parent or follows a forward FK can rely
 * on this; it throws with the entity name if the entity somehow has a composite key.
 */
export function SingleKeyField(entity: EntityInfo, purpose: string): string {
    const keys = entity.PrimaryKeys ?? [];
    if (keys.length !== 1) {
        throw new Error(`${purpose}: '${entity.Name}' has a ${keys.length}-column primary key; foreign keys can only reference a single-column key.`);
    }
    return keys[0].Name;
}

/** Result of deriving a clone's key from its source key. */
export interface DerivedKey {
    Key: CompositeKey;
    /** Whether at least one column differs from the source; false means the copy would collide. */
    Changed: boolean;
}

/**
 * Derives a clone's key: each column keeps the source value unless it is a foreign key to a row
 * in the clone, in which case it takes that row's new key from `keyMap` (entries of the form
 * `<Entity Name>::<source value>`, falling back to the bare source value). A column pointing at
 * a cloned row listed in `serverAssigned` (same entry form) is left null and counts as changed:
 * the collection writes the parent's database-assigned key into it at save time.
 */
export function DeriveTargetKey(
    entity: EntityInfo,
    sourceKey: CompositeKey,
    keyMap: Record<string, string>,
    serverAssigned: ReadonlySet<string> = new Set()
): DerivedKey {
    let changed = false;
    const pairs = sourceKey.KeyValuePairs.map((pair) => {
        const field = entity.Fields.find((f) => f.Name.toLowerCase() === pair.FieldName.toLowerCase());
        const sourceValue = pair.Value == null ? '' : String(pair.Value);
        if (field?.RelatedEntity && sourceValue && serverAssigned.has(`${field.RelatedEntity}::${sourceValue}`)) {
            changed = true;
            return new KeyValuePair(pair.FieldName, null);
        }
        if (field?.RelatedEntity && sourceValue) {
            const mapped = keyMap[`${field.RelatedEntity}::${sourceValue}`] ?? keyMap[sourceValue];
            if (mapped !== undefined && mapped !== sourceValue) {
                changed = true;
                return new KeyValuePair(pair.FieldName, mapped);
            }
        }
        return new KeyValuePair(pair.FieldName, pair.Value);
    });
    return { Key: KeyFromPairs(pairs), Changed: changed };
}
