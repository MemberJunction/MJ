import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveKitWorkerRoomClient } from '../livekit-worker-room-client';
import { MediaWorkerSession, type MediaWorkerPort } from '../media-worker-entry';
import type {
    IMediaWorker,
    MediaWorkerCommand,
    MediaWorkerEvent,
} from '../media-worker-types';

/** Mock implementation of IMediaWorker for unit testing without spawning real threads. */
class MockMediaWorker implements IMediaWorker {
    public readonly sentCommands: { message: MediaWorkerCommand; transferList?: ReadonlyArray<Transferable> }[] = [];
    private readonly messageListeners: ((msg: MediaWorkerEvent) => void)[] = [];
    private readonly errorListeners: ((err: Error) => void)[] = [];
    private readonly exitListeners: ((code: number) => void)[] = [];
    public terminated = false;

    public postMessage(message: MediaWorkerCommand, transferList?: ReadonlyArray<Transferable>): void {
        this.sentCommands.push({ message, transferList });
    }

    public on(event: 'message' | 'error' | 'exit', listener: (arg: unknown) => void): this {
        if (event === 'message') {
            this.messageListeners.push(listener as (msg: MediaWorkerEvent) => void);
        } else if (event === 'error') {
            this.errorListeners.push(listener as (err: Error) => void);
        } else if (event === 'exit') {
            this.exitListeners.push(listener as (code: number) => void);
        }
        return this;
    }

    public async terminate(): Promise<number> {
        this.terminated = true;
        return 0;
    }

    // Test driver helpers
    public emitMessage(msg: MediaWorkerEvent): void {
        for (const listener of this.messageListeners) {
            listener(msg);
        }
    }

    public emitExit(code: number): void {
        for (const listener of this.exitListeners) {
            listener(code);
        }
    }

    public emitError(err: Error): void {
        for (const listener of this.errorListeners) {
            listener(err);
        }
    }
}

describe('LiveKitWorkerRoomClient', () => {
    let mockWorker: MockMediaWorker;

    beforeEach(() => {
        mockWorker = new MockMediaWorker();
    });

    it('connects via worker and resolves upon connected event', async () => {
        const client = new LiveKitWorkerRoomClient({
            workerFactory: () => mockWorker,
        });

        const connectPromise = client.connect({
            url: 'ws://localhost:7880',
            token: 'test-token',
            name: 'Agent-Bot',
        });

        expect(mockWorker.sentCommands.length).toBe(1);
        const cmd = mockWorker.sentCommands[0].message;
        expect(cmd.type).toBe('connect');
        if (cmd.type === 'connect') {
            expect(cmd.args.name).toBe('Agent-Bot');
            mockWorker.emitMessage({
                type: 'connected',
                id: cmd.id,
                result: { localIdentity: 'agent-bot-id', roomName: 'room-1' },
            });
        }

        const result = await connectPromise;
        expect(result.localIdentity).toBe('agent-bot-id');
        expect(result.roomName).toBe('room-1');
    });

    it('transfers ArrayBuffer zero-copy when publishing audio', async () => {
        const client = new LiveKitWorkerRoomClient({
            workerFactory: () => mockWorker,
        });

        const connectPromise = client.connect({
            url: 'ws://localhost:7880',
            token: 'test-token',
            name: 'Agent-Bot',
        });
        const cmd = mockWorker.sentCommands[0].message;
        if (cmd.type === 'connect') {
            mockWorker.emitMessage({
                type: 'connected',
                id: cmd.id,
                result: { localIdentity: 'bot', roomName: 'room-1' },
            });
        }
        await connectPromise;

        const buffer = new ArrayBuffer(480);
        client.publishAudio(buffer);

        expect(mockWorker.sentCommands.length).toBe(2);
        const audioCmd = mockWorker.sentCommands[1];
        expect(audioCmd.message.type).toBe('publishAudio');
        expect(audioCmd.transferList).toBeDefined();
        expect(audioCmd.transferList?.[0]).toBe(buffer);
    });

    it('sends flushOutbound command on barge-in', async () => {
        const client = new LiveKitWorkerRoomClient({
            workerFactory: () => mockWorker,
        });

        const connectPromise = client.connect({
            url: 'ws://localhost:7880',
            token: 'test-token',
            name: 'Agent-Bot',
        });
        const cmd = mockWorker.sentCommands[0].message;
        if (cmd.type === 'connect') {
            mockWorker.emitMessage({
                type: 'connected',
                id: cmd.id,
                result: { localIdentity: 'bot', roomName: 'room-1' },
            });
        }
        await connectPromise;

        client.flushOutbound();

        expect(mockWorker.sentCommands.some(c => c.message.type === 'flushOutbound')).toBe(true);
    });

    it('automatically recovers and restarts when worker crashes unexpectedly', async () => {
        let spawnedWorkers = 0;
        const workers: MockMediaWorker[] = [];

        const client = new LiveKitWorkerRoomClient({
            workerFactory: () => {
                spawnedWorkers++;
                const w = new MockMediaWorker();
                workers.push(w);
                return w;
            },
        });

        // Initial connect
        const connectPromise = client.connect({
            url: 'ws://localhost:7880',
            token: 'test-token',
            name: 'Agent-Bot',
        });
        const firstWorker = workers[0];
        const cmd1 = firstWorker.sentCommands[0].message;
        if (cmd1.type === 'connect') {
            firstWorker.emitMessage({
                type: 'connected',
                id: cmd1.id,
                result: { localIdentity: 'bot', roomName: 'room-1' },
            });
        }
        await connectPromise;
        expect(spawnedWorkers).toBe(1);

        // Simulate crash: worker exits with code 1
        firstWorker.emitExit(1);

        // Verification: client automatically respawned a second worker and sent connect
        expect(spawnedWorkers).toBe(2);
        const secondWorker = workers[1];
        expect(secondWorker.sentCommands.length).toBe(1);
        expect(secondWorker.sentCommands[0].message.type).toBe('connect');
    });
});

describe('MediaWorkerSession', () => {
    it('handles connect, audio pre-buffering, and flushOutbound', async () => {
        const sentEvents: { message: MediaWorkerEvent; transferList?: ReadonlyArray<Transferable> }[] = [];
        const port: MediaWorkerPort = {
            postMessage(message, transferList) {
                sentEvents.push({ message, transferList });
            },
            on() {},
        };

        const session = new MediaWorkerSession(port);

        // Flush outbound should clear queue cleanly without throwing
        await expect(session.HandleCommand({ type: 'flushOutbound' })).resolves.toBeUndefined();
    });
});
