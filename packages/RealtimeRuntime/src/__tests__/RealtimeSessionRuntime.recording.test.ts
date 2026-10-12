import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeClient } from '@memberjunction/ai-realtime-client';
import type { IMetadataProvider } from '@memberjunction/core';
import { ParseRecordingShard, RECORDING_FRAME_SAMPLES, RECORDING_SHARD_WINDOW_PACKETS } from '@memberjunction/ai-core-plus';
import {
    MAX_DRAINED_SHARDS_PER_LOAD,
    RECORDER_STOP_TIMEOUT_MS,
    RECORDING_TERMINAL_ACK_TIMEOUT_MS,
    RealtimeSessionRuntime,
    type StartRealtimeClientSessionResult,
} from '../index';
import { FakeRecordingHost, FakeRecordingRuntime, FakeRecordingTransport, FakeShardStore } from './recording-test-helpers';

const WINDOW = RECORDING_SHARD_WINDOW_PACKETS;
const WINDOW_SAMPLES = WINDOW * RECORDING_FRAME_SAMPLES;
const FLUSH_MS = 5000;

/** A realtime client that connects to nothing (registered so the runtime's real driver lookup runs). */
@RegisterClass(BaseRealtimeClient, 'fake-recording-provider')
class FakeRealtimeClient extends BaseRealtimeClient {
    public async Connect(): Promise<void> {}
    public SendText(): void {}
    public CancelActiveResponse(): void {}
    public SendContextNote(): void {}
    public RequestSpokenUpdate(): void {}
    public SendToolResult(): void {}
    public SetMuted(): void {}
    public async Disconnect(): Promise<void> {}
    public get IsBusy(): boolean {
        return false;
    }
    public get IsAudioPlaying(): boolean {
        return false;
    }
}

/** Records every GraphQL mutation; stands in for the transport's progress topic so a session can start. */
class GqlProvider {
    public Mutations: string[] = [];
    public readonly sessionId = 'transport-session-1';
    public async ExecuteGQL(query: string): Promise<unknown> {
        this.Mutations.push(query);
        return {};
    }
    public PushStatusUpdates(): { subscribe(): { unsubscribe(): void } } {
        return { subscribe: () => ({ unsubscribe: () => undefined }) };
    }
    public get MutationNames(): string[] {
        return this.Mutations.map((m) => m.match(/mutation (\w+)/)?.[1] ?? '');
    }
}

function mintedSession(agentSessionId = 'session-1'): StartRealtimeClientSessionResult {
    return {
        AgentSessionId: agentSessionId,
        ConversationId: 'conv-1',
        Provider: 'fake-recording-provider',
        Model: 'model-1',
        EphemeralToken: 'token',
        ExpiresAt: '2030-01-01T00:00:00Z',
        SessionConfigJson: '{}',
        ModelName: 'Fake Realtime',
        NarrationInstructionsTemplate: null,
        PriorChannelStatesJson: null,
    };
}

/** A runtime with fake store + transport sharing one ordered call log, and a recorded session started. */
async function startRecorded(script: ('stored' | 'refused' | 'network-error')[] = []) {
    expect(FakeRealtimeClient).toBeDefined();
    const log: string[] = [];
    const store = new FakeShardStore(log);
    const transport = new FakeRecordingTransport(log, script);
    const host = new FakeRecordingHost();
    const runtime = new FakeRecordingRuntime(host, store, transport);
    const provider = new GqlProvider();
    runtime.Provider = provider as unknown as IMetadataProvider;
    await runtime.StartRealtimeSessionFromResult(mintedSession(), { recordingConsent: true });
    const recorder = host.recorder!;
    return { runtime, provider, store, transport, recorder, log };
}

describe('RealtimeSessionRuntime recording shards (MJ#5294)', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('uploads a shard every 5 s with contiguous StartSample, and the tail covers captured − Σ earlier', async () => {
        const { runtime, transport, recorder } = await startRecorded();
        recorder.Capture(WINDOW + 10);
        await vi.advanceTimersByTimeAsync(FLUSH_MS);
        expect(transport.Uploads.map((u) => u.Index)).toEqual([0]);

        recorder.Capture(WINDOW + 30);
        await vi.advanceTimersByTimeAsync(FLUSH_MS);
        expect(transport.Uploads.map((u) => u.Index)).toEqual([0, 1]);

        recorder.PacketsFlushedOnStop = 3;
        recorder.PaddingSamples = 400;
        await runtime.EndRealtimeSession();

        const shards = transport.Uploads.map((u) => ParseRecordingShard(u.Bytes));
        expect(shards.map((s) => s.StartSample)).toEqual([0, WINDOW_SAMPLES]);
        expect(shards.map((s) => s.SampleCount)).toEqual([WINDOW_SAMPLES, WINDOW_SAMPLES]);

        expect(transport.Terminals).toHaveLength(1);
        const { Input } = transport.Terminals[0];
        const tail = ParseRecordingShard(Input.Tail!);
        const captured = (2 * WINDOW + 43) * RECORDING_FRAME_SAMPLES - 400;
        expect(tail.ShardIndex).toBe(2);
        expect(tail.StartSample).toBe(2 * WINDOW_SAMPLES);
        expect(tail.PacketCount).toBe(43);
        expect(tail.SampleCount).toBe(captured - 2 * WINDOW_SAMPLES);
        expect(Input.LastShardIndex).toBe(2);
        expect(Input.CapturedSamples).toBe(captured);
    });

    it('puts each shard in the store before its upload starts and deletes it only after the ack', async () => {
        const { runtime, recorder, log } = await startRecorded();
        recorder.Capture(WINDOW);
        await vi.advanceTimersByTimeAsync(FLUSH_MS);
        expect(log.filter((e) => e.endsWith('session-1/0'))).toEqual(['put:session-1/0', 'upload:session-1/0', 'delete:session-1/0']);
        await runtime.EndRealtimeSession();
    });

    it('keeps a refused shard in the store and resends it under the same index', async () => {
        const { runtime, store, transport, recorder } = await startRecorded(['refused']);
        recorder.Capture(WINDOW);
        await vi.advanceTimersByTimeAsync(FLUSH_MS);
        expect(store.Keys).toEqual(['session-1/0']);
        expect(store.Log).not.toContain('delete:session-1/0');

        recorder.Capture(WINDOW);
        await vi.advanceTimersByTimeAsync(FLUSH_MS);
        expect(transport.Uploads.map((u) => u.Index)).toEqual([0, 0, 1]);
        expect(transport.Uploads[1].Bytes).toEqual(transport.Uploads[0].Bytes);
        expect(store.Keys).toEqual([]);
        await runtime.EndRealtimeSession();
    });

    it('a new runtime drains a pending shard under its original session and index', async () => {
        const store = new FakeShardStore();
        const bytes = new Uint8Array([1, 2, 3]);
        await store.Put({ SessionID: 'crashed-session', Index: 4, Bytes: bytes, SavedAt: 1 });
        const transport = new FakeRecordingTransport();
        const runtime = new FakeRecordingRuntime(new FakeRecordingHost(), store, transport);

        await vi.advanceTimersByTimeAsync(0); // the constructor's deferred drain

        expect(transport.Uploads).toEqual([{ SessionID: 'crashed-session', Index: 4, Bytes: bytes }]);
        expect(store.Keys).toEqual([]);
        expect(store.Log).toContain(`list:${MAX_DRAINED_SHARDS_PER_LOAD}`);
        await expect(runtime.DrainPendingRecordingShards()).resolves.toBe(0); // once per instance
    });

    it('leaves a pending shard whose drain upload is refused, and defers the drain while there is no transport', async () => {
        const store = new FakeShardStore();
        await store.Put({ SessionID: 'old', Index: 0, Bytes: new Uint8Array([9]), SavedAt: 1 });
        const runtime = new FakeRecordingRuntime(new FakeRecordingHost(), store, null);

        await expect(runtime.DrainPendingRecordingShards()).resolves.toBe(0);
        expect(store.Keys).toEqual(['old/0']);

        runtime.Transport = new FakeRecordingTransport([], ['refused']);
        await expect(runtime.DrainPendingRecordingShards()).resolves.toBe(0);
        expect(store.Keys).toEqual(['old/0']);
    });

    it('drains at session start, after the constructor found no transport', async () => {
        const store = new FakeShardStore();
        await store.Put({ SessionID: 'old', Index: 2, Bytes: new Uint8Array([9]), SavedAt: 1 });
        const host = new FakeRecordingHost();
        const runtime = new FakeRecordingRuntime(host, store, null);
        await vi.advanceTimersByTimeAsync(0);
        expect(store.Keys).toEqual(['old/2']);

        const transport = new FakeRecordingTransport();
        runtime.Transport = transport;
        runtime.Provider = new GqlProvider() as unknown as IMetadataProvider;
        await runtime.StartRealtimeSessionFromResult(mintedSession());
        await vi.advanceTimersByTimeAsync(0);
        expect(transport.Uploads.map((u) => `${u.SessionID}/${u.Index}`)).toEqual(['old/2']);
        await runtime.EndRealtimeSession();
    });

    it('End sends the terminal through the default transport with keepalive, the tail as body, and the counts', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
        vi.stubGlobal('fetch', fetchMock);
        const host = new FakeRecordingHost();
        const runtime = new RealtimeSessionRuntime(host);
        const provider = Object.assign(new GqlProvider(), {
            ConfigData: { URL: 'http://api.test/', Token: 'jwt-1', MJAPIKey: '', UserAPIKey: 'user-key' },
        });
        runtime.Provider = provider as unknown as IMetadataProvider;
        await runtime.StartRealtimeSessionFromResult(mintedSession(), { recordingConsent: true });
        host.recorder!.Capture(12);

        await runtime.EndRealtimeSession();

        const terminalCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/end?'));
        expect(terminalCalls).toHaveLength(1);
        const [url, init] = terminalCalls[0];
        expect(url).toBe(`http://api.test/realtime/recording/session-1/end?lastShardIndex=0&capturedSamples=${12 * RECORDING_FRAME_SAMPLES}`);
        expect(init.keepalive).toBe(true);
        expect(ParseRecordingShard(init.body).PacketCount).toBe(12);
        expect(init.headers.authorization).toBe('Bearer jwt-1');
        expect(init.headers['x-api-key']).toBe('user-key');
        expect(init.headers['x-mj-api-key']).toBeUndefined();
        expect(provider.MutationNames.filter((n) => n.startsWith('UploadRealtimeRecording'))).toEqual([]);
    });

    it('EndRealtimeSession resolves once the terminal is acknowledged', async () => {
        const { runtime, store, transport, recorder } = await startRecorded();
        recorder.Capture(5);
        transport.HoldTerminal();
        let ended = false;
        const ending = runtime.EndRealtimeSession().then(() => {
            ended = true;
        });
        await vi.advanceTimersByTimeAsync(1000);
        expect(transport.Terminals).toHaveLength(1);
        expect(ended).toBe(false);
        transport.ReleaseTerminal(true);
        await ending;
        expect(ended).toBe(true);
        // The tail was stored before the terminal went out, and the ack released it.
        expect(store.Log.filter((e) => e.endsWith('session-1/0'))).toEqual(['put:session-1/0', 'terminal:session-1/0', 'delete:session-1/0']);
    });

    it(`EndRealtimeSession resolves after ${RECORDING_TERMINAL_ACK_TIMEOUT_MS} ms when the terminal is never acknowledged`, async () => {
        const { runtime, store, transport, recorder } = await startRecorded();
        recorder.Capture(5);
        transport.HoldTerminal();
        let ended = false;
        void runtime.EndRealtimeSession().then(() => {
            ended = true;
        });
        await vi.advanceTimersByTimeAsync(RECORDING_TERMINAL_ACK_TIMEOUT_MS - 1);
        expect(ended).toBe(false);
        expect(runtime.IsSavingRecording).toBe(true);
        await vi.advanceTimersByTimeAsync(1);
        expect(ended).toBe(true);
        expect(runtime.IsSavingRecording).toBe(false);
        expect(store.Keys).toEqual(['session-1/0']); // unacknowledged tail waits for the next-load drain
    });

    it('sends no legacy recording mutation and no terminal when nothing was captured', async () => {
        const { runtime, provider, transport } = await startRecorded();
        await runtime.EndRealtimeSession();
        expect(transport.Terminals).toEqual([]);
        expect(provider.MutationNames.filter((n) => n.startsWith('UploadRealtimeRecording'))).toEqual([]);
    });

    it('SendRecordingTerminal sends a sealed full window with keepalive before the terminal, synchronously, without stopping the recorder', async () => {
        const { runtime, store, transport, recorder, log } = await startRecorded();
        recorder.Capture(WINDOW + 7);
        const logBefore = log.length;

        runtime.SendRecordingTerminal();

        // Both requests are dispatched inside the handler, the full window first.
        expect(log.slice(logBefore)).toEqual(['upload(keepalive):session-1/0', 'terminal:session-1/1']);
        const { Input } = transport.Terminals[0];
        expect(Input.LastShardIndex).toBe(1);
        expect(Input.CapturedSamples).toBe((WINDOW + 7) * RECORDING_FRAME_SAMPLES);
        expect(ParseRecordingShard(Input.Tail!).PacketCount).toBe(7);
        expect(recorder.StopCalls).toBe(0);
        // No IndexedDB work ran inside the handler.
        expect(store.Log.slice(logBefore).filter((e) => e.startsWith('put:'))).toEqual([]);
        await runtime.EndRealtimeSession();
    });

    it('SendRecordingTerminal stores the shards it sealed only after the handler returns, and keeps them while nothing acknowledges them', async () => {
        // The tail's terminal is refused and its queue retry refused too, so the tail must stay stored.
        const { runtime, store, transport, recorder, log } = await startRecorded(['refused']);
        recorder.Capture(WINDOW + 7);
        transport.TerminalAck = false;
        transport.HoldNextUpload = new Promise(() => undefined); // the keepalive window never answers
        const logBefore = log.length;

        runtime.SendRecordingTerminal();
        for (let i = 0; i < 20; i++) {
            await Promise.resolve(); // microtasks alone (no timer turn) must not reach the store
        }
        expect(store.Log.slice(logBefore).filter((e) => e.startsWith('put:'))).toEqual([]);

        await vi.advanceTimersByTimeAsync(0);
        expect(store.Keys).toEqual(['session-1/0', 'session-1/1']);
        await runtime.EndRealtimeSession();
    });

    it('a keepalive window that is refused falls back to the queue under the same index', async () => {
        const { runtime, store, transport, recorder } = await startRecorded(['refused']);
        recorder.Capture(WINDOW + 7);
        runtime.SendRecordingTerminal();
        await vi.advanceTimersByTimeAsync(0);
        expect(transport.Uploads.map((u) => u.Index)).toEqual([0, 0]);
        expect(store.Keys).toEqual([]); // window acked through the queue, tail acked by the terminal
        await runtime.EndRealtimeSession();
    });

    it('after a hidden-page terminal the call continues at the next index, so no index is sent twice', async () => {
        const { runtime, transport, recorder } = await startRecorded();
        recorder.Capture(7);
        runtime.SendRecordingTerminal();
        recorder.Capture(4);
        await runtime.EndRealtimeSession();

        const tails = transport.Terminals.map((t) => ParseRecordingShard(t.Input.Tail!));
        expect(tails.map((t) => [t.ShardIndex, t.StartSample, t.PacketCount])).toEqual([
            [0, 0, 7],
            [1, 7 * RECORDING_FRAME_SAMPLES, 4],
        ]);
    });

    it('SendRecordingTerminal is a no-op without a recording', () => {
        const transport = new FakeRecordingTransport();
        const runtime = new FakeRecordingRuntime(new FakeRecordingHost(), new FakeShardStore(), transport);
        runtime.SendRecordingTerminal();
        expect(transport.Terminals).toEqual([]);
    });

    it(`stops waiting for a wedged recorder after ${RECORDER_STOP_TIMEOUT_MS} ms, still closes the session, and ends the recording`, async () => {
        const { runtime, provider, transport, recorder } = await startRecorded();
        recorder.Capture(9);
        recorder.StopHangs = true;
        let ended = false;
        void runtime.EndRealtimeSession().then(() => {
            ended = true;
        });
        await vi.advanceTimersByTimeAsync(RECORDER_STOP_TIMEOUT_MS - 1);
        expect(provider.MutationNames).not.toContain('CloseAgentSession');
        await vi.advanceTimersByTimeAsync(1);
        expect(provider.MutationNames).toContain('CloseAgentSession');
        expect(transport.Terminals[0].Input.CapturedSamples).toBe(9 * RECORDING_FRAME_SAMPLES);
        await vi.advanceTimersByTimeAsync(0);
        expect(ended).toBe(true);
    });

    it('drains at the next session start what the previous teardown left in the store', async () => {
        const { runtime, store, transport, recorder } = await startRecorded();
        recorder.Capture(5);
        transport.TerminalAck = false;
        await runtime.EndRealtimeSession();
        expect(store.Keys).toEqual(['session-1/0']);

        transport.TerminalAck = true;
        await runtime.StartRealtimeSessionFromResult(mintedSession('session-2'));
        await vi.advanceTimersByTimeAsync(0);
        expect(transport.Uploads.map((u) => `${u.SessionID}/${u.Index}`)).toEqual(['session-1/0']);
        expect(store.Keys).toEqual([]);
        await runtime.EndRealtimeSession();
    });

    it('falls back to the packets it holds when the recorder fails to stop', async () => {
        const { runtime, transport, recorder } = await startRecorded();
        recorder.Capture(9);
        recorder.StopError = new Error('encoder crashed');
        await runtime.EndRealtimeSession();
        expect(transport.Terminals[0].Input.CapturedSamples).toBe(9 * RECORDING_FRAME_SAMPLES);
    });
});
