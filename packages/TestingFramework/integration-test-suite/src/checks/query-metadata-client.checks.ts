/**
 * Saved-query metadata is not loaded into the metadata object by default (IT175, client transport,
 * QM3 mutates).
 *
 * A browser's provider leaves the query items of the MJ_Metadata dataset unread: it asks the server
 * for them with a `1=0` item filter, on the data read and on the status read, and `QueryEngine` is
 * where saved queries come from. A saved query therefore never makes a client's metadata stale.
 *
 * - QM1: the session's deprecated query getters are empty and the query entities are not metadata
 *        members, while its `QueryEngine` holds the saved queries.
 * - QM2: the server's status answer for the skipped items reports no rows, so their stamps cannot move.
 * - QM3: a query saved by another session leaves this session's metadata current.
 */
import type { UserInfo } from '@memberjunction/core';
import { MJQueryCategoryEntity, MJQueryEntity, QueryEngine } from '@memberjunction/core-entities';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { Assert, AssertEqual, IntegrationCheckRegistry, SkipCheck } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { MUTATION_TIER_OFF_REASON, MutationTierOn } from './fixture-gates';
import { FixtureQuerySaveOptions } from './query-fixture-save-options';
import { CloseWireSession, OpenWireSession } from './wire-sessions';

const BUNDLE = 'query-metadata-client';

interface QueryMetadataFixture {
    Reader: GraphQLDataProvider;
    Writer: GraphQLDataProvider;
    User: UserInfo;
    MutationsOn: boolean;
    /** Rows QM3 created, deleted in Teardown (query before its category). */
    CreatedQueryID?: string;
    CreatedCategoryID?: string;
}

let fixture: QueryMetadataFixture | undefined;

function fx(): QueryMetadataFixture {
    Assert(fixture != null, `${BUNDLE} fixture missing (bundle Setup did not run)`);
    return fixture!;
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    // Opens two read-only sessions; it writes nothing (QM3 creates its own rows).
    Setup: async (ctx: IntegrationCheckContext) => {
        const reader = await OpenWireSession(false);
        const writer = await OpenWireSession(false);
        const user = reader.CurrentUser;
        Assert(user != null, 'the system API key resolved no current user');
        fixture = { Reader: reader, Writer: writer, User: user, MutationsOn: MutationTierOn(ctx) };
    },
    Teardown: async () => {
        const f = fixture;
        fixture = undefined;
        if (!f) {
            return;
        }
        try {
            await deleteCreatedRows(f);
        } finally {
            CloseWireSession(f.Reader);
            CloseWireSession(f.Writer);
        }
    }
});

async function deleteCreatedRows(f: QueryMetadataFixture): Promise<void> {
    if (f.CreatedQueryID) {
        const query = await f.Writer.GetEntityObject<MJQueryEntity>('MJ: Queries', f.User);
        if (await query.Load(f.CreatedQueryID)) {
            await query.Delete();
        }
    }
    if (f.CreatedCategoryID) {
        const category = await f.Writer.GetEntityObject<MJQueryCategoryEntity>('MJ: Query Categories', f.User);
        if (await category.Load(f.CreatedCategoryID)) {
            await category.Delete();
        }
    }
}

/** The `QueryEngine` bound to `session`'s connection, loaded. */
async function sessionQueryEngine(session: GraphQLDataProvider, user: UserInfo): Promise<QueryEngine> {
    const engine = QueryEngine.GetProviderInstance(session, QueryEngine) as QueryEngine;
    await engine.Config(false, user, session);
    return engine;
}

async function checkQm1GettersEmptyEngineLoaded(): Promise<void> {
    const f = fx();
    AssertEqual(f.Reader.LoadsQueryMetadata, false, 'QM1: a client provider does not load query metadata by default');
    AssertEqual(f.Reader.Queries.length, 0, 'QM1: the deprecated Queries getter is empty');
    AssertEqual(f.Reader.QueryFields.length, 0, 'QM1: the deprecated QueryFields getter is empty');
    AssertEqual(f.Reader.IsMetadataDatasetMember('MJ: Queries'), false, 'QM1: MJ: Queries is not a metadata member');
    AssertEqual(f.Reader.IsMetadataDatasetMember('MJ: Entities'), true, 'QM1: MJ: Entities is still a metadata member');
    const engine = await sessionQueryEngine(f.Reader, f.User);
    Assert(engine.Queries.length > 0, 'QM1: QueryEngine holds the saved queries');
}

async function checkQm2SkippedItemsReportNoRows(): Promise<void> {
    const f = fx();
    Assert(await f.Reader.RefreshRemoteMetadataTimestamps(), 'QM2: the metadata status read failed');
    const queries = f.Reader.LatestRemoteMetadata.find(t => t.Type === 'MJ: Queries');
    Assert(queries != null, 'QM2: the status has no MJ: Queries item');
    AssertEqual(queries!.RowCount, 0, 'QM2: the server reports no rows for the skipped MJ: Queries item');
    const entities = f.Reader.LatestRemoteMetadata.find(t => t.Type === 'MJ: Entities');
    Assert((entities?.RowCount ?? 0) > 0, 'QM2: the server still reports the MJ: Entities rows');
}

async function checkQm3SavedQueryLeavesMetadataCurrent(): Promise<void> {
    const f = fx();
    if (!f.MutationsOn) {
        SkipCheck(MUTATION_TIER_OFF_REASON);
    }
    AssertEqual(await f.Reader.CheckToSeeIfRefreshNeeded(undefined, true), false, 'QM3 precondition: the reader is current');

    const tag = `it175-${Date.now()}`;
    const category = await f.Writer.GetEntityObject<MJQueryCategoryEntity>('MJ: Query Categories', f.User);
    category.NewRecord();
    category.Name = `${tag} (safe to delete)`;
    category.UserID = f.User.ID;
    Assert(await category.Save(), `QM3: category save failed: ${category.LatestResult?.CompleteMessage ?? ''}`);
    f.CreatedCategoryID = category.ID;

    const query = await f.Writer.GetEntityObject<MJQueryEntity>('MJ: Queries', f.User);
    query.NewRecord();
    query.Name = `${tag}-query`;
    query.CategoryID = category.ID;
    query.SQL = 'SELECT 1 AS One';
    query.Status = 'Pending';
    Assert(await query.Save(FixtureQuerySaveOptions()), `QM3: query save failed: ${query.LatestResult?.CompleteMessage ?? ''}`);
    f.CreatedQueryID = query.ID;

    AssertEqual(await f.Reader.CheckToSeeIfRefreshNeeded(undefined, true), false, 'QM3: a saved query made the reader\'s metadata stale');
}

export const QueryMetadataClientChecks: NamedCheck[] = [
    { Id: `${BUNDLE}.QM1`, Name: 'QM1: the deprecated query getters are empty and QueryEngine holds the saved queries', Fn: checkQm1GettersEmptyEngineLoaded },
    { Id: `${BUNDLE}.QM2`, Name: 'QM2: the server reports no rows for the query items a client skips', Fn: checkQm2SkippedItemsReportNoRows },
    { Id: `${BUNDLE}.QM3`, Name: "QM3: a query saved by another session leaves a client's metadata current", Fn: checkQm3SavedQueryLeavesMetadataCurrent, RequiresMutation: true }
];

for (const check of QueryMetadataClientChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
