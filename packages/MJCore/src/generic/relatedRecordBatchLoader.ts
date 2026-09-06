/**
 * @fileoverview Batched child-collection loading for result sets.
 *
 * Populates a named {@link RelatedRecordCollection} across every row of a `RunView` result using **one**
 * query per collection, rather than one per row.
 *
 * ## The N+1 this exists to prevent
 *
 * The intuitive way to make children load automatically is to do it in `BaseEntity.LoadFromData()`.
 * That method is also how every row of `RunView(ResultType:'entity_object')` is materialised, so the
 * intuitive implementation silently multiplies a single view into one child query per row. This is
 * not theoretical: `JournalEntryEntityServer.LoadFromData()` overrides the method to call
 * `LoadLines()`, so listing 500 journal entries issues 500 line queries — plus another 500 for line
 * dimensions.
 *
 * Companion eager loading is therefore excluded from `LoadFromData()` by design, and set-oriented
 * loading goes through here: gather every parent key, issue one `WHERE fk IN (...)`, bucket the rows
 * by parent, and hand each parent its own slice.
 *
 * @module @memberjunction/core
 */

import { EscapeSQLString } from '@memberjunction/global';
import type { BaseEntity } from './baseEntity';
import { RelatedRecordCollection } from './relatedRecordCollection';
import type { IRunViewProvider } from './interfaces';
import type { UserInfo } from './securityInfo';
import { LogError } from './logging';

/**
 * Populates the named child collections across a set of already-materialised parent entities.
 *
 * Unknown collection names are logged and skipped rather than thrown, so a caller asking for a
 * collection that a particular subclass does not declare degrades to "no children loaded" instead of
 * failing the whole view.
 *
 * @param parents - The entity objects returned by the view. Entities that do not declare a named
 *                  collection are left untouched.
 * @param collectionNames - The companion names to populate.
 * @param provider - The provider used to issue the batched queries.
 * @param contextUser - The acting user, required server-side.
 */
export async function LoadRelatedRecordsBatched(
    parents: BaseEntity[],
    collectionNames: string[],
    provider: IRunViewProvider,
    contextUser?: UserInfo,
): Promise<void> {
    if (!parents?.length || !collectionNames?.length) {
        return;
    }

    for (const name of collectionNames) {
        await loadOneCollectionBatched(parents, name, provider, contextUser);
    }
}

/**
 * Populates a single named collection across all parents with one query.
 *
 * @param parents - The parent entities.
 * @param collectionName - The companion name to populate.
 * @param provider - The provider used to issue the query.
 * @param contextUser - The acting user.
 */
async function loadOneCollectionBatched(
    parents: BaseEntity[],
    collectionName: string,
    provider: IRunViewProvider,
    contextUser?: UserInfo,
): Promise<void> {
    // Use the first parent that actually declares the collection to read its configuration. Parents
    // in one result set are the same entity, but a mixed set (or a subclass that conditionally
    // declares) should not take the whole load down.
    const template = parents
        .map(p => p.GetCompanion<RelatedRecordCollection>(collectionName))
        .find((c): c is RelatedRecordCollection => c instanceof RelatedRecordCollection);

    if (!template) {
        LogError(
            `RunView.IncludeRelatedRecords: no RelatedRecordCollection named '${collectionName}' is declared on ` +
            `${parents[0]?.EntityInfo?.Name ?? 'the returned entity'}; skipping.`,
        );
        return;
    }

    const foreignKey = template.RelatedEntityJoinField;
    const parentKeys = collectParentKeys(parents);
    if (parentKeys.length === 0) {
        return;
    }

    const result = await provider.RunView<BaseEntity>(
        {
            EntityName: template.RelatedEntityName,
            ExtraFilter: `${foreignKey} IN (${parentKeys.map(k => `'${EscapeSQLString(k)}'`).join(',')})`,
            OrderBy: template.OrderByClause,
            ResultType: 'entity_object',
        },
        contextUser,
    );

    if (!result.Success) {
        // Loud: quietly handing back empty collections would make populated parents look childless,
        // and anything derived from that — a total, a reversal, a validation decision — is then
        // wrong in a way nothing downstream can detect.
        throw new Error(
            `RunView.IncludeRelatedRecords: failed to batch-load '${collectionName}' ` +
            `(${template.RelatedEntityName}): ${result.ErrorMessage ?? 'unknown error'}`,
        );
    }

    distributeChildren(parents, collectionName, foreignKey, result.Results ?? []);
}

/**
 * Buckets loaded children by their foreign key and hands each parent its own slice.
 *
 * Every parent that declares the collection is assigned a slice — including an empty one. Assigning
 * empty matters: it marks the collection as loaded, so a later `Items` read is known-empty rather
 * than not-yet-loaded.
 *
 * @param parents - The parent entities.
 * @param collectionName - The companion name being populated.
 * @param foreignKey - The child field pointing back at the parent.
 * @param children - All loaded children across every parent.
 */
function distributeChildren(
    parents: BaseEntity[],
    collectionName: string,
    foreignKey: string,
    children: BaseEntity[],
): void {
    const byParent = new Map<string, BaseEntity[]>();
    for (const child of children) {
        // Case-insensitive keying: MJ primary keys are UUIDs, and their casing is not guaranteed to
        // survive a round trip identically on every platform.
        const key = normalizeKey(child.Get(foreignKey));
        const bucket = byParent.get(key);
        if (bucket) {
            bucket.push(child);
        } else {
            byParent.set(key, [child]);
        }
    }

    for (const parent of parents) {
        const collection = parent.GetCompanion<RelatedRecordCollection>(collectionName);
        if (!(collection instanceof RelatedRecordCollection)) {
            continue;
        }
        const key = normalizeKey(parent.FirstPrimaryKey?.Value);
        collection.SetLoadedItems(byParent.get(key) ?? []);
    }
}

/**
 * Collects the distinct primary-key values of the parents, skipping unsaved ones.
 *
 * @param parents - The parent entities.
 * @returns Distinct key values as strings.
 */
function collectParentKeys(parents: BaseEntity[]): string[] {
    const keys = new Set<string>();
    for (const parent of parents) {
        const value = parent.FirstPrimaryKey?.Value;
        if (value !== null && value !== undefined && value !== '') {
            keys.add(String(value));
        }
    }
    return Array.from(keys);
}

/**
 * Normalises a key value for map lookups — string form, lower-cased, trimmed.
 *
 * @param value - The raw key value.
 * @returns The normalised key.
 */
function normalizeKey(value: unknown): string {
    return String(value ?? '').trim().toLowerCase();
}
