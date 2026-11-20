// ResolverBase transitively pulls in type-graphql decorators, which need the
// Reflect.metadata polyfill at import time.
import 'reflect-metadata';
import { afterEach, describe, expect, it } from 'vitest';
import {
    ClearAllDataHooks,
    IMetadataProvider,
    PostRunViewHook,
    RegisterDataHook,
    RegisterPostRunViewProtectedEntity,
    RunViewParams,
    RunViewResult,
    UserInfo,
} from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';

const ENTITY_NAME = 'Hooked Things';

/** Exposes the protected single-record mapper the generated get-by-ID resolvers call. */
class MappingProbe extends ResolverBase {
    public MapOne(entityName: string, dataObject: unknown, provider: IMetadataProvider, user: UserInfo): Promise<unknown> {
        return this.MapFieldNamesToCodeNames(entityName, dataObject, user, provider);
    }
}

function fakeProvider(): IMetadataProvider {
    return {
        EntityByName: (name: string) =>
            name === ENTITY_NAME
                ? { Name: ENTITY_NAME, Fields: [{ Name: 'ID', CodeName: 'ID' }, { Name: 'Name', CodeName: 'Name' }], EncryptedFields: [] }
                : undefined,
    } as unknown as IMetadataProvider;
}

/** A read hook that removes the row with ID 'hidden' from reads of the hooked entity. */
const hideRow: PostRunViewHook = async (params: RunViewParams, results: RunViewResult): Promise<RunViewResult> => {
    if (params.EntityName !== ENTITY_NAME) {
        return results;
    }
    const kept = (results.Results as Array<{ ID: string }>).filter((r) => r.ID !== 'hidden');
    return { ...results, Results: kept, RowCount: kept.length, TotalRowCount: kept.length };
};

describe('MapFieldNamesToCodeNames on an entity guarded by read hooks', () => {
    afterEach(() => {
        ClearAllDataHooks();
    });

    it('returns null for a record the read hooks remove, as for a record that does not exist', async () => {
        RegisterDataHook('PostRunView', hideRow);
        RegisterPostRunViewProtectedEntity(ENTITY_NAME);
        const viewer = new UserInfo(null, { ID: '11111111-1111-4111-8111-111111111111', Email: 'v@example.com', Name: 'Viewer', IsActive: true });

        const mapped = await new MappingProbe().MapOne(ENTITY_NAME, { ID: 'hidden', Name: 'marker' }, fakeProvider(), viewer);

        expect(mapped).toBeNull();
    });
});
