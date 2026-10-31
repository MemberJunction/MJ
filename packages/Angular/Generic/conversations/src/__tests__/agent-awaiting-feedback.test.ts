/**
 * @fileoverview An agent run in AwaitingFeedback is a SETTLED chat turn: a Chat final step
 * ends the run with CompletedAt stamped (base-agent), and a reply that resumes it sets it back
 * to Running. Two surfaces have to agree with that:
 *
 *  1. {@link AgentStateService} polls `Status IN ('Running', 'Paused')`. Counting
 *     AwaitingFeedback as live put every past chat turn in the active set: the indicator
 *     showed finished agents as "Completing", and polling never stopped because no cycle
 *     ever came back empty.
 *  2. The run reaches every failure path with `success: false` and — because it carries no
 *     ErrorMessage — {@link MessageInputComponent.applyAgentFailureToDetail} rendered it as
 *     "❌ failed" with "Unknown error" text. The agent asked the user a question; it did not fail.
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

describe('AgentStateService — a finished chat turn is not an active agent', () => {
    const services: AgentStateService[] = [];

    afterEach(() => {
        services.splice(0).forEach((s) => s.ngOnDestroy());
    });

    function newService(): AgentStateService {
        const service = new AgentStateService();
        services.push(service);
        return service;
    }

    it('asks the server for Running and Paused only', async () => {
        const service = newService();
        const probe = fakeProvider([]);

        await pollOnce(service, probe);

        expect(probe.calls).toHaveLength(1);
        const filter = probe.calls[0].ExtraFilter ?? '';
        expect(filter).toContain("'Running'");
        expect(filter).toContain("'Paused'");
        expect(filter).not.toContain("'AwaitingFeedback'");
    });

    it('leaves finished chat turns (AwaitingFeedback) out of the active set', async () => {
        const service = newService();
        const probe = fakeProvider([
            agentRun('AwaitingFeedback', 'turn-60'),
            agentRun('AwaitingFeedback', 'turn-30'),
            agentRun('AwaitingFeedback', 'turn-10'),
        ]);

        await pollOnce(service, probe);

        const active = await firstValueFrom(service.getActiveAgents(CONVERSATION_ID));
        expect(active).toEqual([]);
        expect(service.getAgent('turn-10')).toBeUndefined();
    });

    it('keeps a resumed run (Running) and a workflow-parked run (Paused) in the active set', async () => {
        const service = newService();
        const probe = fakeProvider([
            agentRun('Running', 'run-resumed'),
            agentRun('Paused', 'run-parked'),
            agentRun('AwaitingFeedback', 'turn-done'),
        ]);

        await pollOnce(service, probe);

        const active = await firstValueFrom(service.getActiveAgents(CONVERSATION_ID));
        expect(active.map((a) => a.run.ID).sort()).toEqual(['run-parked', 'run-resumed']);
        expect(service.getAgent('run-resumed')?.status).not.toBe('error');
    });

    it('stops polling when only finished chat turns remain', async () => {
        const service = newService();
        const probe = fakeProvider([agentRun('AwaitingFeedback', 'turn-60'), agentRun('AwaitingFeedback', 'turn-30')]);
        const internals = service as unknown as {
            loadActiveAgents(conversationId?: string): Promise<void>;
            minimumPollCycles: number;
            pollSubscription?: unknown;
        };
        service.Provider = probe.provider;
        service.StartPolling({ ID: 'user-1' } as unknown as UserInfo, CONVERSATION_ID);

        for (let cycle = 0; cycle < internals.minimumPollCycles; cycle++) {
            await internals.loadActiveAgents(CONVERSATION_ID);
        }

        expect(internals.pollSubscription).toBeUndefined();
    });
});

interface DetailStub {
    ID: string;
    Status: string;
    Message: string;
    Error?: string | null;
    IsSaved?: boolean;
    Load?: (id: string) => Promise<boolean>;
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
    settled: Array<{ detailId: string; message: string }>;
    apply(result: ExecuteAgentResult | null | undefined, failedVerb?: string): Promise<void>;
}

function buildFailureHarness(): FailureHarness {
    // The server writes the reply, so on the post-ACK path the component reloads the row it
    // wrote (IsSaved + Load) before deciding whether the run is still live; the stub stays
    // In-Progress on reload, which is the "still running" case.
    const agentBubble: DetailStub = { ID: 'detail-agent', Status: 'In-Progress', Message: '', IsSaved: true, Load: async () => true };
    const userMessage: DetailStub = { ID: 'detail-user', Status: 'In-Progress', Message: 'do the thing' };
    const updates: AppliedUpdate[] = [];
    const watchesStarted: string[] = [];
    const settled: Array<{ detailId: string; message: string }> = [];

    const component = Object.create(MessageInputComponent.prototype) as MessageInputComponent;
    Object.assign(component as unknown as Record<string, unknown>, {
        MessageSent: { emit: (): void => undefined },
        inFlightWatches: new Map<string, ReturnType<typeof setTimeout>>(),
        markMessageComplete: (): void => undefined,
        // A genuine failure settles the reply the server wrote: Error status, the failure text.
        settleReply: async (detail: DetailStub, message: string): Promise<void> => {
            settled.push({ detailId: detail.ID, message });
            detail.Message = message;
            detail.Status = 'Error';
        },
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
        settled,
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

        // A genuine failure settles the reply the server wrote — never the awaiting path.
        expect(harness.settled).toHaveLength(1);
        expect(harness.settled[0].detailId).toBe('detail-agent');
        expect(harness.settled[0].message).toContain('Pipeline blew up');
        expect(harness.agentBubble.Status).toBe('Error');
        expect(harness.updates.find((u) => u.detailId === 'detail-agent')).toBeUndefined();
    });

    it('still keeps a post-ACK disconnect In-Progress and starts the watch', async () => {
        const harness = buildFailureHarness();

        await harness.apply({
            success: false,
            errorMessage: 'Lost connection to the server. The agent may still be running. Please refresh to check the latest status.',
            requestAcknowledged: true,
        } as unknown as ExecuteAgentResult);

        // Still running on the server: the bubble keeps In-Progress (on screen only) and the
        // watch follows the row until the server writes a terminal status.
        expect(harness.agentBubble.Status).toBe('In-Progress');
        expect(harness.agentBubble.Message).toContain('still running');
        expect(harness.watchesStarted).toEqual(['detail-agent']);
        expect(harness.settled).toHaveLength(0);
    });
});
