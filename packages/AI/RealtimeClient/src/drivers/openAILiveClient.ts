import { RegisterClass } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import { RealtimeAudioMeter } from '../audio/audioMeter';
import {
    BaseRealtimeClient,
    RealtimeClientError,
    RealtimeClientState,
    RealtimeClientToolCall,
    RealtimeClientTranscript,
    RealtimeClientUsage,
} from '../generic/baseRealtimeClient';
import {
    IRealtimeAudioSink,
    IRealtimeDataChannel,
    IRealtimePeerConnection,
} from './openAIRealtimeClient';

/**
 * Extended peer connection interface for OpenAILiveClient to support non-trickle ICE gathering.
 */
export interface IRealtimeLivePeerConnection extends IRealtimePeerConnection {
    iceGatheringState?: RTCIceGatheringState;
    addEventListener?(type: string, listener: (event: Event) => void): void;
    removeEventListener?(type: string, listener: (event: Event) => void): void;
}

/**
 * Browser WebRTC client driver for the OpenAI Live Realtime API (`gpt-live-1`).
 *
 * Implements the browser-direct WebRTC topology specified in Section 5 of the OpenAI Live plan:
 * 1. Exchanges SDP offer for answer with an application server SDP broker (`POST /v1/live/sessions`),
 *    keeping the project API key and session configuration on the trusted server.
 * 2. Creates the `'oai-events'` data channel **before** `createOffer()`.
 * 3. Waits for non-trickle ICE (`iceGatheringState === 'complete'`).
 * 4. The HTTP SDP exchange starts the session — never sends `session.start` on the data channel.
 * 5. Media rides WebRTC tracks: `session.input_audio.append` and `session.output_audio.delta` are forbidden on the data channel.
 * 6. Omits `audio.format` entirely (SDP negotiates codecs).
 * 7. Accounts for OpenAI Live's 15-second WebRTC session pre-bill.
 *
 * Registered under `'openai-live'` and `'OpenAILiveRealtime'`.
 */
@RegisterClass(BaseRealtimeClient, 'openai-live')
@RegisterClass(BaseRealtimeClient, 'OpenAILiveRealtime')
export class OpenAILiveClient extends BaseRealtimeClient {
    public static readonly PREBILL_DURATION_SECONDS = 15;

    // ── Transport ──────────────────────────────────────────────────────────────
    private peerConnection: IRealtimeLivePeerConnection | null = null;
    protected dataChannel: IRealtimeDataChannel | null = null;
    private remoteAudioEl: IRealtimeAudioSink | null = null;
    private remoteStream: MediaStream | null = null;
    private remoteStreamHandlers: Array<(stream: MediaStream) => void> = [];
    private micStream: MediaStream | null = null;
    protected sessionConfig: JSONObject | null = null;

    // ── State Machine ──────────────────────────────────────────────────────────
    private currentState: RealtimeClientState = 'closed';
    private responseActive = false;
    private audioPlaying = false;
    private pendingNarration = false;
    private totalDurationSeconds = OpenAILiveClient.PREBILL_DURATION_SECONDS;

    // ── BaseRealtimeClient implementation ──────────────────────────────────────

    public get IsBusy(): boolean {
        return this.responseActive;
    }

    public get IsAudioPlaying(): boolean {
        return this.audioPlaying;
    }

    public get PrebillSeconds(): number {
        return OpenAILiveClient.PREBILL_DURATION_SECONDS;
    }

    /**
     * Connects to the OpenAI Live WebRTC endpoint via the application server SDP broker.
     */
    public async Connect(
        config: ClientRealtimeSessionConfig,
        micStream: MediaStream,
        _cameraStream?: MediaStream
    ): Promise<void> {
        this.sessionConfig = config.SessionConfig;
        this.micStream = micStream;
        this.setState('connecting');

        const pc = this.createPeerConnection();
        this.peerConnection = pc;
        this.attachMicrophone(pc, micStream);
        this.attachRemoteAudio(pc);

        // Capability obligation #9: input mic audio meter
        this.attachInputAudioMeter(RealtimeAudioMeter.ForMicStream(micStream));

        // Mechanics rule 2: create data channel BEFORE createOffer()
        const channel = pc.createDataChannel('oai-events');
        this.adoptDataChannel(channel);

        // Create local offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Mechanics rule 3: Non-trickle ICE (wait for iceGatheringState === 'complete')
        await this.waitForIceGatheringComplete(pc);

        // Mechanics rule 1: Exchange offer SDP for answer SDP via trusted server broker
        const answerSdp = await this.postSdpOffer(offer.sdp ?? '', config);
        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

        this.setState('connected');

        // Mechanics rule 7: account for 15s session pre-bill
        this.totalDurationSeconds = OpenAILiveClient.PREBILL_DURATION_SECONDS;
        this.emitUsage({
            DurationSeconds: OpenAILiveClient.PREBILL_DURATION_SECONDS,
            InputTokens: 0,
            OutputTokens: 0,
        });
    }

    /**
     * Tears down the connection, data channel, audio tracks, and audio sink.
     */
    public async Disconnect(): Promise<void> {
        this.closeAudioMeters();
        this.micStream?.getTracks().forEach((t) => t.stop());
        this.micStream = null;

        if (this.dataChannel) {
            try {
                this.dataChannel.close();
            } catch {
                /* already closed */
            }
            this.dataChannel = null;
        }

        if (this.peerConnection) {
            try {
                this.peerConnection.close();
            } catch {
                /* already closed */
            }
            this.peerConnection = null;
        }

        if (this.remoteAudioEl) {
            this.remoteAudioEl.srcObject = null;
            this.remoteAudioEl.remove();
            this.remoteAudioEl = null;
        }

        this.remoteStream = null;
        this.remoteStreamHandlers = [];
        this.sessionConfig = null;
        this.responseActive = false;
        this.audioPlaying = false;
        this.pendingNarration = false;

        if (this.currentState !== 'error') {
            this.setState('closed');
        }
    }

    /**
     * Injects user text into the live session and requests a model response.
     * SendText implies barge-in and must NOT synthesize a user transcript (obligation #4).
     */
    public SendText(text: string): void {
        this.CancelActiveResponse();
        this.sendDataChannelFrame({
            type: 'conversation.item.create',
            item: {
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text }],
            },
        });
        this.sendDataChannelFrame({
            type: 'response.create',
        });
    }

    /**
     * Cancels an active model response and flushes local playback.
     */
    public CancelActiveResponse(): void {
        if (this.responseActive || this.audioPlaying) {
            this.sendDataChannelFrame({ type: 'response.cancel' });
            this.responseActive = false;
            this.audioPlaying = false;
            this.pendingNarration = false;
            if (this.currentState === 'speaking') {
                this.setState('listening');
            }
        }
    }

    /**
     * Injects background context without triggering model speech.
     * Uses `session.thinking.append` instead of `instructions.append` so active speech is not interrupted.
     */
    public SendContextNote(text: string): void {
        this.sendDataChannelFrame({
            type: 'session.thinking.append',
            text,
            delegation_id: null,
        });
    }

    /**
     * Requests a brief interim narration utterance during delegated background work.
     */
    public RequestSpokenUpdate(instructions: string): void {
        if (this.responseActive || this.audioPlaying) {
            // Collision rule: narration is disposable; skip when response is in flight
            return;
        }
        this.pendingNarration = true;
        this.sendDataChannelFrame({
            type: 'session.commentary.append',
            text: instructions,
            delegation_id: null,
        });
        this.sendDataChannelFrame({
            type: 'response.create',
        });
    }

    /**
     * Delivers a completed tool execution result back to the model.
     * OpenAI Live remote reasoning plane requires response.item.create followed by response.create.
     */
    public SendToolResult(callID: string, outputJson: string): void {
        this.sendDataChannelFrame({
            type: 'response.item.create',
            item: {
                type: 'function_call_output',
                call_id: callID,
                output: outputJson,
            },
        });
        this.sendDataChannelFrame({
            type: 'response.create',
        });
    }

    /**
     * Mutes or unmutes the microphone capture tracks.
     */
    public SetMuted(muted: boolean): void {
        for (const track of this.micStream?.getAudioTracks() ?? []) {
            track.enabled = !muted;
        }
    }

    /**
     * Returns the agent's remote audio MediaStream if available.
     */
    public override GetRemoteMediaStream(): MediaStream | null {
        return this.remoteStream;
    }

    /**
     * Registers a callback for when the agent's remote audio MediaStream lands.
     */
    public override OnRemoteMediaStream(handler: (stream: MediaStream) => void): void {
        this.remoteStreamHandlers.push(handler);
        if (this.remoteStream) {
            try {
                handler(this.remoteStream);
            } catch (error) {
                console.warn('[OpenAILiveClient] remote-stream handler threw:', error);
            }
        }
    }

    // ── Overridable Factory / Network Seams (Tests inject fakes) ───────────────

    /** Creates the peer connection. Production returns a real `RTCPeerConnection`. */
    protected createPeerConnection(): IRealtimeLivePeerConnection {
        return new RTCPeerConnection();
    }

    /** Creates a hidden `<audio>` element to sink the model's audio output. */
    protected createAudioSink(): IRealtimeAudioSink {
        const el = document.createElement('audio');
        el.autoplay = true;
        el.style.display = 'none';
        document.body.appendChild(el);
        return el;
    }

    /**
     * Exchanges local SDP offer for remote answer SDP.
     * Posts to application server broker or direct endpoint.
     */
    protected async postSdpOffer(offerSdp: string, config: ClientRealtimeSessionConfig): Promise<string> {
        const endpoint =
            config.EphemeralToken &&
            (config.EphemeralToken.startsWith('http://') ||
                config.EphemeralToken.startsWith('https://') ||
                config.EphemeralToken.startsWith('/'))
                ? config.EphemeralToken
                : 'https://api.openai.com/v1/live/sessions';

        const isBroker = endpoint !== 'https://api.openai.com/v1/live/sessions';
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (!isBroker && config.EphemeralToken) {
            headers['Authorization'] = `Bearer ${config.EphemeralToken}`;
        }

        const body = isBroker
            ? JSON.stringify({ sdp: offerSdp, session: config.SessionConfig })
            : JSON.stringify({
                  session: config.SessionConfig ?? { model: config.Model || 'gpt-live-1' },
                  transport: {
                      type: 'webrtc',
                      sdp: offerSdp,
                  },
              });

        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body,
        });

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`OpenAI Live WebRTC handshake failed (${response.status}): ${detail}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const data = (await response.json()) as {
                transport?: { sdp?: string };
                answerSdp?: string;
                sdp?: string;
            };
            if (data.transport?.sdp) return data.transport.sdp;
            if (data.answerSdp) return data.answerSdp;
            if (data.sdp) return data.sdp;
            throw new Error('Invalid JSON response from WebRTC SDP broker: missing sdp');
        }

        return response.text();
    }

    // ── Internals ──────────────────────────────────────────────────────────────

    private setState(state: RealtimeClientState): void {
        if (this.currentState !== state) {
            this.currentState = state;
            this.emitStateChange(state);
        }
    }

    private attachMicrophone(pc: IRealtimePeerConnection, micStream: MediaStream): void {
        for (const track of micStream.getAudioTracks()) {
            pc.addTrack(track, micStream);
        }
    }

    private attachRemoteAudio(pc: IRealtimePeerConnection): void {
        this.remoteAudioEl = this.createAudioSink();
        pc.ontrack = (e: RTCTrackEvent) => {
            if (this.remoteAudioEl && e.streams[0]) {
                this.remoteAudioEl.srcObject = e.streams[0];
                this.remoteStream = e.streams[0];
                for (const h of this.remoteStreamHandlers) {
                    try {
                        h(e.streams[0]);
                    } catch (err) {
                        console.warn('[OpenAILiveClient] remote stream handler threw:', err);
                    }
                }
                // Capability obligation #9: agent-side audio meter
                this.attachOutputAudioMeter(RealtimeAudioMeter.ForStream(e.streams[0]));
            }
        };
    }

    private async waitForIceGatheringComplete(pc: IRealtimeLivePeerConnection): Promise<void> {
        if (!pc.iceGatheringState || pc.iceGatheringState === 'complete') {
            return;
        }

        await new Promise<void>((resolve) => {
            const onIce = () => {
                if (pc.iceGatheringState === 'complete') {
                    pc.removeEventListener?.('icegatheringstatechange', onIce);
                    resolve();
                }
            };
            pc.addEventListener?.('icegatheringstatechange', onIce);
            if (pc.iceGatheringState === 'complete') {
                resolve();
            }
        });
    }

    protected adoptDataChannel(channel: IRealtimeDataChannel): void {
        this.dataChannel = channel;
        channel.onopen = () => {
            // Mechanics rule 4: never send session.start on the data channel
            this.setState('listening');
        };

        channel.onmessage = (e: MessageEvent) => {
            this.handleDataChannelMessage(String(e.data));
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

    private handleDataChannelMessage(raw: string): void {
        let event: Record<string, unknown>;
        try {
            event = JSON.parse(raw) as Record<string, unknown>;
        } catch {
            return;
        }

        const type = typeof event.type === 'string' ? event.type : '';

        switch (type) {
            case 'session.started': {
                this.setState('listening');
                break;
            }

            case 'conversation.item.input_audio_transcription.completed': {
                const text = typeof event.transcript === 'string' ? event.transcript : '';
                this.emitTranscript({
                    Role: 'User',
                    Text: text,
                    IsFinal: true,
                    Kind: 'normal',
                });
                break;
            }

            case 'response.audio_transcript.delta':
            case 'response.output_audio_transcript.delta': {
                const delta = typeof event.delta === 'string' ? event.delta : '';
                this.responseActive = true;
                this.audioPlaying = true;
                if (this.currentState !== 'speaking') {
                    this.setState('speaking');
                }
                this.emitTranscript({
                    Role: 'Assistant',
                    Text: delta,
                    IsFinal: false,
                    Kind: this.pendingNarration ? 'narration' : 'normal',
                });
                break;
            }

            case 'response.audio_transcript.done':
            case 'response.output_audio_transcript.done': {
                const text = typeof event.transcript === 'string' ? event.transcript : '';
                this.emitTranscript({
                    Role: 'Assistant',
                    Text: text,
                    IsFinal: true,
                    Kind: this.pendingNarration ? 'narration' : 'normal',
                });
                break;
            }

            case 'response.output_item.done': {
                const item = event.item as Record<string, unknown> | undefined;
                if (item?.type === 'function_call') {
                    // Obligation #1 & #2: silent exit from speaking + release busy flag
                    this.responseActive = false;
                    this.audioPlaying = false;
                    const call: RealtimeClientToolCall = {
                        CallID: String(item.call_id ?? ''),
                        ToolName: String(item.name ?? ''),
                        ArgumentsJson: String(item.arguments ?? '{}'),
                    };
                    this.emitToolCall(call);
                }
                break;
            }

            case 'response.completed':
            case 'response.done': {
                this.responseActive = false;
                this.audioPlaying = false;
                this.pendingNarration = false;
                if (this.currentState === 'speaking') {
                    this.setState('listening');
                }

                const usage = event.usage as Record<string, unknown> | undefined;
                const seconds = typeof usage?.seconds === 'number' ? usage.seconds : undefined;
                const duration = seconds !== undefined ? Math.max(OpenAILiveClient.PREBILL_DURATION_SECONDS, seconds) : this.totalDurationSeconds;
                this.totalDurationSeconds = duration;

                this.emitUsage({
                    InputTokens: typeof usage?.input_tokens === 'number' ? usage.input_tokens : 0,
                    OutputTokens: typeof usage?.output_tokens === 'number' ? usage.output_tokens : 0,
                    DurationSeconds: duration,
                    Raw: usage,
                });
                break;
            }

            case 'input_audio_buffer.speech_started': {
                // True barge-in detection
                if (this.responseActive || this.audioPlaying) {
                    this.emitInterruption();
                    this.CancelActiveResponse();
                }
                break;
            }

            case 'error': {
                const err = event.error as Record<string, unknown> | undefined;
                const message = typeof err?.message === 'string' ? err.message : 'Unknown OpenAI Live error';
                const code = typeof err?.code === 'string' ? err.code : undefined;
                const isFatal = !this.isActive() || code === 'session_expired' || code === 'unauthorized';
                this.emitError({ Message: message, Code: code, Fatal: isFatal });
                if (isFatal) {
                    this.setState('error');
                }
                break;
            }

            case 'session.closed': {
                this.setState('closed');
                void this.Disconnect();
                break;
            }

            default:
                break;
        }
    }

    private isActive(): boolean {
        return this.currentState === 'connected' || this.currentState === 'listening' || this.currentState === 'speaking';
    }

    private sendDataChannelFrame(payload: Record<string, unknown>): void {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            try {
                this.dataChannel.send(JSON.stringify(payload));
            } catch (err) {
                console.warn('[OpenAILiveClient] Failed to send data channel frame:', err);
            }
        }
    }
}

/**
 * Tree-shaking prevention function for OpenAILiveClient.
 */
export function LoadOpenAILiveClient(): void {
    // Intentional no-op — ensures ClassFactory registration executes
}
