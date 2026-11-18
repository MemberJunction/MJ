/**
 * A real `MJ: Feature Value Caches` row for tests, holding only the fields the processor reads from a cache hit: its
 * ID, the stored outputs, the reasoning and the prompt run that computed them.
 */
import { EntityInfo } from '@memberjunction/core';
import { MJFeatureValueCacheEntity } from '@memberjunction/core-entities';

/** The cache row fields a test sets; every field but the ID defaults to empty. */
export type CacheEntryFields = Pick<MJFeatureValueCacheEntity, 'ID'> &
    Partial<Pick<MJFeatureValueCacheEntity, 'OutputsJSON' | 'Reasoning' | 'AIPromptRunID'>>;

const FIELDS: Array<keyof CacheEntryFields> = ['ID', 'OutputsJSON', 'Reasoning', 'AIPromptRunID'];

const CACHE_ENTITY = new EntityInfo({
    ID: 'entity-feature-value-caches', Name: 'MJ: Feature Value Caches',
    Fields: FIELDS.map((field, index) => ({
        ID: `feature-value-caches-${field}`, EntityID: 'entity-feature-value-caches', Entity: 'MJ: Feature Value Caches', Sequence: index + 1,
        Name: field, Type: field === 'ID' ? 'uniqueidentifier' : 'nvarchar', IsPrimaryKey: field === 'ID', AllowsNull: field !== 'ID',
    })),
});

/** A cache row with the given fields (outputs '{}', no reasoning and no prompt run unless given). */
export function CacheEntry(fields: CacheEntryFields): MJFeatureValueCacheEntity {
    const entry = new MJFeatureValueCacheEntity(CACHE_ENTITY);
    entry.Hydrate({ OutputsJSON: '{}', Reasoning: null, AIPromptRunID: null, ...fields });
    return entry;
}
