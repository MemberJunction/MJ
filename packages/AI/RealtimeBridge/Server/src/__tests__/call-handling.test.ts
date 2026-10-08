/**
 * Engine behaviour for server-held calls: per-session transcripts, barge-in, model-drop recovery, keypad
 * routing, the end-of-session hook, the agent-session heartbeat and orphan reconciliation. Uses the loopback
 * bridge (and a tiny telephony driver) with a mock realtime session — no network, no DB.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const runViewMock = vi.fn();
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, RunView: { FromMetadataProvider: () => ({ RunView: runViewMock }) } };
});

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import type { IRealtimeSession, RealtimeInputFrame, RealtimeSessionCapabilities, RealtimeSessionError, RealtimeTranscript } from '@memberjunction/ai';
import type { MJAIBridgeProviderEntity, MJAIBridgeProviderEntity_IBridgeProviderFeatures } from '@memberjunction/core-entities';
import { BaseRealtimeBridge, BaseTelephonyBridge, ITelephonyCallSdk } from '@memberjunction/ai-bridge-base';
import { AIBridgeEngine, IHostInstanceIdentity, StartBridgeSessionParams } from '../ai-bridge-engine';
import { LoopbackBridge, LOOPBACK_BRIDGE_DRIVER_CLASS } from '../loopback-bridge';

// ── doubles ───────────────────────────────────────────────────────────────────

class MockSession implements IRealtimeSession {
    public InputSampleRate?: number;
    public OutputSampleRate?: number;
    public readonly Heard: ArrayBuffer[] = [];
    public readonly Notes: string[] = [];
    public CloseCount = 0;
    private output?: (c: ArrayBuffer) => void;
    private transcript?: (t: RealtimeTranscript) => void;
    private interruption?: () => void;
    private error?: (e: RealtimeSessionError) => void;
    private close?: () => void;
    /** @param inbound The inbound tracks the session declares; none (no capabilities) unless a test needs video. */
    constructor(private readonly inbound?: RealtimeSessionCapabilities['SupportedInboundTracks']) {}
    get Capabilities(): RealtimeSessionCapabilities | undefined {
        return this.inbound ? { CanReconfigureTurnMode: false, SupportedInboundTracks: this.inbound } : undefined;
    }
    SendInput(frame: RealtimeInputFrame): void {
        this.Heard.push(frame.Data);
    }
    async RegisterTools(): Promise<void> {}
    OnOutput(h: (c: ArrayBuffer) => void): void {
        this.output = h;
    }
    OnTranscript(h: (t: RealtimeTranscript) => void): void {
        this.transcript = h;
    }
    OnToolCall(): void {}
    async SendToolResult(): Promise<void> {}
    OnInterruption(h: () => void): void {
        this.interruption = h;
    }
    OnError(h: (e: RealtimeSessionError) => void): void {
        this.error = h;
    }
    OnClose(h: () => void): void {
        this.close = h;
    }
    OnUsage(): void {}
    SendContextNote(text: string): void {
        this.Notes.push(text);
    }
    async Close(): Promise<void> {
        this.CloseCount++;
    }
    EmitOutput(c: ArrayBuffer): void {
        this.output?.(c);
    }
    EmitTranscript(role: 'user' | 'assistant', text: string): void {
        this.transcript?.({ Role: role, Text: text, IsFinal: true } as RealtimeTranscript);
    }
    EmitInterruption(): void {
        this.interruption?.();
    }
    EmitError(e: Partial<RealtimeSessionError>): void {
        this.error?.({ Message: 'boom', Fatal: false, ...e } as RealtimeSessionError);
    }
    EmitClose(): void {
        this.close?.();
    }
}

interface Row {
    [key: string]: unknown;
    NewRecord: () => void;
    Save: () => Promise<boolean>;
    Load: (id: string) => Promise<boolean>;
}

let rowSeq = 0;
function makeRow(extra: Partial<Row> = {}): Row {
    return { ID: `row-${++rowSeq}`, Status: 'Pending', NewRecord: vi.fn(), Save: vi.fn(async () => true), Load: vi.fn(async () => true), ...extra };
}

function makeProvider(rows: { bridge: Row; session?: Row }): IMetadataProvider {
    return {
        GetEntityObject: vi.fn(async (name: string) => (name === 'MJ: AI Agent Sessions' ? rows.session ?? makeRow() : rows.bridge)),
    } as unknown as IMetadataProvider;
}

const user = { ID: 'user-1', Email: 't@example.com' } as unknown as UserInfo;
const HOST: IHostInstanceIdentity = { GetHostInstanceID: () => 'h:1:boot', GetHostNamePrefix: () => 'h:' };

function providerEntity(features: MJAIBridgeProviderEntity_IBridgeProviderFeatures, driver = LOOPBACK_BRIDGE_DRIVER_CLASS): MJAIBridgeProviderEntity {
    return { ID: 'p1', Name: 'Test', DriverClass: driver, SupportedFeaturesObject: features } as unknown as MJAIBridgeProviderEntity;
}

const AUDIO = { AudioIn: true, AudioOut: true, SpeakerDiarization: true };

function engine(): AIBridgeEngine {
    const e = AIBridgeEngine.Instance;
    e.SetHostInstanceIdentity(HOST);
    return e;
}

function params(session: MockSession, provider: IMetadataProvider, extra: Partial<StartBridgeSessionParams> = {}): StartBridgeSessionParams {
    return { AgentSessionID: 'sess-1', Provider: providerEntity(AUDIO), RealtimeSession: session, Address: 'loopback://room', ContextUser: user, MetadataProvider: provider, ...extra };
}

const bytes = (...v: number[]): ArrayBuffer => new Uint8Array(v).buffer;

beforeEach(() => {
    runViewMock.mockReset();
    runViewMock.mockResolvedValue({ Success: true, Results: [] });
});
afterEach(() => {
    vi.useRealTimers();
});

// ── per-session transcript sink ────────────────────────────────────────────────

describe('per-session transcript sink', () => {
    it("writes both roles through the session's own sink and never through the room sink", async () => {
        const roomSink = vi.fn();
        engine().SetTranscriptSink(roomSink);
        const own = vi.fn();
        const session = new MockSession();
        const row = makeRow();
        const active = await engine().StartBridgeSession(params(session, makeProvider({ bridge: row }), { AgentID: 'co-1', TranscriptSink: own }));
        session.EmitTranscript('user', 'hello');
        session.EmitTranscript('assistant', 'hi there');
        expect(own).toHaveBeenCalledTimes(2);
        expect(own.mock.calls[0][0]).toMatchObject({ IsAgentSpeech: false, Text: 'hello', AgentSessionID: 'sess-1' });
        expect(own.mock.calls[1][0]).toMatchObject({ IsAgentSpeech: true, Text: 'hi there', AgentID: 'co-1' });
        expect(roomSink).not.toHaveBeenCalled();
        expect(active.IsTranscriptScribe).toBe(false);
        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
        engine().SetTranscriptSink(undefined as never);
    });

    it('a sink failure never breaks the call', async () => {
        const session = new MockSession();
        const active = await engine().StartBridgeSession(
            params(session, makeProvider({ bridge: makeRow() }), { TranscriptSink: async () => { throw new Error('db down'); } }),
        );
        expect(() => session.EmitTranscript('user', 'hello')).not.toThrow();
        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });
});

// ── barge-in ───────────────────────────────────────────────────────────────────

describe('barge-in', () => {
    it('flushes the agent audio and calls the host hook', async () => {
        const hook = vi.fn();
        const session = new MockSession();
        const active = await engine().StartBridgeSession(params(session, makeProvider({ bridge: makeRow() }), { OnBargeIn: hook }));
        const flush = vi.spyOn(active.Bridge, 'FlushOutboundMedia');
        session.EmitInterruption();
        expect(flush).toHaveBeenCalled();
        expect(hook).toHaveBeenCalledTimes(1);
        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('survives a throwing hook', async () => {
        const session = new MockSession();
        const active = await engine().StartBridgeSession(params(session, makeProvider({ bridge: makeRow() }), { OnBargeIn: () => { throw new Error('x'); } }));
        expect(() => session.EmitInterruption()).not.toThrow();
        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });
});

// ── model-drop recovery ────────────────────────────────────────────────────────

describe('model session loss', () => {
    it('re-opens the session once with the conversation so far and carries on', async () => {
        const first = new MockSession();
        const second = new MockSession();
        const recover = vi.fn(async () => second as IRealtimeSession);
        const row = makeRow();
        const active = await engine().StartBridgeSession(params(first, makeProvider({ bridge: row }), { RecoverRealtimeSession: recover }));
        first.EmitTranscript('user', 'my name is Pat');
        first.EmitTranscript('assistant', 'nice to meet you Pat');

        first.EmitClose();
        await vi.waitFor(() => expect(active.RealtimeSession).toBe(second));

        expect(recover).toHaveBeenCalledTimes(1);
        const request = (recover.mock.calls[0] as unknown as [{ PriorTranscript: string; Attempt: number }])[0];
        expect(request.PriorTranscript).toBe('User: my name is Pat\nAssistant: nice to meet you Pat');
        expect(request.Attempt).toBe(1);
        expect(first.CloseCount).toBe(1);
        expect(active.ModelRecovering).toBe(false);

        // Audio now flows to / from the replacement.
        (active.Bridge as LoopbackBridge).EmitInbound({ Track: 'audio-in', Bytes: bytes(1, 2) });
        expect(second.Heard).toHaveLength(1);
        expect(first.Heard).toHaveLength(0);
        second.EmitOutput(bytes(9));
        expect((active.Bridge as LoopbackBridge).Sent.length).toBe(1);
        // The old session is stale: its late output is ignored.
        first.EmitOutput(bytes(7));
        expect((active.Bridge as LoopbackBridge).Sent.length).toBe(1);
        // The replacement keeps recording the transcript.
        second.EmitTranscript('user', 'still there?');
        expect(active.TranscriptTail.at(-1)).toEqual({ Role: 'user', Text: 'still there?' });
        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it("doesn't tell the replacement about a camera only the lost session saw", async () => {
        const takesVideo: RealtimeSessionCapabilities['SupportedInboundTracks'] = [
            { Modality: 'audio', Direction: 'inbound' },
            { Modality: 'video', Direction: 'inbound', Encoding: 'image/jpeg', Rate: 1 },
        ];
        const first = new MockSession(takesVideo);
        const second = new MockSession(takesVideo);
        const recover = vi.fn(async () => second as IRealtimeSession);
        const active = await engine().StartBridgeSession(params(first, makeProvider({ bridge: makeRow() }), { RecoverRealtimeSession: recover }));
        const loopback = active.Bridge as LoopbackBridge;
        const ada = { SourceID: 'participant:ada:camera', SourceLabel: "Ada's camera" };
        loopback.EmitInbound({ Track: 'video-in', Bytes: bytes(0xff, 0xd8), MimeType: 'image/jpeg', ...ada });

        first.EmitClose();
        await vi.waitFor(() => expect(active.RealtimeSession).toBe(second));
        loopback.EmitVideoSourceEnded({ Track: 'video-in', ...ada });
        expect(second.Notes).toEqual([]);

        // Once the replacement has seen the camera itself, it is told when the camera ends.
        loopback.EmitInbound({ Track: 'video-in', Bytes: bytes(0xff, 0xd8), MimeType: 'image/jpeg', ...ada });
        loopback.EmitVideoSourceEnded({ Track: 'video-in', ...ada });
        expect(second.Notes).toEqual(["[The agent can no longer see: Ada's camera]"]);
        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('a fatal error recovers the same way; a non-fatal one does nothing', async () => {
        const first = new MockSession();
        const second = new MockSession();
        const recover = vi.fn(async () => second as IRealtimeSession);
        const active = await engine().StartBridgeSession(params(first, makeProvider({ bridge: makeRow() }), { RecoverRealtimeSession: recover }));
        first.EmitError({ Fatal: false });
        await Promise.resolve();
        expect(recover).not.toHaveBeenCalled();
        first.EmitError({ Fatal: true, Code: 'ws_1006' });
        await vi.waitFor(() => expect(active.RealtimeSession).toBe(second));
        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('treats an error and a close for the same drop as one loss', async () => {
        const first = new MockSession();
        const recover = vi.fn(async () => new MockSession() as IRealtimeSession);
        const active = await engine().StartBridgeSession(params(first, makeProvider({ bridge: makeRow() }), { RecoverRealtimeSession: recover }));
        first.EmitError({ Fatal: true });
        first.EmitClose();
        await vi.waitFor(() => expect(active.ModelRecovering).toBe(false));
        expect(recover).toHaveBeenCalledTimes(1);
        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('drops inbound audio while recovery is in flight', async () => {
        const first = new MockSession();
        let release: (s: IRealtimeSession) => void = () => {};
        const recover = vi.fn(() => new Promise<IRealtimeSession>((resolve) => { release = resolve; }));
        const active = await engine().StartBridgeSession(params(first, makeProvider({ bridge: makeRow() }), { RecoverRealtimeSession: recover }));
        first.EmitClose();
        await vi.waitFor(() => expect(active.ModelRecovering).toBe(true));
        (active.Bridge as LoopbackBridge).EmitInbound({ Track: 'audio-in', Bytes: bytes(1) });
        expect(first.Heard).toHaveLength(0);
        release(new MockSession());
        await vi.waitFor(() => expect(active.ModelRecovering).toBe(false));
        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('ends the call (CloseReason Error) when no recovery is configured', async () => {
        const session = new MockSession();
        const row = makeRow();
        const active = await engine().StartBridgeSession(params(session, makeProvider({ bridge: row })));
        session.EmitClose();
        await vi.waitFor(() => expect(row.Status).toBe('Disconnected'));
        expect(row.CloseReason).toBe('Error');
        expect(engine().ActiveSessions.some((s) => s.SessionBridgeID === active.SessionBridgeID)).toBe(false);
    });

    it('ends the call when the recovery factory fails', async () => {
        const session = new MockSession();
        const row = makeRow();
        await engine().StartBridgeSession(params(session, makeProvider({ bridge: row }), { RecoverRealtimeSession: async () => { throw new Error('no key'); } }));
        session.EmitClose();
        await vi.waitFor(() => expect(row.Status).toBe('Disconnected'));
        expect(row.CloseReason).toBe('Error');
    });

    it('refuses a replacement that uses different audio rates, closes it, and ends the call', async () => {
        const first = new MockSession();
        const mismatched = new MockSession();
        mismatched.InputSampleRate = 16000;
        const row = makeRow();
        await engine().StartBridgeSession(params(first, makeProvider({ bridge: row }), { RecoverRealtimeSession: async () => mismatched }));
        first.EmitClose();
        await vi.waitFor(() => expect(row.Status).toBe('Disconnected'));
        expect(mismatched.CloseCount).toBeGreaterThanOrEqual(1);
    });

    it('re-opens only once: a second loss ends the call', async () => {
        const first = new MockSession();
        const second = new MockSession();
        const row = makeRow();
        const recover = vi.fn(async () => second as IRealtimeSession);
        const active = await engine().StartBridgeSession(params(first, makeProvider({ bridge: row }), { RecoverRealtimeSession: recover }));
        first.EmitClose();
        await vi.waitFor(() => expect(active.RealtimeSession).toBe(second));
        second.EmitClose();
        await vi.waitFor(() => expect(row.Status).toBe('Disconnected'));
        expect(recover).toHaveBeenCalledTimes(1);
    });

    it('ignores a loss signal that arrives during an intentional stop', async () => {
        const session = new MockSession();
        const recover = vi.fn(async () => new MockSession() as IRealtimeSession);
        const active = await engine().StartBridgeSession(params(session, makeProvider({ bridge: makeRow() }), { RecoverRealtimeSession: recover }));
        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
        session.EmitClose();
        await Promise.resolve();
        expect(recover).not.toHaveBeenCalled();
    });
});

// ── telephony: keypad + goodbye ────────────────────────────────────────────────

class FakeCallSdk implements ITelephonyCallSdk {
    public readonly Spoken: string[] = [];
    public HungUp = false;
    private dtmf?: (d: string) => void;
    async dial(): Promise<string> { return 'call-1'; }
    async answer(): Promise<void> {}
    async hangup(): Promise<void> { this.HungUp = true; }
    sendAudioFrame(): void {}
    onAudioFrame(): void {}
    async sendDtmf(): Promise<void> {}
    onDtmf(cb: (d: string) => void): void { this.dtmf = cb; }
    async transfer(): Promise<void> {}
    onCallEnded(): void {}
    async playMessageAndHangup(_id: string, message: string): Promise<void> { this.Spoken.push(message); }
    PressKeys(digits: string): void { this.dtmf?.(digits); }
}
class TestTelephonyBridge extends BaseTelephonyBridge {}
MJGlobal.Instance.ClassFactory.Register(BaseRealtimeBridge, TestTelephonyBridge, 'TestEngineTelephonyBridge');

const TEL_FEATURES = { AudioIn: true, AudioOut: true, OutboundDial: true, InboundRouting: true, DTMF: true, CallTransfer: true };

function telParams(session: MockSession, provider: IMetadataProvider, sdk: FakeCallSdk, features = TEL_FEATURES): StartBridgeSessionParams {
    return {
        AgentSessionID: 'sess-tel',
        Provider: providerEntity(features, 'TestEngineTelephonyBridge'),
        RealtimeSession: session,
        Address: '+15550001111',
        Direction: 'Outbound',
        Configuration: { FromNumber: '+15559990000', InboundSampleRate: 8000, OutboundSampleRate: 8000 },
        BindSdk: (driver) => (driver as BaseTelephonyBridge).SetSdkFactory(() => sdk),
        ContextUser: user,
        MetadataProvider: provider,
    };
}

describe('telephony calls', () => {
    it('gives the model the keypad presses as ONE note per burst', async () => {
        vi.useFakeTimers();
        const sdk = new FakeCallSdk();
        const session = new MockSession();
        const active = await engine().StartBridgeSession(telParams(session, makeProvider({ bridge: makeRow() }), sdk));
        sdk.PressKeys('1');
        sdk.PressKeys('2');
        sdk.PressKeys('3');
        expect(session.Notes).toEqual([]);
        await vi.advanceTimersByTimeAsync(2000);
        expect(session.Notes).toEqual(['[caller keypad] The caller pressed: 123']);
        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('routes no keypad input when the provider has DTMF off', async () => {
        const sdk = new FakeCallSdk();
        const session = new MockSession();
        const active = await engine().StartBridgeSession(telParams(session, makeProvider({ bridge: makeRow() }), sdk, { ...TEL_FEATURES, DTMF: false }));
        expect(active.DtmfCoalescer).toBeUndefined();
        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('speaks a goodbye at the carrier and does NOT hang the call up when the model is lost for good', async () => {
        const sdk = new FakeCallSdk();
        const session = new MockSession();
        const row = makeRow();
        await engine().StartBridgeSession(telParams(session, makeProvider({ bridge: row }), sdk));
        session.EmitClose();
        await vi.waitFor(() => expect(row.Status).toBe('Disconnected'));
        expect(sdk.Spoken).toHaveLength(1);
        expect(sdk.Spoken[0]).toMatch(/technical difficulties/);
        expect(sdk.HungUp).toBe(false); // the carrier ends it after speaking
        expect(row.CloseReason).toBe('Error');
    });
});

// ── end-of-session hook ────────────────────────────────────────────────────────

describe('OnSessionEnded', () => {
    it('runs once after the bridge row is terminal, with the reason', async () => {
        const row = makeRow();
        const seen: string[] = [];
        const active = await engine().StartBridgeSession(
            params(new MockSession(), makeProvider({ bridge: row }), { OnSessionEnded: (reason) => { seen.push(`${row.Status}:${reason}`); } }),
        );
        await engine().StopBridgeSession(active.SessionBridgeID, 'HostEnded');
        expect(seen).toEqual(['Disconnected:HostEnded']);
    });

    it('a failing hook does not fail the stop', async () => {
        const row = makeRow();
        const active = await engine().StartBridgeSession(params(new MockSession(), makeProvider({ bridge: row }), { OnSessionEnded: async () => { throw new Error('x'); } }));
        await expect(engine().StopBridgeSession(active.SessionBridgeID, 'Explicit')).resolves.toBe(true);
    });
});

// ── agent-session heartbeat ────────────────────────────────────────────────────

describe('HeartbeatLiveSessions', () => {
    it('refreshes LastActiveAt only once the interval has elapsed', async () => {
        const sessionRow = makeRow();
        const active = await engine().StartBridgeSession(params(new MockSession(), makeProvider({ bridge: makeRow(), session: sessionRow })));
        const base = active.LastSessionHeartbeatMs;
        expect(await engine().HeartbeatLiveSessions(base + 60_000)).toBe(0);
        expect(sessionRow.LastActiveAt).toBeUndefined();
        expect(await engine().HeartbeatLiveSessions(base + 6 * 60_000)).toBe(1);
        expect(sessionRow.LastActiveAt).toBeInstanceOf(Date);
        expect(await engine().HeartbeatLiveSessions(base + 7 * 60_000)).toBe(0); // just touched
        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });

    it('logs and moves on when the row cannot be saved', async () => {
        const sessionRow = makeRow({ Save: vi.fn(async () => false), LatestResult: { CompleteMessage: 'locked' } });
        const active = await engine().StartBridgeSession(params(new MockSession(), makeProvider({ bridge: makeRow(), session: sessionRow })));
        expect(await engine().HeartbeatLiveSessions(active.LastSessionHeartbeatMs + 6 * 60_000)).toBe(0);
        await engine().StopBridgeSession(active.SessionBridgeID, 'Explicit');
    });
});

// ── orphan reconciliation scheduling ───────────────────────────────────────────

describe('StartOrphanReconciliation', () => {
    it('reconciles at startup and then periodically, once, until stopped', async () => {
        vi.useFakeTimers();
        const e = engine();
        const spy = vi.spyOn(e, 'ReconcileOrphans').mockResolvedValue(0);
        const provider = {} as IMetadataProvider;
        e.StartOrphanReconciliation(user, provider, 1000);
        e.StartOrphanReconciliation(user, provider, 1000); // idempotent
        expect(spy).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(3000);
        expect(spy).toHaveBeenCalledTimes(4);
        e.StopOrphanReconciliation();
        await vi.advanceTimersByTimeAsync(3000);
        expect(spy).toHaveBeenCalledTimes(4);
        spy.mockRestore();
    });

    it('survives a reconciliation failure', async () => {
        vi.useFakeTimers();
        const e = engine();
        const spy = vi.spyOn(e, 'ReconcileOrphans').mockRejectedValue(new Error('db'));
        e.StartOrphanReconciliation(user, {} as IMetadataProvider, 1000);
        await vi.advanceTimersByTimeAsync(2000);
        expect(spy).toHaveBeenCalledTimes(3);
        e.StopOrphanReconciliation();
        spy.mockRestore();
    });
});
