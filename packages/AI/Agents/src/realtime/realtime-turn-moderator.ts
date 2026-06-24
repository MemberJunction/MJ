/**
 * @fileoverview The **realtime turn moderator** — the agent-layer plugin behind the bridge engine's
 * `SetTurnModerator` hook. For each turn in a MULTI-agent voice room it runs ONE fast LLM **prompt** (not an
 * agent run) that decides which agent(s), in order, should speak next — routing a question to several agents
 * when relevant, letting a *productive* agent↔agent discussion continue, and going quiet on unproductive
 * ping-pong. The engine speaks the returned agents serially via the floor; the audio plane is untouched.
 *
 * Why a prompt, not an agent: this is a stateless yes/who classification — no planning, tools, or sub-agents.
 * Each decision is an `AIPromptRun` tied to the co-agent's `AIAgentRun` (`agentRunId`) so the "who spoke and
 * why" trail is fully observable. Informally this is the meeting's **moderator** (a.k.a. "nanny mode") — but
 * note it *brings agents in* as much as it restrains them.
 *
 * The engine stays framework-agnostic: it knows only `(ctx) => Promise<string[]>`. This module supplies that
 * function via {@link RealtimeTurnModeratorDecision}; the context types below **structurally match** the
 * engine's exported `TurnModeratorContext` (we don't take a dependency on `@memberjunction/ai-bridge-server`,
 * exactly as `bridge-room-transcript-sink.ts` mirrors `BridgeTranscriptSink`).
 *
 * @module @memberjunction/ai-agents
 */
import { LogError, LogStatus, LogStatusEx, UserInfo, IMetadataProvider, RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import {
    ResolveEffectiveRealtimeConfig,
    GetEffectiveModeratorConfig,
    GetEffectiveTurnMode,
    RealtimeModeratorConfig,
} from './realtime-coagent-config';

/** The agent-type name whose `DefaultConfiguration` carries the room-wide moderator settings. */
const REALTIME_AGENT_TYPE_NAME = 'Realtime';

/** One agent in the room as the moderator sees it (structurally matches the engine's `ModeratorRosterAgent`). */
export interface ModeratorRosterAgentInput {
    AgentSessionID: string;
    AgentID?: string;
    TargetAgentID?: string;
    Names: string[];
    Role?: string;
    Mode: 'proactive' | 'addressed-only';
}

/** One diarized lookback turn (structurally matches the engine's `ModeratorLookbackTurn`). */
export interface ModeratorLookbackTurnInput {
    Speaker: string;
    IsAgent: boolean;
    AgentID?: string;
    Text: string;
}

/** The per-decision context handed in by the engine (structurally matches the engine's `TurnModeratorContext`). */
export interface TurnModeratorContextInput {
    RoomKey: string;
    Roster: ModeratorRosterAgentInput[];
    Lookback: ModeratorLookbackTurnInput[];
    LatestTurn: ModeratorLookbackTurnInput;
    ConsecutiveAgentOnlyTurns: number;
    AgentRunID?: string;
    RepAgentSessionID?: string;
    ContextUser?: UserInfo;
    Provider?: IMetadataProvider;
}

/** The structured output the moderator prompt returns. */
interface ModeratorDecision {
    /** Ordered agents who should speak next (empty = nobody; go quiet / hand back to the human). */
    speakers?: Array<{ agent: string; reason?: string }>;
    /** Optional moderator note (e.g. "stopping an unproductive loop") — logged for observability. */
    note?: string;
}

/**
 * The realtime turn moderator. One shared instance is wired into the engine; it resolves the room-wide
 * moderator config from the Realtime agent type's `DefaultConfiguration` and runs the configured prompt.
 */
export class RealtimeTurnModerator {
    private readonly runner = new AIPromptRunner();
    /** AgentSessionID → co-agent `AIAgentRun` id (stable per session) — avoids a query per turn. `null` = looked up, none found. */
    private readonly sessionRunIdCache = new Map<string, string | null>();
    /** AgentID → resolved { role, mode } (stable per agent) — avoids re-resolving the cascade per turn. */
    private readonly agentMetaCache = new Map<string, { role: string; mode: 'proactive' | 'addressed-only' }>();

    /**
     * Decides who speaks next for one turn. Returns the ordered `AgentSessionID`s to trigger (empty = nobody).
     * Honors the optional consecutive-agent backstop, the per-call timeout, and the `onError` policy; degrades
     * to a name-contains safety net ONLY when no moderator prompt is configured (a metadata gap, not the norm).
     */
    public async Decide(ctx: TurnModeratorContextInput): Promise<string[]> {
        const cfg = this.resolveConfig();
        if (!cfg) {
            // No moderator configured for this deployment → safety net so a room isn't mute. The configured
            // LLM moderator is the real mechanism; this only fires when the metadata is missing.
            return this.addressedFallback(ctx);
        }

        // `prestageOnAgentSpeech` controls agent↔agent continuation: when an AGENT just spoke (a continuation
        // turn) and pre-staging is OFF, agents do not proactively respond to each other — they speak only when
        // a human turn routes to them. (When ON, the continuation runs during the prior agent's playback.)
        if (!cfg.prestageOnAgentSpeech && ctx.LatestTurn.IsAgent) {
            return [];
        }

        // Optional HARD ping-pong backstop. Default (null) relies on the model's own progress assessment, so a
        // genuine discussion is never gated by a counter — this only trips when an operator sets a cap.
        if (
            cfg.maxConsecutiveAgentOnlyTurns != null &&
            ctx.LatestTurn.IsAgent &&
            ctx.ConsecutiveAgentOnlyTurns >= cfg.maxConsecutiveAgentOnlyTurns
        ) {
            LogStatus(`[RealtimeTurnModerator] consecutive-agent cap (${cfg.maxConsecutiveAgentOnlyTurns}) reached — room going quiet`);
            return [];
        }

        try {
            const agentRunId = ctx.AgentRunID ?? (await this.resolveAgentRunId(ctx));
            const decision = await this.withTimeout(this.runPrompt(ctx, cfg, agentRunId), cfg.timeoutMs);
            const names = (decision?.speakers ?? []).map((s) => s.agent);
            if (decision?.note) {
                LogStatus(`[RealtimeTurnModerator] note: ${decision.note}`);
            }
            return this.mapNamesToSessions(names, ctx);
        } catch (err) {
            LogError(`[RealtimeTurnModerator] decision failed (${cfg.onError} fallback): ${err instanceof Error ? err.message : String(err)}`);
            return cfg.onError === 'addressed-only' ? this.addressedFallback(ctx) : [];
        }
    }

    /** Resolves the room-wide moderator config from the Realtime agent type's `DefaultConfiguration` (cache-backed). */
    private resolveConfig(): Required<RealtimeModeratorConfig> | null {
        try {
            const type = (AIEngine.Instance.AgentTypes ?? []).find(
                (t) => (t.Name ?? '').toLowerCase() === REALTIME_AGENT_TYPE_NAME.toLowerCase(),
            );
            return GetEffectiveModeratorConfig(ResolveEffectiveRealtimeConfig(type?.DefaultConfiguration ?? null, null, null));
        } catch {
            return null;
        }
    }

    /**
     * Resolves an agent's live { role, mode } from its own config — `role` from its Description, `mode` from
     * the `turnTaking.mode` of (agent type `DefaultConfiguration` ← that agent's `TypeConfiguration`). Cached
     * per agent id. Returns `null` for an unknown id (caller falls back to engine-provided values).
     */
    private resolveAgentMeta(agentId?: string): { role: string; mode: 'proactive' | 'addressed-only' } | null {
        if (!agentId) {
            return null;
        }
        const key = agentId.toLowerCase();
        const cached = this.agentMetaCache.get(key);
        if (cached) {
            return cached;
        }
        try {
            const agent = (AIEngine.Instance.Agents ?? []).find((a) => UUIDsEqual(a.ID, agentId));
            if (!agent) {
                return null;
            }
            const type = (AIEngine.Instance.AgentTypes ?? []).find((t) => UUIDsEqual(t.ID, agent.TypeID));
            const cfg = ResolveEffectiveRealtimeConfig(type?.DefaultConfiguration ?? null, null, null, agent.TypeConfiguration ?? null);
            const meta = { role: (agent.Description ?? '').trim(), mode: GetEffectiveTurnMode(cfg) };
            if (this.agentMetaCache.size > 1000) {
                this.agentMetaCache.clear(); // bounded; also drops any stale entries after a metadata edit
            }
            this.agentMetaCache.set(key, meta);
            return meta;
        } catch {
            return null;
        }
    }

    /**
     * Resolves the co-agent `AIAgentRun` id for the room's representative session (found by `AgentSessionID`,
     * Running, top-level), so each moderator prompt run nests under it. Cached per session (the run is stable
     * for the session's life); a not-yet-found result is left uncached so it's picked up once the run exists.
     */
    private async resolveAgentRunId(ctx: TurnModeratorContextInput): Promise<string | undefined> {
        const sessionId = ctx.RepAgentSessionID?.trim();
        if (!sessionId) {
            return undefined;
        }
        const key = sessionId.toLowerCase();
        if (this.sessionRunIdCache.has(key)) {
            return this.sessionRunIdCache.get(key) ?? undefined;
        }
        try {
            const rv = ctx.Provider ? RunView.FromMetadataProvider(ctx.Provider) : new RunView();
            const res = await rv.RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: AI Agent Runs',
                    ExtraFilter: `AgentSessionID='${sessionId.replace(/'/g, "''")}' AND Status='Running' AND ParentRunID IS NULL`,
                    Fields: ['ID'],
                    OrderBy: '__mj_CreatedAt DESC',
                    MaxRows: 1,
                    ResultType: 'simple',
                },
                ctx.ContextUser,
            );
            const id = res.Success && res.Results.length ? String(res.Results[0].ID) : null;
            // Cache the result either way — the co-agent run is created at session start (before any turn), so a
            // miss means it's genuinely unlinkable; caching null stops a per-turn DB query. Bounded by session count.
            if (this.sessionRunIdCache.size > 1000) {
                this.sessionRunIdCache.clear();
            }
            this.sessionRunIdCache.set(key, id);
            return id ?? undefined;
        } catch {
            return undefined;
        }
    }

    /** Runs the moderator prompt and returns its parsed decision. Throws on a missing prompt / failed run. */
    private async runPrompt(ctx: TurnModeratorContextInput, cfg: Required<RealtimeModeratorConfig>, agentRunId?: string): Promise<ModeratorDecision | undefined> {
        const prompt = AIEngine.Instance.Prompts.find((p) => UUIDsEqual(p.ID, cfg.promptId));
        if (!prompt) {
            throw new Error(`moderator prompt '${cfg.promptId}' not found in the AIEngine cache`);
        }
        const params = new AIPromptParams();
        params.prompt = prompt;
        params.contextUser = ctx.ContextUser;
        params.agentRunId = agentRunId; // ties this prompt run to the co-agent run for observability
        params.data = this.buildData(ctx, cfg);
        const result = await this.runner.ExecutePrompt<ModeratorDecision>(params);
        if (!result.success) {
            throw new Error(result.errorMessage ?? 'moderator prompt run failed');
        }
        // The runner hands back the structured object OR the raw JSON string depending on the prompt's output
        // config — normalize to the object so `.speakers` is always available (a string would make `.speakers`
        // undefined → the room would silently route to nobody).
        let decision: unknown = result.result;
        if (typeof decision === 'string') {
            try {
                decision = JSON.parse(decision.replace(/^\s*```json/i, '').replace(/```\s*$/i, '').trim());
            } catch {
                decision = undefined;
            }
        }
        const parsed = decision as ModeratorDecision | undefined;
        LogStatusEx({ message: `[RealtimeTurnModerator][diag] decision (type=${typeof result.result}) speakers=${JSON.stringify(parsed?.speakers ?? null)}`, verboseOnly: true });
        return parsed;
    }

    /**
     * Builds the prompt data. The ROSTER (stable within a room) is separated from the rolling CONVERSATION
     * window so a prompt template can keep the roster near the top (cacheable prefix) and the variable
     * lookback at the bottom. The lookback is narrowed to the configured window + clipped per turn.
     */
    private buildData(ctx: TurnModeratorContextInput, cfg: Required<RealtimeModeratorConfig>): Record<string, unknown> {
        const agents = ctx.Roster.map((r) => {
            // Resolve the live role + participation mode from the agent's own config (the TARGET agent it
            // voices, falling back to its co-agent id). The engine ships defaults; this fills in the real values.
            const meta = this.resolveAgentMeta(r.TargetAgentID ?? r.AgentID);
            return {
                name: r.Names[0] ?? 'Agent',
                aliases: r.Names.slice(1),
                role: meta?.role || r.Role || '',
                mode: meta?.mode ?? r.Mode,
            };
        });
        const conversation = ctx.Lookback.slice(-cfg.contextWindowTurns).map((t) => ({
            speaker: t.Speaker,
            isAgent: t.IsAgent,
            text: t.Text.slice(0, cfg.maxCharsPerTurn),
        }));
        return {
            agents,
            latestSpeaker: ctx.LatestTurn.Speaker,
            latestIsAgent: ctx.LatestTurn.IsAgent,
            conversation,
        };
    }

    /** Maps moderator-returned agent NAMES to roster `AgentSessionID`s, in order, de-duplicated. */
    private mapNamesToSessions(names: string[], ctx: TurnModeratorContextInput): string[] {
        const out: string[] = [];
        for (const name of names) {
            const n = (name ?? '').trim().toLowerCase();
            if (!n) {
                continue;
            }
            const match = ctx.Roster.find((r) => r.Names.some((x) => x.trim().toLowerCase() === n));
            if (match && !out.includes(match.AgentSessionID)) {
                out.push(match.AgentSessionID);
            }
        }
        return out;
    }

    /**
     * Pure safety net (ONLY when no moderator prompt is configured): route to any agent whose name literally
     * appears in the latest turn. This is deliberately crude — the configured LLM moderator handles all the
     * nuance (typos, indirect address, relevance) that this can't.
     */
    private addressedFallback(ctx: TurnModeratorContextInput): string[] {
        const text = ctx.LatestTurn.Text.toLowerCase();
        return ctx.Roster.filter((r) => r.Names.some((nm) => nm && text.includes(nm.toLowerCase()))).map((r) => r.AgentSessionID);
    }

    /** Rejects if `p` doesn't settle within `ms` — keeps a slow moderator from stalling a turn. */
    private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const t = setTimeout(() => reject(new Error(`moderator timed out after ${ms}ms`)), ms);
            p.then(
                (v) => {
                    clearTimeout(t);
                    resolve(v);
                },
                (e) => {
                    clearTimeout(t);
                    reject(e);
                },
            );
        });
    }
}

/** The one shared moderator wired into the engine (no per-call construction cost). */
const sharedModerator = new RealtimeTurnModerator();

/**
 * The function to pass to `AIBridgeEngine.SetTurnModerator(...)`. Structurally a `TurnModerator`
 * (`(ctx) => Promise<string[]>`); the MJServer resolver wires it at schema-build time.
 */
export function RealtimeTurnModeratorDecision(ctx: TurnModeratorContextInput): Promise<string[]> {
    return sharedModerator.Decide(ctx);
}
