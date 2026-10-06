/**
 * Unit tests for SyncDependencies: the rows it creates for a query's composition references.
 */
import { describe, it, expect, vi } from 'vitest';
import type { BaseEntity, IMetadataProvider, IRunViewProvider, UserInfo } from '@memberjunction/core';
import type { MJQueryDependencyEntity, MJQueryEntityExtended } from '@memberjunction/core-entities';
import { SyncDependencies } from '../custom/query-extraction/sync';
import type { ResolvedCompositionReference } from '../custom/query-extraction/types';

type DependencyStubShape = Pick<
    MJQueryDependencyEntity,
    'QueryID' | 'DependsOnQueryID' | 'ReferencePath' | 'Alias' | 'ParameterMapping' | 'DetectionMethod' | 'Save'
>;

/** Records every dependency row SyncDependencies creates and saves. */
function stubMetadataProvider(saved: DependencyStubShape[]): IMetadataProvider {
    const makeDependency = (): DependencyStubShape => {
        const row: DependencyStubShape = {
            QueryID: '', DependsOnQueryID: '', ReferencePath: '', Alias: null, ParameterMapping: null, DetectionMethod: 'Auto',
            Save: vi.fn(async () => { saved.push(row); return true; })
        };
        return row;
    };
    const shape: Pick<IMetadataProvider, 'GetEntityObject'> = {
        GetEntityObject: <T extends BaseEntity>() => Promise.resolve(makeDependency() as MJQueryDependencyEntity as BaseEntity as T)
    };
    return shape as IMetadataProvider;
}

function stubQuery(id: string): MJQueryEntityExtended {
    const shape: Pick<MJQueryEntityExtended, 'ID' | 'Name'> = { ID: id, Name: `Query ${id}` };
    return shape as MJQueryEntityExtended;
}

function reference(depQuery: MJQueryEntityExtended, path: string, alias: string): ResolvedCompositionReference {
    return { DepQuery: depQuery, ReferencePath: path, Alias: alias, ParameterMapping: null, PassthroughMappings: [] };
}

const USER = {} as UserInfo;
const RUN_VIEW = {} as IRunViewProvider;

describe('SyncDependencies', () => {
    it('saves one dependency row when the same dependency is referenced twice', async () => {
        const saved: DependencyStubShape[] = [];
        const base = stubQuery('dep-1');
        const refs = [reference(base, 'Reports/Base', 'a'), reference(base, 'Reports/Base', 'b')];

        await SyncDependencies('query-1', refs, USER, stubMetadataProvider(saved), RUN_VIEW, false);

        expect(saved.map(d => [d.DependsOnQueryID, d.ReferencePath])).toEqual([['dep-1', 'Reports/Base']]);
    });

    it('saves one row per distinct dependency', async () => {
        const saved: DependencyStubShape[] = [];
        const refs = [
            reference(stubQuery('dep-1'), 'Reports/Base', 'a'),
            reference(stubQuery('dep-2'), 'Reports/Other', 'b'),
            reference(stubQuery('dep-1'), 'Reports/Base', 'c')
        ];

        await SyncDependencies('query-1', refs, USER, stubMetadataProvider(saved), RUN_VIEW, false);

        expect(saved.map(d => d.DependsOnQueryID).sort()).toEqual(['dep-1', 'dep-2']);
    });
});
