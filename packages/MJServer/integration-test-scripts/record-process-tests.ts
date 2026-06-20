/**
 * record-process-tests.ts — live integration tests for the RecordSetProcessor substrate.
 *
 * Deterministic (NO model calls — uses a FunctionRecordProcessor), so it runs in the default tier.
 * Drives RecordSetProcessor.Process over an in-memory ArraySource and verifies the persisted run:
 *   - MJ: Process Runs        — Status + counts (Processed/Success/Error/Skipped)
 *   - MJ: Process Run Details — one terminal row per record, written fire-and-forget by the tracker's
 *     BaseEntitySaveQueue and flushed on CompleteRun (the 4th save-queue consumer — closes the loop on
 *     the de-dup migration live).
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/record-process-tests.ts
 *
 * Exit code: 0 = passed, 1 = failures, 2 = bootstrap error.
 */
import { TestRunner, Assert, AssertEqual } from './lib/harness';
import { bootstrapAI, settle } from './lib/ai-bootstrap';
import { RunView } from '@memberjunction/core';
import { RecordSetProcessor, FunctionRecordProcessor } from '@memberjunction/record-set-processor';
import { ArraySource } from '@memberjunction/record-set-processor-base';

async function fetchRows(entity: string, filter: string, user: import('@memberjunction/core').UserInfo) {
    const r = await new RunView().RunView({ EntityName: entity, ExtraFilter: filter, ResultType: 'simple', BypassCache: true }, user);
    Assert(r.Success, `RunView('${entity}') failed: ${r.ErrorMessage}`);
    return r.Results as Record<string, unknown>[];
}

async function main(): Promise<void> {
    const { user } = await bootstrapAI();
    const suite = new TestRunner('RecordSetProcessor live integration (deterministic — tracker persistence)');

    // Any valid Entity ID works as the source's EntityID (FK on ProcessRun). Resolve one via RunView.
    const entResult = await new RunView().RunView(
        { EntityName: 'MJ: Entities', ResultType: 'simple', MaxRows: 1 }, user,
    );
    Assert(entResult.Success, `Resolving an entity failed: ${entResult.ErrorMessage}`);
    const entityID = (entResult.Results?.[0] as { ID?: string } | undefined)?.ID;
    Assert(!!entityID, `Could not resolve an entity ID (got ${entResult.Results?.length ?? 0} rows)`);

    suite.Test('RP1: a 3-record run persists a Process Run + a terminal Process Run Detail per record', async () => {
        const records = [1, 2, 3].map((n) => ({ EntityID: entityID!, RecordID: `rp-test-${n}` }));
        const source = new ArraySource(records, entityID!, 'SingleRecord');
        const processor = new FunctionRecordProcessor(async () => ({ Status: 'Succeeded' as const, ResultPayload: { ok: true } }));

        const result = await RecordSetProcessor.Instance.Process({
            source, processor, contextUser: user, entityID: entityID!, triggeredBy: 'OnDemand',
        });

        Assert(result.ProcessRunID != null, 'No Process Run was created');
        AssertEqual(result.Status, 'Completed', 'run status');
        AssertEqual(result.Processed, 3, 'processed count');
        AssertEqual(result.Success, 3, 'success count');

        // CompleteRun flushes the fire-and-forget detail queue before returning; a short settle is belt-and-braces.
        await settle(500);
        const run = await fetchRows('MJ: Process Runs', `ID='${result.ProcessRunID}'`, user);
        AssertEqual(run.length, 1, 'process run row count');
        AssertEqual(String(run[0].Status), 'Completed', 'persisted run status');
        AssertEqual(Number(run[0].ProcessedItems), 3, 'persisted ProcessedItems');

        const details = await fetchRows('MJ: Process Run Details', `ProcessRunID='${result.ProcessRunID}'`, user);
        AssertEqual(details.length, 3, 'process run detail row count (fire-and-forget writes all landed)');
        for (const d of details) {
            Assert(['Succeeded', 'Failed', 'Skipped'].includes(String(d.Status)), `detail status not terminal: ${d.Status}`);
            Assert(d.CompletedAt != null, `detail ${d.RecordID}: CompletedAt is null (fire-and-forget write lost the finalize)`);
        }
        console.log(`      → run ${result.ProcessRunID}: ${details.length} detail rows persisted (terminal + CompletedAt)`);
    });

    suite.Test('RP2: mixed success/error/skip counts are recorded accurately on the Process Run', async () => {
        const records = ['ok', 'err', 'skip'].map((tag) => ({ EntityID: entityID!, RecordID: `rp-mix-${tag}` }));
        const source = new ArraySource(records, entityID!, 'SingleRecord');
        const processor = new FunctionRecordProcessor(async (rec) => {
            if (String(rec.RecordID).endsWith('err')) return { Status: 'Failed' as const, ErrorMessage: 'forced' };
            if (String(rec.RecordID).endsWith('skip')) return { Status: 'Skipped' as const };
            return { Status: 'Succeeded' as const };
        });

        const result = await RecordSetProcessor.Instance.Process({
            source, processor, contextUser: user, entityID: entityID!, triggeredBy: 'OnDemand',
        });
        AssertEqual(result.Processed, 3, 'processed');
        AssertEqual(result.Success, 1, 'success');
        AssertEqual(result.Error, 1, 'error');
        AssertEqual(result.Skipped, 1, 'skipped');

        await settle(500);
        const details = await fetchRows('MJ: Process Run Details', `ProcessRunID='${result.ProcessRunID}'`, user);
        AssertEqual(details.length, 3, 'detail rows');
        console.log(`      → run ${result.ProcessRunID}: success=1 error=1 skipped=1, ${details.length} details persisted`);
    });

    suite.Test('RP3: a processor that THROWS isolates the bad record (Error) and still persists every detail', async () => {
        const records = ['a', 'boom', 'c'].map((tag) => ({ EntityID: entityID!, RecordID: `rp-throw-${tag}` }));
        const source = new ArraySource(records, entityID!, 'SingleRecord');
        // Per-record isolation: one record throws; the engine must catch it, mark that record an error,
        // and continue — the run is not aborted and every detail still persists (fire-and-forget).
        const processor = new FunctionRecordProcessor(async (rec) => {
            if (String(rec.RecordID).endsWith('boom')) {
                throw new Error('processor blew up on this record');
            }
            return { Status: 'Succeeded' as const };
        });

        const result = await RecordSetProcessor.Instance.Process({
            source, processor, contextUser: user, entityID: entityID!, triggeredBy: 'OnDemand',
        });
        AssertEqual(result.Processed, 3, 'all records were attempted (no abort on the throw)');
        AssertEqual(result.Success, 2, 'two succeeded');
        AssertEqual(result.Error, 1, 'the throwing record counted as an error');

        await settle(500);
        const details = await fetchRows('MJ: Process Run Details', `ProcessRunID='${result.ProcessRunID}'`, user);
        AssertEqual(details.length, 3, 'every record produced a persisted detail row');
        const errored = details.find((d) => String(d.RecordID).endsWith('boom'));
        Assert(!!errored && errored.Status === 'Failed', 'the throwing record persisted as a Failed detail');
        Assert(!!errored && errored.ErrorMessage != null, 'the failed detail captured the error message');
        console.log(`      → run ${result.ProcessRunID}: throw isolated, 3 details persisted (1 Failed with message)`);
    });

    suite.Test('RP4: the error-rate circuit breaker trips and stops the run (Status=Failed, processed < total)', async () => {
        const records = Array.from({ length: 10 }, (_, n) => ({ EntityID: entityID!, RecordID: `rp-cb-${n}` }));
        const source = new ArraySource(records, entityID!, 'SingleRecord');
        const processor = new FunctionRecordProcessor(async () => ({ Status: 'Failed' as const, ErrorMessage: 'always fails' }));

        const result = await RecordSetProcessor.Instance.Process({
            source, processor, contextUser: user, entityID: entityID!, triggeredBy: 'OnDemand',
            batchSize: 1, errorThresholdPercent: 50,
        });
        AssertEqual(result.Status, 'Failed', 'run failed via circuit breaker');
        Assert(result.Processed < 10, `circuit breaker stopped early (processed ${result.Processed} of 10)`);
        Assert(/circuit breaker/i.test(String(result.ErrorMessage)), `error message names the circuit breaker: ${result.ErrorMessage}`);
        console.log(`      → circuit breaker tripped after ${result.Processed} records (Status=Failed)`);
    });

    suite.Test('RP5: a run spanning multiple batches processes every record', async () => {
        const records = Array.from({ length: 5 }, (_, n) => ({ EntityID: entityID!, RecordID: `rp-batch-${n}` }));
        const source = new ArraySource(records, entityID!, 'SingleRecord');
        const processor = new FunctionRecordProcessor(async () => ({ Status: 'Succeeded' as const }));

        const result = await RecordSetProcessor.Instance.Process({
            source, processor, contextUser: user, entityID: entityID!, triggeredBy: 'OnDemand', batchSize: 2,
        });
        AssertEqual(result.Status, 'Completed', 'completed across batches');
        AssertEqual(result.Processed, 5, 'all 5 records processed (3 batches of 2/2/1)');
        await settle(500);
        const details = await fetchRows('MJ: Process Run Details', `ProcessRunID='${result.ProcessRunID}'`, user);
        AssertEqual(details.length, 5, 'every record across the batches persisted a detail');
    });

    suite.Test('RP6: bounded concurrency processes records in parallel but never exceeds maxConcurrency', async () => {
        let active = 0;
        let maxActive = 0;
        const records = Array.from({ length: 6 }, (_, n) => ({ EntityID: entityID!, RecordID: `rp-conc-${n}` }));
        const source = new ArraySource(records, entityID!, 'SingleRecord');
        const processor = new FunctionRecordProcessor(async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await settle(20);
            active--;
            return { Status: 'Succeeded' as const };
        });

        const result = await RecordSetProcessor.Instance.Process({
            source, processor, contextUser: user, entityID: entityID!, triggeredBy: 'OnDemand', batchSize: 6, maxConcurrency: 3,
        });
        AssertEqual(result.Processed, 6, 'all processed');
        Assert(maxActive > 1, 'records genuinely ran concurrently');
        Assert(maxActive <= 3, `concurrency capped at maxConcurrency (peak ${maxActive})`);
        console.log(`      → peak concurrency ${maxActive} (cap 3), 6 records processed`);
    });

    const failures = await suite.Run();
    process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('\nBOOTSTRAP / CONNECTIVITY ERROR:', error instanceof Error ? error.message : error);
    process.exit(2);
});
