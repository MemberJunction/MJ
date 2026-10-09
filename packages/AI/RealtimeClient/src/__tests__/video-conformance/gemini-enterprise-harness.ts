/**
 * The Gemini Enterprise harness: the real `GeminiEnterpriseRealtimeClient` and the real `@google/genai` web build in
 * Vertex mode, over a fake browser `WebSocket`. The harness plays MJAPI's relay: it opens each socket the client asks
 * for and sends Google's frames, unchanged, as text. So the run covers what the Enterprise client adds (its relay
 * connect and its stated modalities) and the SDK's own Vertex message mapping.
 *
 * `@google/genai` resolves to its Node build under vitest; a test file using this harness swaps in the web build with
 * `vi.mock('@google/genai', ...)`, as a browser bundle gets it.
 */
import type { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import type { LiveServerMessage } from '@google/genai';
import type { BaseRealtimeClient } from '../../generic/baseRealtimeClient';
import type { IGeminiAudioPlayback, IGeminiMicCapture } from '../../drivers/geminiRealtimeClient';
import { GeminiEnterpriseRealtimeClient } from '../../drivers/geminiEnterpriseRealtimeClient';
import { GEMINI_AVATAR_MP4_TYPE, type IAvatarVideoPlayout, type VideoPlayoutOptions } from '../../media/videoPlayout';
import type { RealtimeVideoConformanceGrant, RealtimeVideoConformanceMedia, RealtimeVideoConformanceTraits } from '../../testing';
import { FakeMicCapture } from '../helpers/realtime-fakes';
import { AsksForVideo, CONFORMANCE_GEMINI_MODEL, GeminiHarnessBase, GeminiProfileFacts } from './gemini-harness';
import { GlobalOverride, HalfAnHourFromNow, NextMacrotask, WaitUntil } from './harness-support';

/** The relay URL the harness mints: MJAPI without TLS, as in development. The ticket is a placeholder. */
const CONFORMANCE_RELAY_URL = 'ws://localhost:4000/realtime/relay/conformance-ticket';

/** How `GeminiEnterpriseRealtime` hands the browser a relay session: `Transport` `'relay'`, the URL, and no token. */
function relaySessionCredential(relayUrl: string): Pick<ClientRealtimeSessionConfig, 'EphemeralToken' | 'Transport' | 'RelayUrl'> {
    return { Transport: 'relay', RelayUrl: relayUrl, EphemeralToken: '' };
}

/** The video-only type a grant without the voice names. */
const VIDEO_ONLY_AVATAR_TYPE = 'video/mp4; codecs="avc1.42c01f"';

/** The avatar name the harness mints; a stand-in, not a real preset. */
const CONFORMANCE_AVATAR_NAME = 'conformance-avatar';

/** Stands in for the browser's `WebSocket`: records the frames the client sends; the harness plays the relay. */
export class FakeRelaySocket {
    public onopen: ((event: Event) => void) | null = null;
    public onmessage: ((event: { data: string }) => void) | null = null;
    public onerror: ((event: Event) => void) | null = null;
    public onclose: ((event: CloseEvent) => void) | null = null;
    public readonly Sent: string[] = [];
    public Closed = false;

    constructor(public readonly Url: string) {}

    public send(data: string): void {
        this.Sent.push(data);
    }

    public close(): void {
        this.Closed = true;
    }

    /** The relay accepted the upgrade. */
    public Open(): void {
        this.onopen?.(new Event('open'));
    }

    /** A frame from the relay: Google's JSON, as text. */
    public Receive(message: LiveServerMessage): void {
        this.onmessage?.({ data: JSON.stringify(message) });
    }

    /** The setup frame the client sent first, or `null` before it sent one. */
    public get Setup(): JSONObject | null {
        if (this.Sent.length === 0) {
            return null;
        }
        const first = JSON.parse(this.Sent[0]) as JSONObject;
        const setup = first['setup'];
        return setup !== null && typeof setup === 'object' && !Array.isArray(setup) ? setup : null;
    }
}

/** The real Enterprise client with its microphone, voice and video seams replaced; its transport is the web SDK's. */
export class GeminiEnterpriseKitClient extends GeminiEnterpriseRealtimeClient {
    constructor(private readonly media: RealtimeVideoConformanceMedia) {
        super();
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

/** Gemini 3.8 Live on Gemini Enterprise, through a fake relay. */
export class GeminiEnterpriseHarness extends GeminiHarnessBase {
    public readonly Name = 'gemini-enterprise';
    public readonly Traits: RealtimeVideoConformanceTraits = {
        AgentVideo: 'playout',
        GrantsAvatar: true,
        Voice: 'pcm',
        VideoCanCarryVoice: true,
        VideoUsage: true,
        VideoFrameKind: 'fmp4',
        TimedVoice: false,
    };
    /** Every socket the client opened, in order; the last is the connection in use. */
    public readonly Sockets: FakeRelaySocket[] = [];
    private readonly webSocket = new GlobalOverride('WebSocket');

    /** The pact as `GeminiEnterpriseRealtime` mints it: a minimal config, the model's facts, the avatar block when granted. */
    public Mint(grant: RealtimeVideoConformanceGrant): ClientRealtimeSessionConfig {
        const muxed = grant.VideoCarriesVoice !== false;
        const config: JSONObject = grant.Avatar
            ? { responseModalities: ['VIDEO'], avatarConfig: { avatarName: CONFORMANCE_AVATAR_NAME } }
            : { responseModalities: ['AUDIO'] };
        const sessionConfig: JSONObject = { model: CONFORMANCE_GEMINI_MODEL, config, ...GeminiProfileFacts() };
        if (grant.Avatar) {
            sessionConfig['avatar'] = { output: true, encoding: muxed ? GEMINI_AVATAR_MP4_TYPE : VIDEO_ONLY_AVATAR_TYPE, audioMuxed: muxed };
        }
        return {
            Provider: 'gemini-enterprise',
            Model: CONFORMANCE_GEMINI_MODEL,
            ...relaySessionCredential(CONFORMANCE_RELAY_URL),
            ExpiresAt: HalfAnHourFromNow(),
            SessionConfig: sessionConfig,
        };
    }

    public CreateClient(media: RealtimeVideoConformanceMedia): BaseRealtimeClient {
        this.Playability.Install();
        this.webSocket.Install(this.socketClass());
        return new GeminiEnterpriseKitClient(media);
    }

    /** Connects through the relay: the client opens a socket, the relay accepts it, the SDK sends its setup. */
    public async Connect(client: BaseRealtimeClient, config: ClientRealtimeSessionConfig, microphone: MediaStream): Promise<void> {
        const opened = this.Sockets.length;
        let settled = false;
        const connecting = client.Connect(config, microphone).finally(() => {
            settled = true;
        });
        await WaitUntil(() => this.Sockets.length > opened || settled, 'the Enterprise client to open its relay socket');
        this.Sockets[opened]?.Open();
        await connecting;
    }

    /** Whether the setup the client sent asked Google for video: VIDEO among its response modalities. */
    public AskedProviderForVideo(): boolean {
        const generation = this.Sockets.at(-1)?.Setup?.['generationConfig'];
        const modalities = generation !== null && typeof generation === 'object' && !Array.isArray(generation) ? generation['responseModalities'] : undefined;
        return AsksForVideo({ responseModalities: modalities ?? null });
    }

    /** Google issues a handle and announces the end; the client opens a second socket to the same relay URL. */
    public async Resume(): Promise<void> {
        const first = this.currentSocket();
        const opened = this.Sockets.length;
        for (const message of GeminiHarnessBase.ResumeAnnouncements(`conformance-handle-${opened}`)) {
            first.Receive(message);
        }
        await WaitUntil(() => this.Sockets.length > opened, 'the Enterprise client to open the resumed relay socket');
        this.Sockets[opened].Open();
        await WaitUntil(() => first.Closed, 'the Enterprise client to close the replaced relay socket');
        await NextMacrotask();
    }

    public override Dispose(): void {
        this.webSocket.Restore();
        super.Dispose();
    }

    protected async Deliver(message: LiveServerMessage): Promise<void> {
        this.currentSocket().Receive(message);
        await NextMacrotask();
    }

    private currentSocket(): FakeRelaySocket {
        const socket = this.Sockets.at(-1);
        if (!socket) {
            throw new Error('gemini-enterprise: the client opened no relay socket');
        }
        return socket;
    }

    /** A `WebSocket` class whose instances this harness keeps. */
    private socketClass(): new (url: string) => FakeRelaySocket {
        const sockets = this.Sockets;
        return class extends FakeRelaySocket {
            constructor(url: string) {
                super(url);
                sockets.push(this);
            }
        };
    }
}
