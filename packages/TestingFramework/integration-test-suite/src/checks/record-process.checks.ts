/**
 * record-process.checks.ts — the 'record-process' bundle (RP1–RP8): live integration checks for
 * the RecordSetProcessor substrate. Graduated verbatim from
 * integration-test-scripts/record-process-tests.ts so the driver (IT04) and the standalone script
 * run one definition.
 *
 * Deterministic (NO model calls — a FunctionRecordProcessor). Drives RecordSetProcessor.Process over
 * an in-memory ArraySource and verifies the persisted run: MJ: Process Runs (Status + counts + DryRun)
 * and MJ: Process Run Details (one terminal row per record, fire-and-forget writes landed). Each check
 * is self-contained (it creates its own in-memory records); the only shared state is a single resolved
 * entity ID (the FK on ProcessRun), memoized per run. The ProcessRun/Detail audit rows the substrate
 * writes are its own output and left as-is (like the server-cache mutation checks), so no teardown.
 */
import { RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { RecordSetProcessor, FunctionRecordProcessor } from '@memberjunction/record-set-processor';
import { ArraySource } from '@memberjunction/record-set-processor-base';
import { Assert, AssertEqual, settle } from '../test-runner';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck, IntegrationCheckContext } from '../check';

async function fetchRows(entity: string, filter: string, user: UserInfo): Promise<Record<string, unknown>[]> {
    const r = await new RunView().RunView({ EntityName: entity, ExtraFilter: filter, ResultType: 'simple', BypassCache: true }, user);
    Assert(r.Success, `RunView('${entity}') failed: ${r.ErrorMessage}`);
    return r.Results as Record<string, unknown>[];
}

/** Any valid Entity ID works as the source's EntityID (FK on ProcessRun). Resolve one via RunView. */
async function resolveEntityID(user: UserInfo): Promise<string> {
    const entResult = await new RunView().RunView(
        { EntityName: 'MJ: Entities', ResultType: 'simple', MaxRows: 1 }, user,
    );
    Assert(entResult.Success, `Resolving an entity failed: ${entResult.ErrorMessage}`);
    const entityID = (entResult.Results?.[0] as { ID?: string } | undefined)?.ID;
    Assert(!!entityID, `Could not resolve an entity ID (got ${entResult.Results?.length ?? 0} rows)`);
    return entityID!;
}

export const RecordProcessChecks: NamedCheck[] = [
    {
        Id: 'record-process.RP1',
        Name: 'RP1: a 3-record run persists a Process Run + a terminal Process Run Detail per record',
        Fn: async (ctx: IntegrationCheckContext) => {
            const user = ctx.User;
            const entityID = await resolveEntityID(user);
            const records = [1, 2, 3].map((n) => ({ EntityID: entityID, RecordID: `rp-test-${n}` }));
            const source = new ArraySource(records, entityID, 'SingleRecord');
            const processor = new FunctionRecordProcessor(async () => ({ Status: 'Succeeded' as const, ResultPayload: { ok: true } }));

            const result = await RecordSetProcessor.Instance.Process({
                source, processor, contextUser: user, entityID, triggeredBy: 'OnDemand',
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
        }
    },
    {
        Id: 'record-process.RP2',
        Name: 'RP2: mixed success/error/skip counts are recorded accurately on the Process Run',
        Fn: async (ctx: IntegrationCheckContext) => {
            const user = ctx.User;
            const entityID = await resolveEntityID(user);
            const records = ['ok', 'err', 'skip'].map((tag) => ({ EntityID: entityID, RecordID: `rp-mix-${tag}` }));
            const source = new ArraySource(records, entityID, 'SingleRecord');
            const processor = new FunctionRecordProcessor(async (rec) => {
                if (String(rec.RecordID).endsWith('err')) return { Status: 'Failed' as const, ErrorMessage: 'forced' };
                if (String(rec.RecordID).endsWith('skip')) return { Status: 'Skipped' as const };
                return { Status: 'Succeeded' as const };
            });

            const result = await RecordSetProcessor.Instance.Process({
                source, processor, contextUser: user, entityID, triggeredBy: 'OnDemand',
            });
            AssertEqual(result.Processed, 3, 'processed');
            AssertEqual(result.Success, 1, 'success');
            AssertEqual(result.Error, 1, 'error');
            AssertEqual(result.Skipped, 1, 'skipped');

            await settle(500);
            const details = await fetchRows('MJ: Process Run Details', `ProcessRunID='${result.ProcessRunID}'`, user);
            AssertEqual(details.length, 3, 'detail rows');
            console.log(`      → run ${result.ProcessRunID}: success=1 error=1 skipped=1, ${details.length} details persisted`);
        }
    },
    {
        Id: 'record-process.RP3',
        Name: 'RP3: a processor that THROWS isolates the bad record (Error) and still persists every detail',
        Fn: async (ctx: IntegrationCheckContext) => {
            const user = ctx.User;
            const entityID = await resolveEntityID(user);
            const records = ['a', 'boom', 'c'].map((tag) => ({ EntityID: entityID, RecordID: `rp-throw-${tag}` }));
            const source = new ArraySource(records, entityID, 'SingleRecord');
            // Per-record isolation: one record throws; the engine must catch it, mark that record an error,
            // and continue — the run is not aborted and every detail still persists (fire-and-forget).
            const processor = new FunctionRecordProcessor(async (rec) => {
                if (String(rec.RecordID).endsWith('boom')) {
                    throw new Error('processor blew up on this record');
                }
                return { Status: 'Succeeded' as const };
            });

            const result = await RecordSetProcessor.Instance.Process({
                source, processor, contextUser: user, entityID, triggeredBy: 'OnDemand',
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
        }
    },
    {
        Id: 'record-process.RP4',
        Name: 'RP4: the error-rate circuit breaker trips and stops the run (Status=Failed, processed < total)',
        Fn: async (ctx: IntegrationCheckContext) => {
            const user = ctx.User;
            const entityID = await resolveEntityID(user);
            const records = Array.from({ length: 10 }, (_, n) => ({ EntityID: entityID, RecordID: `rp-cb-${n}` }));
            const source = new ArraySource(records, entityID, 'SingleRecord');
            const processor = new FunctionRecordProcessor(async () => ({ Status: 'Failed' as const, ErrorMessage: 'always fails' }));

            const result = await RecordSetProcessor.Instance.Process({
                source, processor, contextUser: user, entityID, triggeredBy: 'OnDemand',
                batchSize: 1, errorThresholdPercent: 50,
            });
            AssertEqual(result.Status, 'Failed', 'run failed via circuit breaker');
            Assert(result.Processed < 10, `circuit breaker stopped early (processed ${result.Processed} of 10)`);
            Assert(/circuit breaker/i.test(String(result.ErrorMessage)), `error message names the circuit breaker: ${result.ErrorMessage}`);
            console.log(`      → circuit breaker tripped after ${result.Processed} records (Status=Failed)`);
        }
    },
    {
        Id: 'record-process.RP5',
        Name: 'RP5: a run spanning multiple batches processes every record',
        Fn: async (ctx: IntegrationCheckContext) => {
            const user = ctx.User;
            const entityID = await resolveEntityID(user);
            const records = Array.from({ length: 5 }, (_, n) => ({ EntityID: entityID, RecordID: `rp-batch-${n}` }));
            const source = new ArraySource(records, entityID, 'SingleRecord');
            const processor = new FunctionRecordProcessor(async () => ({ Status: 'Succeeded' as const }));

            const result = await RecordSetProcessor.Instance.Process({
                source, processor, contextUser: user, entityID, triggeredBy: 'OnDemand', batchSize: 2,
            });
            AssertEqual(result.Status, 'Completed', 'completed across batches');
            AssertEqual(result.Processed, 5, 'all 5 records processed (3 batches of 2/2/1)');
            await settle(500);
            const details = await fetchRows('MJ: Process Run Details', `ProcessRunID='${result.ProcessRunID}'`, user);
            AssertEqual(details.length, 5, 'every record across the batches persisted a detail');
        }
    },
    {
        Id: 'record-process.RP6',
        Name: 'RP6: bounded concurrency processes records in parallel but never exceeds maxConcurrency',
        Fn: async (ctx: IntegrationCheckContext) => {
            const user = ctx.User;
            const entityID = await resolveEntityID(user);
            let active = 0;
            let maxActive = 0;
            const records = Array.from({ length: 6 }, (_, n) => ({ EntityID: entityID, RecordID: `rp-conc-${n}` }));
            const source = new ArraySource(records, entityID, 'SingleRecord');
            const processor = new FunctionRecordProcessor(async () => {
                active++;
                maxActive = Math.max(maxActive, active);
                await settle(20);
                active--;
                return { Status: 'Succeeded' as const };
            });

            const result = await RecordSetProcessor.Instance.Process({
                source, processor, contextUser: user, entityID, triggeredBy: 'OnDemand', batchSize: 6, maxConcurrency: 3,
            });
            AssertEqual(result.Processed, 6, 'all processed');
            Assert(maxActive > 1, 'records genuinely ran concurrently');
            Assert(maxActive <= 3, `concurrency capped at maxConcurrency (peak ${maxActive})`);
            console.log(`      → peak concurrency ${maxActive} (cap 3), 6 records processed`);
        }
    },
    {
        Id: 'record-process.RP7',
        Name: 'RP7: a dry-run pass records DryRun=1 on the Process Run header',
        Fn: async (ctx: IntegrationCheckContext) => {
            const user = ctx.User;
            const entityID = await resolveEntityID(user);
            const records = [1, 2].map((n) => ({ EntityID: entityID, RecordID: `rp-dry-${n}` }));
            const source = new ArraySource(records, entityID, 'SingleRecord');
            const processor = new FunctionRecordProcessor(async () => ({ Status: 'Succeeded' as const }));

            const result = await RecordSetProcessor.Instance.Process({
                source, processor, contextUser: user, entityID, triggeredBy: 'OnDemand', dryRun: true,
            });
            Assert(result.ProcessRunID != null, 'No Process Run was created');

            await settle(500);
            const run = await fetchRows('MJ: Process Runs', `ID='${result.ProcessRunID}'`, user);
            AssertEqual(run.length, 1, 'process run row count');
            AssertEqual(Boolean(run[0].DryRun), true, 'persisted DryRun flag is true for a dry-run pass');
            console.log(`      → dry-run ${result.ProcessRunID}: persisted DryRun=${run[0].DryRun}`);
        }
    },
    {
        Id: 'record-process.RP8',
        Name: 'RP8: a normal pass records DryRun=0 (default) — distinguishable from a preview',
        Fn: async (ctx: IntegrationCheckContext) => {
            const user = ctx.User;
            const entityID = await resolveEntityID(user);
            const records = [1, 2].map((n) => ({ EntityID: entityID, RecordID: `rp-apply-${n}` }));
            const source = new ArraySource(records, entityID, 'SingleRecord');
            const processor = new FunctionRecordProcessor(async () => ({ Status: 'Succeeded' as const }));

            // dryRun omitted entirely — the default must persist as DryRun=0, not null.
            const result = await RecordSetProcessor.Instance.Process({
                source, processor, contextUser: user, entityID, triggeredBy: 'OnDemand',
            });
            Assert(result.ProcessRunID != null, 'No Process Run was created');

            await settle(500);
            const run = await fetchRows('MJ: Process Runs', `ID='${result.ProcessRunID}'`, user);
            AssertEqual(run.length, 1, 'process run row count');
            AssertEqual(Boolean(run[0].DryRun), false, 'persisted DryRun flag is false for a normal apply');
            console.log(`      → apply ${result.ProcessRunID}: persisted DryRun=${run[0].DryRun}`);
        }
    }
];

for (const check of RecordProcessChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
