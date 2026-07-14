/**
 * lists-tests.ts — live integration tests for the Lists feature substrate.
 *
 * Deterministic (NO model calls), so it runs in the default tier. Covers the
 * v5.48 ListSource keyset-pagination change (StartRow/OFFSET → AfterKey seek
 * over ListDetail.ID) against the real database:
 *   - LS1 — full iteration returns every member exactly once, in ID-seek pages
 *   - LS2 — resume from a persisted keyset cursor on a fresh instance:
 *           no overlap, no gaps
 *   - LS3 — a legacy Offset cursor (persisted by a run started before the
 *           keyset change) is honored for its resume batch, and the returned
 *           cursor converts to keyset
 *
 * Self-cleaning: creates its own `MJ: Lists` record + `MJ: List Details`
 * members tagged "(mj-integration-test — safe to delete)" and deletes them in
 * a finally block. Reference-only toward existing records (reads one entity
 * ID from `MJ: Entities`; RecordID values are synthetic strings).
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/lists-tests.ts
 *
 * Exit code: 0 = passed, 1 = failures, 2 = bootstrap error.
 */
import { TestRunner, Assert, AssertEqual } from './lib/harness';
import { bootstrapAI } from './lib/ai-bootstrap';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJListEntity, MJListDetailEntity } from '@memberjunction/core-entities';
import { ListSource } from '@memberjunction/record-set-processor-base';
import { ProcessCursor } from '@memberjunction/record-set-processor-base';

const FIXTURE_TAG = '(mj-integration-test — safe to delete)';
const MEMBER_COUNT = 25;
const BATCH_SIZE = 10;

async function createFixtures(md: Metadata, user: UserInfo, entityID: string): Promise<string> {
    const list = await md.GetEntityObject<MJListEntity>('MJ: Lists', user);
    list.NewRecord();
    list.Name = `Lists keyset suite ${FIXTURE_TAG}`;
    list.Description = 'Fixture for lists-tests.ts — safe to delete';
    list.EntityID = entityID;
    list.UserID = user.ID;
    Assert(await list.Save(), `List fixture save failed: ${list.LatestResult?.CompleteMessage ?? 'unknown error'}`);

    for (let i = 0; i < MEMBER_COUNT; i++) {
        const detail = await md.GetEntityObject<MJListDetailEntity>('MJ: List Details', user);
        detail.NewRecord();
        detail.ListID = list.ID;
        detail.RecordID = `lists-int-${String(i).padStart(2, '0')}`;
        detail.Status = 'Active';
        Assert(await detail.Save(), `ListDetail fixture ${i} save failed: ${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    return list.ID;
}

async function cleanupFixtures(md: Metadata, user: UserInfo, listId: string): Promise<void> {
    const rv = new RunView();
    const details = await rv.RunView<{ ID: string }>({
        EntityName: 'MJ: List Details',
        ExtraFilter: `ListID='${listId}'`,
        Fields: ['ID'],
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    for (const row of details.Results ?? []) {
        const detail = await md.GetEntityObject<MJListDetailEntity>('MJ: List Details', user);
        if (await detail.Load(row.ID)) {
            await detail.Delete();
        }
    }
    const list = await md.GetEntityObject<MJListEntity>('MJ: Lists', user);
    if (await list.Load(listId)) {
        await list.Delete();
    }
}

/** Drains the source from the given cursor, accumulating RecordIDs into `seen` and asserting uniqueness. */
async function drain(source: ListSource, startCursor: ProcessCursor | undefined, user: UserInfo, seen: Set<string>): Promise<number> {
    let cursor = startCursor;
    let exhausted = false;
    let batches = 0;
    while (!exhausted) {
        const batch = await source.NextBatch(cursor, BATCH_SIZE, user);
        batches++;
        Assert(batches <= 10, 'Runaway pagination — cursor is not advancing');
        for (const rec of batch.Records) {
            Assert(!seen.has(rec.RecordID), `Duplicate record across batches: ${rec.RecordID}`);
            seen.add(rec.RecordID);
        }
        cursor = batch.NextCursor;
        exhausted = batch.Exhausted;
    }
    return batches;
}

async function main(): Promise<void> {
    const { user } = await bootstrapAI();
    const suite = new TestRunner('Lists live integration (deterministic — ListSource keyset pagination)');
    const md = new Metadata(); // global-provider-ok: integration-test harness runs as a single-provider script

    const entResult = await new RunView().RunView(
        { EntityName: 'MJ: Entities', ResultType: 'simple', MaxRows: 1 }, user,
    );
    Assert(entResult.Success, `Resolving an entity failed: ${entResult.ErrorMessage}`);
    const entityID = (entResult.Results?.[0] as { ID?: string } | undefined)?.ID;
    Assert(!!entityID, 'Could not resolve an entity ID');

    const listId = await createFixtures(md, user, entityID!);

    suite.Test('LS1: keyset iteration returns every member exactly once', async () => {
        const seen = new Set<string>();
        const batches = await drain(new ListSource(listId), undefined, user, seen);
        AssertEqual(seen.size, MEMBER_COUNT, 'unique member count');
        AssertEqual(batches, 3, `batch count for ${MEMBER_COUNT} members @ ${BATCH_SIZE}/page`);
        console.log(`      → ${seen.size} members in ${batches} keyset pages`);
    });

    suite.Test('LS2: resume from a persisted keyset cursor continues without overlap or gaps', async () => {
        const first = await new ListSource(listId).NextBatch(undefined, BATCH_SIZE, user);
        AssertEqual(first.Records.length, BATCH_SIZE, 'first batch size');
        Assert(first.NextCursor.Key != null, 'keyset cursor missing after first batch');

        // Fresh instance simulates a process resume from the persisted cursor
        const seen = new Set<string>(first.Records.map((r) => r.RecordID));
        await drain(new ListSource(listId), first.NextCursor, user, seen);
        AssertEqual(seen.size, MEMBER_COUNT, 'combined member count after resume');
    });

    suite.Test('LS3: a legacy Offset cursor resumes correctly and converts to keyset', async () => {
        const tail = await new ListSource(listId).NextBatch({ Offset: 20 }, BATCH_SIZE, user);
        AssertEqual(tail.Records.length, MEMBER_COUNT - 20, 'tail size from legacy offset 20');
        Assert(tail.NextCursor.Key != null, 'legacy cursor did not convert to keyset');
        Assert(tail.Exhausted, 'source should be exhausted after the tail batch');
    });

    let failures = 0;
    try {
        failures = await suite.Run();
    } finally {
        await cleanupFixtures(md, user, listId);
    }
    process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('\nBOOTSTRAP / CONNECTIVITY ERROR:', error instanceof Error ? error.message : error);
    process.exit(2);
});
