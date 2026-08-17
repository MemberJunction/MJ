import { describe, it, expect, vi, beforeEach } from 'vitest';

// RunView.FromMetadataProvider is used by participant tracking + the janitor; mock it while leaving
// the rest of @memberjunction/core (UserInfo type, LogError/LogStatus, RegisterForStartup) intact.
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
import type { IRealtimeSession, RealtimeTranscript } from '@memberjunction/ai';
import type {
    MJAIBridgeProviderEntity,
    MJAIBridgeProviderEntity_IBridgeProviderFeatures,
} from '@memberjunction/core-entities';
import { BridgeMediaFrame, AIBridgeEngineBase } from '@memberjunction/ai-bridge-base';
import {
    AIBridgeEngine,
    IHostInstanceIdentity,
    StartBridgeSessionParams,
    TurnModeratorContext,
} from '../ai-bridge-engine';
import { LoopbackBridge, LOOPBACK_BRIDGE_DRIVER_CLASS } from '../loopback-bridge';

// ──────────────────────────────────────────────────────────────────────────────
// Test doubles.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * A mock IRealtimeSession capturing what the agent "hears" (SendInput) and exposing the registered
 * output/transcript handlers so a test can drive what the agent "says" / what is transcribed.
 */
class MockRealtimeSession implements IRealtimeSession {
    public readonly Heard: ArrayBuffer[] = [];
    public readonly SpokenUpdates: string[] = [];
    private outputHandler?: (chunk: ArrayBuffer) => void;
    private transcriptHandler?: (t: RealtimeTranscript) => void;

    public SendInput(chunk: ArrayBuffer): void {
        this.Heard.push(chunk);
    }
    public async RegisterTools(): Promise<void> {
        /* no-op for tests */
    }
    public OnOutput(handler: (chunk: ArrayBuffer) => void): void {
        this.outputHandler = handler;
    }
    public OnTranscript(handler: (t: RealtimeTranscript) => void): void {
        this.transcriptHandler = handler;
    }
    public OnToolCall(): void {
        /* no-op */
    }
    public async SendToolResult(): Promise<void> {
        /* no-op */
    }
    public OnInterruption(): void {
        /* no-op */
    }
    public OnError(): void {
        /* no-op */
    }
    public OnUsage(): void {
        /* no-op */
    }
    /** `true` once Close() ran — lets a re-gate test assert the replaced socket was actually released. */
    public Closed = false;
    public async Close(): Promise<void> {
        this.Closed = true;
    }
    public RequestSpokenUpdate(instructions: string): void {
        this.SpokenUpdates.push(instructions);
    }

    /** Capability flag + capture for the live-reconfigure path (§6). */
    public CanReconfigure = true;
    public readonly ReconfigureCalls: Array<{ DisableAutoResponse?: boolean }> = [];
    public get Capabilities(): { CanReconfigureTurnMode: boolean } {
        return { CanReconfigureTurnMode: this.CanReconfigure };
    }
    public Reconfigure(params: { DisableAutoResponse?: boolean }): void {
        this.ReconfigureCalls.push(params);
    }

    /** Drive an output frame (what the agent says) through the wired handler. */
    public EmitOutput(chunk: ArrayBuffer): void {
        this.outputHandler?.(chunk);
    }
    /** Drive a transcript event through the wired handler. */
    public EmitTranscript(t: RealtimeTranscript): void {
        this.transcriptHandler?.(t);
    }
}

/** Minimal fake bridge-row / participant entity with the members the engine touches. */
interface FakeEntity {
    [key: string]: unknown;
    NewRecord: () => void;
    Save: () => Promise<boolean>;
    Load: (id: string) => Promise<boolean>;
    LatestResult?: { CompleteMessage?: string };
}

let bridgeRowSeq = 0;
function makeBridgeRow(overrides: Partial<FakeEntity> = {}): FakeEntity {
    return {
        ID: `bridge-${++bridgeRowSeq}`,
        Status: 'Pending',
        NewRecord: vi.fn(),
        Save: vi.fn(async () => true),
        Load: vi.fn(async () => true),
        LatestResult: { CompleteMessage: '' },
        ...overrides,
    };
}

function makeParticipantRow(overrides: Partial<FakeEntity> = {}): FakeEntity {
    return {
        ID: `participant-${Math.random().toString(36).slice(2)}`,
        NewRecord: vi.fn(),
        Save: vi.fn(async () => true),
        Load: vi.fn(async () => true),
        LatestResult: { CompleteMessage: '' },
        ...overrides,
    };
}

/** Records the entity instances handed out so tests can assert on them. */
function makeProvider(factory: (entityName: string) => FakeEntity): {
    provider: IMetadataProvider;
    handedOut: FakeEntity[];
} {
    const handedOut: FakeEntity[] = [];
    const provider = {
        GetEntityObject: vi.fn(async (entityName: string) => {
            const e = factory(entityName);
            handedOut.push(e);
            return e;
        }),
    } as unknown as IMetadataProvider;
    return { provider, handedOut };
}

function makeUser(): UserInfo {
    return { ID: 'user-1', Email: 'tester@example.com' } as unknown as UserInfo;
}

function makeProviderEntity(
    features: MJAIBridgeProviderEntity_IBridgeProviderFeatures,
    driverClass = LOOPBACK_BRIDGE_DRIVER_CLASS,
): MJAIBridgeProviderEntity {
    return {
        ID: 'provider-loopback',
        Name: 'Loopback',
        DriverClass: driverClass,
        SupportedFeaturesObject: features,
    } as unknown as MJAIBridgeProviderEntity;
}

const AUDIO_FEATURES: MJAIBridgeProviderEntity_IBridgeProviderFeatures = {
    AudioIn: true,
    AudioOut: true,
    SpeakerDiarization: true,
};

const HOST: IHostInstanceIdentity = {
    GetHostInstanceID: () => 'testhost:123:bootA',
    GetHostNamePrefix: () => 'testhost:',
};

/** Builds a fresh engine for a test by reusing the singleton but resetting its host identity. */
function engine(): AIBridgeEngine {
    const e = AIBridgeEngine.Instance;
    e.SetHostInstanceIdentity(HOST);
    return e;
}

function baseParams(
    session: MockRealtimeSession,
    provider: IMetadataProvider,
    extra: Partial<StartBridgeSessionParams> = {},
): StartBridgeSessionParams {
    return {
        AgentSessionID: 'session-1',
        Provider: makeProviderEntity(AUDIO_FEATURES),
        RealtimeSession: session,
        Address: 'loopback://room',
        ContextUser: makeUser(),
        MetadataProvider: provider,
        ...extra,
    };
}

function bytes(...vals: number[]): ArrayBuffer {
    return new Uint8Array(vals).buffer;
}

beforeEach(() => {
    runViewMock.mockReset();
    runViewMock.mockResolvedValue({ Success: true, Results: [] });
});

// ──────────────────────────────────────────────────────────────────────────────
// Transport seam round-trip.
// ──────────────────────────────────────────────────────────────────────────────

describe('AIBridgeEngine — transport seam round-trip (LoopbackBridge + mock session)', () => {
    it('routes inbound bridge media → session.SendInput (the agent hears)', async () => {
        const session = new MockRealtimeSession();
        const { provider } = makeProvider(() => makeBridgeRow());
        const active = await engine().StartBridgeSession(baseParams(session, provider));

        const loopback = active.Bridge as LoopbackBridge;
        loopback.EmitInbound({ Track: 'audio-in', Bytes: bytes(1, 2, 3) });

        expect(session.Heard.length).toBe(1);
        expect(new Uint8Array(session.Heard[0])).toEqual(new Uint8Array([1, 2, 3]));

        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('routes session output → bridge.SendMedia, and the loopback echoes it back to SendInput', async () => {
        const session = new MockRealtimeSession();
        const { provider } = makeProvider(() => makeBridgeRow());
        const active = await engine().StartBridgeSession(baseParams(session, provider));
        const loopback = active.Bridge as LoopbackBridge;

        // The agent "speaks": drive a model output frame through the session's OnOutput handler.
        session.EmitOutput(bytes(9, 8, 7));

        // Outbound reached the bridge as audio-out...
        expect(loopback.Sent.length).toBe(1);
        expect(loopback.Sent[0].Track).toBe('audio-out');
        // ...and the loopback echoed it back inbound → the agent heard its own (looped) audio.
        expect(session.Heard.length).toBe(1);
        expect(new Uint8Array(session.Heard[0])).toEqual(new Uint8Array([9, 8, 7]));

        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('decodes a Base64 inbound frame to the raw ArrayBuffer the session consumes', async () => {
        const session = new MockRealtimeSession();
        const { provider } = makeProvider(() => makeBridgeRow());
        const active = await engine().StartBridgeSession(baseParams(session, provider));
        const loopback = active.Bridge as LoopbackBridge;

        // "AQID" is base64 for bytes [1,2,3].
        loopback.EmitInbound({ Track: 'audio-in', Base64: 'AQID' });
        expect(new Uint8Array(session.Heard[0])).toEqual(new Uint8Array([1, 2, 3]));

        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('drops an empty inbound frame (no payload) without calling SendInput', async () => {
        const session = new MockRealtimeSession();
        const { provider } = makeProvider(() => makeBridgeRow());
        const active = await engine().StartBridgeSession(baseParams(session, provider));
        const loopback = active.Bridge as LoopbackBridge;

        loopback.EmitInbound({ Track: 'audio-in' });
        expect(session.Heard.length).toBe(0);

        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Lifecycle + status transitions.
// ──────────────────────────────────────────────────────────────────────────────

describe('AIBridgeEngine — lifecycle and status transitions', () => {
    it('drives Pending → Connecting → Connected and stamps handles + host', async () => {
        const session = new MockRealtimeSession();
        const row = makeBridgeRow();
        const { provider } = makeProvider(() => row);

        const active = await engine().StartBridgeSession(baseParams(session, provider));

        expect(row.NewRecord).toHaveBeenCalled();
        // Final persisted status is Connected; handles + host stamped.
        expect(row.Status).toBe('Connected');
        expect(row.HostInstanceID).toBe('testhost:123:bootA');
        expect(row.BotParticipantID).toBe('loopback-agent');
        expect(typeof row.ExternalConnectionID).toBe('string');
        expect(row.ConnectedAt).toBeInstanceOf(Date);
        expect((active.Bridge as LoopbackBridge).IsConnected).toBe(true);
        // Save called at least 3x: Pending create, Connecting, Connected.
        expect((row.Save as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(3);

        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('StopBridgeSession disconnects the driver and marks the row Disconnected with the reason', async () => {
        const session = new MockRealtimeSession();
        const row = makeBridgeRow();
        const { provider } = makeProvider(() => row);

        const active = await engine().StartBridgeSession(baseParams(session, provider));
        const loopback = active.Bridge as LoopbackBridge;

        const ok = await engine().StopBridgeSession(active.SessionBridgeID, 'HostEnded');

        expect(ok).toBe(true);
        expect(loopback.IsConnected).toBe(false);
        expect(row.Status).toBe('Disconnected');
        expect(row.CloseReason).toBe('HostEnded');
        expect(row.DisconnectedAt).toBeInstanceOf(Date);
        // No longer in the active registry.
        expect(engine().ActiveSessions.find(s => s.SessionBridgeID === active.SessionBridgeID)).toBeUndefined();
    });

    it('stamps Failed when the driver Connect throws', async () => {
        const session = new MockRealtimeSession();
        const row = makeBridgeRow();
        const { provider } = makeProvider(() => row);

        // A provider whose DriverClass resolves to a driver that rejects on Connect.
        const params = baseParams(session, provider, {
            Provider: makeProviderEntity(AUDIO_FEATURES, 'NoSuchBridgeDriver'),
        });

        await expect(engine().StartBridgeSession(params)).rejects.toThrow(/No bridge driver registered/);
        expect(row.Status).toBe('Failed');
        expect(row.CloseReason).toBe('Error');
    });

    it('throws when no MetadataProvider is supplied', async () => {
        const session = new MockRealtimeSession();
        const params = baseParams(session, {} as unknown as IMetadataProvider);
        // Strip the provider to trigger the guard.
        (params as { MetadataProvider?: IMetadataProvider }).MetadataProvider = undefined;
        await expect(engine().StartBridgeSession(params)).rejects.toThrow(/requires a MetadataProvider/);
    });

    it('StopBridgeSession is idempotent on an already-Disconnected row', async () => {
        const row = makeBridgeRow({ Status: 'Disconnected' });
        const { provider } = makeProvider(() => row);
        // Not in the active map → reconcile-only path.
        const ok = await engine().StopBridgeSession('bridge-ghost', 'Janitor', makeUser(), provider);
        expect(ok).toBe(true);
        // Should NOT overwrite status (already terminal); Save not needed.
        expect(row.Status).toBe('Disconnected');
    });

    it('invokes the registered run finalizer when reaping an orphan (no live session) so the co-agent run finalizes', async () => {
        const row = makeBridgeRow({ Status: 'Connected', AgentSessionID: 'sess-42' });
        const { provider } = makeProvider(() => row);
        const finalizer = vi.fn(async () => undefined);
        engine().SetSessionRunFinalizer(finalizer);
        const user = makeUser();
        try {
            // Not in the active map → reconcile-only path → markBridgeDisconnected → finalizer.
            const ok = await engine().StopBridgeSession('bridge-orphan-x', 'Janitor', user, provider);
            expect(ok).toBe(true);
            expect(row.Status).toBe('Disconnected');
            // 'Janitor' is a non-error reason → finalize as success, scoped to the row's AgentSessionID.
            expect(finalizer).toHaveBeenCalledWith('sess-42', true, user, provider);
        } finally {
            engine().SetSessionRunFinalizer(async () => undefined); // reset shared singleton state
        }
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Turn-taking integration.
// ──────────────────────────────────────────────────────────────────────────────

describe('AIBridgeEngine — turn-taking integration (Passive)', () => {
    it('does NOT force a spoken update — relies on the model auto-response (no double-fire / overlap)', async () => {
        // The bridged model runs with server-VAD auto-response (same config as browser-direct), so it
        // already replies to each turn on its own — one clean stream. The engine must NOT also force a
        // `RequestSpokenUpdate`: that second `response.create` races the auto-response and the agent
        // answers twice, the streams overlapping/chopping. This guards against re-introducing that bug.
        // (Turn-controlled mode — where the bridge DISABLES auto-response and becomes the sole trigger —
        // is the multi-agent floor-control follow-up; it will assert the forced-update path separately.)
        const session = new MockRealtimeSession();
        const { provider } = makeProvider(() => makeBridgeRow());
        const active = await engine().StartBridgeSession(
            baseParams(session, provider, {
                TurnMode: 'Passive',
                TurnMatcher: { IsAddressed: (seg) => /\bSage\b/i.test(seg.Text) },
            }),
        );

        // No forced spoken update on ANY turn — addressed or not — because the model auto-responds.
        session.EmitTranscript({ Role: 'user', Text: 'How is the weather today', IsFinal: true });
        session.EmitTranscript({ Role: 'user', Text: 'Hey Sage, what do you think?', IsFinal: true });
        session.EmitTranscript({ Role: 'assistant', Text: 'Sage here, responding', IsFinal: true });
        session.EmitTranscript({ Role: 'user', Text: 'Sage', IsFinal: false });
        expect(session.SpokenUpdates.length).toBe(0);

        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('meeting mode (DisableAutoResponse): the bridge is the SOLE trigger — forces a spoken update ONLY when addressed', async () => {
        // With auto-response OFF (multi-agent room), the model never replies on its own, so the engine MUST
        // force exactly one response when the turn policy says the agent was addressed — and stay silent on
        // un-addressed turns. This is the core of "hear everything, speak only when addressed".
        const session = new MockRealtimeSession();
        const { provider } = makeProvider(() => makeBridgeRow());
        const active = await engine().StartBridgeSession(
            baseParams(session, provider, {
                TurnMode: 'Passive',
                DisableAutoResponse: true,
                TurnMatcher: { IsAddressed: (seg) => /\bSage\b/i.test(seg.Text) },
            }),
        );

        // Un-addressed final turn → silent (no forced response).
        session.EmitTranscript({ Role: 'user', Text: 'How is the weather today', IsFinal: true });
        expect(session.SpokenUpdates.length).toBe(0);

        // Addressed final turn → exactly one forced response (the bridge speaks for the agent).
        session.EmitTranscript({ Role: 'user', Text: 'Hey Sage, what do you think?', IsFinal: true });
        expect(session.SpokenUpdates.length).toBe(1);

        // Assistant + non-final turns never trigger.
        session.EmitTranscript({ Role: 'assistant', Text: 'Sage here, responding', IsFinal: true });
        session.EmitTranscript({ Role: 'user', Text: 'Sage', IsFinal: false });
        expect(session.SpokenUpdates.length).toBe(1);

        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('floor control: a meeting agent stays silent while another agent holds the room floor, speaks once it is released', async () => {
        const session = new MockRealtimeSession();
        const { provider } = makeProvider(() => makeBridgeRow());
        const active = await engine().StartBridgeSession(
            baseParams(session, provider, {
                TurnMode: 'Passive',
                DisableAutoResponse: true,
                TurnMatcher: { IsAddressed: () => true }, // always addressed → the gate is purely the floor
            }),
        );
        const roomKey = active.RoomKey!;
        const coord = engine().RoomCoordinator;

        // Another agent in the SAME room takes the floor first.
        coord.RegisterRoomParticipant(roomKey, 'other-agent');
        expect(coord.TakeFloor(roomKey, 'other-agent').Granted).toBe(true);

        // Our agent is addressed but the floor is held → it must stay silent.
        session.EmitTranscript({ Role: 'user', Text: 'anyone?', IsFinal: true });
        expect(session.SpokenUpdates.length).toBe(0);

        // The holder finishes → floor free → our agent speaks on the next addressed turn.
        coord.ReleaseFloor(roomKey, 'other-agent');
        session.EmitTranscript({ Role: 'user', Text: 'still there?', IsFinal: true });
        expect(session.SpokenUpdates.length).toBe(1);
        // It now holds the floor; its own final transcript releases it for the next speaker.
        expect(coord.IsFloorHolder(roomKey, active.AgentSessionID)).toBe(true);
        session.EmitTranscript({ Role: 'assistant', Text: 'here I am', IsFinal: true });
        expect(coord.IsFloorHolder(roomKey, active.AgentSessionID)).toBe(false);

        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Retroactive re-gating (capability-gated).
// ──────────────────────────────────────────────────────────────────────────────

describe('AIBridgeEngine — ReconfigureSessionToMeeting', () => {
    it('re-gates a CAPABLE session to meeting mode (idempotently); leaves an INCAPABLE one conversational', async () => {
        const { provider } = makeProvider(() => makeBridgeRow());
        const always = { IsAddressed: () => true };

        // Capable provider (OpenAI-like) → re-gated: auto-response off + Reconfigure pushed once (idempotent).
        const capable = new MockRealtimeSession(); // CanReconfigure defaults true
        const a1 = await engine().StartBridgeSession(baseParams(capable, provider)); // starts 1:1
        expect(a1.DisableAutoResponse).toBe(false);
        expect(engine().ReconfigureSessionToMeeting(a1.SessionBridgeID, always)).toBe(true);
        expect(a1.DisableAutoResponse).toBe(true);
        expect(capable.ReconfigureCalls).toEqual([{ DisableAutoResponse: true }]);
        // Idempotent — already meeting → true, no second reconfigure.
        expect(engine().ReconfigureSessionToMeeting(a1.SessionBridgeID, always)).toBe(true);
        expect(capable.ReconfigureCalls.length).toBe(1);
        await engine().StopBridgeSession(a1.SessionBridgeID, 'Explicit');

        // Incapable provider (Gemini-like) → left conversational, NO dead Reconfigure call.
        const incapable = new MockRealtimeSession();
        incapable.CanReconfigure = false;
        const a2 = await engine().StartBridgeSession(baseParams(incapable, provider));
        expect(engine().ReconfigureSessionToMeeting(a2.SessionBridgeID, always)).toBe(false);
        expect(a2.DisableAutoResponse).toBe(false);
        expect(incapable.ReconfigureCalls.length).toBe(0);
        await engine().StopBridgeSession(a2.SessionBridgeID, 'Explicit');
    });

    it('returns false for an unknown bridge', () => {
        expect(engine().ReconfigureSessionToMeeting('nope', { IsAddressed: () => true })).toBe(false);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// EnsureSessionMeetingGated — the complete gate, including the RECONNECT path for providers whose turn
// config is fixed at connect (Gemini-like). Before this existed, such an agent — if it was FIRST into the
// room — simply kept auto-responding to every utterance and talked over the whole cast.
// ──────────────────────────────────────────────────────────────────────────────

describe('AIBridgeEngine — EnsureSessionMeetingGated', () => {
    /** Only "gem" addresses this agent — so an unaddressed turn proves the gate, not just the flag. */
    const addressesGem = { IsAddressed: (seg: { Text: string }) => /gem/i.test(seg.Text) };
    const always = { IsAddressed: () => true };

    it('re-gates a NON-reconfigurable provider by RECONNECTING it in meeting mode, on the same seat', async () => {
        const { provider } = makeProvider(() => makeBridgeRow());
        const original = new MockRealtimeSession();
        original.CanReconfigure = false; // Gemini-like: turn config fixed at connect
        // The replacement is the SAME provider — it is the meeting-mode MINT that gates it, not a capability
        // that magically appeared. Keeping the flag false is what makes this test about the reconnect.
        const fresh = new MockRealtimeSession();
        fresh.CanReconfigure = false;
        let reopens = 0;

        const a = await engine().StartBridgeSession(
            baseParams(original, provider, {
                Address: 'loopback://regate-reconnect-room',
                AgentSessionID: 'regate-1',
                ReopenInMeetingMode: async () => {
                    reopens++;
                    return fresh;
                },
            }),
        );
        // The bug, stated as an assertion: a solo 1:1 seat answers everything it hears.
        expect(engine().GetEffectiveTurnState(a.SessionBridgeID)).toEqual({ MeetingGated: false, CanReconfigureTurnMode: false });

        expect(await engine().EnsureSessionMeetingGated(a.SessionBridgeID, addressesGem)).toBe(true);

        expect(reopens).toBe(1);
        expect(engine().GetEffectiveTurnState(a.SessionBridgeID)).toEqual({ MeetingGated: true, CanReconfigureTurnMode: false });
        // Same seat: same ActiveBridgeSession object, same bridge row, same agent session — only the socket moved.
        expect(engine().ActiveSessions).toContain(a);
        expect(a.AgentSessionID).toBe('regate-1');
        expect(a.RealtimeSession).toBe(fresh);
        expect(original.Closed).toBe(true); // the replaced socket is released, never left auto-responding
        expect(original.ReconfigureCalls.length).toBe(0); // no dead call on a provider that can't take one

        // The transport seam follows the swap: room audio reaches the FRESH socket, and only it.
        (a.Bridge as LoopbackBridge).EmitInbound({ Track: 'audio-in', Bytes: bytes(7) });
        expect(fresh.Heard.length).toBe(1);
        expect(original.Heard.length).toBe(0);

        // And turn-taking is genuinely gated now: addressed → the bridge triggers it; unaddressed → silence.
        fresh.EmitTranscript({ Role: 'user', Text: 'gem, are you with us?', IsFinal: true });
        expect(fresh.SpokenUpdates.length).toBe(1);
        fresh.EmitTranscript({ Role: 'assistant', Text: 'yes', IsFinal: true }); // finishes → frees the floor
        fresh.EmitTranscript({ Role: 'user', Text: 'anyway, back to the roadmap', IsFinal: true });
        expect(fresh.SpokenUpdates.length).toBe(1); // it stayed OUT of a turn it wasn't named in

        await engine().StopBridgeSession(a.SessionBridgeID, 'Explicit');
    });

    it('keeps the cheap in-place path for a re-configurable provider, and is idempotent', async () => {
        const { provider } = makeProvider(() => makeBridgeRow());
        const capable = new MockRealtimeSession(); // CanReconfigure defaults true (OpenAI-like)
        let reopens = 0;
        const a = await engine().StartBridgeSession(
            baseParams(capable, provider, {
                Address: 'loopback://regate-inplace-room',
                ReopenInMeetingMode: async () => {
                    reopens++;
                    return new MockRealtimeSession();
                },
            }),
        );

        expect(await engine().EnsureSessionMeetingGated(a.SessionBridgeID, always)).toBe(true);
        // No reconnect: the live socket was simply reconfigured, and it is still the session in use.
        expect(reopens).toBe(0);
        expect(capable.ReconfigureCalls).toEqual([{ DisableAutoResponse: true }]);
        expect(a.RealtimeSession).toBe(capable);
        expect(capable.Closed).toBe(false);
        expect(engine().GetEffectiveTurnState(a.SessionBridgeID)).toEqual({ MeetingGated: true, CanReconfigureTurnMode: true });

        // Idempotent — a second (or third) agent joining must not re-push the same reconfigure.
        expect(await engine().EnsureSessionMeetingGated(a.SessionBridgeID, always)).toBe(true);
        expect(capable.ReconfigureCalls.length).toBe(1);
        expect(reopens).toBe(0);

        await engine().StopBridgeSession(a.SessionBridgeID, 'Explicit');
    });

    it('reconnects ONCE for concurrent callers, and mutes the un-gated socket while it happens', async () => {
        const { provider } = makeProvider(() => makeBridgeRow());
        const original = new MockRealtimeSession();
        original.CanReconfigure = false;
        const fresh = new MockRealtimeSession();
        fresh.CanReconfigure = false;
        let reopens = 0;
        let releaseReopen: (() => void) | undefined;
        const a = await engine().StartBridgeSession(
            baseParams(original, provider, {
                Address: 'loopback://regate-concurrent-room',
                ReopenInMeetingMode: async () => {
                    reopens++;
                    await new Promise<void>((resolve) => {
                        releaseReopen = resolve;
                    });
                    return fresh;
                },
            }),
        );
        const loopback = a.Bridge as LoopbackBridge;
        // Baseline: while un-gated, the agent's audio does reach the room.
        original.EmitOutput(bytes(1));
        expect(loopback.Sent.length).toBe(1);

        // Two agents join the room at the same instant → both ask for the gate.
        const first = engine().EnsureSessionMeetingGated(a.SessionBridgeID, addressesGem);
        const second = engine().EnsureSessionMeetingGated(a.SessionBridgeID, addressesGem);

        // MID-RECONNECT: the socket still wired here is the one we've decided must stop answering the room —
        // and by definition it can't be told to. The outbound seam is what keeps it quiet meanwhile.
        original.EmitOutput(bytes(2));
        expect(loopback.Sent.length).toBe(1);

        releaseReopen?.();
        expect(await first).toBe(true);
        expect(await second).toBe(true);
        expect(reopens).toBe(1); // ONE socket minted, not two racing to be swapped in
        expect(a.RealtimeSession).toBe(fresh);

        // Un-muted once the gated session is in place.
        fresh.EmitOutput(bytes(3));
        expect(loopback.Sent.length).toBe(2);

        await engine().StopBridgeSession(a.SessionBridgeID, 'Explicit');
    });

    it('fails LOUDLY (never silently degrades) when the session cannot be re-opened', async () => {
        const { provider } = makeProvider(() => makeBridgeRow());

        // (a) No reopen hook at all → nothing can gate this seat; it must say so rather than pretend.
        const orphan = new MockRealtimeSession();
        orphan.CanReconfigure = false;
        const noHook = await engine().StartBridgeSession(
            baseParams(orphan, provider, { Address: 'loopback://regate-nohook-room' }),
        );
        expect(await engine().EnsureSessionMeetingGated(noHook.SessionBridgeID, always)).toBe(false);
        expect(engine().GetEffectiveTurnState(noHook.SessionBridgeID)).toEqual({ MeetingGated: false, CanReconfigureTurnMode: false });
        await engine().StopBridgeSession(noHook.SessionBridgeID, 'Explicit');

        // (b) The hook is there but the provider is down. Capped attempts, then an honest `false` — and the
        //     agent keeps its ORIGINAL socket: a degraded seat beats a dead one.
        const stubborn = new MockRealtimeSession();
        stubborn.CanReconfigure = false;
        let attempts = 0;
        const failing = await engine().StartBridgeSession(
            baseParams(stubborn, provider, {
                Address: 'loopback://regate-failing-room',
                ReopenInMeetingMode: async () => {
                    attempts++;
                    throw new Error('provider refused the connection');
                },
            }),
        );
        expect(await engine().EnsureSessionMeetingGated(failing.SessionBridgeID, always)).toBe(false);
        expect(attempts).toBe(2); // MEETING_REGATE_REOPEN_MAX_ATTEMPTS — bounded, not a retry storm
        expect(failing.RealtimeSession).toBe(stubborn);
        expect(stubborn.Closed).toBe(false);
        expect(engine().GetEffectiveTurnState(failing.SessionBridgeID)?.MeetingGated).toBe(false);

        // Retryable: a later join can try again (the in-flight guard was cleared, not latched).
        expect(await engine().EnsureSessionMeetingGated(failing.SessionBridgeID, always)).toBe(false);
        expect(attempts).toBe(4);

        await engine().StopBridgeSession(failing.SessionBridgeID, 'Explicit');
    });

    it('does not strand the fresh socket when the seat is torn down mid-reopen', async () => {
        const { provider } = makeProvider(() => makeBridgeRow());
        const original = new MockRealtimeSession();
        original.CanReconfigure = false;
        const fresh = new MockRealtimeSession();
        let releaseReopen: (() => void) | undefined;
        const a = await engine().StartBridgeSession(
            baseParams(original, provider, {
                Address: 'loopback://regate-torndown-room',
                ReopenInMeetingMode: async () => {
                    await new Promise<void>((resolve) => {
                        releaseReopen = resolve;
                    });
                    return fresh;
                },
            }),
        );

        const gating = engine().EnsureSessionMeetingGated(a.SessionBridgeID, always);
        // The room empties (or the janitor reaps it) while the replacement socket is still being minted.
        await engine().StopBridgeSession(a.SessionBridgeID, 'Explicit');
        releaseReopen?.();

        expect(await gating).toBe(false);
        // Teardown already ran, so nothing would ever close the newcomer — it is handed back, not wired in.
        expect(fresh.Closed).toBe(true);
        expect(fresh.Heard.length).toBe(0);
    });

    it('reports no turn state for a bridge this process does not hold', async () => {
        expect(engine().GetEffectiveTurnState('nope')).toBeNull();
        expect(await engine().EnsureSessionMeetingGated('nope', always)).toBe(false);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Human takeover — suspend / resume an agent WITHOUT ending its session.
// ──────────────────────────────────────────────────────────────────────────────

describe('AIBridgeEngine — SuspendBridgeAgent / ResumeBridgeAgent', () => {
    it('a suspended meeting agent stops speaking + publishing but keeps hearing on a live session', async () => {
        const session = new MockRealtimeSession();
        const { provider } = makeProvider(() => makeBridgeRow());
        const active = await engine().StartBridgeSession(
            baseParams(session, provider, {
                TurnMode: 'Passive',
                DisableAutoResponse: true,
                TurnMatcher: { IsAddressed: () => true },
            }),
        );
        const loopback = active.Bridge as LoopbackBridge;

        // Baseline: addressed → the bridge triggers the model, and the agent's audio reaches the room.
        session.EmitTranscript({ Role: 'user', Text: 'hello', IsFinal: true });
        expect(session.SpokenUpdates.length).toBe(1);
        session.EmitOutput(bytes(1));
        expect(loopback.Sent.length).toBe(1);
        session.EmitTranscript({ Role: 'assistant', Text: 'hi there', IsFinal: true }); // finishes → frees the floor

        // A human takes the seat.
        expect(engine().SuspendBridgeAgent(active.SessionBridgeID)).toBe(true);
        expect(engine().SuspendBridgeAgent(active.SessionBridgeID)).toBe(true); // idempotent

        // It no longer answers when addressed...
        session.EmitTranscript({ Role: 'user', Text: 'hello again', IsFinal: true });
        expect(session.SpokenUpdates.length).toBe(1);
        // ...and nothing it emits reaches the room (an in-flight response can't leak through).
        session.EmitOutput(bytes(2));
        expect(loopback.Sent.length).toBe(1);

        // But the session is fully alive: still connected, still in the registry, still HEARING the meeting
        // (so it resumes with the context it missed rather than a hole).
        expect(loopback.IsConnected).toBe(true);
        expect(engine().ActiveSessions.find((s) => s.SessionBridgeID === active.SessionBridgeID)).toBeDefined();
        const heardBefore = session.Heard.length;
        loopback.EmitInbound({ Track: 'audio-in', Bytes: bytes(5) });
        expect(session.Heard.length).toBe(heardBefore + 1);

        // Handing the seat back restores the voice.
        expect(engine().ResumeBridgeAgent(active.SessionBridgeID)).toBe(true);
        session.EmitTranscript({ Role: 'user', Text: 'you again', IsFinal: true });
        expect(session.SpokenUpdates.length).toBe(2);
        session.EmitOutput(bytes(3));
        expect(loopback.Sent.length).toBe(2);
        // It was ALREADY in meeting mode, so suspending never had to touch the socket config.
        expect(session.ReconfigureCalls.length).toBe(0);

        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('silences a 1:1 agent on the live socket, and resume restores exactly the prior state (not a default)', async () => {
        const session = new MockRealtimeSession();
        const { provider } = makeProvider(() => makeBridgeRow());
        const active = await engine().StartBridgeSession(
            baseParams(session, provider, { TurnMode: 'Passive', TurnMatcher: { IsAddressed: () => true } }),
        );
        const priorPolicy = active.TurnPolicy;
        expect(active.DisableAutoResponse).toBe(false);

        expect(engine().SuspendBridgeAgent(active.SessionBridgeID)).toBe(true);
        // The only way to silence an auto-responding model is to turn auto-response off on the live socket.
        expect(session.ReconfigureCalls).toEqual([{ DisableAutoResponse: true }]);
        expect(active.DisableAutoResponse).toBe(true);
        expect(active.TurnPolicy).not.toBe(priorPolicy); // swapped onto the never-addressed matcher
        expect(active.SuspendedState?.PriorDisableAutoResponse).toBe(false);

        expect(engine().ResumeBridgeAgent(active.SessionBridgeID)).toBe(true);
        // Restored to what it WAS (1:1 auto-response + its own policy), NOT to the meeting-mode state the
        // suspension gated it into — a resumed agent must behave exactly as it did before the takeover.
        expect(session.ReconfigureCalls).toEqual([{ DisableAutoResponse: true }, { DisableAutoResponse: false }]);
        expect(active.DisableAutoResponse).toBe(false);
        expect(active.TurnPolicy).toBe(priorPolicy);
        expect(active.SuspendedState).toBeUndefined();
        // Idempotent — resuming an active agent changes nothing.
        expect(engine().ResumeBridgeAgent(active.SessionBridgeID)).toBe(true);
        expect(session.ReconfigureCalls.length).toBe(2);

        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('refuses to suspend a 1:1 agent whose provider cannot gate the model mid-session — and mutates NOTHING', async () => {
        const session = new MockRealtimeSession();
        session.CanReconfigure = false; // Gemini-like: config fixed at connect
        const { provider } = makeProvider(() => makeBridgeRow());
        const active = await engine().StartBridgeSession(
            baseParams(session, provider, { TurnMode: 'Passive', TurnMatcher: { IsAddressed: () => true } }),
        );
        const priorPolicy = active.TurnPolicy;

        // Refused: a half-suspended agent would keep auto-answering OVER the human taking its seat.
        expect(engine().SuspendBridgeAgent(active.SessionBridgeID)).toBe(false);
        expect(session.ReconfigureCalls.length).toBe(0);
        expect(active.TurnPolicy).toBe(priorPolicy);
        expect(active.DisableAutoResponse).toBe(false);
        expect(active.SuspendedState).toBeUndefined();
        // Still fully operational — its audio still reaches the room.
        session.EmitOutput(bytes(1));
        expect((active.Bridge as LoopbackBridge).Sent.length).toBe(1);

        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('suspends an INCAPABLE agent that is already in meeting mode (no socket change is needed)', async () => {
        const session = new MockRealtimeSession();
        session.CanReconfigure = false;
        const { provider } = makeProvider(() => makeBridgeRow());
        const active = await engine().StartBridgeSession(
            baseParams(session, provider, {
                TurnMode: 'Passive',
                DisableAutoResponse: true,
                TurnMatcher: { IsAddressed: () => true },
            }),
        );

        expect(engine().SuspendBridgeAgent(active.SessionBridgeID)).toBe(true);
        expect(session.ReconfigureCalls.length).toBe(0);
        session.EmitTranscript({ Role: 'user', Text: 'anyone there?', IsFinal: true });
        expect(session.SpokenUpdates.length).toBe(0);
        // Resume likewise needs no socket change (the prior state was already auto-response-off).
        expect(engine().ResumeBridgeAgent(active.SessionBridgeID)).toBe(true);
        expect(session.ReconfigureCalls.length).toBe(0);
        session.EmitTranscript({ Role: 'user', Text: 'back with us?', IsFinal: true });
        expect(session.SpokenUpdates.length).toBe(1);

        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('suspending frees the room floor and takes the seat out of the room broadcast', async () => {
        const addr = 'loopback://takeover-room';
        const sessionA = new MockRealtimeSession();
        const sessionB = new MockRealtimeSession();
        const { provider } = makeProvider(() => makeBridgeRow());
        const meeting = { TurnMode: 'Passive' as const, DisableAutoResponse: true, TurnMatcher: { IsAddressed: () => true } };
        const a = await engine().StartBridgeSession(baseParams(sessionA, provider, { ...meeting, Address: addr, AgentSessionID: 'take-A' }));
        const b = await engine().StartBridgeSession(baseParams(sessionB, provider, { ...meeting, Address: addr, AgentSessionID: 'take-B' }));
        const coord = engine().RoomCoordinator;
        const roomKey = a.RoomKey!;

        // A answers first and holds the floor; B is blocked behind it.
        sessionA.EmitTranscript({ Role: 'user', Text: 'hello room', IsFinal: true });
        expect(sessionA.SpokenUpdates.length).toBe(1);
        expect(sessionB.SpokenUpdates.length).toBe(0);
        expect(coord.IsFloorHolder(roomKey, 'take-A')).toBe(true);

        // A human takes A's seat mid-turn: the floor is handed back immediately...
        expect(engine().SuspendBridgeAgent(a.SessionBridgeID)).toBe(true);
        expect(coord.IsFloorHolder(roomKey, 'take-A')).toBe(false);
        expect(a.SuspendedState?.HeldFloor).toBe(true);

        // ...and the next turn routes past the suspended seat to B.
        sessionA.EmitTranscript({ Role: 'user', Text: 'anyone else', IsFinal: true });
        expect(sessionA.SpokenUpdates.length).toBe(1);
        expect(sessionB.SpokenUpdates.length).toBe(1);

        // A is still a room member throughout (present, just silent) — never unregistered, never reaped.
        expect(coord.GetRoomState(roomKey)!.AgentSessionIds).toEqual(expect.arrayContaining(['take-A', 'take-B']));

        await engine().StopBridgeSession(a.SessionBridgeID, 'Explicit');
        await engine().StopBridgeSession(b.SessionBridgeID, 'Explicit');
    });

    it('returns false for an unknown bridge (both directions)', () => {
        expect(engine().SuspendBridgeAgent('nope')).toBe(false);
        expect(engine().ResumeBridgeAgent('nope')).toBe(false);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Stale-session sweep (same-process janitor).
// ──────────────────────────────────────────────────────────────────────────────

describe('AIBridgeEngine — SweepStaleSessions', () => {
    it('reaps idle / over-duration sessions but leaves fresh ones running', async () => {
        const session = new MockRealtimeSession();
        const bridgeRow = makeBridgeRow({ Status: 'Connected', AgentSessionID: 'sweep-1' });
        const { provider } = makeProvider(() => bridgeRow);
        const active = await engine().StartBridgeSession(baseParams(session, provider));

        // Fresh session → not reaped.
        expect(await engine().SweepStaleSessions(active.ConnectedAtMs + 1000)).toBe(0);
        expect(bridgeRow.Status).toBe('Connected');

        // Idle past the TTL (last activity long ago) → reaped via the normal stop → row Disconnected.
        const future = active.LastActivityMs + 11 * 60 * 1000;
        expect(await engine().SweepStaleSessions(future)).toBe(1);
        expect(bridgeRow.Status).toBe('Disconnected');
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Participant tracking.
// ──────────────────────────────────────────────────────────────────────────────

describe('AIBridgeEngine — participant tracking', () => {
    it('upserts participant rows from the driver roster when diarization is supported', async () => {
        const session = new MockRealtimeSession();
        const bridgeRow = makeBridgeRow();
        const participantRows: FakeEntity[] = [];
        const { provider } = makeProvider((name) => {
            if (name === 'MJ: AI Agent Session Bridge Participants') {
                const p = makeParticipantRow();
                participantRows.push(p);
                return p;
            }
            return bridgeRow;
        });

        const active = await engine().StartBridgeSession(baseParams(session, provider));
        const loopback = active.Bridge as LoopbackBridge;

        // Connect already emitted the synthetic agent participant; allow its async upsert to settle.
        await new Promise((r) => setTimeout(r, 0));

        // Drive a roster change with a human participant.
        loopback.EmitParticipants([
            { ExternalId: 'p-1', DisplayName: 'Alice', Role: 'Host', IsAgent: false },
        ]);
        await new Promise((r) => setTimeout(r, 0));

        // At least one participant row was created + saved.
        expect(participantRows.length).toBeGreaterThanOrEqual(1);
        const alice = participantRows.find((p) => p.ExternalParticipantID === 'p-1');
        expect(alice).toBeDefined();
        expect(alice?.DisplayName).toBe('Alice');
        expect(alice?.Role).toBe('Host');
        expect(alice?.Save).toHaveBeenCalled();

        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('persists IsAgent ONLY for this bridge’s own bot — other agents in the room are remote participants (one-bot-per-bridge invariant)', async () => {
        const session = new MockRealtimeSession();
        const bridgeRow = makeBridgeRow();
        const participantRows: FakeEntity[] = [];
        const { provider } = makeProvider((name) => {
            if (name === 'MJ: AI Agent Session Bridge Participants') {
                const p = makeParticipantRow();
                participantRows.push(p);
                return p;
            }
            return bridgeRow;
        });

        const active = await engine().StartBridgeSession(baseParams(session, provider));
        const loopback = active.Bridge as LoopbackBridge;
        await new Promise((r) => setTimeout(r, 0));

        // A multi-agent room as THIS bridge sees it: its OWN bot, ANOTHER agent, and a human — both agents
        // arrive IsAgent=true in the live roster, but only the bot may persist IsAgent=true.
        loopback.EmitParticipants([
            { ExternalId: active.BotParticipantID as string, DisplayName: 'Me', Role: 'Agent', IsAgent: true },
            { ExternalId: 'agent-other', DisplayName: 'Other Bot', Role: 'Participant', IsAgent: true },
            { ExternalId: 'human-1', DisplayName: 'Alice', Role: 'Host', IsAgent: false },
        ]);
        await new Promise((r) => setTimeout(r, 0));

        const bot = participantRows.find((p) => p.ExternalParticipantID === active.BotParticipantID);
        const other = participantRows.find((p) => p.ExternalParticipantID === 'agent-other');
        const human = participantRows.find((p) => p.ExternalParticipantID === 'human-1');
        expect(bot?.IsAgent).toBe(true); // its own bot
        expect(other?.IsAgent).toBe(false); // another agent → not THIS bridge's bot
        expect(human?.IsAgent).toBe(false);

        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('skips participant tracking when the provider does not support diarization', async () => {
        const session = new MockRealtimeSession();
        const bridgeRow = makeBridgeRow();
        let participantRequested = false;
        const { provider } = makeProvider((name) => {
            if (name === 'MJ: AI Agent Session Bridge Participants') {
                participantRequested = true;
            }
            return bridgeRow;
        });

        const active = await engine().StartBridgeSession(
            baseParams(session, provider, {
                Provider: makeProviderEntity({ AudioIn: true, AudioOut: true }), // no SpeakerDiarization
            }),
        );
        await new Promise((r) => setTimeout(r, 0));

        expect(participantRequested).toBe(false);
        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('arms an auto-leave grace timer when the last human leaves, and cancels it on re-join', async () => {
        const session = new MockRealtimeSession();
        const { provider } = makeProvider(() => makeBridgeRow());
        const active = await engine().StartBridgeSession(baseParams(session, provider));
        const loopback = active.Bridge as LoopbackBridge;
        await new Promise((r) => setTimeout(r, 0));

        // Human present → seen, no countdown.
        loopback.EmitParticipants([{ ExternalId: 'h1', DisplayName: 'Alice', Role: 'Host', IsAgent: false }]);
        await new Promise((r) => setTimeout(r, 0));
        expect(active.HasSeenHuman).toBe(true);
        expect(active.LeaveGraceTimer).toBeUndefined();

        // Only agents remain → grace timer armed (not fired yet).
        loopback.EmitParticipants([{ ExternalId: 'agent-x', DisplayName: 'Bot', Role: 'Participant', IsAgent: true }]);
        await new Promise((r) => setTimeout(r, 0));
        expect(active.LeaveGraceTimer).toBeDefined();

        // Human re-joins within the window (e.g. a refresh) → countdown cancelled.
        loopback.EmitParticipants([{ ExternalId: 'h1', DisplayName: 'Alice', Role: 'Host', IsAgent: false }]);
        await new Promise((r) => setTimeout(r, 0));
        expect(active.LeaveGraceTimer).toBeUndefined();

        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('never arms auto-leave when a human was never present (bot joined ahead of anyone)', async () => {
        const session = new MockRealtimeSession();
        const { provider } = makeProvider(() => makeBridgeRow());
        const active = await engine().StartBridgeSession(baseParams(session, provider));
        const loopback = active.Bridge as LoopbackBridge;
        await new Promise((r) => setTimeout(r, 0));

        loopback.EmitParticipants([{ ExternalId: 'agent-x', DisplayName: 'Bot', Role: 'Participant', IsAgent: true }]);
        await new Promise((r) => setTimeout(r, 0));
        expect(active.HasSeenHuman).toBe(false);
        expect(active.LeaveGraceTimer).toBeUndefined();

        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Unified room transcript — scribe election + emit.
// ──────────────────────────────────────────────────────────────────────────────

describe('AIBridgeEngine — unified room transcript', () => {
    it('elects ONE scribe per room; only the scribe emits final lines (both roles), with handoff on departure', async () => {
        const sink = vi.fn(async () => undefined);
        engine().SetTranscriptSink(sink);
        const addr = 'loopback://transcript-room-unique';
        const sessionA = new MockRealtimeSession();
        const sessionB = new MockRealtimeSession();
        const { provider } = makeProvider(() => makeBridgeRow());
        try {
            const a = await engine().StartBridgeSession(
                baseParams(sessionA, provider, { Address: addr, AgentSessionID: 'sess-A', AgentID: 'agent-A' }),
            );
            const b = await engine().StartBridgeSession(
                baseParams(sessionB, provider, { Address: addr, AgentSessionID: 'sess-B', AgentID: 'agent-B' }),
            );
            // First session in the room is the scribe; the second is not.
            expect(a.IsTranscriptScribe).toBe(true);
            expect(b.IsTranscriptScribe).toBe(false);

            // Scribe emits FINAL lines — its own speech attributed (IsAgentSpeech), heard speech as 'other'.
            sessionA.EmitTranscript({ Role: 'assistant', Text: 'Hello from A', IsFinal: true });
            sessionA.EmitTranscript({ Role: 'user', Text: 'a human spoke', IsFinal: true });
            sessionA.EmitTranscript({ Role: 'user', Text: 'partial', IsFinal: false }); // not final → ignored
            await new Promise((r) => setTimeout(r, 0));
            expect(sink).toHaveBeenCalledTimes(2);
            expect(sink.mock.calls[0][0]).toMatchObject({ IsAgentSpeech: true, AgentSessionID: 'sess-A', AgentID: 'agent-A', Text: 'Hello from A' });
            expect(sink.mock.calls[1][0]).toMatchObject({ IsAgentSpeech: false, Text: 'a human spoke' });

            // Non-scribe emits nothing.
            sink.mockClear();
            sessionB.EmitTranscript({ Role: 'assistant', Text: 'B speaks', IsFinal: true });
            await new Promise((r) => setTimeout(r, 0));
            expect(sink).not.toHaveBeenCalled();

            // Scribe A leaves → B is handed the scribe role and now emits.
            await engine().StopBridgeSession(a.SessionBridgeID, 'Explicit');
            expect(b.IsTranscriptScribe).toBe(true);
            sessionB.EmitTranscript({ Role: 'assistant', Text: 'B now scribe', IsFinal: true });
            await new Promise((r) => setTimeout(r, 0));
            expect(sink).toHaveBeenCalledTimes(1);

            await engine().StopBridgeSession(b.SessionBridgeID, 'Explicit');
        } finally {
            engine().SetTranscriptSink(async () => undefined); // reset shared singleton state
        }
    });

    it('diarizes a User line by attributing it to the last inbound audio speaker', async () => {
        const sink = vi.fn(async () => undefined);
        engine().SetTranscriptSink(sink);
        const session = new MockRealtimeSession();
        const { provider } = makeProvider(() => makeBridgeRow());
        try {
            const active = await engine().StartBridgeSession(
                baseParams(session, provider, { Address: 'loopback://diar-room-unique', AgentSessionID: 'sess-S', AgentID: 'agent-S' }),
            );
            const loop = active.Bridge as LoopbackBridge;
            // An inbound audio frame tagged with the speaking participant → remembered as the last speaker.
            loop.EmitInbound({ Track: 'audio-in', Bytes: new Uint8Array([1, 2]).buffer, SpeakerLabel: 'human-42' });
            session.EmitTranscript({ Role: 'user', Text: 'hi there', IsFinal: true });
            await new Promise((r) => setTimeout(r, 0));
            expect(sink.mock.calls[0][0]).toMatchObject({ IsAgentSpeech: false, Text: 'hi there', SpeakerParticipantID: 'human-42' });

            await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
        } finally {
            engine().SetTranscriptSink(async () => undefined);
        }
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Janitor — orphan reconciliation.
// ──────────────────────────────────────────────────────────────────────────────

describe('AIBridgeEngine — ReconcileOrphans (janitor)', () => {
    it('closes Connected bridges from a prior boot of this host with CloseReason Janitor', async () => {
        const orphanRows = [
            makeBridgeRow({ ID: 'orphan-1', Status: 'Connected' }),
            makeBridgeRow({ ID: 'orphan-2', Status: 'Connecting' }),
        ];
        // The janitor's RunView returns the orphan rows; subsequent loads (markBridgeDisconnected)
        // GetEntityObject returns rows that Load successfully.
        runViewMock.mockResolvedValueOnce({ Success: true, Results: orphanRows });
        const { provider } = makeProvider((_name) => {
            // markBridgeDisconnected loads a fresh row each time; return a Connected loadable row.
            return makeBridgeRow({ Status: 'Connected' });
        });

        const closed = await engine().ReconcileOrphans(makeUser(), provider);

        expect(closed).toBe(2);
        // Verify the filter scoping (own host prefix, different instance id).
        const filterArg = (runViewMock.mock.calls[0][0] as { ExtraFilter: string }).ExtraFilter;
        expect(filterArg).toContain("HostInstanceID LIKE 'testhost:%'");
        expect(filterArg).toContain("HostInstanceID <> 'testhost:123:bootA'");
        expect(filterArg).toContain("Status IN ('Connecting','Connected')");
    });

    it('returns 0 when there are no orphans', async () => {
        runViewMock.mockResolvedValueOnce({ Success: true, Results: [] });
        const { provider } = makeProvider(() => makeBridgeRow());
        const closed = await engine().ReconcileOrphans(makeUser(), provider);
        expect(closed).toBe(0);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Composition over inheritance — the ONE base cache, delegated (not duplicated).
// ──────────────────────────────────────────────────────────────────────────────

describe('AIBridgeEngine — composes AIBridgeEngineBase (single cache, delegation)', () => {
    it('does NOT extend AIBridgeEngineBase (composition, not inheritance)', () => {
        // If the engine inherited the base, the startup manager would instantiate two BaseEngine
        // singletons. The fix is composition: the engine is NOT an instance of the base.
        expect(engine() instanceof AIBridgeEngineBase).toBe(false);
    });

    it('reads metadata through the SINGLE AIBridgeEngineBase.Instance (the one cache)', () => {
        const base = AIBridgeEngineBase.Instance;
        const providers = [{ ID: 'p1', Name: 'Zoom', DriverClass: 'ZoomBridge' } as unknown as MJAIBridgeProviderEntity];

        // Spy on the base getters/methods so we can prove the engine delegates to THIS instance.
        const providersSpy = vi.spyOn(base, 'Providers', 'get').mockReturnValue(providers);
        const byNameSpy = vi.spyOn(base, 'ProviderByName').mockReturnValue(providers[0]);
        const byDriverSpy = vi.spyOn(base, 'ProviderByDriverClass').mockReturnValue(providers[0]);

        const e = engine();
        expect(e.Providers).toBe(providers);
        expect(e.ProviderByName('Zoom')).toBe(providers[0]);
        expect(e.ProviderByDriverClass('ZoomBridge')).toBe(providers[0]);

        expect(providersSpy).toHaveBeenCalled();
        expect(byNameSpy).toHaveBeenCalledWith('Zoom');
        expect(byDriverSpy).toHaveBeenCalledWith('ZoomBridge');

        providersSpy.mockRestore();
        byNameSpy.mockRestore();
        byDriverSpy.mockRestore();
    });

    it('HandleStartup / Config warm the base cache exactly once (no double load)', async () => {
        const base = AIBridgeEngineBase.Instance;
        const configSpy = vi.spyOn(base, 'Config').mockResolvedValue(undefined);

        await engine().HandleStartup(makeUser());
        await engine().Config(true, makeUser());

        // Both entry points route to the ONE base cache's Config — no second engine, no second cache.
        expect(configSpy).toHaveBeenCalledTimes(2);
        expect(configSpy).toHaveBeenNthCalledWith(1, false, expect.anything(), undefined);
        expect(configSpy).toHaveBeenNthCalledWith(2, true, expect.anything(), undefined);

        configSpy.mockRestore();
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// End-to-end smoke — composes the full multi-agent meeting flow in one sequence.
// Guards against integration regressions the per-feature tests can't catch: that
// scribe election + diarized transcript + capability-gated re-gate + floor control
// + scribe handoff + run finalization all compose, in order, through one room.
// ──────────────────────────────────────────────────────────────────────────────

describe('AIBridgeEngine — end-to-end smoke (multi-agent meeting)', () => {
    it('start → diarized transcript → 2nd agent → re-gate → floor contention → handoff → finalize', async () => {
        const transcript: Array<Record<string, unknown>> = [];
        const finalized: Array<string | undefined> = [];
        engine().SetTranscriptSink(async (line: Record<string, unknown>) => { transcript.push(line); });
        engine().SetSessionRunFinalizer(async (sessionId?: string) => { finalized.push(sessionId); });
        // Per-agent name matchers (real meeting mode): each agent answers only when ITS name is addressed.
        const matchA = { IsAddressed: (seg: { Text: string }) => /\bA\b/.test(seg.Text) };
        const matchB = { IsAddressed: (seg: { Text: string }) => /\bB\b/.test(seg.Text) };
        const addr = 'loopback://smoke-room-unique';
        const sessionA = new MockRealtimeSession();
        const sessionB = new MockRealtimeSession();
        // Rows carry an AgentSessionID so the teardown finalizer (which loads a fresh row) has one to scope to.
        const { provider } = makeProvider(() => makeBridgeRow({ AgentSessionID: 'smoke-sess' }));
        try {
            // 1) Agent A joins solo → it is the room scribe and starts as a normal 1:1 voice.
            const a = await engine().StartBridgeSession(
                baseParams(sessionA, provider, { Address: addr, AgentSessionID: 'A', AgentID: 'agA', TurnMatcher: matchA }),
            );
            expect(a.IsTranscriptScribe).toBe(true);
            expect(a.DisableAutoResponse).toBe(false);

            // 2) A human speaks (diarized media) then the model transcribes it; A answers (1:1 auto-response).
            (a.Bridge as LoopbackBridge).EmitInbound({ Track: 'audio-in', Bytes: new Uint8Array([1]).buffer, SpeakerLabel: 'human-1' });
            sessionA.EmitTranscript({ Role: 'user', Text: 'hello there', IsFinal: true });
            sessionA.EmitTranscript({ Role: 'assistant', Text: 'hi, A here', IsFinal: true });
            await new Promise((r) => setTimeout(r, 0));
            // The scribe wrote BOTH a diarized human line and its own agent line.
            expect(transcript).toContainEqual(expect.objectContaining({ Text: 'hello there', IsAgentSpeech: false, SpeakerParticipantID: 'human-1' }));
            expect(transcript).toContainEqual(expect.objectContaining({ Text: 'hi, A here', IsAgentSpeech: true, AgentSessionID: 'A' }));
            expect(sessionA.SpokenUpdates.length).toBe(0); // 1:1 → relied on auto-response, bridge didn't force

            // 3) Agent B joins the SAME room in meeting mode → A is retroactively re-gated (it's capable).
            //    B is "Gemini-like": it will NEVER transcribe in this test — only A produces transcripts.
            const b = await engine().StartBridgeSession(
                baseParams(sessionB, provider, { Address: addr, AgentSessionID: 'B', AgentID: 'agB', DisableAutoResponse: true, TurnMatcher: matchB }),
            );
            expect(engine().ReconfigureSessionToMeeting(a.SessionBridgeID, matchA)).toBe(true);
            expect(a.DisableAutoResponse).toBe(true);
            expect(sessionA.ReconfigureCalls).toEqual([{ DisableAutoResponse: true }]);

            // 4) BROADCAST: A transcribes the human addressing A → only A speaks (B's name not present).
            sessionA.EmitTranscript({ Role: 'user', Text: 'A please', IsFinal: true });
            expect(sessionA.SpokenUpdates.length).toBe(1);
            expect(sessionB.SpokenUpdates.length).toBe(0);

            // 5) THE FIX: A transcribes the human addressing B. B never transcribed anything itself, yet the
            //    broadcast routes A's transcript to B's matcher → B is triggered. Denied here only by the floor
            //    (A still holds it), proving B WAS evaluated off a peer's transcript.
            sessionA.EmitTranscript({ Role: 'user', Text: 'B please', IsFinal: true });
            expect(sessionB.SpokenUpdates.length).toBe(0); // triggered, but floor held by A

            // 6) A finishes → floor frees → A transcribes the human addressing B again → B finally speaks,
            //    entirely off A's transcription (the Gemini-can't-transcribe case the broadcast fixes).
            sessionA.EmitTranscript({ Role: 'assistant', Text: 'A done', IsFinal: true });
            sessionA.EmitTranscript({ Role: 'user', Text: 'B once more', IsFinal: true });
            expect(sessionB.SpokenUpdates.length).toBe(1);

            // 5) Teardown: scribe role hands off to B when A leaves; both sessions finalize their run.
            await engine().StopBridgeSession(a.SessionBridgeID, 'Explicit');
            expect(b.IsTranscriptScribe).toBe(true);
            await engine().StopBridgeSession(b.SessionBridgeID, 'Explicit');
            expect(finalized.length).toBe(2);
        } finally {
            engine().SetTranscriptSink(async () => undefined);
            engine().SetSessionRunFinalizer(async () => undefined);
        }
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Turn moderator — the injected LLM-router path (replaces per-agent matchers in a multi-agent room).
// ──────────────────────────────────────────────────────────────────────────────

describe('AIBridgeEngine — turn moderator (LLM router)', () => {
    const tick = () => new Promise((r) => setTimeout(r, 0));

    it('routes a user turn to the moderator-selected agents, spoken serially via the floor', async () => {
        const seen: TurnModeratorContext[] = [];
        // Route to BOTH agents in roster order on the first (user) decision, then nobody (end the discussion).
        let calls = 0;
        engine().SetTurnModerator(async (ctx) => {
            seen.push(ctx);
            return calls++ === 0 ? ctx.Roster.map((r) => r.AgentSessionID) : [];
        });
        const addr = 'loopback://moderator-room';
        const sA = new MockRealtimeSession();
        const sB = new MockRealtimeSession();
        const noMatch = { IsAddressed: () => false }; // matchers unused on the moderator path
        const { provider } = makeProvider(() => makeBridgeRow());
        try {
            const a = await engine().StartBridgeSession(baseParams(sA, provider, { Address: addr, AgentSessionID: 'sa', AgentID: 'agA', AgentNames: ['Sage'], AgentRole: 'analyst', ParticipationMode: 'proactive', DisableAutoResponse: true, TurnMatcher: noMatch }));
            const b = await engine().StartBridgeSession(baseParams(sB, provider, { Address: addr, AgentSessionID: 'sb', AgentID: 'agB', AgentNames: ['Skip'], ParticipationMode: 'proactive', DisableAutoResponse: true, TurnMatcher: noMatch }));

            // Human turn transcribed on A's bridge → ONE moderator decision routes it to both agents.
            sA.EmitTranscript({ Role: 'user', Text: 'team, status?', IsFinal: true });
            await tick(); await tick();

            expect(seen.length).toBeGreaterThanOrEqual(1);
            expect(seen[0].Roster.map((r) => r.Names[0]).sort()).toEqual(['Sage', 'Skip']); // saw the full roster
            expect(seen[0].LatestTurn).toMatchObject({ Text: 'team, status?', IsAgent: false });
            // A spoke first (took the floor); B is queued behind it (serialized — not overlapping).
            expect(sA.SpokenUpdates.length).toBe(1);
            expect(sB.SpokenUpdates.length).toBe(0);

            // A finishes → floor frees → the queued B speaks.
            sA.EmitTranscript({ Role: 'assistant', Text: 'Sage here, all good', IsFinal: true });
            await tick(); await tick();
            expect(sB.SpokenUpdates.length).toBe(1);

            await engine().StopBridgeSession(a.SessionBridgeID, 'Explicit');
            await engine().StopBridgeSession(b.SessionBridgeID, 'Explicit');
        } finally {
            engine().SetTurnModerator(undefined);
        }
    });

    it('falls back to per-agent matchers when no moderator is set', async () => {
        engine().SetTurnModerator(undefined);
        const addr = 'loopback://no-moderator-room';
        const sA = new MockRealtimeSession();
        const sB = new MockRealtimeSession();
        const { provider } = makeProvider(() => makeBridgeRow());
        try {
            const a = await engine().StartBridgeSession(baseParams(sA, provider, { Address: addr, AgentSessionID: 'ma', AgentNames: ['Sage'], DisableAutoResponse: true, TurnMatcher: { IsAddressed: (s) => /Sage/.test(s.Text) } }));
            const b = await engine().StartBridgeSession(baseParams(sB, provider, { Address: addr, AgentSessionID: 'mb', AgentNames: ['Skip'], DisableAutoResponse: true, TurnMatcher: { IsAddressed: (s) => /Skip/.test(s.Text) } }));
            sA.EmitTranscript({ Role: 'user', Text: 'Sage, hi', IsFinal: true });
            await tick(); await tick();
            expect(sA.SpokenUpdates.length).toBe(1); // matched its name
            expect(sB.SpokenUpdates.length).toBe(0); // not addressed
            await engine().StopBridgeSession(a.SessionBridgeID, 'Explicit');
            await engine().StopBridgeSession(b.SessionBridgeID, 'Explicit');
        } finally {
            engine().SetTurnModerator(undefined);
        }
    });
});
