/**
 * Tests for {@link VideoEncodeWorkerHost}, the per-thread owner of the encode worker: when a worker starts and stops,
 * what crosses to it (an owned copy of the planes, never the SDK's buffer), replies matched by id, every way a worker
 * fails, the switch to in-process encoding, and its counters. Most tests drive a fake worker; the last ones start real
 * threads (a scripted fixture, and the built worker when `dist/` has it).
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';

const mocks = vi.hoisted(() => ({ LogError: vi.fn<(message: string) => void>(), spawned: { count: 0 } }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: mocks.LogError };
});

vi.mock('node:worker_threads', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:worker_threads')>();
    /** The real `Worker`, counted: every `new Worker` in the package goes through it. */
    class CountingWorker extends actual.Worker {
        constructor(...args: ConstructorParameters<typeof actual.Worker>) {
            super(...args);
            mocks.spawned.count++;
        }
    }
    return { ...actual, Worker: CountingWorker };
});

import { Worker } from 'node:worker_threads';
import type { NativeConnectArgs, NativeRoomVideoFrame, NativeRoomVideoOptions } from '@memberjunction/ai-bridge-livekit';
import * as nativePackage from '../index';
import { LiveKitRtcNodeRoomClient, type RtcVideoFrame } from '../livekit-rtc-node-room';
import type { IVideoEncodeWorker, VideoEncodeReply, VideoEncodeRequest } from '../video-encode-protocol';
import {
    VIDEO_ENCODE_FAILURE_WINDOW_MS,
    VIDEO_ENCODE_IDLE_STOP_MS,
    VIDEO_ENCODE_REQUEST_TIMEOUT_MS,
    VIDEO_ENCODE_START_TIMEOUT_MS,
    VideoEncodeWorkerHost,
} from '../video-encode-worker-host';
import type { RoomVideoFrameEncodeOptions, TimedEncodedVideoFrame } from '../video-frame-encoder';
import { I420ByteLength } from '../video-frame-pixels';
import {
    fakePerson,
    FakePublication,
    flush,
    i420Frame,
    LETS_AGENTS_SEE,
    makeFakeRtc,
    ROOM_EVENT,
    TRACK_KIND,
    TRACK_SOURCE,
    VIDEO_BUFFER_TYPE,
} from './fake-rtc-node';
import { fakeWorkerFactory, FakeEncodeWorker } from './fake-video-encode';

/** Workers started while the test file (and the package index) loaded: none, if importing starts nothing. */
const SPAWNED_AT_IMPORT = mocks.spawned.count;

const OPTIONS: RoomVideoFrameEncodeOptions = { RotationDegrees: 0, MaxDimension: 640, Quality: 80, I420Type: VIDEO_BUFFER_TYPE.I420 };
const CONNECT: NativeConnectArgs = { url: 'wss://lk.example', token: 'tok', name: 'Agent' };
const WATCH: NativeRoomVideoOptions = { Streams: 1, Rate: 1, Cameras: true, Screens: true };
const SCRIPTED_WORKER = fileURLToPath(new URL('./fixtures/scripted-encode-worker.mjs', import.meta.url));
const BUILT_WORKER = fileURLToPath(new URL('../../dist/video-encode-worker.js', import.meta.url));

const host = VideoEncodeWorkerHost.Instance;
let workers: FakeEncodeWorker[];

/** Sends a frame to the host. The promise is marked handled, so a test may leave it unsettled. */
function encode(frame: RtcVideoFrame = i420Frame(64, 48), options: Partial<RoomVideoFrameEncodeOptions> = {}): Promise<TimedEncodedVideoFrame> {
    const encoding = host.Encode(frame, { ...OPTIONS, ...options });
    encoding.catch(() => undefined);
    return encoding;
}

interface Tracked {
    state: 'pending' | 'resolved' | 'rejected';
    value?: TimedEncodedVideoFrame;
    error?: Error;
}

/** Follows a promise's state without awaiting it (timers are fake in the tests that use it). */
function track(encoding: Promise<TimedEncodedVideoFrame>): Tracked {
    const tracked: Tracked = { state: 'pending' };
    encoding.then(
        (value) => Object.assign(tracked, { state: 'resolved', value }),
        (error: Error) => Object.assign(tracked, { state: 'rejected', error }),
    );
    return tracked;
}

/** The worker started last. */
function latest(): FakeEncodeWorker {
    return workers[workers.length - 1];
}

/** Starts a worker with one frame, then makes it fail; resolves once that frame was rejected. */
async function failOnce(how: 'exit' | 'error' = 'exit'): Promise<void> {
    const encoding = encode();
    if (how === 'exit') {
        latest().exit(1);
    } else {
        latest().error(new Error('boom'));
    }
    await expect(encoding).rejects.toThrow();
}

function fallbackLogs(): string[] {
    return mocks.LogError.mock.calls.map(([message]) => message).filter((m) => m.includes('from now on'));
}

beforeEach(() => {
    host.Reset();
    workers = [];
    host.Configure({ WorkerFactory: fakeWorkerFactory(workers) });
    mocks.LogError.mockClear();
});

afterEach(() => {
    vi.useRealTimers();
    host.Reset();
});

afterAll(() => host.Reset());

describe('VideoEncodeWorkerHost: start, share, stop', () => {
    it('starts nothing when the package is imported or the host created; the first frame starts one unref\'d worker', () => {
        expect(SPAWNED_AT_IMPORT).toBe(0);
        expect(nativePackage.VideoEncodeWorkerHost.Instance).toBe(host);
        expect(host.IsWorkerRunning).toBe(false);
        expect(workers).toHaveLength(0);

        encode();
        expect(workers).toHaveLength(1);
        expect(workers[0].unrefCalls).toBe(1);
        expect(host.IsWorkerRunning).toBe(true);
        encode();
        expect(workers).toHaveLength(1);
        expect(workers[0].requests).toHaveLength(2);
    });

    it('one worker serves every watching room client on the thread', async () => {
        const rooms = [await watchedRoom(), await watchedRoom()];
        for (const room of rooms) {
            await room.pushFrame();
        }
        expect(workers).toHaveLength(1);
        expect(workers[0].requests).toHaveLength(2);
        workers[0].ready();
        workers[0].encoded(0, 11);
        workers[0].encoded(1, 22);
        await flush();
        expect(rooms.map((room) => room.frames.map((f) => f.data.byteLength))).toEqual([[11], [22]]);
    });

    it('stops a worker with nothing to do for 60 s (not a failure); the next frame starts a new one', async () => {
        vi.useFakeTimers();
        const first = encode();
        workers[0].ready();
        workers[0].encoded(0);
        await first;
        await vi.advanceTimersByTimeAsync(VIDEO_ENCODE_IDLE_STOP_MS - 1);
        expect(workers[0].terminateCalls).toBe(0);
        await vi.advanceTimersByTimeAsync(2);
        expect(workers[0].terminateCalls).toBe(1);
        expect(host.IsWorkerRunning).toBe(false);
        expect(host.GetStats().WorkerRestarts).toBe(0);

        encode();
        expect(workers).toHaveLength(2);
    });

    it('a frame sent during the idle period keeps the worker until it is answered, then the idle clock starts again', async () => {
        vi.useFakeTimers();
        const first = encode();
        workers[0].ready();
        workers[0].encoded(0);
        await first;
        await vi.advanceTimersByTimeAsync(VIDEO_ENCODE_IDLE_STOP_MS - 1_000);
        const second = track(encode());
        await vi.advanceTimersByTimeAsync(2_000); // past the first idle deadline
        expect(workers[0].terminateCalls).toBe(0);
        workers[0].encoded(1);
        await vi.advanceTimersByTimeAsync(0);
        expect(second.state).toBe('resolved');
        await vi.advanceTimersByTimeAsync(VIDEO_ENCODE_IDLE_STOP_MS + 1);
        expect(workers[0].terminateCalls).toBe(1);
        expect(workers).toHaveLength(1);
    });
});

describe('VideoEncodeWorkerHost: what crosses', () => {
    it('sends an owned copy of the planes in the transfer list, never the SDK\'s buffer, which stays intact', () => {
        const frame = i420Frame(64, 48, { y: 90, u: 100, v: 110 });
        const before = Uint8Array.from(frame.data);
        encode(frame);
        const { message, transfer } = workers[0].requests[0];
        expect(transfer).toHaveLength(1);
        expect(transfer[0]).toBe(message.Planes);
        expect(transfer[0]).not.toBe(frame.data.buffer);
        expect(message.Planes.byteLength).toBe(I420ByteLength(64, 48));
        expect(new Uint8Array(message.Planes)).toEqual(before);
        expect(frame.data).toEqual(before);
        expect(message).toMatchObject({ Kind: 'encode', Width: 64, Height: 48, RotationDegrees: 0, OutWidth: 64, OutHeight: 48, Quality: 80 });
    });

    it('computes the encoded size on this thread: the cap for the source, after rotation', () => {
        encode(i420Frame(1280, 720), { MaxDimension: 640, RotationDegrees: 90, Quality: 55 });
        expect(workers[0].requests[0].message).toMatchObject({ Width: 1280, Height: 720, RotationDegrees: 90, OutWidth: 360, OutHeight: 640, Quality: 55 });
    });

    it('converts a frame in another buffer type on this thread first', () => {
        const converted = i420Frame(16, 8, { y: 41, u: 240, v: 110 });
        const convert = vi.fn(() => converted);
        const rgba: RtcVideoFrame = { data: new Uint8Array(16 * 8 * 4), width: 16, height: 8, type: VIDEO_BUFFER_TYPE.RGBA, convert };
        encode(rgba);
        expect(convert).toHaveBeenCalledWith(VIDEO_BUFFER_TYPE.I420);
        expect(new Uint8Array(workers[0].requests[0].message.Planes)).toEqual(converted.data);
    });

    it('resolves each frame with its own reply, matched by request id, whatever the order', async () => {
        const first = encode();
        const second = encode();
        workers[0].ready();
        workers[0].encoded(1, 22, 9);
        workers[0].encoded(0, 11, 4);
        expect(await first).toMatchObject({ Width: 64, Height: 48, EncodeMs: 4 });
        expect((await first).Data.byteLength).toBe(11);
        expect((await second).Data.byteLength).toBe(22);
    });

    it('ignores a reply for an id it does not know', async () => {
        const encoding = track(encode());
        workers[0].ready();
        workers[0].reply({ Kind: 'encoded', RequestID: 999, Jpeg: new ArrayBuffer(1), Width: 1, Height: 1, EncodeMs: 1 });
        await flush();
        expect(encoding.state).toBe('pending');
        expect(host.GetStats().QueueDepth).toBe(1);
    });

    it('a failed reply rejects that frame only; the worker stays', async () => {
        const bad = encode();
        const good = encode();
        workers[0].ready();
        workers[0].failed(0, 'I420 frame 64x48 has 3 bytes; expected 4608');
        workers[0].encoded(1);
        await expect(bad).rejects.toThrow('has 3 bytes');
        await expect(good).resolves.toMatchObject({ Width: 64 });
        expect(workers[0].terminateCalls).toBe(0);
        expect(host.GetStats().WorkerRestarts).toBe(0);
        expect(host.Location).toBe('worker');
    });
});

describe('VideoEncodeWorkerHost: a worker fails', () => {
    it('a frame unanswered for 5 s means the worker hung: what is pending rejects, it is terminated, and the next frame starts a new one', async () => {
        vi.useFakeTimers();
        const first = track(encode());
        workers[0].ready();
        const second = track(encode());
        await vi.advanceTimersByTimeAsync(VIDEO_ENCODE_REQUEST_TIMEOUT_MS - 1);
        expect(first.state).toBe('pending');
        await vi.advanceTimersByTimeAsync(2);
        expect(first.state).toBe('rejected');
        expect(first.error?.message).toMatch(/not answered within 5000 ms/);
        expect(second.state).toBe('rejected');
        expect(workers[0].terminateCalls).toBe(1);
        expect(host.IsWorkerRunning).toBe(false);
        expect(host.GetStats()).toEqual({ QueueDepth: 0, WorkerRestarts: 1 });

        encode();
        expect(workers).toHaveLength(2);
    });

    it('a frame\'s 5 s start when the worker is ready; a worker that never says ready fails after 10 s', async () => {
        vi.useFakeTimers();
        const early = track(encode());
        await vi.advanceTimersByTimeAsync(VIDEO_ENCODE_START_TIMEOUT_MS - 3_000); // starting slowly, but within the limit
        workers[0].ready();
        await vi.advanceTimersByTimeAsync(VIDEO_ENCODE_REQUEST_TIMEOUT_MS - 1);
        expect(early.state).toBe('pending');
        await vi.advanceTimersByTimeAsync(2);
        expect(early.state).toBe('rejected');

        const silent = track(encode());
        await vi.advanceTimersByTimeAsync(VIDEO_ENCODE_START_TIMEOUT_MS - 1);
        expect(silent.state).toBe('pending');
        await vi.advanceTimersByTimeAsync(2);
        expect(silent.error?.message).toMatch(/did not start within 10000 ms/);
        expect(workers[1].terminateCalls).toBe(1);
    });

    it.each([['exit' as const], ['error' as const]])('a worker %s rejects what is pending, counts once, and the next frame starts a new worker', async (how) => {
        const pending = [encode(), encode()];
        workers[0].ready();
        if (how === 'exit') {
            workers[0].exit(1);
        } else {
            workers[0].error(new Error('boom'));
            workers[0].exit(1); // Node follows an uncaught error with the exit
        }
        for (const encoding of pending) {
            await expect(encoding).rejects.toThrow(how === 'exit' ? 'exited with code 1' : 'boom');
        }
        expect(host.GetStats()).toEqual({ QueueDepth: 0, WorkerRestarts: 1 });
        expect(host.IsWorkerRunning).toBe(false);
        encode();
        expect(workers).toHaveLength(2);
    });

    it('ignores the replies and events of a worker it replaced', async () => {
        const lost = encode();
        workers[0].exit(1);
        await expect(lost).rejects.toThrow();
        const current = track(encode());
        const stale = workers[0];
        stale.reply({ Kind: 'encoded', RequestID: workers[1].requests[0].message.RequestID, Jpeg: new ArrayBuffer(99), Width: 1, Height: 1, EncodeMs: 1 });
        stale.exit(1);
        stale.error(new Error('late'));
        await flush();
        expect(current.state).toBe('pending');
        expect(host.GetStats().WorkerRestarts).toBe(1);
        expect(host.IsWorkerRunning).toBe(true);

        workers[1].ready();
        workers[1].encoded(0, 7);
        await flush();
        expect(current.value?.Data.byteLength).toBe(7);
    });

    it('a worker that cannot be started fails that frame and counts; the next frame tries again', async () => {
        let attempts = 0;
        host.Configure({
            WorkerFactory: () => {
                attempts++;
                throw new Error('no threads here');
            },
        });
        await expect(encode()).rejects.toThrow('could not be started: no threads here');
        expect(host.GetStats().WorkerRestarts).toBe(1);
        await expect(encode()).rejects.toThrow();
        expect(attempts).toBe(2);
    });
});

describe('VideoEncodeWorkerHost: in-process fallback', () => {
    it('after 3 failures within 60 s, encodes in-process for good, logged once', async () => {
        vi.useFakeTimers();
        await failOnce();
        expect(host.Location).toBe('worker');
        await vi.advanceTimersByTimeAsync(20_000);
        await failOnce('error');
        expect(host.Location).toBe('worker');
        expect(fallbackLogs()).toHaveLength(0);
        await vi.advanceTimersByTimeAsync(20_000);
        await failOnce();
        expect(host.Location).toBe('in-process');
        expect(host.FallbackReason).toMatch(/^3 encode worker failures within 60 s/);
        expect(fallbackLogs()).toHaveLength(1);

        const encoded = await encode(i420Frame(64, 48), { Quality: 90 });
        const decoded = jpeg.decode(new Uint8Array(encoded.Data), { useTArray: true });
        expect([decoded.width, decoded.height]).toEqual([64, 48]);
        await encode();
        expect(workers).toHaveLength(3);
        expect(fallbackLogs()).toHaveLength(1);
        expect(host.GetStats()).toEqual({ QueueDepth: 0, WorkerRestarts: 3 });
    });

    it('counts failures within the window only: three spread over exactly 60 s do not switch', async () => {
        vi.useFakeTimers();
        await failOnce();
        await vi.advanceTimersByTimeAsync(30_000);
        await failOnce();
        await vi.advanceTimersByTimeAsync(VIDEO_ENCODE_FAILURE_WINDOW_MS - 30_000);
        await failOnce(); // the first is 60 s old: out of the window
        expect(host.Location).toBe('worker');
        expect(host.GetStats().WorkerRestarts).toBe(3);
    });

    it('three failures within 60 s less a millisecond switch', async () => {
        vi.useFakeTimers();
        await failOnce();
        await vi.advanceTimersByTimeAsync(30_000);
        await failOnce();
        await vi.advanceTimersByTimeAsync(VIDEO_ENCODE_FAILURE_WINDOW_MS - 30_001);
        await failOnce();
        expect(host.Location).toBe('in-process');
    });

    it('a missing worker script switches to in-process at once, logged once, and starts no thread', async () => {
        host.Reset();
        host.Configure({ WorkerPath: '/nonexistent/video-encode-worker.js' });
        const spawnedBefore = mocks.spawned.count;
        const encoded = await encode();
        expect(jpeg.decode(new Uint8Array(encoded.Data), { useTArray: true }).width).toBe(64);
        expect(typeof encoded.EncodeMs).toBe('number');
        await encode();
        expect(host.Location).toBe('in-process');
        expect(host.FallbackReason).toBe('the encode worker script was not found at /nonexistent/video-encode-worker.js');
        expect(fallbackLogs()).toHaveLength(1);
        expect(mocks.spawned.count).toBe(spawnedBefore);
    });

    it('Reset() returns to a fresh host', async () => {
        vi.useFakeTimers();
        for (let k = 0; k < 3; k++) {
            await failOnce();
        }
        expect(host.Location).toBe('in-process');
        host.Reset();
        expect(host.Location).toBe('worker');
        expect(host.GetStats()).toEqual({ QueueDepth: 0, WorkerRestarts: 0 });
    });
});

describe('VideoEncodeWorkerHost: counters', () => {
    it('reports frames waiting on the worker and worker failures', async () => {
        encode();
        encode();
        expect(host.GetStats()).toEqual({ QueueDepth: 2, WorkerRestarts: 0 });
        workers[0].ready();
        workers[0].encoded(0);
        expect(host.GetStats()).toEqual({ QueueDepth: 1, WorkerRestarts: 0 });
        workers[0].exit(1);
        expect(host.GetStats()).toEqual({ QueueDepth: 0, WorkerRestarts: 1 });
    });
});

/** Delegates to a real worker thread and remembers the planes buffer of every request it posted. */
class RecordingWorker implements IVideoEncodeWorker {
    public readonly sentPlanes: ArrayBuffer[] = [];
    public constructor(private readonly worker: Worker) {}

    public postMessage(message: VideoEncodeRequest, transferList: ReadonlyArray<ArrayBuffer>): void {
        this.sentPlanes.push(message.Planes);
        this.worker.postMessage(message, [...transferList]);
    }

    public on(event: 'message', listener: (reply: VideoEncodeReply) => void): this;
    public on(event: 'error', listener: (err: Error) => void): this;
    public on(event: 'exit', listener: (code: number) => void): this;
    public on(
        event: 'message' | 'error' | 'exit',
        listener: ((reply: VideoEncodeReply) => void) | ((err: Error) => void) | ((code: number) => void),
    ): this {
        this.worker.on(event, listener);
        return this;
    }

    public terminate(): Promise<number> {
        return this.worker.terminate();
    }

    public unref(): void {
        this.worker.unref();
    }
}

describe('VideoEncodeWorkerHost: real threads', () => {
    it('moves the planes to a real thread: the sender\'s copy is detached and the bytes arrive intact', async () => {
        const recorded: RecordingWorker[] = [];
        host.Configure({
            WorkerFactory: () => {
                const worker = new RecordingWorker(new Worker(SCRIPTED_WORKER));
                recorded.push(worker);
                return worker;
            },
        });
        const frame = i420Frame(64, 48, { y: 90, u: 100, v: 110 });
        const before = Uint8Array.from(frame.data);
        const echoed = await host.Encode(frame, OPTIONS); // the fixture echoes the planes it received
        expect(recorded[0].sentPlanes[0].byteLength).toBe(0);
        expect(new Uint8Array(echoed.Data)).toEqual(before);
        expect(frame.data).toEqual(before);
    });

    it('a real worker\'s exit code and uncaught error reach the failure path, and the next frame starts a new worker', async () => {
        host.Configure({ WorkerFactory: undefined, WorkerPath: SCRIPTED_WORKER });
        await expect(host.Encode(i420Frame(8, 8), { ...OPTIONS, Quality: 1001 })).rejects.toThrow('exited with code 3');
        await expect(host.Encode(i420Frame(8, 8), { ...OPTIONS, Quality: 1002 })).rejects.toThrow('scripted crash');
        expect(host.GetStats().WorkerRestarts).toBe(2);
        await expect(host.Encode(i420Frame(8, 8), OPTIONS)).resolves.toMatchObject({ Width: 8, Height: 8 });
        expect(host.Location).toBe('worker');
    });

    it.skipIf(!existsSync(BUILT_WORKER))('the built encode worker encodes a frame on its own thread', async () => {
        host.Configure({ WorkerFactory: undefined });
        expect(host.WorkerPath).toBe(BUILT_WORKER);
        const spawnedBefore = mocks.spawned.count;
        const encoded = await host.Encode(i420Frame(1280, 720, { y: 81, u: 90, v: 240 }), OPTIONS);
        expect(mocks.spawned.count).toBe(spawnedBefore + 1);
        expect([encoded.Width, encoded.Height]).toEqual([640, 360]);
        const decoded = jpeg.decode(new Uint8Array(encoded.Data), { useTArray: true });
        expect([decoded.width, decoded.height]).toEqual([640, 360]);
        expect(decoded.data[0]).toBeGreaterThan(200); // red
        expect(encoded.EncodeMs).toBeGreaterThan(0);
    });
});

/** A connected room client that watches Ada's camera and encodes through the host. */
async function watchedRoom(): Promise<{ frames: NativeRoomVideoFrame[]; pushFrame: () => Promise<void> }> {
    const cam = new FakePublication('TR_cam', TRACK_SOURCE.SOURCE_CAMERA);
    const ada = fakePerson('ada', 'Ada', { ...LETS_AGENTS_SEE }, [cam]);
    const fake = makeFakeRtc([ada]);
    const client = new LiveKitRtcNodeRoomClient(24000, 24000, 1, async () => fake.module, { Video: WATCH, VideoEncoder: host });
    const frames: NativeRoomVideoFrame[] = [];
    client.onVideoFrame((frame) => frames.push(frame));
    await client.connect(CONNECT);
    const track = { kind: TRACK_KIND.KIND_VIDEO };
    fake.emit(ROOM_EVENT.TrackSubscribed, track, cam, ada);
    const stream = fake.cap.streamFor(track);
    return {
        frames,
        pushFrame: async () => {
            stream?.push({ frame: i420Frame(64, 48), rotation: 0 });
            await flush();
        },
    };
}
