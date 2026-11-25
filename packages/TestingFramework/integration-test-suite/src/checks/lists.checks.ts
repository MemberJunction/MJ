/**
 * lists.checks.ts — the 'lists' bundle (LS1–LS4): live integration checks for the Lists feature
 * substrate. LS1–LS3 were graduated from integration-test-scripts/lists-tests.ts; the fixture
 * create/cleanup is a shared BundleLifecycle.
 *
 * Covers the v5.48 ListSource keyset-pagination change (StartRow/OFFSET → AfterKey seek over
 * ListDetail.ID) against the real database:
 *   - LS1: full iteration returns every member exactly once, in ID-seek pages
 *   - LS2: resume from a persisted keyset cursor on a fresh instance — no overlap, no gaps
 *   - LS3: a legacy Offset cursor is honored for its resume batch and converts to keyset
 *
 * LS4 deletes a list that has members and expects the database to remove the members with it.
 *
 * Deterministic (no model calls). The lifecycle creates one throwaway `MJ: Lists` row + MEMBER_COUNT
 * `MJ: List Details` members (tagged "(mj-integration-test — safe to delete)") and deletes them.
 */
import type { UserInfo } from '@memberjunction/core';
import { ListSource, ProcessCursor } from '@memberjunction/record-set-processor-base';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

import { AddFixtureMembers, CountListMembers, CreateFixtureList, DeleteFixtureList, LISTS_FIXTURE_TAG } from './_lists-fixture';

const FIXTURE_TAG = LISTS_FIXTURE_TAG;
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
    },
    {
        Id: 'lists.LS4',
        Name: 'LS4: deleting a list also deletes its members',
        Fn: async (ctx: IntegrationCheckContext) => {
            const list = await CreateFixtureList(ctx, `Lists delete suite ${FIXTURE_TAG}`);
            const listId = list.ID;
            await AddFixtureMembers(ctx, listId, 3);
            AssertEqual(await CountListMembers(listId, ctx.User), 3, 'member count before delete');

            try {
                const deleted = await list.Delete();
                Assert(deleted, `List delete failed: ${list.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                AssertEqual(await CountListMembers(listId, ctx.User), 0, 'member count after delete');
            } finally {
                await DeleteFixtureList(ctx, listId);
            }
        }
    }
];

for (const check of ListsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('lists', {
    Setup: async (ctx: IntegrationCheckContext) => {
        const list = await CreateFixtureList(ctx, `Lists keyset suite ${FIXTURE_TAG}`);

        // Publish the handle as soon as the list exists — Teardown sweeps members by ListID, so a
        // mid-loop crash still cleans up the list and any members already created.
        ctx.ListsFixture = { ListID: list.ID };

        await AddFixtureMembers(ctx, list.ID, MEMBER_COUNT);
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = ctx.ListsFixture;
        if (!f) {
            return;
        }
        await DeleteFixtureList(ctx, f.ListID);
        ctx.ListsFixture = undefined;
    }
});
