/**
 * Tests for `SlackNativeMeetingSdk` — the **two-way** native Slack huddle media binding. Exercises the
 * adapter against a **fake native module** (no addon, no network): the pure native→bridge mappings, the
 * join/auth path, BOTH audio directions (the receive→`SlackAudioFrame` path AND the real
 * `sendAudioFrame`→native huddle-media path), roster + hand-raise + huddle-ended signals, huddle controls
 * (chat/mute) actually reaching the native client, the `BindSlackNative` factory, `readNativeConfig`
 * extraction, and the actionable errors (no specifier / addon absent).
 */
import { describe, it, expect, vi } from 'vitest';
import {
    SlackNativeMeetingSdk,
    BindSlackNative,
    readNativeConfig,
    mapNativeAudioFrame,
    mapNativeParticipant,
    mapNativeRole,
    toArrayBuffer,
    defaultNativeLoader,
    NativeMeetingModule,
    NativeMeetingClient,
    NativeAudioFrame,
    NativeParticipant,
    NativeJoinArgs,
} from '../slack-native-sdk';
import { SlackAudioFrame, SlackJoinArgs, SlackParticipant } from '../slack-sdk';

/** An in-memory {@link NativeMeetingClient} with drive helpers + capture sinks (no addon, no network). */
class FakeNativeClient implements NativeMeetingClient {
    public joined?: NativeJoinArgs;
    public left = false;
    public sentPcm: ArrayBuffer[] = [];
    public chats: string[] = [];
    public muted: Array<string | number> = [];
    public roster: NativeParticipant[] = [];

    private audioCb?: (frame: NativeAudioFrame) => void;
    private joinCb?: (p: NativeParticipant) => void;
    private leaveCb?: (id: string | number) => void;
    private handCb?: (id: string | number, raised: boolean) => void;
    private endedCb?: () => void;

    async join(args: NativeJoinArgs) {
        this.joined = args;
        return { botUserId: 'U-bot', huddleId: args.huddleId ?? `huddle:${args.channelId}` };
    }
    async leave() {
        this.left = true;
    }
    sendAudioFrame(pcm: ArrayBuffer) {
        this.sentPcm.push(pcm);
    }
    onAudioFrame(cb: (frame: NativeAudioFrame) => void) {
        this.audioCb = cb;
    }
    onParticipantJoin(cb: (p: NativeParticipant) => void) {
        this.joinCb = cb;
    }
    onParticipantLeave(cb: (id: string | number) => void) {
        this.leaveCb = cb;
    }
    onHandRaise(cb: (id: string | number, raised: boolean) => void) {
        this.handCb = cb;
    }
    async getParticipants() {
        return this.roster;
    }
    async postChatMessage(text: string) {
        this.chats.push(text);
    }
    async muteParticipant(id: string | number) {
        this.muted.push(id);
    }
    onMeetingEnded(cb: () => void) {
        this.endedCb = cb;
    }

    // ── drive helpers (the "Slack huddle" side) ──
    driveAudio(frame: NativeAudioFrame) {
        this.audioCb?.(frame);
    }
    driveJoin(p: NativeParticipant) {
        this.joinCb?.(p);
    }
    driveLeave(id: string | number) {
        this.leaveCb?.(id);
    }
    driveHand(id: string | number, raised: boolean) {
        this.handCb?.(id, raised);
    }
    driveEnded() {
        this.endedCb?.();
    }
}

/** A fake native module returning a single shared {@link FakeNativeClient}. */
function fakeModule(client: FakeNativeClient): NativeMeetingModule {
    return { createClient: () => client };
}

const baseArgs: SlackJoinArgs = { ChannelId: 'C123', BotDisplayName: 'Agent', BotToken: 'xoxb-tok' };
const cfg = { NativeModuleSpecifier: '@acme/slack-huddle-addon', BotToken: 'xoxb-tok', TeamId: 'T1' };

describe('SlackNativeMeetingSdk — pure mappings', () => {
    it('mapNativeRole normalizes host/cohost/participant', () => {
        expect(mapNativeRole('host')).toBe('Host');
        expect(mapNativeRole('co-host')).toBe('CoHost');
        expect(mapNativeRole('cohost')).toBe('CoHost');
        expect(mapNativeRole('member')).toBe('Participant');
        expect(mapNativeRole(undefined)).toBe('Participant');
    });

    it('mapNativeParticipant coerces numeric ids and maps role + self flag', () => {
        const p: SlackParticipant = mapNativeParticipant({ userId: 42, displayName: 'Dana', role: 'host', isSelf: true });
        expect(p).toEqual({ ParticipantId: '42', DisplayName: 'Dana', Role: 'Host', IsSelf: true });
    });

    it('mapNativeAudioFrame copies PCM, resolves label, defaults timestamp', () => {
        const view = new Uint8Array([1, 2, 3]);
        const frame: SlackAudioFrame = mapNativeAudioFrame({ data: view, userId: 7, displayName: 'Lee', timestampMs: 99 });
        expect(frame.ParticipantId).toBe('7');
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

    it('toArrayBuffer returns a standalone ArrayBuffer as-is', () => {
        const buf = new ArrayBuffer(4);
        expect(toArrayBuffer(buf)).toBe(buf);
    });
});

describe('SlackNativeMeetingSdk — join + two-way audio', () => {
    it('join() loads the addon, joins with the resolved bot token, and returns bot/huddle ids', async () => {
        const client = new FakeNativeClient();
        const sdk = new SlackNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        const result = await sdk.join(baseArgs);
        expect(result).toEqual({ BotParticipantId: 'U-bot', HuddleId: 'huddle:C123' });
        expect(client.joined?.botToken).toBe('xoxb-tok');
        expect(client.joined?.channelId).toBe('C123');
        expect(client.joined?.displayName).toBe('Agent');
        expect(client.joined?.teamId).toBe('T1');
    });

    it('sendAudioFrame forwards the agent voice to the native huddle-media send path', async () => {
        const client = new FakeNativeClient();
        const sdk = new SlackNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        await sdk.join(baseArgs);
        const pcm = new Uint8Array([5, 5, 5]).buffer;
        sdk.sendAudioFrame(pcm);
        expect(client.sentPcm).toHaveLength(1);
        expect(client.sentPcm[0]).toBe(pcm);
    });

    it('sendAudioFrame before join is a safe no-op (no throw)', () => {
        const sdk = new SlackNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(new FakeNativeClient()));
        expect(() => sdk.sendAudioFrame(new ArrayBuffer(2))).not.toThrow();
    });

    it('inbound native audio is mapped to a diarized SlackAudioFrame and delivered to the handler', async () => {
        const client = new FakeNativeClient();
        const sdk = new SlackNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        const heard: SlackAudioFrame[] = [];
        sdk.onAudioFrame((f) => heard.push(f));
        await sdk.join(baseArgs);
        client.driveAudio({ data: new Uint8Array([1, 2]), userId: 'U3', displayName: 'Sam' });
        expect(heard).toHaveLength(1);
        expect(heard[0].ParticipantId).toBe('U3');
        expect(heard[0].DisplayName).toBe('Sam');
    });
});

describe('SlackNativeMeetingSdk — roster, signals, huddle controls', () => {
    it('participant join/leave + hand-raise events map and reach the handlers', async () => {
        const client = new FakeNativeClient();
        const sdk = new SlackNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        const joined: SlackParticipant[] = [];
        const left: string[] = [];
        const hands: Array<[string, boolean]> = [];
        sdk.onParticipantJoin((p) => joined.push(p));
        sdk.onParticipantLeave((id) => left.push(id));
        sdk.onHandRaise((id, raised) => hands.push([id, raised]));
        await sdk.join(baseArgs);

        client.driveJoin({ userId: 'U11', displayName: 'Pat', role: 'cohost' });
        client.driveLeave('U11');
        client.driveHand('U11', true);

        expect(joined[0]).toEqual({ ParticipantId: 'U11', DisplayName: 'Pat', Role: 'CoHost', IsSelf: undefined });
        expect(left).toEqual(['U11']);
        expect(hands).toEqual([['U11', true]]);
    });

    it('getParticipants maps the native roster', async () => {
        const client = new FakeNativeClient();
        client.roster = [{ userId: 'U1', displayName: 'Host', role: 'host', isSelf: false }];
        const sdk = new SlackNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        await sdk.join(baseArgs);
        expect(await sdk.getParticipants()).toEqual([{ ParticipantId: 'U1', DisplayName: 'Host', Role: 'Host', IsSelf: false }]);
    });

    it('getParticipants returns [] before join', async () => {
        const sdk = new SlackNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(new FakeNativeClient()));
        expect(await sdk.getParticipants()).toEqual([]);
    });

    it('postChatMessage + muteParticipant reach the native client (real huddle controls)', async () => {
        const client = new FakeNativeClient();
        const sdk = new SlackNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        await sdk.join(baseArgs);
        await sdk.postChatMessage('hello');
        await sdk.muteParticipant('U11');
        expect(client.chats).toEqual(['hello']);
        expect(client.muted).toEqual(['U11']);
    });

    it('huddle-ended fires the handler; leave() releases the client', async () => {
        const client = new FakeNativeClient();
        const sdk = new SlackNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        const ended = vi.fn();
        sdk.onMeetingEnded(ended);
        await sdk.join(baseArgs);
        client.driveEnded();
        expect(ended).toHaveBeenCalledOnce();
        await sdk.leave();
        expect(client.left).toBe(true);
    });
});

describe('SlackNativeMeetingSdk — config + errors', () => {
    it('readNativeConfig extracts typed fields and ignores unknown keys', () => {
        const out = readNativeConfig({
            BotToken: 'xoxb',
            TeamId: 'T1',
            ChannelId: 'C1',
            HuddleId: 'H1',
            BotDisplayName: 'Bot',
            SampleRate: 16000,
            Channels: 1,
            NativeModuleSpecifier: '@acme/addon',
            Bogus: 123,
        });
        expect(out).toEqual({
            BotToken: 'xoxb',
            TeamId: 'T1',
            ChannelId: 'C1',
            HuddleId: 'H1',
            BotDisplayName: 'Bot',
            SampleRate: 16000,
            Channels: 1,
            NativeModuleSpecifier: '@acme/addon',
        });
    });

    it('readNativeConfig drops non-finite / non-string values', () => {
        const out = readNativeConfig({ SampleRate: NaN, Channels: 'two', BotToken: 42 });
        expect(out.SampleRate).toBeUndefined();
        expect(out.Channels).toBeUndefined();
        expect(out.BotToken).toBeUndefined();
    });

    it('join() throws an actionable error when no NativeModuleSpecifier is configured', async () => {
        const sdk = new SlackNativeMeetingSdk(readNativeConfig({}), async () => fakeModule(new FakeNativeClient()));
        await expect(sdk.join(baseArgs)).rejects.toThrow(/NativeModuleSpecifier/);
    });

    it('defaultNativeLoader throws an actionable error when the addon specifier cannot be resolved', async () => {
        await expect(defaultNativeLoader('@nonexistent/slack-huddle-addon-xyz')).rejects.toThrow(
            /could not load the native huddle media addon/,
        );
    });

    it('BindSlackNative builds a working factory from a loose Configuration map', async () => {
        const client = new FakeNativeClient();
        const factory = BindSlackNative(async () => fakeModule(client));
        const sdk = factory(cfg);
        const result = await sdk.join(baseArgs);
        expect(result.BotParticipantId).toBe('U-bot');
    });
});
