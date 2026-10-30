/**
 * rls-two-filter-load.ts — RLS12, a member of the 'rls-isolation' bundle (server transport).
 *
 * A user whose roles carry TWO different Read row-level-security filters on one entity gets
 * those filters OR'd together. A single-record read appends that clause beside the primary-key
 * predicate (`WHERE ID = @x AND <clause>`), so the OR'd group must be parenthesized as a whole:
 * written as `(A) OR (B)`, the key binds to `A` alone and every row `B` admits comes back too,
 * and a load by ID can hand back a different record than the one asked for.
 *
 * The principal is an in-memory clone of the run's user holding exactly the `UI` and
 * `Widget Guest` roles, which carry different Read filters on 'MJ: AI Agent Sessions'
 * (`UserID = '{{UserID}}'` and a conversation-scope filter on `{{ScopeResourceID}}`). The clone
 * carries a magic-link scope naming a fixture conversation, so filter B admits that
 * conversation's sessions. Fixture: one conversation and three sessions (one owned by the user
 * with no conversation, two in the conversation), removed in the check's own `finally`.
 *
 * Three reads are checked, each by the ID of the session filter A admits:
 *   - the role clause exactly as `EntityInfo.GetUserRowLevelSecurityWhereClause` returns it,
 *     ANDed beside the key, returns one row (the clause carries its own grouping);
 *   - the single-record resolver's statement (`… WHERE ID='x' ` + the effective clause with the
 *     `AND` prefix, as the generated `MJAIAgentSession(ID)` resolver builds it) returns one row;
 *   - `BaseEntity.Load` as the principal loads exactly that record, and loads a conversation
 *     session by its own ID.
 *
 * Then list reads (`RunView` with an `ExtraFilter`, which the provider ANDs beside the OR'd
 * clause): two more sessions belong to another user, one in the conversation (filter B alone
 * admits it) and one outside it (neither filter admits it). A read of all five returns exactly the
 * four the filters admit, a read of the unadmitted one returns nothing, and a read of the user's
 * own returns only that one: never the unfiltered set, never a row B admits beside a key A names.
 */
import { DatabaseProviderBase, EntityPermissionType, UserInfo, UserRoleInfo } from '@memberjunction/core';
import type { EntityInfo, RoleInfo } from '@memberjunction/core';
import type { MJAIAgentSessionEntity, MJConversationEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';

const SESSION_ENTITY = 'MJ: AI Agent Sessions';
const CONVERSATION_ENTITY = 'MJ: Conversations';
const ROLE_NAMES = ['UI', 'Widget Guest'];

/** What the check created, so its `finally` can remove it. */
interface TwoFilterFixture {
    Conversation: MJConversationEntity | null;
    Sessions: MJAIAgentSessionEntity[];
}

function skipNote(reason: string): void {
    console.warn(`  ⚠ rls-isolation.RLS12 SKIPPED — ${reason}`);
}

/** The roles the principal holds, or null when either is missing from metadata. */
function findRoles(ctx: IntegrationCheckContext): RoleInfo[] | null {
    const roles = ROLE_NAMES.map((n) => ctx.Provider.Roles.find((r) => r.Name.trim().toLowerCase() === n.toLowerCase()));
    return roles.every((r): r is RoleInfo => r != null) ? roles : null;
}

/** An in-memory principal holding exactly the given roles, scoped to the given conversation. */
function buildPrincipal(source: UserInfo, roles: RoleInfo[], scopeResourceID: string): UserInfo {
    const userRoles = roles.map((r) => new UserRoleInfo({ UserID: source.ID, RoleID: r.ID, Role: r.Name }));
    const principal = new UserInfo(undefined, { ...source, UserRoles: userRoles });
    principal.MagicLinkScope = { ResourceID: scopeResourceID, ResourceType: 'Conversations' };
    return principal;
}

/** Creates the fixture conversation, scoped by `externalID`. */
async function createConversation(ctx: IntegrationCheckContext, externalID: string): Promise<MJConversationEntity> {
    const conversation = await ctx.Provider.GetEntityObject<MJConversationEntity>(CONVERSATION_ENTITY, ctx.User);
    conversation.NewRecord();
    conversation.UserID = ctx.User.ID;
    conversation.Name = `zzz-it-rls12-${externalID}`;
    conversation.ExternalID = externalID;
    Assert(await conversation.Save(), `RLS12 conversation save failed: ${conversation.LatestResult?.CompleteMessage ?? 'no message'}`);
    return conversation;
}

/** Creates one fixture session owned by `ownerID` (the run's user by default), optionally in a conversation. */
async function createSession(ctx: IntegrationCheckContext, agentID: string, conversationID: string | null, ownerID = ctx.User.ID): Promise<MJAIAgentSessionEntity> {
    const session = await ctx.Provider.GetEntityObject<MJAIAgentSessionEntity>(SESSION_ENTITY, ctx.User);
    session.NewRecord();
    session.AgentID = agentID;
    session.UserID = ownerID;
    session.ConversationID = conversationID;
    Assert(await session.Save(), `RLS12 session save failed: ${session.LatestResult?.CompleteMessage ?? 'no message'}`);
    return session;
}

/** Any agent ID, for the sessions' required AgentID. */
async function anyAgentID(db: DatabaseProviderBase, ctx: IntegrationCheckContext): Promise<string | null> {
    const result = await db.RunView<{ ID: string }>({ EntityName: 'MJ: AI Agents', Fields: ['ID'], MaxRows: 1, ResultType: 'simple' }, ctx.User);
    return result.Success && result.Results.length > 0 ? result.Results[0].ID : null;
}

/** Runs `sql` and returns the IDs it read. */
async function idsOf(db: DatabaseProviderBase, sql: string): Promise<string[]> {
    const rows = await db.ExecuteSQL<{ ID: string }>(sql);
    return rows.map((r) => String(r.ID));
}

/** The single-record statement for `id`, with `suffix` appended after the key predicate. */
function keyedSelect(db: DatabaseProviderBase, entity: EntityInfo, id: string, suffix: string): string {
    return `SELECT * FROM ${db.QuoteSchemaAndView(entity.SchemaName, entity.BaseView)} WHERE ${db.QuoteIdentifier('ID')}='${id}' ${suffix}`;
}

/** The two raw-SQL legs: the role clause beside the key, and the resolver's statement. */
async function assertKeyedReads(db: DatabaseProviderBase, entity: EntityInfo, principal: UserInfo, targetID: string): Promise<void> {
    const roleClause = entity.GetUserRowLevelSecurityWhereClause(principal, EntityPermissionType.Read, '');
    Assert(roleClause.includes(' OR '), `RLS12: the principal must carry two OR'd Read filters on ${SESSION_ENTITY}; got '${roleClause}'`);
    const viaRoleClause = await idsOf(db, keyedSelect(db, entity, targetID, `AND ${roleClause}`));
    AssertEqual(viaRoleClause.length, 1,
        `RLS12: the role clause ANDed beside the key read ${viaRoleClause.length} rows instead of 1, so the OR group is not parenthesized as a whole ('${roleClause}')`);
    Assert(UUIDsEqual(viaRoleClause[0], targetID), 'RLS12: the role clause read a different record than the one asked for');

    const resolverSuffix = entity.GetEffectiveRowFilterWhereClause(principal, EntityPermissionType.Read, 'AND');
    const viaResolver = await idsOf(db, keyedSelect(db, entity, targetID, resolverSuffix));
    AssertEqual(viaResolver.length, 1, `RLS12: the single-record resolver statement read ${viaResolver.length} rows instead of 1`);
    Assert(UUIDsEqual(viaResolver[0], targetID), 'RLS12: the single-record resolver statement read a different record');
}

/** Another user's ID, to own the sessions only filter B, or no filter, admits. */
async function otherUserID(db: DatabaseProviderBase, ctx: IntegrationCheckContext): Promise<string | null> {
    const result = await db.RunView<{ ID: string }>({ EntityName: 'MJ: Users', Fields: ['ID'], ExtraFilter: `ID <> '${ctx.User.ID}'`, MaxRows: 1, ResultType: 'simple' }, ctx.User);
    return result.Success && result.Results.length > 0 ? result.Results[0].ID : null;
}

/** The session IDs a list read as `principal` returns for `filter`, upper case and sorted. */
async function listRead(db: DatabaseProviderBase, principal: UserInfo, filter: string): Promise<string[]> {
    const result = await db.RunView<{ ID: string }>({ EntityName: SESSION_ENTITY, Fields: ['ID'], ExtraFilter: filter, ResultType: 'simple', BypassCache: true }, principal);
    Assert(result.Success, `RLS12: the list read failed: ${result.ErrorMessage}`);
    return result.Results.map((r) => String(r.ID).toUpperCase()).sort();
}

/**
 * List reads beside the OR'd clause: of `admitted` (filter A or B) and `unadmitted` (neither),
 * exactly the admitted come back, whichever key the filter names.
 */
async function assertListReads(db: DatabaseProviderBase, principal: UserInfo, admitted: string[], unadmitted: string, own: string): Promise<void> {
    const list = (ids: string[]) => `ID IN (${ids.map((id) => `'${id}'`).join(', ')})`;
    const expected = admitted.map((id) => id.toUpperCase()).sort();
    AssertEqual((await listRead(db, principal, list([...admitted, unadmitted]))).join(','), expected.join(','),
        'RLS12: a list read of the fixture sessions must return exactly those filter A or filter B admits');
    AssertEqual((await listRead(db, principal, list([unadmitted]))).length, 0,
        'RLS12: a list read by the key of a session neither filter admits must return nothing (an ungrouped OR returns every row B admits)');
    AssertEqual((await listRead(db, principal, list([own]))).join(','), own.toUpperCase(),
        'RLS12: a list read by the key of the user\'s own session must return only that session');
}

/** `BaseEntity.Load` as the principal returns exactly the record asked for. */
async function assertLoadReturns(ctx: IntegrationCheckContext, principal: UserInfo, id: string, label: string): Promise<void> {
    const loaded = await ctx.Provider.GetEntityObject<MJAIAgentSessionEntity>(SESSION_ENTITY, principal);
    Assert(await loaded.Load(id), `RLS12: ${label} did not load as the two-filter principal`);
    Assert(UUIDsEqual(loaded.ID, id), `RLS12: loading ${label} by ID returned record ${loaded.ID} instead`);
}

async function removeFixture(fixture: TwoFilterFixture): Promise<void> {
    for (const session of fixture.Sessions) {
        await session.Delete().catch(() => undefined);
    }
    await fixture.Conversation?.Delete().catch(() => undefined);
}

/**
 * RLS12 — a user holding two Read RLS filters loads one record by ID and gets exactly that
 * record, through the role clause, the single-record resolver statement and `BaseEntity.Load`.
 */
export async function CheckRls12TwoFilterLoadById(ctx: IntegrationCheckContext): Promise<void> {
    const entity = ctx.Provider.EntityByName(SESSION_ENTITY);
    const roles = findRoles(ctx);
    if (!(ctx.Provider instanceof DatabaseProviderBase) || !entity || !roles) {
        skipNote(`needs a database provider, the '${SESSION_ENTITY}' entity and the ${ROLE_NAMES.join(' / ')} roles.`);
        return;
    }
    const db = ctx.Provider;
    const agentID = await anyAgentID(db, ctx);
    const otherID = await otherUserID(db, ctx);
    if (!agentID || !otherID) {
        skipNote(!agentID ? 'no AI agent exists to own the fixture sessions.' : 'no second user exists to own the sessions only one filter admits.');
        return;
    }
    const tag = `rls12-${Date.now()}`;
    const fixture: TwoFilterFixture = { Conversation: null, Sessions: [] };
    try {
        fixture.Conversation = await createConversation(ctx, tag);
        const own = await createSession(ctx, agentID, null);
        fixture.Sessions.push(own);
        fixture.Sessions.push(await createSession(ctx, agentID, fixture.Conversation.ID));
        fixture.Sessions.push(await createSession(ctx, agentID, fixture.Conversation.ID));

        const onlyB = await createSession(ctx, agentID, fixture.Conversation.ID, otherID);
        fixture.Sessions.push(onlyB);
        const neither = await createSession(ctx, agentID, null, otherID);
        fixture.Sessions.push(neither);

        const principal = buildPrincipal(ctx.User, roles, tag);
        await assertKeyedReads(db, entity, principal, own.ID);
        await assertLoadReturns(ctx, principal, own.ID, 'the user-owned session');
        await assertLoadReturns(ctx, principal, fixture.Sessions[1].ID, 'a conversation-scoped session');
        await assertLoadReturns(ctx, principal, onlyB.ID, 'another user\'s session in the conversation (filter B alone)');
        await assertListReads(db, principal, fixture.Sessions.slice(0, 4).map((x) => x.ID), neither.ID, own.ID);
    } finally {
        await removeFixture(fixture);
    }
}
