import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock dependencies before importing the module under test
// ---------------------------------------------------------------------------

/**
 * Queue of results that the RunView mock will return in order.
 * Each call to RunView.RunView() pops the first item. If the queue is empty,
 * returns a default success-with-empty-results.
 */
let runViewResultQueue: Array<{ Success: boolean; Results: unknown[]; ErrorMessage?: string }> = [];

/**
 * Queue of results that the RunQuery mock will return in order.
 */
let runQueryResultQueue: Array<{ Success: boolean; Results: unknown[] | null; ErrorMessage?: string }> = [];

/**
 * Every RunView / RunViews param object, in call order. Lets a test assert on the SQL
 * shape the engine asked for (ExtraFilter, OrderBy, MaxRows) rather than only its result.
 */
let runViewParamsLog: Array<Record<string, unknown>> = [];

/**
 * One entry per RunViews (plural) call, holding that call's param array. A batched
 * peripheral load must appear here ONCE — a per-detail loop would push many entries.
 */
let runViewsBatchLog: Array<Array<Record<string, unknown>>> = [];

const DEFAULT_RV_RESULT = { Success: true, Results: [] };
const DEFAULT_RQ_RESULT = { Success: true, Results: [] };

function nextRunQueryResult() {
    return runQueryResultQueue.length > 0 ? runQueryResultQueue.shift()! : DEFAULT_RQ_RESULT;
}

function nextRunViewResult() {
    return runViewResultQueue.length > 0 ? runViewResultQueue.shift()! : DEFAULT_RV_RESULT;
}

const mockConversationEntity = {
    ID: '',
    Name: '',
    EnvironmentID: '',
    UserID: '',
    Description: '',
    ProjectID: '',
    IsArchived: false,
    IsPinned: false,
    LatestResult: null as { Message: string } | null,
    Save: vi.fn().mockResolvedValue(true),
    Delete: vi.fn().mockResolvedValue(true),
    Load: vi.fn().mockResolvedValue(true),
    LoadFromData: vi.fn(),
};

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
        MJGlobal: { Instance: { GetGlobalObjectStore: () => ({}) } },
    };
});

vi.mock('@memberjunction/core', () => {
    class MockMetadata {
        static Provider = {};
        GetEntityObject() {
            return Promise.resolve(mockConversationEntity);
        }
        async CreateTransactionGroup() {
            return {
                Submit: vi.fn().mockResolvedValue(true),
            };
        }
    }
    return {
        BaseEngine: class MockBaseEngine {
            static getInstance<T>(): T {
                const ctor = this as unknown as { _testInstance?: T; new (): T };
                if (!ctor._testInstance) {
                    ctor._testInstance = new ctor();
                }
                return ctor._testInstance;
            }
            async Load(
                _configs: unknown[],
                _provider?: unknown,
                _forceRefresh?: boolean,
                _contextUser?: unknown
            ): Promise<void> {
                // no-op
            }
            // Multi-provider migration: engines now use this.ProviderToUse instead of new Metadata().
            // Mock returns the same mock metadata shape that the tests previously got via new Metadata().
            get ProviderToUse() {
                return {
                    GetEntityObject: () => Promise.resolve(mockConversationEntity),
                    CreateTransactionGroup: async () => ({ Submit: vi.fn().mockResolvedValue(true) }),
                    CurrentUser: { ID: 'user-1' },
                };
            }
        },
        Metadata: MockMetadata,
        RunView: class MockRunView {
            // ConversationEngine's windowed reads go through the provider-bound factory
            // rather than `new RunView()`, so the mock must expose it.
            static FromMetadataProvider(_provider: unknown) {
                return new MockRunView();
            }
            RunView(params: Record<string, unknown>) {
                runViewParamsLog.push(params);
                return Promise.resolve(nextRunViewResult());
            }
            // Drains one queued result per param, so a batch's results stay positional.
            RunViews(params: Array<Record<string, unknown>>) {
                runViewsBatchLog.push(params);
                for (const p of params) {
                    runViewParamsLog.push(p);
                }
                return Promise.resolve(params.map(() => nextRunViewResult()));
            }
        },
        RunQuery: class MockRunQuery {
            RunQuery() {
                return Promise.resolve(nextRunQueryResult());
            }
        },
        TransformSimpleObjectToEntityObject: vi.fn().mockImplementation(
            async (_provider: unknown, _entityName: string, rows: unknown[]) => {
                // Return the rows as-is (they're already mock detail objects)
                return rows;
            }
        ),
        UserInfo: class MockUserInfo {
            ID = 'user-1';
        },
        BaseEnginePropertyConfig: class MockConfig {},
        RegisterForStartup: () => () => {},
    };
});

// ConversationEngine imports ResourcePermissionEngine to pull in shared conversation IDs.
// Mock it so the engine can be constructed without touching the real cache.
vi.mock('../custom/ResourcePermissions/ResourcePermissionEngine', () => ({
    ResourcePermissionEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            GetUserAvailableResources: vi.fn().mockReturnValue([]),
        },
    },
}));

vi.mock('../generated/entity_subclasses', () => ({
    MJConversationEntity: class MockConversation {},
    MJConversationDetailEntity: class MockConversationDetail {},
    MJAIAgentRunEntity: class MockAgentRun {},
}));

vi.mock('../engines/artifacts', () => ({
    ArtifactMetadataEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
        },
    },
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks
// ---------------------------------------------------------------------------
import { ConversationEngine } from '../engines/conversations';
import { UserInfo } from '@memberjunction/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createMockConversation(overrides: Record<string, unknown> = {}) {
    return {
        ID: overrides['ID'] ?? 'conv-1',
        Name: overrides['Name'] ?? 'Test Conversation',
        EnvironmentID: overrides['EnvironmentID'] ?? 'env-1',
        UserID: overrides['UserID'] ?? 'user-1',
        IsArchived: overrides['IsArchived'] ?? false,
        IsPinned: overrides['IsPinned'] ?? false,
        __mj_UpdatedAt: overrides['__mj_UpdatedAt'] ?? new Date('2025-06-01'),
        // BaseEntity methods needed when the engine uses cached objects directly
        Save: vi.fn().mockResolvedValue(true),
        Delete: vi.fn().mockResolvedValue(true),
        GetAll: vi.fn().mockReturnValue({}),
        LatestResult: { Success: true, Message: '' },
        TransactionGroup: null,
        ...overrides,
    };
}

function createMockDetail(overrides: Record<string, unknown> = {}) {
    return {
        ID: overrides['ID'] ?? 'detail-1',
        ConversationID: overrides['ConversationID'] ?? 'conv-1',
        ...overrides,
    };
}

function createMockAgentRun(overrides: Record<string, unknown> = {}) {
    return {
        ID: overrides['ID'] ?? 'run-1',
        ConversationDetailID: overrides['ConversationDetailID'] ?? 'detail-1',
        ...overrides,
    };
}

/**
 * Helper: enqueue results for LoadConversationDetails, which uses RunQuery
 * to load conversation details via GetConversationComplete stored query.
 * The query returns ConversationDetailComplete rows (detail fields + JSON columns).
 * Agent runs are embedded as JSON in AgentRunsJSON column.
 */
function enqueueDetailsResults(
    details: unknown[],
    agentRuns: unknown[] = []
) {
    // Build ConversationDetailComplete-shaped rows: detail fields + AgentRunsJSON
    const rows = details.map((detail) => {
        const d = detail as unknown as Record<string, unknown>;
        const detailId = d['ID'] as string;
        // Find agent runs matching this detail
        const matchingRuns = agentRuns.filter(
            (r) => (r as unknown as Record<string, unknown>)['ConversationDetailID'] === detailId
        );
        return {
            ...d,
            AgentRunsJSON: matchingRuns.length > 0 ? JSON.stringify(matchingRuns) : null,
            ArtifactsJSON: null,
            RatingsJSON: null,
            Role: 'AI',
        };
    });
    runQueryResultQueue.push({ Success: true, Results: rows });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ConversationEngine', () => {
    let engine: ConversationEngine;
    let contextUser: UserInfo;

    beforeEach(() => {
        vi.restoreAllMocks();

        engine = ConversationEngine.Instance;
        engine.ClearCache();

        contextUser = new UserInfo();
        contextUser.ID = 'user-1';

        // Reset mock entity defaults
        mockConversationEntity.ID = '';
        mockConversationEntity.Name = '';
        mockConversationEntity.IsArchived = false;
        mockConversationEntity.IsPinned = false;
        mockConversationEntity.Save.mockResolvedValue(true);
        mockConversationEntity.Delete.mockResolvedValue(true);
        mockConversationEntity.Load.mockResolvedValue(true);
        mockConversationEntity.LatestResult = null;

        // Clear both queues
        runViewResultQueue = [];
        runQueryResultQueue = [];

        // Clear the call logs the windowed-read tests assert against
        runViewParamsLog = [];
        runViewsBatchLog = [];
    });

    // ========================================================================
    // SINGLETON
    // ========================================================================
    describe('Instance (singleton)', () => {
        it('should return the same instance on repeated calls', () => {
            const a = ConversationEngine.Instance;
            const b = ConversationEngine.Instance;
            expect(a).toBe(b);
        });
    });

    // ========================================================================
    // CONFIG
    // ========================================================================
    describe('Config', () => {
        it('should initialize without errors and call ArtifactMetadataEngine.Config', async () => {
            const { ArtifactMetadataEngine } = await import('../engines/artifacts');
            await engine.Config(false, contextUser);
            expect(ArtifactMetadataEngine.Instance.Config).toHaveBeenCalledWith(
                false,
                contextUser,
                undefined
            );
        });
    });

    // ========================================================================
    // LOAD CONVERSATIONS
    // ========================================================================
    describe('LoadConversations', () => {
        it('should load conversations and emit them via Conversations$', async () => {
            const mockConvos = [
                createMockConversation({ ID: 'c1', Name: 'First' }),
                createMockConversation({ ID: 'c2', Name: 'Second' }),
            ];
            runViewResultQueue.push({ Success: true, Results: mockConvos });

            const emitted: unknown[][] = [];
            const sub = engine.Conversations$.subscribe(v => emitted.push(v));

            await engine.LoadConversations('env-1', contextUser);

            expect(engine.Conversations).toHaveLength(2);
            expect(emitted.length).toBeGreaterThanOrEqual(1);
            expect(emitted[emitted.length - 1]).toHaveLength(2);

            sub.unsubscribe();
        });

        it('should emit empty array on failed RunView', async () => {
            runViewResultQueue.push({
                Success: false,
                Results: [],
                ErrorMessage: 'DB error',
            });

            await engine.LoadConversations('env-1', contextUser);
            expect(engine.Conversations).toHaveLength(0);
        });

        it('should skip reload when already loaded for the same environment', async () => {
            runViewResultQueue.push({
                Success: true,
                Results: [createMockConversation({ ID: 'c1' })],
            });

            await engine.LoadConversations('env-1', contextUser);
            expect(engine.Conversations).toHaveLength(1);

            // Enqueue different data, but it should not be consumed
            runViewResultQueue.push({ Success: true, Results: [] });

            await engine.LoadConversations('env-1', contextUser);
            expect(engine.Conversations).toHaveLength(1); // Still 1
        });

        it('should reload when forceRefresh is true', async () => {
            runViewResultQueue.push({
                Success: true,
                Results: [createMockConversation({ ID: 'c1' })],
            });
            await engine.LoadConversations('env-1', contextUser);
            expect(engine.Conversations).toHaveLength(1);

            runViewResultQueue.push({ Success: true, Results: [] });
            await engine.LoadConversations('env-1', contextUser, true);
            expect(engine.Conversations).toHaveLength(0);
        });
    });

    // ========================================================================
    // CREATE CONVERSATION
    // ========================================================================
    describe('CreateConversation', () => {
        it('should create a conversation and prepend it to the list', async () => {
            mockConversationEntity.Save.mockResolvedValue(true);

            const result = await engine.CreateConversation('New Chat', 'env-1', contextUser);

            expect(result).toBeDefined();
            expect(mockConversationEntity.Save).toHaveBeenCalled();
            expect(engine.Conversations).toHaveLength(1);
        });

        it('should throw when save fails', async () => {
            mockConversationEntity.Save.mockResolvedValue(false);
            mockConversationEntity.LatestResult = { Message: 'Save failed' };

            await expect(
                engine.CreateConversation('Bad Chat', 'env-1', contextUser)
            ).rejects.toThrow('Save failed');
        });
    });

    // ========================================================================
    // ENSURE CONVERSATION LOADED (server-created conversation reactivity)
    // ========================================================================
    describe('EnsureConversationLoaded', () => {
        it('returns the cached entity without a load when the conversation is already present', async () => {
            runViewResultQueue.push({ Success: true, Results: [createMockConversation({ ID: 'c1' })] });
            await engine.LoadConversations('env-1', contextUser);
            expect(engine.Conversations).toHaveLength(1);

            mockConversationEntity.Load.mockClear();
            const result = await engine.EnsureConversationLoaded('c1', contextUser);

            expect(result).toBeDefined();
            // Already cached → no single-row Load round-trip
            expect(mockConversationEntity.Load).not.toHaveBeenCalled();
            expect(engine.Conversations).toHaveLength(1);
        });

        it('loads the single row and prepends it, emitting via Conversations$ (the server-created case)', async () => {
            runViewResultQueue.push({ Success: true, Results: [] });
            await engine.LoadConversations('env-1', contextUser);
            expect(engine.Conversations).toHaveLength(0);

            // The single-row Load hydrates the shared mock entity as the new conversation
            mockConversationEntity.ID = 'cNew';
            mockConversationEntity.IsArchived = false;
            mockConversationEntity.Load.mockResolvedValue(true);

            const emitted: unknown[][] = [];
            const sub = engine.Conversations$.subscribe(v => emitted.push(v));

            const result = await engine.EnsureConversationLoaded('cNew', contextUser);

            expect(result).toBeDefined();
            expect(mockConversationEntity.Load).toHaveBeenCalledWith('cNew');
            expect(engine.Conversations).toHaveLength(1);
            // A reactive emission landed (the sidebar list subscribes to exactly this)
            expect(emitted[emitted.length - 1]).toHaveLength(1);
            sub.unsubscribe();
        });

        it('returns null and does not touch the list when the row cannot be loaded', async () => {
            runViewResultQueue.push({ Success: true, Results: [] });
            await engine.LoadConversations('env-1', contextUser);

            mockConversationEntity.Load.mockResolvedValue(false);

            const result = await engine.EnsureConversationLoaded('missing', contextUser);
            expect(result).toBeNull();
            expect(engine.Conversations).toHaveLength(0);
        });
    });

    // ========================================================================
    // DELETE CONVERSATION
    // ========================================================================
    describe('DeleteConversation', () => {
        it('should delete a conversation and remove it from the list', async () => {
            runViewResultQueue.push({
                Success: true,
                Results: [
                    createMockConversation({ ID: 'c1' }),
                    createMockConversation({ ID: 'c2' }),
                ],
            });
            await engine.LoadConversations('env-1', contextUser);
            expect(engine.Conversations).toHaveLength(2);

            mockConversationEntity.Load.mockResolvedValue(true);
            mockConversationEntity.Delete.mockResolvedValue(true);

            const result = await engine.DeleteConversation('c1', contextUser);
            expect(result).toBe(true);
            expect(engine.Conversations).toHaveLength(1);
        });

        it('should throw when conversation not found', async () => {
            mockConversationEntity.Load.mockResolvedValue(false);

            await expect(
                engine.DeleteConversation('nonexistent', contextUser)
            ).rejects.toThrow('Conversation not found');
        });

        it('should throw when delete fails', async () => {
            mockConversationEntity.Load.mockResolvedValue(true);
            mockConversationEntity.Delete.mockResolvedValue(false);
            mockConversationEntity.LatestResult = { Message: 'Delete failed' };

            await expect(
                engine.DeleteConversation('c1', contextUser)
            ).rejects.toThrow('Delete failed');
        });
    });

    // ========================================================================
    // ARCHIVE CONVERSATION
    // ========================================================================
    describe('ArchiveConversation', () => {
        it('should archive a conversation and remove it from the active list', async () => {
            runViewResultQueue.push({
                Success: true,
                Results: [createMockConversation({ ID: 'c1' })],
            });
            await engine.LoadConversations('env-1', contextUser);

            mockConversationEntity.Load.mockResolvedValue(true);
            mockConversationEntity.Save.mockResolvedValue(true);

            const result = await engine.ArchiveConversation('c1', contextUser);
            expect(result).toBe(true);
            expect(engine.Conversations).toHaveLength(0);
        });
    });

    // ========================================================================
    // PIN CONVERSATION
    // ========================================================================
    describe('PinConversation', () => {
        it('should toggle IsPinned and re-emit sorted list', async () => {
            const conv = createMockConversation({ ID: 'c1', IsPinned: false });
            runViewResultQueue.push({ Success: true, Results: [conv] });
            await engine.LoadConversations('env-1', contextUser);

            mockConversationEntity.Load.mockResolvedValue(true);
            mockConversationEntity.Save.mockResolvedValue(true);

            const result = await engine.PinConversation('c1', true, contextUser);
            expect(result).toBe(true);

            const found = engine.GetConversation('c1');
            expect(found).toBeDefined();
            expect((found as unknown as Record<string, unknown>)['IsPinned']).toBe(true);
        });
    });

    // ========================================================================
    // GET CONVERSATION
    // ========================================================================
    describe('GetConversation', () => {
        it('should find a conversation by ID using UUIDsEqual', async () => {
            const conv = createMockConversation({ ID: 'AAAA-BBBB' });
            runViewResultQueue.push({ Success: true, Results: [conv] });
            await engine.LoadConversations('env-1', contextUser);

            // UUIDsEqual handles case-insensitive comparison
            const found = engine.GetConversation('aaaa-bbbb');
            expect(found).toBeDefined();
        });

        it('should return undefined for a non-existent conversation', async () => {
            runViewResultQueue.push({ Success: true, Results: [] });
            await engine.LoadConversations('env-1', contextUser);

            const found = engine.GetConversation('nonexistent');
            expect(found).toBeUndefined();
        });
    });

    // ========================================================================
    // LOAD CONVERSATION DETAILS (with caching)
    // ========================================================================
    describe('LoadConversationDetails', () => {
        it('should load details and cache them', async () => {
            const mockDetails = [
                createMockDetail({ ID: 'd1', ConversationID: 'conv-1' }),
                createMockDetail({ ID: 'd2', ConversationID: 'conv-1' }),
            ];
            enqueueDetailsResults(mockDetails);

            const result = await engine.LoadConversationDetails('conv-1', contextUser);
            // LoadConversationDetails now returns a ConversationDetailCache object
            expect(result.Details).toHaveLength(2);

            const cached = engine.GetCachedDetails('conv-1');
            expect(cached).toBeDefined();
            expect(cached).toHaveLength(2);
        });

        it('should return cached details without re-fetching', async () => {
            enqueueDetailsResults([createMockDetail({ ID: 'd1' })]);

            await engine.LoadConversationDetails('conv-1', contextUser);

            // Queue should be empty now; a second call should use cache and NOT
            // hit RunQuery (which would return DEFAULT_RQ_RESULT with empty results)
            const result = await engine.LoadConversationDetails('conv-1', contextUser);
            expect(result.Details).toHaveLength(1);
        });
    });

    // ========================================================================
    // GET CACHED DETAILS
    // ========================================================================
    describe('GetCachedDetails', () => {
        it('should return cached details for a known conversation', async () => {
            enqueueDetailsResults([createMockDetail({ ID: 'd1' })]);
            await engine.LoadConversationDetails('conv-1', contextUser);

            const cached = engine.GetCachedDetails('conv-1');
            expect(cached).toHaveLength(1);
        });

        it('should return undefined for an unknown conversation', () => {
            const cached = engine.GetCachedDetails('unknown-conv');
            expect(cached).toBeUndefined();
        });
    });

    // ========================================================================
    // INVALIDATE CONVERSATION
    // ========================================================================
    describe('InvalidateConversation', () => {
        it('should remove cached details for a conversation', async () => {
            enqueueDetailsResults([createMockDetail({ ID: 'd1' })]);
            await engine.LoadConversationDetails('conv-1', contextUser);
            expect(engine.GetCachedDetails('conv-1')).toBeDefined();

            engine.InvalidateConversation('conv-1');
            expect(engine.GetCachedDetails('conv-1')).toBeUndefined();
        });
    });

    // ========================================================================
    // CLEAR CACHE
    // ========================================================================
    describe('ClearCache', () => {
        it('should clear conversations and all detail caches', async () => {
            runViewResultQueue.push({
                Success: true,
                Results: [createMockConversation({ ID: 'c1' })],
            });
            await engine.LoadConversations('env-1', contextUser);
            expect(engine.Conversations).toHaveLength(1);

            engine.ClearCache();

            expect(engine.Conversations).toHaveLength(0);
            expect(engine.GetCachedDetails('c1')).toBeUndefined();
        });
    });

    // ========================================================================
    // AGENT RUNS: SetAgentRunForDetail / GetAgentRunForDetail
    // ========================================================================
    describe('SetAgentRunForDetail / GetAgentRunForDetail', () => {
        it('should store and retrieve an agent run for a detail', async () => {
            enqueueDetailsResults([
                createMockDetail({ ID: 'd1', ConversationID: 'conv-1' }),
            ]);
            await engine.LoadConversationDetails('conv-1', contextUser);

            const agentRun = createMockAgentRun({ ID: 'run-1', ConversationDetailID: 'd1' });
            engine.SetAgentRunForDetail('conv-1', 'd1', agentRun as never);

            const retrieved = engine.GetAgentRunForDetail('conv-1', 'd1');
            expect(retrieved).toBeDefined();
            expect((retrieved as unknown as Record<string, unknown>)['ID']).toBe('run-1');
        });

        it('should return undefined when no cache entry exists', () => {
            const result = engine.GetAgentRunForDetail('no-conv', 'no-detail');
            expect(result).toBeUndefined();
        });
    });

    // ========================================================================
    // GET AGENT RUNS MAP
    // ========================================================================
    describe('GetAgentRunsMap', () => {
        it('should return the agent runs map for a cached conversation', async () => {
            const mockAgentRuns = [
                createMockAgentRun({ ID: 'run-1', ConversationDetailID: 'd1' }),
            ];
            enqueueDetailsResults(
                [createMockDetail({ ID: 'd1', ConversationID: 'conv-1' })],
                mockAgentRuns
            );

            await engine.LoadConversationDetails('conv-1', contextUser);

            const map = engine.GetAgentRunsMap('conv-1');
            expect(map).toBeInstanceOf(Map);
            expect(map.size).toBe(1);
            expect(map.has('d1')).toBe(true);
        });

        it('should return an empty map for an unknown conversation', () => {
            const map = engine.GetAgentRunsMap('unknown');
            expect(map).toBeInstanceOf(Map);
            expect(map.size).toBe(0);
        });
    });

    // ========================================================================
    // ADD / UPDATE DETAIL IN CACHE
    // ========================================================================
    describe('AddDetailToCache', () => {
        it('should append a detail to the cached list', async () => {
            enqueueDetailsResults([createMockDetail({ ID: 'd1' })]);
            await engine.LoadConversationDetails('conv-1', contextUser);

            const newDetail = createMockDetail({ ID: 'd2' });
            engine.AddDetailToCache('conv-1', newDetail as never);

            const cached = engine.GetCachedDetails('conv-1');
            expect(cached).toHaveLength(2);
        });

        it('should be a no-op when no cache entry exists', () => {
            const newDetail = createMockDetail({ ID: 'd2' });
            engine.AddDetailToCache('no-conv', newDetail as never);
            expect(engine.GetCachedDetails('no-conv')).toBeUndefined();
        });
    });

    describe('UpdateDetailInCache', () => {
        it('should replace a detail by ID in the cached list', async () => {
            enqueueDetailsResults([
                createMockDetail({ ID: 'd1', ConversationID: 'conv-1' }),
            ]);
            await engine.LoadConversationDetails('conv-1', contextUser);

            const updated = createMockDetail({
                ID: 'd1',
                ConversationID: 'conv-1',
                extraField: 'updated',
            });
            engine.UpdateDetailInCache('conv-1', updated as never);

            const cached = engine.GetCachedDetails('conv-1');
            expect(cached).toHaveLength(1);
            expect((cached![0] as unknown as Record<string, unknown>)['extraField']).toBe('updated');
        });
    });

    // ========================================================================
    // GET CACHED DETAIL ENTRY
    // ========================================================================
    describe('GetCachedDetailEntry', () => {
        it('should return the full cache entry including AgentRunsByDetailId and LoadedAt', async () => {
            enqueueDetailsResults([createMockDetail({ ID: 'd1' })]);
            await engine.LoadConversationDetails('conv-1', contextUser);

            const entry = engine.GetCachedDetailEntry('conv-1');
            expect(entry).toBeDefined();
            expect(entry!.Details).toHaveLength(1);
            expect(entry!.AgentRunsByDetailId).toBeInstanceOf(Map);
            expect(entry!.LoadedAt).toBeInstanceOf(Date);
        });

        it('should return undefined for an uncached conversation', () => {
            expect(engine.GetCachedDetailEntry('nope')).toBeUndefined();
        });
    });

    // ========================================================================
    // SAVE CONVERSATION
    // ========================================================================
    describe('GetAgentContextWindow', () => {
        /**
         * Enqueue GetConversationComplete rows preserving each row's Role/Sequence/
         * SummaryOfEarlierConversation (enqueueDetailsResults force-overrides Role).
         */
        function enqueueWindowRows(rows: Array<Record<string, unknown>>) {
            runQueryResultQueue.push({
                Success: true,
                Results: rows.map((r) => ({
                    AgentRunsJSON: null,
                    ArtifactsJSON: null,
                    RatingsJSON: null,
                    SummaryOfEarlierConversation: null,
                    ...r,
                })),
            });
        }

        function makeRow(id: string, seq: number, role: string, message: string, summary: string | null = null) {
            return {
                ID: id,
                ConversationID: 'conv-1',
                Sequence: seq,
                Role: role,
                Message: message,
                SummaryOfEarlierConversation: summary,
            };
        }

        it('returns all messages chronologically with metadata when no summary exists', async () => {
            enqueueWindowRows([
                makeRow('d-2', 2, 'AI', 'answer one'),
                makeRow('d-1', 1, 'User', 'question one'),
                makeRow('d-3', 3, 'User', 'question two'),
            ]);
            const window = await engine.GetAgentContextWindow('conv-1', contextUser);
            expect(window).toHaveLength(3);
            expect(window.map((m) => m.metadata?.sequence)).toEqual([1, 2, 3]);
            expect(window.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
            expect(window[0].content).toBe('question one');
            expect(window[0].metadata?.conversationDetailId).toBe('d-1');
            expect(window.every((m) => !m.metadata?.isConversationSummary)).toBe(true);
        });

        it('caps to the most recent maxTailMessages when no summary exists', async () => {
            enqueueWindowRows([1, 2, 3, 4, 5].map((n) => makeRow(`d-${n}`, n, 'User', `msg ${n}`)));
            const window = await engine.GetAgentContextWindow('conv-1', contextUser, { maxTailMessages: 2 });
            expect(window.map((m) => m.metadata?.sequence)).toEqual([4, 5]);
        });

        it('windows at the HIGHEST-sequence summary: summary message + boundary row raw + tail', async () => {
            enqueueWindowRows([
                makeRow('d-1', 1, 'User', 'old question'),
                makeRow('d-2', 2, 'AI', 'old answer', 'stale older summary'),
                makeRow('d-3', 3, 'User', 'mid question'),
                makeRow('d-4', 4, 'AI', 'mid answer', 'covers sequences 1-3'),
                makeRow('d-5', 5, 'User', 'new question'),
            ]);
            const window = await engine.GetAgentContextWindow('conv-1', contextUser);
            expect(window).toHaveLength(3);
            // Synthetic summary first — carries the boundary's summary text + metadata
            expect(window[0].role).toBe('user');
            expect(window[0].content).toBe('covers sequences 1-3');
            expect(window[0].metadata?.isConversationSummary).toBe(true);
            expect(window[0].metadata?.summaryBoundarySequence).toBe(4);
            // Boundary row itself is included RAW (no gap, no overlap), then the tail
            expect(window[1].metadata?.sequence).toBe(4);
            expect(window[1].content).toBe('mid answer');
            expect(window[2].metadata?.sequence).toBe(5);
        });

        it('ignores maxTailMessages when a summary boundary exists (no coverage gap)', async () => {
            enqueueWindowRows([
                makeRow('d-1', 1, 'User', 'old', null),
                makeRow('d-2', 2, 'AI', 'boundary answer', 'the summary'),
                makeRow('d-3', 3, 'User', 'tail 1'),
                makeRow('d-4', 4, 'AI', 'tail 2'),
            ]);
            const window = await engine.GetAgentContextWindow('conv-1', contextUser, { maxTailMessages: 1 });
            // summary + boundary + 2 tail rows — the cap must NOT cut into the tail
            expect(window).toHaveLength(4);
        });

        it('excludes rows listed in excludeDetailIds (in-flight placeholder)', async () => {
            enqueueWindowRows([
                makeRow('d-1', 1, 'User', 'question'),
                makeRow('d-2', 2, 'AI', '⏳ Starting...'),
            ]);
            const window = await engine.GetAgentContextWindow('conv-1', contextUser, {
                excludeDetailIds: ['d-2'],
            });
            expect(window).toHaveLength(1);
            expect(window[0].metadata?.conversationDetailId).toBe('d-1');
        });

        it('treats blank summaries as no boundary', async () => {
            enqueueWindowRows([
                makeRow('d-1', 1, 'User', 'q', '   '),
                makeRow('d-2', 2, 'AI', 'a'),
            ]);
            const window = await engine.GetAgentContextWindow('conv-1', contextUser);
            expect(window).toHaveLength(2);
            expect(window[0].metadata?.isConversationSummary).toBeUndefined();
        });
    });

    describe('SaveConversation', () => {
        it('should save updates and update the in-memory list', async () => {
            runViewResultQueue.push({ Success: true, Results: [createMockConversation({ ID: 'c1', Name: 'Original' })] });
            await engine.LoadConversations('env-1', contextUser);

            const result = await engine.SaveConversation('c1', { Name: 'Updated' } as Partial<never>, contextUser);
            expect(result).toBe(true);

            const updated = engine.GetConversation('c1');
            expect(updated).toBeDefined();
        });

        it('should update in-memory entity when conversation exists in cache', async () => {
            const conv = createMockConversation({ ID: 'c1', Name: 'Original' });
            runViewResultQueue.push({ Success: true, Results: [conv] });
            await engine.LoadConversations('env-1', contextUser);

            const result = await engine.SaveConversation('c1', { Name: 'Updated' } as Partial<never>, contextUser);
            expect(result).toBe(true);
        });
    });

    // ========================================================================
    // DELETE MULTIPLE CONVERSATIONS
    // ========================================================================
    describe('DeleteMultipleConversations', () => {
        it('should return empty arrays when given no IDs', async () => {
            const result = await engine.DeleteMultipleConversations([], contextUser);
            expect(result.Successful).toEqual([]);
            expect(result.Failed).toEqual([]);
        });

        it('should process each ID and return results', async () => {
            runViewResultQueue.push({ Success: true, Results: [
                createMockConversation({ ID: 'c1', Name: 'First' }),
                createMockConversation({ ID: 'c2', Name: 'Second' }),
            ] });
            await engine.LoadConversations('env-1', contextUser);

            const result = await engine.DeleteMultipleConversations(['c1', 'c2'], contextUser);
            // Mock entity always succeeds Delete, so both should be successful
            expect(result.Successful).toHaveLength(2);
            expect(result.Failed).toHaveLength(0);
        });
    });

    // ========================================================================
    // PROJECTS / FOLDERS
    // ========================================================================
    describe('Projects (folders)', () => {
        function createMockProject(overrides: Record<string, unknown> = {}) {
            const project: Record<string, unknown> = {
                ID: overrides['ID'] ?? 'p1',
                Name: overrides['Name'] ?? 'Folder',
                EnvironmentID: overrides['EnvironmentID'] ?? 'env-1',
                ParentID: overrides['ParentID'] ?? null,
                IsArchived: overrides['IsArchived'] ?? false,
                Save: vi.fn().mockResolvedValue(true),
                GetAll: vi.fn().mockReturnValue({}),
                LatestResult: { Success: true, CompleteMessage: '' },
                ...overrides,
            };
            // Faithfully simulate BaseEntity.Delete(): on success NewRecord() wipes the
            // entity's fields, including ID. Code that filters the cache by ID must do so
            // BEFORE calling Delete(), so this guards against that regression.
            project['Delete'] = vi.fn().mockImplementation(async () => {
                project['ID'] = '';
                return true;
            });
            return project;
        }

        describe('LoadProjects', () => {
            it('should load projects and emit them via Projects$', async () => {
                runViewResultQueue.push({ Success: true, Results: [
                    createMockProject({ ID: 'p1', Name: 'Work' }),
                    createMockProject({ ID: 'p2', Name: 'Personal' }),
                ] });

                const emitted: unknown[][] = [];
                const sub = engine.Projects$.subscribe(v => emitted.push(v));

                await engine.LoadProjects('env-1', contextUser);

                expect(engine.Projects).toHaveLength(2);
                expect(emitted[emitted.length - 1]).toHaveLength(2);
                sub.unsubscribe();
            });

            it('should skip reload when already loaded for the same environment', async () => {
                runViewResultQueue.push({ Success: true, Results: [createMockProject({ ID: 'p1' })] });
                await engine.LoadProjects('env-1', contextUser);

                // No new result queued — a second non-forced load must NOT consume the default queue
                await engine.LoadProjects('env-1', contextUser);
                expect(engine.Projects).toHaveLength(1);
            });

            it('should emit empty array on failed RunView', async () => {
                runViewResultQueue.push({ Success: false, Results: [], ErrorMessage: 'boom' });
                await engine.LoadProjects('env-1', contextUser);
                expect(engine.Projects).toHaveLength(0);
            });
        });

        describe('MoveConversationToProject', () => {
            it('should set ProjectID on the cached conversation', async () => {
                runViewResultQueue.push({ Success: true, Results: [createMockConversation({ ID: 'c1', ProjectID: null })] });
                await engine.LoadConversations('env-1', contextUser);

                const ok = await engine.MoveConversationToProject('c1', 'p1', contextUser);
                expect(ok).toBe(true);
                expect((engine.GetConversation('c1') as { ProjectID?: string | null })?.ProjectID).toBe('p1');
            });

            it('should clear ProjectID when moving to null (ungroup)', async () => {
                runViewResultQueue.push({ Success: true, Results: [createMockConversation({ ID: 'c1', ProjectID: 'p1' })] });
                await engine.LoadConversations('env-1', contextUser);

                await engine.MoveConversationToProject('c1', null, contextUser);
                expect((engine.GetConversation('c1') as { ProjectID?: string | null })?.ProjectID).toBeNull();
            });
        });

        describe('DeleteProject', () => {
            it('should delete a folder with no references and remove it from the cache', async () => {
                runViewResultQueue.push({ Success: true, Results: [createMockProject({ ID: 'p1' })] });
                await engine.LoadProjects('env-1', contextUser);

                const ok = await engine.DeleteProject('p1', contextUser);
                expect(ok).toBe(true);
                expect(engine.Projects).toHaveLength(0);
            });

            it('should reparent child folders to the deleted folder\'s parent', async () => {
                const child = createMockProject({ ID: 'p2', ParentID: 'p1' });
                runViewResultQueue.push({ Success: true, Results: [
                    createMockProject({ ID: 'p1', ParentID: null }),
                    child,
                ] });
                await engine.LoadProjects('env-1', contextUser);

                await engine.DeleteProject('p1', contextUser);

                // Child survives, reparented to root (p1's parent was null)
                expect(engine.Projects).toHaveLength(1);
                expect((engine.Projects[0] as { ID: string }).ID).toBe('p2');
                expect((engine.Projects[0] as { ParentID: string | null }).ParentID).toBeNull();
            });

            it('should unassign conversations directly in the deleted folder', async () => {
                runViewResultQueue.push({ Success: true, Results: [createMockConversation({ ID: 'c1', ProjectID: 'p1' })] });
                await engine.LoadConversations('env-1', contextUser);
                // LoadConversations already triggered a (guarded) projects load, so force this one
                runViewResultQueue.push({ Success: true, Results: [createMockProject({ ID: 'p1' })] });
                await engine.LoadProjects('env-1', contextUser, true);

                await engine.DeleteProject('p1', contextUser);

                expect((engine.GetConversation('c1') as { ProjectID?: string | null })?.ProjectID).toBeNull();
            });
        });

        describe('MoveProjectToParent', () => {
            it('should set ParentID on the cached folder', async () => {
                runViewResultQueue.push({ Success: true, Results: [
                    createMockProject({ ID: 'p1' }),
                    createMockProject({ ID: 'p2' }),
                ] });
                await engine.LoadProjects('env-1', contextUser);

                const ok = await engine.MoveProjectToParent('p2', 'p1', contextUser);
                expect(ok).toBe(true);
                const moved = engine.Projects.find(p => (p as { ID: string }).ID === 'p2') as { ParentID: string | null };
                expect(moved.ParentID).toBe('p1');
            });

            it('should clear ParentID when moving to top level (null)', async () => {
                runViewResultQueue.push({ Success: true, Results: [createMockProject({ ID: 'p2', ParentID: 'p1' })] });
                await engine.LoadProjects('env-1', contextUser);

                await engine.MoveProjectToParent('p2', null, contextUser);
                const moved = engine.Projects.find(p => (p as { ID: string }).ID === 'p2') as { ParentID: string | null };
                expect(moved.ParentID).toBeNull();
            });
        });

        describe('ClearCache', () => {
            it('should clear the projects list', async () => {
                runViewResultQueue.push({ Success: true, Results: [createMockProject({ ID: 'p1' })] });
                await engine.LoadProjects('env-1', contextUser);
                expect(engine.Projects).toHaveLength(1);

                engine.ClearCache();
                expect(engine.Projects).toHaveLength(0);
            });
        });
    });

    // ========================================================================
    // ASSEMBLE CONTEXT WINDOW (pure static fold — shared by the cached client
    // path and the server-side fresh-per-request loaders)
    // ========================================================================
    describe('AssembleContextWindow', () => {
        const row = (sequence: number, role: string, message: string, summary?: string) => ({
            ID: `detail-${sequence}`,
            Sequence: sequence,
            Role: role,
            Message: message,
            SummaryOfEarlierConversation: summary || null,
        });

        it('no boundary → all messages, chronological, metadata stamped (plain rows, no entities)', () => {
            const window = ConversationEngine.AssembleContextWindow([
                row(2, 'AI', 'm2'), // deliberately out of order
                row(1, 'User', 'm1'),
                row(3, 'User', 'm3'),
            ]);
            expect(window.map(m => m.content)).toEqual(['m1', 'm2', 'm3']);
            expect(window.map(m => m.role)).toEqual(['user', 'assistant', 'user']);
            expect(window[0].metadata?.sequence).toBe(1);
            expect(window[0].metadata?.conversationDetailId).toBe('detail-1');
        });

        it('maxTailMessages caps the no-boundary window only', () => {
            const rows = [1, 2, 3, 4].map(n => row(n, 'User', `m${n}`));
            expect(ConversationEngine.AssembleContextWindow(rows, { maxTailMessages: 2 }).map(m => m.content)).toEqual(['m3', 'm4']);

            // With a boundary, the cap is deliberately ignored (post-boundary tail must stay whole)
            const withBoundary = [1, 2, 3, 4].map(n => row(n, 'User', `m${n}`, n === 3 ? 'SUMMARY' : undefined));
            const window = ConversationEngine.AssembleContextWindow(withBoundary, { maxTailMessages: 1 });
            expect(window).toHaveLength(3); // summary + boundary raw + tail
        });

        it('folds at the highest-sequence summary and includes the boundary row raw', () => {
            const rows = [1, 2, 3, 4].map(n => row(n, 'User', `m${n}`, n === 2 || n === 3 ? `SUMMARY@${n}` : undefined));
            const window = ConversationEngine.AssembleContextWindow(rows);
            expect(window[0].metadata?.isConversationSummary).toBe(true);
            expect(window[0].content).toBe('SUMMARY@3'); // highest wins (recursive pattern)
            expect(window.slice(1).map(m => m.content)).toEqual(['m3', 'm4']);
        });

        it('excludeDetailIds drops rows before boundary selection (UUID-case-insensitive)', () => {
            const rows = [1, 2, 3].map(n => row(n, 'User', `m${n}`, n === 3 ? 'SUMMARY' : undefined));
            const window = ConversationEngine.AssembleContextWindow(rows, { excludeDetailIds: ['DETAIL-3'] });
            // With the boundary row excluded, no summary participates → plain passthrough
            expect(window.every(m => !m.metadata?.isConversationSummary)).toBe(true);
            expect(window.map(m => m.content)).toEqual(['m1', 'm2']);
        });
    });

    // ========================================================================
    // REMOTE NEW-ROW SAVE → CACHE EVICTION (a warm cache would otherwise keep
    // serving without the row forever — loads short-circuit on cache hits)
    // ========================================================================
    describe('remote new-detail save eviction', () => {
        it('evicts the warm detail cache when a remote save arrives for an uncached row', async () => {
            enqueueDetailsResults([
                createMockDetail({ ID: 'd1', ConversationID: 'conv-1' }),
            ]);
            await engine.LoadConversationDetails('conv-1', contextUser);
            expect(engine.GetCachedDetails('conv-1')).toBeDefined();

            // Remote event: no baseEntity, new row ID not in the cache
            const internals = engine as unknown as {
                handleConversationDetailEntityEvent(event: Record<string, unknown>, action: string): boolean;
            };
            internals.handleConversationDetailEntityEvent({
                baseEntity: null,
                payload: { recordData: JSON.stringify({ ID: 'd-new', ConversationID: 'conv-1' }) },
            }, 'save');

            expect(engine.GetCachedDetails('conv-1')).toBeUndefined(); // next load re-queries
        });
    });

    // ========================================================================
    // LOAD DETAIL WINDOW (paged transcript read)
    // ========================================================================
    describe('LoadDetailWindow', () => {
        /**
         * Detail rows as the engine's fetch receives them: NEWEST FIRST, because the read is
         * `Sequence DESC`. `LoadDetailWindow` reverses them, so pass sequences descending.
         */
        function createWindowRows(
            sequences: number[],
            overrides: Record<string, unknown> = {}
        ): Array<Record<string, unknown>> {
            return sequences.map(seq => ({
                ID: `d-${seq}`,
                ConversationID: 'conv-1',
                Sequence: seq,
                AgentSessionID: null,
                Role: 'AI',
                UserID: null,
                ...overrides,
            }));
        }

        /** The two reads every successful window makes before peripherals: page, then probe. */
        function enqueuePageAndProbe(rows: Array<Record<string, unknown>>, hasMoreAbove: boolean) {
            runViewResultQueue.push({ Success: true, Results: rows });
            runViewResultQueue.push({
                Success: true,
                Results: hasMoreAbove ? [{ ID: 'older-row' }] : [],
            });
        }

        it('returns the newest page in chronological order with its Sequence bounds', async () => {
            // 10 of a notional 25 rows, newest-first as the DESC query returns them.
            enqueuePageAndProbe(createWindowRows([25, 24, 23, 22, 21, 20, 19, 18, 17, 16]), true);

            const result = await engine.LoadDetailWindow({ ConversationID: 'conv-1' }, contextUser);

            expect(result.Details).toHaveLength(10);
            // Reversed: the UI consumes oldest-to-newest.
            expect(result.Details.map(d => d.Sequence)).toEqual([16, 17, 18, 19, 20, 21, 22, 23, 24, 25]);
            expect(result.OldestSequence).toBe(16);
            expect(result.NewestSequence).toBe(25);
        });

        it('reports HasMoreAbove from a one-row probe below the oldest loaded Sequence', async () => {
            enqueuePageAndProbe(createWindowRows([20, 19, 18]), true);

            const result = await engine.LoadDetailWindow({ ConversationID: 'conv-1' }, contextUser);

            expect(result.HasMoreAbove).toBe(true);
            const probe = runViewParamsLog[1];
            expect(String(probe.ExtraFilter)).toContain('Sequence < 18');
            expect(probe.MaxRows).toBe(1);
            // A probe must never pay for entity hydration.
            expect(probe.ResultType).toBe('simple');
        });

        it('reports HasMoreAbove false when the probe comes back empty', async () => {
            enqueuePageAndProbe(createWindowRows([3, 2, 1]), false);

            const result = await engine.LoadDetailWindow({ ConversationID: 'conv-1' }, contextUser);

            expect(result.HasMoreAbove).toBe(false);
        });

        it('seeks on Sequence — never on the primary key — for the latest window', async () => {
            enqueuePageAndProbe(createWindowRows([2, 1]), false);

            await engine.LoadDetailWindow({ ConversationID: 'conv-1' }, contextUser);

            const fetch = runViewParamsLog[0];
            expect(fetch.EntityName).toBe('MJ: Conversation Details');
            expect(fetch.ExtraFilter).toBe(`ConversationID='conv-1'`);
            expect(fetch.OrderBy).toBe('Sequence DESC');
            expect(fetch.AfterKey).toBeUndefined();
        });

        it('treats BeforeSequence 0 as a real bound, not as "latest window"', async () => {
            // `Sequence` defaults to 0, so very old conversations can genuinely hold row 0.
            // The bound check must be `== null`, never falsy — `if (!before)` would turn a
            // request for "everything below row 0" into a request for the newest page.
            enqueuePageAndProbe(createWindowRows([]), false);

            await engine.LoadDetailWindow(
                { ConversationID: 'conv-1', BeforeSequence: 0 },
                contextUser
            );

            expect(String(runViewParamsLog[0].ExtraFilter)).toContain('Sequence < 0');
        });

        it('probes below Sequence 0 when the oldest loaded row is row 0', async () => {
            enqueuePageAndProbe(createWindowRows([2, 1, 0]), false);

            const result = await engine.LoadDetailWindow({ ConversationID: 'conv-1' }, contextUser);

            expect(result.OldestSequence).toBe(0);
            expect(String(runViewParamsLog[1].ExtraFilter)).toContain('Sequence < 0');
        });

        it('bounds an older page with Sequence < BeforeSequence', async () => {
            enqueuePageAndProbe(createWindowRows([15, 14, 13]), true);

            await engine.LoadDetailWindow(
                { ConversationID: 'conv-1', BeforeSequence: 16 },
                contextUser
            );

            expect(String(runViewParamsLog[0].ExtraFilter)).toContain('Sequence < 16');
        });

        it('honors RawOverread, and defaults it to three times the page size', async () => {
            enqueuePageAndProbe(createWindowRows([1]), false);
            await engine.LoadDetailWindow(
                { ConversationID: 'conv-1', RawOverread: 75 },
                contextUser
            );
            expect(runViewParamsLog[0].MaxRows).toBe(75);

            runViewParamsLog = [];
            enqueuePageAndProbe(createWindowRows([1]), false);
            await engine.LoadDetailWindow({ ConversationID: 'conv-1', PageSize: 10 }, contextUser);
            // Over-read exists because a page of N rows can collapse to ONE session card.
            expect(runViewParamsLog[0].MaxRows).toBe(30);
        });

        it('returns an empty window and does not throw when the row read fails', async () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            runViewResultQueue.push({ Success: false, Results: [], ErrorMessage: 'boom' });

            const result = await engine.LoadDetailWindow({ ConversationID: 'conv-1' }, contextUser);

            expect(result.Details).toEqual([]);
            expect(result.HasMoreAbove).toBe(false);
            expect(result.OldestSequence).toBeNull();
            expect(result.NewestSequence).toBeNull();
            expect(result.AgentRunsByDetailId.size).toBe(0);
            // The flag is the whole point: an empty window from a FAILED read must not be
            // mistaken for the start of the conversation by whoever holds the paging cursor.
            expect(result.Failed).toBe(true);
            expect(errorSpy).toHaveBeenCalled();
        });

        it('returns an empty window for a conversation with no rows', async () => {
            runViewResultQueue.push({ Success: true, Results: [] });

            const result = await engine.LoadDetailWindow({ ConversationID: 'conv-1' }, contextUser);

            expect(result.Details).toEqual([]);
            expect(result.HasMoreAbove).toBe(false);
            // No probe, no peripheral batch — nothing to load peripherals FOR.
            expect(runViewsBatchLog).toHaveLength(0);
        });

        it('completes a realtime session the page landed part-way through', async () => {
            // Newest-first; the LAST entry becomes the oldest row after the reversal.
            runViewResultQueue.push({
                Success: true,
                Results: [
                    ...createWindowRows([20, 19]),
                    ...createWindowRows([18], { AgentSessionID: 'sess-a' }),
                ],
            });
            // The session's remaining rows, also newest-first.
            runViewResultQueue.push({
                Success: true,
                Results: createWindowRows([17, 16], { AgentSessionID: 'sess-a' }),
            });
            runViewResultQueue.push({ Success: true, Results: [] }); // probe

            const result = await engine.LoadDetailWindow({ ConversationID: 'conv-1' }, contextUser);

            const expansion = runViewParamsLog[1];
            expect(String(expansion.ExtraFilter)).toContain(`AgentSessionID='sess-a'`);
            expect(String(expansion.ExtraFilter)).toContain('Sequence < 18');
            // Bounded so one pathological session cannot drag in the whole conversation.
            expect(expansion.MaxRows).toBe(200);

            expect(result.Details.map(d => d.Sequence)).toEqual([16, 17, 18, 19, 20]);
            expect(result.OldestSequence).toBe(16);
        });

        it('issues no expansion read when the oldest row is a normal message', async () => {
            enqueuePageAndProbe(createWindowRows([20, 19, 18]), false);

            await engine.LoadDetailWindow({ ConversationID: 'conv-1' }, contextUser);

            // Second call is the probe, not a session read.
            expect(String(runViewParamsLog[1].ExtraFilter)).not.toContain('AgentSessionID');
            expect(runViewParamsLog[1].MaxRows).toBe(1);
        });

        it('treats a whitespace-only session stamp as unstamped', async () => {
            enqueuePageAndProbe(
                [...createWindowRows([20]), ...createWindowRows([19], { AgentSessionID: '   ' })],
                false
            );

            await engine.LoadDetailWindow({ ConversationID: 'conv-1' }, contextUser);

            expect(String(runViewParamsLog[1].ExtraFilter)).not.toContain('AgentSessionID');
        });

        it('loads peripherals in ONE batch scoped to the window ids, not a per-row loop', async () => {
            enqueuePageAndProbe(createWindowRows([2, 1]), false);

            await engine.LoadDetailWindow({ ConversationID: 'conv-1' }, contextUser);

            expect(runViewsBatchLog).toHaveLength(1);
            const batch = runViewsBatchLog[0];
            expect(batch.map(p => p.EntityName)).toEqual([
                'MJ: AI Agent Runs',
                'MJ: Conversation Detail Ratings',
                'MJ: Conversation Detail Artifacts',
            ]);
            for (const params of batch) {
                expect(String(params.ExtraFilter)).toContain(
                    `ConversationDetailID IN ('d-1','d-2')`
                );
            }
            // Mirrors GetConversationComplete — input artifacts are not rendered.
            expect(String(batch[2].ExtraFilter)).toContain(`Direction='Output'`);
        });

        it('rebuilds artifact cards from the junction, version, and artifact rows', async () => {
            enqueuePageAndProbe(createWindowRows([1]), false);
            // Peripheral batch: agent runs, ratings, then one artifact junction row.
            runViewResultQueue.push({ Success: true, Results: [] });
            runViewResultQueue.push({ Success: true, Results: [] });
            runViewResultQueue.push({
                Success: true,
                Results: [{
                    ID: 'j-1',
                    ConversationDetailID: 'd-1',
                    ArtifactVersionID: 'ver-1',
                    Direction: 'Output',
                }],
            });
            // Follow-up hops: the version, then its artifact.
            runViewResultQueue.push({
                Success: true,
                Results: [{
                    ID: 'ver-1',
                    ArtifactID: 'art-1',
                    VersionNumber: 3,
                    Name: 'v3',
                    Description: 'third pass',
                    __mj_CreatedAt: new Date('2026-01-02'),
                }],
            });
            runViewResultQueue.push({
                Success: true,
                Results: [{
                    ID: 'art-1',
                    Name: 'Sales Report',
                    Type: 'Report',
                    Description: 'Q1 numbers',
                    Visibility: 'Public',
                }],
            });

            const result = await engine.LoadDetailWindow({ ConversationID: 'conv-1' }, contextUser);

            const artifacts = result.ArtifactsByDetailId.get('d-1');
            expect(artifacts).toHaveLength(1);
            expect(artifacts?.[0].ArtifactName).toBe('Sales Report');
            expect(artifacts?.[0].ArtifactType).toBe('Report');
            expect(artifacts?.[0].VersionNumber).toBe(3);
            expect(artifacts?.[0].Visibility).toBe('Public');
        });

        it('drops an artifact whose version or artifact row is missing (INNER JOIN parity)', async () => {
            enqueuePageAndProbe(createWindowRows([1]), false);
            runViewResultQueue.push({ Success: true, Results: [] });
            runViewResultQueue.push({ Success: true, Results: [] });
            runViewResultQueue.push({
                Success: true,
                Results: [{
                    ID: 'j-1',
                    ConversationDetailID: 'd-1',
                    ArtifactVersionID: 'ver-missing',
                    Direction: 'Output',
                }],
            });
            runViewResultQueue.push({ Success: true, Results: [] }); // version not found

            const result = await engine.LoadDetailWindow({ ConversationID: 'conv-1' }, contextUser);

            expect(result.ArtifactsByDetailId.size).toBe(0);
        });

        it('keys agent runs by their conversation detail', async () => {
            enqueuePageAndProbe(createWindowRows([2, 1]), false);
            runViewResultQueue.push({
                Success: true,
                Results: [createMockAgentRun({ ID: 'run-1', ConversationDetailID: 'd-2' })],
            });

            const result = await engine.LoadDetailWindow({ ConversationID: 'conv-1' }, contextUser);

            expect(result.AgentRunsByDetailId.get('d-2')).toBeDefined();
            expect(result.AgentRunsByDetailId.has('d-1')).toBe(false);
        });

        it('does NOT populate the full-history detail cache', async () => {
            // The invariant that protects agents: _detailCache is keyed by conversation id
            // alone and GetAgentContextWindow reads it as COMPLETE history. A window written
            // there would silently drop everything before the summary boundary.
            enqueuePageAndProbe(createWindowRows([25, 24, 23]), true);

            await engine.LoadDetailWindow({ ConversationID: 'conv-1' }, contextUser);

            expect(engine.GetCachedDetails('conv-1')).toBeUndefined();
            expect(engine.HasCachedDetails('conv-1')).toBe(false);
        });

        it('distinguishes an empty conversation from a failed read', async () => {
            // Same rows (none), same HasMoreAbove (false) — `Failed` is the ONLY thing that
            // separates "there is nothing here" from "we could not find out".
            runViewResultQueue.push({ Success: true, Results: [] });

            const result = await engine.LoadDetailWindow({ ConversationID: 'conv-1' }, contextUser);

            expect(result.Details).toEqual([]);
            expect(result.HasMoreAbove).toBe(false);
            expect(result.Failed).toBe(false);
        });

        it('flags a failed older-rows probe while still returning the rows it read', async () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            // The page read succeeds; only the probe fails. Its `false` is indistinguishable
            // from a real "nothing older", so the rows are kept and the window is flagged.
            runViewResultQueue.push({ Success: true, Results: createWindowRows([20, 19, 18]) });
            runViewResultQueue.push({ Success: false, Results: [], ErrorMessage: 'probe boom' });

            const result = await engine.LoadDetailWindow({ ConversationID: 'conv-1' }, contextUser);

            expect(result.Details).toHaveLength(3);
            expect(result.HasMoreAbove).toBe(false);
            expect(result.Failed).toBe(true);
            expect(errorSpy).toHaveBeenCalled();
        });

        it('does not flag a window whose PERIPHERALS failed — the transcript still renders', async () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            enqueuePageAndProbe(createWindowRows([20, 19, 18]), true);
            // Peripheral reads already degrade to empty maps by design. Flagging them would
            // make the caller refuse a window it can perfectly well display.
            runViewResultQueue.push({ Success: false, Results: [], ErrorMessage: 'runs boom' });

            const result = await engine.LoadDetailWindow({ ConversationID: 'conv-1' }, contextUser);

            expect(result.Details).toHaveLength(3);
            expect(result.Failed).toBe(false);
            errorSpy.mockRestore();
        });
    });

    // ======================================================================
    // sortConversations with string dates (poisoned cache)
    // ======================================================================

    /**
     * `ConversationEngine` is a `BaseEngine` subclass, so `_conversations` is an engine-cached
     * array — the same class of array a cross-server cache event can replace with plain JSON
     * objects whose `__mj_UpdatedAt` is a raw ISO string. Pre-fix this comparator called
     * `.getTime()` on it directly, which throws in exactly that state.
     *
     * `BaseEngine.OnExternalCacheChange` no longer produces that state, so this is defence in
     * depth rather than the live crash path — but the comparator is the one remaining unguarded
     * date sort over an engine cache, so it gets the same guarantee as the agent-context sorts.
     */
    describe('sortConversations tolerates string dates', () => {
        const OLDER = '2026-08-01T00:00:00.000Z';
        const NEWER = '2026-08-02T00:00:00.000Z';

        type SortAccess = {
            sortConversations(conversations: Array<Record<string, unknown>>): Array<Record<string, unknown>>;
        };

        function sort(rows: Array<Record<string, unknown>>): string[] {
            const sorted = (engine as unknown as SortAccess).sortConversations(rows);
            return sorted.map((c) => c.ID as string);
        }

        it('sorts newest-first on string dates instead of throwing', () => {
            expect(sort([
                { ID: 'old', IsPinned: false, __mj_UpdatedAt: OLDER },
                { ID: 'new', IsPinned: false, __mj_UpdatedAt: NEWER },
            ])).toEqual(['new', 'old']);
        });

        it('still puts pinned conversations first', () => {
            expect(sort([
                { ID: 'unpinned-new', IsPinned: false, __mj_UpdatedAt: NEWER },
                { ID: 'pinned-old', IsPinned: true, __mj_UpdatedAt: OLDER },
            ])).toEqual(['pinned-old', 'unpinned-new']);
        });

        it('handles a mixed array of real Date and string dates', () => {
            expect(sort([
                { ID: 'string-old', IsPinned: false, __mj_UpdatedAt: OLDER },
                { ID: 'date-new', IsPinned: false, __mj_UpdatedAt: new Date(NEWER) },
            ])).toEqual(['date-new', 'string-old']);
        });

        it('treats missing and unparseable dates as epoch 0 rather than NaN', () => {
            expect(sort([
                { ID: 'garbage', IsPinned: false, __mj_UpdatedAt: 'not-a-date' },
                { ID: 'dated', IsPinned: false, __mj_UpdatedAt: OLDER },
                { ID: 'missing', IsPinned: false, __mj_UpdatedAt: null },
            ])).toEqual(['dated', 'garbage', 'missing']);
        });

        it('does not mutate the caller\'s array', () => {
            const input = [
                { ID: 'old', IsPinned: false, __mj_UpdatedAt: OLDER },
                { ID: 'new', IsPinned: false, __mj_UpdatedAt: NEWER },
            ];
            (engine as unknown as SortAccess).sortConversations(input);
            expect(input.map((c) => c.ID)).toEqual(['old', 'new']);
        });
    });
});
