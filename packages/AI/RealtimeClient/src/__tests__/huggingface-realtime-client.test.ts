import { describe, it, expect, beforeEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import { BaseRealtimeClient } from '../generic/baseRealtimeClient';
import { IPcmMicCapture } from '../audio/micCapture';
import { IRealtimePcmPlayback } from '../audio/pcmPlayback';
import {
    HuggingFaceRealtimeClient,
    HuggingFaceClientServerEvent,
    IHuggingFaceClientSocket,
    HUGGINGFACE_DEFAULT_PCM_SAMPLE_RATE,
} from '../drivers/huggingFaceRealtimeClient';
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
class FakeProxySocket implements IHuggingFaceClientSocket {
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
    public EmitServer(event: HuggingFaceClientServerEvent | JSONObject): void {
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

    protected override createSocket(url: string): IHuggingFaceClientSocket {
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
    public Emit(event: HuggingFaceClientServerEvent | JSONObject): void {
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
