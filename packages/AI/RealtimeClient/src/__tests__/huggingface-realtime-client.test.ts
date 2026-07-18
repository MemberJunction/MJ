import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import { BaseRealtimeClient } from '../generic/baseRealtimeClient';
import { IPcmMicCapture } from '../audio/micCapture';
import { IRealtimePcmPlayback } from '../audio/pcmPlayback';
import {
    HuggingFaceRealtimeClient,
    HUGGINGFACE_DEFAULT_PCM_SAMPLE_RATE,
} from '../drivers/huggingFaceRealtimeClient';
import { IOpenAIProtocolClientSocket, OpenAIProtocolServerEvent } from '../generic/openAIProtocolClient';
import { collect, FakeMediaStream, FakeTrack } from './helpers/realtime-fakes';

// ── Fakes (no network, no Web Audio) ───────────────────────────────────────────

/** Parsed outbound frame shape (only the fields the tests inspect). */
interface ParsedFrame {
    type?: string;
    audio?: string;
    session?: JSONObject;
    item?: { type?: string; role?: string; call_id?: string; output?: string; content?: unknown };
    response?: { instructions?: string };
}

/** Fake proxy socket: records sent frames; lets tests fire open/close/server events. */
class FakeProxySocket implements IOpenAIProtocolClientSocket {
    public onopen: (() => void) | null = null;
    public onmessage: ((data: string) => void) | null = null;
    public onerror: ((message: string) => void) | null = null;
    public onclose: (() => void) | null = null;
    public Sent: string[] = [];
    public Closed = false;

    public send(data: string): void {
        this.Sent.push(data);
    }
    public close(): void {
        this.Closed = true;
    }

    /** Fires the open handler (like the real socket does once connected). */
    public Open(): void {
        this.onopen?.();
    }
    /** Injects a provider server event as an inbound JSON frame. */
    public EmitServer(event: OpenAIProtocolServerEvent | JSONObject): void {
        this.onmessage?.(JSON.stringify(event));
    }
    /** Injects a raw (possibly non-JSON) inbound frame. */
    public EmitRaw(data: string): void {
        this.onmessage?.(data);
    }
    /** Returns the sent frames parsed as typed client frames. */
    public Frames(): ParsedFrame[] {
        return this.Sent.map((s) => JSON.parse(s) as ParsedFrame);
    }
}

/** Fake playout engine standing in for the Web Audio playback clock. */
class FakePlayback implements IRealtimePcmPlayback {
    public Enqueued: ArrayBuffer[] = [];
    public FlushCount = 0;
    public Closed = false;
    public IsPlaying = false;

    public Enqueue(pcm16: ArrayBuffer): void {
        this.Enqueued.push(pcm16);
        this.IsPlaying = true;
    }
    public Flush(): void {
        this.FlushCount++;
        this.IsPlaying = false;
    }
    public Close(): void {
        this.Closed = true;
        this.IsPlaying = false;
    }
}

/** Fake mic capture handle. */
class FakeMicCapture implements IPcmMicCapture {
    public Stopped = false;
    public Stop(): void {
        this.Stopped = true;
    }
}

// ── Test harness ───────────────────────────────────────────────────────────────

/** Harness overriding all three creation seams so Connect runs with NO network / audio. */
class TestHuggingFaceClient extends HuggingFaceRealtimeClient {
    public Fake = new FakeProxySocket();
    public Playback = new FakePlayback();
    public Capture = new FakeMicCapture();
    public LastUrl: string | null = null;
    /** Rates the driver handed to the audio seams. */
    public PlaybackRate: number | null = null;
    public CaptureRate: number | null = null;
    /** The driver's mic-chunk callback, captured so tests can simulate worklet frames. */
    public OnPcmChunk: ((base64Pcm16: string) => void) | null = null;

    protected override createSocket(url: string): IOpenAIProtocolClientSocket {
        this.LastUrl = url;
        return this.Fake;
    }
    protected override async createMicCapture(
        _micStream: MediaStream,
        sampleRate: number,
        onPcmChunk: (base64Pcm16: string) => void
    ): Promise<IPcmMicCapture> {
        this.CaptureRate = sampleRate;
        this.OnPcmChunk = onPcmChunk;
        return this.Capture;
    }
    protected override createPlayback(sampleRate: number): IRealtimePcmPlayback {
        this.PlaybackRate = sampleRate;
        return this.Playback;
    }

    /** Drives an inbound OpenAI-Realtime server event through the socket handler. */
    public Emit(event: OpenAIProtocolServerEvent | JSONObject): void {
        this.Fake.EmitServer(event);
    }
}

// The proxy URL IS the credential (ElevenLabs-style): EphemeralToken is the wss://…/realtime-proxy?ticket=… URL.
const PROXY_URL = 'wss://api.example.com/realtime-proxy?ticket=abc123';

function makeConfig(sessionConfig?: JSONObject): ClientRealtimeSessionConfig {
    return {
        Provider: 'huggingface',
        Model: 'speech-to-speech',
        EphemeralToken: PROXY_URL,
        ExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        SessionConfig: sessionConfig ?? { session: { instructions: 'be the session voice' } },
    };
}

/** Lets the in-flight Connect continuation (microtasks) run. */
function flushAsync(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Connects the harness client with one fake mic track; returns the track for assertions. */
async function connect(client: TestHuggingFaceClient, sessionConfig?: JSONObject): Promise<FakeTrack> {
    const track = new FakeTrack();
    const promise = client.Connect(makeConfig(sessionConfig), new FakeMediaStream([track]));
    client.Fake.Open();
    await flushAsync();
    client.Fake.EmitServer({ type: 'session.created' });
    await promise;
    return track;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('HuggingFaceRealtimeClient', () => {
    let client: TestHuggingFaceClient;

    beforeEach(() => {
        client = new TestHuggingFaceClient();
    });

    describe('ClassFactory registration', () => {
        it("should resolve via the ClassFactory under the provider key 'huggingface'", () => {
            const resolved = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeClient>(BaseRealtimeClient, 'huggingface');
            expect(resolved).toBeInstanceOf(HuggingFaceRealtimeClient);
        });
    });

    describe('Connect', () => {
        it('should open the proxy URL verbatim and apply session.update only after session.created', async () => {
            const { states } = collect(client);
            await connect(client);

            expect(client.LastUrl).toBe(PROXY_URL);
            expect(client.Fake.Frames()[0]).toEqual({
                type: 'session.update',
                session: { instructions: 'be the session voice' },
            });
            expect(states).toEqual(['connecting', 'connected', 'listening']);
        });

        it("should NOT send session.update or report 'listening' before session.created", async () => {
            const { states } = collect(client);
            const promise = client.Connect(makeConfig(), new FakeMediaStream([new FakeTrack()]));
            client.Fake.Open();
            await flushAsync();

            // socket open, but the endpoint has not confirmed the session — nothing configured yet
            expect(states).toEqual(['connecting', 'connected']);
            expect(client.Fake.Frames()).toEqual([]);

            client.Fake.EmitServer({ type: 'session.created' });
            await promise;
            expect(states).toEqual(['connecting', 'connected', 'listening']);
        });

        it("should build the audio plane at HuggingFace's native 16 kHz both directions", async () => {
            await connect(client);
            expect(HUGGINGFACE_DEFAULT_PCM_SAMPLE_RATE).toBe(16000);
            expect(client.PlaybackRate).toBe(16000);
            expect(client.CaptureRate).toBe(16000);
        });

        it('should honor a deployment sampleRate override from the server pact', async () => {
            await connect(client, { session: { instructions: 'x' }, sampleRate: 24000 });
            expect(client.PlaybackRate).toBe(24000);
            expect(client.CaptureRate).toBe(24000);
        });

        it('should stream captured mic chunks as input_audio_buffer.append frames', async () => {
            await connect(client);
            client.OnPcmChunk?.('UENNMTY=');
            expect(client.Fake.Frames().at(-1)).toEqual({ type: 'input_audio_buffer.append', audio: 'UENNMTY=' });
        });

        it('should ignore non-JSON inbound frames', async () => {
            await connect(client);
            expect(() => client.Fake.EmitRaw('not json')).not.toThrow();
        });
    });

    describe('tool calling (HuggingFace wire shape)', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should surface response.function_call_arguments.done as a tool call (done-only args, no delta)', () => {
            const { toolCalls } = collect(client);
            client.Emit({
                type: 'response.function_call_arguments.done',
                call_id: 'call_1',
                name: 'invoke-target-agent',
                arguments: '{"message":"hi"}',
            });
            expect(toolCalls).toEqual([{ CallID: 'call_1', ToolName: 'invoke-target-agent', ArgumentsJson: '{"message":"hi"}' }]);
        });

        it('should NOT treat a function_call_arguments.delta frame as a tool call (HF sends done only)', () => {
            const { toolCalls } = collect(client);
            client.Emit({ type: 'response.function_call_arguments.delta', call_id: 'call_1', delta: '{"par' } as JSONObject);
            expect(toolCalls).toEqual([]);
        });

        it('should send function_call_output THEN response.create when idle (exact HF tool-result contract)', () => {
            // model emitted a tool call and yielded the floor
            client.Emit({ type: 'response.function_call_arguments.done', call_id: 'call_1', name: 'f', arguments: '{}' });
            const before = client.Fake.Sent.length;

            client.SendToolResult('call_1', '{"ok":true}');

            const frames = client.Fake.Frames().slice(before);
            expect(frames).toEqual([
                { type: 'conversation.item.create', item: { type: 'function_call_output', call_id: 'call_1', output: '{"ok":true}' } },
                { type: 'response.create' },
            ]);
        });

        it('should queue the result response.create until the active response finishes, then fire it once', () => {
            // a normal spoken response is in flight (response.created seen, no done yet)
            client.Emit({ type: 'response.created' });
            const before = client.Fake.Sent.length;

            client.SendToolResult('call_1', '{"ok":true}');

            // the result item is posted immediately, but response.create is deferred (no overlap)
            let frames = client.Fake.Frames().slice(before);
            expect(frames).toEqual([
                { type: 'conversation.item.create', item: { type: 'function_call_output', call_id: 'call_1', output: '{"ok":true}' } },
            ]);

            // when the in-flight response completes, the queued reply fires exactly once
            client.Emit({ type: 'response.done', response: {} });
            frames = client.Fake.Frames().slice(before);
            expect(frames.filter((f) => f.type === 'response.create')).toEqual([{ type: 'response.create' }]);
        });
    });
});

describe('HuggingFaceRealtimeClient (extended edge coverage)', () => {
    let client: TestHuggingFaceClient;

    beforeEach(() => {
        client = new TestHuggingFaceClient();
    });

    describe('server-pact parsing', () => {
        it('defaults the audio plane to 16 kHz when the pact omits sampleRate', async () => {
            await connect(client);
            expect(client.PlaybackRate).toBe(HUGGINGFACE_DEFAULT_PCM_SAMPLE_RATE);
            expect(client.CaptureRate).toBe(HUGGINGFACE_DEFAULT_PCM_SAMPLE_RATE);
        });

        it('honors the pact sampleRate for BOTH capture and playout', async () => {
            await connect(client, { session: { instructions: 'x' }, sampleRate: 24000 });
            expect(client.PlaybackRate).toBe(24000);
            expect(client.CaptureRate).toBe(24000);
        });

        it('treats a malformed pact session (array) as empty and sends no session.update', async () => {
            await connect(client, { session: ['not', 'an', 'object'] as unknown as JSONObject });
            expect(client.Fake.Frames().filter((f) => f.type === 'session.update')).toHaveLength(0);
        });

        it('treats a pact with no session key as empty and sends no session.update', async () => {
            await connect(client, { sampleRate: 16000 });
            expect(client.Fake.Frames().filter((f) => f.type === 'session.update')).toHaveLength(0);
        });

        it('ignores a non-positive pact sampleRate and falls back to the default', async () => {
            await connect(client, { session: { instructions: 'x' }, sampleRate: -1 });
            expect(client.PlaybackRate).toBe(HUGGINGFACE_DEFAULT_PCM_SAMPLE_RATE);
        });
    });

    describe('audio plane', () => {
        it('streams captured mic chunks as input_audio_buffer.append frames', async () => {
            await connect(client);
            client.OnPcmChunk?.('BASE64CHUNK');
            const appends = client.Fake.Frames().filter((f) => f.type === 'input_audio_buffer.append');
            expect(appends).toEqual([{ type: 'input_audio_buffer.append', audio: 'BASE64CHUNK' }]);
        });

        it('decodes audio deltas into the playout queue and reflects speaking + IsAudioPlaying', async () => {
            const { states } = collect(client);
            await connect(client);
            client.Emit({ type: 'response.output_audio.delta', delta: Buffer.from([1, 2]).toString('base64') });
            expect(client.Playback.Enqueued).toHaveLength(1);
            expect(client.IsAudioPlaying).toBe(true);
            expect(states.at(-1)).toBe('speaking');
        });

        it('also accepts the beta response.audio.delta alias', async () => {
            await connect(client);
            client.Emit({ type: 'response.audio.delta', delta: Buffer.from([3]).toString('base64') });
            expect(client.Playback.Enqueued).toHaveLength(1);
        });

        it('toggles mic tracks via SetMuted (stream stays up, silence flows)', async () => {
            const track = await connect(client);
            client.SetMuted(true);
            expect(track.enabled).toBe(false);
            client.SetMuted(false);
            expect(track.enabled).toBe(true);
        });
    });

    describe('tool-call loop + response state machine', () => {
        it('surfaces a tool call, releases the busy lock, and never clobbers a host busy indicator', async () => {
            const seen = collect(client);
            await connect(client);
            client.Emit({ type: 'response.created' });
            expect(client.IsBusy).toBe(true);
            const statesBefore = [...seen.states];
            client.Emit({ type: 'response.function_call_arguments.done', call_id: 'c9', name: 'lookup', arguments: '{"q":"x"}' });
            expect(seen.toolCalls).toEqual([{ CallID: 'c9', ToolName: 'lookup', ArgumentsJson: '{"q":"x"}' }]);
            expect(client.IsBusy).toBe(false); // deadlock guard on websocket transports
            expect(seen.states).toEqual(statesBefore); // NO state emission on the tool-call frame
        });

        it('sends a tool result as function_call_output then triggers a response when idle', async () => {
            await connect(client);
            client.SendToolResult('c9', '{"ok":true}');
            const frames = client.Fake.Frames().slice(1); // skip initial session.update
            expect(frames[0]).toMatchObject({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: 'c9', output: '{"ok":true}' } });
            expect(frames[1]).toMatchObject({ type: 'response.create' });
            expect(client.IsBusy).toBe(true);
        });

        it('QUEUES a tool result behind an in-flight narration and flushes it on response.done', async () => {
            await connect(client);
            client.RequestSpokenUpdate('still working…');
            const before = client.Fake.Frames().filter((f) => f.type === 'response.create').length;
            client.SendToolResult('c1', '{"done":1}');
            // Item goes out now; the trigger waits (no second response.create yet).
            expect(client.Fake.Frames().filter((f) => f.type === 'response.create').length).toBe(before);
            client.Emit({ type: 'response.created' });
            client.Emit({ type: 'response.done', response: {} });
            expect(client.Fake.Frames().filter((f) => f.type === 'response.create').length).toBe(before + 1);
        });

        it('emits per-response usage deltas from response.done', async () => {
            const usage: Array<{ InputTokens?: number; OutputTokens?: number }> = [];
            client.OnUsage((u) => usage.push(u));
            await connect(client);
            client.Emit({ type: 'response.done', response: { usage: { input_tokens: 11, output_tokens: 7 } } });
            expect(usage).toEqual([{ InputTokens: 11, OutputTokens: 7, Raw: { input_tokens: 11, output_tokens: 7 } }]);
        });

        it('a response.done without usage emits nothing', async () => {
            const usage: Array<{ InputTokens?: number }> = [];
            client.OnUsage((u) => usage.push(u));
            await connect(client);
            client.Emit({ type: 'response.done', response: {} });
            expect(usage).toHaveLength(0);
        });
    });

    describe('narration tagging', () => {
        it('tags the narration turn transcripts as narration and resets on response.done', async () => {
            const seen = collect(client);
            await connect(client);
            client.RequestSpokenUpdate('progress update');
            client.Emit({ type: 'response.created' });
            client.Emit({ type: 'response.output_audio_transcript.delta', delta: 'Working…' });
            client.Emit({ type: 'response.output_audio_transcript.done', transcript: 'Working on it.' });
            client.Emit({ type: 'response.done', response: {} });
            client.Emit({ type: 'response.created' });
            client.Emit({ type: 'response.output_audio_transcript.delta', delta: 'Answer' });
            const kinds = seen.transcripts.map((t) => `${t.Text}:${t.Kind}`);
            expect(kinds).toContain('Working…:narration');
            expect(kinds).toContain('Working on it.:narration');
            expect(kinds).toContain('Answer:normal');
        });

        it('skips RequestSpokenUpdate while a response is in flight (narration is disposable)', async () => {
            await connect(client);
            client.Emit({ type: 'response.created' });
            const before = client.Fake.Sent.length;
            client.RequestSpokenUpdate('too late');
            expect(client.Fake.Sent.length).toBe(before);
        });
    });

    describe('barge-in + cancel', () => {
        it('flushes local playback and emits interruption ONLY on true barge-in', async () => {
            const seen = collect(client);
            await connect(client);
            client.Emit({ type: 'input_audio_buffer.speech_started' }); // idle — normal turn
            expect(seen.interruptions).toHaveLength(0);
            client.Emit({ type: 'response.created' });
            client.Emit({ type: 'response.output_audio.delta', delta: Buffer.from([1]).toString('base64') });
            client.Emit({ type: 'input_audio_buffer.speech_started' }); // over active output
            expect(seen.interruptions).toHaveLength(1);
            expect(client.Playback.FlushCount).toBeGreaterThan(0);
        });

        it('SendText implies barge-in: cancels the active response, injects, and re-triggers', async () => {
            await connect(client);
            client.Emit({ type: 'response.created' });
            client.SendText('typed question');
            const frames = client.Fake.Frames().slice(1);
            expect(frames.map((f) => f.type)).toEqual(['response.cancel', 'conversation.item.create', 'response.create']);
            expect(frames[1].item).toMatchObject({ type: 'message', role: 'user' });
        });

        it('CancelActiveResponse is a strict no-op when idle', async () => {
            await connect(client);
            const before = client.Fake.Sent.length;
            client.CancelActiveResponse();
            expect(client.Fake.Sent.length).toBe(before);
        });

        it('CancelActiveResponse preserves a queued tool-result trigger across the cancel', async () => {
            await connect(client);
            client.RequestSpokenUpdate('narrating…');
            client.Emit({ type: 'response.created' }); // server echo for the narration (real wire ordering)
            client.SendToolResult('c1', '{"r":1}'); // queues behind the narration
            client.CancelActiveResponse();
            client.Emit({ type: 'response.done', response: {} }); // trailing done of the cancelled turn
            const creates = client.Fake.Frames().filter((f) => f.type === 'response.create');
            expect(creates.length).toBeGreaterThanOrEqual(2); // narration + the flushed result trigger
        });
    });

    describe('transport failure semantics', () => {
        it('a socket error is FATAL and sticks (no closed emission afterwards)', async () => {
            const seen = collect(client);
            await connect(client);
            client.Fake.onerror?.('proxy hop died');
            expect(seen.errors).toEqual([{ Message: 'proxy hop died', Fatal: true }]);
            expect(seen.states.at(-1)).toBe('error');
            client.Fake.onclose?.();
            expect(seen.states.at(-1)).toBe('error');
        });

        it('an UNEXPECTED close is a benign terminal closed (NOT the cloud-provider fatal)', async () => {
            const seen = collect(client);
            await connect(client);
            client.Fake.onclose?.();
            expect(seen.errors).toHaveLength(0); // no fatal error for a self-hosted proxy hop close
            expect(seen.states.at(-1)).toBe('closed');
        });

        it('a provider error FRAME is non-fatal and the session continues', async () => {
            const seen = collect(client);
            await connect(client);
            client.Emit({ type: 'error', error: { message: 'bad item', code: 'invalid_item' } });
            expect(seen.errors).toEqual([{ Message: 'bad item', Code: 'invalid_item', Fatal: false }]);
            expect(seen.states.at(-1)).not.toBe('error');
        });

        it('ignores non-JSON frames and JSON scalars', async () => {
            const seen = collect(client);
            await connect(client);
            client.Fake.EmitRaw('%%% not json');
            client.Fake.EmitRaw('null');
            client.Fake.EmitRaw('42');
            client.Fake.EmitRaw('"just a string"');
            expect(seen.errors).toHaveLength(0);
            expect(seen.transcripts).toHaveLength(0);
        });
    });

    describe('Disconnect', () => {
        it('tears down socket, capture, playback, and mic tracks; emits terminal closed', async () => {
            const seen = collect(client);
            const track = await connect(client);
            await client.Disconnect();
            expect(client.Fake.Closed).toBe(true);
            expect(client.Capture.Stopped).toBe(true);
            expect(client.Playback.Closed).toBe(true);
            expect(track.readyState).toBe('ended');
            expect(seen.states.at(-1)).toBe('closed');
        });

        it('a socket close after consumer Disconnect stays silent', async () => {
            const seen = collect(client);
            await connect(client);
            await client.Disconnect();
            const statesBefore = [...seen.states];
            client.Fake.onclose?.();
            expect(seen.states).toEqual(statesBefore);
            expect(seen.errors).toHaveLength(0);
        });

        it('is idempotent — a second Disconnect neither throws nor re-emits', async () => {
            await connect(client);
            await client.Disconnect();
            await expect(client.Disconnect()).resolves.toBeUndefined();
        });

        it('resets the response state machine so a stale busy flag cannot survive reconnection', async () => {
            await connect(client);
            client.Emit({ type: 'response.created' });
            expect(client.IsBusy).toBe(true);
            await client.Disconnect();
            expect(client.IsBusy).toBe(false);
        });
    });

    describe('unicode + payload integrity', () => {
        it('round-trips unicode transcripts verbatim', async () => {
            const seen = collect(client);
            await connect(client);
            const text = 'Привет 👋 — ¿cómo estás? 中文';
            client.Emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: text });
            expect(seen.transcripts).toContainEqual({ Role: 'User', Text: text, IsFinal: true, Kind: 'normal' });
        });
    });
});

describe('QA hardening: B1 connect lifecycle (timeout + orphaned-promise fixes)', () => {
    let client: TestHuggingFaceClient;

    beforeEach(() => {
        client = new TestHuggingFaceClient();
    });

    it('rejects Connect (fatal error, error state) when the endpoint opens but stays SILENT past the deadline', async () => {
        vi.useFakeTimers();
        try {
            const seen = collect(client);
            const promise = client.Connect(makeConfig(), new FakeMediaStream([new FakeTrack()]));
            const guarded = expect(promise).rejects.toThrow(/timed out/);
            client.Fake.Open(); // socket opens…
            await vi.advanceTimersByTimeAsync(15_001); // …but session.created never arrives
            await guarded;
            expect(seen.errors.some((e) => e.Fatal && /timed out/.test(e.Message))).toBe(true);
            expect(seen.states.at(-1)).toBe('error');
        } finally {
            vi.useRealTimers();
        }
    });

    it('rejects Connect when the socket ERRORS during the session.created wait (previously hung forever)', async () => {
        const promise = client.Connect(makeConfig(), new FakeMediaStream([new FakeTrack()]));
        const guarded = expect(promise).rejects.toThrow('proxy died mid-handshake');
        client.Fake.Open();
        await flushAsync();
        client.Fake.onerror?.('proxy died mid-handshake');
        await guarded;
    });

    it('rejects Connect when the socket CLOSES during the session.created wait', async () => {
        const promise = client.Connect(makeConfig(), new FakeMediaStream([new FakeTrack()]));
        const guarded = expect(promise).rejects.toThrow(/closed during connect/);
        client.Fake.Open();
        await flushAsync();
        client.Fake.onclose?.();
        await guarded;
    });

    it('releases a pending Connect when the consumer Disconnects mid-handshake (no orphaned promise)', async () => {
        const promise = client.Connect(makeConfig(), new FakeMediaStream([new FakeTrack()]));
        const guarded = expect(promise).rejects.toThrow(/disconnected during connect/);
        client.Fake.Open();
        await flushAsync();
        await client.Disconnect();
        await guarded;
    });

    it('the happy path is unaffected by the deadline machinery', async () => {
        await connect(client); // helper drives open + session.created
        expect(client.IsBusy).toBe(false);
    });
});

describe('QA hardening: B5 pre-open send guard', () => {
    it('an action invoked after socket-assign but BEFORE open is a clean no-op (no throw, no frame)', async () => {
        const client = new TestHuggingFaceClient();
        const promise = client.Connect(makeConfig(), new FakeMediaStream([new FakeTrack()]));
        // Socket exists (createSocket ran synchronously) but onopen has not fired.
        expect(() => client.SendContextNote('too early')).not.toThrow();
        expect(client.Fake.Sent).toHaveLength(0);
        client.Fake.Open();
        await flushAsync();
        client.Fake.EmitServer({ type: 'session.created' });
        await promise;
        client.SendContextNote('now it works');
        expect(client.Fake.Frames().some((f) => f.type === 'conversation.item.create')).toBe(true);
    });
});
