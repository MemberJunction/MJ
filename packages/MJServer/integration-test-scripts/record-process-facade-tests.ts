/**
 * record-process-facade-tests.ts — live integration tests for the RecordProcessExecutor FACADE.
 *
 * The substrate suite (record-process-tests.ts) drives RecordSetProcessor over an in-memory ArraySource.
 * This covers the layer above it: a real `MJ: Record Processes` definition resolved + run through
 * RecordProcessExecutor, which maps ScopeType → a source (View/List/Filter) and WorkType → a processor,
 * and persists a ProcessRun LINKED back to the Record Process. We use a 0-row Filter scope so the run
 * is fully deterministic with zero side effects (no records → no real Action/Agent/Prompt work):
 *   - RPF1: executor.Run(rp) persists a Completed ProcessRun linked via RecordProcessID, SourceType=Filter
 *   - RPF2: executor.RunByID(id) (the load-by-id entry point) does the same from just the definition's ID
 *
 * Deterministic (no model calls). Creates + deletes its own Record Process + ProcessRun fixtures.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/record-process-facade-tests.ts
 *
 * Exit code: 0 = passed, 1 = failures, 2 = bootstrap error.
 */
import { TestRunner, Assert, AssertEqual } from './lib/harness';
import { bootstrapAI, settle } from './lib/ai-bootstrap';
import { Metadata, RunView } from '@memberjunction/core';
import { MJRecordProcessEntity, MJProcessRunEntity } from '@memberjunction/core-entities';
import { RecordProcessExecutor } from '@memberjunction/record-set-processor';

const RP_NAME = 'mj-integration-test-record-process (safe to delete)';

async function main(): Promise<void> {
    const { user } = await bootstrapAI();
    const suite = new TestRunner('RecordProcessExecutor facade live integration (real Record Process → ProcessRun)');
    const md = new Metadata();

    // Resolve a real entity + a real action ID (FK requirements) — neither is exercised since the
    // Filter scope matches 0 rows, but the columns must reference valid records.
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

    const createdRunIds: string[] = [];
    let failures = 0;
    try {
        const verifyRun = async (runId: string | undefined, via: string) => {
            Assert(!!runId, `${via}: no ProcessRun was created`);
            createdRunIds.push(runId!);
            await settle(300);
            const res = await new RunView().RunView<MJProcessRunEntity>(
                { EntityName: 'MJ: Process Runs', ExtraFilter: `ID='${runId}'`, ResultType: 'entity_object' }, user,
            );
            const run = res.Results?.[0];
            Assert(!!run, `${via}: persisted ProcessRun ${runId} not found`);
            AssertEqual(run!.RecordProcessID, rp.ID, `${via}: ProcessRun not linked to the Record Process`);
            AssertEqual(run!.Status, 'Completed', `${via}: run status`);
            AssertEqual(String(run!.SourceType), 'Filter', `${via}: SourceType reflects ScopeType`);
            AssertEqual(Number(run!.ProcessedItems), 0, `${via}: 0 rows processed (filter matched none)`);
            return run!;
        };

        suite.Test('RPF1: executor.Run(definition) persists a Completed ProcessRun linked to the Record Process', async () => {
            const result = await new RecordProcessExecutor().Run(rp, { contextUser: user, triggeredBy: 'OnDemand' });
            AssertEqual(result.Status, 'Completed', 'result status');
            AssertEqual(result.Processed, 0, 'result processed count');
            const run = await verifyRun(result.ProcessRunID, 'Run');
            console.log(`      → Run(): ProcessRun ${run.ID} linked to RP ${rp.ID}, SourceType=Filter, Processed=0`);
        });

        suite.Test('RPF2: executor.RunByID(id) resolves the definition from its ID and runs it the same way', async () => {
            const result = await new RecordProcessExecutor().RunByID(rp.ID, { contextUser: user, triggeredBy: 'OnDemand' });
            const run = await verifyRun(result.ProcessRunID, 'RunByID');
            console.log(`      → RunByID(): ProcessRun ${run.ID} linked to RP ${rp.ID}`);
        });

        failures = await suite.Run();
    } finally {
        // Cleanup: ProcessRun details (FK) → ProcessRuns → the Record Process.
        for (const runId of createdRunIds) {
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
        await rp.Delete().catch(() => undefined);
    }

    process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('\nBOOTSTRAP / CONNECTIVITY ERROR:', error instanceof Error ? error.message : error);
    process.exit(2);
});
