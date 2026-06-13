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
import { SlackBridge } from '../slack-bridge';
import {
    ISlackHuddleSdk,
    SlackParticipant,
    SlackAudioFrame,
    SlackJoinArgs,
    SlackJoinResult,
} from '../slack-sdk';

// ──────────────────────────────────────────────────────────────────────────────
// FakeSlackHuddleSdk — an in-memory ISlackHuddleSdk with drive helpers and capture
// sinks. No network, no real Slack / Chime SDK.
//
// NOTE: this fake stands in for the gating-unknown huddle MEDIA path (see the
// REAL-API RISK in slack-sdk.ts). It exists so the driver can be fully exercised
// today, ahead of any verified production media binding.
// ──────────────────────────────────────────────────────────────────────────────

class FakeSlackHuddleSdk implements ISlackHuddleSdk {
    public Joined = false;
    public Left = false;
    public LastJoinArgs?: SlackJoinArgs;
    public readonly SentAudio: ArrayBuffer[] = [];
    public readonly Chats: string[] = [];
    public readonly Muted: string[] = [];

    private participants: SlackParticipant[] = [];

    private audioCb?: (frame: SlackAudioFrame) => void;
    private joinCb?: (p: SlackParticipant) => void;
    private leaveCb?: (id: string) => void;
    private handRaiseCb?: (id: string, raised: boolean) => void;
    private endedCb?: () => void;

    constructor(initialRoster: SlackParticipant[] = []) {
        this.participants = [...initialRoster];
    }

    public async join(args: SlackJoinArgs): Promise<SlackJoinResult> {
        this.Joined = true;
        this.LastJoinArgs = args;
        // The bot becomes a participant on join.
        this.participants.push({ ParticipantId: 'bot-1', DisplayName: args.BotDisplayName, Role: 'Participant', IsSelf: true });
        return { BotParticipantId: 'bot-1', HuddleId: args.HuddleId || `huddle-${args.ChannelId || 'x'}` };
    }
    public async leave(): Promise<void> {
        this.Left = true;
    }
    public sendAudioFrame(pcm: ArrayBuffer): void {
        this.SentAudio.push(pcm);
    }
    public onAudioFrame(cb: (frame: SlackAudioFrame) => void): void {
        this.audioCb = cb;
    }
    public onParticipantJoin(cb: (p: SlackParticipant) => void): void {
        this.joinCb = cb;
    }
    public onParticipantLeave(cb: (id: string) => void): void {
        this.leaveCb = cb;
    }
    public onHandRaise(cb: (id: string, raised: boolean) => void): void {
        this.handRaiseCb = cb;
    }
    public async getParticipants(): Promise<SlackParticipant[]> {
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
    public DriveInboundAudio(frame: SlackAudioFrame): void {
        this.audioCb?.(frame);
    }
    public DriveJoin(p: SlackParticipant): void {
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
    InviteJoin: true,
    InboundRouting: true,
    AudioIn: true,
    AudioOut: true,
    VideoIn: true,
    VideoOut: true,
    ScreenIn: true,
    ScreenOut: true,
    SpeakerDiarization: true,
};

const SLACK_HUDDLE_URL = 'https://app.slack.com/client/T0ABCDEF/C0HUDDLE1';

function ctx(
    features: MJAIBridgeProviderEntity_IBridgeProviderFeatures = FULL_FEATURES,
    overrides: Partial<RealtimeBridgeContext> = {},
): RealtimeBridgeContext {
    return {
        Features: features,
        ProviderName: 'Slack',
        Address: SLACK_HUDDLE_URL,
        Configuration: { BotDisplayName: 'Sage' },
        ...overrides,
    };
}

/** Builds a SlackBridge wired to a FakeSlackHuddleSdk via the creation seam. */
function makeBridge(sdk: FakeSlackHuddleSdk): SlackBridge {
    const bridge = new SlackBridge();
    bridge.SetSdkFactory(() => sdk);
    return bridge;
}

function bytes(...vals: number[]): ArrayBuffer {
    return new Uint8Array(vals).buffer;
}

let sdk: FakeSlackHuddleSdk;
beforeEach(() => {
    sdk = new FakeSlackHuddleSdk([{ ParticipantId: 'p-alice', DisplayName: 'Alice', Role: 'Host' }]);
});

// ──────────────────────────────────────────────────────────────────────────────
// Connect / Disconnect.
// ──────────────────────────────────────────────────────────────────────────────

describe('SlackBridge — Connect / Disconnect', () => {
    it('joins the huddle and returns the bot + huddle handles', async () => {
        const bridge = makeBridge(sdk);
        const result = await bridge.Connect(ctx());
        expect(sdk.Joined).toBe(true);
        expect(result.BotParticipantId).toBe('bot-1');
        // The HuddleId derives from the channel id parsed out of the huddle link.
        expect(result.ExternalConnectionId).toBe('huddle-C0HUDDLE1');
        expect(bridge.BotParticipantId).toBe('bot-1');
        expect(sdk.LastJoinArgs?.BotDisplayName).toBe('Sage');
    });

    it('parses the channel id out of a Slack huddle link', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        expect(sdk.LastJoinArgs?.ChannelId).toBe('C0HUDDLE1');
    });

    it('parses a Slack archives link channel id', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx(FULL_FEATURES, { Address: 'https://acme.slack.com/archives/C0ARCHIV' }));
        expect(sdk.LastJoinArgs?.ChannelId).toBe('C0ARCHIV');
    });

    it('passes a bare channel id address through unchanged', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx(FULL_FEATURES, { Address: 'C0BARECH' }));
        expect(sdk.LastJoinArgs?.ChannelId).toBe('C0BARECH');
    });

    it('prefers an explicit HuddleId from configuration when supplied', async () => {
        const bridge = makeBridge(sdk);
        const result = await bridge.Connect(
            ctx(FULL_FEATURES, { Configuration: { BotDisplayName: 'Sage', HuddleId: 'huddle-explicit' } }),
        );
        expect(sdk.LastJoinArgs?.HuddleId).toBe('huddle-explicit');
        expect(result.ExternalConnectionId).toBe('huddle-explicit');
    });

    it('leaves the huddle on Disconnect and clears state', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        await bridge.Disconnect('Explicit');
        expect(sdk.Left).toBe(true);
        expect(bridge.BotParticipantId).toBeNull();
    });

    it('throws an explicit error when no SDK factory is bound (real-SDK binding TODO / huddle-media risk)', async () => {
        const bridge = new SlackBridge(); // no SetSdkFactory
        // The error names the huddle media path as a genuine API-availability risk, not just a binding TODO.
        await expect(bridge.Connect(ctx())).rejects.toThrow(/no Slack huddle SDK bound/i);
        await expect(bridge.Connect(ctx())).rejects.toThrow(/media path/i);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Audio in → OnMedia (with speaker labels) and out → seam.
// (⚠️ media subset depends on the gating-unknown huddle media path — see slack-sdk.ts)
// ──────────────────────────────────────────────────────────────────────────────

describe('SlackBridge — media', () => {
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

    it('sends outbound audio frames to the SDK huddle media path', async () => {
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
// Participants / roster (capability-gated by SpeakerDiarization, ⚠️ on Slack).
// ──────────────────────────────────────────────────────────────────────────────

describe('SlackBridge — participants', () => {
    it('GetParticipants maps the Slack roster to BridgeParticipantInfo (starter→Host, bot→Agent)', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const roster = await bridge.GetParticipants();
        const alice = roster.find((p) => p.ExternalId === 'p-alice');
        const bot = roster.find((p) => p.ExternalId === 'bot-1');
        expect(alice).toMatchObject({ DisplayName: 'Alice', Role: 'Host', IsAgent: false });
        expect(bot).toMatchObject({ Role: 'Agent', IsAgent: true });
    });

    it('maps a co-host participant to CoHost', async () => {
        sdk = new FakeSlackHuddleSdk([{ ParticipantId: 'p-pat', DisplayName: 'Pat', Role: 'CoHost' }]);
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const roster = await bridge.GetParticipants();
        expect(roster.find((p) => p.ExternalId === 'p-pat')).toMatchObject({ Role: 'CoHost' });
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

    it('a huddle-ended signal surfaces an empty roster', async () => {
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

describe('SlackBridge — Meeting Controls event source', () => {
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

    it('a native (partial) hand-raise reaches the Meeting Controls hand-raise handler', async () => {
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
// Chat (Slack huddle / thread chat).
// ──────────────────────────────────────────────────────────────────────────────

describe('SlackBridge — chat', () => {
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
// Capability gating — a feature Slack lacks throws; features Slack advertises pass.
// ──────────────────────────────────────────────────────────────────────────────

describe('SlackBridge — capability gating', () => {
    it('throws BridgeCapabilityNotSupportedError for telephony DTMF (a feature Slack lacks)', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        await expect(bridge.SendDTMF('123#')).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });

    it('throws for TransferCall and StartRecording (not Slack-huddle features here)', async () => {
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

    it('Connect requires AudioIn + AudioOut (a Slack huddle bridge minimum)', async () => {
        const bridge = makeBridge(sdk);
        await expect(bridge.Connect(ctx({ AudioIn: true }))).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });

    it('exposes the Slack feature set (invite + inbound-routing join, full AV) on Features', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        // Slack advertises invite/inbound-routing join (⚠️ in the seed) on top of on-demand/scheduled,
        // plus full audio/video/screen in+out and diarization. Confirm the flags propagate through.
        expect(bridge.Features.InviteJoin).toBe(true);
        expect(bridge.Features.InboundRouting).toBe(true);
        expect(bridge.Features.VideoIn).toBe(true);
        expect(bridge.Features.ScreenOut).toBe(true);
        expect(bridge.Features.SpeakerDiarization).toBe(true);
    });
});
