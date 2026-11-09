import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { KnowledgeAgent } from '../KnowledgeAgent.js';

let syncerProviderArg: IMetadataProvider | null | undefined;
let detectorProviderArg: IMetadataProvider | null | undefined;

vi.mock('@memberjunction/ai-vector-sync', () => ({
    EntityVectorSyncer: class {
        constructor(provider?: IMetadataProvider | null) {
            syncerProviderArg = provider;
        }
        Config() {
            return Promise.resolve(undefined);
        }
        VectorizeEntity() {
            return Promise.resolve({ success: true, processedRecords: 10 });
        }
    },
}));

vi.mock('@memberjunction/ai-vector-dupe', () => ({
    DuplicateRecordDetector: class {
        public CurrentUser: UserInfo | undefined;
        constructor(provider?: IMetadataProvider | null) {
            detectorProviderArg = provider;
        }
        GetDuplicateRecords() {
            return Promise.resolve({
                Status: 'Success',
                PotentialDuplicateResult: [],
            });
        }
    },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        LogStatus: vi.fn(),
        LogError: vi.fn(),
    };
});

describe('KnowledgeAgent — server tool provider propagation', () => {
    beforeEach(() => {
        syncerProviderArg = undefined;
        detectorProviderArg = undefined;
    });

    it('passes provider to EntityVectorSyncer when executing run_vectorization', async () => {
        const agent = new KnowledgeAgent();
        const mockProvider = { Entities: [] } as IMetadataProvider;
        const mockUser = new UserInfo();

        const result = await agent.ExecuteServerTool(
            'run_vectorization',
            { entityID: 'entity-123' },
            mockUser,
            mockProvider
        );

        expect(result.Success).toBe(true);
        expect(syncerProviderArg).toBe(mockProvider);
    });

    it('passes provider to DuplicateRecordDetector when executing run_duplicate_detection', async () => {
        const agent = new KnowledgeAgent();
        const mockProvider = { Entities: [] } as IMetadataProvider;
        const mockUser = new UserInfo();

        const result = await agent.ExecuteServerTool(
            'run_duplicate_detection',
            { entityID: 'entity-456', listID: 'list-123' },
            mockUser,
            mockProvider
        );

        expect(result.Success).toBe(true);
        expect(detectorProviderArg).toBe(mockProvider);
    });

    it('passes undefined provider when none is supplied', async () => {
        const agent = new KnowledgeAgent();
        const mockUser = new UserInfo();

        const result = await agent.ExecuteServerTool(
            'run_vectorization',
            { entityID: 'entity-789' },
            mockUser
        );

        expect(result.Success).toBe(true);
        expect(syncerProviderArg).toBeUndefined();
    });
});
