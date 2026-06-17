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
            RunView() {
                return Promise.resolve(nextRunViewResult());
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
        const d = detail as Record<string, unknown>;
        const detailId = d['ID'] as string;
        // Find agent runs matching this detail
        const matchingRuns = agentRuns.filter(
            (r) => (r as Record<string, unknown>)['ConversationDetailID'] === detailId
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
            expect((found as Record<string, unknown>)['IsPinned']).toBe(true);
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
            expect((retrieved as Record<string, unknown>)['ID']).toBe('run-1');
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
            expect((cached![0] as Record<string, unknown>)['extraField']).toBe('updated');
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
            return {
                ID: overrides['ID'] ?? 'p1',
                Name: overrides['Name'] ?? 'Folder',
                EnvironmentID: overrides['EnvironmentID'] ?? 'env-1',
                ParentID: overrides['ParentID'] ?? null,
                IsArchived: overrides['IsArchived'] ?? false,
                Save: vi.fn().mockResolvedValue(true),
                Delete: vi.fn().mockResolvedValue(true),
                GetAll: vi.fn().mockReturnValue({}),
                LatestResult: { Success: true, CompleteMessage: '' },
                ...overrides,
            };
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
});
