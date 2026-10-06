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

interface ServiceHarness {
    service: ConversationAgentService;
    runFromDetail: Fn;
    runViewParams: Array<{ EntityName?: string; ExtraFilter?: string }>;
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

function buildService(branchLoad: BranchLoadResult = BRANCH_B_LOAD): ServiceHarness {
    const runFromDetail = vi.fn(async () => ({ Success: true, Result: { success: true } }));
    const runViewParams: Array<{ EntityName?: string; ExtraFilter?: string }> = [];
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
        RunView: vi.fn(async (params: { EntityName?: string; ExtraFilter?: string }) => {
            runViewParams.push(params);
            if (params.EntityName === 'MJ: Conversation Branches') {
                return branchLoad;
            }
            return { Success: true, Results: [] };
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
            await h.service.InvokeSubAgent('Research', 'conv-1', MESSAGE, [], 'why', 'detail-1',
                null, undefined, undefined, undefined, undefined, null, false, [], FLOOR);

            expect(h.runFromDetail.mock.calls[0][0].AgentHistoryFrom).toBe(FLOOR);
        });

        it('leaves it out when unset', async () => {
            const h = buildService();
            await h.service.InvokeSubAgent('Research', 'conv-1', MESSAGE, [], 'why', 'detail-1');
            await h.service.InvokeSubAgent('Research', 'conv-1', MESSAGE, [], 'why', 'detail-1',
                null, undefined, undefined, undefined, undefined, null, false, [], null);

            for (const call of h.runFromDetail.mock.calls) {
                expect(call[0]).not.toHaveProperty('AgentHistoryFrom');
            }
        });

        it('the deprecated alias forwards it too', async () => {
            const h = buildService();
            await h.service.invokeSubAgent('Research', 'conv-1', MESSAGE, [], 'why', 'detail-1',
                null, undefined, undefined, undefined, undefined, null, false, [], FLOOR);

            expect(h.runFromDetail.mock.calls[0][0].AgentHistoryFrom).toBe(FLOOR);
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

            await h.service.ProcessMessage('conv-1', MESSAGE, [], 'detail-1', undefined, null, false, [], [RESEARCH.ID], FLOOR);

            expect(processMessage.mock.calls[0][0]).toMatchObject({ AllowedAgentIDs: [RESEARCH.ID], AgentHistoryFrom: FLOOR });
        });

        it('keeps an empty allowed list (no agent may be delegated to), and omits both when unset', async () => {
            const processMessage = spyRunner();
            const h = buildService();

            await h.service.ProcessMessage('conv-1', MESSAGE, [], 'detail-1', undefined, null, false, [], [], null);
            await h.service.ProcessMessage('conv-1', MESSAGE, [], 'detail-1');

            expect(processMessage.mock.calls[0][0].AllowedAgentIDs).toEqual([]);
            expect(processMessage.mock.calls[1][0]).not.toHaveProperty('AllowedAgentIDs');
            expect(processMessage.mock.calls[1][0]).not.toHaveProperty('AgentHistoryFrom');
        });
    });

    describe('FindLatestAgentOutputVersion', () => {
        it('under a floor, considers only replies written at or after it', async () => {
            const h = buildService();
            await h.service.FindLatestAgentOutputVersion('conv-1', RESEARCH.ID, FLOOR);

            const filter = h.runViewParams[0].ExtraFilter ?? '';
            expect(filter).toContain(`AND __mj_CreatedAt >= '2026-09-01T12:00:00.000Z'`);
            // The floor narrows the replies (the inner detail query), not the artifact versions.
            expect(filter.indexOf('__mj_CreatedAt')).toBeGreaterThan(filter.indexOf('[vwConversationDetails]'));
        });

        it('without one, the query is unchanged', async () => {
            const h = buildService();
            await h.service.FindLatestAgentOutputVersion('conv-1', RESEARCH.ID);

            expect(h.runViewParams[0].ExtraFilter).not.toContain('__mj_CreatedAt');
        });
    });

    describe('branch path', () => {
        const PATH = `[ConversationID]='conv-1' AND ([BranchID]='B' OR ([BranchID] IS NULL AND [Sequence] <= 2))`;
        it('scopes the latest output version to the branch path', async () => {
            const h = buildService();
            await h.service.FindLatestAgentOutputVersion('conv-1', RESEARCH.ID, null, 'B');
            const versionQuery = h.runViewParams.find(p => p.ExtraFilter?.includes('vwConversationDetailArtifacts'));
            expect(versionQuery?.ExtraFilter).toContain(PATH);
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

        // The artifact-version filter starts with `ID IN (`; the path predicate opens its inner detail query.
        const TRUNK_ARTIFACTS = `WHERE [ConversationID]='conv-1' AND [BranchID] IS NULL AND AgentID='${RESEARCH.ID}'`;

        /** The filter of the artifact-version query a harness ran. */
        function artifactQuery(h: ServiceHarness): string | undefined {
            return h.runViewParams.find(p => p.ExtraFilter?.includes('vwConversationDetailArtifacts'))?.ExtraFilter;
        }

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
            const onBranch = buildService();
            await onBranch.service.FindAgentArtifacts('conv-1', RESEARCH.ID, null, 'B');
            expect(artifactQuery(onBranch)).toContain(PATH);

            const onTrunk = buildService();
            await onTrunk.service.FindAgentArtifacts('conv-1', RESEARCH.ID);
            expect(onTrunk.runViewParams[0].ExtraFilter).toContain(TRUNK_ARTIFACTS);
        });

        it('scopes the continuity intent check to the branch path, and to the trunk without one', async () => {
            const onBranch = enableIntentCheck(buildService());
            await onBranch.service.CheckAgentContinuityIntent('conv-1', RESEARCH.ID, 'change it', [], 'B');
            expect(artifactQuery(onBranch)).toContain(PATH);

            const onTrunk = enableIntentCheck(buildService());
            await onTrunk.service.CheckAgentContinuityIntent('conv-1', RESEARCH.ID, 'change it', []);
            expect(onTrunk.runViewParams[0].ExtraFilter).toContain(TRUNK_ARTIFACTS);
        });

        it('the deprecated intent-check alias forwards the branch', async () => {
            const onBranch = enableIntentCheck(buildService());
            await onBranch.service.checkAgentContinuityIntent('conv-1', RESEARCH.ID, 'change it', [], 'B');
            expect(artifactQuery(onBranch)).toContain(PATH);

            const onTrunk = enableIntentCheck(buildService());
            await onTrunk.service.checkAgentContinuityIntent('conv-1', RESEARCH.ID, 'change it', []);
            expect(onTrunk.runViewParams[0].ExtraFilter).toContain(TRUNK_ARTIFACTS);
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
            const h = buildService(FAILED_LOAD);

            await expect(h.service.FindConfigurationPresetForAgent('conv-1', RESEARCH.ID, 'B')).resolves.toBeUndefined();
            expectOnlyTheFailedBranchLoad(h, errors);
        });

        it('the latest output version lookup returns null and queries no artifacts', async () => {
            const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const h = buildService(FAILED_LOAD);

            await expect(h.service.FindLatestAgentOutputVersion('conv-1', RESEARCH.ID, null, 'B')).resolves.toBeNull();
            expectOnlyTheFailedBranchLoad(h, errors);
        });

        it('the agent artifact list is empty and queries no artifacts', async () => {
            const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const h = buildService(FAILED_LOAD);

            await expect(h.service.FindAgentArtifacts('conv-1', RESEARCH.ID, null, 'B')).resolves.toEqual([]);
            expectOnlyTheFailedBranchLoad(h, errors);
        });
    });
});
