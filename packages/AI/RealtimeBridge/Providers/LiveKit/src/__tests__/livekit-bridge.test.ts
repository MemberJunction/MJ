import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ LogStatus: vi.fn<(message: string) => void>() }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogStatus: mocks.LogStatus };
});

import type {
    MJAIBridgeProviderEntity_IBridgeProviderFeatures,
} from '@memberjunction/core-entities';
import {
    RealtimeBridgeContext,
    BridgeMediaFrame,
    BridgeCapabilityNotSupportedError,
    BridgeMeetingParticipant,
} from '@memberjunction/ai-bridge-base';
import { BridgeVideoSourceEnd } from '@memberjunction/ai-bridge-base';
import { IsAgentParticipantIdentity, IsAvatarMediaFrame, LiveKitBridge, VideoSourceIdOf, VideoSourceLabelOf, VideoTrackOf } from '../livekit-bridge';
import {
    ILiveKitRoomSdk,
    LiveKitParticipant,
    LiveKitAudioFrame,
    LiveKitAvatarMediaChunk,
    LiveKitAvatarStatus,
    LiveKitConnectArgs,
    LiveKitConnectResult,
    LiveKitVideoFrame,
    LiveKitVideoSourceEnd,
} from '../livekit-sdk';

// ──────────────────────────────────────────────────────────────────────────────
// FakeLiveKitRoomSdk — an in-memory ILiveKitRoomSdk with drive helpers + capture
// sinks. No network, no real LiveKit SDK.
// ──────────────────────────────────────────────────────────────────────────────

class FakeLiveKitRoomSdk implements ILiveKitRoomSdk {
    public Connected = false;
    public Disconnected = false;
    public LastConnectArgs?: LiveKitConnectArgs;
    public readonly PublishedAudio: ArrayBuffer[] = [];
    public readonly PublishedVideo: ArrayBuffer[] = [];
    public readonly PublishedScreen: ArrayBuffer[] = [];
    public readonly PublishedAvatar: LiveKitAvatarMediaChunk[] = [];
    public readonly DataMessages: string[] = [];
    private avatarStatusCb?: (status: LiveKitAvatarStatus) => void;

    private participants: LiveKitParticipant[] = [];

    private audioCb?: (frame: LiveKitAudioFrame) => void;
    private videoCb?: (frame: LiveKitVideoFrame) => void;
    private videoEndCb?: (source: LiveKitVideoSourceEnd) => void;
    private joinCb?: (p: LiveKitParticipant) => void;
    private leaveCb?: (id: string) => void;
    private disconnectedCb?: () => void;

    constructor(initialRoster: LiveKitParticipant[] = []) {
        this.participants = [...initialRoster];
    }

    public async connect(args: LiveKitConnectArgs): Promise<LiveKitConnectResult> {
        this.Connected = true;
        this.LastConnectArgs = args;
        // The bot becomes a participant on connect.
        this.participants.push({ Identity: 'bot-1', DisplayName: args.BotDisplayName, Role: 'Participant', IsLocal: true });
        return { BotIdentity: 'bot-1', RoomName: 'room-alpha' };
    }
    public async disconnect(): Promise<void> {
        this.Disconnected = true;
    }
    public publishAudioFrame(pcm: ArrayBuffer): void {
        this.PublishedAudio.push(pcm);
    }
    public flushOutboundAudio(): void {
        /* not driven here */
    }
    /** Not on the seam any more (the avatar is the bot's only video out): kept here to catch any call to it. */
    public publishVideoFrame(frame: ArrayBuffer): void {
        this.PublishedVideo.push(frame);
    }
    /** Not on the seam any more (the bot shares no screen): kept here to catch any call to it. */
    public publishScreenFrame(frame: ArrayBuffer): void {
        this.PublishedScreen.push(frame);
    }
    public publishAvatarMedia(chunk: LiveKitAvatarMediaChunk): void {
        this.PublishedAvatar.push(chunk);
    }
    public onAvatarStatus(cb: (status: LiveKitAvatarStatus) => void): void {
        this.avatarStatusCb = cb;
    }
    public DriveAvatarStatus(status: LiveKitAvatarStatus): void {
        this.avatarStatusCb?.(status);
    }
    public onAudioTrack(cb: (frame: LiveKitAudioFrame) => void): void {
        this.audioCb = cb;
    }
    public onVideoTrack(cb: (frame: LiveKitVideoFrame) => void): void {
        this.videoCb = cb;
    }
    public onVideoSourceEnded(cb: (source: LiveKitVideoSourceEnd) => void): void {
        this.videoEndCb = cb;
    }
    public onParticipantJoin(cb: (p: LiveKitParticipant) => void): void {
        this.joinCb = cb;
    }
    public onParticipantLeave(cb: (id: string) => void): void {
        this.leaveCb = cb;
    }
    public async getParticipants(): Promise<LiveKitParticipant[]> {
        return [...this.participants];
    }
    public async sendDataMessage(text: string): Promise<void> {
        this.DataMessages.push(text);
    }
    public onDisconnected(cb: () => void): void {
        this.disconnectedCb = cb;
    }

    // ── drive helpers ──
    public DriveInboundAudio(frame: LiveKitAudioFrame): void {
        this.audioCb?.(frame);
    }
    public DriveVideoFrame(frame: LiveKitVideoFrame): void {
        this.videoCb?.(frame);
    }
    public DriveVideoSourceEnded(source: LiveKitVideoSourceEnd): void {
        this.videoEndCb?.(source);
    }
    public DriveJoin(p: LiveKitParticipant): void {
        this.participants.push(p);
        this.joinCb?.(p);
    }
    public DriveLeave(id: string): void {
        this.participants = this.participants.filter((x) => x.Identity !== id);
        this.leaveCb?.(id);
    }
    public DriveRoomDisconnected(): void {
        this.disconnectedCb?.();
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers.
// ──────────────────────────────────────────────────────────────────────────────

const FULL_FEATURES: MJAIBridgeProviderEntity_IBridgeProviderFeatures = {
    OnDemandJoin: true,
    AudioIn: true,
    AudioOut: true,
    VideoIn: true,
    VideoOut: true,
    ScreenIn: true,
    ScreenOut: true,
    SpeakerDiarization: true,
};

function ctx(
    features: MJAIBridgeProviderEntity_IBridgeProviderFeatures = FULL_FEATURES,
    overrides: Partial<RealtimeBridgeContext> = {},
): RealtimeBridgeContext {
    return {
        Features: features,
        ProviderName: 'LiveKit',
        Address: 'wss://livekit.myorg.com',
        Configuration: { BotDisplayName: 'Sage', AccessToken: 'signed-token-xyz' },
        ...overrides,
    };
}

/** Builds a LiveKitBridge wired to a FakeLiveKitRoomSdk via the creation seam. */
function makeBridge(sdk: FakeLiveKitRoomSdk): LiveKitBridge {
    const bridge = new LiveKitBridge();
    bridge.SetSdkFactory(() => sdk);
    return bridge;
}

function bytes(...vals: number[]): ArrayBuffer {
    return new Uint8Array(vals).buffer;
}

let sdk: FakeLiveKitRoomSdk;
beforeEach(() => {
    sdk = new FakeLiveKitRoomSdk([{ Identity: 'p-alice', DisplayName: 'Alice', Role: 'Host' }]);
    mocks.LogStatus.mockClear();
});

/** The bridge's log lines about outbound frames it dropped. */
function droppedLines(): string[] {
    return mocks.LogStatus.mock.calls.map(([message]) => message).filter((message) => message.includes('Dropped'));
}

// ──────────────────────────────────────────────────────────────────────────────
// Connect / Disconnect.
// ──────────────────────────────────────────────────────────────────────────────

describe('LiveKitBridge — Connect / Disconnect', () => {
    it('connects to the room and returns the bot + room handles', async () => {
        const bridge = makeBridge(sdk);
        const result = await bridge.Connect(ctx());
        expect(sdk.Connected).toBe(true);
        expect(result.BotParticipantId).toBe('bot-1');
        expect(result.ExternalConnectionId).toBe('room-alpha');
        expect(bridge.BotIdentity).toBe('bot-1');
        expect(sdk.LastConnectArgs?.BotDisplayName).toBe('Sage');
        expect(sdk.LastConnectArgs?.RoomUrl).toBe('wss://livekit.myorg.com');
        expect(sdk.LastConnectArgs?.AccessToken).toBe('signed-token-xyz');
    });

    it('disconnects from the room on Disconnect and clears state', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        await bridge.Disconnect('Explicit');
        expect(sdk.Disconnected).toBe(true);
        expect(bridge.BotIdentity).toBeNull();
    });

    it('throws an explicit error when no SDK factory is bound (real-SDK binding TODO)', async () => {
        const bridge = new LiveKitBridge(); // no SetSdkFactory
        await expect(bridge.Connect(ctx())).rejects.toThrow(/no LiveKit room SDK bound/i);
    });

    it('Connect requires AudioIn + AudioOut (a LiveKit room bridge minimum)', async () => {
        const bridge = makeBridge(sdk);
        await expect(bridge.Connect(ctx({ AudioIn: true }))).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Audio in → OnMedia (with speaker labels) and out → seam. Raw video and screen out are dropped (the avatar is the video).
// ──────────────────────────────────────────────────────────────────────────────

describe('LiveKitBridge — media', () => {
    it('forwards inbound per-participant audio to OnMedia with the speaker label', async () => {
        const bridge = makeBridge(sdk);
        const heard: BridgeMediaFrame[] = [];
        bridge.OnMedia((f) => heard.push(f));
        await bridge.Connect(ctx());

        sdk.DriveInboundAudio({ Pcm: bytes(1, 2, 3), ParticipantIdentity: 'p-alice', DisplayName: 'Alice', TimestampMs: 42 });

        expect(heard.length).toBe(1);
        expect(heard[0].Track).toBe('audio-in');
        expect(heard[0].SpeakerLabel).toBe('p-alice');
        expect(new Uint8Array(heard[0].Bytes!)).toEqual(new Uint8Array([1, 2, 3]));
        expect(heard[0].TimestampMs).toBe(42);
    });

    it('publishes outbound audio frames to the bot audio track', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        bridge.SendMedia('audio-out', { Track: 'audio-out', Bytes: bytes(9, 9) });
        expect(sdk.PublishedAudio.length).toBe(1);
        expect(new Uint8Array(sdk.PublishedAudio[0])).toEqual(new Uint8Array([9, 9]));
    });

    it('decodes a base64 outbound audio frame before publishing', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        bridge.SendMedia('audio-out', { Track: 'audio-out', Base64: 'AQID' }); // [1,2,3]
        expect(new Uint8Array(sdk.PublishedAudio[0])).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('drops a raw video-out frame and a screen-out frame (the room publishes only the avatar), one log line per track', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        bridge.SendMedia('video-out', { Track: 'video-out', Bytes: bytes(1) });
        bridge.SendMedia('screen-out', { Track: 'screen-out', Bytes: bytes(2) });
        bridge.SendMedia('video-out', { Track: 'video-out', Bytes: bytes(3) });
        bridge.SendMedia('screen-out', { Track: 'screen-out', Bytes: bytes(4) });
        expect(sdk.PublishedVideo).toHaveLength(0);
        expect(sdk.PublishedScreen).toHaveLength(0);
        expect(sdk.PublishedAvatar).toHaveLength(0);
        const lines = droppedLines();
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain("on video-out: the room publishes only the agent's avatar");
        expect(lines[0]).toContain('(type none)');
        expect(lines[1]).toContain('a screen-share frame on screen-out');
    });

    it('logs a dropped frame again in the next session', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        bridge.SendMedia('video-out', { Track: 'video-out', Bytes: bytes(1) });
        await bridge.Disconnect('Explicit');
        await bridge.Connect(ctx());
        bridge.SendMedia('video-out', { Track: 'video-out', Bytes: bytes(2) });
        expect(droppedLines()).toHaveLength(2);
    });

    it('drops video/screen without a log line when those directional features are off', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx({ AudioIn: true, AudioOut: true, SpeakerDiarization: true })); // no Video/ScreenOut
        bridge.SendMedia('video-out', { Track: 'video-out', Bytes: bytes(1) });
        bridge.SendMedia('screen-out', { Track: 'screen-out', Bytes: bytes(2) });
        expect(sdk.PublishedVideo.length).toBe(0);
        expect(sdk.PublishedScreen.length).toBe(0);
        expect(droppedLines()).toEqual([]);
    });

    it('drops outbound media when not connected', () => {
        const bridge = makeBridge(sdk);
        bridge.SendMedia('audio-out', { Track: 'audio-out', Bytes: bytes(1) });
        expect(sdk.PublishedAudio.length).toBe(0);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Video in (agent vision): sampled camera and screen frames from people who allow it.
// ──────────────────────────────────────────────────────────────────────────────

describe('LiveKitBridge — video in (what the agent sees)', () => {
    const cameraFrame = (overrides: Partial<LiveKitVideoFrame> = {}): LiveKitVideoFrame => ({
        Bytes: bytes(0xff, 0xd8),
        MimeType: 'image/jpeg',
        ParticipantIdentity: 'p-ada',
        DisplayName: 'Ada',
        Source: 'camera',
        Width: 640,
        Height: 360,
        TimestampMs: 1000,
        ...overrides,
    });

    it("passes the provider's video flags to the SDK with the session configuration", async () => {
        const configs: Array<Record<string, unknown> | undefined> = [];
        const bridge = new LiveKitBridge();
        bridge.SetSdkFactory((config) => {
            configs.push(config);
            return sdk;
        });
        await bridge.Connect(ctx({ ...FULL_FEATURES, ScreenIn: false }));
        expect(configs[0]).toMatchObject({ BotDisplayName: 'Sage', AccessToken: 'signed-token-xyz', VideoIn: true, ScreenIn: false });
    });

    it('forwards a camera frame as video-in, with its type, source key and name', async () => {
        const bridge = makeBridge(sdk);
        const seen: BridgeMediaFrame[] = [];
        bridge.OnMedia((f) => seen.push(f));
        await bridge.Connect(ctx());

        sdk.DriveVideoFrame(cameraFrame());

        expect(seen).toHaveLength(1);
        expect(seen[0]).toMatchObject({
            Track: 'video-in',
            MimeType: 'image/jpeg',
            SourceID: 'participant:p-ada:camera',
            SourceLabel: "Ada's camera",
            TimestampMs: 1000,
        });
        expect(new Uint8Array(seen[0].Bytes!)).toEqual(new Uint8Array([0xff, 0xd8]));
        expect(seen[0].SpeakerLabel).toBeUndefined();
    });

    it("carries each image's size, and marks every JPEG a key frame (it decodes on its own)", async () => {
        const bridge = makeBridge(sdk);
        const seen: BridgeMediaFrame[] = [];
        bridge.OnMedia((f) => seen.push(f));
        await bridge.Connect(ctx());

        sdk.DriveVideoFrame(cameraFrame());
        sdk.DriveVideoFrame(cameraFrame({ Source: 'screen', Width: 1280, Height: 720 }));

        expect(seen.map((f) => [f.Track, f.Width, f.Height, f.KeyFrame])).toEqual([
            ['video-in', 640, 360, true],
            ['screen-in', 1280, 720, true],
        ]);
    });

    it('forwards a shared screen as screen-in, with its own source key', async () => {
        const bridge = makeBridge(sdk);
        const seen: BridgeMediaFrame[] = [];
        bridge.OnMedia((f) => seen.push(f));
        await bridge.Connect(ctx());

        sdk.DriveVideoFrame(cameraFrame({ Source: 'screen' }));

        expect(seen.map((f) => [f.Track, f.SourceID, f.SourceLabel])).toEqual([['screen-in', 'participant:p-ada:screen', "Ada's screen"]]);
    });

    it('drops camera frames without VideoIn, and shared screens without ScreenIn', async () => {
        const camerasOnly = makeBridge(sdk);
        const fromCamerasOnly: BridgeMediaFrame[] = [];
        camerasOnly.OnMedia((f) => fromCamerasOnly.push(f));
        await camerasOnly.Connect(ctx({ ...FULL_FEATURES, ScreenIn: false }));
        sdk.DriveVideoFrame(cameraFrame({ Source: 'screen' }));
        sdk.DriveVideoFrame(cameraFrame());
        expect(fromCamerasOnly.map((f) => f.Track)).toEqual(['video-in']);

        const otherSdk = new FakeLiveKitRoomSdk();
        const screensOnly = makeBridge(otherSdk);
        const fromScreensOnly: BridgeMediaFrame[] = [];
        screensOnly.OnMedia((f) => fromScreensOnly.push(f));
        await screensOnly.Connect(ctx({ ...FULL_FEATURES, VideoIn: false }));
        otherSdk.DriveVideoFrame(cameraFrame());
        otherSdk.DriveVideoFrame(cameraFrame({ Source: 'screen' }));
        expect(fromScreensOnly.map((f) => f.Track)).toEqual(['screen-in']);
    });

    it('reports an ended source with the same key and name its frames carried', async () => {
        const bridge = makeBridge(sdk);
        const ended: BridgeVideoSourceEnd[] = [];
        bridge.OnVideoSourceEnded((s) => ended.push(s));
        await bridge.Connect(ctx());

        sdk.DriveVideoSourceEnded({ ParticipantIdentity: 'p-ada', DisplayName: 'Ada', Source: 'camera' });

        expect(ended).toEqual([{ Track: 'video-in', SourceID: 'participant:p-ada:camera', SourceLabel: "Ada's camera" }]);
    });

    it('forwards nothing after Disconnect', async () => {
        const bridge = makeBridge(sdk);
        const seen: BridgeMediaFrame[] = [];
        const ended: BridgeVideoSourceEnd[] = [];
        bridge.OnMedia((f) => seen.push(f));
        bridge.OnVideoSourceEnded((s) => ended.push(s));
        await bridge.Connect(ctx());
        await bridge.Disconnect('Explicit');

        sdk.DriveVideoFrame(cameraFrame());
        sdk.DriveVideoSourceEnded({ ParticipantIdentity: 'p-ada', Source: 'camera' });

        expect(seen).toEqual([]);
        expect(ended).toEqual([]);
    });

    it('names sources for the model, and keys them per participant and kind', () => {
        expect(VideoSourceLabelOf('Ada', 'camera')).toBe("Ada's camera");
        expect(VideoSourceLabelOf('  Bo ', 'screen')).toBe("Bo's screen");
        expect(VideoSourceLabelOf(undefined, 'camera')).toBe("a participant's camera");
        expect(VideoSourceLabelOf('', 'screen')).toBe("a participant's screen");
        expect(VideoSourceIdOf('p-ada', 'camera')).not.toBe(VideoSourceIdOf('p-ada', 'screen'));
        expect(VideoTrackOf('camera')).toBe('video-in');
        expect(VideoTrackOf('screen')).toBe('screen-in');
    });

    it('recognizes other agents by their identity, which the bot never reads', () => {
        expect(IsAgentParticipantIdentity('agent-1234')).toBe(true);
        expect(IsAgentParticipantIdentity('Agent-XYZ')).toBe(true);
        expect(IsAgentParticipantIdentity('p-ada')).toBe(false);
        expect(IsAgentParticipantIdentity(undefined)).toBe(false);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Participants / roster (capability-gated by SpeakerDiarization).
// ──────────────────────────────────────────────────────────────────────────────

describe('LiveKitBridge — participants', () => {
    it('GetParticipants maps the LiveKit roster to BridgeParticipantInfo (bot flagged as Agent)', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const roster = await bridge.GetParticipants();
        const alice = roster.find((p) => p.ExternalId === 'p-alice');
        const bot = roster.find((p) => p.ExternalId === 'bot-1');
        expect(alice).toMatchObject({ DisplayName: 'Alice', Role: 'Host', IsAgent: false });
        expect(bot).toMatchObject({ Role: 'Agent', IsAgent: true });
    });

    it("counts another agent's bot (agent-…, in any case) as an agent, though it is a remote participant", async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        sdk.DriveJoin({ Identity: 'Agent-7F3C', DisplayName: 'Rex', Role: 'Participant' });
        sdk.DriveJoin({ Identity: 'p-agentina', DisplayName: 'Agentina', Role: 'Participant' });

        const roster = await bridge.GetParticipants();

        expect(roster.find((p) => p.ExternalId === 'Agent-7F3C')).toMatchObject({ Role: 'Participant', IsAgent: true });
        expect(roster.find((p) => p.ExternalId === 'p-agentina')).toMatchObject({ Role: 'Participant', IsAgent: false });
    });

    it('OnParticipantChange fires the full roster on a join and a leave', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const snapshots: number[] = [];
        bridge.OnParticipantChange((p) => snapshots.push(p.length));

        sdk.DriveJoin({ Identity: 'p-bob', DisplayName: 'Bob', Role: 'Participant' });
        await new Promise((r) => setTimeout(r, 0));
        sdk.DriveLeave('p-alice');
        await new Promise((r) => setTimeout(r, 0));

        // Roster started at 2 (alice + bot), +bob = 3, then -alice = 2.
        expect(snapshots).toContain(3);
        expect(snapshots[snapshots.length - 1]).toBe(2);
    });

    it('a room-disconnected signal surfaces an empty roster', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        let last: number | null = null;
        bridge.OnParticipantChange((p) => (last = p.length));
        sdk.DriveRoomDisconnected();
        expect(last).toBe(0);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Meeting Controls event source — roster / speaking / mute path.
// ──────────────────────────────────────────────────────────────────────────────

describe('LiveKitBridge — Meeting Controls event source', () => {
    it('exposes a Meeting Controls event source when diarization is supported', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const source = bridge.GetMeetingControlsEventSource();
        expect(source).not.toBeNull();
        expect(source!.Capabilities).toContain('Mute');
    });

    it('seeds the roster and emits it to a Meeting Controls subscriber', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const source = bridge.GetMeetingControlsEventSource()!;
        let roster: BridgeMeetingParticipant[] = [];
        source.OnRosterChange((p) => (roster = p));
        expect(roster.find((p) => p.ParticipantId === 'p-alice')).toBeDefined();
    });

    it('updates the Meeting Controls roster on join/leave', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const source = bridge.GetMeetingControlsEventSource()!;
        let roster: BridgeMeetingParticipant[] = [];
        source.OnRosterChange((p) => (roster = p));

        sdk.DriveJoin({ Identity: 'p-carol', DisplayName: 'Carol', Role: 'Participant' });
        await new Promise((r) => setTimeout(r, 0)); // roster refresh is async (re-pulls the SDK roster)
        expect(roster.find((p) => p.ParticipantId === 'p-carol')).toBeDefined();

        sdk.DriveLeave('p-carol');
        await new Promise((r) => setTimeout(r, 0));
        expect(roster.find((p) => p.ParticipantId === 'p-carol')).toBeUndefined();
    });

    it('attributes inbound audio to who is speaking (diarization → speaking perception)', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const source = bridge.GetMeetingControlsEventSource()!;
        let speaking: string[] = [];
        source.OnSpeakingChange((ids) => (speaking = ids));

        sdk.DriveInboundAudio({ Pcm: bytes(1), ParticipantIdentity: 'p-alice' });
        expect(speaking).toEqual(['p-alice']);
    });

    it('actuates mute through the SDK data-channel admin path', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const source = bridge.GetMeetingControlsEventSource()!;
        await source.MuteParticipant('p-alice');
        expect(sdk.DataMessages.some((m) => m.includes('p-alice'))).toBe(true);
    });

    it('contributes NO Meeting Controls source when diarization is off', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx({ AudioIn: true, AudioOut: true })); // no SpeakerDiarization
        expect(bridge.GetMeetingControlsEventSource()).toBeNull();
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Data-channel chat.
// ──────────────────────────────────────────────────────────────────────────────

describe('LiveKitBridge — data channel chat', () => {
    it('sends a data message through the SDK', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        await bridge.SendDataMessage('I can add some context here.');
        expect(sdk.DataMessages).toContain('I can add some context here.');
    });

    it('SendDataMessage is a no-op (no throw) when not connected', async () => {
        const bridge = makeBridge(sdk);
        await expect(bridge.SendDataMessage('hi')).resolves.toBeUndefined();
        expect(sdk.DataMessages.length).toBe(0);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Capability gating — a feature LiveKit lacks throws.
// ──────────────────────────────────────────────────────────────────────────────

describe('LiveKitBridge — capability gating', () => {
    it('throws BridgeCapabilityNotSupportedError for telephony DTMF (a feature LiveKit lacks)', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        await expect(bridge.SendDTMF('123#')).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });

    it('throws for TransferCall and StartRecording (not LiveKit-room features here)', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        await expect(bridge.TransferCall('+15555550123')).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
        await expect(bridge.StartRecording()).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });

    it('GetParticipants throws when diarization is disabled (defense-in-depth re-assert)', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx({ AudioIn: true, AudioOut: true })); // no SpeakerDiarization
        await expect(bridge.GetParticipants()).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// The agent's live avatar (video out as fragmented MP4).
// ──────────────────────────────────────────────────────────────────────────────

describe('LiveKitBridge — the agent\'s avatar', () => {
    it('sends a video/mp4 frame to the room client as an avatar piece, with its type, and nothing as a raw frame', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const piece = bytes(0, 0, 0, 8, 0x66, 0x74, 0x79, 0x70);
        bridge.SendMedia('video-out', { Track: 'video-out', Bytes: piece, MimeType: 'video/mp4' });
        bridge.SendMedia('video-out', { Track: 'video-out', Bytes: bytes(1), MimeType: 'video/mp4; codecs="avc1.42c01f, mp4a.40.2"' });
        expect(sdk.PublishedAvatar.map((c) => c.MimeType)).toEqual(['video/mp4', 'video/mp4; codecs="avc1.42c01f, mp4a.40.2"']);
        expect(sdk.PublishedAvatar[0].Bytes).toBe(piece);
        expect(sdk.PublishedVideo).toHaveLength(0);
    });

    it('publishes an avatar piece the same whether or not it says its size and key frame', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const described = bytes(1, 2);
        const bare = bytes(3, 4);
        bridge.SendMedia('video-out', { Track: 'video-out', Bytes: described, MimeType: 'video/mp4', Width: 704, Height: 1280, KeyFrame: true });
        bridge.SendMedia('video-out', { Track: 'video-out', Bytes: bare, MimeType: 'video/mp4' });
        expect(sdk.PublishedAvatar).toEqual([
            { Bytes: described, MimeType: 'video/mp4' },
            { Bytes: bare, MimeType: 'video/mp4' },
        ]);
    });

    it('drops a video frame that is not an MP4 piece (no raw camera path), logging the first with its type', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        bridge.SendMedia('video-out', { Track: 'video-out', Bytes: bytes(1), MimeType: 'image/jpeg' });
        bridge.SendMedia('video-out', { Track: 'video-out', Bytes: bytes(2) });
        expect(sdk.PublishedVideo).toHaveLength(0);
        expect(sdk.PublishedAvatar).toHaveLength(0);
        expect(droppedLines()).toEqual([
            "[LiveKitBridge] Dropped a video frame that is not an avatar's MP4 (type image/jpeg) on video-out: the room publishes " +
                "only the agent's avatar. Later video-out frames in this session are dropped without a log line.",
        ]);
    });

    it('still publishes the avatar after dropping a raw frame: the avatar is the one video path', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        bridge.SendMedia('video-out', { Track: 'video-out', Bytes: bytes(1), MimeType: 'image/jpeg' });
        const piece = bytes(0, 0, 0, 8, 0x66, 0x74, 0x79, 0x70);
        bridge.SendMedia('video-out', { Track: 'video-out', Bytes: piece, MimeType: 'video/mp4' });
        expect(sdk.PublishedAvatar).toEqual([{ Bytes: piece, MimeType: 'video/mp4' }]);
        expect(sdk.PublishedVideo).toHaveLength(0);
    });

    it('publishes no avatar when the provider does not allow video out', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx({ AudioIn: true, AudioOut: true, SpeakerDiarization: true }));
        bridge.SendMedia('video-out', { Track: 'video-out', Bytes: bytes(1), MimeType: 'video/mp4' });
        expect(sdk.PublishedAvatar).toHaveLength(0);
    });

    it('tells the engine when the room client takes the avatar down, with the reason, and not when it publishes it', async () => {
        const bridge = makeBridge(sdk);
        const lost: string[] = [];
        bridge.OnAvatarUnavailable((reason) => lost.push(reason));
        await bridge.Connect(ctx());
        sdk.DriveAvatarStatus({ State: 'on' });
        sdk.DriveAvatarStatus({ State: 'audio-only', Reason: 'decoder-failed' });
        expect(lost).toEqual(['decoder-failed']);
    });

    it('stops telling the engine after Disconnect', async () => {
        const bridge = makeBridge(sdk);
        const lost: string[] = [];
        bridge.OnAvatarUnavailable((reason) => lost.push(reason));
        await bridge.Connect(ctx());
        await bridge.Disconnect('Explicit');
        sdk.DriveAvatarStatus({ State: 'audio-only', Reason: 'publish-failed' });
        expect(lost).toEqual([]);
    });

    it('IsAvatarMediaFrame: video/mp4 with or without parameters, any case; nothing else', () => {
        for (const type of ['video/mp4', 'VIDEO/MP4', ' video/mp4; codecs="avc1"']) {
            expect(IsAvatarMediaFrame({ Track: 'video-out', MimeType: type })).toBe(true);
        }
        for (const type of [undefined, '', 'image/jpeg', 'video/mp4v', 'video/webm', 'audio/mp4']) {
            expect(IsAvatarMediaFrame({ Track: 'video-out', MimeType: type })).toBe(false);
        }
    });
});
