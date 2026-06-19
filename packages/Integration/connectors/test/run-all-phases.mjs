/**
 * Master runner for the expanded test-service phases (plan.md §2 + §15). Reference-mode, token-free:
 * builds the GQL + DB clients like the other plans, fetches the seeded connection's entity maps via
 * IntegrationListEntityMaps (no ApplyAll), then runs every phase under packages/.../test/phases/ with
 * per-phase isolation (one phase throwing never aborts the rest), and writes a structured NL+JSON +
 * pass/fail report to /tmp/pg-phases-report.json (and a human summary to stdout).
 *
 * Env (same shape as the other reference-mode runs):
 *   HS_LIVE_GRAPHQL_URL, HS_LIVE_PLATFORM, HS_LIVE_CIID, HS_LIVE_OBJECTS,
 *   HS_LIVE_DB_HOST/PORT/NAME/USER, DB_PASSWORD, MJ_API_KEY (via dotenv).
 *
 * Run:
 *   DB_PASSWORD=... DOTENV_CONFIG_PATH=.../packages/MJAPI/.env node -r dotenv/config run-all-phases.mjs
 */
import { writeFileSync } from 'node:fs';
import { liveCfgFromEnv } from './plans.mjs';
import { makeGqlClient, makeDbClient } from './gql-live-adapters.mjs';
import { GQL } from './gql-live-harness.mjs';

import { phaseratelimitconcurrency } from './phases/phase-rate-limit-concurrency.mjs';
import { phaseValueHandling } from './phases/phase-value-handling.mjs';
import { phaseKeysetRestart } from './phases/phase-keyset-restart.mjs';
import { phasebidirectionalconflict } from './phases/phase-bidirectional-conflict.mjs';
import { phasedeletestombstoning } from './phases/phase-deletes-tombstoning.mjs';
import { phaseschemadriftcolumns } from './phases/phase-schema-drift-columns.mjs';
import { phasededupidempotencysweep } from './phases/phase-dedup-idempotency-sweep.mjs';
import { phaseGeneratedActions } from './phases/phase-generated-actions.mjs';
import { phasegqlopcoverage } from './phases/phase-gql-op-coverage.mjs';
import { phasescheduleops } from './phases/phase-schedule-ops.mjs';
import { cellStrategyRotation, cellPaginationStuckRecovery, cellMidProcessFailure } from './phases/phase-resilience-grace.mjs';

const PHASES = [
    ['rate-limit-concurrency', phaseratelimitconcurrency],
    ['value-handling', phaseValueHandling],
    ['keyset-restart', phaseKeysetRestart],
    ['bidirectional-conflict', phasebidirectionalconflict],
    ['deletes-tombstoning', phasedeletestombstoning],
    ['schema-drift-columns', phaseschemadriftcolumns],
    ['dedup-idempotency-sweep', phasededupidempotencysweep],
    ['generated-actions', phaseGeneratedActions],
    ['gql-op-coverage', phasegqlopcoverage],
    ['schedule-ops', phasescheduleops],
    // resilience-grace ships as three independent cells
    ['resilience:strategy-rotation', cellStrategyRotation],
    ['resilience:pagination-stuck', cellPaginationStuckRecovery],
    ['resilience:mid-process-failure', cellMidProcessFailure],
];

async function main() {
    const cfg = liveCfgFromEnv();
    if (!cfg.companyIntegrationID) throw new Error('HS_LIVE_CIID (reference mode) required');

    const db = await makeDbClient(cfg.platform, { ...cfg.db, password: process.env.DB_PASSWORD, mjSchema: cfg.mjSchema });
    const gql = makeGqlClient(cfg.graphqlUrl, { mjSystemKey: process.env.MJ_API_KEY });
    const ciid = cfg.companyIntegrationID;

    // Self-contained setup (gated by HS_LIVE_PHASES_SETUP=1): clean-slate the CIID then ApplyAll so the
    // phases run against a known-fresh set of maps instead of relying on a prior plan having left maps
    // behind (which leaks stale dest rows / record maps and breaks the completeness-style assertions).
    if (process.env.HS_LIVE_PHASES_SETUP === '1') {
        const pg = cfg.platform === 'postgresql';
        const dest = process.env.HS_LIVE_DEST_SCHEMA || 'hubspot';
        const T = (s, t) => pg ? `"${s}"."${t}"` : `[${s}].[${t}]`;
        const C = (n) => pg ? `"${n}"` : n;
        const sub = `(SELECT ${C('ID')} FROM ${T('__mj', 'CompanyIntegrationEntityMap')} WHERE ${C('CompanyIntegrationID')}='${ciid}')`;
        for (const t of ['assoc_contacts_companies', 'deals', 'companies', 'contacts']) { try { await db.rows(`DELETE FROM ${T(dest, t)}`); } catch { /* table may not exist yet */ } }
        await db.rows(`DELETE FROM ${T('__mj', 'CompanyIntegrationRecordMap')} WHERE ${C('CompanyIntegrationID')}='${ciid}'`);
        await db.rows(`DELETE FROM ${T('__mj', 'CompanyIntegrationSyncWatermark')} WHERE ${C('EntityMapID')} IN ${sub}`);
        await db.rows(`DELETE FROM ${T('__mj', 'CompanyIntegrationFieldMap')} WHERE ${C('EntityMapID')} IN ${sub}`);
        await db.rows(`DELETE FROM ${T('__mj', 'CompanyIntegrationEntityMap')} WHERE ${C('CompanyIntegrationID')}='${ciid}'`);
        const objs = (process.env.HS_LIVE_OBJECTS || '').split(',').map(s => s.trim()).filter(Boolean).map(name => ({ SourceObjectName: name }));
        const applied = (await gql(GQL.applyAll, {
            input: { CompanyIntegrationID: ciid, SourceObjects: objs, DefaultSyncDirection: 'Pull', StartSync: false, FullSync: false, SyncScope: 'created' },
            platform: cfg.platform, skipGitCommit: true, skipRestart: true,
        })).IntegrationApplyAll;
        console.error(`  [setup] clean-slate + ApplyAll: ${applied?.Success ? 'OK' : 'FAIL'} — ${applied?.EntityMapsCreated?.length ?? 0} maps`);
    }

    const listed = (await gql(GQL.listEntityMaps, { ciid })).IntegrationListEntityMaps;
    const maps = (listed?.EntityMaps ?? []).map(m => ({
        entityMapID: m.ID, entityName: m.Entity, entityID: m.EntityID,
        sourceObjectName: m.ExternalObjectName, syncDirection: m.SyncDirection, status: m.Status, priority: m.Priority,
    }));
    const fullCfg = { ...cfg, destSchema: process.env.HS_LIVE_DEST_SCHEMA || 'hubspot', mjapiLogPath: process.env.HS_LIVE_MJAPI_LOG || '/tmp/mjapi-pg.log' };

    const report = { platform: cfg.platform, ciid, mapCount: maps.length, phases: [] };
    for (const [name, fn] of PHASES) {
        const started = Date.now();
        try {
            const steps = await fn({ gql, db, ciid, maps, cfg: fullCfg, baseline: undefined });
            const arr = Array.isArray(steps) ? steps : [steps];
            const pass = arr.filter(s => s?.ok).length, fail = arr.filter(s => s && !s.ok).length;
            report.phases.push({ name, ran: true, durationMs: Date.now() - started, pass, fail, steps: arr });
            console.error(`  [${fail === 0 ? 'PASS' : 'FAIL'}] ${name}: ${pass} pass / ${fail} fail (${arr.length} steps)`);
        } catch (e) {
            report.phases.push({ name, ran: false, durationMs: Date.now() - started, error: String(e?.stack ?? e).slice(0, 600) });
            console.error(`  [ERROR] ${name}: ${String(e?.message ?? e).slice(0, 120)}`);
        }
    }
    try { await db.close?.(); } catch { /* best-effort */ }

    const totPass = report.phases.reduce((a, p) => a + (p.pass ?? 0), 0);
    const totFail = report.phases.reduce((a, p) => a + (p.fail ?? 0), 0);
    const errored = report.phases.filter(p => !p.ran).length;
    report.summary = { phases: PHASES.length, errored, totalStepsPass: totPass, totalStepsFail: totFail };
    writeFileSync('/tmp/pg-phases-report.json', JSON.stringify(report, null, 2));
    console.error(`\n=== ${PHASES.length} phases | ${errored} errored | steps ${totPass} pass / ${totFail} fail | report: /tmp/pg-phases-report.json ===`);
    process.stdout.write(JSON.stringify(report.summary) + '\n');
}

main().catch(e => { console.error('runner fatal:', e); process.exit(1); });
