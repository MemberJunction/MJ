/**
 * Shared fixture helpers for the list check bundles: throwaway lists, members and their cleanup.
 */
import { RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { MJListEntity, MJListDetailEntity } from '@memberjunction/core-entities';
import { Assert } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';

/** Marks a fixture row as test data. */
export const LISTS_FIXTURE_TAG = '(mj-integration-test — safe to delete)';

/** Creates and saves a throwaway list that points at an existing entity. */
export async function CreateFixtureList(ctx: IntegrationCheckContext, name: string): Promise<MJListEntity> {
    const user = ctx.User;
    // Reference (never mutate) an existing entity to satisfy MJ: Lists.EntityID.
    const entResult = await new RunView().RunView({ EntityName: 'MJ: Entities', ResultType: 'simple', MaxRows: 1 }, user);
    Assert(entResult.Success, `Resolving an entity failed: ${entResult.ErrorMessage}`);
    const entityID = (entResult.Results?.[0] as { ID?: string } | undefined)?.ID;
    Assert(!!entityID, 'Could not resolve an entity ID');

    const list = await ctx.Provider.GetEntityObject<MJListEntity>('MJ: Lists', user);
    list.NewRecord();
    list.Name = name;
    list.Description = 'Fixture for the lists bundle — safe to delete';
    list.EntityID = entityID!;
    list.UserID = user.ID;
    Assert(await list.Save(), `List fixture save failed: ${list.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    return list;
}

/** Adds `count` members with synthetic record IDs to a list. */
export async function AddFixtureMembers(ctx: IntegrationCheckContext, listId: string, count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
        const detail = await ctx.Provider.GetEntityObject<MJListDetailEntity>('MJ: List Details', ctx.User);
        detail.NewRecord();
        detail.ListID = listId;
        detail.RecordID = `lists-int-${String(i).padStart(2, '0')}`;
        detail.Status = 'Active';
        Assert(await detail.Save(), `ListDetail fixture ${i} save failed: ${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
}

/** Counts the members of a list directly in the database. */
export async function CountListMembers(listId: string, user: UserInfo): Promise<number> {
    const result = await new RunView().RunView<{ ID: string }>({
        EntityName: 'MJ: List Details',
        ExtraFilter: `ListID='${listId}'`,
        Fields: ['ID'],
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    Assert(result.Success, `Counting list members failed: ${result.ErrorMessage}`);
    return result.Results.length;
}

/** Deletes a fixture list and its members. Does nothing when the list is already gone; never throws. */
export async function DeleteFixtureList(ctx: IntegrationCheckContext, listId: string): Promise<void> {
    const user = ctx.User;
    const details = await new RunView().RunView<{ ID: string }>({
        EntityName: 'MJ: List Details',
        ExtraFilter: `ListID='${listId}'`,
        Fields: ['ID'],
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    for (const row of details.Results ?? []) {
        const detail = await ctx.Provider.GetEntityObject<MJListDetailEntity>('MJ: List Details', user);
        if (await detail.Load(row.ID)) {
            await detail.Delete().catch(() => undefined);
        }
    }
    const list = await ctx.Provider.GetEntityObject<MJListEntity>('MJ: Lists', user);
    if (await list.Load(listId)) {
        await list.Delete().catch(() => undefined);
    }
}
