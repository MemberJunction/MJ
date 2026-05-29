/**
 * WebSocket transport — backend↔provider connections (e.g. gpt-realtime over WS)
 * AND a low-tier browser fallback when WebRTC isn't viable.
 *
 * Single-participant by design — WS is point-to-point. Multi-participant streaming
 * is the SFU's job (see `WebRTCTransport` / LiveKit).
 *
 * Two on-wire codecs are supported out of the box:
 *   - `binary-pcm-16le` (default): raw 16-bit little-endian PCM frames sent as
 *     binary WS messages. Matches most generic STT/TTS WS endpoints.
 *   - `json-envelope`: every message is a JSON object — `{ type: 'audio', data: base64 }`
 *     or `{ type: 'control', event: ControlEvent }`. Providers with proprietary
 *     envelopes (ElevenLabs Conv AI, etc.) should subclass and override
 *     `ParseInboundMessage` / `SerializeOutboundAudio`.
 *
 * See `plans/audio-agent-architecture.md` section 3.2.
 */
import WebSocket, { type ClientOptions, type RawData } from 'ws';
import type { AudioFrame } from '@memberjunction/ai';
import type { ITransportAdapter, ParticipantStream } from './ITransportAdapter';
import type { ControlEvent, VideoFrame } from '../frames/frame-bus';

/**
 * On-wire codec for the WS transport. See file header for semantics.
 */
export type WebSocketTransportCodec = 'binary-pcm-16le' | 'json-envelope';

export interface WebSocketTransportOptions {
    /** Endpoint — `wss://...` for prod, `ws://...` for local. */
    URL: string;
    /** Optional headers (auth, tenant, etc.). */
    Headers?: Record<string, string>;
    /** Optional WS subprotocols. */
    Protocols?: string[];
    /**
     * Frame codec on the wire. Default `binary-pcm-16le` — raw 16-bit LE PCM as
     * binary WS messages. Use `json-envelope` for providers that wrap frames.
     */
    Codec?: WebSocketTransportCodec;
    /** Sample rate for outbound audio when not embedded in the frame. Default 16000. */
    SampleRateHz?: number;
    /** Channel count for outbound audio when not embedded in the frame. Default 1. */
    ChannelCount?: number;
    /** Display name reported on the synthetic single-participant stream. */
    ParticipantDisplayName?: string;
}

/**
 * Unbounded single-producer / single-consumer async queue used to back the
 * inbound async-iterables. Inline rather than pulling in a dep.
 */
class AsyncQueue<T> implements AsyncIterable<T> {
    private items: T[] = [];
    private waiters: Array<(value: IteratorResult<T>) => void> = [];
    private closed = false;

    public Push(item: T): void {
        if (this.closed) {
            return;
        }
        const waiter = this.waiters.shift();
        if (waiter) {
            waiter({ value: item, done: false });
        } else {
            this.items.push(item);
        }
    }

    public Close(): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        while (this.waiters.length) {
            const w = this.waiters.shift();
            if (w) {
                w({ value: undefined as never, done: true });
            }
        }
    }

    public [Symbol.asyncIterator](): AsyncIterableIterator<T> {
        const self = this;
        return {
            [Symbol.asyncIterator](): AsyncIterableIterator<T> {
                return this;
            },
            next(): Promise<IteratorResult<T>> {
                if (self.items.length > 0) {
                    const value = self.items.shift() as T;
                    return Promise.resolve({ value, done: false });
                }
                if (self.closed) {
                    return Promise.resolve({ value: undefined as never, done: true });
                }
                return new Promise<IteratorResult<T>>((resolve) => self.waiters.push(resolve));
            },
        };
    }
}

/**
 * Shape of a JSON-envelope inbound message. Used only when `Codec === 'json-envelope'`.
 * Loose by design — subclasses are expected to override `ParseInboundMessage` for
 * provider-specific envelopes.
 */
interface JsonEnvelopeMessage {
    type: 'audio' | 'control' | string;
    /** Base64-encoded PCM when `type === 'audio'`. */
    data?: string;
    /** Sample rate override for this frame. */
    sampleRateHz?: number;
    /** Channel count override for this frame. */
    channelCount?: number;
    /** Media type override (e.g. `audio/pcm`, `audio/mulaw`). */
    mediaType?: string;
    /** Control event payload when `type === 'control'`. */
    event?: ControlEvent;
}

export class WebSocketTransport implements ITransportAdapter {
    /** Connection options frozen at construction. */
    public readonly Options: Readonly<WebSocketTransportOptions>;

    private readonly audioIn = new AsyncQueue<AudioFrame>();
    private readonly controlIn = new AsyncQueue<ControlEvent>();
    private socket: WebSocket | null = null;
    private participant: ParticipantStream;
    private joinHandlers: Array<(p: ParticipantStream) => void> = [];
    private leaveHandlers: Array<(p: ParticipantStream) => void> = [];
    private opened = false;
    private closed = false;

    constructor(options: WebSocketTransportOptions) {
        this.Options = Object.freeze({ ...options });
        this.participant = {
            ID: 'remote',
            DisplayName: options.ParticipantDisplayName ?? 'Remote',
            AudioIn: this.audioIn,
        };
    }

    // ── ITransportAdapter — inbound streams ───────────────────────────────────

    public get AudioFramesIn(): AsyncIterable<AudioFrame> {
        return this.audioIn;
    }

    public get ControlEventsIn(): AsyncIterable<ControlEvent> {
        return this.controlIn;
    }

    public get Participants(): ReadonlyArray<ParticipantStream> {
        return this.opened && !this.closed ? [this.participant] : [];
    }

    public OnParticipantJoin(cb: (p: ParticipantStream) => void): void {
        this.joinHandlers.push(cb);
    }

    public OnParticipantLeave(cb: (p: ParticipantStream) => void): void {
        this.leaveHandlers.push(cb);
    }

    // ── ITransportAdapter — outbound ──────────────────────────────────────────

    public SendAudioFrame(frame: AudioFrame): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }
        const codec = this.Options.Codec ?? 'binary-pcm-16le';
        if (codec === 'binary-pcm-16le') {
            this.socket.send(this.SerializeOutboundAudio(frame));
        } else {
            const envelope: JsonEnvelopeMessage = {
                type: 'audio',
                data: Buffer.from(frame.data).toString('base64'),
                sampleRateHz: frame.sampleRateHz,
                channelCount: frame.channelCount,
                mediaType: frame.mediaType,
            };
            this.socket.send(JSON.stringify(envelope));
        }
    }

    public SendControlEvent(event: ControlEvent): void {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }
        const codec = this.Options.Codec ?? 'binary-pcm-16le';
        if (codec === 'json-envelope') {
            const envelope: JsonEnvelopeMessage = { type: 'control', event };
            this.socket.send(JSON.stringify(envelope));
        }
        // For binary-pcm-16le, control events have no on-wire representation —
        // they're a local-only signal (session lifecycle handled by socket close).
    }

    // ── ITransportAdapter — lifecycle ─────────────────────────────────────────

    public async Open(): Promise<void> {
        if (this.opened) {
            return;
        }
        const opts: ClientOptions = {};
        if (this.Options.Headers) {
            opts.headers = this.Options.Headers;
        }
        const protocols = this.Options.Protocols;
        const socket = protocols && protocols.length > 0
            ? new WebSocket(this.Options.URL, protocols, opts)
            : new WebSocket(this.Options.URL, opts);
        this.socket = socket;

        socket.binaryType = 'arraybuffer';

        await new Promise<void>((resolve, reject) => {
            const onOpen = (): void => {
                socket.removeListener('error', onError);
                resolve();
            };
            const onError = (err: Error): void => {
                socket.removeListener('open', onOpen);
                reject(err);
            };
            socket.once('open', onOpen);
            socket.once('error', onError);
        });

        socket.on('message', (data, isBinary) => this.HandleInboundMessage(data, isBinary));
        socket.on('close', (code, reason) => this.HandleSocketClose(code, reason.toString()));
        socket.on('error', (err) => this.HandleSocketError(err));

        this.opened = true;
        this.controlIn.Push({ Kind: 'session-start' });
        this.controlIn.Push({ Kind: 'participant-joined', ParticipantID: this.participant.ID });
        for (const h of this.joinHandlers) {
            h(this.participant);
        }
    }

    public async Close(): Promise<void> {
        if (this.closed) {
            return;
        }
        this.closed = true;
        const sock = this.socket;
        this.socket = null;
        if (sock && sock.readyState === WebSocket.OPEN) {
            try {
                sock.close(1000, 'client-close');
            } catch {
                // ignore — best-effort close
            }
        }
        if (this.opened) {
            for (const h of this.leaveHandlers) {
                h(this.participant);
            }
            this.controlIn.Push({ Kind: 'participant-left', ParticipantID: this.participant.ID });
            this.controlIn.Push({ Kind: 'session-end', Reason: 'client-close' });
        }
        this.audioIn.Close();
        this.controlIn.Close();
    }

    // ── Hooks subclasses can override for provider-specific envelopes ─────────

    /**
     * Parse an inbound WS message. Default implementation handles both codecs.
     * Subclass and override for proprietary envelopes (ElevenLabs Conv AI, etc.).
     */
    protected ParseInboundMessage(data: RawData, isBinary: boolean): void {
        const codec = this.Options.Codec ?? 'binary-pcm-16le';
        if (codec === 'binary-pcm-16le' && isBinary) {
            const buf = this.RawDataToUint8Array(data);
            this.audioIn.Push({
                data: buf,
                sampleRateHz: this.Options.SampleRateHz ?? 16000,
                channelCount: this.Options.ChannelCount ?? 1,
                mediaType: 'audio/pcm',
            });
            return;
        }
        if (codec === 'json-envelope' && !isBinary) {
            const text = this.RawDataToString(data);
            let parsed: JsonEnvelopeMessage | null = null;
            try {
                parsed = JSON.parse(text) as JsonEnvelopeMessage;
            } catch {
                return;
            }
            if (!parsed || typeof parsed.type !== 'string') {
                return;
            }
            if (parsed.type === 'audio' && typeof parsed.data === 'string') {
                const bytes = new Uint8Array(Buffer.from(parsed.data, 'base64'));
                this.audioIn.Push({
                    data: bytes,
                    sampleRateHz: parsed.sampleRateHz ?? this.Options.SampleRateHz ?? 16000,
                    channelCount: parsed.channelCount ?? this.Options.ChannelCount ?? 1,
                    mediaType: parsed.mediaType ?? 'audio/pcm',
                });
                return;
            }
            if (parsed.type === 'control' && parsed.event) {
                this.controlIn.Push(parsed.event);
                return;
            }
        }
        // Mismatched codec/binary flag — drop silently; subclass can override.
    }

    /**
     * Serialize an outbound audio frame to bytes when in binary mode. Default
     * passes `frame.data` through unchanged (assumes already 16le PCM).
     */
    protected SerializeOutboundAudio(frame: AudioFrame): Uint8Array {
        return frame.data;
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    private HandleInboundMessage(data: RawData, isBinary: boolean): void {
        if (this.closed) {
            return;
        }
        this.ParseInboundMessage(data, isBinary);
    }

    private HandleSocketClose(_code: number, reason: string): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        if (this.opened) {
            for (const h of this.leaveHandlers) {
                h(this.participant);
            }
            this.controlIn.Push({ Kind: 'participant-left', ParticipantID: this.participant.ID });
            this.controlIn.Push({ Kind: 'session-end', Reason: reason || 'remote-close' });
        }
        this.audioIn.Close();
        this.controlIn.Close();
    }

    private HandleSocketError(_err: Error): void {
        // Surface as session-end so consumers can react; close queues afterwards
        // via the subsequent `close` event the WS lib emits.
        if (this.opened && !this.closed) {
            this.controlIn.Push({ Kind: 'session-end', Reason: 'socket-error' });
        }
    }

    private RawDataToUint8Array(data: RawData): Uint8Array {
        if (data instanceof ArrayBuffer) {
            return new Uint8Array(data);
        }
        if (Buffer.isBuffer(data)) {
            return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        }
        if (Array.isArray(data)) {
            // Array of Buffer chunks per ws docs — merge manually to avoid the
            // newer `Buffer.concat` overload demanding a strict Uint8Array array.
            let total = 0;
            for (const chunk of data) {
                total += chunk.byteLength;
            }
            const out = new Uint8Array(total);
            let offset = 0;
            for (const chunk of data) {
                out.set(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength), offset);
                offset += chunk.byteLength;
            }
            return out;
        }
        // Fallback — Buffer-like with byteOffset/byteLength.
        const bufLike = data as { buffer: ArrayBufferLike; byteOffset: number; byteLength: number };
        return new Uint8Array(bufLike.buffer, bufLike.byteOffset, bufLike.byteLength);
    }

    private RawDataToString(data: RawData): string {
        if (typeof data === 'string') {
            return data;
        }
        const bytes = this.RawDataToUint8Array(data);
        return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('utf8');
    }

    /**
     * The unused-but-required-by-interface `SendVideoFrame` slot. WS transport
     * doesn't carry video; declaring this here keeps the type readable but the
     * method is intentionally absent (it's optional on `ITransportAdapter`).
     */
    public SendVideoFrame?: (frame: VideoFrame) => void;
}
