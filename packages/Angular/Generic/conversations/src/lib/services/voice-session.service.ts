import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { Metadata, IMetadataProvider } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJGlobal } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, JSONObject } from '@memberjunction/ai';
import {
  BaseRealtimeClient,
  LoadGeminiRealtimeClient,
  LoadOpenAIRealtimeClient,
  RealtimeClientError,
  RealtimeClientState,
  RealtimeClientToolCall,
  RealtimeClientTranscript
} from '@memberjunction/ai-realtime-client';
import { BuildNarrationInstructions } from './narration-template';

// Tree-shaking prevention: the OpenAI client is resolved dynamically through the
// ClassFactory (by the server-reported Provider key), so this static call is what keeps
// its @RegisterClass side effect from being eliminated by the bundler.
LoadOpenAIRealtimeClient();
LoadGeminiRealtimeClient();

/**
 * Connection / turn state for a real-time voice session, surfaced to the UI overlay.
 * - `connecting`  — negotiating the session + provider handshake
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
 * The browser uses these values to open a client-direct realtime session.
 */
interface StartRealtimeClientSessionResult {
  AgentSessionId: string;
  ConversationId: string | null;
  Provider: string;
  Model: string;
  EphemeralToken: string;
  ExpiresAt: string;
  /** JSON.stringify of the provider session config (instructions + tools) to apply at connect. */
  SessionConfigJson: string;
  /** Display name of the realtime model the session uses (e.g. "GPT Realtime 2"). Null when unknown. */
  ModelName: string | null;
  /**
   * DB-driven progress-narration instruction template (contains a `{{ progressMessage }}`
   * placeholder). Null when the deployment hasn't synced the narration prompt — the client
   * falls back to its built-in wording.
   */
  NarrationInstructionsTemplate: string | null;
}

/**
 * Drives a **client-direct** real-time voice session: the browser mints an ephemeral
 * token from the MJ server, then connects DIRECTLY to the realtime provider. Audio
 * frames never transit the MJ server (low latency); only tool calls and final
 * transcripts are relayed back to MJ over GraphQL.
 *
 * This service is PROVIDER-AGNOSTIC policy/orchestration. All provider wire concerns
 * (transport, event translation, the response state machine, narration-kind tagging,
 * playback tracking) live in a {@link BaseRealtimeClient} driver resolved through the
 * MJ ClassFactory by the server-reported `Provider` key (e.g. `'openai'` →
 * `OpenAIRealtimeClient`). Future providers (Gemini Live, …) snap in by registering a
 * new driver — this service does not change.
 *
 * The Voice Co-Agent (server-side) fronts the conversation's current agent — the server
 * bakes the companion instructions + tool set into `SessionConfigJson`, which the client
 * driver applies verbatim.
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
  private _modelName$ = new BehaviorSubject<string | null>(null);

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
  /**
   * Display name of the realtime MODEL the active session runs on (server-reported at session
   * start, e.g. "GPT Realtime 2"). `null` before a session starts / when the server didn't report
   * one. The overlay banner shows it subtly next to the agent identity.
   */
  public readonly ModelName$: Observable<string | null> = this._modelName$.asObservable();

  /** Synchronous access to the display name of the agent the active session fronts. */
  public get CurrentAgentName(): string {
    return this._agentName$.value;
  }

  // ── Session internals ──────────────────────────────────────────────────────
  /** The provider-direct realtime client driving the live session (ClassFactory-resolved). */
  private client: BaseRealtimeClient | null = null;
  /** The mic capture stream — acquired here (permission UX) and handed to the client. */
  private localStream: MediaStream | null = null;
  private agentSessionId: string | null = null;
  /**
   * The DB-driven narration instruction template (server-resolved at session start, containing a
   * `{{ progressMessage }}` placeholder). `null` when the deployment hasn't synced the narration
   * prompt — {@link buildNarrationInstructions} then falls back to the built-in wording.
   */
  private narrationTemplate: string | null = null;

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
  /** Timer for the deferred narration; cancelled when the delegation result lands first. */
  private narrationTimer: ReturnType<typeof setTimeout> | null = null;
  /** Active push-status subscription that feeds delegation progress; cleared on teardown. */
  private delegationProgressSub: Subscription | null = null;
  /** Timestamp (ms) of the last narration we triggered; 0 = never. */
  private lastDelegationNarrationAt = 0;
  /** The last progress message we narrated, so we never repeat the same update. */
  private lastNarratedMessage = '';

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
   * @param preferredModelId Optional EXPLICIT realtime model choice (`MJ: AI Models.ID`). When
   *   set, the server uses exactly that model and FAILS with a clear reason if it can't (no
   *   silent fallback). Omit for the server's automatic (highest-PowerRank) selection.
   */
  public async StartVoiceSession(
    targetAgentId: string,
    conversationId?: string | null,
    lastSessionId?: string | null,
    agentName?: string | null,
    preferredModelId?: string | null
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
      const session = await this.mintSession(targetAgentId, conversationId, lastSessionId, preferredModelId);
      this.agentSessionId = session.AgentSessionId;
      this.narrationTemplate = session.NarrationInstructionsTemplate ?? null;
      this._modelName$.next(session.ModelName ?? null);

      const client = this.createRealtimeClient(session.Provider);
      this.client = client;
      this.wireClientHandlers(client);

      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      await client.Connect(this.buildClientConfig(session), this.localStream);

      this.subscribeDelegationProgress();
      // State advances to 'listening' once the provider control channel opens
      // (driven by the client's OnStateChange events).
    } catch (error) {
      console.error('[VoiceSession] Failed to start session:', error);
      this._connectionState$.next('error');
      await this.teardown(false);
    }
  }

  /**
   * End the active session: stop the mic, tear down the provider connection, and close
   * the server-side agent session. Safe to call when no session is active.
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
   * Decomposed into two steps, each mirroring an existing voice path so the typed
   * turn behaves identically to a spoken one:
   *  1. {@link BaseRealtimeClient.SendText} injects the text as user input and triggers a
   *     reply through the SAME collision-safe path tool results use — so it queues behind
   *     any in-flight response (progress narration / prior turn) instead of colliding.
   *  2. Relay the turn through the same caption + transcript paths user speech uses
   *     ({@link onUserTranscript}) so it shows in the live thread AND persists to MJ.
   *
   * No-op when no session is open / the control channel isn't ready, or when the text is empty.
   */
  public SendText(text: string): void {
    const trimmed = text?.trim() ?? '';
    if (trimmed.length === 0) {
      return;
    }
    const client = this.client;
    if (!client || !this.isSessionLive()) {
      return;
    }
    client.SendText(trimmed);
    // Relay as a user turn — same path spoken input uses (caption + persisted transcript).
    void this.onUserTranscript(trimmed);
  }

  /** Mute / unmute the local microphone track. Returns the new muted state. */
  public ToggleMute(): boolean {
    const tracks = this.localStream?.getAudioTracks() ?? [];
    if (tracks.length === 0) {
      return false;
    }
    const muted = tracks[0].enabled; // currently enabled → becomes muted
    this.client?.SetMuted(muted);
    return muted;
  }

  // ── Realtime client resolution + wiring ────────────────────────────────────

  /**
   * Resolves the provider-direct realtime client for `provider` through the MJ
   * ClassFactory — the client-side mirror of how server drivers are resolved from
   * `BaseRealtimeModel`. Throws a clear error when no driver is registered for the
   * provider (e.g. its Load function was never called).
   */
  private createRealtimeClient(provider: string): BaseRealtimeClient {
    const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseRealtimeClient, provider);
    if (!registration) {
      throw new Error(
        `No realtime client registered for provider '${provider}'. ` +
          `Ensure the provider's client driver package is imported and its Load function called.`
      );
    }
    const client = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeClient>(BaseRealtimeClient, provider);
    if (!client) {
      throw new Error(`Failed to instantiate the realtime client for provider '${provider}'`);
    }
    return client;
  }

  /** Builds the client-direct session config the realtime client connects with. */
  private buildClientConfig(session: StartRealtimeClientSessionResult): ClientRealtimeSessionConfig {
    return {
      Provider: session.Provider,
      Model: session.Model,
      EphemeralToken: session.EphemeralToken,
      ExpiresAt: session.ExpiresAt,
      SessionConfig: this.parseSessionConfig(session.SessionConfigJson)
    };
  }

  /**
   * Parses the server-built session config JSON. On failure, logs and returns an empty
   * object — the client treats an empty config as "nothing to apply", so the session
   * still opens (mirroring the prior behavior of skipping the config update).
   */
  private parseSessionConfig(sessionConfigJson: string | null): JSONObject {
    if (!sessionConfigJson) {
      return {};
    }
    try {
      return JSON.parse(sessionConfigJson) as JSONObject;
    } catch (error) {
      console.error('[VoiceSession] Failed to parse/apply SessionConfigJson:', error);
      return {};
    }
  }

  /** Subscribes this service's policy handlers to the realtime client's events. */
  private wireClientHandlers(client: BaseRealtimeClient): void {
    client.OnStateChange((state: RealtimeClientState) => this.onClientStateChange(state));
    client.OnTranscript((transcript: RealtimeClientTranscript) => {
      void this.onClientTranscript(transcript);
    });
    client.OnToolCall((call: RealtimeClientToolCall) => {
      void this.handleToolCall(call);
    });
    client.OnError((error: RealtimeClientError) => {
      console.error('[VoiceSession] Provider error event:', error);
    });
  }

  /** Maps a client state event onto the UI connection state. */
  private onClientStateChange(state: RealtimeClientState): void {
    const mapped = this.mapClientState(state);
    if (mapped) {
      this._connectionState$.next(mapped);
    }
  }

  /**
   * Translates {@link RealtimeClientState} into {@link VoiceConnectionState}. `'connected'`
   * is suppressed (the UI stays 'connecting' until the control channel opens → 'listening'),
   * and `'closed'` never overwrites a terminal 'error' the service itself recorded.
   */
  private mapClientState(state: RealtimeClientState): VoiceConnectionState | null {
    switch (state) {
      case 'connecting':
        return 'connecting';
      case 'connected':
        return null;
      case 'listening':
        return 'listening';
      case 'speaking':
        return 'speaking';
      case 'error':
        return 'error';
      case 'closed':
        return this._connectionState$.value === 'error' ? null : 'closed';
    }
  }

  /** True when the live control channel is usable (open and not torn down / failed). */
  private isSessionLive(): boolean {
    const state = this._connectionState$.value;
    return state === 'listening' || state === 'speaking' || state === 'thinking';
  }

  // ── Transcript policy ──────────────────────────────────────────────────────

  /**
   * Applies transcript policy to client transcript events. Interim deltas are ignored
   * (the client already drives the speaking state). Final NORMAL assistant turns become
   * captions + persisted transcripts; final NARRATION turns are EPHEMERAL by product
   * decision — emitted on {@link DelegationNarration$} only, never a caption, never
   * relayed/persisted. User turns ride the caption + relay path.
   */
  private async onClientTranscript(transcript: RealtimeClientTranscript): Promise<void> {
    if (!transcript.IsFinal) {
      return;
    }
    if (transcript.Role === 'Assistant') {
      if (transcript.Kind === 'narration') {
        this._delegationNarration$.next({ Text: transcript.Text });
      } else {
        this.appendCaption({ Role: 'Assistant', Text: transcript.Text });
        await this.relayTranscript('assistant', transcript.Text);
      }
    } else {
      await this.onUserTranscript(transcript.Text);
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
   * Executes a provider tool call on the MJ server, then feeds the result back to the
   * model via {@link BaseRealtimeClient.SendToolResult} so it speaks the outcome.
   */
  private async handleToolCall(call: RealtimeClientToolCall): Promise<void> {
    this._connectionState$.next('thinking');
    this.inFlightCallIds.add(call.CallID);
    try {
      const resultJson = await this.executeSessionTool(call.CallID, call.ToolName, call.ArgumentsJson);
      this.emitDelegationResult(call.CallID, resultJson);
      this.client?.SendToolResult(call.CallID, resultJson);
    } catch (error) {
      console.error('[VoiceSession] Tool execution failed:', error);
      // Feed the error back so the model can narrate it rather than going silent.
      const errorJson = JSON.stringify({
        error: error instanceof Error ? error.message : String(error)
      });
      this.emitDelegationResult(call.CallID, errorJson);
      this.client?.SendToolResult(call.CallID, errorJson);
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

  // ── Session minting (GraphQL) ──────────────────────────────────────────────

  /** Calls the `StartRealtimeClientSession` mutation to obtain an ephemeral token + config. */
  private async mintSession(
    targetAgentId: string,
    conversationId?: string | null,
    lastSessionId?: string | null,
    preferredModelId?: string | null
  ): Promise<StartRealtimeClientSessionResult> {
    const mutation = `
      mutation StartRealtimeClientSession($targetAgentId: String!, $conversationId: String, $lastSessionId: String, $preferredModelId: String) {
        StartRealtimeClientSession(targetAgentId: $targetAgentId, conversationId: $conversationId, lastSessionId: $lastSessionId, preferredModelId: $preferredModelId) {
          AgentSessionId
          ConversationId
          Provider
          Model
          EphemeralToken
          ExpiresAt
          SessionConfigJson
          ModelName
          NarrationInstructionsTemplate
        }
      }
    `;
    const variables = {
      targetAgentId,
      conversationId: conversationId ?? null,
      lastSessionId: lastSessionId ?? null,
      preferredModelId: preferredModelId ?? null
    };
    const result = await this.gql().ExecuteGQL(mutation, variables);
    const payload = result?.StartRealtimeClientSession as StartRealtimeClientSessionResult | undefined;
    if (!payload?.EphemeralToken) {
      throw new Error('StartRealtimeClientSession returned no ephemeral token');
    }
    return payload;
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
   * Injects the progress into the model's context as a background note every time,
   * then (throttled) asks the model to briefly voice a reassuring update so the
   * background work doesn't sit in silence — without chattering or interrupting.
   */
  private narrateProgress(progress: VoiceDelegationProgress): void {
    const client = this.client;
    if (!client) {
      return;
    }
    client.SendContextNote(`[delegated-agent progress] ${progress.Message}`);
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
    const client = this.client;
    // Checked at fire time (not schedule time): the model may have gone busy/idle during
    // the defer window. IsAudioPlaying matters as much as IsBusy — generation ends
    // before playback does, and a narration issued while speech is still playing queues
    // behind it and comes out late/stale. Skipping is safe: the next progress event
    // re-schedules, and if none comes the work is done and silence is correct.
    if (!message || !client || client.IsBusy || client.IsAudioPlaying || message === this.lastNarratedMessage) {
      return;
    }
    this.lastNarratedMessage = message;
    this.lastDelegationNarrationAt = Date.now();
    client.RequestSpokenUpdate(this.buildNarrationInstructions(message));
  }

  /** Cancels any deferred narration — the result is about to be spoken, so it's moot. */
  private cancelPendingNarration(): void {
    if (this.narrationTimer) {
      clearTimeout(this.narrationTimer);
      this.narrationTimer = null;
    }
    this.pendingNarrationMessage = null;
  }

  /**
   * Builds the one-off instructions for a short spoken update that conveys THIS specific
   * progress message naturally — strictly first person, since the co-agent owns the work.
   * The wording is DB-driven: the server-resolved `Voice Co-Agent - Progress Narration`
   * template (substituting `{{ progressMessage }}`) when present, otherwise the built-in
   * fallback so deployments that haven't synced the prompt behave exactly as before.
   * The client tags the resulting turn as narration, keeping it EPHEMERAL — surfaced on
   * {@link DelegationNarration$} instead of becoming a caption / persisted ConversationDetail.
   */
  private buildNarrationInstructions(message: string): string {
    return BuildNarrationInstructions(this.narrationTemplate, message);
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
    this.lastDelegationNarrationAt = 0;
    this.lastNarratedMessage = '';
  }

  // ── Teardown ───────────────────────────────────────────────────────────────

  /**
   * Tears down all client resources and (optionally) closes the server session.
   * @param closeServerSession when true, calls `CloseAgentSession` on the server.
   */
  private async teardown(closeServerSession: boolean): Promise<void> {
    this.teardownDelegationProgress();

    // Defensive: stop the mic even when Connect never ran (the client also stops the
    // tracks it was handed — track.stop() is idempotent).
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;

    if (this.client) {
      await this.client.Disconnect();
      this.client = null;
    }

    if (closeServerSession && this.agentSessionId) {
      await this.closeServerSession(this.agentSessionId);
    }

    this.agentSessionId = null;
    this.narrationTemplate = null;
    this._modelName$.next(null);
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

  /** Pushes a caption onto the live list (immutable update for change detection). */
  private appendCaption(caption: VoiceCaption): void {
    this._captions$.next([...this._captions$.value, caption]);
  }

  /** Resets reactive + internal state at the start of a session. */
  private resetState(): void {
    this._captions$.next([]);
  }

  /** The GraphQL provider used for relay mutations. */
  private gql(): GraphQLDataProvider {
    return this.Provider as GraphQLDataProvider;
  }
}
