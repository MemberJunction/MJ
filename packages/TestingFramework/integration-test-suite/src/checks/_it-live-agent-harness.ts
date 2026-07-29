/**
 * _it-live-agent-harness.ts — shared, non-registering support kit for the live-model agent
 * bundles (`agent-payload-guards`, `agent-artifact-tools`). NOT a `*.checks.ts` file, so it
 * registers nothing on the IntegrationCheckRegistry — it is pulled in transitively when a
 * bundle imports it, and exists purely to keep the two bundles DRY.
 *
 * TRANSPORT: SERVER-IN-PROCESS (Q8). Every agent run executes in-process via AgentRunner.RunAgent
 * — NOT over the GraphQL wire. The headless integration client cannot consume the wire RunAIAgent's
 * fire-and-forget PubSub, and the correlation-heavy checks need a synchronous run handle (the
 * dedicated wire path is IT63 agent-wire-callback). `resolveClient` always returns an invoker and
 * REQUIRES the run's `ctx.User`: it runs against the CLI's SQL provider, whose `CurrentUser` is
 * null, so a run without an explicit contextUser dies in BaseEngine.Load (issue #3251). These
 * bundles are `RequiresLiveModel` and belong to the "Integration Tests — Live Model" suite.
 *
 * DETERMINISM: the model is nondeterministic, the framework is not. Every assertion in the
 * bundles reads deterministic framework state (AIAgentRun/Step Payload snapshots + OutputData,
 * AIPromptRun.Messages/Result), never model prose. This file provides the plumbing:
 *   - a two-phase compliance runner with bounded retries (§3.3 of the proposal);
 *   - marker-isolated starting payloads;
 *   - FK-ordered deep teardown of every run tree a check spawned.
 */
import { RunView, UserInfo, IMetadataProvider } from '@memberjunction/core';
import { AgentRunner } from '@memberjunction/ai-agents';
import { resolveContextUserOrThrow, resolvePromptRunIdsForAgentRuns, requireRows } from './agent-live-shared';
import type { MJAIAgentEntity } from '@memberjunction/core-entities';
import type { ExecuteAgentParams, ExecuteAgentResult } from '@memberjunction/ai-core-plus';

/** Shared fixture tag stamped on every row a bundle creates (safe-to-delete sweep anchor). */
export const IT_FIXTURE_TAG = '(mj-integration-test — safe to delete)';

/** Deterministic framework projection of an AI Agent Run row (read fresh, cache-bypassed). */
export interface AgentRunRow {
    ID: string;
    Status: string | null;
    FinalStep: string | null;
    FinalPayload: string | null;
    ParentRunID: string | null;
    ErrorMessage: string | null;
}

/** Deterministic framework projection of an AI Agent Run Step row. */
export interface AgentStepRow {
    ID: string;
    StepType: string | null;
    Status: string | null;
    TargetLogID: string | null;
    PayloadAtStart: string | null;
    PayloadAtEnd: string | null;
    OutputData: string | null;
    ErrorMessage: string | null;
    FinalPayloadValidationMessages: string | null;
}

/**
 * Deterministic framework projection of an AI Prompt Run row.
 *
 * No AgentRunID member: that column does not exist on AIPromptRun. The owning agent run is
 * recovered through the Prompt step that invoked it — see promptRunIdsFromSteps in agent-live-shared.
 */
export interface PromptRunRow {
    ID: string;
    AgentID: string | null;
    Messages: string | null;
    Result: string | null;
}

/** The `payloadChangeResult` shape base-agent persists into a step's OutputData JSON. */
export interface PayloadChangeResultBlob {
    applied?: { additions?: number; updates?: number; deletions?: number };
    warnings?: string[];
    payloadValidation?: {
        upstreamMergeViolations?: {
            subAgentName?: string;
            attemptedOperations?: Array<{ path?: string; operation?: string; reason?: string }>;
            authorizedPaths?: string[];
            timestamp?: string;
        };
        selfWriteViolations?: {
            deniedOperations?: Array<{ path?: string; operation?: string; reason?: string }>;
            timestamp?: string;
        };
    };
}

/**
 * A server-in-process agent invoker (transport decision Q8 → server for this family; the
 * headless client cannot consume the wire RunAIAgent's fire-and-forget PubSub, and the
 * correlation-heavy checks need a synchronous run handle). Exposes RunAIAgent(params) so
 * every call site is unchanged. Never undefined now — the run always executes in-process.
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
 * pre-#3251 code relied on it and failed every server-in-process run). Always returns an invoker
 * (never undefined — the run always executes in-process).
 */
export function resolveClient(provider: IMetadataProvider, user: UserInfo): AgentInvoker {
    return {
        // async so a missing user surfaces as a REJECTION, never a sync throw — RunAIAgent
        // returns a Promise, and a sync throw would escape a `.catch(...)`-style caller.
        RunAIAgent: async (params: ExecuteAgentParams) => {
            const contextUser = resolveContextUserOrThrow(params.contextUser, user, 'resolveClient');
            return new AgentRunner(provider).RunAgent({
                ...params,
                contextUser,
                provider,
            } as ExecuteAgentParams);
        },
    };
}

/** A short, collision-resistant marker string embedded in each scenario's payload/messages. */
export function newMarker(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Load an agent entity by exact Name (entity_object so it can be handed to ExecuteAgentParams). */
export async function loadAgentByName(
    provider: IMetadataProvider,
    user: UserInfo,
    name: string
): Promise<MJAIAgentEntity | undefined> {
    const r = await new RunView().RunView<MJAIAgentEntity>({
        EntityName: 'MJ: AI Agents',
        ExtraFilter: `Name='${name.replace(/'/g, "''")}'`,
        ResultType: 'entity_object'
    }, user);
    return r.Success && r.Results.length > 0 ? r.Results[0] : undefined;
}

/** Run an agent server-in-process (via the resolveClient invoker) and return the completed result. */
export async function runAgentClient(
    client: AgentInvoker,
    agent: MJAIAgentEntity,
    userMessage: string,
    payload?: Record<string, unknown>
): Promise<ExecuteAgentResult> {
    const params = {
        agent,
        conversationMessages: [{ role: 'user', content: userMessage }],
        ...(payload !== undefined ? { payload } : {})
    } as unknown as ExecuteAgentParams;
    return client.RunAIAgent(params);
}

/** Extract the persisted root run ID from a completed client result (undefined if none persisted). */
export function runIdOf(result: ExecuteAgentResult): string | undefined {
    const run = (result as unknown as { agentRun?: { ID?: string } }).agentRun;
    return run?.ID;
}

/** Let the fire-and-forget step/prompt-run saves flush before reading back. */
export function settle(ms = 1500): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

/** Read a single run row fresh. */
export async function readRun(provider: IMetadataProvider, user: UserInfo, runId: string): Promise<AgentRunRow | undefined> {
    const r = await new RunView().RunView<AgentRunRow>({
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: `ID='${runId}'`,
        Fields: ['ID', 'Status', 'FinalStep', 'FinalPayload', 'ParentRunID', 'ErrorMessage'],
        ResultType: 'simple',
        BypassCache: true
    }, user);
    // undefined means the run genuinely is not there; a broken query throws rather than
    // impersonating an absent run and failing a later assertion for the wrong reason.
    return requireRows(r, `run read for ${runId}`)[0];
}

/** Read every step of a run fresh, oldest first. */
export async function readSteps(provider: IMetadataProvider, user: UserInfo, runId: string): Promise<AgentStepRow[]> {
    const r = await new RunView().RunView<AgentStepRow>({
        EntityName: 'MJ: AI Agent Run Steps',
        ExtraFilter: `AgentRunID='${runId}'`,
        Fields: ['ID', 'StepType', 'Status', 'TargetLogID', 'PayloadAtStart', 'PayloadAtEnd', 'OutputData', 'ErrorMessage', 'FinalPayloadValidationMessages'],
        OrderBy: '__mj_CreatedAt ASC',
        ResultType: 'simple',
        BypassCache: true
    }, user);
    return requireRows(r, `step read for run ${runId}`);
}

/** Read the prompt runs a given agent produced within a run tree (its raw model responses live here). */
export async function readPromptRunsForAgent(
    provider: IMetadataProvider,
    user: UserInfo,
    agentRunIds: string[],
    agentId: string
): Promise<PromptRunRow[]> {
    if (agentRunIds.length === 0) return [];
    // The runs' Prompt steps are the only path to their prompt runs (AIPromptRun has no
    // AgentRunID). AgentID still narrows to the agent that owns them, which is what makes this
    // "for agent" — a sub-agent's prompt runs hang off the same run tree.
    const promptRunIds = await resolvePromptRunIdsForAgentRuns(agentRunIds, user);
    if (promptRunIds.length === 0) return [];
    const r = await new RunView().RunView<PromptRunRow>({
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `ID IN (${promptRunIds.map((id) => `'${id}'`).join(',')}) AND AgentID='${agentId}'`,
        Fields: ['ID', 'AgentID', 'Messages', 'Result'],
        ResultType: 'simple',
        BypassCache: true
    }, user);
    return requireRows(r, `prompt-run read for agent ${agentId}`);
}

/** BFS the ParentRunID tree from a root, returning every run ID (root first). Bounded to avoid cycles. */
export async function collectRunTree(provider: IMetadataProvider, user: UserInfo, rootRunId: string): Promise<string[]> {
    const all: string[] = [rootRunId];
    let frontier = [rootRunId];
    let guard = 0;
    while (frontier.length > 0 && guard++ < 12) {
        const inList = frontier.map((id) => `'${id}'`).join(',');
        const r = await new RunView().RunView<{ ID: string }>({
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: `ParentRunID IN (${inList})`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true
        }, user);
        const kids = (r.Success ? r.Results : []).map((x) => x.ID).filter((id) => !all.includes(id));
        all.push(...kids);
        frontier = kids;
    }
    return all;
}

/** Parse the `payloadChangeResult` blob out of a step's OutputData JSON, if present. */
export function parseStepPayloadChange(step: AgentStepRow): PayloadChangeResultBlob | undefined {
    if (!step.OutputData) return undefined;
    try {
        const parsed = JSON.parse(step.OutputData) as { payloadChangeResult?: PayloadChangeResultBlob };
        return parsed.payloadChangeResult;
    } catch {
        return undefined;
    }
}

/** Safe JSON.parse to a record; returns {} on failure. */
export function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
    if (!raw) return {};
    try {
        const v = JSON.parse(raw);
        return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

/**
 * FK-ordered deep teardown of every run tree a check spawned: for each run in the tree we delete
 * its steps, then its prompt runs, then the runs child-first. Best-effort — never throws — so a
 * failed check still cleans up. Deletes are done via entity_object loads so BaseEntity.Delete()
 * (and its cascade/validation) runs, matching the memory rig's self-clean discipline.
 */
export async function deepDeleteRunTrees(provider: IMetadataProvider, user: UserInfo, rootRunIds: string[]): Promise<void> {
    const runIds = new Set<string>();
    for (const root of rootRunIds) {
        try {
            for (const id of await collectRunTree(provider, user, root)) runIds.add(id);
        } catch { /* best-effort */ }
    }
    const ids = [...runIds];
    if (ids.length === 0) return;
    const inList = ids.map((id) => `'${id}'`).join(',');

    // 1. Resolve prompt runs BEFORE deleting steps. AIPromptRun has no AgentRunID, so the Prompt
    //    steps are the only path to these rows — deleting the steps first orphans them permanently.
    let promptRunIds: string[] = [];
    try {
        promptRunIds = await resolvePromptRunIdsForAgentRuns(ids, user);
    } catch (e) {
        // Best-effort teardown: keep purging what we can reach, but never silently.
        console.error(`deepDeleteRunTrees: prompt-run resolution failed, prompt runs may leak: ${e instanceof Error ? e.message : String(e)}`);
    }
    // 2. Steps of every run in the trees.
    await deleteMatching(provider, user, 'MJ: AI Agent Run Steps', `AgentRunID IN (${inList})`);
    // 3. The prompt runs resolved in step 1, addressed by their own primary key.
    if (promptRunIds.length > 0) {
        await deleteMatching(provider, user, 'MJ: AI Prompt Runs', `ID IN (${promptRunIds.map((id) => `'${id}'`).join(',')})`);
    }
    // 4. The runs themselves, child-first (reverse collection order puts descendants before roots).
    for (const id of [...ids].reverse()) {
        await deleteMatching(provider, user, 'MJ: AI Agent Runs', `ID='${id}'`);
    }
}

/** Load matching rows as entity objects and Delete() each; failures are logged, never thrown. */
export async function deleteMatching(
    provider: IMetadataProvider,
    user: UserInfo,
    entityName: string,
    filter: string
): Promise<void> {
    try {
        const r = await new RunView().RunView<{ Delete(): Promise<boolean> }>({
            EntityName: entityName,
            ExtraFilter: filter,
            ResultType: 'entity_object',
            BypassCache: true
        }, user);
        if (r.Success) {
            for (const row of r.Results) {
                try { await row.Delete(); } catch (e) { console.error(`[it-live-harness] delete ${entityName} failed:`, e); }
            }
        }
    } catch (e) {
        console.error(`[it-live-harness] sweep ${entityName} failed:`, e);
    }
}

/**
 * Two-phase compliance runner (§3.3). Runs `scenario` (which returns the persisted root run ID or
 * undefined), then evaluates `isCompliant` from persisted artifacts (Phase P). On non-compliance
 * it retries with a fresh scenario up to `maxAttempts` total, then throws `model-noncompliance:`.
 * The FIRST compliant attempt's run ID is returned so Phase A (framework assertions, never retried)
 * runs against a run that provably attempted the guarded behavior — the anti-vacuity guarantee.
 */
export async function runWithCompliance(
    scenario: () => Promise<string | undefined>,
    isCompliant: (rootRunId: string) => Promise<boolean>,
    label: string,
    maxAttempts = 3
): Promise<string> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const runId = await scenario();
        // No run landed at all = an EXECUTION failure (harness or product), NOT model variance.
        // Fail immediately with an `agent-run-failed:` prefix so §4.6 triage classifies it correctly
        // and we don't burn live-model retries on a structurally doomed run (#3251 — this is exactly
        // how the contextUser defect hid behind IT56/IT57's `model-noncompliance:` reports). The
        // run's own ErrorMessage isn't available here (scenario surfaces only the run id) — read the
        // persisted run row to get it.
        if (!runId) {
            throw new Error(
                `agent-run-failed: ${label} — the agent run never landed (no run id) on attempt ` +
                `${attempt}/${maxAttempts}; this is an execution failure, not model variance. ` +
                `Read the run's ErrorMessage.`);
        }
        if (await isCompliant(runId)) {
            if (attempt > 1) console.warn(`  ↻ ${label} — model complied on attempt ${attempt}/${maxAttempts}`);
            return runId;
        }
        console.warn(`  ↻ ${label} — attempt ${attempt}/${maxAttempts} non-compliant (runId=${runId})`);
    }
    throw new Error(`model-noncompliance: ${label} — the model never took the instructed action after ${maxAttempts} attempts. Fix the prompt, not the check.`);
}
