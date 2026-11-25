/**
 * Unloaded Canon probe tests for GraphEngine.HasActiveCanonGraphs and CanonGraphEngine.
 *
 * Verifies that deployments with zero active Canon graphs skip loading all 8 graph entities,
 * cache the probe result per provider, invalidate when `MJ: Graphs` or `MJ: Graph Types` changes,
 * and still trigger full configuration when an active Canon graph is present.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEntity, type IMetadataProvider } from '@memberjunction/core';
import { MJEventType, MJGlobal, UUIDSet } from '@memberjunction/global';
import { CanonGraphEngine } from '../../engines/CanonGraphEngine';
import { GraphEngine, IsCanonGraph } from '../../graph/GraphEngine';
import { CanonMetadataRows, FakeGraphProvider, IDS, MakeUser } from './graphTestFixtures';

const analyst = MakeUser('u-analyst', ['Analyst']);

function raiseEntitySave(entityName: string): void {
    MJGlobal.Instance.RaiseEvent({
        component: {},
        event: MJEventType.ComponentEvent,
        eventCode: BaseEntity.BaseEventCode,
        args: {
            type: 'save',
            entityName,
        },
    });
}

describe('GraphEngine.HasActiveCanonGraphs (unloaded probe)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('skips loading all 8 graph entities in ExplainEntity and FindConcepts when no active Canon graph exists', async () => {
        const provider = new FakeGraphProvider();
        provider.Reset({
            'MJ: Graph Types': CanonMetadataRows()['MJ: Graph Types'],
            'MJ: Graphs': [
                { ID: IDS.GraphDisabled, Name: 'Old Graph', GraphTypeID: IDS.GraphTypeCanon, GraphType: 'Canon', LoadMode: 'Preload', Status: 'Disabled' },
            ],
        });
        const configSpy = vi.spyOn(GraphEngine.Instance, 'Config');

        const explained = await CanonGraphEngine.Instance.ExplainEntity('Invoices', analyst, provider as unknown as IMetadataProvider);
        expect(explained).toEqual({
            EntityName: 'Invoices',
            DescribedConcepts: [],
            AlternateBaseViews: [],
            ReadingQueries: [],
            MeasuringQueries: [],
            Edges: [],
        });
        expect(configSpy).not.toHaveBeenCalled();
        expect(provider.ReadsOf('MJ: Graphs')).toHaveLength(1);
        expect(provider.ReadsOf('MJ: Graph Concepts')).toHaveLength(0);

        // Second call uses the per-provider cache with zero extra RunView calls.
        const concepts = await CanonGraphEngine.Instance.FindConcepts('Open AR', analyst, { provider: provider as unknown as IMetadataProvider });
        expect(concepts).toEqual([]);
        expect(configSpy).not.toHaveBeenCalled();
        expect(provider.ReadsOf('MJ: Graphs')).toHaveLength(1);
    });

    it('invalidates the probe cache on MJ: Graphs save and triggers Config when an active Canon graph appears', async () => {
        const provider = new FakeGraphProvider();
        provider.Reset({
            'MJ: Graph Types': CanonMetadataRows()['MJ: Graph Types'],
            'MJ: Graphs': [],
        });
        const configSpy = vi.spyOn(GraphEngine.Instance, 'Config').mockResolvedValue(undefined);

        expect(await GraphEngine.Instance.HasActiveCanonGraphs(analyst, provider as unknown as IMetadataProvider)).toBe(false);
        expect(provider.ReadsOf('MJ: Graphs')).toHaveLength(1);

        // Add an active Canon graph and emit a save event -> cache clears immediately.
        provider.Rows['MJ: Graphs'] = [
            { ID: IDS.GraphCanon, Name: 'MJ Canon', GraphTypeID: IDS.GraphTypeCanon, GraphType: 'Canon', LoadMode: 'Preload', Status: 'Active' },
        ];
        raiseEntitySave('MJ: Graphs');

        expect(await GraphEngine.Instance.HasActiveCanonGraphs(analyst, provider as unknown as IMetadataProvider)).toBe(true);
        expect(provider.ReadsOf('MJ: Graphs')).toHaveLength(2);

        await CanonGraphEngine.Instance.ExplainEntity('Invoices', analyst, provider as unknown as IMetadataProvider);
        expect(configSpy).toHaveBeenCalledTimes(1);
    });

    it('detects non-"MJ Canon" active graphs via MJ: Graph Types IsCanon flag and invalidates on MJ: Graph Types save', async () => {
        const provider = new FakeGraphProvider();
        provider.Reset({
            'MJ: Graph Types': [{ ID: IDS.GraphTypeCanon, Name: 'Custom', IsCanon: false, Status: 'Active' }],
            'MJ: Graphs': [
                { ID: '99999999-9999-4999-8999-999999999901', Name: 'Domain Graph', GraphTypeID: IDS.GraphTypeCanon, GraphType: 'Custom', LoadMode: 'Preload', Status: 'Active' },
            ],
        });

        expect(await GraphEngine.Instance.HasActiveCanonGraphs(analyst, provider as unknown as IMetadataProvider)).toBe(false);
        expect(provider.ReadsOf('MJ: Graphs')).toHaveLength(1);
        expect(provider.ReadsOf('MJ: Graph Types')).toHaveLength(1);

        provider.Rows['MJ: Graph Types'] = [{ ID: IDS.GraphTypeCanon, Name: 'Custom', IsCanon: true, Status: 'Active' }];
        raiseEntitySave('MJ: Graph Types');

        expect(await GraphEngine.Instance.HasActiveCanonGraphs(analyst, provider as unknown as IMetadataProvider)).toBe(true);
        expect(provider.ReadsOf('MJ: Graph Types')).toHaveLength(2);
    });

    it('does not treat a graph named "MJ Canon" as Canon unless its graph type is', async () => {
        const provider = new FakeGraphProvider();
        provider.Reset({
            'MJ: Graph Types': [{ ID: IDS.GraphTypeCanon, Name: 'Knowledge', IsCanon: false, Status: 'Active' }],
            'MJ: Graphs': [
                { ID: IDS.GraphCanon, Name: 'MJ Canon', GraphTypeID: IDS.GraphTypeCanon, GraphType: 'Knowledge', LoadMode: 'Preload', Status: 'Active' },
            ],
        });

        expect(IsCanonGraph({ GraphTypeID: IDS.GraphTypeCanon }, new UUIDSet())).toBe(false);
        expect(await GraphEngine.Instance.HasActiveCanonGraphs(analyst, provider as unknown as IMetadataProvider)).toBe(false);
        expect(provider.ReadsOf('MJ: Graph Types')).toHaveLength(1);
    });
});
