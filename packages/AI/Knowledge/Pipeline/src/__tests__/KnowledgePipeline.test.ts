/**
 * The pipeline runs its syncers and content-item views on the provider it was constructed with,
 * so a caller with a request-scoped provider (and a colocated vector host, #4910) never falls
 * through to the global default.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

const { syncerProviders, runViewProviders, mockRunView } = vi.hoisted(() => ({
    syncerProviders: [] as Array<IMetadataProvider | null | undefined>,
    runViewProviders: [] as IMetadataProvider[],
    mockRunView: vi.fn(),
}));

vi.mock('@memberjunction/ai-vector-sync', () => ({
    EntityVectorSyncer: class {
        constructor(provider?: IMetadataProvider | null) {
            syncerProviders.push(provider);
        }
        Config() { return Promise.resolve(); }
        VectorizeEntity() { return Promise.resolve({ success: true }); }
    },
}));

vi.mock('@memberjunction/core', () => {
    class MockRunView {
        RunView = mockRunView;
        static FromMetadataProvider(provider: IMetadataProvider) {
            runViewProviders.push(provider);
            return new MockRunView();
        }
    }
    return { RunView: MockRunView, LogStatus: vi.fn(), LogError: vi.fn() };
});

import { KnowledgePipeline } from '../generic/KnowledgePipeline.js';

const contextUser = { ID: 'user-1' } as UserInfo;
const requestProvider = { Entities: [] } as IMetadataProvider;

describe('KnowledgePipeline — provider threading', () => {
    beforeEach(() => {
        syncerProviders.length = 0;
        runViewProviders.length = 0;
        mockRunView.mockResolvedValue({ Success: true, Results: [{ ID: 'item-1' }] });
    });

    it('ProcessEntity builds its syncer on the constructor provider', async () => {
        const result = await new KnowledgePipeline(requestProvider).ProcessEntity(
            { EntityID: 'entity-1', EntityDocumentID: 'doc-1', EnableAutotagging: false, EnableVectorization: true },
            contextUser
        );

        expect(result.Success).toBe(true);
        expect(syncerProviders).toEqual([requestProvider]);
    });

    it('ProcessContentSource loads items and vectorizes on the constructor provider', async () => {
        const result = await new KnowledgePipeline(requestProvider).ProcessContentSource(
            { ContentSourceID: 'source-1', EntityDocumentID: 'doc-1', EnableAutotagging: false, EnableVectorization: true },
            contextUser
        );

        expect(result.Success).toBe(true);
        expect(runViewProviders).toEqual([requestProvider]);
        expect(syncerProviders).toEqual([requestProvider]);
    });

    it('leaves the provider unset without one, so VectorBase falls back to the global provider', async () => {
        const pipeline = new KnowledgePipeline();
        await pipeline.ProcessContentSource(
            { ContentSourceID: 'source-1', EntityDocumentID: 'doc-1', EnableAutotagging: false, EnableVectorization: true },
            contextUser
        );

        expect(pipeline.Provider).toBeUndefined();
        expect(runViewProviders).toEqual([]);
        expect(syncerProviders).toEqual([undefined]);
    });
});
