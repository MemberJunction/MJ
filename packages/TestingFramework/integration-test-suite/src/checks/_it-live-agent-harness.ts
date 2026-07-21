/**
 * _it-live-agent-harness.ts — shared, non-registering support kit for the live-model agent
 * bundles (`agent-payload-guards`, `agent-artifact-tools`). NOT a `*.checks.ts` file, so it
 * registers nothing on the IntegrationCheckRegistry — it is pulled in transitively when a
 * bundle imports it, and exists purely to keep the two bundles DRY.
 *
 * TRANSPORT: CLIENT-FIRST. Every agent run goes over the GraphQL wire (GraphQLAIClient → live
 * MJAPI), exactly like the agent-memory rig (`rigs/agent-memory-tests.ts`), so serialization,
 * the resolver auth/scope layer, and transport framing are exercised. When the bundle is driven
 * under a non-GraphQL (server-in-process) provider, `resolveClient` returns undefined and the
 * caller skips-as-pass loudly — these bundles are `RequiresLiveModel` and belong to the
 * "Integration Tests — Live Model" suite, which runs client transport per doctrine.
 *
 * DETERMINISM: the model is nondeterministic, the framework is not. Every assertion in the
 * bundles reads deterministic framework state (AIAgentRun/Step Payload snapshots + OutputData,
 * AIPromptRun.Messages/Result), never model prose. This file provides the plumbing:
 *   - a two-phase compliance runner with bounded retries (§3.3 of the proposal);
 *   - marker-isolated starting payloads;
 *   - FK-ordered deep teardown of every run tree a check spawned.
 */
import { RunView, UserInfo, IMetadataProvider } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
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

/** Deterministic framework projection of an AI Prompt Run row. */
export interface PromptRunRow {
    ID: string;
    AgentID: string | null;
    AgentRunID: string | null;
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

/** Resolve the GraphQL client when the bundle is driven over client transport; undefined otherwise. */
export function resolveClient(provider: IMetadataProvider): GraphQLAIClient | undefined {
    if (provider instanceof GraphQLDataProvider) {
        return new GraphQLAIClient(provider);
    }
    return undefined;
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

/** Run an agent over the wire and return the completed result. Errors are captured, never thrown. */
export async function runAgentClient(
    client: GraphQLAIClient,
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
    return r.Success && r.Results.length > 0 ? r.Results[0] : undefined;
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
    return r.Success ? r.Results : [];
}

/** Read the prompt runs a given agent produced within a run tree (its raw model responses live here). */
export async function readPromptRunsForAgent(
    provider: IMetadataProvider,
    user: UserInfo,
    agentRunIds: string[],
    agentId: string
): Promise<PromptRunRow[]> {
    if (agentRunIds.length === 0) return [];
    const inList = agentRunIds.map((id) => `'${id}'`).join(',');
    const r = await new RunView().RunView<PromptRunRow>({
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `AgentRunID IN (${inList}) AND AgentID='${agentId}'`,
        Fields: ['ID', 'AgentID', 'AgentRunID', 'Messages', 'Result'],
        ResultType: 'simple',
        BypassCache: true
    }, user);
    return r.Success ? r.Results : [];
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

    // 1. Steps of every run in the trees.
    await deleteMatching(provider, user, 'MJ: AI Agent Run Steps', `AgentRunID IN (${inList})`);
    // 2. Prompt runs of every run in the trees.
    await deleteMatching(provider, user, 'MJ: AI Prompt Runs', `AgentRunID IN (${inList})`);
    // 3. The runs themselves, child-first (reverse collection order puts descendants before roots).
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
    let lastRunId: string | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const runId = await scenario();
        lastRunId = runId;
        if (runId && (await isCompliant(runId))) {
            if (attempt > 1) console.warn(`  ↻ ${label} — model complied on attempt ${attempt}/${maxAttempts}`);
            return runId;
        }
        console.warn(`  ↻ ${label} — attempt ${attempt}/${maxAttempts} non-compliant (runId=${runId ?? 'none'})`);
    }
    throw new Error(`model-noncompliance: ${label} — the model never took the instructed action after ${maxAttempts} attempts (last runId=${lastRunId ?? 'none'}). Fix the prompt, not the check.`);
}
