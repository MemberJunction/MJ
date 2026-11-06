/**
 * @fileoverview Tests for the assignment strategy resolution chain in AgentFeedbackCoordinator.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentFeedbackCoordinator } from '../AgentFeedbackCoordinator';
import {
    AgentRequestAssignmentStrategy,
    type ExecuteAgentParams,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentTypeEntityExtended,
} from '@memberjunction/ai-core-plus';
import type {
    MJAIAgentCategoryEntity,
    MJAIAgentRequestTypeEntity,
} from '@memberjunction/core-entities';
import {
    type IMetadataProvider,
    type RunViewParams,
    type RunViewResult,
    type UserInfo,
} from '@memberjunction/core';

const mockRunViews = vi.fn<(views: RunViewParams[], contextUser?: UserInfo) => Promise<RunViewResult[]>>();

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, Object>>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogErrorEx: vi.fn(),
        IsVerboseLoggingEnabled: vi.fn(() => false),
        RunView: class MockRunView {
            public static FromMetadataProvider(_provider: IMetadataProvider): MockRunView {
                return new MockRunView();
            }
            public async RunViews(views: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult[]> {
                return mockRunViews(views, contextUser);
            }
        },
    };
});

const mockAgentTypes: MJAIAgentTypeEntityExtended[] = [];
const mockAgentCategories: MJAIAgentCategoryEntity[] = [];
const mockAgentRequestTypes: MJAIAgentRequestTypeEntity[] = [];

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                get AgentTypes(): MJAIAgentTypeEntityExtended[] {
                    return mockAgentTypes;
                },
                get AgentCategories(): MJAIAgentCategoryEntity[] {
                    return mockAgentCategories;
                },
                get AgentRequestTypes(): MJAIAgentRequestTypeEntity[] {
                    return mockAgentRequestTypes;
                },
            };
        },
    },
}));

const USER_A = 'AAAA-1111';
const USER_B = 'BBBB-2222';
const USER_C = 'CCCC-3333';

const AGENT_TYPE_LOOP: Partial<MJAIAgentTypeEntityExtended> = {
    ID: 'type-loop',
    AssignmentStrategy: null,
};
const AGENT_TYPE_FLOW: Partial<MJAIAgentTypeEntityExtended> = {
    ID: 'type-flow',
    AssignmentStrategy: JSON.stringify({ type: 'AgentOwner' }),
};

const CATEGORIES: Array<Partial<MJAIAgentCategoryEntity>> = [
    { ID: 'cat-root', ParentID: null, AssignmentStrategy: JSON.stringify({ type: 'RunUser', priority: 25 }) },
    { ID: 'cat-assistant', ParentID: 'cat-root', AssignmentStrategy: null },
    { ID: 'cat-research', ParentID: 'cat-root', AssignmentStrategy: JSON.stringify({ type: 'SpecificUser', userID: USER_C }) },
    { ID: 'cat-deep-research', ParentID: 'cat-research', AssignmentStrategy: null },
];

const RT_APPROVAL: Partial<MJAIAgentRequestTypeEntity> = {
    ID: 'rt-approval',
    DefaultAssignmentStrategy: JSON.stringify({ type: 'AgentOwner', priority: 80 }),
};
const RT_CHAT: Partial<MJAIAgentRequestTypeEntity> = {
    ID: 'rt-chat',
    DefaultAssignmentStrategy: null,
};

function makeAgent(overrides: Partial<MJAIAgentEntityExtended> = {}): MJAIAgentEntityExtended {
    const base: Partial<MJAIAgentEntityExtended> = {
        ID: 'agent-1',
        Name: 'TestAgent',
        OwnerUserID: USER_B,
        TypeID: 'type-loop',
        CategoryID: 'cat-assistant',
        ...overrides,
    };
    return base as MJAIAgentEntityExtended;
}

function makeParams(overrides: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    const caller: Partial<UserInfo> = { ID: USER_A };
    return {
        agent: makeAgent(),
        conversationMessages: [],
        contextUser: caller as UserInfo,
        ...overrides,
    };
}

function makeViewResult<T>(results: T[], success: boolean = true): RunViewResult<T> {
    return {
        Success: success,
        Results: results,
        RowCount: results.length,
        TotalRowCount: results.length,
        ExecutionTime: 1,
        ErrorMessage: success ? '' : 'Simulated view failure',
        UserViewRunID: '',
    };
}

describe('AgentFeedbackCoordinator assignment resolution', () => {
    let coordinator: AgentFeedbackCoordinator;

    beforeEach(() => {
        vi.resetAllMocks();
        mockAgentTypes.length = 0;
        mockAgentCategories.length = 0;
        mockAgentRequestTypes.length = 0;
        coordinator = new AgentFeedbackCoordinator();
    });

    describe('ResolveAssignmentStrategy', () => {
        it('should return per-invocation strategy when provided (highest priority)', async () => {
            mockAgentTypes.push(AGENT_TYPE_LOOP as MJAIAgentTypeEntityExtended);
            mockAgentCategories.push(...(CATEGORIES as MJAIAgentCategoryEntity[]));
            mockAgentRequestTypes.push(RT_APPROVAL as MJAIAgentRequestTypeEntity);

            const perInvocation: AgentRequestAssignmentStrategy = { type: 'SpecificUser', userID: USER_C };
            const result = await coordinator.ResolveAssignmentStrategy(
                makeParams({ assignmentStrategy: perInvocation }),
                'rt-approval'
            );
            expect(result).toEqual(perInvocation);
        });

        it('should return agent type strategy when no per-invocation strategy', async () => {
            mockAgentTypes.push(
                AGENT_TYPE_LOOP as MJAIAgentTypeEntityExtended,
                AGENT_TYPE_FLOW as MJAIAgentTypeEntityExtended
            );
            const result = await coordinator.ResolveAssignmentStrategy(
                makeParams({ agent: makeAgent({ TypeID: 'type-flow' }) }),
                null
            );
            expect(result).toEqual({ type: 'AgentOwner' });
        });

        it('should walk category tree and find strategy on parent', async () => {
            mockAgentTypes.push(AGENT_TYPE_LOOP as MJAIAgentTypeEntityExtended);
            mockAgentCategories.push(...(CATEGORIES as MJAIAgentCategoryEntity[]));
            const result = await coordinator.ResolveAssignmentStrategy(makeParams(), null);
            expect(result).toEqual({ type: 'RunUser', priority: 25 });
        });

        it('should find strategy on the direct category (not walk further up)', async () => {
            mockAgentTypes.push(AGENT_TYPE_LOOP as MJAIAgentTypeEntityExtended);
            mockAgentCategories.push(...(CATEGORIES as MJAIAgentCategoryEntity[]));
            const result = await coordinator.ResolveAssignmentStrategy(
                makeParams({ agent: makeAgent({ CategoryID: 'cat-research' }) }),
                null
            );
            expect(result).toEqual({ type: 'SpecificUser', userID: USER_C });
        });

        it('should walk up from deep-research to research (skip to first strategy)', async () => {
            mockAgentTypes.push(AGENT_TYPE_LOOP as MJAIAgentTypeEntityExtended);
            mockAgentCategories.push(...(CATEGORIES as MJAIAgentCategoryEntity[]));
            const result = await coordinator.ResolveAssignmentStrategy(
                makeParams({ agent: makeAgent({ CategoryID: 'cat-deep-research' }) }),
                null
            );
            expect(result).toEqual({ type: 'SpecificUser', userID: USER_C });
        });

        it('should fall back to request type strategy when category tree is empty', async () => {
            mockAgentTypes.push(AGENT_TYPE_LOOP as MJAIAgentTypeEntityExtended);
            mockAgentRequestTypes.push(RT_APPROVAL as MJAIAgentRequestTypeEntity);
            const result = await coordinator.ResolveAssignmentStrategy(
                makeParams({ agent: makeAgent({ CategoryID: null }) }),
                'rt-approval'
            );
            expect(result).toEqual({ type: 'AgentOwner', priority: 80 });
        });

        it('should return null when no strategy is found anywhere', async () => {
            mockAgentTypes.push(AGENT_TYPE_LOOP as MJAIAgentTypeEntityExtended);
            mockAgentRequestTypes.push(RT_CHAT as MJAIAgentRequestTypeEntity);
            const result = await coordinator.ResolveAssignmentStrategy(
                makeParams({ agent: makeAgent({ CategoryID: null }) }),
                'rt-chat'
            );
            expect(result).toBeNull();
        });

        it('should return null when all lookups miss (no matching type, no category, no RT)', async () => {
            mockAgentTypes.push(AGENT_TYPE_LOOP as MJAIAgentTypeEntityExtended);
            mockAgentCategories.push(...(CATEGORIES as MJAIAgentCategoryEntity[]));
            mockAgentRequestTypes.push(RT_APPROVAL as MJAIAgentRequestTypeEntity);
            const result = await coordinator.ResolveAssignmentStrategy(
                makeParams({ agent: makeAgent({ TypeID: 'nonexistent', CategoryID: 'nonexistent' }) }),
                'nonexistent'
            );
            expect(result).toBeNull();
        });
    });

    describe('ResolveCategoryAssignmentStrategy', () => {
        beforeEach(() => {
            mockAgentCategories.push(...(CATEGORIES as MJAIAgentCategoryEntity[]));
        });

        it('should return null for null categoryId', async () => {
            expect(
                await coordinator.ResolveCategoryAssignmentStrategy(
                    makeParams({ agent: makeAgent({ CategoryID: null }) })
                )
            ).toBeNull();
        });

        it('should return null for unknown category', async () => {
            expect(
                await coordinator.ResolveCategoryAssignmentStrategy(
                    makeParams({ agent: makeAgent({ CategoryID: 'unknown' }) })
                )
            ).toBeNull();
        });

        it('should return strategy from direct category', async () => {
            expect(
                await coordinator.ResolveCategoryAssignmentStrategy(
                    makeParams({ agent: makeAgent({ CategoryID: 'cat-root' }) })
                )
            ).toEqual({
                type: 'RunUser',
                priority: 25,
            });
        });

        it('should walk up to parent when direct category has no strategy', async () => {
            expect(
                await coordinator.ResolveCategoryAssignmentStrategy(
                    makeParams({ agent: makeAgent({ CategoryID: 'cat-assistant' }) })
                )
            ).toEqual({
                type: 'RunUser',
                priority: 25,
            });
        });

        it('should stop at the first non-null strategy in the chain', async () => {
            expect(
                await coordinator.ResolveCategoryAssignmentStrategy(
                    makeParams({ agent: makeAgent({ CategoryID: 'cat-deep-research' }) })
                )
            ).toEqual({
                type: 'SpecificUser',
                userID: USER_C,
            });
        });

        it('should handle circular ParentID references without infinite loop', async () => {
            mockAgentCategories.length = 0;
            mockAgentCategories.push(
                { ID: 'a', ParentID: 'b', AssignmentStrategy: null } as MJAIAgentCategoryEntity,
                { ID: 'b', ParentID: 'a', AssignmentStrategy: null } as MJAIAgentCategoryEntity
            );
            expect(
                await coordinator.ResolveCategoryAssignmentStrategy(
                    makeParams({ agent: makeAgent({ CategoryID: 'a' }) })
                )
            ).toBeNull();
        });

        it('should handle self-referencing ParentID', async () => {
            mockAgentCategories.length = 0;
            mockAgentCategories.push({
                ID: 'self',
                ParentID: 'self',
                AssignmentStrategy: null,
            } as MJAIAgentCategoryEntity);
            expect(
                await coordinator.ResolveCategoryAssignmentStrategy(
                    makeParams({ agent: makeAgent({ CategoryID: 'self' }) })
                )
            ).toBeNull();
        });
    });

    describe('ResolveAssigneeUserID and ResolveStaticAssigneeUserID', () => {
        const defaultRun: Partial<MJAIAgentRunEntityExtended> = { UserID: USER_C };

        describe('when strategy is null (fallback)', () => {
            it('should return contextUser ID', () => {
                expect(
                    coordinator.ResolveStaticAssigneeUserID(
                        null,
                        makeParams(),
                        defaultRun as MJAIAgentRunEntityExtended
                    )
                ).toBe(USER_A);
            });

            it('should return null if no contextUser', () => {
                expect(
                    coordinator.ResolveStaticAssigneeUserID(
                        null,
                        makeParams({ contextUser: undefined }),
                        null
                    )
                ).toBeNull();
            });
        });

        describe('RunUser strategy', () => {
            const strategy: AgentRequestAssignmentStrategy = { type: 'RunUser' };

            it('should return contextUser ID', () => {
                expect(
                    coordinator.ResolveStaticAssigneeUserID(
                        strategy,
                        makeParams(),
                        defaultRun as MJAIAgentRunEntityExtended
                    )
                ).toBe(USER_A);
            });

            it('should fall back to agentRun UserID when no contextUser', () => {
                expect(
                    coordinator.ResolveStaticAssigneeUserID(
                        strategy,
                        makeParams({ contextUser: undefined }),
                        defaultRun as MJAIAgentRunEntityExtended
                    )
                ).toBe(USER_C);
            });

            it('should return null when no contextUser and no agentRun', () => {
                expect(
                    coordinator.ResolveStaticAssigneeUserID(
                        strategy,
                        makeParams({ contextUser: undefined }),
                        null
                    )
                ).toBeNull();
            });
        });

        describe('AgentOwner strategy', () => {
            const strategy: AgentRequestAssignmentStrategy = { type: 'AgentOwner' };

            it('should return agent OwnerUserID', () => {
                expect(coordinator.ResolveStaticAssigneeUserID(strategy, makeParams(), null)).toBe(USER_B);
            });

            it('should return null when agent has no OwnerUserID', () => {
                expect(
                    coordinator.ResolveStaticAssigneeUserID(
                        strategy,
                        makeParams({ agent: makeAgent({ OwnerUserID: null }) }),
                        null
                    )
                ).toBeNull();
            });
        });

        describe('SpecificUser strategy', () => {
            it('should return the specified userID', () => {
                const strategy: AgentRequestAssignmentStrategy = {
                    type: 'SpecificUser',
                    userID: 'specific-user',
                };
                expect(coordinator.ResolveStaticAssigneeUserID(strategy, makeParams(), null)).toBe(
                    'specific-user'
                );
            });

            it('should return null when userID is not set', () => {
                const strategy: AgentRequestAssignmentStrategy = { type: 'SpecificUser' };
                expect(coordinator.ResolveStaticAssigneeUserID(strategy, makeParams(), null)).toBeNull();
            });
        });

        describe('List strategy', () => {
            it('should resolve active list member via ResolveAssigneeUserID (RoundRobin)', async () => {
                mockRunViews
                    .mockResolvedValueOnce([
                        makeViewResult([{ ID: 'some-list', EntityID: 'e-users', Entity: 'MJ: Users' }]),
                        makeViewResult([
                            { ID: 'ld-1', RecordID: USER_B, Sequence: 1, Status: 'Pending' },
                            { ID: 'ld-2', RecordID: USER_C, Sequence: 2, Status: 'Pending' },
                        ]),
                    ])
                    .mockResolvedValueOnce([
                        makeViewResult([
                            { ID: USER_B, IsActive: true },
                            { ID: USER_C, IsActive: true },
                        ]),
                        makeViewResult([]),
                    ]);

                const strategy: AgentRequestAssignmentStrategy = {
                    type: 'List',
                    listID: 'some-list',
                    listStrategy: 'RoundRobin',
                };
                expect(await coordinator.ResolveAssigneeUserID(strategy, makeParams(), null)).toBe(USER_B);
            });

            it('should return null when list has no members and no contextUser is available', async () => {
                mockRunViews.mockResolvedValueOnce([
                    makeViewResult([{ ID: 'some-list', EntityID: 'e-users', Entity: 'MJ: Users' }]),
                    makeViewResult([]),
                ]);
                const strategy: AgentRequestAssignmentStrategy = { type: 'List', listID: 'some-list' };
                expect(
                    await coordinator.ResolveAssigneeUserID(
                        strategy,
                        makeParams({ contextUser: undefined }),
                        null
                    )
                ).toBeNull();
            });
        });

        describe('SharedInbox strategy', () => {
            it('should always return null (unassigned)', () => {
                const strategy: AgentRequestAssignmentStrategy = { type: 'SharedInbox', listID: 'inbox' };
                expect(coordinator.ResolveStaticAssigneeUserID(strategy, makeParams(), null)).toBeNull();
            });
        });
    });
});
