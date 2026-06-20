/**
 * ai-bootstrap.ts — shared infrastructure for the live AGENT / PROMPT integration scripts.
 *
 * Builds on lib/harness.ts (config + TestRunner + Assert) and adds:
 *  - bootstrapAI(): the real server provider stack (SQLServerDataProvider against live SQL Server,
 *    exactly as MJAPI bootstraps it) + AIEngine.Config so prompts/agents/models are loaded. Pulls in
 *    @memberjunction/server-bootstrap so the LLM provider drivers (OpenAILLM, AnthropicLLM, …) and the
 *    agent-type / prompt drivers are registered on the ClassFactory.
 *  - Deep persistence verifiers: after a real run, fetch the persisted records and assert the OUTPUT is
 *    correct — AI Prompt Runs, AI Agent Runs, AI Agent Run Steps (each terminal + CompletedAt set, never
 *    stuck at 'Running'), and the Action Execution Logs / child runs the steps point at via TargetLogID.
 *    This doubles as the live end-to-end regression guard for the fire-and-forget BaseEntitySaveQueue.
 *
 * NOT part of the MJServer build — executed directly via tsx from the repo root. See ../README.md.
 */
import sql from 'mssql';
import { LoadEnv, LoadDbConfig, Assert } from './harness';
import { RunView, UserInfo } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { AIEngine } from '@memberjunction/aiengine';
// Registers entity subclasses + the AI provider / agent-type / prompt drivers needed to run prompts and
// agents. The "lite" bootstrap deliberately EXCLUDES @memberjunction/server, so importing it does not drag
// in MJServer's full config validation (which the full server-bootstrap does) — we only need the registry.
import '@memberjunction/server-bootstrap-lite';

export interface AICtx {
    pool: sql.ConnectionPool;
    user: UserInfo;
}

/** Bootstraps the live provider stack + AIEngine. Reuses the DB resolution the cache suites use. */
export async function bootstrapAI(): Promise<AICtx> {
    LoadEnv();
    const db = await LoadDbConfig();
    const pool = await new sql.ConnectionPool({
        server: db.Host,
        port: db.Port,
        user: db.User,
        password: db.Password,
        database: db.Database,
        options: { encrypt: false, trustServerCertificate: true },
    }).connect();

    await setupSQLServerClient(new SQLServerProviderConfigData(pool, db.Schema));
    await UserCache.Instance.Refresh(pool);

    const email = process.env.MJ_TEST_USER_EMAIL?.toLowerCase();
    const user =
        (email ? UserCache.Users.find((u) => u.Email?.toLowerCase() === email) : undefined)
        ?? UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner')
        ?? UserCache.Users[0];
    if (!user) {
        throw new Error('No context user found in UserCache. Set MJ_TEST_USER_EMAIL in .env.');
    }

    await AIEngine.Instance.Config(false, user);
    return { pool, user };
}

// ────────────────────────────────────────────────────────────────────────────
// Persisted-record fetch + assertions ("verify the run output is correct")
// ────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
/** Truly-finished states whose row MUST carry a CompletedAt (the save-queue finalize guarantee). */
const TERMINAL = new Set(['Completed', 'Failed', 'Cancelled']);
/** Agent runs additionally have intentional suspend states — valid, NOT the "stuck at Running" bug. */
const SUSPENDED = new Set(['AwaitingFeedback', 'Paused']);
/** An agent run "ran without error" if it completed or intentionally suspended (awaiting feedback/paused). */
const RAN_OK = new Set(['Completed', 'AwaitingFeedback', 'Paused']);

/** Sleep — used to let fire-and-forget run/step/log saves land before we read them back. */
export const settle = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Fetches a single row by ID via the real RunView pipeline (BypassCache = true DB state), asserting one match. */
async function fetchById(entity: string, id: string, user: UserInfo): Promise<Row> {
    const result = await new RunView().RunView({ EntityName: entity, ExtraFilter: `ID='${id}'`, ResultType: 'simple', BypassCache: true }, user);
    Assert(result.Success, `RunView('${entity}') failed: ${result.ErrorMessage}`);
    Assert(result.Results.length === 1, `${entity} ${id} not found (got ${result.Results.length} rows)`);
    return result.Results[0] as Row;
}

/**
 * Verifies an `MJ: AI Prompt Runs` row finalized correctly: terminal Status, **CompletedAt set** (the
 * "stuck at Running" guard the save queue prevents), and on success a non-empty Result + recorded timing.
 */
export async function verifyPromptRun(promptRunID: string, user: UserInfo): Promise<Row> {
    const row = await fetchById('MJ: AI Prompt Runs', promptRunID, user);
    Assert(TERMINAL.has(String(row.Status)), `Prompt run ${promptRunID}: non-terminal Status '${row.Status}' (stuck at Running?)`);
    Assert(row.CompletedAt != null, `Prompt run ${promptRunID}: CompletedAt is null while Status='${row.Status}' (finalize save lost)`);
    if (row.Success === true) {
        Assert(row.Result != null && String(row.Result).length > 0, `Prompt run ${promptRunID}: succeeded but Result is empty`);
        Assert(Number(row.ExecutionTimeMS) > 0, `Prompt run ${promptRunID}: succeeded but ExecutionTimeMS not recorded`);
    }
    return row;
}

/** Verifies an `MJ: Action Execution Logs` row finalized: **EndedAt set** + a ResultCode recorded. */
export async function verifyActionLog(logID: string, user: UserInfo): Promise<Row> {
    const row = await fetchById('MJ: Action Execution Logs', logID, user);
    Assert(row.EndedAt != null, `Action log ${logID}: EndedAt is null (stuck 'Running' — the action-log finalize bug class)`);
    Assert(row.ResultCode != null && String(row.ResultCode).length > 0, `Action log ${logID}: no ResultCode recorded`);
    return row;
}

export interface AgentRunVerification {
    run: Row;
    stepCount: number;
    promptRunsVerified: number;
    actionLogsVerified: number;
    subAgentRunsVerified: number;
}

/**
 * Deep-verifies an agent run end to end: the `MJ: AI Agent Runs` header, every `MJ: AI Agent Run Steps`
 * row (each terminal + CompletedAt set — never stuck at Running), and the records each step points at via
 * TargetLogID — Prompt steps → AI Prompt Runs, Actions/Tool steps → Action Execution Logs, Sub-Agent steps
 * → child AI Agent Runs (recursively). `expectSuccess` asserts the run reached 'Completed'.
 */
export async function verifyAgentRun(agentRunID: string, user: UserInfo, expectSuccess = true): Promise<AgentRunVerification> {
    const run = await fetchById('MJ: AI Agent Runs', agentRunID, user);
    const status = String(run.Status);
    // The actual "stuck at Running" guard: a finalized run is anything except still-Running.
    Assert(status !== 'Running', `Agent run ${agentRunID}: still 'Running' (never finalized — the stuck-at-Running bug)`);
    // CompletedAt is required only for the truly-done states; AwaitingFeedback/Paused legitimately suspend without it.
    if (TERMINAL.has(status)) {
        Assert(run.CompletedAt != null, `Agent run ${agentRunID}: CompletedAt is null while Status='${status}' (finalize save lost)`);
    }
    if (expectSuccess) {
        Assert(RAN_OK.has(status), `Agent run ${agentRunID}: expected Completed/AwaitingFeedback/Paused, got '${status}' (${run.ErrorMessage ?? ''})`);
    }

    const stepsResult = await new RunView().RunView({
        EntityName: 'MJ: AI Agent Run Steps',
        ExtraFilter: `AgentRunID='${agentRunID}'`,
        OrderBy: 'StepNumber',
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    Assert(stepsResult.Success, `RunView agent run steps failed: ${stepsResult.ErrorMessage}`);
    const steps = stepsResult.Results as Row[];

    let promptRunsVerified = 0;
    let actionLogsVerified = 0;
    let subAgentRunsVerified = 0;
    for (const step of steps) {
        const label = `${step.StepType}/${step.StepName ?? ''}`;
        // The save-queue guarantee: every step must have finalized, never stuck at Running.
        Assert(TERMINAL.has(String(step.Status)), `Agent run ${agentRunID} step '${label}': non-terminal Status '${step.Status}' (stuck at Running)`);
        Assert(step.CompletedAt != null, `Agent run ${agentRunID} step '${label}': CompletedAt is null while Status='${step.Status}' (the exact stuck-at-Running bug)`);

        const target = step.TargetLogID ? String(step.TargetLogID) : null;
        if (!target) {
            continue;
        }
        if (step.StepType === 'Prompt') {
            await verifyPromptRun(target, user);
            promptRunsVerified++;
        } else if (step.StepType === 'Actions' || step.StepType === 'Tool') {
            await verifyActionLog(target, user);
            actionLogsVerified++;
        } else if (step.StepType === 'Sub-Agent') {
            await verifyAgentRun(target, user, false); // child success is the child's own concern
            subAgentRunsVerified++;
        }
    }

    return { run, stepCount: steps.length, promptRunsVerified, actionLogsVerified, subAgentRunsVerified };
}
