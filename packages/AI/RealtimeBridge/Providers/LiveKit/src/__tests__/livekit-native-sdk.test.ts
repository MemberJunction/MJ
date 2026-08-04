/**
 * Tests for `LiveKitNativeMeetingSdk` — the **two-way** native LiveKit Node room SDK binding. Exercises
 * the adapter against a **fake native module** (no SDK, no network): the pure native→seam mappings, the
 * connect/auth path, BOTH audio directions (the subscribe→`LiveKitAudioFrame` path AND the real
 * `publishAudioFrame`→native publish path), video/screen publish, roster + participant join/leave +
 * room-disconnected signals, the data-channel chat reaching the native client, the `BindLiveKitNative`
 * factory, `readNativeConfig` extraction, and the actionable errors (no specifier / module absent).
 */
import { describe, it, expect, vi } from 'vitest';
import {
    LiveKitNativeMeetingSdk,
    BindLiveKitNative,
    readNativeConfig,
    mapNativeAudioFrame,
    mapNativeParticipant,
    mapNativeRole,
    toArrayBuffer,
    defaultNativeLoader,
    NativeRoomModule,
    NativeRoomClient,
    NativeRoomAudioFrame,
    NativeRoomParticipant,
    NativeConnectArgs,
} from '../livekit-native-sdk';
import { LiveKitAudioFrame, LiveKitConnectArgs, LiveKitParticipant } from '../livekit-sdk';

/** An in-memory {@link NativeRoomClient} with drive helpers + capture sinks (no SDK, no network). */
class FakeNativeClient implements NativeRoomClient {
    public connected?: NativeConnectArgs;
    public disconnectedFlag = false;
    public publishedAudio: ArrayBuffer[] = [];
    public publishedVideo: ArrayBuffer[] = [];
    public publishedScreen: ArrayBuffer[] = [];
    public data: string[] = [];
    public roster: NativeRoomParticipant[] = [];

    private audioCb?: (frame: NativeRoomAudioFrame) => void;
    private joinCb?: (p: NativeRoomParticipant) => void;
    private leaveCb?: (id: string) => void;
    private disconnectedCb?: () => void;

    async connect(args: NativeConnectArgs) {
        this.connected = args;
        return { localIdentity: 'bot-1', roomName: 'mj-room' };
    }
    async disconnect() {
        this.disconnectedFlag = true;
    }
    publishAudio(pcm: ArrayBuffer) {
        this.publishedAudio.push(pcm);
    }
    publishVideo(frame: ArrayBuffer) {
        this.publishedVideo.push(frame);
    }
    publishScreen(frame: ArrayBuffer) {
        this.publishedScreen.push(frame);
    }
    onAudioFrame(cb: (frame: NativeRoomAudioFrame) => void) {
        this.audioCb = cb;
    }
    onParticipantConnected(cb: (p: NativeRoomParticipant) => void) {
        this.joinCb = cb;
    }
    onParticipantDisconnected(cb: (id: string) => void) {
        this.leaveCb = cb;
    }
    async getParticipants() {
        return this.roster;
    }
    async publishData(text: string) {
        this.data.push(text);
    }
    onDisconnected(cb: () => void) {
        this.disconnectedCb = cb;
    }

    // ── drive helpers (the "LiveKit" side) ──
    driveAudio(frame: NativeRoomAudioFrame) {
        this.audioCb?.(frame);
    }
    driveJoin(p: NativeRoomParticipant) {
        this.joinCb?.(p);
    }
    driveLeave(id: string) {
        this.leaveCb?.(id);
    }
    driveDisconnected() {
        this.disconnectedCb?.();
    }
}

/** A fake native module returning a single shared {@link FakeNativeClient}. */
function fakeModule(client: FakeNativeClient): NativeRoomModule {
    return { createRoomClient: () => client };
}

const baseArgs: LiveKitConnectArgs = {
    RoomUrl: 'wss://livekit.myorg.com',
    AccessToken: 'signed-token',
    BotDisplayName: 'Agent',
};
const cfg = { NativeModuleSpecifier: '@acme/livekit-room', ApiKey: 'k', ApiSecret: 's', Url: 'wss://livekit.myorg.com' };

describe('LiveKitNativeMeetingSdk — pure mappings', () => {
    it('mapNativeRole normalizes host/cohost/participant', () => {
        expect(mapNativeRole('host')).toBe('Host');
        expect(mapNativeRole('co-host')).toBe('CoHost');
        expect(mapNativeRole('cohost')).toBe('CoHost');
        expect(mapNativeRole('attendee')).toBe('Participant');
        expect(mapNativeRole(undefined)).toBe('Participant');
    });

    it('mapNativeParticipant maps identity, name, role + local flag', () => {
        const p: LiveKitParticipant = mapNativeParticipant({ identity: 'u-42', name: 'Dana', role: 'host', isLocal: true });
        expect(p).toEqual({ Identity: 'u-42', DisplayName: 'Dana', Role: 'Host', IsLocal: true });
    });

    it('mapNativeAudioFrame copies PCM, resolves label, defaults timestamp', () => {
        const view = new Uint8Array([1, 2, 3]);
        const frame: LiveKitAudioFrame = mapNativeAudioFrame({ data: view, participantIdentity: 'u-7', name: 'Lee', timestampMs: 99 });
        expect(frame.ParticipantIdentity).toBe('u-7');
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

    it('toArrayBuffer returns an ArrayBuffer input unchanged', () => {
        const buf = new Uint8Array([1, 2]).buffer;
        expect(toArrayBuffer(buf)).toBe(buf);
    });
});

describe('LiveKitNativeMeetingSdk — connect + two-way audio', () => {
    it('connect() loads the module, connects with the resolved token, and returns bot/room ids', async () => {
        const client = new FakeNativeClient();
        const sdk = new LiveKitNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        const result = await sdk.connect(baseArgs);
        expect(result).toEqual({ BotIdentity: 'bot-1', RoomName: 'mj-room' });
        expect(client.connected?.token).toBe('signed-token');
        expect(client.connected?.name).toBe('Agent');
        expect(client.connected?.url).toBe('wss://livekit.myorg.com');
    });

    it('publishAudioFrame forwards the agent voice to the native publish path (real outbound)', async () => {
        const client = new FakeNativeClient();
        const sdk = new LiveKitNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        await sdk.connect(baseArgs);
        const pcm = new Uint8Array([5, 5, 5]).buffer;
        sdk.publishAudioFrame(pcm);
        expect(client.publishedAudio).toHaveLength(1);
        expect(client.publishedAudio[0]).toBe(pcm);
    });

    it('publishVideoFrame + publishScreenFrame forward to the native publish path', async () => {
        const client = new FakeNativeClient();
        const sdk = new LiveKitNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        await sdk.connect(baseArgs);
        const vid = new Uint8Array([1]).buffer;
        const scr = new Uint8Array([2]).buffer;
        sdk.publishVideoFrame(vid);
        sdk.publishScreenFrame(scr);
        expect(client.publishedVideo).toEqual([vid]);
        expect(client.publishedScreen).toEqual([scr]);
    });

    it('publishAudioFrame before connect is a safe no-op (no throw)', () => {
        const sdk = new LiveKitNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(new FakeNativeClient()));
        expect(() => sdk.publishAudioFrame(new ArrayBuffer(2))).not.toThrow();
    });

    it('inbound native audio is mapped to a diarized LiveKitAudioFrame and delivered to the handler', async () => {
        const client = new FakeNativeClient();
        const sdk = new LiveKitNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        const heard: LiveKitAudioFrame[] = [];
        sdk.onAudioTrack((f) => heard.push(f));
        await sdk.connect(baseArgs);
        client.driveAudio({ data: new Uint8Array([1, 2]), participantIdentity: 'u-3', name: 'Sam' });
        expect(heard).toHaveLength(1);
        expect(heard[0].ParticipantIdentity).toBe('u-3');
        expect(heard[0].DisplayName).toBe('Sam');
    });
});

describe('LiveKitNativeMeetingSdk — roster, signals, data channel', () => {
    it('participant join/leave events map and reach the handlers', async () => {
        const client = new FakeNativeClient();
        const sdk = new LiveKitNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        const joined: LiveKitParticipant[] = [];
        const left: string[] = [];
        sdk.onParticipantJoin((p) => joined.push(p));
        sdk.onParticipantLeave((id) => left.push(id));
        await sdk.connect(baseArgs);

        client.driveJoin({ identity: 'u-11', name: 'Pat', role: 'cohost' });
        client.driveLeave('u-11');

        expect(joined[0]).toEqual({ Identity: 'u-11', DisplayName: 'Pat', Role: 'CoHost', IsLocal: undefined });
        expect(left).toEqual(['u-11']);
    });

    it('getParticipants maps the native roster', async () => {
        const client = new FakeNativeClient();
        client.roster = [{ identity: 'u-1', name: 'Host', role: 'host', isLocal: false }];
        const sdk = new LiveKitNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        await sdk.connect(baseArgs);
        expect(await sdk.getParticipants()).toEqual([{ Identity: 'u-1', DisplayName: 'Host', Role: 'Host', IsLocal: false }]);
    });

    it('getParticipants before connect returns an empty roster', async () => {
        const sdk = new LiveKitNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(new FakeNativeClient()));
        expect(await sdk.getParticipants()).toEqual([]);
    });

    it('sendDataMessage reaches the native client (room-native chat)', async () => {
        const client = new FakeNativeClient();
        const sdk = new LiveKitNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        await sdk.connect(baseArgs);
        await sdk.sendDataMessage('hello');
        expect(client.data).toEqual(['hello']);
    });

    it('room-disconnected fires the handler; disconnect() releases the client', async () => {
        const client = new FakeNativeClient();
        const sdk = new LiveKitNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        const onDc = vi.fn();
        sdk.onDisconnected(onDc);
        await sdk.connect(baseArgs);
        client.driveDisconnected();
        expect(onDc).toHaveBeenCalledOnce();
        await sdk.disconnect();
        expect(client.disconnectedFlag).toBe(true);
    });
});

describe('LiveKitNativeMeetingSdk — config + errors', () => {
    it('readNativeConfig extracts typed fields and ignores wrong types', () => {
        const out = readNativeConfig({
            Url: 'wss://x',
            ApiKey: 'k',
            ApiSecret: 's',
            AccessToken: 'tok',
            BotDisplayName: 'Bot',
            NativeModuleSpecifier: '@acme/room',
            Bogus: 123,
        });
        expect(out).toEqual({
            Url: 'wss://x',
            ApiKey: 'k',
            ApiSecret: 's',
            AccessToken: 'tok',
            BotDisplayName: 'Bot',
            NativeModuleSpecifier: '@acme/room',
        });
    });

    it('readNativeConfig drops non-string values and empty strings', () => {
        const out = readNativeConfig({ ApiKey: 42, ApiSecret: '', Url: null });
        expect(out.ApiKey).toBeUndefined();
        expect(out.ApiSecret).toBeUndefined();
        expect(out.Url).toBeUndefined();
    });

    it('connect() throws an actionable error when no NativeModuleSpecifier is configured', async () => {
        const sdk = new LiveKitNativeMeetingSdk(readNativeConfig({}), async () => fakeModule(new FakeNativeClient()));
        await expect(sdk.connect(baseArgs)).rejects.toThrow(/NativeModuleSpecifier/);
    });

    it('defaultNativeLoader throws an actionable error when the module specifier cannot be resolved', async () => {
        await expect(defaultNativeLoader('@nonexistent/livekit-room-xyz')).rejects.toThrow(
            /could not load the native LiveKit room module/,
        );
    });

    it('BindLiveKitNative builds a working factory from a loose Configuration map', async () => {
        const client = new FakeNativeClient();
        const factory = BindLiveKitNative(async () => fakeModule(client));
        const sdk = factory(cfg);
        const result = await sdk.connect(baseArgs);
        expect(result.BotIdentity).toBe('bot-1');
    });
});
