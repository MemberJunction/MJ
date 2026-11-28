/**
 * lists-members-client.checks.ts — the 'lists-members-client' bundle (LC1): the bulk member
 * mutations of the Lists API, called over GraphQL against a running MJAPI.
 *
 * LC1 adds records to a list, moves two of them to a second list and removes one from the second
 * list, and checks the member counts in the database after each step.
 *
 * Deterministic (no model calls), CLIENT transport. The check skips when the provider is not a
 * GraphQL provider. It creates two throwaway lists and deletes them afterwards.
 */
import { Metadata } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLListsClient } from '@memberjunction/graphql-dataprovider';
import { Assert, AssertEqual, SkipCheck } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

import { CountListMembers, CreateFixtureList, DeleteFixtureList, LISTS_FIXTURE_TAG } from './_lists-fixture';

/** The lists client for the GraphQL provider of this run, or undefined on the server transport. */
function listsClient(provider: IMetadataProvider): GraphQLListsClient | undefined {
    if (provider instanceof GraphQLDataProvider) {
        return new GraphQLListsClient(provider);
    }
    const globalProvider = Metadata.Provider; // global-provider-ok: the integration client bootstrap installs the GraphQLDataProvider as the process global
    return globalProvider instanceof GraphQLDataProvider ? new GraphQLListsClient(globalProvider) : undefined;
}

export const ListsMembersClientChecks: NamedCheck[] = [
    {
        Id: 'lists-members-client.LC1',
        Name: 'LC1: add, move and remove over the API change the members of the right lists',
        Fn: async (ctx: IntegrationCheckContext) => {
            const client = listsClient(ctx.Provider);
            if (!client) {
                SkipCheck('not on client (GraphQL) transport; the list member mutations need a running MJAPI');
                return;
            }
            const source = await CreateFixtureList(ctx, `Lists members source ${LISTS_FIXTURE_TAG}`);
            const target = await CreateFixtureList(ctx, `Lists members target ${LISTS_FIXTURE_TAG}`);
            try {
                const added = await client.AddRecordsToList(source.ID, ['lc-a', 'lc-b', 'lc-c', 'lc-a']);
                Assert(added.Success, `AddRecordsToList failed: ${added.Message}`);
                AssertEqual(added.Counts?.Added, 3, 'records added, the repeated ID once');
                AssertEqual(await CountListMembers(source.ID, ctx.User), 3, 'source members after add');

                const moved = await client.CopyRecordsToList({
                    SourceListId: source.ID, TargetListId: target.ID, RecordIds: ['lc-a', 'lc-b'], RemoveFromSource: true,
                });
                Assert(moved.Success, `CopyRecordsToList failed: ${moved.Message}`);
                AssertEqual(moved.Counts?.Added, 2, 'records added to the target');
                AssertEqual(moved.Counts?.Removed, 2, 'records removed from the source');
                AssertEqual(await CountListMembers(source.ID, ctx.User), 1, 'source members after move');
                AssertEqual(await CountListMembers(target.ID, ctx.User), 2, 'target members after move');

                const removed = await client.RemoveRecordsFromList(target.ID, ['lc-a']);
                Assert(removed.Success, `RemoveRecordsFromList failed: ${removed.Message}`);
                AssertEqual(removed.Counts?.Removed, 1, 'records removed from the target');
                AssertEqual(await CountListMembers(target.ID, ctx.User), 1, 'target members after remove');
            } finally {
                await DeleteFixtureList(ctx, source.ID);
                await DeleteFixtureList(ctx, target.ID);
            }
        }
    }
];

for (const check of ListsMembersClientChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
