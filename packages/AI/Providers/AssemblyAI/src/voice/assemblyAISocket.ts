import WebSocket from 'ws';
import type { JSONObject } from '@memberjunction/ai';

/** The provider socket as the streaming clients use it. Tests play the provider through a fake. */
export interface AssemblyAISocket {
    OnMessage: ((text: string) => void) | null;
    /** The socket closed, or never opened. */
    OnClose: ((code: number, reason: string) => void) | null;
    Send(data: string | Uint8Array): void;
    /** Closes the socket, abandoning a handshake still in progress. */
    Close(): void;
}

/** Starts opening a provider socket authenticated with the API key. */
export type AssemblyAISocketOpener = (url: string, apiKey: string) => AssemblyAISocket;

/** How long the provider has to open a session, in ms. The browser's own connect deadline is 15 s. */
const OPEN_TIMEOUT_MS = 10_000;

/** How long a terminated session has to confirm before its socket is closed anyway, in ms. */
const TERMINATE_TIMEOUT_MS = 2_000;

/** Bytes a socket may have queued after a send: as much as MJAPI's realtime relay holds for a provider. */
const MAX_BUFFERED_BYTES = 16 * 1024 * 1024;

/**
 * Opens the real socket. The key travels in a header, never in the URL, so it reaches no access log.
 *
 * A provider that stops reading is dropped once more than `maxBufferedBytes` are queued for it, which its owner sees as
 * any other lost connection. Dropped rather than closed: a close frame waits behind the queue, and keeps it in memory.
 */
export const OpenAssemblyAISocket = (url: string, apiKey: string, maxBufferedBytes: number = MAX_BUFFERED_BYTES): AssemblyAISocket => {
    const ws = new WebSocket(url, { headers: { Authorization: apiKey } });
    let failure = '';
    const socket: AssemblyAISocket = {
        OnMessage: null,
        OnClose: null,
        Send: (data) => {
            ws.send(data);
            if (ws.bufferedAmount > maxBufferedBytes) {
                failure = `the provider stopped reading, with ${ws.bufferedAmount} bytes queued (limit ${maxBufferedBytes})`;
                ws.terminate();
            }
        },
        Close: () => ws.close(),
    };
    ws.on('message', (data, isBinary) => {
        if (!isBinary) {
            socket.OnMessage?.(data.toString());
        }
    });
    // ws always follows 'error' with 'close', so the failure is kept and reported there once.
    ws.on('error', (err) => (failure = err.message));
    ws.on('close', (code, reason) => socket.OnClose?.(code, reason.toString() || failure));
    return socket;
};

/** What a session tells the client that owns it. */
export interface AssemblyAISessionEvents {
    OnFrame(frame: JSONObject): void;
    /** The open session ended without {@link AssemblyAISession.Close}. Called at most once. */
    OnLost(message: string): void;
}

/**
 * The part STT and TTS sessions share: wait for `Begin`, deliver frames, notice a loss, and end with `Terminate`.
 * AssemblyAI bills a session for as long as it is open, so every path out of here closes the socket.
 */
export class AssemblyAISession {
    private open = false;
    private closing: Promise<void> | null = null;
    private finishClosing: (() => void) | null = null;
    private providerError = '';
    private settleOpening: ((error: Error | null, frame?: JSONObject) => void) | null = null;

    private constructor(
        private readonly label: string,
        private readonly socket: AssemblyAISocket,
        private readonly events: AssemblyAISessionEvents
    ) {
        socket.OnMessage = (text) => this.onMessage(text);
        socket.OnClose = (code, reason) => this.onClose(code, reason);
    }

    /**
     * Resolves with the open session and its `Begin` frame. Rejects, with the socket closed, when the provider refuses,
     * does not answer in time, or `signal` aborts.
     */
    public static async Open(
        label: string,
        socket: AssemblyAISocket,
        events: AssemblyAISessionEvents,
        signal?: AbortSignal
    ): Promise<{ Session: AssemblyAISession; Begin: JSONObject }> {
        const session = new AssemblyAISession(label, socket, events);
        const Begin = await session.waitForBegin(signal);
        return { Session: session, Begin };
    }

    public get IsOpen(): boolean {
        return this.open && this.closing === null;
    }

    /** Sends one control frame; dropped once the session is no longer open. */
    public Send(frame: JSONObject): void {
        if (this.IsOpen) {
            this.socket.Send(JSON.stringify(frame));
        }
    }

    /** Sends raw audio bytes; dropped once the session is no longer open. */
    public SendBinary(bytes: Uint8Array): void {
        if (this.IsOpen) {
            this.socket.Send(bytes);
        }
    }

    /** Ends the session and closes its socket. Safe to call more than once. */
    public Close(): Promise<void> {
        if (this.closing) {
            return this.closing;
        }
        if (!this.open) {
            return Promise.resolve();
        }
        this.socket.Send(JSON.stringify({ type: 'Terminate' }));
        this.closing = new Promise<void>((resolve) => {
            const timer = setTimeout(() => this.finishClosing?.(), TERMINATE_TIMEOUT_MS);
            this.finishClosing = () => {
                clearTimeout(timer);
                this.finishClosing = null;
                this.open = false;
                this.socket.Close();
                resolve();
            };
        });
        return this.closing;
    }

    private waitForBegin(signal?: AbortSignal): Promise<JSONObject> {
        return new Promise<JSONObject>((resolve, reject) => {
            const onAbort = (): void => this.settleOpening?.(new Error(`${this.label}: opening aborted`));
            const timer = setTimeout(() => this.settleOpening?.(new Error(`${this.label}: the session did not open within ${OPEN_TIMEOUT_MS} ms`)), OPEN_TIMEOUT_MS);
            this.settleOpening = (error, frame) => {
                this.settleOpening = null;
                clearTimeout(timer);
                signal?.removeEventListener('abort', onAbort);
                if (error) {
                    this.socket.Close();
                    reject(error);
                    return;
                }
                this.open = true;
                resolve(frame ?? {});
            };
            signal?.addEventListener('abort', onAbort, { once: true });
            if (signal?.aborted) {
                onAbort();
            }
        });
    }

    private onMessage(text: string): void {
        const frame = parseFrame(text);
        if (!frame) {
            return;
        }
        switch (frame['type']) {
            case 'Begin':
                this.settleOpening?.(null, frame);
                return;
            case 'Error':
                this.providerError = `${String(frame['error'] ?? 'unknown error')} (${String(frame['error_code'] ?? 'no code')})`;
                if (this.settleOpening) {
                    this.settleOpening(new Error(`${this.label}: ${this.providerError}`));
                } else {
                    console.warn(`${this.label}: the provider reported ${this.providerError}`);
                }
                return;
            case 'Termination':
                this.finishClosing?.();
                return;
            default:
                // The session goes on, so the error before this frame is not why it ends later.
                this.providerError = '';
                if (this.IsOpen) {
                    this.events.OnFrame(frame);
                }
        }
    }

    private onClose(code: number, reason: string): void {
        const why = this.providerError || reason || 'no reason given';
        if (this.settleOpening) {
            this.settleOpening(new Error(`${this.label}: the socket closed before the session opened, ${code}: ${why}`));
            return;
        }
        if (this.closing) {
            this.finishClosing?.();
            return;
        }
        if (this.open) {
            this.open = false;
            this.events.OnLost(`${this.label}: the connection closed, ${code}: ${why}`);
        }
    }
}

function parseFrame(text: string): JSONObject | null {
    try {
        const value: unknown = JSON.parse(text);
        return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JSONObject) : null;
    } catch {
        return null; // the protocol is JSON objects only; anything else carries nothing to act on
    }
}
