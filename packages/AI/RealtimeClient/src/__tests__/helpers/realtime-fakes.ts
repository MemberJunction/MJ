/**
 * Shared in-memory fakes + harnesses for the realtime-client test suites.
 *
 * These mirror (and extend) the fakes embedded in the original per-driver test files so the
 * extended / contract suites can reuse one implementation. No network, no WebRTC, no Web Audio.
 */
import { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import type { Blob as GeminiBlob, Content, FunctionResponse, LiveServerMessage } from '@google/genai';
import {
    BaseRealtimeClient,
    RealtimeClientError,
    RealtimeClientState,
    RealtimeClientToolCall,
    RealtimeClientTranscript,
} from '../../generic/baseRealtimeClient';
import {
    IRealtimeAudioSink,
    IRealtimeDataChannel,
    IRealtimePeerConnection,
    OpenAIRealtimeClient,
} from '../../drivers/openAIRealtimeClient';
import {
    GeminiClientConnectArgs,
    GeminiLiveClientSession,
    GeminiRealtimeClient,
    IGeminiAudioPlayback,
    IGeminiMicCapture,
} from '../../drivers/geminiRealtimeClient';

// ── Generic media fakes ────────────────────────────────────────────────────────

/** Fake mic track implementing the full MediaStreamTrack surface. */
export class FakeTrack extends EventTarget implements MediaStreamTrack {
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
export class FakeMediaStream extends EventTarget implements MediaStream {
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

/** The arrays a {@link collect} call fills as the client emits. */
export interface CollectedEmissions {
    transcripts: RealtimeClientTranscript[];
    toolCalls: RealtimeClientToolCall[];
    states: RealtimeClientState[];
    errors: RealtimeClientError[];
    /** One entry per OnInterruption emission (true barge-ins only); assert via length. */
    interruptions: number[];
}

/** Collects every emission from a client into arrays for assertions. */
export function collect(client: BaseRealtimeClient): CollectedEmissions {
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

// ── OpenAI fakes ───────────────────────────────────────────────────────────────

/** Shape of a parsed outbound OpenAI client frame (only the fields the tests inspect). */
export interface ParsedClientFrame {
    type: string;
    item?: { type?: string; role?: string; call_id?: string; output?: string };
    response?: { instructions?: string };
    session?: JSONObject;
}

/** Fake data channel: records sent frames; lets tests fire open/close and inject server events. */
export class FakeDataChannel implements IRealtimeDataChannel {
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
    /** Returns the sent frames parsed as typed client frames. */
    public SentEvents(): ParsedClientFrame[] {
        return this.Sent.map((s) => JSON.parse(s) as ParsedClientFrame);
    }
}

/** Fake peer connection: records tracks/descriptions; hands out a {@link FakeDataChannel}. */
export class FakePeerConnection implements IRealtimePeerConnection {
    public ontrack: ((event: RTCTrackEvent) => void) | null = null;
    public AddedTracks: MediaStreamTrack[] = [];
    public Channel = new FakeDataChannel();
    public ChannelLabel = '';
    public LocalDescription: RTCSessionDescriptionInit | null = null;
    public RemoteDescription: RTCSessionDescriptionInit | null = null;
    public Closed = false;
    /** When set, createOffer rejects with this error (Connect failure-path tests). */
    public OfferError: Error | null = null;
    /** The offer returned by createOffer (sdp may be intentionally omitted). */
    public Offer: RTCSessionDescriptionInit = { type: 'offer', sdp: 'FAKE_OFFER_SDP' };

    public addTrack(track: MediaStreamTrack, _stream: MediaStream): void {
        this.AddedTracks.push(track);
    }
    public createDataChannel(label: string): IRealtimeDataChannel {
        this.ChannelLabel = label;
        return this.Channel;
    }
    public async createOffer(): Promise<RTCSessionDescriptionInit> {
        if (this.OfferError) {
            throw this.OfferError;
        }
        return this.Offer;
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
export class FakeAudioSink implements IRealtimeAudioSink {
    public srcObject: MediaProvider | null = null;
    public Removed = false;
    public remove(): void {
        this.Removed = true;
    }
}

/** Harness that injects a fake channel directly (no Connect needed) for wire/state tests. */
export class OpenAIChannelTestClient extends OpenAIRealtimeClient {
    /** Seeds the session config and adopts the fake channel via the protected seam. */
    public InitChannel(channel: IRealtimeDataChannel, config: JSONObject | null = { instructions: 'test agent' }): void {
        this.sessionConfig = config;
        this.adoptDataChannel(channel);
    }
}

/** Harness overriding all three creation seams so Connect runs with NO network / WebRTC. */
export class OpenAIConnectTestClient extends OpenAIRealtimeClient {
    public Pc = new FakePeerConnection();
    public Sink = new FakeAudioSink();
    public PostedOffers: Array<{ sdp: string; token: string }> = [];
    public AnswerSdp = 'FAKE_ANSWER_SDP';
    /** When set, postSdpOffer rejects with this error (Connect failure-path tests). */
    public PostError: Error | null = null;

    protected override createPeerConnection(): IRealtimePeerConnection {
        return this.Pc;
    }
    protected override createAudioSink(): IRealtimeAudioSink {
        return this.Sink;
    }
    protected override async postSdpOffer(offerSdp: string, ephemeralToken: string): Promise<string> {
        if (this.PostError) {
            throw this.PostError;
        }
        this.PostedOffers.push({ sdp: offerSdp, token: ephemeralToken });
        return this.AnswerSdp;
    }
}

/** Builds an OpenAI-flavored server-minted client session config. */
export function makeOpenAIConfig(sessionConfig: JSONObject = { instructions: 'be helpful' }): ClientRealtimeSessionConfig {
    return {
        Provider: 'openai',
        Model: 'gpt-realtime',
        EphemeralToken: 'ek_test_123',
        ExpiresAt: new Date(Date.now() + 60000).toISOString(),
        SessionConfig: sessionConfig,
    };
}

// ── Gemini fakes ───────────────────────────────────────────────────────────────

/** Fake Gemini Live session: records every outbound send for assertions. */
export class FakeGeminiSession implements GeminiLiveClientSession {
    public RealtimeInputs: Array<{ audio?: GeminiBlob; text?: string }> = [];
    public ClientContents: Array<{ turns?: Content[]; turnComplete?: boolean }> = [];
    public ToolResponses: Array<{ functionResponses: FunctionResponse[] }> = [];
    public Closed = false;

    public sendRealtimeInput(params: { audio?: GeminiBlob; text?: string }): void {
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
export class FakeGeminiPlayback implements IGeminiAudioPlayback {
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
export class FakeGeminiMicCapture implements IGeminiMicCapture {
    public Stopped = false;
    public Stop(): void {
        this.Stopped = true;
    }
}

/** Harness overriding all three creation seams so Connect runs with NO network / audio. */
export class GeminiTestClient extends GeminiRealtimeClient {
    public Fake = new FakeGeminiSession();
    public Playback = new FakeGeminiPlayback();
    public Capture = new FakeGeminiMicCapture();
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

/** Builds a Gemini-flavored server-minted client session config. */
export function makeGeminiConfig(sessionConfig?: JSONObject): ClientRealtimeSessionConfig {
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
