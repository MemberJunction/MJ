/**
 * @fileoverview The agent service's half of the host rules: what it sends for the allowed list
 * and the history floor, and that it sends nothing new when they are unset — the unset case is
 * what keeps an MJAPI that predates `agentHistoryFrom` working. Also that its conversation
 * lookups read only the active branch's path, and the trunk when no branch is given.
 *
 * Instantiated via the prototype (no Angular DI), with the transport stubbed.
 */
import '@angular/compiler'; // JIT support — the service module evaluates Angular decorators in vitest's node env
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ConversationsRuntime } from '@memberjunction/conversations-runtime';

import { ConversationAgentService } from '../lib/services/conversation-agent.service';

const RESEARCH = { ID: 'AAAAAAAA-0000-0000-0000-000000000002', Name: 'Research' };
const FLOOR = new Date('2026-09-01T12:00:00.000Z');

type Fn = ReturnType<typeof vi.fn>;

/** The parts of a RunView request these tests read. */
interface ViewRequest {
    EntityName?: string;
    ExtraFilter?: string;
}

interface ServiceHarness {
    service: ConversationAgentService;
    runFromDetail: Fn;
    runViewParams: ViewRequest[];
}

/** What the stubbed `MJ: Conversation Branches` load returns. */
interface BranchLoadResult {
    Success: boolean;
    Results: Array<{ ID: string; ConversationID: string; ParentBranchID: string | null; ForkFromSequence: number | null; Name: string | null }>;
    ErrorMessage?: string;
}

/** Branch B, forked from the trunk at Sequence 2. */
const BRANCH_B_LOAD: BranchLoadResult = {
    Success: true,
    Results: [{ ID: 'B', ConversationID: 'conv-1', ParentBranchID: null, ForkFromSequence: 2, Name: null }],
};

/**
 * A service whose RunView records each request and answers with the rows given for its entity.
 * The `MJ: Conversation Branches` load answers with `branchLoad` instead (branch B by default).
 */
function buildService(rows: Record<string, object[]> = {}, branchLoad: BranchLoadResult = BRANCH_B_LOAD): ServiceHarness {
    const runFromDetail = vi.fn(async () => ({ Success: true, Result: { success: true } }));
    const runViewParams: ViewRequest[] = [];
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
        RunView: vi.fn(async (params: ViewRequest) => {
            runViewParams.push(params);
            if (params.EntityName === 'MJ: Conversation Branches') {
                return branchLoad;
            }
            return { Success: true, Results: rows[params.EntityName ?? ''] ?? [] };
        }),
    } as unknown as RunView);

    const service = Object.create(ConversationAgentService.prototype) as ConversationAgentService;
    Object.assign(service as unknown as Record<string, unknown>, {
        agentClientService: { RunAgentFromConversationDetail: runFromDetail },
        _conversationManagerAgent: { ID: 'manager', Name: 'Sage' },
        _provider: { CurrentUser: null },
    });
    return { service, runFromDetail, runViewParams };
}

const MESSAGE = { ID: 'user-msg-1' } as never;
const ON_REPLY = (): void => undefined;

describe('ConversationAgentService — host rules on the wire', () => {
    beforeEach(() => {
        vi.spyOn(AIEngineBase.Instance, 'Config').mockResolvedValue(undefined as never);
        vi.spyOn(AIEngineBase.Instance, 'Agents', 'get').mockReturnValue([RESEARCH] as never);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('InvokeSubAgent', () => {
        it('sends the history floor when set', async () => {
            const h = buildService();
            await h.service.InvokeSubAgent('Research', 'conv-1', MESSAGE, [], 'why', ON_REPLY,
                null, undefined, undefined, undefined, undefined, null, false, [], FLOOR);

            expect(h.runFromDetail.mock.calls[0][0].AgentHistoryFrom).toBe(FLOOR);
        });

        it('leaves it out when unset', async () => {
            const h = buildService();
            await h.service.InvokeSubAgent('Research', 'conv-1', MESSAGE, [], 'why', ON_REPLY);
            await h.service.InvokeSubAgent('Research', 'conv-1', MESSAGE, [], 'why', ON_REPLY,
                null, undefined, undefined, undefined, undefined, null, false, [], null);

            for (const call of h.runFromDetail.mock.calls) {
                expect(call[0]).not.toHaveProperty('AgentHistoryFrom');
            }
        });

        it('the deprecated alias forwards it too', async () => {
            const h = buildService();
            await h.service.invokeSubAgent('Research', 'conv-1', MESSAGE, [], 'why', ON_REPLY,
                null, undefined, undefined, undefined, undefined, null, false, [], FLOOR);

            expect(h.runFromDetail.mock.calls[0][0].AgentHistoryFrom).toBe(FLOOR);
        });
    });

    describe('the reply row', () => {
        it("InvokeSubAgent names the user's message and hands the server's reply row back", async () => {
            const h = buildService();
            const onReply = vi.fn();
            const reply = { ConversationDetailId: 'reply-1', CreatedAt: new Date('2026-10-12T10:00:00.000Z') };
            h.runFromDetail.mockImplementationOnce(async (params: { OnAccepted?: (r: typeof reply) => void }) => {
                params.OnAccepted?.(reply);
                return { Success: true, Result: { success: true } };
            });

            await h.service.InvokeSubAgent('Research', 'conv-1', MESSAGE, [], 'why', onReply);

            const sent = h.runFromDetail.mock.calls[0][0];
            expect(sent.UserMessageId).toBe('user-msg-1');
            expect(sent).not.toHaveProperty('ConversationDetailId');
            expect(onReply).toHaveBeenCalledWith(reply);
        });

        it('ProcessMessage hands its callback to the runtime', async () => {
            const processMessage = vi.fn(async (_input: Record<string, unknown>) => ({ success: true }));
            vi.spyOn(ConversationsRuntime.Instance.AgentRunner, 'processMessage').mockImplementation(processMessage as never);
            const h = buildService();

            await h.service.ProcessMessage('conv-1', MESSAGE, [], ON_REPLY);

            expect(processMessage.mock.calls[0][0]).toMatchObject({ message: MESSAGE, onReplyAccepted: ON_REPLY });
            expect(processMessage.mock.calls[0][0]).not.toHaveProperty('conversationDetailId');
        });
    });

    describe('ProcessMessage', () => {
        function spyRunner(): Fn {
            const processMessage = vi.fn(async () => ({ success: true }));
            vi.spyOn(ConversationsRuntime.Instance.AgentRunner, 'processMessage').mockImplementation(processMessage as never);
            return processMessage;
        }

        it('sends the allowed list and the history floor to the runtime', async () => {
            const processMessage = spyRunner();
            const h = buildService();

            await h.service.ProcessMessage('conv-1', MESSAGE, [], ON_REPLY, undefined, null, false, [], [RESEARCH.ID], FLOOR);

            expect(processMessage.mock.calls[0][0]).toMatchObject({ AllowedAgentIDs: [RESEARCH.ID], AgentHistoryFrom: FLOOR });
        });

        it('keeps an empty allowed list (no agent may be delegated to), and omits both when unset', async () => {
            const processMessage = spyRunner();
            const h = buildService();

            await h.service.ProcessMessage('conv-1', MESSAGE, [], ON_REPLY, undefined, null, false, [], [], null);
            await h.service.ProcessMessage('conv-1', MESSAGE, [], ON_REPLY);

            expect(processMessage.mock.calls[0][0].AllowedAgentIDs).toEqual([]);
            expect(processMessage.mock.calls[1][0]).not.toHaveProperty('AllowedAgentIDs');
            expect(processMessage.mock.calls[1][0]).not.toHaveProperty('AgentHistoryFrom');
        });
    });

    describe('FindLatestAgentOutputVersion', () => {
        it('under a floor, considers only replies written at or after it', async () => {
            const h = buildService();
            await h.service.FindLatestAgentOutputVersion('conv-1', RESEARCH.ID, FLOOR);

            // The floor narrows the replies, which are read first, not the artifact versions.
            expect(h.runViewParams[0].EntityName).toBe('MJ: Conversation Details');
            expect(h.runViewParams[0].ExtraFilter).toContain(`AND __mj_CreatedAt >= '2026-09-01T12:00:00.000Z'`);
        });

        it('without one, the replies are not narrowed by time', async () => {
            const h = buildService();
            await h.service.FindLatestAgentOutputVersion('conv-1', RESEARCH.ID);

            expect(h.runViewParams[0].ExtraFilter).not.toContain('__mj_CreatedAt');
        });

        it('reads the versions by the IDs of the replies, with no subquery over conversation messages', async () => {
            const h = buildService({ 'MJ: Conversation Details': [{ ID: 'reply-1' }, { ID: 'reply-2' }] });
            await h.service.FindLatestAgentOutputVersion('conv-1', RESEARCH.ID);

            expect(h.runViewParams.map(p => p.EntityName)).toEqual(['MJ: Conversation Details', 'MJ: Artifact Versions']);
            expect(h.runViewParams[1].ExtraFilter).toContain(`ConversationDetailID IN ('reply-1','reply-2')`);
            expect(h.runViewParams.map(p => p.ExtraFilter ?? '').join(' ')).not.toContain('vwConversationDetails');
        });

        it('reads the replies again on every lookup, so a newer reply counts', async () => {
            const rows: Record<string, object[]> = { 'MJ: Conversation Details': [{ ID: 'reply-1' }] };
            const h = buildService(rows);

            await h.service.FindLatestAgentOutputVersion('conv-1', RESEARCH.ID);
            rows['MJ: Conversation Details'] = [{ ID: 'reply-1' }, { ID: 'reply-2' }];
            await h.service.FindLatestAgentOutputVersion('conv-1', RESEARCH.ID);

            const versionFilters = h.runViewParams.filter(p => p.EntityName === 'MJ: Artifact Versions').map(p => p.ExtraFilter ?? '');
            expect(versionFilters).toHaveLength(2);
            expect(versionFilters[1]).toContain(`ConversationDetailID IN ('reply-1','reply-2')`);
        });

        it('reads no versions when the agent has no reply in the conversation', async () => {
            const h = buildService();

            await expect(h.service.FindLatestAgentOutputVersion('conv-1', RESEARCH.ID)).resolves.toBeNull();
            expect(h.runViewParams.map(p => p.EntityName)).toEqual(['MJ: Conversation Details']);
        });

        it('considers only replies no rerun replaced', async () => {
            const h = buildService();
            await h.service.FindLatestAgentOutputVersion('conv-1', RESEARCH.ID);

            expect(h.runViewParams[0].EntityName).toBe('MJ: Conversation Details');
            expect(h.runViewParams[0].ExtraFilter).toContain(`[ConversationID]='conv-1' AND [BranchID] IS NULL AND [ReplacedAt] IS NULL AND AgentID='${RESEARCH.ID}'`);
        });
    });

    describe('branch path', () => {
        const PATH = `[ConversationID]='conv-1' AND ([BranchID]='B' OR ([BranchID] IS NULL AND [Sequence] <= 2))`;
        /** One reply by the agent, so the artifact-version read runs. */
        const REPLIES: Record<string, object[]> = { 'MJ: Conversation Details': [{ ID: 'reply-1' }] };
        const IN_REPLIES = `ConversationDetailID IN ('reply-1')`;
        // The reply read carries the path predicate; the artifact-version read carries only the reply ids.
        const TRUNK_REPLIES = `[ConversationID]='conv-1' AND [BranchID] IS NULL AND [ReplacedAt] IS NULL AND AgentID='${RESEARCH.ID}'`;

        /** The filter of the reply read a harness ran. */
        function replyQuery(h: ServiceHarness): string | undefined {
            return h.runViewParams.find(p => p.EntityName === 'MJ: Conversation Details')?.ExtraFilter;
        }

        /** The filter of the artifact-version read a harness ran. */
        function artifactQuery(h: ServiceHarness): string | undefined {
            return h.runViewParams.find(p => p.ExtraFilter?.includes('vwConversationDetailArtifacts'))?.ExtraFilter;
        }

        it('scopes the latest output version to the branch path', async () => {
            const h = buildService(REPLIES);
            await h.service.FindLatestAgentOutputVersion('conv-1', RESEARCH.ID, null, 'B');
            expect(replyQuery(h)).toContain(PATH);
            expect(artifactQuery(h)).toContain(IN_REPLIES);
        });
        it('scopes the configuration preset lookup to the branch path', async () => {
            const h = buildService();
            await h.service.FindConfigurationPresetForAgent('conv-1', RESEARCH.ID, 'B');
            const presetQuery = h.runViewParams.find(p => p.ExtraFilter?.includes('"configId"'));
            expect(presetQuery?.ExtraFilter?.startsWith(PATH)).toBe(true);
        });
        it('scopes both to the trunk when no branch is given (control)', async () => {
            const h = buildService();
            await h.service.FindConfigurationPresetForAgent('conv-1', RESEARCH.ID);
            expect(h.runViewParams[0].ExtraFilter?.startsWith(`[ConversationID]='conv-1' AND [BranchID] IS NULL`)).toBe(true);
        });

        /** Gives a harness what the intent check needs before its artifact query: an AI client and the prompt. */
        function enableIntentCheck(h: ServiceHarness): ServiceHarness {
            Object.assign(h.service as unknown as Record<string, unknown>, {
                _aiClient: { RunAIPrompt: vi.fn(async () => ({ success: false })) },
            });
            vi.spyOn(AIEngineBase.Instance, 'Prompts', 'get').mockReturnValue([{ ID: 'prompt-1', Name: 'Check Sage Intent' }] as never);
            vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            return h;
        }

        it('scopes the agent artifact list to the branch path, and to the trunk without one', async () => {
            const onBranch = buildService(REPLIES);
            await onBranch.service.FindAgentArtifacts('conv-1', RESEARCH.ID, null, 'B');
            expect(replyQuery(onBranch)).toContain(PATH);
            expect(artifactQuery(onBranch)).toContain(IN_REPLIES);

            const onTrunk = buildService(REPLIES);
            await onTrunk.service.FindAgentArtifacts('conv-1', RESEARCH.ID);
            expect(onTrunk.runViewParams[0].ExtraFilter).toContain(TRUNK_REPLIES);
        });

        it('scopes the continuity intent check to the branch path, and to the trunk without one', async () => {
            const onBranch = enableIntentCheck(buildService(REPLIES));
            await onBranch.service.CheckAgentContinuityIntent('conv-1', RESEARCH.ID, 'change it', [], 'B');
            expect(replyQuery(onBranch)).toContain(PATH);
            expect(artifactQuery(onBranch)).toContain(IN_REPLIES);

            const onTrunk = enableIntentCheck(buildService(REPLIES));
            await onTrunk.service.CheckAgentContinuityIntent('conv-1', RESEARCH.ID, 'change it', []);
            expect(onTrunk.runViewParams[0].ExtraFilter).toContain(TRUNK_REPLIES);
        });

        it('the deprecated intent-check alias forwards the branch', async () => {
            const onBranch = enableIntentCheck(buildService(REPLIES));
            await onBranch.service.checkAgentContinuityIntent('conv-1', RESEARCH.ID, 'change it', [], 'B');
            expect(replyQuery(onBranch)).toContain(PATH);

            const onTrunk = enableIntentCheck(buildService(REPLIES));
            await onTrunk.service.checkAgentContinuityIntent('conv-1', RESEARCH.ID, 'change it', []);
            expect(onTrunk.runViewParams[0].ExtraFilter).toContain(TRUNK_REPLIES);
        });
    });

    describe('branch load failure', () => {
        const FAILED_LOAD: BranchLoadResult = { Success: false, Results: [], ErrorMessage: 'boom' };

        /** Checks that the branch load was the only query, and that its failure was logged with both ids. */
        function expectOnlyTheFailedBranchLoad(h: ServiceHarness, errors: ReturnType<typeof vi.spyOn>): void {
            expect(h.runViewParams.map(p => p.EntityName)).toEqual(['MJ: Conversation Branches']);
            expect(errors).toHaveBeenCalledTimes(1);
            expect(errors.mock.calls[0][0]).toContain('conv-1');
            expect(errors.mock.calls[0][0]).toContain('branch B');
        }

        it('the configuration preset lookup returns undefined and queries no messages', async () => {
            const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const h = buildService({}, FAILED_LOAD);

            await expect(h.service.FindConfigurationPresetForAgent('conv-1', RESEARCH.ID, 'B')).resolves.toBeUndefined();
            expectOnlyTheFailedBranchLoad(h, errors);
        });

        it('the latest output version lookup returns null and queries no artifacts', async () => {
            const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const h = buildService({}, FAILED_LOAD);

            await expect(h.service.FindLatestAgentOutputVersion('conv-1', RESEARCH.ID, null, 'B')).resolves.toBeNull();
            expectOnlyTheFailedBranchLoad(h, errors);
        });

        it('the agent artifact list is empty and queries no artifacts', async () => {
            const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const h = buildService({}, FAILED_LOAD);

            await expect(h.service.FindAgentArtifacts('conv-1', RESEARCH.ID, null, 'B')).resolves.toEqual([]);
            expectOnlyTheFailedBranchLoad(h, errors);
        });
    });
});
