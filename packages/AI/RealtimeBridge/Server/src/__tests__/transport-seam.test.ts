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
    public async Close(): Promise<void> {
        /* no-op */
    }
    public RequestSpokenUpdate(instructions: string): void {
        this.SpokenUpdates.push(instructions);
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
});

// ──────────────────────────────────────────────────────────────────────────────
// Turn-taking integration.
// ──────────────────────────────────────────────────────────────────────────────

describe('AIBridgeEngine — turn-taking integration (Passive)', () => {
    it('Passive: requests a spoken update only when the agent is addressed', async () => {
        const session = new MockRealtimeSession();
        const { provider } = makeProvider(() => makeBridgeRow());
        const active = await engine().StartBridgeSession(
            baseParams(session, provider, {
                TurnMode: 'Passive',
                TurnMatcher: { IsAddressed: (seg) => /\bSage\b/i.test(seg.Text) },
            }),
        );

        // Not addressed → silent (no spoken update).
        session.EmitTranscript({ Role: 'user', Text: 'How is the weather today', IsFinal: true });
        expect(session.SpokenUpdates.length).toBe(0);

        // Addressed → speak.
        session.EmitTranscript({ Role: 'user', Text: 'Hey Sage, what do you think?', IsFinal: true });
        expect(session.SpokenUpdates.length).toBe(1);

        // Assistant transcripts never drive turn-taking (would self-trigger).
        session.EmitTranscript({ Role: 'assistant', Text: 'Sage here, responding', IsFinal: true });
        expect(session.SpokenUpdates.length).toBe(1);

        // Non-final user transcript ignored.
        session.EmitTranscript({ Role: 'user', Text: 'Sage', IsFinal: false });
        expect(session.SpokenUpdates.length).toBe(1);

        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
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
