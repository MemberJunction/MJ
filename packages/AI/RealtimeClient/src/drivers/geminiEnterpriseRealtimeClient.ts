import { RegisterClass } from '@memberjunction/global';
import { GoogleGenAI, Modality, type LiveConnectConfig } from '@google/genai';
import { BaseRealtimeClient } from '../generic/baseRealtimeClient';
import { GeminiRealtimeClient, type GeminiClientConnectArgs, type GeminiLiveClientSession } from './geminiRealtimeClient';

/**
 * The API key the web SDK requires before it opens a socket. A placeholder: in Vertex mode the SDK puts a key only in a
 * header, and a browser socket sends no headers, so it never leaves the page. The relay URL is the credential.
 */
const RELAY_PLACEHOLDER_API_KEY = 'mjapi-relay';

/** The Vertex AI API version; MJAPI's relay opens the same one upstream. */
const VERTEX_LIVE_API_VERSION = 'v1';

/** A relay URL's scheme, and the rest of it. */
const RELAY_URL_PATTERN = /^(wss?|https?):\/\/(.+)$/i;

/**
 * Gemini Live on **Gemini Enterprise**, in the browser: a session through MJAPI's realtime relay.
 *
 * Registered under `'gemini-enterprise'`, the `Provider` the server's `GeminiEnterpriseRealtime` driver stamps. Gemini
 * Enterprise has no browser credential, so the mint makes a relay session: `Transport` `'relay'`, the relay URL as
 * `RelayUrl` (the ticket is in its path) and no `EphemeralToken`. MJAPI holds the Google credential, writes the setup and
 * filters what the browser sends. The client opens only relay sessions. Everything else is {@link GeminiRealtimeClient}'s:
 * audio, transcripts, tools, the avatar playout, resumption (which reuses the URL).
 *
 * The web SDK runs in Vertex mode against the relay: `vertexai: true` (the browser build ignores `enterprise`), a
 * placeholder API key (the build requires one; it never leaves the page), and the relay URL as the base URL, to which the
 * SDK appends `/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`.
 */
@RegisterClass(BaseRealtimeClient, 'gemini-enterprise')
export class GeminiEnterpriseRealtimeClient extends GeminiRealtimeClient {
    /** Opts in to relay sessions: this client speaks Gemini Live to MJAPI's relay, which speaks it to Google. */
    protected override get SupportsRelayTransport(): boolean {
        return true;
    }

    /**
     * Opens one Live connection through the relay; a resume opens another with the same URL and the new handle.
     *
     * The config states the response modalities: the web SDK fills in AUDIO when it has none, and the relay reads an
     * AUDIO-only setup as a request to drop the avatar. So a session that shows the avatar always asks for VIDEO.
     *
     * @throws When the session is not a relay session, or its relay URL is not a ws(s) URL (see {@link relayBaseUrl}).
     */
    protected override async connectLiveSession(args: GeminiClientConnectArgs): Promise<GeminiLiveClientSession> {
        const ai = new GoogleGenAI({
            vertexai: true,
            apiKey: RELAY_PLACEHOLDER_API_KEY,
            httpOptions: { baseUrl: relayBaseUrl(args), apiVersion: VERTEX_LIVE_API_VERSION },
        });
        return ai.live.connect({
            model: args.Model,
            config: this.withStatedModalities(args.Config),
            callbacks: {
                onmessage: args.OnMessage,
                onerror: args.OnError,
                onclose: args.OnClose,
            },
        });
    }

    /**
     * A copy of the config that states its response modalities: VIDEO while the avatar shows (the outbound video track is
     * live), else what the config says (the minted modalities, or AUDIO when the host shows no avatar), else AUDIO.
     */
    private withStatedModalities(config: LiveConnectConfig): LiveConnectConfig {
        if (this.IsTrackEstablished('video', 'outbound')) {
            return { ...config, responseModalities: [Modality.VIDEO] };
        }
        return { ...config, responseModalities: config.responseModalities ?? [Modality.AUDIO] };
    }
}

/**
 * The relay URL as the web SDK's base URL. The SDK turns an `http:` base into `ws:` and any other into `wss:`, so a
 * `ws://` relay URL (MJAPI without TLS, in development) goes in as `http://`, and a `wss://` one as `https://`.
 *
 * @param args The session's transport and relay URL, as minted.
 * @throws When the session is not a relay session (a Gemini Enterprise session has no direct path), has no relay URL, or
 *   its relay URL is not a ws(s) or http(s) URL. No message quotes the URL or the token: the URL carries the ticket.
 */
function relayBaseUrl(args: Pick<GeminiClientConnectArgs, 'Transport' | 'RelayUrl'>): string {
    if (args.Transport !== 'relay') {
        throw new Error("GeminiEnterpriseRealtimeClient: the session is not a relay session (Transport 'relay'); Gemini Enterprise runs only through MJAPI's relay.");
    }
    if (!args.RelayUrl) {
        throw new Error('GeminiEnterpriseRealtimeClient: the relay session has no relay URL.');
    }
    const match = RELAY_URL_PATTERN.exec(args.RelayUrl);
    if (!match) {
        throw new Error('GeminiEnterpriseRealtimeClient: the relay URL is not a ws:// or wss:// URL.');
    }
    const scheme = match[1].toLowerCase();
    const httpScheme = scheme === 'ws' || scheme === 'http' ? 'http' : 'https';
    return `${httpScheme}://${match[2]}`;
}

/**
 * Tree-shaking prevention: bundlers cannot see that {@link GeminiEnterpriseRealtimeClient} is instantiated through the
 * ClassFactory, so a consumer calls this no-op to keep the `@RegisterClass` side effect alive.
 */
export function LoadGeminiEnterpriseRealtimeClient(): void {
    // intentional no-op: the static import of this module is the point
}
