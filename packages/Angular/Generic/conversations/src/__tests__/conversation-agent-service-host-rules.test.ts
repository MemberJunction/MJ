/**
 * @fileoverview The agent service's half of the host rules: what it sends for the allowed list
 * and the history floor, and that it sends nothing new when they are unset — the unset case is
 * what keeps an MJAPI that predates `agentHistoryFrom` working.
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

/** A service whose RunView records each request and answers with the rows given for its entity. */
function buildService(rows: Record<string, object[]> = {}): ServiceHarness {
    const runFromDetail = vi.fn(async () => ({ Success: true, Result: { success: true } }));
    const runViewParams: ViewRequest[] = [];
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
        RunView: vi.fn(async (params: ViewRequest) => {
            runViewParams.push(params);
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

        it('reads no versions when the agent has no reply in the conversation', async () => {
            const h = buildService();

            await expect(h.service.FindLatestAgentOutputVersion('conv-1', RESEARCH.ID)).resolves.toBeNull();
            expect(h.runViewParams.map(p => p.EntityName)).toEqual(['MJ: Conversation Details']);
        });
    });
});
