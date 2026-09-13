/**
 * @fileoverview An agent run in AwaitingFeedback (or Paused) is ALIVE — the server has
 * parked it waiting for this user to answer a question. Two surfaces used to tell the
 * user otherwise, neither of them repeating anything the server said:
 *
 *  1. {@link AgentStateService} polled `Status IN ('Running', 'Paused')`, so an
 *     AwaitingFeedback run fell out of the active set on the very next cycle.
 *  2. The run reaches every failure path with `success: false` and — because a parked
 *     run carries no ErrorMessage — {@link MessageInputComponent.applyAgentFailureToDetail}
 *     rendered it as "❌ failed" with "Unknown error" text.
 *
 * Both are pinned here behaviourally: the service is driven through a fake provider, and
 * the component method is driven off the prototype (no constructor/TestBed) with only the
 * members it touches stubbed — the same style as message-input-streaming.test.ts.
 */
import '@angular/compiler'; // JIT support — the component import evaluates Angular decorators in vitest's node env
import { describe, it, expect, afterEach } from 'vitest';
import { firstValueFrom } from 'rxjs';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { MJAIAgentRunEntity, MJConversationDetailEntity } from '@memberjunction/core-entities';
import type { ExecuteAgentResult } from '@memberjunction/ai-core-plus';

import { AgentStateService } from '../lib/services/agent-state.service';
import { MessageInputComponent } from '../lib/components/message/message-input.component';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';

/** Minimal run row, shaped the way the view returns it. */
function agentRun(status: string, id: string): MJAIAgentRunEntity {
    return {
        ID: id,
        ConversationID: CONVERSATION_ID,
        Status: status,
        StartedAt: new Date(Date.now() - 60_000),
        Result: null,
    } as unknown as MJAIAgentRunEntity;
}

interface ProviderProbe {
    provider: IMetadataProvider;
    calls: RunViewParams[];
}

/**
 * Stands in for the server. It HONOURS the `Status IN (...)` list the service sends, so a
 * run whose status the service forgot to ask for is genuinely absent from the result —
 * the same way the real view behaves. A fake that returned every row regardless would
 * pass whatever filter the service sent and pin nothing.
 */
function fakeProvider(rows: MJAIAgentRunEntity[]): ProviderProbe {
    const calls: RunViewParams[] = [];
    const provider = {
        RunView: async (params: RunViewParams): Promise<RunViewResult> => {
            calls.push(params);
            // ExtraFilter is `string | PlatformSQL`; this service builds a plain string, and a
            // non-string would serve zero rows here — loudly, which is what we want.
            const filterText = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
            const requested = [...filterText.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
            const served = rows.filter((row) => requested.includes(String(row.Status)));
            return { Success: true, Results: served, RowCount: served.length, TotalRowCount: served.length, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult;
        },
    } as unknown as IMetadataProvider;
    return { provider, calls };
}

/** Runs one poll cycle and lets the awaited provider call settle. */
async function pollOnce(service: AgentStateService, probe: ProviderProbe): Promise<void> {
    service.Provider = probe.provider;
    service.startPolling({ ID: 'user-1' } as unknown as UserInfo, CONVERSATION_ID);
    service.stopPolling(); // kill the 30s interval; the initial load already fired
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('AgentStateService — an AwaitingFeedback run stays in the poll set', () => {
    const services: AgentStateService[] = [];

    afterEach(() => {
        services.splice(0).forEach((s) => s.ngOnDestroy());
    });

    function newService(): AgentStateService {
        const service = new AgentStateService();
        services.push(service);
        return service;
    }

    it('asks the server for AwaitingFeedback alongside Running and Paused', async () => {
        const service = newService();
        const probe = fakeProvider([]);

        await pollOnce(service, probe);

        expect(probe.calls).toHaveLength(1);
        const filter = probe.calls[0].ExtraFilter ?? '';
        expect(filter).toContain("'AwaitingFeedback'");
        expect(filter).toContain("'Running'");
        expect(filter).toContain("'Paused'");
    });

    it('keeps an AwaitingFeedback run in the active set rather than dropping it', async () => {
        const service = newService();
        const probe = fakeProvider([agentRun('AwaitingFeedback', 'run-awaiting')]);

        await pollOnce(service, probe);

        const active = await firstValueFrom(service.getActiveAgents(CONVERSATION_ID));

        expect(active.map((a) => a.run.ID)).toEqual(['run-awaiting']);
        expect(service.getAgent('run-awaiting')).toBeDefined();
    });

    it('does not classify an AwaitingFeedback run as an error', async () => {
        const service = newService();
        const probe = fakeProvider([agentRun('AwaitingFeedback', 'run-awaiting')]);

        await pollOnce(service, probe);

        const agent = service.getAgent('run-awaiting');
        expect(agent).toBeDefined();
        expect(agent?.status).not.toBe('error');
    });
});

interface DetailStub {
    ID: string;
    Status: string;
    Message: string;
    Error?: string | null;
}

interface AppliedUpdate {
    detailId: string;
    message: string;
    status: string;
    resultPassedThrough: boolean;
}

interface FailureHarness {
    agentBubble: DetailStub;
    userMessage: DetailStub;
    updates: AppliedUpdate[];
    watchesStarted: string[];
    apply(result: ExecuteAgentResult | null | undefined, failedVerb?: string): Promise<void>;
}

function buildFailureHarness(): FailureHarness {
    const agentBubble: DetailStub = { ID: 'detail-agent', Status: 'In-Progress', Message: '' };
    const userMessage: DetailStub = { ID: 'detail-user', Status: 'In-Progress', Message: 'do the thing' };
    const updates: AppliedUpdate[] = [];
    const watchesStarted: string[] = [];

    const component = Object.create(MessageInputComponent.prototype) as MessageInputComponent;
    Object.assign(component as unknown as Record<string, unknown>, {
        updateConversationDetail: async (
            detail: DetailStub,
            message: string,
            status: string,
            result?: ExecuteAgentResult,
        ): Promise<void> => {
            updates.push({ detailId: detail.ID, message, status, resultPassedThrough: result != null });
            detail.Message = message;
            detail.Status = status;
        },
        startInFlightDetailWatch: (detail: DetailStub): void => {
            watchesStarted.push(detail.ID);
        },
    });

    const apply = (
        component as unknown as {
            applyAgentFailureToDetail(
                agentResponseMessage: MJConversationDetailEntity,
                userMessage: MJConversationDetailEntity,
                agentName: string,
                result: ExecuteAgentResult | null | undefined,
                failedVerb?: string,
            ): Promise<void>;
        }
    ).applyAgentFailureToDetail.bind(component);

    return {
        agentBubble,
        userMessage,
        updates,
        watchesStarted,
        apply: (result, failedVerb) =>
            apply(
                agentBubble as unknown as MJConversationDetailEntity,
                userMessage as unknown as MJConversationDetailEntity,
                'Sage',
                result,
                failedVerb,
            ),
    };
}

function awaitingResult(status: string, message?: string): ExecuteAgentResult {
    return {
        success: false,
        agentRun: { Status: status, Message: message ?? null, ErrorMessage: null },
    } as unknown as ExecuteAgentResult;
}

describe('MessageInputComponent.applyAgentFailureToDetail — an awaiting run is not painted as failed', () => {
    it('completes the bubble with the agent question instead of an error', async () => {
        const harness = buildFailureHarness();

        await harness.apply(awaitingResult('AwaitingFeedback', 'Which environment should I deploy to?'));

        const bubbleUpdate = harness.updates.find((u) => u.detailId === 'detail-agent');
        expect(bubbleUpdate?.status).toBe('Complete');
        expect(bubbleUpdate?.message).toBe('Which environment should I deploy to?');
        expect(bubbleUpdate?.message).not.toContain('❌');
        expect(harness.agentBubble.Error).toBeUndefined();
    });

    it('never writes the Error status or starts the still-running watch for an awaiting run', async () => {
        const harness = buildFailureHarness();

        await harness.apply(awaitingResult('Paused', 'Approve the plan?'));

        expect(harness.updates.map((u) => u.status)).not.toContain('Error');
        expect(harness.updates.map((u) => u.status)).not.toContain('In-Progress');
        expect(harness.watchesStarted).toEqual([]);
    });

    it('falls back to a prompt naming the agent when the run recorded no question', async () => {
        const harness = buildFailureHarness();

        await harness.apply(awaitingResult('AwaitingFeedback'));

        const bubbleUpdate = harness.updates.find((u) => u.detailId === 'detail-agent');
        expect(bubbleUpdate?.status).toBe('Complete');
        expect(bubbleUpdate?.message).toContain('Sage');
        expect(bubbleUpdate?.message).not.toContain('Unknown error');
        expect(bubbleUpdate?.message).not.toContain('❌');
    });

    it('passes the result through so a ResponseForm attached to the question still renders', async () => {
        const harness = buildFailureHarness();

        await harness.apply(awaitingResult('AwaitingFeedback', 'Which environment?'));

        expect(harness.updates.find((u) => u.detailId === 'detail-agent')?.resultPassedThrough).toBe(true);
    });

    it('completes the user message — that turn finished regardless of what the agent is doing', async () => {
        const harness = buildFailureHarness();

        await harness.apply(awaitingResult('AwaitingFeedback', 'Which environment?'));

        expect(harness.updates.find((u) => u.detailId === 'detail-user')?.status).toBe('Complete');
    });

    it('still paints Error for a genuine failure', async () => {
        const harness = buildFailureHarness();

        await harness.apply({
            success: false,
            agentRun: { Status: 'Failed', ErrorMessage: 'Pipeline blew up' },
        } as unknown as ExecuteAgentResult);

        const bubbleUpdate = harness.updates.find((u) => u.detailId === 'detail-agent');
        expect(bubbleUpdate?.status).toBe('Error');
        expect(bubbleUpdate?.message).toContain('Pipeline blew up');
        expect(harness.agentBubble.Error).toBe('Pipeline blew up');
    });

    it('still keeps a post-ACK disconnect In-Progress and starts the watch', async () => {
        const harness = buildFailureHarness();

        await harness.apply({
            success: false,
            errorMessage: 'Lost connection to the server. The agent may still be running. Please refresh to check the latest status.',
            requestAcknowledged: true,
        } as unknown as ExecuteAgentResult);

        expect(harness.updates.find((u) => u.detailId === 'detail-agent')?.status).toBe('In-Progress');
        expect(harness.watchesStarted).toEqual(['detail-agent']);
    });
});
