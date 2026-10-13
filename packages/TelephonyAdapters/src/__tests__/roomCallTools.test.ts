import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

import type { HandoffRequest, RoomHandoffAgentContext } from '@memberjunction/livekit-room-server';
import { FINISH_HANDOFF_TOOL } from '@memberjunction/livekit-room-server';
import type { TransferTarget } from '../telephony/outboundCallPolicy.js';
import { CALL_CONTROL_SETTLE_MS, CANCEL_PENDING_WORK_TOOL, END_CALL_TOOL, TRANSFER_CALL_TOOL } from '../telephony/telephonyCallTools.js';
import {
    BuildRoomCallFraming,
    BuildRoomCallTools,
    ComputeHandoffCapabilities,
    RoomCallToolExecutor,
    SupportedRoomTargets,
    type RoomCallToolExecutorDeps,
} from '../telephony/roomCallTools.js';

const TARGETS: TransferTarget[] = [
    { Kind: 'user', Name: 'Billing team', UserEmail: 'dana@example.com', Description: 'refunds and invoices', FallbackNumber: '+14155550199' },
    { Kind: 'number', Name: 'Front desk', Number: '+14155550100' },
    { Kind: 'agent', Name: 'Legal', AgentName: 'Rex' },
];

describe('ComputeHandoffCapabilities / SupportedRoomTargets', () => {
    it('derives what the server can do from the engine\'s collaborators', () => {
        expect(ComputeHandoffCapabilities({})).toEqual({ Number: false, User: false, Agent: false });
        const presence = { IsParticipantPresent: async () => true };
        expect(ComputeHandoffCapabilities({ Presence: presence })).toEqual({ Number: false, User: true, Agent: false });
        expect(ComputeHandoffCapabilities({ Presence: presence, Dialer: { DialIntoRoom: async () => undefined } })).toEqual({ Number: true, User: true, Agent: false });
        expect(ComputeHandoffCapabilities({ AgentStarter: async () => ({ SessionBridgeID: 'b' }) })).toEqual({ Number: false, User: false, Agent: true });
    });

    it('offers only the directory entries whose kind the server can act on', () => {
        const only = SupportedRoomTargets(TARGETS, { Number: false, User: true, Agent: false });
        expect(only.map((t) => t.Name)).toEqual(['Billing team']);
        expect(SupportedRoomTargets(TARGETS, { Number: true, User: true, Agent: true })).toHaveLength(3);
        expect(SupportedRoomTargets(TARGETS, { Number: false, User: false, Agent: false })).toEqual([]);
    });
});

describe('BuildRoomCallTools', () => {
    it('offers transfer_call and finish_handoff only when something can be handed over to', () => {
        expect(BuildRoomCallTools([]).map((t) => t.Name)).toEqual([CANCEL_PENDING_WORK_TOOL, END_CALL_TOOL]);
        expect(BuildRoomCallTools(TARGETS).map((t) => t.Name)).toEqual([TRANSFER_CALL_TOOL, FINISH_HANDOFF_TOOL, CANCEL_PENDING_WORK_TOOL, END_CALL_TOOL]);
    });

    it('limits transfer_call to the directory names, with a mode and a required summary, and no free-form number', () => {
        const transfer = BuildRoomCallTools(TARGETS).find((t) => t.Name === TRANSFER_CALL_TOOL)!;
        const schema = transfer.ParametersSchema as { properties: Record<string, { enum?: string[] }>; required: string[] };
        expect(schema.properties['target'].enum).toEqual(['Billing team', 'Front desk', 'Legal']);
        expect(schema.properties['mode'].enum).toEqual(['warm', 'blind']);
        expect(schema.required).toEqual(['target', 'summary']);
        expect(Object.keys(schema.properties).sort()).toEqual(['mode', 'summary', 'target']);
    });

    it('describes each destination by name and description, never by number or email', () => {
        const description = BuildRoomCallTools(TARGETS).find((t) => t.Name === TRANSFER_CALL_TOOL)!.Description;
        expect(description).toContain('Billing team (refunds and invoices)');
        expect(description).not.toContain('+1415');
        expect(description).not.toContain('dana@example.com');
        expect(description).toContain('do NOT say goodbye');
    });
});

describe('BuildRoomCallFraming', () => {
    it('gives a phone call the phone etiquette, who is calling, and the room handoff instructions', () => {
        const text = BuildRoomCallFraming({ Channel: 'phone', Direction: 'Inbound', RemoteNumber: '+14155550123', SupportedTargets: TARGETS });
        expect(text).toContain('live telephone call');
        expect(text).toContain('UNVERIFIED');
        expect(text).toContain(TRANSFER_CALL_TOOL);
        expect(text).toContain(FINISH_HANDOFF_TOOL);
        expect(text).toContain('[handoff]');
        expect(text).toContain('Billing team (refunds and invoices)');
    });

    it('does not mention carrier transfer or keypad tones, which do not exist in a room', () => {
        const text = BuildRoomCallFraming({ Channel: 'phone', Direction: 'Inbound', RemoteNumber: '+1', SupportedTargets: [] });
        expect(text).not.toContain('send_dtmf');
        expect(text).not.toContain(FINISH_HANDOFF_TOOL);
    });

    it('frames a web visitor as a voice conversation in a room, not a phone call', () => {
        const text = BuildRoomCallFraming({ Channel: 'web', Direction: 'Inbound', SupportedTargets: [] });
        expect(text).toContain('live room');
        expect(text).not.toContain('telephone');
    });

    it('tells a taking-over agent who it replaces and what it was told', () => {
        const text = BuildRoomCallFraming({
            Channel: 'phone',
            Direction: 'Inbound',
            RemoteNumber: '+1',
            SupportedTargets: [],
            Takeover: { PreviousAgentName: 'Sage', Brief: 'Wants a refund for order 42' },
        });
        expect(text).toContain('taking this conversation over from Sage');
        expect(text).toContain('Wants a refund for order 42');
        expect(text).toContain('Do not make the caller repeat');
    });
});

function makeExecutor(overrides: Partial<RoomCallToolExecutorDeps> = {}) {
    const agent: RoomHandoffAgentContext = {
        RoomName: 'call-1',
        AgentName: 'Sage',
        CallerLabel: 'Phone caller ****0123',
        ContextUser: {} as never,
        Provider: {} as never,
        LeaveRoom: vi.fn(async () => undefined),
        NotifyModel: vi.fn(),
    };
    const requests: Array<{ agent: RoomHandoffAgentContext; request: HandoffRequest }> = [];
    const engine = {
        RequestHandoff: vi.fn((a: RoomHandoffAgentContext, request: HandoffRequest) => {
            requests.push({ agent: a, request });
            return { Ok: true as const, Status: 'offered' as const };
        }),
        AgentReadyToLeave: vi.fn(() => true),
    };
    const deps: RoomCallToolExecutorDeps = {
        Targets: TARGETS,
        Engine: engine,
        Agent: () => agent,
        ResolveDestination: vi.fn(async (t: TransferTarget) =>
            t.Kind === 'user'
                ? { Ok: true as const, Destination: { Kind: 'user' as const, UserID: 'u1', DisplayName: t.Name, FallbackNumber: t.FallbackNumber } }
                : { Ok: false as const, Error: `${t.Name} is not available.` },
        ),
        CancelPendingWork: vi.fn(() => 2),
        EndCall: vi.fn(async () => undefined),
        ...overrides,
    };
    return { executor: new RoomCallToolExecutor(deps), engine, deps, requests, agent };
}

const call = (ToolName: string, args: unknown) => ({ CallID: 'c1', ToolName, Arguments: typeof args === 'string' ? args : JSON.stringify(args) });
const parse = (json: string) => JSON.parse(json) as { ok: boolean; status?: string; error?: string; note?: string; cancelled?: number };

describe('RoomCallToolExecutor', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('owns exactly the four room-call tools', () => {
        const { executor } = makeExecutor();
        expect([TRANSFER_CALL_TOOL, FINISH_HANDOFF_TOOL, CANCEL_PENDING_WORK_TOOL, END_CALL_TOOL].every((n) => executor.Handles(n))).toBe(true);
        expect(executor.Handles('send_dtmf')).toBe(false);
        expect(executor.Handles('invoke-target-agent')).toBe(false);
    });

    describe('transfer_call', () => {
        it('hands the resolved destination, mode and summary to the engine and tells the model to keep the caller company', async () => {
            const { executor, requests, agent } = makeExecutor();
            const result = parse(await executor.Execute(call(TRANSFER_CALL_TOOL, { target: 'billing TEAM', mode: 'blind', summary: 'Wants a refund' })));
            expect(result).toMatchObject({ ok: true, status: 'offered' });
            expect(result.note).toContain('Do not say goodbye yet');
            expect(requests).toHaveLength(1);
            expect(requests[0].agent).toBe(agent);
            expect(requests[0].request).toEqual({
                Mode: 'blind',
                Summary: 'Wants a refund',
                Destination: { Kind: 'user', UserID: 'u1', DisplayName: 'Billing team', FallbackNumber: '+14155550199' },
            });
        });

        it('defaults to a warm handoff', async () => {
            const { executor, requests } = makeExecutor();
            await executor.Execute(call(TRANSFER_CALL_TOOL, { target: 'Billing team', summary: 's' }));
            expect(requests[0].request.Mode).toBe('warm');
        });

        it('refuses a target that is not in the directory and names the ones that are', async () => {
            const { executor, engine } = makeExecutor();
            const result = parse(await executor.Execute(call(TRANSFER_CALL_TOOL, { target: '+14155550100', summary: 's' })));
            expect(result.ok).toBe(false);
            expect(result.error).toContain('Billing team, Front desk, Legal');
            expect(engine.RequestHandoff).not.toHaveBeenCalled();
        });

        it('refuses an unknown mode', async () => {
            const { executor, engine } = makeExecutor();
            const result = parse(await executor.Execute(call(TRANSFER_CALL_TOOL, { target: 'Billing team', mode: 'cold', summary: 's' })));
            expect(result.ok).toBe(false);
            expect(engine.RequestHandoff).not.toHaveBeenCalled();
        });

        it('passes a destination that cannot be resolved back to the model without asking the engine', async () => {
            const { executor, engine } = makeExecutor();
            const result = parse(await executor.Execute(call(TRANSFER_CALL_TOOL, { target: 'Legal', summary: 's' })));
            expect(result).toEqual({ ok: false, error: 'Legal is not available.' });
            expect(engine.RequestHandoff).not.toHaveBeenCalled();
        });

        it('passes the engine\'s refusal back to the model', async () => {
            const { executor, engine } = makeExecutor();
            engine.RequestHandoff.mockReturnValueOnce({ Ok: false as never, Error: 'A handoff is already in progress for this call.' } as never);
            const result = parse(await executor.Execute(call(TRANSFER_CALL_TOOL, { target: 'Billing team', summary: 's' })));
            expect(result).toEqual({ ok: false, error: 'A handoff is already in progress for this call.' });
        });

        it('says the call is not connected yet when the agent has no room context', async () => {
            const { executor } = makeExecutor({ Agent: () => undefined });
            expect(parse(await executor.Execute(call(TRANSFER_CALL_TOOL, { target: 'Billing team', summary: 's' }))).error).toContain('not connected');
        });

        it('treats malformed arguments as a refusal, never a throw', async () => {
            const { executor } = makeExecutor();
            expect(parse(await executor.Execute(call(TRANSFER_CALL_TOOL, '{nope'))).ok).toBe(false);
        });
    });

    describe('finish_handoff', () => {
        it('lets the engine remove the agent when a handoff is waiting for it', async () => {
            const { executor, engine } = makeExecutor();
            expect(parse(await executor.Execute(call(FINISH_HANDOFF_TOOL, {})))).toMatchObject({ ok: true, status: 'leaving' });
            expect(engine.AgentReadyToLeave).toHaveBeenCalledWith('call-1');
        });

        it('tells the model to keep helping when no handoff is waiting', async () => {
            const { executor, engine } = makeExecutor();
            engine.AgentReadyToLeave.mockReturnValueOnce(false);
            expect(parse(await executor.Execute(call(FINISH_HANDOFF_TOOL, {})))).toMatchObject({ ok: false });
        });
    });

    describe('cancel_pending_work and end_call', () => {
        it('cancels delegated work and reports how many runs were aborted', async () => {
            const { executor, deps } = makeExecutor();
            expect(parse(await executor.Execute(call(CANCEL_PENDING_WORK_TOOL, {})))).toEqual({ ok: true, cancelled: 2 });
            expect(deps.CancelPendingWork).toHaveBeenCalled();
        });

        it('ends the call once the goodbye has had time to play, and only once', async () => {
            const { executor, deps } = makeExecutor();
            expect(parse(await executor.Execute(call(END_CALL_TOOL, { reason: 'all done' }))).status).toBe('ending');
            expect(deps.EndCall).not.toHaveBeenCalled();
            expect(parse(await executor.Execute(call(END_CALL_TOOL, {}))).status).toBe('ending');
            await vi.advanceTimersByTimeAsync(CALL_CONTROL_SETTLE_MS + 1);
            expect(deps.EndCall).toHaveBeenCalledTimes(1);
            expect(deps.EndCall).toHaveBeenCalledWith('all done');
        });
    });

    it('answers an unknown tool with a refusal', async () => {
        const { executor } = makeExecutor();
        expect(parse(await executor.Execute(call('send_dtmf', { digits: '1' }))).ok).toBe(false);
    });

    it('never throws even when a collaborator does', async () => {
        const { executor } = makeExecutor({
            ResolveDestination: vi.fn(async () => {
                throw new Error('directory down');
            }),
        });
        expect(parse(await executor.Execute(call(TRANSFER_CALL_TOOL, { target: 'Billing team', summary: 's' })))).toEqual({ ok: false, error: 'The action failed.' });
    });
});

