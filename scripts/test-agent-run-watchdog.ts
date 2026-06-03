/**
 * Agent-Run Watchdog — integration harness
 *
 * Manufactures orphaned / live / paused AIAgentRun rows against a REAL database and verifies
 * AgentRunWatchdog does the right thing with each: force-fail the stale ones, spare the live
 * and paused ones, and cancel the ones a graceful shutdown owns. This is the end-to-end proof
 * the unit tests can't give (the unit tests mock the provider).
 *
 * It writes and then deletes a handful of synthetic AIAgentRun rows. Point it at a throwaway
 * database (the Docker workbench) — NOT production.
 *
 * Usage (from repo root, config from mj.config.cjs / .env):
 *   npx tsx scripts/test-agent-run-watchdog.ts
 *   npx tsx scripts/test-agent-run-watchdog.ts --keep   # leave the synthetic rows for inspection
 *
 * Against the Docker workbench specifically, run it inside the container (where config points at
 * the workbench DB), or override connection via DB_HOST/DB_PORT/DB_DATABASE/DB_USERNAME/DB_PASSWORD.
 */
import { Metadata, UserInfo, DatabaseProviderBase } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { MJAIAgentRunEntity } from '@memberjunction/core-entities';
import { AgentRunWatchdog } from '@memberjunction/ai-agents';
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import '@memberjunction/server-bootstrap-lite';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const KEEP = process.argv.includes('--keep');
const TABLE = '[__mj].[AIAgentRun]';
const created: string[] = [];
let passes = 0;
let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
    if (ok) { passes++; console.log(`  ✓ ${name}`); }
    else { failures++; console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ''}`); }
}

async function bootstrap(): Promise<{ provider: DatabaseProviderBase; user: UserInfo }> {
    const { cosmiconfig } = await import('cosmiconfig');
    const cfg = (await cosmiconfig('mj').search())?.config ?? {};
    // Env-first so you can point the harness at any throwaway DB (e.g. the workbench) without
    // editing mj.config — explicit DB_* env vars override whatever the local config resolves to.
    const pool = new sql.ConnectionPool({
        server: process.env.DB_HOST || cfg.dbHost || 'localhost',
        port: parseInt(process.env.DB_PORT || cfg.dbPort || '1433', 10),
        database: process.env.DB_DATABASE || cfg.dbDatabase,
        user: process.env.DB_USERNAME || cfg.dbUsername,
        password: process.env.DB_PASSWORD || cfg.dbPassword,
        options: { encrypt: false, trustServerCertificate: true },
    });
    await pool.connect();
    await setupSQLServerClient(new SQLServerProviderConfigData(pool, cfg.coreSchema || '__mj', 180000));
    const user = UserCache.Instance.GetSystemUser();
    if (!user) throw new Error('No system user in UserCache');
    const provider = Metadata.Provider;
    if (!(provider instanceof DatabaseProviderBase)) throw new Error('Active provider is not a DatabaseProviderBase');
    return { provider, user };
}

/** Creates a real AIAgentRun row, then backdates its heartbeat/StartedAt via SQL to simulate staleness. */
async function makeRun(
    provider: DatabaseProviderBase,
    user: UserInfo,
    agentID: string | null,
    opts: { status: 'Running' | 'Paused'; heartbeatMinutesAgo: number | null; startedMinutesAgo?: number },
): Promise<string> {
    const md = new Metadata();
    const run = await md.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', user);
    run.NewRecord();
    if (agentID) run.AgentID = agentID;
    run.Status = opts.status;
    run.StartedAt = new Date(Date.now() - (opts.startedMinutesAgo ?? 0) * 60_000);
    if (!(await run.Save())) throw new Error(`Failed to create test run: ${run.LatestResult?.CompleteMessage ?? 'unknown'}`);
    created.push(run.ID);

    const hb = opts.heartbeatMinutesAgo === null
        ? 'NULL'
        : `DATEADD(MINUTE, -${opts.heartbeatMinutesAgo}, GETUTCDATE())`;
    await provider.ExecuteSQL(`UPDATE ${TABLE} SET LastHeartbeatAt = ${hb} WHERE ID = '${run.ID}';`, undefined, { isMutation: true });
    return run.ID;
}

async function statusOf(provider: DatabaseProviderBase, id: string): Promise<string> {
    const rows = await provider.ExecuteSQL<{ Status: string }>(`SELECT Status FROM ${TABLE} WHERE ID = '${id}';`);
    return Array.isArray(rows) && rows[0] ? rows[0].Status : '<missing>';
}

async function main(): Promise<void> {
    console.log('Agent-Run Watchdog integration harness\n');
    const { provider, user } = await bootstrap();

    // Tighten the threshold so the harness is fast and deterministic.
    AgentRunWatchdog.Instance.Configure({ staleThresholdMinutes: 5 });

    // AgentID is NOT NULL on AIAgentRun, so grab a real one. Direct SQL avoids entity-name skew
    // between schema versions (the agent entity is 'AI Agents' in some, 'MJ: AI Agents' in others).
    const agentRows = await provider.ExecuteSQL<{ ID: string }>(`SELECT TOP 1 ID FROM [__mj].[AIAgent];`);
    const agentID = Array.isArray(agentRows) && agentRows[0] ? agentRows[0].ID : null;
    if (!agentID) throw new Error('No rows in __mj.AIAgent — need at least one agent to create test runs');
    console.log(`Using agent ${agentID}\n`);

    // --- Scenario 1: stale heartbeat -> force-failed ---
    console.log('Scenario 1 — stale Running run is force-failed');
    const stale = await makeRun(provider, user, agentID, { status: 'Running', heartbeatMinutesAgo: 10 });
    // --- Scenario 2: fresh heartbeat -> spared (the live-run safety property) ---
    console.log('Scenario 2 — live Running run (fresh heartbeat) is spared');
    const live = await makeRun(provider, user, agentID, { status: 'Running', heartbeatMinutesAgo: 0 });
    // --- Scenario 3: NULL heartbeat + old StartedAt -> force-failed ---
    console.log('Scenario 3 — Running run with NULL heartbeat + old StartedAt is force-failed');
    const legacy = await makeRun(provider, user, agentID, { status: 'Running', heartbeatMinutesAgo: null, startedMinutesAgo: 10 });
    // --- Scenario 4: Paused run with old heartbeat -> NOT touched ---
    console.log('Scenario 4 — Paused run with old heartbeat is never touched');
    const paused = await makeRun(provider, user, agentID, { status: 'Paused', heartbeatMinutesAgo: 10 });

    const failed = await AgentRunWatchdog.SweepOrphanedRuns(provider, user);
    console.log(`\n  sweep reported ${failed} run(s) failed\n`);

    check('stale Running -> Failed', (await statusOf(provider, stale)) === 'Failed');
    check('live Running -> still Running (not killed)', (await statusOf(provider, live)) === 'Running');
    check('NULL-heartbeat old run -> Failed', (await statusOf(provider, legacy)) === 'Failed');
    check('Paused -> still Paused (untouched)', (await statusOf(provider, paused)) === 'Paused');

    // --- Scenario 5: graceful shutdown cancels a tracked, in-flight run ---
    console.log('\nScenario 5 — graceful shutdown cancels a tracked run');
    const tracked = await makeRun(provider, user, agentID, { status: 'Running', heartbeatMinutesAgo: 0 });
    AgentRunWatchdog.Instance.Track(tracked, provider, user);
    await AgentRunWatchdog.Instance.Shutdown();
    check('tracked Running -> Cancelled on shutdown', (await statusOf(provider, tracked)) === 'Cancelled');

    // Cleanup
    if (!KEEP && created.length) {
        await provider.ExecuteSQL(`DELETE FROM ${TABLE} WHERE ID IN (${created.map(id => `'${id}'`).join(',')});`, undefined, { isMutation: true });
        console.log(`\nCleaned up ${created.length} synthetic run(s).`);
    } else if (KEEP) {
        console.log(`\n--keep set; left ${created.length} synthetic run(s): ${created.join(', ')}`);
    }

    console.log(`\n${failures === 0 ? '✅ ALL PASSED' : '❌ FAILED'} — ${passes} passed, ${failures} failed`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error('\nHarness error:', err); process.exit(1); });
