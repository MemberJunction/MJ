/**
 * Tests for `DiscordNativeMeetingSdk` — the **two-way** native Discord voice-addon binding. Exercises the
 * adapter against a **fake native module** (no addon, no network): the pure native→bridge mappings, the
 * join/auth path, BOTH audio directions (the receive→`DiscordAudioFrame` path AND the real
 * `sendAudioFrame`→native audio-player send path), roster (member join/leave + getMembers), member controls
 * (chat/mute) actually reaching the native client, the disconnect signal + leave(), the `BindDiscordNative`
 * factory, `readNativeConfig` extraction, and the actionable errors (no specifier / addon absent).
 *
 * Discord is voice-CHANNEL based: there is no hand-raise and no meeting-ended signal (see `discord-sdk.ts`),
 * so — unlike the Zoom native tests — those paths are intentionally absent here; the lifecycle-ending signal
 * is `onDisconnect`.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    DiscordNativeMeetingSdk,
    BindDiscordNative,
    readNativeConfig,
    mapNativeAudioFrame,
    mapNativeMember,
    mapNativeRole,
    toArrayBuffer,
    defaultNativeLoader,
    NativeMeetingModule,
    NativeVoiceClient,
    NativeVoiceAudioFrame,
    NativeVoiceMember,
    NativeVoiceJoinArgs,
} from '../discord-native-sdk';
import { DiscordAudioFrame, DiscordJoinArgs, DiscordMember } from '../discord-sdk';

/** An in-memory {@link NativeVoiceClient} with drive helpers + capture sinks (no addon, no network). */
class FakeNativeClient implements NativeVoiceClient {
    public joined?: NativeVoiceJoinArgs;
    public left = false;
    public sentPcm: ArrayBuffer[] = [];
    public chats: string[] = [];
    public muted: Array<string | number> = [];
    public roster: NativeVoiceMember[] = [];

    private audioCb?: (frame: NativeVoiceAudioFrame) => void;
    private joinCb?: (m: NativeVoiceMember) => void;
    private leaveCb?: (id: string | number) => void;
    private disconnectCb?: () => void;

    async joinVoiceChannel(args: NativeVoiceJoinArgs) {
        this.joined = args;
        return { botUserId: 'bot-1', voiceChannelId: args.voiceChannelId };
    }
    async leaveVoiceChannel() {
        this.left = true;
    }
    sendAudioFrame(pcm: ArrayBuffer) {
        this.sentPcm.push(pcm);
    }
    onAudioFrame(cb: (frame: NativeVoiceAudioFrame) => void) {
        this.audioCb = cb;
    }
    onMemberJoin(cb: (m: NativeVoiceMember) => void) {
        this.joinCb = cb;
    }
    onMemberLeave(cb: (id: string | number) => void) {
        this.leaveCb = cb;
    }
    async getMembers() {
        return this.roster;
    }
    async postChatMessage(text: string) {
        this.chats.push(text);
    }
    async muteMember(id: string | number) {
        this.muted.push(id);
    }
    onDisconnect(cb: () => void) {
        this.disconnectCb = cb;
    }

    // ── drive helpers (the "Discord" side) ──
    driveAudio(frame: NativeVoiceAudioFrame) {
        this.audioCb?.(frame);
    }
    driveJoin(m: NativeVoiceMember) {
        this.joinCb?.(m);
    }
    driveLeave(id: string | number) {
        this.leaveCb?.(id);
    }
    driveDisconnect() {
        this.disconnectCb?.();
    }
}

/** A fake native module returning a single shared {@link FakeNativeClient}. */
function fakeModule(client: FakeNativeClient): NativeMeetingModule {
    return { createClient: () => client };
}

const baseArgs: DiscordJoinArgs = {
    GuildId: '123456789',
    VoiceChannelId: '987654321',
    BotDisplayName: 'Agent',
    BotToken: 'tok-123',
};
const cfg = { NativeModuleSpecifier: '@acme/discord-native-addon', BotToken: 'tok-cfg', ApplicationId: 'app-1' };

describe('DiscordNativeMeetingSdk — pure mappings', () => {
    it('mapNativeRole normalizes host/owner/admin → Host, moderator → CoHost, else Participant', () => {
        expect(mapNativeRole('host')).toBe('Host');
        expect(mapNativeRole('owner')).toBe('Host');
        expect(mapNativeRole('admin')).toBe('Host');
        expect(mapNativeRole('moderator')).toBe('CoHost');
        expect(mapNativeRole('co-host')).toBe('CoHost');
        expect(mapNativeRole('member')).toBe('Participant');
        expect(mapNativeRole(undefined)).toBe('Participant');
    });

    it('mapNativeMember coerces numeric ids and maps role + self flag', () => {
        const m: DiscordMember = mapNativeMember({ userId: 42, displayName: 'Dana', role: 'owner', isSelf: true });
        expect(m).toEqual({ UserId: '42', DisplayName: 'Dana', Role: 'Host', IsSelf: true });
    });

    it('mapNativeAudioFrame copies PCM, resolves label, defaults timestamp', () => {
        const view = new Uint8Array([1, 2, 3]);
        const frame: DiscordAudioFrame = mapNativeAudioFrame({ data: view, userId: 7, displayName: 'Lee', timestampMs: 99 });
        expect(frame.UserId).toBe('7');
        expect(frame.DisplayName).toBe('Lee');
        expect(frame.TimestampMs).toBe(99);
        expect(new Uint8Array(frame.Pcm)).toEqual(view); // copied, equal bytes
    });

    it('toArrayBuffer copies a Uint8Array view (not aliasing the underlying buffer window)', () => {
        const backing = new Uint8Array([9, 8, 7, 6]).buffer;
        const view = new Uint8Array(backing, 1, 2); // [8,7]
        const out = toArrayBuffer(view);
        expect(out.byteLength).toBe(2);
        expect(new Uint8Array(out)).toEqual(new Uint8Array([8, 7]));
    });

    it('toArrayBuffer copies a standalone ArrayBuffer (no aliasing)', () => {
        const src = new Uint8Array([4, 5]).buffer;
        const out = toArrayBuffer(src);
        expect(out).not.toBe(src);
        expect(new Uint8Array(out)).toEqual(new Uint8Array([4, 5]));
    });
});

describe('DiscordNativeMeetingSdk — join + two-way audio', () => {
    it('joinVoiceChannel() loads the addon, joins with the resolved token, and returns bot/channel ids', async () => {
        const client = new FakeNativeClient();
        const sdk = new DiscordNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        const result = await sdk.joinVoiceChannel(baseArgs);
        expect(result).toEqual({ BotUserId: 'bot-1', VoiceChannelId: '987654321' });
        expect(client.joined?.botToken).toBe('tok-123');
        expect(client.joined?.displayName).toBe('Agent');
        expect(client.joined?.guildId).toBe('123456789');
    });

    it('sendAudioFrame forwards the agent voice to the native audio-player send path', async () => {
        const client = new FakeNativeClient();
        const sdk = new DiscordNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        await sdk.joinVoiceChannel(baseArgs);
        const pcm = new Uint8Array([5, 5, 5]).buffer;
        sdk.sendAudioFrame(pcm);
        expect(client.sentPcm).toHaveLength(1);
        expect(client.sentPcm[0]).toBe(pcm);
    });

    it('sendAudioFrame before join is a safe no-op (no throw)', () => {
        const sdk = new DiscordNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(new FakeNativeClient()));
        expect(() => sdk.sendAudioFrame(new ArrayBuffer(2))).not.toThrow();
    });

    it('inbound native audio is mapped to a diarized DiscordAudioFrame and delivered to the handler', async () => {
        const client = new FakeNativeClient();
        const sdk = new DiscordNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        const heard: DiscordAudioFrame[] = [];
        sdk.onAudioFrame((f) => heard.push(f));
        await sdk.joinVoiceChannel(baseArgs);
        client.driveAudio({ data: new Uint8Array([1, 2]), userId: 3, displayName: 'Sam' });
        expect(heard).toHaveLength(1);
        expect(heard[0].UserId).toBe('3');
        expect(heard[0].DisplayName).toBe('Sam');
    });
});

describe('DiscordNativeMeetingSdk — roster, signals, member controls', () => {
    it('member join/leave events map and reach the handlers', async () => {
        const client = new FakeNativeClient();
        const sdk = new DiscordNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        const joined: DiscordMember[] = [];
        const left: string[] = [];
        sdk.onMemberJoin((m) => joined.push(m));
        sdk.onMemberLeave((id) => left.push(id));
        await sdk.joinVoiceChannel(baseArgs);

        client.driveJoin({ userId: 11, displayName: 'Pat', role: 'moderator' });
        client.driveLeave(11);

        expect(joined[0]).toEqual({ UserId: '11', DisplayName: 'Pat', Role: 'CoHost', IsSelf: undefined });
        expect(left).toEqual(['11']);
    });

    it('getMembers maps the native roster', async () => {
        const client = new FakeNativeClient();
        client.roster = [{ userId: 1, displayName: 'Owner', role: 'owner', isSelf: false }];
        const sdk = new DiscordNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        await sdk.joinVoiceChannel(baseArgs);
        expect(await sdk.getMembers()).toEqual([{ UserId: '1', DisplayName: 'Owner', Role: 'Host', IsSelf: false }]);
    });

    it('getMembers before join returns an empty roster', async () => {
        const sdk = new DiscordNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(new FakeNativeClient()));
        expect(await sdk.getMembers()).toEqual([]);
    });

    it('postChatMessage + muteMember reach the native client (real member controls)', async () => {
        const client = new FakeNativeClient();
        const sdk = new DiscordNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        await sdk.joinVoiceChannel(baseArgs);
        await sdk.postChatMessage('hello');
        await sdk.muteMember('11');
        expect(client.chats).toEqual(['hello']);
        expect(client.muted).toEqual(['11']);
    });

    it('disconnect fires the handler; leaveVoiceChannel() releases the client', async () => {
        const client = new FakeNativeClient();
        const sdk = new DiscordNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        const dropped = vi.fn();
        sdk.onDisconnect(dropped);
        await sdk.joinVoiceChannel(baseArgs);
        client.driveDisconnect();
        expect(dropped).toHaveBeenCalledOnce();
        await sdk.leaveVoiceChannel();
        expect(client.left).toBe(true);
    });
});

describe('DiscordNativeMeetingSdk — config + errors', () => {
    it('readNativeConfig extracts typed fields and ignores wrong types', () => {
        const out = readNativeConfig({
            BotToken: 'tok',
            ApplicationId: 'app',
            BotDisplayName: 'Bot',
            SampleRate: 48000,
            Channels: 2,
            NativeModuleSpecifier: '@acme/addon',
            Bogus: 123,
        });
        expect(out).toEqual({
            BotToken: 'tok',
            ApplicationId: 'app',
            BotDisplayName: 'Bot',
            SampleRate: 48000,
            Channels: 2,
            NativeModuleSpecifier: '@acme/addon',
        });
    });

    it('readNativeConfig drops non-finite / non-string values', () => {
        const out = readNativeConfig({ SampleRate: NaN, Channels: 'two', BotToken: 42 });
        expect(out.SampleRate).toBeUndefined();
        expect(out.Channels).toBeUndefined();
        expect(out.BotToken).toBeUndefined();
    });

    it('joinVoiceChannel() throws an actionable error when no NativeModuleSpecifier is configured', async () => {
        const sdk = new DiscordNativeMeetingSdk(readNativeConfig({}), async () => fakeModule(new FakeNativeClient()));
        await expect(sdk.joinVoiceChannel(baseArgs)).rejects.toThrow(/NativeModuleSpecifier/);
    });

    it('defaultNativeLoader throws an actionable error when the addon specifier cannot be resolved', async () => {
        await expect(defaultNativeLoader('@nonexistent/discord-native-addon-xyz')).rejects.toThrow(
            /could not load the native Discord voice addon/,
        );
    });

    it('BindDiscordNative builds a working factory from a loose Configuration map', async () => {
        const client = new FakeNativeClient();
        const factory = BindDiscordNative(async () => fakeModule(client));
        const sdk = factory(cfg);
        const result = await sdk.joinVoiceChannel(baseArgs);
        expect(result.BotUserId).toBe('bot-1');
    });
});
