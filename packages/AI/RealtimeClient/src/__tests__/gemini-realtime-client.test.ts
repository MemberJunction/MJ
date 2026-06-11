import { describe, it, expect, beforeEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import type { Blob as GeminiBlob, Content, FunctionResponse, LiveServerMessage } from '@google/genai';
import {
    BaseRealtimeClient,
    RealtimeClientError,
    RealtimeClientState,
    RealtimeClientToolCall,
    RealtimeClientTranscript,
} from '../generic/baseRealtimeClient';
import {
    GeminiClientConnectArgs,
    GeminiLiveClientSession,
    GeminiRealtimeClient,
    IGeminiAudioPlayback,
    IGeminiMicCapture,
} from '../drivers/geminiRealtimeClient';

// ── Fakes (no network, no Web Audio) ───────────────────────────────────────────

/** Fake Gemini Live session: records every outbound send for assertions. */
class FakeGeminiSession implements GeminiLiveClientSession {
    public RealtimeInputs: Array<{ audio?: GeminiBlob }> = [];
    public ClientContents: Array<{ turns?: Content[]; turnComplete?: boolean }> = [];
    public ToolResponses: Array<{ functionResponses: FunctionResponse[] }> = [];
    public Closed = false;

    public sendRealtimeInput(params: { audio?: GeminiBlob }): void {
        this.RealtimeInputs.push(params);
    }
    public sendClientContent(params: { turns?: Content[]; turnComplete?: boolean }): void {
        this.ClientContents.push(params);
    }
    public sendToolResponse(params: { functionResponses: FunctionResponse[] }): void {
        this.ToolResponses.push(params);
    }
    public close(): void {
        this.Closed = true;
    }
}

/** Fake playout engine standing in for the Web Audio playback clock. */
class FakePlayback implements IGeminiAudioPlayback {
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
class FakeMicCapture implements IGeminiMicCapture {
    public Stopped = false;
    public Stop(): void {
        this.Stopped = true;
    }
}

/** Fake mic track implementing the full MediaStreamTrack surface. */
class FakeTrack extends EventTarget implements MediaStreamTrack {
    public contentHint = '';
    public enabled = true;
    public readonly id = 'fake-track';
    public readonly kind = 'audio';
    public readonly label = 'Fake Mic';
    public readonly muted = false;
    public onended: ((this: MediaStreamTrack, ev: Event) => void) | null = null;
    public onmute: ((this: MediaStreamTrack, ev: Event) => void) | null = null;
    public onunmute: ((this: MediaStreamTrack, ev: Event) => void) | null = null;
    public readyState: MediaStreamTrackState = 'live';
    public Stopped = false;

    public async applyConstraints(_constraints?: MediaTrackConstraints): Promise<void> {}
    public clone(): MediaStreamTrack {
        return this;
    }
    public getCapabilities(): MediaTrackCapabilities {
        return {};
    }
    public getConstraints(): MediaTrackConstraints {
        return {};
    }
    public getSettings(): MediaTrackSettings {
        return {};
    }
    public stop(): void {
        this.Stopped = true;
        this.readyState = 'ended';
    }
}

/** Fake MediaStream wrapping a set of {@link FakeTrack}s. */
class FakeMediaStream extends EventTarget implements MediaStream {
    public readonly active = true;
    public readonly id = 'fake-stream';
    public onaddtrack: ((this: MediaStream, ev: MediaStreamTrackEvent) => void) | null = null;
    public onremovetrack: ((this: MediaStream, ev: MediaStreamTrackEvent) => void) | null = null;
    private tracks: MediaStreamTrack[];

    constructor(tracks: MediaStreamTrack[]) {
        super();
        this.tracks = tracks;
    }
    public addTrack(track: MediaStreamTrack): void {
        this.tracks.push(track);
    }
    public clone(): MediaStream {
        return this;
    }
    public getAudioTracks(): MediaStreamTrack[] {
        return this.tracks;
    }
    public getTrackById(_id: string): MediaStreamTrack | null {
        return null;
    }
    public getTracks(): MediaStreamTrack[] {
        return this.tracks;
    }
    public getVideoTracks(): MediaStreamTrack[] {
        return [];
    }
    public removeTrack(_track: MediaStreamTrack): void {}
}

// ── Test harness ───────────────────────────────────────────────────────────────

/** Harness overriding all three creation seams so Connect runs with NO network / audio. */
class TestGeminiClient extends GeminiRealtimeClient {
    public Fake = new FakeGeminiSession();
    public Playback = new FakePlayback();
    public Capture = new FakeMicCapture();
    public LastConnectArgs: GeminiClientConnectArgs | null = null;
    /** The driver's mic-chunk callback, captured so tests can simulate worklet frames. */
    public OnPcmChunk: ((base64Pcm16: string) => void) | null = null;

    protected override async connectLiveSession(args: GeminiClientConnectArgs): Promise<GeminiLiveClientSession> {
        this.LastConnectArgs = args;
        return this.Fake;
    }
    protected override async createMicCapture(
        _micStream: MediaStream,
        onPcmChunk: (base64Pcm16: string) => void
    ): Promise<IGeminiMicCapture> {
        this.OnPcmChunk = onPcmChunk;
        return this.Capture;
    }
    protected override createPlayback(): IGeminiAudioPlayback {
        return this.Playback;
    }

    /** Drives an inbound Gemini server message through the registered callback. */
    public Emit(message: LiveServerMessage): void {
        this.LastConnectArgs?.OnMessage(message);
    }
}

function makeConfig(sessionConfig?: JSONObject): ClientRealtimeSessionConfig {
    return {
        Provider: 'gemini',
        Model: 'gemini-live-2.5-flash-preview',
        EphemeralToken: 'auth_tokens/ephemeral-abc',
        ExpiresAt: new Date(Date.now() + 60000).toISOString(),
        SessionConfig: sessionConfig ?? {
            model: 'gemini-live-2.5-flash-preview',
            config: { systemInstruction: 'be the voice', responseModalities: ['AUDIO'] },
        },
    };
}

/** Collects every emission from a client into arrays for assertions. */
function collect(client: GeminiRealtimeClient): {
    transcripts: RealtimeClientTranscript[];
    toolCalls: RealtimeClientToolCall[];
    states: RealtimeClientState[];
    errors: RealtimeClientError[];
    interruptions: number[];
} {
    const transcripts: RealtimeClientTranscript[] = [];
    const toolCalls: RealtimeClientToolCall[] = [];
    const states: RealtimeClientState[] = [];
    const errors: RealtimeClientError[] = [];
    const interruptions: number[] = [];
    client.OnTranscript((t) => transcripts.push(t));
    client.OnToolCall((c) => toolCalls.push(c));
    client.OnStateChange((s) => states.push(s));
    client.OnError((e) => errors.push(e));
    client.OnInterruption(() => interruptions.push(interruptions.length + 1));
    return { transcripts, toolCalls, states, errors, interruptions };
}

/** Connects the harness client with one fake mic track; returns the track for assertions. */
async function connect(client: TestGeminiClient, sessionConfig?: JSONObject): Promise<FakeTrack> {
    const track = new FakeTrack();
    await client.Connect(makeConfig(sessionConfig), new FakeMediaStream([track]));
    return track;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GeminiRealtimeClient', () => {
    let client: TestGeminiClient;

    beforeEach(() => {
        client = new TestGeminiClient();
    });

    describe('ClassFactory registration', () => {
        it("should resolve via the ClassFactory under the provider key 'gemini'", () => {
            const resolved = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeClient>(BaseRealtimeClient, 'gemini');
            expect(resolved).toBeInstanceOf(GeminiRealtimeClient);
        });
    });

    describe('Connect', () => {
        it('should connect with the ephemeral token + server-built model and config', async () => {
            const { states } = collect(client);
            await connect(client);

            expect(client.LastConnectArgs?.EphemeralToken).toBe('auth_tokens/ephemeral-abc');
            expect(client.LastConnectArgs?.Model).toBe('gemini-live-2.5-flash-preview');
            expect(client.LastConnectArgs?.Config).toEqual({
                systemInstruction: 'be the voice',
                responseModalities: ['AUDIO'],
            });
            expect(states).toEqual(['connecting', 'connected', 'listening']);
        });

        it('should fall back to the top-level Model when SessionConfig carries none', async () => {
            await connect(client, { config: { systemInstruction: 'locked-in-token' } });
            expect(client.LastConnectArgs?.Model).toBe('gemini-live-2.5-flash-preview');
            expect(client.LastConnectArgs?.Config).toEqual({ systemInstruction: 'locked-in-token' });
        });

        it('should stream captured mic chunks as base64 PCM16 @ 16 kHz', async () => {
            await connect(client);
            client.OnPcmChunk?.('UENNMTY=');
            expect(client.Fake.RealtimeInputs).toEqual([
                { audio: { data: 'UENNMTY=', mimeType: 'audio/pcm;rate=16000' } },
            ]);
        });
    });

    describe('transcript translation', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should emit user transcription deltas and finalize on the finished flag', () => {
            const { transcripts } = collect(client);
            client.Emit({ serverContent: { inputTranscription: { text: 'what is ' } } } as LiveServerMessage);
            client.Emit({ serverContent: { inputTranscription: { text: 'MJ?', finished: true } } } as LiveServerMessage);

            expect(transcripts).toEqual([
                { Role: 'User', Text: 'what is ', IsFinal: false, Kind: 'normal' },
                { Role: 'User', Text: 'MJ?', IsFinal: false, Kind: 'normal' },
                { Role: 'User', Text: 'what is MJ?', IsFinal: true, Kind: 'normal' },
            ]);
        });

        it('should finalize a pending user transcript when the model starts answering', () => {
            const { transcripts } = collect(client);
            client.Emit({ serverContent: { inputTranscription: { text: 'hello' } } } as LiveServerMessage);
            client.Emit({ serverContent: { outputTranscription: { text: 'Hi! ' } } } as LiveServerMessage);

            expect(transcripts).toEqual([
                { Role: 'User', Text: 'hello', IsFinal: false, Kind: 'normal' },
                { Role: 'User', Text: 'hello', IsFinal: true, Kind: 'normal' },
                { Role: 'Assistant', Text: 'Hi! ', IsFinal: false, Kind: 'normal' },
            ]);
        });

        it('should accumulate assistant deltas and finalize on the finished flag, tagged normal', () => {
            const { transcripts, states } = collect(client);
            client.Emit({ serverContent: { outputTranscription: { text: 'Hel' } } } as LiveServerMessage);
            client.Emit({ serverContent: { outputTranscription: { text: 'lo', finished: true } } } as LiveServerMessage);

            expect(transcripts).toEqual([
                { Role: 'Assistant', Text: 'Hel', IsFinal: false, Kind: 'normal' },
                { Role: 'Assistant', Text: 'lo', IsFinal: false, Kind: 'normal' },
                { Role: 'Assistant', Text: 'Hello', IsFinal: true, Kind: 'normal' },
            ]);
            expect(states).toEqual(['speaking']);
        });

        it('should fall back to finalizing accumulated assistant deltas on turnComplete', () => {
            const { transcripts, states } = collect(client);
            client.Emit({ serverContent: { outputTranscription: { text: 'partial answer' } } } as LiveServerMessage);
            client.Emit({ serverContent: { turnComplete: true } } as LiveServerMessage);

            const finals = transcripts.filter((t) => t.IsFinal);
            expect(finals).toEqual([{ Role: 'Assistant', Text: 'partial answer', IsFinal: true, Kind: 'normal' }]);
            expect(states).toEqual(['speaking', 'listening']);
        });

        it('should emit no final transcript for an empty turn', () => {
            const { transcripts } = collect(client);
            client.Emit({ serverContent: { turnComplete: true } } as LiveServerMessage);
            expect(transcripts).toEqual([]);
        });
    });

    describe('narration tagging (RequestSpokenUpdate)', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should send the instructions as a turn-completing user turn and mark busy', () => {
            client.RequestSpokenUpdate('Say one short first-person sentence.');
            expect(client.Fake.ClientContents).toEqual([
                {
                    turns: [{ role: 'user', parts: [{ text: 'Say one short first-person sentence.' }] }],
                    turnComplete: true,
                },
            ]);
            expect(client.IsBusy).toBe(true);
        });

        it("should tag the triggered turn's transcripts as narration, then reset to normal", () => {
            const { transcripts } = collect(client);
            client.RequestSpokenUpdate('progress update');
            client.Emit({ serverContent: { outputTranscription: { text: "I'm on it", finished: true } } } as LiveServerMessage);
            client.Emit({ serverContent: { turnComplete: true } } as LiveServerMessage);

            // A later, model-initiated turn is back to normal kind
            client.Emit({ serverContent: { outputTranscription: { text: 'Here is the answer', finished: true } } } as LiveServerMessage);

            expect(transcripts).toEqual([
                { Role: 'Assistant', Text: "I'm on it", IsFinal: false, Kind: 'narration' },
                { Role: 'Assistant', Text: "I'm on it", IsFinal: true, Kind: 'narration' },
                { Role: 'Assistant', Text: 'Here is the answer', IsFinal: false, Kind: 'normal' },
                { Role: 'Assistant', Text: 'Here is the answer', IsFinal: true, Kind: 'normal' },
            ]);
        });

        it('should queue a narration requested while a turn is in flight and flush on turnComplete', () => {
            client.Emit({ serverContent: { outputTranscription: { text: 'mid-turn' } } } as LiveServerMessage);
            expect(client.IsBusy).toBe(true);

            client.RequestSpokenUpdate('narrate later');
            expect(client.Fake.ClientContents).toHaveLength(0);

            client.Emit({ serverContent: { turnComplete: true } } as LiveServerMessage);
            expect(client.Fake.ClientContents).toEqual([
                { turns: [{ role: 'user', parts: [{ text: 'narrate later' }] }], turnComplete: true },
            ]);
            expect(client.IsBusy).toBe(true);
        });
    });

    describe('tool calls and tool-result queueing', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should surface toolCall.functionCalls with JSON-string args and release the busy lock', () => {
            const { toolCalls } = collect(client);
            client.Emit({ serverContent: { outputTranscription: { text: 'Let me check' } } } as LiveServerMessage);
            expect(client.IsBusy).toBe(true);

            client.Emit({
                toolCall: { functionCalls: [{ id: 'call-1', name: 'invoke-target-agent', args: { request: 'do it' } }] },
            } as LiveServerMessage);

            expect(toolCalls).toEqual([
                { CallID: 'call-1', ToolName: 'invoke-target-agent', ArgumentsJson: '{"request":"do it"}' },
            ]);
            // The model yielded the floor pending the result — a queued result can't deadlock.
            expect(client.IsBusy).toBe(false);
        });

        it('should send a tool result immediately when idle, using the cached function name', () => {
            const { states } = collect(client);
            client.Emit({
                toolCall: { functionCalls: [{ id: 'call-1', name: 'get_weather', args: { city: 'NYC' } }] },
            } as LiveServerMessage);

            client.SendToolResult('call-1', JSON.stringify({ tempF: 72 }));

            expect(client.Fake.ToolResponses).toEqual([
                { functionResponses: [{ id: 'call-1', name: 'get_weather', response: { tempF: 72 } }] },
            ]);
            expect(states).toEqual(['speaking']);
            expect(client.IsBusy).toBe(true);
        });

        it('COMMITS an open context-note turn after the tool response so the model speaks the result', () => {
            // Progress notes ride turnComplete:false — the Live API holds ALL generation
            // (incl. the auto-continuation after a tool response) until a commit. Observed
            // live as Gemini staying silent after a delegated agent's result.
            client.Emit({
                toolCall: { functionCalls: [{ id: 'call-3', name: 'invoke-target-agent', args: {} }] },
            } as LiveServerMessage);
            client.SendContextNote('[delegated-agent progress] fetching data');
            expect(client.Fake.ClientContents.at(-1)?.turnComplete).toBe(false);

            client.SendToolResult('call-3', '{"success":true,"output":"done"}');

            expect(client.Fake.ToolResponses).toHaveLength(1);
            // the empty-turn commit immediately follows the tool response
            const commit = client.Fake.ClientContents.at(-1);
            expect(commit?.turnComplete).toBe(true);
        });

        it('does NOT add an empty-turn commit when no context note left the turn open', () => {
            client.Emit({
                toolCall: { functionCalls: [{ id: 'call-4', name: 'invoke-target-agent', args: {} }] },
            } as LiveServerMessage);
            const contentSendsBefore = client.Fake.ClientContents.length;

            client.SendToolResult('call-4', '{"success":true,"output":"done"}');

            expect(client.Fake.ToolResponses).toHaveLength(1);
            expect(client.Fake.ClientContents.length).toBe(contentSendsBefore); // no spurious commit
        });

        it('should wrap non-JSON tool output as { result }', () => {
            client.Emit({
                toolCall: { functionCalls: [{ id: 'call-2', name: 'do_thing', args: {} }] },
            } as LiveServerMessage);

            client.SendToolResult('call-2', 'plain text outcome');

            expect(client.Fake.ToolResponses[0].functionResponses[0].response).toEqual({ result: 'plain text outcome' });
        });

        it('should QUEUE a tool result behind an in-flight narration and flush on turnComplete', () => {
            client.Emit({
                toolCall: { functionCalls: [{ id: 'call-9', name: 'run-agent', args: {} }] },
            } as LiveServerMessage);

            // host narrates while the tool runs → a narration turn is in flight
            client.RequestSpokenUpdate('working on it');
            expect(client.IsBusy).toBe(true);

            client.SendToolResult('call-9', '{"success":true,"output":"42"}');
            expect(client.Fake.ToolResponses).toHaveLength(0);

            // the narration completes → the queued result fires
            client.Emit({ serverContent: { turnComplete: true } } as LiveServerMessage);
            expect(client.Fake.ToolResponses).toEqual([
                { functionResponses: [{ id: 'call-9', name: 'run-agent', response: { success: true, output: '42' } }] },
            ]);
            expect(client.IsBusy).toBe(true);
        });

        it('should not clobber a host busy indicator: no state emissions on the tool-call frame', () => {
            const { states } = collect(client);
            client.Emit({ serverContent: { outputTranscription: { text: 'Checking' } } } as LiveServerMessage);
            expect(states).toEqual(['speaking']);

            client.Emit({
                toolCall: { functionCalls: [{ id: 'c1', name: 'tool', args: {} }] },
            } as LiveServerMessage);
            // trailing turnComplete of the tool-call turn must NOT emit 'listening' over the
            // host's own busy indicator
            client.Emit({ serverContent: { turnComplete: true } } as LiveServerMessage);
            expect(states).toEqual(['speaking']);
        });
    });

    describe('SendText', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should send a turn-completing user turn and reflect speaking when idle', () => {
            const { states } = collect(client);
            client.SendText('hello there');
            expect(client.Fake.ClientContents).toEqual([
                { turns: [{ role: 'user', parts: [{ text: 'hello there' }] }], turnComplete: true },
            ]);
            expect(states).toEqual(['speaking']);
            expect(client.IsBusy).toBe(true);
        });

        it('should BARGE IN over an in-flight turn: flush playback and send the typed turn immediately', () => {
            client.Emit({ serverContent: { outputTranscription: { text: 'speaking now' } } } as LiveServerMessage);
            client.Emit({
                serverContent: {
                    modelTurn: { role: 'model', parts: [{ inlineData: { data: btoa('xx'), mimeType: 'audio/pcm;rate=24000' } }] },
                },
            } as LiveServerMessage);

            client.SendText('typed mid-turn');
            // SendText implies barge-in: local playback flushed, turn marked inactive, the
            // typed turn goes out NOW (on the wire, client content itself interrupts Gemini).
            expect(client.Playback.FlushCount).toBe(1);
            expect(client.IsAudioPlaying).toBe(false);
            expect(client.Fake.ClientContents).toEqual([
                { turns: [{ role: 'user', parts: [{ text: 'typed mid-turn' }] }], turnComplete: true },
            ]);
            expect(client.IsBusy).toBe(true); // the typed turn's reply is now in flight
        });

        it('should NOT surface a typed barge-in as a user interruption (no delegated-work abort)', () => {
            const { interruptions } = collect(client);
            client.Emit({ serverContent: { outputTranscription: { text: 'speaking now' } } } as LiveServerMessage);
            client.SendText('typed mid-turn');
            expect(interruptions).toHaveLength(0);
        });

        it('should queue typed text behind a queued tool result released by the barge-in (delivery order kept)', () => {
            // model calls a tool, then starts ANOTHER turn while the result is pending
            client.Emit({
                toolCall: { functionCalls: [{ id: 'c1', name: 'lookup', args: {} }] },
            } as LiveServerMessage);
            client.Emit({ serverContent: { outputTranscription: { text: 'narrating' } } } as LiveServerMessage);
            client.SendToolResult('c1', '{"ok":true}'); // queues behind the in-flight narration

            client.SendText('typed mid-narration');
            // the cancel drains the queue: the tool result goes first (starting a new turn),
            // so the typed text queues behind it — tool-result delivery is never dropped
            expect(client.Fake.ToolResponses).toHaveLength(1);
            expect(client.Fake.ClientContents).toHaveLength(0);

            client.Emit({ serverContent: { turnComplete: true } } as LiveServerMessage);
            expect(client.Fake.ClientContents).toEqual([
                { turns: [{ role: 'user', parts: [{ text: 'typed mid-narration' }] }], turnComplete: true },
            ]);
        });

        it('should no-op when the session is not open', () => {
            const fresh = new TestGeminiClient();
            fresh.SendText('into the void');
            expect(fresh.Fake.ClientContents).toHaveLength(0);
        });
    });

    describe('CancelActiveResponse', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should be a no-op when nothing is active', () => {
            client.CancelActiveResponse();
            expect(client.Playback.FlushCount).toBe(0);
            expect(client.Fake.ClientContents).toHaveLength(0);
        });

        it('should flush playback, release the busy lock, and return the floor', () => {
            const { states } = collect(client);
            client.Emit({ serverContent: { outputTranscription: { text: 'speaking now' } } } as LiveServerMessage);
            client.Emit({
                serverContent: {
                    modelTurn: { role: 'model', parts: [{ inlineData: { data: btoa('xx'), mimeType: 'audio/pcm;rate=24000' } }] },
                },
            } as LiveServerMessage);

            client.CancelActiveResponse();
            expect(client.Playback.FlushCount).toBe(1);
            expect(client.IsAudioPlaying).toBe(false);
            expect(client.IsBusy).toBe(false);
            expect(states[states.length - 1]).toBe('listening');
        });

        it('should flush TAIL audio still playing after the turn completed', () => {
            client.Emit({
                serverContent: {
                    modelTurn: { role: 'model', parts: [{ inlineData: { data: btoa('xx'), mimeType: 'audio/pcm;rate=24000' } }] },
                },
            } as LiveServerMessage);
            client.Emit({ serverContent: { turnComplete: true } } as LiveServerMessage);
            expect(client.IsBusy).toBe(false);
            expect(client.IsAudioPlaying).toBe(true); // playout runs behind generation

            client.CancelActiveResponse();
            expect(client.Playback.FlushCount).toBe(1);
            expect(client.IsAudioPlaying).toBe(false);
        });

        it('MUST NOT drop a queued tool result: the cancel drains it so it is delivered', () => {
            client.Emit({
                toolCall: { functionCalls: [{ id: 'c9', name: 'lookup', args: {} }] },
            } as LiveServerMessage);
            client.Emit({ serverContent: { outputTranscription: { text: 'narrating' } } } as LiveServerMessage);
            client.SendToolResult('c9', '{"ok":true}'); // queued behind the in-flight turn
            expect(client.Fake.ToolResponses).toHaveLength(0);

            client.CancelActiveResponse();
            expect(client.Fake.ToolResponses).toHaveLength(1); // delegated work unaffected; result delivered
        });

        it('should be a no-op before Connect', () => {
            const fresh = new TestGeminiClient();
            expect(() => fresh.CancelActiveResponse()).not.toThrow();
        });
    });

    describe('SendContextNote', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should append a NON-turn-completing user turn (no reply forced, no busy)', () => {
            const { states } = collect(client);
            client.SendContextNote('[delegated-agent progress] Analyzing the request');
            expect(client.Fake.ClientContents).toEqual([
                {
                    turns: [{ role: 'user', parts: [{ text: '[delegated-agent progress] Analyzing the request' }] }],
                    turnComplete: false,
                },
            ]);
            expect(client.IsBusy).toBe(false);
            expect(states).toEqual([]);
        });

        it('should queue a context note while a turn is in flight (client content interrupts on Gemini)', () => {
            client.Emit({ serverContent: { outputTranscription: { text: 'mid-turn' } } } as LiveServerMessage);
            client.SendContextNote('progress so far');
            expect(client.Fake.ClientContents).toHaveLength(0);

            client.Emit({ serverContent: { turnComplete: true } } as LiveServerMessage);
            expect(client.Fake.ClientContents).toEqual([
                { turns: [{ role: 'user', parts: [{ text: 'progress so far' }] }], turnComplete: false },
            ]);
        });
    });

    describe('audio playout (IsAudioPlaying) and interruption', () => {
        beforeEach(async () => {
            await connect(client);
        });

        it('should enqueue decoded model audio and report IsAudioPlaying from the playout clock', () => {
            const audioBytes = new Uint8Array([1, 2, 3, 4]);
            const base64 = btoa(String.fromCharCode(...audioBytes));
            expect(client.IsAudioPlaying).toBe(false);

            client.Emit({
                serverContent: {
                    modelTurn: { role: 'model', parts: [{ inlineData: { data: base64, mimeType: 'audio/pcm;rate=24000' } }] },
                },
            } as LiveServerMessage);

            expect(client.Playback.Enqueued).toHaveLength(1);
            expect(new Uint8Array(client.Playback.Enqueued[0])).toEqual(audioBytes);
            expect(client.IsAudioPlaying).toBe(true);
            expect(client.IsBusy).toBe(true);

            client.Playback.IsPlaying = false; // playhead caught up with the clock
            expect(client.IsAudioPlaying).toBe(false);
        });

        it('should flush the playout queue and return to listening on interruption', () => {
            const { states } = collect(client);
            client.Emit({ serverContent: { outputTranscription: { text: 'blah' } } } as LiveServerMessage);
            client.Emit({
                serverContent: {
                    modelTurn: { role: 'model', parts: [{ inlineData: { data: btoa('xx'), mimeType: 'audio/pcm;rate=24000' } }] },
                },
            } as LiveServerMessage);
            expect(client.IsAudioPlaying).toBe(true);

            client.Emit({ serverContent: { interrupted: true } } as LiveServerMessage);

            expect(client.Playback.FlushCount).toBe(1);
            expect(client.IsAudioPlaying).toBe(false);
            expect(states).toEqual(['speaking', 'listening']);
        });

        it('should emit OnInterruption for every interrupted frame (Gemini only sends it on a true barge-in)', () => {
            const { interruptions } = collect(client);
            client.Emit({ serverContent: { outputTranscription: { text: 'blah' } } } as LiveServerMessage);
            client.Emit({ serverContent: { interrupted: true } } as LiveServerMessage);
            expect(interruptions).toHaveLength(1);

            // a later turn, interrupted again
            client.Emit({ serverContent: { outputTranscription: { text: 'more' } } } as LiveServerMessage);
            client.Emit({ serverContent: { interrupted: true } } as LiveServerMessage);
            expect(interruptions).toHaveLength(2);
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
            client.Emit({ serverContent: { outputTranscription: { text: 'busy' } } } as LiveServerMessage);

            await client.Disconnect();

            expect(track.Stopped).toBe(true);
            expect(client.Capture.Stopped).toBe(true);
            expect(client.Playback.Closed).toBe(true);
            expect(client.Fake.Closed).toBe(true);
            expect(states[states.length - 1]).toBe('closed');
            expect(client.IsBusy).toBe(false);
            expect(client.IsAudioPlaying).toBe(false);
        });

        it('should report a fatal error state on transport errors and not emit closed afterwards', async () => {
            const { errors, states } = collect(client);
            await connect(client);

            // Node's test env has no ErrorEvent constructor; build a structural stand-in.
            const errorEvent = Object.assign(new Event('error'), { message: 'socket dropped' }) as ErrorEvent;
            client.LastConnectArgs?.OnError(errorEvent);
            expect(errors).toEqual([{ Message: 'Gemini Live transport error: socket dropped', Fatal: true }]);
            expect(states[states.length - 1]).toBe('error');

            client.LastConnectArgs?.OnClose(new CloseEvent('close'));
            expect(states[states.length - 1]).toBe('error');
        });

        it('should report closed when the socket closes outside of an error', async () => {
            const { states } = collect(client);
            await connect(client);
            client.LastConnectArgs?.OnClose(new CloseEvent('close'));
            expect(states[states.length - 1]).toBe('closed');
        });
    });
});
