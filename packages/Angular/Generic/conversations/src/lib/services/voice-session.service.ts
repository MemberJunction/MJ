import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { Metadata, IMetadataProvider, RunView } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJGlobal } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, JSONObject, RealtimeToolDefinition } from '@memberjunction/ai';
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
import { ParseDelegationResultJson, ParsedDelegationArtifact } from './delegation-result-parser';
import { BaseRealtimeChannelClient, RealtimeChannelContext } from '../components/realtime/channels/base-realtime-channel-client';

// Tree-shaking prevention: the OpenAI client is resolved dynamically through the
// ClassFactory (by the server-reported Provider key), so this static call is what keeps
// its @RegisterClass side effect from being eliminated by the bundler.
// NOTE: the interactive-channel plugins (resolved dynamically from the `MJ: AI Agent
// Channels` registry by ClientPluginClass key) get the same treatment, but their Load
// calls live in `conversations.module.ts` — plugins carry Angular surface COMPONENTS,
// and this service stays component-free (it must stay importable in plain-node tests).
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
  /**
   * ID of the delegated agent run (`MJ: AI Agent Runs`) when the server reported one
   * (`runId` in the tool ResultJson). Powers the overlay's gear-gated "Open run" dev link.
   */
  RunID?: string;
  /**
   * Artifacts the delegated run produced, when the server reported any (`artifacts` in the
   * tool ResultJson). The overlay's tabbed surface panel auto-opens one artifact tab per
   * entry and focuses the newest on arrival.
   */
  Artifacts?: ParsedDelegationArtifact[];
}

/**
 * Handler for a CLIENT-EXECUTED UI tool (e.g. the live whiteboard's `Whiteboard_*` surface),
 * registered via {@link VoiceSessionService.RegisterClientToolHandler}. Receives the tool name +
 * raw arguments JSON from the realtime model and returns the result JSON string fed back as the
 * `tool_response`. May be sync or async; thrown errors are wrapped into a
 * `{ success: false, error }` payload by the service so the model can narrate the failure.
 */
export type VoiceClientToolHandler = (toolName: string, argsJson: string) => string | Promise<string>;

/**
 * A channel's request to enter / leave the FOCUS layout, emitted on
 * {@link VoiceSessionService.ChannelFocus$} when a plugin calls its context's
 * `SetFocusMode`. The overlay shell subscribes: it collapses/restores the main call column
 * and remembers which channel holds focus (so the floating pill's "exit" can be routed
 * back via {@link BaseRealtimeChannelClient.RequestFocusExit}).
 */
export interface RealtimeChannelFocusEvent {
  /** The channel plugin requesting the layout change. */
  Channel: BaseRealtimeChannelClient;
  /** `true` to enter focus mode (surface owns the screen), `false` to leave it. */
  Focused: boolean;
}

/**
 * The narrow projection of an ACTIVE `MJ: AI Agent Channels` registry row the service
 * loads at session start (read-only lookup — `ResultType: 'simple'`, narrowed Fields).
 */
interface RealtimeChannelDefinitionRow {
  ID: string;
  Name: string;
  ClientPluginClass: string;
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
  /**
   * JSON map of the PRIOR session's saved channel states keyed by channel name (present only
   * when the start carried `lastSessionId` and the prior session — owned by the same user —
   * had saved states). Applied to the matching channel plugins via
   * {@link BaseRealtimeChannelClient.RestoreState} so e.g. the whiteboard resumes where the
   * last session left off.
   */
  PriorChannelStatesJson: string | null;
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
  private _minimized$ = new BehaviorSubject<boolean>(false);
  private _activeChannels$ = new BehaviorSubject<BaseRealtimeChannelClient[]>([]);
  private _channelFocus$ = new Subject<RealtimeChannelFocusEvent>();

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

  /**
   * True while the active call overlay is MINIMIZED to the host's floating "on call" pill
   * (e.g. after a dev link navigated away). The mic and session stay fully live — this is
   * pure presentation state, reset to `false` at session start and teardown.
   */
  public readonly Minimized$: Observable<boolean> = this._minimized$.asObservable();

  /**
   * The session's ACTIVE interactive-channel plugins, resolved from the `MJ: AI Agent
   * Channels` registry at session start (one instance per session, per channel). Emits
   * `[]` before a session starts and after teardown. The overlay subscribes to register
   * one surface tab per plugin — it never knows any concrete channel type.
   */
  public readonly ActiveChannels$: Observable<BaseRealtimeChannelClient[]> = this._activeChannels$.asObservable();

  /**
   * Channel requests to enter / leave the FOCUS layout (see
   * {@link RealtimeChannelFocusEvent}). Fired when a plugin calls its host context's
   * `SetFocusMode` — e.g. the whiteboard's "Focus board" toggle.
   */
  public readonly ChannelFocus$: Observable<RealtimeChannelFocusEvent> = this._channelFocus$.asObservable();

  /** Synchronous access to the session's active interactive-channel plugins. */
  public get ActiveChannels(): readonly BaseRealtimeChannelClient[] {
    return this._activeChannels$.value;
  }

  /** Synchronous access to the display name of the agent the active session fronts. */
  public get CurrentAgentName(): string {
    return this._agentName$.value;
  }

  /**
   * ID of the active server-side agent session (`MJ: AI Agent Sessions`), or `null` when no
   * session is open / the session hasn't been minted yet. Powers the overlay's gear-gated
   * "Open session" dev link.
   */
  public get CurrentAgentSessionId(): string | null {
    return this.agentSessionId;
  }

  /** Synchronous access to the minimized presentation state. */
  public get IsMinimized(): boolean {
    return this._minimized$.value;
  }

  /**
   * Minimizes / restores the active call overlay (host renders the floating pill while
   * minimized). Presentation-only — the live audio session is untouched.
   */
  public SetMinimized(minimized: boolean): void {
    if (this._minimized$.value !== minimized) {
      this._minimized$.next(minimized);
    }
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
  /** First spoken update fires no earlier than this long after delegated work starts. */
  private static readonly FirstNarrationDelayMs = 5000;
  /** Minimum gap between SUBSEQUENT spoken updates (the 7–10s band; floods aggregate). */
  private static readonly NarrationIntervalMs = 8000;
  /** Retry delay when the fire moment finds the model busy / audio still playing. */
  private static readonly NarrationBusyRetryMs = 1500;
  /** Max progress messages aggregated into one spoken digest. */
  private static readonly MaxDigestMessages = 4;
  /** Max prior spoken narrations chained into the instructions (anti-repetition). */
  private static readonly MaxPriorNarrations = 3;
  /**
   * Aggregation buffer: distinct progress messages since the last spoken update (oldest
   * first, capped at {@link VoiceSessionService.MaxDigestMessages}). A flood of small
   * updates becomes ONE digest; the buffer is discarded when the result lands first.
   */
  private pendingNarrationMessages: string[] = [];
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
  /** When the current delegation burst began (first in-flight call); anchors the 5s first update. */
  private delegationBurstStartedAt = 0;
  /** Spoken updates so far in this burst (1-based numbering for the instructions). */
  private narrationCount = 0;
  /** What the model actually SAID for prior updates this burst — chained in so it never repeats itself. */
  private spokenNarrations: string[] = [];
  /** Tail message of the last digest, so an identical trailing progress event isn't re-buffered. */
  private lastNarratedTail = '';

  /**
   * Registry of CLIENT-EXECUTED UI tool handlers, keyed by tool-name prefix (e.g.
   * `'Whiteboard_'`). Tool calls whose name matches a registered prefix run LOCALLY through the
   * handler (never relayed to the server); everything else takes the standard server-relay path.
   * Cleared at teardown.
   */
  private clientToolHandlers = new Map<string, VoiceClientToolHandler>();

  // ── Interactive channels (registry-resolved plugins) ───────────────────────
  /** Debounce window for persisting a channel's state of record after a change burst. */
  private static readonly ChannelSaveDebounceMs = 3000;
  /**
   * Pending DEBOUNCED channel-state saves, keyed by channel name. Each entry keeps the
   * LATEST serialized state plus the session id captured while the session was live —
   * the teardown flush runs as the live id is being torn down, so the capture guarantees
   * the final save still lands on the just-closed session.
   */
  private pendingChannelSaves = new Map<string, {
    Timer: ReturnType<typeof setTimeout>;
    StateJson: string;
    SessionID: string | null;
  }>();

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
   * @param clientTools Optional EXTRA client-executed UI tool declarations to expose to the
   *   realtime model alongside the server's stable tool set and the interactive-channel
   *   tools (which are aggregated automatically from the registry-resolved plugins — see
   *   {@link ActiveChannels$}). The server only DECLARES these — execution stays in the
   *   browser via handlers registered with {@link RegisterClientToolHandler}. This is an
   *   extension point for hosts with bespoke (non-channel) UI tools; most callers omit it.
   * @param coAgentId Optional EXPLICIT co-agent choice (`MJ: AI Agents.ID` of an Active,
   *   Realtime-type agent) — the highest-precedence step of the server's co-agent resolution
   *   chain. When set, the server uses exactly that co-agent and FAILS with a clear reason if
   *   it can't (no silent fallback). Omit to let server metadata drive the choice: the target
   *   agent's `DefaultCoAgentID`, then its agent type's, then the global Voice Co-Agent.
   */
  public async StartVoiceSession(
    targetAgentId: string,
    conversationId?: string | null,
    lastSessionId?: string | null,
    agentName?: string | null,
    preferredModelId?: string | null,
    clientTools?: RealtimeToolDefinition[] | null,
    coAgentId?: string | null
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
      // Resolve + initialize the interactive-channel plugins FIRST: their client-executed
      // tool sets must be declared to the realtime model at session mint.
      const allClientTools = [...(clientTools ?? []), ...(await this.startChannels())];
      const session = await this.mintSession(targetAgentId, conversationId, lastSessionId, preferredModelId, allClientTools, coAgentId);
      this.agentSessionId = session.AgentSessionId;
      this.narrationTemplate = session.NarrationInstructionsTemplate ?? null;
      this._modelName$.next(session.ModelName ?? null);
      // Resume continuity: rehydrate channel plugins from the PRIOR session's saved states
      // (e.g. the whiteboard) BEFORE any surface binds — tolerant, never blocks the start.
      this.applyPriorChannelStates(session.PriorChannelStatesJson);

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

  // ── Client-executed UI tools ───────────────────────────────────────────────

  /**
   * Registers a handler for CLIENT-EXECUTED UI tools whose names start with `toolNamePrefix`
   * (e.g. `'Whiteboard_'` → all `Whiteboard_*` calls). Matching tool calls execute LOCALLY via
   * the handler — they are never relayed to the server — and the handler's result JSON is sent
   * back to the model as the `tool_response`. Re-registering the same prefix replaces the
   * handler. The registry is cleared at session teardown.
   */
  public RegisterClientToolHandler(toolNamePrefix: string, handler: VoiceClientToolHandler): void {
    this.clientToolHandlers.set(toolNamePrefix, handler);
  }

  /** Removes the handler registered for `toolNamePrefix` (no-op when none is registered). */
  public UnregisterClientToolHandler(toolNamePrefix: string): void {
    this.clientToolHandlers.delete(toolNamePrefix);
  }

  /**
   * Feeds a background context note into the live model (no spoken reply is requested) — the
   * perception channel interactive surfaces use (e.g. the whiteboard's coalesced scene deltas).
   * No-op when no session is live.
   */
  public SendContextNote(text: string): void {
    const trimmed = text?.trim() ?? '';
    if (trimmed.length === 0 || !this.client || !this.isSessionLive()) {
      return;
    }
    this.client.SendContextNote(trimmed);
  }

  // ── Interactive channels (registry-driven plugins) ─────────────────────────

  /**
   * Resolves, instantiates and initializes the session's interactive-channel plugins from
   * the `MJ: AI Agent Channels` registry, publishes them on {@link ActiveChannels$}, and
   * returns their aggregated client-executed tool declarations for the session mint.
   * Tolerant by design: registry/resolution failures degrade to "no channels" — the voice
   * session itself always proceeds.
   */
  private async startChannels(): Promise<RealtimeToolDefinition[]> {
    const channels = await this.loadActiveChannels();
    for (const plugin of channels) {
      this.initializeChannel(plugin);
    }
    this._activeChannels$.next(channels);
    return channels.flatMap(plugin => plugin.GetToolDefinitions());
  }

  /**
   * Loads the ACTIVE channel definitions from the registry and resolves each row's
   * `ClientPluginClass` through the MJ ClassFactory into a per-session plugin instance —
   * the client-side mirror of how realtime-model drivers resolve from `BaseRealtimeModel`
   * / `BaseRealtimeClient`. Rows whose plugin class isn't registered are skipped (logged),
   * never fatal.
   */
  private async loadActiveChannels(): Promise<BaseRealtimeChannelClient[]> {
    const rows = await this.fetchChannelDefinitions();
    const channels: BaseRealtimeChannelClient[] = [];
    for (const row of rows) {
      const plugin = this.resolveChannelPlugin(row);
      if (plugin) {
        channels.push(plugin);
      }
    }
    return channels;
  }

  /**
   * Reads the ACTIVE `MJ: AI Agent Channels` rows (read-only lookup: simple results,
   * narrowed fields). Failures are logged and degrade to an empty list — channel
   * availability must never block the voice session.
   */
  private async fetchChannelDefinitions(): Promise<RealtimeChannelDefinitionRow[]> {
    try {
      const rv = RunView.FromMetadataProvider(this.Provider);
      const result = await rv.RunView<RealtimeChannelDefinitionRow>({
        EntityName: 'MJ: AI Agent Channels',
        ExtraFilter: 'IsActive = 1',
        Fields: ['ID', 'Name', 'ClientPluginClass'],
        ResultType: 'simple'
      });
      if (!result.Success) {
        console.warn('[VoiceSession] Failed to load channel registry:', result.ErrorMessage);
        return [];
      }
      return result.Results ?? [];
    } catch (error) {
      console.warn('[VoiceSession] Channel registry unavailable — starting with no channels:', error);
      return [];
    }
  }

  /**
   * Resolves one registry row's `ClientPluginClass` via the ClassFactory (registration
   * checked first, exactly like the realtime-client drivers) and instantiates a fresh
   * per-session plugin. Returns `null` (logged) when no plugin is registered for the key
   * — e.g. its Load function was never called or the package isn't included client-side.
   */
  private resolveChannelPlugin(row: RealtimeChannelDefinitionRow): BaseRealtimeChannelClient | null {
    const key = row.ClientPluginClass?.trim();
    if (!key) {
      console.warn(`[VoiceSession] Channel '${row.Name}' has no ClientPluginClass — skipping.`);
      return null;
    }
    const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseRealtimeChannelClient, key);
    if (!registration) {
      console.warn(`[VoiceSession] No client plugin registered for channel '${row.Name}' (key '${key}') — skipping.`);
      return null;
    }
    const plugin = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeChannelClient>(BaseRealtimeChannelClient, key);
    if (!plugin) {
      console.warn(`[VoiceSession] Failed to instantiate client plugin for channel '${row.Name}' (key '${key}').`);
      return null;
    }
    return plugin;
  }

  /**
   * Wires one plugin into the session: hands it its host context and registers its
   * prefix-routed local tool executor (so `<ToolNamePrefix>*` calls run in the browser
   * through {@link BaseRealtimeChannelClient.ApplyAgentTool}, never the server relay).
   */
  private initializeChannel(plugin: BaseRealtimeChannelClient): void {
    plugin.Initialize(this.buildChannelContext(plugin));
    this.RegisterClientToolHandler(plugin.ToolNamePrefix, (toolName, argsJson) =>
      plugin.ApplyAgentTool(toolName, argsJson)
    );
  }

  /** Builds the host-services context one channel plugin sees (its only line to the session). */
  private buildChannelContext(plugin: BaseRealtimeChannelClient): RealtimeChannelContext {
    return {
      AgentName: this.CurrentAgentName,
      SendContextNote: (text: string) => this.SendContextNote(text),
      RequestSave: (stateJson: string) => this.scheduleChannelSave(plugin.ChannelName, stateJson),
      SaveAsArtifact: (name: string, contentJson: string) => this.saveChannelArtifact(plugin.ChannelName, name, contentJson),
      SetFocusMode: (on: boolean) => this._channelFocus$.next({ Channel: plugin, Focused: on })
    };
  }

  /**
   * Applies the PRIOR session's saved channel states (resume continuity): parses the
   * server-supplied map and offers each entry to the matching active plugin via
   * {@link BaseRealtimeChannelClient.RestoreState}. Fully tolerant — malformed payloads,
   * unknown channels, and plugin rejections are logged and skipped; the session start is
   * never affected.
   */
  private applyPriorChannelStates(statesJson: string | null | undefined): void {
    if (!statesJson) {
      return;
    }
    let states: Record<string, string>;
    try {
      const parsed: unknown = JSON.parse(statesJson);
      if (parsed === null || typeof parsed !== 'object') {
        return;
      }
      states = parsed as Record<string, string>;
    } catch {
      console.warn('[VoiceSession] PriorChannelStatesJson was malformed — starting channels fresh');
      return;
    }
    for (const plugin of this._activeChannels$.value) {
      const state = states[plugin.ChannelName];
      if (typeof state === 'string' && state.length > 0) {
        try {
          const restored = plugin.RestoreState(state);
          if (!restored) {
            console.warn(`[VoiceSession] Channel '${plugin.ChannelName}' declined its prior-session state — starting fresh`);
          }
        } catch (error) {
          console.warn(`[VoiceSession] Channel '${plugin.ChannelName}' restore threw — starting fresh`, error);
        }
      }
    }
  }

  /**
   * Persists a channel's state as a first-class versioned artifact (`MJ: Artifacts`) via the
   * `SaveSessionChannelArtifact` mutation — the channel-context capability behind e.g. the
   * whiteboard's "Save to artifacts". Best-effort: returns the created Artifact ID, or null
   * on any failure (logged, never thrown). Uses the live session id, falling back to the
   * teardown-captured one so "save my board" works right after the call ends.
   */
  private async saveChannelArtifact(channelName: string, name: string, contentJson: string): Promise<string | null> {
    const sessionId = this.agentSessionId ?? this.lastKnownSessionIdForSaves();
    if (!sessionId || !name.trim() || !contentJson) {
      return null;
    }
    try {
      const result = await this.gql().ExecuteGQL(
        `mutation SaveSessionChannelArtifact($agentSessionId: String!, $channelName: String!, $name: String!, $contentJson: String!) {
          SaveSessionChannelArtifact(agentSessionId: $agentSessionId, channelName: $channelName, name: $name, contentJson: $contentJson) {
            Success
            ErrorMessage
            ArtifactID
            ArtifactVersionID
          }
        }`,
        { agentSessionId: sessionId, channelName, name: name.trim(), contentJson }
      ) as { SaveSessionChannelArtifact?: { Success: boolean; ErrorMessage?: string; ArtifactID?: string } };
      const payload = result?.SaveSessionChannelArtifact;
      if (!payload?.Success) {
        console.warn(`[VoiceSession] Save-as-artifact failed for '${channelName}': ${payload?.ErrorMessage ?? 'unknown error'}`);
        return null;
      }
      return payload.ArtifactID ?? null;
    } catch (error) {
      console.warn(`[VoiceSession] Save-as-artifact errored for '${channelName}':`, error);
      return null;
    }
  }

  /** Most recent session id captured by the save pipeline (post-teardown saves). */
  private lastKnownSessionIdForSaves(): string | null {
    for (const pending of this.pendingChannelSaves.values()) {
      if (pending.SessionID) {
        return pending.SessionID;
      }
    }
    return null;
  }

  /**
   * Schedules the DEBOUNCED state-of-record save for a channel: each request replaces the
   * pending payload (latest state wins) and re-arms the timer; the session id is captured
   * while live so the teardown flush can persist onto the just-closed session.
   */
  private scheduleChannelSave(channelName: string, stateJson: string): void {
    const pending = this.pendingChannelSaves.get(channelName);
    if (pending) {
      clearTimeout(pending.Timer);
    }
    this.pendingChannelSaves.set(channelName, {
      Timer: setTimeout(() => this.flushChannelSave(channelName), VoiceSessionService.ChannelSaveDebounceMs),
      StateJson: stateJson,
      SessionID: this.agentSessionId ?? pending?.SessionID ?? null
    });
  }

  /** Fires one pending channel save (best-effort; {@link SaveChannelState} logs failures). */
  private flushChannelSave(channelName: string): void {
    const pending = this.pendingChannelSaves.get(channelName);
    if (!pending) {
      return;
    }
    this.pendingChannelSaves.delete(channelName);
    clearTimeout(pending.Timer);
    void this.SaveChannelState(channelName, pending.StateJson, pending.SessionID);
  }

  /** Final teardown flush: persist every channel's unsaved state immediately. */
  private flushAllChannelSaves(): void {
    for (const channelName of [...this.pendingChannelSaves.keys()]) {
      this.flushChannelSave(channelName);
    }
  }

  /** Disposes all channel plugins (errors contained per plugin) and clears the live set. */
  private disposeChannels(): void {
    for (const plugin of this._activeChannels$.value) {
      try {
        plugin.Dispose();
      } catch (error) {
        console.error(`[VoiceSession] Channel '${plugin.ChannelName}' Dispose failed:`, error);
      }
    }
    if (this._activeChannels$.value.length > 0) {
      this._activeChannels$.next([]);
    }
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
    // TRUE BARGE-IN (user input cut off active model output — the driver already stopped
    // the speech): the user took the floor, so any pending/queued progress narration is
    // stale — cancel it; the next progress event re-schedules at the session-global pace.
    // Delegated server-side runs deliberately keep running (barge-in kills SPEECH, not
    // work — cancelling relayed in-flight runs needs a server cancel channel; deferred).
    client.OnInterruption(() => {
      this.cancelPendingNarration();
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
        // Remember what was actually SAID so later updates build on it instead of repeating.
        this.spokenNarrations.push(transcript.Text);
        if (this.spokenNarrations.length > VoiceSessionService.MaxPriorNarrations) {
          this.spokenNarrations.shift();
        }
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
   * Routes a provider tool call: names matching a registered client-tool prefix execute
   * LOCALLY (UI tools — see {@link RegisterClientToolHandler}); everything else executes on
   * the MJ server. Either way the result feeds back to the model via
   * {@link BaseRealtimeClient.SendToolResult} so it speaks the outcome.
   */
  private async handleToolCall(call: RealtimeClientToolCall): Promise<void> {
    const clientHandler = this.findClientToolHandler(call.ToolName);
    if (clientHandler) {
      // Local UI tool: no server relay, no 'thinking' turn-state / narration burst — these
      // are fast, in-browser surface mutations (e.g. drawing on the whiteboard).
      const resultJson = await this.executeClientTool(clientHandler, call);
      this.client?.SendToolResult(call.CallID, resultJson);
      return;
    }
    this._connectionState$.next('thinking');
    if (this.inFlightCallIds.size === 0) {
      // A fresh delegation burst: anchor the first-update delay and clear the digest
      // buffer. Deliberately NOT reset: lastDelegationNarrationAt (the 8s spacing floor
      // is SESSION-global — sequential tool calls seconds apart must not re-arm the
      // faster first-update path, which read as "no debounce") and spokenNarrations
      // (so the story never repeats across closely-spaced calls).
      this.delegationBurstStartedAt = Date.now();
      this.narrationCount = 0;
      this.pendingNarrationMessages = [];
      this.lastNarratedTail = '';
    }
    this.inFlightCallIds.add(call.CallID);
    try {
      const resultJson = await this.executeSessionTool(call.CallID, call.ToolName, call.ArgumentsJson);
      this.emitDelegationResult(call.CallID, resultJson);
      this.client?.SendToolResult(call.CallID, resultJson);
    } catch (error) {
      console.error('[VoiceSession] Tool execution failed:', error);
      // Feed the error back so the model can narrate it rather than going silent.
      // success:false matters: ParseDelegationResultJson treats anything else as
      // success, which would flip the overlay's working card to a SUCCESS card
      // carrying the error text (matches the server broker's failure shape).
      const errorJson = JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
      this.emitDelegationResult(call.CallID, errorJson);
      this.client?.SendToolResult(call.CallID, errorJson);
    }
  }

  /** Finds the registered client-tool handler whose prefix matches `toolName`, or `null`. */
  private findClientToolHandler(toolName: string): VoiceClientToolHandler | null {
    for (const [prefix, handler] of this.clientToolHandlers) {
      if (toolName.startsWith(prefix)) {
        return handler;
      }
    }
    return null;
  }

  /**
   * Executes one client-tool call through its handler, wrapping any thrown error into a
   * `{ success: false, error }` JSON payload so the model can narrate the failure instead of
   * the call going silent.
   */
  private async executeClientTool(handler: VoiceClientToolHandler, call: RealtimeClientToolCall): Promise<string> {
    try {
      return await handler(call.ToolName, call.ArgumentsJson);
    } catch (error) {
      console.error('[VoiceSession] Client tool execution failed:', error);
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Emits a delegation result so the overlay's "working" card flips to a result card with real
   * content. Parses the broker's `{success, output, runId}` | `{success:false, error}` shape via
   * {@link ParseDelegationResultJson}; if it isn't JSON, surfaces the raw string. Only delegation
   * cards (created from progress events) react — non-delegation tool results have no card and are
   * harmlessly ignored downstream. The `runId` (the delegated `MJ: AI Agent Runs` record) rides
   * along as {@link VoiceDelegationResult.RunID} for the overlay's dev links, and any `artifacts`
   * ride along as {@link VoiceDelegationResult.Artifacts} for the surface panel's artifact tabs.
   */
  private emitDelegationResult(callId: string, resultJson: string): void {
    // The result will be spoken next — a deferred interim update is now pointless
    // (this is what keeps fast agents like Sage from narrating over their own answer),
    // and any progress still in the PubSub pipe for this call is stale.
    this.inFlightCallIds.delete(callId);
    this.cancelPendingNarration();
    const parsed = ParseDelegationResultJson(resultJson);
    this._delegationResult$.next({
      CallID: callId,
      Success: parsed.Success,
      Output: parsed.Output,
      RunID: parsed.RunID,
      Artifacts: parsed.Artifacts
    });
  }

  // ── Session minting (GraphQL) ──────────────────────────────────────────────

  /** Calls the `StartRealtimeClientSession` mutation to obtain an ephemeral token + config. */
  private async mintSession(
    targetAgentId: string,
    conversationId?: string | null,
    lastSessionId?: string | null,
    preferredModelId?: string | null,
    clientTools?: RealtimeToolDefinition[] | null,
    coAgentId?: string | null
  ): Promise<StartRealtimeClientSessionResult> {
    const mutation = `
      mutation StartRealtimeClientSession($targetAgentId: String!, $conversationId: String, $lastSessionId: String, $preferredModelId: String, $clientToolsJson: String, $coAgentId: String) {
        StartRealtimeClientSession(targetAgentId: $targetAgentId, conversationId: $conversationId, lastSessionId: $lastSessionId, preferredModelId: $preferredModelId, clientToolsJson: $clientToolsJson, coAgentId: $coAgentId) {
          AgentSessionId
          ConversationId
          Provider
          Model
          EphemeralToken
          ExpiresAt
          SessionConfigJson
          ModelName
          NarrationInstructionsTemplate
          PriorChannelStatesJson
        }
      }
    `;
    const variables = {
      targetAgentId,
      conversationId: conversationId ?? null,
      lastSessionId: lastSessionId ?? null,
      preferredModelId: preferredModelId ?? null,
      clientToolsJson: clientTools && clientTools.length > 0 ? JSON.stringify(clientTools) : null,
      coAgentId: coAgentId ?? null
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

  /**
   * Persists an interactive channel's state of record (e.g. the whiteboard's serialized scene)
   * onto the session's `MJ: AI Agent Session Channels` row via `SaveSessionChannelState`.
   *
   * @param channelName The channel definition name (e.g. `'Whiteboard'`).
   * @param stateJson The serialized channel state.
   * @param agentSessionId Optional EXPLICIT session id. The debounced channel-save pipeline
   *   captures the id while the session is live and passes it here, so the final teardown
   *   flush still lands on the just-closed session. Falls back to the active session's id;
   *   returns `false` when neither is available.
   * @returns Whether the server persisted the state. Failures are logged, never thrown — channel
   *   persistence is best-effort and must not disturb the live call.
   */
  public async SaveChannelState(channelName: string, stateJson: string, agentSessionId?: string | null): Promise<boolean> {
    const sessionId = agentSessionId ?? this.agentSessionId;
    if (!sessionId) {
      return false;
    }
    try {
      const mutation = `
        mutation SaveSessionChannelState($agentSessionId: String!, $channelName: String!, $stateJson: String!) {
          SaveSessionChannelState(agentSessionId: $agentSessionId, channelName: $channelName, stateJson: $stateJson)
        }
      `;
      const result = await this.gql().ExecuteGQL(mutation, { agentSessionId: sessionId, channelName, stateJson });
      return (result?.SaveSessionChannelState as boolean) ?? false;
    } catch (error) {
      console.error('[VoiceSession] Failed to save channel state:', error);
      return false;
    }
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
    // Floods of small updates AGGREGATE: each distinct message joins the digest buffer,
    // and ONE spoken update fires per window (first at ~5s into the burst, then every
    // ~8s). The buffer is discarded if the final result lands first.
    this.bufferNarrationMessage(progress.Message);
    if (this.pendingNarrationMessages.length > 0 && !this.narrationTimer) {
      this.narrationTimer = setTimeout(() => this.fireDeferredNarration(), this.nextNarrationDelayMs());
    }
  }

  /** Adds a progress message to the digest buffer (deduped, capped, oldest-first). */
  private bufferNarrationMessage(message: string): void {
    if (message === this.lastNarratedTail || this.pendingNarrationMessages.includes(message)) {
      return;
    }
    this.pendingNarrationMessages.push(message);
    if (this.pendingNarrationMessages.length > VoiceSessionService.MaxDigestMessages) {
      this.pendingNarrationMessages.shift();
    }
  }

  /**
   * ms until the next spoken update is allowed. Two constraints, BOTH enforced:
   * - first update of a burst: no earlier than ~5s after the burst started;
   * - ~8s since the last spoken update, SESSION-global — so sequential tool calls
   *   that reset the burst can never narrate faster than the interval.
   */
  private nextNarrationDelayMs(): number {
    const now = Date.now();
    const firstAnchor = this.narrationCount === 0
      ? this.delegationBurstStartedAt + VoiceSessionService.FirstNarrationDelayMs
      : 0;
    const spacingFloor = this.lastDelegationNarrationAt > 0
      ? this.lastDelegationNarrationAt + VoiceSessionService.NarrationIntervalMs
      : 0;
    return Math.max(250, Math.max(firstAnchor, spacingFloor) - now);
  }

  /**
   * Speaks the aggregated progress digest — unless the work already finished (buffer
   * cancelled) or the model is busy / audio is still playing, in which case it retries
   * shortly with the buffer intact (work is still running, so the update stays relevant).
   */
  private fireDeferredNarration(): void {
    this.narrationTimer = null;
    const client = this.client;
    if (this.pendingNarrationMessages.length === 0 || !client || this.inFlightCallIds.size === 0) {
      this.pendingNarrationMessages = [];
      return;
    }
    if (client.IsBusy || client.IsAudioPlaying) {
      this.narrationTimer = setTimeout(() => this.fireDeferredNarration(), VoiceSessionService.NarrationBusyRetryMs);
      return;
    }
    const digest = this.pendingNarrationMessages.join(' → ');
    this.lastNarratedTail = this.pendingNarrationMessages[this.pendingNarrationMessages.length - 1];
    this.pendingNarrationMessages = [];
    this.narrationCount++;
    this.lastDelegationNarrationAt = Date.now();
    client.RequestSpokenUpdate(this.buildNarrationInstructions(digest));
  }

  /** Cancels any deferred narration — the result is about to be spoken, so it's moot. */
  private cancelPendingNarration(): void {
    if (this.narrationTimer) {
      clearTimeout(this.narrationTimer);
      this.narrationTimer = null;
    }
    this.pendingNarrationMessages = [];
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
  private buildNarrationInstructions(digest: string): string {
    return BuildNarrationInstructions(this.narrationTemplate, digest, {
      PriorNarrations: this.spokenNarrations.slice(-VoiceSessionService.MaxPriorNarrations),
      UpdateNumber: this.narrationCount
    });
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
    this.delegationBurstStartedAt = 0;
    this.narrationCount = 0;
    this.spokenNarrations = [];
    this.lastNarratedTail = '';
  }

  // ── Teardown ───────────────────────────────────────────────────────────────

  /**
   * Tears down all client resources and (optionally) closes the server session.
   * @param closeServerSession when true, calls `CloseAgentSession` on the server.
   */
  private async teardown(closeServerSession: boolean): Promise<void> {
    this.teardownDelegationProgress();

    // Channels first: flush any unsaved channel state WHILE the live session id is still
    // set (the captured per-save id covers the race anyway), then dispose the plugins.
    this.flushAllChannelSaves();
    this.disposeChannels();

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
    this.clientToolHandlers.clear();
    this._modelName$.next(null);
    this.SetMinimized(false);
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
    this.SetMinimized(false);
  }

  /** The GraphQL provider used for relay mutations. */
  private gql(): GraphQLDataProvider {
    return this.Provider as GraphQLDataProvider;
  }
}
