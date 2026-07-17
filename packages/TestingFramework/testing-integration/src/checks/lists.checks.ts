/**
 * lists.checks.ts — the 'lists' bundle (LS1–LS3): live integration checks for the Lists feature
 * substrate. Graduated VERBATIM from integration-test-scripts/lists-tests.ts (check bodies unchanged;
 * the fixture create/cleanup became a shared BundleLifecycle).
 *
 * Covers the v5.48 ListSource keyset-pagination change (StartRow/OFFSET → AfterKey seek over
 * ListDetail.ID) against the real database:
 *   - LS1: full iteration returns every member exactly once, in ID-seek pages
 *   - LS2: resume from a persisted keyset cursor on a fresh instance — no overlap, no gaps
 *   - LS3: a legacy Offset cursor is honored for its resume batch and converts to keyset
 *
 * Deterministic (no model calls). The lifecycle creates one throwaway `MJ: Lists` row + MEMBER_COUNT
 * `MJ: List Details` members (tagged "(mj-integration-test — safe to delete)") and deletes them.
 */
import { RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { MJListEntity, MJListDetailEntity } from '@memberjunction/core-entities';
import { ListSource, ProcessCursor } from '@memberjunction/record-set-processor-base';
import { Assert, AssertEqual } from '../test-runner';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck, IntegrationCheckContext } from '../check';

const FIXTURE_TAG = '(mj-integration-test — safe to delete)';
const MEMBER_COUNT = 25;
const BATCH_SIZE = 10;

/** Fetch the fixture (thrown if the lifecycle Setup didn't run — a wiring bug, not a test failure). */
function fx(ctx: IntegrationCheckContext) {
    Assert(ctx.ListsFixture != null, 'lists fixture missing (bundle Setup did not run)');
    return ctx.ListsFixture!;
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

export const ListsChecks: NamedCheck[] = [
    {
        Id: 'lists.LS1',
        Name: 'LS1: keyset iteration returns every member exactly once',
        Fn: async (ctx: IntegrationCheckContext) => {
            const user = ctx.User;
            const listId = fx(ctx).ListID;
            const seen = new Set<string>();
            const batches = await drain(new ListSource(listId), undefined, user, seen);
            AssertEqual(seen.size, MEMBER_COUNT, 'unique member count');
            AssertEqual(batches, 3, `batch count for ${MEMBER_COUNT} members @ ${BATCH_SIZE}/page`);
            console.log(`      → ${seen.size} members in ${batches} keyset pages`);
        }
    },
    {
        Id: 'lists.LS2',
        Name: 'LS2: resume from a persisted keyset cursor continues without overlap or gaps',
        Fn: async (ctx: IntegrationCheckContext) => {
            const user = ctx.User;
            const listId = fx(ctx).ListID;
            const first = await new ListSource(listId).NextBatch(undefined, BATCH_SIZE, user);
            AssertEqual(first.Records.length, BATCH_SIZE, 'first batch size');
            Assert(first.NextCursor.Key != null, 'keyset cursor missing after first batch');

            // Fresh instance simulates a process resume from the persisted cursor
            const seen = new Set<string>(first.Records.map((r) => r.RecordID));
            await drain(new ListSource(listId), first.NextCursor, user, seen);
            AssertEqual(seen.size, MEMBER_COUNT, 'combined member count after resume');
        }
    },
    {
        Id: 'lists.LS3',
        Name: 'LS3: a legacy Offset cursor resumes correctly and converts to keyset',
        Fn: async (ctx: IntegrationCheckContext) => {
            const user = ctx.User;
            const listId = fx(ctx).ListID;
            const tail = await new ListSource(listId).NextBatch({ Offset: 20 }, BATCH_SIZE, user);
            AssertEqual(tail.Records.length, MEMBER_COUNT - 20, 'tail size from legacy offset 20');
            Assert(tail.NextCursor.Key != null, 'legacy cursor did not convert to keyset');
            Assert(tail.Exhausted, 'source should be exhausted after the tail batch');
        }
    }
];

for (const check of ListsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('lists', {
    Setup: async (ctx: IntegrationCheckContext) => {
        const md = ctx.Provider;
        const user = ctx.User;

        // Reference (never mutate) an existing entity to satisfy MJ: Lists.EntityID.
        const entResult = await new RunView().RunView({ EntityName: 'MJ: Entities', ResultType: 'simple', MaxRows: 1 }, user);
        Assert(entResult.Success, `Resolving an entity failed: ${entResult.ErrorMessage}`);
        const entityID = (entResult.Results?.[0] as { ID?: string } | undefined)?.ID;
        Assert(!!entityID, 'Could not resolve an entity ID');

        const list = await md.GetEntityObject<MJListEntity>('MJ: Lists', user);
        list.NewRecord();
        list.Name = `Lists keyset suite ${FIXTURE_TAG}`;
        list.Description = 'Fixture for the lists bundle — safe to delete';
        list.EntityID = entityID!;
        list.UserID = user.ID;
        Assert(await list.Save(), `List fixture save failed: ${list.LatestResult?.CompleteMessage ?? 'unknown error'}`);

        // Publish the handle as soon as the list exists — Teardown sweeps members by ListID, so a
        // mid-loop crash still cleans up the list and any members already created.
        ctx.ListsFixture = { ListID: list.ID };

        for (let i = 0; i < MEMBER_COUNT; i++) {
            const detail = await md.GetEntityObject<MJListDetailEntity>('MJ: List Details', user);
            detail.NewRecord();
            detail.ListID = list.ID;
            detail.RecordID = `lists-int-${String(i).padStart(2, '0')}`;
            detail.Status = 'Active';
            Assert(await detail.Save(), `ListDetail fixture ${i} save failed: ${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = ctx.ListsFixture;
        if (!f) {
            return;
        }
        const md = ctx.Provider;
        const user = ctx.User;
        const details = await new RunView().RunView<{ ID: string }>({
            EntityName: 'MJ: List Details',
            ExtraFilter: `ListID='${f.ListID}'`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
        }, user);
        for (const row of details.Results ?? []) {
            const detail = await md.GetEntityObject<MJListDetailEntity>('MJ: List Details', user);
            if (await detail.Load(row.ID)) {
                await detail.Delete().catch(() => undefined);
            }
        }
        const list = await md.GetEntityObject<MJListEntity>('MJ: Lists', user);
        if (await list.Load(f.ListID)) {
            await list.Delete().catch(() => undefined);
        }
        ctx.ListsFixture = undefined;
    }
});
