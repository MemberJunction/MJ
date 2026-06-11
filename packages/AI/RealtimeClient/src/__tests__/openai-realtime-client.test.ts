import { describe, it, expect, beforeEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import {
    BaseRealtimeClient,
    RealtimeClientError,
    RealtimeClientState,
    RealtimeClientToolCall,
    RealtimeClientTranscript,
    RealtimeClientUsage,
} from '../generic/baseRealtimeClient';
import {
    IRealtimeAudioSink,
    IRealtimeDataChannel,
    IRealtimePeerConnection,
    OpenAIRealtimeClient,
} from '../drivers/openAIRealtimeClient';

// ── Fakes (no network, no WebRTC) ──────────────────────────────────────────────

/** Fake data channel: records sent frames; lets tests fire open/close and inject server events. */
class FakeDataChannel implements IRealtimeDataChannel {
    public readyState: RTCDataChannelState = 'connecting';
    public onopen: ((event: Event) => void) | null = null;
    public onmessage: ((event: MessageEvent) => void) | null = null;
    public onerror: ((event: Event) => void) | null = null;
    public onclose: ((event: Event) => void) | null = null;
    public Sent: string[] = [];

    public send(data: string): void {
        this.Sent.push(data);
    }
    public close(): void {
        this.readyState = 'closed';
    }

    /** Marks the channel open and fires the onopen handler (like the real channel does). */
    public Open(): void {
        this.readyState = 'open';
        this.onopen?.(new Event('open'));
    }
    /** Injects a provider server event as an inbound JSON frame. */
    public EmitServer(event: object): void {
        this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(event) }));
    }
    /** Injects a raw (possibly non-JSON) inbound frame. */
    public EmitRaw(data: string): void {
        this.onmessage?.(new MessageEvent('message', { data }));
    }
    /** Returns the sent frames parsed as JSON objects. */
    public SentEvents(): Array<{ type: string } & Record<string, JSONObject | string>> {
        return this.Sent.map((s) => JSON.parse(s));
    }
}

/** Fake peer connection: records tracks/descriptions; hands out a {@link FakeDataChannel}. */
class FakePeerConnection implements IRealtimePeerConnection {
    public ontrack: ((event: RTCTrackEvent) => void) | null = null;
    public AddedTracks: MediaStreamTrack[] = [];
    public Channel = new FakeDataChannel();
    public ChannelLabel = '';
    public LocalDescription: RTCSessionDescriptionInit | null = null;
    public RemoteDescription: RTCSessionDescriptionInit | null = null;
    public Closed = false;

    public addTrack(track: MediaStreamTrack, _stream: MediaStream): void {
        this.AddedTracks.push(track);
    }
    public createDataChannel(label: string): IRealtimeDataChannel {
        this.ChannelLabel = label;
        return this.Channel;
    }
    public async createOffer(): Promise<RTCSessionDescriptionInit> {
        return { type: 'offer', sdp: 'FAKE_OFFER_SDP' };
    }
    public async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
        this.LocalDescription = description;
    }
    public async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
        this.RemoteDescription = description;
    }
    public close(): void {
        this.Closed = true;
    }
}

/** Fake hidden `<audio>` sink. */
class FakeAudioSink implements IRealtimeAudioSink {
    public srcObject: MediaProvider | null = null;
    public Removed = false;
    public remove(): void {
        this.Removed = true;
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

// ── Test harnesses ─────────────────────────────────────────────────────────────

/** Harness that injects a fake channel directly (no Connect needed) for wire/state tests. */
class ChannelTestClient extends OpenAIRealtimeClient {
    /** Seeds the session config and adopts the fake channel via the protected seam. */
    public InitChannel(channel: IRealtimeDataChannel, config: JSONObject | null = { instructions: 'test agent' }): void {
        this.sessionConfig = config;
        this.adoptDataChannel(channel);
    }
}

/** Harness overriding all three creation seams so Connect runs with NO network / WebRTC. */
class ConnectTestClient extends OpenAIRealtimeClient {
    public Pc = new FakePeerConnection();
    public Sink = new FakeAudioSink();
    public PostedOffers: Array<{ sdp: string; token: string }> = [];
    public AnswerSdp = 'FAKE_ANSWER_SDP';

    protected override createPeerConnection(): IRealtimePeerConnection {
        return this.Pc;
    }
    protected override createAudioSink(): IRealtimeAudioSink {
        return this.Sink;
    }
    protected override async postSdpOffer(offerSdp: string, ephemeralToken: string): Promise<string> {
        this.PostedOffers.push({ sdp: offerSdp, token: ephemeralToken });
        return this.AnswerSdp;
    }
}

function makeConfig(sessionConfig: JSONObject = { instructions: 'be helpful' }): ClientRealtimeSessionConfig {
    return {
        Provider: 'openai',
        Model: 'gpt-realtime',
        EphemeralToken: 'ek_test_123',
        ExpiresAt: new Date(Date.now() + 60000).toISOString(),
        SessionConfig: sessionConfig,
    };
}

/** Collects every emission from a client into arrays for assertions. */
function collect(client: OpenAIRealtimeClient): {
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

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('OpenAIRealtimeClient', () => {
    let channel: FakeDataChannel;
    let client: ChannelTestClient;

    beforeEach(() => {
        channel = new FakeDataChannel();
        client = new ChannelTestClient();
    });

    describe('ClassFactory registration', () => {
        it("should resolve via the ClassFactory under the provider key 'openai'", () => {
            const resolved = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeClient>(BaseRealtimeClient, 'openai');
            expect(resolved).toBeInstanceOf(OpenAIRealtimeClient);
        });
    });

    describe('session config on channel open', () => {
        it('should send session.update with the server config verbatim, then report listening', () => {
            const { states } = collect(client);
            client.InitChannel(channel, { instructions: 'voice co-agent', tools: [] });
            channel.Open();

            const sent = channel.SentEvents();
            expect(sent).toHaveLength(1);
            expect(sent[0]).toEqual({ type: 'session.update', session: { instructions: 'voice co-agent', tools: [] } });
            expect(states).toEqual(['listening']);
        });

        it('should NOT send an empty session.update when no config was supplied', () => {
            client.InitChannel(channel, {});
            channel.Open();
            expect(channel.Sent).toHaveLength(0);
        });
    });

    describe('transcript translation', () => {
        beforeEach(() => {
            client.InitChannel(channel);
            channel.Open();
            channel.Sent = [];
        });

        it('should translate GA assistant transcript events (deltas + done) tagged normal', () => {
            const { transcripts, states } = collect(client);
            channel.EmitServer({ type: 'response.created' });
            channel.EmitServer({ type: 'response.output_audio_transcript.delta', delta: 'Hel' });
            channel.EmitServer({ type: 'response.output_audio_transcript.delta', delta: 'lo' });
            channel.EmitServer({ type: 'response.output_audio_transcript.done', transcript: 'Hello' });

            expect(transcripts).toEqual([
                { Role: 'Assistant', Text: 'Hel', IsFinal: false, Kind: 'normal' },
                { Role: 'Assistant', Text: 'lo', IsFinal: false, Kind: 'normal' },
                { Role: 'Assistant', Text: 'Hello', IsFinal: true, Kind: 'normal' },
            ]);
            // first delta flips to speaking; transcript-done returns to listening
            expect(states).toEqual(['speaking', 'listening']);
        });

        it('should accept the older beta transcript event names too', () => {
            const { transcripts } = collect(client);
            channel.EmitServer({ type: 'response.audio_transcript.delta', delta: 'Hi' });
            channel.EmitServer({ type: 'response.audio_transcript.done', transcript: 'Hi there' });

            expect(transcripts).toEqual([
                { Role: 'Assistant', Text: 'Hi', IsFinal: false, Kind: 'normal' },
                { Role: 'Assistant', Text: 'Hi there', IsFinal: true, Kind: 'normal' },
            ]);
        });

        it('should fall back to accumulated deltas when the done frame has an empty transcript', () => {
            const { transcripts } = collect(client);
            channel.EmitServer({ type: 'response.output_audio_transcript.delta', delta: 'accum' });
            channel.EmitServer({ type: 'response.output_audio_transcript.done', transcript: '' });

            const finals = transcripts.filter((t) => t.IsFinal);
            expect(finals).toEqual([{ Role: 'Assistant', Text: 'accum', IsFinal: true, Kind: 'normal' }]);
        });

        it('should emit no final transcript for an empty turn', () => {
            const { transcripts } = collect(client);
            channel.EmitServer({ type: 'response.output_audio_transcript.done', transcript: '   ' });
            expect(transcripts).toEqual([]);
        });

        it('should translate the final user input transcription (always Kind normal)', () => {
            const { transcripts } = collect(client);
            channel.EmitServer({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'What is MJ?' });
            expect(transcripts).toEqual([{ Role: 'User', Text: 'What is MJ?', IsFinal: true, Kind: 'normal' }]);
        });

        it('should ignore non-JSON frames', () => {
            const { transcripts, errors } = collect(client);
            channel.EmitRaw('not-json{{{');
            expect(transcripts).toEqual([]);
            expect(errors).toEqual([]);
        });
    });

    describe('narration-kind tagging (RequestSpokenUpdate)', () => {
        beforeEach(() => {
            client.InitChannel(channel);
            channel.Open();
            channel.Sent = [];
        });

        it('should send response.create with the given instructions and mark the client busy', () => {
            client.RequestSpokenUpdate('Say one short first-person sentence.');
            expect(channel.SentEvents()).toEqual([
                { type: 'response.create', response: { instructions: 'Say one short first-person sentence.' } },
            ]);
            expect(client.IsBusy).toBe(true);
        });

        it('should SKIP the update while a response is in flight (queue-or-skip rule; narration is disposable)', () => {
            channel.EmitServer({ type: 'response.created' });
            channel.Sent = [];

            client.RequestSpokenUpdate('late update');
            expect(channel.Sent).toHaveLength(0); // no colliding response.create

            // and the narration kind must not leak onto the NEXT, ordinary response
            const { transcripts } = collect(client);
            channel.EmitServer({ type: 'response.done' });
            channel.EmitServer({ type: 'response.created' });
            channel.EmitServer({ type: 'response.output_audio_transcript.done', transcript: 'next turn' });
            expect(transcripts).toEqual([{ Role: 'Assistant', Text: 'next turn', IsFinal: true, Kind: 'normal' }]);
        });

        it("should tag the next response's transcripts as narration, then reset to normal", () => {
            const { transcripts } = collect(client);
            client.RequestSpokenUpdate('progress update');
            channel.EmitServer({ type: 'response.created' });
            channel.EmitServer({ type: 'response.output_audio_transcript.delta', delta: "I'm on it" });
            channel.EmitServer({ type: 'response.output_audio_transcript.done', transcript: "I'm on it" });
            channel.EmitServer({ type: 'response.done' });

            // A later, ordinary response is back to normal kind
            channel.EmitServer({ type: 'response.created' });
            channel.EmitServer({ type: 'response.output_audio_transcript.done', transcript: 'Here is the answer' });

            expect(transcripts).toEqual([
                { Role: 'Assistant', Text: "I'm on it", IsFinal: false, Kind: 'narration' },
                { Role: 'Assistant', Text: "I'm on it", IsFinal: true, Kind: 'narration' },
                { Role: 'Assistant', Text: 'Here is the answer', IsFinal: true, Kind: 'normal' },
            ]);
        });
    });

    describe('tool calls and tool-result queueing', () => {
        beforeEach(() => {
            client.InitChannel(channel);
            channel.Open();
            channel.Sent = [];
        });

        it('should surface function_call_arguments.done as a tool call', () => {
            const { toolCalls } = collect(client);
            channel.EmitServer({
                type: 'response.function_call_arguments.done',
                call_id: 'call_42',
                name: 'invoke-target-agent',
                arguments: '{"request":"do it"}',
            });
            expect(toolCalls).toEqual([
                { CallID: 'call_42', ToolName: 'invoke-target-agent', ArgumentsJson: '{"request":"do it"}' },
            ]);
        });

        it('should speak a tool result immediately when the model is idle', () => {
            const { states } = collect(client);
            client.SendToolResult('call_1', '{"success":true}');

            const sent = channel.SentEvents();
            expect(sent).toEqual([
                {
                    type: 'conversation.item.create',
                    item: { type: 'function_call_output', call_id: 'call_1', output: '{"success":true}' },
                },
                { type: 'response.create' },
            ]);
            expect(states).toEqual(['speaking']);
            expect(client.IsBusy).toBe(true);
        });

        it('should QUEUE the tool-result response behind an active response and flush on response.done', () => {
            const { states } = collect(client);
            // a narration response is in flight
            client.RequestSpokenUpdate('working on it');
            channel.EmitServer({ type: 'response.created' });
            channel.Sent = [];

            client.SendToolResult('call_9', '{"success":true,"output":"42"}');

            // the function_call_output item goes out, but NO second response.create yet
            let sent = channel.SentEvents();
            expect(sent).toHaveLength(1);
            expect(sent[0].type).toBe('conversation.item.create');

            // the in-flight narration completes → the queued result response fires
            channel.EmitServer({ type: 'response.done' });
            sent = channel.SentEvents();
            expect(sent).toHaveLength(2);
            expect(sent[1]).toEqual({ type: 'response.create' });
            // parity with the original orchestration: the flush emits 'speaking', then the
            // response.done tail check flips back to 'listening' until the reply's first
            // delta re-asserts 'speaking'
            expect(states).toEqual(['speaking', 'listening']);
            expect(client.IsBusy).toBe(true);
        });

        it('should not clobber a host busy indicator: no state emissions between tool call and result', () => {
            const { states } = collect(client);
            // model speaks, then calls a tool in the same response
            channel.EmitServer({ type: 'response.created' });
            channel.EmitServer({ type: 'response.output_audio_transcript.delta', delta: 'Let me check' });
            expect(states).toEqual(['speaking']);
            channel.EmitServer({
                type: 'response.function_call_arguments.done',
                call_id: 'c1',
                name: 'tool',
                arguments: '{}',
            });
            // trailing frames of the tool-call response must NOT emit 'listening' over the
            // host's own 'thinking' indicator
            channel.EmitServer({ type: 'output_audio_buffer.stopped' });
            channel.EmitServer({ type: 'response.done' });
            expect(states).toEqual(['speaking']);
        });
    });

    describe('SendText', () => {
        beforeEach(() => {
            client.InitChannel(channel);
            channel.Open();
            channel.Sent = [];
        });

        it('should inject a user message item and trigger a response when idle', () => {
            client.SendText('hello there');
            expect(channel.SentEvents()).toEqual([
                {
                    type: 'conversation.item.create',
                    item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello there' }] },
                },
                { type: 'response.create' },
            ]);
        });

        it('should BARGE IN over an in-flight response: cancel it, inject, and trigger immediately', () => {
            client.RequestSpokenUpdate('narrating');
            channel.EmitServer({ type: 'response.created' });
            channel.Sent = [];

            client.SendText('typed mid-narration');
            // SendText implies barge-in: the active narration is cancelled, then the typed
            // turn takes the floor with its own immediate response.create.
            expect(channel.SentEvents().map((e) => e.type)).toEqual([
                'response.cancel',
                'conversation.item.create',
                'response.create',
            ]);
            expect(client.IsBusy).toBe(true); // the typed turn's reply is now in flight
        });

        it('should NOT surface a typed barge-in as a user interruption (no delegated-work abort)', () => {
            const { interruptions } = collect(client);
            client.RequestSpokenUpdate('narrating');
            channel.EmitServer({ type: 'response.created' });
            channel.EmitServer({ type: 'output_audio_buffer.started' });

            client.SendText('typed mid-narration');
            channel.EmitServer({ type: 'output_audio_buffer.cleared' }); // server confirms our clear
            expect(interruptions).toHaveLength(0);
        });

        it('should no-op when the channel is not open', () => {
            channel.readyState = 'closed';
            client.SendText('into the void');
            expect(channel.Sent).toHaveLength(0);
        });
    });

    describe('CancelActiveResponse', () => {
        beforeEach(() => {
            client.InitChannel(channel);
            channel.Open();
            channel.Sent = [];
        });

        it('should be a no-op when nothing is active', () => {
            client.CancelActiveResponse();
            expect(channel.Sent).toHaveLength(0);
        });

        it('should send response.cancel for an in-flight response and release the busy lock', () => {
            channel.EmitServer({ type: 'response.created' });
            channel.Sent = [];

            client.CancelActiveResponse();
            expect(channel.SentEvents().map((e) => e.type)).toEqual(['response.cancel']);
            expect(client.IsBusy).toBe(false);
        });

        it('should also clear the provider output buffer when audio is audibly playing', () => {
            channel.EmitServer({ type: 'response.created' });
            channel.EmitServer({ type: 'output_audio_buffer.started' });
            channel.Sent = [];

            client.CancelActiveResponse();
            expect(channel.SentEvents().map((e) => e.type)).toEqual(['response.cancel', 'output_audio_buffer.clear']);
            expect(client.IsAudioPlaying).toBe(false);
            expect(client.IsBusy).toBe(false);
        });

        it('should clear TAIL audio (generation already done, speech still playing) with only a buffer clear', () => {
            channel.EmitServer({ type: 'response.created' });
            channel.EmitServer({ type: 'output_audio_buffer.started' });
            channel.EmitServer({ type: 'response.done' }); // generation finished; audio still playing
            channel.Sent = [];

            client.CancelActiveResponse();
            expect(channel.SentEvents().map((e) => e.type)).toEqual(['output_audio_buffer.clear']);
            expect(client.IsAudioPlaying).toBe(false);
        });

        it('should return the floor: speaking → listening emission', () => {
            const { states } = collect(client);
            channel.EmitServer({ type: 'response.created' });
            channel.EmitServer({ type: 'response.output_audio_transcript.delta', delta: 'speaking…' });

            client.CancelActiveResponse();
            expect(states[states.length - 1]).toBe('listening');
        });

        it("MUST NOT drop a queued tool-result trigger: it still fires on the cancelled response's done frame", () => {
            client.RequestSpokenUpdate('narrating');
            channel.EmitServer({ type: 'response.created' });
            client.SendToolResult('call_1', '{"ok":true}'); // queues behind the narration
            channel.Sent = [];

            client.CancelActiveResponse();
            channel.EmitServer({ type: 'response.done', response: { status: 'cancelled' } });

            const triggers = channel.SentEvents().filter((e) => e.type === 'response.create');
            expect(triggers).toHaveLength(1); // delegated work unaffected; result still voiced
        });

        it('should no-op when the channel is not open', () => {
            const c2 = new ChannelTestClient();
            const ch2 = new FakeDataChannel();
            c2.InitChannel(ch2); // adopted but readyState 'connecting'
            expect(() => c2.CancelActiveResponse()).not.toThrow();
            expect(ch2.Sent).toHaveLength(0);
        });
    });

    describe('OnInterruption — true barge-in only', () => {
        beforeEach(() => {
            client.InitChannel(channel);
            channel.Open();
            channel.Sent = [];
        });

        it('should emit when user speech cuts off a response in flight', () => {
            const { interruptions } = collect(client);
            channel.EmitServer({ type: 'response.created' });
            channel.EmitServer({ type: 'input_audio_buffer.speech_started' });
            expect(interruptions).toHaveLength(1);
        });

        it('should emit when user speech cuts off audio still audibly playing (generation already done)', () => {
            const { interruptions } = collect(client);
            channel.EmitServer({ type: 'response.created' });
            channel.EmitServer({ type: 'output_audio_buffer.started' });
            channel.EmitServer({ type: 'response.done' });
            channel.EmitServer({ type: 'input_audio_buffer.speech_started' });
            expect(interruptions).toHaveLength(1);
        });

        it('should NOT emit for a normal user turn while the model is idle', () => {
            const { interruptions, states } = collect(client);
            channel.EmitServer({ type: 'input_audio_buffer.speech_started' });
            expect(interruptions).toHaveLength(0);
            expect(states).toEqual(['listening']); // still reflects the user holding the floor
        });

        it('should NOT emit on the cleared frame that follows a self-initiated cancel', () => {
            const { interruptions } = collect(client);
            channel.EmitServer({ type: 'response.created' });
            channel.EmitServer({ type: 'output_audio_buffer.started' });

            client.CancelActiveResponse();
            channel.EmitServer({ type: 'output_audio_buffer.cleared' }); // server confirms our clear
            expect(interruptions).toHaveLength(0);
        });
    });

    describe('SendContextNote', () => {
        it("should inject a system-role message item (NOT 'developer' — gpt-realtime rejects it)", () => {
            client.InitChannel(channel);
            channel.Open();
            channel.Sent = [];

            client.SendContextNote('[delegated-agent progress] Analyzing the request');
            expect(channel.SentEvents()).toEqual([
                {
                    type: 'conversation.item.create',
                    item: {
                        type: 'message',
                        role: 'system',
                        content: [{ type: 'input_text', text: '[delegated-agent progress] Analyzing the request' }],
                    },
                },
            ]);
        });
    });

    describe('playback gating (IsAudioPlaying) and state machine', () => {
        beforeEach(() => {
            client.InitChannel(channel);
            channel.Open();
            channel.Sent = [];
        });

        it('should track audible playback from output_audio_buffer events', () => {
            expect(client.IsAudioPlaying).toBe(false);
            channel.EmitServer({ type: 'output_audio_buffer.started' });
            expect(client.IsAudioPlaying).toBe(true);
            channel.EmitServer({ type: 'output_audio_buffer.stopped' });
            expect(client.IsAudioPlaying).toBe(false);
            channel.EmitServer({ type: 'output_audio_buffer.started' });
            channel.EmitServer({ type: 'output_audio_buffer.cleared' });
            expect(client.IsAudioPlaying).toBe(false);
        });

        it('should transition speaking → listening when playback ends and no response is active', () => {
            const { states } = collect(client);
            // delta without response.created → speaking while NOT responseActive
            channel.EmitServer({ type: 'response.output_audio_transcript.delta', delta: 'tail audio' });
            channel.EmitServer({ type: 'output_audio_buffer.started' });
            channel.EmitServer({ type: 'output_audio_buffer.stopped' });
            expect(states).toEqual(['speaking', 'listening']);
        });

        it('should NOT leave speaking on playback end while a response is still in flight', () => {
            const { states } = collect(client);
            channel.EmitServer({ type: 'response.created' });
            channel.EmitServer({ type: 'response.output_audio_transcript.delta', delta: 'still going' });
            channel.EmitServer({ type: 'output_audio_buffer.stopped' });
            expect(states).toEqual(['speaking']);
        });

        it('should reflect barge-in (speech_started) as listening', () => {
            const { states } = collect(client);
            channel.EmitServer({ type: 'response.created' });
            channel.EmitServer({ type: 'response.output_audio_transcript.delta', delta: 'blah' });
            channel.EmitServer({ type: 'input_audio_buffer.speech_started' });
            expect(states).toEqual(['speaking', 'listening']);
        });

        it('should track IsBusy across response.created / response.done', () => {
            expect(client.IsBusy).toBe(false);
            channel.EmitServer({ type: 'response.created' });
            expect(client.IsBusy).toBe(true);
            channel.EmitServer({ type: 'response.done' });
            expect(client.IsBusy).toBe(false);
        });
    });

    describe('usage telemetry (OnUsage)', () => {
        beforeEach(() => {
            client.InitChannel(channel);
            channel.Open();
        });

        it('should emit a per-response usage DELTA from the response.done GA usage payload (with Raw)', () => {
            const usages: RealtimeClientUsage[] = [];
            client.OnUsage((u) => usages.push(u));

            channel.EmitServer({ type: 'response.created' });
            channel.EmitServer({
                type: 'response.done',
                response: { usage: { input_tokens: 120, output_tokens: 45, input_token_details: { text_tokens: 80 } } },
            });

            expect(usages).toEqual([
                {
                    InputTokens: 120,
                    OutputTokens: 45,
                    Raw: { input_tokens: 120, output_tokens: 45, input_token_details: { text_tokens: 80 } },
                },
            ]);
        });

        it('should emit one delta PER completed response (deltas, not cumulative)', () => {
            const usages: RealtimeClientUsage[] = [];
            client.OnUsage((u) => usages.push(u));

            channel.EmitServer({ type: 'response.done', response: { usage: { input_tokens: 100, output_tokens: 10 } } });
            channel.EmitServer({ type: 'response.done', response: { usage: { input_tokens: 30, output_tokens: 5 } } });

            expect(usages.map((u) => [u.InputTokens, u.OutputTokens])).toEqual([
                [100, 10],
                [30, 5],
            ]);
        });

        it('should emit nothing for a response.done without a usage payload', () => {
            const usages: RealtimeClientUsage[] = [];
            client.OnUsage((u) => usages.push(u));

            channel.EmitServer({ type: 'response.done' });
            channel.EmitServer({ type: 'response.done', response: {} });

            expect(usages).toEqual([]);
        });

        it('should leave non-numeric token fields undefined but still carry Raw', () => {
            const usages: RealtimeClientUsage[] = [];
            client.OnUsage((u) => usages.push(u));

            channel.EmitServer({ type: 'response.done', response: { usage: { output_tokens: 9 } } });

            expect(usages).toEqual([{ InputTokens: undefined, OutputTokens: 9, Raw: { output_tokens: 9 } }]);
        });
    });

    describe('error handling', () => {
        beforeEach(() => {
            client.InitChannel(channel);
            channel.Open();
        });

        it('should surface provider error frames as non-fatal errors with no state change', () => {
            const { errors, states } = collect(client);
            channel.EmitServer({ type: 'error', error: { message: 'rate limited', code: '429' } });
            expect(errors).toEqual([{ Message: 'rate limited', Code: '429', Fatal: false }]);
            expect(states).toEqual([]);
        });

        it('should report a fatal error state on channel transport errors', () => {
            const { errors, states } = collect(client);
            channel.onerror?.(new Event('error'));
            expect(errors).toHaveLength(1);
            expect(errors[0].Fatal).toBe(true);
            expect(states).toEqual(['error']);
        });

        it('should report closed when the channel closes outside of an error', () => {
            const { states } = collect(client);
            channel.onclose?.(new Event('close'));
            expect(states).toEqual(['closed']);
        });
    });

    describe('Connect / SetMuted / Disconnect (via the creation seams)', () => {
        it('should wire mic, sink, data channel, and perform the SDP handshake', async () => {
            const connectClient = new ConnectTestClient();
            const { states } = collect(connectClient);
            const track = new FakeTrack();
            const mic = new FakeMediaStream([track]);

            await connectClient.Connect(makeConfig({ instructions: 'co-agent' }), mic);

            expect(connectClient.Pc.AddedTracks).toEqual([track]);
            expect(connectClient.Pc.ChannelLabel).toBe('oai-events');
            expect(connectClient.Pc.LocalDescription?.sdp).toBe('FAKE_OFFER_SDP');
            expect(connectClient.PostedOffers).toEqual([{ sdp: 'FAKE_OFFER_SDP', token: 'ek_test_123' }]);
            expect(connectClient.Pc.RemoteDescription).toEqual({ type: 'answer', sdp: 'FAKE_ANSWER_SDP' });
            expect(states).toEqual(['connecting', 'connected']);

            // channel opens → session config applied verbatim + listening
            connectClient.Pc.Channel.Open();
            expect(connectClient.Pc.Channel.SentEvents()).toEqual([
                { type: 'session.update', session: { instructions: 'co-agent' } },
            ]);
            expect(states).toEqual(['connecting', 'connected', 'listening']);
        });

        it('should toggle mic track enablement via SetMuted', async () => {
            const connectClient = new ConnectTestClient();
            const track = new FakeTrack();
            await connectClient.Connect(makeConfig(), new FakeMediaStream([track]));

            connectClient.SetMuted(true);
            expect(track.enabled).toBe(false);
            connectClient.SetMuted(false);
            expect(track.enabled).toBe(true);
        });

        it('should tear everything down and emit closed on Disconnect', async () => {
            const connectClient = new ConnectTestClient();
            const { states } = collect(connectClient);
            const track = new FakeTrack();
            await connectClient.Connect(makeConfig(), new FakeMediaStream([track]));
            connectClient.Pc.Channel.Open();

            await connectClient.Disconnect();

            expect(track.Stopped).toBe(true);
            expect(connectClient.Pc.Closed).toBe(true);
            expect(connectClient.Pc.Channel.readyState).toBe('closed');
            expect(connectClient.Sink.Removed).toBe(true);
            expect(connectClient.Sink.srcObject).toBeNull();
            expect(states[states.length - 1]).toBe('closed');
            expect(connectClient.IsBusy).toBe(false);
            expect(connectClient.IsAudioPlaying).toBe(false);
        });
    });
});
