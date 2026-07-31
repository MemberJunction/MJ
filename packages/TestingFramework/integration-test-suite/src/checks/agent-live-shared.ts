/**
 * agent-live-shared.ts — shared helpers for the LIVE-MODEL agent bundles
 * (agent-loop-live, shipped-agents-live, agent-carry-forward).
 *
 * NOT a check bundle — registers nothing; imported by the sibling bundles so the run mechanics,
 * run-id resolution, prompt-message reads, token rollups, and FK-safe purge live once. EVERY
 * assertion is on process-level, framework-produced observables (AIAgentRun/Step lineage + Status,
 * AIPromptRun.Messages, token arithmetic) — never the model's prose.
 *
 * TRANSPORT: SERVER-IN-PROCESS (Q8). Despite the "live" naming, these agents run in-process via
 * AgentRunner.RunAgent — NOT over the GraphQL wire. The wire RunAIAgent mutation is fire-and-forget
 * over PubSub the headless integration client cannot consume, and the correlation-heavy checks need
 * a synchronous run handle (proposal §3.6/Q8; the dedicated wire path is IT63 agent-wire-callback).
 * Because it runs in-process against the CLI's SQL provider, `makeAIClient` REQUIRES the run's
 * `ctx.User` — `provider.CurrentUser` is null on a database provider, so a run without an explicit
 * contextUser dies in BaseEngine.Load (issue #3251). Reads use BypassCache so post-run DB truth is
 * observed regardless of any cache the run populated.
 */
import { RunView, CompositeKey } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo, RunViewResult } from '@memberjunction/core';
import { AgentRunner } from '@memberjunction/ai-agents';
import type { ExecuteAgentParams, ExecuteAgentResult, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';

/** Every fabricated / run-product row this family creates carries this tag for auditability. */
export const AGENT_LIVE_FIXTURE_TAG = '(mj-integration-test — safe to delete)';

/** Fire-and-forget landing delay (ms) — step/promptRun saves queue server-side after the client returns. */
export const AGENT_LIVE_SETTLE_MS = Number(process.env.AGENT_LIVE_SETTLE_MS ?? 5000);

/** A unique per-run marker string (the rig's isolation technique). */
export function newMarker(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

/**
 * A minimal agent invoker exposing RunAIAgent(params). Backed by SERVER-IN-PROCESS
 * AgentRunner.RunAgent (transport decision: agent runs go server-side for this family —
 * the wire RunAIAgent mutation is fire-and-forget over PubSub the headless integration
 * client cannot consume, and the correlation-heavy checks need a synchronous run handle;
 * proposal Q8, resolved to server-in-process). The client-wire path is fixed separately
 * and gets its own dedicated wire bundle.
 */
export interface AgentInvoker {
    RunAIAgent(params: ExecuteAgentParams): Promise<ExecuteAgentResult>;
}

/**
 * Build a server-in-process agent invoker bound to the run-scoped provider + the run's context
 * user. `user` is REQUIRED (pass `ctx.User`): the agent runs in-process via AgentRunner.RunAgent,
 * so a null contextUser dies in BaseEngine.Load ("For server-side use of all engine classes...").
 * The contract is `params.contextUser ?? user`, else a REJECTED promise with a harness-attributed
 * error — deliberately NO fallback to `provider.CurrentUser` (null on the CLI's SQL provider; the
 * pre-#3251 code relied on it and failed every server-in-process run, and borrowing the provider's
 * ambient identity could silently run as the wrong user on a client provider).
 */
/**
 * The ONE contextUser-resolution policy for the server-in-process agent invokers (makeAIClient
 * here, resolveClient in _it-live-agent-harness.ts): `params.contextUser ?? boundUser`, else throw
 * a harness-attributed error. Shared so the two invokers' fallback policy and error message cannot
 * drift (#3251 review follow-up). Callers are async, so the throw always surfaces as a rejection.
 */
export function resolveContextUserOrThrow(explicitUser: UserInfo | undefined, boundUser: UserInfo, invokerName: string): UserInfo {
    const contextUser = explicitUser ?? boundUser;
    if (!contextUser) {
        throw new Error(
            'integration harness: no contextUser available for the server-in-process agent run — ' +
            `pass ctx.User to ${invokerName} (there is deliberately no provider.CurrentUser fallback). (issue #3251)`);
    }
    return contextUser;
}

export function makeAIClient(provider: IMetadataProvider, user: UserInfo): AgentInvoker {
    return {
        // async so a missing user surfaces as a REJECTION, never a sync throw — RunAIAgent
        // returns a Promise, and a sync throw would escape a `.catch(...)`-style caller.
        RunAIAgent: async (params: ExecuteAgentParams) => {
            const contextUser = resolveContextUserOrThrow(params.contextUser, user, 'makeAIClient');
            // base-agent stamps AIAgentRun.ConversationID from params.data.conversationId
            // (base-agent.ts:7893), while carry-forward reads the top-level params.conversationId
            // (:5714) — so a conversation-linked run must carry it in BOTH places.
            const convId = (params as { conversationId?: string }).conversationId;
            const data = convId ? { ...(params.data ?? {}), conversationId: convId } : params.data;
            return new AgentRunner(provider).RunAgent({
                ...params,
                data,
                contextUser,
                provider,
            });
        },
    };
}

/** Message-literal typed via the params type so no `@memberjunction/ai` ChatMessage import is needed. */
export type WireMessages = ExecuteAgentParams['conversationMessages'];

/** One user-turn message array for a wire run. */
export function userTurn(text: string): WireMessages {
    return [{ role: 'user', content: text }] as WireMessages;
}

/** Options threaded to a wire run (conversation-linked runs pass conversationDetailId). */
export interface WireRunOptions {
    conversationDetailId?: string;
    conversationId?: string;
    planMode?: boolean;
    requestedSkillIDs?: string[];
}

/**
 * Run an agent server-in-process (via the makeAIClient invoker) and return the ExecuteAgentResult.
 * A run error normally becomes `result.success === false`, but the invoker REJECTS if no
 * contextUser can be resolved (issue #3251) — call sites pass ctx.User, so that path indicates a
 * harness bug.
 */
export async function runAgentOverWire(
    client: AgentInvoker,
    agent: MJAIAgentEntityExtended,
    messages: WireMessages,
    opts: WireRunOptions = {}
): Promise<ExecuteAgentResult> {
    const params: ExecuteAgentParams = {
        agent,
        conversationMessages: messages,
        conversationDetailId: opts.conversationDetailId,
        conversationId: opts.conversationId,
        planMode: opts.planMode,
        requestedSkillIDs: opts.requestedSkillIDs,
    };
    return client.RunAIAgent(params);
}

/**
 * Build a RunView bound to `provider`, falling back to the process-global provider only when none
 * is supplied. The harness runs under a run-scoped provider (the CLI's SQL provider server-side,
 * GraphQLDataProvider client-side), and a bare `new RunView()` reads through whichever provider
 * happens to be global — wrong the moment more than one is alive in the process.
 */
function runViewFor(provider?: IMetadataProvider): RunView {
    return provider ? RunView.FromMetadataProvider(provider) : new RunView();
}

/**
 * Resolve the run id: prefer the id the completion event carried; on a fire-and-forget reconcile
 * miss, fall back to the newest AIAgentRun matching `fallbackFilter` (an ExtraFilter). Returns
 * undefined only when neither path yields a run.
 */
export async function resolveRunId(
    result: ExecuteAgentResult,
    user: UserInfo,
    fallbackFilter?: string,
    provider?: IMetadataProvider
): Promise<string | undefined> {
    if (result.agentRun?.ID) {
        return result.agentRun.ID;
    }
    if (!fallbackFilter) {
        return undefined;
    }
    const r = await runViewFor(provider).RunView<{ ID: string }>({
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: fallbackFilter,
        OrderBy: '__mj_CreatedAt DESC',
        MaxRows: 1,
        Fields: ['ID'],
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    return r.Success ? r.Results?.[0]?.ID : undefined;
}

/**
 * Unwrap a RunView result, throwing with the provider's own error text when the query failed.
 *
 * RunView does not throw — it returns `Success: false` plus an ErrorMessage. Coalescing that to
 * `[]` makes a broken query indistinguishable from "no rows", which is exactly how a filter on a
 * column that does not exist (`AIPromptRun.AgentRunID`) survived in this file: every caller read
 * zero prompt runs and either passed vacuously or failed on an unrelated-looking assertion. A
 * check that cannot read its observables must fail loudly, naming the query that broke.
 */
export function RequireRows<T>(result: RunViewResult<T>, what: string): T[] {
    if (!result.Success) {
        throw new Error(`${what} failed: ${result.ErrorMessage || 'no error message returned'}`);
    }
    return result.Results || [];
}

/**
 * EVERY step type whose TargetLogID is an AIPromptRun. base-agent writes three:
 *
 * - `Prompt` — the ordinary model call (base-agent.ts:8833, via onPromptRunCreated).
 * - `Compaction` — cross-turn conversation compaction (base-agent.ts:13689,
 *   `targetLogId: outcome.PromptRunId`).
 * - `Tool` — a conversation tool call that made its own model call (base-agent.ts:5965). Its
 *   comment there is explicit that this is done "without a duplicate Prompt step for the same
 *   call", so a Prompt-only rule cannot reach that prompt run by any route.
 *
 * Deletion MUST use the full set: teardown removes the steps, and a prompt run whose only linkage
 * row is gone is orphaned permanently.
 */
export const PROMPT_RUN_BEARING_STEP_TYPES: readonly string[] = ['Prompt', 'Compaction', 'Tool'];

/**
 * The subset base-agent counts toward the run's token rollup — `Prompt` and `Compaction` only
 * (base-agent.ts:13255). `Tool` steps' prompt runs are deliberately absent: including them would
 * add tokens the rollup never counted, so any check reconciling Σ(prompt run tokens) against
 * `AIAgentRun.TotalTokensUsed` must use THIS set, not the full one.
 */
export const ROLLUP_BEARING_STEP_TYPES: readonly string[] = ['Prompt', 'Compaction'];

/**
 * The agent-run → prompt-run linkage rule, in one place.
 *
 * `MJ: AI Prompt Runs` has NO AgentRunID column (its only agent-facing field is AgentID). A prompt
 * run is reachable from its agent run only through the step that invoked it — an
 * `MJ: AI Agent Run Steps` row whose TargetLogID is the AIPromptRun's ID. Filtering prompt runs on
 * AgentRunID is a SQL error, not an empty result set.
 *
 * `stepTypes` decides WHICH linkage rows count; it is explicit because the correct answer differs
 * by purpose (see the two constants above). Step types outside the set are skipped because their
 * TargetLogID points at something else entirely — `Sub-Agent` at a child agent run, `Actions` at
 * an Action Execution Log — so treating those ids as prompt-run ids reads or deletes wrong rows.
 */
export function PromptRunIdsFromSteps(
    steps: Array<{ StepType: string | null; TargetLogID: string | null }>,
    stepTypes: readonly string[] = PROMPT_RUN_BEARING_STEP_TYPES
): string[] {
    return steps.filter(s => s.StepType != null && stepTypes.includes(s.StepType) && s.TargetLogID).map(s => s.TargetLogID!);
}

/**
 * Resolve every AIPromptRun ID produced by the given agent runs, via their prompt-run-bearing steps.
 *
 * Callers that already hold the step rows should use `PromptRunIdsFromSteps` directly rather than
 * re-reading them. Callers that are about to DELETE the steps must call this FIRST — deleting the
 * steps destroys the only path to the prompt runs.
 */
export async function ResolvePromptRunIdsForAgentRuns(
    agentRunIds: string[],
    user: UserInfo,
    provider?: IMetadataProvider,
    stepTypes: readonly string[] = PROMPT_RUN_BEARING_STEP_TYPES
): Promise<string[]> {
    if (agentRunIds.length === 0) {
        return [];
    }
    const inList = agentRunIds.map(id => `'${id}'`).join(',');
    // The step-type set is applied in SQL as well as in PromptRunIdsFromSteps — narrowing here and
    // widening there would silently drop rows before the JS filter ever sees them.
    const typeList = stepTypes.map(t => `'${t}'`).join(',');
    const r = await runViewFor(provider).RunView<{ StepType: string | null; TargetLogID: string | null }>({
        EntityName: 'MJ: AI Agent Run Steps',
        ExtraFilter: `AgentRunID IN (${inList}) AND StepType IN (${typeList})`,
        Fields: ['StepType', 'TargetLogID'],
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    return PromptRunIdsFromSteps(RequireRows(r, `prompt-step read for agent runs ${inList}`), stepTypes);
}

/** A run's steps (fresh DB read), ordered by StepNumber. */
export interface StepRow {
    ID: string;
    StepNumber: number;
    StepType: string;
    StepName: string | null;
    Status: string;
    CompletedAt: string | null;
    TargetLogID: string | null;
    OutputData: string | null;
}

export async function getRunSteps(runId: string, user: UserInfo, provider?: IMetadataProvider): Promise<StepRow[]> {
    const r = await runViewFor(provider).RunView<StepRow>({
        EntityName: 'MJ: AI Agent Run Steps',
        ExtraFilter: `AgentRunID='${runId}'`,
        OrderBy: 'StepNumber ASC',
        Fields: ['ID', 'StepNumber', 'StepType', 'StepName', 'Status', 'CompletedAt', 'TargetLogID', 'OutputData'],
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    return RequireRows(r, `step read for run ${runId}`);
}

/** The projection of an AIPromptRun row these checks read. */
export interface PromptRunRow {
    ID: string;
    ModelID: string | null;
    VendorID: string | null;
    Messages: string | null;
    TokensUsed: number | null;
    Success: boolean;
    Status: string;
}

/**
 * The AIPromptRun rows a run's ROLLUP-BEARING steps produced (fresh), ordered oldest-first.
 *
 * Scoped to ROLLUP_BEARING_STEP_TYPES because this feeds the token-reconciliation checks
 * (sumPromptRunTokens vs AIAgentRun.TotalTokensUsed). Teardown deliberately uses the wider
 * PROMPT_RUN_BEARING_STEP_TYPES — it must reach every prompt run, not just the counted ones.
 */
export async function getPromptRuns(runId: string, user: UserInfo, provider?: IMetadataProvider): Promise<PromptRunRow[]> {
    // Reached through the run's steps — AIPromptRun has no AgentRunID (see PromptRunIdsFromSteps).
    // A run that made no model call legitimately has none.
    const promptRunIds = await ResolvePromptRunIdsForAgentRuns([runId], user, provider, ROLLUP_BEARING_STEP_TYPES);
    if (promptRunIds.length === 0) {
        return [];
    }
    const r = await runViewFor(provider).RunView<PromptRunRow>({
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `ID IN (${promptRunIds.map(id => `'${id}'`).join(',')})`,
        OrderBy: '__mj_CreatedAt ASC',
        Fields: ['ID', 'ModelID', 'VendorID', 'Messages', 'TokensUsed', 'Success', 'Status'],
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    return RequireRows(r, `prompt-run read for run ${runId}`);
}

/** Sum of TokensUsed across every AIPromptRun for a run (nulls coalesced to 0). */
export function sumPromptRunTokens(rows: PromptRunRow[]): number {
    return rows.reduce((acc, p) => acc + (Number(p.TokensUsed) || 0), 0);
}

/** A single decoded chat message from an AIPromptRun.Messages payload. */
export interface DecodedMessage {
    role: string;
    content: string;
}

/** Normalize a message content value (string or content-part array) to a searchable string. */
function contentToString(content: unknown): string {
    if (typeof content === 'string') {
        return content;
    }
    return JSON.stringify(content ?? '');
}

/**
 * Decode an AIPromptRun.Messages field (a JSON string) into role/content pairs. Handles both the
 * bare-array shape and the `{ messages: [...] }` wrapper (same two shapes ParseMessagesData handles).
 */
export function decodeMessages(messagesJson: string | null): DecodedMessage[] {
    if (!messagesJson) {
        return [];
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(messagesJson);
    } catch {
        return [];
    }
    const arr: unknown[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { messages?: unknown[] })?.messages)
            ? (parsed as { messages: unknown[] }).messages
            : [];
    return arr.map(m => {
        const mm = m as { role?: unknown; content?: unknown };
        return { role: String(mm.role ?? ''), content: contentToString(mm.content) };
    });
}

/** The chat messages of a run's FIRST Prompt step (via its TargetLogID → AIPromptRun.Messages). */
export async function firstPromptMessages(runId: string, user: UserInfo, provider?: IMetadataProvider): Promise<DecodedMessage[]> {
    const steps = await getRunSteps(runId, user, provider);
    const firstPrompt = steps.find(s => s.StepType === 'Prompt' && s.TargetLogID);
    if (!firstPrompt?.TargetLogID) {
        return [];
    }
    const r = await runViewFor(provider).RunView<{ Messages: string | null }>({
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `ID='${firstPrompt.TargetLogID}'`,
        Fields: ['Messages'],
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    const row = r.Success ? r.Results?.[0] : undefined;
    return decodeMessages(row?.Messages ?? null);
}

/** Best-effort delete one row by id via the run-scoped provider (never throws). */
export async function deleteById(entity: string, id: string, provider: IMetadataProvider, user: UserInfo): Promise<void> {
    try {
        const e = await provider.GetEntityObject(entity, user);
        if (await e.InnerLoad(CompositeKey.FromID(id))) {
            await e.Delete();
        }
    } catch (err) {
        console.error(`[agent-live] cleanup ${entity} ${id} failed:`, err);
    }
}

/**
 * FK-safe purge of a live agent run this family created: delete its AIPromptRuns and
 * AIAgentRunSteps (children), then the run header. Best-effort per row so partial failures
 * still make progress. Deletes are done through loaded entity objects on the run-scoped provider.
 */
export async function purgeAgentRun(runId: string, provider: IMetadataProvider, user: UserInfo): Promise<void> {
    const rv = RunView.FromMetadataProvider(provider);
    // Steps first (they reference prompt runs via TargetLogID on prompt-run-bearing steps), then the run.
    const stepsResult = await rv.RunView<{ ID: string; StepType: string; TargetLogID: string | null }>({
        EntityName: 'MJ: AI Agent Run Steps', ExtraFilter: `AgentRunID='${runId}'`,
        Fields: ['ID', 'StepType', 'TargetLogID'], ResultType: 'simple', BypassCache: true,
    }, user);
    // Deliberately non-throwing (teardown must keep going), but NOT silent: a failed step read
    // means the prompt runs below cannot be found and will be left behind, so it must be visible.
    if (!stepsResult.Success) {
        console.error(`purgeAgentRun: step read for run ${runId} failed, prompt runs may leak: ${stepsResult.ErrorMessage}`);
    }
    const steps = stepsResult.Success ? stepsResult.Results : [];
    // Delete prompt runs linked through prompt-run-bearing steps (Prompt/Compaction/Tool — the full
    // set, since teardown must not orphan any). Resolved from the step rows we already
    // hold, and BEFORE the steps are deleted below — the steps are the only path to them.
    for (const prId of PromptRunIdsFromSteps(steps)) {
        await deleteById('MJ: AI Prompt Runs', prId, provider, user);
    }
    for (const s of steps) {
        await deleteById('MJ: AI Agent Run Steps', s.ID, provider, user);
    }
    await deleteById('MJ: AI Agent Runs', runId, provider, user);
}
