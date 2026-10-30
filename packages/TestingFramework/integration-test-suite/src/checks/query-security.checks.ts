/**
 * query-security.checks.ts — the 'query-security' bundle (IT142), deterministic tier, server
 * transport, on SQL Server and PostgreSQL.
 *
 *  - QS1: every statement that writes (INSERT, UPDATE, DELETE, MERGE, a write in or after a CTE,
 *    SELECT … INTO, stacked and — on SQL Server — unseparated statements, EXEC, a SET or DECLARE
 *    prefix, DDL) is refused on the ad hoc path and the execution-spec path TestQuerySQL runs, with
 *    the read-only check's exact reason, and the canary table is untouched;
 *  - QS2: the same statements are refused when saved as a query, and nothing is stored;
 *  - QS3: stored with extraction skipped (as a row written outside the save rules reaches the
 *    database), each is refused when run, with the same reason, and the canary is untouched;
 *  - QS4: every function a query may not call, and its obfuscated spellings, is refused on the ad
 *    hoc and spec paths, while reads that only name such a function or a write keyword run;
 *  - QS5: the forbidden calls are refused at save and, for rows stored past the save, at run time;
 *  - QS6–QS7: injection probes against shipped queries (`query-security-injection.ts`);
 *  - QS8: the external-data-source read-only screen, per dialect (`query-security-eds.ts`);
 *  - QS9–QS10: field-level security on saved queries (`query-security-fls.ts`).
 *
 * The canary schema `mjit_security` and a per-run `zzz-it142` query category are created in
 * Setup and removed in Teardown.
 */
import { Assert, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { DeleteFixtureCategory } from './query-extraction-fixture';
import {
    CanaryChange, FailOnFindings, RefreshQueries, RequireSecurityFixture, RunAdhoc, RunSaved, RunSpec, SavedCount, SECURITY_BUNDLE,
    SetupSecurityFixture, StoreBypassingSave, TeardownSecuritySchema, TrySave,
} from './query-security-fixture';
import type { QueryOutcome } from './query-security-fixture';
import { ForbiddenProbes, LookAlikeReads, WriteProbes } from './query-security-probes';
import type { LookAlikeRead, RefusedProbe } from './query-security-probes';
import { InjectionChecks, SetupInjectionFixture, TeardownInjectionFixture } from './query-security-injection';
import { EdsScreenChecks } from './query-security-eds';
import { FlsQueryChecks, TeardownFlsQueryFixture } from './query-security-fls';

IntegrationCheckRegistry.Instance.RegisterLifecycle(SECURITY_BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        await SetupSecurityFixture(ctx);
        await SetupInjectionFixture(ctx);
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        await TeardownFlsQueryFixture(ctx);
        await TeardownInjectionFixture(ctx);
        await DeleteFixtureCategory(ctx, SECURITY_BUNDLE, RequireSecurityFixture().Category);
        await RefreshQueries(ctx).catch(() => undefined);
        await TeardownSecuritySchema(ctx);
    },
});

// ─── Expected refusals ──────────────────────────────────────────────────────

/** The render pipeline's refusal of a statement that is not one read (spec path, saved run). */
function pipelineRefusal(probe: RefusedProbe): string {
    return probe.Reason.startsWith('RenderPipeline:') ? probe.Reason
        : `RenderPipeline: only a single read query may be run here, and this SQL is not one: ${probe.Reason}.`;
}

/** The ad hoc path's refusal. */
function adhocRefusal(probe: RefusedProbe): string {
    if (probe.Adhoc) return probe.Adhoc;
    return probe.Reason.startsWith('RenderPipeline:') ? `Ad-hoc query execution failed: ${probe.Reason}` : `Ad-hoc SQL must be a single read query: ${probe.Reason}.`;
}

/** Records a finding unless `outcome` is a refusal reading exactly `expected` that returned no rows. */
function judgeRefusal(findings: string[], label: string, outcome: QueryOutcome, expected: string): void {
    if (outcome.Success) findings.push(`${label}: ran (${outcome.Rows.length} rows), expected the refusal '${expected}'`);
    else if (outcome.Error !== expected) findings.push(`${label}: refused with '${outcome.Error}', expected '${expected}'`);
    else if (outcome.Rows.length > 0) findings.push(`${label}: a refusal returned ${outcome.Rows.length} rows`);
}

/** Records a finding when the canary changed since it was seeded. */
async function judgeCanary(ctx: IntegrationCheckContext, findings: string[], label: string): Promise<void> {
    const change = await CanaryChange(ctx);
    if (change) findings.push(`WRITE: ${label} changed the canary: ${change}`);
}

// ─── QS1 / QS4: caller SQL ──────────────────────────────────────────────────

async function judgeCallerPaths(ctx: IntegrationCheckContext, findings: string[], probe: RefusedProbe): Promise<void> {
    judgeRefusal(findings, `ad hoc ${probe.Label}`, await RunAdhoc(probe.SQL, ctx.User), adhocRefusal(probe));
    await judgeCanary(ctx, findings, `ad hoc ${probe.Label}`);
    judgeRefusal(findings, `spec ${probe.Label}`, await RunSpec(probe.SQL, ctx.User), pipelineRefusal(probe));
    await judgeCanary(ctx, findings, `spec ${probe.Label}`);
}

async function checkQs1WritesRefusedForCallerSQL(ctx: IntegrationCheckContext): Promise<void> {
    const probes = WriteProbes(RequireSecurityFixture().Platform);
    const findings: string[] = [];
    for (const probe of probes) await judgeCallerPaths(ctx, findings, probe);
    FailOnFindings('QS1', findings, probes.length * 2);
}

async function checkQs4ForbiddenCallsRefusedForCallerSQL(ctx: IntegrationCheckContext): Promise<void> {
    const platform = RequireSecurityFixture().Platform;
    const probes = ForbiddenProbes(platform);
    const findings: string[] = [];
    for (const probe of probes) await judgeCallerPaths(ctx, findings, probe);
    const reads = LookAlikeReads(platform);
    for (const read of reads) await judgeLookAlike(ctx, findings, read);
    FailOnFindings('QS4', findings, probes.length * 2 + reads.length * 2);
}

/** A look-alike read runs on the spec path, and on the ad hoc path unless that path's validator refuses it by keyword. */
async function judgeLookAlike(ctx: IntegrationCheckContext, findings: string[], read: LookAlikeRead): Promise<void> {
    const spec = await RunSpec(read.SQL, ctx.User);
    if (!spec.Success) findings.push(`spec look-alike '${read.Label}' must run: ${spec.Error}`);
    const adhoc = await RunAdhoc(read.SQL, ctx.User);
    if (read.AdhocRefusal) judgeRefusal(findings, `ad hoc look-alike '${read.Label}'`, adhoc, read.AdhocRefusal);
    else if (!adhoc.Success) findings.push(`ad hoc look-alike '${read.Label}' must run: ${adhoc.Error}`);
}

// ─── QS2 / QS5: at save ─────────────────────────────────────────────────────

/** The save's refusal of `probe`. */
function saveRefusal(label: string, probe: RefusedProbe): string {
    return `Query "zzz-it142 save ${label}" was not saved:\n${pipelineRefusal(probe)}`;
}

async function judgeSave(ctx: IntegrationCheckContext, findings: string[], probe: RefusedProbe, label: string): Promise<void> {
    const message = await TrySave(ctx, label, probe.SQL);
    const expected = saveRefusal(label, probe);
    if (message === null) findings.push(`save ${probe.Label}: saved, expected the refusal '${expected}'`);
    else if (!message.includes(expected)) findings.push(`save ${probe.Label}: refused with '${message}', expected it to carry '${expected}'`);
    const stored = await SavedCount(ctx, label);
    if (message !== null && stored !== 0) findings.push(`save ${probe.Label}: a refused save stored ${stored} query row(s)`);
    await judgeCanary(ctx, findings, `save ${probe.Label}`);
}

async function judgeSaves(ctx: IntegrationCheckContext, check: string, probes: readonly RefusedProbe[]): Promise<void> {
    const findings: string[] = [];
    for (const [index, probe] of probes.entries()) await judgeSave(ctx, findings, probe, `${check}-${index + 1}`);
    FailOnFindings(check, findings, probes.length);
}

async function checkQs2WritesRefusedAtSave(ctx: IntegrationCheckContext): Promise<void> {
    await judgeSaves(ctx, 'QS2', WriteProbes(RequireSecurityFixture().Platform));
}

// ─── QS3 / QS5: rows that bypassed the save, at run time ───────────────────

async function judgeStoredRuns(ctx: IntegrationCheckContext, check: string, probes: readonly RefusedProbe[]): Promise<string[]> {
    const stored = [];
    for (const [index, probe] of probes.entries()) stored.push(await StoreBypassingSave(ctx, `${check}-${index + 1}`, probe.SQL));
    await RefreshQueries(ctx);
    const findings: string[] = [];
    for (const [index, probe] of probes.entries()) {
        judgeRefusal(findings, `stored ${probe.Label}`, await RunSaved(stored[index].ID, ctx.User), pipelineRefusal(probe));
        await judgeCanary(ctx, findings, `stored ${probe.Label}`);
    }
    return findings;
}

async function checkQs3StoredWritesRefusedAtRun(ctx: IntegrationCheckContext): Promise<void> {
    const probes = WriteProbes(RequireSecurityFixture().Platform);
    FailOnFindings('QS3', await judgeStoredRuns(ctx, 'QS3', probes), probes.length);
}

async function checkQs5ForbiddenCallsRefusedAtSaveAndRun(ctx: IntegrationCheckContext): Promise<void> {
    const probes = ForbiddenProbes(RequireSecurityFixture().Platform);
    const findings = await judgeStoredRuns(ctx, 'QS5', probes);
    for (const [index, probe] of probes.entries()) await judgeSave(ctx, findings, probe, `QS5-${index + 1}`);
    FailOnFindings('QS5', findings, probes.length * 2);
}

/** A read on every path must run, or the refusals above prove nothing. */
async function assertPathsRun(ctx: IntegrationCheckContext): Promise<void> {
    const sql = RequireSecurityFixture().Platform === 'postgresql' ? 'SELECT "ID" FROM "mjit_security"."Canary"' : 'SELECT [ID] FROM mjit_security.[Canary]';
    for (const [path, outcome] of [['ad hoc', await RunAdhoc(sql, ctx.User)], ['spec', await RunSpec(sql, ctx.User)]] as const) {
        Assert(outcome.Success && outcome.Rows.length === 3, `the ${path} path must run a plain read of the canary (3 rows): ${outcome.Error || `${outcome.Rows.length} rows`}`);
    }
}

export const QuerySecurityChecks: NamedCheck[] = [
    { Id: `${SECURITY_BUNDLE}.QS1`, Name: 'QS1: every write, stacked, EXEC, SET/DECLARE and DDL statement is refused on the ad hoc and spec paths; the canary is untouched',
        Fn: async ctx => { await assertPathsRun(ctx); await checkQs1WritesRefusedForCallerSQL(ctx); } },
    { Id: `${SECURITY_BUNDLE}.QS2`, Name: 'QS2: the same statements are refused when saved as a query, and nothing is stored', Fn: checkQs2WritesRefusedAtSave },
    { Id: `${SECURITY_BUNDLE}.QS3`, Name: 'QS3: a stored query that bypassed the save rules is refused at run time with the same reason; the canary is untouched', Fn: checkQs3StoredWritesRefusedAtRun },
    { Id: `${SECURITY_BUNDLE}.QS4`, Name: 'QS4: every forbidden function, in every spelling, is refused for caller SQL; reads that only name one run', Fn: checkQs4ForbiddenCallsRefusedForCallerSQL },
    { Id: `${SECURITY_BUNDLE}.QS5`, Name: 'QS5: a forbidden call is refused at save and, in a row stored past the save, at run time', Fn: checkQs5ForbiddenCallsRefusedAtSaveAndRun },
    ...InjectionChecks,
    ...EdsScreenChecks,
    ...FlsQueryChecks,
];

for (const check of QuerySecurityChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
