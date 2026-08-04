import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import { BaseRealtimeClient } from '../generic/baseRealtimeClient';
import { IPcmMicCapture } from '../audio/micCapture';
import { IRealtimePcmPlayback } from '../audio/pcmPlayback';
import {
    AssemblyAIRealtimeClient,
    AssemblyAIServerEvent,
    IAssemblyAIClientSocket,
    ASSEMBLYAI_AGENT_WS_URL,
    ASSEMBLYAI_PCM_SAMPLE_RATE,
} from '../drivers/assemblyAIRealtimeClient';
import { collect, FakeMediaStream, FakeTrack } from './helpers/realtime-fakes';

// ── Fakes (no network, no Web Audio) ───────────────────────────────────────────

/** Parsed outbound frame shape (only the fields the tests inspect). */
interface ParsedFrame {
    type?: string;
    audio?: string;
    session?: { system_prompt?: string; tools?: unknown[] };
    call_id?: string;
    result?: unknown;
    instructions?: string;
    session_id?: string;
}

/** Fake agent socket: records sent frames; lets tests fire open/close/server events. */
class FakeAgentSocket implements IAssemblyAIClientSocket {
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
    public EmitServer(event: AssemblyAIServerEvent | JSONObject): void {
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
class TestAssemblyAIClient extends AssemblyAIRealtimeClient {
    public Fake = new FakeAgentSocket();
    public Playback = new FakePlayback();
    public Capture = new FakeMicCapture();
    public LastUrl: string | null = null;
    /** Rates the driver handed to the audio seams. */
    public PlaybackRate: number | null = null;
    public CaptureRate: number | null = null;
    /** The driver's mic-chunk callback, captured so tests can simulate worklet frames. */
    public OnPcmChunk: ((base64Pcm16: string) => void) | null = null;

    /** Number of sockets the driver asked for (1 = initial; 2 = a resume reattach). */
    public SocketCreates = 0;

    protected override createSocket(url: string): IAssemblyAIClientSocket {
        this.LastUrl = url;
        this.SocketCreates++;
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

    /** Drives an inbound AssemblyAI server event through the socket handler. */
    public Emit(event: AssemblyAIServerEvent | JSONObject): void {
        this.Fake.EmitServer(event);
    }
}

function makeConfig(sessionConfig?: JSONObject): ClientRealtimeSessionConfig {
    return {
        Provider: 'assemblyai',
        Model: 'voice-agent',
        EphemeralToken: 'temp-token-abc',
        ExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        SessionConfig: sessionConfig ?? {
            session: { system_prompt: 'be the session voice' },
            config: {},
        },
    };
}

/** Lets the in-flight Connect continuation (microtasks) run. */
function flushAsync(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Connects the harness client with one fake mic track; returns the track for assertions. */
async function connect(client: TestAssemblyAIClient, sessionConfig?: JSONObject): Promise<FakeTrack> {
    const track = new FakeTrack();
    const promise = client.Connect(makeConfig(sessionConfig), new FakeMediaStream([track]));
    client.Fake.Open();
    await flushAsync();
    client.Fake.EmitServer({ type: 'session.ready', session_id: 'sess_1' });
    await promise;
    return track;
}

/** Drives a model audio frame (marks speaking / playing). */
function emitAudio(client: TestAssemblyAIClient, bytes: Uint8Array = new Uint8Array([1, 2, 3, 4])): void {
    client.Emit({ type: 'reply.audio', data: btoa(String.fromCharCode(...bytes)) });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('AssemblyAIRealtimeClient', () => {
    let client: TestAssemblyAIClient;

    beforeEach(() => {
        client = new TestAssemblyAIClient();
    });

    describe('ClassFactory registration', () => {
        it("should resolve via the ClassFactory under the provider key 'assemblyai'", () => {
            const resolved = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeClient>(BaseRealtimeClient, 'assemblyai');
            expect(resolved).toBeInstanceOf(AssemblyAIRealtimeClient);
        });
    });

    describe('Connect', () => {
        it('should open the token-authenticated URL and send the pact session.update first', async () => {
            const { states } = collect(client);
            await connect(client);

            expect(client.LastUrl).toBe(`${ASSEMBLYAI_AGENT_WS_URL}?token=temp-token-abc`);
            expect(client.Fake.SentFrames()[0]).toEqual({
                type: 'session.update',
                session: { system_prompt: 'be the session voice' },
            });
            expect(states).toEqual(['connecting', 'connected', 'listening']);
        });

        it("should NOT report 'listening' until session.ready confirms the session config", async () => {
            const { states } = collect(client);
            const promise = client.Connect(makeConfig(), new FakeMediaStream([new FakeTrack()]));
            client.Fake.Open();
            await flushAsync();

            // socket open + session.update sent, but no ready yet — the session is not configured
            expect(states).toEqual(['connecting', 'connected']);
            expect(client.IsBusy).toBe(false);

            client.Fake.EmitServer({ type: 'session.ready', session_id: 'sess_1' });
            await promise;
            expect(states).toEqual(['connecting', 'connected', 'listening']);
        });

        it("should build the audio plane at the provider's FIXED 24 kHz rate", async () => {
            await connect(client);
            expect(client.PlaybackRate).toBe(ASSEMBLYAI_PCM_SAMPLE_RATE);
            expect(client.CaptureRate).toBe(ASSEMBLYAI_PCM_SAMPLE_RATE);
        });

        it('should stream captured mic chunks as input.audio frames', async () => {
            await connect(client);
            client.OnPcmChunk?.('UENNMTY=');
            expect(client.Fake.SentFrames().at(-1)).toEqual({ type: 'input.audio', audio: 'UENNMTY=' });
        });

        it('should reject Connect when the socket errors before opening', async () => {
            const promise = client.Connect(makeConfig(), new FakeMediaStream([new FakeTrack()]));
            client.Fake.onerror?.('connection refused');
            await expect(promise).rejects.toThrow('connection refused');
        });

        it('should reject Connect when the socket dies between open and session.ready', async () => {
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

    describe('transcript translation', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should emit transcript.user.delta as interim user deltas', () => {
            const { transcripts } = collect(client);
            client.Emit({ type: 'transcript.user.delta', text: 'what is' });
            client.Emit({ type: 'transcript.user.delta', text: ' MJ?' });
            expect(transcripts).toEqual([
                { Role: 'User', Text: 'what is', IsFinal: false, Kind: 'normal' },
                { Role: 'User', Text: ' MJ?', IsFinal: false, Kind: 'normal' },
            ]);
        });

        it('should emit transcript.user as a FINAL user transcript', () => {
            const { transcripts } = collect(client);
            client.Emit({ type: 'transcript.user', text: 'what is MJ?', item_id: 'i1' });
            expect(transcripts).toEqual([{ Role: 'User', Text: 'what is MJ?', IsFinal: true, Kind: 'normal' }]);
        });

        it('should emit transcript.agent as a FINAL assistant transcript (no speaking from text alone)', () => {
            const { transcripts } = collect(client);
            client.Emit({ type: 'reply.started', reply_id: 'r1' });
            client.Emit({ type: 'transcript.agent', text: 'MJ is a platform.', reply_id: 'r1' });

            expect(transcripts).toEqual([{ Role: 'Assistant', Text: 'MJ is a platform.', IsFinal: true, Kind: 'normal' }]);
            expect(client.IsBusy).toBe(true);
        });

        it('should emit an interrupted transcript.agent as the authoritative truncated turn', () => {
            const { transcripts } = collect(client);
            client.Emit({ type: 'reply.started', reply_id: 'r1' });
            emitAudio(client);
            client.Emit({ type: 'input.speech.started' }); // barge-in
            client.Emit({ type: 'transcript.agent', text: 'The full answer is', reply_id: 'r1', interrupted: true });

            const finals = transcripts.filter((t) => t.Role === 'Assistant');
            expect(finals).toEqual([{ Role: 'Assistant', Text: 'The full answer is', IsFinal: true, Kind: 'normal' }]);
        });

        it('should emit nothing for empty transcript payloads', () => {
            const { transcripts } = collect(client);
            client.Emit({ type: 'transcript.user', text: '  ' });
            client.Emit({ type: 'transcript.agent' });
            expect(transcripts).toEqual([]);
        });
    });

    describe('busy / speaking mapping', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should mark busy and speaking on reply.started', () => {
            const { states } = collect(client);
            client.Emit({ type: 'reply.started', reply_id: 'r1' });
            expect(client.IsBusy).toBe(true);
            expect(states).toEqual(['speaking']);
        });

        it('should release busy and return to listening on reply.done', () => {
            const { states } = collect(client);
            client.Emit({ type: 'reply.started', reply_id: 'r1' });
            client.Emit({ type: 'reply.done' });
            expect(client.IsBusy).toBe(false);
            expect(states).toEqual(['speaking', 'listening']);
        });
    });

    describe('narration (NATIVE reply.create)', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should send the instructions as reply.create and mark busy without emitting speaking', () => {
            const { states } = collect(client);
            client.RequestSpokenUpdate('Say one short first-person sentence.');
            expect(client.Fake.SentFrames().at(-1)).toEqual({
                type: 'reply.create',
                instructions: 'Say one short first-person sentence.',
            });
            expect(client.IsBusy).toBe(true);
            expect(states).toEqual([]); // narration waits for the first model output
        });

        it('should tag the NEXT agent transcript as narration, then reset to normal (stamp-at-send)', () => {
            const { transcripts } = collect(client);
            client.RequestSpokenUpdate('progress update');
            client.Emit({ type: 'transcript.agent', text: "I'm on it", reply_id: 'r1' });
            client.Emit({ type: 'reply.done' });

            // a later, model-initiated turn is back to normal kind
            client.Emit({ type: 'reply.started', reply_id: 'r2' });
            client.Emit({ type: 'transcript.agent', text: 'Here is the answer', reply_id: 'r2' });

            expect(transcripts).toEqual([
                { Role: 'Assistant', Text: "I'm on it", IsFinal: true, Kind: 'narration' },
                { Role: 'Assistant', Text: 'Here is the answer', IsFinal: true, Kind: 'normal' },
            ]);
        });

        it('should queue a narration requested mid-reply and flush on reply.done', () => {
            client.Emit({ type: 'reply.started', reply_id: 'r1' });
            expect(client.IsBusy).toBe(true);
            const framesBefore = client.Fake.Sent.length;

            client.RequestSpokenUpdate('narrate later');
            expect(client.Fake.Sent.length).toBe(framesBefore); // queued, not sent into the active reply

            client.Emit({ type: 'reply.done' });
            expect(client.Fake.SentFrames().at(-1)).toEqual({ type: 'reply.create', instructions: 'narrate later' });
            expect(client.IsBusy).toBe(true);
        });
    });

    describe('tool calls and tool-result delivery', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should surface tool.call with re-stringified args and release the busy lock', () => {
            const { toolCalls } = collect(client);
            client.Emit({ type: 'reply.started', reply_id: 'r1' });
            expect(client.IsBusy).toBe(true);

            client.Emit({ type: 'tool.call', call_id: 'c_1', name: 'invoke-target-agent', arguments: { request: 'do it' } });

            expect(toolCalls).toEqual([
                { CallID: 'c_1', ToolName: 'invoke-target-agent', ArgumentsJson: '{"request":"do it"}' },
            ]);
            // The agent yielded the floor pending the result — a queued result can't deadlock.
            expect(client.IsBusy).toBe(false);
        });

        it('should send a tool result immediately when idle, passing the JSON-string through verbatim', () => {
            const { states } = collect(client);
            client.Emit({ type: 'tool.call', call_id: 'c_1', name: 'get_weather', arguments: { city: 'NYC' } });

            client.SendToolResult('c_1', JSON.stringify({ tempF: 72 }));

            expect(client.Fake.SentFrames().at(-1)).toEqual({
                type: 'tool.result',
                call_id: 'c_1',
                result: '{"tempF":72}', // the wire slot wants a JSON STRING — never re-parsed
            });
            expect(states).toEqual(['speaking']);
            expect(client.IsBusy).toBe(true);
        });

        it('should deliver each tool result EXACTLY ONCE (duplicates dropped with a warning)', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            try {
                client.Emit({ type: 'tool.call', call_id: 'c_3', name: 'lookup', arguments: {} });
                const framesBefore = client.Fake.Sent.length;
                client.SendToolResult('c_3', '{"ok":true}');
                client.SendToolResult('c_3', '{"ok":true}'); // duplicate
                client.SendToolResult('never-issued', '{"ok":true}'); // unknown

                expect(client.Fake.Sent.length).toBe(framesBefore + 1);
                expect(warn).toHaveBeenCalledTimes(2);
            } finally {
                warn.mockRestore();
            }
        });

        it('should QUEUE a tool result behind an in-flight narration and flush on the boundary', () => {
            client.Emit({ type: 'tool.call', call_id: 'c_9', name: 'run-agent', arguments: {} });

            // host narrates while the tool runs → a narration reply is in flight
            client.RequestSpokenUpdate('working on it');
            expect(client.IsBusy).toBe(true);
            const framesBeforeResult = client.Fake.Sent.length;

            client.SendToolResult('c_9', '{"success":true,"output":"42"}');
            expect(client.Fake.Sent.length).toBe(framesBeforeResult); // queued

            // the narration completes → the queued result fires
            client.Emit({ type: 'reply.done' });
            expect(client.Fake.SentFrames().at(-1)).toEqual({
                type: 'tool.result',
                call_id: 'c_9',
                result: '{"success":true,"output":"42"}',
            });
            expect(client.IsBusy).toBe(true);
        });

        it('should not clobber a host busy indicator: no state emissions on the tool-call frame', () => {
            const { states } = collect(client);
            client.Emit({ type: 'reply.started', reply_id: 'r1' });
            expect(states).toEqual(['speaking']);

            client.Emit({ type: 'tool.call', call_id: 'c1', name: 'tool', arguments: {} });
            // a trailing reply boundary of the tool-call turn must NOT emit 'listening'
            // over the host's own busy indicator
            client.Emit({ type: 'reply.done' });
            expect(states).toEqual(['speaking']);
        });
    });

    describe('SendText (EMULATED via reply.create)', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should send a reply.create framing the typed text and reflect speaking when idle', () => {
            const { states, transcripts } = collect(client);
            client.SendText('hello there');

            const last = client.Fake.SentFrames().at(-1);
            expect(last?.type).toBe('reply.create');
            expect(last?.instructions).toContain('hello there');
            expect(states).toEqual(['speaking']);
            expect(client.IsBusy).toBe(true);
            // no local user-transcript echo — the host owns the echo (obligation #4)
            expect(transcripts).toEqual([]);
        });

        it('should BARGE IN over an in-flight reply: flush playback and send the typed turn immediately', () => {
            client.Emit({ type: 'reply.started', reply_id: 'r1' });
            emitAudio(client);

            client.SendText('typed mid-turn');

            expect(client.Playback.FlushCount).toBe(1);
            expect(client.IsAudioPlaying).toBe(false);
            expect(client.Fake.SentFrames().at(-1)?.instructions).toContain('typed mid-turn');
            expect(client.IsBusy).toBe(true); // the typed turn's reply is now in flight
        });

        it('should NOT surface a typed barge-in as a user interruption (no delegated-work abort)', () => {
            const { interruptions } = collect(client);
            client.Emit({ type: 'reply.started', reply_id: 'r1' });
            emitAudio(client);
            client.SendText('typed mid-turn');
            expect(interruptions).toHaveLength(0);
        });

        it('should queue typed text behind a queued tool result released by the barge-in (delivery order kept)', () => {
            client.Emit({ type: 'tool.call', call_id: 'c1', name: 'lookup', arguments: {} });
            client.RequestSpokenUpdate('narrating'); // a narration reply is in flight
            client.SendToolResult('c1', '{"ok":true}'); // queues behind the narration

            client.SendText('typed mid-narration');
            // the cancel drains the queue: the tool result goes first (starting a new reply),
            // so the typed text queues behind it — tool-result delivery is never dropped
            const frames = client.Fake.SentFrames();
            expect(frames.at(-1)?.type).toBe('tool.result');
            expect(frames.filter((f) => f.instructions?.includes('typed mid-narration'))).toHaveLength(0);

            client.Emit({ type: 'reply.done' });
            expect(client.Fake.SentFrames().at(-1)?.instructions).toContain('typed mid-narration');
        });

        it('should no-op when the session is not open', () => {
            const fresh = new TestAssemblyAIClient();
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
            client.Emit({ type: 'reply.started', reply_id: 'r1' });
            emitAudio(client);

            client.CancelActiveResponse();
            expect(client.Playback.FlushCount).toBe(1);
            expect(client.IsAudioPlaying).toBe(false);
            expect(client.IsBusy).toBe(false);
            expect(states[states.length - 1]).toBe('listening');
        });

        it('should SUPPRESS residual reply.audio of the cancelled reply until the next boundary', () => {
            client.Emit({ type: 'reply.started', reply_id: 'r1' });
            emitAudio(client);
            client.CancelActiveResponse();
            expect(client.Playback.Enqueued).toHaveLength(1);

            // late chunks of the cancelled reply: dropped, never played, never re-assert speaking
            emitAudio(client);
            expect(client.Playback.Enqueued).toHaveLength(1);
            expect(client.IsBusy).toBe(false);

            // a NEW reply lifts the suppression
            client.Emit({ type: 'reply.started', reply_id: 'r2' });
            emitAudio(client);
            expect(client.Playback.Enqueued).toHaveLength(2);
        });

        it('should flush TAIL audio still playing after the reply completed', () => {
            client.Emit({ type: 'reply.started', reply_id: 'r1' });
            emitAudio(client);
            client.Emit({ type: 'reply.done' });
            expect(client.IsBusy).toBe(false);
            expect(client.IsAudioPlaying).toBe(true); // playout runs behind generation

            client.CancelActiveResponse();
            expect(client.Playback.FlushCount).toBe(1);
            expect(client.IsAudioPlaying).toBe(false);
        });

        it('MUST NOT drop a queued tool result: the cancel drains it so it is delivered', () => {
            client.Emit({ type: 'tool.call', call_id: 'c9', name: 'lookup', arguments: {} });
            client.RequestSpokenUpdate('narrating');
            client.SendToolResult('c9', '{"ok":true}'); // queued behind the in-flight narration

            client.CancelActiveResponse();
            expect(client.Fake.SentFrames().at(-1)?.type).toBe('tool.result');
        });

        it('should be a no-op before Connect', () => {
            const fresh = new TestAssemblyAIClient();
            expect(() => fresh.CancelActiveResponse()).not.toThrow();
        });
    });

    describe('SendContextNote (EMULATED via mutable system_prompt)', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should re-send the full prompt with the note appended, without forcing a reply or changing state', () => {
            const { states } = collect(client);
            client.SendContextNote('[delegated-agent progress] Analyzing the request');
            expect(client.Fake.SentFrames().at(-1)).toEqual({
                type: 'session.update',
                session: {
                    system_prompt:
                        'be the session voice\n\n## Background updates\n- [delegated-agent progress] Analyzing the request',
                },
            });
            expect(client.IsBusy).toBe(false);
            expect(states).toEqual([]);
        });

        it('should accumulate successive notes on the base prompt', () => {
            client.SendContextNote('note one');
            client.SendContextNote('note two');
            expect(client.Fake.SentFrames().at(-1)?.session?.system_prompt).toBe(
                'be the session voice\n\n## Background updates\n- note one\n- note two'
            );
        });

        it('should send IMMEDIATELY even while a reply is in flight (a config write never interrupts)', () => {
            client.Emit({ type: 'reply.started', reply_id: 'r1' });
            expect(client.IsBusy).toBe(true);

            client.SendContextNote('progress so far');
            expect(client.Fake.SentFrames().at(-1)?.type).toBe('session.update');
        });
    });

    describe('interruption (barge-in) handling', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should flush playout and return to listening on input.speech.started while a reply is active', () => {
            const { states, interruptions } = collect(client);
            client.Emit({ type: 'reply.started', reply_id: 'r1' });
            emitAudio(client);
            expect(client.IsAudioPlaying).toBe(true);

            client.Emit({ type: 'input.speech.started' });

            expect(client.Playback.FlushCount).toBe(1);
            expect(client.IsAudioPlaying).toBe(false);
            expect(client.IsBusy).toBe(false);
            expect(interruptions).toHaveLength(1);
            expect(states).toEqual(['speaking', 'listening']);
        });

        it('should suppress the interrupted reply\'s residual audio after a speech-start barge-in', () => {
            client.Emit({ type: 'reply.started', reply_id: 'r1' });
            emitAudio(client);
            client.Emit({ type: 'input.speech.started' });

            emitAudio(client); // late chunk of the interrupted reply
            expect(client.Playback.Enqueued).toHaveLength(1);
        });

        it('should NOT surface input.speech.started while idle (user simply taking their turn)', () => {
            const { interruptions, states } = collect(client);
            client.Emit({ type: 'input.speech.started' });
            client.Emit({ type: 'input.speech.stopped' });
            expect(interruptions).toHaveLength(0);
            expect(states).toEqual([]);
        });

        it("should fall back to reply.done status 'interrupted' when the speech-start gate missed", () => {
            const { interruptions } = collect(client);
            client.Emit({ type: 'reply.started', reply_id: 'r1' });
            emitAudio(client);

            client.Emit({ type: 'reply.done', status: 'interrupted' });

            expect(interruptions).toHaveLength(1);
            expect(client.Playback.FlushCount).toBe(1);
            expect(client.IsBusy).toBe(false);
        });

        it('should NOT double-emit when speech.started already handled the barge-in', () => {
            const { interruptions } = collect(client);
            client.Emit({ type: 'reply.started', reply_id: 'r1' });
            emitAudio(client);

            client.Emit({ type: 'input.speech.started' }); // snappy path
            client.Emit({ type: 'reply.done', status: 'interrupted' }); // authoritative verdict follows

            expect(interruptions).toHaveLength(1);
        });
    });

    describe('errors and provider session end', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should surface session.error frames as NON-fatal errors with the provider code', () => {
            const { errors, states } = collect(client);
            client.Emit({ type: 'session.error', code: 'invalid_param', message: 'bad keyterms' });
            expect(errors).toEqual([{ Message: 'bad keyterms', Code: 'invalid_param', Fatal: false }]);
            expect(states).toEqual([]); // the session stays open
        });

        it('should surface an unsolicited session.ended as a FATAL error', () => {
            const { errors, states } = collect(client);
            client.Emit({ type: 'session.ended', session_duration_seconds: 12 });
            expect(errors).toEqual([{ Message: 'AssemblyAI agent session ended by the provider', Fatal: true }]);
            expect(states[states.length - 1]).toBe('error');
        });

        it('should ignore session.updated and unknown frame types', () => {
            const { states, transcripts, errors } = collect(client);
            const framesBefore = client.Fake.Sent.length;
            client.Emit({ type: 'session.updated', session: {} });
            client.Emit({ type: 'sparkly_future_event' });
            expect(states).toEqual([]);
            expect(transcripts).toEqual([]);
            expect(errors).toEqual([]);
            expect(client.Fake.Sent.length).toBe(framesBefore);
        });

        it('should decode reply audio into the playout queue and report IsAudioPlaying from its clock', () => {
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

    describe('SetMuted / Disconnect / transport errors', () => {
        it('should toggle mic track enablement via SetMuted', async () => {
            const track = await connect(client);
            client.SetMuted(true);
            expect(track.enabled).toBe(false);
            client.SetMuted(false);
            expect(track.enabled).toBe(true);
        });

        it('should send session.end BEFORE closing and tear everything down on Disconnect', async () => {
            const { states } = collect(client);
            const track = await connect(client);
            emitAudio(client);

            await client.Disconnect();

            expect(client.Fake.SentFrames().at(-1)).toEqual({ type: 'session.end' });
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

        it('should stay silent on session.ended after a consumer Disconnect', async () => {
            const { errors } = collect(client);
            await connect(client);
            await client.Disconnect();
            // Disconnect nulls the socket but the provider ack may still arrive on the old handler
            client.Fake.EmitServer({ type: 'session.ended', session_duration_seconds: 5 });
            expect(errors).toEqual([]);
        });

        it('should surface a socket error as a FATAL error and not emit closed afterwards', async () => {
            const { errors, states } = collect(client);
            await connect(client);

            client.Fake.onerror?.('socket dropped');
            expect(errors).toEqual([
                { Message: 'AssemblyAI realtime transport error: socket dropped', Fatal: true },
            ]);
            expect(states[states.length - 1]).toBe('error');

            client.Fake.onclose?.();
            expect(states[states.length - 1]).toBe('error');
        });

        it('should surface an UNEXPECTED socket close as FATAL once the one-shot resume is exhausted', async () => {
            const { errors, states } = collect(client);
            await connect(client);

            client.Fake.onclose?.(); // first drop → the resume reattach (see the resume suite)
            client.Fake.onclose?.(); // resume socket dies too → NOW it's fatal

            expect(errors).toEqual([{ Message: 'AssemblyAI agent session closed unexpectedly', Fatal: true }]);
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

describe('session.resume reconnect window', () => {
    let client: TestAssemblyAIClient;

    beforeEach(async () => {
        client = new TestAssemblyAIClient();
        await connect(client); // session.ready carries session_id 'sess_1'
    });

    function collectStatesAndErrors() {
        const states: string[] = [];
        const errors: Array<{ Message: string; Fatal?: boolean }> = [];
        client.OnStateChange((s) => states.push(s));
        client.OnError((e) => errors.push(e));
        return { states, errors };
    }

    it('an unexpected drop reattaches ONCE: session.resume first frame, listening restored, no fatal', () => {
        const { states, errors } = collectStatesAndErrors();
        client.Fake.Sent.length = 0;

        client.Fake.onclose?.(); // unexpected provider drop
        expect(client.SocketCreates).toBe(2); // a fresh reattach socket
        expect(states).toContain('connecting'); // hosts render "reconnecting…"

        client.Fake.Open();
        const first = client.Fake.SentFrames()[0] as { type?: string; session_id?: string };
        expect(first.type).toBe('session.resume');
        expect(first.session_id).toBe('sess_1');

        client.Fake.EmitServer({ type: 'session.ready', session_id: 'sess_1' });
        expect(states[states.length - 1]).toBe('listening');
        expect(errors.filter((e) => e.Fatal)).toHaveLength(0);
    });

    it('a SECOND unexpected drop is fatal (one resume per session)', () => {
        const { states, errors } = collectStatesAndErrors();
        client.Fake.onclose?.();
        client.Fake.Open();
        client.Fake.EmitServer({ type: 'session.ready', session_id: 'sess_1' });

        client.Fake.onclose?.(); // dropped again — no second resume
        expect(client.SocketCreates).toBe(2);
        expect(errors.some((e) => e.Fatal)).toBe(true);
        expect(states[states.length - 1]).toBe('error');
    });

    it('a failed resume handshake (socket error) falls through to the fatal path', () => {
        const { states, errors } = collectStatesAndErrors();
        client.Fake.onclose?.();
        client.Fake.onerror?.('reattach refused');
        expect(errors.some((e) => e.Fatal)).toBe(true);
        expect(states[states.length - 1]).toBe('error');
    });

    it('a consumer Disconnect never attempts a resume', async () => {
        const { errors } = collectStatesAndErrors();
        await client.Disconnect();
        client.Fake.onclose?.(); // the close the consumer caused
        expect(client.SocketCreates).toBe(1);
        expect(errors).toHaveLength(0);
    });

    it('mic chunks flow into the reattached socket (audio plane survives the drop)', () => {
        client.Fake.onclose?.();
        client.Fake.Open();
        client.Fake.EmitServer({ type: 'session.ready', session_id: 'sess_1' });
        client.Fake.Sent.length = 0;

        client.OnPcmChunk?.('AAAA');
        const frames = client.Fake.SentFrames() as Array<{ type?: string }>;
        expect(frames.some((f) => f.type === 'input.audio')).toBe(true);
    });
});
