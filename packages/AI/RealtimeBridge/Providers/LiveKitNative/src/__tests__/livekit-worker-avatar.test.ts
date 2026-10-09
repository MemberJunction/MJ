/**
 * The agent's avatar across the media worker: pieces go to the worker with their buffers transferred, status comes
 * back, a restarted worker gets the stream's init again (or, after the avatar was taken down, joins audio only), and
 * the worker's own session hands the pieces to its room client.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NativeAvatarMediaChunk, NativeAvatarStatus, NativeConnectArgs, NativeConnectResult, NativeRoomParticipant } from '@memberjunction/ai-bridge-livekit';
import { LiveKitWorkerRoomClient } from '../livekit-worker-room-client';
import { CreateMediaWorkerRoomClient, MediaWorkerSession, type MediaWorkerPort } from '../media-worker-session';
import type { IMediaWorker, MediaWorkerClientOptions, MediaWorkerCommand, MediaWorkerEvent } from '../media-worker-types';
import type { RoomAudioTelemetrySnapshot, TelemetryRoomClient } from '../room-telemetry';
import { FixturePieces } from './avatar-test-helpers';
import { makeFakeRtc } from './fake-rtc-node';

const ARGS: NativeConnectArgs = { url: 'ws://localhost:7880', token: 'test-token', name: 'Agent-Bot' };
const RESULT: NativeConnectResult = { localIdentity: 'bot', roomName: 'room-1' };
const TAKEN_DOWN: NativeAvatarStatus = { state: 'audio-only', reason: 'decoder-failed' };

/** A media worker double recording what it was sent; transferred buffers are moved, as a real worker moves them. */
class MockWorker implements IMediaWorker {
    public readonly Sent: Array<{ message: MediaWorkerCommand; transferList?: ReadonlyArray<ArrayBuffer> }> = [];
    private readonly listeners: { message: Array<(m: MediaWorkerEvent) => void>; exit: Array<(c: number) => void> } = { message: [], exit: [] };
    public postMessage(message: MediaWorkerCommand, transferList?: ReadonlyArray<ArrayBuffer>): void {
        const received = transferList?.length ? structuredClone(message, { transfer: [...transferList] }) : message;
        this.Sent.push({ message: received, transferList });
    }
    public on(event: 'message', listener: (msg: MediaWorkerEvent) => void): this;
    public on(event: 'error', listener: (err: Error) => void): this;
    public on(event: 'exit', listener: (code: number) => void): this;
    public on(event: string, listener: ((m: MediaWorkerEvent) => void) | ((e: Error) => void) | ((c: number) => void)): this {
        if (event === 'message') this.listeners.message.push(listener as (m: MediaWorkerEvent) => void);
        if (event === 'exit') this.listeners.exit.push(listener as (c: number) => void);
        return this;
    }
    public async terminate(): Promise<number> {
        return 0;
    }
    public Emit(message: MediaWorkerEvent): void {
        this.listeners.message.forEach((l) => l(message));
    }
    public Exit(code: number): void {
        this.listeners.exit.forEach((l) => l(code));
    }
    public Of<T extends MediaWorkerCommand['type']>(type: T): Array<Extract<MediaWorkerCommand, { type: T }>> {
        return this.Sent.map((s) => s.message).filter((m): m is Extract<MediaWorkerCommand, { type: T }> => m.type === type);
    }
    public AnswerConnect(): void {
        const connects = this.Of('connect');
        this.Emit({ type: 'connected', id: connects[connects.length - 1].id, result: RESULT });
    }
}

function newClient(workers: MockWorker[]): LiveKitWorkerRoomClient {
    return new LiveKitWorkerRoomClient({
        workerFactory: () => {
            const worker = new MockWorker();
            workers.push(worker);
            return worker;
        },
        telemetryPollMs: 0,
        restartBackoffBaseMs: 10,
    });
}

async function connect(client: LiveKitWorkerRoomClient, workers: MockWorker[]): Promise<void> {
    const pending = client.connect(ARGS);
    workers[workers.length - 1].AnswerConnect();
    await pending;
}

/** Restarts the worker after a crash and lets it rejoin. */
async function crashAndRejoin(workers: MockWorker[]): Promise<void> {
    workers[workers.length - 1].Exit(1);
    await vi.advanceTimersByTimeAsync(20);
    workers[workers.length - 1].AnswerConnect();
    await vi.advanceTimersByTimeAsync(0);
}

describe('LiveKitWorkerRoomClient — the avatar', () => {
    let workers: MockWorker[];
    beforeEach(() => {
        vi.useFakeTimers();
        workers = [];
    });
    afterEach(() => vi.useRealTimers());

    it('sends each avatar piece to the worker with its buffer transferred', async () => {
        const client = newClient(workers);
        await connect(client, workers);
        const [, fragment] = FixturePieces();
        client.publishAvatarMedia({ data: fragment, mimeType: 'video/mp4' });
        const sent = workers[0].Sent.find((s) => s.message.type === 'publishAvatarMedia');
        expect(sent?.transferList?.[0]).toBe(fragment);
        expect(fragment.byteLength).toBe(0); // moved to the worker
        expect(sent?.message.type === 'publishAvatarMedia' && sent.message.chunk.mimeType).toBe('video/mp4');
    });

    it('drops avatar pieces while the worker is not joined', async () => {
        const client = newClient(workers);
        expect(() => client.publishAvatarMedia({ data: new ArrayBuffer(8), mimeType: 'video/mp4' })).not.toThrow();
        const pending = client.connect(ARGS);
        client.publishAvatarMedia({ data: FixturePieces()[1], mimeType: 'video/mp4' });
        expect(workers[0].Of('publishAvatarMedia')).toHaveLength(0);
        workers[0].AnswerConnect();
        await pending;
    });

    it("reports the worker's avatar status", async () => {
        const client = newClient(workers);
        const statuses: NativeAvatarStatus[] = [];
        client.onAvatarStatus((s) => statuses.push(s));
        await connect(client, workers);
        workers[0].Emit({ type: 'avatarStatus', status: { state: 'on' } });
        workers[0].Emit({ type: 'avatarStatus', status: TAKEN_DOWN });
        expect(statuses).toEqual([{ state: 'on' }, TAKEN_DOWN]);
    });

    it("gives a restarted worker the stream's init again (a copy: the original buffer was transferred)", async () => {
        const client = newClient(workers);
        await connect(client, workers);
        const [init] = FixturePieces();
        const initBytes = new Uint8Array(init).slice();
        client.publishAvatarMedia({ data: init, mimeType: 'video/mp4' });
        await crashAndRejoin(workers);
        const replayed = workers[1].Of('publishAvatarMedia');
        expect(replayed).toHaveLength(1);
        expect(new Uint8Array(replayed[0].chunk.data)).toEqual(initBytes);
        expect(workers[1].Sent.find((s) => s.message.type === 'publishAvatarMedia')?.transferList).toHaveLength(1);
    });

    it('keeps an init that comes while the worker restarts, and gives that one to the rejoined worker', async () => {
        const client = newClient(workers);
        await connect(client, workers);
        const [first] = FixturePieces();
        client.publishAvatarMedia({ data: first, mimeType: 'video/mp4' });
        workers[0].Exit(1);
        const [next] = FixturePieces();
        const nextBytes = new Uint8Array(next).slice();
        nextBytes[nextBytes.length - 1] ^= 0xff; // tell the two inits apart
        client.publishAvatarMedia({ data: nextBytes.slice().buffer, mimeType: 'video/mp4' });
        await vi.advanceTimersByTimeAsync(20);
        workers[1].AnswerConnect();
        await vi.advanceTimersByTimeAsync(0);
        const replayed = workers[1].Of('publishAvatarMedia');
        expect(replayed.map((m) => new Uint8Array(m.chunk.data))).toEqual([nextBytes]);
    });

    it('after the avatar was taken down, a restarted worker joins audio only and gets no init', async () => {
        const client = newClient(workers);
        await connect(client, workers);
        client.publishAvatarMedia({ data: FixturePieces()[0], mimeType: 'video/mp4' });
        workers[0].Emit({ type: 'avatarStatus', status: TAKEN_DOWN });
        await crashAndRejoin(workers);
        expect(workers[1].Of('connect')[0].options.avatarStatus).toEqual(TAKEN_DOWN);
        expect(workers[1].Of('publishAvatarMedia')).toHaveLength(0);
    });
});

/** A room client double for the worker's session. */
class SessionRoomClient implements TelemetryRoomClient {
    public readonly Avatar: NativeAvatarMediaChunk[] = [];
    public statusCb?: (status: NativeAvatarStatus) => void;
    public async connect(): Promise<NativeConnectResult> {
        return RESULT;
    }
    public async disconnect(): Promise<void> {}
    public publishAudio(): void {}
    public flushOutbound(): void {}
    public publishVideo(): void {}
    public publishScreen(): void {}
    public publishAvatarMedia(chunk: NativeAvatarMediaChunk): void {
        this.Avatar.push(chunk);
    }
    public onAvatarStatus(cb: (status: NativeAvatarStatus) => void): void {
        this.statusCb = cb;
    }
    public onAudioFrame(): void {}
    public onParticipantConnected(): void {}
    public onParticipantDisconnected(): void {}
    public async getParticipants(): Promise<NativeRoomParticipant[]> {
        return [];
    }
    public async publishData(): Promise<void> {}
    public onDisconnected(): void {}
    public GetTelemetry(): RoomAudioTelemetrySnapshot {
        return { inboundGaps: {}, outbound: { captureCount: 0, underrunCount: 0 } };
    }
}

describe('MediaWorkerSession — the avatar', () => {
    const OPTIONS: MediaWorkerClientOptions = { sampleRate: 24000, channels: 1, inboundSampleRate: 16000 };

    it('hands avatar pieces to its room client and posts its avatar status back', async () => {
        const events: MediaWorkerEvent[] = [];
        const port: MediaWorkerPort = { postMessage: (m) => events.push(m), on: () => undefined };
        const client = new SessionRoomClient();
        const session = new MediaWorkerSession(port, { clientFactory: () => client });
        await session.HandleCommand({ type: 'connect', id: 'c1', args: ARGS, options: OPTIONS });
        const piece = new ArrayBuffer(16);
        await session.HandleCommand({ type: 'publishAvatarMedia', chunk: { data: piece, mimeType: 'video/mp4' } });
        expect(client.Avatar.map((c) => c.data)).toEqual([piece]);
        client.statusCb?.(TAKEN_DOWN);
        expect(events.filter((e) => e.type === 'avatarStatus')).toEqual([{ type: 'avatarStatus', status: TAKEN_DOWN }]);
    });

    it("builds its room client with the avatar status the connect carried, so a rejoin after a take-down stays audio only", async () => {
        const fake = makeFakeRtc();
        const client = CreateMediaWorkerRoomClient({ ...OPTIONS, avatarStatus: TAKEN_DOWN }, async () => fake.module);
        await client.connect(ARGS);
        expect(fake.cap.attributeSets).toEqual([{ 'mj.agentAvatar': 'audio-only:decoder-failed' }]);
    });
});
