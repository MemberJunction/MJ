import { RegisterClass } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import { RealtimeAudioMeter } from '../audio/audioMeter';
import { BaseRealtimeClient } from '../generic/baseRealtimeClient';
import {
    OpenAIProtocolRealtimeClient,
    OpenAIProtocolClientEvent,
} from '../generic/openAIProtocolClient';

// ── Structural transport seams (typed subsets of the DOM WebRTC objects) ──────
// Real `RTCDataChannel` / `RTCPeerConnection` / `HTMLAudioElement` instances satisfy
// these structurally; unit tests implement them with fakes so NO network and NO
// WebRTC stack is required (mirrors the IOpenAIRealtimeConnection seam used by the
// server-side OpenAIRealtime driver tests).

/** The subset of `RTCDataChannel` this client uses. */
export interface IRealtimeDataChannel {
    /** The channel's connection state (`'open'` once usable). */
    readonly readyState: RTCDataChannelState;
    onopen: ((event: Event) => void) | null;
    onmessage: ((event: MessageEvent) => void) | null;
    onerror: ((event: Event) => void) | null;
    onclose: ((event: Event) => void) | null;
    send(data: string): void;
    close(): void;
}

/** The subset of `RTCPeerConnection` this client uses. */
export interface IRealtimePeerConnection {
    ontrack: ((event: RTCTrackEvent) => void) | null;
    addTrack(track: MediaStreamTrack, stream: MediaStream): void;
    createDataChannel(label: string): IRealtimeDataChannel;
    createOffer(): Promise<RTCSessionDescriptionInit>;
    setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
    setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
    close(): void;
}

/** The subset of the hidden `<audio>` sink element this client uses. */
export interface IRealtimeAudioSink {
    srcObject: MediaProvider | null;
    remove(): void;
}

/**
 * OpenAI implementation of {@link BaseRealtimeClient}: a **browser-direct** WebRTC
 * connection to OpenAI's Realtime API, authenticated with the server-minted ephemeral
 * client secret.
 *
 * Registered with the ClassFactory under the key `'openai'` — the `Provider` string the
 * server's `OpenAIRealtime` driver stamps on its `ClientRealtimeSessionConfig` — so hosts
 * resolve it without referencing this class directly.
 *
 * The OpenAI-protocol brain (event translation, response state machine, narration-kind
 * tagging, tool-result queueing, the outbound actions) lives in the shared
 * {@link OpenAIProtocolRealtimeClient}; this class owns only the WebRTC transport:
 * - Connect: mic tracks → peer connection, remote audio → hidden `<audio>` sink, the
 *   `'oai-events'` data channel, and the GA SDP handshake (see {@link performSdpHandshake}).
 * - Audible-playback tracking ({@link IsAudioPlaying}) from the provider-managed
 *   `output_audio_buffer.*` events (this transport does NOT own playback — the peer
 *   connection plays the remote track).
 * - The remote-stream APIs a host uses to mix the agent's voice into a recording.
 */
@RegisterClass(BaseRealtimeClient, 'openai')
export class OpenAIRealtimeClient extends OpenAIProtocolRealtimeClient {
    // ── Transport ──────────────────────────────────────────────────────────────
    private peerConnection: IRealtimePeerConnection | null = null;
    /** Protected so test subclasses can inspect/inject; production code treats it as private. */
    protected dataChannel: IRealtimeDataChannel | null = null;
    private remoteAudioEl: IRealtimeAudioSink | null = null;
    /**
     * The AGENT's remote-audio stream, captured from the peer connection's `ontrack` event
     * (see {@link attachRemoteAudio}). Exposed via {@link GetRemoteMediaStream} so a host can
     * mix the agent's voice into a browser-side recording. `null` until the remote track lands.
     */
    private remoteStream: MediaStream | null = null;
    /** Host handlers notified when the agent's remote-audio stream lands (or immediately, if already present). */
    private remoteStreamHandlers: Array<(stream: MediaStream) => void> = [];
    /**
     * The server-built session config applied verbatim via `session.update` when the data
     * channel opens. Protected so test subclasses can seed it without a full Connect.
     */
    protected sessionConfig: JSONObject | null = null;
    /**
     * True while the model's audio is audibly PLAYING in the browser (WebRTC
     * `output_audio_buffer` started/stopped). Distinct from `responseActive` —
     * generation finishes ahead of playback.
     */
    private audioPlaying = false;

    // ── BaseRealtimeClient: connection lifecycle ───────────────────────────────

    /**
     * Opens the client-direct OpenAI Realtime WebRTC connection: mic tracks onto a peer
     * connection, a hidden remote-audio sink, the `'oai-events'` data channel, and the SDP
     * handshake. `config.SessionConfig` is applied verbatim via `session.update` once the
     * data channel opens; the client reports `'listening'` at that point.
     */
    public async Connect(config: ClientRealtimeSessionConfig, micStream: MediaStream): Promise<void> {
        this.sessionConfig = config.SessionConfig;
        this.micStream = micStream;
        this.setState('connecting');

        const pc = this.createPeerConnection();
        this.peerConnection = pc;
        this.attachMicrophone(pc, micStream);
        this.attachRemoteAudio(pc);
        this.adoptDataChannel(pc.createDataChannel('oai-events'));
        // Audio-activity capability (base obligation #9): user side meters the mic stream
        // now; the agent side attaches when the remote track arrives (attachRemoteAudio's
        // ontrack). Null-safe — no-WebAudio environments leave the session un-metered.
        this.attachInputAudioMeter(RealtimeAudioMeter.ForMicStream(micStream));

        await this.performSdpHandshake(pc, config.EphemeralToken);
        this.setState('connected');
    }

    /**
     * Tears down the channel, peer connection, mic tracks, and audio sink, resets the
     * response state machine, and emits a final `'closed'` (unless already `'error'`).
     */
    public async Disconnect(): Promise<void> {
        this.closeAudioMeters();
        this.micStream?.getTracks().forEach((t) => t.stop());
        this.micStream = null;

        if (this.dataChannel) {
            try { this.dataChannel.close(); } catch { /* already closing */ }
            this.dataChannel = null;
        }
        if (this.peerConnection) {
            try { this.peerConnection.close(); } catch { /* already closing */ }
            this.peerConnection = null;
        }
        if (this.remoteAudioEl) {
            this.remoteAudioEl.srcObject = null;
            this.remoteAudioEl.remove();
            this.remoteAudioEl = null;
        }
        this.remoteStream = null;
        // Session-scoped host handlers must not survive into a later Connect on a reused instance.
        this.remoteStreamHandlers = [];

        this.sessionConfig = null;
        this.resetResponseState();
        this.audioPlaying = false;
        if (this.currentState !== 'error') {
            this.setState('closed');
        }
    }

    // ── Brain seam implementations (WebRTC transport) ──────────────────────────

    /** @inheritdoc — events flow over the `'oai-events'` data channel once it is open. */
    protected canSendEvents(): boolean {
        return this.dataChannel !== null && this.dataChannel.readyState === 'open';
    }

    /** @inheritdoc */
    protected sendProtocolEvent(event: OpenAIProtocolClientEvent): void {
        this.dataChannel?.send(JSON.stringify(event));
    }

    /**
     * @inheritdoc
     *
     * This transport does NOT own playback (the peer connection plays the remote track), so a
     * cancel asks the provider to stop + clear its managed output buffer via the WebRTC-only
     * `output_audio_buffer.clear` client event — sent only when audio is audibly playing.
     */
    protected stopAudioOutput(): void {
        if (this.audioPlaying) {
            this.sendEvent({ type: 'output_audio_buffer.clear' });
            this.audioPlaying = false;
        }
    }

    /** @inheritdoc — provider-managed playback started. */
    protected override onOutputAudioBufferStarted(): void {
        this.audioPlaying = true;
    }

    /** @inheritdoc — provider-managed playback stopped/cleared. */
    protected override onOutputAudioBufferStopped(): void {
        this.audioPlaying = false;
        if (this.currentState === 'speaking' && !this.responseActive) {
            this.setState('listening');
        }
    }

    /** @inheritdoc */
    public get IsAudioPlaying(): boolean {
        return this.audioPlaying;
    }

    // ── Overridable creation seams (tests inject fakes — no network / WebRTC) ──

    /** Creates the peer connection. Production returns a real `RTCPeerConnection`. */
    protected createPeerConnection(): IRealtimePeerConnection {
        return new RTCPeerConnection();
    }

    /** Creates a hidden `<audio>` element to play the model's audio output. */
    protected createAudioSink(): IRealtimeAudioSink {
        const el = document.createElement('audio');
        el.autoplay = true;
        el.style.display = 'none';
        document.body.appendChild(el);
        return el;
    }

    /**
     * POSTs the raw SDP offer to OpenAI's Realtime WebRTC endpoint and returns the answer SDP.
     *
     * GA browser flow (confirmed against the OpenAI Realtime WebRTC guide): POST to
     * `https://api.openai.com/v1/realtime/calls` with **no** query params and **no**
     * `OpenAI-Beta` header. The ephemeral client secret already encodes the model + session
     * config (set server-side at mint), so the browser must not specify the model — passing
     * `?model=` returns an empty 400. The answer comes back as raw `application/sdp`.
     *
     * @param offerSdp The local SDP offer.
     * @param ephemeralToken The server-minted ephemeral client secret.
     * @returns The answer SDP.
     */
    protected async postSdpOffer(offerSdp: string, ephemeralToken: string): Promise<string> {
        const response = await fetch('https://api.openai.com/v1/realtime/calls', {
            method: 'POST',
            body: offerSdp,
            headers: {
                Authorization: `Bearer ${ephemeralToken}`,
                'Content-Type': 'application/sdp',
            },
        });

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`OpenAI WebRTC handshake failed (${response.status}): ${detail}`);
        }
        return response.text();
    }

    // ── Connection internals ───────────────────────────────────────────────────

    /** Streams the mic tracks to the provider. */
    private attachMicrophone(pc: IRealtimePeerConnection, micStream: MediaStream): void {
        for (const track of micStream.getAudioTracks()) {
            pc.addTrack(track, micStream);
        }
    }

    /** Routes the provider's audio track into the hidden `<audio>` sink. */
    private attachRemoteAudio(pc: IRealtimePeerConnection): void {
        this.remoteAudioEl = this.createAudioSink();
        pc.ontrack = (e: RTCTrackEvent) => {
            if (this.remoteAudioEl && e.streams[0]) {
                this.remoteAudioEl.srcObject = e.streams[0];
                // Capture the agent's remote stream so a host can mix it into a recording
                // (see GetRemoteMediaStream). Playback still flows through the <audio> element.
                this.remoteStream = e.streams[0];
                // Notify hosts (e.g. a browser recorder) that the agent's stream is now available
                // so they can mix it in — the track typically lands AFTER recording already began.
                this.notifyRemoteStream(e.streams[0]);
                // Agent-side audio meter taps the remote stream (obligation #9). The
                // analyser sinks nowhere — playback still flows through the <audio> element.
                this.attachOutputAudioMeter(RealtimeAudioMeter.ForStream(e.streams[0]));
            }
        };
    }

    /**
     * Returns the AGENT's remote-audio stream once the WebRTC `ontrack` event has delivered it,
     * or `null` before the track lands. Lets a host mix the agent's voice into a browser-side
     * recording alongside the mic.
     */
    public GetRemoteMediaStream(): MediaStream | null {
        return this.remoteStream;
    }

    /**
     * Registers a handler invoked when the agent's remote-audio stream becomes available — either
     * later via the WebRTC `ontrack`, or IMMEDIATELY if the track has already landed. Lets a host
     * attach the agent voice to a recording that started (mic-only) before the track arrived.
     */
    public OnRemoteMediaStream(handler: (stream: MediaStream) => void): void {
        this.remoteStreamHandlers.push(handler);
        if (this.remoteStream) {
            this.invokeRemoteStreamHandler(handler, this.remoteStream);
        }
    }

    /** Fans a freshly-landed remote stream out to all registered host handlers. */
    private notifyRemoteStream(stream: MediaStream): void {
        for (const handler of this.remoteStreamHandlers) {
            this.invokeRemoteStreamHandler(handler, stream);
        }
    }

    /** Invokes one remote-stream handler, isolating host errors so they never disturb the call. */
    private invokeRemoteStreamHandler(handler: (stream: MediaStream) => void, stream: MediaStream): void {
        try {
            handler(stream);
        } catch (error) {
            console.warn('[OpenAIRealtimeClient] remote-stream handler threw:', error);
        }
    }

    /**
     * Adopts + wires the events data channel: applies the session config and reports
     * `'listening'` on open; translates inbound frames through the shared protocol brain;
     * reports transport errors / closure. Protected so test subclasses can inject a fake
     * channel directly.
     */
    protected adoptDataChannel(channel: IRealtimeDataChannel): void {
        this.dataChannel = channel;
        channel.onopen = () => {
            this.applySessionConfig(channel);
            this.setState('listening');
        };
        channel.onmessage = (e: MessageEvent) => {
            this.handleProtocolMessage(String(e.data));
        };
        channel.onerror = (e: Event) => {
            this.emitError({ Message: `Data channel error: ${String(e)}`, Fatal: true });
            this.setState('error');
        };
        channel.onclose = () => {
            if (this.currentState !== 'error') {
                this.setState('closed');
            }
        };
    }

    /** Performs the offer/answer SDP exchange (POST seam: {@link postSdpOffer}). */
    private async performSdpHandshake(pc: IRealtimePeerConnection, ephemeralToken: string): Promise<void> {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const answerSdp = await this.postSdpOffer(offer.sdp ?? '', ephemeralToken);
        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    }

    /**
     * Sends the server-controlled session config (instructions + tools) as a
     * `session.update` so the co-agent's identity and tool set apply. Skipped when the
     * host supplied no config (e.g. it failed to parse the server payload — the host
     * already logged that; sending an EMPTY `session.update` would be wrong).
     */
    private applySessionConfig(channel: IRealtimeDataChannel): void {
        if (!this.sessionConfig || Object.keys(this.sessionConfig).length === 0) {
            return;
        }
        if (channel.readyState === 'open') {
            channel.send(JSON.stringify({ type: 'session.update', session: this.sessionConfig }));
        }
    }
}

/**
 * Tree-shaking prevention: bundlers cannot see that {@link OpenAIRealtimeClient} is
 * instantiated dynamically through the ClassFactory, so a consumer must call this no-op
 * to create a static code path that keeps the `@RegisterClass` side effect alive.
 */
export function LoadOpenAIRealtimeClient(): void {
    // intentional no-op — the static import of this module is the point
}
