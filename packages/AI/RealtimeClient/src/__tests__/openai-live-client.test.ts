import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { ClientRealtimeSessionConfig } from '@memberjunction/ai';
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
    OpenAILiveClient,
    IRealtimeLivePeerConnection,
} from '../drivers/openAILiveClient';
import { IRealtimeAudioMeter } from '../audio/audioMeter';

// ── Test Fakes ─────────────────────────────────────────────────────────────

class FakeAudioMeter implements IRealtimeAudioMeter {
    public CurrentLevel = 0;
    public Level(): number {
        return this.CurrentLevel;
    }
    public Bins(_count?: number): number[] {
        return [];
    }
    public Close(): void {}
}

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
        this.onclose?.(new Event('close'));
    }

    public Open(): void {
        this.readyState = 'open';
        this.onopen?.(new Event('open'));
    }

    public EmitServer(event: Record<string, unknown>): void {
        this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(event) }));
    }

    public SentEvents(): Array<Record<string, unknown>> {
        return this.Sent.map((s) => JSON.parse(s) as Record<string, unknown>);
    }
}

class FakePeerConnection implements IRealtimeLivePeerConnection {
    public ontrack: ((event: RTCTrackEvent) => void) | null = null;
    public AddedTracks: MediaStreamTrack[] = [];
    public Channel = new FakeDataChannel();
    public ChannelLabel = '';
    public LocalDescription: RTCSessionDescriptionInit | null = null;
    public RemoteDescription: RTCSessionDescriptionInit | null = null;
    public Closed = false;
    public iceGatheringState: RTCIceGatheringState = 'complete';

    public addTrack(track: MediaStreamTrack, _stream: MediaStream): void {
        this.AddedTracks.push(track);
    }

    public createDataChannel(label: string): IRealtimeDataChannel {
        this.ChannelLabel = label;
        return this.Channel;
    }

    public async createOffer(): Promise<RTCSessionDescriptionInit> {
        return { type: 'offer', sdp: 'MOCK_OFFER_SDP' };
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

class FakeAudioSink implements IRealtimeAudioSink {
    public srcObject: MediaProvider | null = null;
    public Removed = false;
    public remove(): void {
        this.Removed = true;
    }
}

class FakeTrack extends EventTarget implements MediaStreamTrack {
    public contentHint = '';
    public enabled = true;
    public readonly id = 'fake-track-id';
    public readonly isolated = false;
    public readonly kind = 'audio';
    public readonly label = 'Fake Mic Track';
    public readonly muted = false;
    public readonly readyState: MediaStreamTrackState = 'live';
    public onended = null;
    public onisolationchange = null;
    public onmute = null;
    public onunmute = null;

    public Stopped = false;
    public stop(): void {
        this.Stopped = true;
    }
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
    public applyConstraints(): Promise<void> {
        return Promise.resolve();
    }
}

class FakeMediaStream extends EventTarget implements MediaStream {
    public readonly active = true;
    public readonly id = 'fake-stream-id';
    public onactive = null;
    public onaddtrack = null;
    public oninactive = null;
    public onremovetrack = null;
    private tracks: MediaStreamTrack[];

    constructor(tracks: MediaStreamTrack[] = [new FakeTrack()]) {
        super();
        this.tracks = tracks;
    }

    public getAudioTracks(): MediaStreamTrack[] {
        return this.tracks.filter((t) => t.kind === 'audio');
    }
    public getVideoTracks(): MediaStreamTrack[] {
        return this.tracks.filter((t) => t.kind === 'video');
    }
    public getTracks(): MediaStreamTrack[] {
        return this.tracks;
    }
    public getTrackById(id: string): MediaStreamTrack | null {
        return this.tracks.find((t) => t.id === id) ?? null;
    }
    public addTrack(track: MediaStreamTrack): void {
        this.tracks.push(track);
    }
    public removeTrack(track: MediaStreamTrack): void {
        this.tracks = this.tracks.filter((t) => t !== track);
    }
    public clone(): MediaStream {
        return new FakeMediaStream(this.tracks);
    }
}

class TestableOpenAILiveClient extends OpenAILiveClient {
    public MockPC = new FakePeerConnection();
    public MockSink = new FakeAudioSink();
    public PostedOfferSdp?: string;
    public PostedConfig?: ClientRealtimeSessionConfig;

    protected override createPeerConnection(): IRealtimeLivePeerConnection {
        return this.MockPC;
    }

    protected override createAudioSink(): IRealtimeAudioSink {
        return this.MockSink;
    }

    protected override async postSdpOffer(offerSdp: string, config: ClientRealtimeSessionConfig): Promise<string> {
        this.PostedOfferSdp = offerSdp;
        this.PostedConfig = config;
        return 'MOCK_ANSWER_SDP';
    }

    public get Channel(): FakeDataChannel {
        return this.MockPC.Channel;
    }

    public SetOutputAudioMeter(meter: IRealtimeAudioMeter | null): void {
        this.attachOutputAudioMeter(meter);
    }
}

function makeConfig(): ClientRealtimeSessionConfig {
    return {
        Provider: 'openai-live',
        Model: 'gpt-live-1',
        EphemeralToken: '',
        ExpiresAt: new Date(Date.now() + 60000).toISOString(),
        SessionConfig: {
            model: 'gpt-live-1',
            instructions: 'You are an AI co-agent.',
        },
    };
}

describe('OpenAILiveClient (Browser WebRTC Driver)', () => {
    let client: TestableOpenAILiveClient;
    let micStream: FakeMediaStream;

    beforeEach(() => {
        client = new TestableOpenAILiveClient();
        micStream = new FakeMediaStream([new FakeTrack()]);
    });

    it('is registered in ClassFactory under openai-live and OpenAILiveRealtime', () => {
        const i1 = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeClient>(BaseRealtimeClient, 'openai-live');
        expect(i1).toBeInstanceOf(OpenAILiveClient);

        const i2 = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeClient>(BaseRealtimeClient, 'OpenAILiveRealtime');
        expect(i2).toBeInstanceOf(OpenAILiveClient);
    });

    it('creates data channel BEFORE createOffer and performs non-trickle SDP handshake', async () => {
        const states: RealtimeClientState[] = [];
        const usages: RealtimeClientUsage[] = [];
        client.OnStateChange((s) => states.push(s));
        client.OnUsage((u) => usages.push(u));

        const config = makeConfig();
        await client.Connect(config, micStream);

        // Data channel created with label 'oai-events'
        expect(client.MockPC.ChannelLabel).toBe('oai-events');
        // Offer was posted and remote description was set
        expect(client.PostedOfferSdp).toBe('MOCK_OFFER_SDP');
        expect(client.MockPC.RemoteDescription).toEqual({ type: 'answer', sdp: 'MOCK_ANSWER_SDP' });
        // Connected state
        expect(states).toContain('connecting');
        expect(states).toContain('connected');

        // Accounts for 15s session pre-bill
        expect(usages.length).toBe(1);
        expect(usages[0].DurationSeconds).toBe(15);
    });

    it('never sends session.start on data channel open and transitions to listening', async () => {
        await client.Connect(makeConfig(), micStream);

        client.Channel.Sent = [];
        client.Channel.Open();

        // Must NEVER send session.start over data channel
        const sent = client.Channel.SentEvents();
        expect(sent.filter((e) => e.type === 'session.start').length).toBe(0);
    });

    it('processes user transcripts, assistant deltas, and finals', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        const transcripts: RealtimeClientTranscript[] = [];
        client.OnTranscript((t) => transcripts.push(t));

        // User transcript
        client.Channel.EmitServer({
            type: 'session.input_transcript.delta',
            delta: 'Hello co-agent',
        });
        expect(transcripts.length).toBe(1);
        expect(transcripts[0].Role).toBe('User');
        expect(transcripts[0].Text).toBe('Hello co-agent');
        expect(transcripts[0].IsFinal).toBe(false);

        // Assistant delta
        client.Channel.EmitServer({
            type: 'session.output_transcript.delta',
            delta: 'Hi there',
        });
        expect(client.IsBusy).toBe(true);
        expect(client.IsAudioPlaying).toBe(true);
        expect(transcripts.length).toBe(3);
        expect(transcripts[1].Role).toBe('User');
        expect(transcripts[1].IsFinal).toBe(true);
        expect(transcripts[2].Role).toBe('Assistant');
        expect(transcripts[2].Text).toBe('Hi there');
        expect(transcripts[2].IsFinal).toBe(false);

        // Assistant final
        client.Channel.EmitServer({
            type: 'response.event',
            event: {
                type: 'response.completed',
                usage: { seconds: 15 },
            },
        });
        expect(transcripts.length).toBe(4);
        expect(transcripts[3].IsFinal).toBe(true);
        expect(transcripts[3].Text).toBe('Hi there');
    });

    it('handles tool calls with silent exit from speaking and busy flag release', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        const toolCalls: RealtimeClientToolCall[] = [];
        client.OnToolCall((c) => toolCalls.push(c));

        // Start speaking
        client.Channel.EmitServer({
            type: 'session.output_transcript.delta',
            delta: 'Let me run that action',
        });
        expect(client.IsBusy).toBe(true);

        // Model emits tool call
        client.Channel.EmitServer({
            type: 'response.event',
            event: {
                type: 'response.output_item.done',
                item: {
                    type: 'function_call',
                    call_id: 'call_123',
                    name: 'RunQuery',
                    arguments: '{"query":"SELECT 1"}',
                },
            },
        });

        // Obligation #1 & #2: silent exit from speaking + busy flag cleared
        expect(client.IsBusy).toBe(false);
        expect(client.IsAudioPlaying).toBe(false);
        expect(toolCalls.length).toBe(1);
        expect(toolCalls[0].CallID).toBe('call_123');
        expect(toolCalls[0].ToolName).toBe('RunQuery');
        expect(toolCalls[0].ArgumentsJson).toBe('{"query":"SELECT 1"}');
    });

    it('SendToolResult sends response.item.create followed by response.create', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();
        client.Channel.Sent = [];

        // Inbound tool call opens batch
        client.Channel.EmitServer({
            type: 'response.event',
            event: {
                type: 'response.output_item.done',
                item: {
                    type: 'function_call',
                    call_id: 'call_123',
                    name: 'RunQuery',
                    arguments: '{"query":"SELECT 1"}',
                },
            },
        });
        client.Channel.Sent = [];

        client.SendToolResult('call_123', '{"success":true}');

        const sent = client.Channel.SentEvents();
        expect(sent.length).toBe(2);
        expect(sent[0]).toEqual({
            type: 'response.item.create',
            item: {
                type: 'function_call_output',
                call_id: 'call_123',
                output: '{"success":true}',
            },
        });
        expect(sent[1]).toEqual({ type: 'response.create' });
    });

    it('processes session.input_transcript.delta as interim deltas and finalizes at turn boundary', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        const transcripts: RealtimeClientTranscript[] = [];
        client.OnTranscript((t) => transcripts.push(t));

        client.Channel.EmitServer({
            type: 'session.input_transcript.delta',
            delta: 'Draw ',
        });
        expect(transcripts.length).toBe(1);
        expect(transcripts[0]).toEqual({
            Role: 'User',
            Text: 'Draw ',
            IsFinal: false,
            Kind: 'normal',
        });

        client.Channel.EmitServer({
            type: 'session.input_transcript.delta',
            delta: 'a box',
        });
        expect(transcripts.length).toBe(2);
        expect(transcripts[1]).toEqual({
            Role: 'User',
            Text: 'a box',
            IsFinal: false,
            Kind: 'normal',
        });

        // Model takes the floor (session.output_transcript.delta) -> finalizes user turn
        client.Channel.EmitServer({
            type: 'session.output_transcript.delta',
            delta: 'Sure',
        });
        expect(transcripts.length).toBe(4);
        expect(transcripts[2]).toEqual({
            Role: 'User',
            Text: 'Draw a box',
            IsFinal: true,
            Kind: 'normal',
        });
        expect(transcripts[3]).toEqual({
            Role: 'Assistant',
            Text: 'Sure',
            IsFinal: false,
            Kind: 'normal',
        });
    });

    it('finalizes pending user and assistant transcripts on Disconnect', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        const transcripts: RealtimeClientTranscript[] = [];
        client.OnTranscript((t) => transcripts.push(t));

        // Emit user delta
        client.Channel.EmitServer({
            type: 'session.input_transcript.delta',
            delta: 'Hello world',
        });
        expect(transcripts.length).toBe(1);
        expect(transcripts[0]).toEqual({
            Role: 'User',
            Text: 'Hello world',
            IsFinal: false,
            Kind: 'normal',
        });

        // Disconnect while user text is pending
        await client.Disconnect();

        expect(transcripts.length).toBe(2);
        expect(transcripts[1]).toEqual({
            Role: 'User',
            Text: 'Hello world',
            IsFinal: true,
            Kind: 'normal',
        });
    });

    it('finalizes pending assistant transcript on Disconnect', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        const transcripts: RealtimeClientTranscript[] = [];
        client.OnTranscript((t) => transcripts.push(t));

        // Model speaking delta
        client.Channel.EmitServer({
            type: 'session.output_transcript.delta',
            delta: 'I am responding',
        });
        expect(transcripts.length).toBe(1);
        expect(transcripts[0].IsFinal).toBe(false);

        await client.Disconnect();

        expect(transcripts.length).toBe(2);
        expect(transcripts[1]).toEqual({
            Role: 'Assistant',
            Text: 'I am responding',
            IsFinal: true,
            Kind: 'normal',
        });
    });

    it('processes session.output_transcript.delta and handles tool call via nested response.event', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        const transcripts: RealtimeClientTranscript[] = [];
        const toolCalls: RealtimeClientToolCall[] = [];
        client.OnTranscript((t) => transcripts.push(t));
        client.OnToolCall((c) => toolCalls.push(c));

        // Assistant speech delta
        client.Channel.EmitServer({
            type: 'session.output_transcript.delta',
            delta: 'Sure, I will draw that',
        });
        expect(client.IsBusy).toBe(true);
        expect(transcripts.length).toBe(1);
        expect(transcripts[0]).toEqual({
            Role: 'Assistant',
            Text: 'Sure, I will draw that',
            IsFinal: false,
            Kind: 'normal',
        });

        // Nested response.event containing response.output_item.done
        client.Channel.EmitServer({
            type: 'response.event',
            event: {
                type: 'response.output_item.done',
                item: {
                    type: 'function_call',
                    call_id: 'call_wb_1',
                    name: 'Whiteboard_AddShape',
                    arguments: '{"shape":"rect"}',
                },
            },
        });

        // Assistant transcript is finalized before tool call
        expect(transcripts.length).toBe(2);
        expect(transcripts[1]).toEqual({
            Role: 'Assistant',
            Text: 'Sure, I will draw that',
            IsFinal: true,
            Kind: 'normal',
        });
        expect(client.IsBusy).toBe(false);
        expect(toolCalls.length).toBe(1);
        expect(toolCalls[0].CallID).toBe('call_wb_1');
        expect(toolCalls[0].ToolName).toBe('Whiteboard_AddShape');
        expect(toolCalls[0].ArgumentsJson).toBe('{"shape":"rect"}');
    });

    it('handles session.delegation.created and SendToolResult via session.commentary.append', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        const toolCalls: RealtimeClientToolCall[] = [];
        client.OnToolCall((c) => toolCalls.push(c));

        client.Channel.EmitServer({
            type: 'session.delegation.created',
            delegation_id: 'del_client_1',
        });

        expect(toolCalls.length).toBe(1);
        expect(toolCalls[0].CallID).toBe('del_client_1');
        expect(toolCalls[0].ToolName).toBe('backend_delegation');

        client.Channel.Sent = [];
        client.SendToolResult('del_client_1', '{"result":"done"}');

        const sent = client.Channel.SentEvents();
        expect(sent.length).toBe(1);
        expect(sent[0]).toEqual({
            type: 'session.commentary.append',
            content: '{"result":"done"}',
            delegation_id: 'del_client_1',
        });
    });

    it('does not emit backend_delegation tool call on session.delegation.created when delegation.type is responses', async () => {
        const responsesConfig = makeConfig();
        responsesConfig.SessionConfig = {
            model: 'gpt-live-1',
            delegation: {
                type: 'responses',
                responses: {
                    model: 'gpt-4o',
                },
            },
        };
        await client.Connect(responsesConfig, micStream);
        client.Channel.Open();

        const toolCalls: RealtimeClientToolCall[] = [];
        client.OnToolCall((c) => toolCalls.push(c));

        client.Channel.EmitServer({
            type: 'session.delegation.created',
            delegation_id: 'del_responses_1',
        });

        // In responses mode, session.delegation.created is remote reasoning lifecycle only; no tool call emitted
        expect(toolCalls.length).toBe(0);
    });

    it('SendContextNote sends session.thinking.append without interrupting speech', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();
        client.Channel.Sent = [];

        client.SendContextNote('Background note for reasoning');

        const sent = client.Channel.SentEvents();
        expect(sent.length).toBe(1);
        expect(sent[0]).toEqual({
            type: 'session.thinking.append',
            content: 'Background note for reasoning',
            delegation_id: null,
        });
    });

    it('RequestSpokenUpdate tags narration and sends commentary with response.create', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();
        client.Channel.Sent = [];

        const transcripts: RealtimeClientTranscript[] = [];
        client.OnTranscript((t) => transcripts.push(t));

        client.RequestSpokenUpdate('Still working on query execution');

        const sent = client.Channel.SentEvents();
        expect(sent.length).toBe(2);
        expect(sent[0]).toEqual({
            type: 'session.commentary.append',
            content: 'Still working on query execution',
            delegation_id: null,
        });
        expect(sent[1]).toEqual({ type: 'response.create' });

        // Delta should have Kind: 'narration'
        client.Channel.EmitServer({
            type: 'session.output_transcript.delta',
            delta: 'Still working...',
        });
        expect(transcripts[0].Kind).toBe('narration');
    });

    it('emits interruption and cancels active response on provider error mid-speech', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        let interrupted = false;
        client.OnInterruption(() => {
            interrupted = true;
        });

        // Model speaking
        client.Channel.EmitServer({
            type: 'session.output_transcript.delta',
            delta: 'Model speaking...',
        });
        expect(client.IsBusy).toBe(true);

        client.Channel.Sent = [];
        // Provider cut-off arrives as error mid-speech
        client.Channel.EmitServer({
            type: 'error',
            error: {
                message: 'Moderation policy triggered',
                code: 'content_filter',
            },
        });

        expect(interrupted).toBe(true);
        expect(client.IsBusy).toBe(false);
        const sent = client.Channel.SentEvents();
        expect(sent).toEqual([]); // Local cancellation only — GPT-Live WebRTC has no wire response.cancel
    });

    it('emits cumulative usage with at least 15s pre-bill duration on response completion', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        const usages: RealtimeClientUsage[] = [];
        client.OnUsage((u) => usages.push(u));

        client.Channel.EmitServer({
            type: 'response.event',
            event: {
                type: 'response.completed',
                usage: {
                    input_tokens: 100,
                    output_tokens: 50,
                    seconds: 8, // Less than 15s pre-bill -> reported as at least 15s
                },
            },
        });

        // First was connect pre-bill, second is response.completed
        const lastUsage = usages[usages.length - 1];
        expect(lastUsage.InputTokens).toBe(100);
        expect(lastUsage.OutputTokens).toBe(50);
        expect(lastUsage.DurationSeconds).toBe(15);
    });

    it('surfaces errors and disconnects cleanly', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        const errors: RealtimeClientError[] = [];
        client.OnError((e) => errors.push(e));

        client.Channel.EmitServer({
            type: 'error',
            error: {
                message: 'Fatal session expiration',
                code: 'session_expired',
            },
        });

        expect(errors.length).toBe(1);
        expect(errors[0].Fatal).toBe(true);
        expect(errors[0].Code).toBe('session_expired');

        await client.Disconnect();
        expect(client.MockPC.Closed).toBe(true);
        expect(client.MockSink.Removed).toBe(true);
    });

    it('Step 1: ignores all nine dead Realtime-protocol events with no state change or emission', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        const deadEvents = [
            { type: 'input_audio_buffer.speech_started' },
            { type: 'conversation.item.input_audio_transcription.completed', transcript: 'test' },
            { type: 'response.audio_transcript.delta', delta: 'test' },
            { type: 'response.audio_transcript.done', transcript: 'test' },
            { type: 'response.output_audio_transcript.delta', delta: 'test' },
            { type: 'response.output_audio_transcript.done', transcript: 'test' },
            { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'dead_1', name: 'fn', arguments: '{}' } },
            { type: 'response.completed', usage: { seconds: 10 } },
            { type: 'response.done' },
        ];

        const transcripts: RealtimeClientTranscript[] = [];
        const toolCalls: RealtimeClientToolCall[] = [];
        const errors: RealtimeClientError[] = [];
        let interrupted = false;

        client.OnTranscript((t) => transcripts.push(t));
        client.OnToolCall((c) => toolCalls.push(c));
        client.OnError((e) => errors.push(e));
        client.OnInterruption(() => { interrupted = true; });

        for (const evt of deadEvents) {
            client.Channel.Sent = [];
            client.Channel.EmitServer(evt);

            expect(transcripts.length).toBe(0);
            expect(toolCalls.length).toBe(0);
            expect(errors.length).toBe(0);
            expect(interrupted).toBe(false);
            expect(client.Channel.SentEvents().length).toBe(0);
            expect(client.State).toBe('listening');
        }
    });

    it('Step 1: session.delegation.created finalizes both assistant and user transcripts', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        const transcripts: RealtimeClientTranscript[] = [];
        client.OnTranscript((t) => transcripts.push(t));

        // User speaks
        client.Channel.EmitServer({
            type: 'session.input_transcript.delta',
            delta: 'Search for inventory',
        });
        expect(transcripts.length).toBe(1);
        expect(transcripts[0].Role).toBe('User');

        // Assistant speaks interim
        client.Channel.EmitServer({
            type: 'session.output_transcript.delta',
            delta: 'Checking now...',
        });
        expect(transcripts.length).toBe(3);

        // Delegation arrives without assistant ending or user ending explicitly
        client.Channel.EmitServer({
            type: 'session.delegation.created',
            delegation_id: 'del_finalize_test',
        });

        // Both transcripts should be finalized
        const finalTranscripts = transcripts.filter(t => t.IsFinal);
        expect(finalTranscripts.some(t => t.Role === 'User' && t.Text === 'Search for inventory')).toBe(true);
        expect(finalTranscripts.some(t => t.Role === 'Assistant' && t.Text === 'Checking now...')).toBe(true);
    });

    it('Step 2: two user turns with silent delegation between them finalize cleanly without bleeding state', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        const transcripts: RealtimeClientTranscript[] = [];
        client.OnTranscript((t) => transcripts.push(t));

        // Turn 1: user speaks and streams
        client.Channel.EmitServer({
            type: 'session.input_transcript.delta',
            delta: 'First user command',
        });
        expect(transcripts.length).toBe(1);
        expect(transcripts[0].Text).toBe('First user command');
        expect(transcripts[0].IsFinal).toBe(false);

        // Silent delegation occurs (model takes the floor to delegate; no output transcript spoken)
        client.Channel.EmitServer({
            type: 'session.delegation.created',
            delegation_id: 'del_silent_1',
        });

        // Turn 1 finalized by delegation taking the floor
        expect(transcripts.length).toBe(2);
        expect(transcripts[1].Role).toBe('User');
        expect(transcripts[1].Text).toBe('First user command');
        expect(transcripts[1].IsFinal).toBe(true);

        // Turn 2: user speaks second utterance
        const turn2StartIndex = transcripts.length;
        client.Channel.EmitServer({
            type: 'session.input_transcript.delta',
            delta: 'Second user command',
        });

        expect(transcripts.length).toBe(turn2StartIndex + 1);
        expect(transcripts[turn2StartIndex].Text).toBe('Second user command');
        expect(transcripts[turn2StartIndex].IsFinal).toBe(false);

        // Turn 2 finalized by model taking the floor
        client.Channel.EmitServer({
            type: 'session.output_transcript.delta',
            delta: 'Done',
        });
        expect(transcripts[turn2StartIndex + 1].Role).toBe('User');
        expect(transcripts[turn2StartIndex + 1].Text).toBe('Second user command');
        expect(transcripts[turn2StartIndex + 1].IsFinal).toBe(true);
    });

    it('Step 2: within one turn, deltas are interim and finalize with full text on floor change', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        const transcripts: RealtimeClientTranscript[] = [];
        client.OnTranscript((t) => transcripts.push(t));

        // Delta 1
        client.Channel.EmitServer({
            type: 'session.input_transcript.delta',
            delta: 'Four score',
        });
        expect(transcripts[0]).toEqual({
            Role: 'User',
            Text: 'Four score',
            IsFinal: false,
            Kind: 'normal',
        });

        // Delta 2
        client.Channel.EmitServer({
            type: 'session.input_transcript.delta',
            delta: ' and seven years',
        });
        expect(transcripts[1]).toEqual({
            Role: 'User',
            Text: ' and seven years',
            IsFinal: false,
            Kind: 'normal',
        });

        // Delta 3
        client.Channel.EmitServer({
            type: 'session.input_transcript.delta',
            delta: ' ago',
        });
        expect(transcripts[2]).toEqual({
            Role: 'User',
            Text: ' ago',
            IsFinal: false,
            Kind: 'normal',
        });

        // Floor change (session.output_transcript.delta) -> finalizes turn
        client.Channel.EmitServer({
            type: 'session.output_transcript.delta',
            delta: 'Understood.',
        });
        expect(transcripts[3]).toEqual({
            Role: 'User',
            Text: 'Four score and seven years ago',
            IsFinal: true,
            Kind: 'normal',
        });
        expect(transcripts[4]).toEqual({
            Role: 'Assistant',
            Text: 'Understood.',
            IsFinal: false,
            Kind: 'normal',
        });
    });

    it('E-1: whitespace-only user delta resets properly on finalize without emitting or bleeding into next turn', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        const transcripts: RealtimeClientTranscript[] = [];
        client.OnTranscript((t) => transcripts.push(t));

        // Whitespace-only delta
        client.Channel.EmitServer({
            type: 'session.input_transcript.delta',
            delta: '   ',
        });
        expect(transcripts.length).toBe(1);
        expect(transcripts[0].IsFinal).toBe(false);

        // Finalize triggered by silent delegation
        client.Channel.EmitServer({
            type: 'session.delegation.created',
            delegation_id: 'del_whitespace',
        });
        // No final user transcript was emitted because trimmed length was 0
        const finals = transcripts.filter((t) => t.Role === 'User' && t.IsFinal);
        expect(finals.length).toBe(0);

        // Subsequent real delta
        client.Channel.EmitServer({
            type: 'session.input_transcript.delta',
            delta: 'Actual command',
        });
        // Model takes floor
        client.Channel.EmitServer({
            type: 'session.output_transcript.delta',
            delta: 'Response',
        });
        const finalUser = transcripts.find((t) => t.Role === 'User' && t.IsFinal);
        expect(finalUser?.Text).toBe('Actual command');
    });

    it('C-2: finalizes assistant transcript on playback drain via output audio silence threshold', async () => {
        vi.useFakeTimers();
        try {
            await client.Connect(makeConfig(), micStream);
            client.Channel.Open();

            const fakeMeter = new FakeAudioMeter();
            fakeMeter.CurrentLevel = 0.5; // active audio
            client.SetOutputAudioMeter(fakeMeter);

            const transcripts: RealtimeClientTranscript[] = [];
            client.OnTranscript((t) => transcripts.push(t));

            // Assistant starts speaking
            client.Channel.EmitServer({
                type: 'session.output_transcript.delta',
                delta: 'Playing some audio...',
            });

            expect(client.State).toBe('speaking');
            expect(client.IsBusy).toBe(true);
            expect(client.IsAudioPlaying).toBe(true);
            expect(transcripts.length).toBe(1);
            expect(transcripts[0]).toEqual({
                Role: 'Assistant',
                Text: 'Playing some audio...',
                IsFinal: false,
                Kind: 'normal',
            });

            // Advance time by 350ms (beyond transcript gap 300ms, but audio meter is still 0.5)
            vi.advanceTimersByTime(350);
            expect(client.State).toBe('speaking');
            expect(transcripts.filter((t) => t.Role === 'Assistant' && t.IsFinal).length).toBe(0);

            // Audio meter drops to silence
            fakeMeter.CurrentLevel = 0.0;

            // Advance 100ms (silence duration < 200ms)
            vi.advanceTimersByTime(100);
            expect(client.State).toBe('speaking');
            expect(transcripts.filter((t) => t.Role === 'Assistant' && t.IsFinal).length).toBe(0);

            // Advance another 150ms (silence duration reaches 200ms)
            vi.advanceTimersByTime(150);

            // Now playback drain has completed!
            expect(client.State).toBe('listening');
            expect(client.IsBusy).toBe(false);
            expect(client.IsAudioPlaying).toBe(false);
            const finals = transcripts.filter((t) => t.Role === 'Assistant' && t.IsFinal);
            expect(finals.length).toBe(1);
            expect(finals[0].Text).toBe('Playing some audio...');
        } finally {
            vi.useRealTimers();
        }
    });

    it('C-2: safety backstop timer finalizes assistant transcript when audio meter is absent', async () => {
        vi.useFakeTimers();
        try {
            await client.Connect(makeConfig(), micStream);
            client.Channel.Open();

            const transcripts: RealtimeClientTranscript[] = [];
            client.OnTranscript((t) => transcripts.push(t));

            client.Channel.EmitServer({
                type: 'session.output_transcript.delta',
                delta: 'Fallback speech',
            });

            expect(client.State).toBe('speaking');
            expect(client.IsBusy).toBe(true);

            // Advance 1500ms (< 3000ms backstop)
            vi.advanceTimersByTime(1500);
            expect(client.State).toBe('speaking');
            expect(transcripts.filter((t) => t.Role === 'Assistant' && t.IsFinal).length).toBe(0);

            // Advance another 1500ms (total 3000ms)
            vi.advanceTimersByTime(1500);

            expect(client.State).toBe('listening');
            expect(client.IsBusy).toBe(false);
            const finals = transcripts.filter((t) => t.Role === 'Assistant' && t.IsFinal);
            expect(finals.length).toBe(1);
            expect(finals[0].Text).toBe('Fallback speech');
        } finally {
            vi.useRealTimers();
        }
    });

    it('C-2: barge-in immediately finalizes pending assistant transcript before user speech starts', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        const transcripts: RealtimeClientTranscript[] = [];
        client.OnTranscript((t) => transcripts.push(t));

        // Assistant starts speaking
        client.Channel.EmitServer({
            type: 'session.output_transcript.delta',
            delta: 'I was thinking that maybe...',
        });
        expect(client.State).toBe('speaking');

        // User barges in before playback drain
        client.Channel.EmitServer({
            type: 'session.input_transcript.delta',
            delta: 'Hold on!',
        });

        // Assistant transcript finalized immediately
        const assistantFinals = transcripts.filter((t) => t.Role === 'Assistant' && t.IsFinal);
        expect(assistantFinals.length).toBe(1);
        expect(assistantFinals[0].Text).toBe('I was thinking that maybe...');

        // User delta received as interim
        const userInterims = transcripts.filter((t) => t.Role === 'User' && !t.IsFinal);
        expect(userInterims.length).toBe(1);
        expect(userInterims[0].Text).toBe('Hold on!');
    });

    it('Step 2: asserts userTurnTranscribed field is completely eliminated from the client', () => {
        expect('userTurnTranscribed' in client).toBe(false);
    });

    it('Step 2: finalizeUserTranscript does not emit an empty user transcript when pendingUserText is empty', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        const transcripts: RealtimeClientTranscript[] = [];
        client.OnTranscript((t) => transcripts.push(t));

        // Assistant starts speaking without any preceding user transcript delta
        client.Channel.EmitServer({
            type: 'session.output_transcript.delta',
            delta: 'Hello world',
        });

        // delegation.created triggers finalizeUserTranscript as well
        client.Channel.EmitServer({
            type: 'session.delegation.created',
            delegation_id: 'del_empty',
            target: 'responses',
        });

        // User transcript array must remain empty (no empty User events emitted)
        const userTranscripts = transcripts.filter((t) => t.Role === 'User');
        expect(userTranscripts.length).toBe(0);
    });

    it('Step 3: batches three parallel tool calls arriving out of order with exactly one response.create', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        const toolCalls: RealtimeClientToolCall[] = [];
        client.OnToolCall((c) => toolCalls.push(c));

        // Deliver 3 parallel tool calls via response.event
        for (const id of ['call_1', 'call_2', 'call_3']) {
            client.Channel.EmitServer({
                type: 'response.event',
                event: {
                    type: 'response.output_item.done',
                    item: {
                        type: 'function_call',
                        call_id: id,
                        name: `fn_${id}`,
                        arguments: '{}',
                    },
                },
            });
        }
        expect(toolCalls.length).toBe(3);

        client.Channel.Sent = [];

        // Return call_2 first (out of order)
        client.SendToolResult('call_2', '{"res":2}');
        const sentAfter2 = client.Channel.SentEvents();
        expect(sentAfter2.length).toBe(1);
        expect(sentAfter2[0].type).toBe('response.item.create');

        // Return call_1 second
        client.SendToolResult('call_1', '{"res":1}');
        const sentAfter1 = client.Channel.SentEvents();
        expect(sentAfter1.length).toBe(2);
        expect(sentAfter1[1].type).toBe('response.item.create');

        // Return call_3 last -> triggers response.create
        client.SendToolResult('call_3', '{"res":3}');
        const sentAfter3 = client.Channel.SentEvents();
        expect(sentAfter3.length).toBe(4);
        expect(sentAfter3[2].type).toBe('response.item.create');
        expect(sentAfter3[3].type).toBe('response.create');
    });

    it('Step 3: timeout releases turn if one tool result never arrives, and duplicate results do not re-trigger', async () => {
        vi.useFakeTimers();
        try {
            await client.Connect(makeConfig(), micStream);
            client.Channel.Open();

            for (const id of ['call_a', 'call_b']) {
                client.Channel.EmitServer({
                    type: 'response.event',
                    event: {
                        type: 'response.output_item.done',
                        item: { type: 'function_call', call_id: id, name: id, arguments: '{}' },
                    },
                });
            }

            client.Channel.Sent = [];

            // Return call_a
            client.SendToolResult('call_a', '{"a":1}');
            expect(client.Channel.SentEvents().length).toBe(1);

            // Duplicate result for already-closed call_a -> sends item.create but NO extra response.create
            client.SendToolResult('call_a', '{"a":1}');
            expect(client.Channel.SentEvents().length).toBe(2);
            expect(client.Channel.SentEvents()[1].type).toBe('response.item.create');

            // call_b never returns -> advance timers by 15s to trigger batch barrier safety timeout
            vi.advanceTimersByTime(15000);

            const sent = client.Channel.SentEvents();
            expect(sent.length).toBe(3);
            expect(sent[2].type).toBe('response.create');
        } finally {
            vi.useRealTimers();
        }
    });

    it('Step 3: single tool call sends response.item.create followed by response.create', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        client.Channel.EmitServer({
            type: 'response.event',
            event: {
                type: 'response.output_item.done',
                item: { type: 'function_call', call_id: 'single_call', name: 'single_fn', arguments: '{}' },
            },
        });

        client.Channel.Sent = [];
        client.SendToolResult('single_call', '{"ok":true}');

        const sent = client.Channel.SentEvents();
        expect(sent.length).toBe(2);
        expect(sent[0].type).toBe('response.item.create');
        expect(sent[1].type).toBe('response.create');
    });

    it('buffers outbound frames when connecting and flushes on data channel open', async () => {
        await client.Connect(makeConfig(), micStream);
        // Data channel is connecting (not yet open)
        client.SendContextNote('Navigable apps: Settings, Entities');
        expect(client.Channel.SentEvents().length).toBe(0);

        // Channel opens -> flushed
        client.Channel.Open();
        const sent = client.Channel.SentEvents();
        expect(sent.length).toBe(1);
        expect(sent[0]).toMatchObject({
            type: 'session.thinking.append',
            content: 'Navigable apps: Settings, Entities',
        });
    });

    it('skips response.create on RequestSpokenUpdate when a tool call is pending in barrier', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        // Model emits tool call -> barrier now has pending call
        client.Channel.EmitServer({
            type: 'response.event',
            event: {
                type: 'response.output_item.done',
                item: {
                    type: 'function_call',
                    call_id: 'call_weather_1',
                    name: 'Get_Weather',
                    arguments: '{"location":"Dallas"}',
                },
            },
        });

        client.Channel.Sent = [];
        // While tool call is pending, request spoken update
        client.RequestSpokenUpdate('Checking the weather now');

        const sent = client.Channel.SentEvents();
        expect(sent.length).toBe(1);
        expect(sent[0]).toMatchObject({
            type: 'session.commentary.append',
            content: 'Checking the weather now',
        });
        // MUST NOT send response.create while tool output is pending
        expect(sent.some((e) => e.type === 'response.create')).toBe(false);
    });

    it('deduplicates tool calls between response.output_item.done and response.function_call_arguments.done', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        const toolCalls: RealtimeClientToolCall[] = [];
        client.OnToolCall((c) => toolCalls.push(c));

        // Output item done emits tool call
        client.Channel.EmitServer({
            type: 'response.event',
            event: {
                type: 'response.output_item.done',
                item: {
                    type: 'function_call',
                    call_id: 'call_weather_dup',
                    name: 'Get_Weather',
                    arguments: '{"location":"Miami"}',
                },
            },
        });

        // Function call arguments done arrives for same call_id -> should NOT duplicate
        client.Channel.EmitServer({
            type: 'response.event',
            event: {
                type: 'response.function_call_arguments.done',
                call_id: 'call_weather_dup',
                name: 'Get_Weather',
                arguments: '{"location":"Miami"}',
            },
        });

        expect(toolCalls.length).toBe(1);
        expect(toolCalls[0]).toEqual({
            CallID: 'call_weather_dup',
            ToolName: 'Get_Weather',
            ArgumentsJson: '{"location":"Miami"}',
        });
    });

    it('guards against empty or missing tool name', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        const toolCalls: RealtimeClientToolCall[] = [];
        client.OnToolCall((c) => toolCalls.push(c));

        client.Channel.EmitServer({
            type: 'response.event',
            event: {
                type: 'response.function_call_arguments.done',
                call_id: 'call_empty_name',
                name: '',
                arguments: '{}',
            },
        });

        expect(toolCalls.length).toBe(0);
    });

    it('caps outbound queue at 100 frames and drops oldest with warning when connecting', async () => {
        await client.Connect(makeConfig(), micStream);
        // Channel remains 'connecting'

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        // Queue 105 frames while connecting
        for (let i = 0; i < 105; i++) {
            client.SendContextNote(`Context note ${i}`);
        }

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('outboundQueue reached max capacity (100), dropped oldest frame')
        );

        // Open channel to flush
        client.Channel.Open();
        const sent = client.Channel.SentEvents();
        expect(sent.length).toBe(100);
        // First 5 should have been dropped, so the first sent is index 5
        expect(sent[0]).toMatchObject({
            type: 'session.thinking.append',
            content: 'Context note 5',
        });
        expect(sent[sent.length - 1]).toMatchObject({
            type: 'session.thinking.append',
            content: 'Context note 104',
        });

        warnSpy.mockRestore();
    });

    it('warns and drops frames when channel is closed', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.close(); // readyState becomes 'closed'

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        client.SendContextNote('Note on closed channel');

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Dropping frame (session.thinking.append) because data channel is closed')
        );

        warnSpy.mockRestore();
    });

    it('preserves emittedToolCallIds across CancelActiveResponse so duplicate entry point does not re-emit tool call', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        const toolCalls: { ToolName: string; CallID: string }[] = [];
        client.OnToolCall((call) => {
            toolCalls.push({ ToolName: call.ToolName, CallID: call.CallID });
        });

        // 1. First entry point delivers tool call (e.g. via output_item.done)
        client.Channel.EmitServer({
            type: 'response.event',
            event: {
                type: 'response.output_item.done',
                item: { type: 'function_call', call_id: 'call_cancel_test', name: 'my_tool', arguments: '{"q":1}' },
            },
        });

        expect(toolCalls.length).toBe(1);
        expect(toolCalls[0].CallID).toBe('call_cancel_test');

        // 2. Cancellation occurs (barge-in, error, SendText, etc.)
        client.CancelActiveResponse();

        // 3. Second entry point delivers the same call_id (e.g. via response.function_call_arguments.done)
        client.Channel.EmitServer({
            type: 'response.event',
            event: {
                type: 'response.function_call_arguments.done',
                call_id: 'call_cancel_test',
                name: 'my_tool',
                arguments: '{"q":1}',
            },
        });

        // Consumer must see EXACTLY ONE tool call — dedupe guard must have survived cancel
        expect(toolCalls.length).toBe(1);
    });
});
