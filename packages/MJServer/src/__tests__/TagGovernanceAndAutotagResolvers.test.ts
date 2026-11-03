import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
    mockTagEngineConfig,
    mockMergeTags,
    mockRecomputeCoOccurrence,
    mockRunViewFn,
    mockGetEntityObjectFn,
    mockActionConfig,
    mockRunAction,
    mockPublish,
    actionsList,
} = vi.hoisted(() => ({
    mockTagEngineConfig: vi.fn().mockResolvedValue(undefined),
    mockMergeTags: vi.fn(),
    mockRecomputeCoOccurrence: vi.fn(),
    mockRunViewFn: vi.fn(),
    mockGetEntityObjectFn: vi.fn(),
    mockActionConfig: vi.fn().mockResolvedValue(undefined),
    mockRunAction: vi.fn(),
    mockPublish: vi.fn(),
    actionsList: [{ Name: 'Autotag and Vectorize Content' }] as Array<{ Name: string }>,
}));

vi.mock('type-graphql', () => {
    const noop = () => () => undefined;
    const passthrough = () => (target: unknown) => target;
    return {
        Resolver: passthrough,
        Mutation: noop,
        Query: noop,
        Subscription: noop,
        Arg: noop,
        Args: noop,
        Ctx: noop,
        Root: noop,
        ObjectType: passthrough,
        InputType: passthrough,
        ArgsType: passthrough,
        Field: noop,
        Float: Number,
        Int: Number,
        ID: String,
    };
});

vi.mock('../generic/ResolverBase.js', () => ({
    ResolverBase: class {
        GetUserFromPayload(payload: unknown) {
            if (!payload) return null;
            return { ID: 'user-1', Email: 'u@example.com', Name: 'User' };
        }
    },
}));

vi.mock('@memberjunction/tag-engine', () => ({
    TagEngine: {
        Instance: {
            Config: (...args: unknown[]) => mockTagEngineConfig(...args),
        },
    },
    TagGovernanceEngine: {
        Instance: {
            MergeTags: (...args: unknown[]) => mockMergeTags(...args),
        },
    },
    TagHealthJob: {
        Instance: {
            Run: vi.fn(),
        },
    },
    DEFAULT_TAG_HEALTH_THRESHOLDS: {
        minCoOccurrence: 5,
        minEmbeddingSimilarity: 0.85,
        minNameSimilarity: 0.5,
        maxUsage: 2,
        maxImplicitChildren: 25,
    },
}));

vi.mock('@memberjunction/tag-engine-base', () => ({
    TagCoOccurrenceEngine: {
        Instance: {
            RecomputeCoOccurrence: (...args: unknown[]) => mockRecomputeCoOccurrence(...args),
        },
    },
}));

vi.mock('@memberjunction/actions', () => ({
    ActionEngineServer: {
        Instance: {
            Config: (...args: unknown[]) => mockActionConfig(...args),
            get Actions() {
                return actionsList;
            },
            RunAction: (...args: unknown[]) => mockRunAction(...args),
        },
    },
}));

vi.mock('../generic/PubSubManager.js', () => ({
    PubSubManager: {
        Instance: {
            Publish: (...args: unknown[]) => mockPublish(...args),
        },
    },
}));

vi.mock('../util.js', () => ({
    GetReadWriteProvider: () => ({
        GetEntityObject: (...args: unknown[]) => mockGetEntityObjectFn(...args),
    }),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockRunView {
        RunView = mockRunViewFn;
        static FromMetadataProvider() {
            return new MockRunView();
        }
    }
    class MockMetadata {
        GetEntityObject = mockGetEntityObjectFn;
    }
    return {
        ...actual,
        RunView: MockRunView,
        Metadata: MockMetadata,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

import { TagGovernanceResolver } from '../resolvers/TagGovernanceResolver.js';
import { AutotagPipelineResolver } from '../resolvers/AutotagPipelineResolver.js';
import type { AppContext } from '../types.js';

const mockUser = { ID: 'user-1', Email: 'u@example.com', Name: 'User' };

describe('TagGovernanceResolver', () => {
    let resolver: TagGovernanceResolver;

    beforeEach(() => {
        vi.clearAllMocks();
        resolver = new TagGovernanceResolver();
        (resolver as unknown as Record<string, unknown>)['GetUserFromPayload'] = vi.fn().mockReturnValue(mockUser);
    });

    it('RecomputeTagCoOccurrence delegates to TagCoOccurrenceEngine.Instance.RecomputeCoOccurrence', async () => {
        mockRecomputeCoOccurrence.mockResolvedValueOnce({ PairsUpdated: 12, PairsDeleted: 3 });

        const res = await resolver.RecomputeTagCoOccurrence({} as AppContext);

        expect(mockRecomputeCoOccurrence).toHaveBeenCalledWith(mockUser);
        expect(res).toEqual({ PairsUpdated: 12, PairsDeleted: 3 });
    });

    it('MergeTags calls TagEngine.Instance.Config first and returns ItemsMoved and TaggedItemsMoved', async () => {
        mockMergeTags.mockResolvedValueOnce({ ItemsMoved: 4, TaggedItemsMoved: 7 });

        const res = await resolver.MergeTags(['src-1'], 'surviving-1', {} as AppContext);

        expect(mockTagEngineConfig).toHaveBeenCalledWith(false, mockUser);
        expect(mockMergeTags).toHaveBeenCalledWith(['src-1'], 'surviving-1', mockUser);
        expect(res).toEqual({
            Success: true,
            ItemsMoved: 4,
            TaggedItemsMoved: 7,
        });
    });

    it('MergeTags catches engine errors and maps them into ErrorMessage', async () => {
        mockMergeTags.mockRejectedValueOnce(new Error('Failed to load surviving tag'));

        const res = await resolver.MergeTags(['src-1'], 'bad-id', {} as AppContext);

        expect(res).toEqual({
            Success: false,
            ItemsMoved: 0,
            TaggedItemsMoved: 0,
            ErrorMessage: 'Failed to load surviving tag',
        });
    });
});

describe('AutotagPipelineResolver', () => {
    let resolver: AutotagPipelineResolver;

    beforeEach(() => {
        vi.clearAllMocks();
        resolver = new AutotagPipelineResolver();
        (resolver as unknown as Record<string, unknown>)['GetUserFromPayload'] = vi.fn().mockReturnValue(mockUser);
    });

    it('rejects a client-supplied pipelineRunID that is not a valid UUID', async () => {
        const res = await resolver.RunAutotagPipeline(undefined, undefined, 'not-a-uuid', {} as AppContext);

        expect(res.Success).toBe(false);
        expect(res.ErrorMessage).toMatch(/Invalid pipelineRunID/);
        expect(mockRunViewFn).not.toHaveBeenCalled();
    });

    it('rejects a client-supplied pipelineRunID when a Content Process Run with that ID already exists', async () => {
        const existingId = '11111111-2222-3333-4444-555555555555';
        mockRunViewFn.mockResolvedValueOnce({
            Success: true,
            Results: [{ ID: existingId }],
        });

        const res = await resolver.RunAutotagPipeline(undefined, undefined, existingId, {} as AppContext);

        expect(res.Success).toBe(false);
        expect(res.ErrorMessage).toContain('already exists');
    });

    it('passes processed item count (not pct) to publishProgress and clears heartbeatTimer in finally', async () => {
        const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
        mockGetEntityObjectFn.mockResolvedValue({
            NewRecord: vi.fn(),
            Save: vi.fn().mockResolvedValue(true),
            LatestResult: { CompleteMessage: '' },
        });

        mockRunAction.mockImplementationOnce(async ({ Params }: { Params: Array<{ Name: string; Value: unknown }> }) => {
            const cbParam = Params.find(p => p.Name === '__progressCallback');
            const cb = cbParam?.Value as ((processed: number, total: number, currentItem?: string) => void) | undefined;
            cb?.(3, 10, 'https://example.com/page-3');
            return { Success: true, Message: '' };
        });

        const runInBg = (resolver as unknown as {
            runPipelineInBackground(
                pipelineRunID: string,
                currentUser: unknown,
                provider: unknown,
                contentSourceIDs?: string[],
                forceReprocess?: boolean,
            ): Promise<void>;
        }).runPipelineInBackground.bind(resolver);

        await runInBg(
            'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            mockUser,
            { GetEntityObject: mockGetEntityObjectFn },
            ['22222222-3333-4444-5555-666666666666'],
            false,
        );

        const autotagEvent = mockPublish.mock.calls
            .map(c => c[1] as Record<string, unknown>)
            .find(n => n['Stage'] === 'autotag' && n['TotalItems'] === 10);

        expect(autotagEvent).toBeDefined();
        expect(autotagEvent?.['ProcessedItems']).toBe(3);
        expect(autotagEvent?.['PercentComplete']).toBe(30);
        expect(clearIntervalSpy).toHaveBeenCalled();
        clearIntervalSpy.mockRestore();
    });
});

