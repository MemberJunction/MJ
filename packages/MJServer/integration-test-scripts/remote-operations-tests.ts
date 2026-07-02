/**
 * remote-operations-tests.ts — live, full-stack (headless) integration tests for the Remote Operations
 * architecture (BaseRemotableOperation), the 4th data primitive (alongside BaseEntity / RunView / RunQuery).
 *
 * Each operation is invoked exactly as any caller would — `new Op().Execute(input)` — and routes through the
 * REAL provider dispatch. In-process here (the suite runs on a SQLServerDataProvider), that means:
 *   ClassFactory resolves the registered server subclass → ProviderBase.RouteOperation → ExecuteServer →
 *   Authorize → InternalExecute → the actual engine (TemplateEngineServer / RecordProcessExecutor) → SQL Server.
 * No mocks, no bespoke client — the same call site a browser would use, exercised end to end.
 *
 *   - RO1: Template.Run renders a template by ID with data — exact output (proves resolve → dispatch → render).
 *   - RO2: Template.Run on a non-existent template fails cleanly (Success=false + ErrorMessage), never throws.
 *   - RO3: RecordProcess.RunNow { dryRun: true, scope: records } previews the FieldRules diff and writes
 *          NOTHING (DB rows unchanged) — the dry-run contract proven through the full op stack.
 *   - RO4: RecordProcess.RunNow { dryRun: false } applies the same rule set (DB rows updated) — the contrast.
 *
 * Deterministic (no model calls). Creates + deletes its own Template + Template Content + Action Category +
 * Record Process fixtures. The two server-op subclasses are registered via server-bootstrap-lite (loaded by
 * bootstrapAI) — the same registration path production uses.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/remote-operations-tests.ts
 *
 * Exit code: 0 = passed, 1 = failures, 2 = bootstrap error.
 */
import { TestRunner, Assert, AssertEqual } from './lib/harness';
import { bootstrapAI, settle } from './lib/ai-bootstrap';
import { RunView, UserInfo, RemoteOpProgress } from '@memberjunction/core';
import {
    MJTemplateEntity,
    MJTemplateContentEntity,
    MJActionCategoryEntity,
    MJRecordProcessEntity,
    MJProcessRunEntity,
    MJTemplateParamEntity,
} from '@memberjunction/core-entities';
import {
    TemplateRunOperation,
    RecordProcessRunNowOperation,
    RecordProcessGetRunStatusOperation,
    RecordProcessPauseRunOperation,
    RecordProcessResumeRunOperation,
    RecordProcessCancelRunOperation,
} from '@memberjunction/core-entities';

const ACT_ENTITY = 'MJ: Action Categories';
const PREFIX = 'mj-remote-op-test';

async function fetchDescription(entity: string, id: string, user: UserInfo): Promise<string | null> {
    const r = await new RunView().RunView(
        { EntityName: entity, ExtraFilter: `ID='${id}'`, Fields: ['Description'], ResultType: 'simple', BypassCache: true }, user,
    );
    return (r.Results?.[0] as { Description?: string | null } | undefined)?.Description ?? null;
}

async function fetchCancellationRequested(processRunID: string, user: UserInfo): Promise<boolean> {
    const r = await new RunView().RunView(
        { EntityName: 'MJ: Process Runs', ExtraFilter: `ID='${processRunID}'`, Fields: ['CancellationRequested'], ResultType: 'simple', BypassCache: true }, user,
    );
    return (r.Results?.[0] as { CancellationRequested?: boolean } | undefined)?.CancellationRequested === true;
}

async function resolveID(entity: string, filter: string, user: UserInfo): Promise<string> {
    const r = await new RunView().RunView({ EntityName: entity, ExtraFilter: filter, Fields: ['ID'], ResultType: 'simple', MaxRows: 1 }, user);
    const id = (r.Results?.[0] as { ID?: string } | undefined)?.ID;
    Assert(!!id, `Could not resolve ${entity} where ${filter}`);
    return id!;
}

async function main(): Promise<void> {
    const { user, provider } = await bootstrapAI();
    const suite = new TestRunner('Remote Operations live integration (Template.Run + RecordProcess.RunNow dry-run, full-stack)');
    const md = provider;

    // ── Template.Run fixtures: a throwaway template + Text content that renders "Hello {{ name }}" ──
    const textTypeID = await resolveID('MJ: Template Content Types', "Name='Text'", user);
    const tmpl = await md.GetEntityObject<MJTemplateEntity>('MJ: Templates', user);
    tmpl.NewRecord();
    tmpl.Name = `${PREFIX}-template (safe to delete)`;
    tmpl.UserID = user.ID;
    tmpl.IsActive = true;
    Assert(await tmpl.Save(), `creating test template failed: ${tmpl.LatestResult?.CompleteMessage}`);

    const content = await md.GetEntityObject<MJTemplateContentEntity>('MJ: Template Contents', user);
    content.NewRecord();
    content.TemplateID = tmpl.ID;
    content.TypeID = textTypeID;
    content.TemplateText = 'Hello {{ name }}';
    content.Priority = 1;
    content.IsActive = true;
    Assert(await content.Save(), `creating test template content failed: ${content.LatestResult?.CompleteMessage}`);

    // ── RecordProcess.RunNow fixtures: 2 throwaway Action Categories (Description null) + a FieldRules process ──
    const actEntityID = provider.EntityByName(ACT_ENTITY)?.ID ?? (await resolveID('MJ: Entities', `Name='${ACT_ENTITY}'`, user));
    const catIds: string[] = [];
    for (const n of [1, 2]) {
        const cat = await md.GetEntityObject<MJActionCategoryEntity>(ACT_ENTITY, user);
        cat.NewRecord();
        cat.Name = `${PREFIX}-cat-${n}`;
        cat.Status = 'Active';
        Assert(await cat.Save(), `creating fixture category ${n} failed: ${cat.LatestResult?.CompleteMessage}`);
        catIds.push(cat.ID);
    }
    const ruleSet = { Rules: [{ TargetField: 'Description', Source: { Kind: 'formula', Expression: "fields.Name + ' — bulk updated'" } }] };

    const rp = await md.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', user);
    rp.NewRecord();
    rp.Name = `${PREFIX}-record-process (safe to delete)`;
    rp.EntityID = actEntityID;
    rp.Status = 'Active';
    rp.WorkType = 'FieldRules';
    rp.ScopeType = 'Filter';
    rp.ScopeFilter = '1 = 0';                  // placeholder — overridden by the `records` scope at call time
    rp.Configuration = JSON.stringify(ruleSet);
    rp.BatchSize = 10;
    Assert(await rp.Save(), `creating the FieldRules Record Process failed: ${rp.LatestResult?.CompleteMessage}`);

    let failures = 0;
    try {
        suite.Test('RO1: Template.Run renders a template by ID with data (exact output)', async () => {
            const result = await new TemplateRunOperation().Execute(
                { templateID: tmpl.ID, data: { name: 'World' } }, { provider, user },
            );
            Assert(result.Success, `op failed: ${result.ErrorMessage}`);
            AssertEqual(result.Output?.output, 'Hello World', 'rendered output');
            Assert(typeof result.Output?.executionTimeMs === 'number', 'executionTimeMs is reported');
            console.log(`      → rendered "${result.Output?.output}" in ${result.Output?.executionTimeMs}ms`);
        });

        suite.Test('RO2: Template.Run on a non-existent template fails cleanly (Success=false, no throw)', async () => {
            const result = await new TemplateRunOperation().Execute(
                { templateID: '00000000-0000-0000-0000-000000000000' }, { provider, user },
            );
            AssertEqual(result.Success, false, 'op reports failure');
            Assert(!!result.ErrorMessage && /not found/i.test(result.ErrorMessage), `ErrorMessage mentions not-found (got: ${result.ErrorMessage})`);
            console.log(`      → clean failure: ${result.ErrorMessage}`);
        });

        suite.Test('RO3: RecordProcess.RunNow { dryRun: true } previews the diff and writes nothing', async () => {
            const result = await new RecordProcessRunNowOperation().Execute(
                { recordProcessID: rp.ID, dryRun: true, scope: { Kind: 'records', RecordIDs: catIds } }, { provider, user },
            );
            Assert(result.Success, `op failed: ${result.ErrorMessage}`);
            AssertEqual(result.Output?.status, 'Completed', 'run status');
            AssertEqual(result.Output?.processed, 2, 'processed count');
            // dry-run must not persist — every Description is still null
            await settle(300);
            for (const id of catIds) {
                AssertEqual(await fetchDescription(ACT_ENTITY, id, user), null, `dry-run must not write (record ${id})`);
            }
            console.log(`      → dry-run previewed ${result.Output?.processed} records, 0 writes`);
        });

        suite.Test('RO5: RecordProcess.RunNow (LongRunning) emits typed progress to an attached onProgress callback', async () => {
            // RO-3: the executor's per-batch progress is forwarded as RemoteOpProgress to the attached caller.
            const progressEvents: RemoteOpProgress[] = [];
            const result = await new RecordProcessRunNowOperation().Execute(
                { recordProcessID: rp.ID, dryRun: true, scope: { Kind: 'records', RecordIDs: catIds } },
                { provider, user, onProgress: (p) => progressEvents.push(p) },
            );
            Assert(result.Success, `op failed: ${result.ErrorMessage}`);
            Assert(progressEvents.length >= 1, `expected >= 1 progress event, got ${progressEvents.length}`);
            for (const p of progressEvents) {
                AssertEqual(p.OperationKey, 'RecordProcess.RunNow', 'progress OperationKey');
                Assert(typeof p.Processed === 'number', 'progress carries a numeric Processed');
            }
            console.log(`      → received ${progressEvents.length} typed RemoteOpProgress event(s); last message: "${progressEvents[progressEvents.length - 1]?.Message}"`);
        });

        suite.Test('RO4: RecordProcess.RunNow { dryRun: false } applies the rule set (DB rows updated)', async () => {
            const result = await new RecordProcessRunNowOperation().Execute(
                { recordProcessID: rp.ID, dryRun: false, scope: { Kind: 'records', RecordIDs: catIds } }, { provider, user },
            );
            Assert(result.Success, `op failed: ${result.ErrorMessage}`);
            AssertEqual(result.Output?.processed, 2, 'processed count');
            await settle(400);
            for (const n of [1, 2]) {
                AssertEqual(
                    await fetchDescription(ACT_ENTITY, catIds[n - 1], user),
                    `${PREFIX}-cat-${n} — bulk updated`,
                    `Description written (record ${n})`,
                );
            }
            console.log(`      → applied ${result.Output?.processed} updates (write-back verified)`);
        });

        let controlRunID: string | undefined;
        suite.Test('RO6: RecordProcess.GetRunStatus returns a run\'s status + counts by ProcessRunID', async () => {
            const run = await new RecordProcessRunNowOperation().Execute(
                { recordProcessID: rp.ID, dryRun: true, scope: { Kind: 'records', RecordIDs: catIds } }, { provider, user },
            );
            Assert(run.Success && !!run.Output?.processRunID, `seed run failed: ${run.ErrorMessage}`);
            controlRunID = run.Output!.processRunID!;
            const status = await new RecordProcessGetRunStatusOperation().Execute({ processRunID: controlRunID }, { provider, user });
            Assert(status.Success, `GetRunStatus failed: ${status.ErrorMessage}`);
            AssertEqual(status.Output?.status, 'Completed', 'run status');
            AssertEqual(status.Output?.processed, 2, 'processed count');
            console.log(`      → GetRunStatus: ${status.Output?.status}, processed ${status.Output?.processed}`);
        });

        suite.Test('RO7: Pause / Resume / Cancel control ops toggle CancellationRequested and return the status', async () => {
            Assert(!!controlRunID, 'RO6 did not yield a run id');
            const pause = await new RecordProcessPauseRunOperation().Execute({ processRunID: controlRunID! }, { provider, user });
            Assert(pause.Success && typeof pause.Output?.status === 'string', `PauseRun failed: ${pause.ErrorMessage}`);
            await settle(200);
            AssertEqual(await fetchCancellationRequested(controlRunID!, user), true, 'PauseRun set CancellationRequested');

            const resume = await new RecordProcessResumeRunOperation().Execute({ processRunID: controlRunID! }, { provider, user });
            Assert(resume.Success, `ResumeRun failed: ${resume.ErrorMessage}`);
            await settle(200);
            AssertEqual(await fetchCancellationRequested(controlRunID!, user), false, 'ResumeRun cleared CancellationRequested');

            const cancel = await new RecordProcessCancelRunOperation().Execute({ processRunID: controlRunID! }, { provider, user });
            Assert(cancel.Success && typeof cancel.Output?.status === 'string', `CancelRun failed: ${cancel.ErrorMessage}`);
            await settle(200);
            AssertEqual(await fetchCancellationRequested(controlRunID!, user), true, 'CancelRun set CancellationRequested');
            console.log('      → Pause set, Resume cleared, Cancel set CancellationRequested; all returned status');
        });

        failures = await suite.Run();
    } finally {
        // Cleanup: ProcessRun details (FK) → ProcessRuns (linked to the RP) → Record Process → categories → template content → template.
        const runRes = await new RunView().RunView<MJProcessRunEntity>(
            { EntityName: 'MJ: Process Runs', ExtraFilter: `RecordProcessID='${rp.ID}'`, ResultType: 'entity_object' }, user,
        );
        for (const run of runRes.Results ?? []) {
            const details = await new RunView().RunView(
                { EntityName: 'MJ: Process Run Details', ExtraFilter: `ProcessRunID='${run.ID}'`, ResultType: 'entity_object' }, user,
            );
            for (const d of details.Results ?? []) {
                await (d as MJProcessRunEntity).Delete().catch(() => undefined);
            }
            await run.Delete().catch(() => undefined);
        }
        await rp.Delete().catch(() => undefined);
        for (const id of catIds) {
            const cat = await md.GetEntityObject<MJActionCategoryEntity>(ACT_ENTITY, user);
            if (await cat.Load(id)) {
                await cat.Delete().catch(() => undefined);
            }
        }
        await content.Delete().catch(() => undefined);
        // Rendering auto-extracts a TemplateParam for `{{ name }}` — remove it (FK) before the template.
        // BypassCache: the param is created mid-render through the engine's own path, so a cached read can miss it.
        const params = await new RunView().RunView<MJTemplateParamEntity>(
            { EntityName: 'MJ: Template Params', ExtraFilter: `TemplateID='${tmpl.ID}'`, ResultType: 'entity_object', BypassCache: true }, user,
        );
        for (const p of params.Results ?? []) {
            await p.Delete().catch(() => undefined);
        }
        await tmpl.Delete().catch(() => undefined);
    }

    process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('\nBOOTSTRAP / CONNECTIVITY ERROR:', error instanceof Error ? error.message : error);
    process.exit(2);
});
