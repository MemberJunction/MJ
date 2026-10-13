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

interface ServiceHarness {
    service: ConversationAgentService;
    runFromDetail: Fn;
    runViewParams: Array<{ ExtraFilter?: string }>;
}

function buildService(): ServiceHarness {
    const runFromDetail = vi.fn(async () => ({ Success: true, Result: { success: true } }));
    const runViewParams: Array<{ ExtraFilter?: string }> = [];
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
        RunView: vi.fn(async (params: { ExtraFilter?: string }) => {
            runViewParams.push(params);
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
});
