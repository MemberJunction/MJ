import { describe, it, expect, beforeEach } from 'vitest';
import type {
    MJAIBridgeProviderEntity_IBridgeProviderFeatures,
} from '@memberjunction/core-entities';
import {
    RealtimeBridgeContext,
    BridgeMediaFrame,
    BridgeCapabilityNotSupportedError,
    BridgeMeetingParticipant,
} from '@memberjunction/ai-bridge-base';
import { LiveKitBridge } from '../livekit-bridge';
import {
    ILiveKitRoomSdk,
    LiveKitParticipant,
    LiveKitAudioFrame,
    LiveKitConnectArgs,
    LiveKitConnectResult,
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
    public readonly DataMessages: string[] = [];

    private participants: LiveKitParticipant[] = [];

    private audioCb?: (frame: LiveKitAudioFrame) => void;
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
    public publishVideoFrame(frame: ArrayBuffer): void {
        this.PublishedVideo.push(frame);
    }
    public publishScreenFrame(frame: ArrayBuffer): void {
        this.PublishedScreen.push(frame);
    }
    public onAudioTrack(cb: (frame: LiveKitAudioFrame) => void): void {
        this.audioCb = cb;
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
});

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
// Audio in → OnMedia (with speaker labels) and out → seam. Full A/V/screen out.
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

    it('publishes video and screen out when those features are enabled (LiveKit does full A/V/screen)', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        bridge.SendMedia('video-out', { Track: 'video-out', Bytes: bytes(1) });
        bridge.SendMedia('screen-out', { Track: 'screen-out', Bytes: bytes(2) });
        expect(sdk.PublishedVideo.length).toBe(1);
        expect(sdk.PublishedScreen.length).toBe(1);
    });

    it('does NOT publish video/screen when those directional features are off', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx({ AudioIn: true, AudioOut: true, SpeakerDiarization: true })); // no Video/ScreenOut
        bridge.SendMedia('video-out', { Track: 'video-out', Bytes: bytes(1) });
        bridge.SendMedia('screen-out', { Track: 'screen-out', Bytes: bytes(2) });
        expect(sdk.PublishedVideo.length).toBe(0);
        expect(sdk.PublishedScreen.length).toBe(0);
    });

    it('drops outbound media when not connected', () => {
        const bridge = makeBridge(sdk);
        bridge.SendMedia('audio-out', { Track: 'audio-out', Bytes: bytes(1) });
        expect(sdk.PublishedAudio.length).toBe(0);
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
