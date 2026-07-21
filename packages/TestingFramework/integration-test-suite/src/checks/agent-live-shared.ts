/**
 * agent-live-shared.ts — shared helpers for the LIVE-MODEL, CLIENT-TRANSPORT agent bundles
 * (agent-loop-live, shipped-agents-live, agent-carry-forward).
 *
 * NOT a check bundle — registers nothing; imported by the sibling bundles so the wire-run
 * mechanics, run-id resolution, prompt-message reads, token rollups, and FK-safe purge live
 * once. Mirrors the precedent rig (rigs/agent-memory-tests.ts): agents run over the GraphQL
 * wire (GraphQLAIClient → live MJAPI) and EVERY assertion is on process-level, framework-
 * produced observables (AIAgentRun/Step lineage + Status, AIPromptRun.Messages, token
 * arithmetic) — never the model's prose.
 *
 * Transport: CLIENT. These helpers construct a GraphQLAIClient from the run-scoped
 * ctx.Provider (a GraphQLDataProvider in the client suite), the doctrine-aligned choice
 * (plans/integration-test-expansion §3.6/Q8). Reads use BypassCache so post-mutation /
 * post-run DB truth is observed (the server wrote the rows via a different provider).
 */
import { RunView, CompositeKey } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
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

/** Build a GraphQLAIClient bound to the run-scoped client provider. */
export function makeAIClient(provider: IMetadataProvider): GraphQLAIClient {
    // The client suite hands a GraphQLDataProvider as ctx.Provider; bridge the interface to the
    // concrete client (same pattern the memory rig uses). If this bundle is ever dispatched under
    // an in-process (server) provider, RunAIAgent will throw — a loud, honest failure, not a silent pass.
    return new GraphQLAIClient(provider as unknown as GraphQLDataProvider);
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
    planMode?: boolean;
    requestedSkillIDs?: string[];
}

/** Run an agent over the wire; returns the ExecuteAgentResult (never throws — errors become success=false). */
export async function runAgentOverWire(
    client: GraphQLAIClient,
    agent: MJAIAgentEntityExtended,
    messages: WireMessages,
    opts: WireRunOptions = {}
): Promise<ExecuteAgentResult> {
    const params: ExecuteAgentParams = {
        agent,
        conversationMessages: messages,
        conversationDetailId: opts.conversationDetailId,
        planMode: opts.planMode,
        requestedSkillIDs: opts.requestedSkillIDs,
    };
    return client.RunAIAgent(params);
}

/**
 * Resolve the run id: prefer the id the completion event carried; on a fire-and-forget reconcile
 * miss, fall back to the newest AIAgentRun matching `fallbackFilter` (an ExtraFilter). Returns
 * undefined only when neither path yields a run.
 */
export async function resolveRunId(
    result: ExecuteAgentResult,
    user: UserInfo,
    fallbackFilter?: string
): Promise<string | undefined> {
    if (result.agentRun?.ID) {
        return result.agentRun.ID;
    }
    if (!fallbackFilter) {
        return undefined;
    }
    const r = await new RunView().RunView<{ ID: string }>({
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

export async function getRunSteps(runId: string, user: UserInfo): Promise<StepRow[]> {
    const r = await new RunView().RunView<StepRow>({
        EntityName: 'MJ: AI Agent Run Steps',
        ExtraFilter: `AgentRunID='${runId}'`,
        OrderBy: 'StepNumber ASC',
        Fields: ['ID', 'StepNumber', 'StepType', 'StepName', 'Status', 'CompletedAt', 'TargetLogID', 'OutputData'],
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    return r.Success ? (r.Results || []) : [];
}

/** All AIPromptRun rows for a run (fresh), ordered oldest-first. */
export interface PromptRunRow {
    ID: string;
    ModelID: string | null;
    VendorID: string | null;
    Messages: string | null;
    TokensUsed: number | null;
    Success: boolean;
    Status: string;
}

export async function getPromptRuns(runId: string, user: UserInfo): Promise<PromptRunRow[]> {
    const r = await new RunView().RunView<PromptRunRow>({
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `AgentRunID='${runId}'`,
        OrderBy: '__mj_CreatedAt ASC',
        Fields: ['ID', 'ModelID', 'VendorID', 'Messages', 'TokensUsed', 'Success', 'Status'],
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    return r.Success ? (r.Results || []) : [];
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
export async function firstPromptMessages(runId: string, user: UserInfo): Promise<DecodedMessage[]> {
    const steps = await getRunSteps(runId, user);
    const firstPrompt = steps.find(s => s.StepType === 'Prompt' && s.TargetLogID);
    if (!firstPrompt?.TargetLogID) {
        return [];
    }
    const r = await new RunView().RunView<{ Messages: string | null }>({
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
    const rv = new RunView();
    // Prompt runs first (AIPromptRun.AgentRunID FK), then steps, then the run.
    const [promptRuns, steps] = await rv.RunViews<{ ID: string }>([
        { EntityName: 'MJ: AI Prompt Runs', ExtraFilter: `AgentRunID='${runId}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
        { EntityName: 'MJ: AI Agent Run Steps', ExtraFilter: `AgentRunID='${runId}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
    ], user);
    for (const p of (promptRuns.Success ? promptRuns.Results : [])) {
        await deleteById('MJ: AI Prompt Runs', p.ID, provider, user);
    }
    for (const s of (steps.Success ? steps.Results : [])) {
        await deleteById('MJ: AI Agent Run Steps', s.ID, provider, user);
    }
    await deleteById('MJ: AI Agent Runs', runId, provider, user);
}
