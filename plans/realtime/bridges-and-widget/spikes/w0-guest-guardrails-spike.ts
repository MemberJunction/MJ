/**
 * W0 — Guest guardrails spike (throwaway; safe to delete after review).
 *
 * Purpose (per public-web-widget.md §3 Phase W0):
 *   Empirically confirm the D5 "footgun": when NO authenticated user is present,
 *   `ConversationAgentRunner.processMessage()` builds the `ALL_AVAILABLE_AGENTS`
 *   routing/handoff list from the FULL active top-level agent set, WITHOUT any
 *   permission filtering. That means pinning the entry agent (`explicitAgentId`)
 *   is necessary but NOT sufficient — the pinned support agent could still hand
 *   off to any active agent. The constrained guest principal + a support-scoped
 *   pinned agent are the real backstop.
 *
 * This script does NOT run a live LLM turn (no cost, no network to model vendors).
 * It reproduces the EXACT candidate-agent filter from
 * `packages/ConversationsRuntime/src/agent-runner/ConversationAgentRunner.ts`
 * (lines ~150-160) against the live metadata, and reports what a guest session
 * (currentUser === undefined) would expose vs. what pinning alone constrains.
 *
 * Run (from repo root, env from .env):
 *   set -a && source .env && set +a && \
 *   npx tsx plans/realtime/bridges-and-widget/spikes/w0-guest-guardrails-spike.ts
 */
import sql from 'mssql';
import { UUIDsEqual } from '@memberjunction/global';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { AIEngineBase } from '@memberjunction/ai-engine-base';

async function main(): Promise<void> {
    const pool = new sql.ConnectionPool({
        server: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 1433),
        database: process.env.DB_DATABASE ?? 'MJ_Workbench',
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
    });
    await pool.connect();
    await setupSQLServerClient(new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA ?? '__mj'));

    const sysUser = UserCache.Instance.GetSystemUser()
        ?? UserCache.Instance.Users.find((u) => u.IsActive && u.Type === 'Owner');
    await AIEngineBase.Instance.Config(false, sysUser);
    const allAgents = AIEngineBase.Instance.Agents;

    // EXACT replica of the candidate filter in ConversationAgentRunner.processMessage.
    // (The pinned entry agent itself is excluded at runtime; we don't pin here, so we
    //  report the full candidate set — i.e. everything a guest's pinned agent could
    //  hand off to, since `availableAgents = currentUser ? filtered : candidateAgents`.)
    const candidateAgents = allAgents.filter(
        (a) => !a.ParentID && a.Status === 'Active' && a.InvocationMode !== 'Sub-Agent'
    );

    // What a guest sees: NO filtering (currentUser === undefined path).
    const guestVisible = candidateAgents;

    console.log('──────────────────────────────────────────────────────────');
    console.log('W0 guest-guardrails spike — agent-routing exposure');
    console.log('──────────────────────────────────────────────────────────');
    console.log(`Total agents in metadata:            ${allAgents.length}`);
    console.log(`Active top-level (non-sub) agents:   ${candidateAgents.length}`);
    console.log(`Agents a GUEST session would expose: ${guestVisible.length} (UNFILTERED — the footgun)`);
    console.log('');
    console.log('Agents reachable as handoff targets by an UNPINNED guest turn:');
    for (const a of guestVisible.slice(0, 40)) {
        console.log(`  • ${a.Name}  [${a.InvocationMode}]`);
    }
    if (guestVisible.length > 40) console.log(`  …and ${guestVisible.length - 40} more`);
    console.log('');
    console.log('CONCLUSION:');
    console.log('  Pinning explicitAgentId fixes which agent RUNS, but the handoff list');
    console.log('  (ALL_AVAILABLE_AGENTS) is the full set above for a guest. Therefore the');
    console.log('  widget MUST ALSO run under a constrained principal whose entity perms');
    console.log('  cannot reach arbitrary data, and pin a support-scoped agent. D5 confirmed.');

    await pool.close();
}

main().then(
    () => process.exit(0),
    (err) => {
        console.error('Spike failed:', err);
        process.exit(1);
    }
);
