import { RegisterClass } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, JSONObject, REALTIME_RELAY_TIME_LIMIT_CLOSE_CODE } from '@memberjunction/ai';
import { BaseRealtimeClient, REALTIME_CLIENT_TIME_LIMIT_ERROR_CODE } from '../generic/baseRealtimeClient';
import { OpenAIProtocolWebSocketRealtimeClient, IOpenAIProtocolClientSocket } from '../generic/openAIProtocolClient';

/** PCM16 mono rate used when the server pact names none. Matches the server driver's rate. */
export const ASSEMBLYAI_VOICE_PCM_SAMPLE_RATE = 24000;

/** Structural subset of the platform `WebSocket` (typed structurally so the package compiles without the DOM lib). */
interface NativeWebSocketLike {
    onopen: (() => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onerror: (() => void) | null;
    onclose: ((event: { code?: number }) => void) | null;
    send(data: string): void;
    close(): void;
}

/**
 * Browser driver for AssemblyAI voice sessions (`AssemblyAIVoiceRealtime` on the server).
 *
 * The socket goes to MJAPI's realtime proxy, where the agent itself runs: `EphemeralToken` is the whole
 * `wss://…/realtime-proxy?ticket=…` URL. It speaks the OpenAI Realtime protocol, so the shared client does the rest.
 *
 * Unlike the other drivers of that client it applies no session config. The prompt, tools and turn settings were fixed
 * when the server minted the session; the pact carries the audio rate only.
 */
@RegisterClass(BaseRealtimeClient, 'assemblyai-voice')
export class AssemblyAIVoiceRealtimeClient extends OpenAIProtocolWebSocketRealtimeClient {
    private timeLimitReached = false;

    /** @inheritdoc */
    protected override get providerDebugLabel(): string {
        return 'AssemblyAIVoiceRealtimeClient';
    }

    /** @inheritdoc — the server decides when a connection must be replaced, and says so in the minted config. */
    protected override get DefaultCallDurationSeconds(): number | undefined {
        return undefined;
    }

    /** @inheritdoc — a proxy ticket opens one connection, and the call outlives it. */
    protected override get RefreshesCredentialAhead(): boolean {
        return false;
    }

    /** @inheritdoc — the proxy URL is the credential. */
    protected openProviderSocket(config: ClientRealtimeSessionConfig): IOpenAIProtocolClientSocket {
        this.timeLimitReached = false;
        return this.createSocket(config.EphemeralToken);
    }

    /** @inheritdoc — the agent sends it once it can hear and speak. */
    protected override get waitsForSessionCreated(): boolean {
        return true;
    }

    /** @inheritdoc — none: the server applied it (see the class docs). */
    protected override resolveSessionObject(_config: ClientRealtimeSessionConfig): JSONObject {
        return {};
    }

    /** @inheritdoc */
    protected resolveSampleRate(config: ClientRealtimeSessionConfig): number {
        const rate = config.SessionConfig?.['sampleRate'];
        return typeof rate === 'number' && rate > 0 ? rate : ASSEMBLYAI_VOICE_PCM_SAMPLE_RATE;
    }

    /** @inheritdoc — the server always ends a reply with `response.done`, so a tool call need not release it early. */
    protected override get releasesBusyFlagOnToolCall(): boolean {
        return false;
    }

    /** @inheritdoc */
    protected override get unexpectedCloseMessage(): string {
        return 'AssemblyAI voice connection closed unexpectedly';
    }

    /** @inheritdoc — a call that reached its time limit ends; any other lost connection is recovered. */
    protected override handleSocketClose(): void {
        if (this.timeLimitReached && !this.closedByConsumer && this.currentState !== 'error' && this.currentState !== 'closed') {
            this.emitError({ Message: 'Call time limit reached', Code: REALTIME_CLIENT_TIME_LIMIT_ERROR_CODE, Fatal: true });
            this.setState('error');
            return;
        }
        super.handleSocketClose();
    }

    /**
     * @inheritdoc — first finishes the transcript of a reply in progress. The server ends a reply when it has played, not
     * when it was written, so a hang-up during one would lose it from the conversation.
     */
    public override async Disconnect(): Promise<void> {
        const spoken = this.pendingAssistantText;
        this.pendingAssistantText = '';
        if (spoken.trim().length > 0) {
            this.emitTranscript({ Role: 'Assistant', Text: spoken, IsFinal: true, Kind: this.activeResponseKind });
        }
        await super.Disconnect();
    }

    /** Creates the websocket. Production wraps the platform `WebSocket`. */
    protected createSocket(url: string): IOpenAIProtocolClientSocket {
        const WS = (globalThis as unknown as { WebSocket?: new (url: string) => NativeWebSocketLike }).WebSocket;
        if (!WS) {
            throw new Error('AssemblyAIVoiceRealtimeClient requires a global WebSocket (browser or Node 22+).');
        }
        const ws = new WS(url);
        const seam: IOpenAIProtocolClientSocket = {
            onopen: null,
            onmessage: null,
            onerror: null,
            onclose: null,
            send: (data) => ws.send(data),
            close: () => ws.close(),
        };
        ws.onopen = () => seam.onopen?.();
        ws.onmessage = (event) => seam.onmessage?.(String(event.data));
        ws.onerror = () => seam.onerror?.('AssemblyAI voice websocket error');
        ws.onclose = (event) => {
            this.timeLimitReached = event?.code === REALTIME_RELAY_TIME_LIMIT_CLOSE_CODE;
            seam.onclose?.();
        };
        return seam;
    }
}

/**
 * Tree-shaking prevention: bundlers cannot see that {@link AssemblyAIVoiceRealtimeClient} is created dynamically through
 * the ClassFactory, so a consumer calls this no-op to keep its registration alive.
 */
export function LoadAssemblyAIVoiceRealtimeClient(): void {
    // intentional no-op — the static import of this module is the point
}
