/**
 * @fileoverview Unit tests for `RunAIAgentResolver.findChainablePredecessor` (VS-CON-8).
 *
 * Verifies how `findChainablePredecessor` selects the newest root run on the conversation/branch
 * path via `MJAIAgentRunEntityExtended.BuildStoppedPredecessorFilter`, distinguishes a user-stopped
 * run (`reason: 'stopped'`) from a `FinalStep === 'Chat'` run with open sub-agent consults
 * (`reason: 'open-consult'`), short-circuits before querying steps when the agent cannot own
 * consults (`CanAgentOwnSubAgentConsults(agentId) === false`), returns `null` on normal Chat turns
 * or settled `Success` turns, and fails soft when `RunView` or `LoadOpenSubAgentConsults` throws.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('type-graphql', () => {
    const decoratorFactory = (..._args: unknown[]) => (..._decorated: unknown[]) => undefined;
    const exportNames = [
        'Resolver', 'Query', 'Mutation', 'Subscription', 'Arg', 'Args', 'ArgsType', 'Ctx', 'Root',
        'Info', 'Field', 'FieldResolver', 'ObjectType', 'InputType', 'InterfaceType', 'Authorized',
        'UseMiddleware', 'Extensions', 'Directive', 'ID', 'Int', 'Float', 'GraphQLISODateTime',
        'GraphQLTimestamp', 'registerEnumType', 'createMethodDecorator', 'createParamDecorator',
        'buildSchema', 'buildSchemaSync', 'PubSub',
    ];
    return Object.fromEntries(exportNames.map((name) => [name, decoratorFactory]));
});

const hoisted = vi.hoisted(() => ({
    canAgentOwnSubAgentConsults: vi.fn<(agentOrId: unknown) => boolean>(),
    loadOpenSubAgentConsults: vi.fn<
        (provider: unknown, runId: string, contextUser: unknown) => Promise<unknown[]>
    >(),
}));

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class {},
    ArtifactToolManager: class {},
    CanAgentOwnSubAgentConsults: (...args: [unknown]) => hoisted.canAgentOwnSubAgentConsults(...args),
    LoadOpenSubAgentConsults: (...args: [unknown, string, unknown]) =>
        hoisted.loadOpenSubAgentConsults(...args),
}));

vi.mock('../realtimeWidget/widgetGuestElevation.js', () => ({
    ResolveWidgetGuestRunContext: vi.fn().mockResolvedValue(null),
    ElevateUserPayload: vi.fn(),
}));

import { RunView } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { ConversationEngine } from '@memberjunction/core-entities';
import { MJAIAgentRunEntityExtended } from '@memberjunction/ai-core-plus';
import { RunAIAgentResolver } from '../resolvers/RunAIAgentResolver.js';

const USER = { ID: 'user-1', Email: 'user@example.com' } as unknown as UserInfo;
const PROVIDER = { __tag: 'mock-provider' } as unknown as IMetadataProvider;
const CONV_ID = '11111111-1111-4111-8111-111111111111';
const AGENT_ID = '22222222-2222-4222-8222-222222222222';
const RUN_ID = '33333333-3333-4333-8333-333333333333';

interface FindChainablePredecessorCallable {
    findChainablePredecessor(
        conversationId: string,
        agentId: string,
        branchId: string | null,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<{ runId: string; reason: 'stopped' | 'open-consult' } | null>;
}

describe('RunAIAgentResolver.findChainablePredecessor (VS-CON-8)', () => {
    let resolver: FindChainablePredecessorCallable;
    let runViewMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        resolver = new RunAIAgentResolver() as unknown as FindChainablePredecessorCallable;
        runViewMock = vi.fn();
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: runViewMock,
        } as unknown as RunView);
        hoisted.canAgentOwnSubAgentConsults.mockReset();
        hoisted.loadOpenSubAgentConsults.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns { runId, reason: "stopped" } when the newest run is user-stopped, without calling LoadOpenSubAgentConsults', async () => {
        runViewMock.mockResolvedValue({
            Success: true,
            Results: [
                {
                    ID: RUN_ID,
                    Status: 'Cancelled',
                    CancellationReason: 'User Request',
                    FinalStep: null,
                },
            ],
        });

        const result = await resolver.findChainablePredecessor(CONV_ID, AGENT_ID, null, USER, PROVIDER);

        expect(result).toEqual({ runId: RUN_ID, reason: 'stopped' });
        expect(hoisted.canAgentOwnSubAgentConsults).not.toHaveBeenCalled();
        expect(hoisted.loadOpenSubAgentConsults).not.toHaveBeenCalled();
    });

    it('returns { runId, reason: "open-consult" } when the newest run has Status=Completed, FinalStep=Chat, the agent can own consults, and LoadOpenSubAgentConsults returns a non-empty list', async () => {
        runViewMock.mockResolvedValue({
            Success: true,
            Results: [
                {
                    ID: RUN_ID,
                    Status: 'Completed',
                    CancellationReason: null,
                    FinalStep: 'Chat',
                },
            ],
        });
        hoisted.canAgentOwnSubAgentConsults.mockReturnValue(true);
        hoisted.loadOpenSubAgentConsults.mockResolvedValue([
            {
                childRunId: '44444444-4444-4444-8444-444444444444',
                subAgentId: '55555555-5555-4555-8555-555555555555',
                subAgentName: 'Producer',
                question: 'Which aspect ratio?',
                openedAtStepId: '66666666-6666-4666-8666-666666666666',
                parentRunId: RUN_ID,
            },
        ]);

        const result = await resolver.findChainablePredecessor(CONV_ID, AGENT_ID, null, USER, PROVIDER);

        expect(result).toEqual({ runId: RUN_ID, reason: 'open-consult' });
        expect(hoisted.canAgentOwnSubAgentConsults).toHaveBeenCalledWith(AGENT_ID);
        expect(hoisted.loadOpenSubAgentConsults).toHaveBeenCalledWith(PROVIDER, RUN_ID, USER);
    });

    it('returns null when the newest run has FinalStep=Chat for a consult-capable agent, but LoadOpenSubAgentConsults returns [] (normal Chat question)', async () => {
        runViewMock.mockResolvedValue({
            Success: true,
            Results: [
                {
                    ID: RUN_ID,
                    Status: 'Completed',
                    CancellationReason: null,
                    FinalStep: 'Chat',
                },
            ],
        });
        hoisted.canAgentOwnSubAgentConsults.mockReturnValue(true);
        hoisted.loadOpenSubAgentConsults.mockResolvedValue([]);

        const result = await resolver.findChainablePredecessor(CONV_ID, AGENT_ID, null, USER, PROVIDER);

        expect(result).toBeNull();
        expect(hoisted.canAgentOwnSubAgentConsults).toHaveBeenCalledWith(AGENT_ID);
        expect(hoisted.loadOpenSubAgentConsults).toHaveBeenCalledWith(PROVIDER, RUN_ID, USER);
    });

    it('returns null and does NOT call LoadOpenSubAgentConsults (zero step queries) when CanAgentOwnSubAgentConsults(agentId) === false', async () => {
        runViewMock.mockResolvedValue({
            Success: true,
            Results: [
                {
                    ID: RUN_ID,
                    Status: 'Completed',
                    CancellationReason: null,
                    FinalStep: 'Chat',
                },
            ],
        });
        hoisted.canAgentOwnSubAgentConsults.mockReturnValue(false);

        const result = await resolver.findChainablePredecessor(CONV_ID, AGENT_ID, null, USER, PROVIDER);

        expect(result).toBeNull();
        expect(hoisted.canAgentOwnSubAgentConsults).toHaveBeenCalledWith(AGENT_ID);
        expect(hoisted.loadOpenSubAgentConsults).not.toHaveBeenCalled();
    });

    it('returns null when the newest run has FinalStep=Success, querying MaxRows: 1 + OrderBy: __mj_CreatedAt DESC', async () => {
        runViewMock.mockResolvedValue({
            Success: true,
            Results: [
                {
                    ID: RUN_ID,
                    Status: 'Completed',
                    CancellationReason: null,
                    FinalStep: 'Success',
                },
            ],
        });

        const result = await resolver.findChainablePredecessor(CONV_ID, AGENT_ID, null, USER, PROVIDER);

        expect(result).toBeNull();
        expect(runViewMock).toHaveBeenCalledWith(
            expect.objectContaining({
                EntityName: 'MJ: AI Agent Runs',
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 1,
                Fields: ['ID', 'Status', 'CancellationReason', 'FinalStep'],
                ResultType: 'simple',
                BypassCache: true,
            }),
            USER
        );
        expect(hoisted.canAgentOwnSubAgentConsults).not.toHaveBeenCalled();
        expect(hoisted.loadOpenSubAgentConsults).not.toHaveBeenCalled();
    });

    it('passes branchId and loaded branches into BuildStoppedPredecessorFilter (branch-path isolation)', async () => {
        const fakeBranches = [{ ID: 'branch-B', ParentBranchID: null }];
        const loadBranchesSpy = vi
            .spyOn(ConversationEngine, 'LoadBranchesFresh')
            .mockResolvedValue(fakeBranches as never);
        const filterSpy = vi
            .spyOn(MJAIAgentRunEntityExtended, 'BuildStoppedPredecessorFilter')
            .mockReturnValue("ConversationID = 'conv' AND BranchFilter = 1");
        runViewMock.mockResolvedValue({ Success: true, Results: [] });

        const result = await resolver.findChainablePredecessor(
            CONV_ID,
            AGENT_ID,
            'branch-B',
            USER,
            PROVIDER
        );

        expect(result).toBeNull();
        expect(loadBranchesSpy).toHaveBeenCalledWith(CONV_ID, USER, PROVIDER);
        expect(filterSpy).toHaveBeenCalledWith(CONV_ID, AGENT_ID, 'branch-B', fakeBranches);
        expect(runViewMock).toHaveBeenCalledWith(
            expect.objectContaining({
                ExtraFilter: "ConversationID = 'conv' AND BranchFilter = 1",
            }),
            USER
        );
    });

    it('logs an error and returns null (never fails dispatch) if RunView or LoadOpenSubAgentConsults throws', async () => {
        // 1. RunView throws
        runViewMock.mockRejectedValueOnce(new Error('DB connection lost'));
        const res1 = await resolver.findChainablePredecessor(CONV_ID, AGENT_ID, null, USER, PROVIDER);
        expect(res1).toBeNull();

        // 2. LoadOpenSubAgentConsults throws
        runViewMock.mockResolvedValueOnce({
            Success: true,
            Results: [
                {
                    ID: RUN_ID,
                    Status: 'Completed',
                    CancellationReason: null,
                    FinalStep: 'Chat',
                },
            ],
        });
        hoisted.canAgentOwnSubAgentConsults.mockReturnValue(true);
        hoisted.loadOpenSubAgentConsults.mockRejectedValueOnce(new Error('Step query timed out'));
        const res2 = await resolver.findChainablePredecessor(CONV_ID, AGENT_ID, null, USER, PROVIDER);
        expect(res2).toBeNull();
    });
});
