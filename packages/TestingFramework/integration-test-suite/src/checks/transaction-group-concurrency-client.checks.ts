/**
 * Optimistic concurrency for transaction groups over the wire (IT170, client transport, mutating).
 *
 * Two independent GraphQL sessions of the same user edit two `MJ: User Settings` rows. Session A
 * saves through a transaction group, the way a form with pending child records saves; session B
 * saves single records in between. A grouped update carries its old values to the server, which
 * must apply the same rules as a single-record update and then apply them to the whole group:
 *
 *   - TGC1 A stale grouped update of a field B changed refuses the whole group: the stored value is
 *          B's, the group's other item did not land, and A's entity names the conflicting field.
 *   - TGC2 A stale grouped update of a different field than B changed commits, and B's column
 *          survives.
 *   - TGC3 A stale grouped update that converges on the value B stored commits.
 *   - TGC4 A grouped update saved with `SkipOldValuesCheck` is not checked, so it overwrites B's
 *          value, as a single-record update with that option does.
 *
 * Fixtures are two `MJ: User Settings` rows of the API key's user, tagged per run, deleted in
 * Teardown.
 */
import { EntitySaveOptions, RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { MJUserSettingEntity } from '@memberjunction/core-entities';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { Assert, AssertEqual, IntegrationCheckRegistry, SkipCheck } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { MUTATION_TIER_OFF_REASON, MutationTierOn } from './fixture-gates';
import { CloseWireSession, OpenWireSession } from './wire-sessions';

const BUNDLE = 'transaction-group-concurrency-client';
const ENTITY = 'MJ: User Settings';
const CONFLICT_TEXT = /Concurrent modification conflict/i;

interface GroupConcurrencyFixture {
    SessionA: GraphQLDataProvider;
    SessionB: GraphQLDataProvider;
    User: UserInfo;
    Tag: string;
    /** The row both sessions edit. */
    ContestedID: string;
    /** The row only session A's group edits, alongside the contested one. */
    SiblingID: string;
}

let fixture: GroupConcurrencyFixture | undefined;
/** Set by Setup when the fixture was deliberately not created; every check then skips with it. */
let skipReason: string | undefined;

function fx(): GroupConcurrencyFixture {
    if (skipReason) {
        SkipCheck(skipReason);
    }
    Assert(fixture != null, `${BUNDLE} fixture missing (bundle Setup did not run)`);
    return fixture!;
}

async function createSetting(session: GraphQLDataProvider, user: UserInfo, setting: string): Promise<string> {
    const row = await session.GetEntityObject<MJUserSettingEntity>(ENTITY, user);
    row.NewRecord();
    row.UserID = user.ID;
    row.Setting = setting;
    row.Value = 'v0';
    Assert(await row.Save(), `fixture create failed: ${row.LatestResult?.CompleteMessage ?? ''}`);
    return row.ID;
}

async function load(session: GraphQLDataProvider, user: UserInfo, id: string): Promise<MJUserSettingEntity> {
    const entity = await session.GetEntityObject<MJUserSettingEntity>(ENTITY, user);
    Assert(await entity.Load(id), `load of ${ENTITY} ${id} failed`);
    return entity;
}

async function storedValues(f: GroupConcurrencyFixture, id: string): Promise<{ Setting: string; Value: string | null }> {
    const result = await RunView.FromMetadataProvider(f.SessionA).RunView<{ Setting: string; Value: string | null }>({
        EntityName: ENTITY, ExtraFilter: `ID='${id}'`, Fields: ['Setting', 'Value'], ResultType: 'simple', BypassCache: true
    }, f.User);
    Assert(result.Success && result.Results.length === 1, `stored row read failed: ${result.ErrorMessage ?? 'no row'}`);
    return result.Results[0];
}

/** Session A's stale copy of the contested row, after session B committed `changeOnB` to it. */
async function staleContestedRow(f: GroupConcurrencyFixture, changeOnB: (row: MJUserSettingEntity) => void): Promise<MJUserSettingEntity> {
    const a = await load(f.SessionA, f.User, f.ContestedID);
    const b = await load(f.SessionB, f.User, f.ContestedID);
    changeOnB(b);
    Assert(await b.Save(), `B's save failed: ${b.LatestResult?.CompleteMessage ?? ''}`);
    return a;
}

/** Saves `contested` and a change to the sibling row through one of session A's transaction groups. */
async function submitGroup(
    f: GroupConcurrencyFixture,
    contested: MJUserSettingEntity,
    siblingValue: string,
    options?: EntitySaveOptions,
): Promise<{ Submitted: boolean; Sibling: MJUserSettingEntity }> {
    const sibling = await load(f.SessionA, f.User, f.SiblingID);
    sibling.Value = siblingValue;
    const group = await f.SessionA.CreateTransactionGroup();
    contested.TransactionGroup = group;
    sibling.TransactionGroup = group;
    Assert(await contested.Save(options), `queueing the contested row failed: ${contested.LatestResult?.CompleteMessage ?? ''}`);
    Assert(await sibling.Save(), `queueing the sibling row failed: ${sibling.LatestResult?.CompleteMessage ?? ''}`);
    try {
        return { Submitted: await group.Submit(), Sibling: sibling };
    } finally {
        contested.TransactionGroup = null;
        sibling.TransactionGroup = null;
    }
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext) => {
        // Setup writes nothing on a deterministic-only run: no sessions, no rows.
        if (!MutationTierOn(ctx)) {
            skipReason = MUTATION_TIER_OFF_REASON;
            return;
        }
        const sessionA = await OpenWireSession(false);
        const sessionB = await OpenWireSession(false);
        const user = sessionA.CurrentUser;
        Assert(user != null, 'the system API key resolved no current user');
        const tag = `it170-${Date.now()}`;
        const contestedID = await createSetting(sessionA, user, `${tag}-contested`);
        const siblingID = await createSetting(sessionA, user, `${tag}-sibling`);
        fixture = { SessionA: sessionA, SessionB: sessionB, User: user, Tag: tag, ContestedID: contestedID, SiblingID: siblingID };
    },
    Teardown: async () => {
        const f = fixture;
        fixture = undefined;
        skipReason = undefined;
        if (!f) {
            return;
        }
        try {
            for (const id of [f.ContestedID, f.SiblingID]) {
                const row = await f.SessionA.GetEntityObject<MJUserSettingEntity>(ENTITY, f.User);
                if (await row.Load(id)) {
                    await row.Delete();
                }
            }
        } finally {
            CloseWireSession(f.SessionA);
            CloseWireSession(f.SessionB);
        }
    }
});

async function checkTgc1StaleOverlappingGroupRejected(): Promise<void> {
    const f = fx();
    const siblingBefore = await storedValues(f, f.SiblingID);
    const a = await staleContestedRow(f, (b) => { b.Value = 'tgc1-from-B'; });
    a.Value = 'tgc1-from-A';

    const { Submitted } = await submitGroup(f, a, 'tgc1-sibling-from-A');

    Assert(!Submitted, 'TGC1: a group with a stale overlapping update was committed');
    const message = a.LatestResult?.CompleteMessage ?? '';
    Assert(CONFLICT_TEXT.test(message), `TGC1: unexpected refusal text: ${message}`);
    AssertEqual(a.LatestResult?.ConcurrencyConflict?.ConflictingFields?.join(','), 'Value', 'TGC1: the conflicting fields on A');
    AssertEqual((await storedValues(f, f.ContestedID)).Value, 'tgc1-from-B', 'TGC1: the contested row keeps B\'s value');
    AssertEqual((await storedValues(f, f.SiblingID)).Value, siblingBefore.Value, 'TGC1: the group\'s other item did not land');
}

async function checkTgc2StaleNonOverlappingGroupCommits(): Promise<void> {
    const f = fx();
    const a = await staleContestedRow(f, (b) => { b.Value = 'tgc2-from-B'; });
    a.Setting = `${f.Tag}-contested-tgc2`;

    const { Submitted } = await submitGroup(f, a, 'tgc2-sibling-from-A');

    Assert(Submitted, `TGC2: a stale non-overlapping group was refused: ${a.LatestResult?.CompleteMessage ?? ''}`);
    const stored = await storedValues(f, f.ContestedID);
    AssertEqual(stored.Value, 'tgc2-from-B', "TGC2: B's Value survived A's group");
    AssertEqual(stored.Setting, `${f.Tag}-contested-tgc2`, "TGC2: A's Setting was stored");
    AssertEqual((await storedValues(f, f.SiblingID)).Value, 'tgc2-sibling-from-A', "TGC2: the group's other item landed");
}

async function checkTgc3ConvergentGroupCommits(): Promise<void> {
    const f = fx();
    const a = await staleContestedRow(f, (b) => { b.Value = 'tgc3-converge'; });
    a.Value = 'tgc3-converge';

    const { Submitted } = await submitGroup(f, a, 'tgc3-sibling-from-A');

    Assert(Submitted, `TGC3: a stale group converging on the stored value was refused: ${a.LatestResult?.CompleteMessage ?? ''}`);
    AssertEqual((await storedValues(f, f.ContestedID)).Value, 'tgc3-converge', 'TGC3: the stored value');
}

async function checkTgc4SkipOldValuesCheckIsHonored(): Promise<void> {
    const f = fx();
    const a = await staleContestedRow(f, (b) => { b.Value = 'tgc4-from-B'; });
    a.Value = 'tgc4-from-A';
    const options = new EntitySaveOptions();
    options.SkipOldValuesCheck = true;

    const { Submitted } = await submitGroup(f, a, 'tgc4-sibling-from-A', options);

    Assert(Submitted, `TGC4: an unchecked stale group was refused: ${a.LatestResult?.CompleteMessage ?? ''}`);
    AssertEqual((await storedValues(f, f.ContestedID)).Value, 'tgc4-from-A', 'TGC4: the unchecked update overwrote B\'s value');
}

export const TransactionGroupConcurrencyClientChecks: NamedCheck[] = [
    { Id: `${BUNDLE}.TGC1`, Name: 'TGC1: a stale overlapping grouped update refuses the whole group', Fn: checkTgc1StaleOverlappingGroupRejected, RequiresMutation: true },
    { Id: `${BUNDLE}.TGC2`, Name: "TGC2: a stale non-overlapping grouped update commits and keeps the other session's column", Fn: checkTgc2StaleNonOverlappingGroupCommits, RequiresMutation: true },
    { Id: `${BUNDLE}.TGC3`, Name: 'TGC3: a stale grouped update converging on the stored value commits', Fn: checkTgc3ConvergentGroupCommits, RequiresMutation: true },
    { Id: `${BUNDLE}.TGC4`, Name: 'TGC4: a grouped update saved with SkipOldValuesCheck is not checked', Fn: checkTgc4SkipOldValuesCheckIsHonored, RequiresMutation: true }
];

for (const check of TransactionGroupConcurrencyClientChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
