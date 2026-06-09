import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { Metadata, IMetadataProvider } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

/**
 * Connection / turn state for a real-time voice session, surfaced to the UI overlay.
 * - `connecting`  — negotiating the session + WebRTC handshake
 * - `listening`   — connected, mic open, waiting for / hearing the user
 * - `speaking`    — the agent is producing audio
 * - `thinking`    — the agent delegated work (tool call) and is waiting on a result
 * - `error`       — a fatal error occurred; the session is no longer usable
 * - `closed`      — the session has been torn down
 */
export type VoiceConnectionState =
  | 'connecting'
  | 'listening'
  | 'speaking'
  | 'thinking'
  | 'error'
  | 'closed';

/** A single caption line (one side of the conversation) shown in the live-captions list. */
export interface VoiceCaption {
  Role: 'User' | 'Assistant';
  Text: string;
}

/**
 * A delegated-run progress update surfaced to the UI, emitted on {@link VoiceSessionService.DelegationProgress$}.
 * These originate server-side during an `invoke-target-agent` delegation (e.g. while Sage works) and let a
 * future overlay render a "working" card while the realtime model narrates the same progress aloud.
 */
export interface VoiceDelegationProgress {
  /** The `invoke-target-agent` call this progress belongs to. */
  CallID: string;
  /** The delegation phase: `prompt_execution` | `action_execution` | `subagent_execution` | `decision_processing`. */
  Step: string;
  /** Human-readable progress message. */
  Message: string;
  /** Optional completion percentage (0–100) when the server can estimate it. */
  Percentage?: number;
}

/**
 * Raw shape of the JSON `message` the server publishes on the push-status topic during a delegated run.
 * We filter on `resolver` + `type` before correlating by `agentSessionID`; normal agent runs publish
 * other shapes on the same topic and are ignored.
 */
interface RealtimeDelegationProgressPayload {
  resolver: string;
  type: string;
  agentSessionID: string;
  callID: string;
  step: string;
  message: string;
  percentage?: number;
}

/**
 * Result shape returned by the `StartRealtimeClientSession` server mutation.
 * The browser uses these values to open a client-direct WebRTC session.
 */
interface StartRealtimeClientSessionResult {
  AgentSessionId: string;
  ConversationId: string | null;
  Provider: string;
  Model: string;
  EphemeralToken: string;
  ExpiresAt: string;
  /** JSON.stringify of the provider session config (instructions + tools) to apply via `session.update`. */
  SessionConfigJson: string;
}

// ── OpenAI Realtime event interfaces (discriminated union by `type`) ───────────
// These model only the frames this MVP consumes; provider event payloads are far
// larger, but we type the fields we read so there are no `any` leaks. The exact
// field names are confirmed against the live API in P7 (see TODO(P7) markers).

/** Streaming delta of the assistant's spoken-text transcript.
 *  GA (gpt-realtime) emits `response.output_audio_transcript.delta`; the older beta
 *  emitted `response.audio_transcript.delta`. We accept both so captions populate
 *  regardless of the model generation. */
interface OAIResponseAudioTranscriptDelta {
  type: 'response.output_audio_transcript.delta' | 'response.audio_transcript.delta';
  delta: string;
  response_id?: string;
  item_id?: string;
}

/** Final assistant transcript for a turn (GA or beta event name). */
interface OAIResponseAudioTranscriptDone {
  type: 'response.output_audio_transcript.done' | 'response.audio_transcript.done';
  transcript: string;
  response_id?: string;
  item_id?: string;
}

/** Final transcription of the user's spoken input for a turn. */
interface OAIInputAudioTranscriptionCompleted {
  type: 'conversation.item.input_audio_transcription.completed';
  transcript: string;
  item_id?: string;
}

/** The model finished assembling a function (tool) call and wants it executed. */
interface OAIFunctionCallArgumentsDone {
  type: 'response.function_call_arguments.done';
  call_id: string;
  name: string;
  /** JSON-encoded arguments. */
  arguments: string;
}

/** The provider detected the user starting to speak (barge-in). */
interface OAIInputAudioBufferSpeechStarted {
  type: 'input_audio_buffer.speech_started';
}

/** A full response (turn) completed — carries usage; ignored for the MVP. */
interface OAIResponseDone {
  type: 'response.done';
  response?: { usage?: Record<string, number> };
}

/** Provider-side error frame. */
interface OAIErrorEvent {
  type: 'error';
  error?: { message?: string; code?: string };
}

/** Events whose `type` we don't explicitly handle still parse to this shape. */
interface OAIUnknownEvent {
  type: string;
}

type OpenAIRealtimeEvent =
  | OAIResponseAudioTranscriptDelta
  | OAIResponseAudioTranscriptDone
  | OAIInputAudioTranscriptionCompleted
  | OAIFunctionCallArgumentsDone
  | OAIInputAudioBufferSpeechStarted
  | OAIResponseDone
  | OAIErrorEvent
  | OAIUnknownEvent;

/**
 * Drives a **client-direct** real-time voice session: the browser mints an
 * ephemeral token from the MJ server, then connects DIRECTLY to OpenAI over
 * WebRTC. Audio frames never transit the MJ server (low latency); only tool
 * calls and final transcripts are relayed back to MJ over GraphQL.
 *
 * The Voice Co-Agent (server-side) fronts the conversation's current agent —
 * the server bakes the companion instructions + tool set into `SessionConfigJson`,
 * which this service applies verbatim via `session.update`.
 *
 * Lifecycle: {@link StartVoiceSession} → live duplex → {@link EndVoiceSession}.
 */
@Injectable({ providedIn: 'root' })
export class VoiceSessionService {
  // ── Reactive UI state ──────────────────────────────────────────────────────
  private _connectionState$ = new BehaviorSubject<VoiceConnectionState>('closed');
  private _captions$ = new BehaviorSubject<VoiceCaption[]>([]);
  private _active$ = new BehaviorSubject<boolean>(false);
  private _delegationProgress$ = new Subject<VoiceDelegationProgress>();

  /** Current connection / turn state. */
  public readonly ConnectionState$: Observable<VoiceConnectionState> = this._connectionState$.asObservable();
  /** Live captions for both sides of the conversation. */
  public readonly Captions$: Observable<VoiceCaption[]> = this._captions$.asObservable();
  /** True while a session is open (mic button active, overlay shown). */
  public readonly Active$: Observable<boolean> = this._active$.asObservable();
  /**
   * Progress updates from a delegated agent run (e.g. Sage) while the realtime model waits on it.
   * The future overlay subscribes to render a "working" card; the model also narrates these aloud.
   */
  public readonly DelegationProgress$: Observable<VoiceDelegationProgress> = this._delegationProgress$.asObservable();

  // ── WebRTC / session internals ─────────────────────────────────────────────
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudioEl: HTMLAudioElement | null = null;
  private agentSessionId: string | null = null;
  private sessionConfigJson: string | null = null;

  /** Accumulates the in-flight assistant transcript across delta frames. */
  private pendingAssistantText = '';

  // ── Delegated-run progress streaming ───────────────────────────────────────
  /** Minimum gap between spoken progress narrations, to avoid chatter / interrupting. */
  private static readonly DelegationNarrationThrottleMs = 4000;
  /** Active push-status subscription that feeds delegation progress; cleared on teardown. */
  private delegationProgressSub: Subscription | null = null;
  /** Timestamp (ms) of the last narration `response.create` we triggered; 0 = never. */
  private lastDelegationNarrationAt = 0;

  private _provider: IMetadataProvider | null = null;

  /**
   * Metadata provider used for the GraphQL relay mutations. Falls back to the
   * global default when unset (single-provider apps see no change).
   */
  public get Provider(): IMetadataProvider {
    return this._provider ?? Metadata.Provider;
  }
  public set Provider(value: IMetadataProvider | null) {
    this._provider = value;
  }

  /** True when a session is currently open. */
  public get IsActive(): boolean {
    return this._active$.value;
  }

  /**
   * Start a client-direct voice session fronting `targetAgentId`.
   *
   * @param targetAgentId The agent the Voice Co-Agent voices on behalf of.
   * @param conversationId Optional existing conversation to bind + seed context from.
   * @param lastSessionId Optional prior session to chain to (resume / continuation).
   */
  public async StartVoiceSession(
    targetAgentId: string,
    conversationId?: string | null,
    lastSessionId?: string | null
  ): Promise<void> {
    if (this.IsActive) {
      return; // a session is already running — ignore duplicate starts
    }

    this.resetState();
    this._active$.next(true);
    this._connectionState$.next('connecting');

    try {
      const session = await this.mintSession(targetAgentId, conversationId, lastSessionId);
      this.agentSessionId = session.AgentSessionId;
      this.sessionConfigJson = session.SessionConfigJson;

      await this.openWebRtcConnection(session);
      this.subscribeDelegationProgress();
      // State advances to 'listening' once the data channel opens (see wireDataChannel).
    } catch (error) {
      console.error('[VoiceSession] Failed to start session:', error);
      this._connectionState$.next('error');
      await this.teardown(false);
    }
  }

  /**
   * End the active session: stop the mic, tear down WebRTC, and close the
   * server-side agent session. Safe to call when no session is active.
   */
  public async EndVoiceSession(): Promise<void> {
    if (!this.IsActive && !this.agentSessionId) {
      return;
    }
    await this.teardown(true);
  }

  /** Mute / unmute the local microphone track. Returns the new muted state. */
  public ToggleMute(): boolean {
    const tracks = this.localStream?.getAudioTracks() ?? [];
    if (tracks.length === 0) {
      return false;
    }
    const newEnabled = !tracks[0].enabled;
    for (const t of tracks) {
      t.enabled = newEnabled;
    }
    return !newEnabled; // muted = !enabled
  }

  // ── Session minting (GraphQL) ──────────────────────────────────────────────

  /** Calls the `StartRealtimeClientSession` mutation to obtain an ephemeral token + config. */
  private async mintSession(
    targetAgentId: string,
    conversationId?: string | null,
    lastSessionId?: string | null
  ): Promise<StartRealtimeClientSessionResult> {
    const mutation = `
      mutation StartRealtimeClientSession($targetAgentId: String!, $conversationId: String, $lastSessionId: String) {
        StartRealtimeClientSession(targetAgentId: $targetAgentId, conversationId: $conversationId, lastSessionId: $lastSessionId) {
          AgentSessionId
          ConversationId
          Provider
          Model
          EphemeralToken
          ExpiresAt
          SessionConfigJson
        }
      }
    `;
    const variables = {
      targetAgentId,
      conversationId: conversationId ?? null,
      lastSessionId: lastSessionId ?? null
    };
    const result = await this.gql().ExecuteGQL(mutation, variables);
    const payload = result?.StartRealtimeClientSession as StartRealtimeClientSessionResult | undefined;
    if (!payload?.EphemeralToken) {
      throw new Error('StartRealtimeClientSession returned no ephemeral token');
    }
    return payload;
  }

  // ── WebRTC handshake ───────────────────────────────────────────────────────

  /**
   * Opens the client-direct OpenAI Realtime WebRTC connection: mic capture,
   * peer connection, data channel, remote audio sink, and the SDP handshake.
   */
  private async openWebRtcConnection(session: StartRealtimeClientSessionResult): Promise<void> {
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const pc = new RTCPeerConnection();
    this.peerConnection = pc;

    // Mic → provider.
    for (const track of this.localStream.getAudioTracks()) {
      pc.addTrack(track, this.localStream);
    }

    // Provider audio → <audio> sink.
    this.remoteAudioEl = this.createAudioSink();
    pc.ontrack = (e: RTCTrackEvent) => {
      if (this.remoteAudioEl && e.streams[0]) {
        this.remoteAudioEl.srcObject = e.streams[0];
      }
    };

    // Control / events channel.
    const channel = pc.createDataChannel('oai-events');
    this.dataChannel = channel;
    this.wireDataChannel(channel);

    await this.performSdpHandshake(pc, session);
  }

  /**
   * Performs the offer/answer SDP exchange with OpenAI's Realtime WebRTC endpoint.
   *
   * GA browser flow (confirmed against the OpenAI Realtime WebRTC guide): POST the raw
   * SDP offer to `https://api.openai.com/v1/realtime/calls` with **no** query params and
   * **no** `OpenAI-Beta` header. The ephemeral client secret already encodes the model +
   * session config (set server-side at mint), so the browser must not specify the model —
   * passing `?model=` returns an empty 400. The answer comes back as raw `application/sdp`.
   */
  private async performSdpHandshake(
    pc: RTCPeerConnection,
    session: StartRealtimeClientSessionResult
  ): Promise<void> {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const response = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      body: offer.sdp ?? '',
      headers: {
        Authorization: `Bearer ${session.EphemeralToken}`,
        'Content-Type': 'application/sdp'
      }
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`OpenAI WebRTC handshake failed (${response.status}): ${detail}`);
    }

    const answerSdp = await response.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  }

  /** Creates a hidden `<audio>` element to play the model's audio output. */
  private createAudioSink(): HTMLAudioElement {
    const el = document.createElement('audio');
    el.autoplay = true;
    el.style.display = 'none';
    document.body.appendChild(el);
    return el;
  }

  // ── Data channel wiring ────────────────────────────────────────────────────

  /** Attaches open / message / error / close handlers to the events data channel. */
  private wireDataChannel(channel: RTCDataChannel): void {
    channel.onopen = () => {
      this.applySessionConfig(channel);
      this._connectionState$.next('listening');
    };
    channel.onmessage = (e: MessageEvent) => {
      void this.handleChannelMessage(e);
    };
    channel.onerror = (e: Event) => {
      console.error('[VoiceSession] Data channel error:', e);
      this._connectionState$.next('error');
    };
    channel.onclose = () => {
      if (this._connectionState$.value !== 'error') {
        this._connectionState$.next('closed');
      }
    };
  }

  /**
   * Sends the server-controlled session config (instructions + tools) as a
   * `session.update` so the Voice Co-Agent's identity and tool set apply.
   */
  private applySessionConfig(channel: RTCDataChannel): void {
    if (!this.sessionConfigJson) {
      return;
    }
    try {
      const sessionConfig = JSON.parse(this.sessionConfigJson) as Record<string, unknown>;
      this.sendEvent(channel, { type: 'session.update', session: sessionConfig });
    } catch (error) {
      console.error('[VoiceSession] Failed to parse/apply SessionConfigJson:', error);
    }
  }

  /** Parses an inbound channel message and dispatches it to the typed handler. */
  private async handleChannelMessage(e: MessageEvent): Promise<void> {
    let event: OpenAIRealtimeEvent;
    try {
      event = JSON.parse(e.data as string) as OpenAIRealtimeEvent;
    } catch {
      return; // non-JSON frame — ignore
    }
    await this.handleEvent(event);
  }

  /** Dispatches a typed OpenAI realtime event to the appropriate behavior. */
  private async handleEvent(event: OpenAIRealtimeEvent): Promise<void> {
    switch (event.type) {
      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta':
        this.onAssistantDelta((event as OAIResponseAudioTranscriptDelta).delta);
        break;
      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done':
        await this.onAssistantDone((event as OAIResponseAudioTranscriptDone).transcript);
        break;
      case 'conversation.item.input_audio_transcription.completed':
        await this.onUserTranscript((event as OAIInputAudioTranscriptionCompleted).transcript);
        break;
      case 'response.function_call_arguments.done':
        await this.handleToolCall(event as OAIFunctionCallArgumentsDone);
        break;
      case 'input_audio_buffer.speech_started':
        // Barge-in: provider handles cancelling its own turn. We just reflect
        // that the user has the floor again.
        this._connectionState$.next('listening');
        break;
      case 'response.done':
        // Usage telemetry — ignored for the MVP (server checkpoints its own).
        if (this._connectionState$.value === 'speaking') {
          this._connectionState$.next('listening');
        }
        break;
      case 'error':
        console.error('[VoiceSession] Provider error event:', (event as OAIErrorEvent).error);
        break;
      default:
        // Unhandled event types are expected (the provider emits many); no-op.
        break;
    }
  }

  /** Appends an assistant transcript delta and reflects the speaking state. */
  private onAssistantDelta(delta: string): void {
    if (this._connectionState$.value !== 'speaking') {
      this._connectionState$.next('speaking');
    }
    this.pendingAssistantText += delta;
  }

  /** Finalizes the assistant turn: push a caption + relay the final transcript. */
  private async onAssistantDone(transcript: string): Promise<void> {
    const finalText = transcript || this.pendingAssistantText;
    this.pendingAssistantText = '';
    if (finalText.trim().length > 0) {
      this.appendCaption({ Role: 'Assistant', Text: finalText });
      await this.relayTranscript('assistant', finalText);
    }
    if (this._connectionState$.value === 'speaking') {
      this._connectionState$.next('listening');
    }
  }

  /** Finalizes the user turn: push a caption + relay the final transcript. */
  private async onUserTranscript(transcript: string): Promise<void> {
    if (transcript.trim().length === 0) {
      return;
    }
    this.appendCaption({ Role: 'User', Text: transcript });
    await this.relayTranscript('user', transcript);
  }

  // ── Tool calling ───────────────────────────────────────────────────────────

  /**
   * Executes a provider tool call on the MJ server, then feeds the result back
   * to the model as a `function_call_output` and asks it to continue.
   */
  private async handleToolCall(call: OAIFunctionCallArgumentsDone): Promise<void> {
    this._connectionState$.next('thinking');
    try {
      const resultJson = await this.executeSessionTool(call.call_id, call.name, call.arguments);
      this.sendToolResult(call.call_id, resultJson);
    } catch (error) {
      console.error('[VoiceSession] Tool execution failed:', error);
      // Feed the error back so the model can narrate it rather than going silent.
      const errorJson = JSON.stringify({
        error: error instanceof Error ? error.message : String(error)
      });
      this.sendToolResult(call.call_id, errorJson);
    }
  }

  /** Calls the `ExecuteRealtimeSessionTool` mutation; returns the ResultJson string. */
  private async executeSessionTool(callId: string, toolName: string, argsJson: string): Promise<string> {
    if (!this.agentSessionId) {
      throw new Error('No active agent session for tool execution');
    }
    const mutation = `
      mutation ExecuteRealtimeSessionTool($agentSessionId: String!, $callId: String!, $toolName: String!, $argsJson: String!) {
        ExecuteRealtimeSessionTool(agentSessionId: $agentSessionId, callId: $callId, toolName: $toolName, argsJson: $argsJson)
      }
    `;
    const result = await this.gql().ExecuteGQL(mutation, {
      agentSessionId: this.agentSessionId,
      callId,
      toolName,
      argsJson
    });
    return (result?.ExecuteRealtimeSessionTool as string) ?? '{}';
  }

  /**
   * Sends the tool result back over the data channel as a function_call_output
   * conversation item, then triggers a new response so the model speaks it.
   */
  private sendToolResult(callId: string, resultJson: string): void {
    if (!this.dataChannel) {
      return;
    }
    this.sendEvent(this.dataChannel, {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: resultJson
      }
    });
    this.sendEvent(this.dataChannel, { type: 'response.create' });
    // We're back to the model producing audio.
    this._connectionState$.next('speaking');
  }

  // ── Transcript relay (GraphQL) ─────────────────────────────────────────────

  /** Relays a final transcript turn to MJ via `RelayRealtimeTranscript`. */
  private async relayTranscript(role: 'user' | 'assistant', text: string): Promise<void> {
    if (!this.agentSessionId) {
      return;
    }
    try {
      const mutation = `
        mutation RelayRealtimeTranscript($agentSessionId: String!, $role: String!, $text: String!) {
          RelayRealtimeTranscript(agentSessionId: $agentSessionId, role: $role, text: $text)
        }
      `;
      await this.gql().ExecuteGQL(mutation, {
        agentSessionId: this.agentSessionId,
        role,
        text
      });
    } catch (error) {
      console.error('[VoiceSession] Failed to relay transcript:', error);
    }
  }

  // ── Delegated-run progress streaming ───────────────────────────────────────

  /**
   * Subscribes to the server's push-status topic (scoped by the GraphQL transport
   * sessionId) to receive delegated-run progress for the active voice session.
   * Each matching event is surfaced on {@link DelegationProgress$} and narrated.
   */
  private subscribeDelegationProgress(): void {
    if (this.delegationProgressSub) {
      return; // already subscribed for this session
    }
    const transportSessionId = this.gql().sessionId;
    this.lastDelegationNarrationAt = 0;
    this.delegationProgressSub = this.gql()
      .PushStatusUpdates(transportSessionId)
      .subscribe({
        next: (raw: string) => this.onDelegationStatusMessage(raw),
        error: (err: unknown) => console.error('[VoiceSession] Delegation progress stream error:', err)
      });
  }

  /** Parses one push-status message and, if it's our delegation progress, dispatches it. */
  private onDelegationStatusMessage(raw: string): void {
    const progress = this.parseProgress(raw);
    if (progress) {
      this.dispatchProgress(progress);
    }
  }

  /**
   * Parses a push-status message and returns it only when it's a delegation
   * progress event for the active voice session — otherwise `null` (ignored).
   */
  private parseProgress(raw: string): VoiceDelegationProgress | null {
    let payload: RealtimeDelegationProgressPayload;
    try {
      payload = JSON.parse(raw) as RealtimeDelegationProgressPayload;
    } catch {
      return null; // non-JSON or unrelated frame
    }
    const matches =
      payload?.resolver === 'RealtimeClientSessionResolver' &&
      payload?.type === 'RealtimeDelegationProgress' &&
      payload?.agentSessionID === this.agentSessionId;
    if (!matches) {
      return null;
    }
    return {
      CallID: payload.callID,
      Step: payload.step,
      Message: payload.message,
      Percentage: payload.percentage
    };
  }

  /** Emits the progress to the UI observable and feeds it to the realtime model. */
  private dispatchProgress(progress: VoiceDelegationProgress): void {
    this._delegationProgress$.next(progress);
    this.narrateProgress(progress);
  }

  /**
   * Injects the progress into the model's context as a developer item every time,
   * then (throttled) asks the model to briefly voice a reassuring update so the
   * background work doesn't sit in silence — without chattering or interrupting.
   */
  private narrateProgress(progress: VoiceDelegationProgress): void {
    const channel = this.dataChannel;
    if (!channel) {
      return;
    }
    this.injectProgressContext(channel, progress.Message);
    if (this.shouldNarrateNow()) {
      this.lastDelegationNarrationAt = Date.now();
      this.requestProgressNarration(channel);
    }
  }

  /** Sends a developer-role context item describing the latest background progress. */
  private injectProgressContext(channel: RTCDataChannel, message: string): void {
    this.sendEvent(channel, {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'developer',
        content: [{ type: 'input_text', text: `[delegated-agent progress] ${message}` }]
      }
    });
  }

  /** Triggers a short, conservative spoken update about the background progress. */
  private requestProgressNarration(channel: RTCDataChannel): void {
    this.sendEvent(channel, {
      type: 'response.create',
      response: {
        instructions:
          'Briefly and naturally reassure the user about this background progress in one short sentence; skip if not helpful.'
      }
    });
  }

  /** True when the narration throttle window has elapsed since the last spoken update. */
  private shouldNarrateNow(): boolean {
    return Date.now() - this.lastDelegationNarrationAt >= VoiceSessionService.DelegationNarrationThrottleMs;
  }

  /** Tears down the delegation progress subscription and resets the narration throttle. */
  private teardownDelegationProgress(): void {
    if (this.delegationProgressSub) {
      this.delegationProgressSub.unsubscribe();
      this.delegationProgressSub = null;
    }
    this.lastDelegationNarrationAt = 0;
  }

  // ── Teardown ───────────────────────────────────────────────────────────────

  /**
   * Tears down all client resources and (optionally) closes the server session.
   * @param closeServerSession when true, calls `CloseAgentSession` on the server.
   */
  private async teardown(closeServerSession: boolean): Promise<void> {
    this.teardownDelegationProgress();

    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;

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

    if (closeServerSession && this.agentSessionId) {
      await this.closeServerSession(this.agentSessionId);
    }

    this.agentSessionId = null;
    this.sessionConfigJson = null;
    this.pendingAssistantText = '';
    this._active$.next(false);
    if (this._connectionState$.value !== 'error') {
      this._connectionState$.next('closed');
    }
  }

  /** Calls the `CloseAgentSession` mutation (provisioned in P4b). */
  private async closeServerSession(agentSessionId: string): Promise<void> {
    try {
      const mutation = `
        mutation CloseAgentSession($agentSessionId: String!) {
          CloseAgentSession(agentSessionId: $agentSessionId)
        }
      `;
      await this.gql().ExecuteGQL(mutation, { agentSessionId });
    } catch (error) {
      console.error('[VoiceSession] Failed to close server session:', error);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Serializes + sends an event object over the data channel. */
  private sendEvent(channel: RTCDataChannel, event: Record<string, unknown>): void {
    if (channel.readyState === 'open') {
      channel.send(JSON.stringify(event));
    }
  }

  /** Pushes a caption onto the live list (immutable update for change detection). */
  private appendCaption(caption: VoiceCaption): void {
    this._captions$.next([...this._captions$.value, caption]);
  }

  /** Resets reactive + internal state at the start of a session. */
  private resetState(): void {
    this._captions$.next([]);
    this.pendingAssistantText = '';
  }

  /** The GraphQL provider used for relay mutations. */
  private gql(): GraphQLDataProvider {
    return this.Provider as GraphQLDataProvider;
  }
}
