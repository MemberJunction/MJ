import { RegisterClass } from '@memberjunction/global';
import {
    BaseRealtimeClient,
    OpenAILiveClient,
    OpenAIRealtimeClient,
    type IRealtimeAudioSink,
    type IRealtimeLivePeerConnection,
    type IRealtimePeerConnection,
} from '@memberjunction/ai-realtime-client';
import { RTCPeerConnection, registerGlobals } from 'react-native-webrtc';

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
 *  - `createAudioSink()`, which creates an `<audio>` element to play the agent's track.
 *
 * `react-native-webrtc` supplies a conforming `RTCPeerConnection`, and on React Native a remote
 * audio track is routed to the output device automatically once the connection is established —
 * there is no element to attach it to. So both overrides are trivial, and roughly 800 lines of
 * protocol implementation are reused verbatim per provider.
 *
 * ## Why the sink is overridden and not `attachRemoteAudio`
 *
 * `attachRemoteAudio` is where the base driver installs `pc.ontrack` — the handler that records the
 * remote stream, notifies every `OnRemoteStream` subscriber, and attaches the agent-side audio
 * meter. Overriding *that* would silently delete all of it, leaving `GetRemoteMediaStream()` null
 * forever and any future session recorder capturing microphone only. Overriding the sink factory
 * removes exactly the browser-specific part — the DOM element — and leaves the wiring intact.
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
 * The WebSocket + PCM16 providers (Gemini Live, Grok Voice, ElevenLabs Agents, AssemblyAI) need an
 * `IPcmMicCapture` / `IRealtimePcmPlayback` pair backed by a native audio module. Those seams exist
 * on their drivers and are deliberately left unimplemented rather than faked — see
 * `rn-audio-adapter.ts`.
 */

// `react-native-webrtc` ships the WebRTC types as module exports; the drivers and the meters reach
// for several of them (`MediaStream`, `RTCSessionDescription`) as globals the way a browser
// provides them. Installing them is the package's documented setup step and must happen before any
// driver constructs a connection.
registerGlobals();

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
 * The audio sink for React Native: an inert object that satisfies the driver's contract.
 *
 * `react-native-webrtc` renders a remote audio track to the active output route as soon as the peer
 * connection is established — there is no element to point at the stream. But the base driver's
 * `ontrack` handler is guarded on a non-null sink, so returning `null` here would discard the
 * remote stream, its subscribers and the output meter along with the element. This keeps the
 * handler live and lets the assignments fall on the floor, which is precisely what they should do.
 */
function createInertAudioSink(): IRealtimeAudioSink {
    return {
        srcObject: null,
        remove(): void {
            /* nothing to remove — there is no element on this platform */
        },
    };
}

/**
 * GPT-Live driver for React Native.
 *
 * Registered against `BaseRealtimeClient` under the provider key the server stamps
 * (`'openai-live'`) — the same base class and key the browser driver uses, because that is what the
 * shared runtime resolves against. Registering against `OpenAILiveClient` instead would file it in
 * a bucket nothing ever looks in: `ClassFactory` matches on the registered base class's *name*, so
 * the browser driver would still win and throw on `RTCPeerConnection` under Hermes. MJ's
 * auto-incrementing priority does the rest — this module registers after the stock drivers, so it
 * takes precedence on this platform.
 */
@RegisterClass(BaseRealtimeClient, 'openai-live')
export class RNOpenAILiveClient extends OpenAILiveClient {
    /** @inheritdoc */
    protected override createPeerConnection(): IRealtimeLivePeerConnection {
        return createNativePeerConnection() as unknown as IRealtimeLivePeerConnection;
    }

    /** @inheritdoc — see {@link createInertAudioSink}. */
    protected override createAudioSink(): IRealtimeAudioSink {
        return createInertAudioSink();
    }
}

/**
 * GPT Realtime (the pre-Live protocol) driver for React Native.
 *
 * Kept alongside the Live driver rather than replaced by it: the two are different protocols, a
 * deployment may pin either, and the same two overrides serve both.
 */
@RegisterClass(BaseRealtimeClient, 'openai')
export class RNOpenAIRealtimeClient extends OpenAIRealtimeClient {
    /** @inheritdoc */
    protected override createPeerConnection(): IRealtimePeerConnection {
        return createNativePeerConnection() as unknown as IRealtimePeerConnection;
    }

    /** @inheritdoc — see {@link createInertAudioSink}. */
    protected override createAudioSink(): IRealtimeAudioSink {
        return createInertAudioSink();
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
 *
 * Only the two WebRTC providers qualify. Grok Voice (`'xai'`) speaks the OpenAI *protocol* but over
 * a websocket with a client-owned PCM plane — it derives from
 * `OpenAIProtocolWebSocketRealtimeClient`, not from the WebRTC drivers overridden above, and its
 * playback engine constructs an `AudioContext` that does not exist under Hermes. Listing it here
 * would admit exactly the crash this list exists to prevent.
 */
export const SupportedRealtimeProviders: readonly string[] = ['openai', 'openai-live'];

/**
 * Whether this build can carry a realtime session for the given provider key.
 *
 * @param provider The `Provider` value returned by `StartRealtimeClientSession`.
 */
export function IsRealtimeProviderSupported(provider: string | null | undefined): boolean {
    return !!provider && SupportedRealtimeProviders.includes(provider.toLowerCase());
}
