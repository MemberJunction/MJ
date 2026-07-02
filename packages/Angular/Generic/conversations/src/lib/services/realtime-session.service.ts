import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { Metadata, IMetadataProvider } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJGlobal } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, JSONObject, JSONValue, RealtimeToolDefinition } from '@memberjunction/ai';
import { AppContextSnapshot } from '@memberjunction/ai-core-plus';
import {
  BaseRealtimeClient,
  LoadAssemblyAIRealtimeClient,
  LoadElevenLabsRealtimeClient,
  LoadGeminiRealtimeClient,
  LoadOpenAIRealtimeClient,
  LoadxAIRealtimeClient,
  RealtimeAudioActivity,
  RealtimeClientError,
  RealtimeClientState,
  RealtimeClientToolCall,
  RealtimeClientTranscript,
  RealtimeClientUsage
} from '@memberjunction/ai-realtime-client';
import { BuildNarrationInstructions } from './narration-template';
import { ParseDelegationResultJson, ParsedDelegationArtifact } from './delegation-result-parser';
import { BaseRealtimeChannelClient, RealtimeChannelContext } from '../components/realtime/channels/base-realtime-channel-client';
import { RealtimeAudioRecorder } from './realtime-audio-recorder';

/**
 * `MJ: User Settings` key for the per-user "record this voice call" consent toggle. Stored as
 * the literal string `'true'`/`'false'` (read with `=== 'true'`), cross-device via
 * {@link UserInfoEngine}. The pre-call picker writes it; the session service reads it as the
 * default when the caller doesn't pass an explicit consent value.
 */
export const REALTIME_RECORDING_CONSENT_KEY = 'mj.realtimeVoice.recordingConsent.v1';

// Tree-shaking prevention: the OpenAI client is resolved dynamically through the
// ClassFactory (by the server-reported Provider key), so this static call is what keeps
// its @RegisterClass side effect from being eliminated by the bundler.
// NOTE: the interactive-channel plugins (resolved dynamically from the `MJ: AI Agent
// Channels` registry by ClientPluginClass key) get the same treatment, but their Load
// calls live in `conversations.module.ts` — plugins carry Angular surface COMPONENTS,
// and this service stays component-free (it must stay importable in plain-node tests).
LoadOpenAIRealtimeClient();
LoadGeminiRealtimeClient();
LoadElevenLabsRealtimeClient();
LoadAssemblyAIRealtimeClient();
LoadxAIRealtimeClient();

/**
 * Connection / turn state for a real-time voice session, surfaced to the UI overlay.
 * - `connecting`  — negotiating the session + provider handshake
 * - `listening`   — connected, mic open, waiting for / hearing the user
 * - `speaking`    — the agent is producing audio
 * - `thinking`    — the agent delegated work (tool call) and is waiting on a result
 * - `error`       — a fatal error occurred; the session is no longer usable
 * - `closed`      — the session has been torn down
 */
export type RealtimeConnectionState =
  | 'connecting'
  | 'listening'
  | 'speaking'
  | 'thinking'
  | 'error'
  | 'closed';

/** A single caption line (one side of the conversation) shown in the live-captions list. */
export interface RealtimeCaption {
  Role: 'User' | 'Assistant';
  Text: string;
}

/**
 * A delegated-run progress update surfaced to the UI, emitted on {@link RealtimeSessionService.DelegationProgress$}.
 * These originate server-side during an `invoke-target-agent` delegation (e.g. while Sage works) and let a
 * future overlay render a "working" card while the realtime model narrates the same progress aloud.
 */
export interface RealtimeDelegationProgress {
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
 * The terminal result of a delegated tool call, emitted on {@link RealtimeSessionService.DelegationResult$}
 * when the delegation finishes so the overlay can flip the "working" card into a result card with real
 * content + provenance.
 */
export interface RealtimeDelegationResult {
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
 * registered via {@link RealtimeSessionService.RegisterClientToolHandler}. Receives the tool name +
 * raw arguments JSON from the realtime model and returns the result JSON string fed back as the
 * `tool_response`. May be sync or async; thrown errors are wrapped into a
 * `{ success: false, error }` payload by the service so the model can narrate the failure.
 */
export type RealtimeClientToolHandler = (toolName: string, argsJson: string) => string | Promise<string>;

/**
 * A channel's request to enter / leave the FOCUS layout, emitted on
 * {@link RealtimeSessionService.ChannelFocus$} when a plugin calls its context's
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
 * reads at session start from {@link AIEngineBase}'s cached `AgentChannels`.
 */
interface RealtimeChannelDefinitionRow {
  ID: string;
  Name: string;
  ClientPluginClass: string;
}

/**
 * One EPHEMERAL spoken narration of delegated-run progress, emitted on
 * {@link RealtimeSessionService.DelegationNarration$}. These are the interim "here's what's
 * happening" utterances the realtime model speaks while a delegation runs. By product
 * decision they are NOT captions and NOT persisted as ConversationDetails — they exist
 * only as a live note in the overlay, replaced by each newer narration.
 */
export interface RealtimeDelegationNarration {
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
 * Raw shape of the JSON `message` the server publishes on the push-status topic for each live Remote
 * Browser screencast frame (mirrors {@link RealtimeDelegationProgressPayload}, distinguished by
 * `resolver` + `type`). Routed to the active Remote Browser channel plugin — never narrated.
 */
interface RemoteBrowserScreencastPayload {
  type: 'RemoteBrowserScreencastFrame';
  agentSessionID: string;
  dataBase64: string;
  width: number;
  height: number;
  seq: number;
}

/**
 * Raw shape of the JSON `message` the server publishes on the push-status topic for each live Remote
 * Browser tab-audio chunk (mirrors {@link RemoteBrowserScreencastPayload}, distinguished by `type`).
 * Routed to the active Remote Browser channel plugin's audio player — never narrated.
 */
interface RemoteBrowserAudioChunkPayload {
  type: 'RemoteBrowserAudioChunk';
  agentSessionID: string;
  dataBase64: string;
  codec: string;
  sampleRate: number;
  channels: number;
  seq: number;
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
 * The Realtime Co-Agent (server-side) fronts the conversation's current agent — the server
 * bakes the companion instructions + tool set into `SessionConfigJson`, which the client
 * driver applies verbatim.
 *
 * Lifecycle: {@link StartRealtimeSession} → live duplex → {@link EndRealtimeSession}.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeSessionService {
  // ── Reactive UI state ──────────────────────────────────────────────────────
  private _connectionState$ = new BehaviorSubject<RealtimeConnectionState>('closed');
  private _captions$ = new BehaviorSubject<RealtimeCaption[]>([]);
  private _active$ = new BehaviorSubject<boolean>(false);
  private _delegationProgress$ = new Subject<RealtimeDelegationProgress>();
  private _delegationResult$ = new Subject<RealtimeDelegationResult>();
  private _delegationNarration$ = new Subject<RealtimeDelegationNarration>();
  private _agentName$ = new BehaviorSubject<string>('Sage');
  private _modelName$ = new BehaviorSubject<string | null>(null);
  private _minimized$ = new BehaviorSubject<boolean>(false);
  private _activeChannels$ = new BehaviorSubject<BaseRealtimeChannelClient[]>([]);
  private _channelFocus$ = new Subject<RealtimeChannelFocusEvent>();
  // ─── Generic session-lifecycle events (consumed by RealtimeSessionsAdapter to
  // bridge into @memberjunction/conversations-runtime's framework-agnostic
  // SessionsObserver). Why not derive from Active$ + agentSessionId? Because
  // Active$ flips true before mintSession resolves and sets agentSessionId —
  // a naive Active$ subscription would emit session-started with sessionId === null.
  // Emitting explicitly avoids the race entirely. ───
  private _sessionStarted$ = new Subject<{ sessionId: string; channelNames: string[] }>();
  private _sessionEnded$ = new Subject<{ sessionId: string; reason: 'explicit' | 'error' }>();
  private _channelActivity$ = new Subject<BaseRealtimeChannelClient>();

  /** Current connection / turn state. */
  public readonly ConnectionState$: Observable<RealtimeConnectionState> = this._connectionState$.asObservable();
  /** Live captions for both sides of the conversation. */
  public readonly Captions$: Observable<RealtimeCaption[]> = this._captions$.asObservable();
  /** True while a session is open (mic button active, overlay shown). */
  public readonly Active$: Observable<boolean> = this._active$.asObservable();
  /**
   * Progress updates from a delegated agent run (e.g. Sage) while the realtime model waits on it.
   * The future overlay subscribes to render a "working" card; the model also narrates these aloud.
   */
  public readonly DelegationProgress$: Observable<RealtimeDelegationProgress> = this._delegationProgress$.asObservable();
  /** Terminal result of a delegation, so the overlay can complete the working card with real content. */
  public readonly DelegationResult$: Observable<RealtimeDelegationResult> = this._delegationResult$.asObservable();
  /**
   * EPHEMERAL spoken progress narrations (see {@link RealtimeDelegationNarration}). These are
   * deliberately kept OUT of {@link Captions$} and never relayed/persisted — the overlay
   * renders them as a transient "live note" near the active working card.
   */
  public readonly DelegationNarration$: Observable<RealtimeDelegationNarration> = this._delegationNarration$.asObservable();
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

  /**
   * Fired EXACTLY ONCE per session after both `agentSessionId` is set AND the
   * realtime client is connected. Carries the server-issued `sessionId` and the
   * `ChannelName` of each plugin resolved at session mint. Consumed by
   * `RealtimeSessionsAdapter` (in this package) to feed
   * `@memberjunction/conversations-runtime`'s `SessionsObserver`.
   *
   * **Why this exists separately from `Active$`:** `Active$` flips `true` BEFORE
   * `mintSession` resolves, so `agentSessionId` is still `null` at that moment.
   * Subscribers correlating `(Active$, agentSessionId)` would race; this event
   * removes the race.
   */
  public readonly SessionStarted$: Observable<{ sessionId: string; channelNames: string[] }> =
    this._sessionStarted$.asObservable();

  /**
   * Fired EXACTLY ONCE per session as teardown begins, with the prior
   * `agentSessionId` (so subscribers can correlate against `SessionStarted$`'s
   * sessionId) and the client-distinguishable reason — `'explicit'` when the
   * user called `EndRealtimeSession`, `'error'` when teardown ran from a catch
   * block. Server-side close paths (janitor, shutdown) do NOT propagate here —
   * they happen out-of-process and have no client push channel today.
   */
  public readonly SessionEnded$: Observable<{ sessionId: string; reason: 'explicit' | 'error' }> =
    this._sessionEnded$.asObservable();

  /**
   * Fires with the channel PLUGIN every time the agent ACTS on that channel (a tool call
   * was routed to its local executor — e.g. the agent drew on the whiteboard). The overlay
   * uses the FIRST emission per channel to auto-reveal + focus the channel's surface tab,
   * so the user discovers the surface the moment the agent starts using it. Finer-grained
   * than {@link SessionStarted$}/{@link SessionEnded$} (per tool call, not per session).
   */
  public readonly ChannelActivity$: Observable<BaseRealtimeChannelClient> = this._channelActivity$.asObservable();

  /** Synchronous access to the session's active interactive-channel plugins. */
  public get ActiveChannels(): readonly BaseRealtimeChannelClient[] {
    return this._activeChannels$.value;
  }

  /**
   * The `ChannelName`s the agent has used (acted on) at least once this session. The overlay
   * uses this to register a channel's surface tab only after it has come into play. A fresh
   * Set snapshot so callers can't mutate the service's tracking.
   */
  public get UsedChannelNames(): ReadonlySet<string> {
    return new Set(this.usedChannelNames);
  }

  /** Whether the agent has used (acted on) the named channel at least once this session. */
  public HasChannelBeenUsed(channelName: string): boolean {
    return this.usedChannelNames.has(channelName);
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
  /** Conversation id the SERVER created for this session (null when the host supplied one). */
  private createdConversationId: string | null = null;
  /** The session's conversation id (supplied or server-created). */
  private sessionConversationId: string | null = null;
  /** First final user utterance of the live session (the naming seed). */
  private firstUserTranscript: string | null = null;

  /**
   * When the active/last session CREATED its conversation (started without one), the new
   * conversation's id — the host uses it to refresh the cached list, conditionally select
   * it on close, and auto-name it. Null when the session joined an existing conversation.
   */
  public get SessionCreatedConversationId(): string | null {
    return this.createdConversationId;
  }

  /** The first final user utterance of the session (naming seed); null before the user speaks. */
  public get FirstUserTranscript(): string | null {
    return this.firstUserTranscript;
  }

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
   * The application the active session runs in (sources the server-side app config cascade +
   * RelevantAgents → allowed-agent union, and the default-agent chain). `null` when no app context
   * was supplied. Set at {@link StartRealtimeSession}; sent to the mint mutation.
   */
  private applicationId: string | null = null;
  /**
   * The live app-context snapshot (where the user is, what they see, the capability manifest),
   * pushed by the host (Explorer) at session start and on subsequent changes via
   * {@link UpdateAppContext}. The headless {@link import('../components/realtime/channels/client-context-channel').ClientContextChannel}
   * subscribes to {@link AppContext$} and streams deltas to the model via `SendContextNote`.
   */
  private readonly _appContext$ = new BehaviorSubject<AppContextSnapshot | null>(null);
  /** Observable of the live app-context snapshot (see {@link _appContext$}). */
  public readonly AppContext$: Observable<AppContextSnapshot | null> = this._appContext$.asObservable();

  /**
   * Push an updated app-context snapshot mid-session (the continuous-streaming half of client-context
   * delivery). The host (Explorer) calls this when the user navigates / the active surface's state or
   * capability manifest changes; the ClientContextChannel turns the delta into a `SendContextNote`.
   * No-op semantics when no session is live — the channel simply re-reads on next start.
   *
   * @param snapshot The latest app-context snapshot (or null to clear).
   */
  public UpdateAppContext(snapshot: AppContextSnapshot | null): void {
    this._appContext$.next(snapshot);
  }

  /**
   * The DB-driven narration instruction template (server-resolved at session start, containing a
   * `{{ progressMessage }}` placeholder). `null` when the deployment hasn't synced the narration
   * prompt — {@link buildNarrationInstructions} then falls back to the built-in wording.
   */
  private narrationTemplate: string | null = null;

  // ── Browser-side call recording ────────────────────────────────────────────
  /**
   * The active session's audio recorder (mic + agent mix), or `null` when the user didn't
   * consent or the browser can't record. Created after the client connects; stopped + uploaded
   * at teardown.
   */
  private recorder: RealtimeAudioRecorder | null = null;
  /** ISO timestamp of when recording started — sent to the server on session start. */
  private recordingStartedAtIso: string | null = null;
  /** Interval that flushes ~15s crash-recovery shards to the server during a recording. */
  private segmentTimer: ReturnType<typeof setInterval> | null = null;
  /** 0-based index of the next recording shard to upload. */
  private segmentIndex = 0;
  /** How often crash-recovery shards are flushed during a recording. */
  private static readonly SegmentFlushMs = 15000;
  /**
   * Recording-relative ms offset at which the IN-FLIGHT (not-yet-finalized) turn's audio
   * actually BEGAN — captured the moment that turn's audio/text starts flowing (its first
   * interim transcript), NOT inherited from the previous turn's end. `null` before the first
   * turn / between turns (until the next turn's audio starts). Sent as `utteranceStartMs` on
   * the turn's final transcript so per-turn timing lines up with the recording even when a
   * tool-call / silence gap sits between turns (the inherit-previous-end model mis-stamped
   * the post-gap turn at the pre-gap offset). See {@link markTurnAudioStart}.
   */
  private currentTurnStartMs: number | null = null;
  /**
   * Per-turn guard for {@link markTurnAudioStart}: `true` once the in-flight turn's audio-start
   * offset has been captured, so mid-turn interim deltas don't overwrite it. Reset to `false`
   * at each finalization so the NEXT turn re-stamps from where ITS audio begins.
   */
  private turnAudioStartCaptured = false;

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
   * first, capped at {@link RealtimeSessionService.MaxDigestMessages}). A flood of small
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
  /**
   * Call ids the USER explicitly cancelled via {@link CancelDelegation} /
   * {@link CancelInFlightDelegations}. Their cards were already flipped to the
   * "Cancelled by user" failed result, so when the original tool mutation later resolves
   * with the aborted run's outcome, {@link emitDelegationResult} skips the duplicate card
   * emission (the model still receives the tool result). Cleared at teardown.
   */
  private cancelledCallIds = new Set<string>();

  // ── Usage telemetry relay (B7) ─────────────────────────────────────────────
  /** Debounce window for relaying accumulated usage deltas to the server. */
  private static readonly UsageFlushDebounceMs = 10000;
  /** Accumulated input-token delta since the last flush. */
  private pendingUsageInput = 0;
  /** Accumulated output-token delta since the last flush. */
  private pendingUsageOutput = 0;
  /** Pending debounced usage flush; also force-flushed at teardown. */
  private usageFlushTimer: ReturnType<typeof setTimeout> | null = null;
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
  private clientToolHandlers = new Map<string, RealtimeClientToolHandler>();

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

  /**
   * `ChannelName`s the agent has ACTED ON at least once this session (the channel's first
   * tool call routed to its local executor). The overlay reads this to decide which channel
   * surface tabs to register: a channel earns its tab only once it's been used (the
   * whiteboard is the sole exception — it tabs immediately, since a user may draw first).
   * Reset at session start via {@link resetState}.
   */
  private usedChannelNames = new Set<string>();

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
   * @param targetAgentId The agent the Realtime Co-Agent voices on behalf of.
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
   *   agent's `DefaultCoAgentID`, then the type-level `AIAgentCoAgent` default row, then the global Realtime Co-Agent.
   * @param configOverridesJson Optional JSON payload of SESSION CONFIG overrides (e.g.
   *   `{"realtime":{"modelPreference":"<modelId>"}}`), forwarded verbatim on the mint
   *   mutation. The server enforces the `Realtime: Advanced Session Controls`
   *   authorization on any overrides — hosts only populate this from authorization-gated
   *   pickers, and never synthesize overrides beyond what the user explicitly chose.
   *   Omit/`null` for the server's defaults (today's behavior).
   * @param recordingConsent Optional EXPLICIT "record this call" consent for THIS session. When
   *   `true`, the browser records a mic + agent-audio mix and uploads it at session end. When
   *   omitted/`null`, the per-user persisted preference (`mj.realtimeVoice.recordingConsent.v1`
   *   via {@link UserInfoEngine}) is read as the default. `false` never records.
   * @param mediaCollectionId Optional per-session media-kit override (`MJ: Collections.ID`). When set,
   *   the server-side Media channel resolves THIS collection as the agent's media kit for the session,
   *   taking precedence over the agent's `DefaultMediaCollectionID`. The server UUID-validates it
   *   (malformed ⇒ ignored, the agent default applies). Omit/`null` to use the agent default kit.
   */
  public async StartRealtimeSession(
    targetAgentId: string,
    conversationId?: string | null,
    lastSessionId?: string | null,
    agentName?: string | null,
    preferredModelId?: string | null,
    clientTools?: RealtimeToolDefinition[] | null,
    coAgentId?: string | null,
    configOverridesJson?: string | null,
    recordingConsent?: boolean | null,
    mediaCollectionId?: string | null,
    applicationId?: string | null,
    appContext?: AppContextSnapshot | null
  ): Promise<void> {
    if (this.IsActive) {
      return; // a session is already running — ignore duplicate starts
    }

    // App awareness (Move 1/3/4): the application the session runs in (sources the app config
    // cascade + RelevantAgents → allowed-agent union) and the live app-context snapshot injected
    // into the companion prompt at mint. Stored so the ClientContextChannel can stream subsequent
    // deltas. Absent ⇒ no app layer / no mint-time context (the pre-app behavior).
    this.applicationId = applicationId ?? null;
    // Prefer the explicit param, but fall back to the snapshot the host has ALREADY pushed via
    // UpdateAppContext (explorer-app streams the live snapshot continuously). The overlay's
    // [appContext] binding can still read null at the instant the mic is clicked — without this
    // fallback, StartRealtimeSession(null) would clobber a perfectly good snapshot and mint the
    // companion prompt with no app context (no NavigableApps / no tool schemas → the co-agent guesses
    // parameter names and navigation fails). Never overwrite a good value with null.
    const effectiveAppContext = appContext ?? this._appContext$.value;
    this._appContext$.next(effectiveAppContext);

    if (agentName) {
      this._agentName$.next(agentName);
    }
    this.resetState();
    this._active$.next(true);
    this._connectionState$.next('connecting');

    // Resolve recording consent for this session: explicit value wins, else the per-user
    // persisted preference. Computed before mint so it can be reported to the server.
    const consent = recordingConsent ?? this.readPersistedRecordingConsent();
    this.recordingStartedAtIso = consent ? new Date().toISOString() : null;

    try {
      // Resolve + initialize the interactive-channel plugins FIRST: their client-executed
      // tool sets must be declared to the realtime model at session mint.
      const allClientTools = [...(clientTools ?? []), ...(await this.startChannels())];
      const session = await this.mintSession(targetAgentId, conversationId, lastSessionId, preferredModelId, allClientTools, coAgentId, configOverridesJson, consent, this.recordingStartedAtIso, mediaCollectionId, this.applicationId, effectiveAppContext);
      this.agentSessionId = session.AgentSessionId;
      // A null input conversationId means the SERVER created a fresh conversation for
      // this session — track it so the host can fold it into the cached list, select
      // it on close, and auto-name it (via the shared naming helper).
      this.createdConversationId = !conversationId && session.ConversationId ? session.ConversationId : null;
      this.sessionConversationId = session.ConversationId ?? conversationId ?? null;
      this.firstUserTranscript = null;
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

      // Start browser-side recording (mic + agent mix) when consented. Best-effort: an
      // unsupported browser / missing remote stream degrades gracefully (mic-only or off)
      // and never blocks the call. The remote stream may still be null here (the WebRTC
      // ontrack can land slightly after Connect resolves) — the recorder mixes the mic now
      // and the agent audio rides through whenever its track is already attached.
      if (consent) {
        this.startRecording(client);
      }

      this.subscribeDelegationProgress();
      // State advances to 'listening' once the provider control channel opens
      // (driven by the client's OnStateChange events).

      // Surface a generic session-started event for the conversations runtime
      // SessionsObserver bridge. Emitting AFTER Connect() guarantees both that
      // agentSessionId is set (line ~468) AND the realtime client is connected,
      // so consumers can act on it without re-checking either condition.
      this._sessionStarted$.next({
        sessionId: this.agentSessionId,
        channelNames: this._activeChannels$.value.map(c => c.ChannelName),
      });
    } catch (error) {
      console.error('[RealtimeSession] Failed to start session:', error);
      this._connectionState$.next('error');
      await this.teardown(false);
    }
  }

  /**
   * End the active session: stop the mic, tear down the provider connection, and close
   * the server-side agent session. Safe to call when no session is active.
   */
  public async EndRealtimeSession(): Promise<void> {
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
  public RegisterClientToolHandler(toolNamePrefix: string, handler: RealtimeClientToolHandler): void {
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

  /**
   * The active client's current audio activity (per-direction RMS levels + spectrum
   * bins), or `null` when no session is live or the driver attached no audio meters.
   * Sampled by the overlay's animation-frame loop to drive the audio-reactive orb/EQ —
   * a cheap analyser read, never provider traffic.
   */
  public GetAudioActivity(): RealtimeAudioActivity | null {
    return this.client?.GetAudioActivity() ?? null;
  }

  // ── Browser-side call recording ────────────────────────────────────────────

  /**
   * Reads the per-user recording-consent preference from `MJ: User Settings` (via
   * {@link UserInfoEngine}'s synchronous cache). Defensive: any failure resolves to `false`
   * (don't record) so a settings hiccup can never opt a user into recording.
   */
  private readPersistedRecordingConsent(): boolean {
    try {
      return UserInfoEngine.Instance.GetSetting(REALTIME_RECORDING_CONSENT_KEY) === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Starts the browser-side recorder (mic + agent-audio mix). Best-effort — any failure is
   * contained so it never disturbs the live call; an unsupported browser simply records
   * nothing (the recorder disables itself).
   */
  private startRecording(client: BaseRealtimeClient): void {
    try {
      if (!this.localStream) {
        return;
      }
      const remoteStream = client.GetRemoteMediaStream?.() ?? null;
      const recorder = new RealtimeAudioRecorder();
      recorder.Start(this.localStream, remoteStream);
      this.recorder = recorder.IsRecording ? recorder : null;
      // First turn's audio starts at ~0 (recording begins right as the call goes live). Seed it
      // here so the very first turn has a sane start even if its first interim is missed; later
      // turns re-stamp from where THEIR audio begins via markTurnAudioStart (handles tool gaps).
      this.currentTurnStartMs = recorder.IsRecording ? 0 : null;
      this.turnAudioStartCaptured = false;
      if (this.recorder) {
        // The agent's WebRTC audio track usually lands AFTER Connect() resolves, so `remoteStream`
        // above is typically null and we'd capture mic-only. Attach the agent stream whenever it
        // arrives (fires immediately if already present) so the recording includes the agent voice.
        client.OnRemoteMediaStream?.((stream) => this.recorder?.AttachRemoteStream(stream));
        this.startSegmentFlushing();
      }
    } catch (error) {
      console.warn('[RealtimeSession] Failed to start call recording:', error);
      this.recorder = null;
    }
  }

  /** Begins flushing ~15s crash-recovery shards to the server for the duration of the recording. */
  private startSegmentFlushing(): void {
    this.segmentIndex = 0;
    this.segmentTimer = setInterval(() => { void this.flushRecordingSegment(); }, RealtimeSessionService.SegmentFlushMs);
  }

  /** Stops the periodic crash-recovery shard flush. */
  private stopSegmentFlushing(): void {
    if (this.segmentTimer) {
      clearInterval(this.segmentTimer);
      this.segmentTimer = null;
    }
  }

  /**
   * Uploads the chunks captured since the last flush as one crash-recovery shard (durability only;
   * the canonical file is still the full upload at teardown). Best-effort — never disturbs the call.
   */
  private async flushRecordingSegment(): Promise<void> {
    const recorder = this.recorder;
    const agentSessionId = this.agentSessionId;
    if (!recorder || !agentSessionId) {
      return;
    }
    const segment = recorder.SnapshotNewSegment();
    if (!segment || segment.size === 0) {
      return;
    }
    try {
      const audioBase64 = await this.blobToBase64(segment);
      if (!audioBase64) {
        return;
      }
      const index = this.segmentIndex++;
      const mutation = `
        mutation UploadRealtimeRecordingSegment($agentSessionId: String!, $segmentIndex: Int!, $audioBase64: String!, $mimeType: String!) {
          UploadRealtimeRecordingSegment(agentSessionId: $agentSessionId, segmentIndex: $segmentIndex, audioBase64: $audioBase64, mimeType: $mimeType)
        }
      `;
      // Shards are HEADER-LESS raw little-endian PCM16 (mime audio/L16 with the capture sample rate),
      // NOT individually-playable WAV — recovery is concatenate-in-order then WAV-wrap. The canonical
      // seekable WAV is the consolidated end-of-call upload below.
      const shardMime = `audio/L16;rate=${recorder.SampleRate}`;
      await this.gql().ExecuteGQL(mutation, { agentSessionId, segmentIndex: index, audioBase64, mimeType: shardMime });
    } catch (error) {
      console.warn('[RealtimeSession] Failed to flush recording shard:', error);
    }
  }

  /**
   * Stops the active recorder and uploads the captured audio via `UploadRealtimeRecording`.
   * Fully best-effort and wrapped in try/catch — recording upload must NEVER block teardown.
   * No-op when nothing was recorded or there's no session id to attach the file to.
   */
  private async stopAndUploadRecording(agentSessionId: string | null): Promise<void> {
    this.stopSegmentFlushing();
    const recorder = this.recorder;
    this.recorder = null;
    this.currentTurnStartMs = null;
    this.turnAudioStartCaptured = false;
    if (!recorder) {
      return;
    }
    try {
      // Capture the recorder MIME (now 'audio/wav') BEFORE Stop() — the getter reads '' once stopped.
      const mimeType = recorder.MimeType;
      const blob = await recorder.Stop();
      // Read the real waveform peaks computed during capture (survives Stop via the recorder's snapshot).
      const peaks = recorder.GetPeaks();
      if (!blob || blob.size === 0 || !agentSessionId) {
        console.warn('[RealtimeSession] ⚠️ recording NOT uploaded — empty blob or no session id.');
        return;
      }
      const audioBase64 = await this.blobToBase64(blob);
      if (!audioBase64) {
        console.warn('[RealtimeSession] ⚠️ recording NOT uploaded — base64 encoding failed.');
        return;
      }
      await this.uploadRecording(agentSessionId, audioBase64, mimeType, peaks);
    } catch (error) {
      console.warn('[RealtimeSession] Failed to stop/upload call recording:', error);
    }
  }

  /**
   * Runs the `UploadRealtimeRecording` mutation; failures are logged, never thrown. Sends the
   * capture-time waveform `peaks` (max-abs per bucket, normalized 0..1) so the server can persist a
   * `peaks.json` sidecar for fast waveform rendering without re-decoding the audio.
   */
  private async uploadRecording(agentSessionId: string, audioBase64: string, mimeType: string, peaks: number[]): Promise<void> {
    const mutation = `
      mutation UploadRealtimeRecording($agentSessionId: String!, $audioBase64: String!, $mimeType: String!, $consent: Boolean, $peaks: [Float!]) {
        UploadRealtimeRecording(agentSessionId: $agentSessionId, audioBase64: $audioBase64, mimeType: $mimeType, consent: $consent, peaks: $peaks) {
          Success
          FileID
          ErrorMessage
        }
      }
    `;
    const result = await this.gql().ExecuteGQL(mutation, {
      agentSessionId,
      audioBase64,
      mimeType,
      consent: true,
      peaks
    });
    const payload = result?.UploadRealtimeRecording as { Success?: boolean; FileID?: string; ErrorMessage?: string } | undefined;
    if (!payload?.Success) {
      console.warn(`[RealtimeSession] ❌ recording upload reported failure: ${payload?.ErrorMessage ?? 'unknown error'} (full result: ${JSON.stringify(result)})`);
    }
  }

  /**
   * Encodes a {@link Blob} as a base64 string (the data: prefix stripped) via {@link FileReader}.
   * Resolves `''` on any read failure so the upload path can bail cleanly.
   */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const commaIndex = result.indexOf(',');
        resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : '');
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
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
   * Reads the ACTIVE `MJ: AI Agent Channels` rows from {@link AIEngineBase}'s cached
   * `AgentChannels` (provider-scoped engine instance, lazy `Config` — no RunView
   * round-trip; the engine's BaseEntity-event reactivity keeps the registry fresh).
   * Failures are logged and degrade to an empty list — channel availability must
   * never block the voice session.
   */
  private async fetchChannelDefinitions(): Promise<RealtimeChannelDefinitionRow[]> {
    try {
      const engine = AIEngineBase.GetProviderInstance<AIEngineBase>(this.Provider, AIEngineBase) as AIEngineBase;
      await engine.Config(false, undefined, this.Provider);
      return (engine.AgentChannels ?? [])
        .filter(c => c.IsActive)
        .map<RealtimeChannelDefinitionRow>(c => ({ ID: c.ID, Name: c.Name, ClientPluginClass: c.ClientPluginClass }));
    } catch (error) {
      console.warn('[RealtimeSession] Channel registry unavailable — starting with no channels:', error);
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
      console.warn(`[RealtimeSession] Channel '${row.Name}' has no ClientPluginClass — skipping.`);
      return null;
    }
    const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseRealtimeChannelClient, key);
    if (!registration) {
      console.warn(`[RealtimeSession] No client plugin registered for channel '${row.Name}' (key '${key}') — skipping.`);
      return null;
    }
    const plugin = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeChannelClient>(BaseRealtimeChannelClient, key);
    if (!plugin) {
      console.warn(`[RealtimeSession] Failed to instantiate client plugin for channel '${row.Name}' (key '${key}').`);
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
    this.RegisterClientToolHandler(plugin.ToolNamePrefix, (toolName, argsJson) => {
      // The agent is ACTING on this channel — surface-discovery signal for the overlay
      // (first activity registers + auto-reveals + focuses the channel tab) before the
      // tool applies. Record the channel as USED so the overlay tabs it (channels other
      // than the whiteboard are tab-less until they're first used).
      this.usedChannelNames.add(plugin.ChannelName);
      this._channelActivity$.next(plugin);
      return plugin.ApplyAgentTool(toolName, argsJson);
    });
  }

  /** Builds the host-services context one channel plugin sees (its only line to the session). */
  private buildChannelContext(plugin: BaseRealtimeChannelClient): RealtimeChannelContext {
    // Capture the service in a local so the AgentSessionID getter reads the SERVICE's live
    // field (not the object literal's `this`) every time it's accessed.
    const service = this;
    return {
      AgentName: this.CurrentAgentName,
      // The live session's provider — threaded by channels into MJ-backed surfaces (e.g. the Media
      // channel's mj-storage-media-player / CreateMediaAccessToken). `get` so it stays current.
      get Provider(): IMetadataProvider {
        return service.Provider;
      },
      SendContextNote: (text: string) => this.SendContextNote(text),
      RequestSpokenResponse: (instructions: string) => this.requestChannelSpokenResponse(instructions),
      RequestSave: (stateJson: string) => this.scheduleChannelSave(plugin.ChannelName, stateJson),
      SaveAsArtifact: (name: string, contentJson: string) => this.saveChannelArtifact(plugin.ChannelName, name, contentJson),
      SetFocusMode: (on: boolean) => this._channelFocus$.next({ Channel: plugin, Focused: on }),
      // Live session id + GraphQL escape hatch for SERVER-BACKED channels (e.g. Remote
      // Browser). `get` so a channel always reads the CURRENT id — it's null at Initialize
      // (the plugin is built before mintSession resolves) and set once the session is live.
      get AgentSessionID(): string | null {
        return service.agentSessionId;
      },
      ExecuteServerAction: <TResult>(query: string, variables: Record<string, JSONValue>) =>
        this.executeChannelServerAction<TResult>(query, variables),
      // App-context stream + client-tool execution for the headless ClientContextChannel. The host
      // (Explorer) feeds both; absent on hosts that supply no app context / register no client tools.
      AppContext$: this.AppContext$,
      ExecuteClientTool: (name: string, params: Record<string, unknown>) =>
        this.executeAppClientTool(name, params)
    };
  }

  /**
   * Host registry of surface CLIENT TOOLS (Name → handler), fed by the host (Explorer) from the
   * active surface's `SetAgentClientTools`. The headless ClientContextChannel's `ContextTool` proxy
   * executes against this via {@link executeAppClientTool}. Keys are lower-cased for case-insensitive
   * model-supplied action names.
   */
  private readonly appClientToolHandlers = new Map<string, (params: Record<string, unknown>) => Promise<unknown> | unknown>();

  /**
   * Replaces the set of host-registered surface client tools the realtime ContextTool can execute.
   * The host calls this at session start and whenever the active surface's tool set changes (the
   * continuous-capability half of client-context delivery). Passing `[]` clears them.
   *
   * @param tools The current surface client tools (name + handler). Descriptions/schemas ride the
   *   app-context manifest separately; only the executable handler is needed here.
   */
  public RegisterAppClientTools(
    tools: ReadonlyArray<{ Name: string; Handler: (params: Record<string, unknown>) => Promise<unknown> | unknown }>
  ): void {
    this.appClientToolHandlers.clear();
    for (const tool of tools) {
      if (tool?.Name && typeof tool.Handler === 'function') {
        this.appClientToolHandlers.set(tool.Name.trim().toLowerCase(), tool.Handler);
      }
    }
  }

  /**
   * Executes a host-registered surface client tool by name (the {@link RealtimeChannelContext.ExecuteClientTool}
   * implementation). Tolerant: an unknown tool or a thrown handler resolves to a structured
   * `Success: false` result the channel narrates — never throws.
   *
   * @param name The tool name (the model's `action`).
   * @param params The tool parameters.
   * @returns A structured result for the channel to serialize back to the model.
   */
  private async executeAppClientTool(
    name: string,
    params: Record<string, unknown>
  ): Promise<{ Success: boolean; Result?: unknown; ErrorMessage?: string }> {
    const handler = this.appClientToolHandlers.get((name ?? '').trim().toLowerCase());
    if (!handler) {
      const available = Array.from(this.appClientToolHandlers.keys()).join(', ');
      return {
        Success: false,
        ErrorMessage: `No client tool named "${name}" is available on this surface. Available: ${available || '(none)'}.`
      };
    }
    try {
      const result = await handler(params ?? {});
      return { Success: true, Result: result };
    } catch (error) {
      return { Success: false, ErrorMessage: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Runs a channel-specific GraphQL operation through the live session's provider (the
   * {@link RealtimeChannelContext.ExecuteServerAction} implementation). Best-effort: any
   * transport/server error is logged and resolves to `null` so the calling channel can map
   * the failure to a model-readable result string without `try/catch`.
   */
  private async executeChannelServerAction<TResult>(query: string, variables: Record<string, JSONValue>): Promise<TResult | null> {
    try {
      const result = await this.gql().ExecuteGQL(query, variables);
      return (result as TResult) ?? null;
    } catch (error) {
      console.error('[RealtimeSession] Channel server action failed:', error);
      return null;
    }
  }

  /**
   * A channel asked the live model to SPEAK in reaction to channel input (e.g. a widget
   * submission) — routed through the client's spoken-update channel. No-op when the
   * session isn't live; empty instructions are dropped.
   */
  private requestChannelSpokenResponse(instructions: string): void {
    const trimmed = instructions?.trim() ?? '';
    if (trimmed.length === 0 || !this.client || !this.isSessionLive()) {
      return;
    }
    this.client.RequestSpokenUpdate(trimmed);
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
      console.warn('[RealtimeSession] PriorChannelStatesJson was malformed — starting channels fresh');
      return;
    }
    for (const plugin of this._activeChannels$.value) {
      const state = states[plugin.ChannelName];
      if (typeof state === 'string' && state.length > 0) {
        try {
          const restored = plugin.RestoreState(state);
          if (!restored) {
            console.warn(`[RealtimeSession] Channel '${plugin.ChannelName}' declined its prior-session state — starting fresh`);
          }
        } catch (error) {
          console.warn(`[RealtimeSession] Channel '${plugin.ChannelName}' restore threw — starting fresh`, error);
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
        console.warn(`[RealtimeSession] Save-as-artifact failed for '${channelName}': ${payload?.ErrorMessage ?? 'unknown error'}`);
        return null;
      }
      return payload.ArtifactID ?? null;
    } catch (error) {
      console.warn(`[RealtimeSession] Save-as-artifact errored for '${channelName}':`, error);
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
      Timer: setTimeout(() => this.flushChannelSave(channelName), RealtimeSessionService.ChannelSaveDebounceMs),
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
        console.error(`[RealtimeSession] Channel '${plugin.ChannelName}' Dispose failed:`, error);
      }
    }
    if (this._activeChannels$.value.length > 0) {
      this._activeChannels$.next([]);
    }
    this.usedChannelNames.clear();
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
      console.error('[RealtimeSession] Failed to parse/apply SessionConfigJson:', error);
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
      console.error('[RealtimeSession] Provider error event:', error);
    });
    // Usage telemetry: accumulate the driver's per-response token DELTAS and relay them to
    // the server (onto the co-agent AIPromptRun) debounced + once at teardown. Providers
    // without usage events simply never emit — registering is always safe.
    client.OnUsage((usage: RealtimeClientUsage) => this.onUsageDelta(usage));
    // TRUE BARGE-IN (user input cut off active model output — the driver already stopped
    // the speech): the user took the floor, so any pending/queued progress narration is
    // stale — cancel it; the next progress event re-schedules at the session-global pace.
    // HOST POLICY (deliberate): barge-in does NOT abort in-flight delegated runs — the
    // narration design EXPECTS the user to keep talking while delegated work runs, so
    // killing the work on speech would cancel exactly the jobs the user asked for.
    // Explicit cancellation is a separate, intentional act: the overlay's per-card ✕
    // calls {@link CancelDelegation} (server cancel channel) instead.
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
   * Translates {@link RealtimeClientState} into {@link RealtimeConnectionState}. `'connected'`
   * is suppressed (the UI stays 'connecting' until the control channel opens → 'listening'),
   * and `'closed'` never overwrites a terminal 'error' the service itself recorded.
   */
  private mapClientState(state: RealtimeClientState): RealtimeConnectionState | null {
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
   * Applies transcript policy to client transcript events. Interim deltas don't become
   * captions/turns (the client already drives the speaking state) but DO mark this turn's
   * audio-start offset against the recording (the first interim fires as the audio/text
   * starts flowing — see {@link markTurnAudioStart}). Final NORMAL assistant turns become
   * captions + persisted transcripts; final NARRATION turns are EPHEMERAL by product
   * decision — emitted on {@link DelegationNarration$} only, never a caption, never
   * relayed/persisted. User turns ride the caption + relay path.
   */
  private async onClientTranscript(transcript: RealtimeClientTranscript): Promise<void> {
    if (!transcript.IsFinal) {
      // First interim of a NEW turn = that turn's audio is starting NOW. Stamp the
      // recording-relative start here so a turn whose audio begins AFTER a tool-call /
      // silence gap is timed where its audio really is — not inherited from the prior
      // turn's end. Narration interims are ephemeral and excluded (Kind guard inside).
      this.markTurnAudioStart(transcript.Kind);
      return;
    }
    if (transcript.Role === 'Assistant') {
      if (transcript.Kind === 'narration') {
        this._delegationNarration$.next({ Text: transcript.Text });
        // Remember what was actually SAID so later updates build on it instead of repeating.
        this.spokenNarrations.push(transcript.Text);
        if (this.spokenNarrations.length > RealtimeSessionService.MaxPriorNarrations) {
          this.spokenNarrations.shift();
        }
      } else if (transcript.ReplacesPrevious) {
        // CORRECTION (e.g. ElevenLabs post-barge-in re-finalization): this final
        // SUPERSEDES the previous final assistant turn — replace the caption in place
        // and tell the server to update the persisted turn instead of appending.
        this.replaceLastCaption('Assistant', transcript.Text);
        await this.relayTranscript('assistant', transcript.Text, true);
      } else {
        this.appendCaption({ Role: 'Assistant', Text: transcript.Text });
        await this.relayTranscript('assistant', transcript.Text);
      }
    } else if (transcript.ReplacesPrevious) {
      // STREAMING user transcription: providers like Grok emit the growing utterance as repeated
      // events (each the full text so far), flagging all but the first ReplacesPrevious. Update the
      // in-place User caption + persisted turn instead of stacking a new bubble per increment — the
      // same correction semantics the assistant branch uses. (OpenAI sends one final → the else path.)
      this.replaceLastCaption('User', transcript.Text);
      await this.relayTranscript('user', transcript.Text, true);
    } else {
      await this.onUserTranscript(transcript.Text);
    }
  }

  /**
   * Stamps the recording-relative offset at which the IN-FLIGHT turn's audio actually began,
   * the moment that turn's audio/text first starts flowing (its FIRST interim transcript).
   *
   * This is the fix for transcript cues drifting out of sync with the audio when a tool-call /
   * silence gap sits between turns: the old model inherited the next turn's start from the
   * PREVIOUS turn's end (assumes contiguous turns), so a post-gap turn's cue pointed ~gap-length
   * too early. Capturing the start where the audio truly begins keeps the cue aligned.
   *
   * Guards:
   * - only when recording ({@link recorder} present),
   * - only ONCE per turn ({@link turnAudioStartCaptured}) so mid-turn interim deltas don't move it,
   * - NORMAL turns only — NARRATION interims are ephemeral and never persisted, so they must not
   *   claim the next real turn's start slot.
   *
   * Works for any role whose driver surfaces interim deltas (all drivers for the assistant; the
   * relevant case here — the post-tool-gap assistant answer — and user-interim drivers like
   * Gemini/AssemblyAI). For final-only user turns (OpenAI/xAI/ElevenLabs) no interim arrives, so
   * {@link relayTranscript} falls back to the seeded/prior start — the gap case that drifts is the
   * assistant answer, which always has interims.
   */
  private markTurnAudioStart(kind: 'normal' | 'narration'): void {
    if (!this.recorder || this.turnAudioStartCaptured || kind === 'narration') {
      return;
    }
    this.currentTurnStartMs = this.recorder.NowOffsetMs();
    this.turnAudioStartCaptured = true;
  }

  /**
   * Replaces the LAST caption of `role` in place (correction semantics); falls back to a
   * plain append when no such caption exists yet (e.g. the superseded turn predates this
   * client's caption window).
   */
  private replaceLastCaption(role: 'User' | 'Assistant', text: string): void {
    const captions = this._captions$.value;
    for (let i = captions.length - 1; i >= 0; i--) {
      if (captions[i].Role === role) {
        const next = [...captions];
        next[i] = { Role: role, Text: text };
        this._captions$.next(next);
        return;
      }
    }
    this.appendCaption({ Role: role, Text: text });
  }

  /** Finalizes the user turn: push a caption + relay the final transcript. */
  private async onUserTranscript(transcript: string): Promise<void> {
    if (transcript.trim().length === 0) {
      return;
    }
    if (this.firstUserTranscript === null) {
      // First spoken user utterance — the naming seed for a session-created conversation.
      this.firstUserTranscript = transcript;
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
      // Observability: record the channel tool call on the co-agent's run (run-only — NOT a chat
      // turn). Without this the run shows speech but never the browser_/Whiteboard_ actions the
      // co-agent took. Fire-and-forget; never disturbs the live surface mutation.
      void this.relayToolTurn(call.ToolName, call.ArgumentsJson, resultJson);
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
      console.error('[RealtimeSession] Tool execution failed:', error);
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
  private findClientToolHandler(toolName: string): RealtimeClientToolHandler | null {
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
  private async executeClientTool(handler: RealtimeClientToolHandler, call: RealtimeClientToolCall): Promise<string> {
    try {
      return await handler(call.ToolName, call.ArgumentsJson);
    } catch (error) {
      console.error('[RealtimeSession] Client tool execution failed:', error);
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
   * along as {@link RealtimeDelegationResult.RunID} for the overlay's dev links, and any `artifacts`
   * ride along as {@link RealtimeDelegationResult.Artifacts} for the surface panel's artifact tabs.
   */
  private emitDelegationResult(callId: string, resultJson: string): void {
    // The result will be spoken next — a deferred interim update is now pointless
    // (this is what keeps fast agents like Sage from narrating over their own answer),
    // and any progress still in the PubSub pipe for this call is stale.
    this.inFlightCallIds.delete(callId);
    this.cancelPendingNarration();
    if (this.cancelledCallIds.delete(callId)) {
      // The user explicitly cancelled this call: its card already flipped to the
      // "Cancelled by user" failed result, so the aborted run's late outcome must not
      // overwrite it. (The tool result still flows back to the model via the caller.)
      return;
    }
    const parsed = ParseDelegationResultJson(resultJson);
    this._delegationResult$.next({
      CallID: callId,
      Success: parsed.Success,
      Output: parsed.Output,
      RunID: parsed.RunID,
      Artifacts: parsed.Artifacts
    });
  }

  // ── Explicit delegation cancellation (server cancel channel) ───────────────

  /**
   * Cancels ONE in-flight delegated tool call — the overlay's per-card ✕ affordance.
   *
   * EXPLICIT USER INTENT ONLY (deliberate host policy): true barge-in never aborts
   * delegations — the narration design expects the user to talk while delegated work runs.
   * Calls the `CancelRealtimeSessionTool` mutation (ownership-gated server-side); when the
   * server reports it aborted the run, the card is flipped immediately to a FAILED
   * "Cancelled by user" result and the eventual late result from the aborted run is
   * suppressed (see {@link emitDelegationResult}).
   *
   * @returns `true` when the server aborted the in-flight run; `false` when there was
   *   nothing to cancel (the work finished first — its real result is already racing in)
   *   or the mutation failed (logged, never thrown).
   */
  public async CancelDelegation(callId: string): Promise<boolean> {
    if (!this.agentSessionId || !this.inFlightCallIds.has(callId)) {
      return false;
    }
    const aborted = await this.cancelSessionTool(callId);
    if (aborted <= 0) {
      return false; // finished first / nothing in flight server-side — let the real result land
    }
    this.surfaceUserCancellation(callId);
    return true;
  }

  /**
   * Cancels EVERY in-flight delegated tool call for the active session (callId-less form of
   * the `CancelRealtimeSessionTool` mutation). Exposed for host policies that need a
   * sweep-cancel (e.g. an explicit "stop everything" affordance) — NOT wired to barge-in,
   * by the same deliberate policy as {@link CancelDelegation}.
   *
   * @returns The number of in-flight runs the server aborted (0 when nothing was tracked
   *   in flight client-side, nothing was in flight server-side, or the mutation failed).
   */
  public async CancelInFlightDelegations(): Promise<number> {
    if (!this.agentSessionId || this.inFlightCallIds.size === 0) {
      return 0;
    }
    const aborted = await this.cancelSessionTool(null);
    if (aborted <= 0) {
      return 0;
    }
    for (const callId of [...this.inFlightCallIds]) {
      this.surfaceUserCancellation(callId);
    }
    return aborted;
  }

  /** Flips a cancelled call's card to the failed "Cancelled by user" result and suppresses the late real result. */
  private surfaceUserCancellation(callId: string): void {
    this.inFlightCallIds.delete(callId);
    this.cancelledCallIds.add(callId);
    this.cancelPendingNarration();
    this._delegationResult$.next({
      CallID: callId,
      Success: false,
      Output: 'Cancelled by user'
    });
  }

  /**
   * Calls the `CancelRealtimeSessionTool` mutation and unwraps its structured
   * `{ AbortedCount, Success, ErrorMessage }` result. Returns the aborted count —
   * 0 on a structured failure or a thrown transport error (both logged, never thrown).
   */
  private async cancelSessionTool(callId: string | null): Promise<number> {
    try {
      const mutation = `
        mutation CancelRealtimeSessionTool($agentSessionId: String!, $callId: String) {
          CancelRealtimeSessionTool(agentSessionId: $agentSessionId, callId: $callId) {
            AbortedCount
            Success
            ErrorMessage
          }
        }
      `;
      const result = await this.gql().ExecuteGQL(mutation, { agentSessionId: this.agentSessionId, callId });
      const payload = result?.CancelRealtimeSessionTool as
        | { AbortedCount?: number; Success?: boolean; ErrorMessage?: string }
        | undefined;
      if (!payload?.Success) {
        console.warn(`[RealtimeSession] Cancel reported failure: ${payload?.ErrorMessage ?? 'unknown error'}`);
        return 0;
      }
      return typeof payload.AbortedCount === 'number' ? payload.AbortedCount : 0;
    } catch (error) {
      console.error('[RealtimeSession] Failed to cancel in-flight delegation(s):', error);
      return 0;
    }
  }

  // ── Session minting (GraphQL) ──────────────────────────────────────────────

  /** Calls the `StartRealtimeClientSession` mutation to obtain an ephemeral token + config. */
  private async mintSession(
    targetAgentId: string,
    conversationId?: string | null,
    lastSessionId?: string | null,
    preferredModelId?: string | null,
    clientTools?: RealtimeToolDefinition[] | null,
    coAgentId?: string | null,
    configOverridesJson?: string | null,
    recordingConsent?: boolean | null,
    recordingStartedAt?: string | null,
    mediaCollectionId?: string | null,
    applicationId?: string | null,
    appContext?: AppContextSnapshot | null
  ): Promise<StartRealtimeClientSessionResult> {
    const mutation = `
      mutation StartRealtimeClientSession($targetAgentId: String!, $conversationId: String, $lastSessionId: String, $preferredModelId: String, $clientToolsJson: String, $coAgentId: String, $configOverridesJson: String, $recordingConsent: Boolean, $recordingStartedAt: String, $mediaCollectionId: String, $applicationId: String, $appContextJson: String) {
        StartRealtimeClientSession(targetAgentId: $targetAgentId, conversationId: $conversationId, lastSessionId: $lastSessionId, preferredModelId: $preferredModelId, clientToolsJson: $clientToolsJson, coAgentId: $coAgentId, configOverridesJson: $configOverridesJson, recordingConsent: $recordingConsent, recordingStartedAt: $recordingStartedAt, mediaCollectionId: $mediaCollectionId, applicationId: $applicationId, appContextJson: $appContextJson) {
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
      coAgentId: coAgentId ?? null,
      configOverridesJson: configOverridesJson ?? null,
      recordingConsent: recordingConsent ?? false,
      recordingStartedAt: recordingStartedAt ?? null,
      mediaCollectionId: mediaCollectionId ?? null,
      applicationId: applicationId ?? null,
      appContextJson: appContext ? JSON.stringify(appContext) : null
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
      console.error('[RealtimeSession] Failed to save channel state:', error);
      return false;
    }
  }

  // ── Transcript relay (GraphQL) ─────────────────────────────────────────────

  /**
   * Relays a final transcript turn to MJ via `RelayRealtimeTranscript`.
   *
   * When the session is being recorded, per-turn timing rides along: `utteranceEndMs` is the
   * recording-relative offset at finalization, and `utteranceStartMs` is the offset captured by
   * {@link markTurnAudioStart} when THIS turn's audio actually began (its first interim) — NOT
   * inherited from the previous turn's end. That distinction is the timing fix: when a tool-call
   * / silence gap sits between turns, the post-gap turn's audio starts much later, so inheriting
   * the prior turn's end stamped the cue ~gap-length too early. Both are omitted (left `null`)
   * when the session isn't being recorded.
   *
   * A correction (`replacesPrevious`) doesn't open a new turn, so it carries no start and doesn't
   * reset the per-turn start guard. After a normal finalization the guard is cleared so the NEXT
   * turn re-stamps its start from where ITS audio begins.
   *
   * @param replacesPrevious CORRECTION semantics: the server updates the session's most
   *   recent persisted turn of this role IN PLACE instead of appending (e.g. ElevenLabs'
   *   post-barge-in `agent_response_correction`).
   */
  private async relayTranscript(role: 'user' | 'assistant', text: string, replacesPrevious: boolean = false): Promise<void> {
    if (!this.agentSessionId) {
      return;
    }
    // Per-turn timing against the recording (when recording). `utteranceStartMs` is where this
    // turn's audio actually began (captured by markTurnAudioStart on the first interim); the
    // `?? 0` fallback covers a turn whose interim was missed / a final-only first turn.
    const utteranceEndMs = this.recorder ? this.recorder.NowOffsetMs() : null;
    const utteranceStartMs = this.recorder && !replacesPrevious ? (this.currentTurnStartMs ?? 0) : null;
    if (this.recorder && !replacesPrevious) {
      // This turn is finalized — arm the NEXT turn to re-stamp its start from its own first
      // interim (handles a tool-call gap before the next turn). Stop inheriting this end as the
      // next start. `null` means "not yet captured"; relay falls back to `?? 0` if no interim fires.
      this.currentTurnStartMs = null;
      this.turnAudioStartCaptured = false;
    }
    try {
      const mutation = `
        mutation RelayRealtimeTranscript($agentSessionId: String!, $role: String!, $text: String!, $replacesPrevious: Boolean, $utteranceStartMs: Int, $utteranceEndMs: Int) {
          RelayRealtimeTranscript(agentSessionId: $agentSessionId, role: $role, text: $text, replacesPrevious: $replacesPrevious, utteranceStartMs: $utteranceStartMs, utteranceEndMs: $utteranceEndMs)
        }
      `;
      await this.gql().ExecuteGQL(mutation, {
        agentSessionId: this.agentSessionId,
        role,
        text,
        replacesPrevious,
        utteranceStartMs,
        utteranceEndMs
      });
    } catch (error) {
      console.error('[RealtimeSession] Failed to relay transcript:', error);
    }
  }

  /**
   * Relays a co-agent CHANNEL tool-call turn (browser_ / Whiteboard_ etc.) to the session's run for
   * observability via `RelayRealtimeToolTurn` — so the co-agent's AIPromptRun shows what it DID, not
   * just what it said. Run-only by design: deliberately NOT a `ConversationDetail` turn, so the chat
   * thread stays speech-only. Best-effort — a failed relay never disturbs the live call.
   */
  private async relayToolTurn(toolName: string, argsJson: string, resultJson: string): Promise<void> {
    if (!this.agentSessionId) {
      return;
    }
    try {
      const mutation = `
        mutation RelayRealtimeToolTurn($agentSessionId: String!, $toolName: String!, $argsJson: String, $resultJson: String) {
          RelayRealtimeToolTurn(agentSessionId: $agentSessionId, toolName: $toolName, argsJson: $argsJson, resultJson: $resultJson)
        }
      `;
      await this.gql().ExecuteGQL(mutation, {
        agentSessionId: this.agentSessionId,
        toolName,
        argsJson,
        resultJson
      });
    } catch (error) {
      console.error('[RealtimeSession] Failed to relay tool turn:', error);
    }
  }

  // ── Usage telemetry relay (B7) ─────────────────────────────────────────────

  /**
   * Accumulates one usage DELTA from the realtime client (per-response token counts —
   * the `OnUsage` contract shape) and schedules the debounced relay. Negative / non-finite
   * values are clamped to 0; an all-zero delta is dropped without arming the timer.
   */
  private onUsageDelta(usage: RealtimeClientUsage): void {
    const input = this.clampUsageDelta(usage.InputTokens);
    const output = this.clampUsageDelta(usage.OutputTokens);
    if (input === 0 && output === 0) {
      return;
    }
    this.pendingUsageInput += input;
    this.pendingUsageOutput += output;
    if (!this.usageFlushTimer) {
      this.usageFlushTimer = setTimeout(() => {
        this.usageFlushTimer = null;
        void this.flushPendingUsage();
      }, RealtimeSessionService.UsageFlushDebounceMs);
    }
  }

  /** Clamps a driver-reported token delta: undefined / negative / non-finite become 0. */
  private clampUsageDelta(value: number | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  /**
   * Relays the accumulated usage deltas to the server via `RelayRealtimeUsage` (which
   * accumulates them onto the co-agent `AIPromptRun`). Best-effort: a failed relay
   * re-accumulates the captured deltas so the next debounce / teardown flush retries —
   * usage telemetry must never disturb the live call.
   *
   * @param agentSessionId Optional EXPLICIT session id (the teardown flush runs while the
   *   live id is still set, but accepts it as a parameter for symmetry with channel saves).
   */
  private async flushPendingUsage(agentSessionId?: string | null): Promise<void> {
    const sessionId = agentSessionId ?? this.agentSessionId;
    const input = this.pendingUsageInput;
    const output = this.pendingUsageOutput;
    if (!sessionId || (input === 0 && output === 0)) {
      return;
    }
    this.pendingUsageInput = 0;
    this.pendingUsageOutput = 0;
    try {
      const mutation = `
        mutation RelayRealtimeUsage($agentSessionId: String!, $inputTokens: Int!, $outputTokens: Int!) {
          RelayRealtimeUsage(agentSessionId: $agentSessionId, inputTokens: $inputTokens, outputTokens: $outputTokens)
        }
      `;
      await this.gql().ExecuteGQL(mutation, { agentSessionId: sessionId, inputTokens: input, outputTokens: output });
    } catch (error) {
      console.error('[RealtimeSession] Failed to relay usage telemetry:', error);
      // Re-accumulate so a later debounce / the teardown flush retries the same deltas.
      this.pendingUsageInput += input;
      this.pendingUsageOutput += output;
    }
  }

  /** Cancels the pending debounced usage flush and zeroes the accumulators (teardown tail). */
  private resetUsageRelay(): void {
    if (this.usageFlushTimer) {
      clearTimeout(this.usageFlushTimer);
      this.usageFlushTimer = null;
    }
    this.pendingUsageInput = 0;
    this.pendingUsageOutput = 0;
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
        error: (err: unknown) => console.error('[RealtimeSession] Delegation progress stream error:', err)
      });
  }

  /**
   * Parses one push-status message and routes it: a Remote Browser screencast frame goes to the active
   * Remote Browser channel's canvas; a delegation-progress event is dispatched + narrated. Other shapes
   * (normal agent-run streams) are ignored. Screencast frames are checked FIRST and short-circuit, so the
   * delegation path is untouched.
   */
  private onDelegationStatusMessage(raw: string): void {
    const frame = this.parseScreencastFrame(raw);
    if (frame) {
      this.routeScreencastFrame(frame);
      return;
    }
    const audio = this.parseAudioChunk(raw);
    if (audio) {
      this.routeAudioChunk(audio);
      return;
    }
    const progress = this.parseProgress(raw);
    if (progress) {
      this.dispatchProgress(progress);
    }
  }

  /**
   * Parses a push-status message and returns it only when it's a Remote Browser screencast frame for the
   * active session — otherwise `null` (ignored, so delegation progress falls through). Matched by
   * `resolver` + `type`, then scoped to THIS session by `agentSessionID`.
   */
  private parseScreencastFrame(raw: string): RemoteBrowserScreencastPayload | null {
    let payload: { resolver?: string } & Partial<RemoteBrowserScreencastPayload>;
    try {
      payload = JSON.parse(raw);
    } catch {
      return null;
    }
    const matches =
      payload?.resolver === 'RemoteBrowserActionResolver' &&
      payload?.type === 'RemoteBrowserScreencastFrame' &&
      payload?.agentSessionID === this.agentSessionId &&
      typeof payload?.dataBase64 === 'string';
    return matches ? (payload as RemoteBrowserScreencastPayload) : null;
  }

  /**
   * Forwards a screencast frame to the active Remote Browser channel plugin so it paints the frame on its
   * surface canvas. The plugin is found among the session's active channels by its `ChannelName`; located
   * via a structural guard so the service stays decoupled from the concrete channel class.
   */
  private routeScreencastFrame(frame: RemoteBrowserScreencastPayload): void {
    for (const channel of this._activeChannels$.value) {
      if (channel.ChannelName === 'Remote Browser' && this.hasOnScreencastFrame(channel)) {
        channel.OnScreencastFrame(frame.dataBase64);
        return;
      }
    }
  }

  /** Structural guard: true when the channel exposes an `OnScreencastFrame(dataBase64)` method. */
  private hasOnScreencastFrame(
    channel: BaseRealtimeChannelClient,
  ): channel is BaseRealtimeChannelClient & { OnScreencastFrame(dataBase64: string): void } {
    return typeof (channel as { OnScreencastFrame?: unknown }).OnScreencastFrame === 'function';
  }

  /**
   * Parses a push-status message and returns it only when it's a Remote Browser audio chunk for the active
   * session — otherwise `null` (ignored). Matched by `resolver` + `type`, then scoped to THIS session by
   * `agentSessionID`.
   */
  private parseAudioChunk(raw: string): RemoteBrowserAudioChunkPayload | null {
    let payload: { resolver?: string } & Partial<RemoteBrowserAudioChunkPayload>;
    try {
      payload = JSON.parse(raw);
    } catch {
      return null;
    }
    const matches =
      payload?.resolver === 'RemoteBrowserActionResolver' &&
      payload?.type === 'RemoteBrowserAudioChunk' &&
      payload?.agentSessionID === this.agentSessionId &&
      typeof payload?.dataBase64 === 'string';
    return matches ? (payload as RemoteBrowserAudioChunkPayload) : null;
  }

  /**
   * Forwards an audio chunk to the active Remote Browser channel plugin so it plays the chunk through its
   * client-side audio player. The plugin is found among the session's active channels by its `ChannelName`;
   * located via a structural guard so the service stays decoupled from the concrete channel class.
   */
  private routeAudioChunk(chunk: RemoteBrowserAudioChunkPayload): void {
    for (const channel of this._activeChannels$.value) {
      if (channel.ChannelName === 'Remote Browser' && this.hasOnAudioChunk(channel)) {
        channel.OnAudioChunk({
          dataBase64: chunk.dataBase64,
          codec: chunk.codec,
          sampleRate: chunk.sampleRate,
          channels: chunk.channels,
          seq: chunk.seq,
        });
        return;
      }
    }
  }

  /** Structural guard: true when the channel exposes an `OnAudioChunk(chunk)` method. */
  private hasOnAudioChunk(
    channel: BaseRealtimeChannelClient,
  ): channel is BaseRealtimeChannelClient & { OnAudioChunk(chunk: { dataBase64: string; codec: string; sampleRate: number; channels: number; seq: number }): void } {
    return typeof (channel as { OnAudioChunk?: unknown }).OnAudioChunk === 'function';
  }

  /**
   * Parses a push-status message and returns it only when it's a delegation
   * progress event for the active voice session — otherwise `null` (ignored).
   */
  private parseProgress(raw: string): RealtimeDelegationProgress | null {
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
  private dispatchProgress(progress: RealtimeDelegationProgress): void {
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
  private narrateProgress(progress: RealtimeDelegationProgress): void {
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
    if (this.pendingNarrationMessages.length > RealtimeSessionService.MaxDigestMessages) {
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
      ? this.delegationBurstStartedAt + RealtimeSessionService.FirstNarrationDelayMs
      : 0;
    const spacingFloor = this.lastDelegationNarrationAt > 0
      ? this.lastDelegationNarrationAt + RealtimeSessionService.NarrationIntervalMs
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
      this.narrationTimer = setTimeout(() => this.fireDeferredNarration(), RealtimeSessionService.NarrationBusyRetryMs);
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
   * The wording is DB-driven: the server-resolved `Realtime Co-Agent - Progress Narration`
   * template (substituting `{{ progressMessage }}`) when present, otherwise the built-in
   * fallback so deployments that haven't synced the prompt behave exactly as before.
   * The client tags the resulting turn as narration, keeping it EPHEMERAL — surfaced on
   * {@link DelegationNarration$} instead of becoming a caption / persisted ConversationDetail.
   */
  private buildNarrationInstructions(digest: string): string {
    return BuildNarrationInstructions(this.narrationTemplate, digest, {
      PriorNarrations: this.spokenNarrations.slice(-RealtimeSessionService.MaxPriorNarrations),
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
    this.cancelledCallIds.clear();
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

    // Stop + upload the call recording WHILE the live session id is still set (the file is
    // attached to it). Best-effort and never blocks teardown — stopAndUploadRecording swallows
    // its own errors. No-op when nothing was recorded.
    await this.stopAndUploadRecording(this.agentSessionId);
    this.recordingStartedAtIso = null;

    // Final usage flush WHILE the live session id is still set (the relay mutation also
    // accepts a Closed session, so ordering vs. CloseAgentSession is belt-and-braces).
    if (this.usageFlushTimer) {
      clearTimeout(this.usageFlushTimer);
      this.usageFlushTimer = null;
    }
    await this.flushPendingUsage(this.agentSessionId);
    this.resetUsageRelay();

    if (closeServerSession && this.agentSessionId) {
      await this.closeServerSession(this.agentSessionId);
    }

    // Capture the session id BEFORE we null it so the lifecycle emit carries it.
    // Skip emitting when there was no live session (defensive — teardown is safe
    // to call without an active session).
    const closedSessionId = this.agentSessionId;
    this.agentSessionId = null;
    this.narrationTemplate = null;
    this.clientToolHandlers.clear();
    this._modelName$.next(null);
    this.SetMinimized(false);
    this._active$.next(false);
    if (this._connectionState$.value !== 'error') {
      this._connectionState$.next('closed');
    }

    // Surface generic session-ended for the conversations runtime bridge.
    // `closeServerSession=true` means the user explicitly called EndRealtimeSession;
    // `false` means teardown ran from a catch block (start path error path).
    if (closedSessionId) {
      this._sessionEnded$.next({
        sessionId: closedSessionId,
        reason: closeServerSession ? 'explicit' : 'error',
      });
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
      console.error('[RealtimeSession] Failed to close server session:', error);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Pushes a caption onto the live list (immutable update for change detection). */
  private appendCaption(caption: RealtimeCaption): void {
    this._captions$.next([...this._captions$.value, caption]);
  }

  /** Resets reactive + internal state at the start of a session. */
  private resetState(): void {
    this._captions$.next([]);
    this.SetMinimized(false);
    this.stopSegmentFlushing();
    this.segmentIndex = 0;
    this.recorder = null;
    this.recordingStartedAtIso = null;
    this.currentTurnStartMs = null;
    this.turnAudioStartCaptured = false;
    this.usedChannelNames.clear();
  }

  /** The GraphQL provider used for relay mutations. */
  private gql(): GraphQLDataProvider {
    return this.Provider as GraphQLDataProvider;
  }
}
