import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import { BaseRealtimeClient } from '../generic/baseRealtimeClient';
import { IPcmMicCapture } from '../audio/micCapture';
import { IRealtimePcmPlayback } from '../audio/pcmPlayback';
import {
    xAIRealtimeClient,
    XAIRealtimeEvent,
    IxAIClientSocket,
    XAI_REALTIME_WS_URL,
    XAI_CLIENT_SECRET_SUBPROTOCOL_PREFIX,
    XAI_PCM_SAMPLE_RATE,
} from '../drivers/xaiRealtimeClient';
import { collect, FakeMediaStream, FakeTrack } from './helpers/realtime-fakes';

// ── Fakes (no network, no Web Audio) ───────────────────────────────────────────

/** Parsed outbound frame shape (only the fields the tests inspect). */
interface ParsedFrame {
    type?: string;
    audio?: string;
    session?: JSONObject;
    item?: { type?: string; role?: string; call_id?: string; output?: string; content?: Array<{ type?: string; text?: string }> };
    response?: { instructions?: string };
}

/** Fake realtime socket: records sent frames; lets tests fire open/close/server events. */
class FakeSocket implements IxAIClientSocket {
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
    public EmitServer(event: XAIRealtimeEvent | JSONObject): void {
        this.onmessage?.(JSON.stringify(event));
    }
    /** Injects a raw (possibly non-JSON) inbound frame. */
    public EmitRaw(data: string): void {
        this.onmessage?.(data);
    }
    /** Returns the sent frames parsed as typed client frames. */
    public SentFrames(): ParsedFrame[] {
        return this.Sent.map((s) => JSON.parse(s) as ParsedFrame);
    }
}

/** Fake playout engine standing in for the Web Audio playback clock. */
class FakePlayback implements IRealtimePcmPlayback {
    public Enqueued: ArrayBuffer[] = [];
    public FlushCount = 0;
    public Closed = false;
    /** Controllable stand-in for "playhead is ahead of the context clock". */
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
class TestxAIClient extends xAIRealtimeClient {
    public Fake = new FakeSocket();
    public Playback = new FakePlayback();
    public Capture = new FakeMicCapture();
    public LastUrl: string | null = null;
    public LastSubprotocol: string | null = null;
    /** Rates the driver handed to the audio seams. */
    public PlaybackRate: number | null = null;
    public CaptureRate: number | null = null;
    /** The driver's mic-chunk callback, captured so tests can simulate worklet frames. */
    public OnPcmChunk: ((base64Pcm16: string) => void) | null = null;

    protected override createSocket(url: string, subprotocol: string): IxAIClientSocket {
        this.LastUrl = url;
        this.LastSubprotocol = subprotocol;
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

    /** Drives an inbound xAI server event through the socket handler. */
    public Emit(event: XAIRealtimeEvent | JSONObject): void {
        this.Fake.EmitServer(event);
    }
}

function makeConfig(sessionConfig?: JSONObject): ClientRealtimeSessionConfig {
    return {
        Provider: 'xai',
        Model: 'grok-voice-latest',
        EphemeralToken: 'temp-token-abc',
        ExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        SessionConfig: sessionConfig ?? { type: 'realtime', instructions: 'be the session voice' },
    };
}

/** Lets the in-flight Connect continuation (microtasks) run. */
function flushAsync(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Connects the harness client with one fake mic track; returns the track for assertions. */
async function connect(client: TestxAIClient, sessionConfig?: JSONObject): Promise<FakeTrack> {
    const track = new FakeTrack();
    const promise = client.Connect(makeConfig(sessionConfig), new FakeMediaStream([track]));
    client.Fake.Open();
    await promise;
    return track;
}

/** Drives one model audio delta (marks speaking / playing). */
function emitAudio(client: TestxAIClient, bytes: Uint8Array = new Uint8Array([1, 2, 3, 4])): void {
    client.Emit({ type: 'response.audio.delta', delta: btoa(String.fromCharCode(...bytes)) });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('xAIRealtimeClient', () => {
    let client: TestxAIClient;

    beforeEach(() => {
        client = new TestxAIClient();
    });

    describe('ClassFactory registration', () => {
        it("should resolve via the ClassFactory under the provider key 'xai'", () => {
            const resolved = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeClient>(BaseRealtimeClient, 'xai');
            expect(resolved).toBeInstanceOf(xAIRealtimeClient);
        });
    });

    describe('Connect', () => {
        it('should open the model-on-URL endpoint with the client-secret subprotocol and apply session.update on open', async () => {
            const { states } = collect(client);
            await connect(client);

            expect(client.LastUrl).toBe(`${XAI_REALTIME_WS_URL}?model=grok-voice-latest`);
            expect(client.LastSubprotocol).toBe(`${XAI_CLIENT_SECRET_SUBPROTOCOL_PREFIX}temp-token-abc`);
            expect(client.Fake.SentFrames()[0]).toEqual({
                type: 'session.update',
                session: { type: 'realtime', instructions: 'be the session voice' },
            });
            expect(states).toEqual(['connecting', 'connected', 'listening']);
        });

        it("should build the audio plane at the provider's FIXED 24 kHz rate", async () => {
            await connect(client);
            expect(client.PlaybackRate).toBe(XAI_PCM_SAMPLE_RATE);
            expect(client.CaptureRate).toBe(XAI_PCM_SAMPLE_RATE);
        });

        it('should stream captured mic chunks as input_audio_buffer.append frames', async () => {
            await connect(client);
            client.OnPcmChunk?.('UENNMTY=');
            expect(client.Fake.SentFrames().at(-1)).toEqual({ type: 'input_audio_buffer.append', audio: 'UENNMTY=' });
        });

        it('should NOT send a session.update when the session config is empty', async () => {
            await connect(client, {});
            expect(client.Fake.SentFrames().some((f) => f.type === 'session.update')).toBe(false);
        });

        it('should reject Connect when the socket errors before opening', async () => {
            const promise = client.Connect(makeConfig(), new FakeMediaStream([new FakeTrack()]));
            client.Fake.onerror?.('connection refused');
            await expect(promise).rejects.toThrow('connection refused');
        });

        it('should reject Connect when the socket closes before opening', async () => {
            const promise = client.Connect(makeConfig(), new FakeMediaStream([new FakeTrack()]));
            client.Fake.onclose?.();
            await expect(promise).rejects.toThrow('closed during connect');
        });

        it('should ignore non-JSON inbound frames', async () => {
            await connect(client);
            expect(() => client.Fake.EmitRaw('not json')).not.toThrow();
        });
    });

    describe('transcript translation', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should emit assistant transcript deltas (GA event name) and reflect speaking', () => {
            const { transcripts, states } = collect(client);
            client.Emit({ type: 'response.output_audio_transcript.delta', delta: 'MJ is ' });
            client.Emit({ type: 'response.output_audio_transcript.delta', delta: 'a platform.' });
            expect(transcripts).toEqual([
                { Role: 'Assistant', Text: 'MJ is ', IsFinal: false, Kind: 'normal' },
                { Role: 'Assistant', Text: 'a platform.', IsFinal: false, Kind: 'normal' },
            ]);
            expect(states).toEqual(['speaking']);
        });

        it('should finalize the assistant turn on transcript.done and return to listening', () => {
            const { transcripts, states } = collect(client);
            client.Emit({ type: 'response.output_audio_transcript.delta', delta: 'hi' });
            client.Emit({ type: 'response.output_audio_transcript.done', transcript: 'hi there' });
            expect(transcripts.at(-1)).toEqual({ Role: 'Assistant', Text: 'hi there', IsFinal: true, Kind: 'normal' });
            expect(states).toEqual(['speaking', 'listening']);
        });

        it('should emit the final user transcription (always normal kind)', () => {
            const { transcripts } = collect(client);
            client.Emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'what is MJ?' });
            expect(transcripts).toEqual([{ Role: 'User', Text: 'what is MJ?', IsFinal: true, Kind: 'normal' }]);
        });

        it('should emit nothing for empty transcript payloads', () => {
            const { transcripts } = collect(client);
            client.Emit({ type: 'conversation.item.input_audio_transcription.completed', transcript: '  ' });
            client.Emit({ type: 'response.output_audio_transcript.done', transcript: '' });
            expect(transcripts).toEqual([]);
        });
    });

    describe('audio playback', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should decode response.audio.delta into the playout queue and report IsAudioPlaying from its clock', () => {
            const audioBytes = new Uint8Array([1, 2, 3, 4]);
            expect(client.IsAudioPlaying).toBe(false);

            emitAudio(client, audioBytes);

            expect(client.Playback.Enqueued).toHaveLength(1);
            expect(new Uint8Array(client.Playback.Enqueued[0])).toEqual(audioBytes);
            expect(client.IsAudioPlaying).toBe(true);

            client.Playback.IsPlaying = false; // playhead caught up with the clock
            expect(client.IsAudioPlaying).toBe(false);
        });

        it('should also accept the response.output_audio.delta GA alias', () => {
            client.Emit({ type: 'response.output_audio.delta', delta: btoa('abcd') });
            expect(client.Playback.Enqueued).toHaveLength(1);
        });
    });

    describe('busy / speaking mapping', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should mark busy on response.created and release on response.done', () => {
            const { states } = collect(client);
            client.Emit({ type: 'response.created' });
            emitAudio(client); // marks speaking
            expect(client.IsBusy).toBe(true);

            client.Emit({ type: 'response.done' });
            expect(client.IsBusy).toBe(false);
            expect(states.at(-1)).toBe('listening');
        });

        it('should emit per-response usage as a delta from response.done', () => {
            const { usage } = collectUsage(client);
            client.Emit({ type: 'response.created' });
            client.Emit({ type: 'response.done', response: { usage: { input_tokens: 30, output_tokens: 12 } } });
            expect(usage).toEqual([{ InputTokens: 30, OutputTokens: 12, Raw: { input_tokens: 30, output_tokens: 12 } }]);
        });
    });

    describe('tool calls and tool-result delivery', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should surface a function_call_arguments.done as a tool call and release the busy lock', () => {
            const { toolCalls } = collect(client);
            client.Emit({ type: 'response.created' });
            expect(client.IsBusy).toBe(true);

            client.Emit({
                type: 'response.function_call_arguments.done',
                call_id: 'c_1',
                name: 'invoke-target-agent',
                arguments: '{"request":"do it"}',
            });

            expect(toolCalls).toEqual([
                { CallID: 'c_1', ToolName: 'invoke-target-agent', ArgumentsJson: '{"request":"do it"}' },
            ]);
            // The model yielded the floor pending the result — a queued result can't deadlock.
            expect(client.IsBusy).toBe(false);
        });

        it('should send a tool result as function_call_output then trigger a response when idle', () => {
            const { states } = collect(client);
            client.Emit({
                type: 'response.function_call_arguments.done',
                call_id: 'c_1',
                name: 'get_weather',
                arguments: '{"city":"NYC"}',
            });

            client.SendToolResult('c_1', JSON.stringify({ tempF: 72 }));

            const frames = client.Fake.SentFrames();
            expect(frames.at(-2)).toEqual({
                type: 'conversation.item.create',
                item: { type: 'function_call_output', call_id: 'c_1', output: '{"tempF":72}' },
            });
            expect(frames.at(-1)).toEqual({ type: 'response.create' });
            expect(states.at(-1)).toBe('speaking');
            expect(client.IsBusy).toBe(true);
        });

        it('should QUEUE a tool result behind an in-flight narration and flush on response.done', () => {
            client.Emit({
                type: 'response.function_call_arguments.done',
                call_id: 'c_9',
                name: 'run-agent',
                arguments: '{}',
            });

            // host narrates while the tool runs → a narration reply is in flight
            client.RequestSpokenUpdate('working on it');
            client.Emit({ type: 'response.created' });
            expect(client.IsBusy).toBe(true);
            const framesBeforeResult = client.Fake.Sent.length;

            client.SendToolResult('c_9', '{"success":true,"output":"42"}');
            // item is created, but the response.create trigger is queued behind the narration
            const afterResult = client.Fake.SentFrames();
            expect(afterResult.at(-1)?.item?.type).toBe('function_call_output');
            expect(afterResult.filter((f) => f.type === 'response.create')).toHaveLength(1); // only the narration's

            client.Emit({ type: 'response.done' });
            expect(client.Fake.SentFrames().at(-1)).toEqual({ type: 'response.create' });
            expect(client.IsBusy).toBe(true);
            expect(client.Fake.Sent.length).toBeGreaterThan(framesBeforeResult);
        });

        it('should not clobber a host busy indicator: no state emissions on the tool-call frame', () => {
            const { states } = collect(client);
            client.Emit({ type: 'response.created' });
            emitAudio(client);
            expect(states).toEqual(['speaking']);

            client.Emit({ type: 'response.function_call_arguments.done', call_id: 'c1', name: 'tool', arguments: '{}' });
            // a trailing response.done of the tool-call turn must NOT emit 'listening' over the
            // host's own busy indicator
            client.Emit({ type: 'response.done' });
            expect(states).toEqual(['speaking']);
        });
    });

    describe('SendText', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should inject a user message item then trigger a response, reflecting speaking when idle', () => {
            const { states, transcripts } = collect(client);
            client.SendText('hello there');

            const frames = client.Fake.SentFrames();
            expect(frames.at(-2)).toEqual({
                type: 'conversation.item.create',
                item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello there' }] },
            });
            expect(frames.at(-1)).toEqual({ type: 'response.create' });
            expect(states.at(-1)).toBe('speaking');
            expect(client.IsBusy).toBe(true);
            // no local user-transcript echo — the host owns the echo (obligation #4)
            expect(transcripts).toEqual([]);
        });

        it('should BARGE IN over an in-flight response: cancel, flush playback, then send the typed turn', () => {
            client.Emit({ type: 'response.created' });
            emitAudio(client);

            client.SendText('typed mid-turn');

            const frames = client.Fake.SentFrames();
            expect(frames.some((f) => f.type === 'response.cancel')).toBe(true);
            expect(client.Playback.FlushCount).toBe(1);
            expect(client.IsAudioPlaying).toBe(false);
            expect(frames.at(-1)).toEqual({ type: 'response.create' });
            expect(client.IsBusy).toBe(true); // the typed turn's response is now in flight
        });

        it('should NOT surface a typed barge-in as a user interruption (no delegated-work abort)', () => {
            const { interruptions } = collect(client);
            client.Emit({ type: 'response.created' });
            emitAudio(client);
            client.SendText('typed mid-turn');
            expect(interruptions).toHaveLength(0);
        });

        it('should no-op when the session is not open', () => {
            const fresh = new TestxAIClient();
            fresh.SendText('into the void');
            expect(fresh.Fake.Sent).toHaveLength(0);
        });
    });

    describe('CancelActiveResponse', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should be a no-op when nothing is active', () => {
            const framesBefore = client.Fake.Sent.length;
            client.CancelActiveResponse();
            expect(client.Playback.FlushCount).toBe(0);
            expect(client.Fake.Sent.length).toBe(framesBefore);
        });

        it('should send response.cancel, flush playback, and return the floor', () => {
            const { states } = collect(client);
            client.Emit({ type: 'response.created' });
            emitAudio(client);

            client.CancelActiveResponse();
            expect(client.Fake.SentFrames().some((f) => f.type === 'response.cancel')).toBe(true);
            expect(client.Playback.FlushCount).toBe(1);
            expect(client.IsAudioPlaying).toBe(false);
            expect(client.IsBusy).toBe(false);
            expect(states.at(-1)).toBe('listening');
        });

        it('should flush TAIL audio still playing after the response completed', () => {
            client.Emit({ type: 'response.created' });
            emitAudio(client);
            client.Emit({ type: 'response.done' });
            expect(client.IsBusy).toBe(false);
            expect(client.IsAudioPlaying).toBe(true); // playout runs behind generation

            client.CancelActiveResponse();
            expect(client.Playback.FlushCount).toBe(1);
            expect(client.IsAudioPlaying).toBe(false);
        });
    });

    describe('SendContextNote', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should inject a system message item WITHOUT forcing a reply or changing state', () => {
            const { states } = collect(client);
            client.SendContextNote('[delegated-agent progress] Analyzing the request');
            expect(client.Fake.SentFrames().at(-1)).toEqual({
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'system',
                    content: [{ type: 'input_text', text: '[delegated-agent progress] Analyzing the request' }],
                },
            });
            expect(client.IsBusy).toBe(false);
            expect(states).toEqual([]);
        });
    });

    describe('narration (response.create with instructions)', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should send the instructions and tag the resulting turn as narration, then reset to normal', () => {
            const { transcripts } = collect(client);
            client.RequestSpokenUpdate('Say one short first-person sentence.');
            expect(client.Fake.SentFrames().at(-1)).toEqual({
                type: 'response.create',
                response: { instructions: 'Say one short first-person sentence.' },
            });
            expect(client.IsBusy).toBe(true);

            client.Emit({ type: 'response.created' }); // consumes the narration flag
            client.Emit({ type: 'response.output_audio_transcript.done', transcript: "I'm on it" });
            client.Emit({ type: 'response.done' });

            // a later, model-initiated turn is back to normal kind
            client.Emit({ type: 'response.created' });
            client.Emit({ type: 'response.output_audio_transcript.done', transcript: 'Here is the answer' });

            expect(transcripts).toEqual([
                { Role: 'Assistant', Text: "I'm on it", IsFinal: true, Kind: 'narration' },
                { Role: 'Assistant', Text: 'Here is the answer', IsFinal: true, Kind: 'normal' },
            ]);
        });

        it('should SKIP a narration requested while a response is in flight (disposable)', () => {
            const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
            try {
                client.Emit({ type: 'response.created' });
                const framesBefore = client.Fake.Sent.length;
                client.RequestSpokenUpdate('narrate later');
                expect(client.Fake.Sent.length).toBe(framesBefore); // dropped, not queued
            } finally {
                debug.mockRestore();
            }
        });
    });

    describe('interruption (barge-in) handling', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should flush playout, surface an interruption, and return to listening on a TRUE barge-in', () => {
            const { states, interruptions } = collect(client);
            client.Emit({ type: 'response.created' });
            emitAudio(client);
            expect(client.IsAudioPlaying).toBe(true);

            client.Emit({ type: 'input_audio_buffer.speech_started' });

            expect(client.Playback.FlushCount).toBe(1);
            expect(client.IsAudioPlaying).toBe(false);
            expect(client.IsBusy).toBe(false);
            expect(interruptions).toHaveLength(1);
            expect(states.at(-1)).toBe('listening');
        });

        it('should NOT surface speech_started while idle (user simply taking their turn)', () => {
            const { interruptions } = collect(client);
            client.Emit({ type: 'input_audio_buffer.speech_started' });
            expect(interruptions).toHaveLength(0);
        });
    });

    describe('errors', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should surface provider error frames as NON-fatal errors with the provider code', () => {
            const { errors, states } = collect(client);
            client.Emit({ type: 'error', error: { code: 'invalid_param', message: 'bad value' } });
            expect(errors).toEqual([{ Message: 'bad value', Code: 'invalid_param', Fatal: false }]);
            expect(states).toEqual([]); // the session stays open
        });

        it('should ignore unknown frame types', () => {
            const { states, transcripts, errors } = collect(client);
            const framesBefore = client.Fake.Sent.length;
            client.Emit({ type: 'sparkly_future_event' });
            expect(states).toEqual([]);
            expect(transcripts).toEqual([]);
            expect(errors).toEqual([]);
            expect(client.Fake.Sent.length).toBe(framesBefore);
        });

        it('should surface a socket error as a FATAL error and not emit closed afterwards', () => {
            const { errors, states } = collect(client);
            client.Fake.onerror?.('socket dropped');
            expect(errors).toEqual([{ Message: 'xAI Grok Voice realtime transport error: socket dropped', Fatal: true }]);
            expect(states.at(-1)).toBe('error');

            client.Fake.onclose?.();
            expect(states.at(-1)).toBe('error');
        });

        it('should surface an UNEXPECTED socket close as FATAL', () => {
            const { errors, states } = collect(client);
            client.Fake.onclose?.();
            expect(errors).toEqual([{ Message: 'xAI Grok Voice realtime connection closed unexpectedly', Fatal: true }]);
            expect(states.at(-1)).toBe('error');
        });
    });

    describe('SetMuted / Disconnect', () => {
        it('should toggle mic track enablement via SetMuted', async () => {
            const track = await connect(client);
            client.SetMuted(true);
            expect(track.enabled).toBe(false);
            client.SetMuted(false);
            expect(track.enabled).toBe(true);
        });

        it('should tear everything down and emit closed on Disconnect', async () => {
            const { states } = collect(client);
            const track = await connect(client);
            emitAudio(client);

            await client.Disconnect();

            expect(track.Stopped).toBe(true);
            expect(client.Capture.Stopped).toBe(true);
            expect(client.Playback.Closed).toBe(true);
            expect(client.Fake.Closed).toBe(true);
            expect(states.at(-1)).toBe('closed');
            expect(client.IsBusy).toBe(false);
            expect(client.IsAudioPlaying).toBe(false);
        });

        it('should be safe to Disconnect more than once', async () => {
            await connect(client);
            await client.Disconnect();
            await expect(client.Disconnect()).resolves.toBeUndefined();
        });

        it('should stay silent when the socket closes after a consumer Disconnect', async () => {
            const { errors } = collect(client);
            await connect(client);
            await client.Disconnect();
            client.Fake.onclose?.();
            expect(errors).toEqual([]);
        });
    });
});

// ── Usage collection helper (the shared `collect` doesn't capture usage) ────────

/** Collects usage emissions from a client into an array for assertions. */
function collectUsage(client: BaseRealtimeClient): { usage: Array<{ InputTokens?: number; OutputTokens?: number; Raw?: unknown }> } {
    const usage: Array<{ InputTokens?: number; OutputTokens?: number; Raw?: unknown }> = [];
    client.OnUsage((u) => usage.push(u));
    return { usage };
}
