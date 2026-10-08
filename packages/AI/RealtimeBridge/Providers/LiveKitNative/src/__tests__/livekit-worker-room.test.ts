import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type {
    NativeConnectArgs,
    NativeConnectResult,
    NativeRoomAudioFrame,
    NativeRoomParticipant,
    NativeRoomVideoFrame,
    NativeRoomVideoOptions,
    NativeRoomVideoSourceEnd,
} from '@memberjunction/ai-bridge-livekit';
import { LiveKitWorkerRoomClient, type LiveKitWorkerRoomClientOptions } from '../livekit-worker-room-client';
import { CreateMediaWorkerRoomClient, MediaWorkerSession, type MediaWorkerPort } from '../media-worker-session';
import { CreateLiveKitRtcNodeModule, IsWorkerMediaEnabled, LiveKitRtcNodeRoomClient } from '../livekit-rtc-node-room';
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
    type FakeRtc,
    type FakeVideoStream,
} from './fake-rtc-node';
import type { RoomAudioTelemetrySnapshot, TelemetryRoomClient } from '../room-telemetry';
import type {
    IMediaWorker,
    MediaWorkerClientOptions,
    MediaWorkerCommand,
    MediaWorkerEvent,
} from '../media-worker-types';

const ARGS: NativeConnectArgs = { url: 'ws://localhost:7880', token: 'test-token', name: 'Agent-Bot' };
const RESULT: NativeConnectResult = { localIdentity: 'bot', roomName: 'room-1' };
const WATCH: NativeRoomVideoOptions = { Streams: 1, Rate: 1, Cameras: true, Screens: true };
const SCREEN_FRAME: NativeRoomVideoFrame = {
    data: new ArrayBuffer(8),
    mimeType: 'image/jpeg',
    participantIdentity: 'ada',
    name: 'Ada',
    source: 'screen',
    width: 4,
    height: 2,
    timestampMs: 1,
};
const SCREEN_ENDED: NativeRoomVideoSourceEnd = { participantIdentity: 'ada', name: 'Ada', source: 'screen' };

/** A fake rtc-node room with Ada (who lets agents see her) and her camera; returns what a test needs to drive it. */
function roomWithAdasCamera(): { fake: FakeRtc; subscribeCamera: () => FakeVideoStream | undefined; cam: FakePublication } {
    const cam = new FakePublication('TR_cam', TRACK_SOURCE.SOURCE_CAMERA);
    const ada = fakePerson('ada', 'Ada', { ...LETS_AGENTS_SEE }, [cam]);
    const fake = makeFakeRtc([ada]);
    const subscribeCamera = () => {
        const track = { kind: TRACK_KIND.KIND_VIDEO };
        fake.emit(ROOM_EVENT.TrackSubscribed, track, cam, ada);
        return fake.cap.streamFor(track);
    };
    return { fake, subscribeCamera, cam };
}

/** Mock implementation of IMediaWorker for unit testing without spawning real threads. */
class MockMediaWorker implements IMediaWorker {
    public readonly sentCommands: { message: MediaWorkerCommand; transferList?: ReadonlyArray<ArrayBuffer> }[] = [];
    private readonly messageListeners: ((msg: MediaWorkerEvent) => void)[] = [];
    private readonly errorListeners: ((err: Error) => void)[] = [];
    private readonly exitListeners: ((code: number) => void)[] = [];
    public terminated = false;
    public terminateCalls = 0;

    public postMessage(message: MediaWorkerCommand, transferList?: ReadonlyArray<ArrayBuffer>): void {
        this.sentCommands.push({ message, transferList });
    }

    public on(event: 'message', listener: (msg: MediaWorkerEvent) => void): this;
    public on(event: 'error', listener: (err: Error) => void): this;
    public on(event: 'exit', listener: (code: number) => void): this;
    public on(event: 'message' | 'error' | 'exit', listener: ((msg: MediaWorkerEvent) => void) | ((err: Error) => void) | ((code: number) => void)): this {
        if (event === 'message') {
            this.messageListeners.push(listener as (msg: MediaWorkerEvent) => void);
        } else if (event === 'error') {
            this.errorListeners.push(listener as (err: Error) => void);
        } else {
            this.exitListeners.push(listener as (code: number) => void);
        }
        return this;
    }

    public async terminate(): Promise<number> {
        this.terminated = true;
        this.terminateCalls++;
        return 0;
    }

    public emitMessage(msg: MediaWorkerEvent): void {
        for (const listener of this.messageListeners) listener(msg);
    }
    public emitExit(code: number): void {
        for (const listener of this.exitListeners) listener(code);
    }
    public emitError(err: Error): void {
        for (const listener of this.errorListeners) listener(err);
    }

    /** Commands of one type, narrowed. */
    public commandsOf<T extends MediaWorkerCommand['type']>(type: T): Extract<MediaWorkerCommand, { type: T }>[] {
        const out: Extract<MediaWorkerCommand, { type: T }>[] = [];
        for (const c of this.sentCommands) {
            if (c.message.type === type) out.push(c.message as Extract<MediaWorkerCommand, { type: T }>);
        }
        return out;
    }

    /** Answers the (latest) connect command as a successful join. */
    public answerConnect(roster?: NativeRoomParticipant[]): void {
        const connects = this.commandsOf('connect');
        const cmd = connects[connects.length - 1];
        if (roster) this.emitMessage({ type: 'rosterSnapshot', participants: roster });
        this.emitMessage({ type: 'connected', id: cmd.id, result: RESULT });
    }
}

/** A fake in-process client used as the fallback / session native client. */
class FakeRoomClient implements TelemetryRoomClient {
    public connectArgs: NativeConnectArgs | null = null;
    public readonly published: { pcm: ArrayBuffer; at: number }[] = [];
    public flushCount = 0;
    public disconnectCount = 0;
    public roster: NativeRoomParticipant[] = [];
    public audioCb?: (frame: NativeRoomAudioFrame) => void;
    public videoCb?: (frame: NativeRoomVideoFrame) => void;
    public videoEndedCb?: (source: NativeRoomVideoSourceEnd) => void;
    public disconnectedCb?: (reason?: string) => void;
    public connectedCb?: (p: NativeRoomParticipant) => void;
    public constructor(private readonly clock: () => number = () => 0) {}
    public async connect(args: NativeConnectArgs): Promise<NativeConnectResult> {
        this.connectArgs = args;
        return RESULT;
    }
    public async disconnect(): Promise<void> {
        this.disconnectCount++;
    }
    public publishAudio(pcm: ArrayBuffer): void {
        this.published.push({ pcm, at: this.clock() });
    }
    public flushOutbound(): void {
        this.flushCount++;
    }
    public publishVideo(): void {}
    public publishScreen(): void {}
    public onAudioFrame(cb: (frame: NativeRoomAudioFrame) => void): void {
        this.audioCb = cb;
    }
    public onVideoFrame(cb: (frame: NativeRoomVideoFrame) => void): void {
        this.videoCb = cb;
    }
    public onVideoSourceEnded(cb: (source: NativeRoomVideoSourceEnd) => void): void {
        this.videoEndedCb = cb;
    }
    public onParticipantConnected(cb: (p: NativeRoomParticipant) => void): void {
        this.connectedCb = cb;
    }
    public onParticipantDisconnected(): void {}
    public async getParticipants(): Promise<NativeRoomParticipant[]> {
        return this.roster;
    }
    public async publishData(): Promise<void> {}
    public onDisconnected(cb: (reason?: string) => void): void {
        this.disconnectedCb = cb;
    }
    public GetTelemetry(): RoomAudioTelemetrySnapshot {
        return { inboundGaps: {}, outbound: { captureCount: this.published.length, underrunCount: 0 }, eventLoopDelayP99Ms: 1 };
    }
}

function newClient(workers: MockMediaWorker[], extra: Partial<LiveKitWorkerRoomClientOptions> = {}): LiveKitWorkerRoomClient {
    return new LiveKitWorkerRoomClient({
        workerFactory: () => {
            const w = new MockMediaWorker();
            workers.push(w);
            return w;
        },
        telemetryPollMs: 0,
        ...extra,
    });
}

async function connected(client: LiveKitWorkerRoomClient, workers: MockMediaWorker[], roster?: NativeRoomParticipant[]): Promise<void> {
    const p = client.connect(ARGS);
    workers[workers.length - 1].answerConnect(roster);
    await p;
}

describe('IsWorkerMediaEnabled', () => {
    it('is OFF by default; only on/true/1 enable it', () => {
        expect(IsWorkerMediaEnabled(undefined)).toBe(false);
        expect(IsWorkerMediaEnabled('')).toBe(false);
        expect(IsWorkerMediaEnabled('off')).toBe(false);
        expect(IsWorkerMediaEnabled('false')).toBe(false);
        expect(IsWorkerMediaEnabled('yes-please')).toBe(false);
        expect(IsWorkerMediaEnabled('on')).toBe(true);
        expect(IsWorkerMediaEnabled('ON')).toBe(true);
        expect(IsWorkerMediaEnabled(' true ')).toBe(true);
        expect(IsWorkerMediaEnabled('1')).toBe(true);
    });
});

describe('CreateLiveKitRtcNodeModule worker selection', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('defaults to the in-process client', () => {
        vi.stubEnv('MJ_LIVEKIT_WORKER_MEDIA', '');
        expect(CreateLiveKitRtcNodeModule().createRoomClient({})).toBeInstanceOf(LiveKitRtcNodeRoomClient);
    });

    it('MJ_LIVEKIT_WORKER_MEDIA=on selects the worker-backed client', () => {
        vi.stubEnv('MJ_LIVEKIT_WORKER_MEDIA', 'on');
        expect(CreateLiveKitRtcNodeModule().createRoomClient({})).toBeInstanceOf(LiveKitWorkerRoomClient);
    });

    it('UseWorker overrides the env switch in both directions', () => {
        vi.stubEnv('MJ_LIVEKIT_WORKER_MEDIA', 'off');
        expect(CreateLiveKitRtcNodeModule({ UseWorker: true }).createRoomClient({})).toBeInstanceOf(LiveKitWorkerRoomClient);
        vi.stubEnv('MJ_LIVEKIT_WORKER_MEDIA', 'on');
        expect(CreateLiveKitRtcNodeModule({ UseWorker: false }).createRoomClient({})).toBeInstanceOf(LiveKitRtcNodeRoomClient);
    });

    it('a custom Loader implies in-process even when the env enables the worker', () => {
        vi.stubEnv('MJ_LIVEKIT_WORKER_MEDIA', 'on');
        const client = CreateLiveKitRtcNodeModule({ Loader: async () => { throw new Error('unused'); } }).createRoomClient({});
        expect(client).toBeInstanceOf(LiveKitRtcNodeRoomClient);
    });

    it('passes Video to the worker client, which sends it with the connect command', async () => {
        const worker = new MockMediaWorker();
        const client = CreateLiveKitRtcNodeModule({ UseWorker: true, WorkerFactory: () => worker }).createRoomClient({ Video: WATCH });
        const p = client.connect(ARGS);
        expect(worker.commandsOf('connect')[0].options.video).toEqual(WATCH);
        worker.answerConnect();
        await p;
        const d = client.disconnect();
        worker.emitMessage({ type: 'commandSuccess', id: worker.commandsOf('disconnect')[0].id });
        await d;
    });

    it('passes Video to the in-process fallback, whose frames reach the worker client\'s onVideoFrame', async () => {
        const { fake, subscribeCamera } = roomWithAdasCamera();
        const client = CreateLiveKitRtcNodeModule({
            UseWorker: true,
            Loader: async () => fake.module,
            WorkerFactory: () => {
                throw new Error('worker threads unavailable');
            },
        }).createRoomClient({ Video: WATCH });
        const seen: NativeRoomVideoFrame[] = [];
        client.onVideoFrame?.((f) => seen.push(f));
        await client.connect(ARGS);

        subscribeCamera()!.push({ frame: i420Frame(32, 24), rotation: 0 });
        await flush();
        expect(seen.map((f) => f.participantIdentity)).toEqual(['ada']);
        await client.disconnect();
    });
});

describe('CreateMediaWorkerRoomClient (the worker session\'s default client)', () => {
    it('reads video when the connect options carry it', async () => {
        const { fake, subscribeCamera } = roomWithAdasCamera();
        const client = CreateMediaWorkerRoomClient({ sampleRate: 24000, channels: 1, inboundSampleRate: 16000, video: WATCH }, async () => fake.module);
        const seen: NativeRoomVideoFrame[] = [];
        client.onVideoFrame?.((f) => seen.push(f));
        await client.connect(ARGS);
        subscribeCamera()!.push({ frame: i420Frame(32, 24), rotation: 0 });
        await flush();
        expect(seen).toHaveLength(1);
        expect(client).toBeInstanceOf(LiveKitRtcNodeRoomClient);
    });

    it('reads no video, and unsubscribes it, without them', async () => {
        const { fake, subscribeCamera, cam } = roomWithAdasCamera();
        const client = CreateMediaWorkerRoomClient({ sampleRate: 24000, channels: 1, inboundSampleRate: 16000 }, async () => fake.module);
        await client.connect(ARGS);
        expect(subscribeCamera()).toBeUndefined();
        expect(cam.subscribeCalls).toEqual([false]);
    });
});

describe('package index', () => {
    it('does not re-export the auto-running worker bootstrap', () => {
        const indexSource = readFileSync(path.resolve(__dirname, '../index.ts'), 'utf8');
        expect(indexSource).not.toContain('media-worker-bootstrap');
        expect(indexSource).toContain('media-worker-session');
    });
});

describe('LiveKitWorkerRoomClient', () => {
    let workers: MockMediaWorker[];

    beforeEach(() => {
        vi.useFakeTimers();
        workers = [];
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('connects via worker and resolves upon connected event', async () => {
        const client = newClient(workers);
        const connectPromise = client.connect(ARGS);
        expect(workers).toHaveLength(1);
        const cmd = workers[0].commandsOf('connect')[0];
        expect(cmd.args.name).toBe('Agent-Bot');
        workers[0].answerConnect();
        await expect(connectPromise).resolves.toEqual(RESULT);
    });

    it('sends the video options with the connect command', async () => {
        const client = newClient(workers, { video: WATCH });
        const p = client.connect(ARGS);
        expect(workers[0].commandsOf('connect')[0].options.video).toEqual(WATCH);
        workers[0].answerConnect();
        await p;
    });

    it('raises onVideoFrame for a videoFrame event and onVideoSourceEnded for a videoSourceEnded event', async () => {
        const client = newClient(workers);
        const frames: NativeRoomVideoFrame[] = [];
        const ended: NativeRoomVideoSourceEnd[] = [];
        client.onVideoFrame((f) => frames.push(f));
        client.onVideoSourceEnded((s) => ended.push(s));
        await connected(client, workers);

        workers[0].emitMessage({ type: 'videoFrame', frame: SCREEN_FRAME });
        workers[0].emitMessage({ type: 'videoSourceEnded', source: SCREEN_ENDED });
        expect(frames).toEqual([SCREEN_FRAME]);
        expect(ended).toEqual([SCREEN_ENDED]);
    });

    it('transfers ArrayBuffer zero-copy when publishing audio and sends flushOutbound on barge-in', async () => {
        const client = newClient(workers);
        await connected(client, workers);

        const buffer = new ArrayBuffer(480);
        client.publishAudio(buffer);
        const audioCmd = workers[0].sentCommands.find((c) => c.message.type === 'publishAudio');
        expect(audioCmd?.transferList?.[0]).toBe(buffer);

        client.flushOutbound();
        expect(workers[0].commandsOf('flushOutbound')).toHaveLength(1);
    });

    describe('spawn failure and connect timeout', () => {
        it('falls back to the in-process client when new Worker throws, and delegates afterwards', async () => {
            const fallback = new FakeRoomClient();
            const client = new LiveKitWorkerRoomClient({
                workerFactory: () => { throw new Error('worker threads unavailable'); },
                fallbackFactory: () => fallback,
                telemetryPollMs: 0,
            });
            const audioCb = vi.fn();
            client.onAudioFrame(audioCb);

            await expect(client.connect(ARGS)).resolves.toEqual(RESULT);

            expect(fallback.connectArgs).toEqual(ARGS);
            expect(fallback.audioCb).toBe(audioCb);
            const pcm = new ArrayBuffer(960);
            client.publishAudio(pcm);
            client.flushOutbound();
            expect(fallback.published.map((p) => p.pcm)).toEqual([pcm]);
            expect(fallback.flushCount).toBe(1);
            await client.disconnect();
            expect(fallback.disconnectCount).toBe(1);
        });

        it('wires the video callbacks to the fallback client, registered before or after it takes over', async () => {
            const fallback = new FakeRoomClient();
            const client = new LiveKitWorkerRoomClient({
                workerFactory: () => { throw new Error('worker threads unavailable'); },
                fallbackFactory: () => fallback,
                telemetryPollMs: 0,
            });
            const earlyFrame = vi.fn();
            const earlyEnded = vi.fn();
            client.onVideoFrame(earlyFrame);
            client.onVideoSourceEnded(earlyEnded);
            await client.connect(ARGS);
            expect(fallback.videoCb).toBe(earlyFrame);
            expect(fallback.videoEndedCb).toBe(earlyEnded);

            const lateFrame = vi.fn();
            const lateEnded = vi.fn();
            client.onVideoFrame(lateFrame);
            client.onVideoSourceEnded(lateEnded);
            fallback.videoCb?.(SCREEN_FRAME);
            fallback.videoEndedCb?.(SCREEN_ENDED);
            expect(lateFrame).toHaveBeenCalledWith(SCREEN_FRAME);
            expect(lateEnded).toHaveBeenCalledWith(SCREEN_ENDED);
            expect(earlyFrame).not.toHaveBeenCalled();
        });

        it('passes the LiveKit disconnect reason through the fallback client and clears it on disconnect', async () => {
            const fallback = new FakeRoomClient();
            const client = new LiveKitWorkerRoomClient({
                workerFactory: () => { throw new Error('unavailable'); },
                fallbackFactory: () => fallback,
                telemetryPollMs: 0,
            });
            const reasons: (string | undefined)[] = [];
            client.onDisconnected((r) => reasons.push(r));
            await client.connect(ARGS);
            fallback.disconnectedCb?.('PARTICIPANT_REMOVED');
            expect(reasons).toEqual(['PARTICIPANT_REMOVED']);
            await client.disconnect();
            client.publishAudio(new ArrayBuffer(8));
            expect(fallback.published).toHaveLength(0);
        });

        it('rejects (does not hang) when the worker cannot spawn and no fallback is configured', async () => {
            const client = new LiveKitWorkerRoomClient({
                workerFactory: () => { throw new Error('worker threads unavailable'); },
                telemetryPollMs: 0,
            });
            await expect(client.connect(ARGS)).rejects.toThrow('worker threads unavailable');
        });

        it('times out a silent worker, terminates it, and falls back', async () => {
            const fallback = new FakeRoomClient();
            const client = newClient(workers, { fallbackFactory: () => fallback, connectTimeoutMs: 5000 });
            const p = client.connect(ARGS);
            await vi.advanceTimersByTimeAsync(4999);
            expect(fallback.connectArgs).toBeNull();
            await vi.advanceTimersByTimeAsync(2);
            await expect(p).resolves.toEqual(RESULT);
            expect(fallback.connectArgs).toEqual(ARGS);
            expect(workers[0].terminated).toBe(true);
        });

        it('rejects with a timeout when there is no fallback', async () => {
            const client = newClient(workers, { connectTimeoutMs: 1000 });
            const p = client.connect(ARGS);
            const assertion = expect(p).rejects.toThrow('timed out after 1000ms');
            await vi.advanceTimersByTimeAsync(1001);
            await assertion;
        });

        it('falls back when the worker dies before the join completes', async () => {
            const fallback = new FakeRoomClient();
            const client = newClient(workers, { fallbackFactory: () => fallback });
            const p = client.connect(ARGS);
            workers[0].emitExit(1);
            await expect(p).resolves.toEqual(RESULT);
            expect(fallback.connectArgs).toEqual(ARGS);
        });

        it('does NOT fall back for a LiveKit-level join error reported by the worker', async () => {
            const fallback = new FakeRoomClient();
            const client = newClient(workers, { fallbackFactory: () => fallback });
            const p = client.connect(ARGS);
            const cmd = workers[0].commandsOf('connect')[0];
            workers[0].emitMessage({ type: 'commandError', id: cmd.id, error: 'invalid token' });
            await expect(p).rejects.toThrow('invalid token');
            expect(fallback.connectArgs).toBeNull();
        });
    });

    describe('crash handling', () => {
        it('clears the connected flag immediately on exit and restarts after the backoff delay', async () => {
            const client = newClient(workers, { restartBackoffBaseMs: 250 });
            await connected(client, workers);

            workers[0].emitExit(1);
            // Immediately not connected: audio is dropped, nothing is posted anywhere.
            client.publishAudio(new ArrayBuffer(960));
            expect(workers[0].commandsOf('publishAudio')).toHaveLength(0);
            expect(workers).toHaveLength(1);

            await vi.advanceTimersByTimeAsync(249);
            expect(workers).toHaveLength(1);
            await vi.advanceTimersByTimeAsync(2);
            expect(workers).toHaveLength(2);
            expect(workers[1].commandsOf('connect')[0].args).toEqual(ARGS);
        });

        it('exhausts bounded restarts with exponential backoff, without resetting the counter on quick re-crashes, then raises disconnect', async () => {
            const client = newClient(workers, { maxRestartAttempts: 3, restartBackoffBaseMs: 250, healthyResetMs: 60_000 });
            const onDisconnected = vi.fn();
            client.onDisconnected(onDisconnected);
            await connected(client, workers);

            // crash 1 -> restart after 250ms; the rejoin SUCCEEDS but the worker crashes again at once.
            workers[0].emitExit(1);
            await vi.advanceTimersByTimeAsync(250);
            expect(workers).toHaveLength(2);
            workers[1].answerConnect();
            await vi.advanceTimersByTimeAsync(0);

            // crash 2 -> backoff doubles to 500ms (counter was NOT reset by the successful rejoin).
            workers[1].emitExit(1);
            await vi.advanceTimersByTimeAsync(499);
            expect(workers).toHaveLength(2);
            await vi.advanceTimersByTimeAsync(2);
            expect(workers).toHaveLength(3);
            workers[2].answerConnect();
            await vi.advanceTimersByTimeAsync(0);

            // crash 3 -> 1000ms.
            workers[2].emitExit(1);
            await vi.advanceTimersByTimeAsync(1001);
            expect(workers).toHaveLength(4);
            workers[3].answerConnect();
            await vi.advanceTimersByTimeAsync(0);
            expect(onDisconnected).not.toHaveBeenCalled();

            // crash 4 -> attempts exhausted: disconnect raised with a reason, no 5th worker.
            workers[3].emitExit(1);
            await vi.advanceTimersByTimeAsync(60_000);
            expect(workers).toHaveLength(4);
            expect(onDisconnected).toHaveBeenCalledTimes(1);
            expect(onDisconnected.mock.calls[0][0]).toContain('restart attempts exhausted (3)');
        });

        it('resets the restart counter only after a sustained healthy period', async () => {
            const client = newClient(workers, { maxRestartAttempts: 1, restartBackoffBaseMs: 100, healthyResetMs: 60_000 });
            const onDisconnected = vi.fn();
            client.onDisconnected(onDisconnected);
            await connected(client, workers);

            workers[0].emitExit(1);
            await vi.advanceTimersByTimeAsync(100);
            workers[1].answerConnect();
            await vi.advanceTimersByTimeAsync(60_001); // healthy for > 60s -> counter resets

            workers[1].emitExit(1);
            await vi.advanceTimersByTimeAsync(100);
            expect(workers).toHaveLength(3);
            expect(onDisconnected).not.toHaveBeenCalled();
        });

        it('raises disconnect when the rejoin itself is rejected and attempts run out', async () => {
            const client = newClient(workers, { maxRestartAttempts: 1, restartBackoffBaseMs: 100 });
            const onDisconnected = vi.fn();
            client.onDisconnected(onDisconnected);
            await connected(client, workers);

            workers[0].emitExit(1);
            await vi.advanceTimersByTimeAsync(100);
            const cmd = workers[1].commandsOf('connect')[0];
            workers[1].emitMessage({ type: 'commandError', id: cmd.id, error: 'token expired' });
            await vi.advanceTimersByTimeAsync(0);

            expect(onDisconnected).toHaveBeenCalledTimes(1);
            expect(onDisconnected.mock.calls[0][0]).toContain('token expired');
            expect(workers[1].terminated).toBe(true);
        });

        it('treats a rejected rejoin as terminal even with the default attempt budget', async () => {
            const client = newClient(workers); // default maxRestartAttempts = 3
            const onDisconnected = vi.fn();
            client.onDisconnected(onDisconnected);
            await connected(client, workers);

            workers[0].emitExit(1);
            await vi.advanceTimersByTimeAsync(250);
            const cmd = workers[1].commandsOf('connect')[0];
            workers[1].emitMessage({ type: 'commandError', id: cmd.id, error: 'token expired' });
            await vi.advanceTimersByTimeAsync(60_000);

            expect(workers).toHaveLength(2);
            expect(onDisconnected).toHaveBeenCalledTimes(1);
            expect(onDisconnected.mock.calls[0][0]).toBe('rejoin rejected: token expired');
        });

        it('reports the sources the crashed worker was sending as ended, once', async () => {
            const client = newClient(workers, { restartBackoffBaseMs: 250 });
            const ended: NativeRoomVideoSourceEnd[] = [];
            client.onVideoSourceEnded((source) => ended.push(source));
            await connected(client, workers);
            const boCamera: NativeRoomVideoSourceEnd = { participantIdentity: 'bo', name: 'Bo', source: 'camera' };
            workers[0].emitMessage({ type: 'videoFrame', frame: SCREEN_FRAME });
            workers[0].emitMessage({ type: 'videoFrame', frame: { ...SCREEN_FRAME, ...boCamera } });
            workers[0].emitMessage({ type: 'videoSourceEnded', source: boCamera });
            expect(ended).toEqual([boCamera]);

            workers[0].emitExit(1);
            expect(ended).toEqual([boCamera, SCREEN_ENDED]); // Bo's camera was already reported; Ada's screen now

            await vi.advanceTimersByTimeAsync(251); // the restarted worker rejoins and picks again
            workers[1].answerConnect();
            await vi.advanceTimersByTimeAsync(0);
            workers[1].emitExit(1);
            expect(ended).toEqual([boCamera, SCREEN_ENDED]); // nothing new was sent, so nothing more to report
        });

        it('reports no source ended when the bot disconnects', async () => {
            const client = newClient(workers);
            const ended: NativeRoomVideoSourceEnd[] = [];
            client.onVideoSourceEnded((source) => ended.push(source));
            await connected(client, workers);
            workers[0].emitMessage({ type: 'videoFrame', frame: SCREEN_FRAME });

            const p = client.disconnect();
            workers[0].emitMessage({ type: 'commandSuccess', id: workers[0].commandsOf('disconnect')[0].id });
            await p;
            workers[0].emitExit(0);
            expect(ended).toEqual([]);
        });

        it('disconnect() during a rejoin leaves no pending request, restart timer or further spawn', async () => {
            const client = newClient(workers, { restartBackoffBaseMs: 100 });
            const onDisconnected = vi.fn();
            client.onDisconnected(onDisconnected);
            await connected(client, workers);

            workers[0].emitExit(1);
            await vi.advanceTimersByTimeAsync(100); // rejoin now in flight on workers[1]
            expect(workers).toHaveLength(2);

            const p = client.disconnect();
            workers[1].emitMessage({ type: 'commandSuccess', id: workers[1].commandsOf('disconnect')[0].id });
            await p;
            await vi.advanceTimersByTimeAsync(120_000);

            expect(workers).toHaveLength(2);
            expect(workers[1].terminated).toBe(true);
            expect(onDisconnected).not.toHaveBeenCalled();
            expect(vi.getTimerCount()).toBe(0);
        });

        it('refuses to rejoin with a join token older than maxRejoinTokenAgeMs and raises disconnect instead', async () => {
            const client = newClient(workers, { maxRejoinTokenAgeMs: 600_000 });
            const onDisconnected = vi.fn();
            client.onDisconnected(onDisconnected);
            await connected(client, workers);

            await vi.advanceTimersByTimeAsync(600_001);
            workers[0].emitExit(1);
            await vi.advanceTimersByTimeAsync(10_000);

            expect(workers).toHaveLength(1);
            expect(onDisconnected).toHaveBeenCalledTimes(1);
            expect(onDisconnected.mock.calls[0][0]).toContain('likely-expired token');
        });
    });

    describe('disconnect', () => {
        it('terminates the worker after a graceful acknowledgement', async () => {
            const client = newClient(workers);
            await connected(client, workers);
            const p = client.disconnect();
            const cmd = workers[0].commandsOf('disconnect')[0];
            workers[0].emitMessage({ type: 'commandSuccess', id: cmd.id });
            await p;
            expect(workers[0].terminateCalls).toBe(1);
        });

        it('stops waiting after disconnectTimeoutMs and still terminates the worker', async () => {
            const client = newClient(workers, { disconnectTimeoutMs: 5000 });
            await connected(client, workers);
            let done = false;
            const p = client.disconnect().then(() => { done = true; });
            await vi.advanceTimersByTimeAsync(4999);
            expect(done).toBe(false);
            expect(workers[0].terminated).toBe(false);
            await vi.advanceTimersByTimeAsync(2);
            await p;
            expect(done).toBe(true);
            expect(workers[0].terminated).toBe(true);
        });

        it('does not restart after an intentional disconnect', async () => {
            const client = newClient(workers);
            await connected(client, workers);
            const p = client.disconnect();
            workers[0].emitMessage({ type: 'commandSuccess', id: workers[0].commandsOf('disconnect')[0].id });
            await p;
            workers[0].emitExit(0);
            await vi.advanceTimersByTimeAsync(10_000);
            expect(workers).toHaveLength(1);
        });
    });

    describe('roster', () => {
        const alice: NativeRoomParticipant = { identity: 'alice', name: 'Alice' };
        const bob: NativeRoomParticipant = { identity: 'bob', name: 'Bob' };
        const carol: NativeRoomParticipant = { identity: 'carol', name: 'Carol' };

        it('seeds the roster with participants already in the room when the bot joins', async () => {
            const client = newClient(workers);
            await connected(client, workers, [alice, bob]);
            expect((await client.getParticipants()).map((p) => p.identity)).toEqual(['alice', 'bob']);

            workers[0].emitMessage({ type: 'participantConnected', participant: carol });
            workers[0].emitMessage({ type: 'participantDisconnected', participantIdentity: 'alice' });
            expect((await client.getParticipants()).map((p) => p.identity)).toEqual(['bob', 'carol']);
        });

        it('clears the roster on worker restart and re-seeds (with diff callbacks) after the rejoin', async () => {
            const client = newClient(workers, { restartBackoffBaseMs: 100 });
            const joined: string[] = [];
            const left: string[] = [];
            client.onParticipantConnected((p) => joined.push(p.identity));
            client.onParticipantDisconnected((id) => left.push(id));
            await connected(client, workers, [alice, bob]);

            workers[0].emitExit(1);
            expect(await client.getParticipants()).toEqual([]);

            await vi.advanceTimersByTimeAsync(100);
            workers[1].answerConnect([bob, carol]);
            await vi.advanceTimersByTimeAsync(0);

            expect((await client.getParticipants()).map((p) => p.identity)).toEqual(['bob', 'carol']);
            expect(left).toEqual(['alice']);
            expect(joined).toEqual(['carol']);
        });
    });

    describe('telemetry', () => {
        it('RefreshTelemetry round-trips to the worker and GetTelemetry then returns the fresh snapshot with both loop p99s labelled', async () => {
            const client = newClient(workers);
            await connected(client, workers);
            expect(client.GetTelemetry().outbound.captureCount).toBe(0);

            const p = client.RefreshTelemetry();
            const req = workers[0].commandsOf('getTelemetry')[0];
            workers[0].emitMessage({
                type: 'telemetry',
                id: req.id,
                snapshot: {
                    inboundGaps: {},
                    outbound: { captureCount: 42, underrunCount: 3 },
                    workerEventLoopDelayP99Ms: 2.5,
                    pacerQueuedMs: 80,
                },
            });
            const snap = await p;

            expect(snap.outbound.captureCount).toBe(42);
            expect(snap.workerEventLoopDelayP99Ms).toBe(2.5);
            expect(typeof snap.mainEventLoopDelayP99Ms).toBe('number');
            const later = client.GetTelemetry();
            expect(later.outbound.underrunCount).toBe(3);
            expect(later.pacerQueuedMs).toBe(80);
            expect(later.workerEventLoopDelayP99Ms).toBe(2.5);
        });

        it('polls the worker in the background so GetTelemetry does not go stale', async () => {
            const client = newClient(workers, { telemetryPollMs: 1000 });
            await connected(client, workers);
            expect(workers[0].commandsOf('getTelemetry')).toHaveLength(0);
            await vi.advanceTimersByTimeAsync(1000);
            const first = workers[0].commandsOf('getTelemetry');
            expect(first).toHaveLength(1);
            workers[0].emitMessage({
                type: 'telemetry',
                id: first[0].id,
                snapshot: { inboundGaps: {}, outbound: { captureCount: 7, underrunCount: 0 } },
            });
            expect(client.GetTelemetry().outbound.captureCount).toBe(7);
            const p = client.disconnect();
            workers[0].emitMessage({ type: 'commandSuccess', id: workers[0].commandsOf('disconnect')[0].id });
            await p;
        });
    });
});

describe('MediaWorkerSession', () => {
    const OPTS: MediaWorkerClientOptions = { sampleRate: 24000, channels: 1, inboundSampleRate: 24000, preBufferMs: 150 };
    /** PCM16 mono @24k: 48 bytes per ms. */
    const pcmMs = (ms: number): ArrayBuffer => new ArrayBuffer(ms * 48);

    let events: { message: MediaWorkerEvent; transferList?: ReadonlyArray<ArrayBuffer> }[];
    /** Extra monotonic skew a test can add to simulate a blocked event loop (timers wake late). */
    let skew: number;
    const nowMs = (): number => Date.now() + skew;
    let fake: FakeRoomClient;
    let session: MediaWorkerSession;

    function makeSession(): void {
        const port: MediaWorkerPort = {
            postMessage(message, transferList) {
                events.push({ message, transferList });
            },
            on() {},
        };
        fake = new FakeRoomClient(nowMs);
        session = new MediaWorkerSession(port, { clientFactory: () => fake, now: nowMs });
    }

    /** Advances fake time; the session's monotonic clock follows it. */
    async function advance(ms: number): Promise<void> {
        await vi.advanceTimersByTimeAsync(ms);
    }

    beforeEach(() => {
        vi.useFakeTimers();
        events = [];
        skew = 0;
        makeSession();
    });
    afterEach(() => vi.useRealTimers());

    async function connectSession(): Promise<void> {
        await session.HandleCommand({ type: 'connect', id: 'c1', args: ARGS, options: OPTS });
    }

    it('seeds the roster snapshot before `connected`, and forwards inbound audio with a timestamp and transfer', async () => {
        fake.roster = [{ identity: 'alice', name: 'Alice' }];
        await connectSession();

        const types = events.map((e) => e.message.type);
        expect(types.indexOf('rosterSnapshot')).toBeGreaterThanOrEqual(0);
        expect(types.indexOf('rosterSnapshot')).toBeLessThan(types.indexOf('connected'));
        const snapshot = events.find((e) => e.message.type === 'rosterSnapshot')?.message;
        expect(snapshot?.type === 'rosterSnapshot' && snapshot.participants).toEqual([{ identity: 'alice', name: 'Alice' }]);

        const frameBytes = new ArrayBuffer(960);
        fake.audioCb?.({ data: frameBytes, participantIdentity: 'alice' });
        const audio = events.find((e) => e.message.type === 'audioFrame');
        expect(audio?.transferList?.[0]).toBe(frameBytes);
        expect(audio?.message.type === 'audioFrame' && typeof audio.message.frame.timestampMs).toBe('number');
    });

    it('paces by audio duration: the first preBufferMs is released at once, then real time minus the lead', async () => {
        await connectSession();
        const start = nowMs();
        for (let i = 0; i < 30; i++) {
            await session.HandleCommand({ type: 'publishAudio', pcm: pcmMs(20) });
        }
        await advance(700);

        expect(fake.published).toHaveLength(30);
        const offsets = fake.published.map((p) => p.at - start);
        // entry i is due at max(0, i*20 - 150): the first 8 immediately, then one per 20ms starting at +10.
        const expected = Array.from({ length: 30 }, (_, i) => Math.max(0, i * 20 - 150));
        expect(offsets).toEqual(expected);
    });

    it('does not accumulate drift: a late timer wake releases every entry that fell due', async () => {
        await connectSession();
        for (let i = 0; i < 30; i++) {
            await session.HandleCommand({ type: 'publishAudio', pcm: pcmMs(20) });
        }
        expect(fake.published).toHaveLength(8);

        // The event loop was blocked: the pending timer fires 290ms late (clock = start + 300).
        skew += 290;
        await vi.advanceTimersByTimeAsync(10);

        // Everything due by +300ms (i*20 - 150 <= 300  =>  i <= 22) is released in one catch-up pass.
        expect(fake.published).toHaveLength(23);
        // ...and the schedule stays anchored: the next one is not due until +310ms.
        await advance(9);
        expect(fake.published).toHaveLength(23);
        await advance(2);
        expect(fake.published).toHaveLength(24);
    });

    it('holds audio during the pre-buffer, then starts via the failsafe timer', async () => {
        await connectSession();
        for (let i = 0; i < 3; i++) {
            await session.HandleCommand({ type: 'publishAudio', pcm: pcmMs(20) });
        }
        expect(fake.published).toHaveLength(0);
        await advance(149);
        expect(fake.published).toHaveLength(0);
        await advance(2);
        expect(fake.published).toHaveLength(3);
    });

    it('re-arms the pre-buffer for a new response after the previous one has fully played out', async () => {
        await connectSession();
        for (let i = 0; i < 10; i++) {
            await session.HandleCommand({ type: 'publishAudio', pcm: pcmMs(20) });
        }
        await advance(500);
        expect(fake.published).toHaveLength(10);

        // 200ms of audio played out long ago; a fresh chunk must wait for a new pre-buffer.
        await advance(2000);
        await session.HandleCommand({ type: 'publishAudio', pcm: pcmMs(20) });
        expect(fake.published).toHaveLength(10);
        await advance(151);
        expect(fake.published).toHaveLength(11);
    });

    it('continues the same schedule (no new pre-buffer) when a chunk arrives while the source is still playing', async () => {
        await connectSession();
        for (let i = 0; i < 10; i++) {
            await session.HandleCommand({ type: 'publishAudio', pcm: pcmMs(20) });
        }
        await advance(100); // 200ms of audio sent, only ~100ms played
        const before = fake.published.length;
        await session.HandleCommand({ type: 'publishAudio', pcm: pcmMs(20) });
        await advance(20);
        expect(fake.published.length).toBeGreaterThan(before);
    });

    it('flush during pacing drops the queue, cancels the timer, flushes the native source, and re-arms the pre-buffer', async () => {
        await connectSession();
        for (let i = 0; i < 30; i++) {
            await session.HandleCommand({ type: 'publishAudio', pcm: pcmMs(20) });
        }
        expect(fake.published).toHaveLength(8);

        await session.HandleCommand({ type: 'flushOutbound' });
        expect(fake.flushCount).toBe(1);
        await advance(2000);
        expect(fake.published).toHaveLength(8);

        // New response after a flush starts with a fresh pre-buffer.
        await session.HandleCommand({ type: 'publishAudio', pcm: pcmMs(20) });
        expect(fake.published).toHaveLength(8);
        await advance(151);
        expect(fake.published).toHaveLength(9);
    });

    it('reports pacer queue depth and the worker event-loop p99 in telemetry', async () => {
        await connectSession();
        for (let i = 0; i < 3; i++) {
            await session.HandleCommand({ type: 'publishAudio', pcm: pcmMs(20) });
        }
        await session.HandleCommand({ type: 'getTelemetry', id: 't1' });
        const tel = events.find((e) => e.message.type === 'telemetry')?.message;
        expect(tel?.type === 'telemetry' && tel.id).toBe('t1');
        expect(tel?.type === 'telemetry' && tel.snapshot.pacerQueuedMs).toBe(60);
        expect(tel?.type === 'telemetry' && typeof tel.snapshot.workerEventLoopDelayP99Ms).toBe('number');
    });

    it('forwards video frames with the JPEG buffer in the transfer list, and ended sources', async () => {
        await connectSession();
        const data = new ArrayBuffer(16);
        const frame: NativeRoomVideoFrame = { ...SCREEN_FRAME, data };
        fake.videoCb?.(frame);
        fake.videoEndedCb?.(SCREEN_ENDED);

        const sent = events.find((e) => e.message.type === 'videoFrame');
        expect(sent?.message).toEqual({ type: 'videoFrame', frame });
        expect(sent?.transferList).toEqual([data]);
        expect(events.find((e) => e.message.type === 'videoSourceEnded')?.message).toEqual({ type: 'videoSourceEnded', source: SCREEN_ENDED });
    });

    it('hands the video options to the in-worker client', async () => {
        let seen: MediaWorkerClientOptions | undefined;
        const port: MediaWorkerPort = { postMessage: (m) => { events.push({ message: m }); }, on() {} };
        const s = new MediaWorkerSession(port, {
            clientFactory: (o) => {
                seen = o;
                return fake;
            },
            now: nowMs,
        });
        await s.HandleCommand({ type: 'connect', id: 'c1', args: ARGS, options: { ...OPTS, video: WATCH } });
        expect(seen?.video).toEqual(WATCH);
    });

    it('forwards the LiveKit disconnect reason from the native client', async () => {
        await connectSession();
        fake.disconnectedCb?.('SERVER_SHUTDOWN');
        const ev = events.find((e) => e.message.type === 'disconnected')?.message;
        expect(ev).toEqual({ type: 'disconnected', reason: 'SERVER_SHUTDOWN' });
    });

    it('answers a failing correlated command with commandError carrying the same id', async () => {
        const failing = new FakeRoomClient();
        failing.connect = async () => { throw new Error('join rejected'); };
        const port: MediaWorkerPort = { postMessage: (m) => { events.push({ message: m }); }, on() {} };
        const s = new MediaWorkerSession(port, { clientFactory: () => failing, now: nowMs });
        await s.HandleCommand({ type: 'connect', id: 'c9', args: ARGS, options: OPTS });
        const err = events.find((e) => e.message.type === 'commandError')?.message;
        expect(err).toEqual({ type: 'commandError', id: 'c9', error: 'join rejected' });
    });
});
