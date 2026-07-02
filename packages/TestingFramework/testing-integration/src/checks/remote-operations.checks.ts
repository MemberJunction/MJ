/**
 * remote-operations.checks.ts — the 'remote-operations' bundle (RO1–RO7): live, full-stack (headless)
 * integration checks for the Remote Operations architecture (BaseRemotableOperation), the 4th data
 * primitive (alongside BaseEntity / RunView / RunQuery). Graduated VERBATIM from
 * integration-test-scripts/remote-operations-tests.ts — only the wrapper changed.
 *
 * Each operation is invoked exactly as any caller would — `new Op().Execute(input, { provider, user })`
 * — and routes through the REAL provider dispatch (ClassFactory → ProviderBase.RouteOperation →
 * ExecuteServer → Authorize → InternalExecute → the actual engine → SQL Server). No mocks, no bespoke
 * client — the same call site a browser would use, exercised end to end.
 *
 * Deterministic (no model calls). The bundle lifecycle creates the Template + Template Content +
 * Action Category + FieldRules Record Process fixtures once (Setup → ctx.RemoteOpsFixture) and tears
 * them down (with the ProcessRuns the checks create) afterwards. `ControlRunID` is threaded through the
 * fixture: RO6 sets it, RO7 reads it.
 */
import { RunView } from '@memberjunction/core';
import type { UserInfo, RemoteOpProgress } from '@memberjunction/core';
import {
    MJTemplateEntity,
    MJTemplateContentEntity,
    MJActionCategoryEntity,
    MJRecordProcessEntity,
    MJProcessRunEntity,
    MJTemplateParamEntity,
    TemplateRunOperation,
    RecordProcessRunNowOperation,
    RecordProcessGetRunStatusOperation,
    RecordProcessPauseRunOperation,
    RecordProcessResumeRunOperation,
    RecordProcessCancelRunOperation,
} from '@memberjunction/core-entities';
import { Assert, AssertEqual, settle } from '../test-runner';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck, IntegrationCheckContext } from '../check';

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

/** Fetch the fixture (thrown if the lifecycle Setup didn't run — a wiring bug, not a test failure). */
function fx(ctx: IntegrationCheckContext) {
    Assert(ctx.RemoteOpsFixture != null, 'remote-operations fixture missing (bundle Setup did not run)');
    return ctx.RemoteOpsFixture!;
}

export const RemoteOperationsChecks: NamedCheck[] = [
    {
        Id: 'remote-operations.RO1',
        Name: 'RO1: Template.Run renders a template by ID with data (exact output)',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Tmpl } = fx(ctx);
            const result = await new TemplateRunOperation().Execute(
                { templateID: Tmpl.ID, data: { name: 'World' } }, { provider: ctx.Provider, user: ctx.User },
            );
            Assert(result.Success, `op failed: ${result.ErrorMessage}`);
            AssertEqual(result.Output?.output, 'Hello World', 'rendered output');
            Assert(typeof result.Output?.executionTimeMs === 'number', 'executionTimeMs is reported');
            console.log(`      → rendered "${result.Output?.output}" in ${result.Output?.executionTimeMs}ms`);
        }
    },
    {
        Id: 'remote-operations.RO2',
        Name: 'RO2: Template.Run on a non-existent template fails cleanly (Success=false, no throw)',
        Fn: async (ctx: IntegrationCheckContext) => {
            const result = await new TemplateRunOperation().Execute(
                { templateID: '00000000-0000-0000-0000-000000000000' }, { provider: ctx.Provider, user: ctx.User },
            );
            AssertEqual(result.Success, false, 'op reports failure');
            Assert(!!result.ErrorMessage && /not found/i.test(result.ErrorMessage), `ErrorMessage mentions not-found (got: ${result.ErrorMessage})`);
            console.log(`      → clean failure: ${result.ErrorMessage}`);
        }
    },
    {
        Id: 'remote-operations.RO3',
        Name: 'RO3: RecordProcess.RunNow { dryRun: true } previews the diff and writes nothing',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Rp, CatIds, ActEntity } = fx(ctx);
            const result = await new RecordProcessRunNowOperation().Execute(
                { recordProcessID: Rp.ID, dryRun: true, scope: { Kind: 'records', RecordIDs: CatIds } }, { provider: ctx.Provider, user: ctx.User },
            );
            Assert(result.Success, `op failed: ${result.ErrorMessage}`);
            AssertEqual(result.Output?.status, 'Completed', 'run status');
            AssertEqual(result.Output?.processed, 2, 'processed count');
            // dry-run must not persist — every Description is still null
            await settle(300);
            for (const id of CatIds) {
                AssertEqual(await fetchDescription(ActEntity, id, ctx.User), null, `dry-run must not write (record ${id})`);
            }
            console.log(`      → dry-run previewed ${result.Output?.processed} records, 0 writes`);
        }
    },
    {
        Id: 'remote-operations.RO5',
        Name: 'RO5: RecordProcess.RunNow (LongRunning) emits typed progress to an attached onProgress callback',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Rp, CatIds } = fx(ctx);
            // RO-3: the executor's per-batch progress is forwarded as RemoteOpProgress to the attached caller.
            const progressEvents: RemoteOpProgress[] = [];
            const result = await new RecordProcessRunNowOperation().Execute(
                { recordProcessID: Rp.ID, dryRun: true, scope: { Kind: 'records', RecordIDs: CatIds } },
                { provider: ctx.Provider, user: ctx.User, onProgress: (p) => progressEvents.push(p) },
            );
            Assert(result.Success, `op failed: ${result.ErrorMessage}`);
            Assert(progressEvents.length >= 1, `expected >= 1 progress event, got ${progressEvents.length}`);
            for (const p of progressEvents) {
                AssertEqual(p.OperationKey, 'RecordProcess.RunNow', 'progress OperationKey');
                Assert(typeof p.Processed === 'number', 'progress carries a numeric Processed');
            }
            console.log(`      → received ${progressEvents.length} typed RemoteOpProgress event(s); last message: "${progressEvents[progressEvents.length - 1]?.Message}"`);
        }
    },
    {
        Id: 'remote-operations.RO4',
        Name: 'RO4: RecordProcess.RunNow { dryRun: false } applies the rule set (DB rows updated)',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Rp, CatIds, ActEntity } = fx(ctx);
            const result = await new RecordProcessRunNowOperation().Execute(
                { recordProcessID: Rp.ID, dryRun: false, scope: { Kind: 'records', RecordIDs: CatIds } }, { provider: ctx.Provider, user: ctx.User },
            );
            Assert(result.Success, `op failed: ${result.ErrorMessage}`);
            AssertEqual(result.Output?.processed, 2, 'processed count');
            await settle(400);
            for (const n of [1, 2]) {
                AssertEqual(
                    await fetchDescription(ActEntity, CatIds[n - 1], ctx.User),
                    `${PREFIX}-cat-${n} — bulk updated`,
                    `Description written (record ${n})`,
                );
            }
            console.log(`      → applied ${result.Output?.processed} updates (write-back verified)`);
        }
    },
    {
        Id: 'remote-operations.RO6',
        Name: 'RO6: RecordProcess.GetRunStatus returns a run\'s status + counts by ProcessRunID',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Rp, CatIds } = fx(ctx);
            const run = await new RecordProcessRunNowOperation().Execute(
                { recordProcessID: Rp.ID, dryRun: true, scope: { Kind: 'records', RecordIDs: CatIds } }, { provider: ctx.Provider, user: ctx.User },
            );
            Assert(run.Success && !!run.Output?.processRunID, `seed run failed: ${run.ErrorMessage}`);
            fx(ctx).ControlRunID = run.Output!.processRunID!;
            const controlRunID = fx(ctx).ControlRunID;
            const status = await new RecordProcessGetRunStatusOperation().Execute({ processRunID: controlRunID! }, { provider: ctx.Provider, user: ctx.User });
            Assert(status.Success, `GetRunStatus failed: ${status.ErrorMessage}`);
            AssertEqual(status.Output?.status, 'Completed', 'run status');
            AssertEqual(status.Output?.processed, 2, 'processed count');
            console.log(`      → GetRunStatus: ${status.Output?.status}, processed ${status.Output?.processed}`);
        }
    },
    {
        Id: 'remote-operations.RO7',
        Name: 'RO7: Pause / Resume / Cancel control ops toggle CancellationRequested and return the status',
        Fn: async (ctx: IntegrationCheckContext) => {
            const controlRunID = fx(ctx).ControlRunID;
            Assert(!!controlRunID, 'RO6 did not yield a run id');
            const pause = await new RecordProcessPauseRunOperation().Execute({ processRunID: controlRunID! }, { provider: ctx.Provider, user: ctx.User });
            Assert(pause.Success && typeof pause.Output?.status === 'string', `PauseRun failed: ${pause.ErrorMessage}`);
            await settle(200);
            AssertEqual(await fetchCancellationRequested(controlRunID!, ctx.User), true, 'PauseRun set CancellationRequested');

            const resume = await new RecordProcessResumeRunOperation().Execute({ processRunID: controlRunID! }, { provider: ctx.Provider, user: ctx.User });
            Assert(resume.Success, `ResumeRun failed: ${resume.ErrorMessage}`);
            await settle(200);
            AssertEqual(await fetchCancellationRequested(controlRunID!, ctx.User), false, 'ResumeRun cleared CancellationRequested');

            const cancel = await new RecordProcessCancelRunOperation().Execute({ processRunID: controlRunID! }, { provider: ctx.Provider, user: ctx.User });
            Assert(cancel.Success && typeof cancel.Output?.status === 'string', `CancelRun failed: ${cancel.ErrorMessage}`);
            await settle(200);
            AssertEqual(await fetchCancellationRequested(controlRunID!, ctx.User), true, 'CancelRun set CancellationRequested');
            console.log('      → Pause set, Resume cleared, Cancel set CancellationRequested; all returned status');
        }
    }
];

for (const check of RemoteOperationsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('remote-operations', {
    Setup: async (ctx: IntegrationCheckContext) => {
        const md = ctx.Provider;
        const user = ctx.User;

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
        const actEntityID = md.EntityByName(ACT_ENTITY)?.ID ?? (await resolveID('MJ: Entities', `Name='${ACT_ENTITY}'`, user));
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

        ctx.RemoteOpsFixture = { Tmpl: tmpl, Content: content, Rp: rp, CatIds: catIds, ActEntity: ACT_ENTITY };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = ctx.RemoteOpsFixture;
        if (!f) {
            return;
        }
        const md = ctx.Provider;
        const user = ctx.User;
        const { Tmpl: tmpl, Content: content, Rp: rp, CatIds: catIds } = f;
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
        ctx.RemoteOpsFixture = undefined;
    }
});
