import { RegisterClass } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import {
    BaseRealtimeClient,
    RealtimeClientState,
} from '../generic/baseRealtimeClient';

// ── OpenAI Realtime SERVER event interfaces (discriminated union by `type`) ────
// These model only the frames this client consumes; provider event payloads are far
// larger, but we type the fields we read so there are no `any` leaks.

/** Streaming delta of the assistant's spoken-text transcript.
 *  GA (gpt-realtime) emits `response.output_audio_transcript.delta`; the older beta
 *  emitted `response.audio_transcript.delta`. We accept both so captions populate
 *  regardless of the model generation. */
export interface OAIResponseAudioTranscriptDelta {
    type: 'response.output_audio_transcript.delta' | 'response.audio_transcript.delta';
    delta: string;
    response_id?: string;
    item_id?: string;
}

/** Final assistant transcript for a turn (GA or beta event name). */
export interface OAIResponseAudioTranscriptDone {
    type: 'response.output_audio_transcript.done' | 'response.audio_transcript.done';
    transcript: string;
    response_id?: string;
    item_id?: string;
}

/** Final transcription of the user's spoken input for a turn. */
export interface OAIInputAudioTranscriptionCompleted {
    type: 'conversation.item.input_audio_transcription.completed';
    transcript: string;
    item_id?: string;
}

/** The model finished assembling a function (tool) call and wants it executed. */
export interface OAIFunctionCallArgumentsDone {
    type: 'response.function_call_arguments.done';
    call_id: string;
    name: string;
    /** JSON-encoded arguments. */
    arguments: string;
}

/** The provider detected the user starting to speak (barge-in). */
export interface OAIInputAudioBufferSpeechStarted {
    type: 'input_audio_buffer.speech_started';
}

/** A new response (turn) started — tracked so we never start a second overlapping response. */
export interface OAIResponseCreated {
    type: 'response.created';
}

/** A full response (turn) completed — carries usage; ignored for the MVP. */
export interface OAIResponseDone {
    type: 'response.done';
    response?: { usage?: Record<string, number> };
}

/**
 * WebRTC-only playback events: the client audio buffer started/stopped PLAYING.
 * Critical distinction from response.done (generation finished): audio plays at
 * realtime while generation runs ahead, so the model can be "idle" while speech
 * is still audibly coming out of the speaker.
 */
export interface OAIOutputAudioBufferStarted {
    type: 'output_audio_buffer.started';
}
export interface OAIOutputAudioBufferStopped {
    type: 'output_audio_buffer.stopped' | 'output_audio_buffer.cleared';
}

/** Provider-side error frame. */
export interface OAIErrorEvent {
    type: 'error';
    error?: { message?: string; code?: string };
}

/** Events whose `type` we don't explicitly handle still parse to this shape. */
export interface OAIUnknownEvent {
    type: string;
}

export type OpenAIRealtimeEvent =
    | OAIResponseAudioTranscriptDelta
    | OAIResponseAudioTranscriptDone
    | OAIInputAudioTranscriptionCompleted
    | OAIFunctionCallArgumentsDone
    | OAIInputAudioBufferSpeechStarted
    | OAIResponseCreated
    | OAIResponseDone
    | OAIOutputAudioBufferStarted
    | OAIOutputAudioBufferStopped
    | OAIErrorEvent
    | OAIUnknownEvent;

// ── OpenAI Realtime CLIENT event interfaces (frames WE send) ──────────────────

/** Applies the server-built session config (instructions + tools) to the live session. */
export interface OAISessionUpdateEvent {
    type: 'session.update';
    session: JSONObject;
}

/** A user or system `message` conversation item. */
export interface OAIMessageItem {
    type: 'message';
    role: 'user' | 'system';
    content: Array<{ type: 'input_text'; text: string }>;
}

/** The output of an executed function (tool) call, correlated by `call_id`. */
export interface OAIFunctionCallOutputItem {
    type: 'function_call_output';
    call_id: string;
    output: string;
}

/** Creates a conversation item (message or tool output). */
export interface OAIConversationItemCreateEvent {
    type: 'conversation.item.create';
    item: OAIMessageItem | OAIFunctionCallOutputItem;
}

/** Asks the model to produce a response, optionally with one-off instructions. */
export interface OAIResponseCreateEvent {
    type: 'response.create';
    response?: { instructions: string };
}

export type OpenAIRealtimeClientEvent =
    | OAISessionUpdateEvent
    | OAIConversationItemCreateEvent
    | OAIResponseCreateEvent;

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
 * Owns ALL OpenAI wire concerns extracted from the original voice-session orchestration:
 * - WebRTC connect: mic tracks → peer connection, remote audio → hidden `<audio>` sink,
 *   the `'oai-events'` data channel, and the GA SDP handshake (see {@link performSdpHandshake}).
 * - Event translation: GA + beta transcript event names, input transcription, tool calls,
 *   barge-in, playback-buffer events, and provider error frames.
 * - The response state machine: `responseActive` set on `response.created` / cleared on
 *   `response.done`; tool-result `response.create`s queued while a response is in flight
 *   and flushed on `response.done` so the model ALWAYS voices delegated results.
 * - Narration-kind tagging: {@link RequestSpokenUpdate} marks the NEXT response as
 *   `'narration'` so its transcripts are emitted with `Kind: 'narration'` (ephemeral).
 * - Audible-playback tracking ({@link IsAudioPlaying}) from `output_audio_buffer.*` events.
 */
@RegisterClass(BaseRealtimeClient, 'openai')
export class OpenAIRealtimeClient extends BaseRealtimeClient {
    // ── Transport ──────────────────────────────────────────────────────────────
    private peerConnection: IRealtimePeerConnection | null = null;
    /** Protected so test subclasses can inspect/inject; production code treats it as private. */
    protected dataChannel: IRealtimeDataChannel | null = null;
    private remoteAudioEl: IRealtimeAudioSink | null = null;
    private micStream: MediaStream | null = null;
    /**
     * The server-built session config applied verbatim via `session.update` when the data
     * channel opens. Protected so test subclasses can seed it without a full Connect.
     */
    protected sessionConfig: JSONObject | null = null;

    // ── Response state machine ─────────────────────────────────────────────────
    /** Accumulates the in-flight assistant transcript across delta frames. */
    private pendingAssistantText = '';
    /** True while the model has a response in flight; gates narration + queues the tool result. */
    private responseActive = false;
    /** Set when a tool result is ready while a response is active; sent on the next response.done. */
    private pendingResultResponse = false;
    /**
     * Set by {@link RequestSpokenUpdate} just before it sends its `response.create`, and
     * CONSUMED by the very next `response.created` frame, which stamps
     * {@link activeResponseKind} for that turn. Narration is only requested while the model
     * is idle (hosts gate on {@link IsBusy}), so under normal ordering the next
     * `response.created` is ours.
     */
    private pendingNarrationKind = false;
    /**
     * The kind of the response currently in flight. Event ordering (confirmed against the
     * live API): `response.created` → transcript deltas → `*_audio_transcript.done` →
     * `response.done`. The transcript-done frame therefore arrives while the kind is still
     * set, letting {@link onAssistantDone} classify the turn; `response.done` then resets
     * the kind to `'normal'`.
     */
    private activeResponseKind: 'normal' | 'narration' = 'normal';
    /**
     * True while the model's audio is audibly PLAYING in the browser (WebRTC
     * `output_audio_buffer` started/stopped). Distinct from {@link responseActive} —
     * generation finishes ahead of playback.
     */
    private audioPlaying = false;
    /**
     * The client's own view of the session state — mirrors what {@link emitStateChange}
     * last reported, EXCEPT after a tool call is emitted: the host typically shows its own
     * busy state then, so the client silently leaves `'speaking'` (no emission) to preserve
     * the host's indicator until the result reply starts (see {@link handleEvent}).
     */
    private currentState: RealtimeClientState = 'closed';

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

        await this.performSdpHandshake(pc, config.EphemeralToken);
        this.setState('connected');
    }

    /**
     * Tears down the channel, peer connection, mic tracks, and audio sink, resets the
     * response state machine, and emits a final `'closed'` (unless already `'error'`).
     */
    public async Disconnect(): Promise<void> {
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

        this.sessionConfig = null;
        this.resetResponseState();
        if (this.currentState !== 'error') {
            this.setState('closed');
        }
    }

    // ── BaseRealtimeClient: outbound actions ──────────────────────────────────

    /**
     * Injects typed text as a user-role `message` conversation item, then triggers a reply
     * through the SAME collision-safe path tool results use ({@link requestResultResponse})
     * so it queues behind any in-flight response instead of colliding with a second
     * `response.create`. No-op when the data channel isn't open.
     */
    public SendText(text: string): void {
        const channel = this.dataChannel;
        if (!channel || channel.readyState !== 'open') {
            return;
        }
        this.sendEvent(channel, {
            type: 'conversation.item.create',
            item: {
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text }],
            },
        });
        this.requestResultResponse();
    }

    /**
     * Injects a system-role context item the model can draw on the next time it speaks,
     * WITHOUT forcing a reply.
     *
     * NOTE: role must be 'system' — gpt-realtime rejects 'developer' items
     * ("Developer messages are only supported for quicksilver sessions").
     */
    public SendContextNote(text: string): void {
        const channel = this.dataChannel;
        if (!channel) {
            return;
        }
        this.sendEvent(channel, {
            type: 'conversation.item.create',
            item: {
                type: 'message',
                role: 'system',
                content: [{ type: 'input_text', text }],
            },
        });
    }

    /**
     * Triggers ONE short spoken update with the given instructions. Marks the upcoming
     * response as `'narration'` (flag consumed by the next `response.created`) so its
     * transcripts are emitted with `Kind: 'narration'` — ephemeral by contract. Sets
     * {@link responseActive} eagerly so a tool result landing mid-narration queues
     * instead of colliding.
     */
    public RequestSpokenUpdate(instructions: string): void {
        const channel = this.dataChannel;
        if (!channel) {
            return;
        }
        this.responseActive = true;
        this.pendingNarrationKind = true;
        this.sendEvent(channel, {
            type: 'response.create',
            response: { instructions },
        });
    }

    /**
     * Sends the tool result back as a `function_call_output` conversation item, then
     * triggers a reply — immediately if the model is idle, otherwise queued until the
     * current response (e.g. a progress narration) finishes. Without the queueing the
     * result's `response.create` would collide with an in-flight narration and be dropped,
     * leaving the model silent when delegated work comes back.
     */
    public SendToolResult(callID: string, outputJson: string): void {
        const channel = this.dataChannel;
        if (!channel) {
            return;
        }
        this.sendEvent(channel, {
            type: 'conversation.item.create',
            item: {
                type: 'function_call_output',
                call_id: callID,
                output: outputJson,
            },
        });
        this.requestResultResponse();
    }

    /** Mute / unmute by toggling the mic tracks' `enabled` flag (transport stays up). */
    public SetMuted(muted: boolean): void {
        const tracks = this.micStream?.getAudioTracks() ?? [];
        for (const t of tracks) {
            t.enabled = !muted;
        }
    }

    /** @inheritdoc */
    public get IsBusy(): boolean {
        return this.responseActive;
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
            }
        };
    }

    /**
     * Adopts + wires the events data channel: applies the session config and reports
     * `'listening'` on open; translates inbound frames; reports transport errors / closure.
     * Protected so test subclasses can inject a fake channel directly.
     */
    protected adoptDataChannel(channel: IRealtimeDataChannel): void {
        this.dataChannel = channel;
        channel.onopen = () => {
            this.applySessionConfig(channel);
            this.setState('listening');
        };
        channel.onmessage = (e: MessageEvent) => {
            this.handleChannelMessage(e);
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
        this.sendEvent(channel, { type: 'session.update', session: this.sessionConfig });
    }

    // ── Inbound event translation ──────────────────────────────────────────────

    /** Parses an inbound channel message and dispatches it to the typed handler. */
    private handleChannelMessage(e: MessageEvent): void {
        let event: OpenAIRealtimeEvent;
        try {
            event = JSON.parse(e.data as string) as OpenAIRealtimeEvent;
        } catch {
            return; // non-JSON frame — ignore
        }
        this.handleEvent(event);
    }

    /** Dispatches a typed OpenAI realtime server event to the appropriate behavior. */
    private handleEvent(event: OpenAIRealtimeEvent): void {
        switch (event.type) {
            case 'response.output_audio_transcript.delta':
            case 'response.audio_transcript.delta':
                this.onAssistantDelta((event as OAIResponseAudioTranscriptDelta).delta);
                break;
            case 'response.output_audio_transcript.done':
            case 'response.audio_transcript.done':
                this.onAssistantDone((event as OAIResponseAudioTranscriptDone).transcript);
                break;
            case 'conversation.item.input_audio_transcription.completed':
                this.onUserTranscript((event as OAIInputAudioTranscriptionCompleted).transcript);
                break;
            case 'response.function_call_arguments.done':
                this.onToolCallFrame(event as OAIFunctionCallArgumentsDone);
                break;
            case 'input_audio_buffer.speech_started':
                // Barge-in: provider handles cancelling its own turn. We just reflect
                // that the user has the floor again.
                this.setState('listening');
                break;
            case 'response.created':
                this.responseActive = true;
                // Stamp the kind of THIS response: 'narration' only when the flag was set by
                // RequestSpokenUpdate immediately before its response.create (consumed here).
                this.activeResponseKind = this.pendingNarrationKind ? 'narration' : 'normal';
                this.pendingNarrationKind = false;
                break;
            case 'output_audio_buffer.started':
                this.audioPlaying = true;
                break;
            case 'output_audio_buffer.stopped':
            case 'output_audio_buffer.cleared':
                this.audioPlaying = false;
                if (this.currentState === 'speaking' && !this.responseActive) {
                    this.setState('listening');
                }
                break;
            case 'response.done':
                // A turn finished — release the lock and speak any queued tool result so the
                // model always voices the answer when delegated work comes back.
                // The transcript-done frame for this turn has already arrived (it precedes
                // response.done), so it's safe to reset the response kind here.
                this.responseActive = false;
                this.activeResponseKind = 'normal';
                this.flushPendingResultResponse();
                if (this.currentState === 'speaking') {
                    this.setState('listening');
                }
                break;
            case 'error':
                this.onErrorFrame(event as OAIErrorEvent);
                break;
            default:
                // Unhandled event types are expected (the provider emits many); no-op.
                break;
        }
    }

    /** Appends an assistant transcript delta, reflects `'speaking'`, and emits the delta. */
    private onAssistantDelta(delta: string): void {
        if (this.currentState !== 'speaking') {
            this.setState('speaking');
        }
        this.pendingAssistantText += delta;
        this.emitTranscript({ Role: 'Assistant', Text: delta, IsFinal: false, Kind: this.activeResponseKind });
    }

    /**
     * Finalizes the assistant turn: emits the final transcript tagged with the ACTIVE
     * response kind (the transcript-done frame arrives BEFORE `response.done`, so
     * {@link activeResponseKind} still reflects this turn), then returns to `'listening'`.
     * Empty turns emit nothing.
     */
    private onAssistantDone(transcript: string): void {
        const finalText = transcript || this.pendingAssistantText;
        this.pendingAssistantText = '';
        if (finalText.trim().length > 0) {
            this.emitTranscript({ Role: 'Assistant', Text: finalText, IsFinal: true, Kind: this.activeResponseKind });
        }
        if (this.currentState === 'speaking') {
            this.setState('listening');
        }
    }

    /** Emits the final transcription of the user's spoken input (always `Kind: 'normal'`). */
    private onUserTranscript(transcript: string): void {
        this.emitTranscript({ Role: 'User', Text: transcript, IsFinal: true, Kind: 'normal' });
    }

    /**
     * Surfaces a completed tool call to the host. The client silently leaves the
     * `'speaking'` state (NO emission) so a host-rendered busy indicator (e.g. "thinking")
     * isn't clobbered by this turn's trailing `response.done` / playback-stopped frames —
     * those only transition when the client still considers itself `'speaking'`.
     */
    private onToolCallFrame(call: OAIFunctionCallArgumentsDone): void {
        if (this.currentState === 'speaking') {
            this.currentState = 'connected';
        }
        this.emitToolCall({ CallID: call.call_id, ToolName: call.name, ArgumentsJson: call.arguments });
    }

    /** Surfaces a provider error frame (non-fatal; the session continues). */
    private onErrorFrame(event: OAIErrorEvent): void {
        this.emitError({
            Message: event.error?.message ?? 'Unknown provider error',
            Code: event.error?.code,
            Fatal: false,
        });
    }

    // ── Response state machine ─────────────────────────────────────────────────

    /**
     * Asks the model to speak (a tool result or typed-text reply) — immediately if it's
     * idle, otherwise queued until the current response finishes.
     */
    private requestResultResponse(): void {
        if (!this.dataChannel) {
            return;
        }
        if (this.responseActive) {
            this.pendingResultResponse = true;
            return;
        }
        this.responseActive = true;
        this.sendEvent(this.dataChannel, { type: 'response.create' });
        this.setState('speaking');
    }

    /** On a turn completing, fire any queued tool-result response so the answer is spoken. */
    private flushPendingResultResponse(): void {
        if (!this.pendingResultResponse || !this.dataChannel) {
            return;
        }
        this.pendingResultResponse = false;
        this.responseActive = true;
        this.sendEvent(this.dataChannel, { type: 'response.create' });
        this.setState('speaking');
    }

    /** Resets the per-session response state machine (used on Disconnect). */
    private resetResponseState(): void {
        this.pendingAssistantText = '';
        this.responseActive = false;
        this.pendingResultResponse = false;
        this.pendingNarrationKind = false;
        this.activeResponseKind = 'normal';
        this.audioPlaying = false;
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /** Updates the client's own state view and emits the change to the host. */
    private setState(state: RealtimeClientState): void {
        this.currentState = state;
        this.emitStateChange(state);
    }

    /** Serializes + sends a client event over the data channel (only when open). */
    private sendEvent(channel: IRealtimeDataChannel, event: OpenAIRealtimeClientEvent): void {
        if (channel.readyState === 'open') {
            channel.send(JSON.stringify(event));
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
