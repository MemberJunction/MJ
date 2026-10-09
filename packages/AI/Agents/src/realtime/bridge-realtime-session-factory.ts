/**
 * @fileoverview `CreateBridgeRealtimeSession` — the **provider-agnostic** server-side factory that turns an
 * agent reference into a live {@link IRealtimeSession} for a Realtime Bridge. Given an agent id (or name)
 * + a context user + a metadata provider, it:
 *   1. resolves the `MJ: AI Agents` entity from the {@link AIEngine} cache,
 *   2. instantiates the correct {@link BaseAgent} subclass via the `ClassFactory` (the same path
 *      `AgentRunner` uses), and
 *   3. calls {@link BaseAgent.StartBridgeRealtimeSession} to open the raw model session.
 *
 * This is the seam every bridge needs — `LiveKitAgentRoomCoordinator.SetSessionFactory`, and the
 * (forthcoming) Teams/Zoom harnesses, all bind THIS one function. It deliberately lives in
 * `@memberjunction/ai-agents` (which owns the agent + realtime-model lifecycle) and depends on NO bridge
 * package, so a bridge package never has to reach back into the agent runtime — the consumer binds the
 * factory at startup instead.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import { IRealtimeSession, ChatMessage, BaseRealtimeModel, RealtimeVoiceOption, RealtimeToolDefinition, AIAPIKeyResolver, MakeAIAPIKeyResolver } from '@memberjunction/ai';
import { IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { MJGlobal, UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import type { ResolvedModelPersona } from '@memberjunction/ai-engine-base';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { BaseAgent } from '../base-agent';
import { RealtimeClientSessionService, RealtimeHostToolsResolver } from './realtime-client-session-service';
import { SelectRealtimeVendorForModel } from './realtime-vendor-resolution';

/**
 * The context a bridge passes to {@link CreateBridgeRealtimeSession}. Structurally compatible with the
 * LiveKit coordinator's `RealtimeSessionStartContext` (and any future bridge's equivalent) so this factory
 * can be bound directly via `SetSessionFactory(...)` without the consumer adapting shapes.
 */
export interface BridgeRealtimeSessionContext {
    /** The agent to voice, by id (preferred). */
    AgentID?: string;
    /** The agent to voice, by name (fallback when no id). */
    AgentName?: string;
    /**
     * The TARGET agent the co-agent voices — the one the user is actually "calling". The Realtime
     * Co-Agent is a voice front-end that delegates to this agent via `invoke-target-agent`; without a
     * target it has nobody to speak for and stays idle. Flows to `params.data.targetAgentID`.
     */
    TargetAgentID?: string;
    /** The transport endpoint being joined (room/meeting/number) — informational here; not required. */
    RoomName?: string;
    /**
     * Optional per-session Realtime MODEL override (an `MJ: AI Models` Name or ID) — a dev choosing a
     * specific realtime model for THIS agent in the room. Wins over the co-agent config's modelPreference.
     */
    RealtimeModelID?: string;
    /**
     * Optional per-session VOICE override (a provider-native voice id, e.g. OpenAI `echo`/`shimmer`) — how
     * two agents in the same room are given distinct voices. Replaces the config's per-provider voice.
     */
    RealtimeVoice?: string;
    /** The user the session runs as (scopes memory + DB ops). */
    ContextUser?: UserInfo;
    /** The request-scoped metadata provider (multi-provider safe). Falls back to the global default. */
    MetadataProvider?: IMetadataProvider;
    /**
     * The `MJ: AI Agent Sessions` id this bridge belongs to. Threaded into the co-agent observability run so
     * the voice session's runs (and the target-agent runs delegated under it) group under the same session —
     * **identically to the native-chat surface**. Without it the co-agent run can't record its session.
     */
    AgentSessionID?: string;
    /**
     * **Multi-agent meeting mode.** Set `true` when the agent joins a room that already has other agents,
     * so it disables blind auto-response and speaks only when addressed (the room coordinator decides this).
     * Flows to `params.data.realtimeMeetingMode`. See `plans/realtime/multi-agent-meeting-turn-taking.md`.
     */
    MeetingMode?: boolean;
    /** The names the agent answers to (display name + aliases) — phrasing for the meeting prompt only. */
    SelfNames?: string[];
    /**
     * Tools the host declares and executes itself (a phone call's `transfer_call` / `send_dtmf` / `end_call`).
     * Added to the model's tool set; executed through the runtime's local tool handler
     * (see `GetBridgeRealtimeRuntime`).
     */
    HostTools?: RealtimeToolDefinition[];
    /**
     * Optional callback that allows the host to resolve host tools dynamically based on
     * the model, vendor, and driver actually resolved for the session, before session opening.
     */
    ResolveHostTools?: RealtimeHostToolsResolver;
    /** Host-authored instructions appended to the system prompt (e.g. the phone-call and caller framing). */
    HostFraming?: string;
    /**
     * Role-tagged transcript lines (`User: …` / `Assistant: …`) of the conversation so far, framed into the
     * prompt as "earlier in this conversation". Set when a lost model session is re-opened mid-call so the new
     * session remembers what was said.
     */
    PriorTranscript?: string;
    /** Earlier turns to seed the model's context. Defaults to none (a fresh call has no history). */
    ConversationMessages?: ChatMessage[];
    /** The `MJ: Conversations` row the session writes to — stamped on the co-agent observability run. */
    ConversationID?: string;
}

/**
 * Opens a raw {@link IRealtimeSession} for the agent named in `ctx`. Bind this onto a bridge's
 * session-factory seam (e.g. `LiveKitAgentRoomCoordinator.Instance.SetSessionFactory(CreateBridgeRealtimeSession)`).
 *
 * @param ctx The bridge session context (agent id/name + user + provider).
 * @returns The live realtime session to hand to `AIBridgeEngine.StartBridgeSession`.
 * @throws When the agent can't be resolved, names a DriverClass no BaseAgent subclass is registered for, or no
 *   usable Realtime model is configured (surfaced from {@link BaseAgent.StartBridgeRealtimeSession}).
 */
export async function CreateBridgeRealtimeSession(ctx: BridgeRealtimeSessionContext): Promise<IRealtimeSession> {
    const provider = ctx.MetadataProvider ?? Metadata.Provider;
    await AIEngine.Instance.Config(false, ctx.ContextUser, provider);

    const agent = resolveAgentEntity(ctx);
    if (!agent) {
        throw new Error(
            `CreateBridgeRealtimeSession: no agent found for AgentID='${ctx.AgentID ?? ''}' / ` +
                `AgentName='${ctx.AgentName ?? ''}'. Ensure the agent exists and the engine is configured.`,
        );
    }

    // Instantiate the agent's own BaseAgent subclass — or the plain BaseAgent when it declares none.
    //
    // ── WHY NOT `agentType.DriverClass` AS A FALLBACK (#4111) ──
    //
    // `AIAgentType.DriverClass` names a **BaseAgentType** subclass — the three shipped values are
    // `LoopAgentType`, `FlowAgentType`, `RealtimeAgentType`. The key needed here is a **BaseAgent**
    // one. Different ClassFactory registries, matched by exact key against the base class NAME, so
    // the type's key resolved nothing here — ever. Dead code that looked alive.
    //
    // What that produced is worth stating precisely, because the wrong story invites the wrong fix:
    // with no registration and no `@RequiresSubclass` marker, `resolveAndInstantiate` returns
    // `new BaseClassConstructor(...)` — a plain `BaseAgent`. So every such seat silently ran the
    // BASE implementation, dropping whatever subclass behaviour it was configured for. It did not
    // run some other agent's class. The only signal was one `console.warn` from
    // `reportResolutionFailure`, deduped per base+key and capped at 3 per base: effectively
    // invisible in a busy log, which is the whole problem.
    //
    // A NULL key is the path that really does hand back somebody else's agent —
    // `GetAllRegistrations` skips the key filter entirely for null, so the highest-priority
    // registered `BaseAgent` subclass wins. That is why the else-branch below constructs
    // `new BaseAgent()` directly instead of calling `CreateInstance(BaseAgent, null)`.
    //
    // Most agents declare no `DriverClass` at all and are meant to run on the base implementation
    // (that is what makes them data rather than code), so an absent one is NOT an error — it is the
    // common case, and the old throw was unreachable only because the wrong-registry lookup always
    // produced a truthy key.
    //
    // Dropping the type fallback loses nothing: agent-type behaviour is resolved separately inside
    // `BaseAgent` via `BaseAgentType.GetAgentTypeInstance`, so a seat on the plain `BaseAgent` still
    // gets Loop/Realtime type semantics.
    // Trimmed like every other externally-sourced string in this file (`RealtimeVoice`,
    // `RealtimeModelID`, `AgentSessionID`): a whitespace-only value is a truthy key that would
    // otherwise reach the ClassFactory and fail with a confusing quoted-blank message.
    const driverClass = agent.DriverClass?.trim() || undefined;
    let instance: BaseAgent | null;
    if (driverClass) {
        // `TryCreateInstance`, not `CreateInstance`: an unresolvable key must be an error here rather
        // than a hollow anchor-base object that answers plausibly and wrongly.
        const resolution = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseAgent>(BaseAgent, driverClass);
        instance = resolution.Resolved ? resolution.Instance : null;
        if (!instance) {
            throw new Error(
                `CreateBridgeRealtimeSession: no BaseAgent subclass is registered as '${driverClass}' ` +
                    `(agent '${agent.Name}'). Refusing the base-class fallback: it would run a different ` +
                    `agent than the one configured, in this agent's voice.`,
            );
        }
    } else {
        // `new BaseAgent()` and NOT `CreateInstance(BaseAgent, null)`: a null key makes
        // `GetAllRegistrations` skip the key filter, so the factory would return the
        // highest-priority registered subclass — an arbitrary agent. Direct construction is the only
        // form that reliably yields the base implementation.
        instance = new BaseAgent();
    }

    return instance.StartBridgeRealtimeSession({
        agent,
        contextUser: ctx.ContextUser,
        provider,
        // A fresh bridge session starts with no prior turns; memory context degrades gracefully to empty. A
        // re-opened session (model-drop recovery) is given what was said so far via PriorTranscript instead.
        conversationMessages: ctx.ConversationMessages ?? ([] as ChatMessage[]),
        // Realtime extras ride params.data: the TARGET agent the co-agent voices via `invoke-target-agent`
        // (without it the co-agent stays idle), plus optional per-session dev overrides for the model/voice
        // so two agents in the same room can sound distinct. Omitted keys are simply absent.
        data: buildRealtimeData(ctx),
    });
}

/**
 * Builds the `params.data` bag from the bridge context — the realtime extras BaseAgent reads at session
 * start. Returns `undefined` when nothing is set so the param stays cleanly absent.
 */
function buildRealtimeData(ctx: BridgeRealtimeSessionContext): Record<string, unknown> | undefined {
    const data: Record<string, unknown> = {};
    if (ctx.TargetAgentID) {
        data.targetAgentID = ctx.TargetAgentID;
    }
    if (ctx.AgentSessionID && ctx.AgentSessionID.trim().length > 0) {
        // Drives the co-agent observability run's session grouping (see WireBridgeRealtimeSession).
        data.agentSessionId = ctx.AgentSessionID.trim();
    }
    if (ctx.RealtimeModelID && ctx.RealtimeModelID.trim().length > 0) {
        data.realtimeModelID = ctx.RealtimeModelID.trim();
    }
    if (ctx.RealtimeVoice && ctx.RealtimeVoice.trim().length > 0) {
        data.realtimeVoice = ctx.RealtimeVoice.trim();
    }
    if (ctx.MeetingMode === true) {
        data.realtimeMeetingMode = true;
    }
    if (ctx.HostTools && ctx.HostTools.length > 0) {
        data.realtimeHostTools = ctx.HostTools;
    }
    if (ctx.ResolveHostTools) {
        data.resolveHostTools = ctx.ResolveHostTools;
    }
    if (ctx.HostFraming && ctx.HostFraming.trim().length > 0) {
        data.realtimeHostFraming = ctx.HostFraming.trim();
    }
    if (ctx.PriorTranscript && ctx.PriorTranscript.trim().length > 0) {
        data.realtimePriorTranscript = ctx.PriorTranscript.trim();
    }
    if (ctx.ConversationID && ctx.ConversationID.trim().length > 0) {
        data.conversationId = ctx.ConversationID.trim();
    }
    if (ctx.SelfNames && ctx.SelfNames.length > 0) {
        data.realtimeSelfNames = ctx.SelfNames;
    }
    return Object.keys(data).length > 0 ? data : undefined;
}

/**
 * The bridge-engine session-run finalizer (matches `BridgeSessionRunFinalizer` in
 * `@memberjunction/ai-bridge-server`). Bind this onto `AIBridgeEngine.SetSessionRunFinalizer(...)` at
 * startup so a bridge reaped WITHOUT a live session (a prior-boot orphan, a cross-host teardown) still
 * finalizes its co-agent observability run — the only path where the `Close()`-wrapped finalizer can't run.
 * Lives here (in ai-agents, which owns the realtime runtime) so the engine stays decoupled from it.
 *
 * @param agentSessionID The reaped session's id.
 * @param success Whether to mark the run(s) `Completed` (true) or `Failed` (false).
 * @param contextUser The user the writes run as (required — skipped without it).
 * @param provider The metadata provider (required — skipped without it).
 */
export async function FinalizeBridgeCoAgentRuns(
    agentSessionID: string,
    success: boolean,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
): Promise<void> {
    if (!contextUser || !provider) {
        return; // a server-side finalize needs a user + provider; a later reap with context catches it
    }
    await new RealtimeClientSessionService().FinalizeCoAgentRunsBySession(agentSessionID, success, contextUser, provider);
}

/**
 * A voice the dev model/voice picker offers: one per persona, or one per voice only the driver declares. Two personas can
 * share a voice `ID` (a voice, and the same voice with a face), so {@link PersonaID} tells them apart. A persona voice also
 * carries the avatar that comes with it and the persona's preview image; a voice only the driver declares carries none of
 * the three.
 */
export interface RealtimeModelVoiceOption extends RealtimeVoiceOption {
    /** The persona this voice belongs to (`MJ: AI Personas.ID`). Absent for a voice only the driver declares. */
    PersonaID?: string;
    /**
     * The avatar that comes with this voice: the `APIName` of the persona's preset Video binding on the model's vendor,
     * which is what `realtime.video.avatarId` takes. Absent when the persona has no such binding there, or only a custom
     * one (custom avatars are not supported).
     */
    AvatarID?: string;
    /** The persona's preview image (`MJ: AI Personas.PreviewImageURL`), when it has one. */
    PreviewImageURL?: string;
}

/** An active Realtime model paired with the voices its driver supports — for the dev model/voice picker. */
export interface RealtimeModelVoices {
    /** The `MJ: AI Models` row id. */
    ModelID: string;
    /** The model's display name. */
    ModelName: string;
    /** The model's persona voices on its vendor, then the driver's other voices (empty when there are none). */
    Voices: RealtimeModelVoiceOption[];
}

/**
 * Enumerates the active Realtime models with each driver's supported voices — the source for the dev
 * model/voice picker. Only models with an Active vendor + resolvable API key + ClassFactory driver are
 * returned (a model you can't actually run isn't worth offering). Voices come from the driver
 * ({@link BaseRealtimeModel.SupportedVoices}) — the near-term, driver-owned source of truth.
 * A persona voice whose persona also has a preset Video binding on the same vendor names that avatar
 * ({@link RealtimeModelVoiceOption.AvatarID}); driver voices never do. A persona with a face doesn't
 * stand in for its plain voice, so the plain voice is listed too.
 *
 * @param contextUser The user the engine config runs as (server-side).
 * @param provider The request-scoped metadata provider (multi-provider safe).
 * @param resolveAPIKey Key-resolution seam deciding which vendors count as runnable. Defaults to the
 *   platform lookup (`AI_VENDOR_API_KEY__<driver>`); the voice-picker query has no run context and
 *   passes none, so today the list always reflects the platform's keys.
 * @returns Active realtime models, each with its driver's voices.
 */
export async function GetRealtimeModelVoices(
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
    resolveAPIKey: AIAPIKeyResolver = MakeAIAPIKeyResolver(),
): Promise<RealtimeModelVoices[]> {
    await AIEngine.Instance.Config(false, contextUser, provider);
    const isRealtime = (t: string | null | undefined): boolean =>
        typeof t === 'string' && t.trim().toLowerCase() === 'realtime';
    const models = AIEngine.Instance.Models
        .filter((m) => m.IsActive && isRealtime(m.AIModelType))
        .sort((a, b) => (b.PowerRank ?? 0) - (a.PowerRank ?? 0));

    const out: RealtimeModelVoices[] = [];
    for (const model of models) {
        const selection = SelectRealtimeVendorForModel(model.ID, resolveAPIKey);
        const driverClass = selection?.DriverClass ?? null;
        if (!driverClass) {
            continue; // no active vendor with a resolvable key — not runnable, so omit
        }

        // 1. Consult metadata first (Personas & PersonaVendors carry curated names/descriptions, and avatars)
        const voices = personaVoiceOptions(model.ID, selection.VendorID);

        // 2. Union with driver SupportedVoices: append the driver voices no persona offers plainly, unless excluded
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeModel>(
            BaseRealtimeModel, driverClass, resolveAPIKey(driverClass),
        );
        appendDriverVoices(voices, instance?.SupportedVoices ?? [], model.ID, selection.VendorID);

        out.push({ ModelID: model.ID, ModelName: model.Name ?? '', Voices: voices });
    }
    return out;
}

/**
 * Appends the driver's voices that no persona already offers as a plain voice (without a face), skipping the ones the
 * model explicitly excludes (`IsSupported === false`). A persona with a face doesn't stand in for its plain voice, so the
 * voice stays pickable without the face. Driver voices have no persona: no avatar, no image.
 */
function appendDriverVoices(voices: RealtimeModelVoiceOption[], driverVoices: RealtimeVoiceOption[], modelID: string, vendorID: string): void {
    const excluded = new Set(
        AIEngine.Instance.GetModelPersonaExclusions(modelID, 'Audio', vendorID).map((name) => name.toLowerCase())
    );
    for (const dv of driverVoices) {
        const id = dv.ID.toLowerCase();
        if (!excluded.has(id) && !voices.some((v) => !v.AvatarID && v.ID.toLowerCase() === id)) {
            voices.push({ ID: dv.ID, Name: dv.Name });
        }
    }
}

/**
 * The model's persona voices on a vendor, one per persona, in persona order. A persona whose preset Video binding on the
 * same vendor the model supports carries that binding's `APIName` as its avatar (the face the session asks for when the
 * voice is picked); a binding on any other vendor doesn't count, nor does a custom one, and with no vendor there is
 * nothing to match.
 */
function personaVoiceOptions(modelID: string, vendorID: string): RealtimeModelVoiceOption[] {
    const faces = vendorID ? AIEngine.Instance.GetModelPersonas(modelID, 'Video', vendorID).filter(isPresetFace) : [];
    return AIEngine.Instance.GetModelPersonas(modelID, 'Audio', vendorID).map((voice) => {
        const face = faces.find((f) => UUIDsEqual(f.Persona.ID, voice.Persona.ID));
        const image = voice.Persona.PreviewImageURL?.trim();
        return {
            ID: voice.PersonaVendor.APIName,
            Name: voice.Persona.Name,
            PersonaID: voice.Persona.ID,
            ...(face ? { AvatarID: face.PersonaVendor.APIName.trim() } : {}),
            ...(image ? { PreviewImageURL: image } : {}),
        };
    });
}

/**
 * Whether a Video binding is a face a picked voice can bring: a preset (`Avatar.Kind` absent or `'preset'`). Custom avatars
 * are not supported, so a session asking for one would stay audio only.
 */
function isPresetFace(face: ResolvedModelPersona): boolean {
    return (face.PersonaVendor.VendorSettingsObject?.Avatar?.Kind ?? 'preset') !== 'custom';
}

/** Resolves the agent entity from the engine cache by id (preferred), then by case-insensitive name. */
function resolveAgentEntity(ctx: BridgeRealtimeSessionContext): MJAIAgentEntityExtended | undefined {
    const agents = AIEngine.Instance.Agents;
    if (ctx.AgentID) {
        const byId = agents.find((a) => UUIDsEqual(a.ID, ctx.AgentID as string));
        if (byId) {
            return byId;
        }
    }
    if (ctx.AgentName) {
        const wanted = ctx.AgentName.trim().toLowerCase();
        return agents.find((a) => a.Name?.trim().toLowerCase() === wanted);
    }
    return undefined;
}
