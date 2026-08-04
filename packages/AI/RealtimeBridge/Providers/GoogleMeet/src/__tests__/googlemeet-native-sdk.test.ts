/**
 * Tests for `GoogleMeetNativeMeetingSdk` — the **two-way** native Google Meet media bot binding. Exercises
 * the adapter against a **fake native module** (no addon, no network): the pure native→seam mappings, the
 * join/auth path, BOTH audio directions (the receive→`GoogleMeetAudioFrame` path AND the real
 * `sendAudioFrame`→native audio-contribution path), roster + participant join/leave + hand-raise (the
 * Meet-native surface) + meeting-ended signals, host controls (mute) actually reaching the native client,
 * the `BindGoogleMeetNative` factory, `readNativeConfig` extraction, and the actionable errors (no
 * specifier / addon absent).
 */
import { describe, it, expect, vi } from 'vitest';
import {
    GoogleMeetNativeMeetingSdk,
    BindGoogleMeetNative,
    readNativeConfig,
    mapNativeAudioFrame,
    mapNativeParticipant,
    mapNativeRole,
    toArrayBuffer,
    defaultNativeLoader,
    NativeMeetingModule,
    NativeMeetClient,
    NativeMeetAudioFrame,
    NativeMeetParticipant,
    NativeMeetJoinArgs,
} from '../googlemeet-native-sdk';
import { GoogleMeetAudioFrame, GoogleMeetJoinArgs, GoogleMeetParticipant } from '../googlemeet-sdk';

/** An in-memory {@link NativeMeetClient} with drive helpers + capture sinks (no addon, no network). */
class FakeNativeClient implements NativeMeetClient {
    public joined?: NativeMeetJoinArgs;
    public left = false;
    public sentPcm: ArrayBuffer[] = [];
    public muted: Array<string | number> = [];
    public roster: NativeMeetParticipant[] = [];

    private audioCb?: (frame: NativeMeetAudioFrame) => void;
    private joinCb?: (p: NativeMeetParticipant) => void;
    private leaveCb?: (id: string | number) => void;
    private handCb?: (id: string | number, raised: boolean) => void;
    private endedCb?: () => void;

    async join(args: NativeMeetJoinArgs) {
        this.joined = args;
        return { botParticipantId: 'bot-1', meetingId: args.meetingCode };
    }
    async leave() {
        this.left = true;
    }
    sendAudioFrame(pcm: ArrayBuffer) {
        this.sentPcm.push(pcm);
    }
    onAudioFrame(cb: (frame: NativeMeetAudioFrame) => void) {
        this.audioCb = cb;
    }
    onParticipantJoin(cb: (p: NativeMeetParticipant) => void) {
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
    async muteParticipant(id: string | number) {
        this.muted.push(id);
    }
    onMeetingEnded(cb: () => void) {
        this.endedCb = cb;
    }

    // ── drive helpers (the "Meet" side) ──
    driveAudio(frame: NativeMeetAudioFrame) {
        this.audioCb?.(frame);
    }
    driveJoin(p: NativeMeetParticipant) {
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

const baseArgs: GoogleMeetJoinArgs = { MeetingCode: 'abc-defg-hij', BotDisplayName: 'Agent', AccessToken: 'tok' };
const cfg = { NativeModuleSpecifier: '@acme/meet-native-addon', ProjectId: 'proj', AccessToken: 'tok' };

describe('GoogleMeetNativeMeetingSdk — pure mappings', () => {
    it('mapNativeRole normalizes host/cohost/participant', () => {
        expect(mapNativeRole('host')).toBe('Host');
        expect(mapNativeRole('co-host')).toBe('CoHost');
        expect(mapNativeRole('cohost')).toBe('CoHost');
        expect(mapNativeRole('attendee')).toBe('Participant');
        expect(mapNativeRole(undefined)).toBe('Participant');
    });

    it('mapNativeParticipant coerces numeric ids and maps role + self flag', () => {
        const p: GoogleMeetParticipant = mapNativeParticipant({
            participantId: 42,
            displayName: 'Dana',
            role: 'host',
            isSelf: true,
        });
        expect(p).toEqual({ ParticipantId: '42', DisplayName: 'Dana', Role: 'Host', IsSelf: true });
    });

    it('mapNativeAudioFrame copies PCM, resolves label, defaults timestamp', () => {
        const view = new Uint8Array([1, 2, 3]);
        const frame: GoogleMeetAudioFrame = mapNativeAudioFrame({
            data: view,
            participantId: 7,
            displayName: 'Lee',
            timestampMs: 99,
        });
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
});

describe('GoogleMeetNativeMeetingSdk — join + two-way audio', () => {
    it('join() loads the addon, joins with the resolved access token, and returns bot/meeting ids', async () => {
        const client = new FakeNativeClient();
        const sdk = new GoogleMeetNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        const result = await sdk.join(baseArgs);
        expect(result).toEqual({ BotParticipantId: 'bot-1', MeetingId: 'abc-defg-hij' });
        expect(client.joined?.accessToken).toBe('tok');
        expect(client.joined?.displayName).toBe('Agent');
    });

    it('sendAudioFrame forwards the agent voice to the native audio-contribution path', async () => {
        const client = new FakeNativeClient();
        const sdk = new GoogleMeetNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        await sdk.join(baseArgs);
        const pcm = new Uint8Array([5, 5, 5]).buffer;
        sdk.sendAudioFrame(pcm);
        expect(client.sentPcm).toHaveLength(1);
        expect(client.sentPcm[0]).toBe(pcm);
    });

    it('sendAudioFrame before join is a safe no-op (no throw)', () => {
        const sdk = new GoogleMeetNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(new FakeNativeClient()));
        expect(() => sdk.sendAudioFrame(new ArrayBuffer(2))).not.toThrow();
    });

    it('inbound native audio is mapped to a diarized GoogleMeetAudioFrame and delivered to the handler', async () => {
        const client = new FakeNativeClient();
        const sdk = new GoogleMeetNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        const heard: GoogleMeetAudioFrame[] = [];
        sdk.onAudioFrame((f) => heard.push(f));
        await sdk.join(baseArgs);
        client.driveAudio({ data: new Uint8Array([1, 2]), participantId: 3, displayName: 'Sam' });
        expect(heard).toHaveLength(1);
        expect(heard[0].ParticipantId).toBe('3');
        expect(heard[0].DisplayName).toBe('Sam');
    });
});

describe('GoogleMeetNativeMeetingSdk — roster, signals, host controls', () => {
    it('participant join/leave + hand-raise events map and reach the handlers', async () => {
        const client = new FakeNativeClient();
        const sdk = new GoogleMeetNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        const joined: GoogleMeetParticipant[] = [];
        const left: string[] = [];
        const hands: Array<[string, boolean]> = [];
        sdk.onParticipantJoin((p) => joined.push(p));
        sdk.onParticipantLeave((id) => left.push(id));
        sdk.onHandRaise((id, raised) => hands.push([id, raised]));
        await sdk.join(baseArgs);

        client.driveJoin({ participantId: 11, displayName: 'Pat', role: 'cohost' });
        client.driveLeave(11);
        client.driveHand(11, true);

        expect(joined[0]).toEqual({ ParticipantId: '11', DisplayName: 'Pat', Role: 'CoHost', IsSelf: undefined });
        expect(left).toEqual(['11']);
        expect(hands).toEqual([['11', true]]);
    });

    it('getParticipants maps the native roster', async () => {
        const client = new FakeNativeClient();
        client.roster = [{ participantId: 1, displayName: 'Host', role: 'host', isSelf: false }];
        const sdk = new GoogleMeetNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        await sdk.join(baseArgs);
        expect(await sdk.getParticipants()).toEqual([
            { ParticipantId: '1', DisplayName: 'Host', Role: 'Host', IsSelf: false },
        ]);
    });

    it('muteParticipant reaches the native client (real host control)', async () => {
        const client = new FakeNativeClient();
        const sdk = new GoogleMeetNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        await sdk.join(baseArgs);
        await sdk.muteParticipant('11');
        expect(client.muted).toEqual(['11']);
    });

    it('meeting-ended fires the handler; leave() releases the client', async () => {
        const client = new FakeNativeClient();
        const sdk = new GoogleMeetNativeMeetingSdk(readNativeConfig(cfg), async () => fakeModule(client));
        const ended = vi.fn();
        sdk.onMeetingEnded(ended);
        await sdk.join(baseArgs);
        client.driveEnded();
        expect(ended).toHaveBeenCalledOnce();
        await sdk.leave();
        expect(client.left).toBe(true);
    });
});

describe('GoogleMeetNativeMeetingSdk — config + errors', () => {
    it('readNativeConfig extracts typed fields and ignores wrong types', () => {
        const out = readNativeConfig({
            ProjectId: 'proj',
            AccessToken: 'tok',
            BotDisplayName: 'Bot',
            SampleRate: 16000,
            Channels: 1,
            NativeModuleSpecifier: '@acme/addon',
            Bogus: 123,
        });
        expect(out).toEqual({
            ProjectId: 'proj',
            AccessToken: 'tok',
            BotDisplayName: 'Bot',
            SampleRate: 16000,
            Channels: 1,
            NativeModuleSpecifier: '@acme/addon',
        });
    });

    it('readNativeConfig drops non-finite / non-string values', () => {
        const out = readNativeConfig({ SampleRate: NaN, Channels: 'two', ProjectId: 42 });
        expect(out.SampleRate).toBeUndefined();
        expect(out.Channels).toBeUndefined();
        expect(out.ProjectId).toBeUndefined();
    });

    it('join() throws an actionable error when no NativeModuleSpecifier is configured', async () => {
        const sdk = new GoogleMeetNativeMeetingSdk(readNativeConfig({}), async () => fakeModule(new FakeNativeClient()));
        await expect(sdk.join(baseArgs)).rejects.toThrow(/NativeModuleSpecifier/);
    });

    it('defaultNativeLoader throws an actionable error when the addon specifier cannot be resolved', async () => {
        await expect(defaultNativeLoader('@nonexistent/meet-native-addon-xyz')).rejects.toThrow(
            /could not load the native Meet media bot addon/,
        );
    });

    it('BindGoogleMeetNative builds a working factory from a loose Configuration map', async () => {
        const client = new FakeNativeClient();
        const factory = BindGoogleMeetNative(async () => fakeModule(client));
        const sdk = factory(cfg);
        const result = await sdk.join(baseArgs);
        expect(result.BotParticipantId).toBe('bot-1');
    });
});
