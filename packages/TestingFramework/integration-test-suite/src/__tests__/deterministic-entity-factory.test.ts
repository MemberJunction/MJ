/**
 * DeterministicEntityFactory sets SkipAIEnrichment on the server subclasses, and refuses (throws)
 * when a DATABASE provider hands back anything else — that would be a save with a live model call.
 * A remote provider may hand back the client class; its saves are covered by the MJAPI host switch.
 */
import { describe, it, expect } from 'vitest';
import { ProviderType } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJQueryEntityServer, MJQuerySQLEntityServer, MJTemplateContentEntityServer } from '@memberjunction/core-entities-server';
import { DeterministicEntityFactory } from '../checks/deterministic-entity-factory';

const USER = { ID: 'user-1' } as UserInfo;

/** A provider whose GetEntityObject hands back `entity` (the class decides which subclass resolved). */
function providerReturning(entity: object, providerType: ProviderType): IMetadataProvider {
    const provider: Pick<IMetadataProvider, 'ProviderType' | 'GetEntityObject'> = {
        ProviderType: providerType,
        GetEntityObject: async <T>(): Promise<T> => entity as T,
    };
    return provider as IMetadataProvider;
}

describe('DeterministicEntityFactory', () => {
    it.each([
        ['NewQuery', MJQueryEntityServer],
        ['NewQuerySQL', MJQuerySQLEntityServer],
        ['NewTemplateContent', MJTemplateContentEntityServer],
    ] as const)('%s sets SkipAIEnrichment on the server subclass', async (method, cls) => {
        const entity: { SkipAIEnrichment?: boolean } = Object.create(cls.prototype);
        await DeterministicEntityFactory[method](providerReturning(entity, ProviderType.Database), USER);
        expect(entity.SkipAIEnrichment).toBe(true);
    });

    it.each(['NewQuery', 'NewQuerySQL', 'NewTemplateContent'] as const)('%s throws when a database provider resolves anything but the server subclass', async (method) => {
        await expect(DeterministicEntityFactory[method](providerReturning({}, ProviderType.Database), USER)).rejects.toThrow(/did not resolve to its server subclass/);
    });

    it('a remote provider may return the client class; nothing is set and nothing throws', async () => {
        const plain: { SkipAIEnrichment?: boolean } = {};
        await DeterministicEntityFactory.NewQuery(providerReturning(plain, ProviderType.Network), USER);
        expect(plain.SkipAIEnrichment).toBeUndefined();
    });
});
