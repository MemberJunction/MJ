import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BaseRealtimeClient } from '@memberjunction/ai-realtime-client';
import type { IMetadataProvider } from '@memberjunction/core';
import { ParseRecordingShard, RECORDING_FRAME_SAMPLES, RECORDING_SHARD_MAX_PACKETS, RECORDING_SHARD_WINDOW_PACKETS } from '@memberjunction/ai-core-plus';
import {
    MAX_DRAINED_SHARDS_PER_LOAD,
    RECORDER_STOP_TIMEOUT_MS,
    RECORDING_TERMINAL_ACK_TIMEOUT_MS,
    RealtimeSessionRuntime,
    type StartRealtimeClientSessionResult,
} from '../index';
import { FakeRecordingHost, FakeRecordingRuntime, FakeRecordingTransport, FakeShardStore, type FakeUploadOutcome } from './recording-test-helpers';

const WINDOW = RECORDING_SHARD_WINDOW_PACKETS;
const WINDOW_SAMPLES = WINDOW * RECORDING_FRAME_SAMPLES;
/** Packets that make the window seal a shard by count (the format's cap); the rest stays the tail. */
const FULL_SHARD = RECORDING_SHARD_MAX_PACKETS;
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
    public CurrentUser: { ID: string } | null = { ID: 'user-a' };
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
async function startRecorded(script: FakeUploadOutcome[] = []) {
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
        recorder.Capture(WINDOW - 2);
        await vi.advanceTimersByTimeAsync(FLUSH_MS);
        expect(transport.Uploads.map((u) => u.Index)).toEqual([0]);

        recorder.Capture(WINDOW - 4);
        await vi.advanceTimersByTimeAsync(FLUSH_MS);
        expect(transport.Uploads.map((u) => u.Index)).toEqual([0, 1]);

        recorder.Capture(40);
        recorder.PacketsFlushedOnStop = 3;
        recorder.PaddingSamples = 400;
        await runtime.EndRealtimeSession();

        const first = (WINDOW - 2) * RECORDING_FRAME_SAMPLES;
        const second = (WINDOW - 4) * RECORDING_FRAME_SAMPLES;
        const shards = transport.Uploads.map((u) => ParseRecordingShard(u.Bytes));
        expect(shards.map((s) => s.StartSample)).toEqual([0, first]);
        expect(shards.map((s) => s.SampleCount)).toEqual([first, second]);

        expect(transport.Terminals).toHaveLength(1);
        const { Input } = transport.Terminals[0];
        const tail = ParseRecordingShard(Input.Tail!);
        const captured = (2 * WINDOW - 6 + 43) * RECORDING_FRAME_SAMPLES - 400;
        expect(tail.ShardIndex).toBe(2);
        expect(tail.StartSample).toBe(first + second);
        expect(tail.PacketCount).toBe(43);
        expect(tail.SampleCount).toBe(captured - first - second);
        expect(Input.LastShardIndex).toBe(2);
        expect(Input.CapturedSamples).toBe(captured);
    });

    it('seals and uploads what each 5 s tick captured, even under a full window, so no audio waits a second tick', async () => {
        // Capture starts a little after the tick timer, so a real tick holds slightly under 250 packets.
        const { runtime, transport, recorder } = await startRecorded();
        recorder.Capture(WINDOW - 3);
        await vi.advanceTimersByTimeAsync(FLUSH_MS);
        recorder.Capture(WINDOW - 1);
        await vi.advanceTimersByTimeAsync(FLUSH_MS);

        const shards = transport.Uploads.map((u) => ParseRecordingShard(u.Bytes));
        expect(shards.map((s) => [s.ShardIndex, s.StartSample, s.SampleCount])).toEqual([
            [0, 0, (WINDOW - 3) * RECORDING_FRAME_SAMPLES],
            [1, (WINDOW - 3) * RECORDING_FRAME_SAMPLES, (WINDOW - 1) * RECORDING_FRAME_SAMPLES],
        ]);
        await runtime.EndRealtimeSession();
    });

    it('re-sends, during the call, shards an outage made the queue give up on, once uploads succeed again', async () => {
        const { runtime, store, transport, recorder } = await startRecorded();
        transport.Offline = true;
        for (let tick = 0; tick < 4; tick++) {
            recorder.Capture(WINDOW - 2);
            await vi.advanceTimersByTimeAsync(FLUSH_MS);
        }
        // Shards 0 and 1 used up their attempts; they are only in the store now.
        expect(store.Keys).toEqual(['session-1/0', 'session-1/1', 'session-1/2', 'session-1/3']);

        transport.Offline = false;
        recorder.Capture(WINDOW - 2);
        await vi.advanceTimersByTimeAsync(FLUSH_MS);

        // Every shard reached the server before End, so the terminal finds nothing missing.
        expect(store.Keys).toEqual([]);
        await runtime.EndRealtimeSession();
    });

    it('sends a shard the server refused for good once from the queue, and the recovery drain still clears it from the store', async () => {
        // Shard 0 refused by the queue's upload, shard 1 stored, shard 0 refused again by the drain.
        const { runtime, store, transport, recorder } = await startRecorded(['refused', 'stored', 'refused']);
        recorder.Capture(WINDOW - 2);
        for (let tick = 0; tick < 3; tick++) {
            await vi.advanceTimersByTimeAsync(FLUSH_MS);
        }
        // Only shard 0 exists so far: the queue does not retry a refusal on the later ticks.
        expect(transport.Uploads.map((u) => u.Index)).toEqual([0]);
        expect(store.Keys).toEqual(['session-1/0']);

        recorder.Capture(WINDOW - 2);
        await vi.advanceTimersByTimeAsync(FLUSH_MS);
        // Shard 1's ack starts the recovery drain, which re-sends shard 0 and deletes it on the refusal.
        expect(transport.Uploads.map((u) => u.Index)).toEqual([0, 1, 0]);
        expect(store.Keys).toEqual([]);
        await runtime.EndRealtimeSession();
    });

    it('puts each shard in the store before its upload starts and deletes it only after the ack', async () => {
        const { runtime, recorder, log } = await startRecorded();
        recorder.Capture(WINDOW);
        await vi.advanceTimersByTimeAsync(FLUSH_MS);
        expect(log.filter((e) => e.endsWith('session-1/0'))).toEqual(['put:session-1/0', 'upload:session-1/0', 'delete:session-1/0']);
        await runtime.EndRealtimeSession();
    });

    it('keeps a shard whose upload failed (Retry) in the store and resends it under the same index', async () => {
        const { runtime, store, transport, recorder } = await startRecorded(['unavailable']);
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
        await store.Put({ UserID: null, SessionID: 'crashed-session', Index: 4, Bytes: bytes, SavedAt: 1 });
        const transport = new FakeRecordingTransport();
        const runtime = new FakeRecordingRuntime(new FakeRecordingHost(), store, transport);

        await vi.advanceTimersByTimeAsync(0); // the constructor's deferred drain

        expect(transport.Uploads).toEqual([{ SessionID: 'crashed-session', Index: 4, Bytes: bytes, Keepalive: false }]);
        expect(store.Keys).toEqual([]);
        expect(store.Log).toContain(`list:${MAX_DRAINED_SHARDS_PER_LOAD}`);
        await expect(runtime.DrainPendingRecordingShards()).resolves.toBe(0); // once per instance
    });

    it('leaves a pending shard whose drain upload failed (Retry), and defers the drain while there is no transport', async () => {
        const store = new FakeShardStore();
        await store.Put({ UserID: null, SessionID: 'old', Index: 0, Bytes: new Uint8Array([9]), SavedAt: 1 });
        const runtime = new FakeRecordingRuntime(new FakeRecordingHost(), store, null);

        await expect(runtime.DrainPendingRecordingShards()).resolves.toBe(0);
        expect(store.Keys).toEqual(['old/0']);

        runtime.Transport = new FakeRecordingTransport([], ['unavailable']);
        await expect(runtime.DrainPendingRecordingShards()).resolves.toBe(0);
        expect(store.Keys).toEqual(['old/0']);
    });

    it('stores each shard with the user who started the call', async () => {
        const { runtime, store, recorder } = await startRecorded(['unavailable']); // the shard stays stored
        recorder.Capture(WINDOW);
        await vi.advanceTimersByTimeAsync(FLUSH_MS);
        const stored = [...store.Rows.values()];
        expect(stored.length).toBeGreaterThan(0);
        expect(stored.map((r) => r.UserID)).toEqual(stored.map(() => 'user-a'));
        await runtime.EndRealtimeSession();
    });

    it("drains only the signed-in user's stored shards, never another user's (shared browser)", async () => {
        const store = new FakeShardStore();
        await store.Put({ SessionID: 'a-call', UserID: 'user-a', Index: 0, Bytes: new Uint8Array([1]), SavedAt: 1 });
        await store.Put({ SessionID: 'b-call', UserID: 'user-b', Index: 0, Bytes: new Uint8Array([2]), SavedAt: 2 });
        const transport = new FakeRecordingTransport();
        const runtime = new FakeRecordingRuntime(new FakeRecordingHost(), store, transport);
        const provider = new GqlProvider();
        provider.CurrentUser = { ID: 'user-b' };
        runtime.Provider = provider as unknown as IMetadataProvider;

        await expect(runtime.DrainPendingRecordingShards()).resolves.toBe(1);

        expect(transport.Uploads.map((u) => u.SessionID)).toEqual(['b-call']);
        expect(store.Keys).toEqual(['a-call/0']);
    });

    it('deletes a stored shard the server refuses for good, and still drains the shards behind it in the same load', async () => {
        // Live smoke B1: user A's unsent shards (now refused 403: not this caller's session) filled the
        // 50-shard drain page on every load, so user B's own stored shards were never sent.
        const store = new FakeShardStore();
        for (let i = 0; i < MAX_DRAINED_SHARDS_PER_LOAD; i++) {
            await store.Put({ UserID: null, SessionID: 'someone-else', Index: i, Bytes: new Uint8Array([1]), SavedAt: i });
        }
        await store.Put({ UserID: null, SessionID: 'mine', Index: 0, Bytes: new Uint8Array([2]), SavedAt: 1000 });
        const refusals: FakeUploadOutcome[] = Array.from({ length: MAX_DRAINED_SHARDS_PER_LOAD }, () => 'refused');
        const transport = new FakeRecordingTransport([], refusals);
        const runtime = new FakeRecordingRuntime(new FakeRecordingHost(), store, transport);

        await expect(runtime.DrainPendingRecordingShards()).resolves.toBe(1);

        expect(store.Keys).toEqual([]);
        expect(transport.Uploads.filter((u) => u.SessionID === 'mine')).toHaveLength(1);
    });

    it('a drain that could not deliver everything stays armed, so a later call tries again', async () => {
        const store = new FakeShardStore();
        await store.Put({ UserID: null, SessionID: 'old', Index: 0, Bytes: new Uint8Array([9]), SavedAt: 1 });
        const runtime = new FakeRecordingRuntime(new FakeRecordingHost(), store, new FakeRecordingTransport([], ['network-error']));
        await expect(runtime.DrainPendingRecordingShards()).resolves.toBe(0);
        await expect(runtime.DrainPendingRecordingShards()).resolves.toBe(1);
        expect(store.Keys).toEqual([]);
    });

    it('drains at session start, after the constructor found no transport', async () => {
        const store = new FakeShardStore();
        await store.Put({ UserID: 'user-a', SessionID: 'old', Index: 2, Bytes: new Uint8Array([9]), SavedAt: 1 });
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

    it('End flushes the recorder and starts the terminal before it releases the microphone or disconnects the driver', async () => {
        // A tab closed right after End must not lose the audio still inside the encoder: releasing the
        // mic and disconnecting a driver can take long enough for the page to die first, and a pagehide
        // terminal carries only packets already encoded (#5294 gauntlet: 492 ms lost at End + close).
        const { runtime, recorder, log } = await startRecorded();
        const host = (runtime as unknown as { mediaHost: { ReleaseMicrophone?: () => Promise<void> } }).mediaHost;
        host.ReleaseMicrophone = async () => { log.push('release-microphone'); };
        vi.spyOn(FakeRealtimeClient.prototype, 'Disconnect').mockImplementation(async () => { log.push('disconnect'); });
        const stop = recorder.Stop.bind(recorder);
        recorder.Stop = async () => { log.push('recorder-stop'); return stop(); };
        recorder.Capture(5);

        await runtime.EndRealtimeSession();

        const at = (entry: string) => log.findIndex((line) => line.startsWith(entry));
        expect(at('recorder-stop')).toBeGreaterThanOrEqual(0);
        expect(at('terminal:')).toBeGreaterThan(at('recorder-stop'));
        expect(at('release-microphone')).toBeGreaterThan(at('terminal:'));
        expect(at('disconnect')).toBeGreaterThan(at('terminal:'));
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
        // The terminal went out first (nothing may delay it while the page can still close), the tail
        // was stored after it, and the ack released the stored copy.
        expect(store.Log.filter((e) => e.endsWith('session-1/0'))).toEqual(['terminal:session-1/0', 'put:session-1/0', 'delete:session-1/0']);
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

    it('SendRecordingTerminal sends the terminal, then a sealed full window with keepalive, synchronously, without stopping the recorder', async () => {
        const { runtime, store, transport, recorder, log } = await startRecorded();
        recorder.Capture(FULL_SHARD + 7);
        const logBefore = log.length;

        runtime.SendRecordingTerminal();

        // Both requests are dispatched inside the handler, the terminal first so it always gets the
        // keepalive budget; the server assembles as soon as the window it lists as missing arrives.
        expect(log.slice(logBefore)).toEqual(['terminal:session-1/1', 'upload(keepalive):session-1/0']);
        const { Input } = transport.Terminals[0];
        expect(Input.LastShardIndex).toBe(1);
        expect(Input.CapturedSamples).toBe((FULL_SHARD + 7) * RECORDING_FRAME_SAMPLES);
        expect(ParseRecordingShard(Input.Tail!).PacketCount).toBe(7);
        expect(recorder.StopCalls).toBe(0);
        // No IndexedDB work ran inside the handler.
        expect(store.Log.slice(logBefore).filter((e) => e.startsWith('put:'))).toEqual([]);
        await runtime.EndRealtimeSession();
    });

    it('SendRecordingTerminal stores the shards it sealed only after the handler returns, and keeps them while nothing acknowledges them', async () => {
        // The tail's terminal is not acknowledged and its queue retry fails too, so the tail must stay stored.
        const { runtime, store, transport, recorder, log } = await startRecorded(['unavailable']);
        recorder.Capture(FULL_SHARD + 7);
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

    it('a keepalive window whose upload failed (Retry) falls back to the queue under the same index', async () => {
        const { runtime, store, transport, recorder } = await startRecorded(['unavailable']);
        recorder.Capture(FULL_SHARD + 7);
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

    it('SendRecordingTerminal re-sends with keepalive, after the terminal, a shard whose ordinary upload is still in flight', async () => {
        // An ordinary fetch is aborted when the page unloads, so a shard on the wire at pagehide is lost.
        const { runtime, recorder, transport, log } = await startRecorded();
        recorder.Capture(WINDOW - 2);
        transport.HoldNextUpload = new Promise(() => undefined);
        await vi.advanceTimersByTimeAsync(FLUSH_MS);
        recorder.Capture(7);
        const logBefore = log.length;

        runtime.SendRecordingTerminal();

        expect(log.slice(logBefore)).toEqual(['terminal:session-1/1', 'upload(keepalive):session-1/0']);
        await runtime.EndRealtimeSession();
    });

    it('a pagehide while End is still stopping the recorder sends a terminal, and End continues at the next index', async () => {
        const { runtime, transport, recorder } = await startRecorded();
        recorder.Capture(7);
        recorder.PacketsFlushedOnStop = 2;
        let releaseStop: () => void = () => undefined;
        recorder.StopGate = new Promise<void>((resolve) => {
            releaseStop = resolve;
        });
        const ending = runtime.EndRealtimeSession();
        await vi.advanceTimersByTimeAsync(0);
        expect(recorder.StopCalls).toBe(1);

        runtime.SendRecordingTerminal();
        expect(transport.Terminals.map((t) => t.Input.LastShardIndex)).toEqual([0]);

        releaseStop();
        await ending;
        const tails = transport.Terminals.map((t) => ParseRecordingShard(t.Input.Tail!));
        expect(tails.map((t) => [t.ShardIndex, t.StartSample, t.PacketCount])).toEqual([
            [0, 0, 7],
            [1, 7 * RECORDING_FRAME_SAMPLES, 2],
        ]);
    });

    it('a pagehide while End is stopping the recorder does not send a second terminal when Stop flushes zero frames', async () => {
        const { runtime, transport, recorder, log } = await startRecorded();
        recorder.Capture(WINDOW - 2);
        transport.HoldNextUpload = new Promise(() => undefined);
        await vi.advanceTimersByTimeAsync(FLUSH_MS);
        recorder.Capture(7);
        recorder.PacketsFlushedOnStop = 0;
        let releaseStop: () => void = () => undefined;
        recorder.StopGate = new Promise<void>((resolve) => {
            releaseStop = resolve;
        });
        const ending = runtime.EndRealtimeSession();
        await vi.advanceTimersByTimeAsync(0);
        const logBefore = log.length;

        runtime.SendRecordingTerminal();
        releaseStop();
        await ending;

        expect(transport.Terminals).toHaveLength(1);
        expect(transport.Terminals[0].Input.LastShardIndex).toBe(1);
        const networkEvents = log.slice(logBefore).filter((e) => !e.startsWith('put:') && !e.startsWith('delete:'));
        expect(networkEvents).toEqual(['terminal:session-1/1', 'upload(keepalive):session-1/0']);
    });

    it('End re-sends with keepalive, after the terminal, a shard whose ordinary upload is still in flight', async () => {
        const { runtime, recorder, transport, log } = await startRecorded();
        recorder.Capture(WINDOW - 2);
        transport.HoldNextUpload = new Promise(() => undefined);
        await vi.advanceTimersByTimeAsync(FLUSH_MS);
        recorder.Capture(5);
        const logBefore = log.length;

        await runtime.EndRealtimeSession();

        const after = log.slice(logBefore).filter((e) => !e.startsWith('put:') && !e.startsWith('delete:'));
        expect(after).toEqual(['terminal:session-1/1', 'upload(keepalive):session-1/0']);
    });

    it('a hidden-tab terminal is sent as not final; End\'s terminal is final', async () => {
        const { runtime, transport, recorder } = await startRecorded();
        recorder.Capture(7);
        runtime.SendRecordingTerminal({ Final: false });
        recorder.Capture(4);
        await runtime.EndRealtimeSession();
        expect(transport.Terminals.map((t) => t.Input.Final)).toEqual([false, true]);
    });

    it('a pagehide right after a hide does not re-send a shard whose keepalive copy is still in flight', async () => {
        // Closing a tab fires visibilitychange then pagehide back to back; the browser's keepalive budget
        // is per page, so a second copy of the same shard would only eat the host's close-beacon room.
        const { runtime, recorder, transport, log } = await startRecorded();
        recorder.Capture(WINDOW - 2);
        transport.HoldNextUpload = new Promise(() => undefined);
        await vi.advanceTimersByTimeAsync(FLUSH_MS);
        recorder.Capture(7);
        const logBefore = log.length;

        runtime.SendRecordingTerminal({ Final: false });
        recorder.Capture(2);
        runtime.SendRecordingTerminal({ Final: true });

        const sent = log.slice(logBefore);
        expect(sent.filter((e) => e === 'upload(keepalive):session-1/0')).toHaveLength(1);
        expect(sent.filter((e) => e.startsWith('terminal:'))).toEqual(['terminal:session-1/1', 'terminal:session-1/2']);
        await runtime.EndRealtimeSession();
    });

    it('a drain re-armed while it runs runs again, so shards given up on meanwhile are not left for the next load', async () => {
        const store = new FakeShardStore();
        await store.Put({ UserID: null, SessionID: 'old', Index: 0, Bytes: new Uint8Array([1]), SavedAt: 1 });
        const transport = new FakeRecordingTransport();
        let release: (outcome: 'stored') => void = () => undefined;
        transport.HoldNextUpload = new Promise((resolve) => { release = resolve; });
        const runtime = new FakeRecordingRuntime(new FakeRecordingHost(), store, transport);
        const first = runtime.DrainPendingRecordingShards();
        await vi.advanceTimersByTimeAsync(0);

        // While the first run's upload hangs, another shard is given up on and the drain is re-armed.
        await store.Put({ UserID: null, SessionID: 'old', Index: 1, Bytes: new Uint8Array([2]), SavedAt: 2 });
        (runtime as unknown as { rearmPendingShardDrain(): void }).rearmPendingShardDrain();
        void runtime.DrainPendingRecordingShards();
        release('stored');
        await first;
        await vi.advanceTimersByTimeAsync(0);

        expect(store.Keys).toEqual([]);
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
        // The terminal is not acknowledged and the tail's retry as an ordinary shard fails: it stays stored.
        const { runtime, store, transport, recorder } = await startRecorded(['unavailable']);
        recorder.Capture(5);
        transport.TerminalAck = false;
        await runtime.EndRealtimeSession();
        expect(store.Keys).toEqual(['session-1/0']);

        transport.TerminalAck = true;
        await runtime.StartRealtimeSessionFromResult(mintedSession('session-2'));
        await vi.advanceTimersByTimeAsync(0);
        // The failed retry, then the drain at session start.
        expect(transport.Uploads.map((u) => `${u.SessionID}/${u.Index}`)).toEqual(['session-1/0', 'session-1/0']);
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
