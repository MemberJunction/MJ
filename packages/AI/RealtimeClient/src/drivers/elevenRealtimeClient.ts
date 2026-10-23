import { RegisterClass } from '@memberjunction/global';
import { ClientRealtimeSessionConfig } from '@memberjunction/ai';
import { BaseRealtimeClient } from '../generic/baseRealtimeClient';
import {
    OpenAIProtocolWebSocketRealtimeClient,
    IOpenAIProtocolClientSocket,
    OpenAIProtocolClientEvent,
    OpenAIProtocolServerEvent,
} from '../generic/openAIProtocolClient';

// ── Endpoint + auth + audio constants (Eleven Realtime wire format) ────────────

/**
 * The Eleven Realtime websocket endpoint. The model rides as `?model=`, which is what the `openai`
 * SDK's own realtime socket sends — ElevenLabs documents that SDK as working unmodified.
 */
export const ELEVEN_REALTIME_WS_URL = 'wss://api.elevenlabs.io/v1/convai/realtime';

/**
 * The websocket subprotocols the browser authenticates with: the OpenAI Realtime `realtime`
 * protocol, plus the server-minted client secret in the `openai-insecure-api-key.` slot. This is
 * the exact pair the `openai` SDK sends, and ElevenLabs' compatibility guide says to hand that SDK
 * the client secret as its API key. Browsers cannot set a handshake `Authorization` header, so the
 * subprotocol is the only channel; no ElevenLabs API key ever reaches the browser.
 */
export const ELEVEN_REALTIME_SUBPROTOCOL = 'realtime';

/** Prefix of the subprotocol that carries the ephemeral client secret (see {@link ELEVEN_REALTIME_SUBPROTOCOL}). */
export const ELEVEN_REALTIME_CLIENT_SECRET_SUBPROTOCOL_PREFIX = 'openai-insecure-api-key.';

/**
 * PCM16 mono at 24 kHz in both directions — the OpenAI Realtime default, which the server session
 * leaves in place by sending no `audio.*.format`.
 */
export const ELEVEN_REALTIME_PCM_SAMPLE_RATE = 24000;

/**
 * Structural subset of the platform `WebSocket` used by the production
 * {@link ElevenRealtimeClient.createSocket} seam (typed structurally so the package compiles
 * independent of DOM lib configuration).
 */
interface NativeWebSocketLike {
    onopen: (() => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onerror: (() => void) | null;
    onclose: (() => void) | null;
    send(data: string): void;
    close(): void;
}

// ── The driver ─────────────────────────────────────────────────────────────────

/**
 * Eleven Realtime implementation of {@link BaseRealtimeClient}: a **browser-direct** websocket to
 * ElevenLabs' OpenAI-Realtime-compatible speech-to-speech models (`eleven_realtime_v1_mini`,
 * `eleven_realtime_v1_max`), authenticated with the server-minted client secret.
 *
 * Registered with the ClassFactory under `'eleven-realtime'` — the `Provider` the server's
 * `ElevenRealtime` driver stamps on its `ClientRealtimeSessionConfig`. It is unrelated to the
 * `'elevenlabs'` client, which speaks the ElevenLabs Agents Platform protocol.
 *
 * The API is WebSocket-only (no WebRTC), and speaks the OpenAI Realtime protocol with a
 * client-owned PCM audio plane, so everything but the endpoint and auth lives in the shared
 * `OpenAIProtocolRealtimeClient` brain and {@link OpenAIProtocolWebSocketRealtimeClient} transport.
 *
 * Connect handshake: open the socket → wait for `session.created` (the OpenAI GA readiness frame;
 * the server driver waits for it too) → apply the server-authored `config.SessionConfig` via
 * `session.update` → build the 24 kHz audio plane → report `'listening'`.
 */
@RegisterClass(BaseRealtimeClient, 'eleven-realtime')
export class ElevenRealtimeClient extends OpenAIProtocolWebSocketRealtimeClient {
    /** @inheritdoc — used in the shared diagnostics + close messages. */
    protected override get providerDebugLabel(): string {
        return 'ElevenRealtimeClient';
    }

    // ── Transport hooks ────────────────────────────────────────────────────────

    /** @inheritdoc — model on the URL, client secret in the OpenAI-SDK subprotocol slot. */
    protected openProviderSocket(config: ClientRealtimeSessionConfig): IOpenAIProtocolClientSocket {
        const url = `${ELEVEN_REALTIME_WS_URL}?model=${encodeURIComponent(config.Model)}`;
        const protocols = [ELEVEN_REALTIME_SUBPROTOCOL, `${ELEVEN_REALTIME_CLIENT_SECRET_SUBPROTOCOL_PREFIX}${config.EphemeralToken}`];
        return this.createSocket(url, protocols);
    }

    /** @inheritdoc */
    protected resolveSampleRate(_config: ClientRealtimeSessionConfig): number {
        return ELEVEN_REALTIME_PCM_SAMPLE_RATE;
    }

    /** @inheritdoc — matches the server driver, which defers its config until `session.created`. */
    protected override get waitsForSessionCreated(): boolean {
        return true;
    }

    /**
     * Creation seam for the realtime websocket. Production wraps the platform-global `WebSocket`;
     * unit tests override this to return an in-memory fake. Handlers are attached by the shared
     * Connect after this returns, so the implementation must not require them at construction.
     */
    protected createSocket(url: string, protocols: string[]): IOpenAIProtocolClientSocket {
        const WS = (globalThis as unknown as { WebSocket?: new (url: string, protocols?: string | string[]) => NativeWebSocketLike }).WebSocket;
        if (!WS) {
            throw new Error('ElevenRealtimeClient requires a global WebSocket (browser or Node 22+).');
        }
        const ws = new WS(url, protocols);
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
        ws.onerror = () => seam.onerror?.('Eleven Realtime websocket error');
        ws.onclose = () => seam.onclose?.();
        return seam;
    }

    // ── Provider-branded messages ──────────────────────────────────────────────

    /** @inheritdoc */
    protected override formatTransportError(message: string): string {
        return `Eleven Realtime transport error: ${message}`;
    }

    /** @inheritdoc — matches the server profile's message. */
    protected override get unexpectedCloseMessage(): string {
        return 'Eleven Realtime connection closed unexpectedly';
    }

    // ── Wire diagnostics (a new provider is otherwise undebuggable in the field) ──

    /** @inheritdoc — log every inbound event type; error frames include their payload. */
    protected override logInboundEvent(event: OpenAIProtocolServerEvent): void {
        console.debug('[ElevenRealtimeClient] ◀ inbound:', event.type,
            event.type === 'error' ? JSON.stringify(event).slice(0, 400) : '');
    }

    /** @inheritdoc */
    protected override onNonJsonFrame(raw: string): void {
        console.debug('[ElevenRealtimeClient] ◀ inbound NON-JSON frame:', String(raw).slice(0, 200));
    }

    /** @inheritdoc — log outbound control frames (skip the high-frequency mic audio). */
    protected override logOutboundEvent(event: OpenAIProtocolClientEvent): void {
        if (event.type !== 'input_audio_buffer.append') {
            console.debug('[ElevenRealtimeClient] ▶ outbound:', event.type);
        }
    }
}

/**
 * Tree-shaking prevention: bundlers cannot see that {@link ElevenRealtimeClient} is instantiated
 * dynamically through the ClassFactory, so a consumer must call this no-op to create a static
 * code path that keeps the `@RegisterClass` side effect alive.
 */
export function LoadElevenRealtimeClient(): void {
    // intentional no-op — the static import of this module is the point
}
