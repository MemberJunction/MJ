import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { Metadata, IMetadataProvider } from '@memberjunction/core';
import { UserInfoEngine, type MJAIAgentChannelEntity, type MJAIAgentChannelEntity_IChannelUIConfig } from '@memberjunction/core-entities';
import { AddRealtimeUsageRecord, AIEngineBase, HasRealtimeUsage, type RealtimeUsageRecord } from '@memberjunction/ai-engine-base';
import { GraphQLDataProvider, GraphQLRealtimeSessionClient } from '@memberjunction/graphql-dataprovider';
import { MJGlobal } from '@memberjunction/global';
import { ClientRealtimeSessionConfig, DEFAULT_REALTIME_AUDIO_TRACKS, JSONObject, JSONValue, ParseRealtimeAvatarStatus, ParseRealtimeClientTransport, RealtimeToolDefinition, RealtimeTrackDescriptor, RealtimeTrackDirection } from '@memberjunction/ai';
import {
  AppContextSnapshot,
  CompareExposure,
  DeclaresNativeTools,
  IsIdentityVerifiedEventPayload,
  NormalizeChannelKey,
  ParseRealtimeSessionClientPolicy,
  ResolveClientTools,
  SelectNativeChannelTools,
  UserExposureReason,
  type ClientToolMetadata,
  type IdentityVerifiedEventPayload,
  type RealtimeChannelExposure,
  type RealtimeChannelScopeResult,
  type RealtimeSessionClientTools,
  type ResolvedRealtimeChannel
} from '@memberjunction/ai-core-plus';
import {
  BaseRealtimeClient,
  type ILocalMediaController,
  type LocalMediaFailure,
  LoadAssemblyAIRealtimeClient,
  LoadElevenLabsRealtimeClient,
  LoadGeminiEnterpriseRealtimeClient,
  LoadGeminiRealtimeClient,
  LoadHuggingFaceRealtimeClient,
  LoadOpenAIRealtimeClient,
  LoadxAIRealtimeClient,
  RealtimeAudioActivity,
  RealtimeClientError,
  RealtimeClientState,
  RealtimeClientToolCall,
  RealtimeClientTranscript,
  RealtimeClientUsage,
  VideoSourceArbiter,
  type DisplayCaptureOptions,
  type MediaVideoSource,
  type VideoSourceState,
  REQUESTED_TRACKS_SESSION_KEY
} from '@memberjunction/ai-realtime-client';
import { DefaultRealtimeSessionLauncher, HasClientCredential, type IRealtimeSessionLauncher } from './session-launcher';
import { RequestsAgentVideo, ResolveAvatarNotice, type RealtimeAvatarNotice } from './avatar-notice';
import { ClientSessionDeadline } from './client-session-deadline';
import {
  RealtimeCaptures,
  REALTIME_CAPTURES_OFF,
  REALTIME_CAPTURE_OFFERS_NONE,
  type RealtimeCaptureAdmission,
  type RealtimeCaptureOffers,
  type RealtimeCaptureKind,
  type RealtimeCaptureState,
  type RealtimeCaptureStates,
} from './realtime-captures';
import { RealtimeSessionEventHub, type IRealtimeSessionEventSource, type RealtimeSessionStreamEvent } from './session-event-hub';
import { BuildNarrationInstructions } from '../narration/narration-template';
import { ParseDelegationResultJson, ParsedDelegationArtifact, FormatToolName } from './delegation-result-parser';
import { BaseRealtimeChannelClient, RealtimeChannelContext } from '../channels/base-realtime-channel-client';
import { DEFAULT_CHANNEL_SURFACE_PLACEMENT, ReadChannelSurfacePlacement, type ChannelSurfacePlacement } from '../channels/channel-surface-placement';
import { IRealtimeMediaHost, IRealtimeSessionRecorder } from '../hosts/IRealtimeMediaHost';
import { ChannelActionDispatcher, type DispatchableChannel } from '../channels/channel-action-dispatcher';
import { BuildChannelCatalogNote, type ChannelCatalogEntry } from '../channels/channel-catalog-note';
import type { RealtimeContextActionRequest, RealtimeContextActionResult } from '../channels/channel-contract-types';
import { AppClientToolRegistry, DEFAULT_APP_TOOL_OWNER, type AppClientToolRegistration } from './app-client-tool-registry';
import { UserSettingsExposurePreferences, type IChannelExposurePreferences } from './channel-exposure-preferences';
import {
  BuildChannelCandidate,
  FindPreparedChannel,
  MergeToolMetadata,
  ReconcileChannelsWithPolicy,
  ResolveLocalChannelScope,
  ToolsByChannelKey,
  type PreparedChannel,
  type RealtimeHostChannelDeclaration,
  type RealtimeSessionStartOptions
} from './channel-session-scope';

/**
 * `MJ: User Settings` key for the per-user "record this voice call" consent toggle. Stored as
 * the literal string `'true'`/`'false'` (read with `=== 'true'`), cross-device via
 * {@link UserInfoEngine}. The pre-call picker writes it; the session service reads it as the
 * default when the caller doesn't pass an explicit consent value.
 */
export const REALTIME_RECORDING_CONSENT_KEY = 'mj.realtimeVoice.recordingConsent.v1';

/**
 * Relays usage onto the co-agent prompt run: token deltas, and the per-modality detail blocks as a
 * JSON record (sent only when there are any; see `RelayRealtimeUsage` in MJServer).
 */
const RELAY_REALTIME_USAGE_MUTATION = `
  mutation RelayRealtimeUsage($agentSessionId: String!, $inputTokens: Int!, $outputTokens: Int!, $usageDetailsJson: String) {
    RelayRealtimeUsage(agentSessionId: $agentSessionId, inputTokens: $inputTokens, outputTokens: $outputTokens, usageDetailsJson: $usageDetailsJson)
  }
`;

// Tree-shaking prevention: the OpenAI client is resolved dynamically through the
// ClassFactory (by the server-reported Provider key), so this static call is what keeps
// its @RegisterClass side effect from being eliminated by the bundler.
// NOTE: the interactive-channel plugins (resolved dynamically from the `MJ: AI Agent
// Channels` registry by ClientPluginClass key) get the same treatment, but their Load
// calls live in `conversations.module.ts` — plugins carry Angular surface COMPONENTS,
// and this service stays component-free (it must stay importable in plain-node tests).
LoadOpenAIRealtimeClient();
LoadGeminiRealtimeClient();
LoadGeminiEnterpriseRealtimeClient();
LoadElevenLabsRealtimeClient();
LoadAssemblyAIRealtimeClient();
LoadxAIRealtimeClient();
LoadHuggingFaceRealtimeClient();

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
 * A delegated-run progress update surfaced to the UI, emitted on {@link RealtimeSessionRuntime.DelegationProgress$}.
 * These originate server-side during an `invoke-target-agent` delegation (e.g. while Sage works) and let a
 * future overlay render a "working" card while the realtime model narrates the same progress aloud.
 */
export interface RealtimeDelegationProgress {
  /** The tool/agent call this progress belongs to. */
  CallID: string;
  /** The raw tool name when this progress represents a direct action (e.g. `File_Storage_List_Objects`). */
  ToolName?: string;
  /** The delegation phase: `prompt_execution` | `action_execution` | `subagent_execution` | `decision_processing` | `direct_action`. */
  Step: string;
  /** Human-readable progress message. */
  Message: string;
  /** Optional completion percentage (0–100) when the server can estimate it. */
  Percentage?: number;
}

/**
 * The terminal result of a delegated tool call, emitted on {@link RealtimeSessionRuntime.DelegationResult$}
 * when the delegation finishes so the overlay can flip the "working" card into a result card with real
 * content + provenance.
 */
export interface RealtimeDelegationResult {
  /** The tool/agent call this result belongs to. */
  CallID: string;
  /** The raw tool name when this result represents a direct action. */
  ToolName?: string;
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
 * registered via {@link RealtimeSessionRuntime.RegisterClientToolHandler}. Receives the tool name +
 * raw arguments JSON from the realtime model and returns the result JSON string fed back as the
 * `tool_response`. May be sync or async; thrown errors are wrapped into a
 * `{ success: false, error }` payload by the service so the model can narrate the failure.
 */
export type RealtimeClientToolHandler = (toolName: string, argsJson: string) => string | Promise<string>;

/**
 * A channel's request to enter / leave the FOCUS layout, emitted on
 * {@link RealtimeSessionRuntime.ChannelFocus$} when a plugin calls its context's
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
 * The narrow projection of an `MJ: AI Agent Channels` registry row the service reads at session
 * start from {@link AIEngineBase}'s cached `AgentChannels`. Inactive rows are kept: `IsActive = false`
 * is the master kill switch, and the scope decision has to see it to honor it.
 */
interface RealtimeChannelDefinitionRow {
  ID: string;
  Name: string;
  ClientPluginClass: string;
  IsActive: boolean;
  /** Where the channel's surface shows and may move, from the row's `UIConfig`. */
  SurfacePlacement: ChannelSurfacePlacement;
}

/**
 * A registry row's surface placement. A row whose `UIConfig` is not valid JSON places its surface as a row without one
 * does, so one bad row never costs the session its other channels.
 */
function readRowSurfacePlacement(row: MJAIAgentChannelEntity): ChannelSurfacePlacement {
  try {
    return ReadChannelSurfacePlacement(row.UIConfigObject);
  } catch {
    console.warn(`[RealtimeSession] Channel '${row.Name}' has a UIConfig that is not valid JSON; its surface starts on its tab.`);
    return DEFAULT_CHANNEL_SURFACE_PLACEMENT;
  }
}

/** The same, for a row read over GraphQL, whose `UIConfig` arrives as the column's JSON text. */
function readUIConfigTextSurfacePlacement(name: string, uiConfig: string | null | undefined): ChannelSurfacePlacement {
  if (!uiConfig) {
    return ReadChannelSurfacePlacement(null);
  }
  try {
    return ReadChannelSurfacePlacement(JSON.parse(uiConfig) as MJAIAgentChannelEntity_IChannelUIConfig);
  } catch {
    console.warn(`[RealtimeSession] Channel '${name}' has a UIConfig that is not valid JSON; its surface starts on its tab.`);
    return DEFAULT_CHANNEL_SURFACE_PLACEMENT;
  }
}

/** A registry row as the connect-only path's dynamic view returns it. */
type ChannelRegistryViewRow = Pick<RealtimeChannelDefinitionRow, 'ID' | 'Name' | 'ClientPluginClass'> & { IsActive?: boolean; UIConfig?: string | null };

/**
 * One EPHEMERAL spoken narration of delegated-run progress, emitted on
 * {@link RealtimeSessionRuntime.DelegationNarration$}. These are the interim "here's what's
 * happening" utterances the realtime model speaks while a delegation runs. By product
 * decision they are NOT captions and NOT persisted as ConversationDetails — they exist
 * only as a live note in the overlay, replaced by each newer narration.
 */
export interface RealtimeDelegationNarration {
  /** The narration transcript text. */
  Text: string;
}

/**
 * Converts a {@link RealtimeTrackDescriptor} to its JSON form for the session-config bag.
 *
 * Every field's VALUE is already JSON-safe; the interface simply is not assignable to `JSONValue`
 * because it declares no index signature and `UsageBasis` is `readonly`. Written out field by field
 * rather than asserted, so adding a descriptor field is a compile error here instead of a field that
 * silently stops reaching the driver.
 */
function trackDescriptorToJSON(track: RealtimeTrackDescriptor): JSONObject {
  const json: JSONObject = { Modality: track.Modality, Direction: track.Direction };
  if (track.Encoding !== undefined) {
    json['Encoding'] = track.Encoding;
  }
  if (track.Rate !== undefined) {
    json['Rate'] = track.Rate;
  }
  if (track.UsageBasis !== undefined) {
    json['UsageBasis'] = [...track.UsageBasis];
  }
  if (track.RequiresConsent !== undefined) {
    json['RequiresConsent'] = track.RequiresConsent;
  }
  return json;
}

/**
 * Reads the `Direction:Modality` dedupe key off an already-JSON track entry, or `null` when the
 * entry is not a track-shaped object. Used for tracks the mint supplied, which arrive as raw JSON.
 */
function trackKeyFromJSON(raw: JSONValue): string | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const direction = raw['Direction'];
  const modality = raw['Modality'];
  if (typeof direction !== 'string' || typeof modality !== 'string') {
    return null;
  }
  return `${direction}:${modality}`;
}

/**
 * The `DOMException` name for each way the controller can fail to start the microphone, so a host that
 * tells a denied microphone apart (`error.name === 'NotAllowedError'`) works the same with or without one.
 */
const MICROPHONE_ERROR_NAMES: Record<LocalMediaFailure, string> = {
  denied: 'NotAllowedError',
  'not-found': 'NotFoundError',
  'in-use': 'NotReadableError',
  unsupported: 'NotSupportedError',
  error: 'Error',
};

/** What the user is told when the call's policy refuses a capture. */
const CAPTURE_WORDING: Record<RealtimeCaptureKind, { NotInCall: string; NotAllowed: string }> = {
  camera: { NotInCall: 'The camera is not part of this call.', NotAllowed: 'This call cannot show the agent your camera' },
  screen: { NotInCall: 'Screen sharing is not part of this call.', NotAllowed: 'This call cannot show the agent your screen' },
};

/** The error a failed microphone start reports, named as `getUserMedia` would have named it. */
function microphoneStartError(reason: LocalMediaFailure, message: string): Error {
  const error = new Error(message);
  error.name = MICROPHONE_ERROR_NAMES[reason];
  return error;
}

/** The microphone a session start opened, or why it could not. */
type OpenedMicrophone = { Stream: MediaStream; Error: null } | { Stream: null; Error: Error };

/**
 * One thought/reasoning narration emitted on {@link RealtimeSessionRuntime.ThoughtNarration$}.
 * Distinct from spoken progress narrations: thought summaries are authored by reasoning models
 * (e.g. Gemini 3.8 Live Extended Thinking) and are NOT spoken aloud.
 */
export interface RealtimeThoughtNarration {
  /** Correlating call ID if associated with a delegation/turn; otherwise generated or empty. */
  CallID?: string;
  /** The model's thought / reasoning text. */
  Text: string;
  /** Whether this emission represents the complete finalized thought turn. */
  IsFinal?: boolean;
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
  /**
   * The browser's URL when the frame was captured (#3496). Optional: a server older than that change
   * omits it, and the channel then behaves exactly as it did before rather than reading `undefined`
   * as "the page has no URL".
   */
  currentUrl?: string | null;
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
 *
 * Exported because a host may mint the session ITSELF (its own mutation, carrying
 * server-side context the stock mutation cannot express) and then hand the result to
 * {@link RealtimeSessionRuntime.StartRealtimeSessionFromResult} to run it — this is the
 * contract that path is written against.
 */
export interface StartRealtimeClientSessionResult {
  AgentSessionId: string;
  ConversationId: string | null;
  Provider: string;
  Model: string;
  /** The provider credential the client driver presents. Empty on a relay session, which has {@link RelayUrl} instead. */
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
  /**
   * OPTIONAL — the server's resolved `RealtimeSessionClientPolicy` (from `@memberjunction/ai-core-plus`) as JSON: which of the channel
   * candidates the client reported at mint are in this session (agent/app scoping and the registry's
   * kill switch already applied), their resolved display and config, and the app/static client-tool
   * tiers. Absent from a server that predates channel scoping and from a host that mints through its
   * own proxy; the runtime then resolves the scope locally from code defaults and host declarations.
   */
  ClientPolicyJson?: string | null;
  /**
   * OPTIONAL — the session's live-avatar status (`RealtimeAvatarStatus` from `@memberjunction/ai`) as JSON: whether the
   * voiced agent asked for an avatar, whether the model renders it, and why not. The runtime reads it after connecting
   * to publish {@link RealtimeSessionRuntime.AvatarNotice$}. Absent from a server that predates it, when the agent asked
   * for no avatar, and from a host that mints for itself and does not pass it on; the call then shows no notice.
   */
  AvatarStatusJson?: string | null;
  /**
   * OPTIONAL — how the browser reaches the provider: `'direct'` or `'relay'` (`RealtimeClientTransport` from
   * `@memberjunction/ai`). Absent, null or unknown means direct: a direct session, or a server that predates it.
   */
  Transport?: string | null;
  /**
   * OPTIONAL — where a relay session's client driver connects (MJAPI's realtime relay). It carries the session's ticket,
   * so it is a credential: never log it. A host that mints for itself must pass it on for a relay session.
   */
  RelayUrl?: string | null;
}

/**
 * Host-supplied inputs that accompany an already-minted session on
 * {@link RealtimeSessionRuntime.StartRealtimeSessionFromResult} — the values the RUN half needs
 * that a {@link StartRealtimeClientSessionResult} cannot carry. Every field is optional and
 * mirrors the same-named {@link RealtimeSessionRuntime.StartRealtimeSession} parameter, defaults
 * included: omit one and the session behaves exactly as the all-in-one entry point does when that
 * parameter is omitted.
 */
export interface RealtimeSessionRunOptions {
  /**
   * The conversation the host asked its OWN mint for, or null/omitted when it asked the server to
   * create one. Only the ORIGINAL request tells the two apart: a null here plus a
   * `ConversationId` on the result means the server created that conversation for this session,
   * which the host is told about via {@link RealtimeSessionRuntime.SessionCreatedConversationId}.
   */
  readonly conversationId?: string | null;
  /**
   * Display name of the target agent, surfaced on {@link RealtimeSessionRuntime.AgentName$} so any
   * host can render it without re-resolving. Omitted ⇒ the previous name stands.
   */
  readonly agentName?: string | null;
  /**
   * EXPLICIT "record this call" consent for THIS session. Omitted/`null` ⇒ the per-user persisted
   * preference (`mj.realtimeVoice.recordingConsent.v1`) is read as the default; `false` never
   * records. The host is responsible for reporting its own choice to its own mint.
   */
  readonly recordingConsent?: boolean | null;
  /**
   * The application the session runs in. Stored so the live ClientContextChannel can stream
   * subsequent context deltas under it. Omitted ⇒ no app layer (the pre-app behavior).
   */
  readonly applicationId?: string | null;
  /**
   * Live app-context snapshot. Omitted/`null` ⇒ the snapshot the host has already pushed via
   * {@link RealtimeSessionRuntime.UpdateAppContext} stands (never clobber a good value with null).
   */
  readonly appContext?: AppContextSnapshot | null;
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
 * Lifecycle: {@link StartRealtimeSession} → live duplex → {@link EndRealtimeSession}. A start is
 * two halves — MINT (the `StartRealtimeClientSession` mutation) and RUN (everything above) — and a
 * host that must mint through its own server surface enters at the second half via
 * {@link StartRealtimeSessionFromResult}; there is one implementation of the run half either way.
 */
export class RealtimeSessionRuntime {
  /**
   * @param mediaHost the platform's media capabilities. The runtime never touches `navigator`,
   *                  `Blob` or `FileReader` itself — microphone acquisition and audio recording
   *                  are the host's, because both are platform-specific product decisions
   *                  (permission UX, container format, where the bytes live).
   */
  constructor(protected readonly mediaHost: IRealtimeMediaHost) {}

  // ── Reactive UI state ──────────────────────────────────────────────────────
  private _connectionState$ = new BehaviorSubject<RealtimeConnectionState>('closed');
  private _captions$ = new BehaviorSubject<RealtimeCaption[]>([]);
  private _active$ = new BehaviorSubject<boolean>(false);
  private _delegationProgress$ = new Subject<RealtimeDelegationProgress>();
  private _delegationResult$ = new Subject<RealtimeDelegationResult>();
  private _delegationNarration$ = new Subject<RealtimeDelegationNarration>();
  private _thoughtNarration$ = new Subject<RealtimeThoughtNarration>();
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
  /**
   * Model-authored thought / reasoning narrations (see {@link RealtimeThoughtNarration}). These are
   * reasoning summaries author-emitted during extended thinking, separate from spoken progress updates.
   */
  public readonly ThoughtNarration$: Observable<RealtimeThoughtNarration> = this._thoughtNarration$.asObservable();
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

  private readonly _videoSources$ = new BehaviorSubject<readonly VideoSourceState[]>([]);
  /**
   * The video sources the agent is perceiving or could perceive right now (a whiteboard, a remote browser, a
   * shared screen), with whether each is on and whether its frames are reaching the model. Empty when no
   * session is live or nothing has offered a frame source. This is what the "agent can see" control renders;
   * toggle one with {@link SetVideoSourceEnabled}.
   */
  public readonly VideoSources$: Observable<readonly VideoSourceState[]> = this._videoSources$.asObservable();

  private readonly _captures$ = new BehaviorSubject<RealtimeCaptureStates>(REALTIME_CAPTURES_OFF);
  /**
   * The user's camera and screen share: off, starting, on (with the stream to show the user) or failed (with the
   * reason). Both off outside a session. Start and stop them with {@link StartCamera}, {@link StartScreenShare},
   * {@link StopCamera} and {@link StopScreenShare}; while one is on, it is also a source on {@link VideoSources$}.
   */
  public readonly Captures$: Observable<RealtimeCaptureStates> = this._captures$.asObservable();

  private readonly _captureOffers$ = new BehaviorSubject<RealtimeCaptureOffers>(REALTIME_CAPTURE_OFFERS_NONE);

  /**
   * Which captures the call offers, now and on every change. A capture is offered while the call is connected, the model
   * takes inbound video, the host can open it (a camera controller; screen sharing) and the call's policy admits it (its
   * channel is in the call and may show the agent pixels). A host shows its Camera and Share controls from this. Neither
   * is offered outside a call.
   */
  public readonly CaptureOffers$: Observable<RealtimeCaptureOffers> = this._captureOffers$.asObservable();

  private readonly _agentVideo$ = new BehaviorSubject<MediaVideoSource | null>(null);
  /**
   * The agent's video (an avatar) while the model sends it: a live stream, or a player that owns the `<video>` element.
   * `null` until the video arrives, for a model that sends none, and outside a call. The driver hands it over once it is
   * live, and a newer one replaces it. A host shows it with `AttachVideoSource`; a channel that sinks outbound video
   * follows it through its context, and counts as used once it arrives, so the host shows that channel's surface.
   */
  public readonly AgentVideo$: Observable<MediaVideoSource | null> = this._agentVideo$.asObservable();

  private readonly _avatarNotice$ = new BehaviorSubject<RealtimeAvatarNotice | null>(null);
  /**
   * Why the call shows no avatar the agent asked for: set once per call, after it connects, when the model renders none,
   * the persona has no face for it, the app shows no agent video (`host`) or the browser can't play it (`browser`).
   * `null` when there is nothing to say (no avatar asked for, the avatar shows, or the mint reported no status) and after
   * the call ends. A provider resume inside the call does not set it again. A host turns the reason into words once,
   * for example "Audio only: this voice model can't show an avatar".
   */
  public readonly AvatarNotice$: Observable<RealtimeAvatarNotice | null> = this._avatarNotice$.asObservable();

  /** Synchronous access to {@link AvatarNotice$}'s current value. */
  public get CurrentAvatarNotice(): RealtimeAvatarNotice | null {
    return this._avatarNotice$.value;
  }

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
  /** Buffer accumulating streaming user interim deltas into a single in-progress bubble. */
  private pendingUserCaption = '';
  /** Whether an in-place interim user caption is currently placed in `_captions$`. */
  private hasActiveInterimUserCaption = false;

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
  /** The host's camera-and-microphone controller for this session, when the host offers one. */
  private localMedia: ILocalMediaController | null = null;
  /** Follows the controller's microphone, so a swapped-in track reaches the driver and the recorder. */
  private localMediaSubscription: Subscription | null = null;
  /** The live session's camera and screen share; created once the client is connected. */
  private captures: RealtimeCaptures | null = null;
  private capturesSubscription: Subscription | null = null;
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
  private recorder: IRealtimeSessionRecorder | null = null;
  /** ISO timestamp of when recording started — sent to the server on session start. */
  private recordingStartedAtIso: string | null = null;
  /** Interval that flushes ~15s crash-recovery shards to the server during a recording. */
  private segmentTimer: ReturnType<typeof setInterval> | null = null;
  /** 0-based index of the next recording shard to upload. */
  private segmentIndex = 0;
  /** How often crash-recovery shards are flushed during a recording. */
  private static readonly segmentFlushMs = 15000;

  // ── Server-side liveness ───────────────────────────────────────────────────
  /**
   * Interval that tells the server this session is still in use, or `null` when no session is
   * running. See {@link startLivenessPulse} for why the server cannot work this out itself.
   */
  private livenessTimer: ReturnType<typeof setInterval> | null = null;
  /**
   * How often the client asserts liveness. Comfortably under `SessionJanitor`'s
   * `closeThresholdMinutes` (15 by default) so several pulses must be missed in a row before a
   * live session is reaped, and well above `SessionManager`'s heartbeat write-coalescing window
   * so the DB sees at most a trickle of writes per session.
   */
  private static readonly livenessPulseMs = 60000;
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
   * Wall-anchor of the SESSION clock (#3832): `performance.now()` at the moment the call went
   * live, or `null` before any call has. Read only through {@link nowTurnOffsetMs}.
   */
  private sessionClockStartMs: number | null = null;

  /**
   * Per-turn guard for {@link markTurnAudioStart}: `true` once the in-flight turn's audio-start
   * offset has been captured, so mid-turn interim deltas don't overwrite it. Reset to `false`
   * at each finalization so the NEXT turn re-stamps from where ITS audio begins.
   */
  private turnAudioStartCaptured = false;

  // ── Delegated-run progress streaming ───────────────────────────────────────
  /** First spoken update fires no earlier than this long after delegated work starts. */
  private static readonly firstNarrationDelayMs = 5000;
  /** Minimum gap between SUBSEQUENT spoken updates (the 7–10s band; floods aggregate). */
  private static readonly narrationIntervalMs = 8000;
  /** Retry delay when the fire moment finds the model busy / audio still playing. */
  private static readonly narrationBusyRetryMs = 1500;
  /** Max progress messages aggregated into one spoken digest. */
  private static readonly maxDigestMessages = 4;
  /** Max prior spoken narrations chained into the instructions (anti-repetition). */
  private static readonly maxPriorNarrations = 3;
  /**
   * Aggregation buffer: distinct progress messages since the last spoken update (oldest
   * first, capped at {@link RealtimeSessionRuntime.MaxDigestMessages}). A flood of small
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
  private static readonly usageFlushDebounceMs = 10000;
  /** Accumulated input-token delta since the last flush. */
  private pendingUsageInput = 0;
  /** Accumulated output-token delta since the last flush. */
  private pendingUsageOutput = 0;
  /**
   * Accumulated per-modality usage since the last flush (input and output detail blocks, avatar
   * video seconds included), relayed in full; `null` when no update carried any.
   */
  private pendingUsageDetails: RealtimeUsageRecord | null = null;
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

  /**
   * Monotonic id for the current start attempt, bumped by every {@link teardown}.
   *
   * A session start is a multi-await sequence — mint, acquire the microphone, connect — and a host
   * can end the session part-way through it (the user taps back while the mint is still in flight).
   * Teardown at that moment has nothing to tear down: the stream and the client do not exist yet.
   * Without this, the in-flight start then proceeds to open a microphone and a provider connection
   * nobody is watching. Each start captures the generation it began under and abandons itself the
   * moment it no longer matches.
   */
  private startGeneration = 0;

  /**
   * The teardown currently running, so a second call awaits it rather than racing it.
   *
   * Ending a session commonly fires twice — an explicit stop followed by the host unmounting — and
   * `teardown` flips `_active$` only at the end, so the second call passes the `IsActive` guard and
   * runs concurrently with the first: two `Disconnect()` calls, two `CloseAgentSession` mutations,
   * two `SessionEnded$` emissions for one session.
   */
  private teardownInFlight: Promise<void> | null = null;

  /**
   * Why the last session start failed, or `null` when none has.
   *
   * The runtime reports failure as `'error'` on {@link ConnectionState$}, which is enough to show
   * *that* something went wrong but not *what* — and the difference matters at exactly one point:
   * microphone permission. A host that cannot tell "you denied the mic" from "the provider is
   * down" has to show the same unhelpful copy for both. `AcquireMicrophone` rejects inside the
   * runtime's own try/catch, so the host never sees that rejection itself.
   */
  private lastStartError: Error | null = null;

  // ── Interactive channels (registry-resolved plugins) ───────────────────────
  /** Debounce window for persisting a channel's state of record after a change burst. */
  private static readonly channelSaveDebounceMs = 3000;
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

  private _launcher: IRealtimeSessionLauncher = new DefaultRealtimeSessionLauncher();

  /**
   * How this runtime mints a session — the stock `StartRealtimeClientSession` mutation unless a host
   * installs its own {@link IRealtimeSessionLauncher} (a guest-session exchange, a deployment-specific
   * mutation). Everything after the mint — channel scoping, the driver, transcripts, teardown — is
   * unchanged. Assign `null` to restore the default.
   */
  public get Launcher(): IRealtimeSessionLauncher {
    return this._launcher;
  }
  public set Launcher(value: IRealtimeSessionLauncher | null) {
    this._launcher = value ?? new DefaultRealtimeSessionLauncher();
  }

  /**
   * Loads channel code on demand. Called, with the `ClientPluginClass` keys of every channel about to be
   * resolved (the registry's rows plus the host's declarations), after the registry is read and before any
   * plugin is built — so a host can register a heavy channel's class only when the session could use it.
   * It must resolve once the classes it knows are registered; a rejection is logged, never fatal.
   */
  public ChannelClassLoader: ((clientPluginClasses: readonly string[]) => Promise<void>) | null = null;

  // ── Session events (server → this session's client) ────────────────────────

  private readonly _sessionEvents$ = new Subject<RealtimeSessionStreamEvent>();

  /**
   * Every event the server publishes to THIS session, for the session's life (identity verification
   * today; apps add their own types). Hot, with no replay — subscribe before the session starts, once,
   * and it keeps working across sessions. The runtime has already acted on the events it understands
   * (see {@link handleIdentityVerified}) by the time one reaches here; this stream is for the host UI.
   *
   * Silent when the session's provider has no subscription transport (see {@link createSessionEventSource}).
   */
  public readonly SessionEvents$: Observable<RealtimeSessionStreamEvent> = this._sessionEvents$.asObservable();

  /** Keeps the live session's event stream open; null between sessions. */
  private sessionEventHub: RealtimeSessionEventHub | null = null;

  /** Per-type handlers the runtime runs (before publishing on {@link SessionEvents$}) for events it understands. */
  private readonly sessionEventHandlers = new Map<string, (event: RealtimeSessionStreamEvent) => void>([
    ['identity.verified', (event) => this.handleIdentityVerified(event)]
  ]);

  /**
   * What the agent should SAY the moment the user's identity is verified, or `null` (the default) to
   * say nothing — the agent is still told, silently, through a context note. A string is used as the
   * instruction verbatim; a function receives the verified payload (e.g. to greet by name) and returns
   * the instruction, or `null` to stay silent for this verification.
   */
  public IdentityVerifiedSpokenResponse: string | ((payload: IdentityVerifiedEventPayload) => string | null) | null = null;

  private readonly clientDeadline = new ClientSessionDeadline();

  /**
   * The client's copy of the session's absolute deadline (`null` when none is known). A host that
   * knows the session's cap at start sets it with {@link SetSessionDeadline}; verification extends it
   * from the server's `identity.verified` payload. The SERVER enforces the real deadline — this exists
   * so the host can end the call gracefully first and show a countdown. It only ever moves later by
   * the server's word, so nothing a client does can extend the real one.
   */
  public get SessionDeadline$(): Observable<Date | null> {
    return this.clientDeadline.Deadline$;
  }

  /** Synchronous access to {@link SessionDeadline$}. */
  public get SessionDeadline(): Date | null {
    return this.clientDeadline.Value;
  }

  /** Sets the baseline deadline a host knows at session start (`null` clears). See {@link SessionDeadline$}. */
  public SetSessionDeadline(deadline: Date | null): void {
    this.clientDeadline.Set(deadline);
  }

  /**
   * Builds the transport that reads the session's events. The default rides the session's GraphQL
   * provider; it returns `null` — "no session events here" — for a provider with no subscription
   * support (a test double, a host on another transport), which the runtime tolerates. Override to
   * supply another transport.
   */
  protected createSessionEventSource(): IRealtimeSessionEventSource | null {
    const provider = this.Provider as GraphQLDataProvider | null;
    if (!provider || typeof provider.Subscribe !== 'function') {
      return null;
    }
    return new GraphQLRealtimeSessionClient(provider);
  }

  /** Opens the live session's event stream. Best-effort: never disturbs the call. */
  private startSessionEvents(agentSessionId: string): void {
    this.stopSessionEvents();
    try {
      const source = this.createSessionEventSource();
      if (!source) {
        return;
      }
      this.sessionEventHub = new RealtimeSessionEventHub(source, (event) => this.routeSessionEvent(agentSessionId, event));
      this.sessionEventHub.Start(agentSessionId);
    } catch (error) {
      console.error('[RealtimeSession] Could not start the session event stream:', error);
    }
  }

  private stopSessionEvents(): void {
    this.sessionEventHub?.Stop();
    this.sessionEventHub = null;
  }

  /** Routes one event to its per-type handler, then publishes it. An event for another session is dropped. */
  private routeSessionEvent(expectedSessionId: string, event: RealtimeSessionStreamEvent): void {
    if (event.AgentSessionID !== expectedSessionId || this.agentSessionId !== expectedSessionId) {
      console.warn(`[RealtimeSession] Dropped a '${event.Type}' event addressed to another session.`);
      return;
    }
    try {
      this.sessionEventHandlers.get(event.Type)?.(event);
    } catch (error) {
      console.error(`[RealtimeSession] Handling the '${event.Type}' session event failed:`, error);
    }
    this._sessionEvents$.next(event);
  }

  /**
   * `identity.verified`: keep the client's deadline in step with the server's, tell the model — as a
   * silent, structured note — who it is now talking to, and, when the host configured it, have it say
   * something about that. The payload is validated again here (it crossed a wire); the name rides as
   * JSON so user-entered text can never break out of the note's frame.
   */
  private handleIdentityVerified(event: RealtimeSessionStreamEvent): void {
    if (event.Type !== 'identity.verified' || !IsIdentityVerifiedEventPayload(event.Payload)) {
      console.warn('[RealtimeSession] Ignored a malformed identity.verified event.');
      return;
    }
    const payload = event.Payload;
    this.clientDeadline.Extend(payload.MaxSessionDeadlineIso);
    this.SendContextNote(
      `[identity] verified ${JSON.stringify({ email: payload.VerifiedEmail, name: payload.VerifiedName, method: payload.Method })} ` +
        '(background context — the user has proven they control this email address; treat them as verified. Do not read this note aloud.)'
    );
    const spoken = typeof this.IdentityVerifiedSpokenResponse === 'function' ? this.IdentityVerifiedSpokenResponse(payload) : this.IdentityVerifiedSpokenResponse;
    if (spoken && spoken.trim().length > 0 && this.client && this.isSessionLive()) {
      this.requestChannelSpokenResponse(spoken.trim());
    }
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
   * @param applicationId Optional application the session runs in (sources the app config cascade,
   *   including `Application.AgentSettings.Realtime.Channels`).
   * @param appContext Optional live app-context snapshot injected into the companion prompt at mint.
   * @param options Optional per-start extras — chiefly the channels the HOST brings
   *   ({@link RealtimeSessionStartOptions.HostChannels}), the way a connect-only embed with no
   *   registry gets channels at all.
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
    appContext?: AppContextSnapshot | null,
    options?: RealtimeSessionStartOptions | null
  ): Promise<void> {
    if (this.IsActive) {
      return; // a session is already running — ignore duplicate starts
    }

    const consent = this.beginSessionStart({ agentName, recordingConsent, applicationId, appContext });
    // Captured BEFORE the channels are prepared so the mint carries exactly the snapshot the prologue
    // resolved, whatever a channel plugin may push in the meantime.
    const effectiveAppContext = this._appContext$.value;

    let session: StartRealtimeClientSessionResult;
    try {
      // Resolve the interactive-channel plugins FIRST (constructed, not started): the tools of the
      // channels mounted with the session must be declared to the realtime model at mint, and the
      // server needs the candidates to scope them. Nothing is initialized until the policy is known.
      const scope = await this.prepareChannelScope(options?.HostChannels);
      const allClientTools = [...(clientTools ?? []), ...scope.NativeTools];
      session = await this.mintSession(targetAgentId, conversationId, lastSessionId, preferredModelId, allClientTools, coAgentId, configOverridesJson, consent, this.recordingStartedAtIso, mediaCollectionId, this.applicationId, effectiveAppContext, scope.CandidatesJson);
    } catch (error) {
      await this.failSessionStart(error);
      return;
    }

    if (!this.hostCanUseProvider(session.Provider)) {
      await this.abortUnusableSession(session);
      return;
    }

    await this.runMintedSession(session, conversationId ?? null, consent, options?.CameraCheck === true);
  }

  /**
   * Declares which provider keys this host can actually carry audio for.
   *
   * The server resolves a realtime model by rank across every configured vendor, so it can
   * legitimately return a provider whose client driver this host cannot run. A browser can run all
   * of them; React Native can run the WebRTC ones but not those needing a Web Audio PCM plane.
   * Connecting anyway gets as far as constructing the driver's playback engine and then throws —
   * a crash, where the honest answer is "this workspace's voice provider is not one this app can
   * use".
   *
   * The default accepts everything, so existing hosts are unaffected. Override to narrow it.
   *
   * @param provider The `Provider` key the server stamped on the minted session.
   */
  protected hostCanUseProvider(_provider: string): boolean {
    return true;
  }

  /**
   * Closes a session that was minted but will never be connected, and reports why.
   *
   * Minting creates a durable `MJ: AI Agent Sessions` row server-side, so declining to connect
   * still has to close it — otherwise every rejected attempt leaks an `Active` session for the
   * janitor to reconcile fifteen minutes later.
   */
  private async abortUnusableSession(session: StartRealtimeClientSessionResult): Promise<void> {
    const reason =
      `[RealtimeSession] This host cannot carry provider '${session.Provider}' ` +
      `(model '${session.ModelName ?? session.Model}'); closing the minted session without connecting.`;
    console.error(reason);
    this.lastStartError = new Error(reason);
    // Adopt the session id so the shared teardown closes it — and so this path unwinds through
    // exactly one implementation. The prologue has already initialized the channel plugins and
    // published them on ActiveChannels$; skipping teardown would leave them undisposed, their tool
    // handlers registered, and their subscriptions live until the next start replaced them.
    this.agentSessionId = session.AgentSessionId ?? this.agentSessionId;
    this._connectionState$.next('error');
    await this.teardown(true);
  }

  /**
   * Run a session the HOST has already minted itself — the second half of
   * {@link StartRealtimeSession}, without the `StartRealtimeClientSession` mutation.
   *
   * For hosts that must mint through their own server surface because they attach per-session
   * context the stock mutation cannot carry (e.g. an interview persona baked into the companion
   * prompt). They call their own mutation, shape the reply into a
   * {@link StartRealtimeClientSessionResult}, and hand it here: driver resolution, the ephemeral-token
   * connect, tool/transcript relays, recording, connection state and teardown are all identical to
   * the all-in-one path — there is exactly one implementation of the run half.
   *
   * NOTE: the interactive-channel plugins are NOT started on this path. Their tool sets must be
   * declared to the model AT MINT, which happened on the host's side — so a host that wants channels
   * owns that half too.
   *
   * @param result The minted session — the same ten fields the `StartRealtimeClientSession`
   *   mutation returns. `EphemeralToken` and `Provider` are what actually open the call; a relay
   *   session opens with its `Transport` and `RelayUrl` instead, so a host must pass those on.
   * @param options Host-side inputs the result cannot carry; see {@link RealtimeSessionRunOptions}.
   *   Every field defaults exactly as its {@link StartRealtimeSession} counterpart does.
   */
  public async StartRealtimeSessionFromResult(
    result: StartRealtimeClientSessionResult,
    options?: RealtimeSessionRunOptions
  ): Promise<void> {
    if (this.IsActive) {
      return; // a session is already running — ignore duplicate starts
    }

    const effectiveOptions = options ?? {};
    if (!this.hostCanUseProvider(result.Provider)) {
      await this.abortUnusableSession(result);
      return;
    }
    const consent = this.beginSessionStart(effectiveOptions);
    await this.runMintedSession(result, effectiveOptions.conversationId ?? null, consent, false);
  }

  /**
   * Start prologue shared by both entry points: bind the app layer, publish the agent name, reset
   * per-session state, and flip the session live (which is ALSO what makes the `IsActive` guard
   * suppress duplicate starts while the mint is still in flight — hence it runs before minting, not
   * after). Returns the resolved recording consent, which the mint half reports to the server and
   * the run half uses to decide whether to record.
   */
  private beginSessionStart(options: RealtimeSessionRunOptions): boolean {
    // App awareness (Move 1/3/4): the application the session runs in (sources the app config
    // cascade + RelevantAgents → allowed-agent union) and the live app-context snapshot injected
    // into the companion prompt at mint. Stored so the ClientContextChannel can stream subsequent
    // deltas. Absent ⇒ no app layer / no mint-time context (the pre-app behavior).
    this.applicationId = options.applicationId ?? null;
    // Prefer the explicit param, but fall back to the snapshot the host has ALREADY pushed via
    // UpdateAppContext (explorer-app streams the live snapshot continuously). The overlay's
    // [appContext] binding can still read null at the instant the mic is clicked — without this
    // fallback, StartRealtimeSession(null) would clobber a perfectly good snapshot and mint the
    // companion prompt with no app context (no NavigableApps / no tool schemas → the co-agent guesses
    // parameter names and navigation fails). Never overwrite a good value with null.
    this._appContext$.next(options.appContext ?? this._appContext$.value);

    if (options.agentName) {
      this._agentName$.next(options.agentName);
    }
    this.resetState();
    this._active$.next(true);
    this._connectionState$.next('connecting');

    // Resolve recording consent for this session: explicit value wins, else the per-user
    // persisted preference. Computed before mint so it can be reported to the server.
    const consent = options.recordingConsent ?? this.readPersistedRecordingConsent();
    this.recordingStartedAtIso = consent ? new Date().toISOString() : null;
    return consent;
  }

  /**
   * The RUN half of a session start, shared by both entry points: consume the minted result, open
   * the provider connection, and go live. `inputConversationId` is the conversation the START asked
   * for (null ⇒ "server, make me one") — the result alone can't distinguish the two. `cameraCheck` is
   * whether the host shows a camera check ({@link RealtimeSessionStartOptions.CameraCheck}).
   */
  private async runMintedSession(
    session: StartRealtimeClientSessionResult,
    inputConversationId: string | null,
    consent: boolean,
    cameraCheck: boolean
  ): Promise<void> {
    // Captured up front: every await below is a window in which the host can end the session.
    const generation = this.startGeneration;
    try {
      // Mount the channels the resolved policy puts in the session. Deliberately BEFORE the session
      // id is adopted: `ActiveChannels$` consumers (the sessions adapter) treat an emission that
      // arrives while no session id is set as the INITIAL set, whose opens they synthesize from
      // `SessionStarted$` — activating after the id is set would announce every channel twice.
      this.applySessionClientPolicy(session);
      this.agentSessionId = session.AgentSessionId;
      // A null input conversationId means the SERVER created a fresh conversation for
      // this session — track it so the host can fold it into the cached list, select
      // it on close, and auto-name it (via the shared naming helper).
      this.createdConversationId = !inputConversationId && session.ConversationId ? session.ConversationId : null;
      this.sessionConversationId = session.ConversationId ?? inputConversationId ?? null;
      this.firstUserTranscript = null;
      this.narrationTemplate = session.NarrationInstructionsTemplate ?? null;
      this._modelName$.next(session.ModelName ?? null);
      // Resume continuity: rehydrate channel plugins from the PRIOR session's saved states
      // (e.g. the whiteboard) BEFORE any surface binds — tolerant, never blocks the start.
      this.applyPriorChannelStates(session.PriorChannelStatesJson);

      const client = this.createRealtimeClient(session.Provider);
      this.client = client;
      this.watchVideoSources(client);
      this.wireClientHandlers(client);

      // Everything past here awaits on hardware and the network, during which the host may end the
      // session. Each await is followed by a staleness check so an abandoned start releases what it
      // just acquired instead of leaving a live microphone and a live call behind it.
      const microphone = await this.openMicrophone();
      this.localStream = microphone.Stream;
      if (this.startGeneration !== generation) {
        await this.unwindAbandonedStart(session, client);
        return;
      }
      if (microphone.Error) {
        throw microphone.Error;
      }

      const clientConfig = this.BuildClientConfig(session);
      await client.Connect(clientConfig, microphone.Stream);
      if (this.startGeneration !== generation) {
        await this.unwindAbandonedStart(session, client);
        return;
      }
      // Tracks are negotiated now, so a capture can tell whether the model takes video, and the call whether it shows
      // the avatar its agent asked for.
      this.openCaptures(client, cameraCheck);
      this.publishAvatarNotice(session, clientConfig, client);

      // Notify active channels that the session client is connected and tracks are established
      for (const channel of this._activeChannels$.value) {
        try {
          channel.OnSessionStarted?.();
        } catch (err) {
          console.error(`[RealtimeSession] Error in channel '${channel.ChannelName}' OnSessionStarted:`, err);
        }
      }
      // Tell the model which channels exist and how to use them, from the channels' own descriptors —
      // as soon as the control channel is usable (which may be right now, or a moment after Connect).
      this.catalogNotePending = true;
      this.flushChannelCatalogNote();

      // Start browser-side recording (mic + agent mix) when consented. Best-effort: an
      // unsupported browser / missing remote stream degrades gracefully (mic-only or off)
      // and never blocks the call. The remote stream may still be null here (the WebRTC
      // ontrack can land slightly after Connect resolves) — the recorder mixes the mic now
      // and the agent audio rides through whenever its track is already attached.
      // The SESSION clock (#3832): anchored the moment the call goes live, whether or not a
      // recording exists. When the recorder runs, per-turn timings use ITS clock (offsets into a
      // seekable file); when it does not — every unconsented and every relay-captured session,
      // which is 100% of turns measured across two databases — this is the fallback that stops
      // `UtteranceStartMs`/`UtteranceEndMs` being categorically null. An offset into a session
      // with no audio is not seekable, but it is orderable and displayable ("3:42 into the
      // interview"), and it is stamped when the SPEECH happened rather than when the relay
      // mutation landed — which no server-side backfill can ever recover.
      this.sessionClockStartMs = performance.now();
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
      // The session's own event stream (identity verification, app events) stays open for its life.
      this.startSessionEvents(this.agentSessionId);
      this._sessionStarted$.next({
        sessionId: this.agentSessionId,
        channelNames: this._activeChannels$.value.map(c => c.ChannelName),
      });

      // Same place, same reason: the session is connected and its id is known, which is exactly
      // the window in which the server needs to be told it is alive.
      this.startLivenessPulse();
    } catch (error) {
      await this.failSessionStart(error);
    }
  }

  /**
   * Tells the host, once per call, why it shows no avatar ({@link AvatarNotice$}): from the mint's status, whether this
   * session asked for the agent's video, and whether that track is live now that the call is connected.
   */
  private publishAvatarNotice(session: StartRealtimeClientSessionResult, config: ClientRealtimeSessionConfig, client: BaseRealtimeClient): void {
    const notice = ResolveAvatarNotice(
      ParseRealtimeAvatarStatus(session.AvatarStatusJson),
      RequestsAgentVideo(config),
      client.IsTrackEstablished('video', 'outbound')
    );
    if (notice) {
      this._avatarNotice$.next(notice);
    }
  }

  /**
   * Releases everything a start acquired after the host had already ended the session.
   *
   * Reached only when {@link teardown} ran while this start was awaiting the microphone or the
   * provider connection. Teardown found nothing to release because nothing existed yet, so this
   * start owns the cleanup: stop the microphone, close the provider connection, and close the
   * server-side session row that the mint created.
   */
  private async unwindAbandonedStart(
    session: StartRealtimeClientSessionResult,
    client: BaseRealtimeClient
  ): Promise<void> {
    console.warn('[RealtimeSession] Session was ended while starting — releasing the partial session.');
    this.closeCaptures();
    this.closeLocalMedia();
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    try {
      await client.Disconnect();
    } catch (error) {
      console.error('[RealtimeSession] Disconnect of an abandoned start failed:', error);
    }
    // Only clear the shared slots when they still point at THIS attempt — a newer start may
    // already have replaced them.
    if (this.client === client) {
      this.unwatchVideoSources();
      this.clearAgentVideo();
      this.client = null;
    }
    // Close the server session only if teardown has NOT already done so. It nulls `agentSessionId`
    // after closing, so a still-matching id means this attempt still owns the row; a cleared one
    // means the teardown that invalidated this start already closed it, and closing again would
    // send a second `CloseAgentSession` for one session.
    if (session.AgentSessionId && this.agentSessionId === session.AgentSessionId) {
      this.agentSessionId = null;
      await this.closeServerSession(session.AgentSessionId);
    }
  }

  /**
   * Opens the user's microphone: through the host's controller when it offers one, otherwise through
   * {@link IRealtimeMediaHost.AcquireMicrophone}. A failure is returned rather than thrown, so the caller can
   * first check whether the start was abandoned meanwhile (a teardown disposes the controller, which fails a
   * start still in flight) and unwind quietly instead of reporting an error nobody is waiting for.
   */
  private async openMicrophone(): Promise<OpenedMicrophone> {
    const controller = this.mediaHost.CreateLocalMediaController?.() ?? null;
    if (!controller) {
      try {
        return { Stream: await this.mediaHost.AcquireMicrophone(), Error: null };
      } catch (error) {
        return { Stream: null, Error: error instanceof Error ? error : new Error(String(error)) };
      }
    }
    this.localMedia = controller;
    const started = await controller.Start('microphone');
    if (started.Status === 'failed') {
      return { Stream: null, Error: microphoneStartError(started.Reason, started.Message) };
    }
    this.followMicrophone(controller, started.Stream);
    return { Stream: started.Stream, Error: null };
  }

  /**
   * Moves the driver and the recorder onto the microphone's new track whenever the controller swaps one into
   * the stream: a device switch, or a lost device replaced by the default. The stream stays the same object,
   * and the controller carries the old track's mute over. Mid-swap the stream holds no track, so only a
   * finished swap is followed.
   */
  private followMicrophone(controller: ILocalMediaController, stream: MediaStream): void {
    let followed = stream.getAudioTracks()[0] ?? null;
    this.localMediaSubscription = controller.State$.subscribe(() => {
      const track = stream.getAudioTracks()[0] ?? null;
      if (!track || track === followed) {
        return;
      }
      followed = track;
      this.recorder?.ReplaceMicrophone?.(stream);
      this.client?.ReplaceMicrophone?.(stream)?.catch((error: unknown) => {
        console.error('[RealtimeSession] The realtime driver could not move to the new microphone:', error);
      });
    });
  }

  /** Stops following the controller and disposes it, which releases its devices. */
  private closeLocalMedia(): void {
    this.localMediaSubscription?.unsubscribe();
    this.localMediaSubscription = null;
    this.localMedia?.Dispose();
    this.localMedia = null;
  }

  /**
   * Creates the session's camera and screen share and mirrors their state on {@link Captures$}. With `cameraCheck`, the
   * call's first camera start waits for {@link ConfirmCamera}.
   */
  private openCaptures(client: BaseRealtimeClient, cameraCheck: boolean): void {
    this.closeCaptures();
    const captures = new RealtimeCaptures({
      Client: client,
      LocalMedia: this.localMedia,
      Host: this.mediaHost,
      Admit: (kind) => this.admitCapture(kind),
      CameraCheck: cameraCheck,
    });
    this.captures = captures;
    this.capturesSubscription = captures.States$.subscribe((states) => this._captures$.next(states));
    this.refreshCaptureOffers();
  }

  /** Stops the camera and screen share, if any, and reports both off. */
  private closeCaptures(): void {
    this.capturesSubscription?.unsubscribe();
    this.capturesSubscription = null;
    this.captures?.Dispose();
    this.captures = null;
    if (this._captures$.value !== REALTIME_CAPTURES_OFF) {
      this._captures$.next(REALTIME_CAPTURES_OFF);
    }
    this.refreshCaptureOffers();
  }

  /** Works out which captures the call offers ({@link CaptureOffers$}) and publishes a change. */
  private refreshCaptureOffers(): void {
    const offers: RealtimeCaptureOffers =
      this.captures && this.client?.SupportsInboundVideo ? { Camera: this.canOffer('camera'), Screen: this.canOffer('screen') } : REALTIME_CAPTURE_OFFERS_NONE;
    const current = this._captureOffers$.value;
    if (offers.Camera !== current.Camera || offers.Screen !== current.Screen) {
      this._captureOffers$.next(offers);
    }
  }

  /** Whether the host can open a capture and the call's policy admits it. */
  private canOffer(kind: RealtimeCaptureKind): boolean {
    const hostCanOpen = kind === 'camera' ? this.localMedia !== null : typeof this.mediaHost.RequestDisplayCapture === 'function';
    return hostCanOpen && this.admitCapture(kind).Admitted;
  }

  /** What a capture reports when there is no live session to show it to. */
  private noSessionCapture(): RealtimeCaptureState {
    return { Status: 'failed', Failure: 'no-session', Message: 'There is no call to share with.' };
  }

  /**
   * The session's policy for a capture. The channel that fronts it (its `CaptureKind`) must be in the session, open or
   * advertised, and the server's policy must let the agent see pixels through it (the agent's configuration and any
   * zero-data-retention rule). The user's own "agent can see" choice for the channel does not refuse a start: it decides
   * whether the frames reach the model.
   */
  private admitCapture(kind: RealtimeCaptureKind): RealtimeCaptureAdmission {
    const channel = this.findCaptureChannel(kind)?.Plugin;
    if (!channel) {
      return { Admitted: false, Message: CAPTURE_WORDING[kind].NotInCall };
    }
    const resolved = this.GetResolvedChannel(channel.ChannelName);
    const allowed = resolved?.Exposure ?? resolved?.MaxExposure ?? channel.GetDescriptor().MaxExposure;
    if (allowed !== 'pixels') {
      const reasons = (resolved?.ExposureLimits ?? []).map((limit) => limit.Reason);
      return { Admitted: false, Message: reasons.length > 0 ? `${CAPTURE_WORDING[kind].NotAllowed}: ${reasons.join('; ')}.` : `${CAPTURE_WORDING[kind].NotAllowed}.` };
    }
    return { Admitted: true, ChannelKey: channel.ChannelName, VisibleToAgent: channel.Exposure === 'pixels' };
  }

  /** The channel in the session, open or advertised, that fronts a capture. */
  private findCaptureChannel(kind: RealtimeCaptureKind): DispatchableChannel | null {
    const open = this._activeChannels$.value.find((c) => c.CaptureKind === kind);
    if (open) {
      return { Plugin: open, IsOpen: true };
    }
    const advertised = this.advertisedChannels.find((p) => p.Plugin.CaptureKind === kind);
    return advertised ? { Plugin: advertised.Plugin, IsOpen: false } : null;
  }

  /**
   * Brings up the channel that fronts a capture once the capture is starting, so the host shows its surface: an advertised
   * channel is opened (and announces itself to the agent), an open one counts as used.
   */
  private async revealCaptureChannel(kind: RealtimeCaptureKind): Promise<void> {
    const state = kind === 'camera' ? this.captures?.States.Camera : this.captures?.States.Screen;
    const channel = state?.Status === 'starting' ? this.findCaptureChannel(kind) : null;
    if (!channel) {
      return;
    }
    if (channel.IsOpen) {
      this.noteChannelActivity(channel.Plugin);
      return;
    }
    const opened = await this.OpenChannel(channel.Plugin.ChannelName);
    if (!opened.Success) {
      console.warn(`[RealtimeSession] Could not open channel '${channel.Plugin.ChannelName}' for the ${kind}: ${opened.ErrorMessage ?? opened.ErrorCode}`);
    }
  }

  /**
   * Starts the user's camera and shows it to the agent. Call it from the user's click: it may ask for camera
   * permission. Resolves with the camera's state; a failure (no session, a model that takes no video, a refused
   * permission) is a state with a message, never a throw. While the camera is on, it is a source on
   * {@link VideoSources$}, and it stops by itself if the device goes away.
   *
   * When the host shows a camera check ({@link RealtimeSessionStartOptions.CameraCheck}), the call's first start
   * resolves still starting, with `Checking` set and the stream for the host to preview. The agent sees the camera
   * once the host calls {@link ConfirmCamera}; {@link StopCamera} is the user's "not now".
   *
   * @param deviceId The camera to open; the system default when absent.
   */
  public async StartCamera(deviceId?: string): Promise<RealtimeCaptureState> {
    if (!this.captures) {
      return this.noSessionCapture();
    }
    const started = this.captures.Start('camera', { DeviceID: deviceId });
    await this.revealCaptureChannel('camera');
    return started;
  }

  /** Stops the user's camera. Safe to call when it is off. */
  public StopCamera(): void {
    this.captures?.Stop('camera');
  }

  /**
   * Moves the user's camera to another device while it is open (being checked or on): one of the camera's `Devices` on
   * {@link Captures$}. The stream stays the same. Resolves with the camera's state; nothing changes while the camera is
   * off.
   *
   * @param deviceId The camera to move to.
   */
  public async SwitchCamera(deviceId: string): Promise<RealtimeCaptureState> {
    return this.captures ? this.captures.SwitchCamera(deviceId) : this.noSessionCapture();
  }

  /**
   * The user checked the camera and turned it on: the agent sees it from now on, and later camera starts in this call
   * skip the check. Returns the camera's state; unless the camera is waiting for its check (see {@link StartCamera}),
   * nothing changes.
   */
  public ConfirmCamera(): RealtimeCaptureState {
    return this.captures ? this.captures.ConfirmCamera() : this.noSessionCapture();
  }

  /**
   * Asks the user for a screen, window or browser tab (or one panel of the page) and shows it to the agent. Call it
   * from the user's click: the browser's picker needs one. Resolves with the share's state; a failure (no session,
   * a model that takes no video, a closed picker, a host that cannot share) is a state with a message. The share
   * also stops when the user ends it from the browser's own bar.
   *
   * @param options What the picker offers first, or the panel to share.
   */
  public async StartScreenShare(options?: DisplayCaptureOptions): Promise<RealtimeCaptureState> {
    if (!this.captures) {
      return this.noSessionCapture();
    }
    const started = this.captures.Start('screen', options);
    await this.revealCaptureChannel('screen');
    return started;
  }

  /** Stops the user's screen share. Safe to call when nothing is shared. */
  public StopScreenShare(): void {
    this.captures?.Stop('screen');
  }

  /**
   * Why the last session start failed, or `null` when the last start succeeded or none has run.
   *
   * Read it when {@link ConnectionState$} reports `'error'`, to tell a denied microphone apart from
   * a provider or backend failure and show copy the user can act on. Cleared at the start of every
   * session.
   */
  public get LastStartError(): Error | null {
    return this.lastStartError;
  }

  /**
   * The single failure path for a session start (mint half or run half): report it, latch the
   * overlay into 'error', and unwind whatever the half-built session already opened.
   */
  private async failSessionStart(error: unknown): Promise<void> {
    console.error('[RealtimeSession] Failed to start session:', error);
    this.lastStartError = error instanceof Error ? error : new Error(String(error));
    this._connectionState$.next('error');
    await this.teardown(false);
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
   * Asks the live model to SPEAK FIRST — before the human has said anything.
   *
   * Every other path into the model's voice reacts to something: the human spoke, or a channel
   * reported input. A host that needs the agent to open the conversation (an interviewer greeting
   * a candidate, a guide introducing a task) had no way to ask for that, so the session connected
   * and both sides waited for the other. The instructions are what to say, in the host's words —
   * the model still speaks in its own voice and persona.
   *
   * Returns whether the request was DELIVERED, which is the one way this deliberately differs from
   * {@link SendContextNote} beside it. A context note that is dropped costs the model a little
   * perception; an opening line that is dropped is a session that sits in silence, and the host
   * needs to be able to tell the two apart. `false` means no session was live (or the instructions
   * were empty) — usually a host that asked before the connection reached a speaking state, which
   * it can then retry.
   */
  public RequestSpokenOpening(instructions: string): boolean {
    const trimmed = instructions?.trim() ?? '';
    if (trimmed.length === 0 || !this.client || !this.isSessionLive()) {
      return false;
    }
    this.requestChannelSpokenResponse(trimmed);
    return true;
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

  /**
   * The active {@link BaseRealtimeClient} driving the media plane, or null when not connected.
   */
  public get Client(): BaseRealtimeClient | null {
    return this.client;
  }

  /**
   * Relays a video frame to the underlying realtime client if active.
   */
  public SendVideoFrame(base64Image: string, mimeType?: string): void {
    if (!this.client || !this.isSessionLive()) {
      return;
    }
    this.client.SendVideoFrame?.(base64Image, mimeType);
  }

  /**
   * Checks whether a media track is established on the active realtime client.
   */
  public IsTrackEstablished(modality: string, direction: RealtimeTrackDirection): boolean {
    return this.client?.IsTrackEstablished(modality, direction) ?? false;
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
      const recorder = this.mediaHost.CreateRecorder?.() ?? null;
      if (!recorder) {
        return;
      }
      recorder.Start(this.localStream, remoteStream);
      this.recorder = recorder.IsRecording ? recorder : null;
      // First turn's audio starts at ~0 (recording begins right as the call goes live). Seed it
      // here so the very first turn has a sane start even if its first interim is missed; later
      // turns re-stamp from where THEIR audio begins via markTurnAudioStart (handles tool gaps).
      // Seeded even though the session clock may already have stamped a start: the clocks have
      // different zeros, and a session-clock start carried into recorder-clock offsets would put
      // turn one's cue wherever the clocks happen to differ.
      this.currentTurnStartMs = recorder.IsRecording ? 0 : null;
      this.turnAudioStartCaptured = false;
      if (this.recorder) {
        // WebRTC drivers (OpenAI): the agent's track usually lands AFTER Connect() resolves, so
        // `remoteStream` above is null here and this handler attaches it later. PCM-playback
        // drivers (Gemini, ElevenLabs, AssemblyAI, xAI, HuggingFace) publish at Connect, so
        // `remoteStream` is already set and the handler fires immediately with the same stream;
        // AttachRemoteStream is idempotent, so it is mixed only once.
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
    this.segmentTimer = setInterval(() => { void this.flushRecordingSegment(); }, RealtimeSessionRuntime.segmentFlushMs);
  }

  /** Stops the periodic crash-recovery shard flush. */
  private stopSegmentFlushing(): void {
    if (this.segmentTimer) {
      clearInterval(this.segmentTimer);
      this.segmentTimer = null;
    }
  }

  /**
   * Starts telling the server this session is still in use (#3533).
   *
   * **Why the server cannot work this out on its own.** In the client-direct topology the audio
   * goes browser → provider over WebRTC. The server sees the mint, a few channel actions in the
   * first seconds, and then nothing at all — so `SessionManager.RecordActivity` stops being
   * reached while the conversation is still going. `LastActiveAt` freezes ~45 seconds in, and
   * `SessionJanitor` — which cannot distinguish an active call from an abandoned one — force-closes
   * it at `closeThresholdMinutes`, mid-sentence, taking the user's surfaces with it. A session
   * whose channels are all client-side (whiteboard, media) goes quiet from the server's point of
   * view almost immediately.
   *
   * The browser is the only participant that knows the call is alive, so it is the one that has to
   * say so. Raising `closeThresholdMinutes` is not the fix — it just makes the janitor slower at
   * its real job (reaping rows orphaned by a crash) without making liveness observable.
   *
   * The pulse is best-effort by design: a failed beat is logged and skipped, never surfaced to the
   * user and never allowed to end the session. Losing one beat costs nothing because the threshold
   * is many beats wide; turning a transient network blip into a visible error would be a worse
   * failure than the one this fixes. Write amplification is bounded on the server side too, where
   * `SessionManager.Heartbeat` coalesces persisted writes.
   */
  private startLivenessPulse(): void {
    this.stopLivenessPulse();
    this.livenessTimer = setInterval(() => { void this.pulseLiveness(); }, RealtimeSessionRuntime.livenessPulseMs);
  }

  /** Stops the liveness pulse. Idempotent — safe on a session that never started one. */
  private stopLivenessPulse(): void {
    if (this.livenessTimer) {
      clearInterval(this.livenessTimer);
      this.livenessTimer = null;
    }
  }

  /**
   * One liveness beat. Reads the session id at fire time rather than closing over it, so a beat
   * that fires during teardown finds `null` and does nothing instead of resurrecting a closed row.
   */
  private async pulseLiveness(): Promise<void> {
    const agentSessionId = this.agentSessionId;
    if (!agentSessionId) {
      return;
    }
    const mutation = `
      mutation AgentSessionHeartbeat($agentSessionId: String!) {
        AgentSessionHeartbeat(agentSessionId: $agentSessionId)
      }
    `;
    try {
      await this.gql().ExecuteGQL(mutation, { agentSessionId });
    } catch (error) {
      // Best-effort: the next beat is 60s away and the janitor threshold is many beats wide.
      console.warn('[RealtimeSession] Liveness pulse failed (session continues):', error);
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
    try {
      const audioBase64 = await recorder.SnapshotNewSegmentBase64();
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
      const audioBase64 = await recorder.StopAndEncode();
      // Read the real waveform peaks computed during capture (survives the stop via the snapshot).
      const peaks = recorder.GetPeaks();
      if (!audioBase64 || !agentSessionId) {
        console.warn('[RealtimeSession] ⚠️ recording NOT uploaded — empty recording or no session id.');
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


  // ── Interactive channels (registry-driven + host-declared plugins) ─────────
  //
  // A session's channels come from two places — the `MJ: AI Agent Channels` registry and the channels
  // the host declares — and pass through three stages:
  //
  //   1. PREPARE  (before mint)  construct the plugins, read their descriptors, report them as
  //                              candidates, and work out the scope the browser can decide alone.
  //   2. MINT                    the server scopes the candidates with the agent/app cascade and the
  //                              registry's kill switch, and returns the resolved policy.
  //   3. ACTIVATE (after mint)   initialize exactly the policy's channels: `open-on-start`/`headless`
  //                              ones mount now, `on-demand` ones wait to be opened through ContextTool.
  //
  // Nothing is initialized before the policy is known, so a channel the server vetoes never runs.

  /** Whether the channel catalog note still has to be sent (see {@link flushChannelCatalogNote}). */
  private catalogNotePending = false;

  /** Plugins resolved for the current start but not yet initialized. Consumed by {@link activateChannels}. */
  private preparedChannels: PreparedChannel[] = [];

  /** The scope the browser resolves on its own — the fallback when no server policy comes back. */
  private localChannelScope: RealtimeChannelScopeResult | null = null;

  /** `on-demand` channels that are in the session but not opened yet (initialized only when opened). */
  private advertisedChannels: PreparedChannel[] = [];

  /** What the policy resolved for each in-session channel, keyed by normalized channel key. */
  private readonly resolvedChannels = new Map<string, ResolvedRealtimeChannel>();

  /** The prior session's saved channel states, kept so an `on-demand` channel opened later is restored too. */
  private priorChannelStates: Record<string, string> = {};

  /** The app/static client-tool tiers the server resolved for this session. */
  private sessionClientTools: RealtimeSessionClientTools | null = null;

  /** Validates and routes channel-addressed `ContextTool` calls. */
  private readonly channelDispatcher = new ChannelActionDispatcher({
    FindChannel: (key: string) => this.findDispatchableChannel(key),
    ListChannelKeys: () => this.listAddressableChannelKeys(),
    ActivateChannel: (plugin: BaseRealtimeChannelClient) => this.mountAdvertisedChannel(plugin),
  });

  /**
   * The resolved behavior of an in-session channel (display, exposure ceiling, config, what put it
   * in the session), or `null` when the channel is not in this session. Hosts and overlays read the
   * resolved display from here rather than from the channel's code default.
   *
   * @param channelName The channel's key (case-insensitive).
   */
  public GetResolvedChannel(channelName: string): ResolvedRealtimeChannel | null {
    return this.resolvedChannels.get(NormalizeChannelKey(channelName)) ?? null;
  }

  /** Where the user's per-channel "how much can the agent see" choices are kept. Replace with {@link SetExposurePreferences}. */
  private exposurePreferences: IChannelExposurePreferences = new UserSettingsExposurePreferences(() => this.canPersistUserSettings());

  /**
   * Replaces the store the user's per-channel exposure choices are kept in. The default persists them in
   * the signed-in user's settings (`mj.realtime.visualPerception.v1`) and keeps them in memory for an
   * anonymous principal or a connect-only embed; a host that remembers them somewhere else supplies its own.
   */
  public SetExposurePreferences(preferences: IChannelExposurePreferences): void {
    this.exposurePreferences = preferences;
  }

  /** The store the user's per-channel exposure choices are currently kept in (so a host can wrap it). */
  public get ExposurePreferences(): IChannelExposurePreferences {
    return this.exposurePreferences;
  }

  /** Whether user settings can be written: a signed-in user on a provider that has entity metadata. */
  private canPersistUserSettings(): boolean {
    const provider = this.Provider;
    return Boolean(provider?.CurrentUser?.ID) && (provider?.Entities?.length ?? 0) > 0;
  }

  /**
   * How much of a channel the model may perceive right now: the channel's ceiling, lowered by the server's
   * policy and the user's choice. `null` when the channel is not in this session.
   *
   * @param channelName The channel's key (case-insensitive).
   */
  public GetChannelExposure(channelName: string): RealtimeChannelExposure | null {
    return this.findDispatchableChannel(channelName)?.Plugin.Exposure ?? null;
  }

  /**
   * The user's own choice of how much of a channel the agent may perceive. Takes effect immediately
   * (frames and notes the new level forbids stop, and the model is told), and is remembered per channel key
   * for next time. The level can only LOWER what the server's policy allows; choosing `'pixels'` for a channel
   * the agent's policy capped at `'state'` changes nothing.
   *
   * @param channelName The channel's key (case-insensitive).
   * @param level The user's choice; `undefined` clears it (back to what policy allows).
   * @returns `false` when the channel is not in this session (nothing is applied, but the choice is still remembered).
   */
  public SetUserChannelExposure(channelName: string, level: RealtimeChannelExposure | undefined): boolean {
    this.exposurePreferences.Set(channelName, level);
    const channel = this.findDispatchableChannel(channelName);
    if (!channel) {
      return false;
    }
    this.applyChannelExposure(channel.Plugin);
    return true;
  }

  /** Pushes a channel's current exposure inputs (server policy, user choice) into the channel. */
  private applyChannelExposure(plugin: BaseRealtimeChannelClient): void {
    const resolved = this.GetResolvedChannel(plugin.ChannelName);
    const user = this.exposurePreferences.Get(plugin.ChannelName);
    const reasons = (resolved?.ExposureLimits ?? []).map((limit) => limit.Reason);
    // The user's limit binds only when it is lower than what the server allows; otherwise it changes nothing
    // and the agent should not be told about it.
    const allowed = resolved?.Exposure ?? plugin.GetDescriptor().MaxExposure;
    if (user !== undefined && CompareExposure(user, allowed) < 0) {
      reasons.push(UserExposureReason(user));
    }
    plugin.ApplyExposure({ Policy: resolved?.Exposure, User: user, Reasons: reasons });
    // A capture this channel fronts follows it: the agent sees its frames only while the channel's exposure allows pixels.
    const kind = plugin.CaptureKind;
    if (kind) {
      this.captures?.SetVisibleToAgent(kind, plugin.Exposure === 'pixels');
    }
  }

  /** Follows the session client's video-source arbiter so {@link VideoSources$} reflects it. */
  private watchVideoSources(client: BaseRealtimeClient): void {
    this.unwatchVideoSources();
    const arbiter = VideoSourceArbiter.ForSink(client);
    arbiter.SetFocusedChannel(this.focusedChannelKey);
    this.stopWatchingVideoSources = arbiter.OnChange(() => this._videoSources$.next(arbiter.GetSources()));
    this._videoSources$.next(arbiter.GetSources());
  }

  /** The channel whose surface the user is looking at, kept so it applies to an arbiter created after it was set. */
  private focusedChannelKey: string | null = null;

  /**
   * Tells the session which channel's surface the user is looking at (`null` for none, e.g. the activity tab).
   * When the model can see only one video source and several are live, the one the user is looking at is the one
   * it sees (after an explicit pick, and after a camera or screen share the user started). Safe to call before the
   * session is live: it applies when the connection comes up.
   *
   * @param channelKey The focused channel's key, as it appears on {@link VideoSources$} entries' `ChannelKey`.
   */
  public SetFocusedChannel(channelKey: string | null): void {
    this.focusedChannelKey = channelKey;
    if (this.client) {
      VideoSourceArbiter.ForSink(this.client).SetFocusedChannel(channelKey);
    }
  }

  /** Stops following the arbiter and clears {@link VideoSources$}. Safe to call when nothing is watched. */
  private unwatchVideoSources(): void {
    this.stopWatchingVideoSources?.();
    this.stopWatchingVideoSources = null;
    if (this._videoSources$.value.length > 0) {
      this._videoSources$.next([]);
    }
  }

  private stopWatchingVideoSources: (() => void) | null = null;

  /**
   * Turns the agent's view of one video source on or off — what the "agent can see" control calls.
   *
   * A source that belongs to a channel goes through {@link SetUserChannelExposure}, so the choice is
   * remembered per channel and the channel itself tells the model. Any other source (a camera or screen
   * share that is not a channel) is switched at the arbiter, which tells the model.
   *
   * @param sourceId The source's id (from {@link VideoSources$}).
   * @param enabled Whether the agent may see it.
   * @returns `false` when there is no such source.
   */
  public SetVideoSourceEnabled(sourceId: string, enabled: boolean): boolean {
    const client = this.client;
    if (!client) {
      return false;
    }
    const arbiter = VideoSourceArbiter.ForSink(client);
    const source = arbiter.GetSources().find((s) => s.SourceID === sourceId);
    if (!source) {
      return false;
    }
    if (source.ChannelKey && this.findDispatchableChannel(source.ChannelKey)) {
      return this.SetUserChannelExposure(source.ChannelKey, enabled ? undefined : 'state');
    }
    return arbiter.SetSourceEnabled(sourceId, enabled);
  }

  /**
   * Picks the video source the agent sees: what the "agent can see" control calls when more sources are on than the
   * model takes. The pick beats every other rule (a camera or screen share the user started, the surface the user is
   * looking at) until it is cleared, or its source is turned off or leaves. The pick shows on {@link VideoSources$}
   * (`Picked`), and the model is told when what it sees changes.
   *
   * @param sourceId The source's id (from {@link VideoSources$}), or `null` to let the call decide again.
   * @returns `false` with no live session, or for a source that is not there or is turned off.
   */
  public SelectVideoSource(sourceId: string | null): boolean {
    return this.client ? VideoSourceArbiter.ForSink(this.client).SelectSource(sourceId) : false;
  }

  /**
   * The `on-demand` channels that are in the session but not open yet — what the agent can open
   * through `ContextTool`. A fresh array; empty before a session starts and after teardown.
   */
  public get AdvertisedChannels(): readonly BaseRealtimeChannelClient[] {
    return this.advertisedChannels.map((p) => p.Plugin);
  }

  /**
   * Resolves, initializes and mounts the session's channels in one step using the scope the browser
   * can decide alone (code defaults + host declarations), and returns the native tools to declare at
   * mint. This is the single-step composition of {@link prepareChannelScope} + {@link activateChannels}
   * that a session start spreads across the mint; it is kept as a unit because it is the cleanest seam
   * for exercising the plugin plumbing without a mint.
   */
  private async startChannels(hostChannels?: RealtimeHostChannelDeclaration[]): Promise<RealtimeToolDefinition[]> {
    const scope = await this.prepareChannelScope(hostChannels);
    this.activateChannels(this.localChannelScope?.Channels ?? []);
    return scope.NativeTools;
  }

  /**
   * Stage 1: constructs the channel plugins (registry rows and host declarations), reads their
   * descriptors, resolves the scope the browser can decide alone, and builds what the mint needs —
   * the native tools to declare and the candidates to report. Starts nothing.
   *
   * @param hostChannels Channels the host brings to this session.
   * @returns The native tools to declare at mint, and the candidates as JSON (`null` when there are none,
   *   so a channel-less session sends exactly the mint it always did).
   */
  private async prepareChannelScope(
    hostChannels?: RealtimeHostChannelDeclaration[]
  ): Promise<{ NativeTools: RealtimeToolDefinition[]; CandidatesJson: string | null }> {
    this.discardUnmountedChannels();
    const prepared = await this.prepareChannels(hostChannels);
    this.preparedChannels = prepared;
    const candidates = prepared.map((p) => BuildChannelCandidate(p, p.Plugin.GetDescriptor()));
    const local = ResolveLocalChannelScope(candidates);
    this.localChannelScope = local;
    for (const excluded of local.Excluded) {
      console.warn(`[RealtimeSession] Channel '${excluded.Key}' is not in this session (${excluded.Reason}).`);
    }
    const nativeTools = SelectNativeChannelTools(local.Channels, ToolsByChannelKey(candidates));
    // `Registry` is the browser's own view and never goes over the wire: the server reads the registry itself.
    const wire = candidates.map(({ Registry: _registry, ...candidate }) => candidate);
    return { NativeTools: nativeTools, CandidatesJson: wire.length > 0 ? JSON.stringify(wire) : null };
  }

  /**
   * Constructs a plugin for every active-or-inactive registry row and every host declaration. An
   * INACTIVE row is constructed too — only to learn its key so the kill switch can name it — and is
   * never initialized. A plugin whose descriptor cannot be read is skipped (logged), never fatal.
   */
  private async prepareChannels(hostChannels?: RealtimeHostChannelDeclaration[]): Promise<PreparedChannel[]> {
    const rows = await this.fetchChannelDefinitions();
    await this.loadChannelClasses([...rows.map((r) => r.ClientPluginClass), ...(hostChannels ?? []).map((d) => d.ClientPluginClass)]);
    const prepared: PreparedChannel[] = [];
    for (const row of rows) {
      const plugin = this.resolveChannelPlugin(row);
      if (plugin) {
        plugin.ApplySurfacePlacement(row.SurfacePlacement);
        prepared.push({ Plugin: plugin, Key: plugin.ChannelName, Registry: row.IsActive ? 'active' : 'inactive' });
      }
    }
    for (const declaration of hostChannels ?? []) {
      const plugin = this.createHostChannelPlugin(declaration);
      if (!plugin) {
        continue;
      }
      const existing = FindPreparedChannel(prepared, plugin.ChannelName);
      if (existing) {
        // The host's instance replaces the registry's (it may carry the host's collaborators); the
        // registry row's state — notably the kill switch, and where its surface shows — still applies.
        plugin.ApplySurfacePlacement(existing.Plugin.SurfacePlacement);
        existing.Plugin = plugin;
        existing.HostDeclaration = declaration;
      } else {
        prepared.push({ Plugin: plugin, Key: plugin.ChannelName, Registry: 'none', HostDeclaration: declaration });
      }
    }
    return prepared.filter((p) => this.canDescribe(p));
  }

  /**
   * Gives a host that loads channel code on demand (a widget that keeps a heavy channel in its own download)
   * the chance to load it before the plugins are built. Never fatal: a loader that throws is logged and the
   * channel simply is not available, exactly as if its class had never been registered.
   *
   * @param keys The `ClientPluginClass` keys of every channel about to be resolved (blank/absent ones included).
   */
  private async loadChannelClasses(keys: ReadonlyArray<string | null | undefined>): Promise<void> {
    const loader = this.ChannelClassLoader;
    if (!loader) {
      return;
    }
    const wanted = [...new Set(keys.map((k) => k?.trim() ?? '').filter((k) => k.length > 0))];
    if (wanted.length === 0) {
      return;
    }
    try {
      await loader(wanted);
    } catch (error) {
      console.error('[RealtimeSession] The channel class loader failed — channels that needed it are left out:', error);
    }
  }

  /** Whether a prepared plugin's descriptor can be read; logs and rejects one that throws. */
  private canDescribe(prepared: PreparedChannel): boolean {
    try {
      prepared.Plugin.GetDescriptor();
      return true;
    } catch (error) {
      console.error(`[RealtimeSession] Channel '${prepared.Key}' has an unreadable descriptor — leaving it out:`, error);
      return false;
    }
  }

  /** Builds a plugin from a host declaration; `null` (logged) when it names nothing buildable. */
  private createHostChannelPlugin(declaration: RealtimeHostChannelDeclaration): BaseRealtimeChannelClient | null {
    if (declaration.Create) {
      try {
        return declaration.Create();
      } catch (error) {
        console.error('[RealtimeSession] A host-declared channel factory threw — leaving the channel out:', error);
        return null;
      }
    }
    const key = declaration.ClientPluginClass?.trim();
    if (!key) {
      console.warn('[RealtimeSession] A host-declared channel names neither ClientPluginClass nor Create — ignoring it.');
      return null;
    }
    return this.resolveChannelPlugin({ Name: key, ClientPluginClass: key, IsActive: true });
  }

  /**
   * Stage 3: initializes the channels the resolved policy puts in the session. `open-on-start` and
   * `headless` channels are mounted and published on {@link ActiveChannels$}; `on-demand` channels
   * are held until opened. Prepared plugins the policy left out are dropped without ever having run.
   */
  private activateChannels(channels: ReadonlyArray<ResolvedRealtimeChannel>): void {
    const reconciled = ReconcileChannelsWithPolicy(this.preparedChannels, channels);
    for (const key of reconciled.Unknown) {
      console.warn(`[RealtimeSession] The session policy names channel '${key}' but this host has no plugin for it — ignoring it.`);
    }
    this.resolvedChannels.clear();
    this.advertisedChannels = [];
    const mounted: BaseRealtimeChannelClient[] = [];
    for (const { Prepared, Resolved } of reconciled.InSession) {
      this.resolvedChannels.set(NormalizeChannelKey(Resolved.Key), Resolved);
      // Exposure is applied BEFORE the channel initializes, so what it requests of the model (a video
      // track, in particular) already reflects what policy allows.
      this.applyChannelExposure(Prepared.Plugin);
      if (Resolved.DisplayPolicy === 'on-demand') {
        this.advertisedChannels.push(Prepared);
      } else {
        this.mountChannel(Prepared, Resolved);
        mounted.push(Prepared.Plugin);
      }
    }
    this.preparedChannels = [];
    this._activeChannels$.next(mounted);
  }

  /**
   * Applies the mint's outcome to the channel set: the server's policy when it sent a usable one,
   * else the scope the browser resolved on its own. A policy can only SELECT among the plugins this
   * host prepared — it cannot add one.
   */
  private applySessionClientPolicy(session: StartRealtimeClientSessionResult): void {
    const policy = ParseRealtimeSessionClientPolicy(session.ClientPolicyJson);
    if (session.ClientPolicyJson && !policy) {
      console.warn('[RealtimeSession] The mint returned a client policy this runtime cannot read — resolving channels locally.');
    }
    this.sessionClientTools = policy?.ClientTools ?? null;
    if (this.preparedChannels.length === 0) {
      this.resolvedChannels.clear();
      return; // nothing was prepared (a host that mints and runs the session itself) — no channel set to apply
    }
    this.activateChannels(policy?.Channels ?? this.localChannelScope?.Channels ?? []);
  }

  /** Drops plugins that were prepared for a start that never mounted them. They were never initialized, so there is nothing to release. */
  private discardUnmountedChannels(): void {
    this.preparedChannels = [];
    this.advertisedChannels = [];
    this.localChannelScope = null;
  }

  /**
   * Loads the `MJ: AI Agent Channels` registry rows (ACTIVE AND INACTIVE — an inactive row is the master
   * kill switch, so the scope decision has to see it). With entity metadata: from {@link AIEngineBase}'s
   * cached `AgentChannels` (provider-scoped engine instance, lazy `Config` — no RunView round-trip; the
   * engine's BaseEntity-event reactivity keeps the registry fresh). On a connect-only provider: one
   * `RunDynamicView` query ({@link fetchChannelDefinitionsOverGraphQL}). Failures are logged and degrade to an
   * empty list — channel availability must never block the voice session.
   */
  private async fetchChannelDefinitions(): Promise<RealtimeChannelDefinitionRow[]> {
    // A connect-only provider (ConnectGraphQLClient — anonymous embeds) has no entity metadata,
    // so AIEngineBase cannot load; asking it would only fail with "Entity … not found in
    // metadata". The registry is still the authority, so read it over GraphQL instead — answering
    // "no channels" here cost an embed every channel tool (Whiteboard, Media) at mint.
    if ((this.Provider?.Entities?.length ?? 0) === 0) {
      return this.fetchChannelDefinitionsOverGraphQL();
    }
    try {
      const engine = AIEngineBase.GetProviderInstance<AIEngineBase>(this.Provider, AIEngineBase) as AIEngineBase;
      await engine.Config(false, undefined, this.Provider);
      return (engine.AgentChannels ?? []).map<RealtimeChannelDefinitionRow>((c) => ({
        ID: c.ID,
        Name: c.Name,
        ClientPluginClass: c.ClientPluginClass,
        IsActive: c.IsActive,
        SurfacePlacement: readRowSurfacePlacement(c),
      }));
    } catch (error) {
      console.warn('[RealtimeSession] Channel registry unavailable — starting with no channels:', error);
      return [];
    }
  }

  /**
   * The connect-only path of {@link fetchChannelDefinitions}: the same `MJ: AI Agent Channels` rows, active
   * and inactive (an inactive row is the kill switch), read with a dynamic view because a connect-only client
   * has no entity metadata to build a typed RunView from. Same tolerance as the engine path — a failure is
   * logged and means "no channels", never a blocked session.
   */
  private async fetchChannelDefinitionsOverGraphQL(): Promise<RealtimeChannelDefinitionRow[]> {
    const query = `query RealtimeChannelRegistry($input: RunDynamicViewInput!) {
      RunDynamicView(input: $input) { Success ErrorMessage Results { Data } }
    }`;
    try {
      const result = (await this.gql().ExecuteGQL(query, {
        input: { EntityName: 'MJ: AI Agent Channels', Fields: ['ID', 'Name', 'ClientPluginClass', 'IsActive', 'UIConfig'] },
      })) as { RunDynamicView?: { Success: boolean; ErrorMessage?: string; Results?: { Data: string }[] } } | null;
      const view = result?.RunDynamicView;
      if (!view?.Success) {
        console.warn('[RealtimeSession] Channel registry unavailable — starting with no channels:', view?.ErrorMessage ?? 'no result');
        return [];
      }
      return (view.Results ?? [])
        .map((r) => JSON.parse(r.Data) as ChannelRegistryViewRow)
        .map<RealtimeChannelDefinitionRow>((row) => ({
          ID: row.ID,
          Name: row.Name,
          ClientPluginClass: row.ClientPluginClass,
          IsActive: row.IsActive === true,
          SurfacePlacement: readUIConfigTextSurfacePlacement(row.Name, row.UIConfig),
        }));
    } catch (error) {
      console.warn('[RealtimeSession] Channel registry unavailable — starting with no channels:', error instanceof Error ? error.message : String(error));
      return [];
    }
  }

  /**
   * Resolves one registry row's `ClientPluginClass` via the ClassFactory (registration
   * checked first, exactly like the realtime-client drivers) and instantiates a fresh
   * per-session plugin. Returns `null` (logged) when no plugin is registered for the key
   * — e.g. its Load function was never called or the package isn't included client-side.
   * An inactive row is resolved quietly: it only needs to be named, and a missing plugin for a
   * channel nobody wants is not worth a warning.
   */
  private resolveChannelPlugin(row: Pick<RealtimeChannelDefinitionRow, 'Name' | 'ClientPluginClass' | 'IsActive'>): BaseRealtimeChannelClient | null {
    const key = row.ClientPluginClass?.trim();
    const quiet = !row.IsActive;
    if (!key) {
      if (!quiet) {
        console.warn(`[RealtimeSession] Channel '${row.Name}' has no ClientPluginClass — skipping.`);
      }
      return null;
    }
    const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseRealtimeChannelClient, key);
    if (!registration) {
      if (!quiet) {
        console.warn(`[RealtimeSession] No client plugin registered for channel '${row.Name}' (key '${key}') — skipping.`);
      }
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
   * Wires one plugin into the session: hands it its host context (carrying its resolved config) and,
   * when it has native tools, registers its prefix-routed local tool executor (so `<ToolNamePrefix>*`
   * calls run in the browser through {@link BaseRealtimeChannelClient.ApplyAgentTool}, never the
   * server relay). A channel with no tool prefix has no native route — it is reached through
   * `ContextTool` — and registering an empty prefix would match EVERY tool name.
   */
  private mountChannel(prepared: PreparedChannel, resolved: ResolvedRealtimeChannel | undefined): void {
    const plugin = prepared.Plugin;
    plugin.Initialize(this.buildChannelContext(plugin, resolved?.Config));
    if (plugin.ToolNamePrefix.length === 0) {
      return;
    }
    this.RegisterClientToolHandler(plugin.ToolNamePrefix, (toolName, argsJson) => {
      // The agent is ACTING on this channel — surface-discovery signal for the overlay
      // (first activity registers + auto-reveals + focuses the channel tab) before the
      // tool applies. Record the channel as USED so the overlay tabs it (channels other
      // than the whiteboard are tab-less until they're first used).
      this.noteChannelActivity(plugin);
      // A native tool whose result would show the agent what exposure policy withholds is refused here, as it is on the
      // ContextTool route; the legacy tool-result shape carries the reason.
      const withheld = plugin.FindVerbForNativeTool(toolName);
      const refusal = withheld ? plugin.RefuseVerbForExposure(withheld) : null;
      if (refusal) {
        return JSON.stringify({ success: false, errorCode: 'exposure_restricted', error: refusal });
      }
      return plugin.ApplyAgentTool(toolName, argsJson);
    });
  }

  /** Records that the agent acted on a channel (the overlay's first-use reveal signal). */
  private noteChannelActivity(plugin: BaseRealtimeChannelClient): void {
    this.usedChannelNames.add(plugin.ChannelName);
    this._channelActivity$.next(plugin);
  }

  /**
   * Mounts an advertised `on-demand` channel when the agent opens it: initializes it, restores its
   * prior-session state, publishes it on {@link ActiveChannels$} (so the overlay can give it a tab)
   * and, if the call is already connected, tells it so. If initialization throws the channel goes
   * back to being advertised, so the agent can retry or move on.
   */
  private async mountAdvertisedChannel(plugin: BaseRealtimeChannelClient): Promise<void> {
    const index = this.advertisedChannels.findIndex((p) => p.Plugin === plugin);
    if (index < 0) {
      return; // already mounted (or never advertised) — the dispatcher opens it regardless
    }
    const [prepared] = this.advertisedChannels.splice(index, 1);
    try {
      this.mountChannel(prepared, this.GetResolvedChannel(prepared.Key) ?? undefined);
    } catch (error) {
      this.advertisedChannels.splice(index, 0, prepared);
      throw error;
    }
    this.restorePriorChannelState(plugin);
    this._activeChannels$.next([...this._activeChannels$.value, plugin]);
    if (this.isSessionLive()) {
      this.notifyChannelSessionStarted(plugin);
    }
  }

  /** Tells a channel the session is connected, containing anything it throws. */
  private notifyChannelSessionStarted(channel: BaseRealtimeChannelClient): void {
    try {
      channel.OnSessionStarted?.();
    } catch (err) {
      console.error(`[RealtimeSession] Error in channel '${channel.ChannelName}' OnSessionStarted:`, err);
    }
  }

  /** Finds a session channel (open or merely advertised) for the dispatcher. */
  private findDispatchableChannel(key: string): DispatchableChannel | null {
    const id = NormalizeChannelKey(key);
    const open = this._activeChannels$.value.find((c) => NormalizeChannelKey(c.ChannelName) === id);
    if (open) {
      return { Plugin: open, IsOpen: true };
    }
    const advertised = this.advertisedChannels.find((p) => NormalizeChannelKey(p.Key) === id);
    return advertised ? { Plugin: advertised.Plugin, IsOpen: false } : null;
  }

  /** The keys the agent can address, for "unknown channel" messages — channels with nothing to address are left out. */
  private listAddressableChannelKeys(): string[] {
    const addressable = (plugin: BaseRealtimeChannelClient): boolean => {
      const descriptor = plugin.GetDescriptor();
      return descriptor.Verbs.length > 0 || descriptor.Inputs !== undefined;
    };
    return [
      ...this._activeChannels$.value.filter(addressable).map((c) => c.ChannelName),
      ...this.advertisedChannels.filter((p) => addressable(p.Plugin)).map((p) => p.Key),
    ];
  }

  /**
   * Runs a channel-addressed `ContextTool` call (the {@link RealtimeChannelContext.DispatchContextAction}
   * implementation): validates it, opens an `on-demand` channel when asked, runs the verb, and on
   * success records the channel as used so the overlay reveals its tab. Never throws.
   */
  private async dispatchContextAction(request: RealtimeContextActionRequest): Promise<RealtimeContextActionResult> {
    const result = await this.channelDispatcher.Dispatch(request);
    if (result.Success) {
      const channel = this.findDispatchableChannel(request.Target.Channel);
      if (channel) {
        this.noteChannelActivity(channel.Plugin);
      }
    }
    return result;
  }

  /**
   * Opens (and seeds) a channel from the HOST — the same path the agent's `open` action takes: the channel
   * is mounted if it was only advertised, its `Inputs` schema validates `inputs`, and it announces itself to
   * the model. A channel that is already open is re-seeded. Never throws; a refusal is a structured result.
   *
   * @param channelKey The channel to open (case-insensitive).
   * @param inputs Seed inputs, validated against the channel's descriptor.
   */
  public OpenChannel(channelKey: string, inputs: JSONObject = {}): Promise<RealtimeContextActionResult> {
    return this.dispatchContextAction({ Target: { Channel: channelKey }, Action: 'open', Params: inputs });
  }

  /**
   * Tells the model which channels exist and how to use them — rendered from the channels' own
   * descriptors, so a new channel needs no prompt change. Sent ONCE, the first moment the control
   * channel is usable — a context note sent before then is dropped, and `Connect` can resolve before the
   * provider reports `listening`, so this runs at start and again on each state change until it has gone.
   * A session whose only channels describe themselves through native tools sends nothing.
   */
  private flushChannelCatalogNote(): void {
    if (!this.catalogNotePending || !this.isSessionLive()) {
      return;
    }
    this.catalogNotePending = false;
    const entries: ChannelCatalogEntry[] = [
      ...this._activeChannels$.value.map((plugin) => this.catalogEntry(plugin, true)),
      ...this.advertisedChannels.map((p) => this.catalogEntry(p.Plugin, false)),
    ];
    const note = BuildChannelCatalogNote(entries);
    if (note) {
      this.SendContextNote(note);
    }
  }

  /** One catalog entry: a channel's descriptor, whether it is open, and whether its tools were declared natively. */
  private catalogEntry(plugin: BaseRealtimeChannelClient, isOpen: boolean): ChannelCatalogEntry {
    const display = this.GetResolvedChannel(plugin.ChannelName)?.DisplayPolicy;
    const descriptor = plugin.GetDescriptor();
    const entry: ChannelCatalogEntry = {
      Descriptor: descriptor,
      IsOpen: isOpen,
      HasNativeTools: isOpen && display !== undefined && DeclaresNativeTools(display) && plugin.GetToolDefinitions().length > 0,
    };
    if (CompareExposure(plugin.Exposure, descriptor.MaxExposure) < 0) {
      entry.ExposureLimit = { Effective: plugin.Exposure, Ceiling: descriptor.MaxExposure, Reasons: [...plugin.ExposureReasons] };
    }
    return entry;
  }

  /** Builds the host-services context one channel plugin sees (its only line to the session). */
  private buildChannelContext(plugin: BaseRealtimeChannelClient, channelConfig?: JSONObject): RealtimeChannelContext {
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
        this.executeAppClientTool(name, params),
      // The session's server events (identity verification, app events), for a channel that reacts to them.
      SessionEvents$: this.SessionEvents$,
      // Channel-addressed ContextTool calls: validated against the verb's schema, open `on-demand` channels.
      DispatchContextAction: (request: RealtimeContextActionRequest) => this.dispatchContextAction(request),
      // This channel's resolved configuration (host defaults beneath agent/app config).
      ChannelConfig: channelConfig ?? {},
      get Client(): BaseRealtimeClient | null {
        return service.client;
      },
      SendVideoFrame: (base64Image: string, mimeType?: string) => this.SendVideoFrame(base64Image, mimeType),
      IsTrackEstablished: (modality: string, direction: RealtimeTrackDirection) => this.IsTrackEstablished(modality, direction),
      // The camera and screen share, for a channel that fronts one: their state, and the user's clicks on its surface.
      Captures$: this.Captures$,
      StartCapture: (kind: RealtimeCaptureKind) => (kind === 'camera' ? this.StartCamera() : this.StartScreenShare()),
      StopCapture: (kind: RealtimeCaptureKind) => (kind === 'camera' ? this.StopCamera() : this.StopScreenShare()),
      // The agent's video, and the call's state, for a channel that shows the agent.
      AgentVideo$: this.AgentVideo$,
      ConnectionState$: this.ConnectionState$
    };
  }

  /**
   * Host registry of surface CLIENT TOOLS (Name → handler), fed by the host (Explorer) from the
   * active surface's `SetAgentClientTools` and from its always-on globals. The headless
   * ClientContextChannel's `ContextTool` proxy executes against this via {@link executeAppClientTool}.
   * Owner-keyed — see {@link AppClientToolRegistry}.
   */
  private readonly appToolRegistry = new AppClientToolRegistry();

  /**
   * Registers the tools ONE source of the host can run for the realtime `ContextTool`, replacing only
   * that source's previous set — other owners' tools are untouched. A host with two sources (Explorer's
   * always-available globals and the active surface's tools) registers each under its own owner key, so
   * refreshing the surface's tools can neither drop the globals nor leave the previous surface's tools
   * behind. Passing `[]` clears just that owner. When two owners register the same tool name, the
   * later-registered owner wins.
   *
   * Calling it with one argument (the original form) registers under {@link DEFAULT_APP_TOOL_OWNER}, so
   * a host with a single source behaves exactly as before.
   *
   * @param tools The owner's complete current set (name + handler; description/schema optional).
   * @param owner A stable key naming the source (e.g. `'explorer.surface'`). Defaults to a shared owner.
   */
  public RegisterAppClientTools(tools: ReadonlyArray<AppClientToolRegistration>, owner: string = DEFAULT_APP_TOOL_OWNER): void {
    this.appToolRegistry.Register(owner, tools);
  }

  /** Removes one owner's tools (and its place in the collision order). No-op when it has none. */
  public UnregisterAppClientTools(owner: string): void {
    this.appToolRegistry.Unregister(owner);
  }

  /** Removes every owner's tools. */
  public ClearAppClientTools(): void {
    this.appToolRegistry.Clear();
  }

  /**
   * The client tools in effect right now, resolved through the same unified resolver the server uses
   * (`override → session → app → static`, first match wins): the host's registered tools (described
   * by the manifest the host streams when it did not describe them itself) first, then the app and
   * agent tiers the server resolved at mint. Only the host-registered tools can RUN here; the
   * other tiers describe what the app declares.
   */
  private resolveAppClientTools(): ClientToolMetadata[] {
    const manifest = this._appContext$.value?.Capabilities?.Tools ?? [];
    return ResolveClientTools({
      agentId: '',
      sessionTools: MergeToolMetadata(this.appToolRegistry.ToMetadata(), manifest),
      appTools: this.sessionClientTools?.App,
      staticTools: this.sessionClientTools?.Static,
    });
  }

  /**
   * Executes a host-registered surface client tool by name (the {@link RealtimeChannelContext.ExecuteClientTool}
   * implementation). Tolerant: an unknown tool or a thrown handler resolves to a structured
   * `Success: false` result the channel narrates — never throws. A tool the app declares but the host has
   * not registered a handler for says so, instead of reading like a typo.
   *
   * @param name The tool name (the model's `action`).
   * @param params The tool parameters.
   * @returns A structured result for the channel to serialize back to the model.
   */
  private async executeAppClientTool(
    name: string,
    params: Record<string, unknown>
  ): Promise<{ Success: boolean; Result?: unknown; ErrorMessage?: string }> {
    const handler = this.appToolRegistry.Find(name)?.Handler;
    if (!handler) {
      return { Success: false, ErrorMessage: this.describeMissingClientTool(name) };
    }
    try {
      const result = await handler(params ?? {});
      return { Success: true, Result: result };
    } catch (error) {
      return { Success: false, ErrorMessage: error instanceof Error ? error.message : String(error) };
    }
  }

  /** The model-readable reason a client tool could not run. */
  private describeMissingClientTool(name: string): string {
    const available = this.appToolRegistry.Names().join(', ');
    const wanted = (name ?? '').trim().toLowerCase();
    const declared = this.resolveAppClientTools().find((t) => t.Name.trim().toLowerCase() === wanted);
    if (declared) {
      return `The client tool "${name}" is declared for this app but this surface has not registered it, so it cannot run right now. Available: ${available || '(none)'}.`;
    }
    return `No client tool named "${name}" is available on this surface. Available: ${available || '(none)'}.`;
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
    this.priorChannelStates = {};
    if (!statesJson) {
      return;
    }
    try {
      const parsed: unknown = JSON.parse(statesJson);
      if (parsed === null || typeof parsed !== 'object') {
        return;
      }
      this.priorChannelStates = parsed as Record<string, string>;
    } catch {
      console.warn('[RealtimeSession] PriorChannelStatesJson was malformed — starting channels fresh');
      return;
    }
    for (const plugin of this._activeChannels$.value) {
      this.restorePriorChannelState(plugin);
    }
  }

  /** Offers one plugin its prior-session state, if there is one. Rejections and throws are logged, never fatal. */
  private restorePriorChannelState(plugin: BaseRealtimeChannelClient): void {
    const state = this.priorChannelStates[plugin.ChannelName];
    if (typeof state !== 'string' || state.length === 0) {
      return;
    }
    try {
      if (!plugin.RestoreState(state)) {
        console.warn(`[RealtimeSession] Channel '${plugin.ChannelName}' declined its prior-session state — starting fresh`);
      }
    } catch (error) {
      console.warn(`[RealtimeSession] Channel '${plugin.ChannelName}' restore threw — starting fresh`, error);
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
      Timer: setTimeout(() => this.flushChannelSave(channelName), RealtimeSessionRuntime.channelSaveDebounceMs),
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
    // Channels that were prepared or advertised but never mounted were never initialized, so there is
    // nothing to dispose — only the bookkeeping to forget.
    this.discardUnmountedChannels();
    this.catalogNotePending = false;
    this.resolvedChannels.clear();
    this.priorChannelStates = {};
    this.sessionClientTools = null;
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

  /**
   * Builds the client-direct session config the realtime client connects with.
   * Aggregates the tracks active channels source and sink under {@link REQUESTED_TRACKS_SESSION_KEY} so the
   * driver can negotiate them (e.g., inbound video for Whiteboard / RemoteBrowser, outbound video for a
   * channel that shows the agent's video). A track the model does not support resolves to `'unsupported'`.
   * The session's transport and relay URL go to the driver as minted (an unknown transport is left out: direct).
   */
  public BuildClientConfig(session: StartRealtimeClientSessionResult): ClientRealtimeSessionConfig {
    const sessionConfig = this.parseSessionConfig(session.SessionConfigJson);
    const channelTracks = this._activeChannels$.value.flatMap((c) => [...c.GetSourcedTracks(), ...c.GetSunkTracks()]);
    if (channelTracks.length > 0) {
      // The requested tracks cross a JSON boundary — the driver reads them back out of the session
      // config bag (`GeminiRealtimeClient.parseSessionConfig`). A `RealtimeTrackDescriptor` is NOT
      // structurally a `JSONValue`: it has no index signature and `UsageBasis` is readonly, so the
      // conversion is written out rather than asserted. Dedupe key and precedence are unchanged —
      // audio floor first, then anything the mint supplied, then the channels' own tracks.
      const existing: readonly JSONValue[] = Array.isArray(sessionConfig[REQUESTED_TRACKS_SESSION_KEY])
        ? sessionConfig[REQUESTED_TRACKS_SESSION_KEY]
        : [];
      const trackMap = new Map<string, JSONValue>();
      for (const t of DEFAULT_REALTIME_AUDIO_TRACKS) {
        trackMap.set(`${t.Direction}:${t.Modality}`, trackDescriptorToJSON(t));
      }
      for (const raw of existing) {
        const key = trackKeyFromJSON(raw);
        if (key) {
          trackMap.set(key, raw);
        }
      }
      for (const t of channelTracks) {
        trackMap.set(`${t.Direction}:${t.Modality}`, trackDescriptorToJSON(t));
      }
      sessionConfig[REQUESTED_TRACKS_SESSION_KEY] = Array.from(trackMap.values());
    }
    const transport = ParseRealtimeClientTransport(session.Transport);
    return {
      Provider: session.Provider,
      Model: session.Model,
      EphemeralToken: session.EphemeralToken,
      ExpiresAt: session.ExpiresAt,
      ...(transport ? { Transport: transport } : {}),
      ...(session.RelayUrl ? { RelayUrl: session.RelayUrl } : {}),
      SessionConfig: sessionConfig
    };
  }

  /** @deprecated Use {@link BuildClientConfig}. */
  public buildClientConfig(session: StartRealtimeClientSessionResult): ClientRealtimeSessionConfig {
    return this.BuildClientConfig(session);
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
      console.error('[RealtimeSession] Provider error event:', JSON.stringify(error), error);
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
    client.OnRemoteVideo((video: MediaVideoSource) => this.onAgentVideo(client, video));
  }

  /**
   * The model's video arrived: publish it on {@link AgentVideo$}, and mark each channel that shows it (one that sinks
   * outbound video) as used, so the host shows its surface. A client the session has already let go of is ignored, so a
   * late frame cannot bring the video back after the call.
   */
  private onAgentVideo(client: BaseRealtimeClient, video: MediaVideoSource): void {
    if (this.client !== client) {
      return;
    }
    this._agentVideo$.next(video);
    for (const channel of this._activeChannels$.value) {
      if (channel.ShowsAgentVideo) {
        this.noteChannelActivity(channel);
      }
    }
  }

  /** Clears {@link AgentVideo$} when the call's client goes. */
  private clearAgentVideo(): void {
    if (this._agentVideo$.value !== null) {
      this._agentVideo$.next(null);
    }
  }

  /** Maps a client state event onto the UI connection state. */
  private onClientStateChange(state: RealtimeClientState): void {
    const mapped = this.mapClientState(state);
    if (mapped) {
      this._connectionState$.next(mapped);
      this.flushChannelCatalogNote();
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
      if (transcript.Role === 'User') {
        if (!this.hasActiveInterimUserCaption) {
          if (transcript.Text.trim().length === 0) {
            return;
          }
          this.hasActiveInterimUserCaption = true;
          this.pendingUserCaption = transcript.Text;
          this.appendCaption({ Role: 'User', Text: this.pendingUserCaption });
        } else {
          this.pendingUserCaption += transcript.Text;
          this.replaceLastCaption('User', this.pendingUserCaption);
        }
      }
      return;
    }
    if (transcript.Role === 'Assistant') {
      this.hasActiveInterimUserCaption = false;
      this.pendingUserCaption = '';
      if (transcript.Kind === 'narration') {
        if (transcript.IsThought) {
          this._thoughtNarration$.next({
            CallID: 'thought-session',
            Text: transcript.Text,
            IsFinal: transcript.IsFinal ?? true,
          });
        } else {
          this._delegationNarration$.next({ Text: transcript.Text });
          // Remember what was actually SAID so later updates build on it instead of repeating.
          this.spokenNarrations.push(transcript.Text);
          if (this.spokenNarrations.length > RealtimeSessionRuntime.maxPriorNarrations) {
            this.spokenNarrations.shift();
          }
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
    } else if (this.hasActiveInterimUserCaption) {
      this.hasActiveInterimUserCaption = false;
      this.pendingUserCaption = '';
      if (transcript.Text.trim().length === 0) {
        return;
      }
      this.replaceLastCaption('User', transcript.Text);
      if (this.firstUserTranscript === null) {
        this.firstUserTranscript = transcript.Text;
      }
      await this.relayTranscript('user', transcript.Text);
    } else if (transcript.ReplacesPrevious) {
      // STREAMING user transcription: providers like Grok and OpenAI Live emit the growing utterance as repeated
      // events (each the full text so far), flagging all but the first ReplacesPrevious. Update the
      // in-place User caption + persisted turn instead of stacking a new bubble per increment — the
      // same correction semantics the assistant branch uses. (Classic OpenAI Realtime sends one final → the else path.)
      if (transcript.Text.trim().length === 0) {
        return;
      }
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
    if (this.turnAudioStartCaptured || kind === 'narration') {
      return;
    }
    const offset = this.nowTurnOffsetMs();
    if (offset === null) {
      return;
    }
    this.currentTurnStartMs = offset;
    this.turnAudioStartCaptured = true;
  }

  /**
   * The current per-turn offset in ms — the RECORDER's clock when one runs (an offset into a
   * seekable file), else the SESSION clock (#3832: orderable and displayable, not seekable),
   * else `null` before any call is live. One function so the two stamp sites cannot disagree
   * about which clock a session is on.
   */
  private nowTurnOffsetMs(): number | null {
    if (this.recorder) {
      return this.recorder.NowOffsetMs();
    }
    if (this.sessionClockStartMs !== null) {
      return Math.max(0, Math.round(performance.now() - this.sessionClockStartMs));
    }
    return null;
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
      // Local UI tool: no server relay, no 'thinking' turn-state / narration burst, and intentionally
      // NO thread card — these are fast, in-browser surface mutations (e.g. drawing on the whiteboard)
      // whose visual effects are immediately visible on the dedicated canvas/surface.
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

    if (call.ToolName !== 'invoke-target-agent') {
      // Direct action: emit synthetic progress immediately so the conversation thread
      // and activity rail render an active "working" action card while the tool executes.
      this._delegationProgress$.next({
        CallID: call.CallID,
        ToolName: call.ToolName,
        Step: 'direct_action',
        Message: `Executing ${FormatToolName(call.ToolName)}`
      });
    }

    try {
      const resultJson = await this.executeSessionTool(call.CallID, call.ToolName, call.ArgumentsJson);
      this.emitDelegationResult(call.CallID, resultJson, call.ToolName);
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
      this.emitDelegationResult(call.CallID, errorJson, call.ToolName);
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
   * {@link ParseDelegationResultJson}; if it isn't JSON, surfaces the raw string. The `runId`
   * (the delegated `MJ: AI Agent Runs` record) rides along as {@link RealtimeDelegationResult.RunID}
   * for the overlay's dev links, and any `artifacts` ride along as {@link RealtimeDelegationResult.Artifacts}
   * for the surface panel's artifact tabs.
   */
  private emitDelegationResult(callId: string, resultJson: string, toolName?: string): void {
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
      ToolName: toolName,
      Success: parsed.Success,
      Output: parsed.Output,
      RunID: parsed.RunID,
      Artifacts: parsed.Artifacts
    });
    if (parsed.Success && parsed.Artifacts && parsed.Artifacts.length > 0) {
      void this.offerDelegationArtifacts(parsed.Artifacts);
    }
  }

  /**
   * Offers a delegated run's artifacts to the channels that host artifacts (an Interactive Component channel
   * shows a component artifact, or swaps in a newer version of one it already shows). Each channel is asked
   * first whether it wants them; an advertised, unopened channel that does is mounted before it is handed
   * them. One channel failing never stops the others, and nothing here can fail the delegation result,
   * which has already been emitted.
   */
  private async offerDelegationArtifacts(artifacts: readonly ParsedDelegationArtifact[]): Promise<void> {
    const candidates: Array<{ Plugin: BaseRealtimeChannelClient; IsOpen: boolean }> = [
      ...this._activeChannels$.value.map((plugin) => ({ Plugin: plugin, IsOpen: true })),
      ...this.advertisedChannels.map((prepared) => ({ Plugin: prepared.Plugin, IsOpen: false }))
    ];
    for (const { Plugin: plugin, IsOpen: isOpen } of candidates) {
      try {
        const config = this.GetResolvedChannel(plugin.ChannelName)?.Config ?? {};
        if (!plugin.AcceptsDelegationArtifacts(artifacts, config)) {
          continue;
        }
        if (!isOpen) {
          await this.mountAdvertisedChannel(plugin);
        }
        await plugin.OnDelegationArtifacts(artifacts);
        if (!isOpen) {
          this.noteChannelActivity(plugin); // the channel was mounted for this: reveal its tab
        }
      } catch (error) {
        console.error(`[RealtimeSession] Channel '${plugin.ChannelName}' failed to take a delegated run's artifacts:`, error);
      }
    }
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

  /**
   * Mints a session through the installed {@link Launcher} — by default the stock
   * `StartRealtimeClientSession` mutation (see {@link DefaultRealtimeSessionLauncher}).
   */
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
    appContext?: AppContextSnapshot | null,
    channelCandidatesJson?: string | null
  ): Promise<StartRealtimeClientSessionResult> {
    const result = await this._launcher.Launch(
      {
        TargetAgentId: targetAgentId,
        ConversationId: conversationId ?? null,
        LastSessionId: lastSessionId ?? null,
        PreferredModelId: preferredModelId ?? null,
        ClientTools: clientTools ?? [],
        CoAgentId: coAgentId ?? null,
        ConfigOverridesJson: configOverridesJson ?? null,
        RecordingConsent: recordingConsent ?? false,
        RecordingStartedAt: recordingStartedAt ?? null,
        MediaCollectionId: mediaCollectionId ?? null,
        ApplicationId: applicationId ?? null,
        AppContext: appContext ?? null,
        ChannelCandidatesJson: channelCandidatesJson ?? null
      },
      { Provider: this.Provider }
    );
    if (!HasClientCredential(result)) {
      throw new Error('The session launcher returned no ephemeral token (or, for a relay session, no relay URL)');
    }
    return result;
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
    // Per-turn timing against whichever clock the session is on (#3832): the recorder's when one
    // runs, else the session clock. `utteranceStartMs` is where this turn's audio actually began
    // (captured by markTurnAudioStart on the first interim); the `?? 0` fallback covers a turn
    // whose interim was missed / a final-only first turn.
    const utteranceEndMs = this.nowTurnOffsetMs();
    const utteranceStartMs = utteranceEndMs !== null && !replacesPrevious ? (this.currentTurnStartMs ?? 0) : null;
    if (utteranceEndMs !== null && !replacesPrevious) {
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
   * values are clamped to 0; an all-zero delta is dropped without arming the timer. The
   * update's input and output detail blocks add into the pending details by the record's
   * rules (amounts add up, inbound video running totals keep the larger value), so an update
   * that carries only avatar video seconds still counts.
   */
  private onUsageDelta(usage: RealtimeClientUsage): void {
    const input = this.clampUsageDelta(usage.InputTokens);
    const output = this.clampUsageDelta(usage.OutputTokens);
    const details = AddRealtimeUsageRecord(null, { Input: usage.InputTokenDetails, Output: usage.OutputTokenDetails });
    const hasDetails = HasRealtimeUsage(details);
    if (input === 0 && output === 0 && !hasDetails) {
      return;
    }
    this.pendingUsageInput += input;
    this.pendingUsageOutput += output;
    if (hasDetails) {
      this.pendingUsageDetails = AddRealtimeUsageRecord(this.pendingUsageDetails, details);
    }
    this.armUsageFlush();
  }

  /** Schedules the debounced usage relay unless one is already pending. */
  private armUsageFlush(): void {
    if (!this.usageFlushTimer) {
      this.usageFlushTimer = setTimeout(() => {
        this.usageFlushTimer = null;
        void this.flushPendingUsage();
      }, RealtimeSessionRuntime.usageFlushDebounceMs);
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
    const details = this.pendingUsageDetails;
    if (!sessionId || (input === 0 && output === 0 && !details)) {
      return;
    }
    this.pendingUsageInput = 0;
    this.pendingUsageOutput = 0;
    this.pendingUsageDetails = null;
    try {
      // The details argument is sent only when there are details, so a token-only relay is unchanged.
      const variables = { agentSessionId: sessionId, inputTokens: input, outputTokens: output, ...(details ? { usageDetailsJson: JSON.stringify(details) } : {}) };
      await this.gql().ExecuteGQL(RELAY_REALTIME_USAGE_MUTATION, variables);
    } catch (error) {
      console.error('[RealtimeSession] Failed to relay usage telemetry:', error);
      // Re-accumulate so a later debounce / the teardown flush retries the same deltas.
      this.pendingUsageInput += input;
      this.pendingUsageOutput += output;
      if (details) {
        this.pendingUsageDetails = AddRealtimeUsageRecord(this.pendingUsageDetails, details);
      }
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
    this.pendingUsageDetails = null;
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
        // The URL rides along so the channel can notice a page change nobody on this side caused —
        // under streaming the snapshot poll is stopped, and frames were pure pixels (#3496).
        channel.OnScreencastFrame(frame.dataBase64, frame.currentUrl ?? null);
        return;
      }
    }
  }

  /** Structural guard: true when the channel exposes an `OnScreencastFrame(dataBase64)` method. */
  private hasOnScreencastFrame(
    channel: BaseRealtimeChannelClient,
  ): channel is BaseRealtimeChannelClient & { OnScreencastFrame(dataBase64: string, currentUrl?: string | null): void } {
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
    if (this.pendingNarrationMessages.length > RealtimeSessionRuntime.maxDigestMessages) {
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
      ? this.delegationBurstStartedAt + RealtimeSessionRuntime.firstNarrationDelayMs
      : 0;
    const spacingFloor = this.lastDelegationNarrationAt > 0
      ? this.lastDelegationNarrationAt + RealtimeSessionRuntime.narrationIntervalMs
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
      this.narrationTimer = setTimeout(() => this.fireDeferredNarration(), RealtimeSessionRuntime.narrationBusyRetryMs);
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
      PriorNarrations: this.spokenNarrations.slice(-RealtimeSessionRuntime.maxPriorNarrations),
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
    // Invalidate any start still in flight BEFORE anything else, so it abandons itself at its next
    // await rather than opening a microphone behind a session that is being ended.
    this.startGeneration++;

    // Coalesce concurrent teardowns onto one run. Callers still get a promise that resolves when
    // teardown is actually complete.
    if (this.teardownInFlight) {
      await this.teardownInFlight;
      return;
    }
    this.teardownInFlight = this.runTeardown(closeServerSession).finally(() => {
      this.teardownInFlight = null;
    });
    await this.teardownInFlight;
  }

  /** The body of {@link teardown}; never called concurrently with itself. */
  private async runTeardown(closeServerSession: boolean): Promise<void> {
    // First: stop asserting liveness. A pulse racing the close would re-stamp LastActiveAt on a
    // session we are deliberately ending, leaving an Idle row the janitor then has to age out.
    this.stopLivenessPulse();
    this.teardownDelegationProgress();
    this.stopSessionEvents();
    this.clientDeadline.Clear();

    // Channels first: flush any unsaved channel state WHILE the live session id is still
    // set (the captured per-save id covers the race anyway), then dispose the plugins.
    this.flushAllChannelSaves();
    this.disposeChannels();

    // The camera and screen share go first: the camera runs on the controller closed next.
    this.closeCaptures();
    // Defensive: stop the mic even when Connect never ran (the client also stops the
    // tracks it was handed — track.stop() is idempotent).
    this.closeLocalMedia();
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;

    // Hand the platform back whatever acquiring the microphone changed. Stopping the tracks is not
    // the same thing: iOS, for instance, is put into a record-and-play audio category for the call,
    // and leaving it there changes the route and volume behaviour of every sound the app makes
    // afterwards. Best-effort by contract — a failure here must never block ending a call.
    try {
      await this.mediaHost.ReleaseMicrophone?.();
    } catch (error) {
      console.error('[RealtimeSession] Media host failed to release the microphone:', error);
    }

    if (this.client) {
      await this.client.Disconnect();
      this.unwatchVideoSources();
      this.clearAgentVideo();
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
    if (this._avatarNotice$.value !== null) {
      this._avatarNotice$.next(null);
    }
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
    this.pendingUserCaption = '';
    this.hasActiveInterimUserCaption = false;
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
