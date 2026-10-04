import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Participant tracking + the janitor use RunView.FromMetadataProvider; mock it, keep the rest of core intact.
const runViewMock = vi.fn();
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: {
            FromMetadataProvider: () => ({ RunView: runViewMock }),
        },
    };
});

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { IRealtimeSession, RealtimeSessionCapabilities, RealtimeTranscript } from '@memberjunction/ai';
import type { MJAIBridgeProviderEntity } from '@memberjunction/core-entities';
import { TURN_TAKING_TOOL_DEFINITIONS } from '@memberjunction/ai-bridge-base';
import { AIBridgeEngine, IHostInstanceIdentity, StartBridgeSessionParams, ActiveBridgeSession } from '../ai-bridge-engine';
import { LoopbackBridge, LOOPBACK_BRIDGE_DRIVER_CLASS } from '../loopback-bridge';

const RATE = 24000;

/** PCM16 mono bytes lasting `ms`. */
function pcm(ms: number): ArrayBuffer {
    return new ArrayBuffer(Math.round((ms / 1000) * RATE) * 2);
}

/** A loud PCM16 frame (speech-like energy). */
function loudFrame(samples = 480): ArrayBuffer {
    const arr = new Int16Array(samples);
    for (let i = 0; i < samples; i++) {
        arr[i] = i % 2 === 0 ? 6000 : -6000;
    }
    return arr.buffer;
}

/** A realtime session double whose capabilities and trigger behaviour a test controls. */
class FakeSession implements IRealtimeSession {
    public readonly OutputSampleRate = RATE;
    public readonly SpokenUpdates: string[] = [];
    public readonly ContextNotes: string[] = [];
    private outputHandler?: (chunk: ArrayBuffer) => void;
    private transcriptHandler?: (t: RealtimeTranscript) => void;

    constructor(private readonly fullDuplex: boolean) {}

    public get Capabilities(): RealtimeSessionCapabilities {
        return { CanReconfigureTurnMode: false, FullDuplex: this.fullDuplex };
    }
    public SendInput(): void { /* the agent hears */ }
    public async RegisterTools(): Promise<void> { /* no-op */ }
    public OnOutput(handler: (chunk: ArrayBuffer) => void): void { this.outputHandler = handler; }
    public OnTranscript(handler: (t: RealtimeTranscript) => void): void { this.transcriptHandler = handler; }
    public OnToolCall(): void { /* no-op */ }
    public async SendToolResult(): Promise<void> { /* no-op */ }
    public OnInterruption(): void { /* no-op */ }
    public OnError(): void { /* no-op */ }
    public OnUsage(): void { /* no-op */ }
    public async Close(): Promise<void> { /* no-op */ }
    public RequestSpokenUpdate(instructions: string): void { this.SpokenUpdates.push(instructions); }
    public SendContextNote(text: string): void { this.ContextNotes.push(text); }

    public Say(ms: number): void { this.outputHandler?.(pcm(ms)); }
    public FinishTurn(text: string): void { this.transcriptHandler?.({ Role: 'assistant', Text: text, IsFinal: true }); }
    public HearHuman(text: string): void { this.transcriptHandler?.({ Role: 'user', Text: text, IsFinal: true }); }
}

interface FakeRow {
    [key: string]: unknown;
}

let rowSeq = 0;
function makeRow(): FakeRow {
    return {
        ID: `bridge-fd-${++rowSeq}`,
        Status: 'Pending',
        NewRecord: vi.fn(),
        Save: vi.fn(async () => true),
        Load: vi.fn(async () => true),
        LatestResult: { CompleteMessage: '' },
    };
}

const provider = { GetEntityObject: vi.fn(async () => makeRow()) } as unknown as IMetadataProvider;
const user = { ID: 'user-1', Email: 'tester@example.com' } as unknown as UserInfo;
const providerEntity = {
    ID: 'provider-loopback',
    Name: 'Loopback',
    DriverClass: LOOPBACK_BRIDGE_DRIVER_CLASS,
    SupportedFeaturesObject: { AudioIn: true, AudioOut: true, SpeakerDiarization: true },
} as unknown as MJAIBridgeProviderEntity;
const HOST: IHostInstanceIdentity = { GetHostInstanceID: () => 'testhost:1:boot', GetHostNamePrefix: () => 'testhost:' };

function engine(): AIBridgeEngine {
    const e = AIBridgeEngine.Instance;
    e.SetHostInstanceIdentity(HOST);
    return e;
}

async function seat(
    id: string,
    name: string,
    session: FakeSession,
    extra: Partial<StartBridgeSessionParams> = {},
): Promise<ActiveBridgeSession> {
    return engine().StartBridgeSession({
        AgentSessionID: id,
        Provider: providerEntity,
        RealtimeSession: session,
        Address: 'arena',
        ContextUser: user,
        MetadataProvider: provider,
        AgentNames: [name],
        TurnMode: 'Passive',
        ...extra,
    });
}

function sent(active: ActiveBridgeSession): number {
    return (active.Bridge as LoopbackBridge).Sent.length;
}

async function stopAll(...actives: ActiveBridgeSession[]): Promise<void> {
    for (const a of actives) {
        await engine().StopBridgeSession(a.SessionBridgeID, 'Explicit');
    }
}

beforeEach(() => {
    runViewMock.mockReset();
    runViewMock.mockResolvedValue({ Success: true, Results: [] });
});

// Every test shares one room ('loopback:arena'); a failing test must not leave its agents seated for the next.
afterEach(async () => {
    await stopAll(...engine().ActiveSessions);
});

describe('AIBridgeEngine — full-duplex wiring', () => {
    it('gives a full-duplex session a gate, a human-speech detector and the turn-taking tool handler', async () => {
        const a = await seat('fd-a', 'Sage', new FakeSession(true), { TurnAddressing: 'Auto' });
        expect(a.TurnGate).toBeDefined();
        expect(a.HumanSpeech).toBeDefined();
        expect(a.AddressingMode).toBe('ModelSide');
        expect(a.ModelSideMatcher).toBeDefined();
        expect(a.TurnTakingToolHandler?.Handles('yield_turn')).toBe(true);
        expect(a.TurnTakingToolHandler?.Handles('i_am_addressed')).toBe(true);
        expect(a.TurnTakingToolHandler?.Handles('send_dtmf')).toBe(false);
        expect(TURN_TAKING_TOOL_DEFINITIONS.map(t => t.Name)).toEqual(['i_am_addressed', 'yield_turn']);
        await stopAll(a);
    });

    it('leaves a turn-based session ungated, regex-addressed, and without turn tools', async () => {
        const a = await seat('fd-b', 'Sage', new FakeSession(false), { TurnAddressing: 'Auto' });
        expect(a.TurnGate).toBeUndefined();
        expect(a.HumanSpeech).toBeUndefined();
        expect(a.AddressingMode).toBe('Regex');
        expect(a.ModelSideMatcher).toBeUndefined();
        expect(a.TurnTakingToolHandler).toBeUndefined();
        await stopAll(a);
    });

    it('keeps the legacy behaviour when no addressing mode is requested', async () => {
        const matcher = { IsAddressed: () => true };
        const a = await seat('fd-c', 'Sage', new FakeSession(true), { TurnMatcher: matcher });
        expect(a.AddressingMode).toBe('Regex');
        expect(a.ModelSideMatcher).toBeUndefined();
        await stopAll(a);
    });

    it('honours an explicit Regex request on a full-duplex model, keeping the caller\'s matcher', async () => {
        const matcher = { IsAddressed: vi.fn(() => true) };
        const a = await seat('fd-d', 'Sage', new FakeSession(true), { TurnAddressing: 'Regex', TurnMatcher: matcher });
        expect(a.AddressingMode).toBe('Regex');
        a.TurnPolicy.EvaluateTurn({ Segment: { Text: 'hi' } });
        expect(matcher.IsAddressed).toHaveBeenCalled();
        await stopAll(a);
    });

    it('lets the gate be switched off per session', async () => {
        const a = await seat('fd-e', 'Sage', new FakeSession(true), { FullDuplexTurnGate: false });
        expect(a.TurnGate).toBeUndefined();
        await stopAll(a);
    });
});

describe('AIBridgeEngine — the floor gate on outbound audio', () => {
    it('never gates a single-agent room', async () => {
        const session = new FakeSession(true);
        const a = await seat('solo', 'Sage', session);
        session.Say(200);
        session.Say(200);
        expect(sent(a)).toBe(2);
        await stopAll(a);
    });

    it('lets the first agent speak and cuts a second agent that talks over it', async () => {
        const sa = new FakeSession(true);
        const sb = new FakeSession(true);
        const a = await seat('duo-a', 'Sage', sa);
        const b = await seat('duo-b', 'Demo', sb);
        const flush = vi.spyOn(b.Bridge, 'FlushOutboundMedia');

        sa.Say(300); // Sage takes the floor
        expect(sent(a)).toBe(1);
        sb.Say(300); // a backchannel-length overlay is let through
        expect(sent(b)).toBe(1);
        sb.Say(1600); // …but a turn that outlasts the bound is cut
        expect(sent(b)).toBe(1);
        expect(flush).toHaveBeenCalledTimes(1);
        sb.Say(300); // and the rest of the burst is dropped
        expect(sent(b)).toBe(1);
        expect(engine().RoomCoordinator.IsFloorHolder(a.RoomKey!, a.AgentSessionID)).toBe(true);
        await stopAll(a, b);
    });

    it('frees the floor on the agent\'s final transcript so the next agent can speak', async () => {
        const sa = new FakeSession(true);
        const sb = new FakeSession(true);
        const a = await seat('seq-a', 'Sage', sa);
        const b = await seat('seq-b', 'Demo', sb);

        sa.Say(3000);
        sa.FinishTurn('Here is a thorough answer to the question that was asked');
        expect(engine().RoomCoordinator.IsFloorHolder(a.RoomKey!, a.AgentSessionID)).toBe(false);
        expect(a.HoldsFloor).toBe(false);

        sb.Say(3000);
        expect(sent(b)).toBe(1);
        expect(engine().RoomCoordinator.IsFloorHolder(b.RoomKey!, b.AgentSessionID)).toBe(true);
        await stopAll(a, b);
    });

    it('does not bill a short acknowledgement against the loop cap', async () => {
        const sa = new FakeSession(true);
        const a = await seat('bc-a', 'Sage', sa);
        const b = await seat('bc-b', 'Demo', new FakeSession(true));
        sa.Say(400);
        sa.FinishTurn('mm-hm');
        const snap = engine().GetRoomTurnSnapshot(a.RoomKey!)!;
        expect(snap.ConsecutiveAgentTurns).toBe(0);
        expect(snap.BackchannelCount).toBe(1);
        await stopAll(a, b);
    });
});

describe('AIBridgeEngine — humans win', () => {
    it('preempts the floor holder when a diarized human talks: flushes its output, frees the floor, fires the barge-in hook', async () => {
        const onBargeIn = vi.fn();
        const sa = new FakeSession(true);
        const a = await seat('hum-a', 'Sage', sa, { OnBargeIn: onBargeIn });
        const b = await seat('hum-b', 'Demo', new FakeSession(true));
        const flush = vi.spyOn(a.Bridge, 'FlushOutboundMedia');

        sa.Say(2000);
        expect(a.HoldsFloor).toBe(true);

        (b.Bridge as LoopbackBridge).EmitInbound({ Track: 'audio-in', Bytes: loudFrame(), SpeakerLabel: 'user-amith' });

        expect(flush).toHaveBeenCalled();
        expect(a.HoldsFloor).toBe(false);
        expect(onBargeIn).toHaveBeenCalledTimes(1);
        expect(engine().RoomCoordinator.IsFloorHolder(a.RoomKey!, a.AgentSessionID)).toBe(false);
        // The preempted agent's remaining audio is dropped, not forwarded.
        const before = sent(a);
        sa.Say(500);
        expect(sent(a)).toBe(before);
        await stopAll(a, b);
    });

    it('keeps every agent quiet while the human talks', async () => {
        const sa = new FakeSession(true);
        const sb = new FakeSession(true);
        const a = await seat('hq-a', 'Sage', sa);
        const b = await seat('hq-b', 'Demo', sb);
        (a.Bridge as LoopbackBridge).EmitInbound({ Track: 'audio-in', Bytes: loudFrame(), SpeakerLabel: 'user-amith' });
        sb.Say(500);
        expect(sent(b)).toBe(0);
        await stopAll(a, b);
    });

    it('never treats a peer agent\'s voice as a human', async () => {
        const sa = new FakeSession(true);
        const a = await seat('pa-a', 'Sage', sa);
        const b = await seat('pa-b', 'Demo', new FakeSession(true));
        sa.Say(2000);
        (b.Bridge as LoopbackBridge).EmitInbound({ Track: 'audio-in', Bytes: loudFrame(), SpeakerLabel: 'agent-pa-a' });
        expect(a.HoldsFloor).toBe(true);
        await stopAll(a, b);
    });

    it('ignores audio with no speaker label (it could be a peer)', async () => {
        const sa = new FakeSession(true);
        const a = await seat('ul-a', 'Sage', sa);
        const b = await seat('ul-b', 'Demo', new FakeSession(true));
        sa.Say(2000);
        (b.Bridge as LoopbackBridge).EmitInbound({ Track: 'audio-in', Bytes: loudFrame() });
        expect(a.HoldsFloor).toBe(true);
        await stopAll(a, b);
    });

    it('ignores quiet room noise from a human', async () => {
        const sa = new FakeSession(true);
        const a = await seat('qn-a', 'Sage', sa);
        const b = await seat('qn-b', 'Demo', new FakeSession(true));
        sa.Say(2000);
        (b.Bridge as LoopbackBridge).EmitInbound({ Track: 'audio-in', Bytes: new ArrayBuffer(960), SpeakerLabel: 'user-amith' });
        expect(a.HoldsFloor).toBe(true);
        await stopAll(a, b);
    });

    it('a finished human turn resets the loop counter without cutting a quick agent that already started', async () => {
        const sa = new FakeSession(true);
        const a = await seat('ht-a', 'Sage', sa);
        const b = await seat('ht-b', 'Demo', new FakeSession(true));
        sa.Say(1000);
        sa.HearHuman('Sage, what do you think?'); // the final transcript lands after Sage began answering
        expect(a.HoldsFloor).toBe(true);
        expect(engine().GetRoomTurnSnapshot(a.RoomKey!)!.ConsecutiveAgentTurns).toBe(0);
        await stopAll(a, b);
    });
});

describe('AIBridgeEngine — the turn-taking host tools', () => {
    it('i_am_addressed latches the model-side matcher and reserves the floor before any audio', async () => {
        const a = await seat('tool-a', 'Sage', new FakeSession(true), { TurnAddressing: 'ModelSide' });
        const b = await seat('tool-b', 'Demo', new FakeSession(true), { TurnAddressing: 'ModelSide' });

        const result = JSON.parse(await a.TurnTakingToolHandler!.Execute({ ToolName: 'i_am_addressed', Arguments: '{}' }));
        expect(result).toMatchObject({ ok: true, floor: 'granted' });
        expect(a.ModelSideMatcher!.HasPendingSignal).toBe(true);
        expect(a.TurnPolicy.EvaluateTurn({ Segment: { Text: 'Sage?' } }).Action).toBe('Speak');
        expect(engine().RoomCoordinator.IsFloorHolder(a.RoomKey!, a.AgentSessionID)).toBe(true);

        // A peer that claims it too is told to stay silent.
        const denied = JSON.parse(await b.TurnTakingToolHandler!.Execute({ ToolName: 'i_am_addressed', Arguments: '{}' }));
        expect(denied).toMatchObject({ ok: false, floor: 'denied', reason: 'HeldByOtherAgent' });
        await stopAll(a, b);
    });

    it('i_am_addressed in a single-agent room needs no floor', async () => {
        const a = await seat('tool-solo', 'Sage', new FakeSession(true), { TurnAddressing: 'ModelSide' });
        const result = JSON.parse(await a.TurnTakingToolHandler!.Execute({ ToolName: 'i_am_addressed', Arguments: '' }));
        expect(result).toMatchObject({ ok: true, floor: 'granted' });
        await stopAll(a);
    });

    it('yield_turn hands the floor to the named agent: reserved, nudged, and no third agent can start', async () => {
        const sa = new FakeSession(true);
        const sb = new FakeSession(true);
        const sc = new FakeSession(true);
        const a = await seat('yl-a', 'Sage', sa);
        const b = await seat('yl-b', 'Demo Loop', sb);
        const c = await seat('yl-c', 'Scout', sc);

        sa.Say(500); // Sage holds the floor
        const result = JSON.parse(await a.TurnTakingToolHandler!.Execute({ ToolName: 'yield_turn', Arguments: '{"to":"demo loop"}' }));

        expect(result).toMatchObject({ ok: true, floor: 'released', handedTo: 'Demo Loop', reason: 'Yielded' });
        expect(sb.ContextNotes.join(' ')).toContain('Sage handed the floor to you');
        expect(sb.SpokenUpdates).toHaveLength(1); // Demo Loop was triggered
        expect(engine().RoomCoordinator.IsFloorHolder(a.RoomKey!, b.AgentSessionID)).toBe(true);
        expect(engine().RoomCoordinator.IsFloorHolder(a.RoomKey!, a.AgentSessionID)).toBe(false);
        expect(a.HoldsFloor).toBe(false);

        sc.Say(2500); // Scout cannot start — Demo Loop has the floor
        expect(sent(c)).toBe(0);
        await stopAll(a, b, c);
    });

    it('yield_turn to an unknown name just returns the floor to the room, and says so', async () => {
        const sa = new FakeSession(true);
        const a = await seat('yu-a', 'Sage', sa);
        const b = await seat('yu-b', 'Demo', new FakeSession(true));
        sa.Say(500);
        const result = JSON.parse(await a.TurnTakingToolHandler!.Execute({ ToolName: 'yield_turn', Arguments: '{"to":"Nobody"}' }));
        expect(result.ok).toBe(true);
        expect(result.handedTo).toBeNull();
        expect(result.note).toContain("No agent named 'Nobody'");
        expect(engine().RoomCoordinator.IsFloorHolder(a.RoomKey!, a.AgentSessionID)).toBe(false);
        await stopAll(a, b);
    });

    it('yield_turn does not nudge a target whose driver cannot be triggered', async () => {
        const sa = new FakeSession(true);
        const sb = new FakeSession(true);
        (sb as unknown as { RequestSpokenUpdate?: unknown }).RequestSpokenUpdate = undefined;
        const a = await seat('yn-a', 'Sage', sa);
        const b = await seat('yn-b', 'Demo', sb);
        sa.Say(500);
        await a.TurnTakingToolHandler!.Execute({ ToolName: 'yield_turn', Arguments: '{"to":"Demo"}' });
        expect(sb.ContextNotes.filter(n => n.includes('handed the floor'))).toHaveLength(1);
        expect(sb.SpokenUpdates).toHaveLength(0);
        await stopAll(a, b);
    });

    it('reports an unreadable yield and an unknown tool as structured failures instead of throwing', async () => {
        const a = await seat('bad-a', 'Sage', new FakeSession(true));
        const bad = JSON.parse(await a.TurnTakingToolHandler!.Execute({ ToolName: 'yield_turn', Arguments: '{oops' }));
        expect(bad.ok).toBe(false);
        const unknown = JSON.parse(await a.TurnTakingToolHandler!.Execute({ ToolName: 'nope', Arguments: '{}' }));
        expect(unknown.ok).toBe(false);
        await stopAll(a);
    });
});

describe('AIBridgeEngine — telling a model how to take turns', () => {
    it('keeps a solo agent in a one-on-one answering everything: no framing until the room has a second agent', async () => {
        const sa = new FakeSession(true);
        const a = await seat('ann-a', 'Sage', sa);
        expect(sa.ContextNotes).toHaveLength(0);

        const sb = new FakeSession(true);
        const b = await seat('ann-b', 'Demo', sb);
        expect(sa.ContextNotes).toHaveLength(1); // the first agent is told now that it has company
        expect(sb.ContextNotes).toHaveLength(1);
        expect(sa.ContextNotes[0]).toContain('i_am_addressed');

        const sc = new FakeSession(true);
        const c = await seat('ann-c', 'Scout', sc);
        expect(sa.ContextNotes).toHaveLength(1); // never repeated
        expect(sb.ContextNotes).toHaveLength(1);
        expect(sc.ContextNotes).toHaveLength(1);
        await stopAll(a, b, c);
    });

    it('never tells a turn-based model (it has no tools to use and the engine triggers its speech)', async () => {
        const sa = new FakeSession(false);
        const a = await seat('ann-t1', 'Sage', sa);
        const b = await seat('ann-t2', 'Demo', new FakeSession(false));
        expect(sa.ContextNotes).toHaveLength(0);
        await stopAll(a, b);
    });
});

describe('AIBridgeEngine — turn-taking observability and limits', () => {
    it('describes the room: who is seated, how each addresses, who holds the floor', async () => {
        const sa = new FakeSession(true);
        const a = await seat('obs-a', 'Sage', sa, { TurnAddressing: 'Auto' });
        const b = await seat('obs-b', 'Demo', new FakeSession(false), { TurnAddressing: 'Auto', TurnMode: 'Active' });
        sa.Say(300);

        const snap = engine().GetRoomTurnSnapshot(a.RoomKey!)!;
        expect(snap.FloorHolderAgentSessionId).toBe('obs-a');
        expect(snap.Agents).toEqual([
            { AgentSessionID: 'obs-a', SessionBridgeID: a.SessionBridgeID, Names: ['Sage'], TurnMode: 'Passive', Addressing: 'ModelSide', FullDuplex: true },
            { AgentSessionID: 'obs-b', SessionBridgeID: b.SessionBridgeID, Names: ['Demo'], TurnMode: 'Active', Addressing: 'Regex', FullDuplex: false },
        ]);
        expect(snap.RecentEvents.some(e => e.Type === 'FloorGranted')).toBe(true);
        await stopAll(a, b);
    });

    it('returns null for an unknown room', () => {
        expect(engine().GetRoomTurnSnapshot('no-such-room')).toBeNull();
    });

    it('lets the loop cap be tuned and enforces it', async () => {
        engine().ConfigureTurnLimits({ MaxConsecutiveAgentTurns: 1 });
        try {
            const sa = new FakeSession(true);
            const sb = new FakeSession(true);
            const a = await seat('cap-a', 'Sage', sa);
            const b = await seat('cap-b', 'Demo', sb);
            sa.Say(3000);
            sa.FinishTurn('A complete answer with plenty of words in it');
            sb.Say(100); // the cap of 1 is already spent → cut
            expect(sent(b)).toBe(0);
            expect(engine().GetRoomTurnSnapshot(a.RoomKey!)!.LoopCapReached).toBe(true);
            await stopAll(a, b);
        } finally {
            engine().ConfigureTurnLimits({ MaxConsecutiveAgentTurns: 8 });
        }
    });
});
