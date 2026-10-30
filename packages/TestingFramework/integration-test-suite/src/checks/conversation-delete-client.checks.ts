/**
 * conversation-delete-client.checks.ts — the 'conversation-delete-client' bundle (CD1–CD3, client transport, needs
 * MJAPI): who may delete a conversation for everyone, enforced by the server and proven over the GraphQL wire as two
 * real users.
 *
 * WHY. Deleting a conversation removes it, and its messages, for every person it is shared with. The entity
 * permission lets any UI user delete conversations and cannot express "only the owner", so
 * `MJConversationEntityServer.Delete` (which runs inside MJAPI for every GraphQL delete) enforces the rule: the
 * owner, a person with an `Owner` grant, or a user in the Developer or Integration role. An `Edit` grant lets a
 * person change a conversation, not remove it. The chat UI disables Delete for everyone else, but that is only UX:
 * this bundle proves the server refuses a direct API call.
 *
 * IDENTITIES. Reuses the two users IT115 seeds (`metadata-optional/integration-test/users`), with Setup minting a
 * `full_access` API key for each and building a GraphQL connection authenticated as that user alone. Both hold the
 * role 'Integration Test: Conversation Authorship', which mirrors the shipped UI role's full Create/Read/Update/Delete
 * on 'MJ: Conversations' and 'MJ: Resource Permissions' with no row filter, so the role never refuses a delete here:
 * every refusal must come from the delete rule, and each check asserts the rule's own message.
 *   - it-authorship-owner@integration.test — owns the conversation (user A).
 *   - it-authorship-grantee@integration.test — receives a `View`, then an `Edit` grant on it (user B).
 *
 * FIXTURE. Setup, over A's own connection, creates the conversation and saves a `View` grant for B through MJAPI
 * (MJAPI's `ResourcePermissionEngine` cache only sees saves made in its own process).
 *
 *   CD1: once MJAPI honours B's View grant, B's delete is refused with the rule's message and the row still exists.
 *   CD2: A raises the grant to Edit; once MJAPI honours it, B's delete is refused the same way and the row still exists.
 *   CD3: A deletes the conversation, and the row is gone.
 *
 * The checks run in order and share the one conversation. Every check writes (or would, if the rule regressed), so
 * each carries `RequiresMutation: true` and Setup provisions nothing when the tier is off. Checks skip LOUDLY when
 * the tier is off or the seed is absent, and FAIL when the seed is present but provisioning broke. Teardown removes
 * any messages, the grant, any 'Resource Shared' notification it sent B, the conversation if it is still there, and
 * the minted keys.
 */
import { RunView } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type {
    MJConversationDetailEntity,
    MJConversationEntity,
    MJResourcePermissionEntity,
    MJUserNotificationEntity
} from '@memberjunction/core-entities';
import { Assert, IntegrationCheckRegistry, IsTierEnabled } from '@memberjunction/testing-integration';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import type { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';
import { BuildUserKeyProviderWithRetry, DeleteMintedUserKeys, MintFullAccessUserKey, MintedUserKeyIds } from './fls-client.checks';

const BUNDLE = 'conversation-delete-client';
const USERS_ENTITY = 'MJ: Users';
const CONVERSATIONS_ENTITY = 'MJ: Conversations';
const DETAILS_ENTITY = 'MJ: Conversation Details';
const GRANTS_ENTITY = 'MJ: Resource Permissions';
const NOTIFICATIONS_ENTITY = 'MJ: User Notifications';
const OWNER_EMAIL = 'it-authorship-owner@integration.test';
const GRANTEE_EMAIL = 'it-authorship-grantee@integration.test';
const SEED_COMMAND = 'pnpm mj sync push --dir=metadata-optional/integration-test';

/** `MJ: Resource Types.ID` for Conversations — the resource type the rule looks grants up under. */
const CONVERSATIONS_RESOURCE_TYPE_ID = '81D4BC3D-9FEB-EF11-B01A-286B35C04427';

/** Appended to every row this bundle writes, so a leftover is recognisable. */
const MARKER = '(mj-integration-test, safe to delete)';

/** The refusals the checks expect, verbatim from the server. */
const REFUSAL = {
    /** `MJConversationEntityServer.Delete`, from `CONVERSATION_DELETE_REFUSED_REASON`. */
    Delete: 'Only the owner, or someone with Owner access, can delete a conversation',
    /** `MJConversationDetailEntityExtended`, for a grantee posting with no grant visible yet. */
    NoAccess: 'You do not have access to this conversation.',
    /** `MJConversationDetailEntityExtended`, for a View grantee posting. */
    ViewOnly: 'You have view-only access to this conversation.',
    /** `MJConversationDetailEntityExtended`, for an Edit grantee posting as someone else. */
    PostAsSelf: 'You can post a message only as yourself.'
} as const;

/** How long a check waits for MJAPI to honour a grant change, and how often it looks. */
const GRANT_VISIBLE_TIMEOUT_MS = 60_000;
const GRANT_VISIBLE_POLL_MS = 2_000;

/** A leg's first write can land inside MJAPI's API-key scope-cache envelope, so it is retried a bounded number of times. */
const FIRST_WRITE_ATTEMPTS = 4;
const FIRST_WRITE_RETRY_MS = 5_000;

/** One seeded user: their ID and a GraphQL connection authenticated as them alone. */
interface DeleteLeg {
    Email: string;
    UserID: string;
    Provider: GraphQLDataProvider;
}

interface ConversationDeleteFixture extends MintedUserKeyIds {
    /** Why every check skips: the mutation tier is off, or the seeded users are absent. */
    SkipReason?: string;
    /** Why every check fails: the seed is present, but Setup could not build the shared conversation. */
    ProvisionError?: string;
    RunTag: string;
    Owner?: DeleteLeg;
    Grantee?: DeleteLeg;
    ConversationID?: string;
    GrantID?: string;
}

interface ReadyFixture extends ConversationDeleteFixture {
    Owner: DeleteLeg;
    Grantee: DeleteLeg;
    ConversationID: string;
    GrantID: string;
}

interface WriteOutcome {
    Done: boolean;
    Message: string;
}

/** An identity Teardown can delete fixture rows as. */
interface Deleter {
    Label: string;
    Provider: IMetadataProvider;
    User: UserInfo;
}

type FixtureRow = MJConversationEntity | MJConversationDetailEntity | MJResourcePermissionEntity | MJUserNotificationEntity;

const fixture: { Current: ConversationDeleteFixture | undefined } = { Current: undefined };

// ─────────────────────────────────────────────────────────────────── helpers

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

function isReady(fx: ConversationDeleteFixture): fx is ReadyFixture {
    return !!fx.Owner && !!fx.Grantee && !!fx.ConversationID && !!fx.GrantID;
}

/** The fixture, or undefined after logging a loud skip. A seed that is present but could not be provisioned FAILS. */
function readyFixture(checkId: string): ReadyFixture | undefined {
    const fx = fixture.Current;
    if (!fx || fx.SkipReason) {
        console.warn(`  ⚠ ${BUNDLE}.${checkId} SKIPPED — ${fx?.SkipReason ?? 'fixture not provisioned'}. Seed with \`${SEED_COMMAND}\` and start MJAPI.`);
        return undefined;
    }
    Assert(!fx.ProvisionError, `${checkId}: Setup could not build the shared conversation: ${fx.ProvisionError}`);
    if (!isReady(fx)) {
        Assert(false, `${checkId}: Setup did not finish building the shared conversation`);
        return undefined;
    }
    return fx;
}

async function resolveUserId(ctx: IntegrationCheckContext, email: string): Promise<string | undefined> {
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
        { EntityName: USERS_ENTITY, ExtraFilter: `Email = '${EscapeSQLString(email)}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
        ctx.User
    );
    return res.Success && res.Results.length === 1 ? res.Results[0].ID : undefined;
}

async function provisionLeg(ctx: IntegrationCheckContext, fx: ConversationDeleteFixture, email: string, userId: string): Promise<DeleteLeg> {
    const rawKey = await MintFullAccessUserKey(ctx, fx, userId, `IT138 conversation delete ${email} (mj-integration-test)`);
    const provider = (await BuildUserKeyProviderWithRetry(rawKey)) as GraphQLDataProvider;
    return { Email: email, UserID: userId, Provider: provider };
}

/** Saves a leg's FIRST write, retrying while its freshly minted key may still sit inside MJAPI's scope-cache envelope. */
async function saveFirstWrite(row: MJConversationEntity, what: string): Promise<void> {
    let last = '';
    for (let attempt = 1; attempt <= FIRST_WRITE_ATTEMPTS; attempt++) {
        if (await row.Save()) {
            return;
        }
        last = row.LatestResult?.CompleteMessage ?? 'Save() returned false';
        if (attempt < FIRST_WRITE_ATTEMPTS) {
            await sleep(FIRST_WRITE_RETRY_MS);
        }
    }
    throw new Error(`${what} failed after ${FIRST_WRITE_ATTEMPTS} attempts: ${last}`);
}

/** A loads their grant to B and sets its level, through MJAPI. */
async function setGrantLevel(fx: ReadyFixture, level: MJResourcePermissionEntity['PermissionLevel']): Promise<void> {
    const grant = await fx.Owner.Provider.GetEntityObject<MJResourcePermissionEntity>(GRANTS_ENTITY, fx.Owner.Provider.CurrentUser);
    Assert(await grant.Load(fx.GrantID), `${fx.Owner.Email} could not load the grant ${fx.GrantID}`);
    grant.PermissionLevel = level;
    Assert(await grant.Save(), `${fx.Owner.Email} raising the grant to ${level} failed: ${grant.LatestResult?.CompleteMessage ?? '(no message)'}`);
}

/**
 * Waits (bounded) until MJAPI honours B's grant at the expected level, using a probe that writes nothing: B posts a
 * message in the conversation AS A. With no grant visible the message rule refuses "no access"; at View it refuses
 * "view-only"; at Edit it refuses "post only as yourself". The probe never saves unless that rule regressed, and
 * Teardown removes any row it leaves.
 */
async function waitForGrantLevel(fx: ReadyFixture, expectedRefusal: string): Promise<void> {
    const deadline = Date.now() + GRANT_VISIBLE_TIMEOUT_MS;
    let last = '';
    for (;;) {
        const probe = await fx.Grantee.Provider.GetEntityObject<MJConversationDetailEntity>(DETAILS_ENTITY, fx.Grantee.Provider.CurrentUser);
        probe.NewRecord();
        probe.ConversationID = fx.ConversationID;
        probe.Role = 'User';
        probe.UserID = fx.Owner.UserID;
        probe.Message = `${fx.RunTag} probe: the grantee posting as the owner ${MARKER}`;
        probe.Status = 'Complete';
        let outcome: WriteOutcome;
        try {
            outcome = { Done: await probe.Save(), Message: probe.LatestResult?.CompleteMessage ?? '' };
        } catch (e) {
            outcome = { Done: false, Message: errorText(e) };
        }
        Assert(!outcome.Done, `the grant probe SAVED a message as the owner; the message authorship rule regressed (IT115 covers it)`);
        if (outcome.Message.includes(expectedRefusal)) {
            return;
        }
        last = outcome.Message;
        if (Date.now() > deadline) {
            throw new Error(
                `MJAPI did not honour the grant change within ${GRANT_VISIBLE_TIMEOUT_MS / 1000}s ` +
                    `(expected the probe refused with "${expectedRefusal}"; last refusal: ${last || '(empty)'})`
            );
        }
        await sleep(GRANT_VISIBLE_POLL_MS);
    }
}

/** Deletes the conversation through the leg's own connection, reporting a refusal (or a throw) instead of raising it. */
async function attemptDelete(leg: DeleteLeg, conversationId: string): Promise<WriteOutcome> {
    const conversation = await leg.Provider.GetEntityObject<MJConversationEntity>(CONVERSATIONS_ENTITY, leg.Provider.CurrentUser);
    Assert(await conversation.Load(conversationId), `${leg.Email} could not load conversation ${conversationId} (needs Read on ${CONVERSATIONS_ENTITY})`);
    try {
        const done = await conversation.Delete();
        return { Done: done, Message: conversation.LatestResult?.CompleteMessage ?? '' };
    } catch (e) {
        return { Done: false, Message: errorText(e) };
    }
}

/** True when the conversation row exists, read by the run's own identity with the cache bypassed. */
async function conversationExists(ctx: IntegrationCheckContext, id: string): Promise<boolean> {
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
        { EntityName: CONVERSATIONS_ENTITY, ExtraFilter: `ID = '${id}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
        ctx.User
    );
    Assert(res.Success, `reading ${CONVERSATIONS_ENTITY} ${id} failed: ${res.ErrorMessage}`);
    return res.Results.length === 1;
}

/** Asserts B's delete was refused BY THE DELETE RULE (a refusal for another reason proves nothing) and the row survived. */
async function assertGranteeDeleteRefused(ctx: IntegrationCheckContext, fx: ReadyFixture, level: string): Promise<void> {
    const outcome = await attemptDelete(fx.Grantee, fx.ConversationID);
    Assert(!outcome.Done, `a ${level} grantee's delete of the shared conversation was ACCEPTED`);
    Assert(
        outcome.Message.includes(REFUSAL.Delete),
        `a ${level} grantee's delete was refused, but not with "${REFUSAL.Delete}", so this proves nothing about the delete rule. ` +
            `LatestResult.CompleteMessage: ${outcome.Message || '(empty)'}`
    );
    Assert(await conversationExists(ctx, fx.ConversationID), `the conversation is gone after a ${level} grantee's refused delete`);
}

// ─────────────────────────────────────────────────────────────────── lifecycle

async function provision(ctx: IntegrationCheckContext, fx: ConversationDeleteFixture, ownerId: string, granteeId: string): Promise<void> {
    const owner = await provisionLeg(ctx, fx, OWNER_EMAIL, ownerId);
    fx.Owner = owner;
    fx.Grantee = await provisionLeg(ctx, fx, GRANTEE_EMAIL, granteeId);

    const conversation = await owner.Provider.GetEntityObject<MJConversationEntity>(CONVERSATIONS_ENTITY, owner.Provider.CurrentUser);
    conversation.NewRecord();
    conversation.UserID = owner.UserID;
    conversation.Name = `IT138 shared conversation ${fx.RunTag} ${MARKER}`;
    await saveFirstWrite(conversation, `${owner.Email} creating the conversation`);
    fx.ConversationID = conversation.ID;

    const grant = await owner.Provider.GetEntityObject<MJResourcePermissionEntity>(GRANTS_ENTITY, owner.Provider.CurrentUser);
    grant.NewRecord();
    grant.ResourceTypeID = CONVERSATIONS_RESOURCE_TYPE_ID;
    grant.ResourceRecordID = conversation.ID;
    grant.Type = 'User';
    grant.UserID = granteeId;
    grant.PermissionLevel = 'View';
    grant.Status = 'Approved';
    grant.SharedByUserID = owner.UserID;
    if (!(await grant.Save())) {
        throw new Error(`${owner.Email} granting View failed: ${grant.LatestResult?.CompleteMessage ?? 'Save() returned false'}`);
    }
    fx.GrantID = grant.ID;
}

/** A's connection first (exercising the owner path), then the run's own identity as the fallback. */
function teardownDeleters(ctx: IntegrationCheckContext, owner: DeleteLeg | undefined): Deleter[] {
    const deleters: Deleter[] = [];
    if (owner) {
        deleters.push({ Label: owner.Email, Provider: owner.Provider, User: owner.Provider.CurrentUser });
    }
    deleters.push({ Label: 'the run identity', Provider: ctx.Provider, User: ctx.User });
    return deleters;
}

/** Deletes one fixture row, trying each identity in turn. Silent when no identity can load it (already gone). Never throws. */
async function deleteRow(entityName: string, id: string, deleters: Deleter[]): Promise<void> {
    const failures: string[] = [];
    for (const deleter of deleters) {
        try {
            const row = await deleter.Provider.GetEntityObject<FixtureRow>(entityName, deleter.User);
            if (!(await row.Load(id))) {
                continue;
            }
            if (await row.Delete()) {
                return;
            }
            failures.push(`${deleter.Label}: ${row.LatestResult?.CompleteMessage ?? 'Delete() returned false'}`);
        } catch (e) {
            failures.push(`${deleter.Label}: ${errorText(e)}`);
        }
    }
    if (failures.length > 0) {
        console.error(`  ✖ ${BUNDLE} teardown could not delete ${entityName} ${id}: ${failures.join('; ')}`);
    }
}

/** IDs of the rows of an entity matching a filter, read by the run's own identity. Empty (with a warning) on failure. */
async function idsWhere(ctx: IntegrationCheckContext, entityName: string, filter: string): Promise<string[]> {
    try {
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
            { EntityName: entityName, ExtraFilter: filter, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
            ctx.User
        );
        if (res.Success) {
            return res.Results.map((r) => r.ID);
        }
        console.warn(`  ⚠ ${BUNDLE} teardown could not list ${entityName}: ${res.ErrorMessage}`);
    } catch (e) {
        console.warn(`  ⚠ ${BUNDLE} teardown could not list ${entityName}: ${errorText(e)}`);
    }
    return [];
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        const fx: ConversationDeleteFixture = { RunTag: `IT138-${Date.now()}`, CreatedKeyIds: [], CreatedScopeRuleIds: [] };
        fixture.Current = fx;
        if (!IsTierEnabled('mutation') && ctx.Config?.runMutationTests !== true) {
            fx.SkipReason = 'the mutation tier is off (RUN_MUTATION_TESTS)';
            return;
        }
        const ownerId = await resolveUserId(ctx, OWNER_EMAIL);
        const granteeId = await resolveUserId(ctx, GRANTEE_EMAIL);
        if (!ownerId || !granteeId) {
            fx.SkipReason = `seeded users ${OWNER_EMAIL} / ${GRANTEE_EMAIL} not found over the wire`;
            return;
        }
        try {
            await provision(ctx, fx, ownerId, granteeId);
        } catch (e) {
            fx.ProvisionError = errorText(e);
        }
    },

    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        const fx = fixture.Current;
        fixture.Current = undefined;
        if (!fx) {
            return;
        }
        const deleters = teardownDeleters(ctx, fx.Owner);
        if (fx.ConversationID) {
            for (const id of await idsWhere(ctx, DETAILS_ENTITY, `ConversationID = '${fx.ConversationID}'`)) {
                await deleteRow(DETAILS_ENTITY, id, deleters);
            }
        }
        if (fx.GrantID) {
            await deleteRow(GRANTS_ENTITY, fx.GrantID, deleters);
        }
        if (fx.Grantee && fx.ConversationID) {
            const filter = `UserID = '${fx.Grantee.UserID}' AND ResourceRecordID = '${fx.ConversationID}'`;
            for (const id of await idsWhere(ctx, NOTIFICATIONS_ENTITY, filter)) {
                await deleteRow(NOTIFICATIONS_ENTITY, id, [{ Label: 'the run identity', Provider: ctx.Provider, User: ctx.User }]);
            }
        }
        if (fx.ConversationID) {
            await deleteRow(CONVERSATIONS_ENTITY, fx.ConversationID, deleters);
        }
        // Last: the owner's connection authenticates with one of these keys.
        await DeleteMintedUserKeys(ctx, fx);
    }
});

// ─────────────────────────────────────────────────────────────────── checks

/** CD1 — a View grantee cannot delete the shared conversation. */
async function checkCd1ViewGranteeCannotDelete(ctx: IntegrationCheckContext): Promise<void> {
    const fx = readyFixture('CD1');
    if (!fx) return;
    await waitForGrantLevel(fx, REFUSAL.ViewOnly);
    await assertGranteeDeleteRefused(ctx, fx, 'View');
}

/** CD2 — an Edit grantee cannot delete it either: Edit lets a person change a conversation, not remove it. */
async function checkCd2EditGranteeCannotDelete(ctx: IntegrationCheckContext): Promise<void> {
    const fx = readyFixture('CD2');
    if (!fx) return;
    await setGrantLevel(fx, 'Edit');
    await waitForGrantLevel(fx, REFUSAL.PostAsSelf);
    await assertGranteeDeleteRefused(ctx, fx, 'Edit');
}

/** CD3 — the owner deletes the conversation, and the row is gone. */
async function checkCd3OwnerDeletes(ctx: IntegrationCheckContext): Promise<void> {
    const fx = readyFixture('CD3');
    if (!fx) return;
    const outcome = await attemptDelete(fx.Owner, fx.ConversationID);
    Assert(outcome.Done, `the owner's delete of their conversation was REFUSED: ${outcome.Message || '(no message)'}`);
    Assert(!(await conversationExists(ctx, fx.ConversationID)), `the conversation still exists after the owner deleted it`);
}

export const ConversationDeleteClientChecks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.CD1`,
        Name: "CD1: a View grantee's delete of a shared conversation is refused by the server, and the row still exists",
        RequiresMutation: true,
        Fn: checkCd1ViewGranteeCannotDelete
    },
    {
        Id: `${BUNDLE}.CD2`,
        Name: "CD2: an Edit grantee's delete of a shared conversation is refused by the server, and the row still exists",
        RequiresMutation: true,
        Fn: checkCd2EditGranteeCannotDelete
    },
    {
        Id: `${BUNDLE}.CD3`,
        Name: 'CD3: the owner deletes the conversation, and the row is gone',
        RequiresMutation: true,
        Fn: checkCd3OwnerDeletes
    }
];

for (const check of ConversationDeleteClientChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
