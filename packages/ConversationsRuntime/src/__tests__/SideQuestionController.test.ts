import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { firstValueFrom } from 'rxjs';

const hoisted = vi.hoisted(() => ({
    loadSideConversations: vi.fn(),
    loadSideConversationDetails: vi.fn(),
    getSideConversationSummary: vi.fn(),
    getOrCreateSideConversation: vi.fn(),
    clearSideConversation: vi.fn(),
    runAgentFromDetail: vi.fn(),
    resolveDefaultAgent: vi.fn(),
}));

const hoistedAgents = vi.hoisted(() => ({
    Config: vi.fn().mockResolvedValue(undefined),
    ReadableAgents: [
        {
            ID: 'agent-sage',
            Name: 'Sage',
            Status: 'Active',
            ParentID: null,
            InvocationMode: 'Top-Level',
        },
        {
            ID: 'agent-research',
            Name: 'Research Agent',
            Status: 'Active',
            ParentID: null,
            InvocationMode: 'Top-Level',
        },
        {
            ID: 'agent-qb',
            Name: 'Query Builder',
            Status: 'Active',
            ParentID: null,
            InvocationMode: 'Top-Level',
        },
    ],
    Agents: [] as Array<{
        ID: string;
        Name: string;
        Status: string;
        ParentID: string | null;
        InvocationMode: string;
    }>,
}));

vi.mock('@memberjunction/core-entities', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core-entities')>('@memberjunction/core-entities');
    return {
        ...actual,
        ConversationEngine: {
            Instance: {
                LoadSideConversations: hoisted.loadSideConversations,
                LoadSideConversationDetails: hoisted.loadSideConversationDetails,
                GetSideConversationSummary: hoisted.getSideConversationSummary,
                GetOrCreateSideConversation: hoisted.getOrCreateSideConversation,
                ClearSideConversation: hoisted.clearSideConversation,
            },
        },
    };
});

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: {
        Instance: hoistedAgents,
    },
    AIAgentPermissionHelper: {
        HasPermission: vi.fn().mockResolvedValue(true),
    },
}));

vi.mock('@memberjunction/ai-agent-client', () => {
    class MockAgentClientSession {
        public Provider: IMetadataProvider | null = null;
        public RunAgentFromConversationDetail = hoisted.runAgentFromDetail;
        public GetRegisteredTools() {
            return [];
        }
    }
    return {
        AgentClientSession: MockAgentClientSession,
        ClientToolRegistry: class {},
    };
});

import { ClientToolRegistry, RunAgentFromConversationDetailParams } from '@memberjunction/ai-agent-client';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { ConversationsRuntime } from '../ConversationsRuntime';
import { ConversationAgentRunner } from '../agent-runner/ConversationAgentRunner';
import { DefaultAgentResolver } from '../default-agent/DefaultAgentResolver';
import { ConversationStreaming, MessageProgressCallback } from '../streaming/ConversationStreaming';
import { SideQuestionController } from '../side-questions/SideQuestionController';

function createUser(id = 'user-1'): UserInfo {
    return new UserInfo(undefined, { ID: id, Name: id, Email: `${id}@example.com` });
}

interface MockDetailEntity {
    ID: string;
    ConversationID: string;
    Role: string;
    Message: string;
    UserID: string;
    Status: string;
    Save: () => Promise<boolean>;
}

function createProvider(storedMessages: MockDetailEntity[]): IMetadataProvider {
    let seq = 0;
    return {
        ProviderType: 'Database' as const,
        CurrentUser: createUser(),
        GetEntityObject: vi.fn(async () => {
            seq++;
            const row: MockDetailEntity = {
                ID: `user-detail-${seq}`,
                ConversationID: '',
                Role: 'User',
                Message: '',
                UserID: '',
                Status: 'Complete',
                Save: async () => {
                    storedMessages.push({ ...row });
                    return true;
                },
            };
            return row;
        }),
    } as unknown as IMetadataProvider;
}

describe('SideQuestionController', () => {
    const user = createUser();
    let streaming: ConversationStreaming;
    let resolver: DefaultAgentResolver;
    let runner: ConversationAgentRunner;
    let controller: SideQuestionController;

    beforeEach(() => {
        vi.clearAllMocks();
        streaming = new ConversationStreaming(ConversationsRuntime.Instance);
        resolver = {
            resolve: hoisted.resolveDefaultAgent,
        } as DefaultAgentResolver;
        runner = new ConversationAgentRunner(
            ConversationsRuntime.Instance,
            new ClientToolRegistry(),
            resolver
        );
        controller = new SideQuestionController(
            runner,
            resolver,
            streaming
        );
        hoisted.resolveDefaultAgent.mockImplementation(async (opts?: { explicitAgentId?: string | null }) => {
            if (opts?.explicitAgentId) {
                return (
                    hoistedAgents.ReadableAgents.find((a) => a.ID === opts.explicitAgentId) ?? {
                        ID: opts.explicitAgentId,
                        Name: opts.explicitAgentId,
                        Status: 'Active',
                    }
                );
            }
            return {
                ID: 'agent-sage',
                Name: 'Sage',
                Status: 'Active',
            };
        });
        hoistedAgents.Agents = [...hoistedAgents.ReadableAgents];
    });

    it('isolates scope keys by parent conversation and branch/main', () => {
        expect(SideQuestionController.ScopeKey('ABC', null)).toBe('abc::main');
        expect(SideQuestionController.ScopeKey('ABC', 'DEF')).toBe('abc::def');
    });

    it('loads lightweight summary counts without fetching detail rows via LoadScopeSummary', async () => {
        hoisted.getSideConversationSummary.mockResolvedValue({
            SideConversationId: 'side-1',
            DefaultAgentID: 'agent-research',
            TurnCount: 3,
        });

        const state = await controller.LoadScopeSummary('parent-1', null, user);
        expect(state.TurnCount).toBe(3);
        expect(state.PreferredAgentId).toBe('agent-research');
        expect(hoisted.loadSideConversationDetails).not.toHaveBeenCalled();
    });

    it('loads persisted side conversations and their detail messages via ConversationEngine', async () => {
        const stored: MockDetailEntity[] = [
            {
                ID: 'd-1',
                ConversationID: 'side-1',
                Role: 'User',
                Message: 'Status check?',
                UserID: 'user-1',
                Status: 'Complete',
                Save: async () => true,
            },
        ];
        hoisted.loadSideConversations.mockResolvedValue([
            { ID: 'side-1', ParentID: 'parent-1', DefaultAgentID: 'agent-sage' },
        ]);
        hoisted.loadSideConversationDetails.mockImplementation(async () => [...stored]);
        const provider = createProvider(stored);

        const state = await controller.LoadScope('parent-1', null, user, provider);
        expect(state.SideConversation?.ID).toBe('side-1');
        expect(state.Messages).toHaveLength(1);
        expect(state.TurnCount).toBe(1);
        expect(state.PreferredAgentId).toBe('agent-sage');
    });

    it('asks a side question via ConversationAgentRunner without flipping global IsProcessing$, streams, and reloads messages', async () => {
        const stored: MockDetailEntity[] = [];
        const provider = createProvider(stored);
        hoisted.getOrCreateSideConversation.mockResolvedValue({ ID: 'side-1', ParentID: 'parent-1' });
        hoisted.loadSideConversationDetails.mockImplementation(async () => [...stored]);

        let observedStreamingText = '';
        let globalProcessingDuringSideAsk = false;
        let capturedCallback: MessageProgressCallback | null = null;
        vi.spyOn(streaming, 'RegisterMessageCallback').mockImplementation((_id, cb) => {
            capturedCallback = cb;
        });

        hoisted.runAgentFromDetail.mockImplementation(async (params: RunAgentFromConversationDetailParams) => {
            expect(params.CreateArtifacts).toBe(false);
            expect(params.CreateNotification).toBe(false);
            globalProcessingDuringSideAsk = await firstValueFrom(runner.IsProcessing$);

            params.OnAccepted?.({
                ConversationDetailId: 'agent-reply-1',
                CreatedAt: new Date().toISOString(),
            });

            if (capturedCallback) {
                await capturedCallback({
                    message: 'The main agent is on step 3',
                    conversationDetailId: 'agent-reply-1',
                    streaming: { content: 'The main agent is on step 3', isPartial: true, kind: 'final-response' },
                });
            }

            observedStreamingText = (await firstValueFrom(controller.ObserveScope('parent-1', null))).StreamingText;

            stored.push({
                ID: 'agent-reply-1',
                ConversationID: 'side-1',
                Role: 'Agent',
                Message: 'The main agent is on step 3.',
                UserID: 'user-1',
                Status: 'Complete',
                Save: async () => true,
            });
            return { Success: true, Result: { success: true } };
        });

        const result = await controller.AskQuestion({
            ParentConversationId: 'parent-1',
            ParentBranchId: null,
            QuestionText: 'Where is the main run right now?',
            CurrentUser: user,
            Provider: provider,
        });

        expect(result.Success).toBe(true);
        expect(result.SideConversationId).toBe('side-1');
        expect(result.AgentDetailId).toBe('agent-reply-1');
        expect(globalProcessingDuringSideAsk).toBe(false);
        expect(observedStreamingText).toBe('The main agent is on step 3');

        const finalState = controller.GetScopeState('parent-1', null);
        expect(finalState.IsAsking).toBe(false);
        expect(finalState.InFlightDetailId).toBeNull();
        expect(finalState.Messages).toHaveLength(2);
        expect(finalState.TurnCount).toBe(1);
    });

    it('persists PreferredAgentId via SideConversation.DefaultAgentID', async () => {
        const saveMock = vi.fn().mockResolvedValue(true);
        const sideConv = { ID: 'side-1', ParentID: 'parent-1', DefaultAgentID: null as string | null, Save: saveMock };
        hoisted.loadSideConversations.mockResolvedValue([sideConv]);
        hoisted.loadSideConversationDetails.mockResolvedValue([]);
        await controller.LoadScope('parent-1', null, user, createProvider([]));

        const ok = await controller.SetPreferredAgent('parent-1', null, 'agent-research', user);
        expect(ok).toBe(true);
        expect(sideConv.DefaultAgentID).toBe('agent-research');
        expect(saveMock).toHaveBeenCalledTimes(1);
        expect(controller.GetScopeState('parent-1', null).PreferredAgentId).toBe('agent-research');
    });

    it('clears/archives side conversation state cleanly via ClearScope', async () => {
        hoisted.loadSideConversations.mockResolvedValue([{ ID: 'side-1', ParentID: 'parent-1' }]);
        hoisted.loadSideConversationDetails.mockResolvedValue([
            {
                ID: 'd-1',
                ConversationID: 'side-1',
                Role: 'User',
                Message: 'Old question',
                UserID: 'user-1',
                Status: 'Complete',
            },
        ]);
        hoisted.clearSideConversation.mockResolvedValue(true);

        await controller.LoadScope('parent-1', 'branch-1', user, createProvider([]));
        const ok = await controller.ClearScope('parent-1', 'branch-1', user);
        expect(ok).toBe(true);
        expect(hoisted.clearSideConversation).toHaveBeenCalledWith('side-1', user);

        const state = controller.GetScopeState('parent-1', 'branch-1');
        expect(state.SideConversation).toBeNull();
        expect(state.Messages).toHaveLength(0);
        expect(state.TurnCount).toBe(0);
    });

    it('defaults to Sage when no @mention or PreferredAgent is supplied', async () => {
        const stored: MockDetailEntity[] = [];
        const provider = createProvider(stored);
        hoisted.getOrCreateSideConversation.mockResolvedValue({ ID: 'side-1', ParentID: 'parent-1' });
        hoisted.loadSideConversationDetails.mockImplementation(async () => [...stored]);

        let invokedParams: RunAgentFromConversationDetailParams | null = null;
        hoisted.runAgentFromDetail.mockImplementation(async (params: RunAgentFromConversationDetailParams) => {
            invokedParams = params;
            return { Success: true, Result: { success: true } };
        });

        await controller.AskQuestion({
            ParentConversationId: 'parent-1',
            ParentBranchId: null,
            QuestionText: 'Summarize what the Query Builder is doing right now.',
            CurrentUser: user,
            PreferredAgent: null,
            Provider: provider,
        });

        expect(invokedParams).not.toBeNull();
        expect(invokedParams!.AgentId).toBe('agent-sage');
        expect(invokedParams!.ConfigurationId).toBeUndefined();
    });

    it('routes @agent mention in QuestionText with ConfigurationId and overrides PreferredAgent', async () => {
        const stored: MockDetailEntity[] = [];
        const provider = createProvider(stored);
        hoisted.getOrCreateSideConversation.mockResolvedValue({ ID: 'side-1', ParentID: 'parent-1' });
        hoisted.loadSideConversationDetails.mockImplementation(async () => [...stored]);

        let invokedParams: RunAgentFromConversationDetailParams | null = null;
        hoisted.runAgentFromDetail.mockImplementation(async (params: RunAgentFromConversationDetailParams) => {
            invokedParams = params;
            return { Success: true, Result: { success: true } };
        });

        const preferred = {
            ID: 'agent-qb',
            Name: 'Query Builder',
            Status: 'Active',
        } as MJAIAgentEntityExtended;

        await controller.AskQuestion({
            ParentConversationId: 'parent-1',
            ParentBranchId: null,
            QuestionText: '@{"type":"agent","id":"agent-research","name":"Research Agent","configId":"cfg-fast"} Compare that to last quarter.',
            CurrentUser: user,
            PreferredAgent: preferred,
            Provider: provider,
        });

        expect(invokedParams).not.toBeNull();
        expect(invokedParams!.AgentId).toBe('agent-research');
        expect(invokedParams!.ConfigurationId).toBe('cfg-fast');
    });

    it('uses persisted DefaultAgentID or explicit PreferredAgent when no @agent mention is present', async () => {
        const stored: MockDetailEntity[] = [];
        const provider = createProvider(stored);
        hoisted.getOrCreateSideConversation.mockResolvedValue({
            ID: 'side-1',
            ParentID: 'parent-1',
            DefaultAgentID: 'agent-research',
        });
        hoisted.loadSideConversationDetails.mockImplementation(async () => [...stored]);

        let invokedParams: RunAgentFromConversationDetailParams | null = null;
        hoisted.runAgentFromDetail.mockImplementation(async (params: RunAgentFromConversationDetailParams) => {
            invokedParams = params;
            return { Success: true, Result: { success: true } };
        });

        await controller.AskQuestion({
            ParentConversationId: 'parent-1',
            ParentBranchId: null,
            QuestionText: 'Check the supporting docs for this query.',
            CurrentUser: user,
            Provider: provider,
        });

        expect(invokedParams).not.toBeNull();
        expect(invokedParams!.AgentId).toBe('agent-research');
    });
});
