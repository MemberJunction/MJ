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
import type { IRealtimeSession, RealtimeAvatarMediaChunk, RealtimeSessionCapabilities, RealtimeTranscript } from '@memberjunction/ai';
import type { MJAIBridgeProviderEntity } from '@memberjunction/core-entities';
import { AIBridgeEngine, IHostInstanceIdentity, StartBridgeSessionParams, ActiveBridgeSession, BridgeRealtimeSessionRecoveryRequest } from '../ai-bridge-engine';
import { LoopbackBridge, LOOPBACK_BRIDGE_DRIVER_CLASS } from '../loopback-bridge';
import { AvatarFragmentPiece, AvatarInitPiece, AUDIO_TRACK, VIDEO_TRACK } from './helpers/avatar-pieces';

const RATE = 24000;

/** A realtime session double with an avatar output, whose speech a test drives. */
class AvatarSession implements IRealtimeSession {
    public readonly InputSampleRate = 16000;
    public readonly OutputSampleRate = RATE;
    public readonly Heard: ArrayBuffer[] = [];
    public Closed = false;
    private outputHandler?: (chunk: ArrayBuffer) => void;
    private avatarHandler?: (chunk: RealtimeAvatarMediaChunk) => void;
    private transcriptHandler?: (t: RealtimeTranscript) => void;
    private interruptionHandler?: () => void;

    constructor(private readonly fullDuplex = false) {}

    public get Capabilities(): RealtimeSessionCapabilities {
        return { CanReconfigureTurnMode: false, FullDuplex: this.fullDuplex };
    }
    public SendInput(frame: { Data: ArrayBuffer }): void {
        this.Heard.push(frame.Data);
    }
    public async RegisterTools(): Promise<void> { /* no-op */ }
    public OnOutput(handler: (chunk: ArrayBuffer) => void): void { this.outputHandler = handler; }
    public OnAvatarOutput(handler: (chunk: RealtimeAvatarMediaChunk) => void): void { this.avatarHandler = handler; }
    public OnTranscript(handler: (t: RealtimeTranscript) => void): void { this.transcriptHandler = handler; }
    public OnToolCall(): void { /* no-op */ }
    public async SendToolResult(): Promise<void> { /* no-op */ }
    public OnInterruption(handler: () => void): void { this.interruptionHandler = handler; }
    public OnError(): void { /* no-op */ }
    public OnUsage(): void { /* no-op */ }
    public async Close(): Promise<void> { this.Closed = true; }

    /** The model sends one avatar piece. */
    public Piece(data: ArrayBuffer, mimeType = 'video/mp4'): void { this.avatarHandler?.({ Data: data, MimeType: mimeType }); }
    /** The model speaks `ms` of PCM. */
    public Say(ms: number): void { this.outputHandler?.(new ArrayBuffer(Math.round((ms / 1000) * RATE) * 2)); }
    public Final(role: 'user' | 'assistant', text: string): void { this.transcriptHandler?.({ Role: role, Text: text, IsFinal: true }); }
    /** The user barges in: the model reports a true interruption. */
    public Interrupt(): void { this.interruptionHandler?.(); }
}

let rowSeq = 0;
const provider = {
    GetEntityObject: vi.fn(async () => ({ ID: `bridge-avatar-${++rowSeq}`, Status: 'Pending', NewRecord: vi.fn(), Save: vi.fn(async () => true), Load: vi.fn(async () => true), LatestResult: { CompleteMessage: '' } })),
} as unknown as IMetadataProvider;
const user = { ID: 'user-1', Email: 'tester@example.com' } as unknown as UserInfo;
const providerEntity = {
    ID: 'provider-loopback',
    Name: 'Loopback',
    DriverClass: LOOPBACK_BRIDGE_DRIVER_CLASS,
    SupportedFeaturesObject: { AudioIn: true, AudioOut: true, VideoOut: true, SpeakerDiarization: true },
} as unknown as MJAIBridgeProviderEntity;
const HOST: IHostInstanceIdentity = { GetHostInstanceID: () => 'testhost:1:boot', GetHostNamePrefix: () => 'testhost:' };

function engine(): AIBridgeEngine {
    const e = AIBridgeEngine.Instance;
    e.SetHostInstanceIdentity(HOST);
    return e;
}

async function seat(id: string, session: AvatarSession, extra: Partial<StartBridgeSessionParams> = {}): Promise<ActiveBridgeSession> {
    return engine().StartBridgeSession({
        AgentSessionID: id,
        Provider: providerEntity,
        RealtimeSession: session,
        Address: 'avatar-room',
        ContextUser: user,
        MetadataProvider: provider,
        AgentNames: [id],
        TurnMode: 'Passive',
        ...extra,
    });
}

function loopback(active: ActiveBridgeSession): LoopbackBridge {
    return active.Bridge as LoopbackBridge;
}

/** The avatar pieces the bridge was sent: video-out frames with a MIME type. */
function avatarSent(active: ActiveBridgeSession): Array<{ MimeType?: string; Bytes?: ArrayBuffer }> {
    return loopback(active).Sent.filter((f) => f.Track === 'video-out');
}

beforeEach(() => {
    runViewMock.mockReset();
    runViewMock.mockResolvedValue({ Success: true, Results: [] });
});

afterEach(async () => {
    for (const a of engine().ActiveSessions) {
        await engine().StopBridgeSession(a.SessionBridgeID, 'Explicit');
    }
});

describe('AIBridgeEngine — the avatar output', () => {
    it('sends each avatar piece to the bridge on video-out, with its MIME type and bytes', async () => {
        const session = new AvatarSession();
        const active = await seat('solo', session);
        const init = AvatarInitPiece();
        session.Piece(init);
        session.Piece(AvatarFragmentPiece(VIDEO_TRACK, 41.7), 'video/mp4; codecs="avc1.42c01f, mp4a.40.2"');

        const sent = avatarSent(active);
        expect(sent.map((f) => f.MimeType)).toEqual(['video/mp4', 'video/mp4; codecs="avc1.42c01f, mp4a.40.2"']);
        expect(sent[0].Bytes).toBe(init);
    });

    it('counts an avatar piece as activity for the idle sweep', async () => {
        const session = new AvatarSession();
        const active = await seat('activity', session);
        loopback(active).OnMedia(() => undefined); // the loopback's echo of the piece no longer counts: only the avatar path can
        active.LastActivityMs = 0;
        session.Piece(AvatarInitPiece());
        expect(active.LastActivityMs).toBeGreaterThan(0);
    });

    it('a barge-in flushes once: the bridge flush drops the queued voice and face together', async () => {
        const session = new AvatarSession();
        const active = await seat('barge', session);
        const flush = vi.spyOn(active.Bridge, 'FlushOutboundMedia');
        session.Interrupt();
        expect(flush).toHaveBeenCalledTimes(1);
    });
});

describe('AIBridgeEngine — the floor gate counts an avatar piece by its audio', () => {
    let prevEnv: string | undefined;
    beforeEach(() => {
        prevEnv = process.env.MJ_REALTIME_MODERATOR_MODE;
        process.env.MJ_REALTIME_MODERATOR_MODE = 'on';
    });
    afterEach(() => {
        if (prevEnv !== undefined) process.env.MJ_REALTIME_MODERATOR_MODE = prevEnv;
        else delete process.env.MJ_REALTIME_MODERATOR_MODE;
    });

    it('lets an avatar take the floor by speaking', async () => {
        const avatar = new AvatarSession(true);
        const a = await seat('gate-a', avatar);
        await seat('gate-b', new AvatarSession(true));
        avatar.Piece(AvatarInitPiece());
        avatar.Piece(AvatarFragmentPiece(AUDIO_TRACK, 300));
        expect(engine().RoomCoordinator.IsFloorHolder(a.RoomKey!, a.AgentSessionID)).toBe(true);
        expect(avatarSent(a)).toHaveLength(2);
    });

    it('cuts an avatar that talks over the floor holder past a backchannel, by its audio\'s duration, and drops its face too', async () => {
        const holder = new AvatarSession(true);
        const avatar = new AvatarSession(true);
        await seat('over-a', holder);
        const b = await seat('over-b', avatar);
        const flush = vi.spyOn(b.Bridge, 'FlushOutboundMedia');
        holder.Say(300); // the first agent takes the floor

        avatar.Piece(AvatarInitPiece()); // no speech: passes the gate
        avatar.Piece(AvatarFragmentPiece(AUDIO_TRACK, 300)); // a backchannel-length overlay passes
        avatar.Piece(AvatarFragmentPiece(VIDEO_TRACK, 41.7)); // its face follows the burst
        expect(avatarSent(b)).toHaveLength(3);

        avatar.Piece(AvatarFragmentPiece(AUDIO_TRACK, 1600)); // a turn that outlasts the bound is cut
        expect(flush).toHaveBeenCalledTimes(1);
        avatar.Piece(AvatarFragmentPiece(VIDEO_TRACK, 41.7)); // and the rest of the burst, face included, is dropped
        avatar.Piece(AvatarFragmentPiece(AUDIO_TRACK, 100));
        expect(avatarSent(b)).toHaveLength(3);
    });

    it('still passes a new init segment while the avatar is muted', async () => {
        const holder = new AvatarSession(true);
        const avatar = new AvatarSession(true);
        await seat('init-a', holder);
        const b = await seat('init-b', avatar);
        holder.Say(300);
        avatar.Piece(AvatarInitPiece());
        avatar.Piece(AvatarFragmentPiece(AUDIO_TRACK, 2000)); // cut at once
        avatar.Piece(AvatarInitPiece());
        expect(avatarSent(b)).toHaveLength(2);
    });
});

describe('AIBridgeEngine — an avatar the bridge can no longer show', () => {
    it('replaces the model session once, audio only, through the host, and closes the old one', async () => {
        const old = new AvatarSession();
        const fresh = new AvatarSession();
        const requests: BridgeRealtimeSessionRecoveryRequest[] = [];
        const replace = vi.fn(async (request: BridgeRealtimeSessionRecoveryRequest) => {
            requests.push(request);
            return fresh;
        });
        const active = await seat('lost', old, { RecoverRealtimeSessionWithoutAvatar: replace });
        old.Final('user', 'Hello there');
        old.Final('assistant', 'Hi, how can I help?');

        loopback(active).EmitAvatarUnavailable('decoder-failed');
        await vi.waitFor(() => expect(active.RealtimeSession).toBe(fresh));
        expect(old.Closed).toBe(true);
        expect(requests[0].Reason).toContain('decoder-failed');
        expect(requests[0].PriorTranscript).toContain('Hi, how can I help?');

        loopback(active).EmitAvatarUnavailable('publish-failed');
        await new Promise((r) => setTimeout(r, 0));
        expect(replace).toHaveBeenCalledTimes(1);
    });

    it("ignores a replaced session's avatar pieces", async () => {
        const old = new AvatarSession();
        const fresh = new AvatarSession();
        const active = await seat('stale', old, { RecoverRealtimeSessionWithoutAvatar: async () => fresh });
        loopback(active).EmitAvatarUnavailable('decoder-failed');
        await vi.waitFor(() => expect(active.RealtimeSession).toBe(fresh));
        old.Piece(AvatarInitPiece());
        expect(avatarSent(active)).toHaveLength(0);
    });

    it('holds inbound audio back while the replacement opens, then the new session hears', async () => {
        const old = new AvatarSession();
        const fresh = new AvatarSession();
        let open: (session: IRealtimeSession) => void = () => undefined;
        const active = await seat('held', old, { RecoverRealtimeSessionWithoutAvatar: () => new Promise((resolve) => { open = resolve; }) });
        loopback(active).EmitAvatarUnavailable('decoder-failed');
        loopback(active).EmitInbound({ Track: 'audio-in', Bytes: new ArrayBuffer(4) });
        expect(old.Heard).toHaveLength(0);
        open(fresh);
        await vi.waitFor(() => expect(active.RealtimeSession).toBe(fresh));
        loopback(active).EmitInbound({ Track: 'audio-in', Bytes: new ArrayBuffer(4) });
        expect(fresh.Heard).toHaveLength(1);
    });

    it('goes on as it was when the host gave no replacement, or the replacement fails', async () => {
        const kept = new AvatarSession();
        const a = await seat('none', kept);
        loopback(a).EmitAvatarUnavailable('decoder-failed');
        await new Promise((r) => setTimeout(r, 0));
        expect(a.RealtimeSession).toBe(kept);

        const failing = new AvatarSession();
        const b = await seat('fails', failing, { RecoverRealtimeSessionWithoutAvatar: async () => { throw new Error('no model'); } });
        loopback(b).EmitAvatarUnavailable('decoder-failed');
        await new Promise((r) => setTimeout(r, 0));
        expect(b.RealtimeSession).toBe(failing);
        expect(b.ModelRecovering).toBe(false);
        loopback(b).EmitInbound({ Track: 'audio-in', Bytes: new ArrayBuffer(4) });
        expect(failing.Heard).toHaveLength(1);
    });
});
