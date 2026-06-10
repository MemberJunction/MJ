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
 * The terminal result of a delegated tool call, emitted on {@link VoiceSessionService.DelegationResult$}
 * when the delegation finishes so the overlay can flip the "working" card into a result card with real
 * content + provenance.
 */
export interface VoiceDelegationResult {
  /** The `invoke-target-agent` call this result belongs to. */
  CallID: string;
  /** Whether the delegated work succeeded. */
  Success: boolean;
  /** The result text — the agent's output, or an error message on failure. */
  Output: string;
}

/**
 * One EPHEMERAL spoken narration of delegated-run progress, emitted on
 * {@link VoiceSessionService.DelegationNarration$}. These are the interim "here's what's
 * happening" utterances the realtime model speaks while a delegation runs. By product
 * decision they are NOT captions and NOT persisted as ConversationDetails — they exist
 * only as a live note in the overlay, replaced by each newer narration.
 */
export interface VoiceDelegationNarration {
  /** The narration transcript text. */
  Text: string;
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

/** A new response (turn) started — tracked so we never start a second overlapping response. */
interface OAIResponseCreated {
  type: 'response.created';
}

/** A full response (turn) completed — carries usage; ignored for the MVP. */
interface OAIResponseDone {
  type: 'response.done';
  response?: { usage?: Record<string, number> };
}

/**
 * WebRTC-only playback events: the client audio buffer started/stopped PLAYING.
 * Critical distinction from response.done (generation finished): audio plays at
 * realtime while generation runs ahead, so the model can be "idle" while speech
 * is still audibly coming out of the speaker.
 */
interface OAIOutputAudioBufferStarted {
  type: 'output_audio_buffer.started';
}
interface OAIOutputAudioBufferStopped {
  type: 'output_audio_buffer.stopped' | 'output_audio_buffer.cleared';
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
  | OAIResponseCreated
  | OAIResponseDone
  | OAIOutputAudioBufferStarted
  | OAIOutputAudioBufferStopped
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
  private _delegationResult$ = new Subject<VoiceDelegationResult>();
  private _delegationNarration$ = new Subject<VoiceDelegationNarration>();
  private _agentName$ = new BehaviorSubject<string>('Sage');

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
  /** Terminal result of a delegation, so the overlay can complete the working card with real content. */
  public readonly DelegationResult$: Observable<VoiceDelegationResult> = this._delegationResult$.asObservable();
  /**
   * EPHEMERAL spoken progress narrations (see {@link VoiceDelegationNarration}). These are
   * deliberately kept OUT of {@link Captions$} and never relayed/persisted — the overlay
   * renders them as a transient "live note" near the active working card.
   */
  public readonly DelegationNarration$: Observable<VoiceDelegationNarration> = this._delegationNarration$.asObservable();
  /** Display name of the agent the active session fronts (set at session start). */
  public readonly AgentName$: Observable<string> = this._agentName$.asObservable();

  /** Synchronous access to the display name of the agent the active session fronts. */
  public get CurrentAgentName(): string {
    return this._agentName$.value;
  }

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
  /**
   * Defer before SPEAKING a progress update. Fast agents (e.g. Sage answering in ~1-2s)
   * often return before an interim utterance would even finish — deferring lets the
   * result cancel a now-pointless narration; slower work still gets narrated.
   */
  private static readonly NarrationDeferMs = 1200;
  /** Pending (deferred) narration message — updated in place if newer progress arrives. */
  private pendingNarrationMessage: string | null = null;
  /**
   * Tool calls currently executing on the server. Progress events ride PubSub and can
   * lag the (fast) mutation result — any progress for a call NOT in this set is stale
   * (already completed) and is dropped, so we never narrate "starting up" after the
   * answer was already spoken.
   */
  private inFlightCallIds = new Set<string>();
  /**
   * True while the model's audio is audibly PLAYING in the browser (WebRTC
   * output_audio_buffer started/stopped). Narration must wait for this, not just
   * responseActive — generation finishes ahead of playback, and a narration queued
   * while speech is still playing comes out late and stale.
   */
  private audioPlaying = false;
  /** Timer for the deferred narration; cancelled when the delegation result lands first. */
  private narrationTimer: ReturnType<typeof setTimeout> | null = null;
  /** Active push-status subscription that feeds delegation progress; cleared on teardown. */
  private delegationProgressSub: Subscription | null = null;
  /** Timestamp (ms) of the last narration `response.create` we triggered; 0 = never. */
  private lastDelegationNarrationAt = 0;
  /** The last progress message we narrated, so we never repeat the same update. */
  private lastNarratedMessage = '';
  /** True while the model has a response in flight; gates narration + queues the tool result. */
  private responseActive = false;
  /** Set when a tool result is ready while a response is active; sent on the next response.done. */
  private pendingResultResponse = false;
  /**
   * Set by {@link requestProgressNarration} just before it sends its `response.create`,
   * and CONSUMED by the very next `response.created` frame, which stamps
   * {@link activeResponseKind} for that turn. Narration only fires while the model is idle
   * (`!responseActive`), so under normal ordering the next `response.created` is ours.
   */
  private pendingNarrationKind = false;
  /**
   * The kind of the response currently in flight. Event ordering (confirmed against the
   * handler flow): `response.created` → transcript deltas → `*_audio_transcript.done` →
   * `response.done`. The transcript-done frame therefore arrives while the kind is still
   * set, letting {@link onAssistantDone} classify the turn; `response.done` then resets
   * the kind to `'normal'`.
   */
  private activeResponseKind: 'normal' | 'narration' = 'normal';

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
   * @param agentName Optional display name of the target agent — resolved by the caller
   *   (which knows the conversation's routing context) and surfaced on {@link AgentName$}
   *   so ANY host (composer trigger, chat-area overlay) can render it without re-resolving.
   */
  public async StartVoiceSession(
    targetAgentId: string,
    conversationId?: string | null,
    lastSessionId?: string | null,
    agentName?: string | null
  ): Promise<void> {
    if (this.IsActive) {
      return; // a session is already running — ignore duplicate starts
    }

    if (agentName) {
      this._agentName$.next(agentName);
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

  /**
   * Inject a typed message into the live session as a user turn.
   *
   * Decomposed into three steps, each mirroring an existing voice path so the typed
   * turn behaves identically to a spoken one:
   *  1. Send a `conversation.item.create` `message` item (role 'user', `input_text`)
   *     over the data channel so the model treats the text as user input.
   *  2. Trigger a response the SAME way tool results do — {@link requestResultResponse} —
   *     so it queues behind any in-flight response (progress narration / prior turn)
   *     instead of colliding with a second `response.create`.
   *  3. Relay the turn through the same caption + transcript paths user speech uses
   *     ({@link onUserTranscript}) so it shows in the live thread AND persists to MJ.
   *
   * No-op when no session is open / the data channel isn't ready, or when the text is empty.
   */
  public SendText(text: string): void {
    const trimmed = text?.trim() ?? '';
    if (trimmed.length === 0) {
      return;
    }
    const channel = this.dataChannel;
    if (!channel || channel.readyState !== 'open') {
      return;
    }
    this.injectUserTextItem(channel, trimmed);
    this.requestResultResponse();
    // Relay as a user turn — same path spoken input uses (caption + persisted transcript).
    void this.onUserTranscript(trimmed);
  }

  /** Sends the typed text as a user-role `message` conversation item over the data channel. */
  private injectUserTextItem(channel: RTCDataChannel, text: string): void {
    this.sendEvent(channel, {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }]
      }
    });
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
      case 'response.created':
        this.responseActive = true;
        // Stamp the kind of THIS response: 'narration' only when the flag was set by
        // requestProgressNarration immediately before its response.create (consumed here).
        this.activeResponseKind = this.pendingNarrationKind ? 'narration' : 'normal';
        this.pendingNarrationKind = false;
        break;
      case 'output_audio_buffer.started':
        this.audioPlaying = true;
        break;
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        this.audioPlaying = false;
        if (this._connectionState$.value === 'speaking' && !this.responseActive) {
          this._connectionState$.next('listening');
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

  /**
   * Finalizes the assistant turn. Normal turns push a caption + relay (persist) the
   * transcript. NARRATION turns (interim delegated-progress speech triggered by
   * {@link requestProgressNarration}) are EPHEMERAL by product decision: they are emitted
   * on {@link DelegationNarration$} only — never a caption, never relayed/persisted.
   * The transcript-done frame arrives BEFORE `response.done`, so {@link activeResponseKind}
   * still reflects this turn's kind when we classify it here.
   */
  private async onAssistantDone(transcript: string): Promise<void> {
    const finalText = transcript || this.pendingAssistantText;
    this.pendingAssistantText = '';
    if (finalText.trim().length > 0) {
      if (this.activeResponseKind === 'narration') {
        this._delegationNarration$.next({ Text: finalText });
      } else {
        this.appendCaption({ Role: 'Assistant', Text: finalText });
        await this.relayTranscript('assistant', finalText);
      }
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
    this.inFlightCallIds.add(call.call_id);
    try {
      const resultJson = await this.executeSessionTool(call.call_id, call.name, call.arguments);
      this.emitDelegationResult(call.call_id, resultJson);
      this.sendToolResult(call.call_id, resultJson);
    } catch (error) {
      console.error('[VoiceSession] Tool execution failed:', error);
      // Feed the error back so the model can narrate it rather than going silent.
      const errorJson = JSON.stringify({
        error: error instanceof Error ? error.message : String(error)
      });
      this.emitDelegationResult(call.call_id, errorJson);
      this.sendToolResult(call.call_id, errorJson);
    }
  }

  /**
   * Emits a delegation result so the overlay's "working" card flips to a result card with real
   * content. Parses the broker's `{success, output}` | `{success:false, error}` shape; if it isn't
   * JSON, surfaces the raw string. Only delegation cards (created from progress events) react —
   * non-delegation tool results have no card and are harmlessly ignored downstream.
   */
  private emitDelegationResult(callId: string, resultJson: string): void {
    // The result will be spoken next — a deferred interim update is now pointless
    // (this is what keeps fast agents like Sage from narrating over their own answer),
    // and any progress still in the PubSub pipe for this call is stale.
    this.inFlightCallIds.delete(callId);
    this.cancelPendingNarration();
    let success = true;
    let output = '';
    try {
      const parsed = JSON.parse(resultJson) as { success?: boolean; output?: string; error?: string };
      success = parsed.success !== false;
      output = parsed.output ?? parsed.error ?? '';
    } catch {
      output = resultJson;
    }
    this._delegationResult$.next({ CallID: callId, Success: success, Output: output });
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
    this.requestResultResponse();
  }

  /**
   * Asks the model to speak the tool result — immediately if it's idle, otherwise queued
   * until the current response (e.g. a progress narration) finishes. Without this the
   * result's `response.create` would collide with an in-flight narration and be dropped,
   * leaving the model silent when the delegated work comes back.
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
    this._connectionState$.next('speaking');
  }

  /** On a turn completing, fire any queued tool-result response so the answer is spoken. */
  private flushPendingResultResponse(): void {
    if (!this.pendingResultResponse || !this.dataChannel) {
      return;
    }
    this.pendingResultResponse = false;
    this.responseActive = true;
    this.sendEvent(this.dataChannel, { type: 'response.create' });
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
    // Drop stale progress: PubSub delivery can lag the mutation result, so events for a
    // call that already completed (or was never seen) must not update cards or narrate.
    if (!this.inFlightCallIds.has(progress.CallID)) {
      return;
    }
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
    // Narrate only a genuinely-new update, throttled — so it conveys real status, not
    // robotic repeats. The actual utterance is DEFERRED (NarrationDeferMs) so a fast
    // result can cancel it; newer progress just refreshes the pending message.
    if (progress.Message === this.lastNarratedMessage || !this.shouldNarrateNow()) {
      return;
    }
    this.pendingNarrationMessage = progress.Message;
    if (!this.narrationTimer) {
      this.narrationTimer = setTimeout(() => this.fireDeferredNarration(), VoiceSessionService.NarrationDeferMs);
    }
  }

  /** Speaks the deferred progress update — unless it was cancelled or the model is busy. */
  private fireDeferredNarration(): void {
    this.narrationTimer = null;
    const message = this.pendingNarrationMessage;
    this.pendingNarrationMessage = null;
    const channel = this.dataChannel;
    // Checked at fire time (not schedule time): the model may have gone busy/idle during
    // the defer window. audioPlaying matters as much as responseActive — generation ends
    // before playback does, and a narration issued while speech is still playing queues
    // behind it and comes out late/stale. Skipping is safe: the next progress event
    // re-schedules, and if none comes the work is done and silence is correct.
    if (!message || !channel || this.responseActive || this.audioPlaying || message === this.lastNarratedMessage) {
      return;
    }
    this.lastNarratedMessage = message;
    this.lastDelegationNarrationAt = Date.now();
    this.requestProgressNarration(channel, message);
  }

  /** Cancels any deferred narration — the result is about to be spoken, so it's moot. */
  private cancelPendingNarration(): void {
    if (this.narrationTimer) {
      clearTimeout(this.narrationTimer);
      this.narrationTimer = null;
    }
    this.pendingNarrationMessage = null;
  }

  /** Sends a system-role context item describing the latest background progress.
   *  NOTE: role must be 'system' — gpt-realtime rejects 'developer' items
   *  ("Developer messages are only supported for quicksilver sessions"). */
  private injectProgressContext(channel: RTCDataChannel, message: string): void {
    this.sendEvent(channel, {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'system',
        content: [{ type: 'input_text', text: `[delegated-agent progress] ${message}` }]
      }
    });
  }

  /**
   * Triggers a short spoken update that conveys THIS specific progress message naturally.
   * Marks the upcoming response as 'narration' (flag consumed by the next `response.created`)
   * so its transcript is treated as EPHEMERAL — surfaced on {@link DelegationNarration$}
   * instead of becoming a caption / persisted ConversationDetail.
   */
  private requestProgressNarration(channel: RTCDataChannel, message: string): void {
    this.responseActive = true;
    this.pendingNarrationKind = true;
    this.sendEvent(channel, {
      type: 'response.create',
      response: {
        instructions:
          `Progress on the work YOU are doing for the user: "${message}". ` +
          `Say ONE short, natural sentence about what you are doing right now, strictly in the first person ` +
          `("I'm…"). Example: if the progress says "Analyzing the request", say "I'm looking at that now" — ` +
          `NOT "It's analyzing" or "Sage is analyzing". The words "it" and the agent's name must not be the ` +
          `subject of your sentence. Do not repeat earlier updates and never say generic filler like ` +
          `"it's still running in the background".`
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
    this.cancelPendingNarration();
    this.inFlightCallIds.clear();
    this.audioPlaying = false;
    this.lastDelegationNarrationAt = 0;
    this.lastNarratedMessage = '';
    this.responseActive = false;
    this.pendingResultResponse = false;
    this.pendingNarrationKind = false;
    this.activeResponseKind = 'normal';
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
