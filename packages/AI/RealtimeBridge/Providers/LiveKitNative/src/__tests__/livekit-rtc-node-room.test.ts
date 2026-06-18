/**
 * Tests for the real `@livekit/rtc-node` room wrapper — exercised against a **fake `@livekit/rtc-node`
 * module** (no native addon, no network). Covers the pure PCM helpers, the connect→publish-track flow,
 * BOTH audio directions (outbound `captureFrame` at the right rate + inbound `AudioStream`→diarized frame),
 * participant connect/disconnect events, roster, data-channel publish, disconnect teardown, the
 * sample-rate overrides, the video/screen no-ops, and the actionable error when the addon is absent.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    CreateLiveKitRtcNodeModule,
    LiveKitRtcNodeRoomClient,
    defaultRtcNodeLoader,
    pcmToInt16,
    int16ToArrayBuffer,
    participantsToArray,
    DEFAULT_SAMPLE_RATE,
    RtcNodeModule,
    RtcAudioFrame,
    RtcParticipant,
    RtcTrack,
} from '../livekit-rtc-node-room';
import type { NativeRoomAudioFrame, NativeConnectArgs } from '@memberjunction/ai-bridge-livekit';

// ── A fake @livekit/rtc-node ──────────────────────────────────────────────────

const ROOM_EVENT = {
    TrackSubscribed: 'trackSubscribed',
    ParticipantConnected: 'participantConnected',
    ParticipantDisconnected: 'participantDisconnected',
    Disconnected: 'disconnected',
};
const TRACK_KIND = { KIND_AUDIO: 1, KIND_VIDEO: 2 };

/** Records every captured outbound frame + every AudioStream rate request. */
class Capture {
    public captured: RtcAudioFrame[] = [];
    public audioSourceRates: Array<[number, number]> = [];
    public audioStreamRates: Array<[number, number]> = [];
    public publishedTrackNames: string[] = [];
    public publishedData: Uint8Array[] = [];
    public disconnected = false;
}

/** A fake async audio stream that yields the queued frames once, then ends. */
function fakeAudioStream(frames: RtcAudioFrame[]): AsyncIterable<RtcAudioFrame> & { close?: () => void } {
    return {
        close: vi.fn(),
        async *[Symbol.asyncIterator]() {
            for (const f of frames) {
                yield f;
            }
        },
    };
}

/** Builds a fake module + a handle to drive room events and inspect captures. */
function makeFakeRtc(remote: RtcParticipant[] = []): {
    module: RtcNodeModule;
    cap: Capture;
    emit: (event: string, ...args: unknown[]) => void;
    inboundFramesFor: (frames: RtcAudioFrame[]) => void;
} {
    const cap = new Capture();
    const listeners = new Map<string, ((...args: never[]) => void)[]>();
    let queuedInbound: RtcAudioFrame[] = [];

    const localParticipant = {
        identity: 'agent-bot',
        publishTrack: vi.fn(async (_t: unknown, opts?: Record<string, unknown>) => {
            cap.publishedTrackNames.push(String(opts?.name ?? ''));
            return {};
        }),
        publishData: vi.fn(async (payload: Uint8Array) => {
            cap.publishedData.push(payload);
        }),
    };

    const room = {
        name: 'demo-room',
        localParticipant,
        remoteParticipants: remote,
        connect: vi.fn(async () => undefined),
        disconnect: vi.fn(async () => {
            cap.disconnected = true;
        }),
        on: (event: string, listener: (...args: never[]) => void) => {
            const arr = listeners.get(event) ?? [];
            arr.push(listener);
            listeners.set(event, arr);
        },
    };

    // Constructors must be REAL functions (newable) — vitest's vi.fn(arrow) is not a constructor. Each
    // returns an object, so `new` yields that object; captures go to the shared Capture.
    function FakeRoom(this: unknown): RtcRoom {
        return room;
    }
    function FakeAudioSource(this: unknown, rate: number, ch: number): RtcAudioSource {
        cap.audioSourceRates.push([rate, ch]);
        return { captureFrame: async (f: RtcAudioFrame) => { cap.captured.push(f); } };
    }
    function FakeAudioFrame(this: unknown, data: Int16Array, sampleRate: number, channels: number, samplesPerChannel: number): RtcAudioFrame {
        return { data, sampleRate, channels, samplesPerChannel };
    }
    function FakeAudioStream(this: unknown, _track: RtcTrack, rate?: number, ch?: number): AsyncIterable<RtcAudioFrame> {
        cap.audioStreamRates.push([rate ?? 0, ch ?? 0]);
        return fakeAudioStream(queuedInbound);
    }

    const module: RtcNodeModule = {
        Room: FakeRoom as unknown as RtcNodeModule['Room'],
        AudioSource: FakeAudioSource as unknown as RtcNodeModule['AudioSource'],
        AudioFrame: FakeAudioFrame as unknown as RtcNodeModule['AudioFrame'],
        AudioStream: FakeAudioStream as unknown as RtcNodeModule['AudioStream'],
        LocalAudioTrack: { createAudioTrack: () => ({ __isLocalAudioTrack: true as const }) },
        RoomEvent: ROOM_EVENT,
        TrackKind: TRACK_KIND,
    };

    const emit = (event: string, ...args: unknown[]) => {
        for (const l of listeners.get(event) ?? []) {
            (l as (...a: unknown[]) => void)(...args);
        }
    };
    const inboundFramesFor = (frames: RtcAudioFrame[]) => { queuedInbound = frames; };

    return { module, cap, emit, inboundFramesFor };
}

const connectArgs: NativeConnectArgs = { url: 'wss://lk.example', token: 'tok', name: 'Agent' };
const frame = (samples: number[]): RtcAudioFrame => ({
    data: Int16Array.from(samples), sampleRate: DEFAULT_SAMPLE_RATE, channels: 1, samplesPerChannel: samples.length,
});

// ── Pure helpers ──────────────────────────────────────────────────────────────

describe('LiveKit native wrapper — pure helpers', () => {
    it('pcmToInt16 views whole samples and truncates a trailing odd byte', () => {
        const buf = new Int16Array([1, -2, 3]).buffer;
        expect(Array.from(pcmToInt16(buf))).toEqual([1, -2, 3]);
        // 5 bytes → 2 whole samples
        expect(pcmToInt16(new ArrayBuffer(5)).length).toBe(2);
    });

    it('int16ToArrayBuffer copies (does not alias) and round-trips', () => {
        const src = Int16Array.from([7, -7, 700]);
        const out = int16ToArrayBuffer(src);
        expect(Array.from(new Int16Array(out))).toEqual([7, -7, 700]);
        src[0] = 0; // mutate source after copy
        expect(new Int16Array(out)[0]).toBe(7); // copy unaffected
    });

    it('participantsToArray handles Map and array forms', () => {
        const p = { identity: 'a' };
        expect(participantsToArray([p])).toEqual([p]);
        expect(participantsToArray(new Map([['a', p]]))).toEqual([p]);
    });
});

// ── Connect + two-way audio ─────────────────────────────────────────────────────

describe('LiveKitRtcNodeRoomClient — connect + audio', () => {
    it('connect loads the module, connects, publishes the bot track, returns identity/room', async () => {
        const { module, cap } = makeFakeRtc();
        const client = new LiveKitRtcNodeRoomClient(DEFAULT_SAMPLE_RATE, DEFAULT_SAMPLE_RATE, 1, async () => module);
        const result = await client.connect(connectArgs);
        expect(result).toEqual({ localIdentity: 'agent-bot', roomName: 'demo-room' });
        expect(cap.publishedTrackNames).toEqual(['Agent']);
        expect(cap.audioSourceRates).toEqual([[DEFAULT_SAMPLE_RATE, 1]]); // outbound source at model rate
    });

    it('publishAudio before connect is a safe no-op; after connect it captures a frame at the outbound rate', async () => {
        const { module, cap } = makeFakeRtc();
        const client = new LiveKitRtcNodeRoomClient(16000, 24000, 1, async () => module);
        expect(() => client.publishAudio(new Int16Array([1, 2]).buffer)).not.toThrow(); // pre-connect no-op
        expect(cap.captured).toHaveLength(0);

        await client.connect(connectArgs);
        client.publishAudio(new Int16Array([10, 20, 30, 40]).buffer);
        await Promise.resolve(); // let the fire-and-forget captureFrame settle
        expect(cap.captured).toHaveLength(1);
        expect(cap.captured[0].sampleRate).toBe(16000); // OUTBOUND rate
        expect(Array.from(cap.captured[0].data)).toEqual([10, 20, 30, 40]);
        expect(cap.captured[0].samplesPerChannel).toBe(4);
    });

    it('inbound subscribed audio is read at the model INPUT rate and forwarded as a diarized frame', async () => {
        const { module, emit, inboundFramesFor } = makeFakeRtc();
        const client = new LiveKitRtcNodeRoomClient(24000, 16000, 1, async () => module);
        const heard: NativeRoomAudioFrame[] = [];
        client.onAudioFrame((f) => heard.push(f));
        await client.connect(connectArgs);

        inboundFramesFor([frame([5, 6, 7])]);
        const audioTrack: RtcTrack = { kind: TRACK_KIND.KIND_AUDIO };
        emit(ROOM_EVENT.TrackSubscribed, audioTrack, {}, { identity: 'dana', name: 'Dana' });
        await new Promise((r) => setTimeout(r, 0)); // let the async stream pump run

        expect(heard).toHaveLength(1);
        expect(heard[0].participantIdentity).toBe('dana');
        expect(heard[0].name).toBe('Dana');
        expect(Array.from(new Int16Array(heard[0].data))).toEqual([5, 6, 7]);
    });

    it('ignores non-audio subscribed tracks', async () => {
        const { module, emit } = makeFakeRtc();
        const client = new LiveKitRtcNodeRoomClient(24000, 24000, 1, async () => module);
        const heard: NativeRoomAudioFrame[] = [];
        client.onAudioFrame((f) => heard.push(f));
        await client.connect(connectArgs);
        emit(ROOM_EVENT.TrackSubscribed, { kind: TRACK_KIND.KIND_VIDEO }, {}, { identity: 'x' });
        await new Promise((r) => setTimeout(r, 0));
        expect(heard).toHaveLength(0);
    });
});

// ── Roster, data, lifecycle ─────────────────────────────────────────────────────

describe('LiveKitRtcNodeRoomClient — roster, data, lifecycle', () => {
    it('participant connect/disconnect events reach the handlers', async () => {
        const { module, emit } = makeFakeRtc();
        const client = new LiveKitRtcNodeRoomClient(24000, 24000, 1, async () => module);
        const joined: string[] = [];
        const left: string[] = [];
        client.onParticipantConnected((p) => joined.push(p.identity));
        client.onParticipantDisconnected((id) => left.push(id));
        await client.connect(connectArgs);
        emit(ROOM_EVENT.ParticipantConnected, { identity: 'pat', name: 'Pat' });
        emit(ROOM_EVENT.ParticipantDisconnected, { identity: 'pat' });
        expect(joined).toEqual(['pat']);
        expect(left).toEqual(['pat']);
    });

    it('getParticipants maps the remote roster', async () => {
        const { module } = makeFakeRtc([{ identity: 'a', name: 'Ada' }, { identity: 'b' }]);
        const client = new LiveKitRtcNodeRoomClient(24000, 24000, 1, async () => module);
        await client.connect(connectArgs);
        expect(await client.getParticipants()).toEqual([{ identity: 'a', name: 'Ada' }, { identity: 'b', name: undefined }]);
    });

    it('publishData encodes the text and sends it reliably', async () => {
        const { module, cap } = makeFakeRtc();
        const client = new LiveKitRtcNodeRoomClient(24000, 24000, 1, async () => module);
        await client.connect(connectArgs);
        await client.publishData('hello room');
        expect(cap.publishedData).toHaveLength(1);
        expect(new TextDecoder().decode(cap.publishedData[0])).toBe('hello room');
    });

    it('onDisconnected fires; disconnect() tears down the room', async () => {
        const { module, cap, emit } = makeFakeRtc();
        const client = new LiveKitRtcNodeRoomClient(24000, 24000, 1, async () => module);
        const ended = vi.fn();
        client.onDisconnected(ended);
        await client.connect(connectArgs);
        emit(ROOM_EVENT.Disconnected);
        expect(ended).toHaveBeenCalledOnce();
        await client.disconnect();
        expect(cap.disconnected).toBe(true);
    });

    it('video/screen publish are safe no-ops (voice MVP)', async () => {
        const { module } = makeFakeRtc();
        const client = new LiveKitRtcNodeRoomClient(24000, 24000, 1, async () => module);
        await client.connect(connectArgs);
        expect(() => client.publishVideo(new ArrayBuffer(4))).not.toThrow();
        expect(() => client.publishScreen(new ArrayBuffer(4))).not.toThrow();
    });
});

// ── Module factory + loader ─────────────────────────────────────────────────────

describe('CreateLiveKitRtcNodeModule + loader', () => {
    it('createRoomClient honors the configured outbound + inbound sample rates', async () => {
        const { module, cap } = makeFakeRtc();
        const mod = CreateLiveKitRtcNodeModule({ OutboundSampleRate: 8000, InboundSampleRate: 16000, Loader: async () => module });
        const client = mod.createRoomClient({});
        await client.connect(connectArgs);
        expect(cap.audioSourceRates).toEqual([[8000, 1]]); // outbound source at the OUTBOUND override

        // inbound AudioStream is constructed at the INBOUND override rate
        const { module: m2, cap: cap2, emit, inboundFramesFor } = makeFakeRtc();
        const mod2 = CreateLiveKitRtcNodeModule({ InboundSampleRate: 16000, Loader: async () => m2 });
        const c2 = mod2.createRoomClient({});
        await c2.connect(connectArgs);
        inboundFramesFor([frame([1])]);
        emit(ROOM_EVENT.TrackSubscribed, { kind: TRACK_KIND.KIND_AUDIO }, {}, { identity: 'z' });
        await new Promise((r) => setTimeout(r, 0));
        expect(cap2.audioStreamRates).toEqual([[16000, 1]]);
    });

    it('defaultRtcNodeLoader resolves a Room-bearing module when the addon is present, else throws the actionable error', async () => {
        // Deterministic across environments: the native addon is an optionalDependency — present here,
        // possibly absent in CI (a native-build failure is non-fatal). Accept either branch.
        try {
            const mod = await defaultRtcNodeLoader();
            expect(typeof mod.Room).toBe('function');
        } catch (err) {
            expect((err as Error).message).toMatch(/could not load '@livekit\/rtc-node'/);
        }
    });
});
