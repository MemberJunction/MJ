import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach } from 'vitest';
import type {
    MJAIBridgeProviderEntity_IBridgeProviderFeatures,
} from '@memberjunction/core-entities';
import {
    RealtimeBridgeContext,
    BridgeMediaFrame,
    BridgeMediaTrackKind,
    BridgeCapabilityNotSupportedError,
    BridgeMeetingParticipant,
} from '@memberjunction/ai-bridge-base';
import { DISCORD_BRIDGE_DRIVER_CLASS, DiscordBridge } from '../discord-bridge';
import {
    IDiscordVoiceSdk,
    DiscordMember,
    DiscordAudioFrame,
    DiscordJoinArgs,
    DiscordJoinResult,
} from '../discord-sdk';

// ──────────────────────────────────────────────────────────────────────────────
// FakeDiscordVoiceSdk — an in-memory IDiscordVoiceSdk with drive helpers and
// capture sinks. No network, no real Discord client.
//
// Mirrors FakeZoomSdk MINUS hand-raise (Discord voice channels surface no
// hand-raise signal, so IDiscordVoiceSdk has no onHandRaise) but KEEPS chat
// (postChatMessage — Discord text channels). Voice-CHANNEL based: joinVoiceChannel
// takes a guild + channel id, not a meeting number / invite.
// ──────────────────────────────────────────────────────────────────────────────

class FakeDiscordVoiceSdk implements IDiscordVoiceSdk {
    public Joined = false;
    public Left = false;
    public LastJoinArgs?: DiscordJoinArgs;
    public readonly SentAudio: ArrayBuffer[] = [];
    public readonly Muted: string[] = [];
    public readonly Chats: string[] = [];

    private members: DiscordMember[] = [];

    private audioCb?: (frame: DiscordAudioFrame) => void;
    private joinCb?: (m: DiscordMember) => void;
    private leaveCb?: (id: string) => void;
    private disconnectCb?: () => void;

    constructor(initialRoster: DiscordMember[] = []) {
        this.members = [...initialRoster];
    }

    public async joinVoiceChannel(args: DiscordJoinArgs): Promise<DiscordJoinResult> {
        this.Joined = true;
        this.LastJoinArgs = args;
        // The bot becomes a member on join.
        this.members.push({ UserId: 'bot-1', DisplayName: args.BotDisplayName, Role: 'Participant', IsSelf: true });
        return { BotUserId: 'bot-1', VoiceChannelId: args.VoiceChannelId || 'channel-1' };
    }
    public async leaveVoiceChannel(): Promise<void> {
        this.Left = true;
    }
    public sendAudioFrame(pcm: ArrayBuffer): void {
        this.SentAudio.push(pcm);
    }
    public onAudioFrame(cb: (frame: DiscordAudioFrame) => void): void {
        this.audioCb = cb;
    }
    public onMemberJoin(cb: (m: DiscordMember) => void): void {
        this.joinCb = cb;
    }
    public onMemberLeave(cb: (id: string) => void): void {
        this.leaveCb = cb;
    }
    public async getMembers(): Promise<DiscordMember[]> {
        return [...this.members];
    }
    public async postChatMessage(text: string): Promise<void> {
        this.Chats.push(text);
    }
    public async muteMember(userId: string): Promise<void> {
        this.Muted.push(userId);
    }
    public onDisconnect(cb: () => void): void {
        this.disconnectCb = cb;
    }

    // ── drive helpers ──
    public DriveInboundAudio(frame: DiscordAudioFrame): void {
        this.audioCb?.(frame);
    }
    public DriveJoin(m: DiscordMember): void {
        this.members.push(m);
        this.joinCb?.(m);
    }
    public DriveLeave(id: string): void {
        this.members = this.members.filter((x) => x.UserId !== id);
        this.leaveCb?.(id);
    }
    public DriveDisconnect(): void {
        this.disconnectCb?.();
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * The Discord row's `SupportedFeatures` as `metadata/` ships it, and the default for these tests: on-demand + inbound
 * routing, audio in+out, diarization. Notably NO ScheduledJoin, NO InviteJoin, NO NativeInvite (Discord is voice-channel
 * based), and no video or screen ("Go Live") flags: the SDK seam carries audio only. "The provider row metadata ships"
 * below checks this against the seed file.
 */
const DISCORD_ROW_FEATURES: MJAIBridgeProviderEntity_IBridgeProviderFeatures = {
    OnDemandJoin: true,
    InboundRouting: true,
    AudioIn: true,
    AudioOut: true,
    SpeakerDiarization: true,
};

function ctx(
    features: MJAIBridgeProviderEntity_IBridgeProviderFeatures = DISCORD_ROW_FEATURES,
    overrides: Partial<RealtimeBridgeContext> = {},
): RealtimeBridgeContext {
    return {
        Features: features,
        ProviderName: 'Discord',
        Address: 'https://discord.com/channels/111222333/444555666',
        Configuration: { BotDisplayName: 'Sage' },
        ...overrides,
    };
}

/** Builds a DiscordBridge wired to a FakeDiscordVoiceSdk via the creation seam. */
function makeBridge(sdk: FakeDiscordVoiceSdk): DiscordBridge {
    const bridge = new DiscordBridge();
    bridge.SetSdkFactory(() => sdk);
    return bridge;
}

function bytes(...vals: number[]): ArrayBuffer {
    return new Uint8Array(vals).buffer;
}

/** Each media track and the `SupportedFeatures` flag that claims it. */
const MEDIA_TRACK_FLAGS = [
    ['audio-in', 'AudioIn'],
    ['audio-out', 'AudioOut'],
    ['video-in', 'VideoIn'],
    ['video-out', 'VideoOut'],
    ['screen-in', 'ScreenIn'],
    ['screen-out', 'ScreenOut'],
] as const satisfies ReadonlyArray<readonly [BridgeMediaTrackKind, keyof MJAIBridgeProviderEntity_IBridgeProviderFeatures]>;

/** The repository's `metadata/` folder, from this file's folder (`packages/AI/RealtimeBridge/Providers/Discord/src/__tests__`). */
const METADATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../../../metadata');

/** The part of a `metadata/ai-bridge-providers` record these tests read. */
interface BridgeProviderSeedRecord {
    fields?: {
        DriverClass?: string;
        /** A native JSON object in the seed file; an escaped JSON string is also valid metadata. */
        SupportedFeatures?: string | MJAIBridgeProviderEntity_IBridgeProviderFeatures | null;
    };
}

/**
 * The `SupportedFeatures` of the `MJ: AI Bridge Providers` row that `metadata/` ships for this driver, found by its
 * `DriverClass` (the key the engine resolves the driver by). Read from the seed file, since it is the source of the row.
 */
function seededDiscordRowFeatures(): MJAIBridgeProviderEntity_IBridgeProviderFeatures {
    const records = JSON.parse(
        readFileSync(resolve(METADATA_DIR, 'ai-bridge-providers/.ai-bridge-providers.json'), 'utf8'),
    ) as BridgeProviderSeedRecord[];
    const rows = records.filter((record) => record.fields?.DriverClass === DISCORD_BRIDGE_DRIVER_CLASS);
    if (rows.length !== 1) {
        throw new Error(`metadata/ai-bridge-providers ships ${rows.length} rows with DriverClass ${DISCORD_BRIDGE_DRIVER_CLASS}, not 1`);
    }
    const raw = rows[0].fields?.SupportedFeatures;
    if (raw == null) {
        return {};
    }
    return typeof raw === 'string' ? (JSON.parse(raw) as MJAIBridgeProviderEntity_IBridgeProviderFeatures) : raw;
}

/** The flags a features object turns on, sorted. An omitted flag and `false` both mean the feature is off. */
function enabledFlags(features: MJAIBridgeProviderEntity_IBridgeProviderFeatures): string[] {
    return Object.entries(features)
        .filter(([, on]) => on === true)
        .map(([flag]) => flag)
        .sort();
}

let sdk: FakeDiscordVoiceSdk;
beforeEach(() => {
    sdk = new FakeDiscordVoiceSdk([{ UserId: 'u-alice', DisplayName: 'Alice', Role: 'Host' }]);
});

// ──────────────────────────────────────────────────────────────────────────────
// Connect / Disconnect.
// ──────────────────────────────────────────────────────────────────────────────

describe('DiscordBridge — Connect / Disconnect', () => {
    it('joins the voice channel and returns the bot + channel handles', async () => {
        const bridge = makeBridge(sdk);
        const result = await bridge.Connect(ctx());
        expect(sdk.Joined).toBe(true);
        expect(result.BotParticipantId).toBe('bot-1');
        expect(result.ExternalConnectionId).toBe('444555666'); // channel id parsed from the URL
        expect(bridge.BotParticipantId).toBe('bot-1');
        expect(sdk.LastJoinArgs?.BotDisplayName).toBe('Sage');
        expect(sdk.LastJoinArgs?.GuildId).toBe('111222333'); // guild id parsed from the URL
    });

    it('parses a bare guild/channel pair address', async () => {
        const bridge = makeBridge(sdk);
        const result = await bridge.Connect(ctx(DISCORD_ROW_FEATURES, { Address: '777/888' }));
        expect(result.ExternalConnectionId).toBe('888');
        expect(sdk.LastJoinArgs?.GuildId).toBe('777');
    });

    it('parses a bare channel id with the guild sourced from config', async () => {
        const bridge = makeBridge(sdk);
        const result = await bridge.Connect(
            ctx(DISCORD_ROW_FEATURES, { Address: '999', Configuration: { BotDisplayName: 'Sage', GuildId: 'guild-x' } }),
        );
        expect(result.ExternalConnectionId).toBe('999');
        expect(sdk.LastJoinArgs?.GuildId).toBe('guild-x');
    });

    it('leaves the voice channel on Disconnect and clears state', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        await bridge.Disconnect('Explicit');
        expect(sdk.Left).toBe(true);
        expect(bridge.BotParticipantId).toBeNull();
    });

    it('throws an explicit error when no SDK factory is bound (real-SDK binding TODO)', async () => {
        const bridge = new DiscordBridge(); // no SetSdkFactory
        await expect(bridge.Connect(ctx())).rejects.toThrow(/no Discord voice SDK bound/i);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Audio in → OnMedia (with speaker labels) and out → seam.
// ──────────────────────────────────────────────────────────────────────────────

describe('DiscordBridge — media', () => {
    it('forwards inbound raw per-user audio to OnMedia with the speaker label', async () => {
        const bridge = makeBridge(sdk);
        const heard: BridgeMediaFrame[] = [];
        bridge.OnMedia((f) => heard.push(f));
        await bridge.Connect(ctx());

        sdk.DriveInboundAudio({ Pcm: bytes(1, 2, 3), UserId: 'u-alice', DisplayName: 'Alice', TimestampMs: 42 });

        expect(heard.length).toBe(1);
        expect(heard[0].Track).toBe('audio-in');
        expect(heard[0].SpeakerLabel).toBe('u-alice');
        expect(new Uint8Array(heard[0].Bytes!)).toEqual(new Uint8Array([1, 2, 3]));
        expect(heard[0].TimestampMs).toBe(42);
    });

    it('sends outbound audio frames to the SDK audio-player path', async () => {
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

    it('does not send video/screen-out audio (no-op until the Go Live send binding lands)', async () => {
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

describe('DiscordBridge — participants', () => {
    it('GetParticipants maps the Discord roster to BridgeParticipantInfo (bot flagged as Agent)', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const roster = await bridge.GetParticipants();
        const alice = roster.find((p) => p.ExternalId === 'u-alice');
        const bot = roster.find((p) => p.ExternalId === 'bot-1');
        expect(alice).toMatchObject({ DisplayName: 'Alice', Role: 'Host', IsAgent: false });
        expect(bot).toMatchObject({ Role: 'Agent', IsAgent: true });
    });

    it('OnParticipantChange fires the full roster on a join and a leave', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const snapshots: number[] = [];
        bridge.OnParticipantChange((p) => snapshots.push(p.length));

        sdk.DriveJoin({ UserId: 'u-bob', DisplayName: 'Bob', Role: 'Participant' });
        await new Promise((r) => setTimeout(r, 0));
        sdk.DriveLeave('u-alice');
        await new Promise((r) => setTimeout(r, 0));

        // Roster started at 2 (alice + bot), +bob = 3, then -alice = 2.
        expect(snapshots).toContain(3);
        expect(snapshots[snapshots.length - 1]).toBe(2);
    });

    it('a disconnect signal surfaces an empty roster', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        let last: number | null = null;
        bridge.OnParticipantChange((p) => (last = p.length));
        sdk.DriveDisconnect();
        expect(last).toBe(0);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Chat — Discord text channels ARE programmatically postable (unlike Google Meet).
// ──────────────────────────────────────────────────────────────────────────────

describe('DiscordBridge — chat', () => {
    it('posts a chat message through the SDK (Discord has a text channel)', async () => {
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
// Meeting Controls event source — roster / speaking / mute.
// ──────────────────────────────────────────────────────────────────────────────

describe('DiscordBridge — Meeting Controls event source', () => {
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
        expect(roster.find((p) => p.ParticipantId === 'u-alice')).toBeDefined();
    });

    it('updates the Meeting Controls roster on join/leave', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const source = bridge.GetMeetingControlsEventSource()!;
        let roster: BridgeMeetingParticipant[] = [];
        source.OnRosterChange((p) => (roster = p));

        sdk.DriveJoin({ UserId: 'u-carol', DisplayName: 'Carol', Role: 'Participant' });
        await new Promise((r) => setTimeout(r, 0)); // roster refresh is async (re-pulls the SDK roster)
        expect(roster.find((p) => p.ParticipantId === 'u-carol')).toBeDefined();

        sdk.DriveLeave('u-carol');
        await new Promise((r) => setTimeout(r, 0));
        expect(roster.find((p) => p.ParticipantId === 'u-carol')).toBeUndefined();
    });

    it('actuates mute through the SDK and forwards diarized speaking changes', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const source = bridge.GetMeetingControlsEventSource()!;
        let speaking: string[] = [];
        source.OnSpeakingChange((ids) => (speaking = ids));

        await source.MuteParticipant('u-alice');
        expect(sdk.Muted).toContain('u-alice');

        source.NotifySpeaking(['u-alice']);
        expect(speaking).toEqual(['u-alice']);
    });

    it('contributes NO Meeting Controls source when diarization is off', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx({ OnDemandJoin: true, AudioIn: true, AudioOut: true })); // no SpeakerDiarization
        expect(bridge.GetMeetingControlsEventSource()).toBeNull();
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Hand-raise & scheduled/invite are ABSENT for Discord (➖) — voice channels
// surface no hand-raise, and Discord is voice-CHANNEL based (no scheduled/invite
// join). These tests pin that down, distinguishing Discord from Zoom.
// ──────────────────────────────────────────────────────────────────────────────

describe('DiscordBridge — hand-raise & scheduled/invite correctly absent', () => {
    it('the IDiscordVoiceSdk seam exposes NO onHandRaise operation', () => {
        // Compile-time guarantee is in the interface; assert at runtime the fake has no such method, so a
        // future regression that re-adds the op (and wires it) is caught.
        expect((sdk as unknown as Record<string, unknown>).onHandRaise).toBeUndefined();
    });

    it('OnHandRaiseChange can be registered but is never invoked (no platform signal)', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        const source = bridge.GetMeetingControlsEventSource()!;

        const events: Array<{ id: string; raised: boolean }> = [];
        // The channel contract requires this registration; for Discord it must be a safe no-op.
        source.OnHandRaiseChange((id, raised) => events.push({ id, raised }));

        // Drive everything Discord *does* surface — roster churn, speaking, mute, chat. NONE of it may
        // synthesize a hand-raise event, because the platform has no such signal.
        sdk.DriveJoin({ UserId: 'u-dan', DisplayName: 'Dan', Role: 'Participant' });
        await new Promise((r) => setTimeout(r, 0));
        source.NotifySpeaking(['u-dan']);
        await source.MuteParticipant('u-dan');
        await bridge.PostChatMessage('hello');
        sdk.DriveLeave('u-dan');
        await new Promise((r) => setTimeout(r, 0));

        expect(events).toEqual([]); // hand-raise path is inert on Discord
    });

    it('the seam exposes channel-based join only (no scheduled/invite/native-invite surface)', () => {
        // Discord is voice-CHANNEL based: the only join op is joinVoiceChannel(guild, channel). Assert the
        // fake (and thus the seam) carries none of Zoom's meeting/invite-shaped operations.
        const seam = sdk as unknown as Record<string, unknown>;
        expect(typeof seam.joinVoiceChannel).toBe('function');
        expect(seam.scheduleJoin).toBeUndefined();
        expect(seam.joinByInvite).toBeUndefined();
        expect(seam.sendNativeInvite).toBeUndefined();
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Capability gating — a feature Discord lacks throws.
// ──────────────────────────────────────────────────────────────────────────────

describe('DiscordBridge — capability gating', () => {
    it('throws BridgeCapabilityNotSupportedError for telephony DTMF (a feature Discord lacks)', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        await expect(bridge.SendDTMF('123#')).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });

    it('throws for TransferCall and StartRecording (not Discord features here)', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx());
        await expect(bridge.TransferCall('+15555550123')).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
        await expect(bridge.StartRecording()).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });

    it('GetParticipants throws when diarization is disabled (defense-in-depth re-assert)', async () => {
        const bridge = makeBridge(sdk);
        await bridge.Connect(ctx({ OnDemandJoin: true, AudioIn: true, AudioOut: true })); // no SpeakerDiarization
        await expect(bridge.GetParticipants()).rejects.toBeInstanceOf(BridgeCapabilityNotSupportedError);
    });

    it('Connect requires AudioIn + AudioOut (a Discord voice bridge minimum)', async () => {
        const bridge = makeBridge(sdk);
        await expect(bridge.Connect(ctx({ OnDemandJoin: true, AudioIn: true }))).rejects.toBeInstanceOf(
            BridgeCapabilityNotSupportedError,
        );
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// The provider row metadata ships. The engine, the provider form and the realtime dashboard read its flags, so they must
// say what the driver does (#5447).
// ──────────────────────────────────────────────────────────────────────────────

describe('DiscordBridge — the provider row metadata ships', () => {
    it('claims exactly the flags these tests connect with: on-demand join, inbound routing, audio in and out, and diarization', () => {
        expect(enabledFlags(seededDiscordRowFeatures())).toEqual(enabledFlags(DISCORD_ROW_FEATURES));
    });

    it("with the row's flags, the bot carries exactly the media tracks the row claims: audio in and out, no video or screen", async () => {
        const features = seededDiscordRowFeatures();
        const bridge = makeBridge(sdk);
        const heard: BridgeMediaFrame[] = [];
        bridge.OnMedia((f) => heard.push(f));
        await bridge.Connect(ctx(features));

        // What the SDK seam can bring in (it has no video or screen callback), and a frame on every outbound track (the
        // engine forwards whatever video a session emits on video-out).
        sdk.DriveInboundAudio({ Pcm: bytes(1), UserId: 'u-alice', DisplayName: 'Alice' });
        bridge.SendMedia('audio-out', { Track: 'audio-out', Bytes: bytes(2) });
        bridge.SendMedia('video-out', { Track: 'video-out', Bytes: bytes(3), MimeType: 'video/mp4' });
        bridge.SendMedia('screen-out', { Track: 'screen-out', Bytes: bytes(4) });

        // The tracks the bot carried: what reached the agent, and what reached the voice channel (the seam's only send is
        // audio, so anything it sent was audio-out).
        const carried = new Set<BridgeMediaTrackKind>(heard.map((f) => f.Track));
        if (sdk.SentAudio.length > 0) {
            carried.add('audio-out');
        }
        const claimed = MEDIA_TRACK_FLAGS.filter(([, flag]) => features[flag] === true).map(([track]) => track);
        expect(claimed, 'the row must claim the media tracks the bot carries, and only those').toEqual(
            MEDIA_TRACK_FLAGS.map(([track]) => track).filter((track) => carried.has(track)),
        );
        // Only the audio frame reached the voice channel; the video and screen frames went nowhere.
        expect(sdk.SentAudio.map((pcm) => [...new Uint8Array(pcm)])).toEqual([[2]]);
        // The row's SpeakerDiarization: inbound audio carries the speaker, and the roster is readable.
        expect(heard.map((f) => f.SpeakerLabel)).toEqual(['u-alice']);
        expect((await bridge.GetParticipants()).map((p) => p.ExternalId)).toContain('u-alice');
    });
});
