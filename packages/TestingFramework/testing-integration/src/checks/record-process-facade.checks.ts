/**
 * record-process-facade.checks.ts — the 'record-process-facade' bundle (RPF1–RPF2): live integration
 * checks for the RecordProcessExecutor FACADE. Graduated verbatim from
 * integration-test-scripts/record-process-facade-tests.ts.
 *
 * A real `MJ: Record Processes` definition (0-row Filter scope → fully deterministic, zero side
 * effects) is resolved + run through RecordProcessExecutor, which maps ScopeType → a source and
 * WorkType → a processor and persists a ProcessRun LINKED back to the Record Process:
 *   - RPF1: executor.Run(rp) persists a Completed ProcessRun linked via RecordProcessID, SourceType=Filter
 *   - RPF2: executor.RunByID(id) does the same from just the definition's ID
 *
 * Deterministic (no model calls). The bundle lifecycle creates the Record Process fixture once and
 * tears it down (with the ProcessRuns the checks create) afterwards. This is the reference pattern for
 * a shared-fixture mutating bundle: Setup builds ctx.RpFacadeFixture, Teardown cleans it in FK-safe order.
 */
import { RunView } from '@memberjunction/core';
import { MJRecordProcessEntity, MJProcessRunEntity } from '@memberjunction/core-entities';
import { RecordProcessExecutor } from '@memberjunction/record-set-processor';
import { Assert, AssertEqual, settle } from '../test-runner';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck, IntegrationCheckContext } from '../check';

const RP_NAME = 'mj-integration-test-record-process (safe to delete)';

/** Fetch the fixture (thrown if the lifecycle Setup didn't run — a wiring bug, not a test failure). */
function fx(ctx: IntegrationCheckContext) {
    Assert(ctx.RpFacadeFixture != null, 'record-process-facade fixture missing (bundle Setup did not run)');
    return ctx.RpFacadeFixture!;
}

/** Verify a persisted ProcessRun is Completed, linked to the fixture RP, Filter-sourced, 0 rows. */
async function verifyRun(ctx: IntegrationCheckContext, runId: string | undefined, via: string): Promise<MJProcessRunEntity> {
    const { Rp, CreatedRunIds } = fx(ctx);
    Assert(!!runId, `${via}: no ProcessRun was created`);
    CreatedRunIds.push(runId!);
    await settle(300);
    const res = await new RunView().RunView<MJProcessRunEntity>(
        { EntityName: 'MJ: Process Runs', ExtraFilter: `ID='${runId}'`, ResultType: 'entity_object' }, ctx.User,
    );
    const run = res.Results?.[0];
    Assert(!!run, `${via}: persisted ProcessRun ${runId} not found`);
    AssertEqual(run!.RecordProcessID, Rp.ID, `${via}: ProcessRun not linked to the Record Process`);
    AssertEqual(run!.Status, 'Completed', `${via}: run status`);
    AssertEqual(String(run!.SourceType), 'Filter', `${via}: SourceType reflects ScopeType`);
    AssertEqual(Number(run!.ProcessedItems), 0, `${via}: 0 rows processed (filter matched none)`);
    return run!;
}

export const RecordProcessFacadeChecks: NamedCheck[] = [
    {
        Id: 'record-process-facade.RPF1',
        Name: 'RPF1: executor.Run(definition) persists a Completed ProcessRun linked to the Record Process',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Rp } = fx(ctx);
            const result = await new RecordProcessExecutor().Run(Rp, { contextUser: ctx.User, triggeredBy: 'OnDemand' });
            AssertEqual(result.Status, 'Completed', 'result status');
            AssertEqual(result.Processed, 0, 'result processed count');
            const run = await verifyRun(ctx, result.ProcessRunID, 'Run');
            console.log(`      → Run(): ProcessRun ${run.ID} linked to RP ${Rp.ID}, SourceType=Filter, Processed=0`);
        }
    },
    {
        Id: 'record-process-facade.RPF2',
        Name: 'RPF2: executor.RunByID(id) resolves the definition from its ID and runs it the same way',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Rp } = fx(ctx);
            const result = await new RecordProcessExecutor().RunByID(Rp.ID, { contextUser: ctx.User, triggeredBy: 'OnDemand' });
            const run = await verifyRun(ctx, result.ProcessRunID, 'RunByID');
            console.log(`      → RunByID(): ProcessRun ${run.ID} linked to RP ${Rp.ID}`);
        }
    }
];

for (const check of RecordProcessFacadeChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('record-process-facade', {
    Setup: async (ctx: IntegrationCheckContext) => {
        const md = ctx.Provider;
        const user = ctx.User;
        // Resolve a real entity + action (FK requirements) — neither is exercised (Filter matches 0 rows).
        const rv = new RunView();
        const [entRes, actRes] = await rv.RunViews([
            { EntityName: 'MJ: Entities', Fields: ['ID'], ResultType: 'simple', MaxRows: 1 },
            { EntityName: 'MJ: Actions', Fields: ['ID'], ResultType: 'simple', MaxRows: 1 },
        ], user);
        const entityID = (entRes.Results?.[0] as { ID?: string } | undefined)?.ID;
        const actionID = (actRes.Results?.[0] as { ID?: string } | undefined)?.ID;
        Assert(!!entityID && !!actionID, 'Could not resolve a seed entity + action for the test Record Process');

        const rp = await md.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', user);
        rp.NewRecord();
        rp.Name = RP_NAME;
        rp.EntityID = entityID!;
        rp.Status = 'Active';
        rp.WorkType = 'Action';
        rp.ActionID = actionID!;        // valid FK; never invoked (0 rows)
        rp.ScopeType = 'Filter';
        rp.ScopeFilter = '1 = 0';       // deterministically matches no records
        rp.BatchSize = 10;
        Assert(await rp.Save(), `creating the test Record Process failed: ${rp.LatestResult?.CompleteMessage}`);

        ctx.RpFacadeFixture = { Rp: rp, CreatedRunIds: [] };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = ctx.RpFacadeFixture;
        if (!f) {
            return;
        }
        const user = ctx.User;
        // Cleanup: ProcessRun details (FK) → ProcessRuns → the Record Process.
        for (const runId of f.CreatedRunIds) {
            const details = await new RunView().RunView(
                { EntityName: 'MJ: Process Run Details', ExtraFilter: `ProcessRunID='${runId}'`, ResultType: 'entity_object' }, user,
            );
            for (const d of details.Results ?? []) {
                await (d as MJProcessRunEntity).Delete().catch(() => undefined);
            }
            const runRes = await new RunView().RunView<MJProcessRunEntity>(
                { EntityName: 'MJ: Process Runs', ExtraFilter: `ID='${runId}'`, ResultType: 'entity_object' }, user,
            );
            if (runRes.Results?.[0]) {
                await runRes.Results[0].Delete().catch(() => undefined);
            }
        }
        await f.Rp.Delete().catch(() => undefined);
        ctx.RpFacadeFixture = undefined;
    }
});
