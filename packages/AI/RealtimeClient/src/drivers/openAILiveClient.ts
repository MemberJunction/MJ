import { RegisterClass } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, JSONObject, RealtimeToolBatchBarrier } from '@memberjunction/ai';
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
    public static readonly PLAYBACK_DRAIN_SILENCE_MS = 200;
    public static readonly PLAYBACK_DRAIN_TRANSCRIPT_GAP_MS = 300;
    public static readonly PLAYBACK_DRAIN_SILENCE_THRESHOLD = 0.01;
    public static readonly ASSISTANT_SAFETY_BACKSTOP_MS = 3000;
    public static readonly MAX_OUTBOUND_QUEUE_SIZE = 100;

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
    private pendingUserText = '';
    private pendingAssistantText = '';
    private lastOutputTranscriptTime = 0;
    private drainSilenceStartTime: number | null = null;
    private playbackDrainInterval: ReturnType<typeof setInterval> | null = null;
    private assistantSafetyBackstopTimer: ReturnType<typeof setTimeout> | null = null;
    private clientDelegationCallIds = new Set<string>();
    private emittedToolCallIds = new Set<string>();
    private toolBatchBarrier = new RealtimeToolBatchBarrier();
    private outboundQueue: Array<Record<string, unknown>> = [];

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

    public get State(): RealtimeClientState {
        return this.currentState;
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
        this.finalizeUserTranscript();
        this.finalizeAssistantTranscript();

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
        this.stopPlaybackDrainMonitoring();
        this.pendingUserText = '';
        this.pendingAssistantText = '';
        this.clientDelegationCallIds.clear();
        this.emittedToolCallIds.clear();
        this.toolBatchBarrier.Clear();
        this.outboundQueue = [];

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
            type: 'session.commentary.append',
            content: text,
            delegation_id: null,
        });
        this.sendDataChannelFrame({
            type: 'response.create',
        });
    }

    /**
     * Cancels an active model response and flushes local playback.
     */
    public CancelActiveResponse(): void {
        this.stopPlaybackDrainMonitoring();
        this.pendingAssistantText = '';
        // Note: emittedToolCallIds is intentionally NOT cleared here.
        // GPT-Live has no wire response.cancel event, so the server may continue
        // delivering output_item.done / function_call_arguments.done for this turn.
        // Keeping emittedToolCallIds intact prevents double tool emission on cancel.
        // toolBatchBarrier also deliberately survives a cancel so pending tool outputs
        // can be submitted without triggering 'function_call_outputs_required'.
        if (this.responseActive || this.audioPlaying) {
            // Mechanics rule: GPT-Live has no wire response.cancel event on WebRTC;
            // cancellation is local playback drain and state flush only.
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
     * Uses `session.thinking.append` with `content` parameter and `delegation_id: null`.
     */
    public SendContextNote(text: string): void {
        this.sendDataChannelFrame({
            type: 'session.thinking.append',
            content: text,
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
            content: instructions,
            delegation_id: null,
        });
        if (this.toolBatchBarrier.IsEmpty) {
            this.sendDataChannelFrame({
                type: 'response.create',
            });
        }
    }

    /**
     * Delivers a completed tool execution result back to the model.
     * OpenAI Live remote reasoning plane requires response.item.create followed by response.create.
     * Client delegation plane uses session.commentary.append with the delegation_id.
     */
    public SendToolResult(callID: string, outputJson: string): void {
        if (this.clientDelegationCallIds.has(callID)) {
            this.clientDelegationCallIds.delete(callID);
            this.sendDataChannelFrame({
                type: 'session.commentary.append',
                content: outputJson,
                delegation_id: callID,
            });
            return;
        }

        this.sendDataChannelFrame({
            type: 'response.item.create',
            item: {
                type: 'function_call_output',
                call_id: callID,
                output: outputJson,
            },
        });

        const isBatchComplete = this.toolBatchBarrier.RecordResult(callID);
        if (isBatchComplete) {
            this.sendDataChannelFrame({
                type: 'response.create',
            });
        }
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
            this.flushOutboundQueue();
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

    private finalizeAssistantTranscript(): void {
        this.stopPlaybackDrainMonitoring();
        if (this.pendingAssistantText.trim().length > 0) {
            this.emitTranscript({
                Role: 'Assistant',
                Text: this.pendingAssistantText,
                IsFinal: true,
                Kind: this.pendingNarration ? 'narration' : 'normal',
            });
            this.pendingAssistantText = '';
        }
        this.pendingNarration = false;
        this.responseActive = false;
        this.audioPlaying = false;
        if (this.currentState === 'speaking') {
            this.setState('listening');
        }
    }

    private finalizeUserTranscript(): void {
        try {
            if (this.pendingUserText.trim().length > 0) {
                this.emitTranscript({
                    Role: 'User',
                    Text: this.pendingUserText,
                    IsFinal: true,
                    Kind: 'normal',
                });
            }
        } finally {
            this.pendingUserText = '';
        }
    }

    private startPlaybackDrainMonitoring(): void {
        if (this.playbackDrainInterval) {
            return;
        }
        this.playbackDrainInterval = setInterval(() => {
            this.checkPlaybackDrain();
        }, 50);
    }

    private stopPlaybackDrainMonitoring(): void {
        if (this.playbackDrainInterval) {
            clearInterval(this.playbackDrainInterval);
            this.playbackDrainInterval = null;
        }
        if (this.assistantSafetyBackstopTimer) {
            clearTimeout(this.assistantSafetyBackstopTimer);
            this.assistantSafetyBackstopTimer = null;
        }
        this.drainSilenceStartTime = null;
    }

    private scheduleAssistantSafetyBackstop(delayMs = OpenAILiveClient.ASSISTANT_SAFETY_BACKSTOP_MS): void {
        if (this.assistantSafetyBackstopTimer) {
            clearTimeout(this.assistantSafetyBackstopTimer);
        }
        this.assistantSafetyBackstopTimer = setTimeout(() => {
            this.assistantSafetyBackstopTimer = null;
            this.finalizeAssistantTranscript();
        }, delayMs);
    }

    private checkPlaybackDrain(): void {
        if (!this.pendingAssistantText && !this.audioPlaying) {
            this.stopPlaybackDrainMonitoring();
            return;
        }

        const now = Date.now();
        if (now - this.lastOutputTranscriptTime < OpenAILiveClient.PLAYBACK_DRAIN_TRANSCRIPT_GAP_MS) {
            this.drainSilenceStartTime = null;
            return;
        }

        if (this.outputAudioMeter) {
            const level = this.outputAudioMeter.Level();
            if (level <= OpenAILiveClient.PLAYBACK_DRAIN_SILENCE_THRESHOLD) {
                if (this.drainSilenceStartTime === null) {
                    this.drainSilenceStartTime = now;
                } else if (now - this.drainSilenceStartTime >= OpenAILiveClient.PLAYBACK_DRAIN_SILENCE_MS) {
                    this.finalizeAssistantTranscript();
                }
            } else {
                this.drainSilenceStartTime = null;
            }
        }
    }

    private handleToolCallItem(callId: string, name: string, argsJson: string): void {
        if (!callId || !name) {
            return;
        }
        if (this.emittedToolCallIds.has(callId)) {
            return;
        }
        this.emittedToolCallIds.add(callId);

        this.finalizeAssistantTranscript();
        this.responseActive = false;
        this.audioPlaying = false;
        this.toolBatchBarrier.TrackPendingCall(callId, () => {
            this.sendDataChannelFrame({
                type: 'response.create',
            });
        });
        const call: RealtimeClientToolCall = {
            CallID: callId,
            ToolName: name,
            ArgumentsJson: argsJson,
        };
        this.emitToolCall(call);
    }

    private handleOutputItemDone(item: Record<string, unknown> | undefined): void {
        if (item?.type === 'function_call') {
            const callId = String(item.call_id ?? '');
            const name = String(item.name ?? '');
            const args = String(item.arguments ?? '{}');
            this.handleToolCallItem(callId, name, args);
        }
    }

    private handleResponseCompleted(respOrUsage: Record<string, unknown> | undefined): void {
        this.emittedToolCallIds.clear();
        this.finalizeAssistantTranscript();
        const usage = (respOrUsage?.usage as Record<string, unknown> | undefined) ?? respOrUsage;
        const seconds = typeof usage?.seconds === 'number' ? usage.seconds : undefined;
        const duration = seconds !== undefined ? Math.max(OpenAILiveClient.PREBILL_DURATION_SECONDS, seconds) : this.totalDurationSeconds;
        this.totalDurationSeconds = duration;

        this.emitUsage({
            InputTokens: typeof usage?.input_tokens === 'number' ? usage.input_tokens : 0,
            OutputTokens: typeof usage?.output_tokens === 'number' ? usage.output_tokens : 0,
            DurationSeconds: duration,
            Raw: usage,
        });
    }

    private isResponsesDelegation(): boolean {
        const delegation = this.sessionConfig?.['delegation'];
        if (delegation && typeof delegation === 'object' && !Array.isArray(delegation)) {
            return (delegation as Record<string, unknown>)['type'] === 'responses';
        }
        return false;
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

            case 'session.input_transcript.delta': {
                const delta = typeof event.delta === 'string' ? event.delta : typeof event.text === 'string' ? event.text : '';
                if (!delta) {
                    break;
                }
                if (this.pendingAssistantText) {
                    this.finalizeAssistantTranscript();
                }
                this.pendingUserText += delta;
                this.emitTranscript({
                    Role: 'User',
                    Text: delta,
                    IsFinal: false,
                    Kind: 'normal',
                });
                break;
            }

            case 'session.output_transcript.delta': {
                const delta = typeof event.delta === 'string' ? event.delta : typeof event.text === 'string' ? event.text : '';
                if (!delta) {
                    break;
                }
                if (this.pendingUserText) {
                    this.finalizeUserTranscript();
                }
                this.responseActive = true;
                this.audioPlaying = true;
                if (this.currentState !== 'speaking') {
                    this.setState('speaking');
                }
                this.pendingAssistantText += delta;
                this.emitTranscript({
                    Role: 'Assistant',
                    Text: delta,
                    IsFinal: false,
                    Kind: this.pendingNarration ? 'narration' : 'normal',
                });
                this.lastOutputTranscriptTime = Date.now();
                this.drainSilenceStartTime = null;
                this.startPlaybackDrainMonitoring();
                this.scheduleAssistantSafetyBackstop();
                break;
            }

            case 'response.event': {
                const inner = event.event as Record<string, unknown> | undefined;
                if (inner?.type === 'response.output_item.done') {
                    this.handleOutputItemDone(inner.item as Record<string, unknown> | undefined);
                } else if (inner?.type === 'response.function_call_arguments.done') {
                    const callId = String(inner.call_id ?? '');
                    const name = String(inner.name ?? '');
                    const args = String(inner.arguments ?? '{}');
                    this.handleToolCallItem(callId, name, args);
                } else if (inner?.type === 'response.completed' || inner?.type === 'response.done') {
                    this.handleResponseCompleted((inner.response as Record<string, unknown> | undefined) ?? inner);
                }
                break;
            }

            case 'session.delegation.created': {
                this.finalizeAssistantTranscript();
                this.finalizeUserTranscript();
                this.responseActive = false;
                this.audioPlaying = false;
                // In responses delegation mode (remote reasoning), session.delegation.created marks the start
                // of reasoning on the responses model (e.g. gpt-4o). Tool calls are emitted individually
                // via response.event (response.output_item.done) with their real function names.
                // Only emit 'backend_delegation' when in client delegation mode (local plane).
                if (!this.isResponsesDelegation()) {
                    const delegationId = String(event.delegation_id ?? '');
                    if (delegationId) {
                        this.clientDelegationCallIds.add(delegationId);
                        const call: RealtimeClientToolCall = {
                            CallID: delegationId,
                            ToolName: 'backend_delegation',
                            ArgumentsJson: JSON.stringify({ delegation_id: delegationId }),
                        };
                        this.emitToolCall(call);
                    }
                }
                break;
            }

            case 'session.usage.updated': {
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

            case 'error': {
                const err = event.error as Record<string, unknown> | undefined;
                const message = typeof err?.message === 'string' ? err.message : 'Unknown OpenAI Live error';
                const code = typeof err?.code === 'string' ? err.code : undefined;
                const isFatal = !this.isActive() || code === 'session_expired' || code === 'unauthorized';
                // Provider cut-off signal (moderation or provider abort mid-speech)
                if (this.responseActive || this.audioPlaying) {
                    this.emitInterruption();
                    this.CancelActiveResponse();
                }
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
        const frameType = typeof payload.type === 'string' ? payload.type : 'unknown';
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            try {
                this.dataChannel.send(JSON.stringify(payload));
            } catch (err) {
                console.warn('[OpenAILiveClient] Failed to send data channel frame:', err);
            }
        } else if (!this.dataChannel || this.dataChannel.readyState === 'connecting') {
            if (this.outboundQueue.length >= OpenAILiveClient.MAX_OUTBOUND_QUEUE_SIZE) {
                const dropped = this.outboundQueue.shift();
                const droppedType = typeof dropped?.type === 'string' ? dropped.type : 'unknown';
                console.warn(`[OpenAILiveClient] outboundQueue reached max capacity (${OpenAILiveClient.MAX_OUTBOUND_QUEUE_SIZE}), dropped oldest frame (${droppedType})`);
            }
            this.outboundQueue.push(payload);
        } else {
            console.warn(`[OpenAILiveClient] Dropping frame (${frameType}) because data channel is ${this.dataChannel.readyState}`);
        }
    }

    private flushOutboundQueue(): void {
        while (this.outboundQueue.length > 0 && this.dataChannel && this.dataChannel.readyState === 'open') {
            const frame = this.outboundQueue.shift();
            if (frame) {
                this.sendDataChannelFrame(frame);
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
