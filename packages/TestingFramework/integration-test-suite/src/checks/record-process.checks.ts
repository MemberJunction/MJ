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
import { RecordSetProcessor, FunctionRecordProcessor, NoOpTracker } from '@memberjunction/record-set-processor';
import { ArraySource } from '@memberjunction/record-set-processor-base';
import type { IProcessRunTracker, ProcessCursor, RecordRef, RunCounts, RunHandle } from '@memberjunction/record-set-processor-base';
import { Assert, AssertEqual, settle } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

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

/**
 * A DB-free {@link IProcessRunTracker} for the AP-series engine-seam checks. It persists nothing,
 * but (a) captures the cursor + counts handed to it at every checkpoint, (b) can request a graceful
 * pause once a target processed-count is reached (`pauseAtProcessed`), and (c) can replay a resume
 * cursor (`resumeCursor`). This lets AP1/AP11 exercise the engine's REAL cursor round-trip and
 * pause handshake — `RecordSetProcessor.Instance.Process` over a real `ArraySource` + real
 * `FunctionRecordProcessor` — with zero external dependencies and nothing to tear down.
 */
class InMemoryRunTracker implements IProcessRunTracker {
    /** Every (cursor, counts) pair seen at a checkpoint, in order. */
    public readonly Checkpoints: Array<{ cursor: ProcessCursor; counts: RunCounts }> = [];
    /** The cursor from the most recent checkpoint (the resume point when paused). */
    public LastCursor: ProcessCursor | undefined;

    constructor(private readonly opts: { resumeCursor?: ProcessCursor; pauseAtProcessed?: number } = {}) {}

    public async BeginRun(): Promise<RunHandle> {
        return {};
    }
    public async RecordResult(): Promise<void> {
        // no-op — per-record detail persistence is out of scope for these engine-seam checks
    }
    public async Checkpoint(_handle: RunHandle, cursor: ProcessCursor, counts: RunCounts): Promise<boolean> {
        this.Checkpoints.push({ cursor: { ...cursor }, counts: { ...counts } });
        this.LastCursor = { ...cursor };
        if (this.opts.pauseAtProcessed != null && counts.Processed >= this.opts.pauseAtProcessed) {
            return false; // request a graceful pause at this checkpoint
        }
        return true;
    }
    public async CompleteRun(): Promise<void> {
        // no-op
    }
    public async LoadResumeCursor(): Promise<ProcessCursor | undefined> {
        return this.opts.resumeCursor;
    }
}

/** Builds `count` fresh in-memory record refs tagged with `prefix` (e.g. `rp-halt-0`). */
function makeRecordRefs(entityID: string, prefix: string, count: number): RecordRef[] {
    return Array.from({ length: count }, (_, n) => ({ EntityID: entityID, RecordID: `${prefix}-${n}` }));
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
    },
    {
        Id: 'record-process.AP1',
        Name: 'AP1: resume-from-cursor — pause mid-run, resume, every record processed exactly once (no dup, no gap)',
        Fn: async (ctx: IntegrationCheckContext) => {
            const entityID = await resolveEntityID(ctx.User);
            const all = makeRecordRefs(entityID, 'ap1', 10);
            const firstLeg: string[] = [];
            const secondLeg: string[] = [];

            // Leg 1: pause after the checkpoint where >=4 records are processed (batchSize 2 → offset 4).
            const t1 = new InMemoryRunTracker({ pauseAtProcessed: 4 });
            const r1 = await RecordSetProcessor.Instance.Process({
                source: new ArraySource(all, entityID),
                processor: new FunctionRecordProcessor(async (rec) => { firstLeg.push(String(rec.RecordID)); return { Status: 'Succeeded' as const }; }),
                tracker: t1, contextUser: ctx.User, batchSize: 2,
            });
            AssertEqual(r1.Status, 'Paused', 'AP1 leg 1 must pause at the checkpoint');
            AssertEqual(r1.Processed, 4, 'AP1 leg 1 processed exactly to the pause boundary');
            Assert(t1.LastCursor?.Offset === 4, `AP1 leg 1 cursor offset must equal processed count (got ${t1.LastCursor?.Offset})`);

            // Leg 2: resume from leg 1's cursor — the engine asks the tracker for the resume cursor.
            const t2 = new InMemoryRunTracker({ resumeCursor: t1.LastCursor });
            const r2 = await RecordSetProcessor.Instance.Process({
                source: new ArraySource(all, entityID),
                processor: new FunctionRecordProcessor(async (rec) => { secondLeg.push(String(rec.RecordID)); return { Status: 'Succeeded' as const }; }),
                tracker: t2, contextUser: ctx.User, batchSize: 2, resume: true,
            });
            AssertEqual(r2.Status, 'Completed', 'AP1 leg 2 must run to completion');

            // The marquee invariant: union covers ALL records, intersection is EMPTY.
            const dup = firstLeg.filter((id) => secondLeg.includes(id));
            AssertEqual(dup.length, 0, `AP1: resume re-processed ${dup.length} record(s) (dup: ${dup.join(',')})`);
            const seen = new Set([...firstLeg, ...secondLeg]);
            const missing = all.map((r) => String(r.RecordID)).filter((id) => !seen.has(id));
            AssertEqual(missing.length, 0, `AP1: resume skipped ${missing.length} record(s) (gap: ${missing.join(',')})`);
            AssertEqual(seen.size, 10, 'AP1: exactly the 10 source records were processed across both legs');
        }
    },
    {
        Id: 'record-process.AP9',
        Name: "AP9: budget gate — onAfterBatch veto pauses with 'Auto-paused:' reason; a THROWING hook is swallowed and the run completes",
        Fn: async (ctx: IntegrationCheckContext) => {
            const entityID = await resolveEntityID(ctx.User);

            // Leg A: the gate vetoes after the first batch → Paused with the stamped reason.
            const rA = await RecordSetProcessor.Instance.Process({
                source: new ArraySource(makeRecordRefs(entityID, 'ap9a', 6), entityID),
                processor: new FunctionRecordProcessor(async () => ({ Status: 'Succeeded' as const })),
                tracker: new InMemoryRunTracker(), contextUser: ctx.User, batchSize: 2,
                onAfterBatch: async () => ({ continue: false, reason: 'it-budget-cap' }),
            });
            AssertEqual(rA.Status, 'Paused', 'AP9: a vetoing budget gate must pause the run');
            AssertEqual(rA.Processed, 2, 'AP9: the veto lands AFTER the first batch (2 of 6 processed)');
            Assert((rA.ErrorMessage ?? '').startsWith('Auto-paused:') && (rA.ErrorMessage ?? '').includes('it-budget-cap'),
                `AP9: pause reason must be stamped 'Auto-paused: <reason>' (got "${rA.ErrorMessage}")`);

            // Leg B: a THROWING gate must be isolated (safeAfterBatch) — the run completes.
            const rB = await RecordSetProcessor.Instance.Process({
                source: new ArraySource(makeRecordRefs(entityID, 'ap9b', 6), entityID),
                processor: new FunctionRecordProcessor(async () => ({ Status: 'Succeeded' as const })),
                tracker: new InMemoryRunTracker(), contextUser: ctx.User, batchSize: 2,
                onAfterBatch: async () => { throw new Error('it-hook-explosion'); },
            });
            AssertEqual(rB.Status, 'Completed', 'AP9: a throwing budget hook must be swallowed, not fail the run');
            AssertEqual(rB.Processed, 6, 'AP9: all records processed despite the throwing hook');
        }
    },
    {
        Id: 'record-process.AP10',
        Name: 'AP10: maxRecords hard cap — a 10-record source with maxRecords 7 processes exactly 7 (mid-batch trim) then completes',
        Fn: async (ctx: IntegrationCheckContext) => {
            const entityID = await resolveEntityID(ctx.User);
            const processedIds: string[] = [];
            const result = await RecordSetProcessor.Instance.Process({
                source: new ArraySource(makeRecordRefs(entityID, 'ap10', 10), entityID),
                processor: new FunctionRecordProcessor(async (rec) => { processedIds.push(String(rec.RecordID)); return { Status: 'Succeeded' as const }; }),
                tracker: new InMemoryRunTracker(), contextUser: ctx.User,
                batchSize: 3, maxRecords: 7,
            });
            AssertEqual(result.Status, 'Completed', 'AP10: a capped run terminates Completed, not Paused/Failed');
            AssertEqual(result.Processed, 7, `AP10: the cap must trim mid-batch to EXACTLY 7 (3+3+1), got ${result.Processed}`);
            // The trim must take the FIRST 7 in order — no skip-ahead.
            AssertEqual(processedIds.join(','), makeRecordRefs(entityID, 'ap10', 7).map((r) => String(r.RecordID)).join(','),
                'AP10: the capped run processes the first 7 records in source order');
        }
    },
    {
        Id: 'record-process.AP11',
        Name: 'AP11: pause handshake — a tracker veto halts a live loop at the NEXT checkpoint (batch boundary), cursor = processed',
        Fn: async (ctx: IntegrationCheckContext) => {
            const entityID = await resolveEntityID(ctx.User);
            // Ask to pause once >=5 are processed with batchSize 3: the engine only consults the
            // tracker at checkpoints (batch boundaries), so the halt must land at 6 — proving the
            // handshake is graceful (finish the in-flight batch) rather than abortive.
            const tracker = new InMemoryRunTracker({ pauseAtProcessed: 5 });
            const result = await RecordSetProcessor.Instance.Process({
                source: new ArraySource(makeRecordRefs(entityID, 'ap11', 12), entityID),
                processor: new FunctionRecordProcessor(async () => ({ Status: 'Succeeded' as const })),
                tracker, contextUser: ctx.User, batchSize: 3,
            });
            AssertEqual(result.Status, 'Paused', 'AP11: the tracker veto must pause the run');
            AssertEqual(result.Processed, 6, `AP11: halt lands at the NEXT batch boundary (6, not 5) — got ${result.Processed}`);
            Assert(tracker.LastCursor?.Offset === 6, `AP11: the checkpointed cursor equals the processed count (got ${tracker.LastCursor?.Offset})`);
            Assert(tracker.Checkpoints.length === 2, `AP11: exactly 2 checkpoints before the halt (got ${tracker.Checkpoints.length})`);
        }
    },
];

for (const check of RecordProcessChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
