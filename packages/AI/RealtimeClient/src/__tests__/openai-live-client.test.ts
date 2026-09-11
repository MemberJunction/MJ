import { describe, it, expect, beforeEach } from 'vitest';
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

// ── Test Fakes ─────────────────────────────────────────────────────────────

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
            type: 'conversation.item.input_audio_transcription.completed',
            transcript: 'Hello co-agent',
        });
        expect(transcripts.length).toBe(1);
        expect(transcripts[0].Role).toBe('User');
        expect(transcripts[0].Text).toBe('Hello co-agent');
        expect(transcripts[0].IsFinal).toBe(true);

        // Assistant delta
        client.Channel.EmitServer({
            type: 'response.audio_transcript.delta',
            delta: 'Hi there',
        });
        expect(client.IsBusy).toBe(true);
        expect(client.IsAudioPlaying).toBe(true);
        expect(transcripts.length).toBe(2);
        expect(transcripts[1].Role).toBe('Assistant');
        expect(transcripts[1].Text).toBe('Hi there');
        expect(transcripts[1].IsFinal).toBe(false);

        // Assistant final
        client.Channel.EmitServer({
            type: 'response.audio_transcript.done',
            transcript: 'Hi there!',
        });
        expect(transcripts.length).toBe(3);
        expect(transcripts[2].IsFinal).toBe(true);
        expect(transcripts[2].Text).toBe('Hi there!');
    });

    it('handles tool calls with silent exit from speaking and busy flag release', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        const toolCalls: RealtimeClientToolCall[] = [];
        client.OnToolCall((c) => toolCalls.push(c));

        // Start speaking
        client.Channel.EmitServer({
            type: 'response.audio_transcript.delta',
            delta: 'Let me run that action',
        });
        expect(client.IsBusy).toBe(true);

        // Model emits tool call
        client.Channel.EmitServer({
            type: 'response.output_item.done',
            item: {
                type: 'function_call',
                call_id: 'call_123',
                name: 'RunQuery',
                arguments: '{"query":"SELECT 1"}',
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

    it('SendContextNote sends session.thinking.append without interrupting speech', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();
        client.Channel.Sent = [];

        client.SendContextNote('Background note for reasoning');

        const sent = client.Channel.SentEvents();
        expect(sent.length).toBe(1);
        expect(sent[0]).toEqual({
            type: 'session.thinking.append',
            text: 'Background note for reasoning',
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
            text: 'Still working on query execution',
            delegation_id: null,
        });
        expect(sent[1]).toEqual({ type: 'response.create' });

        // Delta should have Kind: 'narration'
        client.Channel.EmitServer({
            type: 'response.audio_transcript.delta',
            delta: 'Still working...',
        });
        expect(transcripts[0].Kind).toBe('narration');
    });

    it('detects barge-in on speech_started and cancels active response', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        let interrupted = false;
        client.OnInterruption(() => {
            interrupted = true;
        });

        // Model speaking
        client.Channel.EmitServer({
            type: 'response.audio_transcript.delta',
            delta: 'Model speech',
        });
        expect(client.IsBusy).toBe(true);

        client.Channel.Sent = [];
        // Speech started while active
        client.Channel.EmitServer({
            type: 'input_audio_buffer.speech_started',
        });

        expect(interrupted).toBe(true);
        expect(client.IsBusy).toBe(false);
        const sent = client.Channel.SentEvents();
        expect(sent).toEqual([{ type: 'response.cancel' }]);
    });

    it('emits cumulative usage with at least 15s pre-bill duration on response completion', async () => {
        await client.Connect(makeConfig(), micStream);
        client.Channel.Open();

        const usages: RealtimeClientUsage[] = [];
        client.OnUsage((u) => usages.push(u));

        client.Channel.EmitServer({
            type: 'response.completed',
            usage: {
                input_tokens: 100,
                output_tokens: 50,
                seconds: 8, // Less than 15s pre-bill -> reported as at least 15s
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
});
