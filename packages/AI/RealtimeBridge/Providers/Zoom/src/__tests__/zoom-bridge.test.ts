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
import { ZoomBridge } from '../zoom-bridge';
import {
    IZoomMeetingSdk,
    ZoomParticipant,
    ZoomAudioFrame,
    ZoomJoinArgs,
    ZoomJoinResult,
} from '../zoom-sdk';

// ──────────────────────────────────────────────────────────────────────────────
// FakeZoomSdk — an in-memory IZoomMeetingSdk with drive helpers and capture sinks.
// No network, no real Zoom SDK.
// ──────────────────────────────────────────────────────────────────────────────

class FakeZoomSdk implements IZoomMeetingSdk {
    public Joined = false;
    public Left = false;
    public LastJoinArgs?: ZoomJoinArgs;
    public readonly SentAudio: ArrayBuffer[] = [];
    public readonly Chats: string[] = [];
    public readonly Muted: string[] = [];

    private participants: ZoomParticipant[] = [];

    private audioCb?: (frame: ZoomAudioFrame) => void;
    private joinCb?: (p: ZoomParticipant) => void;
    private leaveCb?: (id: string) => void;
    private handRaiseCb?: (id: string, raised: boolean) => void;
    private endedCb?: () => void;

    constructor(initialRoster: ZoomParticipant[] = []) {
        this.participants = [...initialRoster];
    }

    public async join(args: ZoomJoinArgs): Promise<ZoomJoinResult> {
        this.Joined = true;
        this.LastJoinArgs = args;
        // The bot becomes a participant on join.
        this.participants.push({ ParticipantId: 'bot-1', DisplayName: args.BotDisplayName, Role: 'Participant', IsSelf: true });
        return { BotParticipantId: 'bot-1', MeetingId: args.MeetingNumber || 'meeting-1' };
    }
    public async leave(): Promise<void> {
        this.Left = true;
    }
    public sendAudioFrame(pcm: ArrayBuffer): void {
        this.SentAudio.push(pcm);
    }
    public onAudioFrame(cb: (frame: ZoomAudioFrame) => void): void {
        this.audioCb = cb;
    }
    public onParticipantJoin(cb: (p: ZoomParticipant) => void): void {
        this.joinCb = cb;
    }
    public onParticipantLeave(cb: (id: string) => void): void {
        this.leaveCb = cb;
    }
    public onHandRaise(cb: (id: string, raised: boolean) => void): void {
        this.handRaiseCb = cb;
    }
    public async getParticipants(): Promise<ZoomParticipant[]> {
        return [...this.participants];
    }
    public async postChatMessage(text: string): Promise<void> {
        this.Chats.push(text);
    }
    public async muteParticipant(participantId: string): Promise<void> {
        this.Muted.push(participantId);
    }
    public onMeetingEnded(cb: () => void): void {
        this.endedCb = cb;
    }

    // ── drive helpers ──
    public DriveInboundAudio(frame: ZoomAudioFrame): void {
        this.audioCb?.(frame);
    }
    public DriveJoin(p: ZoomParticipant): void {
        this.participants.push(p);
        this.joinCb?.(p);
    }
    public DriveLeave(id: string): void {
        this.participants = this.participants.filter((x) => x.ParticipantId !== id);
        this.leaveCb?.(id);
    }
    public DriveHandRaise(id: string, raised: boolean): void {
        this.handRaiseCb?.(id, raised);
    }
    public DriveMeetingEnded(): void {
        this.endedCb?.();
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers.
// ──────────────────────────────────────────────────────────────────────────────

const FULL_FEATURES: MJAIBridgeProviderEntity_IBridgeProviderFeatures = {
    OnDemandJoin: true,
    ScheduledJoin: true,
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
        ProviderName: 'Zoom',
        Address: 'https://zoom.us/j/123456789',
        Configuration: { BotDisplayName: 'Sage' },
        ...overrides,
    };
}

/** Builds a ZoomBridge wired to a FakeZoomSdk via the creation seam. */
function makeBridge(sdk: FakeZoomSdk): ZoomBridge {
    const bridge = new ZoomBridge();
    bridge.SetSdkFactory(() => sdk);
    return bridge;
}

function bytes(...vals: number[]): ArrayBuffer {
    return new Uint8Array(vals).buffer;
}

let sdk: FakeZoomSdk;
beforeEach(() => {
    sdk = new FakeZoomSdk([{ ParticipantId: 'p-alice', DisplayName: 'Alice', Role: 'Host' }]);
});

// ──────────────────────────────────────────────────────────────────────────────
// Connect / Disconnect.
// ──────────────────────────────────────────────────────────────────────────────

describe('ZoomBridge — Connect / Disconnect', () => {
    it('joins the meeting and returns the bot + meeting handles', async () => {
        const bridge = makeBridge(sdk);
        const result = await bridge.Connect(ctx());
        expect(sdk.Joined).toBe(true);
        expect(result.BotParticipantId).toBe('bot-1');
        expect(result.ExternalConnectionId).toBe('123456789'); // parsed from the join URL
        expect(bridge.BotParticipantId).toBe('bot-1');
        expect(sdk.LastJoinArgs?.BotDisplayName).toBe('Sage');
    });

    it('parses a bare meeting number address unchanged', async () => {
        const bridge = makeBridge(sdk);
        const result = await bridge.Connect(ctx(FULL_FEATURES, { Address: '987654321' }));
        expect(result.ExternalConnectionId).toBe('987654321');
    });

    it('leaves the meeting on Disconnect and clears state', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        await bridge.Disconnect('Explicit');
        expect(sdk.Left).toBe(true);
        expect(bridge.BotParticipantId).toBeNull();
    });

    it('throws an explicit error when no SDK factory is bound (real-SDK binding TODO)', async () => {
        const bridge = new ZoomBridge(); // no SetSdkFactory
        await expect(bridge.Connect(ctx())).rejects.toThrow(/no Zoom Meeting SDK bound/i);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Audio in → OnMedia (with speaker labels) and out → seam.
// ──────────────────────────────────────────────────────────────────────────────

describe('ZoomBridge — media', () => {
    it('forwards inbound raw audio to OnMedia with the speaker label', async () => {
        const bridge = makeBridge(sdk);
        const heard: BridgeMediaFrame[] = [];
        bridge.OnMedia((f) => heard.push(f));
        await bridge.Connect(ctx());

        sdk.DriveInboundAudio({ Pcm: bytes(1, 2, 3), ParticipantId: 'p-alice', DisplayName: 'Alice', TimestampMs: 42 });

        expect(heard.length).toBe(1);
        expect(heard[0].Track).toBe('audio-in');
        expect(heard[0].SpeakerLabel).toBe('p-alice');
        expect(new Uint8Array(heard[0].Bytes!)).toEqual(new Uint8Array([1, 2, 3]));
        expect(heard[0].TimestampMs).toBe(42);
    });

    it('sends outbound audio frames to the SDK virtual mic', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        bridge.SendMedia('audio-out', { Track: 'audio-out', Bytes: bytes(9, 9) });
        expect(sdk.SentAudio.length).toBe(1);
        expect(new Uint8Array(sdk.SentAudio[0])).toEqual(new Uint8Array([9, 9]));
    });

    it('decodes a base64 outbound audio frame before sending', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        bridge.SendMedia('audio-out', { Track: 'audio-out', Base64: 'AQID' }); // [1,2,3]
        expect(new Uint8Array(sdk.SentAudio[0])).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('drops outbound audio when not connected', () => {
        const bridge = makeBridge(sdk);
        bridge.SendMedia('audio-out', { Track: 'audio-out', Bytes: bytes(1) });
        expect(sdk.SentAudio.length).toBe(0);
    });

    it('does not send video/screen-out audio (no-op until the SDK send binding lands)', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        bridge.SendMedia('video-out', { Track: 'video-out', Bytes: bytes(1) });
        bridge.SendMedia('screen-out', { Track: 'screen-out', Bytes: bytes(2) });
        expect(sdk.SentAudio.length).toBe(0);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Participants / roster (capability-gated by SpeakerDiarization).
// ──────────────────────────────────────────────────────────────────────────────

describe('ZoomBridge — participants', () => {
    it('GetParticipants maps the Zoom roster to BridgeParticipantInfo (bot flagged as Agent)', async () => {
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

        sdk.DriveJoin({ ParticipantId: 'p-bob', DisplayName: 'Bob', Role: 'Participant' });
        await new Promise((r) => setTimeout(r, 0));
        sdk.DriveLeave('p-alice');
        await new Promise((r) => setTimeout(r, 0));

        // Roster started at 2 (alice + bot), +bob = 3, then -alice = 2.
        expect(snapshots).toContain(3);
        expect(snapshots[snapshots.length - 1]).toBe(2);
    });

    it('a meeting-ended signal surfaces an empty roster', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        let last: number | null = null;
        bridge.OnParticipantChange((p) => (last = p.length));
        sdk.DriveMeetingEnded();
        expect(last).toBe(0);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Meeting Controls event source — hand-raise → channel perception path.
// ──────────────────────────────────────────────────────────────────────────────

describe('ZoomBridge — Meeting Controls event source', () => {
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
        // OnRosterChange emits the current (seeded) roster immediately.
        expect(roster.find((p) => p.ParticipantId === 'p-alice')).toBeDefined();
    });

    it('a native hand-raise reaches the Meeting Controls hand-raise handler', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const source = bridge.GetMeetingControlsEventSource()!;
        const events: Array<{ id: string; raised: boolean }> = [];
        source.OnHandRaiseChange((id, raised) => events.push({ id, raised }));

        sdk.DriveHandRaise('p-alice', true);
        sdk.DriveHandRaise('p-alice', false);

        expect(events).toEqual([
            { id: 'p-alice', raised: true },
            { id: 'p-alice', raised: false },
        ]);
    });

    it('updates the Meeting Controls roster on join/leave', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const source = bridge.GetMeetingControlsEventSource()!;
        let roster: BridgeMeetingParticipant[] = [];
        source.OnRosterChange((p) => (roster = p));

        sdk.DriveJoin({ ParticipantId: 'p-carol', DisplayName: 'Carol', Role: 'Participant' });
        await new Promise((r) => setTimeout(r, 0)); // roster refresh is async (re-pulls the SDK roster)
        expect(roster.find((p) => p.ParticipantId === 'p-carol')).toBeDefined();

        sdk.DriveLeave('p-carol');
        await new Promise((r) => setTimeout(r, 0));
        expect(roster.find((p) => p.ParticipantId === 'p-carol')).toBeUndefined();
    });

    it('actuates mute through the SDK and forwards diarized speaking changes', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const source = bridge.GetMeetingControlsEventSource()!;
        let speaking: string[] = [];
        source.OnSpeakingChange((ids) => (speaking = ids));

        await source.MuteParticipant('p-alice');
        expect(sdk.Muted).toContain('p-alice');

        source.NotifySpeaking(['p-alice']);
        expect(speaking).toEqual(['p-alice']);
    });

    it('contributes NO Meeting Controls source when diarization is off', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx({ AudioIn: true, AudioOut: true })); // no SpeakerDiarization
        expect(bridge.GetMeetingControlsEventSource()).toBeNull();
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Chat.
// ──────────────────────────────────────────────────────────────────────────────

describe('ZoomBridge — chat', () => {
    it('posts a chat message through the SDK', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        await bridge.PostChatMessage('I can add some context here.');
        expect(sdk.Chats).toContain('I can add some context here.');
    });

    it('PostChatMessage is a no-op (no throw) when not connected', async () => {
        const bridge = makeBridge(sdk);
        await expect(bridge.PostChatMessage('hi')).resolves.toBeUndefined();
        expect(sdk.Chats.length).toBe(0);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Capability gating — a feature Zoom lacks throws.
// ──────────────────────────────────────────────────────────────────────────────

describe('ZoomBridge — capability gating', () => {
    it('throws BridgeCapabilityNotSupportedError for telephony DTMF (a feature Zoom lacks)', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        await expect(bridge.SendDTMF('123#')).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });

    it('throws for TransferCall and StartRecording (not Zoom-meeting features here)', async () => {
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

    it('Connect requires AudioIn + AudioOut (a Zoom meeting bridge minimum)', async () => {
        const bridge = makeBridge(sdk);
        await expect(bridge.Connect(ctx({ AudioIn: true }))).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });
});
