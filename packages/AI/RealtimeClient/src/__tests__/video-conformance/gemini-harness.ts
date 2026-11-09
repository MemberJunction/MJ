/**
 * The Gemini Live harnesses' shared half: the model's side as Gemini Live sends it (`serverContent` with base64
 * `inlineData` parts, `generationComplete`, `turnComplete`, `interrupted`), the traits, and the playability stub
 * `VideoPlayout.IsSupported` reads. Then the Gemini Developer API harness: the real `GeminiRealtimeClient` over its
 * `connectLiveSession` seam, one in-memory session per connection, minted as the Developer API mints (no avatar block:
 * no Developer model renders one).
 */
import type { ClientRealtimeSessionConfig, JSONObject, RealtimeVideoFrame } from '@memberjunction/ai';
import type { LiveConnectConfig, LiveServerContent, LiveServerMessage } from '@google/genai';
import { BytesToBase64 } from '../../audio/pcmUtils';
import type { BaseRealtimeClient } from '../../generic/baseRealtimeClient';
import {
    GeminiRealtimeClient,
    type GeminiClientConnectArgs,
    type GeminiLiveClientSession,
    type IGeminiAudioPlayback,
    type IGeminiMicCapture,
} from '../../drivers/geminiRealtimeClient';
import type { IAvatarVideoPlayout, VideoPlayoutOptions } from '../../media/videoPlayout';
import type { IRealtimeVideoConformanceHarness, RealtimeVideoConformanceGrant, RealtimeVideoConformanceMedia, RealtimeVideoConformanceTraits } from '../../testing';
import { ConfirmGeminiSetup, FakeGeminiSession, FakeMicCapture } from '../helpers/realtime-fakes';
import { HalfAnHourFromNow, NextMacrotask, PlayabilityStub, WaitUntil } from './harness-support';

/** The MIME type of Gemini Live's model voice. */
export const GEMINI_VOICE_MIME_TYPE = 'audio/pcm;rate=24000';

/** The model the harnesses mint: Gemini 3.8 Live, the one that renders avatars on Gemini Enterprise. */
export const CONFORMANCE_GEMINI_MODEL = 'gemini-3.8-live';

/** The model's facts the server writes into every Gemini pact (its profile). */
export function GeminiProfileFacts(): JSONObject {
    return { idleSignal: 'turnComplete', supportsScheduling: true, supportsBlocking: false, supportsInboundVideo: true, maxInboundVideoRate: 1, maxInboundVideoStreams: 1 };
}

/**
 * Whether a connect config asks Gemini for video: VIDEO among its response modalities. An avatar named beside AUDIO
 * alone gets no video (MJAPI's relay reads AUDIO alone as a request to drop the avatar).
 */
export function AsksForVideo(config: LiveConnectConfig | JSONObject | undefined): boolean {
    const modalities = config?.['responseModalities'];
    return Array.isArray(modalities) && modalities.some((m) => String(m).toUpperCase() === 'VIDEO');
}

/**
 * What both Gemini harnesses share: the model's side of the wire as `LiveServerMessage`s, delivered by the subclass's
 * transport, and the playability stub the avatar track reads. Gemini's video is fragmented MP4 sent as `inlineData` parts
 * (bytes and a MIME type, no time), and its PCM carries no media time.
 */
export abstract class GeminiHarnessBase implements IRealtimeVideoConformanceHarness {
    public abstract readonly Name: string;
    public abstract readonly Traits: RealtimeVideoConformanceTraits;
    protected readonly Playability = new PlayabilityStub();

    public abstract Mint(grant: RealtimeVideoConformanceGrant): ClientRealtimeSessionConfig;
    public abstract CreateClient(media: RealtimeVideoConformanceMedia): BaseRealtimeClient;
    public abstract Connect(client: BaseRealtimeClient, config: ClientRealtimeSessionConfig, microphone: MediaStream): Promise<void>;
    public abstract AskedProviderForVideo(): boolean;
    public abstract Resume(): Promise<void>;

    /** Delivers one server message on the connection in use, resolving once the client has handled it. */
    protected abstract Deliver(message: LiveServerMessage): Promise<void>;

    public RefusePlayback(): () => void {
        return this.Playability.Refuse();
    }

    /** An fMP4 frame as Gemini sends it: an `inlineData` part of its bytes and MIME type. */
    public SendVideo(frame: RealtimeVideoFrame): Promise<void> {
        return this.SendPart(frame.MimeType, frame.Data);
    }

    /** A PCM part; Gemini's parts carry no media time, so a time is not sent. */
    public SendVoice(pcm16: ArrayBuffer, _mediaTimeMs?: number): Promise<void> {
        return this.SendPart(GEMINI_VOICE_MIME_TYPE, pcm16);
    }

    public SendPart(mimeType: string, data: ArrayBuffer): Promise<void> {
        return this.deliverContent({ modelTurn: { role: 'model', parts: [{ inlineData: { mimeType, data: BytesToBase64(new Uint8Array(data)) } }] } });
    }

    /** The model's first words, as Gemini transcribes its output: its answer is under way. */
    public AnswerStarted(): Promise<void> {
        return this.deliverContent({ outputTranscription: { text: 'Here is what I found.' } });
    }

    public GenerationComplete(): Promise<void> {
        return this.deliverContent({ generationComplete: true });
    }

    public TurnComplete(): Promise<void> {
        return this.deliverContent({ turnComplete: true });
    }

    public Interrupted(): Promise<void> {
        return this.deliverContent({ interrupted: true });
    }

    public Dispose(): void {
        this.Playability.Restore();
    }

    /** The announcements of a planned move: a resumable handle, then Google saying the connection ends. */
    protected static ResumeAnnouncements(handle: string): LiveServerMessage[] {
        return [
            { sessionResumptionUpdate: { newHandle: handle, resumable: true } } as LiveServerMessage,
            { goAway: { timeLeft: '60s' } } as LiveServerMessage,
        ];
    }

    private deliverContent(content: LiveServerContent): Promise<void> {
        return this.Deliver({ serverContent: content } as LiveServerMessage);
    }
}

/** One connection the Developer client opened: what it connected with, and the in-memory session it got. */
interface DeveloperConnection {
    Args: GeminiClientConnectArgs;
    Session: FakeGeminiSession;
}

/** The real Gemini client with its transport, microphone, voice and video seams replaced. */
export class GeminiDeveloperKitClient extends GeminiRealtimeClient {
    public readonly Connections: DeveloperConnection[] = [];

    constructor(private readonly media: RealtimeVideoConformanceMedia) {
        super();
    }

    /** The connection in use: the last one opened. */
    public get Current(): DeveloperConnection | undefined {
        return this.Connections.at(-1);
    }

    protected override async connectLiveSession(args: GeminiClientConnectArgs): Promise<GeminiLiveClientSession> {
        const session = new FakeGeminiSession();
        this.Connections.push({ Args: args, Session: session });
        // Google confirms the setup; the client puts the connection to use only after that.
        ConfirmGeminiSetup(args);
        return session;
    }

    protected override async createMicCapture(_micStream: MediaStream, _onPcmChunk: (base64Pcm16: string) => void): Promise<IGeminiMicCapture> {
        return new FakeMicCapture();
    }

    protected override createPlayback(): IGeminiAudioPlayback {
        return this.media.Voice;
    }

    protected override CreateVideoPlayout(options: VideoPlayoutOptions): IAvatarVideoPlayout {
        return this.media.CreateVideoPlayer(options);
    }
}

/** The Gemini Developer API: audio-only mints, server messages straight into the client's callback. */
export class GeminiDeveloperHarness extends GeminiHarnessBase {
    public readonly Name = 'gemini-developer';
    public readonly Traits: RealtimeVideoConformanceTraits = {
        AgentVideo: 'playout',
        GrantsAvatar: false,
        Voice: 'pcm',
        VideoCanCarryVoice: true,
        VideoUsage: true,
        VideoFrameKind: 'fmp4',
        TimedVoice: false,
    };
    private client: GeminiDeveloperKitClient | null = null;

    public Mint(grant: RealtimeVideoConformanceGrant): ClientRealtimeSessionConfig {
        if (grant.Avatar) {
            throw new Error('The Gemini Developer API renders no avatar: no Developer model is minted one.');
        }
        return {
            Provider: 'gemini',
            Model: CONFORMANCE_GEMINI_MODEL,
            EphemeralToken: 'auth_tokens/conformance',
            ExpiresAt: HalfAnHourFromNow(),
            SessionConfig: { model: CONFORMANCE_GEMINI_MODEL, config: { responseModalities: ['AUDIO'], sessionResumption: {} }, ...GeminiProfileFacts() },
        };
    }

    public CreateClient(media: RealtimeVideoConformanceMedia): BaseRealtimeClient {
        this.Playability.Install();
        this.client = new GeminiDeveloperKitClient(media);
        return this.client;
    }

    public async Connect(client: BaseRealtimeClient, config: ClientRealtimeSessionConfig, microphone: MediaStream): Promise<void> {
        await client.Connect(config, microphone);
    }

    public AskedProviderForVideo(): boolean {
        return AsksForVideo(this.client?.Current?.Args.Config);
    }

    /** Google issues a handle and announces the end; the client opens a new connection, closes the old one and listens. */
    public async Resume(): Promise<void> {
        const client = this.requireClient();
        const before = client.Connections.length;
        const current = client.Current;
        for (const message of GeminiHarnessBase.ResumeAnnouncements(`conformance-handle-${before}`)) {
            current?.Args.OnMessage(message);
        }
        await WaitUntil(() => client.Connections.length > before && !!current?.Session.Closed, 'the resumed Gemini connection');
        await NextMacrotask();
    }

    protected async Deliver(message: LiveServerMessage): Promise<void> {
        this.requireClient().Current?.Args.OnMessage(message);
    }

    private requireClient(): GeminiDeveloperKitClient {
        if (!this.client) {
            throw new Error('gemini-developer: no client yet');
        }
        return this.client;
    }
}
