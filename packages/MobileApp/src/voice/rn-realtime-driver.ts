import { RegisterClass } from '@memberjunction/global';
import {
    OpenAILiveClient,
    OpenAIRealtimeClient,
    type IRealtimeLivePeerConnection,
    type IRealtimePeerConnection,
} from '@memberjunction/ai-realtime-client';
import { RTCPeerConnection } from 'react-native-webrtc';

/**
 * @fileoverview React Native drivers for MJ's WebRTC realtime providers.
 *
 * ## Why this file is short
 *
 * The realtime client drivers keep every piece of provider wire logic — transport negotiation, the
 * response state machine, transcript routing, tool-call plumbing, playback-drain finalization,
 * dedupe — platform-agnostic. Only two members reach for the browser:
 *
 *  - `createPeerConnection()`, already a factory method precisely so it can be substituted;
 *  - `attachRemoteAudio()`, which creates an `<audio>` element to play the agent's track.
 *
 * `react-native-webrtc` supplies a conforming `RTCPeerConnection`, and on React Native a remote
 * audio track is routed to the output device automatically once the connection is established —
 * there is no element to attach it to. So both overrides are trivial, and roughly 800 lines of
 * protocol implementation are reused verbatim per provider.
 *
 * ## Why WebRTC and not raw PCM
 *
 * This is not a preference; it is what the protocol requires. On GPT-Live's client transport,
 * `session.input_audio.append` and `session.output_audio.delta` are **forbidden** on the data
 * channel — media rides the tracks. So there is no PCM audio plane to implement on this path at
 * all, which is why voice stopped being blocked on a native PCM streaming module.
 *
 * The platform's WebRTC stack also brings acoustic echo cancellation, noise suppression, gain
 * control and a jitter buffer. On a phone in speakerphone — the normal way a hands-free agent is
 * used — that matters: without echo cancellation the microphone hears the agent's own voice.
 *
 * ## What is NOT covered here
 *
 * The WebSocket + PCM16 providers (Gemini Live, ElevenLabs Agents, AssemblyAI) need an
 * `IPcmMicCapture` / `IRealtimePcmPlayback` pair backed by a native audio module. Those seams exist
 * on their drivers and are deliberately left unimplemented rather than faked — see
 * `rn-audio-adapter.ts`.
 */

/**
 * Creates a `react-native-webrtc` peer connection.
 *
 * Typed through the drivers' own structural interface rather than the DOM's `RTCPeerConnection`, so
 * the cast is confined to this one function instead of leaking into the driver subclasses. The two
 * implementations agree on every member the drivers use; they differ only in which runtime provides
 * them.
 */
function createNativePeerConnection(): RTCPeerConnection {
    return new RTCPeerConnection({
        // A public STUN server is enough for the provider's media path; MJ never relays media.
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
}

/**
 * GPT-Live driver for React Native.
 *
 * Registered under the same provider key the server stamps (`'openai-live'`), so
 * `ResolveMobileRealtimeClient` finds it exactly the way the browser host finds its own.
 */
@RegisterClass(OpenAILiveClient, 'openai-live')
export class RNOpenAILiveClient extends OpenAILiveClient {
    /** @inheritdoc */
    protected override createPeerConnection(): IRealtimeLivePeerConnection {
        return createNativePeerConnection() as unknown as IRealtimeLivePeerConnection;
    }

    /**
     * No-op on React Native.
     *
     * The browser driver creates an `<audio>` element and points it at the remote stream. Under
     * `react-native-webrtc` the remote audio track is rendered to the active output route as soon as
     * the peer connection is established, so creating anything here would be redundant at best.
     *
     * The base class still fires its remote-stream handlers, which is what the call UI's
     * audio-reactive visuals and the session recorder subscribe to.
     */
    protected override attachRemoteAudio(_pc: IRealtimePeerConnection): void {
        /* intentionally empty — see the doc comment */
    }
}

/**
 * GPT Realtime (the pre-Live protocol) driver for React Native.
 *
 * Kept alongside the Live driver rather than replaced by it: the two are different protocols, a
 * deployment may pin either, and the same two overrides serve both. Grok Voice also resolves
 * through the OpenAI protocol profile, so it is covered by this driver as well.
 */
@RegisterClass(OpenAIRealtimeClient, 'openai')
export class RNOpenAIRealtimeClient extends OpenAIRealtimeClient {
    /** @inheritdoc */
    protected override createPeerConnection(): IRealtimePeerConnection {
        return createNativePeerConnection() as unknown as IRealtimePeerConnection;
    }

    /** @inheritdoc — see {@link RNOpenAILiveClient.attachRemoteAudio}. */
    protected override attachRemoteAudio(_pc: IRealtimePeerConnection): void {
        /* intentionally empty — see the doc comment */
    }
}

/**
 * Tree-shaking guard.
 *
 * `@RegisterClass` runs as a module side effect; a bundler that sees no import of this module drops
 * it, the drivers never register, and a realtime session fails to resolve a client at runtime while
 * working in development.
 */
export function LoadRNRealtimeDrivers(): void {
    /* intentionally empty — see the doc comment */
}

/**
 * Provider keys this build can actually carry audio for.
 *
 * The server picks a realtime model by rank, so a deployment can legitimately resolve a provider
 * this app has no audio plane for. Checking up front lets the UI say "voice is not available with
 * this provider" instead of opening a session that would be silent in both directions.
 */
export const SupportedRealtimeProviders: readonly string[] = ['openai', 'openai-live', 'xai'];

/**
 * Whether this build can carry a realtime session for the given provider key.
 *
 * @param provider The `Provider` value returned by `StartRealtimeClientSession`.
 */
export function IsRealtimeProviderSupported(provider: string | null | undefined): boolean {
    return !!provider && SupportedRealtimeProviders.includes(provider.toLowerCase());
}
