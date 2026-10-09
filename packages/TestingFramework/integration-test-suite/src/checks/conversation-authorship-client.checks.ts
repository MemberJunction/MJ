/**
 * conversation-authorship-client.checks.ts — the 'conversation-authorship-client' bundle (CA1–CA10, client
 * transport, needs MJAPI): who a conversation message is from, enforced by the server and proven over the GraphQL
 * wire as two real users.
 *
 * WHY. A person's message (`Role='User'`) in a shared conversation says who wrote it through its `UserID`; an empty
 * one reads as the conversation's owner. The chat UI only ever posts as the signed-in user, but that is a cosmetic
 * gate: anyone holding an `Edit` grant could call the API directly and post as the owner, rewrite the owner's words,
 * or delete them. `MJConversationDetailEntityExtended` now enforces the rules on the server (it runs when
 * `ProviderType === 'Database'`, i.e. inside MJAPI for every GraphQL save), for the owner and grantees alike:
 *   - a new message naming another person's `UserID` is refused; a grantee's new message with no `UserID` is saved
 *     with the grantee's ID, and the owner's stays empty;
 *   - only a message's author may change its authored fields (`UserID`, `Role`, `Message`, attachment, media type,
 *     thread position);
 *   - only its author or the conversation's owner may delete it.
 *
 * IDENTITIES. A GraphQL client authenticates as one wire identity, so per-user behaviour is only observable through
 * per-user AUTHENTICATION (the model fls-enforcement-client and self-avatar-client use): Setup mints a `full_access`
 * user API key for each seeded user and builds a secondary GraphQL connection authenticated as that user alone. Both
 * hold the role 'Integration Test: Conversation Authorship', which mirrors the shipped UI role's full
 * Create/Read/Update/Delete on 'MJ: Conversations', 'MJ: Conversation Details' and 'MJ: Resource Permissions'. So
 * the role never refuses a write here: every refusal a check sees must come from the authorship rule, and each
 * check asserts the rule's own message to prove it.
 *   - it-authorship-owner@integration.test — owns the conversation.
 *   - it-authorship-grantee@integration.test — holds an `Edit` grant on it.
 *
 * FIXTURE. Setup, over the OWNER's own connection: creates the conversation, posts one person's message with no
 * `UserID` (so it reads as the owner's), and saves the `MJ: Resource Permissions` row granting the grantee `Edit`.
 * The grant must be saved through MJAPI, not by this process: MJAPI's `ResourcePermissionEngine` cache only sees
 * saves made in its own process. Setup then waits (bounded) until MJAPI honours the grant, using a probe that writes
 * nothing (see {@link waitForGrantVisible}).
 *
 *   CA1: the grantee posting a person's message with the owner's UserID is refused, and no row exists.
 *   CA2: the grantee posting with no UserID is saved, and the row carries the grantee's ID.
 *   CA3: the grantee editing the owner's message text is refused, and the text is unchanged.
 *   CA4: the grantee deleting the owner's message is refused, and the row still exists.
 *   CA5: the grantee edits their own message (allowed), and the owner deletes it (allowed).
 *   CA6: the owner's own conversation works as before: the owner posts with no UserID (it stays empty) and edits it.
 *   CA7: the grantee cannot get round CA3 by sending the generated update mutation with forged `OldValues___`
 *        (claiming to be the owner message's author, or claiming it is an agent reply): MJAPI decides from the stored
 *        row, refuses, and the row does not move.
 *   CA8: the grantee cannot fill a conversation message's field from a transaction variable: a transaction group
 *        whose second item takes a value from the first is refused, nothing is written, and the pin the first item
 *        asked for does not land.
 *   CA9: a person's role cannot dodge the rules by its spelling: the grantee posting with `Role='user'` (lower case)
 *        and the owner's UserID is refused as posting as someone else, and no row exists.
 *   CA10: the grantee cannot move the owner's message into a conversation the grantee owns (where the owner's rules
 *        would no longer apply): refused, and the message stays in the shared conversation.
 *
 * CA1–CA6 and CA10 save with entity objects from the acting user's own connection and assert both the
 * `Save()`/`Delete()` result and `LatestResult.CompleteMessage`. CA7–CA9 bypass the entity layer and send raw GraphQL,
 * as any API caller can, asserting the error the mutation returns. Every check reads the database afterwards through
 * the run's own identity to prove what moved and what did not.
 *
 * MUTATION TIER. Every check writes (or would write if its guard regressed), so every check carries
 * `RequiresMutation: true`, and Setup provisions nothing when the tier is off. Checks skip LOUDLY when the tier is
 * off or the seed is absent, and FAIL when the seed is present but provisioning broke. Teardown deletes every
 * message in the fixture conversation and in the grantee's own conversation from CA10, the grant, both conversations
 * and the minted keys. Saving the grant also makes
 * MJAPI send the grantee a 'Resource Shared' notification as the owner; the seeded role holds nothing on
 * 'MJ: User Notifications', so as the code stands that send is refused in MJAPI and nothing lands. Teardown sweeps
 * the grantee's notifications for the conversation anyway, and says so loudly if it cannot remove one.
 */
import { RunView } from '@memberjunction/core';
import type { BaseEntity, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import type {
    MJConversationDetailEntity,
    MJConversationEntity,
    MJResourcePermissionEntity,
    MJUserNotificationEntity
} from '@memberjunction/core-entities';
import { Assert, AssertEqual, IntegrationCheckRegistry, IsTierEnabled } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { BuildUserKeyProviderWithRetry, DeleteMintedUserKeys, MintFullAccessUserKey, MintedUserKeyIds } from './fls-client.checks';

const BUNDLE = 'conversation-authorship-client';
const USERS_ENTITY = 'MJ: Users';
const CONVERSATIONS_ENTITY = 'MJ: Conversations';
const DETAILS_ENTITY = 'MJ: Conversation Details';
const GRANTS_ENTITY = 'MJ: Resource Permissions';
const NOTIFICATIONS_ENTITY = 'MJ: User Notifications';
const OWNER_EMAIL = 'it-authorship-owner@integration.test';
const GRANTEE_EMAIL = 'it-authorship-grantee@integration.test';
const SEED_COMMAND = 'pnpm mj sync push --dir=metadata-optional/integration-test';

/** `MJ: Resource Types.ID` for Conversations — the same resource type the rule looks grants up under. */
const CONVERSATIONS_RESOURCE_TYPE_ID = '81D4BC3D-9FEB-EF11-B01A-286B35C04427';

/** Appended to every row this bundle writes, so a leftover is recognisable. */
const MARKER = '(mj-integration-test, safe to delete)';

/** The refusals the rule records on `LatestResult`, verbatim from `MJConversationDetailEntityExtended`. */
const REFUSAL = {
    PostAsSelf: 'You can post a message only as yourself.',
    OnlyAuthorChanges: 'Only the person who wrote this message can change it.',
    OnlyAuthorOrOwnerDeletes: "Only the message's author or the conversation's owner can delete it.",
    NoAccess: 'You do not have access to this conversation.',
    MovedConversation: 'A message cannot be moved to another conversation.',
    TransactionVariable: 'A conversation message cannot take its values from a transaction variable.'
} as const;

/** How long Setup waits for MJAPI to honour the grantee's new grant, and how often it looks. */
const GRANT_VISIBLE_TIMEOUT_MS = 60_000;
const GRANT_VISIBLE_POLL_MS = 2_000;

/**
 * The owner's first write can land inside MJAPI's API-key scope-cache envelope (a freshly granted `full_access`
 * rule is honoured within scopeCacheTTLMs, default 60s), so Setup retries it a bounded number of times.
 */
const FIRST_WRITE_ATTEMPTS = 4;
const FIRST_WRITE_RETRY_MS = 5_000;

/** The generated create mutation for a conversation message, as any API caller can send it. */
const CREATE_DETAIL_MUTATION = `
    mutation CreateConversationDetail($input: CreateMJConversationDetailInput!) {
        CreateMJConversationDetail(input: $input) { ID Role UserID Message }
    }
`;

/** The document GraphQLTransactionGroup sends to run a transaction group on the server. */
const EXECUTE_TG_MUTATION = `
    mutation ExecuteTransactionGroup($group: TransactionInputType!) {
        ExecuteTransactionGroup(group: $group) { Success ErrorMessages ResultsJSON }
    }
`;

/** The generated update mutation for a conversation message, as any API caller can send it. */
const UPDATE_DETAIL_MUTATION = `
    mutation UpdateConversationDetail($input: UpdateMJConversationDetailInput!) {
        UpdateMJConversationDetail(input: $input) { ID Role UserID Message }
    }
`;

/** One seeded user: their ID and a GraphQL connection authenticated as them alone. */
interface AuthorshipLeg {
    Email: string;
    UserID: string;
    Provider: GraphQLDataProvider;
}

interface ConversationAuthorshipFixture extends MintedUserKeyIds {
    /** Why every check skips: the mutation tier is off, or the seeded users are absent. */
    SkipReason?: string;
    /** Why every check fails: the seed is present, but Setup could not build the shared conversation. */
    ProvisionError?: string;
    /** Distinguishes this run's rows from any other run's. */
    RunTag: string;
    Owner?: AuthorshipLeg;
    Grantee?: AuthorshipLeg;
    ConversationID?: string;
    GrantID?: string;
    /** The owner's message from Setup, saved with no `UserID` (so it reads as the owner's). */
    OwnerMessageID?: string;
    /** Conversations the grantee creates as their own (CA10), removed in Teardown. */
    GranteeConversationIDs: string[];
}

/** The fixture once Setup has built everything the checks use. */
interface ReadyFixture extends ConversationAuthorshipFixture {
    Owner: AuthorshipLeg;
    Grantee: AuthorshipLeg;
    ConversationID: string;
    OwnerMessageID: string;
}

/** A conversation message as the database holds it. */
interface MessageRow {
    ID: string;
    ConversationID: string;
    UserID: string | null;
    Role: MJConversationDetailEntity['Role'];
    Message: string;
    IsPinned: boolean;
}

/** What happened to a write the rule may refuse: whether it went through, and the reason the caller was given. */
interface WriteOutcome {
    Done: boolean;
    Message: string;
}

/** One entry of the update mutation's `OldValues___` (`[KeyValuePairInput]`): a field's CodeName and its claimed prior value. */
interface OldValueInput {
    Key: string;
    Value: string | null;
}

/** The `UpdateMJConversationDetailInput` fields CA7 sends. */
interface ForgedDetailUpdate {
    ID: string;
    Message: string;
    UserID?: string | null;
    OldValues___: OldValueInput[];
}

/** The `CreateMJConversationDetailInput` fields CA9 sends. `Role` is a plain string: the input does not constrain it. */
interface RawDetailCreate {
    ConversationID: string;
    Role: string;
    Message: string;
    UserID: string;
    Status: MJConversationDetailEntity['Status'];
}

/** One item of `TransactionInputType.Items`. */
interface TransactionItemInput {
    EntityName: string;
    EntityObjectJSON: string;
    OperationType: 'Create' | 'Update' | 'Delete';
}

/** One entry of `TransactionInputType.Variables`: item `ItemIndex`'s `FieldName` defines or uses the variable `Name`. */
interface TransactionVariableInput {
    Name: string;
    ItemIndex: number;
    FieldName: string;
    Type: 'Define' | 'Use';
}

interface TransactionGroupInput {
    Items: TransactionItemInput[];
    Variables: TransactionVariableInput[];
}

/** What `ExecuteTransactionGroup` returns: `ErrorMessages[i]` is item i's `LatestResult`, as JSON. */
interface TransactionGroupOutput {
    ExecuteTransactionGroup?: { Success: boolean; ErrorMessages: string[]; ResultsJSON: string[] } | null;
}

/** The part of a GraphQL client error that carries the server's own message. */
interface GraphQLErrorShape {
    response?: { errors?: Array<{ message?: string }> };
}

/** An identity Teardown can delete fixture rows as. */
interface Deleter {
    Label: string;
    Provider: IMetadataProvider;
    User: UserInfo;
}

/** The entities whose rows Teardown removes. */
type FixtureRow = MJConversationEntity | MJConversationDetailEntity | MJResourcePermissionEntity | MJUserNotificationEntity;

const fixture: { Current: ConversationAuthorshipFixture | undefined } = { Current: undefined };

// ─────────────────────────────────────────────────────────────────── helpers

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

function hasGraphQLErrors(e: unknown): e is GraphQLErrorShape {
    return typeof e === 'object' && e !== null && 'response' in e;
}

/** The server's own message for a failed GraphQL call: its first GraphQL error, else the thrown error's text. */
function wireErrorText(e: unknown): string {
    return (hasGraphQLErrors(e) ? e.response?.errors?.[0]?.message : undefined) ?? errorText(e);
}

function isReady(fx: ConversationAuthorshipFixture): fx is ReadyFixture {
    return !!fx.Owner && !!fx.Grantee && !!fx.ConversationID && !!fx.OwnerMessageID;
}

/**
 * The fixture, or undefined after logging a loud skip (tier off, seed absent). A seed that is present but could
 * not be provisioned FAILS the check: skipping there would hide a broken share flow behind a green run.
 */
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

/** Saves a message through its own connection, reporting a refusal (or a throw) instead of raising it. */
async function attemptSave(row: MJConversationDetailEntity): Promise<WriteOutcome> {
    try {
        const done = await row.Save();
        return { Done: done, Message: row.LatestResult?.CompleteMessage ?? '' };
    } catch (e) {
        return { Done: false, Message: errorText(e) };
    }
}

/** Deletes a message through its own connection, reporting a refusal (or a throw) instead of raising it. */
async function attemptDelete(row: MJConversationDetailEntity): Promise<WriteOutcome> {
    try {
        const done = await row.Delete();
        return { Done: done, Message: row.LatestResult?.CompleteMessage ?? '' };
    } catch (e) {
        return { Done: false, Message: errorText(e) };
    }
}

/** Asserts a write was refused BY THE AUTHORSHIP RULE: a refusal for any other reason proves nothing. */
function assertRefusedWith(outcome: WriteOutcome, expected: string, what: string): void {
    Assert(!outcome.Done, `${what} was ACCEPTED`);
    Assert(
        outcome.Message.includes(expected),
        `${what} was refused, but not with "${expected}", so this proves nothing about the authorship rule. ` +
            `LatestResult.CompleteMessage: ${outcome.Message || '(empty)'}`
    );
}

function assertDone(outcome: WriteOutcome, what: string): void {
    Assert(outcome.Done, `${what} was REFUSED: ${outcome.Message || '(no message)'}`);
}

/** A new, unsaved person's message (`Role='User'`, no `UserID`) built from the leg's own connection. */
async function draftMessage(leg: AuthorshipLeg, conversationId: string, text: string): Promise<MJConversationDetailEntity> {
    const row = await leg.Provider.GetEntityObject<MJConversationDetailEntity>(DETAILS_ENTITY, leg.Provider.CurrentUser);
    row.NewRecord();
    row.ConversationID = conversationId;
    row.Role = 'User';
    row.Message = text;
    row.Status = 'Complete';
    return row;
}

/** An existing message, loaded through the leg's own connection. */
async function loadMessage(leg: AuthorshipLeg, id: string): Promise<MJConversationDetailEntity> {
    const row = await leg.Provider.GetEntityObject<MJConversationDetailEntity>(DETAILS_ENTITY, leg.Provider.CurrentUser);
    Assert(await row.Load(id), `${leg.Email} could not load message ${id} (needs Read on ${DETAILS_ENTITY})`);
    return row;
}

/** Messages as the database holds them now, read by the run's own identity with the cache bypassed. */
async function readMessages(ctx: IntegrationCheckContext, filter: string): Promise<MessageRow[]> {
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<MessageRow>(
        { EntityName: DETAILS_ENTITY, ExtraFilter: filter, Fields: ['ID', 'ConversationID', 'UserID', 'Role', 'Message', 'IsPinned'], ResultType: 'simple', BypassCache: true },
        ctx.User
    );
    Assert(res.Success, `reading ${DETAILS_ENTITY} (${filter}) failed: ${res.ErrorMessage}`);
    return res.Results;
}

/** One message as the database holds it now; undefined when there is no such row. */
async function readMessage(ctx: IntegrationCheckContext, id: string): Promise<MessageRow | undefined> {
    const rows = await readMessages(ctx, `ID = '${id}'`);
    return rows[0];
}

/** Every message in the fixture conversation carrying exactly this text. */
async function messagesWithText(ctx: IntegrationCheckContext, fx: ReadyFixture, text: string): Promise<MessageRow[]> {
    return readMessages(ctx, `ConversationID = '${fx.ConversationID}' AND Message = '${EscapeSQLString(text)}'`);
}

function sameUser(actual: string | null | undefined, expected: string): boolean {
    return !!actual && UUIDsEqual(actual, expected);
}

/**
 * Asserts a message still holds exactly what an earlier read saw: it exists, in the same conversation, and its text,
 * author, role and pin did not move.
 */
async function assertMessageUnchanged(ctx: IntegrationCheckContext, before: MessageRow, what: string): Promise<void> {
    const after = await readMessage(ctx, before.ID);
    Assert(after != null, `${what}: message ${before.ID} disappeared`);
    Assert(UUIDsEqual(after!.ConversationID, before.ConversationID),
        `${what}: the message moved from conversation ${before.ConversationID} to ${after!.ConversationID}`);
    AssertEqual(after!.Message, before.Message, `${what}: the message text`);
    AssertEqual(after!.UserID ?? null, before.UserID ?? null, `${what}: the message UserID`);
    AssertEqual(after!.Role, before.Role, `${what}: the message Role`);
    AssertEqual(after!.IsPinned, before.IsPinned, `${what}: the message IsPinned`);
}

/** Setup's owner message as stored now, asserted to be a person's message with no UserID (so it reads as the owner's). */
async function readOwnerMessage(ctx: IntegrationCheckContext, fx: ReadyFixture, checkId: string): Promise<MessageRow> {
    const row = await readMessage(ctx, fx.OwnerMessageID);
    Assert(row != null, `${checkId} precondition: Setup's owner message ${fx.OwnerMessageID} is missing`);
    Assert(!row!.UserID && row!.Role === 'User',
        `${checkId} precondition: Setup's owner message must be a person's message with no UserID (has Role=${row!.Role}, UserID=${row!.UserID ?? '(empty)'})`);
    return row!;
}

/** Sends the generated `CreateMJConversationDetail` mutation straight over the wire as the leg's user. Reports a refusal instead of raising it. */
async function sendDetailCreate(leg: AuthorshipLeg, input: RawDetailCreate): Promise<WriteOutcome> {
    try {
        await leg.Provider.ExecuteGQL(CREATE_DETAIL_MUTATION, { input });
        return { Done: true, Message: '' };
    } catch (e) {
        return { Done: false, Message: wireErrorText(e) };
    }
}

/**
 * Runs a transaction group on the server as the leg's user, the way GraphQLTransactionGroup does. The server reports
 * a refused item through `Success: false` and that item's `LatestResult` JSON in `ErrorMessages`, not by throwing;
 * every item's text is joined into the outcome's message.
 */
async function sendTransactionGroup(leg: AuthorshipLeg, group: TransactionGroupInput): Promise<WriteOutcome> {
    try {
        const data = (await leg.Provider.ExecuteGQL(EXECUTE_TG_MUTATION, { group })) as TransactionGroupOutput | null;
        const result = data?.ExecuteTransactionGroup;
        Assert(result != null, `ExecuteTransactionGroup returned no result for ${leg.Email}`);
        return { Done: result!.Success, Message: (result!.ErrorMessages ?? []).join(' | ') };
    } catch (e) {
        return { Done: false, Message: wireErrorText(e) };
    }
}

/**
 * Sends the generated `UpdateMJConversationDetail` mutation straight over the wire as the leg's user, so no
 * client-side entity logic shapes it. Reports a refusal (the thrown GraphQL error) instead of raising it.
 */
async function sendDetailUpdate(leg: AuthorshipLeg, input: ForgedDetailUpdate): Promise<WriteOutcome> {
    try {
        await leg.Provider.ExecuteGQL(UPDATE_DETAIL_MUTATION, { input });
        return { Done: true, Message: '' };
    } catch (e) {
        return { Done: false, Message: wireErrorText(e) };
    }
}

/** The `OldValues___` an honest client would send for a stored message, with `Role` and `UserID` replaced by the caller's claim. */
function forgedOldValues(before: MessageRow, conversationId: string, claim: { Role: MessageRow['Role']; UserID: string | null }): OldValueInput[] {
    return [
        { Key: 'ID', Value: before.ID },
        { Key: 'ConversationID', Value: conversationId },
        { Key: 'Role', Value: claim.Role },
        { Key: 'UserID', Value: claim.UserID },
        { Key: 'Message', Value: before.Message }
    ];
}

// ─────────────────────────────────────────────────────────────────── provisioning

async function resolveUserId(ctx: IntegrationCheckContext, email: string): Promise<string | undefined> {
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
        { EntityName: USERS_ENTITY, ExtraFilter: `Email = '${EscapeSQLString(email)}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
        ctx.User
    );
    return res.Success && res.Results.length === 1 ? res.Results[0].ID : undefined;
}

async function provisionLeg(ctx: IntegrationCheckContext, fx: ConversationAuthorshipFixture, email: string, userId: string): Promise<AuthorshipLeg> {
    const rawKey = await MintFullAccessUserKey(ctx, fx, userId, `IT115 authorship ${email} (mj-integration-test)`);
    // BuildUserKeyProviderWithRetry builds a GraphQLDataProvider; CA7 needs its ExecuteGQL.
    const provider = (await BuildUserKeyProviderWithRetry(rawKey)) as GraphQLDataProvider;
    return { Email: email, UserID: userId, Provider: provider };
}

async function requireSaved(row: BaseEntity, what: string): Promise<void> {
    if (!(await row.Save())) {
        throw new Error(`${what} failed: ${row.LatestResult?.CompleteMessage ?? 'Save() returned false'}`);
    }
}

/** Saves a leg's FIRST write, retrying while its freshly minted key may still sit inside MJAPI's scope-cache envelope. */
async function saveFirstWrite(row: BaseEntity, what: string): Promise<void> {
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

/** The leg creates a conversation of their own (they own it); returns its ID. Retried, as it may be the leg's first write. */
async function createConversation(leg: AuthorshipLeg, name: string): Promise<string> {
    const conversation = await leg.Provider.GetEntityObject<MJConversationEntity>(CONVERSATIONS_ENTITY, leg.Provider.CurrentUser);
    conversation.NewRecord();
    conversation.UserID = leg.UserID;
    conversation.Name = `${name} ${MARKER}`;
    await saveFirstWrite(conversation, `${leg.Email} creating a conversation`);
    return conversation.ID;
}

/** The owner posts the message CA3/CA4 try to change, with no `UserID` (it reads as the owner's); returns its ID. */
async function postOwnerMessage(fx: ConversationAuthorshipFixture, owner: AuthorshipLeg, conversationId: string): Promise<string> {
    const message = await draftMessage(owner, conversationId, `${fx.RunTag} Setup: the owner's words ${MARKER}`);
    await requireSaved(message, `${owner.Email} posting the fixture message`);
    return message.ID;
}

/** The owner grants the grantee `Edit` on the conversation, through MJAPI; returns the grant's ID. */
async function grantEdit(owner: AuthorshipLeg, grantee: AuthorshipLeg, conversationId: string): Promise<string> {
    const grant = await owner.Provider.GetEntityObject<MJResourcePermissionEntity>(GRANTS_ENTITY, owner.Provider.CurrentUser);
    grant.NewRecord();
    grant.ResourceTypeID = CONVERSATIONS_RESOURCE_TYPE_ID;
    grant.ResourceRecordID = conversationId;
    grant.Type = 'User';
    grant.UserID = grantee.UserID;
    grant.PermissionLevel = 'Edit';
    grant.Status = 'Approved';
    grant.SharedByUserID = owner.UserID;
    await requireSaved(grant, `${owner.Email} granting ${grantee.Email} Edit on the conversation`);
    return grant.ID;
}

/**
 * Waits (bounded) until MJAPI honours the grantee's `Edit` grant. The probe is the grantee posting AS THE OWNER,
 * which the rule refuses whether or not the grant is visible, so it never writes a row: access is checked first,
 * so before the grant is visible the refusal is "You do not have access to this conversation.", and once it is
 * visible the refusal becomes "You can post a message only as yourself.". A probe that SAVES is a regression CA1
 * reports; Teardown removes its row with the conversation's other messages.
 */
async function waitForGrantVisible(fx: ConversationAuthorshipFixture, owner: AuthorshipLeg, grantee: AuthorshipLeg, conversationId: string): Promise<void> {
    const deadline = Date.now() + GRANT_VISIBLE_TIMEOUT_MS;
    let last = '';
    for (;;) {
        const probe = await draftMessage(grantee, conversationId, `${fx.RunTag} Setup probe: the grantee posting as the owner ${MARKER}`);
        probe.UserID = owner.UserID;
        const outcome = await attemptSave(probe);
        if (outcome.Done || outcome.Message.includes(REFUSAL.PostAsSelf)) {
            return;
        }
        last = outcome.Message;
        if (Date.now() > deadline) {
            throw new Error(
                `MJAPI did not honour ${grantee.Email}'s Edit grant within ${GRANT_VISIBLE_TIMEOUT_MS / 1000}s ` +
                    `(last refusal of the probe: ${last || '(empty)'}). Expected "${REFUSAL.NoAccess}" to give way to "${REFUSAL.PostAsSelf}".`
            );
        }
        await sleep(GRANT_VISIBLE_POLL_MS);
    }
}

/** Builds the shared conversation. Records each ID as soon as it exists, so Teardown cleans up a partial build. */
async function provisionSharedConversation(ctx: IntegrationCheckContext, fx: ConversationAuthorshipFixture, ownerId: string, granteeId: string): Promise<void> {
    const owner = await provisionLeg(ctx, fx, OWNER_EMAIL, ownerId);
    fx.Owner = owner;
    const grantee = await provisionLeg(ctx, fx, GRANTEE_EMAIL, granteeId);
    fx.Grantee = grantee;
    const conversationId = await createConversation(owner, `IT115 shared conversation ${fx.RunTag}`);
    fx.ConversationID = conversationId;
    fx.OwnerMessageID = await postOwnerMessage(fx, owner, conversationId);
    fx.GrantID = await grantEdit(owner, grantee, conversationId);
    await waitForGrantVisible(fx, owner, grantee, conversationId);
}

// ─────────────────────────────────────────────────────────────────── teardown

/** A conversation's owner first (exercising the rule's owner path), then the run's own identity as the fallback. */
function teardownDeleters(ctx: IntegrationCheckContext, conversationOwner: AuthorshipLeg | undefined): Deleter[] {
    const deleters: Deleter[] = [];
    if (conversationOwner) {
        deleters.push({ Label: conversationOwner.Email, Provider: conversationOwner.Provider, User: conversationOwner.Provider.CurrentUser });
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

/** Deletes every message in the fixture conversation, including any a regressed guard let through. Never throws. */
async function deleteConversationMessages(ctx: IntegrationCheckContext, conversationId: string, deleters: Deleter[]): Promise<void> {
    try {
        for (const row of await readMessages(ctx, `ConversationID = '${conversationId}'`)) {
            await deleteRow(DETAILS_ENTITY, row.ID, deleters);
        }
    } catch (e) {
        console.error(`  ✖ ${BUNDLE} teardown could not list the conversation's messages (deleting the conversation cascades to them): ${errorText(e)}`);
    }
}

/** Removes any 'Resource Shared' notification the grant sent the grantee for this conversation (see the file header). Never throws. */
async function sweepShareNotifications(ctx: IntegrationCheckContext, fx: ConversationAuthorshipFixture): Promise<void> {
    if (!fx.Grantee || !fx.ConversationID) {
        return;
    }
    try {
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
            {
                EntityName: NOTIFICATIONS_ENTITY,
                ExtraFilter: `UserID = '${fx.Grantee.UserID}' AND ResourceRecordID = '${fx.ConversationID}'`,
                Fields: ['ID'],
                ResultType: 'simple',
                BypassCache: true
            },
            ctx.User
        );
        if (!res.Success) {
            console.warn(`  ⚠ ${BUNDLE} teardown could not check for share notifications: ${res.ErrorMessage}`);
            return;
        }
        for (const notification of res.Results) {
            await deleteRow(NOTIFICATIONS_ENTITY, notification.ID, [{ Label: 'the run identity', Provider: ctx.Provider, User: ctx.User }]);
        }
    } catch (e) {
        console.warn(`  ⚠ ${BUNDLE} teardown could not check for share notifications: ${errorText(e)}`);
    }
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        const fx: ConversationAuthorshipFixture = { RunTag: `IT115-${Date.now()}`, CreatedKeyIds: [], CreatedScopeRuleIds: [], GranteeConversationIDs: [] };
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
            await provisionSharedConversation(ctx, fx, ownerId, granteeId);
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
        const granteeDeleters = teardownDeleters(ctx, fx.Grantee);
        if (fx.ConversationID) {
            await deleteConversationMessages(ctx, fx.ConversationID, deleters);
        }
        for (const id of fx.GranteeConversationIDs) {
            await deleteConversationMessages(ctx, id, granteeDeleters);
        }
        if (fx.GrantID) {
            await deleteRow(GRANTS_ENTITY, fx.GrantID, deleters);
        }
        await sweepShareNotifications(ctx, fx);
        for (const id of fx.GranteeConversationIDs) {
            await deleteRow(CONVERSATIONS_ENTITY, id, granteeDeleters);
        }
        if (fx.ConversationID) {
            await deleteRow(CONVERSATIONS_ENTITY, fx.ConversationID, deleters);
        }
        // Last: the owner's connection authenticates with one of these keys.
        await DeleteMintedUserKeys(ctx, fx);
    }
});

// ─────────────────────────────────────────────────────────────────── checks

/** CA1 — the grantee cannot post a person's message as the owner, and nothing is written. Uses only Setup's conversation and grant. */
async function checkCa1GranteeCannotPostAsOwner(ctx: IntegrationCheckContext): Promise<void> {
    const fx = readyFixture('CA1');
    if (!fx) return;
    const text = `${fx.RunTag} CA1: the grantee posting as the owner ${MARKER}`;
    const message = await draftMessage(fx.Grantee, fx.ConversationID, text);
    message.UserID = fx.Owner.UserID;

    const outcome = await attemptSave(message);
    assertRefusedWith(outcome, REFUSAL.PostAsSelf, `CA1: ${fx.Grantee.Email} posting a message with the owner's UserID`);

    const rows = await messagesWithText(ctx, fx, text);
    AssertEqual(rows.length, 0, 'CA1: rows carrying the refused post');
}

/** CA2 — the grantee posting with no UserID is saved as the grantee's. Uses only Setup's conversation and grant. */
async function checkCa2GranteePostIsStampedWithGrantee(ctx: IntegrationCheckContext): Promise<void> {
    const fx = readyFixture('CA2');
    if (!fx) return;
    const message = await draftMessage(fx.Grantee, fx.ConversationID, `${fx.RunTag} CA2: the grantee posting with no UserID ${MARKER}`);

    assertDone(await attemptSave(message), `CA2: ${fx.Grantee.Email} posting a message with no UserID`);
    Assert(sameUser(message.UserID, fx.Grantee.UserID),
        `CA2: the saved message MJAPI returned carries UserID=${message.UserID ?? '(empty)'}, expected the grantee's ${fx.Grantee.UserID}`);

    const row = await readMessage(ctx, message.ID);
    Assert(row != null, `CA2: the saved message ${message.ID} is not in the database`);
    Assert(sameUser(row!.UserID, fx.Grantee.UserID),
        `CA2: the stored message carries UserID=${row!.UserID ?? '(empty)'}, expected the grantee's ${fx.Grantee.UserID} (an empty one reads as the owner's)`);
}

/**
 * CA3 — the grantee cannot rewrite the owner's words. Depends on Setup's owner message (no UserID, so it reads as
 * the owner's); a passing run leaves it untouched for CA4.
 */
async function checkCa3GranteeCannotEditOwnersMessage(ctx: IntegrationCheckContext): Promise<void> {
    const fx = readyFixture('CA3');
    if (!fx) return;
    const before = await readOwnerMessage(ctx, fx, 'CA3');

    const message = await loadMessage(fx.Grantee, fx.OwnerMessageID);
    message.Message = `${fx.RunTag} CA3: rewritten by the grantee ${MARKER}`;
    const outcome = await attemptSave(message);
    assertRefusedWith(outcome, REFUSAL.OnlyAuthorChanges, `CA3: ${fx.Grantee.Email} editing the owner's message`);
    await assertMessageUnchanged(ctx, before, "CA3: the owner's message after the refused edit");
}

/** CA4 — the grantee cannot delete the owner's message. Depends on Setup's owner message; a passing run leaves it in place. */
async function checkCa4GranteeCannotDeleteOwnersMessage(ctx: IntegrationCheckContext): Promise<void> {
    const fx = readyFixture('CA4');
    if (!fx) return;
    const before = await readOwnerMessage(ctx, fx, 'CA4');

    const message = await loadMessage(fx.Grantee, fx.OwnerMessageID);
    const outcome = await attemptDelete(message);
    assertRefusedWith(outcome, REFUSAL.OnlyAuthorOrOwnerDeletes, `CA4: ${fx.Grantee.Email} deleting the owner's message`);
    await assertMessageUnchanged(ctx, before, "CA4: the owner's message after the refused delete");
}

/** CA5 — the grantee edits their own message, and the owner deletes it. Self-contained: posts its own message. */
async function checkCa5AuthorEditsAndOwnerDeletes(ctx: IntegrationCheckContext): Promise<void> {
    const fx = readyFixture('CA5');
    if (!fx) return;
    const own = await draftMessage(fx.Grantee, fx.ConversationID, `${fx.RunTag} CA5: the grantee's own words ${MARKER}`);
    assertDone(await attemptSave(own), `CA5 (arrange): ${fx.Grantee.Email} posting their own message`);

    const edited = `${fx.RunTag} CA5: the grantee's own words, edited ${MARKER}`;
    own.Message = edited;
    assertDone(await attemptSave(own), `CA5: ${fx.Grantee.Email} editing their own message`);
    const afterEdit = await readMessage(ctx, own.ID);
    Assert(afterEdit != null, `CA5: the grantee's message ${own.ID} is not in the database`);
    AssertEqual(afterEdit!.Message, edited, "CA5: the grantee's message text after their own edit");
    Assert(sameUser(afterEdit!.UserID, fx.Grantee.UserID),
        `CA5: the grantee's message carries UserID=${afterEdit!.UserID ?? '(empty)'} after their edit, expected ${fx.Grantee.UserID}`);

    const ownerCopy = await loadMessage(fx.Owner, own.ID);
    assertDone(await attemptDelete(ownerCopy), `CA5: ${fx.Owner.Email} (the conversation's owner) deleting the grantee's message`);
    const afterDelete = await readMessage(ctx, own.ID);
    Assert(afterDelete == null, "CA5: the grantee's message is still in the database after the owner deleted it");
}

/** CA6 — the owner posts with no UserID (it stays empty) and edits their own message. Self-contained: posts its own message. */
async function checkCa6OwnerPostsAndEditsAsBefore(ctx: IntegrationCheckContext): Promise<void> {
    const fx = readyFixture('CA6');
    if (!fx) return;
    const message = await draftMessage(fx.Owner, fx.ConversationID, `${fx.RunTag} CA6: the owner's new words ${MARKER}`);
    assertDone(await attemptSave(message), `CA6: ${fx.Owner.Email} posting a message with no UserID`);
    Assert(!message.UserID,
        `CA6: the saved message MJAPI returned carries UserID=${message.UserID}; the owner's must stay empty (it already reads as the owner's)`);
    const afterPost = await readMessage(ctx, message.ID);
    Assert(afterPost != null, `CA6: the owner's message ${message.ID} is not in the database`);
    Assert(!afterPost!.UserID, `CA6: the stored owner's message carries UserID=${afterPost!.UserID}; it must stay empty`);

    const edited = `${fx.RunTag} CA6: the owner's new words, edited ${MARKER}`;
    message.Message = edited;
    assertDone(await attemptSave(message), `CA6: ${fx.Owner.Email} editing their own message`);
    const afterEdit = await readMessage(ctx, message.ID);
    Assert(afterEdit != null, `CA6: the owner's message ${message.ID} disappeared after their edit`);
    AssertEqual(afterEdit!.Message, edited, "CA6: the owner's message text after their own edit");
    Assert(!afterEdit!.UserID, `CA6: the owner's edit stamped UserID=${afterEdit!.UserID}; it must stay empty`);
}

/**
 * CA7 — forged `OldValues___` cannot get the grantee round CA3. `MJ: Conversation Details` does not track record
 * changes, so MJAPI used to hydrate an update from the old values the CLIENT sent, and the rule read who wrote the
 * message from them. The grantee sends the generated mutation directly, twice, against Setup's owner message:
 *   1. new text, `UserID` set to themselves, and `OldValues___` claiming they were already its author;
 *   2. new text, and `OldValues___` claiming the message is an agent reply (`Role='AI'`), which the rule leaves alone.
 * MJAPI must decide from the stored row: both are refused as the owner's words, and the row does not move. Leg 2's
 * false `Role` also trips MJAPI's old-values overlap warning, which logs and tries to write an `MJ: Error Logs` row as
 * the grantee; the seeded role cannot create one, so nothing lands. Depends on Setup's owner message, like CA3.
 */
async function checkCa7ForgedOldValuesCannotClaimAuthorship(ctx: IntegrationCheckContext): Promise<void> {
    const fx = readyFixture('CA7');
    if (!fx) return;
    const before = await readOwnerMessage(ctx, fx, 'CA7');

    const claimedAuthor = await sendDetailUpdate(fx.Grantee, {
        ID: fx.OwnerMessageID,
        Message: `${fx.RunTag} CA7: rewritten under a forged author ${MARKER}`,
        UserID: fx.Grantee.UserID,
        OldValues___: forgedOldValues(before, fx.ConversationID, { Role: 'User', UserID: fx.Grantee.UserID })
    });
    assertRefusedWith(claimedAuthor, REFUSAL.OnlyAuthorChanges,
        `CA7: ${fx.Grantee.Email} rewriting the owner's message with OldValues___ claiming they wrote it`);
    await assertMessageUnchanged(ctx, before, "CA7: the owner's message after the forged-author update");

    const claimedAgent = await sendDetailUpdate(fx.Grantee, {
        ID: fx.OwnerMessageID,
        Message: `${fx.RunTag} CA7: rewritten under a forged role ${MARKER}`,
        OldValues___: forgedOldValues(before, fx.ConversationID, { Role: 'AI', UserID: before.UserID })
    });
    assertRefusedWith(claimedAgent, REFUSAL.OnlyAuthorChanges,
        `CA7: ${fx.Grantee.Email} rewriting the owner's message with OldValues___ claiming it is an agent reply`);
    await assertMessageUnchanged(ctx, before, "CA7: the owner's message after the forged-role update");
}

/**
 * CA8 — a person's conversation message cannot take a field's value from a transaction variable. A 'Use' variable
 * sets its field at Submit(), after every write check has passed, so a message could be checked with one author and
 * saved with another. Shape (the simplest the resolver accepts that puts a 'Use' on a conversation message), built
 * the way GraphQLTransactionGroup builds it (`GetDataObjectJSON()` of client entities):
 *   item 0: Update of Setup's owner message, pinning it (`IsPinned`), which the grantee may do; it 'Define's the
 *           variable from its `ConversationID`;
 *   item 1: Create of the grantee's own message (no UserID), which CA2 shows is otherwise allowed; it 'Use's the
 *           variable on its `ConversationID`.
 * The value the variable would carry is harmless (the same conversation); the point is that any 'Use' is refused.
 * Expect the group to fail with the variable refusal, no row for item 1, and Setup's message unpinned and unchanged
 * (nothing in a refused group is submitted). Depends on Setup's owner message.
 */
async function checkCa8TransactionVariableCannotFillAMessage(ctx: IntegrationCheckContext): Promise<void> {
    const fx = readyFixture('CA8');
    if (!fx) return;
    const before = await readOwnerMessage(ctx, fx, 'CA8');
    Assert(!before.IsPinned, "CA8 precondition: Setup's owner message must start unpinned, or the pin proves nothing");

    const pin = await loadMessage(fx.Grantee, fx.OwnerMessageID);
    pin.IsPinned = true;
    const text = `${fx.RunTag} CA8: the grantee's message filled from a transaction variable ${MARKER}`;
    const post = await draftMessage(fx.Grantee, fx.ConversationID, text);
    const outcome = await sendTransactionGroup(fx.Grantee, {
        Items: [
            { EntityName: DETAILS_ENTITY, EntityObjectJSON: await pin.GetDataObjectJSON(), OperationType: 'Update' },
            { EntityName: DETAILS_ENTITY, EntityObjectJSON: await post.GetDataObjectJSON(), OperationType: 'Create' }
        ],
        Variables: [
            { Name: 'SharedConversationID', ItemIndex: 0, FieldName: 'ConversationID', Type: 'Define' },
            { Name: 'SharedConversationID', ItemIndex: 1, FieldName: 'ConversationID', Type: 'Use' }
        ]
    });
    assertRefusedWith(outcome, REFUSAL.TransactionVariable,
        `CA8: ${fx.Grantee.Email} running a transaction group whose message takes its ConversationID from a variable`);

    AssertEqual((await messagesWithText(ctx, fx, text)).length, 0, "CA8: rows carrying the refused group's new message");
    await assertMessageUnchanged(ctx, before, "CA8: the owner's message after the refused group (its pin must not land)");
}

/** CA9 — `Role='user'` (lower case) is still a person's message: posting it as the owner is refused. Uses only Setup's conversation and grant. */
async function checkCa9LowerCaseRoleCannotPostAsOwner(ctx: IntegrationCheckContext): Promise<void> {
    const fx = readyFixture('CA9');
    if (!fx) return;
    const text = `${fx.RunTag} CA9: the grantee posting as the owner with a lower-case role ${MARKER}`;
    const outcome = await sendDetailCreate(fx.Grantee, {
        ConversationID: fx.ConversationID,
        Role: 'user',
        Message: text,
        UserID: fx.Owner.UserID,
        Status: 'Complete'
    });
    assertRefusedWith(outcome, REFUSAL.PostAsSelf,
        `CA9: ${fx.Grantee.Email} posting with Role='user' and the owner's UserID`);
    AssertEqual((await messagesWithText(ctx, fx, text)).length, 0, 'CA9: rows carrying the refused post');
}

/**
 * CA10 — the grantee cannot move the owner's message into a conversation the grantee owns. Creates that conversation
 * (Teardown removes it); depends on Setup's owner message, which a passing run leaves in the shared conversation.
 */
async function checkCa10MessageCannotMoveConversation(ctx: IntegrationCheckContext): Promise<void> {
    const fx = readyFixture('CA10');
    if (!fx) return;
    const before = await readOwnerMessage(ctx, fx, 'CA10');
    const granteeConversationId = await createConversation(fx.Grantee, `IT115 grantee's own conversation ${fx.RunTag}`);
    fx.GranteeConversationIDs.push(granteeConversationId);

    const message = await loadMessage(fx.Grantee, fx.OwnerMessageID);
    message.ConversationID = granteeConversationId;
    const outcome = await attemptSave(message);
    assertRefusedWith(outcome, REFUSAL.MovedConversation,
        `CA10: ${fx.Grantee.Email} moving the owner's message into a conversation the grantee owns`);

    await assertMessageUnchanged(ctx, before, "CA10: the owner's message after the refused move");
    AssertEqual((await readMessages(ctx, `ConversationID = '${granteeConversationId}'`)).length, 0,
        "CA10: messages in the grantee's own conversation");
}

export const ConversationAuthorshipClientChecks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.CA1`,
        Name: "CA1: a grantee posting a person's message with the owner's UserID is refused, and no row exists",
        RequiresMutation: true,
        Fn: checkCa1GranteeCannotPostAsOwner
    },
    {
        Id: `${BUNDLE}.CA2`,
        Name: "CA2: a grantee posting with no UserID is saved, and the row carries the grantee's ID",
        RequiresMutation: true,
        Fn: checkCa2GranteePostIsStampedWithGrantee
    },
    {
        Id: `${BUNDLE}.CA3`,
        Name: "CA3: a grantee editing the owner's message text is refused, and the text is unchanged",
        RequiresMutation: true,
        Fn: checkCa3GranteeCannotEditOwnersMessage
    },
    {
        Id: `${BUNDLE}.CA4`,
        Name: "CA4: a grantee deleting the owner's message is refused, and the row still exists",
        RequiresMutation: true,
        Fn: checkCa4GranteeCannotDeleteOwnersMessage
    },
    {
        Id: `${BUNDLE}.CA5`,
        Name: "CA5: a grantee edits their own message, and the conversation's owner deletes it",
        RequiresMutation: true,
        Fn: checkCa5AuthorEditsAndOwnerDeletes
    },
    {
        Id: `${BUNDLE}.CA6`,
        Name: "CA6: the owner posts with no UserID (it stays empty) and edits their own message, as before",
        RequiresMutation: true,
        Fn: checkCa6OwnerPostsAndEditsAsBefore
    },
    {
        Id: `${BUNDLE}.CA7`,
        Name: "CA7: a grantee sending the update mutation with forged OldValues___ (claimed author, claimed agent role) is still refused, and the row does not move",
        RequiresMutation: true,
        Fn: checkCa7ForgedOldValuesCannotClaimAuthorship
    },
    {
        Id: `${BUNDLE}.CA8`,
        Name: "CA8: a grantee's transaction group whose conversation message takes a field from a 'Use' variable is refused, and nothing is written",
        RequiresMutation: true,
        Fn: checkCa8TransactionVariableCannotFillAMessage
    },
    {
        Id: `${BUNDLE}.CA9`,
        Name: "CA9: a grantee posting with Role='user' (lower case) and the owner's UserID is refused, and no row exists",
        RequiresMutation: true,
        Fn: checkCa9LowerCaseRoleCannotPostAsOwner
    },
    {
        Id: `${BUNDLE}.CA10`,
        Name: "CA10: a grantee moving the owner's message into a conversation the grantee owns is refused, and it stays put",
        RequiresMutation: true,
        Fn: checkCa10MessageCannotMoveConversation
    }
];

for (const check of ConversationAuthorshipClientChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
