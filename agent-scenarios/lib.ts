/**
 * agent-scenarios/lib.ts — shared harness for the 14 Sage agent scenarios.
 *
 * Why this file:
 *   Each scenario does the same boring scaffolding (DB pool, MJ bootstrap,
 *   prompt capture, baseline Sage tool-swap, teardown). Centralizing it here
 *   lets each scenario file express only its unique seed/action/assert.
 *
 * Usage from a scenario file:
 *   import { runScenario, Scenario } from './lib';
 *   const scenario: Scenario = { id: 's01', name: '...', setup, action, assert, teardown };
 *   runScenario(scenario);
 */

import * as path from 'node:path';
import * as dotenv from 'dotenv';
import * as sql from 'mssql';

// MJAPI .env — DB creds + LLM keys. Must load BEFORE MJ imports.
dotenv.config({
    path: path.resolve(process.env.MJAPI_ENV_PATH ?? '/Users/arieglazier/repos/MJ_20260427/packages/MJAPI/.env'),
});

import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentRunner } from '@memberjunction/ai-agents';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import {
    MJAIAgentEntity,
    SearchEngineBase,
} from '@memberjunction/core-entities';

import '@memberjunction/server-bootstrap/mj-class-registrations';

// ── Constants ────────────────────────────────────────────────────────────────
export const SAGE_AGENT_ID = '3AB78346-897F-4238-AA6A-F10A131CC691';
export const RAG_AUDIT_SCOPE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01';
export const SEARCH_ACTION_ID = '449cf6f8-2418-4c58-9eae-5d67a9c76639';
export const SCOPED_SEARCH_ACTION_ID = '3671fce1-e4a1-4ab2-83e8-552d19e80a4f';
export const ARIE_EMAIL = 'arie.glazier@bluecypress.io';
export const SEED_MARKER = 'AGENTSCENARIO-MARKER';
export const SEED_PREFIX = 'AgentScenario-Seed';

// ── Types ────────────────────────────────────────────────────────────────────
export interface ScenarioContext {
    pool: sql.ConnectionPool;
    arie: UserInfo;
    sage: MJAIAgentEntity;
    promptCaptures: CapturedPrompt[];
}
export interface CapturedPrompt {
    chatMessages: Array<{ role: string; content: string }>;
    timestamp: number;
}
export interface ScenarioRunResult {
    success: boolean;
    agentRunID: string | undefined;
    elapsedMs: number;
    errorMessage?: string;
}
export interface Scenario {
    id: string;
    name: string;
    /** What surface this scenario exercises. Free text for the report. */
    exercises: string;
    /** Skip this scenario when the env var named here is missing. */
    skipIfMissingEnv?: string;
    /** DB seeds + permission/agent state. Runs BEFORE MJ bootstrap. */
    setup: (pool: sql.ConnectionPool) => Promise<unknown>;
    /** Run the agent (or whatever invocation this scenario is testing). */
    action: (ctx: ScenarioContext, setupResult: unknown) => Promise<ScenarioRunResult | ScenarioRunResult[]>;
    /** Scenario-specific proofs. */
    assert: (ctx: ScenarioContext, runResult: ScenarioRunResult | ScenarioRunResult[], setupResult: unknown) => Promise<void>;
    /** Revert all mutations. Runs in finally — must be idempotent. */
    teardown: (pool: sql.ConnectionPool, setupResult: unknown) => Promise<void>;
}

// ── Tiny assertion helpers ───────────────────────────────────────────────────
let passCount = 0;
let failCount = 0;
export function pass(msg: string): void { console.log(`  ✓ ${msg}`); passCount++; }
export function fail(msg: string): void { console.log(`  ✗ ${msg}`); failCount++; }
export function assert(cond: unknown, msg: string): void { cond ? pass(msg) : fail(msg); }
export function step(msg: string): void { console.log(`\n— ${msg}`); }
export function getCounts(): { pass: number; fail: number } { return { pass: passCount, fail: failCount }; }
export function resetCounts(): void { passCount = 0; failCount = 0; }

// ── DB pool ──────────────────────────────────────────────────────────────────
export async function bootstrapDBPool(): Promise<sql.ConnectionPool> {
    const cfg: sql.config = {
        server: process.env.DB_HOST!,
        port: Number(process.env.DB_PORT) || 1444,
        database: process.env.DB_DATABASE!,
        user: process.env.DB_USERNAME!,
        password: process.env.DB_PASSWORD!,
        options: {
            trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
            encrypt: false,
        },
    };
    const pool = new sql.ConnectionPool(cfg);
    await pool.connect();
    return pool;
}

// ── MJ bootstrap ─────────────────────────────────────────────────────────────
export async function bootstrapMJ(pool: sql.ConnectionPool): Promise<{ arie: UserInfo; sage: MJAIAgentEntity }> {
    const providerConfig = new SQLServerProviderConfigData(pool, '__mj', 0);
    await setupSQLServerClient(providerConfig);

    const md = new Metadata();
    const userRow = (await pool.request().query(`
        SELECT ID, Email, Name, FirstName, LastName, Type, IsActive
        FROM __mj.[User] WHERE Email='${ARIE_EMAIL}';
    `)).recordset[0];
    if (!userRow) throw new Error(`User ${ARIE_EMAIL} not found`);
    const userRolesRows = (await pool.request().query(`
        SELECT ur.ID, ur.UserID, ur.RoleID, r.Name AS Role
        FROM __mj.UserRole ur JOIN __mj.Role r ON ur.RoleID = r.ID
        WHERE ur.UserID='${userRow.ID}';
    `)).recordset;

    const arie = new UserInfo(md.Provider, {
        ...userRow,
        UserRoles: userRolesRows,
    } as ConstructorParameters<typeof UserInfo>[1]);

    // Multi-provider migration (v5.31+): explicit AIEngine.Config is now required.
    // The fast-start cache used to populate Agents lazily on first access; the
    // refactor moved that into AIEngineBase which requires Config() to be invoked
    // explicitly with a contextUser.
    await AIEngine.Instance.Config(false, arie);

    const sage = AIEngine.Instance.Agents.find(a => a.ID.toUpperCase() === SAGE_AGENT_ID.toUpperCase());
    if (!sage) throw new Error(`Sage agent not found in AIEngine`);
    return { arie, sage: sage as unknown as MJAIAgentEntity };
}

// ── Baseline Sage mutation (called by most scenarios) ────────────────────────
// All Sage-driven scenarios need: SearchScopeAccess flipped to 'Assigned',
// the "Search" tool swapped to "Scoped Search", and an AIAgentSearchScope row
// connecting Sage to whatever scope the scenario uses. Returns the original
// values so teardown can restore them.
export interface BaselineSnapshot {
    originalSearchScopeAccess: string | null;
    swappedAgentActionID: string | null;
    insertedAgentScopeIDs: string[];
}
export async function applySageBaseline(
    pool: sql.ConnectionPool,
    scopeIDs: string[],
    options: { phase?: 'PreExecution' | 'AgentInvoked' | 'Both'; searchScopeAccess?: 'Assigned' | 'All' | 'None' } = {},
): Promise<BaselineSnapshot> {
    const phase = options.phase ?? 'Both';
    const access = options.searchScopeAccess ?? 'Assigned';

    // Capture + flip SearchScopeAccess
    const sageRow = (await pool.request().query(`
        SELECT SearchScopeAccess FROM __mj.AIAgent WHERE ID='${SAGE_AGENT_ID}';
    `)).recordset[0];
    const originalSearchScopeAccess = sageRow?.SearchScopeAccess ?? null;
    await pool.request().query(`
        UPDATE __mj.AIAgent SET SearchScopeAccess='${access}' WHERE ID='${SAGE_AGENT_ID}';
    `);

    // Swap Search → Scoped Search in Sage's tool list
    const aaLookup = await pool.request().query(`
        SELECT ID FROM __mj.AIAgentAction
        WHERE AgentID='${SAGE_AGENT_ID}' AND ActionID='${SEARCH_ACTION_ID}';
    `);
    const swappedAgentActionID: string | null = aaLookup.recordset[0]?.ID ?? null;
    if (swappedAgentActionID) {
        await pool.request().query(`
            UPDATE __mj.AIAgentAction SET ActionID='${SCOPED_SEARCH_ACTION_ID}'
            WHERE ID='${swappedAgentActionID}';
        `);
    }

    // Wire Sage to each scope
    const insertedAgentScopeIDs: string[] = [];
    for (const scopeID of scopeIDs) {
        // Ensure no leftover row
        await pool.request().query(`
            DELETE FROM __mj.AIAgentSearchScope
            WHERE AgentID='${SAGE_AGENT_ID}' AND SearchScopeID='${scopeID}';
        `);
        const r = await pool.request().query(`
            INSERT INTO __mj.AIAgentSearchScope (AgentID, SearchScopeID, Phase, Status)
            OUTPUT INSERTED.ID
            VALUES ('${SAGE_AGENT_ID}', '${scopeID}', '${phase}', 'Active');
        `);
        insertedAgentScopeIDs.push(r.recordset[0].ID);
    }

    return { originalSearchScopeAccess, swappedAgentActionID, insertedAgentScopeIDs };
}
export async function revertSageBaseline(pool: sql.ConnectionPool, snap: BaselineSnapshot): Promise<void> {
    if (snap.originalSearchScopeAccess) {
        await pool.request().query(`
            UPDATE __mj.AIAgent SET SearchScopeAccess='${snap.originalSearchScopeAccess}'
            WHERE ID='${SAGE_AGENT_ID}';
        `);
    }
    if (snap.swappedAgentActionID) {
        await pool.request().query(`
            UPDATE __mj.AIAgentAction SET ActionID='${SEARCH_ACTION_ID}'
            WHERE ID='${snap.swappedAgentActionID}';
        `);
    }
    for (const id of snap.insertedAgentScopeIDs) {
        await pool.request().query(`DELETE FROM __mj.AIAgentSearchScope WHERE ID='${id}';`).catch(() => {});
    }
}

// ── Permission helpers ───────────────────────────────────────────────────────
export async function grantUser(
    pool: sql.ConnectionPool,
    userID: string,
    scopeID: string,
    level: 'None' | 'Read' | 'Search' | 'Manage',
): Promise<void> {
    await pool.request().query(`
        DELETE FROM __mj.SearchScopePermission
        WHERE SearchScopeID='${scopeID}' AND UserID='${userID}';
    `);
    await pool.request().query(`
        INSERT INTO __mj.SearchScopePermission (SearchScopeID, UserID, PermissionLevel)
        VALUES ('${scopeID}', '${userID}', '${level}');
    `);
}
export async function grantRole(
    pool: sql.ConnectionPool,
    roleID: string,
    scopeID: string,
    level: 'None' | 'Read' | 'Search' | 'Manage',
): Promise<void> {
    await pool.request().query(`
        DELETE FROM __mj.SearchScopePermission
        WHERE SearchScopeID='${scopeID}' AND RoleID='${roleID}';
    `);
    await pool.request().query(`
        INSERT INTO __mj.SearchScopePermission (SearchScopeID, RoleID, PermissionLevel)
        VALUES ('${scopeID}', '${roleID}', '${level}');
    `);
}
export async function clearPermissionsForScope(pool: sql.ConnectionPool, scopeID: string): Promise<void> {
    await pool.request().query(`
        DELETE FROM __mj.SearchScopePermission WHERE SearchScopeID='${scopeID}';
    `);
}

// ── Seed helpers ─────────────────────────────────────────────────────────────
/** Insert N Action records with deterministic names + descriptions. */
export async function seedActions(pool: sql.ConnectionPool, scenarioID: string, count: number): Promise<string[]> {
    const cat = (await pool.request().query(`
        SELECT TOP 1 ID FROM __mj.ActionCategory ORDER BY Name;
    `)).recordset[0];
    if (!cat) throw new Error('No ActionCategory rows in DB');
    const ids: string[] = [];
    for (let i = 1; i <= count; i++) {
        const r = await pool.request()
            .input('cat', sql.UniqueIdentifier, cat.ID)
            .input('name', sql.NVarChar, `${SEED_PREFIX}-${scenarioID}-${i}`)
            .input('desc', sql.NVarChar, `${SEED_MARKER} ${scenarioID} action ${i}`)
            .query(`
                INSERT INTO __mj.Action (CategoryID, Name, Description, Type, Status, IconClass)
                OUTPUT INSERTED.ID
                VALUES (@cat, @name, @desc, 'Custom', 'Pending', 'fa-solid fa-flask');
            `);
        ids.push(r.recordset[0].ID);
    }
    return ids;
}
export async function deleteSeededActions(pool: sql.ConnectionPool, scenarioID: string): Promise<number> {
    const r = await pool.request().query(`
        DELETE FROM __mj.Action WHERE Name LIKE '${SEED_PREFIX}-${scenarioID}-%';
        SELECT @@ROWCOUNT AS RowsAffected;
    `);
    return r.recordset[0]?.RowsAffected ?? 0;
}
/** Idempotent: ensure scope has a SearchScopeEntity row pointing at MJ: Actions. */
export async function ensureScopeIncludesActions(pool: sql.ConnectionPool, scopeID: string): Promise<void> {
    const ent = (await pool.request().query(`
        SELECT ID FROM __mj.Entity WHERE Name='MJ: Actions';
    `)).recordset[0];
    if (!ent) throw new Error('Entity "MJ: Actions" not found');
    const existing = await pool.request().query(`
        SELECT ID FROM __mj.SearchScopeEntity
        WHERE SearchScopeID='${scopeID}' AND EntityID='${ent.ID}';
    `);
    if (existing.recordset.length === 0) {
        await pool.request().query(`
            INSERT INTO __mj.SearchScopeEntity (SearchScopeID, EntityID)
            VALUES ('${scopeID}', '${ent.ID}');
        `);
    }
}
/** Clear SearchExecutionLog rows for a given agent + scope so assertions only see this run. */
export async function clearSearchLog(pool: sql.ConnectionPool, agentID: string, scopeID?: string): Promise<void> {
    const scopeFilter = scopeID ? `AND SearchScopeID='${scopeID}'` : '';
    await pool.request().query(`
        DELETE FROM __mj.SearchExecutionLog
        WHERE AIAgentID='${agentID}' ${scopeFilter};
    `);
}

// ── Prompt capture ───────────────────────────────────────────────────────────
export function installPromptCapture(): { captures: CapturedPrompt[]; restore: () => void } {
    const captures: CapturedPrompt[] = [];
    const proto = AIPromptRunner.prototype as unknown as Record<string, unknown>;
    const original = proto.ExecutePrompt as (...args: unknown[]) => Promise<unknown>;
    proto.ExecutePrompt = async function (this: AIPromptRunner, ...args: unknown[]): Promise<unknown> {
        const params = args[0] as { conversationMessages?: unknown; chatMessages?: unknown } | undefined;
        const messages = (params?.conversationMessages ?? params?.chatMessages ?? []) as Array<{ role: string; content: string }>;
        captures.push({
            chatMessages: messages.map(m => ({ role: m.role, content: String(m.content ?? '') })),
            timestamp: Date.now(),
        });
        return await original.apply(this, args);
    };
    return { captures, restore: () => { proto.ExecutePrompt = original; } };
}

// ── Run agent shorthand ──────────────────────────────────────────────────────
export async function runAgent(
    sage: MJAIAgentEntity,
    arie: UserInfo,
    userMessage: string,
): Promise<ScenarioRunResult> {
    const t0 = Date.now();
    try {
        const result = await new AgentRunner().RunAgent({
            agent: sage,
            contextUser: arie,
            conversationMessages: [
                { role: 'user', content: userMessage } as Parameters<AgentRunner['RunAgent']>[0]['conversationMessages'][number],
            ],
        });
        return {
            success: !!result.success,
            agentRunID: (result as { agentRun?: { ID?: string } }).agentRun?.ID,
            elapsedMs: Date.now() - t0,
            errorMessage: (result as { errorMessage?: string }).errorMessage,
        };
    } catch (err) {
        return {
            success: false,
            agentRunID: undefined,
            elapsedMs: Date.now() - t0,
            errorMessage: err instanceof Error ? err.message : String(err),
        };
    }
}

// ── SQL probes used in assertions ────────────────────────────────────────────
export interface SearchLogRow {
    ID: string;
    Status: string;
    ResultCount: number;
    AIAgentID: string | null;
    SearchScopeID: string | null;
    Query: string;
    FailureReason: string | null;
    RerankerName: string | null;
    RerankerCostCents: number | null;
}
export async function getSearchLogRows(
    pool: sql.ConnectionPool,
    agentID: string,
    scopeID?: string,
    sinceMs: number = 5 * 60_000,
): Promise<SearchLogRow[]> {
    const scopeFilter = scopeID ? `AND SearchScopeID='${scopeID}'` : '';
    const sinceMin = Math.ceil(sinceMs / 60_000);
    const r = await pool.request().query(`
        SELECT ID, Status, ResultCount, AIAgentID, SearchScopeID, Query, FailureReason, RerankerName, RerankerCostCents
        FROM __mj.SearchExecutionLog
        WHERE AIAgentID='${agentID}' ${scopeFilter}
          AND __mj_CreatedAt > DATEADD(minute, -${sinceMin}, SYSUTCDATETIME())
        ORDER BY __mj_CreatedAt DESC;
    `);
    return r.recordset;
}
export interface AgentRunStep {
    StepNumber: number;
    StepType: string;
    StepName: string;
    Status: string;
    InputData: string | null;
    OutputData: string | null;
}
export async function getAgentRunSteps(pool: sql.ConnectionPool, agentRunID: string): Promise<AgentRunStep[]> {
    const r = await pool.request().query(`
        SELECT StepNumber, StepType, StepName, Status, InputData, OutputData
        FROM __mj.AIAgentRunStep
        WHERE AgentRunID='${agentRunID}'
        ORDER BY StepNumber;
    `);
    return r.recordset;
}
/** Parse a Search-flavored action's OutputData and return the result list. */
export function parseSearchStepResults(step: AgentRunStep): {
    query: string | undefined;
    message: string | undefined;
    totalCount: number | undefined;
    resultCode: string | undefined;
    success: boolean | undefined;
    results: Array<{ ID: string; Title?: string; Snippet?: string; Score?: number; SourceType?: string; EntityName?: string }>;
} {
    const empty = { query: undefined, message: undefined, totalCount: undefined, resultCode: undefined, success: undefined, results: [] };
    try {
        const inputs = JSON.parse(step.InputData ?? 'null') as { actionParams?: Record<string, unknown> };
        const outputs = JSON.parse(step.OutputData ?? 'null') as {
            actionResult?: {
                success?: boolean;
                resultCode?: string;
                message?: string;
                parameters?: Array<{ Name: string; Value: unknown }>;
            };
        };
        const params = outputs?.actionResult?.parameters ?? [];
        const resultsParam = params.find(p => p.Name === 'Results');
        let resultsArr: Array<Record<string, unknown>> = [];
        if (Array.isArray(resultsParam?.Value)) resultsArr = resultsParam.Value as Array<Record<string, unknown>>;
        else if (typeof resultsParam?.Value === 'string') {
            try { resultsArr = JSON.parse(resultsParam.Value) as Array<Record<string, unknown>>; } catch { /* leave empty */ }
        }
        return {
            query: typeof inputs?.actionParams?.Query === 'string' ? inputs.actionParams.Query : undefined,
            message: outputs?.actionResult?.message,
            totalCount: typeof params.find(p => p.Name === 'TotalCount')?.Value === 'number'
                ? Number(params.find(p => p.Name === 'TotalCount')?.Value) : undefined,
            resultCode: outputs?.actionResult?.resultCode,
            success: outputs?.actionResult?.success,
            results: resultsArr.map(r => r as { ID: string; Title?: string; Snippet?: string; Score?: number; SourceType?: string; EntityName?: string }),
        };
    } catch {
        return empty;
    }
}

// ── runScenario harness (top-level wrapper invoked from each scenario file) ──
export async function runScenario(scenario: Scenario): Promise<void> {
    console.log(`\n=== ${scenario.id} — ${scenario.name} ===`);
    console.log(`    exercises: ${scenario.exercises}`);
    if (scenario.skipIfMissingEnv && !process.env[scenario.skipIfMissingEnv]) {
        console.log(`    SKIPPED — env var ${scenario.skipIfMissingEnv} not set`);
        await writeResult(scenario.id, 'SKIPPED', `Missing env: ${scenario.skipIfMissingEnv}`);
        process.exit(0);
    }

    resetCounts();
    let pool: sql.ConnectionPool | undefined;
    let setupResult: unknown = undefined;
    const promptCapture = installPromptCapture();
    let runError: string | undefined;

    try {
        pool = await bootstrapDBPool();
        step('seed: scenario-specific mutations (pre-MJ-bootstrap)');
        setupResult = await scenario.setup(pool);
        step('bootstrap: setupSQLServerClient + Metadata + UserInfo + AIEngine');
        const { arie, sage } = await bootstrapMJ(pool);
        const ctx: ScenarioContext = { pool, arie, sage, promptCaptures: promptCapture.captures };

        step('action: run agent(s)');
        const runResult = await scenario.action(ctx, setupResult);

        step('assert: scenario proofs');
        await scenario.assert(ctx, runResult, setupResult);
    } catch (err) {
        runError = err instanceof Error ? err.message : String(err);
        console.error(`\nFATAL: ${runError}`);
        if (err instanceof Error && err.stack) console.error(err.stack);
        fail(`scenario threw: ${runError}`);
    } finally {
        promptCapture.restore();
        if (pool) {
            try {
                step('teardown: revert mutations');
                await scenario.teardown(pool, setupResult);
            } catch (e) {
                console.error('teardown failed:', e);
            }
            try { await pool.close(); } catch { /* ignore */ }
        }
    }

    const counts = getCounts();
    console.log(`\n— ${scenario.id} summary: ${counts.pass} PASS / ${counts.fail} FAIL`);
    const verdict = counts.fail === 0 && !runError ? 'PASS' : 'FAIL';
    await writeResult(scenario.id, verdict, `${counts.pass}P/${counts.fail}F${runError ? ` err=${runError}` : ''}`);
    process.exit(counts.fail === 0 && !runError ? 0 : 1);
}

// Append a one-line result entry to /tmp/rag-audit/scenarios-results.tsv
async function writeResult(scenarioID: string, verdict: string, summary: string): Promise<void> {
    const fs = await import('node:fs/promises');
    const out = `${scenarioID}\t${verdict}\t${summary}\n`;
    await fs.appendFile('/tmp/rag-audit/scenarios-results.tsv', out);
}
