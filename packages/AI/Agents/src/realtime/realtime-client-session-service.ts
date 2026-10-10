/**
 * @fileoverview Server-agnostic preparer + tool relay for a CLIENT-DIRECT realtime session
 * (the Realtime Co-Agent dual-topology design).
 *
 * In the client-direct topology the browser opens its OWN provider socket (e.g. WebRTC) using a
 * server-minted ephemeral token, but the **server** still owns the system prompt and tool set and
 * **executes** every tool call the browser relays back. This service is the server-side half of
 * that contract. It does two things:
 *
 * 1. {@link RealtimeClientSessionService.PrepareClientSession} — resolves the Realtime model,
 *    assembles the companion system prompt (co-agent prompt + target identity + history + memory),
 *    builds the realtime tool set (always including `invoke-target-agent`, plus allowed direct actions on dynamic-toolset drivers), and
 *    asks the model to mint a {@link ClientRealtimeSessionConfig} (ephemeral token + provider
 *    session config) the browser applies verbatim.
 * 2. {@link RealtimeClientSessionService.ExecuteRelayedTool} — executes a single tool call the
 *    browser relayed, routing it through the shared {@link RealtimeToolBroker} so the result is
 *    byte-for-byte identical to the server-bridged path. `invoke-target-agent` delegates to the
 *    target agent via {@link AgentRunner.RunAgent}; allowed direct actions execute via
 *    {@link ActionEngineServer.Instance.RunAction}; other tools return a structured "not available" result.
 *
 * **Why this duplicates BaseAgent.** The private helpers in `BaseAgent.executeRealtimeSession`
 * (model resolution, companion-prompt assembly, target-agent resolution, delegation) are the
 * server-bridged equivalents of the logic here, but they are `private` to `BaseAgent` and bound to
 * an in-flight `AIAgentRun`/`StartSession` lifecycle. This service mirrors that logic for the
 * client-direct topology, which has no server-side session loop. **A future refactor should extract
 * a shared `RealtimeSessionPreparer`** that both `BaseAgent` and this service consume, eliminating
 * the duplication. Until then, keep the two in sync intentionally.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import { UserInfo, IMetadataProvider, LogError, LogStatus, RunView, DatabaseProviderBase } from '@memberjunction/core';
import { MJAIAgentRunStepEntity, MJArtifactEntity, MJApplicationEntity, MJConversationEntity, MJActionParamEntity } from '@memberjunction/core-entities';
import { MJGlobal, MJLruCache, UUIDsEqual, EscapeSQLString } from '@memberjunction/global';
import { ActionEngineServer } from '@memberjunction/actions';
import { ActionParam, MJActionEntityExtended, RunActionParams } from '@memberjunction/actions-base';
import {
    BaseRealtimeModel,
    ChatMessage,
    ClientRealtimeSessionConfig,
    GetAIAPIKey,
    AIAPIKey,
    AIAPIKeyResolver,
    AICredentialScope,
    CredentialScopeAllows,
    IRealtimeSession,
    IsZeroDataRetention,
    JSONObject,
    RealtimeAvatarStatus,
    RealtimeSessionParams,
    RealtimeToolCall,
    RealtimeToolDefinition
} from '@memberjunction/ai';
import {
    MJAIAgentEntityExtended,
    MJAIModelEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIPromptRunEntityExtended,
    AgentExecutionProgressCallback,
    ExecuteAgentResult,
    AppContextSnapshot,
    FormatAppContextNote,
    ResolvePromptRunUserID,
    ClientToolMetadataFromDefinition,
    ParseAgentSettings,
    ResolveAppClientToolMetadata,
    ResolveClientTools,
    type ClientToolMetadata,
    type IAgentSettings,
    type RealtimeChannelCandidate,
    type RealtimeSessionClientPolicy,
    type RealtimeSessionClientTools
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { ResolveRealtimeAvatar, ResolveRealtimeAvatarStatus, type RealtimeAvatarResolution } from './realtime-avatar-resolution';
import { ReadRealtimeVideoOutputRow, RealtimeModelShowsAvatar } from './realtime-video-output-gate';

import { AgentMemoryContextBuilder } from '../agent-memory-context-builder';
import { AgentRunner } from '../AgentRunner';
import { AgentRunWatchdog } from '../agent-run-watchdog';
import { DelegationNarrator } from './realtime-delegation-narrator';
import { FilterAllowedAgentsByCanRun } from './realtime-coagent-resolution';
import { BridgeRealtimeUsageRecorder } from './bridge-realtime-usage-recorder';
import {
    RealtimeToolBroker,
    RealtimeToolBrokerDeps,
    INVOKE_TARGET_AGENT_TOOL_NAME,
    INVOKE_TARGET_AGENT_DESCRIPTION,
    BuildRealtimeAgentFraming,
    RealtimeColleague,
    DelegateToTargetRequest,
    DelegatedResult,
    DelegatedRunArtifact,
    ToolExecutionResult
} from './realtime-tool-broker';
import {
    NARRATION_PROMPT_NAME,
    LEGACY_NARRATION_PROMPT_NAME,
    ResolveNarrationInstructionsTemplate
} from './realtime-narration';
import {
    BuildVoiceMannerSection,
    BuildAppRealtimeOverridesJson,
    DeepMergeConfigs,
    GetModelCatalogSessionSettings,
    GetDisclosureForTarget,
    GetNarrationPaceMs,
    GetProviderVoiceSettings,
    GetSessionTuningSettings,
    GetWatchesMeetingVideo,
    JSONObjectLike,
    RealtimeAllowedAgent,
    RealtimeCoAgentConfig,
    RealtimeDirectActionsConfig,
    ResolveEffectiveRealtimeConfig,
    MatchProviderVoiceSettings,
    GetDirectActionsConfig,
    IsActionAllowedForDirectInvocation
} from './realtime-coagent-config';
import { ListRealtimeVendorsForModel, SelectRealtimeVendorForModel, RealtimeVendorSelection } from './realtime-vendor-resolution';
import { AIEngineBase, MergeRealtimeUsageRecord, type RealtimeUsageRecord } from '@memberjunction/ai-engine-base';
import { BuildSessionChannelPolicy, type RealtimeChannelRegistryRow } from './realtime-channel-policy';

/**
 * How many seconds of avatar video a run may store beyond its elapsed time: usage is client-reported, so the stored
 * output video seconds are capped at the run's elapsed time plus this grace (relays land a few seconds late).
 */
const VIDEO_SECONDS_GRACE = 30;

/**
 * Context passed to {@link PrepareClientSessionInput.ResolveHostTools} describing the
 * model, vendor, and driver resolved for the realtime session.
 */
export interface RealtimeHostToolsResolutionContext {
    /** The resolved model entity ID. */
    ModelID?: string;
    /** The resolved model vendor ID, if known. */
    ModelVendorID?: string;
    /** The resolved realtime driver class name (e.g. 'OpenAILiveRealtime'). */
    DriverClass?: string;
}

/**
 * Resolver callback signature for dynamically resolving host tools prior to session start.
 */
export type RealtimeHostToolsResolver = (resolved: RealtimeHostToolsResolutionContext) => RealtimeToolDefinition[] | undefined;

/**
 * Input for {@link RealtimeClientSessionService.PrepareClientSession}.
 *
 * The co-agent may be supplied either as a fully-loaded entity (`CoAgent`) or by id (`CoAgentID`),
 * which is resolved from {@link AIEngine}'s cached agents. The target agent is always supplied by
 * id — it is a runtime choice made when the voice session starts.
 */
export interface PrepareClientSessionInput {
    /**
     * The run's runtime API keys, when the session is prepared from an agent run that carries them
     * (`ExecuteAgentParams.apiKeys`, set by `BaseAgent.StartBridgeRealtimeSession`). Vendor selection
     * and the minted session try these first, per driver class; for a class they do not key, this
     * service's {@link RealtimeClientSessionService.getAPIKeyForDriver} seam answers (by default the
     * `AI_VENDOR_API_KEY__<driver>` environment key). That is the same order as `GetAIAPIKey` — the
     * legacy tier of prompt key resolution. MJ Credentials / `AICredentialBinding`s, which a prompt
     * consults first, are not consulted by realtime. Absent ⇒ the seam alone, which is every
     * client-initiated session today.
     */
    APIKeys?: AIAPIKey[];
    /**
     * The run's credential scope (`ExecuteAgentParams.CredentialScope`). `'RuntimeOnly'` makes
     * {@link PrepareClientSessionInput.APIKeys} the whole key chain: a vendor they do not key is not
     * selected, and the {@link RealtimeClientSessionService.getAPIKeyForDriver} seam (by default the
     * platform's environment key) is never consulted. Absent ⇒ `'Any'`.
     */
    CredentialScope?: AICredentialScope;
    /** The Realtime Co-Agent entity. Provide this OR {@link PrepareClientSessionInput.CoAgentID}. */
    CoAgent?: MJAIAgentEntityExtended;
    /** The Realtime Co-Agent id (resolved from cached metadata). Provide this OR {@link PrepareClientSessionInput.CoAgent}. */
    CoAgentID?: string;
    /** The top-level target agent the co-agent voices on behalf of (a runtime parameter). */
    TargetAgentID: string;
    /** The shared session id grouping this voice session's runs. */
    AgentSessionID: string;
    /** Optional conversation id the session is attached to — stamped on the co-agent observability run. */
    ConversationID?: string;
    /**
     * Optional application id the realtime session runs in. Sources the **app cascade layer** of the
     * effective config: `Application.AgentSettings.Realtime` (persona/disclosure/model overrides) +
     * `RelevantAgents` (union-accumulated into the co-agent's allowed delegation set). Absent ⇒ no
     * app layer (the cascade rests on type/co-agent/target/override only).
     */
    ApplicationID?: string;
    /**
     * The interactive channels the BROWSER reports it could mount in this session (key, code defaults,
     * native tools, host-declared?). When present the service scopes them — registry kill switch, agent
     * and app configuration (`realtime.channels`) — narrows/completes {@link ExtraTools} to match, and
     * returns the resolved {@link RealtimeClientSessionPrepResult.ClientPolicy} for the browser to
     * activate. Absent ⇒ no scoping (a client that predates channel scoping, or a host that mints
     * through its own proxy): {@link ExtraTools} is used exactly as declared.
     */
    ChannelCandidates?: RealtimeChannelCandidate[];
    /**
     * Optional app-context snapshot — where the user is, what they see, and the live capability
     * manifest — injected into the companion system prompt at mint (the session-start half of the
     * client-context delivery; the {@link import('@memberjunction/ai-core-plus').AppContextSnapshot}
     * shape). The streaming half rides the ClientContextChannel. Absent ⇒ no app-context section.
     */
    AppContext?: AppContextSnapshot;
    /** Prior conversation history to seed the model's context. Optional. */
    ConversationMessages?: ChatMessage[];
    /**
     * Tools the HOST (not the co-agent runtime) declares AND executes — e.g. a phone call's `transfer_call`,
     * `send_dtmf` and `end_call`. They are added to the session's tool set but, unlike {@link ExtraTools}, are
     * NOT described as interactive-surface tools in the prompt. The host executes them through the runtime's
     * local tool handler ({@link BridgeRealtimeRuntime.SetLocalToolHandler}).
     */
    HostTools?: RealtimeToolDefinition[];
    /**
     * Optional callback that allows the host to resolve host tools dynamically based on
     * the model, vendor, and driver actually resolved for the session, before session opening.
     */
    ResolveHostTools?: RealtimeHostToolsResolver;
    /**
     * Host-authored instructions appended to the system prompt (e.g. "this is an audio-only phone call …",
     * the caller's number and verification status). Empty/absent adds nothing.
     */
    HostFraming?: string;
    /**
     * Pre-formatted, role-tagged transcript lines (`User: …` / `Assistant: …`, newline-separated)
     * from the caller's PRIOR session leg(s) when this session RESUMES one (`lastSessionId`).
     * The transport layer (the MJServer resolver) loads, ownership-checks, and caps this
     * (~30 turns / ~8k chars, oldest dropped) before threading it here; the service only
     * FRAMES it into the system prompt as a clearly-labeled prior-conversation section so the
     * model remembers the previous leg. Optional — absent for fresh sessions, and any
     * upstream load failure simply omits it (hydration never blocks a start).
     */
    PriorTranscript?: string;
    /** Optional user-scope id for memory/context retrieval (falls back to the context user). */
    UserID?: string;
    /** Optional company-scope id for memory/context retrieval. */
    CompanyID?: string;
    /** Optional provider-specific session config bag (voice, language, turn detection, etc.). */
    Config?: JSONObject;
    /** Optional extra tools to expose in addition to `invoke-target-agent`. */
    ExtraTools?: RealtimeToolDefinition[];
    /**
     * Optional EXPLICIT realtime model choice (`MJ: AI Models.ID`). When set, that exact model is
     * used — it must be Active, of AIModelType `Realtime`, and have an active vendor whose
     * `DriverClass` resolves an API key. If the preferred model cannot be satisfied the prepare
     * FAILS with a clear reason (no silent fallback — the user explicitly chose). When omitted,
     * the default highest-PowerRank resolution applies.
     */
    PreferredModelID?: string;
    /**
     * Optional RUNTIME configuration-override layer (the most-specific layer of the effective
     * configuration merge: type `DefaultConfiguration` ← agent `TypeConfiguration` ← this).
     * **Pre-authorized by the transport layer** — the MJServer resolver gates it behind the
     * `Realtime: Advanced Session Controls` authorization BEFORE threading it here; the service
     * trusts the input. Malformed JSON is tolerated (it simply contributes nothing to the merge).
     */
    ConfigOverridesJson?: string;
    /**
     * **Multi-agent meeting mode.** When `true`, the agent joins as one of several voices in a shared
     * room: its model's **blind auto-response is disabled** (the session Config carries
     * `disableAutoResponse`, which providers translate to e.g. OpenAI `turn_detection.create_response=false`)
     * and a meeting-aware clause is added to the prompt so it **hears everything but speaks only when
     * addressed**. The bridge becomes the sole speech trigger (gated by its turn policy). Absent/`false`
     * = a 1:1 call with the model's normal auto-response. See
     * `plans/realtime/multi-agent-meeting-turn-taking.md`.
     */
    DisableAutoResponse?: boolean;
    /**
     * The names the meeting-aware prompt tells the agent it answers to (its own display name + aliases).
     * Used ONLY to phrase the "you are addressed when someone says one of these" guidance; the actual
     * addressing GATE is the bridge's `RegexAddressedMatcher`. Ignored unless {@link DisableAutoResponse}.
     */
    SelfNames?: string[];
    /**
     * `'room'` for a server-side (bridged) session whose host publishes the agent's avatar into a meeting room: the
     * avatar request resolved for the voiced agent carries it (`RealtimeAvatarSettings.Delivery`), so a driver may
     * render it there. Absent: a server-side session asks for no video (the driver logs `bridged`).
     */
    AvatarDelivery?: 'room';
    /**
     * `true` for a server-side session (a bridged meeting or a phone call), which can show the agent's avatar only when its
     * host publishes it into a room ({@link AvatarDelivery} `'room'`). Without that, the default model walk's video
     * preference skips the session: no model would bring it an avatar. Absent: a browser (client-direct) session.
     */
    ServerSide?: boolean;
    /**
     * Optional server-authoritative hard ceiling on the session's wall-clock duration, in seconds.
     * Threaded into {@link RealtimeSessionParams.MaxSessionSeconds} so a driver can bound the
     * provider session/token, and surfaced so the transport layer (the MJServer resolver) can stamp
     * the absolute deadline on the session for the janitor to enforce. Set for abuse-sensitive
     * deployments (a public web-widget guest's `VoiceMaxSessionMinutes`); omitted otherwise.
     */
    MaxSessionSeconds?: number;
}

/**
 * Result of {@link RealtimeClientSessionService.PrepareClientSession}.
 *
 * On success, {@link RealtimeClientSessionPrepResult.ClientConfig} is the server-minted config the
 * browser applies, and {@link RealtimeClientSessionPrepResult.SessionParams} is the params the
 * server used to mint it (handy for the resolver to echo/persist). On failure, `Success` is `false`
 * and `ErrorMessage` explains why — this method never throws for an unresolvable model/key.
 */
export interface RealtimeClientSessionPrepResult {
    /** Whether the client session config was minted successfully. */
    Success: boolean;
    /** The minted client-direct session config (token + provider session config). Present on success. */
    ClientConfig?: ClientRealtimeSessionConfig;
    /** The session params the server built (system prompt, model, tools). Present on success. */
    SessionParams?: RealtimeSessionParams;
    /**
     * ID of the server-side co-agent observability `AIAgentRun` created for this session. Present
     * when the run was created successfully; absent when run creation was skipped or failed
     * (observability is best-effort and never fails the prepare). Delegated target-agent runs nest
     * under this run via `ParentRunID`, and {@link RealtimeClientSessionService.FinalizeCoAgentRun}
     * closes it when the session ends.
     */
    CoAgentRunID?: string;
    /**
     * ID of the server-side co-agent `AIPromptRun` linked to {@link RealtimeClientSessionPrepResult.CoAgentRunID}.
     * Present only when the co-agent's system prompt resolved (so a prompt run could be created).
     */
    PromptRunID?: string;
    /**
     * ID of the single `MJ: AI Agent Run Steps` row created under {@link RealtimeClientSessionPrepResult.CoAgentRunID}
     * for the realtime session's system prompt (StepType `Prompt`, TargetID = the system prompt,
     * TargetLogID = {@link RealtimeClientSessionPrepResult.PromptRunID}). It makes the co-agent run's
     * Timeline non-empty. Present only when the co-agent's system prompt resolved AND the step saved
     * (step creation is best-effort, like the runs themselves). Finalized alongside the runs by
     * {@link RealtimeClientSessionService.FinalizeCoAgentRun}.
     */
    CoAgentRunStepID?: string;
    /** A human-readable failure reason. Present on failure. */
    ErrorMessage?: string;
    /** The `MJ: AI Models` row id of the realtime model the session was minted with. Present on success. */
    ModelID?: string;
    /** The display name of the realtime model the session was minted with. Present on success. */
    ModelName?: string;
    /**
     * The `DriverClass` of the vendor that actually ran the session (e.g. `OpenAIRealtime`,
     * `ElevenLabsRealtime`). Present on success.
     *
     * Disclosed for OBSERVABILITY — on the default-model path the framework picks the vendor itself, so
     * without this a caller cannot tell which one spoke, and cannot diagnose a voice that did not land
     * (issue #3530). Plumbed all the way to the browser as `StartRealtimeClientSessionResult.DriverClass`
     * (`RealtimeClientSessionResolver`), because on the client-direct path the caller IS the browser — a
     * disclosure that stopped at this service boundary would deliver no observability to anyone.
     *
     * It is deliberately NOT a pre-prepare resolution API: a caller does not need to know the vendor in
     * advance, because {@link RealtimeVoicePersona.voice} carries a voice to whichever vendor is chosen.
     * Re-deriving the vendor in order to pre-file provider-keyed settings duplicates a decision the
     * framework owns.
     */
    DriverClass?: string;
    /**
     * The DB-driven progress-narration instruction template (the `Realtime Co-Agent - Progress
     * Narration` prompt's `TemplateText`, containing a `{{ progressMessage }}` placeholder).
     * `undefined` when that prompt is not present in metadata — clients fall back to their
     * built-in narration instruction text.
     */
    NarrationInstructionsTemplate?: string;
    /**
     * The RESOLVED effective realtime configuration for this session (type defaults ← agent
     * config ← runtime overrides, deep-merged + normalized). Present on success — `{}` when no
     * layer configured anything. Surfaced so the transport layer can echo it to the client
     * (client drivers apply provider voice settings client-side in the client-direct topology).
     */
    EffectiveConfig?: RealtimeCoAgentConfig;
    /**
     * The resolved channel scope and client-tool tiers for the browser to activate — present only when
     * the input carried {@link PrepareClientSessionInput.ChannelCandidates}. The transport layer returns
     * it in the mint result and persists the in-session channel keys on the session.
     */
    ClientPolicy?: RealtimeSessionClientPolicy;
    /**
     * The effective narration pace (`realtime.narration.paceMs`) — minimum gap in ms between
     * spoken progress updates. `undefined` when not configured (clients/runners use their
     * built-in default). In the CLIENT-DIRECT topology narration pacing is enforced client-side,
     * so this is surfaced for the browser; the server-bridged runner consumes it directly via
     * `RealtimeSessionRunnerDeps.NarrationPaceMs`.
     */
    NarrationPaceMs?: number;
    /**
     * The live avatar the session asked for and whether it shows: granted, or audio only and why
     * ({@link ResolveRealtimeAvatarStatus}). Absent when the voiced agent asked for no avatar (its video setting is
     * off). The transport layer returns it in the mint result, so the call can say why it shows no avatar.
     */
    AvatarStatus?: RealtimeAvatarStatus;
}

/**
 * The resolved co-agent system prompt text plus the id of the prompt it came from, returned by
 * {@link RealtimeClientSessionService.resolveCoAgentSystemPrompt}.
 */
export interface CoAgentSystemPromptResolution {
    /** The co-agent's system prompt template text (empty string when none is configured). */
    Text: string;
    /** The `MJ: AI Prompts` row id, or `null` when the co-agent has no active prompt. */
    PromptID: string | null;
}

/**
 * Input for {@link RealtimeClientSessionService.ExecuteRelayedTool}.
 *
 * Carries the single tool call the browser relayed plus the linkage needed to run a delegated
 * target-agent run under the same session.
 */
export interface ExecuteRelayedToolInput {
    /** The shared session id grouping this voice session's runs. */
    AgentSessionID: string;
    /** The id of the (co-agent) run that owns this session, used as the delegated run's parent. Optional. */
    ParentRunID?: string;
    /** The top-level (lead) target agent id for `invoke-target-agent` delegation. */
    TargetAgentID: string;
    /**
     * The session's effective allowed delegation targets (the union-accumulated set from the config
     * cascade; Move 4). When the model names a colleague in the call arguments (`agent`), it must
     * resolve to one of these (or the lead); an unknown name yields a structured "not available"
     * result. Absent/empty ⇒ classic single-target behavior (every call routes to {@link TargetAgentID}).
     */
    AllowedAgents?: RealtimeAllowedAgent[];
    /**
     * Optional direct actions configuration for this session, derived once during session prep
     * (cascade: co-agent + runtime overrides + target + app settings). When present, direct action
     * enforcement checks this configuration instead of recomputing from target alone.
     */
    DirectActions?: RealtimeDirectActionsConfig;
    /** The tool call the browser relayed from the provider. */
    Call: RealtimeToolCall;
    /**
     * Optional abort signal so a barge-in on the browser can cancel an in-flight delegated run.
     * Threaded into the delegated agent run's `cancellationToken`.
     */
    AbortSignal?: AbortSignal;
    /**
     * Optional progress callback invoked with each delegated-run progress event (mirrors the normal
     * agent-run path's `onProgress`). The transport layer (the MJServer resolver) publishes these so
     * the realtime model can narrate the target agent's progress while it runs. When omitted, the
     * delegated run streams nothing and the model only receives the final tool result.
     */
    OnProgress?: AgentExecutionProgressCallback;
    /**
     * Optional id of a previously-paused delegated run (Status `AwaitingFeedback`) to RESUME instead
     * of starting a fresh run. When set, {@link delegateToTarget} passes it as `lastRunId` (with
     * `autoPopulateLastRunPayload`) to {@link AgentRunner.RunAgent}, so the user's answer continues
     * the SAME interactive run (e.g. confirming a Query Builder task graph).
     */
    ResumeRunID?: string;
    /**
     * The id of the human this delegation is FOR, threaded into the delegated run's `userId`.
     *
     * The relayed-tool path may execute under an ELEVATED principal (a scoped anonymous magic-link
     * caller's role deliberately cannot write the AI run entities — issue #3371), so `contextUser`
     * is not always the person. `userId` is what stamps `MJ: AI Agent Runs.UserID` and scopes
     * context memory, both of which must stay the visitor's. Absent ⇒ falls back to `contextUser.ID`,
     * which is correct for every non-elevated caller.
     */
    AttributionUserID?: string;
}

/**
 * The resolved Realtime model plus its identifiers, returned by the model-resolution seam.
 */
export interface RealtimeModelResolution {
    /** The instantiated realtime driver. */
    Model: BaseRealtimeModel;
    /** The `MJ: AI Models` row id. */
    ModelID: string;
    /** The chosen vendor id. */
    VendorID: string;
    /**
     * The chosen `MJ: AI Model Vendors` ROW id (not the vendor id) — the most-specific layer of
     * the model-catalog `ModelConfiguration` cascade. Optional for back-compat with test seams.
     */
    ModelVendorID?: string;
    /** The vendor API name passed to the provider as the model id. */
    APIName: string;
    /** The model's display name (`MJ: AI Models.Name`). Optional for back-compat with test seams. */
    ModelName?: string;
    /**
     * The chosen vendor's `DriverClass` (e.g. `OpenAIRealtime`). Used to match the effective
     * config's per-provider voice settings (`realtime.voice.providers`) onto the driver's open
     * `Config` bag. Optional for back-compat with test seams.
     */
    DriverClass?: string;
}

/**
 * Output of {@link RealtimeClientSessionService.PrepareRealtimeSessionParams} — the host-agnostic prep that
 * every realtime surface consumes before opening a session its own way. Carries the assembled
 * {@link RealtimeSessionParams} plus the resolved co-agent / model / effective config the openers need.
 */
export interface RealtimeSessionParamsPrep {
    /** Whether prep succeeded. When false, only {@link ErrorMessage} is set. */
    Success: boolean;
    /** Failure reason (present only when {@link Success} is false). */
    ErrorMessage?: string;
    /** The resolved co-agent (the Realtime-type agent that does the voicing). */
    CoAgent?: MJAIAgentEntityExtended;
    /** The resolved realtime model + identifiers. */
    Resolution?: RealtimeModelResolution;
    /** The effective config from the full precedence cascade (type-default < co-agent < target < override). */
    EffectiveConfig?: RealtimeCoAgentConfig;
    /** The assembled session params (TARGET-identity prompt, stable tools incl. invoke-target, voice, memory). */
    SessionParams?: RealtimeSessionParams;
    /** The resolved channel scope + client-tool tiers, when the input carried channel candidates. */
    ClientPolicy?: RealtimeSessionClientPolicy;
    /**
     * The avatar the session asks for, or why there is none; empty when the voiced agent asked for none. The session
     * params carry the request itself (`SessionParams.Avatar`); this keeps the reason for the call's avatar status.
     */
    AvatarResolution?: RealtimeAvatarResolution;
}

/**
 * The runtime handle returned by {@link RealtimeClientSessionService.WireBridgeRealtimeSession} — the
 * server long-lived (bridged) counterpart to what `PrepareClientSession` returns for the browser. The
 * bridge holds this for the life of the session: the observability run ids (for nesting + correlation)
 * and an **idempotent** {@link Finalize} the bridge MUST call on teardown so the co-agent run + prompt
 * run don't dangle in `Running`. Finalize also runs automatically when the session's `Close()` is invoked
 * or the connection drops — calling it again is a safe no-op.
 */
export interface BridgeRealtimeRuntime {
    /** The `MJ: AI Agent Runs` row id created for this voice session (delegated runs nest under it). */
    CoAgentRunID?: string;
    /** The `MJ: AI Prompt Runs` row id for the session's system prompt. */
    PromptRunID?: string;
    /**
     * Writes the session's last usage, then finalizes the co-agent + prompt run; usage reported afterwards is not
     * stored. Idempotent: the first call decides the outcome, and later calls from other teardown paths do nothing.
     *
     * The session's `Close()` finalizes with `success` true, so a host whose bridge start failed calls
     * `Finalize(false, error)` BEFORE it closes the session: the run, its prompt run and its step then read `Failed`
     * with the start's error, and the close finalizes nothing more.
     *
     * @param success `true` → `Completed`, `false` → `Failed`.
     * @param errorMessage Why the session failed, stamped on the failed run, prompt run and step. Ignored on success.
     */
    Finalize: (success: boolean, errorMessage?: string) => Promise<void>;
    /**
     * Aborts every delegated run currently in flight for this session (and drops pending narration). This is the
     * EXPLICIT cancel — on a phone it backs the `cancel_pending_work` tool — and is deliberately NOT what a
     * barge-in does (see {@link CancelPendingNarration}). Returns how many were aborted (0 when nothing was
     * running; never throws).
     */
    CancelInFlightDelegations: () => number;
    /**
     * Drops any queued spoken progress update without touching the delegated work — what a barge-in does. The
     * caller took the floor, so a pending "still working on it" is stale, but the jobs they asked for keep
     * running. Never throws.
     */
    CancelPendingNarration: () => void;
    /**
     * Installs (or clears, with `undefined`) the host's local tool handler. A tool call whose name the handler
     * {@link BridgeLocalToolHandler.Handles} is executed by the host instead of the shared delegation path.
     */
    SetLocalToolHandler: (handler: BridgeLocalToolHandler | undefined) => void;
    /**
     * Whether the agent watches LiveKit meetings (`realtime.video.watchMeetings` in its effective configuration, which
     * includes the voiced agent's own). The room coordinator reads it, with whether the session takes video, to decide
     * whether the bot reads the cameras and screens people allow.
     */
    WatchesMeetingVideo: boolean;
}

/**
 * Executes tools the host declared through {@link PrepareClientSessionInput.HostTools}. Bound after the session
 * is wired because the object that can act on them (a phone call's bridge) does not exist until the bridge
 * engine has started.
 */
export interface BridgeLocalToolHandler {
    /** Whether this handler owns `toolName`. */
    Handles(toolName: string): boolean;
    /** Runs one call; the returned string is the JSON handed back to the model. Never needs to catch — errors are reported to the model. */
    Execute(call: RealtimeToolCall): Promise<string>;
}

/** Runtime handles by their realtime session, so the layer that only holds the session can reach its runtime. */
const bridgeRuntimes = new WeakMap<IRealtimeSession, BridgeRealtimeRuntime>();

/** The ids of a voice session's co-agent observability rows (see `createCoAgentObservabilityRun`). */
interface CoAgentObservabilityRunIds {
    CoAgentRunID: string;
    PromptRunID?: string;
    CoAgentRunStepID?: string;
}

/** What `wireBridgeToolCalls` needs from a bridged session's wiring. */
interface BridgeToolCallWiring {
    Input: PrepareClientSessionInput;
    Prep: RealtimeSessionParamsPrep;
    /** The co-agent run delegated runs nest under. */
    ParentRunID?: string;
    AllowedAgents: ExecuteRelayedToolInput['AllowedAgents'];
    Narrator: DelegationNarrator;
    /** Reads the host's local tool handler at call time (it is installed after wiring). */
    LocalToolHandler: () => BridgeLocalToolHandler | undefined;
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
}

/**
 * Returns the runtime wired onto a bridged realtime session by
 * {@link RealtimeClientSessionService.WireBridgeRealtimeSession}, or `undefined` for a session that was never
 * wired. Lets a host that only holds the {@link IRealtimeSession} (the telephony services) cancel delegations on
 * barge-in and install its local tool handler.
 */
export function GetBridgeRealtimeRuntime(session: IRealtimeSession): BridgeRealtimeRuntime | undefined {
    return bridgeRuntimes.get(session);
}

/**
 * Outcome of resolving the realtime model for a session: either a usable {@link RealtimeModelResolution}
 * or a specific, human-readable failure reason (used for explicit preferred-model failures, where the
 * generic "no model" message would hide WHY the user's chosen model couldn't be used).
 */
export interface RealtimeModelResolutionOutcome {
    /** The resolved model. Present on success. */
    Resolution?: RealtimeModelResolution;
    /** Why resolution failed. Present on failure. */
    ErrorMessage?: string;
}

/**
 * Logs when a configuration authored per-provider voice settings but NONE matched the vendor that
 * actually ran — those settings are dropped, and pre-#3530 that happened with no trace at all: the
 * value stayed visible in the config and simply never reached a driver. Names the authored keys and
 * the resolved driver so the fix is readable straight off the log line.
 *
 * The session still proceeds — an unmatched provider bag is a MISCONFIGURATION, not a fault: the
 * agnostic voice (or the driver's own default) still applies. It is logged at error level anyway,
 * matching how this module already reports tolerant-degradation config problems (see
 * {@link RealtimeClientSessionService.resolveConfiguredModelPreference}), because a silently ignored
 * setting is exactly what nobody noticed for long enough to file the issue.
 *
 * Shared by BOTH realtime surfaces — the client-direct prepare and `BaseAgent`'s server-bridged
 * session — so neither path can drift back into silence.
 *
 * WHY IT LIVES HERE rather than beside {@link MatchProviderVoiceSettings}, which it wraps: this
 * function LOGS, and `realtime-coagent-config.ts` declares itself deliberately framework-free — no DB,
 * no metadata provider, no logging imports. Moving it there would breach that constraint; keeping it
 * here costs `BaseAgent` an import of this module. The placement is the constraint's consequence, not
 * an accident. (The alternative — returning a diagnostic string for callers to log — was rejected as
 * it lets one surface silently choose not to log, which is the failure mode being fixed.)
 *
 * @param effectiveConfig The resolved effective configuration.
 * @param driverClass The resolved vendor's `DriverClass`.
 * @param surface The calling surface, for log attribution (e.g. `RealtimeClientSessionService`).
 */
export function WarnOnUnmatchedProviderVoice(
    effectiveConfig: RealtimeCoAgentConfig | undefined,
    driverClass: string | undefined,
    surface: string
): void {
    const authored = Object.keys(effectiveConfig?.realtime?.voice?.providers ?? {});
    // MatchProviderVoiceSettings, NOT GetProviderVoiceSettings — the latter is truthy for every
    // driver once an agnostic voice is set, which would silence this on the exact path that emits one.
    if (authored.length === 0 || MatchProviderVoiceSettings(effectiveConfig, driverClass ?? null)) {
        return;
    }
    LogError(
        `${surface}: realtime.voice.providers authored [${authored.join(', ')}] but the session resolved ` +
        `driver '${driverClass ?? 'unknown'}' — none matched, so those settings were dropped. Author ` +
        'realtime.voice.default.voice to carry a voice to whichever vendor runs.'
    );
}

/**
 * Sanitizes an action or tool name to conform to provider wire constraints
 * (e.g. OpenAI function naming: ^[a-zA-Z0-9_-]{1,64}$).
 *
 * Replaces non-alphanumeric/hyphen/underscore characters with underscores,
 * collapses consecutive runs of underscores into a single underscore, and
 * truncates to 64 characters.
 *
 * @param name The original action or tool name.
 * @returns The sanitized wire-safe name.
 */
export function SanitizeWireToolName(name: string): string {
    return name
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 64);
}

/**
 * Sentinel error thrown when action tool arguments are present but cannot be parsed or are not a JSON object.
 */
export class ToolArgumentsError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ToolArgumentsError';
    }
}

/**
 * Server-agnostic service that prepares a client-direct realtime session and executes the tool
 * calls the browser relays back. Constructed per-request (a normal injectable service — NOT a
 * singleton) so the {@link UserInfo} and {@link IMetadataProvider} are always request-scoped.
 *
 * Every public method takes the `contextUser` and `provider` explicitly — this service never
 * reaches for the global default provider, so it is safe in multi-provider/multi-tenant servers.
 */
export class RealtimeClientSessionService {
    /**
     * Maps session id -> (wireName -> MJActionEntityExtended) built during tool projection.
     * Bounded with `MJLruCache` (rather than a plain `Map`): the resolver holds ONE shared service
     * instance for the process lifetime (see class doc above), and there is no "session ended" hook
     * this service can key eviction off — every voice session ever prepared would otherwise leave an
     * entry here forever. Same TTL/maxSize rationale as {@link promptRunWriteChains} below.
     */
    protected readonly sessionWireActionMaps = new MJLruCache<string, Map<string, MJActionEntityExtended>>({
        maxSize: 5_000,
        ttlMs: 4 * 60 * 60 * 1000, // 4h — generous vs. any realistic voice-session duration
    });

    /** Maps targetAgentID -> (wireName -> MJActionEntityExtended) fallback built during tool projection. Bounded for the same reason as {@link sessionWireActionMaps}. */
    protected readonly targetWireActionMaps = new MJLruCache<string, Map<string, MJActionEntityExtended>>({
        maxSize: 5_000,
        ttlMs: 4 * 60 * 60 * 1000,
    });

    /** Maps session id -> direct actions config resolved during session prep. Bounded for the same reason as {@link sessionWireActionMaps}. */
    protected readonly sessionDirectConfigs = new MJLruCache<string, RealtimeDirectActionsConfig>({
        maxSize: 5_000,
        ttlMs: 4 * 60 * 60 * 1000,
    });

    /**
     * Builds a wire-name to action map from candidate actions, sanitizing each
     * action's name and deduplicating collisions (first action wins).
     *
     * @param actions The action entities to index by wire name.
     * @returns Map of wire-name to action entity.
     */
    public BuildWireActionMap(actions: MJActionEntityExtended[]): Map<string, MJActionEntityExtended> {
        const map = new Map<string, MJActionEntityExtended>();
        const seen = new Map<string, MJActionEntityExtended>();
        for (const action of actions) {
            if (!action.Name) {
                continue;
            }
            const wireName = SanitizeWireToolName(action.Name);
            const lower = wireName.toLowerCase();
            const existing = seen.get(lower);
            if (existing) {
                // Colliding action name after sanitization — first action wins, log collision
                LogError(
                    `RealtimeClientSessionService.buildWireActionMap: wire name collision for '${wireName}' between action '${existing.Name}' and action '${action.Name}'. Keeping '${existing.Name}' (first wins).`
                );
                continue;
            }
            seen.set(lower, action);
            map.set(wireName, action);
        }
        return map;
    }

    /** @deprecated Use {@link BuildWireActionMap}. */
    public buildWireActionMap(actions: MJActionEntityExtended[]): Map<string, MJActionEntityExtended> {
        return this.BuildWireActionMap(actions);
    }
    /**
     * The seeded name of the `MJ: AI Prompts` row whose `TemplateText` carries the first-person
     * progress-narration instructions (with a `{{ progressMessage }}` placeholder). Resolved at
     * session prepare time so the browser narrates with DB-driven, product-tunable wording.
     * Canonical value lives in `realtime-narration.ts` (shared with the server-bridged runner path).
     */
    public static readonly NarrationPromptName = NARRATION_PROMPT_NAME;

    /**
     * DEPRECATED legacy name of the narration prompt, from before the co-agent's rename from
     * "Voice Co-Agent" to "Realtime Co-Agent". Deployments that have not re-synced the prompt seed
     * still carry this name, so {@link resolveNarrationInstructionsTemplate} falls back to it
     * (with a deprecation log) when {@link RealtimeClientSessionService.NarrationPromptName} is absent.
     */
    public static readonly LegacyNarrationPromptName = LEGACY_NARRATION_PROMPT_NAME;

    /**
     * IN-FLIGHT DELEGATION REGISTRY — the server half of the client-direct CANCEL channel.
     *
     * Every relayed tool call registers an {@link AbortController} under
     * `(agentSessionID, callID)` for the duration of {@link ExecuteRelayedTool}; the
     * `CancelRealtimeSessionTool` mutation aborts entries via
     * {@link CancelInFlightDelegations} so an explicit user cancel (the overlay's per-card ✕)
     * kills the delegated target-agent run mid-flight. Entries are removed on completion
     * (success, failure, or abort), so the registry only ever holds truly in-flight calls.
     *
     * Keys are normalized (trimmed, lowercased) so SQL Server's uppercase UUIDs and
     * PostgreSQL's lowercase UUIDs address the same entry.
     *
     * NOTE: this registry is per-service-instance state (the resolver holds ONE shared service
     * per server process), not per-request state — it deliberately spans requests so the cancel
     * mutation can reach the execute mutation's in-flight controller.
     */
    private readonly inFlightDelegations = new Map<string, Map<string, AbortController>>();

    /**
     * Per-`AIPromptRun` write serialization. Both the high-frequency usage checkpoint
     * ({@link AccumulatePromptRunUsage}) and the per-turn message append ({@link AppendPromptRunMessage})
     * do load-modify-save on the SAME run row. Run concurrently, the frequent usage save would rewrite the
     * whole row — including the STALE `Messages` it loaded — and perpetually clobber freshly-appended turns
     * back to an empty snapshot (the "transcript never persists" bug). Funnelling every write for a given
     * run through a single promise chain makes each load happen AFTER the prior save committed, so no writer
     * overwrites another's field. Keyed by promptRunID; the entry is normally dropped on
     * {@link finalizePromptRun}. Bounded with `MJLruCache` (rather than a plain `Map`) as a backstop: a
     * session can be closed through a DIFFERENT `RealtimeClientSessionService` instance than the one that
     * accumulated its write chain (e.g. `SessionManager`'s default construction, background janitor sweeps),
     * in which case `finalizePromptRun`'s delete lands on the wrong object and this map's entry is
     * never explicitly removed — the TTL/maxSize eviction here is what keeps that scenario bounded
     * instead of an unbounded per-process leak.
     */
    private readonly promptRunWriteChains = new MJLruCache<string, Promise<unknown>>({
        maxSize: 5_000,
        ttlMs: 4 * 60 * 60 * 1000, // 4h backstop — generous vs. any realistic session duration
    });

    /**
     * Serializes `task` against all other writes to the same `AIPromptRun` (see {@link promptRunWriteChains}).
     * Tasks run in call order; a failing task never breaks the chain for the next one. Returns the task's result.
     */
    private serializePromptRunWrite<T>(promptRunID: string, task: () => Promise<T>): Promise<T> {
        const prior = this.promptRunWriteChains.Get(promptRunID) ?? Promise.resolve();
        const run = prior.then(task, task);
        // Store an error-swallowing tail so one failed write doesn't reject every queued write behind it.
        this.promptRunWriteChains.Set(promptRunID, run.then(() => undefined, () => undefined));
        return run;
    }

    /**
     * Prepares a client-direct realtime session: resolves the model, assembles the companion
     * system prompt + stable tool set, and mints the {@link ClientRealtimeSessionConfig}.
     *
     * Returns a failure result (never throws) when no Realtime model/key resolves or the provider
     * cannot mint a client-direct session.
     *
     * @param input The co-agent/target/session inputs.
     * @param contextUser The calling user (threaded to metadata + memory retrieval).
     * @param provider The request-scoped metadata provider.
     * @returns The prep result (Success + ClientConfig/SessionParams, or Success: false + ErrorMessage).
     */
    public async PrepareClientSession(
        input: PrepareClientSessionInput,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<RealtimeClientSessionPrepResult> {
        // Build the canonical session params via the ONE shared producer (identity + cascade + tools +
        // voice + memory) — then do the client-direct-specific bits: SupportsClientDirect gate, mint, obs.
        const prep = await this.PrepareRealtimeSessionParams(input, contextUser, provider);
        if (!prep.Success || !prep.CoAgent || !prep.Resolution || !prep.SessionParams || !prep.EffectiveConfig) {
            return { Success: false, ErrorMessage: prep.ErrorMessage };
        }
        const { CoAgent: coAgent, Resolution: resolution, SessionParams: sessionParams, EffectiveConfig: effectiveConfig, ClientPolicy: clientPolicy } = prep;

        if (!resolution.Model.SupportsClientDirect) {
            return {
                Success: false,
                ErrorMessage: `The resolved realtime model '${resolution.APIName}' does not support client-direct sessions.`
            };
        }

        let clientConfig: ClientRealtimeSessionConfig;
        try {
            clientConfig = await resolution.Model.CreateClientSession(sessionParams);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { Success: false, ErrorMessage: `Failed to mint client realtime session: ${message}` };
        }
        const avatarStatus = this.resolveMintedAvatarStatus(prep, clientConfig);

        // Best-effort observability: create a server-side co-agent run (+ prompt run) so the voice
        // session is visible in the agent-run timeline and delegated runs can nest under it. A
        // failure here never fails the prepare — we just omit the ids.
        const promptID = this.resolveCoAgentSystemPrompt(coAgent).PromptID;
        const obs = await this.createCoAgentObservabilityRun(
            coAgent, promptID, resolution.ModelID, resolution.VendorID,
            input.UserID || contextUser?.ID, input.AgentSessionID,
            contextUser, provider, input.ConversationID,
        );

        return {
            Success: true,
            ClientConfig: clientConfig,
            SessionParams: sessionParams,
            CoAgentRunID: obs?.CoAgentRunID,
            PromptRunID: obs?.PromptRunID,
            CoAgentRunStepID: obs?.CoAgentRunStepID,
            ModelID: resolution.ModelID,
            ModelName: resolution.ModelName,
            DriverClass: resolution.DriverClass,
            NarrationInstructionsTemplate: this.resolveNarrationInstructionsTemplate() ?? undefined,
            EffectiveConfig: effectiveConfig,
            ClientPolicy: clientPolicy,
            NarrationPaceMs: GetNarrationPaceMs(effectiveConfig) ?? undefined,
            ...(avatarStatus ? { AvatarStatus: avatarStatus } : {}),
        };
    }

    /**
     * The call's avatar status once the driver has minted the session (see {@link ResolveRealtimeAvatarStatus}), with one
     * log line saying whether the avatar shows. `undefined`, and no line, when the session asked for no avatar.
     */
    private resolveMintedAvatarStatus(prep: RealtimeSessionParamsPrep, clientConfig: ClientRealtimeSessionConfig): RealtimeAvatarStatus | undefined {
        const resolution = prep.Resolution;
        const apiName = resolution?.APIName ?? clientConfig.Model;
        const status = ResolveRealtimeAvatarStatus({
            Resolution: prep.AvatarResolution ?? {},
            ModelSupportsAvatarOutput: resolution
                ? RealtimeModelShowsAvatar({ ModelID: resolution.ModelID, APIName: apiName, Model: resolution.Model }, AIEngine.Instance)
                : false,
            DriverStatus: clientConfig.AvatarStatus,
        });
        if (status) {
            console.log(`[RealtimeCoAgent] mint avatar model=${apiName} shown=${status.Granted} reason=${status.Reason ?? 'none'}`);
        }
        return status;
    }

    /**
     * Wires a **server long-lived (bridged)** realtime session onto the SAME core machinery the
     * client-direct path uses — so a LiveKit (or future Zoom/Teams) agent does real work and is tracked
     * identically, with **zero host-local re-implementation**. This is the Phase 2 counterpart to
     * {@link PrepareClientSession}: the browser relays tool calls back over GraphQL to `ExecuteRelayedTool`,
     * whereas here the server holds the live {@link IRealtimeSession} and we wire its `OnToolCall` directly to
     * the SAME {@link ExecuteRelayedTool} (so `invoke-target-agent` runs the target via `AgentRunner`, nests
     * under the co-agent run, supports barge-in cancel + paused-run resume — all of it, for free).
     *
     * Responsibilities, in order:
     * 1. Create the co-agent observability run (+ prompt run + step) so the voice session shows up in the
     *    agent-run timeline and delegated runs nest under it (best-effort; a failure just omits the ids).
     * 2. Record the session's usage on the co-agent prompt run, as client-direct calls do: `session.OnUsage` →
     *    {@link BridgeRealtimeUsageRecorder} → {@link AccumulatePromptRunUsage}, every 10 s and once more at finalize.
     * 3. Wire `session.OnToolCall` → `ExecuteRelayedTool` → `session.SendToolResult`.
     * 4. Guarantee finalize-once: wrap `session.Close()` and listen for an unexpected drop (`OnClose`), both
     *    routed through one idempotent finalizer. The bridge teardown calls `Close()`, so the run finalizes
     *    on graceful end; a dropped socket finalizes via `OnClose`. The finalizer writes the session's last
     *    usage before it finalizes the runs, so the prompt run is priced from its final counts.
     *
     * @param session The live realtime session the bridge owns (from `model.StartSession`).
     * @param input The same prep input used to build the session (carries AgentSessionID, TargetAgentID, …).
     * @param prep The successful {@link PrepareRealtimeSessionParams} result (CoAgent + Resolution).
     * @param contextUser The calling user (threaded into observability + delegated runs).
     * @param provider The request-scoped metadata provider.
     * @returns A {@link BridgeRealtimeRuntime} the bridge holds for the session lifetime.
     */
    public async WireBridgeRealtimeSession(
        session: IRealtimeSession,
        input: PrepareClientSessionInput,
        prep: RealtimeSessionParamsPrep,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<BridgeRealtimeRuntime> {
        const coAgent = prep.CoAgent;
        const resolution = prep.Resolution;
        if (!coAgent || !resolution) {
            // Prep must have succeeded before wiring; degrade to a tool-error fallback rather than throw.
            return this.wireBridgeFallbackRuntime(session);
        }

        // The delegation set the model may reach, narrowed to what THIS run-as user may run (the browser path
        // applies the same filter; without it a bridged call would reach colleagues the caller cannot).
        const allowedAgents = await FilterAllowedAgentsByCanRun(prep.EffectiveConfig?.realtime?.allowedAgents, contextUser);
        // Spoken progress while delegated work runs — the same pacing/wording the generic session runner uses.
        const narrator = new DelegationNarrator({
            GetSession: () => session,
            NarrationInstructionsTemplate: this.resolveNarrationInstructionsTemplate(),
            NarrationPaceMs: GetNarrationPaceMs(prep.EffectiveConfig) ?? undefined,
        });
        let localToolHandler: BridgeLocalToolHandler | undefined;

        const promptID = this.resolveCoAgentSystemPrompt(coAgent).PromptID;
        const obs = await this.createCoAgentObservabilityRun(
            coAgent, promptID, resolution.ModelID, resolution.VendorID,
            input.UserID || contextUser?.ID, input.AgentSessionID,
            contextUser, provider, input.ConversationID,
        );
        const usage = this.wireBridgeUsage(session, obs?.PromptRunID, contextUser, provider);
        const finalize = this.createBridgeFinalizer(obs, usage, contextUser, provider);

        this.wireBridgeToolCalls(session, {
            Input: input,
            Prep: prep,
            ParentRunID: obs?.CoAgentRunID,
            AllowedAgents: allowedAgents,
            Narrator: narrator,
            LocalToolHandler: () => localToolHandler,
            ContextUser: contextUser,
            Provider: provider,
        });
        this.finalizeOnBridgeClose(session, narrator, finalize);

        const runtime: BridgeRealtimeRuntime = {
            CoAgentRunID: obs?.CoAgentRunID,
            PromptRunID: obs?.PromptRunID,
            Finalize: finalize,
            CancelInFlightDelegations: () => {
                narrator.Cancel(); // a stale "still working on it" line must not be spoken over the caller
                return this.CancelInFlightDelegations(input.AgentSessionID);
            },
            CancelPendingNarration: () => narrator.Cancel(),
            SetLocalToolHandler: (handler) => { localToolHandler = handler; },
            WatchesMeetingVideo: GetWatchesMeetingVideo(prep.EffectiveConfig),
        };
        bridgeRuntimes.set(session, runtime);
        return runtime;
    }

    /**
     * Records a bridged session's usage on its co-agent prompt run. The recorder is the session's only `OnUsage`
     * subscriber: drivers keep one usage handler. Without a prompt run there is nowhere to record, so nothing subscribes
     * and one line is logged, as the client-direct relay logs a dropped delta.
     */
    private wireBridgeUsage(
        session: IRealtimeSession,
        promptRunID: string | undefined,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): BridgeRealtimeUsageRecorder | undefined {
        if (!promptRunID) {
            LogStatus('WireBridgeRealtimeSession: the session has no co-agent prompt run, so its usage is not recorded.');
            return undefined;
        }
        const recorder = new BridgeRealtimeUsageRecorder(
            (write) => this.AccumulatePromptRunUsage(promptRunID, write.InputTokens, write.OutputTokens, contextUser, provider, write.Details),
            `prompt run ${promptRunID}`,
        );
        session.OnUsage((usage) => recorder.Add(usage));
        return recorder;
    }

    /**
     * The bridged session's idempotent finalizer. It closes the usage recorder first (no more updates; the unwritten
     * usage is written), so the prompt run's cost, computed when finalize stamps `CompletedAt`, covers the whole session.
     * The first call decides the outcome (see {@link BridgeRealtimeRuntime.Finalize}).
     */
    private createBridgeFinalizer(
        obs: CoAgentObservabilityRunIds | null,
        usage: BridgeRealtimeUsageRecorder | undefined,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): (success: boolean, errorMessage?: string) => Promise<void> {
        let finalized = false;
        return async (success: boolean, errorMessage?: string): Promise<void> => {
            if (finalized) {
                return;
            }
            finalized = true;
            await usage?.Close();
            await this.FinalizeCoAgentRun(
                obs?.CoAgentRunID ?? null, obs?.PromptRunID ?? null,
                contextUser, provider, success, obs?.CoAgentRunStepID ?? null, errorMessage,
            );
        };
    }

    /** Tool calls → the host's local handler or the shared delegation entry point, then the result back to the model. */
    private wireBridgeToolCalls(session: IRealtimeSession, wiring: BridgeToolCallWiring): void {
        session.OnToolCall(async (call) => {
            try {
                const localHandler = wiring.LocalToolHandler();
                const resultJson = localHandler?.Handles(call.ToolName)
                    ? await localHandler.Execute(call)
                    : (await wiring.Narrator.Track(() => this.ExecuteRelayedTool(
                        {
                            AgentSessionID: wiring.Input.AgentSessionID,
                            ParentRunID: wiring.ParentRunID,
                            TargetAgentID: wiring.Input.TargetAgentID,
                            AllowedAgents: wiring.AllowedAgents,
                            DirectActions: wiring.Prep.EffectiveConfig?.realtime?.directActions,
                            OnProgress: (progress) => wiring.Narrator.HandleProgress(progress),
                            Call: call,
                        },
                        wiring.ContextUser, wiring.Provider,
                    ))).ResultJson;
                await session.SendToolResult(call.CallID, resultJson);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                LogError(`WireBridgeRealtimeSession: tool '${call.ToolName}' failed: ${message}`);
                await session.SendToolResult(call.CallID, JSON.stringify({ success: false, error: message }));
            }
        });
    }

    /**
     * Finalizes on graceful teardown (the bridge calls `Close()`) and on an unexpected drop. Both go through the
     * idempotent finalizer, so a double fire is harmless. Both finalize as completed: a host whose bridge start failed
     * calls {@link BridgeRealtimeRuntime.Finalize} with `false` and the start's error before it closes the session.
     */
    private finalizeOnBridgeClose(
        session: IRealtimeSession,
        narrator: DelegationNarrator,
        finalize: (success: boolean) => Promise<void>,
    ): void {
        const originalClose = session.Close.bind(session);
        session.Close = async (): Promise<void> => {
            narrator.Cancel();
            await finalize(true);
            await originalClose();
        };
        session.OnClose?.(() => { void finalize(true); });
    }

    /**
     * Degenerate {@link BridgeRealtimeRuntime} for the rare case wiring is attempted without a resolved
     * co-agent: answer every tool call with a clear "not available" error and a no-op finalize. Keeps the
     * bridge from hanging on a tool call when prep was incomplete.
     */
    private wireBridgeFallbackRuntime(session: IRealtimeSession): BridgeRealtimeRuntime {
        session.OnToolCall((call) => {
            void session.SendToolResult(
                call.CallID,
                JSON.stringify({ success: false, error: 'Tool execution is unavailable — the co-agent did not resolve. Let the user know.' }),
            );
        });
        const runtime: BridgeRealtimeRuntime = {
            Finalize: async () => { /* nothing to finalize */ },
            CancelInFlightDelegations: () => 0,
            CancelPendingNarration: () => { /* nothing is narrated */ },
            SetLocalToolHandler: () => { /* no tool path to extend */ },
            WatchesMeetingVideo: false,
        };
        bridgeRuntimes.set(session, runtime);
        return runtime;
    }

    /**
     * **The single source of truth for realtime session prep.** Builds the {@link RealtimeSessionParams}
     * for a co-agent voicing a target: resolves the co-agent, the effective config via the full precedence
     * cascade (type-default < co-agent < **target** < runtime override), the realtime model, then assembles
     * the companion system prompt (**first-person as the TARGET** — this is what gives every host the right
     * identity), the stable tool set (**always including `invoke-target-agent`**), voice, and memory.
     *
     * EVERY realtime host consumes this — native chat via {@link PrepareClientSession} → `CreateClientSession`,
     * and the server-bridged hosts (LiveKit, future Zoom/Teams) via `StartSession`. Hosts differ ONLY in how
     * they OPEN the session and their media transport; identity/precedence/prompt/tools live here, once. Do
     * NOT re-implement this in a host. See `plans/realtime/realtime-core-host-convergence.md`.
     *
     * Pure-ish and side-effect-free (no session opened, no observability run created) — those are the
     * opener's concern. Never throws — returns `Success: false` on failure.
     *
     * @param input The co-agent/target/session inputs (the runtime override rides `ConfigOverridesJson`).
     * @param contextUser The calling user (threaded to metadata + memory retrieval).
     * @param provider The request-scoped metadata provider.
     * @returns The prep result: `Success` + co-agent/resolution/effective-config/session-params, or `Success: false`.
     */
    public async PrepareRealtimeSessionParams(
        input: PrepareClientSessionInput,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<RealtimeSessionParamsPrep> {
        await this.configureEngine(contextUser, provider);

        const coAgent = this.resolveCoAgent(input);
        if (!coAgent) {
            return { Success: false, ErrorMessage: 'The Realtime Co-Agent could not be resolved from the supplied id or entity.' };
        }

        // Effective config via the surface-agnostic cascade: type DefaultConfiguration < co-agent
        // TypeConfiguration < TARGET agent TypeConfiguration < APP (Application.AgentSettings.Realtime) <
        // runtime overrides (authorization-gated upstream). This is the identical precedence on every host.
        const targetAgent = this.resolveTargetAgent(input.TargetAgentID);
        const appSettingsJson = await this.resolveAppRealtimeOverrides(input.ApplicationID, contextUser, provider);
        const effectiveConfig = this.resolveEffectiveConfig(coAgent, input.ConfigOverridesJson, targetAgent, appSettingsJson);

        const outcome = await this.resolveModelForSession(input, coAgent, effectiveConfig);
        if (!outcome.Resolution) {
            return { Success: false, ErrorMessage: outcome.ErrorMessage ?? this.noModelMessage() };
        }
        const resolution = outcome.Resolution;

        let hostTools = input.HostTools;
        if (input.ResolveHostTools) {
            const dynamicHostTools = input.ResolveHostTools({
                ModelID: resolution.ModelID,
                ModelVendorID: resolution.ModelVendorID,
                DriverClass: resolution.DriverClass,
            });
            if (dynamicHostTools !== undefined) {
                hostTools = dynamicHostTools;
            }
        }

        const effectiveInput = hostTools !== input.HostTools ? { ...input, HostTools: hostTools } : input;
        // One answer for the whole session: it lowers channel exposure here and keeps the driver from
        // turning on provider features that store session data (Gemini session resumption).
        const zeroDataRetention = this.modelHasZeroDataRetention(resolution.ModelID, resolution.ModelVendorID);
        // Channel scoping + client-tool tiers: narrows the declared tools to the scope's decision and
        // folds the app tier into the capability manifest the prompt renders. The scoped input is what
        // the prompt/tool builders see, so a vetoed channel is absent from the framing as well as the tools.
        const scoped = await this.scopeSessionInput(effectiveInput, effectiveConfig, contextUser, provider, zeroDataRetention);
        const avatar = this.ResolveSessionAvatar(scoped.Input, coAgent, effectiveConfig, resolution.ModelID, resolution.ModelVendorID);
        const sessionParams: RealtimeSessionParams = {
            ...(await this.buildSessionParams(
                scoped.Input, coAgent, resolution.APIName, contextUser, provider, effectiveConfig, resolution.DriverClass,
                resolution.ModelID, resolution.ModelVendorID, avatar,
            )),
            ZeroDataRetention: zeroDataRetention,
        };

        return {
            Success: true, CoAgent: coAgent, Resolution: resolution, EffectiveConfig: effectiveConfig, SessionParams: sessionParams,
            ClientPolicy: scoped.ClientPolicy, AvatarResolution: avatar,
        };
    }

    /**
     * Applies channel scoping and the client-tool tiers to a prepare input.
     *
     * - **App tier into the prompt.** `Application.AgentSettings.ClientTools` is resolved to metadata
     *   and layered, through the unified {@link ResolveClientTools}, beneath the live surface's own
     *   manifest in the app-context snapshot — so the co-agent is told about tools the app declares
     *   even when the active surface did not republish them. (Only the HOST can run them; the browser
     *   reports "declared but not registered" for one it has no handler for.) The agent's static
     *   junction tools are deliberately NOT added to the voice prompt — voice prompts are
     *   token-sensitive and a tool with no browser handler is noise — but they ride the returned policy
     *   so the browser can describe them.
     * - **Channel scoping.** When the browser reported candidates, they are scoped against the
     *   registry and the cascade's `channels` section, and the declared tools narrowed to match
     *   ({@link BuildSessionChannelPolicy}).
     *
     * @returns The (possibly adjusted) input, and the policy to hand back when candidates were reported.
     */
    protected async scopeSessionInput(
        input: PrepareClientSessionInput,
        effectiveConfig: RealtimeCoAgentConfig,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        modelHasZeroDataRetention = false
    ): Promise<{ Input: PrepareClientSessionInput; ClientPolicy?: RealtimeSessionClientPolicy }> {
        const tiers = await this.resolveSessionClientToolTiers(input.ApplicationID, input.TargetAgentID, contextUser);
        const appContext = this.withAppToolTier(input.AppContext, tiers.App, input.TargetAgentID);
        const candidates = input.ChannelCandidates ?? [];
        if (candidates.length === 0) {
            return { Input: appContext === input.AppContext ? input : { ...input, AppContext: appContext } };
        }
        const outcome = BuildSessionChannelPolicy({
            Candidates: candidates,
            ChannelsConfig: effectiveConfig.realtime?.channels ?? null,
            Registry: this.readChannelRegistry(provider),
            ClientTools: input.ExtraTools,
            ClientToolTiers: tiers,
            ModelHasZeroDataRetention: modelHasZeroDataRetention,
        });
        return {
            Input: { ...input, ExtraTools: outcome.ClientTools, AppContext: appContext },
            ClientPolicy: outcome.Policy,
        };
    }

    /**
     * Whether the session model's effective catalog configuration (type < model < vendor < model-vendor)
     * declares `Privacy.ZeroDataRetention: true`. Fails closed: a model or vendor row that cannot be
     * resolved, or a catalog lookup that throws, reads as "not declared", so an agent that REQUIRES zero
     * data retention loses exposure rather than gaining it. Overridable seam.
     *
     * @param modelID The resolved `MJ: AI Models` id.
     * @param modelVendorID The resolved model-vendor row id (the cascade's most specific layer).
     */
    protected modelHasZeroDataRetention(modelID: string | undefined, modelVendorID: string | undefined): boolean {
        if (!modelID) {
            return false;
        }
        try {
            return IsZeroDataRetention(AIEngine.Instance.GetEffectiveModelConfiguration(modelID, modelVendorID));
        } catch (error) {
            LogError(`RealtimeClientSessionService.modelHasZeroDataRetention failed for model '${modelID}': ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    /**
     * Layers the app's client tools beneath the surface's manifest in the app-context snapshot, through
     * the unified resolver (`session > app`, first match by name wins). Returns the SAME snapshot object
     * when nothing changes, so callers can detect "no change" by identity.
     */
    private withAppToolTier(
        appContext: AppContextSnapshot | undefined,
        appTools: ReadonlyArray<ClientToolMetadata> | undefined,
        targetAgentId: string
    ): AppContextSnapshot | undefined {
        if (!appContext || !appTools || appTools.length === 0) {
            return appContext;
        }
        const surfaceTools = appContext.Capabilities?.Tools;
        const tools = ResolveClientTools({ agentId: targetAgentId, sessionTools: surfaceTools, appTools: [...appTools] });
        if (surfaceTools && tools.length === surfaceTools.length) {
            return appContext; // the surface already covered every app tool
        }
        return { ...appContext, Capabilities: { ...appContext.Capabilities, Tools: tools } };
    }

    /**
     * The server's view of the channel registry (`MJ: AI Agent Channels`), read from the request
     * provider's cached {@link AIEngineBase} rows (already configured by the prepare). Overridable seam.
     * Tolerant: an unloaded cache yields an empty registry (every candidate then reads as having no
     * row), never a throw.
     */
    protected readChannelRegistry(provider: IMetadataProvider): RealtimeChannelRegistryRow[] {
        try {
            const engine = AIEngineBase.GetProviderInstance<AIEngineBase>(provider, AIEngineBase) as AIEngineBase;
            return (engine.AgentChannels ?? []).map(c => ({ Name: c.Name, IsActive: c.IsActive }));
        } catch (error) {
            LogError(`RealtimeClientSessionService.readChannelRegistry failed: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    /**
     * Resolves the client-tool tiers the browser is told about at mint: the APP tier
     * (`Application.AgentSettings.ClientTools` resolved against the tool-definition catalog) and the
     * STATIC tier (the target agent's `MJ: AI Agent Client Tools` junction). Overridable seam; tolerant —
     * any failure yields empty tiers and never fails the mint.
     */
    protected async resolveSessionClientToolTiers(
        applicationId: string | undefined,
        targetAgentId: string,
        contextUser: UserInfo
    ): Promise<RealtimeSessionClientTools> {
        const tiers: RealtimeSessionClientTools = {};
        try {
            const settings = await this.loadAppAgentSettings(applicationId, contextUser);
            const definitions = AIEngine.Instance.ClientToolDefinitions ?? [];
            const app = ResolveAppClientToolMetadata(settings?.ClientTools, definitions, ref =>
                LogStatus(`RealtimeClientSessionService: the app's client tool '${ref.Name ?? ref.ClientToolDefinitionID}' matches no tool definition — skipping it.`));
            if (app.length > 0) {
                tiers.App = app;
            }
            const stat = targetAgentId ? AIEngine.Instance.GetClientToolsForAgent(targetAgentId).map(ClientToolMetadataFromDefinition) : [];
            if (stat.length > 0) {
                tiers.Static = stat;
            }
        } catch (error) {
            LogError(`RealtimeClientSessionService.resolveSessionClientToolTiers failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        return tiers;
    }

    /**
     * Resolves the EFFECTIVE realtime configuration via the surface-agnostic precedence cascade:
     * agent-TYPE `DefaultConfiguration` (base) < **co-agent** `TypeConfiguration` < **target agent**
     * `TypeConfiguration` < (pre-authorized) runtime override — deep-merged per key and normalized.
     * The target layer is what makes a voiced agent (Sage, Marketing Agent, …) carry its own voice/model
     * regardless of host. Tolerant end-to-end: malformed layers contribute nothing and an unloaded metadata
     * cache yields no type defaults. See `plans/realtime/realtime-core-host-convergence.md`.
     *
     * @param coAgent The resolved co-agent.
     * @param overridesJson The pre-authorized runtime override layer, when present.
     * @param targetAgent The TARGET agent being voiced, when distinct from the co-agent — contributes the
     *   per-voiced-agent layer (above the co-agent, below the runtime override). Omit when there is none.
     * @returns The normalized effective configuration (possibly empty, never `null`).
     */
    protected resolveEffectiveConfig(
        coAgent: MJAIAgentEntityExtended,
        overridesJson?: string,
        targetAgent?: MJAIAgentEntityExtended | null,
        appSettingsJson?: string | null
    ): RealtimeCoAgentConfig {
        return ResolveEffectiveRealtimeConfig(
            this.getAgentTypeDefaultConfiguration(coAgent),
            coAgent.TypeConfiguration ?? null,
            overridesJson ?? null,
            targetAgent?.TypeConfiguration ?? null,
            appSettingsJson ?? null
        );
    }

    /**
     * Resolves the APP cascade layer JSON from `Application.AgentSettings`: the `Realtime` overrides
     * (persona/disclosure/model) plus `RelevantAgents` mapped to the union-accumulated allowed-agent
     * set, all translated into the canonical `{"realtime":{…}}` shape via {@link BuildAppRealtimeOverridesJson}.
     *
     * One tiny by-ID read (served from the provider's RunView cache on repeat). Tolerant — any failure,
     * a missing app, or an app with no `AgentSettings` returns `null` (no app layer), never throws.
     *
     * @param applicationId The app the session runs in, or absent/blank for no app layer.
     * @param contextUser The calling user (RunView scope).
     * @param provider The request-scoped metadata provider (reserved; RunView uses the default).
     * @returns The canonical app-layer JSON string, or `null`.
     */
    protected async resolveAppRealtimeOverrides(
        applicationId: string | undefined,
        contextUser: UserInfo,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        provider: IMetadataProvider
    ): Promise<string | null> {
        const settings = await this.loadAppAgentSettings(applicationId, contextUser);
        if (!settings) {
            return null;
        }
        const relevantAgents: RealtimeAllowedAgent[] = (settings.RelevantAgents ?? []).map(r => {
            const entry: RealtimeAllowedAgent = { agentId: r.AgentID };
            if (r.Label) {
                entry.label = r.Label;
            }
            if (r.Disclosure === 'silent' || r.Disclosure === 'mention' || r.Disclosure === 'hand-voice') {
                entry.disclosure = r.Disclosure;
            }
            return entry;
        });
        return BuildAppRealtimeOverridesJson(settings.Realtime ?? null, relevantAgents);
    }

    /**
     * Reads and parses an application's `AgentSettings` (one tiny by-ID read, served from the provider's
     * RunView cache on repeat). The RAW column is parsed with {@link ParseAgentSettings} rather than read
     * through the CodeGen-generated `AgentSettingsObject` accessor, so a field added to the settings
     * interface works the moment the code reading it ships, before CodeGen next refreshes the copy.
     * Tolerant — a blank id, a failed read, a missing app, or an app with no usable settings returns `null`.
     */
    protected async loadAppAgentSettings(applicationId: string | undefined, contextUser: UserInfo): Promise<IAgentSettings | null> {
        const appId = applicationId?.trim();
        if (!appId) {
            return null;
        }
        try {
            const rv = new RunView();
            const result = await rv.RunView<MJApplicationEntity>({
                EntityName: 'MJ: Applications',
                ExtraFilter: `ID='${EscapeSQLString(appId)}'`,
                MaxRows: 1,
                ResultType: 'entity_object',
            }, contextUser);
            if (!result.Success || !result.Results || result.Results.length === 0) {
                return null;
            }
            return ParseAgentSettings(result.Results[0].AgentSettings);
        } catch (error) {
            LogError(`RealtimeClientSessionService.loadAppAgentSettings failed for app '${appId}': ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * Reads the co-agent's TYPE-level `DefaultConfiguration` from {@link AIEngine}'s cached agent
     * types. **Overridable seam**; tolerant — an absent type or unloaded cache returns `null`.
     */
    protected getAgentTypeDefaultConfiguration(coAgent: MJAIAgentEntityExtended): string | null {
        try {
            if (!coAgent.TypeID) {
                return null;
            }
            const type = (AIEngine.Instance.AgentTypes ?? []).find(t => UUIDsEqual(t.ID, coAgent.TypeID!));
            return type?.DefaultConfiguration ?? null;
        } catch {
            return null;
        }
    }

    /**
     * Creates the server-side co-agent observability runs for a voice session: an `AIAgentRun`
     * (Status `Running`), and — when a co-agent system prompt resolved — a linked `AIPromptRun`
     * (Status `Running`, `AgentRunID` = the co-agent run, `AgentID` = the co-agent) plus a single
     * `MJ: AI Agent Run Steps` row (StepType `Prompt`) so the co-agent run's Timeline is non-empty.
     * Delegated target-agent runs nest under the returned `CoAgentRunID` via `ParentRunID`.
     *
     * Best-effort: returns `null` (and logs) when the co-agent run cannot be saved, so callers can
     * continue without observability rather than failing the whole prepare. A failed prompt-run or
     * run-step save just omits that id.
     *
     * @param coAgent The resolved co-agent (its id stamps `AgentID` on both runs).
     * @param promptID The co-agent system prompt id, or `null` to skip the prompt run + run step.
     * @param modelID The resolved realtime model id (stamps the prompt run's `ModelID`).
     * @param userID Optional owning user id for the agent run.
     * @param agentSessionID The session id grouping this voice session's runs.
     * @param contextUser The calling user.
     * @param provider The request-scoped metadata provider.
     * @returns The `{ CoAgentRunID, PromptRunID, CoAgentRunStepID }` ids, or `null` when the agent run failed.
     */
    protected async createCoAgentObservabilityRun(
        coAgent: MJAIAgentEntityExtended,
        promptID: string | null,
        modelID: string,
        vendorID: string,
        userID: string | undefined,
        agentSessionID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        conversationID?: string,
    ): Promise<{ CoAgentRunID: string; PromptRunID?: string; CoAgentRunStepID?: string } | null> {
        const coAgentRunID = await this.createCoAgentRun(
            coAgent, userID, agentSessionID, conversationID, contextUser, provider,
        );
        if (!coAgentRunID) {
            return null;
        }
        const promptRunID = await this.createCoAgentPromptRun(coAgent, promptID, modelID, vendorID, coAgentRunID, contextUser, provider);
        const runStepID = await this.createCoAgentRunStep(coAgentRunID, promptID, promptRunID, contextUser, provider);
        return { CoAgentRunID: coAgentRunID, PromptRunID: promptRunID ?? undefined, CoAgentRunStepID: runStepID ?? undefined };
    }

    /**
     * Creates the co-agent `AIAgentRun` row (Status `Running`). Returns its id, or `null` (logging
     * `CompleteMessage`) when the save fails.
     */
    private async createCoAgentRun(
        coAgent: MJAIAgentEntityExtended,
        userID: string | undefined,
        agentSessionID: string,
        conversationID: string | undefined,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string | null> {
        const run = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', contextUser);
        run.NewRecord();
        run.AgentID = coAgent.ID;
        run.Status = 'Running';
        run.StartedAt = new Date();
        // Only stamp AgentSessionID when we actually have one — `AgentSessionID` is a `uniqueidentifier` FK,
        // so assigning '' (a surface that didn't thread a session id) makes the WHOLE run save fail and the
        // co-agent observability silently vanishes. Degrade gracefully: log the run without session grouping
        // rather than not at all. This keeps the core logging identical across surfaces regardless of input.
        const sessionID = agentSessionID?.trim();
        if (sessionID) {
            run.AgentSessionID = sessionID;
        }
        if (conversationID) {
            run.ConversationID = conversationID;
        }
        if (userID) {
            run.UserID = userID;
        }
        if (await run.Save()) {
            this.KeepCoAgentRunAlive(run.ID, provider, contextUser);
            return run.ID;
        }
        LogError(`RealtimeClientSessionService.createCoAgentRun save failed: ${run.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        return null;
    }

    /**
     * Keeps a voice session's co-agent run alive as far as the {@link AgentRunWatchdog} is concerned. The
     * run spans the whole call, but no agent loop owns it, so nothing stamped its heartbeat: the watchdog
     * force-failed every call that ran past ~5 minutes ("no liveness heartbeat … owning process presumed
     * dead") while the call carried on. Called when the run is created and again on each persisted
     * session heartbeat (`SessionManager`), so whichever server instance the session is talking to keeps
     * it fresh; the watchdog drops it once it is finalized. Only a database provider can stamp heartbeats —
     * any other provider is a no-op, as for every agent run.
     *
     * @param coAgentRunID The session's co-agent run id (from its `Config`), or nothing.
     * @param provider The request-scoped metadata provider.
     * @param contextUser The user the heartbeat writes run as.
     */
    public KeepCoAgentRunAlive(coAgentRunID: string | null | undefined, provider: IMetadataProvider, contextUser: UserInfo): void {
        if (coAgentRunID && provider instanceof DatabaseProviderBase) {
            AgentRunWatchdog.Instance.Track(coAgentRunID, provider, contextUser);
        }
    }

    /**
     * Creates the co-agent `AIPromptRun` row (Status `Running`) linked to the co-agent run via
     * `AgentRunID` AND to the co-agent itself via `AgentID` — so the run shows up both on the
     * prompt's run history (`PromptID`) and in agent-scoped prompt-run views. Returns its id, or
     * `null` when `promptID` is absent (skipped) or the save fails (logged).
     */
    private async createCoAgentPromptRun(
        coAgent: MJAIAgentEntityExtended,
        promptID: string | null,
        modelID: string,
        vendorID: string,
        coAgentRunID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string | null> {
        if (!promptID) {
            return null;
        }
        const promptRun = await provider.GetEntityObject<MJAIPromptRunEntityExtended>('MJ: AI Prompt Runs', contextUser);
        promptRun.NewRecord();
        promptRun.PromptID = promptID;
        promptRun.ModelID = modelID;
        // VendorID is required on AIPromptRun ("Vendor cannot be null") — without it the prompt run
        // save fails and the whole co-agent observability chain (transcript/tool-turn/usage) is dropped.
        if (vendorID) {
            promptRun.VendorID = vendorID;
        }
        promptRun.AgentID = coAgent.ID;
        promptRun.UserID = ResolvePromptRunUserID({ ContextUser: contextUser });
        promptRun.RunAt = new Date();
        promptRun.RunType = 'Single';
        promptRun.Status = 'Running';
        if (await promptRun.Save()) {
            return promptRun.ID;
        }
        LogError(`RealtimeClientSessionService.createCoAgentPromptRun save failed: ${promptRun.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        return null;
    }

    /**
     * Creates the single `MJ: AI Agent Run Steps` row for the co-agent observability run — the
     * realtime session has no iterative loop, so its Timeline carries exactly one step
     * representing the session's system prompt (StepNumber 1, StepType `Prompt`, Status `Running`,
     * `TargetID` = the system `AIPrompt`, `TargetLogID` = the linked `AIPromptRun` when one was
     * created). Skipped (returns `null`) when no system prompt resolved. Best-effort: a save
     * failure is logged and returns `null` — it never breaks the session.
     */
    private async createCoAgentRunStep(
        coAgentRunID: string,
        promptID: string | null,
        promptRunID: string | null,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string | null> {
        if (!promptID) {
            return null;
        }
        try {
            const step = await provider.GetEntityObject<MJAIAgentRunStepEntity>('MJ: AI Agent Run Steps', contextUser);
            step.NewRecord();
            step.AgentRunID = coAgentRunID;
            step.StepNumber = 1;
            step.StepType = 'Prompt';
            step.StepName = 'Realtime session system prompt';
            step.TargetID = promptID;
            step.TargetLogID = promptRunID;
            step.Status = 'Running';
            step.StartedAt = new Date();
            if (await step.Save()) {
                return step.ID;
            }
            LogError(`RealtimeClientSessionService.createCoAgentRunStep save failed: ${step.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            return null;
        } catch (error) {
            LogError(`RealtimeClientSessionService.createCoAgentRunStep failed: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * Finalizes the server-side co-agent observability records when a voice session ends. Loads
     * each (when its id is supplied) and, **only if it is still `Running`**, sets it to `Completed`
     * (or `Failed` when `success` is false) with a `CompletedAt` + `Success` stamp. Idempotent and
     * tolerant: a missing/already-finalized record is a no-op; a load/save failure is logged,
     * never thrown.
     *
     * @param coAgentRunID The co-agent run id, or `null` to skip.
     * @param promptRunID The co-agent prompt run id, or `null` to skip.
     * @param contextUser The calling user.
     * @param provider The request-scoped metadata provider.
     * @param success Whether the session ended successfully (controls Completed vs Failed).
     * @param coAgentRunStepID The co-agent run's single `MJ: AI Agent Run Steps` row id, or `null` to skip.
     * @param errorMessage Why the session failed (for example the bridge start's error), stamped as `ErrorMessage` on each
     *   record it fails. Ignored when `success` is true. Without it the step gets a generic line and the runs none.
     */
    public async FinalizeCoAgentRun(
        coAgentRunID: string | null,
        promptRunID: string | null,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        success: boolean = true,
        coAgentRunStepID: string | null = null,
        errorMessage?: string,
    ): Promise<void> {
        const failure = success ? undefined : errorMessage?.trim() || undefined;
        try {
            await this.finalizeAgentRun(coAgentRunID, contextUser, provider, success, failure);
            await this.finalizePromptRun(promptRunID, contextUser, provider, success, failure);
            await this.finalizeRunStep(coAgentRunStepID, contextUser, provider, success, failure);
        } finally {
            // Even when a finalize step throws, the run still owes its cost, and the watchdog must stop
            // treating it as alive — or a run stuck at Running would be kept fresh indefinitely.
            await this.rollUpCoAgentRunUsage(coAgentRunID, promptRunID, contextUser, provider);
            if (coAgentRunID) {
                AgentRunWatchdog.Instance.Untrack(coAgentRunID);
            }
        }
    }

    /**
     * Copies the co-agent prompt run's tokens and cost onto the co-agent run. The realtime model's usage
     * accumulates on the prompt run ({@link AccumulatePromptRunUsage}), which prices itself; the run's
     * own `TotalCost` / `Total*TokensUsed` stayed 0, so everything that sums agent runs — the realtime
     * analytics dashboard's per-session cost among them — left out the voice model entirely and showed
     * only the delegated runs. Mirrors how an agent loop derives its run totals from its prompt runs.
     *
     * Applied whatever the run's status: a run the watchdog already failed, or one a shutdown cancelled,
     * still owes its cost. Runs after {@link finalizePromptRun}, which waits for in-flight usage writes,
     * so the copy sees the final counts. Tolerant: logs, never throws.
     */
    private async rollUpCoAgentRunUsage(
        coAgentRunID: string | null,
        promptRunID: string | null,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<void> {
        if (!coAgentRunID || !promptRunID) {
            return;
        }
        try {
            const promptRun = await provider.GetEntityObject<MJAIPromptRunEntityExtended>('MJ: AI Prompt Runs', contextUser);
            const run = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', contextUser);
            if (!(await promptRun.Load(promptRunID)) || !(await run.Load(coAgentRunID))) {
                return;
            }
            const promptTokens = promptRun.TokensPrompt ?? 0;
            const completionTokens = promptRun.TokensCompletion ?? 0;
            run.TotalPromptTokensUsed = promptTokens;
            run.TotalCompletionTokensUsed = completionTokens;
            run.TotalTokensUsed = promptRun.TokensUsed ?? promptTokens + completionTokens;
            run.TotalCost = promptRun.TotalCost ?? promptRun.Cost ?? 0;
            if (run.Dirty && !(await run.Save())) {
                LogError(`RealtimeClientSessionService.rollUpCoAgentRunUsage save failed: ${run.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        } catch (error) {
            LogError(`RealtimeClientSessionService.rollUpCoAgentRunUsage failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Finalizes the **co-agent observability run(s)** for an agent session that were left `Running` because
     * the session was reaped WITHOUT a live in-memory handle — a prior-boot orphan or a cross-host teardown,
     * where the `Close()`-wrapped finalizer never ran. This is the by-`AgentSessionID` analogue of
     * {@link FinalizeCoAgentRun}: the same-process path already knows its run ids (no query), but here that
     * state died with the prior process, so we locate the session's TOP-LEVEL co-agent run (delegated target
     * runs nest under it and finalize on their own runner) and finalize it + its prompt run + step via the
     * same idempotent helpers. A clean teardown already marked them `Completed`, so this finds nothing.
     *
     * `MJ: AI Agent Runs` is a high-volume transactional table no engine caches, so a narrow ids-only query
     * is the right tool (not a cache reuse). Tolerant — never throws.
     *
     * @param agentSessionID The agent session whose dangling co-agent runs to finalize.
     * @param success Mark them `Completed` (true) or `Failed` (false).
     * @param contextUser The user the writes run as.
     * @param provider The request-scoped metadata provider.
     * @returns The number of co-agent runs finalized (0 when none were dangling).
     */
    public async FinalizeCoAgentRunsBySession(
        agentSessionID: string,
        success: boolean,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<number> {
        const sessionID = agentSessionID?.trim();
        if (!sessionID) {
            return 0;
        }
        const rv = new RunView();
        const found = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: `AgentSessionID='${EscapeSQLString(sessionID)}' AND Status='Running' AND ParentRunID IS NULL`,
            Fields: ['ID'],
            ResultType: 'simple',
        }, contextUser);
        if (!found.Success) {
            LogError(`RealtimeClientSessionService.FinalizeCoAgentRunsBySession RunView failed: ${found.ErrorMessage}`);
            return 0;
        }
        let finalized = 0;
        for (const row of found.Results) {
            const child = await this.findCoAgentChildLogIds(row.ID, contextUser);
            await this.FinalizeCoAgentRun(row.ID, child.PromptRunID, contextUser, provider, success, child.StepID);
            finalized++;
        }
        if (finalized > 0) {
            LogStatus(`RealtimeClientSessionService: finalized ${finalized} orphaned co-agent run(s) for session ${sessionID}.`);
        }
        return finalized;
    }

    /**
     * Finds the still-`Running` prompt-run + run-step ids for a co-agent run (orphan finalize path).
     *
     * `AIPromptRun.AgentRunID` was dropped in v5.50 (Break_CodeGen_Cycle_Remove_PromptRun_AgentRunID);
     * filtering prompt runs on it now fails outright and yields no rows. The relationship is derived
     * through the run's Prompt-type steps instead — `AIAgentRunStep.TargetLogID` points at the prompt
     * run — which is the replacement path that migration's design notes prescribe.
     */
    private async findCoAgentChildLogIds(
        coAgentRunID: string,
        contextUser: UserInfo,
    ): Promise<{ PromptRunID: string | null; StepID: string | null }> {
        const rv = new RunView();
        const steps = await rv.RunView<{ ID: string; StepType: string; TargetLogID: string | null }>({
            EntityName: 'MJ: AI Agent Run Steps',
            ExtraFilter: `AgentRunID='${EscapeSQLString(coAgentRunID)}' AND Status='Running'`,
            Fields: ['ID', 'StepType', 'TargetLogID'],
            ResultType: 'simple',
        }, contextUser);
        if (!steps.Success) {
            LogError(`RealtimeClientSessionService.findCoAgentChildLogIds: step lookup failed for co-agent run ${coAgentRunID}: ${steps.ErrorMessage}`);
            return { PromptRunID: null, StepID: null };
        }

        const stepID = steps.Results[0]?.ID ?? null;
        const promptLogIDs = steps.Results.filter(s => s.StepType === 'Prompt' && s.TargetLogID).map(s => s.TargetLogID!);
        if (promptLogIDs.length === 0) {
            return { PromptRunID: null, StepID: stepID };
        }

        // Re-check Status on the prompt runs themselves: a Prompt step can still be Running while its
        // underlying prompt run has already landed, and this path only finalizes what is still open.
        const inList = promptLogIDs.map(id => `'${EscapeSQLString(id)}'`).join(',');
        const promptRuns = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: AI Prompt Runs',
            ExtraFilter: `ID IN (${inList}) AND Status='Running'`,
            Fields: ['ID'],
            ResultType: 'simple',
        }, contextUser);
        if (!promptRuns.Success) {
            LogError(`RealtimeClientSessionService.findCoAgentChildLogIds: prompt-run lookup failed for co-agent run ${coAgentRunID}: ${promptRuns.ErrorMessage}`);
            return { PromptRunID: null, StepID: stepID };
        }
        return { PromptRunID: promptRuns.Results[0]?.ID ?? null, StepID: stepID };
    }

    /**
     * Loads + finalizes the co-agent `AIAgentRun` if still `Running`, with `failure` as its `ErrorMessage` when it fails.
     * Tolerant: logs, never throws.
     */
    private async finalizeAgentRun(
        coAgentRunID: string | null,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        success: boolean,
        failure?: string,
    ): Promise<void> {
        if (!coAgentRunID) {
            return;
        }
        const run = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', contextUser);
        if (!(await run.Load(coAgentRunID)) || run.Status !== 'Running') {
            return;
        }
        run.Status = success ? 'Completed' : 'Failed';
        run.CompletedAt = new Date();
        run.Success = success;
        if (failure) {
            run.ErrorMessage = failure;
        }
        if (!(await run.Save())) {
            LogError(`RealtimeClientSessionService.finalizeAgentRun save failed: ${run.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }

    /**
     * Loads + finalizes the co-agent run's single system-prompt `MJ: AI Agent Run Steps` row if
     * still `Running` (Status `Completed`/`Failed`, `CompletedAt`, `Success`; a failed step's `ErrorMessage` is
     * `failure`, or a generic line without one). Tolerant: a missing/already-finalized step is a no-op; a
     * load/save failure is logged, never thrown.
     */
    private async finalizeRunStep(
        coAgentRunStepID: string | null,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        success: boolean,
        failure?: string,
    ): Promise<void> {
        if (!coAgentRunStepID) {
            return;
        }
        try {
            const step = await provider.GetEntityObject<MJAIAgentRunStepEntity>('MJ: AI Agent Run Steps', contextUser);
            if (!(await step.Load(coAgentRunStepID)) || step.Status !== 'Running') {
                return;
            }
            step.Status = success ? 'Completed' : 'Failed';
            step.CompletedAt = new Date();
            step.Success = success;
            if (!success) {
                step.ErrorMessage = failure ?? 'The realtime session ended in an error state.';
            }
            if (!(await step.Save())) {
                LogError(`RealtimeClientSessionService.finalizeRunStep save failed: ${step.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        } catch (error) {
            LogError(`RealtimeClientSessionService.finalizeRunStep failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Loads + finalizes the co-agent `AIPromptRun` if still `Running`, with `failure` as its `ErrorMessage` when it fails.
     * Tolerant: logs, never throws.
     */
    private async finalizePromptRun(
        promptRunID: string | null,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        success: boolean,
        failure?: string,
    ): Promise<void> {
        if (!promptRunID) {
            return;
        }
        // Serialize the finalize against any in-flight message/usage writes so it can't race them — and so a
        // late usage flush queued behind it sees the run already Completed.
        await this.serializePromptRunWrite(promptRunID, async () => {
            const run = await provider.GetEntityObject<MJAIPromptRunEntityExtended>('MJ: AI Prompt Runs', contextUser);
            if (!(await run.Load(promptRunID)) || run.Status !== 'Running') {
                return false;
            }
            run.Status = success ? 'Completed' : 'Failed';
            run.CompletedAt = new Date();
            run.Success = success;
            if (failure) {
                run.ErrorMessage = failure;
            }
            if (!(await run.Save())) {
                LogError(`RealtimeClientSessionService.finalizePromptRun save failed: ${run.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
            return true;
        });
        // Drop the per-run lock chain — no further writes are expected after finalize.
        this.promptRunWriteChains.Delete(promptRunID);
    }

    /**
     * Appends (or replaces) one transcript turn onto the co-agent's long-lived `AIPromptRun.Messages`,
     * so the realtime co-agent's conversation is captured on its run exactly like every other MJ agent
     * run — closing the observability gap where the run held only token totals, never the turns. The
     * run viewer can then show what the co-agent heard and said. Mirrors {@link accumulatePromptRunUsage}'s
     * load/append/save pattern; best-effort and tolerant (logs, never throws).
     *
     * `replacePrevious` swaps the last same-role message instead of appending — the streaming-correction
     * case (an interim assistant turn finalized into its full text). The stored shape is the standard
     * chat-message array (`[{ role, content }, …]`) the rest of MJ already reads from `Messages`.
     *
     * NOTE: load-append-save carries the same benign race as usage accumulation; realtime turns are
     * sequential per session so collisions are rare. A dedicated child turn-row entity would remove the
     * race (and the blob rewrite) entirely — a future increment. Tool-call turns (the browser_ and
     * Whiteboard_ channel tools) are a separate increment that requires the client to relay them.
     *
     * @returns `true` when the turn was persisted onto the prompt run.
     */
    public async AppendPromptRunMessage(
        promptRunID: string,
        role: 'user' | 'assistant' | 'system',
        content: string,
        replacePrevious: boolean,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<boolean> {
        // Serialized against usage checkpoints on the same run so a concurrent usage save can't clobber
        // the Messages we write here (and vice-versa). See promptRunWriteChains.
        return this.serializePromptRunWrite(promptRunID, async () => {
            try {
                const promptRun = await provider.GetEntityObject<MJAIPromptRunEntityExtended>('MJ: AI Prompt Runs', contextUser);
                if (!(await promptRun.Load(promptRunID))) {
                    LogError(`AppendPromptRunMessage: co-agent prompt run ${promptRunID} not found — transcript turn dropped.`);
                    return false;
                }
                const messages = this.parsePromptRunMessages(promptRun.Messages);
                const last = messages[messages.length - 1];
                if (replacePrevious && last && last.role === role) {
                    last.content = content;
                } else {
                    messages.push({ role, content });
                }
                promptRun.Messages = JSON.stringify(messages);
                if (!(await promptRun.Save())) {
                    LogError(`AppendPromptRunMessage: prompt run ${promptRunID} save failed: ${promptRun.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                    return false;
                }
                return true;
            } catch (error) {
                LogError(`AppendPromptRunMessage: append failed for prompt run ${promptRunID}: ${(error as Error).message}`);
                return false;
            }
        });
    }

    /**
     * Accumulates relayed usage DELTAS onto the co-agent `AIPromptRun`'s `TokensPrompt` / `TokensCompletion`
     * (recomputing `TokensUsed`). Serialized against {@link AppendPromptRunMessage} on the same run so the
     * high-frequency usage checkpoint never overwrites freshly-appended transcript turns (and vice-versa).
     * Best-effort: load/save failures log and return `false`, never throw.
     *
     * The per-modality details add into the usage record the run keeps in `ModelSpecificResponseDetails`
     * (`RealtimeUsage.Input` / `.Output`, which pricing reads at finalize); every other key there is kept. The
     * stored output video seconds never exceed the run's elapsed time plus 30 seconds: usage is client-reported,
     * and avatar video carries a price.
     *
     * @param promptRunID The co-agent observability prompt run.
     * @param inputDelta Input-token delta to add (caller clamps to >= 0).
     * @param outputDelta Output-token delta to add (caller clamps to >= 0).
     * @param details Per-modality usage to add (input and output blocks, avatar video seconds included).
     * @returns `true` when the accumulated usage was persisted.
     */
    public async AccumulatePromptRunUsage(
        promptRunID: string,
        inputDelta: number,
        outputDelta: number,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        details?: RealtimeUsageRecord,
    ): Promise<boolean> {
        return this.serializePromptRunWrite(promptRunID, async () => {
            try {
                const promptRun = await provider.GetEntityObject<MJAIPromptRunEntityExtended>('MJ: AI Prompt Runs', contextUser);
                if (!(await promptRun.Load(promptRunID))) {
                    LogError(`AccumulatePromptRunUsage: co-agent prompt run ${promptRunID} not found — usage delta dropped.`);
                    return false;
                }
                promptRun.TokensPrompt = (promptRun.TokensPrompt ?? 0) + inputDelta;
                promptRun.TokensCompletion = (promptRun.TokensCompletion ?? 0) + outputDelta;
                promptRun.TokensUsed = (promptRun.TokensPrompt ?? 0) + (promptRun.TokensCompletion ?? 0);
                if (details) {
                    this.mergeUsageDetails(promptRun, details);
                }
                if (!(await promptRun.Save())) {
                    LogError(`AccumulatePromptRunUsage: prompt run ${promptRunID} save failed: ${promptRun.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                    return false;
                }
                return true;
            } catch (error) {
                LogError(`AccumulatePromptRunUsage: usage accumulation failed for prompt run ${promptRunID}: ${(error as Error).message}`);
                return false;
            }
        });
    }

    /**
     * Adds relayed per-modality usage into the run's usage record, with the output video seconds capped at the run's
     * elapsed time plus {@link VIDEO_SECONDS_GRACE}. Details that are not a JSON object are left alone (logged).
     */
    private mergeUsageDetails(promptRun: MJAIPromptRunEntityExtended, details: RealtimeUsageRecord): void {
        const runAt = promptRun.RunAt ? new Date(promptRun.RunAt).getTime() : Number.NaN;
        const elapsedSeconds = Math.max(0, (Date.now() - runAt) / 1000);
        const merged = MergeRealtimeUsageRecord(promptRun.ModelSpecificResponseDetails, details, {
            MaxOutputVideoSeconds: Number.isFinite(elapsedSeconds) ? elapsedSeconds + VIDEO_SECONDS_GRACE : undefined,
        });
        if (!merged) {
            LogError(`AccumulatePromptRunUsage: prompt run ${promptRun.ID} has details that are not a JSON object — usage details dropped.`);
            return;
        }
        if (merged.ClampedVideoSeconds > 0) {
            LogStatus(
                `AccumulatePromptRunUsage: prompt run ${promptRun.ID} reported ${merged.ClampedVideoSeconds} s more avatar video than ` +
                    `the run's elapsed time plus ${VIDEO_SECONDS_GRACE} s allows; the stored seconds are capped.`,
            );
        }
        promptRun.ModelSpecificResponseDetails = merged.Details;
    }

    /** Parses the prompt run's `Messages` JSON into a mutable chat-message array (tolerant: `[]` on empty/malformed). */
    private parsePromptRunMessages(raw: string | null | undefined): Array<{ role: string; content: string }> {
        if (!raw || !raw.trim()) {
            return [];
        }
        try {
            const parsed: unknown = JSON.parse(raw);
            return Array.isArray(parsed) ? (parsed as Array<{ role: string; content: string }>) : [];
        } catch {
            return [];
        }
    }

    /**
     * Executes a single tool call relayed from the browser and returns its serialized result.
     *
     * Builds a {@link RealtimeToolBroker} whose `DelegateToTarget` runs the target agent (threading
     * the abort signal, parent run, and session id) and whose `ExecuteTool` returns a structured
     * "not available" result for non-target tools (action wiring is a later phase). The broker
     * routes the call and always resolves with structured JSON — failures become `tool_response`
     * errors the model can narrate rather than thrown exceptions.
     *
     * @param input The relayed tool call plus delegation linkage.
     * @param contextUser The calling user (threaded into the delegated agent run).
     * @param provider The request-scoped metadata provider (threaded into the delegated agent run).
     * @returns `{ ResultJson, Success, PausedRunID?, Artifacts? }` — the serialized tool result for
     *   the browser to relay back, the paused run id when the delegated target agent paused awaiting
     *   feedback (so the resolver can persist it and resume that run on the next answer), and the
     *   artifacts the delegated run produced (so the resolver can junction-link them into the
     *   session's conversation history — the same info is embedded in `ResultJson` for the client).
     */
    public async ExecuteRelayedTool(
        input: ExecuteRelayedToolInput,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<{ ResultJson: string; Success: boolean; PausedRunID?: string; Artifacts?: DelegatedRunArtifact[] }> {
        // Register this call in the in-flight registry so CancelInFlightDelegations (the
        // CancelRealtimeSessionTool mutation) can abort it mid-flight. The registry controller's
        // signal is combined with any caller-supplied signal — either source cancels the run.
        const controller = this.registerInFlightDelegation(input.AgentSessionID, input.Call.CallID);
        const effectiveInput: ExecuteRelayedToolInput = {
            ...input,
            AbortSignal: input.AbortSignal ? this.combineSignals(controller.signal, input.AbortSignal) : controller.signal
        };
        try {
            const broker = this.buildToolBroker(effectiveInput, contextUser, provider);
            const result = await broker.ExecuteToolCall(effectiveInput.Call);
            return { ResultJson: result.ResultJson, Success: result.Success, PausedRunID: result.PausedRunID, Artifacts: result.Artifacts };
        } finally {
            this.unregisterInFlightDelegation(input.AgentSessionID, input.Call.CallID, controller);
        }
    }

    /**
     * Aborts in-flight relayed delegations for a session — the server half of the client-direct
     * CANCEL channel (see the registry note on {@link inFlightDelegations}).
     *
     * @param agentSessionID The session whose in-flight delegations to abort.
     * @param callID When supplied, only the delegation for this specific call is aborted; when
     *   omitted, EVERY in-flight delegation for the session is aborted.
     * @returns The number of in-flight delegations aborted. **Tolerant by design**: an unknown
     *   session, an unknown call id, or a session with nothing in flight returns `0` — never throws
     *   (the call the user wanted dead may simply have finished already, which is a fine outcome).
     */
    public CancelInFlightDelegations(agentSessionID: string, callID?: string): number {
        const sessionKey = this.registryKey(agentSessionID);
        const sessionMap = this.inFlightDelegations.get(sessionKey);
        if (!sessionMap || sessionMap.size === 0) {
            return 0;
        }
        let aborted = 0;
        if (callID != null && callID.trim().length > 0) {
            const callKey = this.registryKey(callID);
            const controller = sessionMap.get(callKey);
            if (controller) {
                controller.abort();
                sessionMap.delete(callKey);
                aborted = 1;
            }
        } else {
            for (const controller of sessionMap.values()) {
                controller.abort();
                aborted++;
            }
            sessionMap.clear();
        }
        if (sessionMap.size === 0) {
            this.inFlightDelegations.delete(sessionKey);
        }
        if (aborted > 0) {
            LogStatus(`RealtimeClientSessionService: aborted ${aborted} in-flight delegation(s) for session ${agentSessionID}.`);
        }
        return aborted;
    }

    /** Normalized (trim + lowercase) registry key so UUID casing differences can't split entries. */
    private registryKey(id: string): string {
        return id.trim().toLowerCase();
    }

    /** Creates + registers the abort controller for one in-flight relayed call. */
    private registerInFlightDelegation(agentSessionID: string, callID: string): AbortController {
        const sessionKey = this.registryKey(agentSessionID);
        let sessionMap = this.inFlightDelegations.get(sessionKey);
        if (!sessionMap) {
            sessionMap = new Map<string, AbortController>();
            this.inFlightDelegations.set(sessionKey, sessionMap);
        }
        const controller = new AbortController();
        sessionMap.set(this.registryKey(callID), controller);
        return controller;
    }

    /**
     * Removes one call's registry entry on completion — but only when the stored controller is
     * STILL the one this execution registered (a cancel may already have removed it, and a
     * same-callID retry may have replaced it).
     */
    private unregisterInFlightDelegation(agentSessionID: string, callID: string, controller: AbortController): void {
        const sessionKey = this.registryKey(agentSessionID);
        const sessionMap = this.inFlightDelegations.get(sessionKey);
        if (!sessionMap) {
            return;
        }
        const callKey = this.registryKey(callID);
        if (sessionMap.get(callKey) === controller) {
            sessionMap.delete(callKey);
        }
        if (sessionMap.size === 0) {
            this.inFlightDelegations.delete(sessionKey);
        }
    }

    /**
     * Ensures {@link AIEngine} metadata is loaded before resolution. **Overridable seam** so tests
     * can skip the DB-backed config load.
     *
     * @param contextUser The calling user.
     * @param provider The request-scoped metadata provider.
     */
    protected async configureEngine(contextUser: UserInfo, provider: IMetadataProvider): Promise<void> {
        await AIEngine.Instance.Config(false, contextUser, provider);
        await ActionEngineServer.Instance.Config(false, contextUser);
    }

    /**
     * Resolves the co-agent from either the supplied entity or its id (from cached metadata).
     *
     * @param input The prepare-session input.
     * @returns The co-agent entity, or `null` when neither form resolves.
     */
    protected resolveCoAgent(input: PrepareClientSessionInput): MJAIAgentEntityExtended | null {
        if (input.CoAgent) {
            return input.CoAgent;
        }
        if (input.CoAgentID) {
            return (AIEngine.Instance.Agents ?? []).find(a => UUIDsEqual(a.ID, input.CoAgentID!)) ?? null;
        }
        return null;
    }

    /**
     * Resolves the realtime model for a session, honoring an explicit user choice when present.
     *
     * - With {@link PrepareClientSessionInput.PreferredModelID}: resolve THAT model strictly via
     *   {@link resolvePreferredRealtimeModel} — failures return a specific reason and never fall
     *   back to another model (the user explicitly chose). (The transport layer has already
     *   authorization-gated a deviating explicit choice.)
     * - Else, with an effective-config `realtime.modelPreference` (name or id): resolve it via
     *   {@link resolveConfiguredModelPreference}. METADATA preferences degrade gracefully — an
     *   unsatisfiable preference logs and FALLS THROUGH to the default (mirroring the co-agent
     *   resolution chain's tolerant metadata steps), it never breaks calls.
     * - Without either: the default walk ({@link resolveDefaultRealtimeModel}): for a co-agent with video on, in a session
     *   that could show an avatar (a browser session, or a server-side one with {@link PrepareClientSessionInput.AvatarDelivery}
     *   `'room'`), the first candidate that shows one ({@link ResolveAvatarRealtimeModel}); else the existing default via
     *   {@link resolveRealtimeModel} (highest-PowerRank active Realtime model), with the generic
     *   {@link noModelMessage} on failure. The two explicit choices above win over the video preference.
     *
     * @param input The prepare-session input (carries the optional preferred model id).
     * @param coAgent The resolved co-agent (threaded to the default-resolution seam).
     * @param effectiveConfig The resolved effective configuration (carries `modelPreference` and the video setting).
     * @returns The resolution outcome (resolution or failure reason).
     */
    protected async resolveModelForSession(
        input: PrepareClientSessionInput,
        coAgent: MJAIAgentEntityExtended,
        effectiveConfig?: RealtimeCoAgentConfig
    ): Promise<RealtimeModelResolutionOutcome> {
        // One resolver for every branch below, built here rather than per branch so the requested-model,
        // configured-preference and default paths cannot disagree about which credentials the session
        // may use. It answers with the session's RUN keys only: resolveVendorAndInstantiate layers this
        // service's getAPIKeyForDriver seam under it, giving run key → seam → (the seam's default) env.
        // A resolver that fell back to the environment itself would answer before the seam, so a
        // subclass that overrides the seam would lose to AI_VENDOR_API_KEY__<driver>.
        const resolveRunKey = this.buildRunKeyResolver(input.APIKeys);
        const scope = input.CredentialScope ?? 'Any';
        if (input.PreferredModelID) {
            return this.resolvePreferredRealtimeModel(input.PreferredModelID, resolveRunKey, scope);
        }
        const fromConfig = this.resolveConfiguredModelPreference(effectiveConfig, resolveRunKey, scope);
        if (fromConfig) {
            return { Resolution: fromConfig };
        }
        const preferAvatar = effectiveConfig?.realtime?.video?.enabled === true && this.sessionCanShowAvatar(input);
        const resolution = await this.resolveDefaultRealtimeModel(coAgent, preferAvatar, resolveRunKey, scope);
        return resolution ? { Resolution: resolution } : { ErrorMessage: this.noModelMessage() };
    }

    /**
     * Whether the session could show an avatar at all: a browser session, or a server-side one whose host publishes the
     * avatar into a room. A phone call, or a meeting whose host can't publish video, can't.
     */
    private sessionCanShowAvatar(input: PrepareClientSessionInput): boolean {
        return input.ServerSide !== true || input.AvatarDelivery === 'room';
    }

    /**
     * The default walk. With `preferAvatar` (the co-agent's video setting is on and the session could show an avatar),
     * it takes the first candidate that shows one ({@link ResolveAvatarRealtimeModel}). When none does, or without it, it
     * takes {@link resolveRealtimeModel}'s choice; when one was preferred, one log line says the call stays audio only.
     */
    private async resolveDefaultRealtimeModel(
        coAgent: MJAIAgentEntityExtended,
        preferAvatar: boolean,
        resolve: AIAPIKeyResolver,
        credentialScope: AICredentialScope,
    ): Promise<RealtimeModelResolution | null> {
        const withAvatar = preferAvatar ? this.ResolveAvatarRealtimeModel(coAgent, resolve, credentialScope) : null;
        if (withAvatar) {
            return withAvatar;
        }
        const resolution = await this.resolveRealtimeModel(coAgent, resolve, credentialScope);
        if (preferAvatar && resolution) {
            LogStatus(
                '[RealtimeCoAgent] Video is on, but no realtime model with a usable key shows an avatar (its Video/Output row ' +
                    `and its endpoint): using '${resolution.ModelName ?? resolution.APIName}' on ${resolution.DriverClass ?? 'its driver'}, audio only.`,
            );
        }
        return resolution;
    }

    /**
     * For a co-agent with video on: the first candidate that shows an avatar and supports client-direct sessions, in the
     * default walk's order (highest PowerRank first; a model's Active vendor rows by Priority, each with a usable key).
     * A candidate shows an avatar when its model's Video/Output row allows video or it has none, and its driver renders
     * avatars for the vendor's API name on its endpoint ({@link RealtimeModelShowsAvatar}). Every keyed vendor of a model
     * is tried, not only the first. **Overridable seam.**
     *
     * @param coAgent The co-agent (reserved for future per-agent model preference).
     * @param resolve The session's run-scoped key resolver (run keys only; see {@link resolveVendorAndInstantiate}).
     * @param credentialScope The session's credential scope; see {@link resolveVendorAndInstantiate}.
     * @returns The resolution, or `null` when no candidate shows an avatar.
     */
    protected ResolveAvatarRealtimeModel(coAgent: MJAIAgentEntityExtended, resolve?: AIAPIKeyResolver, credentialScope: AICredentialScope = 'Any'): RealtimeModelResolution | null {
        const resolveKey = this.buildKeyChain(resolve, credentialScope);
        for (const model of this.selectRealtimeModelCandidates(coAgent)) {
            if (ReadRealtimeVideoOutputRow(model.ID, AIEngine.Instance) === 'unsupported') {
                continue;
            }
            for (const vendor of ListRealtimeVendorsForModel(model.ID)) {
                const resolution = this.instantiateRealtimeVendor(model, vendor, resolveKey);
                if (resolution?.Model.SupportsClientDirect && RealtimeModelShowsAvatar(resolution, AIEngine.Instance)) {
                    return resolution;
                }
            }
        }
        return null;
    }

    /**
     * The session's run-scoped keys as a resolver: the key for a driver class when the run carries
     * one, else `undefined` — no platform fallback. The fallback belongs to
     * {@link getAPIKeyForDriver}, which {@link resolveVendorAndInstantiate} consults for any class
     * this does not key.
     *
     * @param apiKeys The session's run keys ({@link PrepareClientSessionInput.APIKeys}), if any.
     * @returns A resolver over those keys only.
     */
    private buildRunKeyResolver(apiKeys: AIAPIKey[] | undefined): AIAPIKeyResolver {
        return (driverClass) => apiKeys?.find(k => k.driverClass === driverClass)?.apiKey || undefined;
    }

    /**
     * Resolves the effective config's `realtime.modelPreference` (an `MJ: AI Models` Name OR ID)
     * into a usable realtime model. TOLERANT by design — this is a METADATA preference, so any
     * failure (unknown model, inactive, wrong type, no vendor/key) logs a warning and returns
     * `null`, falling through to the default highest-PowerRank resolution. Contrast with the
     * explicit runtime choice ({@link resolvePreferredRealtimeModel}), which fails loud.
     *
     * @param effectiveConfig The resolved effective configuration.
     * @param resolve The session's run-scoped key resolver (run keys only; see {@link resolveVendorAndInstantiate}).
     * @param credentialScope The session's credential scope; see {@link resolveVendorAndInstantiate}.
     * @returns The resolution, or `null` when no preference is configured or it can't be satisfied.
     */
    protected resolveConfiguredModelPreference(effectiveConfig?: RealtimeCoAgentConfig, resolve?: AIAPIKeyResolver, credentialScope: AICredentialScope = 'Any'): RealtimeModelResolution | null {
        const preference = effectiveConfig?.realtime?.modelPreference;
        if (!preference) {
            return null;
        }
        const model = this.findModelByIDOrName(preference);
        if (!model) {
            LogError(
                `RealtimeClientSessionService: configured realtime model preference '${preference}' matches no model in ` +
                'AI model metadata — falling through to default realtime model resolution.'
            );
            return null;
        }
        if (!model.IsActive || !this.isRealtimeModel(model)) {
            LogError(
                `RealtimeClientSessionService: configured realtime model preference '${preference}' resolved to ` +
                `'${model.Name}' but it is not an Active Realtime model — falling through to default resolution.`
            );
            return null;
        }
        const resolution = this.resolveVendorAndInstantiate(model, resolve, credentialScope);
        if (!resolution) {
            LogError(
                `RealtimeClientSessionService: configured realtime model preference '${model.Name}' has no usable ` +
                'vendor DriverClass/API key — falling through to default resolution.'
            );
        }
        return resolution;
    }

    /**
     * Looks up a model by ID (UUID-insensitive) or, failing that, by case/whitespace-insensitive
     * Name in {@link AIEngine}'s cached models. **Overridable seam**; tolerant of an unloaded cache.
     *
     * @param preference The `MJ: AI Models` ID or Name.
     * @returns The model entity, or `null`.
     */
    protected findModelByIDOrName(preference: string): MJAIModelEntityExtended | null {
        try {
            const models = AIEngine.Instance.Models ?? [];
            const wanted = preference.trim().toLowerCase();
            return (
                models.find(m => UUIDsEqual(m.ID, preference)) ??
                models.find(m => m.Name?.trim().toLowerCase() === wanted) ??
                null
            );
        } catch {
            return null;
        }
    }

    /**
     * Strictly resolves an EXPLICITLY requested realtime model. Each precondition failure returns
     * a clear, user-facing reason naming the model — there is NO fallback to another model, because
     * the caller's user explicitly chose this one.
     *
     * @param preferredModelID The `MJ: AI Models.ID` the user chose.
     * @param resolve The session's run-scoped key resolver (run keys only; see {@link resolveVendorAndInstantiate}).
     * @param credentialScope The session's credential scope; see {@link resolveVendorAndInstantiate}.
     * @returns The resolution outcome (resolution or a specific failure reason).
     */
    protected resolvePreferredRealtimeModel(preferredModelID: string, resolve?: AIAPIKeyResolver, credentialScope: AICredentialScope = 'Any'): RealtimeModelResolutionOutcome {
        const model = this.findModelByID(preferredModelID);
        if (!model) {
            return { ErrorMessage: `The requested realtime model (id '${preferredModelID}') was not found in AI model metadata.` };
        }
        if (!model.IsActive) {
            return { ErrorMessage: `The requested model '${model.Name}' is not active and cannot be used for a voice session.` };
        }
        if (!this.isRealtimeModel(model)) {
            return { ErrorMessage: `The requested model '${model.Name}' is not a Realtime model (its type is '${model.AIModelType}').` };
        }
        const resolution = this.resolveVendorAndInstantiate(model, resolve, credentialScope);
        if (!resolution) {
            return {
                ErrorMessage:
                    `The requested model '${model.Name}' has no active vendor with a usable DriverClass/API key ` +
                    '(e.g. AI_VENDOR_API_KEY__<driver>), so the voice session could not be started with it.'
            };
        }
        return { Resolution: resolution };
    }

    /**
     * Looks up a model by id in {@link AIEngine}'s cached models. **Overridable seam** for tests.
     *
     * @param modelID The `MJ: AI Models.ID` to find.
     * @returns The model entity, or `null` when not present.
     */
    protected findModelByID(modelID: string): MJAIModelEntityExtended | null {
        return (AIEngine.Instance.Models ?? []).find(m => UUIDsEqual(m.ID, modelID)) ?? null;
    }

    /** True when the model's denormalized `AIModelType` name is `Realtime` (case/whitespace-insensitive). */
    private isRealtimeModel(model: MJAIModelEntityExtended): boolean {
        return typeof model.AIModelType === 'string' && model.AIModelType.trim().toLowerCase() === 'realtime';
    }

    /**
     * Resolves the Realtime model + vendor driver + API key, mirroring `BaseAgent`'s server-bridged
     * resolution: highest-power active model of AIModelType `Realtime`; highest-priority active
     * vendor whose `DriverClass` has a resolvable API key; instantiated via the `ClassFactory`.
     *
     * **Overridable seam.** Test subclasses override this to return a mock model so the service can
     * be exercised without provider SDKs or DB metadata. Returns `null` (never throws) when any
     * step can't be satisfied.
     *
     * @param coAgent The co-agent being voiced (reserved for future per-agent model preference).
     * @param resolve The session's run-scoped key resolver (run keys only; see {@link resolveVendorAndInstantiate}).
     * @param credentialScope The session's credential scope; see {@link resolveVendorAndInstantiate}.
     * @returns The resolved model + identifiers, or `null`.
     */
    protected async resolveRealtimeModel(coAgent: MJAIAgentEntityExtended, resolve?: AIAPIKeyResolver, credentialScope: AICredentialScope = 'Any'): Promise<RealtimeModelResolution | null> {
        // Walk candidates in descending PowerRank, returning the FIRST that fully resolves to a usable
        // client-direct driver (active vendor + API key + ClassFactory driver + SupportsClientDirect).
        // Single-pick dead-ended whenever the highest-power model lacked a key or client-direct support
        // — e.g. a newly-seeded provider (Grok/Inworld) with no env key outranking GPT Realtime — and
        // surfaced "No usable Realtime model" instead of falling through to a model that works.
        const candidates = this.selectRealtimeModelCandidates(coAgent);
        for (const model of candidates) {
            const resolution = this.resolveVendorAndInstantiate(model, resolve, credentialScope);
            if (resolution && resolution.Model.SupportsClientDirect) {
                return resolution;
            }
        }
        return null;
    }

    /**
     * Shared tail of model resolution: picks the vendor (with a usable API key) for an
     * already-chosen model entity and instantiates its realtime driver.
     *
     * Key precedence, per driver class: `resolve` (the session's run keys), then this service's
     * {@link getAPIKeyForDriver} seam, whose default is the environment key. Vendor selection and the
     * mint use that one chain, so a session is never routed to a vendor it cannot then be minted on.
     *
     * @param model The chosen model entity.
     * @param resolve The session's run-scoped key resolver. Expected to answer with run keys only:
     *   one that falls back to the environment itself answers before {@link getAPIKeyForDriver} and
     *   so bypasses an override of it.
     * @param credentialScope A scope that rules out the `'Environment'` source (`'RuntimeOnly'`) drops the
     *   {@link getAPIKeyForDriver} seam: the run's keys are the whole chain, so a vendor they do not key
     *   is never selected on the platform's key.
     * @returns The full resolution, or `null` when no vendor/key/driver can be satisfied.
     */
    protected resolveVendorAndInstantiate(model: MJAIModelEntityExtended, resolve?: AIAPIKeyResolver, credentialScope: AICredentialScope = 'Any'): RealtimeModelResolution | null {
        const resolveKey = this.buildKeyChain(resolve, credentialScope);
        const vendor = this.selectRealtimeVendor(model.ID, resolveKey);
        return vendor ? this.instantiateRealtimeVendor(model, vendor, resolveKey) : null;
    }

    /**
     * The session's complete key chain for vendor selection and the mint (see {@link resolveVendorAndInstantiate}): the
     * run's keys first, then this service's own seam (which subclasses and tests override), so a run-scoped credential
     * wins without taking that seam away from anyone who replaced it. A scope that rules out the environment has no second
     * step: the seam's default is the platform key.
     */
    private buildKeyChain(resolve: AIAPIKeyResolver | undefined, credentialScope: AICredentialScope): AIAPIKeyResolver {
        return CredentialScopeAllows(credentialScope, 'Environment')
            ? (driverClass) => resolve?.(driverClass) ?? this.getAPIKeyForDriver(driverClass)
            : (driverClass) => resolve?.(driverClass);
    }

    /** Instantiates a vendor's realtime driver with its key from the chain; `null` when the key or the driver is missing. */
    private instantiateRealtimeVendor(model: MJAIModelEntityExtended, vendor: RealtimeVendorSelection, resolveKey: AIAPIKeyResolver): RealtimeModelResolution | null {
        const apiKey = resolveKey(vendor.DriverClass);
        if (!apiKey) {
            return null;
        }

        const instance = this.createModelInstance(vendor.DriverClass, apiKey);
        if (!instance) {
            return null;
        }

        return {
            Model: instance,
            ModelID: model.ID,
            VendorID: vendor.VendorID,
            ModelVendorID: vendor.ModelVendorID,
            APIName: vendor.APIName,
            ModelName: model.Name,
            DriverClass: vendor.DriverClass
        };
    }

    /**
     * Resolves the API key for a vendor driver class. **Overridable seam** (wraps the module-level
     * {@link GetAIAPIKey}) so tests can simulate present/absent keys without environment setup.
     * Consulted for every driver class the session's run keys do not cover, so an override (a vault,
     * a different key, or `undefined` to disable a vendor) applies whether or not the environment
     * also holds a key.
     *
     * @param driverClass The vendor's `DriverClass`.
     * @returns The API key, or a falsy value when none is configured.
     */
    protected getAPIKeyForDriver(driverClass: string): string | undefined {
        return GetAIAPIKey(driverClass) || undefined;
    }

    /**
     * Instantiates the realtime driver for a vendor driver class via the ClassFactory.
     * **Overridable seam** so tests can return a mock driver.
     *
     * @param driverClass The vendor's `DriverClass` (the ClassFactory key).
     * @param apiKey The resolved API key (constructor argument).
     * @returns The driver instance, or `null` when the factory cannot create one.
     */
    protected createModelInstance(driverClass: string, apiKey: string): BaseRealtimeModel | null {
        return MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeModel>(BaseRealtimeModel, driverClass, apiKey) ?? null;
    }

    /**
     * The active models of AIModelType `Realtime`, sorted highest-PowerRank first — the candidate
     * list {@link resolveRealtimeModel} walks until one yields a usable client-direct driver, and
     * {@link ResolveAvatarRealtimeModel} walks first for a co-agent with video on. Equal PowerRanks
     * keep the engine's cached order (a stable sort).
     * Returns ALL candidates (not just the top pick) so a keyless or non-client-direct top model
     * falls through to the next usable one instead of dead-ending the whole resolution.
     *
     * @param coAgent The co-agent (reserved for future per-agent model preference).
     * @returns The candidate models in resolution order (empty array when none are active).
     */
    private selectRealtimeModelCandidates(coAgent: MJAIAgentEntityExtended): MJAIModelEntityExtended[] {
        return AIEngine.Instance.Models
            .filter(m => m.IsActive && this.isRealtimeModel(m))
            .sort((a, b) => (b.PowerRank ?? 0) - (a.PowerRank ?? 0));
    }

    /**
     * Selects the highest-priority active vendor for a model whose `DriverClass` has a resolvable
     * API key. Delegates to {@link SelectRealtimeVendorForModel} (the one copy of the rule), threading
     * THIS service's {@link getAPIKeyForDriver} so subclasses and tests keep their key-resolution seam.
     *
     * @param modelID The chosen model's id.
     * @param resolve The complete key chain to select against; defaults to {@link getAPIKeyForDriver}.
     * @returns The vendor driver/api identifiers, or `null` when none has a usable key.
     */
    protected selectRealtimeVendor(modelID: string, resolve?: AIAPIKeyResolver): RealtimeVendorSelection | null {
        return SelectRealtimeVendorForModel(modelID, resolve ?? ((driverClass) => this.getAPIKeyForDriver(driverClass)));
    }

    /**
     * Resolves the DB-driven progress-narration instruction template: the Active `MJ: AI Prompts`
     * row named {@link RealtimeClientSessionService.NarrationPromptName}, read from
     * {@link AIEngine}'s cached prompts. When the current name is absent, falls back to the
     * DEPRECATED {@link RealtimeClientSessionService.LegacyNarrationPromptName} (pre-rename seed)
     * with a deprecation log. **Tolerant**: returns `null` (never throws) when neither prompt is
     * present, the text is empty, or the engine cache is unavailable — clients fall back to their
     * built-in narration instruction text.
     *
     * @returns The template text (containing a `{{ progressMessage }}` placeholder), or `null`.
     */
    protected resolveNarrationInstructionsTemplate(): string | null {
        return ResolveNarrationInstructionsTemplate();
    }

    /**
     * Builds the {@link RealtimeSessionParams} for the client-direct session: the companion system
     * prompt plus the registered realtime tool set.
     *
     * @param input The prepare-session input.
     * @param coAgent The resolved co-agent.
     * @param modelApiName The vendor API name of the resolved realtime model.
     * @param contextUser The calling user.
     * @param provider The request-scoped metadata provider.
     * @param effectiveConfig The resolved effective configuration (voice persona + provider settings).
     * @param driverClass The resolved vendor's DriverClass — matches per-provider voice settings.
     * @param modelID The resolved `MJ: AI Models` id — keys the model-catalog `ModelConfiguration` cascade.
     * @param modelVendorID The resolved `MJ: AI Model Vendors` ROW id — the cascade's most-specific layer.
     * @param resolvedAvatar The session's avatar resolution, when the caller already made it; resolved here otherwise.
     * @returns The assembled session params.
     */
    protected async buildSessionParams(
        input: PrepareClientSessionInput,
        coAgent: MJAIAgentEntityExtended,
        modelApiName: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        effectiveConfig?: RealtimeCoAgentConfig,
        driverClass?: string,
        modelID?: string,
        modelVendorID?: string,
        resolvedAvatar?: RealtimeAvatarResolution
    ): Promise<RealtimeSessionParams> {
        const directTools = this.BuildDirectActionTools(input.TargetAgentID, effectiveConfig, driverClass, input.AgentSessionID);
        const hasDirectTools = directTools.length > 0 || (input.ExtraTools != null && input.ExtraTools.length > 0);
        const systemPrompt = await this.buildCompanionSystemPrompt(input, coAgent, contextUser, provider, effectiveConfig, hasDirectTools);
        const memoryContext = await this.assembleMemoryContext(input, coAgent, contextUser, provider);
        const combinedExtra = directTools.length > 0
            ? [...(input.ExtraTools ?? []), ...directTools]
            : input.ExtraTools;
        const tools = this.appendHostTools(this.buildStableToolSet(combinedExtra), input.HostTools);
        // Hoisted (rather than built inline at the return) so the mint log below can report the voice
        // that ACTUALLY reached the driver — see the `voice=` field. Same bag, built once.
        const avatar = resolvedAvatar ?? this.ResolveSessionAvatar(input, coAgent, effectiveConfig, modelID, modelVendorID);
        const configBag = this.withAvatarVoice(this.buildSessionConfigBag(input, effectiveConfig, driverClass, modelID, modelVendorID), avatar, input);
        WarnOnUnmatchedProviderVoice(effectiveConfig, driverClass, 'RealtimeClientSessionService');

        // One line per mint: confirms which tools + whether the channel-direct framing actually reach
        // the model — settles "why does the co-agent delegate instead of calling browser_*" without
        // runtime guesswork (channelExceptionInPrompt=false ⇒ stale build; browser_* missing from
        // tools ⇒ the channel's tools never reached the mint). `driver`/`voice` make the voice that
        // actually reached the driver legible — the whole failure mode in #3530 was that it was not.
        console.log(
            `[RealtimeCoAgent] mint model=${modelApiName} driver=${driverClass ?? 'unknown'} ` +
            `voice=${typeof configBag?.['voice'] === 'string' ? configBag['voice'] : 'none'} ` +
            `avatar=${avatar.Avatar ? avatar.Avatar.AvatarID : avatar.Reason ? `none(${avatar.Reason})` : 'none'} ` +
            `tools=[${tools.map(t => t.Name).join(', ')}] ` +
            `channelExceptionInPrompt=${systemPrompt.includes('interactive-surface')}`,
        );

        return {
            Model: modelApiName,
            SystemPrompt: systemPrompt,
            Tools: tools,
            InitialContext: memoryContext || undefined,
            Config: configBag,
            // Server-authoritative duration ceiling (public web-widget voice cap). Drivers that can
            // bound the provider session/token apply min(default, this); the janitor enforces it
            // regardless of driver support via the session deadline stamped by the transport layer.
            MaxSessionSeconds: input.MaxSessionSeconds,
            UserID: contextUser?.ID,
            HasToolFraming: true,
            ...(avatar.Avatar ? { Avatar: input.AvatarDelivery ? { ...avatar.Avatar, Delivery: input.AvatarDelivery } : avatar.Avatar } : {}),
        };
    }

    /**
     * The live avatar this session asks for, if any: from the voiced agent's persona, or `realtime.video.avatarId`,
     * when the agent's video setting is on (see `ResolveRealtimeAvatar`). A model whose `MJ: AI Model Modalities`
     * Video/Output row turns video off asks for none (reason `endpoint`, one log line); otherwise whether the session can
     * render it is the driver's call. A seam so tests can supply a resolution without the engine's persona metadata.
     *
     * @param input The prepare-session input (the voiced agent).
     * @param coAgent The co-agent.
     * @param effectiveConfig The effective configuration.
     * @param modelID The resolved model.
     * @param modelVendorID The resolved model-vendor row; its vendor scopes the persona bindings.
     */
    protected ResolveSessionAvatar(
        input: PrepareClientSessionInput,
        coAgent: MJAIAgentEntityExtended,
        effectiveConfig: RealtimeCoAgentConfig | undefined,
        modelID: string | undefined,
        modelVendorID: string | undefined,
    ): RealtimeAvatarResolution {
        if (!modelID || effectiveConfig?.realtime?.video?.enabled !== true) {
            return {};
        }
        const vendorID = modelVendorID ? AIEngine.Instance.ModelVendors.find((mv) => UUIDsEqual(mv.ID, modelVendorID))?.VendorID : undefined;
        const videoOutputRow = ReadRealtimeVideoOutputRow(modelID, AIEngine.Instance);
        if (videoOutputRow === 'unsupported') {
            LogStatus(
                `[RealtimeCoAgent] No avatar asked for: the Video/Output modality row of '${this.findModelByID(modelID)?.Name ?? modelID}' ` +
                    'turns video off (IsSupported false). The call is audio only. Reason: endpoint.',
            );
        }
        return ResolveRealtimeAvatar(
            { EffectiveConfig: effectiveConfig, TargetAgentID: input.TargetAgentID, CoAgentID: coAgent.ID, ModelID: modelID, VendorID: vendorID, VideoOutputRow: videoOutputRow },
            AIEngine.Instance,
        );
    }

    /**
     * The config bag with the avatar persona's voice, so the face and the voice match, unless a voice was picked in this
     * call (a runtime override's `realtime.voice.default.voice`), which wins.
     */
    private withAvatarVoice(bag: JSONObject | undefined, avatar: RealtimeAvatarResolution, input: PrepareClientSessionInput): JSONObject | undefined {
        if (!avatar.Avatar || !avatar.Voice) {
            return bag;
        }
        const picked = ResolveEffectiveRealtimeConfig(null, null, input.ConfigOverridesJson).realtime?.voice?.default?.voice;
        return picked ? bag : { ...(bag ?? {}), voice: avatar.Voice };
    }

    /**
     * Builds the provider-pact `Config` bag for the session: the effective config's resolved voice
     * settings (per {@link GetProviderVoiceSettings} — the persona's agnostic wire-level slots
     * under `realtime.voice.default`
     * and/or a matching `realtime.voice.providers.<provider>` bag) merged UNDER any caller-supplied
     * {@link PrepareClientSessionInput.Config} (the runtime bag wins per key). The settings objects
     * are OPAQUE driver pacts — each server driver consumes its own keys exactly as it consumes any
     * other entry of the open config bag (OpenAI spreads it into `session.update`, AssemblyAI reads
     * `voice`, Gemini merges it last). Returns the original `input.Config` (possibly `undefined`)
     * when the config contributes no voice and no session tuning.
     *
     * @param input The prepare-session input (carries the runtime config bag).
     * @param effectiveConfig The resolved effective configuration.
     * @param driverClass The resolved vendor's DriverClass.
     * @param modelID The resolved model id — keys the model-catalog `ModelConfiguration` cascade.
     * @param modelVendorID The resolved model-vendor ROW id — the cascade's most-specific layer.
     * @returns The merged config bag, or `undefined` when nothing contributes.
     */
    protected buildSessionConfigBag(
        input: PrepareClientSessionInput,
        effectiveConfig?: RealtimeCoAgentConfig,
        driverClass?: string,
        modelID?: string,
        modelVendorID?: string
    ): JSONObject | undefined {
        const providerVoice = GetProviderVoiceSettings(effectiveConfig, driverClass ?? null);
        // Model-catalog defaults (AIModelType < AIModel < AIModelVendor ModelConfiguration cascade,
        // resolved by AIEngine) are the BASE layer: the catalog declares what the model supports
        // (e.g. Realtime.TurnDetection), and every layer above may refine it.
        const catalogSettings = modelID
            ? GetModelCatalogSessionSettings(AIEngine.Instance.GetEffectiveModelConfiguration(modelID, modelVendorID))
            : null;
        // Session-tuning knobs (realtime.session: effortLevel / parallelToolCalls / mcpTools /
        // inputTranscriptionModel / turnDetection) merge UNDER the provider voice UNDER the runtime
        // bag — the exact cascade precedence every other config entry follows (runtime wins per key).
        const sessionTuning = GetSessionTuningSettings(effectiveConfig);
        let bag: JSONObject | undefined = (catalogSettings || sessionTuning || providerVoice)
            ? (DeepMergeConfigs(catalogSettings, sessionTuning, providerVoice, input.Config as JSONObjectLike | undefined) as JSONObject)
            : input.Config;
        // Multi-agent meeting: carry the host-NEUTRAL disable-auto-response flag in the open config bag so
        // each provider translates it its own way (OpenAI → turn_detection.create_response=false) — the
        // bridge becomes the sole speech trigger. Absent ⇒ byte-for-byte the prior 1:1 behavior.
        if (input.DisableAutoResponse) {
            bag = { ...(bag ?? {}), disableAutoResponse: true } as JSONObject;
        }
        return bag;
    }

    /**
     * Assembles the companion system prompt: the framing ("you are the voice for the target"), the
     * co-agent's own system prompt text, the TARGET agent's identity/capabilities (Name +
     * Description), the conversation history, and the same memory/context a loop agent assembles.
     *
     * When the effective configuration carries a voice persona (`realtime.voice.default`), a
     * short "Voice & manner" section (tone / speaking style) is appended after the co-agent's
     * own prompt so the model speaks in the configured manner.
     *
     * @param input The prepare-session input.
     * @param coAgent The resolved co-agent.
     * @param contextUser The calling user.
     * @param provider The request-scoped metadata provider.
     * @param effectiveConfig The resolved effective configuration (voice persona source).
     * @returns The concatenated system prompt (never empty — the framing is always present).
     */
    protected async buildCompanionSystemPrompt(
        input: PrepareClientSessionInput,
        coAgent: MJAIAgentEntityExtended,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        effectiveConfig?: RealtimeCoAgentConfig,
        hasDirectTools = false
    ): Promise<string> {
        const target = this.resolveTargetAgent(input.TargetAgentID);
        const targetName = target?.Name ?? 'the configured target agent';

        // Identity framing comes from the ONE shared producer (see BuildRealtimeAgentFraming) so the agent
        // is the same agent on every host. The interactive-surface clause is host-specific (native chat's
        // browser/whiteboard); bridges pass none. Colleagues come from the effective allowed-agent union
        // (Move 4) so the lead knows who it can delegate to and how to narrate each handoff.
        const colleagues = this.buildColleaguesFromConfig(effectiveConfig, input.TargetAgentID);
        const framing = BuildRealtimeAgentFraming(targetName, this.buildInteractiveSurfaceFraming(input.ExtraTools), colleagues, hasDirectTools);

        const meetingFraming = this.buildMeetingFraming(input);
        const hostFraming = input.HostFraming?.trim() ?? '';
        const coAgentPrompt = this.getCoAgentSystemPromptText(coAgent);
        const voiceManner = BuildVoiceMannerSection(effectiveConfig);
        const targetIdentity = this.formatTargetIdentity(target);
        const appContextSection = this.buildAppContextSection(input.AppContext);
        const priorTranscript = this.formatPriorTranscript(input.PriorTranscript);
        const history = this.formatConversationHistory(input.ConversationMessages);
        const memoryContext = await this.assembleMemoryContext(input, coAgent, contextUser, provider);

        return [framing, meetingFraming, hostFraming, coAgentPrompt, voiceManner, targetIdentity, appContextSection, priorTranscript, history, memoryContext]
            .filter(part => part && part.trim().length > 0)
            .join('\n\n');
    }

    /**
     * Maps the effective config's union-accumulated `allowedAgents` into {@link RealtimeColleague}
     * entries for the framing — resolving each target's display name + description from the agent cache
     * and its effective per-target disclosure ({@link GetDisclosureForTarget}). The LEAD (the voiced
     * target) is excluded so the co-agent never lists itself as a colleague. Empty when none configured.
     *
     * @param effectiveConfig The resolved effective configuration.
     * @param excludeAgentId The lead/target agent id to exclude from the colleague list.
     * @returns The colleague set (possibly empty).
     */
    protected buildColleaguesFromConfig(
        effectiveConfig: RealtimeCoAgentConfig | undefined,
        excludeAgentId?: string
    ): RealtimeColleague[] {
        const allowed = effectiveConfig?.realtime?.allowedAgents ?? [];
        if (allowed.length === 0) {
            return [];
        }
        const colleagues: RealtimeColleague[] = [];
        for (const entry of allowed) {
            if (excludeAgentId && UUIDsEqual(entry.agentId, excludeAgentId)) {
                continue;
            }
            const agent = (AIEngine.Instance.Agents ?? []).find(a => UUIDsEqual(a.ID, entry.agentId));
            const colleague: RealtimeColleague = {
                name: entry.label ?? agent?.Name ?? entry.agentId,
                disclosure: GetDisclosureForTarget(effectiveConfig, entry.agentId),
            };
            if (agent?.Description) {
                colleague.description = agent.Description;
            }
            colleagues.push(colleague);
        }
        return colleagues;
    }

    /**
     * Builds the session-start app-context section from the {@link AppContextSnapshot}: where the user
     * is, what they see, and the live capability manifest, rendered via the shared
     * {@link FormatAppContextNote} (one wording for mint-time and streaming notes) under a clear heading.
     * Returns `''` when no snapshot was supplied or nothing salient survives.
     *
     * @param appContext The app-context snapshot, or undefined.
     * @returns The prompt section, or `''`.
     */
    protected buildAppContextSection(appContext?: AppContextSnapshot): string {
        if (!appContext) {
            return '';
        }
        const note = FormatAppContextNote(appContext);
        if (!note) {
            return '';
        }
        return (
            `CURRENT APP CONTEXT — the user's live situation in the application. THIS IS YOUR SOURCE OF TRUTH for ` +
            `where the user is and what they see — use it directly to answer "where am I" and to act in context; do ` +
            `NOT ask the user to capture a snapshot just to learn their location. When it lists available actions, ` +
            `those are the actions you can run here via 'ContextTool':\n${note}`
        );
    }

    /**
     * Builds the **meeting-mode** discipline clause — present only for a multi-agent meeting session
     * ({@link PrepareClientSessionInput.DisableAutoResponse}). It tells the agent to hear the whole
     * conversation but speak only when addressed (named) or clearly called on, and never to talk over
     * others. This is the *prompt* half of "hear always, speak selectively"; the enforcement half is the
     * model's disabled auto-response + the bridge's addressing gate. Empty for a 1:1 call (prompt unchanged).
     * See `plans/realtime/multi-agent-meeting-turn-taking.md`.
     *
     * @param input The prepare-session input (carries the meeting flag + self names).
     * @returns The meeting clause, or `''` for a non-meeting session.
     */
    protected buildMeetingFraming(input: PrepareClientSessionInput): string {
        if (!input.DisableAutoResponse) {
            return '';
        }
        const names = (input.SelfNames ?? []).map(n => n.trim()).filter(n => n.length > 0);
        const addressed = names.length > 0
            ? `You are addressed when someone says your name (${names.join(', ')}) or clearly directs a question at you.`
            : `You are addressed when someone clearly directs a question at you.`;
        return (
            `MEETING MODE: You are one of several participants (people and other agents) in a live meeting. ` +
            `LISTEN to the whole conversation, but do NOT respond to every utterance — speak only when it is your turn. ` +
            `${addressed} When you are not addressed, stay silent and keep listening; never talk over others or answer ` +
            `a question meant for someone else. Let people finish before you respond, and keep your replies brief.`
        );
    }

    /**
     * Builds the "interactive-surface tools" exception clause appended to the co-agent framing when
     * the client supplied channel tools (browser_*, Whiteboard_*, …) as ExtraTools. Without it the
     * co-agent — told to route ALL work through invoke-target-agent — delegates browser/whiteboard
     * requests to the target agent (which has no live channel of its own) instead of driving the
     * surface itself, then hallucinates a "missing session id". The tools ARE already in its set
     * ({@link buildStableToolSet} merges `[invokeTarget, ...extraTools]`); this clause tells the model
     * to USE them directly. Returns empty for pure-voice sessions (no ExtraTools), keeping that
     * framing untouched. Generic by design — it names browser_ and Whiteboard_ tools only as
     * examples, so any future client channel is covered automatically.
     *
     * @param extraTools The client-supplied channel tools, when any.
     * @returns The exception clause (leading space included), or '' when there are no extra tools.
     */
    protected buildInteractiveSurfaceFraming(extraTools?: RealtimeToolDefinition[]): string {
        if (!extraTools || extraTools.length === 0) {
            return '';
        }
        const hasContextTool = extraTools.some(t => t.Name === 'ContextTool');
        const otherSurfaces = extraTools.filter(t => t.Name !== 'ContextTool');
        let clause = '';

        if (otherSurfaces.length > 0) {
            clause += ` ONE EXCEPTION: besides '${INVOKE_TARGET_AGENT_TOOL_NAME}' you have been given ` +
                `interactive-surface tools (for example 'browser_*' to drive a LIVE web browser the user can ` +
                `watch, or 'Whiteboard_*' to draw on a shared board). Those surfaces are operated by YOU, ` +
                `directly — when the user asks to use one (e.g. "open/show a browser", "go to a site", "add ` +
                `to the whiteboard"), call the matching tool yourself immediately and narrate what you're ` +
                `doing. NEVER route an interactive-surface request through '${INVOKE_TARGET_AGENT_TOOL_NAME}', ` +
                `and never claim you lack a session — calling the tool is all that's needed.`;
        }

        if (hasContextTool) {
            clause += ` You ALSO have a 'ContextTool' that lets you ACT IN THE APPLICATION the user is currently ` +
                `in — navigate to apps and records, switch tabs/views, and run the actions available on the ` +
                `current screen. The set of actions available RIGHT NOW (their names + what they do) is given to you ` +
                `in your CURRENT APP CONTEXT and updated as the user moves around. To use one, call 'ContextTool' ` +
                `with { "action": "<action name>", "params": { ... } } — it runs in the user's browser IMMEDIATELY. ` +
                `Use 'ContextTool' YOURSELF for anything that navigates or acts in the app (e.g. "take me to ` +
                `Knowledge Hub" → ContextTool with action 'NavigateToApp'; "open this record"; "switch to the X tab"). ` +
                `Do NOT route in-app navigation/actions through '${INVOKE_TARGET_AGENT_TOOL_NAME}', and NEVER say you ` +
                `need an active session id or a screen snapshot to do them — calling 'ContextTool' is all that's ` +
                `needed. Reserve '${INVOKE_TARGET_AGENT_TOOL_NAME}' for actual analysis / data work, not navigation. ` +
                `When a channel note lists interactive channels you can use, 'ContextTool' also addresses ONE of ` +
                `them: add "target": { "channel": "<channel name>" } and use that channel's action names.`;
        }

        return clause;
    }

    /**
     * Frames the prior-leg transcript (when a session resumes via `lastSessionId`) as a clearly
     * labeled PRIOR-CONVERSATION section of the system prompt, so the model REMEMBERS the last
     * live session rather than greeting the user cold. The transport layer supplies the
     * already-capped, role-tagged lines (see {@link PrepareClientSessionInput.PriorTranscript});
     * this method only adds the framing. Empty/whitespace input yields an empty section.
     *
     * @param priorTranscript The role-tagged transcript lines, or undefined.
     * @returns The framed section, or empty string when there is nothing to frame.
     */
    private formatPriorTranscript(priorTranscript?: string): string {
        const text = priorTranscript?.trim() ?? '';
        if (text.length === 0) {
            return '';
        }
        return (
            'Earlier in this conversation (a previous live session that you are now resuming), ' +
            'you and the user discussed the following. Treat it as shared context you both remember:\n' +
            text
        );
    }

    /**
     * Resolves the target agent entity from cached metadata.
     *
     * @param targetAgentID The target agent id.
     * @returns The target agent entity, or `null` when not found.
     */
    protected resolveTargetAgent(targetAgentID: string): MJAIAgentEntityExtended | null {
        if (!targetAgentID) {
            return null;
        }
        return (AIEngine.Instance.Agents ?? []).find(a => UUIDsEqual(a.ID, targetAgentID)) ?? null;
    }

    /**
     * Reads the co-agent's own system prompt text from its highest-priority active agent prompt,
     * mirroring `BaseAgent.loadAgentConfiguration`'s child-prompt resolution.
     *
     * @param coAgent The resolved co-agent.
     * @returns The co-agent's system prompt template text, or empty string when none is configured.
     */
    protected getCoAgentSystemPromptText(coAgent: MJAIAgentEntityExtended): string {
        return this.resolveCoAgentSystemPrompt(coAgent).Text;
    }

    /**
     * Resolves the co-agent's highest-priority active system prompt, returning both its template
     * text and its prompt id. The id is surfaced so {@link PrepareClientSession} can create a linked
     * co-agent `AIPromptRun` for observability. Mirrors `BaseAgent.loadAgentConfiguration`'s
     * child-prompt resolution.
     *
     * @param coAgent The resolved co-agent.
     * @returns The prompt text + id, or `{ Text: '', PromptID: null }` when none is configured.
     */
    protected resolveCoAgentSystemPrompt(coAgent: MJAIAgentEntityExtended): CoAgentSystemPromptResolution {
        const engine = AIEngine.Instance;
        const agentPrompt = (engine.AgentPrompts ?? [])
            .filter(ap => UUIDsEqual(ap.AgentID, coAgent.ID) && ap.Status === 'Active')
            .sort((a, b) => a.ExecutionOrder - b.ExecutionOrder)[0];
        if (!agentPrompt) {
            return { Text: '', PromptID: null };
        }
        const prompt = (engine.Prompts ?? []).find(p => UUIDsEqual(p.ID, agentPrompt.PromptID));
        return { Text: prompt?.TemplateText ?? '', PromptID: prompt?.ID ?? null };
    }

    /**
     * Formats the target agent's identity + capabilities block for the system prompt.
     *
     * @param target The target agent, or `null`.
     * @returns The formatted block, or empty string when no target resolved.
     */
    private formatTargetIdentity(target: MJAIAgentEntityExtended | null): string {
        if (!target) {
            return '';
        }
        const description = target.Description?.trim() ? target.Description.trim() : 'No description provided.';
        return `Target agent you are voicing for:\nName: ${target.Name}\nCapabilities: ${description}`;
    }

    /**
     * Formats prior conversation history as a plain-text block for the system prompt.
     *
     * @param messages The conversation messages, or undefined.
     * @returns The formatted history block, or empty string when there is none.
     */
    private formatConversationHistory(messages?: ChatMessage[]): string {
        if (!messages || messages.length === 0) {
            return '';
        }
        const lines = messages
            .map(m => {
                const text = typeof m.content === 'string' ? m.content : '';
                return text.trim().length > 0 ? `${m.role}: ${text}` : '';
            })
            .filter(line => line.length > 0);
        return lines.length > 0 ? `Conversation so far:\n${lines.join('\n')}` : '';
    }

    /**
     * Assembles the same memory/context block a loop agent injects, reusing
     * {@link AgentMemoryContextBuilder} so there is no duplicated retrieval logic. The builder
     * unshifts a system message onto a throwaway array, which we pull back out as plain text.
     *
     * @param input The prepare-session input.
     * @param coAgent The resolved co-agent.
     * @param contextUser The calling user.
     * @returns The concatenated context text (empty string when nothing was injected).
     */
    protected async assembleMemoryContext(
        input: PrepareClientSessionInput,
        coAgent: MJAIAgentEntityExtended,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<string> {
        const lastUserMessage = (input.ConversationMessages ?? []).filter(m => m.role === 'user').pop();
        const inputText = typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '';
        const scratch: ChatMessage[] = [];

        // RV3 — returning-visitor memory: resolve this conversation's identity scope so the existing
        // note-injection path pulls in the recap a prior session left for this returning visitor. A
        // brand-new visitor (no resolved identity, no linked prior conversation) resolves to undefined
        // and gets no scoped memory — exactly the loop-agent behavior before returning-visitor memory.
        const scope = await this.resolveConversationMemoryScope(input.ConversationID, provider, contextUser);

        const builder = new AgentMemoryContextBuilder();
        await builder.InjectContextMemory(
            inputText,
            coAgent,
            input.UserID || contextUser?.ID,
            input.CompanyID,
            contextUser,
            scratch,
            scope?.entityId,
            scope?.recordId,
            undefined,
            null
        );

        return scratch
            .map(m => (typeof m.content === 'string' ? m.content : ''))
            .filter(c => c.length > 0)
            .join('\n\n');
    }

    /**
     * Resolves the primary-scope pair a returning visitor's memory is filed under, mirroring the
     * recap side ({@link writeReturningVisitorRecap}'s `resolveRecapScope`):
     *
     *   - linked visitor    → `(Conversation.LinkedEntityID, Conversation.LinkedRecordID)`
     *   - linked anonymous  → `(the "MJ: Conversations" entity, Conversation.LastConversationID)`
     *   - brand-new visitor → `undefined` (no scoped memory)
     *
     * Best-effort: any failure (no conversation id, load failure, entity not found) resolves to
     * `undefined` so memory injection silently falls back to unscoped behavior.
     *
     * @param conversationId the current session's conversation id, if any.
     * @param provider the request/session metadata provider (multi-provider-safe — never global Metadata).
     * @param contextUser the calling user.
     * @returns the scope pair, or undefined when this isn't a returning visitor.
     */
    protected async resolveConversationMemoryScope(
        conversationId: string | undefined,
        provider: IMetadataProvider,
        contextUser: UserInfo
    ): Promise<{ entityId: string; recordId: string } | undefined> {
        try {
            if (!conversationId) {
                return undefined;
            }
            const conversation = await provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', contextUser);
            if (!conversation || !(await conversation.Load(conversationId))) {
                return undefined;
            }
            if (conversation.LinkedEntityID && conversation.LinkedRecordID) {
                return { entityId: conversation.LinkedEntityID, recordId: conversation.LinkedRecordID };
            }
            if (conversation.LastConversationID) {
                const conversationsEntityId = provider.EntityByName('MJ: Conversations')?.ID;
                if (conversationsEntityId) {
                    return { entityId: conversationsEntityId, recordId: conversation.LastConversationID };
                }
            }
            return undefined;
        } catch (e) {
            LogError(`[RealtimeCoAgent] resolveConversationMemoryScope failed for conversation ${conversationId}: ${e instanceof Error ? e.message : String(e)}`);
            return undefined;
        }
    }

    /**
     * Builds the tool set every voice session exposes: the core `invoke-target-agent` tool plus
     * any caller-supplied extra tools or projected direct actions. The target is a runtime
     * argument *inside* the delegation call, keeping the provider delegation contract identical.
     *
     * @param extraTools Optional additional tools to register.
     * @returns The tools to register at session start.
     */
    protected buildStableToolSet(extraTools?: RealtimeToolDefinition[]): RealtimeToolDefinition[] {
        const invokeTarget: RealtimeToolDefinition = {
            Name: INVOKE_TARGET_AGENT_TOOL_NAME,
            Description: INVOKE_TARGET_AGENT_DESCRIPTION,
            ParametersSchema: {
                type: 'object',
                properties: {
                    request: {
                        type: 'string',
                        description: 'The natural-language request to hand to the target agent.'
                    },
                    agent: {
                        type: 'string',
                        description:
                            'Optional: the name of a specific colleague to hand this to (one of the colleagues ' +
                            'named in your instructions). Omit to use your own/the lead agent.'
                    }
                },
                required: ['request']
            }
        };

        const result: RealtimeToolDefinition[] = [invokeTarget];
        const seenNames = new Set<string>([INVOKE_TARGET_AGENT_TOOL_NAME.toLowerCase()]);

        if (extraTools && extraTools.length > 0) {
            for (const tool of extraTools) {
                const key = tool.Name.toLowerCase();
                if (!seenNames.has(key)) {
                    seenNames.add(key);
                    result.push(tool);
                }
            }
        }

        return result;
    }

    /** Appends the host-declared tools to a stable tool set, dropping any whose name is already taken. */
    protected appendHostTools(tools: RealtimeToolDefinition[], hostTools?: RealtimeToolDefinition[]): RealtimeToolDefinition[] {
        if (!hostTools || hostTools.length === 0) {
            return tools;
        }
        const taken = new Set(tools.map((t) => t.Name.toLowerCase()));
        const merged = [...tools];
        for (const tool of hostTools) {
            if (!taken.has(tool.Name.toLowerCase())) {
                taken.add(tool.Name.toLowerCase());
                merged.push(tool);
            }
        }
        return merged;
    }

    /**
     * Builds the {@link RealtimeToolBroker} for a relayed tool call, wiring `DelegateToTarget` to a
     * target-agent run and `ExecuteTool` to direct-action execution or a structured "not available" placeholder.
     *
     * @param input The relayed tool input.
     * @param contextUser The calling user.
     * @param provider The request-scoped metadata provider.
     * @returns The constructed broker.
     */
    protected buildToolBroker(
        input: ExecuteRelayedToolInput,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): RealtimeToolBroker {
        const deps: RealtimeToolBrokerDeps = {
            DelegateToTarget: (request) => this.delegateToTarget(input, request, contextUser, provider),
            ExecuteTool: (call) => this.executeNonTargetTool(call, input, contextUser)
        };
        return new RealtimeToolBroker(deps);
    }

    /**
     * Delegates an `invoke-target-agent` call to the target agent via {@link AgentRunner.RunAgent}.
     *
     * Threads the broker-owned abort signal (combined with any caller signal) into the child run's
     * `cancellationToken`, links the child run to the co-agent run via `parentRunID`, and propagates
     * `agentSessionID` so both runs group under the same session. Mirrors
     * `BaseAgent.delegateRealtimeToTarget`.
     *
     * @param input The relayed tool input (target id + linkage).
     * @param request The broker's delegation request (call id + arguments + abort signal).
     * @param contextUser The calling user.
     * @param provider The request-scoped metadata provider.
     * @returns The delegated result for the model's tool_response.
     */
    protected async delegateToTarget(
        input: ExecuteRelayedToolInput,
        request: DelegateToTargetRequest,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<DelegatedResult> {
        // Multi-target (Move 4): the model may name a specific colleague in the call arguments. Resolve
        // it against the session's allowed union; an unknown name yields a structured "not available"
        // result the model narrates. No name ⇒ route to the lead TargetAgentID (classic behavior).
        const requestedAgent = this.parseDelegateAgentName(request.Arguments);
        const resolution = this.resolveDelegationTarget(requestedAgent, input);
        if (!resolution.Agent) {
            return { CallID: request.CallID, Success: false, Output: resolution.Error };
        }

        try {
            const result = await this.runDelegatedAgent(input, request, resolution.Agent, contextUser, provider);
            const artifacts = await this.createDelegatedRunArtifacts(result, contextUser, provider);
            return this.buildDelegatedResult(request.CallID, result, artifacts);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { CallID: request.CallID, Success: false, Output: `Delegation failed: ${message}` };
        }
    }

    /**
     * Resolves which agent a delegation should run, given an optional colleague name the model passed.
     *
     * - **No name** → the lead {@link ExecuteRelayedToolInput.TargetAgentID} (classic single-target).
     * - **A name matching an allowed colleague** (by label, resolved agent Name, or id — case/whitespace
     *   insensitive) OR the lead's own name → that agent.
     * - **A name matching nothing in the union/lead** → an error result naming the available colleagues,
     *   so the model self-corrects conversationally rather than silently delegating to the wrong agent.
     *
     * The allowed union is an affordance/UX filter; `CanRun` on the resolved agent (inside the agent run)
     * remains the security boundary — both apply.
     *
     * @param requestedAgent The colleague name the model named, or undefined.
     * @param input The relayed tool input (lead id + allowed union).
     * @returns `{ Agent }` on success, or `{ Error }` describing why no agent resolved.
     */
    protected resolveDelegationTarget(
        requestedAgent: string | undefined,
        input: ExecuteRelayedToolInput
    ): { Agent?: MJAIAgentEntityExtended; Error: string } {
        const lead = this.resolveTargetAgent(input.TargetAgentID);
        const name = requestedAgent?.trim().toLowerCase();

        if (!name) {
            return lead
                ? { Agent: lead, Error: '' }
                : { Error: 'No target agent is configured for this voice session, so the request could not be performed.' };
        }

        // Allow naming the lead itself.
        if (lead && (lead.Name ?? '').trim().toLowerCase() === name) {
            return { Agent: lead, Error: '' };
        }

        const allowed = input.AllowedAgents ?? [];
        const match = allowed.find(a => {
            if ((a.label ?? '').trim().toLowerCase() === name) {
                return true;
            }
            if (a.agentId.trim().toLowerCase() === name) {
                return true;
            }
            const resolvedName = this.resolveTargetAgent(a.agentId)?.Name ?? '';
            return resolvedName.trim().toLowerCase() === name;
        });
        if (match) {
            const agent = this.resolveTargetAgent(match.agentId);
            if (agent) {
                return { Agent: agent, Error: '' };
            }
        }

        return {
            Error:
                `"${requestedAgent}" isn't a colleague available in this session. ` +
                `Available: ${this.describeAvailableColleagues(input) || '(none — handle it yourself or via the lead agent)'}.`,
        };
    }

    /** Comma-joined display names of the session's allowed colleagues (labels preferred), for error guidance. */
    protected describeAvailableColleagues(input: ExecuteRelayedToolInput): string {
        return (input.AllowedAgents ?? [])
            .map(a => a.label ?? this.resolveTargetAgent(a.agentId)?.Name ?? a.agentId)
            .join(', ');
    }

    /** Parses the optional `agent` (colleague name) from an `invoke-target-agent` call's arguments JSON. */
    private parseDelegateAgentName(argumentsJson: string): string | undefined {
        try {
            const parsed = JSON.parse(argumentsJson) as { agent?: unknown };
            if (typeof parsed.agent === 'string' && parsed.agent.trim().length > 0) {
                return parsed.agent.trim();
            }
        } catch {
            /* not JSON — no named agent */
        }
        return undefined;
    }

    /**
     * Creates artifact(s) from a completed delegated run's payload — the voice-path equivalent of
     * the chat path's artifact step in `AgentRunner.RunAgentInConversation`. Delegated voice runs
     * execute via `AgentRunner.RunAgent` directly (no conversation detail), so without this step
     * they would never produce artifacts at all.
     *
     * Eligibility guards (all must hold, mirroring the chat path's `processArtifacts`):
     *  - the run succeeded and did NOT pause awaiting feedback (a paused run has no deliverable yet);
     *  - the run returned a non-empty payload.
     *
     * The DB work is delegated to {@link processRunArtifacts} (an overridable seam), which reuses
     * `AgentRunner.ProcessAgentArtifacts` — so ArtifactCreationMode, DefaultArtifactTypeID,
     * name extraction, and duplicate-version dedup all behave exactly as in chat. **Best-effort:**
     * any failure is logged and returns `undefined`; artifact surfacing never fails the delegation.
     *
     * @param result The delegated agent execution result.
     * @param contextUser The calling user.
     * @param provider The request-scoped metadata provider.
     * @returns The produced artifact descriptor(s), or `undefined` when none were created.
     */
    protected async createDelegatedRunArtifacts(
        result: ExecuteAgentResult,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<DelegatedRunArtifact[] | undefined> {
        const paused = result.agentRun?.Status === 'AwaitingFeedback';
        const payload = result.payload as Record<string, unknown> | null | undefined;
        const hasPayload = payload != null && Object.keys(payload).length > 0;
        if (!result.success || paused || !hasPayload) {
            return undefined;
        }
        try {
            return await this.processRunArtifacts(result, contextUser, provider);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`RealtimeClientSessionService.createDelegatedRunArtifacts failed (delegation continues): ${message}`);
            return undefined;
        }
    }

    /**
     * The DB-backed artifact-creation seam: runs `AgentRunner.ProcessAgentArtifacts` WITHOUT a
     * conversation detail (the voice path has none — the artifact + version are created and the
     * junction link is skipped), then loads the artifact header for its display name.
     *
     * Artifacts whose Visibility resolved to `System Only` (the agent's ArtifactCreationMode) are
     * created but NOT surfaced to the overlay — matching how chat hides them from users.
     *
     * **Overridable seam** so tests can exercise {@link createDelegatedRunArtifacts}' eligibility
     * guards without a DB.
     *
     * @param result The delegated agent execution result (payload + agentRun).
     * @param contextUser The calling user.
     * @param provider The request-scoped metadata provider.
     * @returns The produced artifact descriptor(s), or `undefined`.
     */
    protected async processRunArtifacts(
        result: ExecuteAgentResult,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<DelegatedRunArtifact[] | undefined> {
        const runner = new AgentRunner(provider);
        const info = await runner.ProcessAgentArtifacts(result, undefined, undefined, contextUser, provider);
        if (!info) {
            return undefined;
        }
        const artifact = await provider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', contextUser);
        if (!(await artifact.Load(info.artifactId))) {
            return undefined;
        }
        if (artifact.Visibility === 'System Only') {
            return undefined; // created for system purposes, never user-surfaced
        }
        return [{ ArtifactID: info.artifactId, ArtifactVersionID: info.versionId, Name: artifact.Name }];
    }

    /**
     * Runs (or resumes) the target agent for a delegation. Threads the combined abort signal, parent
     * run linkage, session id, and the `OnProgress` callback so the resolver can stream progress.
     * When {@link ExecuteRelayedToolInput.ResumeRunID} is set, resumes that paused run via
     * `lastRunId` + `autoPopulateLastRunPayload` (the user's answer continues the same interactive
     * run) instead of starting fresh.
     *
     * @param input The relayed tool input (linkage, progress callback, optional resume id).
     * @param request The broker's delegation request (call id + arguments + abort signal).
     * @param target The resolved target agent.
     * @param contextUser The calling user.
     * @param provider The request-scoped metadata provider.
     * @returns The agent execution result.
     */
    private async runDelegatedAgent(
        input: ExecuteRelayedToolInput,
        request: DelegateToTargetRequest,
        target: MJAIAgentEntityExtended,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<ExecuteAgentResult> {
        const requestText = this.parseDelegateRequestText(request.Arguments);
        const parentRun = await this.loadParentRun(input.ParentRunID, contextUser, provider);
        const runner = new AgentRunner(provider);
        return runner.RunAgent({
            agent: target,
            conversationMessages: [{ role: 'user', content: requestText }],
            contextUser,
            // Attribution and context-memory scope follow the PERSON, not the executing principal —
            // see `ExecuteRelayedToolInput.AttributionUserID`. Undefined ⇒ base-agent falls back to
            // `contextUser.ID`, preserving today's behavior for every non-elevated caller.
            userId: input.AttributionUserID,
            provider,
            cancellationToken: this.combineSignals(request.AbortSignal, input.AbortSignal),
            parentRun: parentRun ?? undefined,
            agentSessionID: input.AgentSessionID,
            onProgress: input.OnProgress,
            lastRunId: input.ResumeRunID,
            autoPopulateLastRunPayload: input.ResumeRunID ? true : undefined
        });
    }

    /**
     * Maps an {@link ExecuteAgentResult} onto the broker's {@link DelegatedResult}, special-casing a
     * run that paused awaiting feedback. An `AwaitingFeedback` run is a valid intermediate outcome,
     * not an error: we return its clarifying QUESTION (the run's `Message`) as the tool Output —
     * phrased so the realtime model relays it as a question to the user — set `Success: true`, and
     * surface the paused run id so the resolver can resume that run on the user's next answer.
     *
     * @param callID The provider call id this result corresponds to.
     * @param result The agent execution result.
     * @param artifacts Artifacts the run produced (from {@link createDelegatedRunArtifacts}),
     *   threaded into the result so the broker serializes them for the call overlay.
     * @returns The delegated result for the model's tool_response.
     */
    private buildDelegatedResult(callID: string, result: ExecuteAgentResult, artifacts?: DelegatedRunArtifact[]): DelegatedResult {
        if (result.agentRun?.Status === 'AwaitingFeedback') {
            const question = result.agentRun.Message?.trim()
                || 'The target agent needs more information to continue.';
            return {
                CallID: callID,
                Success: true,
                Output: `You need an answer from the user before you can continue this work. Ask them, in your own first-person voice: ${question}`,
                PausedRunID: result.agentRun.ID,
                RunID: result.agentRun.ID
            };
        }
        return {
            CallID: callID,
            Success: result.success,
            Output: result.success
                ? (result.agentRun?.Message || 'The delegated work is complete. Share the outcome with the user in your own first-person voice.')
                : (result.agentRun?.ErrorMessage || 'The work could not be completed. Tell the user, in first person, that you hit a problem and offer a next step.'),
            RunID: result.agentRun?.ID,
            Artifacts: artifacts
        };
    }

    /**
     * Loads the co-agent run entity behind {@link ExecuteRelayedToolInput.ParentRunID} so the
     * delegated run can link to it via `parentRun` (→ `ParentRunID`). Returns `null` when no id was
     * supplied or the run cannot be loaded (delegation proceeds without parent linkage rather than
     * failing the whole call).
     *
     * @param parentRunID The co-agent run id, or undefined.
     * @param contextUser The calling user.
     * @param provider The request-scoped metadata provider.
     * @returns The loaded parent run entity, or `null`.
     */
    protected async loadParentRun(
        parentRunID: string | undefined,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<MJAIAgentRunEntityExtended | null> {
        if (!parentRunID) {
            return null;
        }
        const run = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', contextUser);
        return (await run.Load(parentRunID)) ? run : null;
    }

    /**
     * Inspects whether the resolved realtime driver class supports dynamic tool registration.
     * Dynamic tool sets (e.g. per-agent direct action projection) are registered on the provider
     * socket only when the driver explicitly declares `SupportsDynamicToolSet === true`.
     *
     * @param driverClass The vendor's DriverClass (the ClassFactory key).
     * @returns True if the driver supports dynamic tool sets, false otherwise.
     */
    protected driverSupportsDynamicToolSet(driverClass?: string): boolean {
        if (!driverClass) {
            return false;
        }
        const reg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseRealtimeModel, driverClass);
        const subClass = reg?.SubClass as typeof BaseRealtimeModel | undefined;
        return subClass?.SupportsDynamicToolSet === true;
    }

    /**
     * Resolves the active database actions assigned to the target agent.
     * **Overridable seam** for tests to provide mock action sets without an engine cache.
     *
     * @param targetAgentID The target agent ID.
     * @returns The active action entities assigned to the agent.
     */
    protected getTargetAgentActions(targetAgentID: string): MJActionEntityExtended[] {
        const agentActions = (AIEngine.Instance.AgentActions ?? []).filter(
            aa => UUIDsEqual(aa.AgentID, targetAgentID) && aa.Status === 'Active'
        );
        return (ActionEngineServer.Instance.Actions ?? []).filter(a =>
            agentActions.some(aa => UUIDsEqual(aa.ActionID, a.ID)) && a.Status === 'Active'
        );
    }

    /**
     * Builds the projected direct action tool definitions for a target agent if supported by the driver.
     * Gated by driver capability (`SupportsDynamicToolSet`) and explicit configuration opt-in
     * (`Configuration.realtime.directActions.enabled = true`).
     *
     * @param targetAgentID The target agent ID being voiced.
     * @param effectiveConfig The resolved effective configuration.
     * @param driverClass The resolved vendor's DriverClass.
     * @returns The array of projected direct action tools (empty if unsupported or disabled).
     */
    public BuildDirectActionTools(
        targetAgentID: string | undefined,
        effectiveConfig?: RealtimeCoAgentConfig,
        driverClass?: string,
        agentSessionID?: string
    ): RealtimeToolDefinition[] {
        if (!targetAgentID || !this.driverSupportsDynamicToolSet(driverClass)) {
            return [];
        }

        const directConfig = GetDirectActionsConfig(effectiveConfig);
        if (!directConfig || !directConfig.enabled) {
            return [];
        }

        const candidateActions = this.getTargetAgentActions(targetAgentID);
        const allowedActions = candidateActions.filter(action =>
            IsActionAllowedForDirectInvocation(action.Name, directConfig)
        );

        const wireMap = this.BuildWireActionMap(allowedActions);
        if (agentSessionID) {
            this.sessionWireActionMaps.Set(agentSessionID, wireMap);
            if (directConfig) {
                this.sessionDirectConfigs.Set(agentSessionID, directConfig);
            }
        }
        this.targetWireActionMaps.Set(targetAgentID, wireMap);

        const tools: RealtimeToolDefinition[] = [];
        for (const [wireName, action] of wireMap.entries()) {
            tools.push(this.mapActionToToolDefinition(action, wireName));
        }
        return tools;
    }

    /** @deprecated Use {@link BuildDirectActionTools}. */
    public buildDirectActionTools(
        targetAgentID: string | undefined,
        effectiveConfig?: RealtimeCoAgentConfig,
        driverClass?: string,
        agentSessionID?: string
    ): RealtimeToolDefinition[] {
        return this.BuildDirectActionTools(targetAgentID, effectiveConfig, driverClass, agentSessionID);
    }

    /**
     * Maps an action entity and its metadata parameters to a RealtimeToolDefinition.
     *
     * @param action The action entity to map.
     * @param wireName Optional pre-sanitized wire name. If omitted, derives via {@link SanitizeWireToolName}.
     * @returns The constructed tool definition.
     */
    protected mapActionToToolDefinition(action: MJActionEntityExtended, wireName?: string): RealtimeToolDefinition {
        const rawParams: readonly MJActionParamEntity[] = (action.Params?.Items && action.Params.Items.length > 0)
            ? action.Params.Items
            : (ActionEngineServer.Instance.ActionParams ?? []).filter(p => UUIDsEqual(p.ActionID, action.ID));

        const inputParams = rawParams.filter(p => {
            const dir = (p.Type ?? 'Input').trim().toLowerCase();
            return dir === 'input' || dir === 'both';
        });

        const properties: Record<string, JSONObject> = {};
        const required: string[] = [];

        for (const p of inputParams) {
            let schemaType: string = 'string';
            if (p.IsArray) {
                schemaType = 'array';
            } else if (p.ValueType === 'Simple Object' || p.ValueType === 'BaseEntity Sub-Class') {
                schemaType = 'object';
            }
            const propSchema: JSONObject = {
                type: schemaType,
                description: p.Description || p.Name
            };
            properties[p.Name] = propSchema;
            if (p.IsRequired) {
                required.push(p.Name);
            }
        }

        const parametersSchema: JSONObject = {
            type: 'object',
            properties: properties as JSONObject,
            ...(required.length > 0 ? { required } : {})
        };

        return {
            Name: wireName ?? SanitizeWireToolName(action.Name),
            Description: action.Description || `Execute the ${action.Name} action.`,
            ParametersSchema: parametersSchema
        };
    }

    /**
     * Routes a non-target tool call by resolving the action through the wire map, checking the
     * direct-actions allowlist, and executing via `ActionEngineServer.Instance.RunAction` under a
     * configured timeout. If the tool is unrecognized, disallowed, or target resolution fails,
     * returns a structured "not available" result.
     *
     * @param call The non-target tool call.
     * @param input The optional relayed tool input context.
     * @param contextUser The calling user context.
     * @returns A {@link ToolExecutionResult} for the model's tool_response.
     */
    protected async executeNonTargetTool(
        call: RealtimeToolCall,
        input?: ExecuteRelayedToolInput,
        contextUser?: UserInfo
    ): Promise<ToolExecutionResult> {
        if (!input?.TargetAgentID) {
            return {
                CallID: call.CallID,
                Success: false,
                Output: `Tool '${call.ToolName}' is not available in this voice session.`
            };
        }

        const target = this.resolveTargetAgent(input.TargetAgentID);
        if (!target) {
            return {
                CallID: call.CallID,
                Success: false,
                Output: `Target agent is not available to execute '${call.ToolName}'.`
            };
        }

        const candidateActions = this.getTargetAgentActions(target.ID);
        const candidateWireMap = this.BuildWireActionMap(candidateActions);
        const action = (input?.AgentSessionID ? this.sessionWireActionMaps.Get(input.AgentSessionID)?.get(call.ToolName) : undefined)
            ?? candidateWireMap.get(call.ToolName)
            ?? Array.from(candidateWireMap.entries()).find(([w]) => w.toLowerCase() === call.ToolName.trim().toLowerCase())?.[1];

        if (!action) {
            return {
                CallID: call.CallID,
                Success: false,
                Output: `Tool '${call.ToolName}' is not available to this agent.`
            };
        }

        const directConfig = input?.DirectActions
            ?? (input?.AgentSessionID ? this.sessionDirectConfigs.Get(input.AgentSessionID) : undefined)
            ?? GetDirectActionsConfig(this.resolveEffectiveConfig(target, undefined, target));

        if (!IsActionAllowedForDirectInvocation(action.Name, directConfig)) {
            return {
                CallID: call.CallID,
                Success: false,
                Output: `Action '${action.Name}' is not enabled for direct voice invocation.`
            };
        }

        if (!contextUser) {
            return {
                CallID: call.CallID,
                Success: false,
                Output: `Execution of action '${action.Name}' refused: authenticated user context is required.`
            };
        }

        const timeoutMs = directConfig?.timeoutMs ?? 10_000;
        const executingUser = contextUser;

        try {
            const rawParams = this.parseActionParams(call.Arguments);
            const actionParams: ActionParam[] = Object.entries(rawParams).map(([name, value]) => ({
                Name: name,
                Value: value,
                Type: 'Input'
            }));

            const runParams = new RunActionParams();
            runParams.Action = action;
            runParams.ContextUser = executingUser;
            runParams.Params = actionParams;
            runParams.Filters = [];

            let timerHandle: ReturnType<typeof setTimeout> | undefined;
            const timeoutPromise = new Promise<never>((_, reject) => {
                timerHandle = setTimeout(() => {
                    reject(new Error(`Action '${action.Name}' execution timed out after ${timeoutMs}ms`));
                }, timeoutMs);
                if (typeof timerHandle.unref === 'function') {
                    timerHandle.unref();
                }
            });

            const result = await Promise.race([
                ActionEngineServer.Instance.RunAction(runParams),
                timeoutPromise
            ]).finally(() => {
                if (timerHandle) {
                    clearTimeout(timerHandle);
                }
            });

            const outputText = result.Message || (result.Success ? 'Action completed successfully.' : 'Action failed.');

            return {
                CallID: call.CallID,
                Success: result.Success,
                Output: outputText
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                CallID: call.CallID,
                Success: false,
                Output: `Action '${action.Name}' failed: ${message}`
            };
        }
    }

    /**
     * Parses JSON arguments string into a key-value record of parameters.
     * Distinguishes "no arguments" (valid for zero-param action) from "unparseable JSON".
     *
     * @param argumentsJson The raw arguments string emitted by the model.
     * @returns The parsed arguments record.
     * @throws ToolArgumentsError with actionable message when arguments are present but unparseable.
     */
    protected parseActionParams(argumentsJson?: string): Record<string, unknown> {
        if (!argumentsJson || argumentsJson.trim() === '') {
            return {};
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(argumentsJson);
        } catch (err) {
            const syntaxMsg = err instanceof Error ? err.message : String(err);
            throw new ToolArgumentsError(`Unparseable JSON arguments: ${syntaxMsg}. Please provide valid JSON formatted arguments.`);
        }
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
        throw new ToolArgumentsError(`Tool arguments must be a JSON object, but received ${Array.isArray(parsed) ? 'an array' : typeof parsed}. Please format arguments as a JSON object.`);
    }

    /**
     * Parses the natural-language request text out of an `invoke-target-agent` call's arguments.
     * Falls back to the raw argument string when it is not the expected `{ request: string }` JSON.
     *
     * @param argumentsJson The raw arguments string emitted by the model.
     * @returns The request text to hand to the target agent.
     */
    private parseDelegateRequestText(argumentsJson: string): string {
        try {
            const parsed = JSON.parse(argumentsJson) as { request?: unknown };
            if (typeof parsed.request === 'string') {
                return parsed.request;
            }
        } catch {
            /* not JSON — fall through to raw */
        }
        return argumentsJson;
    }

    /**
     * Combines the broker's per-call abort signal with an optional caller-supplied signal so either
     * source can cancel the delegated run. Returns the broker signal alone when no caller signal is
     * present (the common case), avoiding an unnecessary controller.
     *
     * @param brokerSignal The broker-owned per-call abort signal (always present).
     * @param callerSignal An optional caller signal (e.g. a request-scoped barge-in).
     * @returns A single abort signal that fires when either source aborts.
     */
    private combineSignals(brokerSignal: AbortSignal, callerSignal?: AbortSignal): AbortSignal {
        if (!callerSignal) {
            return brokerSignal;
        }
        const controller = new AbortController();
        const abort = () => controller.abort();
        if (brokerSignal.aborted || callerSignal.aborted) {
            controller.abort();
        } else {
            brokerSignal.addEventListener('abort', abort, { once: true });
            callerSignal.addEventListener('abort', abort, { once: true });
        }
        return controller.signal;
    }

    /**
     * The clear, actionable message returned when no usable Realtime model can be resolved.
     *
     * @returns The failure message.
     */
    private noModelMessage(): string {
        return (
            'No usable Realtime model could be resolved for the Realtime Co-Agent. Configure a model of ' +
            "AIModelType 'Realtime' with an active vendor DriverClass and a valid API key " +
            '(e.g. AI_VENDOR_API_KEY__<driver>).'
        );
    }
}
