import { RealtimeSessionRuntime } from '@memberjunction/realtime-runtime';
import { RNRealtimeMediaHost } from './rn-media-host';
import { LoadRNRealtimeDrivers, IsRealtimeProviderSupported } from './rn-realtime-driver';

// Tree-shaking guard: the RN WebRTC drivers register via `@RegisterClass` module side effects, and
// a bundler that sees no import of that module drops it — the driver then never registers and the
// session fails to resolve a client at runtime while working in development.
LoadRNRealtimeDrivers();

/**
 * @fileoverview The mobile app's realtime voice session.
 *
 * Deliberately almost empty. All session orchestration — minting, resolving the provider's client
 * driver, transcripts and captions, relaying tool calls, pacing delegation narration, managing
 * interactive channels, usage relay, teardown — lives in
 * {@link RealtimeSessionRuntime} (`@memberjunction/realtime-runtime`), the same engine MJ Explorer
 * runs. This class supplies the one thing that genuinely differs between hosts: where the
 * microphone comes from.
 *
 * It replaces a 490-line mobile-specific service that hand-rolled the mint and connect. That
 * service predated the runtime extraction and would have drifted from Explorer at the next
 * protocol change — which GPT-Live demonstrated is a frequent event.
 */
export class MobileVoiceSession extends RealtimeSessionRuntime {
    constructor() {
        super(new RNRealtimeMediaHost());
    }

    /**
     * Declares the providers this build can carry audio for.
     *
     * The WebRTC providers work because `react-native-webrtc` supplies the peer connection and the
     * platform routes the remote track. The WebSocket + PCM16 providers (Gemini Live, ElevenLabs
     * Agents, AssemblyAI) need a Web Audio plane that does not exist under Hermes; without this
     * filter the runtime connects, constructs the driver's playback engine, and throws on
     * `AudioContext`. Declining up front turns a crash into a sentence the user can act on.
     */
    protected override hostCanUseProvider(provider: string): boolean {
        const supported = IsRealtimeProviderSupported(provider);
        // Remembered so the screen can name the provider it declined, instead of showing a generic
        // failure for a situation that is entirely explainable.
        this._declinedProvider = supported ? null : provider;
        return supported;
    }

    private _declinedProvider: string | null = null;

    /**
     * The provider key this host declined, or `null` if none was.
     *
     * Set when {@link hostCanUseProvider} rejects a minted session, so the call UI can say which
     * provider the workspace uses rather than "voice failed".
     */
    public get DeclinedProvider(): string | null {
        return this._declinedProvider;
    }
}
