/**
 * Shared in-memory fakes + harnesses for the realtime-client test suites.
 *
 * These mirror (and extend) the fakes embedded in the original per-driver test files so the
 * extended / contract suites can reuse one implementation. No network, no WebRTC, no Web Audio.
 */
import { ClientRealtimeSessionConfig, JSONObject, type RealtimeVideoFrame } from '@memberjunction/ai';
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
    IRealtimeRtpSender,
    OpenAIRealtimeClient,
} from '../../drivers/openAIRealtimeClient';
import { IPcmMicCapture } from '../../audio/micCapture';
import {
    GeminiClientConnectArgs,
    GeminiLiveClientSession,
    GeminiRealtimeClient,
    IGeminiAudioPlayback,
    IGeminiMicCapture,
} from '../../drivers/geminiRealtimeClient';
import { GEMINI_AVATAR_MP4_TYPE, type IAvatarVideoPlayout, type VideoPlayoutOptions, type VideoPlayoutProblem } from '../../media/videoPlayout';
import type { MediaVideoSource } from '../../media/model';

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

/**
 * Fake PCM mic capture: records stops and rebinds. Like the real one, a rebind to a stream without an
 * audio track throws.
 */
export class FakeMicCapture implements IPcmMicCapture {
    public Stopped = false;
    /** Every stream handed to Rebind, in order. */
    public readonly Rebound: MediaStream[] = [];
    public Stop(): void {
        this.Stopped = true;
    }
    public Rebind(micStream: MediaStream): void {
        if (micStream.getAudioTracks().length === 0) {
            throw new Error('The microphone stream has no audio track.');
        }
        this.Rebound.push(micStream);
    }
}

/** Fake RTP sender: records every track it is moved to. */
export class FakeRtpSender implements IRealtimeRtpSender {
    /** Every track handed to replaceTrack, in order. */
    public readonly Replaced: Array<MediaStreamTrack | null> = [];
    constructor(public Track: MediaStreamTrack | null) {}
    public async replaceTrack(track: MediaStreamTrack | null): Promise<void> {
        this.Replaced.push(track);
        this.Track = track;
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
    /** The sender handed back for each added track. */
    public Senders: FakeRtpSender[] = [];
    public Channel = new FakeDataChannel();
    public ChannelLabel = '';
    public LocalDescription: RTCSessionDescriptionInit | null = null;
    public RemoteDescription: RTCSessionDescriptionInit | null = null;
    public Closed = false;
    /** When set, createOffer rejects with this error (Connect failure-path tests). */
    public OfferError: Error | null = null;
    /** The offer returned by createOffer (sdp may be intentionally omitted). */
    public Offer: RTCSessionDescriptionInit = { type: 'offer', sdp: 'FAKE_OFFER_SDP' };

    public addTrack(track: MediaStreamTrack, _stream: MediaStream): FakeRtpSender {
        this.AddedTracks.push(track);
        const sender = new FakeRtpSender(track);
        this.Senders.push(sender);
        return sender;
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

/** What Google sends once it has applied a connection's setup. */
export const GEMINI_SETUP_COMPLETE = { setupComplete: {} } as LiveServerMessage;

/**
 * Confirms a fake connection's setup through its message callback, as Google does once it has applied the setup the
 * client sent. The Gemini client puts a connection to use only after that.
 */
export function ConfirmGeminiSetup(args: GeminiClientConnectArgs): void {
    args.OnMessage(GEMINI_SETUP_COMPLETE);
}

/** Fake Gemini Live session: records every outbound send for assertions. */
export class FakeGeminiSession implements GeminiLiveClientSession {
    public RealtimeInputs: Array<{ audio?: GeminiBlob; text?: string; media?: GeminiBlob; video?: GeminiBlob }> = [];
    public ClientContents: Array<{ turns?: Content[]; turnComplete?: boolean }> = [];
    public ToolResponses: Array<{ functionResponses: FunctionResponse[] }> = [];
    public Closed = false;

    public sendRealtimeInput(params: { audio?: GeminiBlob; text?: string; media?: GeminiBlob; video?: GeminiBlob }): void {
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
    /** Every element routed into the playback's graph, in order. */
    public readonly ConnectedElements: HTMLMediaElement[] = [];

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
    public ConnectMediaElement(element: HTMLMediaElement): void {
        this.ConnectedElements.push(element);
    }
}

/** Fake avatar video player: records what the driver hands it and does with it. */
export class FakeAvatarPlayout implements IAvatarVideoPlayout {
    /** Every frame the driver appended, in order. */
    public readonly Appended: RealtimeVideoFrame[] = [];
    public EndOfTurnCount = 0;
    public FlushCount = 0;
    public Disposed = false;
    /** Controllable stand-in for "the element plays with media buffered ahead". */
    public IsPlaying = false;
    /** Controllable stand-in for the playhead: how many of the appended frames, from the first, have played. A flush plays them all. */
    public Played = 0;
    public CarriesVoice: boolean;
    public readonly Source: MediaVideoSource = { Kind: 'element', Attach: () => () => undefined };

    constructor(public readonly Options: VideoPlayoutOptions) {
        this.CarriesVoice = Options.CarriesVoice ?? true;
    }

    /** The appended frames the playhead has not reached ({@link Played}). */
    public get FramesAhead(): number {
        return Math.max(0, this.Appended.length - this.Played);
    }

    public Append(frame: RealtimeVideoFrame): void {
        this.Appended.push(frame);
    }
    public EndOfTurn(): void {
        this.EndOfTurnCount++;
    }
    public Flush(): void {
        this.FlushCount++;
        this.IsPlaying = false;
        this.Played = this.Appended.length;
    }
    public OnProblem(_handler: (problem: VideoPlayoutProblem, message: string) => void): () => void {
        return () => undefined;
    }
    public Dispose(): void {
        this.Disposed = true;
    }
}

/** Harness overriding all three creation seams so Connect runs with NO network / audio. */
export class GeminiTestClient extends GeminiRealtimeClient {
    public Fake = new FakeGeminiSession();
    public Playback = new FakeGeminiPlayback();
    public Capture = new FakeMicCapture();
    public LastConnectArgs: GeminiClientConnectArgs | null = null;
    /** The driver's mic-chunk callback, captured so tests can simulate worklet frames. */
    public OnPcmChunk: ((base64Pcm16: string) => void) | null = null;
    /** Every avatar player the driver created, in order (fakes unless {@link UseRealPlayout}). */
    public readonly Playouts: IAvatarVideoPlayout[] = [];
    /** Every set of options the driver created an avatar player with. */
    public readonly PlayoutOptions: VideoPlayoutOptions[] = [];
    /** Create the real `VideoPlayout` (install the fake MSE and DOM first) instead of a {@link FakeAvatarPlayout}. */
    public UseRealPlayout = false;
    /** Confirm each connection's setup as it opens, as Google does; `false` leaves it to the test ({@link ConfirmSetup}). */
    public AutoConfirmSetup = true;

    /** The fake avatar player the driver created last; throws when it created none or a real one. */
    public get Playout(): FakeAvatarPlayout {
        const playout = this.Playouts.at(-1);
        if (!(playout instanceof FakeAvatarPlayout)) {
            throw new Error('The driver created no fake avatar player.');
        }
        return playout;
    }

    protected override CreateVideoPlayout(options: VideoPlayoutOptions): IAvatarVideoPlayout {
        this.PlayoutOptions.push(options);
        const playout = this.UseRealPlayout ? super.CreateVideoPlayout(options) : new FakeAvatarPlayout(options);
        this.Playouts.push(playout);
        return playout;
    }

    protected override async connectLiveSession(args: GeminiClientConnectArgs): Promise<GeminiLiveClientSession> {
        this.LastConnectArgs = args;
        if (this.AutoConfirmSetup) {
            ConfirmGeminiSetup(args);
        }
        return this.Fake;
    }

    /** Has Google confirm the setup of the connection opened last (with {@link AutoConfirmSetup} off). */
    public ConfirmSetup(): void {
        if (this.LastConnectArgs) {
            ConfirmGeminiSetup(this.LastConnectArgs);
        }
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

/** How {@link makeGeminiAvatarConfig} mints the avatar and what the host asks for. */
export interface GeminiAvatarConfigOptions {
    /** The minted `audioMuxed`. Default `true`. */
    AudioMuxed?: boolean;
    /** The minted encoding; `null` mints none. Default the Gemini avatar type. */
    Encoding?: string | null;
    /** Whether the host requests the agent's video, as the Avatar channel does. Default `true`. */
    RequestAgentVideo?: boolean;
}

/** The avatar name the avatar configs carry (a stand-in, not a real preset). */
export const STAND_IN_AVATAR_NAME = 'stand-in-avatar';

/** A Gemini session config whose server granted an avatar (the minted `avatar` block), as AV2's mint writes it. */
export function makeGeminiAvatarConfig(options: GeminiAvatarConfigOptions = {}): ClientRealtimeSessionConfig {
    const encoding = options.Encoding === undefined ? GEMINI_AVATAR_MP4_TYPE : options.Encoding;
    const sessionConfig: JSONObject = {
        model: 'gemini-3.8-live',
        config: { systemInstruction: 'be the voice', responseModalities: ['VIDEO'], avatarConfig: { avatarName: STAND_IN_AVATAR_NAME } },
        avatar: { output: true, encoding, audioMuxed: options.AudioMuxed ?? true },
    };
    if (options.RequestAgentVideo !== false) {
        sessionConfig['requestedTracks'] = [{ Modality: 'video', Direction: 'outbound' }];
    }
    return makeGeminiConfig(sessionConfig);
}
