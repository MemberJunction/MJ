import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import { BaseRealtimeClient } from '../generic/baseRealtimeClient';
import { IPcmMicCapture } from '../audio/micCapture';
import { IRealtimePcmPlayback } from '../audio/pcmPlayback';
import {
    ElevenLabsRealtimeClient,
    ElevenLabsServerEvent,
    IElevenLabsClientSocket,
} from '../drivers/elevenLabsRealtimeClient';
import { collect, FakeMediaStream, FakeTrack } from './helpers/realtime-fakes';

// ── Fakes (no network, no Web Audio) ───────────────────────────────────────────

/** Parsed outbound frame shape (only the fields the tests inspect). */
interface ParsedFrame {
    type?: string;
    user_audio_chunk?: string;
    text?: string;
    conversation_config_override?: JSONObject;
    tool_call_id?: string;
    result?: unknown;
    is_error?: boolean;
    event_id?: number;
}

/** Fake conversation socket: records sent frames; lets tests fire open/close/server events. */
class FakeElevenSocket implements IElevenLabsClientSocket {
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
    public EmitServer(event: ElevenLabsServerEvent | JSONObject): void {
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
class TestElevenLabsClient extends ElevenLabsRealtimeClient {
    public Fake = new FakeElevenSocket();
    public Playback = new FakePlayback();
    public Capture = new FakeMicCapture();
    public LastSignedUrl: string | null = null;
    /** Negotiated rates the driver handed to the audio seams. */
    public PlaybackRate: number | null = null;
    public CaptureRate: number | null = null;
    /** The driver's mic-chunk callback, captured so tests can simulate worklet frames. */
    public OnPcmChunk: ((base64Pcm16: string) => void) | null = null;

    protected override createSocket(signedUrl: string): IElevenLabsClientSocket {
        this.LastSignedUrl = signedUrl;
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

    /** Drives an inbound ElevenLabs server event through the socket handler. */
    public Emit(event: ElevenLabsServerEvent | JSONObject): void {
        this.Fake.EmitServer(event);
    }
}

function makeConfig(sessionConfig?: JSONObject): ClientRealtimeSessionConfig {
    return {
        Provider: 'elevenlabs',
        Model: 'MJ Realtime Co-Agent',
        EphemeralToken: 'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_1&token=signed-token',
        ExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        SessionConfig: sessionConfig ?? {
            agentId: 'agent_1',
            overrides: { agent: { prompt: { prompt: 'be the session voice' } } },
            config: {},
        },
    };
}

function metadataEvent(outputFormat = 'pcm_16000', inputFormat = 'pcm_16000'): ElevenLabsServerEvent {
    return {
        type: 'conversation_initiation_metadata',
        conversation_initiation_metadata_event: {
            conversation_id: 'conv_1',
            agent_output_audio_format: outputFormat,
            user_input_audio_format: inputFormat,
        },
    };
}

/** Lets the in-flight Connect continuation (microtasks) run. */
function flushAsync(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Connects the harness client with one fake mic track; returns the track for assertions. */
async function connect(
    client: TestElevenLabsClient,
    sessionConfig?: JSONObject,
    metadata: ElevenLabsServerEvent = metadataEvent()
): Promise<FakeTrack> {
    const track = new FakeTrack();
    const promise = client.Connect(makeConfig(sessionConfig), new FakeMediaStream([track]));
    client.Fake.Open();
    client.Fake.EmitServer(metadata);
    await promise;
    return track;
}

/** Drives a model audio frame (marks speaking / playing). */
function emitAudio(client: TestElevenLabsClient, bytes: Uint8Array = new Uint8Array([1, 2, 3, 4])): void {
    client.Emit({ type: 'audio', audio_event: { audio_base_64: btoa(String.fromCharCode(...bytes)), event_id: 1 } });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ElevenLabsRealtimeClient', () => {
    let client: TestElevenLabsClient;

    beforeEach(() => {
        client = new TestElevenLabsClient();
    });

    describe('ClassFactory registration', () => {
        it("should resolve via the ClassFactory under the provider key 'elevenlabs'", () => {
            const resolved = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeClient>(BaseRealtimeClient, 'elevenlabs');
            expect(resolved).toBeInstanceOf(ElevenLabsRealtimeClient);
        });
    });

    describe('Connect', () => {
        it('should open the signed URL and send the initiation frame carrying the prompt override', async () => {
            const { states } = collect(client);
            await connect(client);

            expect(client.LastSignedUrl).toBe(
                'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_1&token=signed-token'
            );
            expect(client.Fake.SentFrames()[0]).toEqual({
                type: 'conversation_initiation_client_data',
                conversation_config_override: { agent: { prompt: { prompt: 'be the session voice' } } },
            });
            expect(states).toEqual(['connecting', 'connected', 'listening']);
        });

        it("should NOT report 'listening' until the initiation metadata confirms the session config", async () => {
            const { states } = collect(client);
            const promise = client.Connect(makeConfig(), new FakeMediaStream([new FakeTrack()]));
            client.Fake.Open();
            await flushAsync();

            // socket open + init sent, but no metadata yet — the session is not configured
            expect(states).toEqual(['connecting', 'connected']);
            expect(client.IsBusy).toBe(false);

            client.Fake.EmitServer(metadataEvent());
            await promise;
            expect(states).toEqual(['connecting', 'connected', 'listening']);
        });

        it('should build the audio plane at the NEGOTIATED sample rates', async () => {
            await connect(client, undefined, metadataEvent('pcm_24000', 'pcm_8000'));
            expect(client.PlaybackRate).toBe(24000);
            expect(client.CaptureRate).toBe(8000);
        });

        it('should fall back to the platform default (with a warning) on a non-PCM format', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            try {
                await connect(client, undefined, metadataEvent('ulaw_8000', 'pcm_16000'));
                expect(client.PlaybackRate).toBe(16000);
                expect(warn).toHaveBeenCalledOnce();
            } finally {
                warn.mockRestore();
            }
        });

        it('should stream captured mic chunks as bare-key user_audio_chunk frames', async () => {
            await connect(client);
            client.OnPcmChunk?.('UENNMTY=');
            expect(client.Fake.SentFrames().at(-1)).toEqual({ user_audio_chunk: 'UENNMTY=' });
        });

        it('should reject Connect when the socket errors before opening', async () => {
            const promise = client.Connect(makeConfig(), new FakeMediaStream([new FakeTrack()]));
            client.Fake.onerror?.('connection refused');
            await expect(promise).rejects.toThrow('connection refused');
        });

        it('should reject Connect when the socket dies between open and metadata', async () => {
            const promise = client.Connect(makeConfig(), new FakeMediaStream([new FakeTrack()]));
            client.Fake.Open();
            await flushAsync();
            client.Fake.onclose?.();
            await expect(promise).rejects.toThrow('closed during connect');
        });

        it('should ignore non-JSON inbound frames', async () => {
            await connect(client);
            expect(() => client.Fake.EmitRaw('not json')).not.toThrow();
        });
    });

    describe('transcript translation (FINAL-only on this provider)', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should emit user_transcript as a FINAL user transcript', () => {
            const { transcripts } = collect(client);
            client.Emit({ type: 'user_transcript', user_transcription_event: { user_transcript: 'what is MJ?' } });
            expect(transcripts).toEqual([{ Role: 'User', Text: 'what is MJ?', IsFinal: true, Kind: 'normal' }]);
        });

        it('should emit agent_response as a FINAL assistant transcript and reflect speaking', () => {
            const { transcripts, states } = collect(client);
            client.Emit({ type: 'agent_response', agent_response_event: { agent_response: 'MJ is a platform.' } });

            expect(transcripts).toEqual([{ Role: 'Assistant', Text: 'MJ is a platform.', IsFinal: true, Kind: 'normal' }]);
            expect(states).toEqual(['speaking']);
            expect(client.IsBusy).toBe(true);
        });

        it('should re-finalize the assistant turn from agent_response_correction after a barge-in', () => {
            const { transcripts } = collect(client);
            client.Emit({ type: 'agent_response', agent_response_event: { agent_response: 'The full answer is forty-two and' } });
            emitAudio(client);
            client.Emit({ type: 'interruption', interruption_event: { event_id: 7 } });
            client.Emit({
                type: 'agent_response_correction',
                agent_response_correction_event: {
                    original_agent_response: 'The full answer is forty-two and',
                    corrected_agent_response: 'The full answer is',
                },
            });

            const finals = transcripts.filter((t) => t.Role === 'Assistant');
            expect(finals).toEqual([
                { Role: 'Assistant', Text: 'The full answer is forty-two and', IsFinal: true, Kind: 'normal' },
                // The correction is MACHINE-READABLY marked as superseding the previous final
                // (the §10 "Transcript Replaces marker" contract) so hosts update in place.
                { Role: 'Assistant', Text: 'The full answer is', IsFinal: true, Kind: 'normal', ReplacesPrevious: true },
            ]);
        });

        it('should emit nothing for empty transcript payloads', () => {
            const { transcripts } = collect(client);
            client.Emit({ type: 'user_transcript', user_transcription_event: { user_transcript: '  ' } });
            client.Emit({ type: 'agent_response', agent_response_event: {} });
            expect(transcripts).toEqual([]);
        });
    });

    describe('narration tagging (RequestSpokenUpdate)', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should send the instructions as a user_message and mark busy without emitting speaking', () => {
            const { states } = collect(client);
            client.RequestSpokenUpdate('Say one short first-person sentence.');
            expect(client.Fake.SentFrames().at(-1)).toEqual({
                type: 'user_message',
                text: 'Say one short first-person sentence.',
            });
            expect(client.IsBusy).toBe(true);
            expect(states).toEqual([]); // narration waits for the first model output
        });

        it("should tag the NEXT agent_response as narration, then reset to normal (stamp-at-send)", () => {
            const { transcripts } = collect(client);
            client.RequestSpokenUpdate('progress update');
            client.Emit({ type: 'agent_response', agent_response_event: { agent_response: "I'm on it" } });
            client.Emit({ type: 'agent_response_complete' });

            // a later, model-initiated turn is back to normal kind
            client.Emit({ type: 'agent_response', agent_response_event: { agent_response: 'Here is the answer' } });

            expect(transcripts).toEqual([
                { Role: 'Assistant', Text: "I'm on it", IsFinal: true, Kind: 'narration' },
                { Role: 'Assistant', Text: 'Here is the answer', IsFinal: true, Kind: 'normal' },
            ]);
        });

        it('should queue a narration requested mid-response and flush on agent_response_complete', () => {
            emitAudio(client);
            expect(client.IsBusy).toBe(true);
            const framesBefore = client.Fake.Sent.length;

            client.RequestSpokenUpdate('narrate later');
            expect(client.Fake.Sent.length).toBe(framesBefore); // queued, not sent into the active response

            client.Emit({ type: 'agent_response_complete' });
            expect(client.Fake.SentFrames().at(-1)).toEqual({ type: 'user_message', text: 'narrate later' });
            expect(client.IsBusy).toBe(true);
        });
    });

    describe('tool calls and tool-result delivery', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should surface client_tool_call with JSON-string args and release the busy lock', () => {
            const { toolCalls } = collect(client);
            emitAudio(client);
            expect(client.IsBusy).toBe(true);

            client.Emit({
                type: 'client_tool_call',
                client_tool_call: { tool_name: 'invoke-target-agent', tool_call_id: 'call-1', parameters: { request: 'do it' } },
            });

            expect(toolCalls).toEqual([
                { CallID: 'call-1', ToolName: 'invoke-target-agent', ArgumentsJson: '{"request":"do it"}' },
            ]);
            // The agent yielded the floor pending the result — a queued result can't deadlock.
            expect(client.IsBusy).toBe(false);
        });

        it('should send a tool result immediately when idle and mark the reply in flight', () => {
            const { states } = collect(client);
            client.Emit({
                type: 'client_tool_call',
                client_tool_call: { tool_name: 'get_weather', tool_call_id: 'call-1', parameters: { city: 'NYC' } },
            });

            client.SendToolResult('call-1', JSON.stringify({ tempF: 72 }));

            expect(client.Fake.SentFrames().at(-1)).toEqual({
                type: 'client_tool_result',
                tool_call_id: 'call-1',
                result: { tempF: 72 },
                is_error: false,
            });
            expect(states).toEqual(['speaking']);
            expect(client.IsBusy).toBe(true);
        });

        it('should pass non-JSON tool output through as a raw string', () => {
            client.Emit({
                type: 'client_tool_call',
                client_tool_call: { tool_name: 'do_thing', tool_call_id: 'call-2', parameters: {} },
            });
            client.SendToolResult('call-2', 'plain text outcome');
            expect(client.Fake.SentFrames().at(-1)?.result).toBe('plain text outcome');
        });

        it('should deliver each tool result EXACTLY ONCE (duplicates dropped with a warning)', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            try {
                client.Emit({
                    type: 'client_tool_call',
                    client_tool_call: { tool_name: 'lookup', tool_call_id: 'call-3', parameters: {} },
                });
                const framesBefore = client.Fake.Sent.length;
                client.SendToolResult('call-3', '{"ok":true}');
                client.SendToolResult('call-3', '{"ok":true}'); // duplicate
                client.SendToolResult('never-issued', '{"ok":true}'); // unknown

                expect(client.Fake.Sent.length).toBe(framesBefore + 1);
                expect(warn).toHaveBeenCalledTimes(2);
            } finally {
                warn.mockRestore();
            }
        });

        it('should QUEUE a tool result behind an in-flight narration and flush on the boundary', () => {
            client.Emit({
                type: 'client_tool_call',
                client_tool_call: { tool_name: 'run-agent', tool_call_id: 'call-9', parameters: {} },
            });

            // host narrates while the tool runs → a narration response is in flight
            client.RequestSpokenUpdate('working on it');
            expect(client.IsBusy).toBe(true);
            const framesBeforeResult = client.Fake.Sent.length;

            client.SendToolResult('call-9', '{"success":true,"output":"42"}');
            expect(client.Fake.Sent.length).toBe(framesBeforeResult); // queued

            // the narration completes → the queued result fires
            client.Emit({ type: 'agent_response_complete' });
            expect(client.Fake.SentFrames().at(-1)).toEqual({
                type: 'client_tool_result',
                tool_call_id: 'call-9',
                result: { success: true, output: '42' },
                is_error: false,
            });
            expect(client.IsBusy).toBe(true);
        });

        it('should not clobber a host busy indicator: no state emissions on the tool-call frame', () => {
            const { states } = collect(client);
            emitAudio(client);
            expect(states).toEqual(['speaking']);

            client.Emit({
                type: 'client_tool_call',
                client_tool_call: { tool_name: 'tool', tool_call_id: 'c1', parameters: {} },
            });
            // a trailing response boundary of the tool-call turn must NOT emit 'listening'
            // over the host's own busy indicator
            client.Emit({ type: 'agent_response_complete' });
            expect(states).toEqual(['speaking']);
        });
    });

    describe('SendText', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should send a user_message and reflect speaking when idle', () => {
            const { states, transcripts } = collect(client);
            client.SendText('hello there');
            expect(client.Fake.SentFrames().at(-1)).toEqual({ type: 'user_message', text: 'hello there' });
            expect(states).toEqual(['speaking']);
            expect(client.IsBusy).toBe(true);
            // no local user-transcript echo — the host owns the echo (obligation #4)
            expect(transcripts).toEqual([]);
        });

        it('should BARGE IN over an in-flight response: flush playback and send the typed turn immediately', () => {
            client.Emit({ type: 'agent_response', agent_response_event: { agent_response: 'speaking now' } });
            emitAudio(client);

            client.SendText('typed mid-turn');

            expect(client.Playback.FlushCount).toBe(1);
            expect(client.IsAudioPlaying).toBe(false);
            expect(client.Fake.SentFrames().at(-1)).toEqual({ type: 'user_message', text: 'typed mid-turn' });
            expect(client.IsBusy).toBe(true); // the typed turn's reply is now in flight
        });

        it('should NOT surface a typed barge-in as a user interruption (no delegated-work abort)', () => {
            const { interruptions } = collect(client);
            emitAudio(client);
            client.SendText('typed mid-turn');
            expect(interruptions).toHaveLength(0);
        });

        it('should queue typed text behind a queued tool result released by the barge-in (delivery order kept)', () => {
            client.Emit({
                type: 'client_tool_call',
                client_tool_call: { tool_name: 'lookup', tool_call_id: 'c1', parameters: {} },
            });
            client.RequestSpokenUpdate('narrating'); // a narration response is in flight
            client.SendToolResult('c1', '{"ok":true}'); // queues behind the narration

            client.SendText('typed mid-narration');
            // the cancel drains the queue: the tool result goes first (starting a new response),
            // so the typed text queues behind it — tool-result delivery is never dropped
            const frames = client.Fake.SentFrames();
            expect(frames.at(-1)?.type).toBe('client_tool_result');
            expect(frames.filter((f) => f.text === 'typed mid-narration')).toHaveLength(0);

            client.Emit({ type: 'agent_response_complete' });
            expect(client.Fake.SentFrames().at(-1)).toEqual({ type: 'user_message', text: 'typed mid-narration' });
        });

        it('should no-op when the session is not open', () => {
            const fresh = new TestElevenLabsClient();
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

        it('should flush playback, release the busy lock, and return the floor', () => {
            const { states } = collect(client);
            emitAudio(client);

            client.CancelActiveResponse();
            expect(client.Playback.FlushCount).toBe(1);
            expect(client.IsAudioPlaying).toBe(false);
            expect(client.IsBusy).toBe(false);
            expect(states[states.length - 1]).toBe('listening');
        });

        it('should flush TAIL audio still playing after the response completed', () => {
            emitAudio(client);
            client.Emit({ type: 'agent_response_complete' });
            expect(client.IsBusy).toBe(false);
            expect(client.IsAudioPlaying).toBe(true); // playout runs behind generation

            client.CancelActiveResponse();
            expect(client.Playback.FlushCount).toBe(1);
            expect(client.IsAudioPlaying).toBe(false);
        });

        it('MUST NOT drop a queued tool result: the cancel drains it so it is delivered', () => {
            client.Emit({
                type: 'client_tool_call',
                client_tool_call: { tool_name: 'lookup', tool_call_id: 'c9', parameters: {} },
            });
            client.RequestSpokenUpdate('narrating');
            client.SendToolResult('c9', '{"ok":true}'); // queued behind the in-flight narration

            client.CancelActiveResponse();
            expect(client.Fake.SentFrames().at(-1)?.type).toBe('client_tool_result');
        });

        it('should be a no-op before Connect', () => {
            const fresh = new TestElevenLabsClient();
            expect(() => fresh.CancelActiveResponse()).not.toThrow();
        });
    });

    describe('SendContextNote (native contextual_update)', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should send a contextual_update without forcing a reply or changing state', () => {
            const { states } = collect(client);
            client.SendContextNote('[delegated-agent progress] Analyzing the request');
            expect(client.Fake.SentFrames().at(-1)).toEqual({
                type: 'contextual_update',
                text: '[delegated-agent progress] Analyzing the request',
            });
            expect(client.IsBusy).toBe(false);
            expect(states).toEqual([]);
        });

        it('should send IMMEDIATELY even while a response is in flight (never queued — the channel is non-interrupting)', () => {
            emitAudio(client);
            expect(client.IsBusy).toBe(true);

            client.SendContextNote('progress so far');
            expect(client.Fake.SentFrames().at(-1)).toEqual({ type: 'contextual_update', text: 'progress so far' });
        });
    });

    describe('interruption, ping, and ignored frames', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should flush the playout queue and return to listening on a true barge-in', () => {
            const { states, interruptions } = collect(client);
            emitAudio(client);
            expect(client.IsAudioPlaying).toBe(true);

            client.Emit({ type: 'interruption', interruption_event: { event_id: 3 } });

            expect(client.Playback.FlushCount).toBe(1);
            expect(client.IsAudioPlaying).toBe(false);
            expect(client.IsBusy).toBe(false);
            expect(interruptions).toHaveLength(1);
            expect(states).toEqual(['speaking', 'listening']);
        });

        it('should NOT surface an interruption while idle (true barge-in only)', () => {
            const { interruptions, states } = collect(client);
            client.Emit({ type: 'interruption', interruption_event: { event_id: 4 } });
            expect(interruptions).toHaveLength(0);
            expect(states).toEqual([]);
        });

        it("should answer every ping with a pong echoing the ping's event_id", () => {
            client.Emit({ type: 'ping', ping_event: { event_id: 42, ping_ms: 50 } });
            expect(client.Fake.SentFrames().at(-1)).toEqual({ type: 'pong', event_id: 42 });
        });

        it('should ignore vad_score and unknown frame types', () => {
            const { states, transcripts, errors } = collect(client);
            const framesBefore = client.Fake.Sent.length;
            client.Emit({ type: 'vad_score', vad_score_event: { vad_score: 0.93 } });
            client.Emit({ type: 'sparkly_future_event' });
            expect(states).toEqual([]);
            expect(transcripts).toEqual([]);
            expect(errors).toEqual([]);
            expect(client.Fake.Sent.length).toBe(framesBefore);
        });

        it('should decode model audio into the playout queue and report IsAudioPlaying from its clock', () => {
            const audioBytes = new Uint8Array([1, 2, 3, 4]);
            expect(client.IsAudioPlaying).toBe(false);

            emitAudio(client, audioBytes);

            expect(client.Playback.Enqueued).toHaveLength(1);
            expect(new Uint8Array(client.Playback.Enqueued[0])).toEqual(audioBytes);
            expect(client.IsAudioPlaying).toBe(true);

            client.Playback.IsPlaying = false; // playhead caught up with the clock
            expect(client.IsAudioPlaying).toBe(false);
        });
    });

    describe('SetMuted / Disconnect / errors', () => {
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
            expect(states[states.length - 1]).toBe('closed');
            expect(client.IsBusy).toBe(false);
            expect(client.IsAudioPlaying).toBe(false);
        });

        it('should be safe to Disconnect more than once', async () => {
            await connect(client);
            await client.Disconnect();
            await expect(client.Disconnect()).resolves.toBeUndefined();
        });

        it('should surface a socket error as a FATAL error and not emit closed afterwards', async () => {
            const { errors, states } = collect(client);
            await connect(client);

            client.Fake.onerror?.('socket dropped');
            expect(errors).toEqual([
                { Message: 'ElevenLabs realtime transport error: socket dropped', Fatal: true },
            ]);
            expect(states[states.length - 1]).toBe('error');

            client.Fake.onclose?.();
            expect(states[states.length - 1]).toBe('error');
        });

        it('should surface an UNEXPECTED socket close as a FATAL error (credential / conversation death)', async () => {
            const { errors, states } = collect(client);
            await connect(client);

            client.Fake.onclose?.();

            expect(errors).toEqual([{ Message: 'ElevenLabs conversation closed unexpectedly', Fatal: true }]);
            expect(states[states.length - 1]).toBe('error');
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


// ── Absorbed-tool-result nudge (live finding: delegation outlasts the turn) ────
describe('tool-result nudge — result lands after the turn closed', () => {
    let client: TestElevenLabsClient;

    beforeEach(async () => {
        vi.useFakeTimers();
        client = new TestElevenLabsClient();
        await connect(client);
        client.Emit({
            type: 'client_tool_call',
            client_tool_call: { tool_name: 'invoke-target-agent', tool_call_id: 'tc1', parameters: {} },
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const userMessages = () =>
        client.Fake.SentFrames().filter((f) => (f as { type?: string }).type === 'user_message');

    it('nudges via user_message when NO model output follows the tool result', () => {
        client.SendToolResult('tc1', '{"success":true,"output":"42"}');
        vi.advanceTimersByTime(1601);

        const nudges = userMessages();
        expect(nudges).toHaveLength(1);
        expect((nudges[0] as { text: string }).text).toContain('Tell the user the outcome now');
        // the nudge itself marks a response active (it WILL trigger one)
        expect(client.IsBusy).toBe(true);
    });

    it('does NOT nudge when real model output arrives within the window', () => {
        client.SendToolResult('tc1', '{"success":true}');
        emitAudio(client);
        vi.advanceTimersByTime(2000);
        expect(userMessages()).toHaveLength(0);
    });

    it('does NOT nudge after an interruption (user took the floor)', () => {
        client.SendToolResult('tc1', '{"success":true}');
        client.Emit({ type: 'interruption', interruption_event: { event_id: 9 } });
        vi.advanceTimersByTime(2000);
        expect(userMessages()).toHaveLength(0);
    });
});
