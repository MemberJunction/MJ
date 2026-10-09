/**
 * A fake `@livekit/rtc-node` module for unit tests (no native addon, no network): a room whose events the test emits,
 * an outbound audio source that records captures, inbound audio streams, and, for participant video, video streams the
 * test pushes frames into, publications that record `setSubscribed`, and participants with attributes.
 *
 * Mirrors the SDK's ordering where it matters: a test that makes a participant leave removes them from the room
 * before emitting `ParticipantDisconnected`, and a test that changes attributes or mutes a track updates the object
 * before emitting the event.
 */
import { vi } from 'vitest';
import type {
    RtcAudioFrame,
    RtcAudioSource,
    RtcLocalVideoTrack,
    RtcNodeModule,
    RtcParticipant,
    RtcRoom,
    RtcTrack,
    RtcTrackPublication,
    RtcVideoFrame,
    RtcVideoFrameEvent,
    RtcVideoReadResult,
    RtcVideoSource,
    RtcVideoStream,
    RtcVideoStreamReader,
} from '../livekit-rtc-node-room';
import { I420ByteLength } from '../video-frame-pixels';

export const ROOM_EVENT = {
    TrackSubscribed: 'trackSubscribed',
    TrackUnsubscribed: 'trackUnsubscribed',
    TrackSubscriptionFailed: 'trackSubscriptionFailed',
    TrackUnpublished: 'trackUnpublished',
    TrackMuted: 'trackMuted',
    TrackUnmuted: 'trackUnmuted',
    ParticipantConnected: 'participantConnected',
    ParticipantDisconnected: 'participantDisconnected',
    ParticipantAttributesChanged: 'participantAttributesChanged',
    Disconnected: 'disconnected',
};
export const TRACK_KIND = { KIND_AUDIO: 1, KIND_VIDEO: 2 };
export const TRACK_SOURCE = { SOURCE_CAMERA: 1, SOURCE_MICROPHONE: 2, SOURCE_SCREENSHARE: 3, SOURCE_SCREENSHARE_AUDIO: 4 };
export const VIDEO_BUFFER_TYPE = { RGBA: 0, I420: 5 };
export const VIDEO_ROTATION = { VIDEO_ROTATION_0: 0, VIDEO_ROTATION_90: 1, VIDEO_ROTATION_180: 2, VIDEO_ROTATION_270: 3 };

/** A video stream the test feeds: `push` hands the reader a frame, `end` is the SDK's end of stream. */
export class FakeVideoStream implements RtcVideoStream {
    public readonly track: RtcTrack;
    public cancelCount = 0;
    private readonly queued: RtcVideoReadResult[] = [];
    private waiter?: (result: RtcVideoReadResult) => void;
    private closed = false;

    public constructor(track: RtcTrack) {
        this.track = track;
    }

    public get cancelled(): boolean {
        return this.cancelCount > 0;
    }

    public getReader(): RtcVideoStreamReader {
        return {
            read: () => this.read(),
            cancel: async () => {
                this.cancelCount++;
                this.queued.length = 0; // a cancelled stream discards what it had queued
                this.close();
            },
        };
    }

    /** Hands the reader one frame: resolves a pending `read()`, or queues the frame. */
    public push(event: RtcVideoFrameEvent): void {
        if (this.closed) {
            return;
        }
        const waiter = this.waiter;
        if (waiter) {
            this.waiter = undefined;
            waiter({ done: false, value: event });
        } else {
            this.queued.push({ done: false, value: event });
        }
    }

    /** The stream ends on its own: queued frames stay readable, then `done`. */
    public end(): void {
        this.close();
    }

    private read(): Promise<RtcVideoReadResult> {
        const next = this.queued.shift();
        if (next) {
            return Promise.resolve(next);
        }
        if (this.closed) {
            return Promise.resolve({ done: true });
        }
        return new Promise((resolve) => {
            this.waiter = resolve;
        });
    }

    private close(): void {
        this.closed = true;
        const waiter = this.waiter;
        this.waiter = undefined;
        waiter?.({ done: true });
    }
}

/** A remote publication that records every `setSubscribed` call. */
export class FakePublication implements RtcTrackPublication {
    public readonly sid: string;
    public readonly kind: number;
    public readonly source: number;
    public muted: boolean;
    public readonly subscribeCalls: boolean[] = [];

    public constructor(sid: string, source: number, options: { kind?: number; muted?: boolean } = {}) {
        this.sid = sid;
        this.source = source;
        this.kind = options.kind ?? TRACK_KIND.KIND_VIDEO;
        this.muted = options.muted ?? false;
    }

    public setSubscribed(subscribed: boolean): void {
        this.subscribeCalls.push(subscribed);
    }

    /** The latest subscription request, if any. */
    public get lastSubscribe(): boolean | undefined {
        return this.subscribeCalls[this.subscribeCalls.length - 1];
    }
}

/** A remote participant with attributes and publications (keyed by sid, in publish order). */
export interface FakeParticipant extends RtcParticipant {
    attributes: Record<string, string>;
    trackPublications: Map<string, RtcTrackPublication>;
}

export function fakePerson(
    identity: string,
    name: string | undefined,
    attributes: Record<string, string>,
    publications: FakePublication[] = [],
): FakeParticipant {
    return { identity, name, attributes, trackPublications: new Map(publications.map((p) => [p.sid, p])) };
}

/** The consent attribute as a person who lets agents see them carries it. */
export const LETS_AGENTS_SEE: Record<string, string> = { 'mj.agentCanSee': 'true' };

/** A Y'CbCr color. */
export interface YuvColor {
    y: number;
    u: number;
    v: number;
}

/** A solid-color I420 frame (Y'CbCr values), as `@livekit/rtc-node` delivers one. `convert` throws unless given. */
export function i420Frame(
    width: number,
    height: number,
    color: YuvColor = { y: 126, u: 128, v: 128 },
    convert: (dstType: number) => RtcVideoFrame = () => {
        throw new Error('unexpected convert');
    },
): RtcVideoFrame {
    const data = new Uint8Array(I420ByteLength(width, height));
    const lumaLength = width * height;
    const chromaLength = (data.length - lumaLength) / 2;
    data.fill(color.y, 0, lumaLength);
    data.fill(color.u, lumaLength, lumaLength + chromaLength);
    data.fill(color.v, lumaLength + chromaLength);
    return { data, width, height, type: VIDEO_BUFFER_TYPE.I420, convert };
}

/** An I420 frame whose left half is one color and right half another (width a multiple of 4, so chroma splits too). */
export function twoColorFrame(width: number, height: number, left: YuvColor, right: YuvColor): RtcVideoFrame {
    const frame = i420Frame(width, height, left);
    const chromaWidth = width / 2;
    const chromaHeight = Math.ceil(height / 2);
    const lumaLength = width * height;
    const chromaLength = chromaWidth * chromaHeight;
    for (let y = 0; y < height; y++) {
        frame.data.fill(right.y, y * width + width / 2, (y + 1) * width);
    }
    for (let y = 0; y < chromaHeight; y++) {
        const row = y * chromaWidth;
        frame.data.fill(right.u, lumaLength + row + chromaWidth / 2, lumaLength + row + chromaWidth);
        frame.data.fill(right.v, lumaLength + chromaLength + row + chromaWidth / 2, lumaLength + chromaLength + row + chromaWidth);
    }
    return frame;
}

/** A video source the bot created for its avatar, with the frames captured on it. */
export interface FakeVideoSourceRecord {
    width: number;
    height: number;
    frames: RtcVideoFrame[];
}

/** One publishTrack call: the track's kind, name, and the publish options' source and simulcast. */
export interface FakePublishRecord {
    kind: 'audio' | 'video';
    name?: string;
    source: number;
    simulcast?: boolean;
    sid: string;
}

/** Records every captured outbound frame, every AudioStream rate request and every VideoStream opened. */
export class Capture {
    /** The avatar's video sources and their captured frames. */
    public videoSources: FakeVideoSourceRecord[] = [];
    /** Every publishTrack call, in order. */
    public publishes: FakePublishRecord[] = [];
    /** Every setAttributes call on the local participant. */
    public attributeSets: Array<Record<string, string>> = [];
    /** Every unpublishTrack sid. */
    public unpublished: string[] = [];
    /** The names of the local video tracks closed (released with their source). */
    public closedVideoTracks: string[] = [];
    /** Set to make the next video publishTrack reject (the room refusing the camera). */
    public failVideoPublish = false;
    /** The audio source's queued duration (ms) as `queuedDuration` reports it. */
    public queuedDurationMs = 50;
    public captured: RtcAudioFrame[] = [];
    public audioSourceRates: Array<[number, number]> = [];
    public audioStreamRates: Array<[number, number]> = [];
    public publishedSources: number[] = [];
    public publishedData: Uint8Array[] = [];
    public videoStreams: FakeVideoStream[] = [];
    public inFlightCaptures = 0;
    public maxConcurrentCaptures = 0;
    public clearQueueCalls = 0;
    public disconnected = false;

    /** The video stream opened on `track`, if any. */
    public streamFor(track: RtcTrack): FakeVideoStream | undefined {
        return this.videoStreams.find((s) => s.track === track);
    }
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

/** What {@link makeFakeRtc} returns: the module, its recorder, and handles to drive the room. */
export interface FakeRtc {
    module: RtcNodeModule;
    cap: Capture;
    /** The room's remote participants (mutable: push to join, splice to leave). */
    remote: RtcParticipant[];
    emit: (event: string, ...args: unknown[]) => void;
    inboundFramesFor: (frames: RtcAudioFrame[]) => void;
}

/** A local video track the fake hands out: it remembers its name and source. */
interface FakeLocalVideoTrack extends RtcLocalVideoTrack {
    __videoTrackName: string;
}

function makeFakeRoom(cap: Capture, remote: RtcParticipant[], listeners: Map<string, ((...args: never[]) => void)[]>): RtcRoom {
    const localParticipant = {
        identity: 'agent-bot',
        publishTrack: vi.fn(async (t: unknown, opts?: { source?: number; simulcast?: boolean }) => {
            // Capture the publish-options `source` — it MUST be set (SOURCE_MICROPHONE) for the native
            // AudioSource to accept captured frames; a missing source is the `InvalidState` bug.
            cap.publishedSources.push(Number(opts?.source ?? -1));
            const video = typeof t === 'object' && t !== null && '__videoTrackName' in t;
            if (video && cap.failVideoPublish) {
                throw new Error('publish refused');
            }
            const sid = `TR_${cap.publishes.length + 1}`;
            cap.publishes.push({ kind: video ? 'video' : 'audio', name: video ? (t as FakeLocalVideoTrack).__videoTrackName : undefined, source: Number(opts?.source ?? -1), simulcast: opts?.simulcast, sid });
            return { sid };
        }),
        unpublishTrack: vi.fn(async (sid: string) => {
            cap.unpublished.push(sid);
        }),
        setAttributes: vi.fn(async (attributes: Record<string, string>) => {
            cap.attributeSets.push({ ...attributes });
        }),
        publishData: vi.fn(async (payload: Uint8Array) => {
            cap.publishedData.push(payload);
        }),
    };
    return {
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
}

/** Builds a fake module + a handle to drive room events and inspect captures. */
export function makeFakeRtc(remote: RtcParticipant[] = []): FakeRtc {
    const cap = new Capture();
    const listeners = new Map<string, ((...args: never[]) => void)[]>();
    let queuedInbound: RtcAudioFrame[] = [];
    const room = makeFakeRoom(cap, remote, listeners);

    // Constructors must be REAL functions (newable) — vitest's vi.fn(arrow) is not a constructor. Each
    // returns an object, so `new` yields that object; captures go to the shared Capture.
    function FakeRoom(this: unknown): RtcRoom {
        return room;
    }
    function FakeAudioSource(this: unknown, rate: number, ch: number): RtcAudioSource {
        cap.audioSourceRates.push([rate, ch]);
        return {
            captureFrame: async (f: RtcAudioFrame) => {
                // Track concurrency: with the serial drain, only ONE capture may be in flight at a time.
                cap.inFlightCaptures++;
                cap.maxConcurrentCaptures = Math.max(cap.maxConcurrentCaptures, cap.inFlightCaptures);
                await Promise.resolve(); // yield — overlapping captures would be observable here
                cap.captured.push(f);
                cap.inFlightCaptures--;
            },
            clearQueue: () => {
                cap.clearQueueCalls++;
            },
            get queuedDuration(): number {
                return cap.queuedDurationMs;
            },
        };
    }
    function FakeVideoSource(this: unknown, width: number, height: number): RtcVideoSource {
        const record: FakeVideoSourceRecord = { width, height, frames: [] };
        cap.videoSources.push(record);
        return {
            captureFrame: (frame: RtcVideoFrame) => {
                record.frames.push(frame);
            },
        };
    }
    function FakeVideoFrame(this: unknown, data: Uint8Array, width: number, height: number, type: number): RtcVideoFrame {
        return { data, width, height, type, convert: () => { throw new Error('unexpected convert'); } };
    }
    function FakeAudioFrame(this: unknown, data: Int16Array, sampleRate: number, channels: number, samplesPerChannel: number): RtcAudioFrame {
        return { data, sampleRate, channels, samplesPerChannel };
    }
    function FakeAudioStream(this: unknown, _track: RtcTrack, rate?: number, ch?: number): AsyncIterable<RtcAudioFrame> {
        cap.audioStreamRates.push([rate ?? 0, ch ?? 0]);
        return fakeAudioStream(queuedInbound);
    }
    function FakeVideoStreamCtor(this: unknown, track: RtcTrack): RtcVideoStream {
        const stream = new FakeVideoStream(track);
        cap.videoStreams.push(stream);
        return stream;
    }

    const module: RtcNodeModule = {
        Room: FakeRoom as unknown as RtcNodeModule['Room'],
        AudioSource: FakeAudioSource as unknown as RtcNodeModule['AudioSource'],
        AudioFrame: FakeAudioFrame as unknown as RtcNodeModule['AudioFrame'],
        AudioStream: FakeAudioStream as unknown as RtcNodeModule['AudioStream'],
        VideoStream: FakeVideoStreamCtor as unknown as RtcNodeModule['VideoStream'],
        VideoBufferType: VIDEO_BUFFER_TYPE,
        VideoRotation: VIDEO_ROTATION,
        LocalAudioTrack: { createAudioTrack: () => ({ __isLocalAudioTrack: true as const }) },
        VideoSource: FakeVideoSource as unknown as RtcNodeModule['VideoSource'],
        VideoFrame: FakeVideoFrame as unknown as RtcNodeModule['VideoFrame'],
        LocalVideoTrack: {
            createVideoTrack: (name: string): FakeLocalVideoTrack => ({
                __videoTrackName: name,
                close: vi.fn(async () => {
                    cap.closedVideoTracks.push(name);
                }),
            }),
        },
        RoomEvent: ROOM_EVENT,
        TrackKind: TRACK_KIND,
        TrackPublishOptions: class {
            source?: number;
            simulcast?: boolean;
            constructor(data?: { source?: number; simulcast?: boolean }) {
                this.source = data?.source;
                this.simulcast = data?.simulcast;
            }
        } as unknown as RtcNodeModule['TrackPublishOptions'],
        TrackSource: TRACK_SOURCE,
    };

    const emit = (event: string, ...args: unknown[]): void => {
        for (const l of listeners.get(event) ?? []) {
            (l as (...a: unknown[]) => void)(...args);
        }
    };
    const inboundFramesFor = (frames: RtcAudioFrame[]): void => {
        queuedInbound = frames;
    };

    return { module, cap, remote, emit, inboundFramesFor };
}

/** Lets pending promise continuations (stream pumps) run. */
export async function flush(): Promise<void> {
    await new Promise((r) => setTimeout(r, 0));
}
