/**
 * Optimistic concurrency over the wire (IT149, client transport, mutating).
 *
 * Two independent GraphQL sessions of the same user edit one `MJ: User Settings` row. The server's
 * `TestAndSetClientOldValuesToDBValues` must reject a stale overlapping save, accept a stale save
 * that converges on the stored value, accept a stale non-overlapping save while keeping the other
 * session's column, hand the merged row back to the saving session, and never write part of a
 * rejected save.
 */
import { RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { MJUserSettingEntity } from '@memberjunction/core-entities';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { Assert, AssertEqual, IntegrationCheckRegistry, SkipCheck } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { MUTATION_TIER_OFF_REASON, MutationTierOn } from './fixture-gates';
import { CloseWireSession, OpenWireSession } from './wire-sessions';

const BUNDLE = 'concurrency-conflict-client';
const ENTITY = 'MJ: User Settings';
const CONFLICT_TEXT = /Concurrent modification conflict/i;

interface ConcurrencyFixture {
    SessionA: GraphQLDataProvider;
    SessionB: GraphQLDataProvider;
    User: UserInfo;
    Tag: string;
    RecordID: string;
}

let fixture: ConcurrencyFixture | undefined;
/** Set by Setup when the fixture was deliberately not created; every check then skips with it. */
let skipReason: string | undefined;

function fx(): ConcurrencyFixture {
    if (skipReason) {
        SkipCheck(skipReason);
    }
    Assert(fixture != null, `${BUNDLE} fixture missing (bundle Setup did not run)`);
    return fixture!;
}

async function load(session: GraphQLDataProvider, user: UserInfo, id: string): Promise<MJUserSettingEntity> {
    const entity = await session.GetEntityObject<MJUserSettingEntity>(ENTITY, user);
    Assert(await entity.Load(id), `load of ${ENTITY} ${id} failed`);
    return entity;
}

async function storedValues(f: ConcurrencyFixture): Promise<{ Setting: string; Value: string | null }> {
    const result = await RunView.FromMetadataProvider(f.SessionA).RunView<{ Setting: string; Value: string | null }>({
        EntityName: ENTITY, ExtraFilter: `ID='${f.RecordID}'`, Fields: ['Setting', 'Value'], ResultType: 'simple', BypassCache: true
    }, f.User);
    Assert(result.Success && result.Results.length === 1, `stored row read failed: ${result.ErrorMessage ?? 'no row'}`);
    return result.Results[0];
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext) => {
        // Setup writes nothing on a deterministic-only run: no sessions, no row.
        if (!MutationTierOn(ctx)) {
            skipReason = MUTATION_TIER_OFF_REASON;
            return;
        }
        const sessionA = await OpenWireSession(false);
        const sessionB = await OpenWireSession(false);
        const user = sessionA.CurrentUser;
        Assert(user != null, 'the system API key resolved no current user');
        const tag = `it147-${Date.now()}`;
        const seed = await sessionA.GetEntityObject<MJUserSettingEntity>(ENTITY, user);
        seed.NewRecord();
        seed.UserID = user.ID;
        seed.Setting = tag;
        seed.Value = 'v0';
        Assert(await seed.Save(), `fixture create failed: ${seed.LatestResult?.CompleteMessage ?? ''}`);
        fixture = { SessionA: sessionA, SessionB: sessionB, User: user, Tag: tag, RecordID: seed.ID };
    },
    Teardown: async () => {
        const f = fixture;
        fixture = undefined;
        skipReason = undefined;
        if (!f) {
            return;
        }
        try {
            const row = await f.SessionA.GetEntityObject<MJUserSettingEntity>(ENTITY, f.User);
            if (await row.Load(f.RecordID)) {
                await row.Delete();
            }
        } finally {
            CloseWireSession(f.SessionA);
            CloseWireSession(f.SessionB);
        }
    }
});

async function checkCc1StaleOverlappingSaveRejected(): Promise<void> {
    const f = fx();
    const a = await load(f.SessionA, f.User, f.RecordID);
    const b = await load(f.SessionB, f.User, f.RecordID);
    b.Value = 'from-B';
    Assert(await b.Save(), `B's save failed: ${b.LatestResult?.CompleteMessage ?? ''}`);
    a.Value = 'from-A';
    const saved = await a.Save();
    const message = a.LatestResult?.CompleteMessage ?? '';
    Assert(!saved, 'CC1: a stale overlapping save was accepted');
    Assert(CONFLICT_TEXT.test(message), `CC1: unexpected refusal text: ${message}`);
    Assert(/Value/.test(message), `CC1: the conflicting field is not named: ${message}`);
    AssertEqual((await storedValues(f)).Value, 'from-B', 'CC1: the stored value after the refusal');
}

async function checkCc2ConvergentStaleSaveAccepted(): Promise<void> {
    const f = fx();
    const b = await load(f.SessionB, f.User, f.RecordID);
    const a = await load(f.SessionA, f.User, f.RecordID);
    b.Value = 'converge';
    Assert(await b.Save(), `B's save failed: ${b.LatestResult?.CompleteMessage ?? ''}`);
    a.Value = 'converge';
    Assert(await a.Save(), `CC2: a stale save converging on the stored value was refused: ${a.LatestResult?.CompleteMessage ?? ''}`);
    AssertEqual((await storedValues(f)).Value, 'converge', 'CC2: the stored value');
}

async function checkCc3NonOverlappingStaleSavePreservesOtherColumn(): Promise<void> {
    const f = fx();
    const a = await load(f.SessionA, f.User, f.RecordID);
    const b = await load(f.SessionB, f.User, f.RecordID);
    b.Value = 'from-B2';
    Assert(await b.Save(), `B's save failed: ${b.LatestResult?.CompleteMessage ?? ''}`);
    a.Setting = `${f.Tag}-renamed`;
    Assert(await a.Save(), `CC3: a stale non-overlapping save was refused: ${a.LatestResult?.CompleteMessage ?? ''}`);
    const stored = await storedValues(f);
    AssertEqual(stored.Value, 'from-B2', "CC3: B's Value survived A's save");
    AssertEqual(stored.Setting, `${f.Tag}-renamed`, "CC3: A's Setting was stored");
}

async function checkCc4SavingSessionReceivesMergedRow(): Promise<void> {
    const f = fx();
    const a = await load(f.SessionA, f.User, f.RecordID);
    const b = await load(f.SessionB, f.User, f.RecordID);
    b.Value = 'from-B3';
    Assert(await b.Save(), `B's save failed: ${b.LatestResult?.CompleteMessage ?? ''}`);
    a.Setting = `${f.Tag}-renamed-2`;
    Assert(await a.Save(), `CC4: save refused: ${a.LatestResult?.CompleteMessage ?? ''}`);
    AssertEqual(a.Value, 'from-B3', "CC4: A's object carries B's Value after the save (update response includes untouched loaded fields)");
    AssertEqual(a.Dirty, false, 'CC4: A is clean after the save');
}

async function checkCc5RefusedSaveWritesNothing(): Promise<void> {
    const f = fx();
    const before = await storedValues(f);
    const a = await load(f.SessionA, f.User, f.RecordID);
    const b = await load(f.SessionB, f.User, f.RecordID);
    b.Value = 'from-B4';
    Assert(await b.Save(), `B's save failed: ${b.LatestResult?.CompleteMessage ?? ''}`);
    a.Value = 'from-A4';
    a.Setting = `${f.Tag}-A4`;
    Assert(!await a.Save(), 'CC5: a two-field save with one conflicting field was accepted');
    const after = await storedValues(f);
    AssertEqual(after.Value, 'from-B4', "CC5: B's Value is stored");
    AssertEqual(after.Setting, before.Setting, "CC5: A's non-conflicting field did not land either");
}

export const ConcurrencyConflictClientChecks: NamedCheck[] = [
    { Id: `${BUNDLE}.CC1`, Name: 'CC1: a stale overlapping save is refused with the conflict message naming the field', Fn: checkCc1StaleOverlappingSaveRejected, RequiresMutation: true },
    { Id: `${BUNDLE}.CC2`, Name: 'CC2: a stale save converging on the stored value is accepted', Fn: checkCc2ConvergentStaleSaveAccepted, RequiresMutation: true },
    { Id: `${BUNDLE}.CC3`, Name: "CC3: a stale non-overlapping save is accepted and keeps the other session's column", Fn: checkCc3NonOverlappingStaleSavePreservesOtherColumn, RequiresMutation: true },
    { Id: `${BUNDLE}.CC4`, Name: 'CC4: the saving session receives the merged row, not its stale copy', Fn: checkCc4SavingSessionReceivesMergedRow, RequiresMutation: true },
    { Id: `${BUNDLE}.CC5`, Name: 'CC5: a refused save writes none of its fields', Fn: checkCc5RefusedSaveWritesNothing, RequiresMutation: true }
];

for (const check of ConcurrencyConflictClientChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
