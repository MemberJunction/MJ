/**
 * calendar-event-links.checks.ts — the 'calendar-event-links' bundle (IT123, #4789 A18): calendar
 * events tied to records (`MJ: Calendar Event Links`) and calendar sync (`MJ: Calendar Sync States`),
 * through the real `CalendarEventLinks` against a test-only calendar provider. No external calls.
 *
 *   CL1: over GraphQL, a user holding only the UI role can read both entities, and a create of
 *        either is refused for permission (the generated permissions give the UI role read only).
 *   CL2: CreateLinkedEvent stores the link with the event's iCalendar UID and the record's compact
 *        RecordID; a sync after the calendar moves the event and an attendee accepts hands both to
 *        the record entity's BaseCalendarEventLinkHandler and stores the new token; a refused token
 *        runs a full sync of the window and reports Resynced; a record whose entity has no handler
 *        gets only its link updated; CancelLinkedEvent marks the link Cancelled.
 *
 * TRANSPORT: server. CalendarEventLinks runs server-side, and the fake provider and the handler are
 * ClassFactory registrations in this process. CL1 is the client leg: it needs MJAPI and MJ_API_KEY,
 * and skips loudly without them. It provisions its UI-role user THROUGH MJAPI on a second system-key
 * connection, so MJAPI's user cache holds the user with its role, then reads and writes as that user
 * on a third connection authenticated by the user's own API key. The process-global provider stays
 * the database provider throughout.
 *
 * FIXTURES. Setup registers the fake provider class under PROVIDER_NAME and a recording handler for
 * HANDLED_ENTITY, and creates a temporary `MJ: Communication Providers` row of that name. The linked
 * records are existing core rows (the context user's `MJ: Users` row, a `MJ: Roles` row), used
 * read-only. Teardown, and Setup before it creates anything, delete by name rather than by remembered
 * IDs: the links and sync states of every provider row named PROVIDER_NAME, then those rows, then
 * every UI reader user (by its email pattern) with its keys and child rows. So a run interrupted at
 * any point is cleaned up by the next one.
 */
import { randomUUID } from 'node:crypto';
import { RunView } from '@memberjunction/core';
import type { BaseEntity, CompositeKey, IMetadataProvider } from '@memberjunction/core';
import type {
    MJAPIKeyEntity,
    MJAPIKeyScopeEntity,
    MJCalendarEventLinkEntity,
    MJCalendarSyncStateEntity,
    MJCommunicationProviderEntity,
    MJUserEntity,
    MJUserRoleEntity,
} from '@memberjunction/core-entities';
import { BaseCommunicationProvider, CalendarTargetError, MessageResult } from '@memberjunction/communication-types';
import type {
    BaseMessageResult,
    CalendarAttendeeResponse,
    CalendarEvent,
    CalendarEventAttendee,
    CalendarEventChange,
    CalendarEventInput,
    CalendarEventResult,
    CalendarTarget,
    CancelEventParams,
    CreateDraftResult,
    CreateEventParams,
    ForwardMessageResult,
    GetEventParams,
    GetMessagesResult,
    ProcessedMessage,
    ProviderOperation,
    ReplyToMessageResult,
    SyncEventsParams,
    SyncEventsResult,
    UpdateEventParams,
} from '@memberjunction/communication-types';
import { BaseCalendarEventLinkHandler, CalendarEventLinks, CommunicationEngine } from '@memberjunction/communication-engine';
import type { CalendarLinkChange, SyncCalendarResult } from '@memberjunction/communication-engine';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { EscapeSQLString, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual, IntegrationCheckRegistry, settle } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { BuildSystemKeyProvider, BuildUserKeyProviderWithRetry } from './fls-client.checks';

const BUNDLE = 'calendar-event-links';
const TAG = '(mj-integration-test — safe to delete)';
/** The ClassFactory key AND the provider row's name. CommunicationEngine caches provider instances by name, so no other check may use it. */
const PROVIDER_NAME = 'IT123 Fake Calendar';
const PROVIDERS_ENTITY = 'MJ: Communication Providers';
const LINK_ENTITY = 'MJ: Calendar Event Links';
const SYNC_STATE_ENTITY = 'MJ: Calendar Sync States';
/** The entity the test handler is registered for, and one that has no handler. */
const HANDLED_ENTITY = 'MJ: Users';
const UNHANDLED_ENTITY = 'MJ: Roles';
const ACCOUNT = 'it122-organizer@integration.test';
const TARGET: CalendarTarget = { Identifier: ACCOUNT };
/** CL1's rows live in other accounts, so CL2's sync and its link lookups never see them. */
const SEED_ACCOUNT = 'it122-seed@integration.test';
const REFUSED_ACCOUNT = 'it122-refused@integration.test';
const ATTENDEE = 'it122-attendee@integration.test';
const UI_EMAIL_PREFIX = 'it122-ui-';
const UI_EMAIL_DOMAIN = '@integration.test';
/** Rows that can hang off the UI reader user, deleted before it (children first). */
const USER_CHILD_ENTITIES = ['MJ: User Roles', 'MJ: User Settings', 'MJ: User Applications', 'MJ: User Notification Preferences', 'MJ: Audit Logs'];
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** How long CL1 waits for MJAPI to honour the new user's role and key scope (its caches refresh asynchronously). */
const READ_PROPAGATION_MS = 90_000;
const TOKEN_PREFIX = 'it122-token-';
const NOT_MESSAGING = 'The IT123 fake calendar sends and reads no messages.';

// ── the fake calendar ──────────────────────────────────────────────────────────────────────────

/**
 * One calendar kept in memory: the bundle's "external" calendar. Every change bumps a sequence and a
 * sync token is the sequence it was issued at, so an incremental sync returns what changed since.
 * RefuseNextToken makes the next incremental sync answer ResyncRequired, as Graph and Google do with
 * a 410 for an expired cursor. Counters survive Reset, so tokens and IDs never repeat in a process.
 */
class FakeCalendarProvider extends BaseCommunicationProvider {
    private events = new Map<string, CalendarEvent>();
    private changedAt = new Map<string, number>();
    private sequence = 0;
    private nextID = 1;
    private refuseNext = false;
    /** Every SyncEvents call, in order. */
    public SyncCalls: SyncEventsParams[] = [];

    public Reset(): void {
        this.events.clear();
        this.changedAt.clear();
        this.SyncCalls = [];
        this.refuseNext = false;
    }

    public get CurrentToken(): string {
        return `${TOKEN_PREFIX}${this.sequence}`;
    }

    public RefuseNextToken(): void {
        this.refuseNext = true;
    }

    /** An attendee answers the invitation, in the calendar. */
    public SetResponse(eventID: string, email: string, response: CalendarAttendeeResponse): void {
        const event = this.require(eventID);
        event.Attendees = event.Attendees.map((a) => (a.Email === email ? { ...a, Response: response } : a));
        this.touch(eventID);
    }

    public override getSupportedOperations(): ProviderOperation[] { // case-violation-ok-legacy-back-compat: overrides BaseCommunicationProvider.getSupportedOperations
        return ['CreateEvent', 'UpdateEvent', 'CancelEvent', 'GetEvent', 'SyncEvents'];
    }

    public override async CreateEvent(params: CreateEventParams): Promise<CalendarEventResult> {
        const refusal = CalendarTargetError('CreateEvent', params.Target);
        if (refusal) return { Success: false, ErrorMessage: refusal };
        const id = `it122-event-${this.nextID++}`;
        const input = params.Event;
        this.events.set(id, {
            ExternalEventID: id,
            SeriesID: null,
            ICalUID: `${randomUUID()}@it122.integration.test`,
            Subject: input.Subject,
            Body: input.Body ?? '',
            Start: input.Start,
            End: input.End,
            IsAllDay: input.IsAllDay ?? false,
            Location: input.Location ?? null,
            Organizer: { Email: params.Target.Identifier },
            Attendees: (input.Attendees ?? []).map((a) => ({ ...a, Response: 'None' })),
            IsCancelled: false,
            OnlineMeetingUrl: null,
            LastModified: null,
        });
        this.touch(id);
        return { Success: true, Event: this.copy(id) };
    }

    public override async UpdateEvent(params: UpdateEventParams): Promise<CalendarEventResult> {
        const refusal = CalendarTargetError('UpdateEvent', params.Target) ?? this.missing(params.ExternalEventID);
        if (refusal) return { Success: false, ErrorMessage: refusal };
        const event = this.require(params.ExternalEventID);
        const changes = params.Changes;
        if (changes.Subject !== undefined) event.Subject = changes.Subject;
        if (changes.Start) event.Start = changes.Start;
        if (changes.End) event.End = changes.End;
        if (changes.Location !== undefined) event.Location = changes.Location;
        this.touch(params.ExternalEventID);
        return { Success: true, Event: this.copy(params.ExternalEventID) };
    }

    public override async CancelEvent(params: CancelEventParams): Promise<BaseMessageResult> {
        const refusal = CalendarTargetError('CancelEvent', params.Target) ?? this.missing(params.ExternalEventID);
        if (refusal) return { Success: false, ErrorMessage: refusal };
        this.require(params.ExternalEventID).IsCancelled = true;
        this.touch(params.ExternalEventID);
        return { Success: true };
    }

    public override async GetEvent(params: GetEventParams): Promise<CalendarEventResult> {
        const refusal = CalendarTargetError('GetEvent', params.Target) ?? this.missing(params.ExternalEventID);
        return refusal ? { Success: false, ErrorMessage: refusal } : { Success: true, Event: this.copy(params.ExternalEventID) };
    }

    public override async SyncEvents(params: SyncEventsParams): Promise<SyncEventsResult> {
        const refusal = CalendarTargetError('SyncEvents', params.Target);
        if (refusal) return { Success: false, Changes: [], ErrorMessage: refusal };
        this.SyncCalls.push({ ...params });
        if (params.SyncToken === undefined) {
            return { Success: true, Changes: this.inWindow(params), NextSyncToken: this.CurrentToken };
        }
        const since = params.SyncToken.startsWith(TOKEN_PREFIX) ? Number(params.SyncToken.slice(TOKEN_PREFIX.length)) : NaN;
        if (this.refuseNext || !Number.isInteger(since)) {
            this.refuseNext = false;
            return { Success: false, Changes: [], ResyncRequired: true, ErrorMessage: 'The sync token has expired.' };
        }
        return { Success: true, Changes: this.changedSince(since), NextSyncToken: this.CurrentToken };
    }

    public async SendSingleMessage(message: ProcessedMessage): Promise<MessageResult> {
        const result = new MessageResult();
        result.Message = message;
        result.Success = false;
        result.Error = NOT_MESSAGING;
        return result;
    }

    public async GetMessages(): Promise<GetMessagesResult> {
        return { Success: false, ErrorMessage: NOT_MESSAGING, Messages: [] };
    }

    public async ForwardMessage(): Promise<ForwardMessageResult> {
        return { Success: false, ErrorMessage: NOT_MESSAGING };
    }

    public async ReplyToMessage(): Promise<ReplyToMessageResult> {
        return { Success: false, ErrorMessage: NOT_MESSAGING };
    }

    public async CreateDraft(): Promise<CreateDraftResult> {
        return { Success: false, ErrorMessage: NOT_MESSAGING };
    }

    /** A full sync: every event that starts in the window and is not cancelled. */
    private inWindow(params: SyncEventsParams): CalendarEventChange[] {
        const from = params.WindowStart?.getTime() ?? -Infinity;
        const to = params.WindowEnd?.getTime() ?? Infinity;
        return [...this.events.values()]
            .filter((e) => !e.IsCancelled && e.Start !== null && e.Start.getTime() >= from && e.Start.getTime() <= to)
            .map((e) => this.change(e.ExternalEventID));
    }

    private changedSince(since: number): CalendarEventChange[] {
        return [...this.changedAt].filter(([, at]) => at > since).map(([id]) => this.change(id));
    }

    private change(id: string): CalendarEventChange {
        return this.require(id).IsCancelled ? { Kind: 'Removed', ExternalEventID: id } : { Kind: 'Upserted', ExternalEventID: id, Event: this.copy(id) };
    }

    private touch(id: string): void {
        this.changedAt.set(id, ++this.sequence);
        this.require(id).LastModified = new Date();
    }

    private copy(id: string): CalendarEvent {
        return structuredClone(this.require(id));
    }

    private missing(id: string): string | null {
        return this.events.has(id) ? null : `No event ${id} in the IT123 fake calendar.`;
    }

    private require(id: string): CalendarEvent {
        const event = this.events.get(id);
        if (!event) throw new Error(`No event ${id} in the IT123 fake calendar.`);
        return event;
    }
}

// ── the test handler ───────────────────────────────────────────────────────────────────────────

type HandledChange = {
    LinkID: string;
    Kind: CalendarLinkChange['Kind'];
    Start: Date | null;
    End: Date | null;
    Attendees: CalendarEventAttendee[];
};

/** Every change the handler was given, in order. Module scope: the ClassFactory makes a new handler per change. */
const handledChanges: HandledChange[] = [];

/** Records what a sync hands HANDLED_ENTITY and writes nothing: the linked record is a core row, used read-only. */
class RecordingLinkHandler extends BaseCalendarEventLinkHandler {
    public async HandleChange(change: CalendarLinkChange): Promise<boolean> {
        handledChanges.push({
            LinkID: change.Link.ID,
            Kind: change.Kind,
            Start: change.Event?.Start ?? null,
            End: change.Event?.End ?? null,
            Attendees: change.Event?.Attendees ?? [],
        });
        return true;
    }
}

function handledFor(linkID: string): HandledChange[] {
    return handledChanges.filter((h) => UUIDsEqual(h.LinkID, linkID));
}

// ── fixture ────────────────────────────────────────────────────────────────────────────────────

/** A core record the bundle links events to, read-only. `RecordID` is its compact key. */
type LinkedRecord = { EntityName: string; EntityID: string; Key: CompositeKey; RecordID: string };

type CalendarFixture = { ProviderID: string; Handled: LinkedRecord; Unhandled: LinkedRecord };

let fixture: CalendarFixture | null = null;

function requireFixture(): CalendarFixture {
    if (!fixture) throw new Error(`${BUNDLE} fixture missing: the bundle Setup did not run.`);
    return fixture;
}

/** The provider instance CalendarEventLinks gets from the engine (cached by name), as the fake it must be. */
function fakeCalendar(): FakeCalendarProvider {
    const provider = CommunicationEngine.Instance.GetProvider(PROVIDER_NAME);
    if (!(provider instanceof FakeCalendarProvider)) {
        throw new Error(`CommunicationEngine.GetProvider('${PROVIDER_NAME}') returned ${provider.constructor.name}, not the IT123 fake.`);
    }
    return provider;
}

type ClassRef = abstract new () => object;

/**
 * ponytail: the ClassFactory has no unregister, so both registrations outlive Teardown in this
 * process. They are inert there: the provider class resolves only for PROVIDER_NAME, whose row is
 * gone, and the handler only records. Add an unregister to the ClassFactory if that ever matters.
 */
function registerOnce(baseClass: ClassRef, subClass: ClassRef, key: string): void {
    const factory = MJGlobal.Instance.ClassFactory;
    if (factory.GetRegistration(baseClass, key)?.SubClass !== subClass) {
        factory.Register(baseClass, subClass, key);
    }
}

async function readRows<T extends BaseEntity>(ctx: IntegrationCheckContext, entityName: string, filter: string, maxRows?: number): Promise<T[]> {
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<T>(
        { EntityName: entityName, ExtraFilter: filter, ResultType: 'entity_object', BypassCache: true, ...(maxRows ? { MaxRows: maxRows } : {}) },
        ctx.User
    );
    if (!result.Success) throw new Error(`reading ${entityName} failed: ${result.ErrorMessage}`);
    return result.Results ?? [];
}

async function saveOrThrow(entity: BaseEntity, what: string): Promise<void> {
    if (!(await entity.Save())) {
        throw new Error(`saving ${what} failed: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
}

async function linkedRecord(ctx: IntegrationCheckContext, entityName: string, filter: string): Promise<LinkedRecord> {
    const entity = ctx.Provider.EntityByName(entityName);
    const [row] = await readRows<BaseEntity>(ctx, entityName, filter, 1);
    if (!entity || !row) throw new Error(`${BUNDLE}: no ${entityName} record to link an event to.`);
    return { EntityName: entityName, EntityID: entity.ID, Key: row.PrimaryKey, RecordID: row.PrimaryKey.ToCompactURLSegment() };
}

async function createProviderRow(ctx: IntegrationCheckContext): Promise<string> {
    const row = await ctx.Provider.GetEntityObject<MJCommunicationProviderEntity>(PROVIDERS_ENTITY, ctx.User);
    row.NewRecord();
    row.Name = PROVIDER_NAME;
    row.Description = `Test-only in-memory calendar for IT123 ${TAG}`;
    row.Status = 'Active';
    row.SupportsSending = false; // never a candidate for a send (the communication bundle picks the first sending provider)
    row.SupportsReceiving = false;
    await saveOrThrow(row, 'the fake provider row');
    return row.ID;
}

// ── cleanup (Setup and Teardown) ───────────────────────────────────────────────────────────────

async function deleteRow(row: BaseEntity, entityName: string): Promise<void> {
    if (!(await row.Delete())) {
        console.warn(`  ⚠ ${BUNDLE} cleanup: could not delete ${entityName} ${row.PrimaryKey.ToCompactURLSegment()}: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
}

async function deleteRows(ctx: IntegrationCheckContext, entityName: string, filter: string): Promise<void> {
    for (const row of await readRows<BaseEntity>(ctx, entityName, filter)) {
        await deleteRow(row, entityName);
    }
}

async function bestEffort(what: string, work: () => Promise<void>): Promise<void> {
    try {
        await work();
    } catch (e) {
        console.warn(`  ⚠ ${BUNDLE} cleanup of ${what} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
}

/** Every provider row named PROVIDER_NAME, with its links and sync states first. */
async function sweepProviderRows(ctx: IntegrationCheckContext): Promise<void> {
    for (const provider of await readRows<MJCommunicationProviderEntity>(ctx, PROVIDERS_ENTITY, `Name='${EscapeSQLString(PROVIDER_NAME)}'`)) {
        const byProvider = `CommunicationProviderID='${EscapeSQLString(provider.ID)}'`;
        await deleteRows(ctx, LINK_ENTITY, byProvider);
        await deleteRows(ctx, SYNC_STATE_ENTITY, byProvider);
        await deleteRow(provider, PROVIDERS_ENTITY);
    }
}

/** Every UI reader user CL1 made, with its keys (scope rules and usage logs first) and child rows. */
async function sweepUIReaders(ctx: IntegrationCheckContext): Promise<void> {
    for (const user of await readRows<MJUserEntity>(ctx, 'MJ: Users', `Email LIKE '${EscapeSQLString(UI_EMAIL_PREFIX)}%${EscapeSQLString(UI_EMAIL_DOMAIN)}'`)) {
        const byUser = `UserID='${EscapeSQLString(user.ID)}'`;
        for (const key of await readRows<MJAPIKeyEntity>(ctx, 'MJ: API Keys', byUser)) {
            const byKey = `APIKeyID='${EscapeSQLString(key.ID)}'`;
            await deleteRows(ctx, 'MJ: API Key Scopes', byKey);
            await deleteRows(ctx, 'MJ: API Key Usage Logs', byKey);
            await deleteRow(key, 'MJ: API Keys');
        }
        for (const child of USER_CHILD_ENTITIES) {
            await deleteRows(ctx, child, byUser);
        }
        await deleteRow(user, 'MJ: Users');
    }
}

/** Never throws, so a failing check still cleans up and a partial Setup is cleaned up too. */
async function sweep(ctx: IntegrationCheckContext): Promise<void> {
    await bestEffort('the fake provider and its calendar rows', () => sweepProviderRows(ctx));
    await bestEffort('the UI reader users', () => sweepUIReaders(ctx));
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        registerOnce(BaseCommunicationProvider, FakeCalendarProvider, PROVIDER_NAME);
        registerOnce(BaseCalendarEventLinkHandler, RecordingLinkHandler, HANDLED_ENTITY);
        handledChanges.length = 0;
        await sweep(ctx); // whatever an interrupted run left behind
        fixture = {
            ProviderID: await createProviderRow(ctx),
            Handled: await linkedRecord(ctx, HANDLED_ENTITY, `ID='${EscapeSQLString(ctx.User.ID)}'`),
            Unhandled: await linkedRecord(ctx, UNHANDLED_ENTITY, ''),
        };
        await CommunicationEngine.Instance.Config(true, ctx.User, ctx.Provider); // pick up the new provider row
        fakeCalendar().Reset();
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        await sweep(ctx);
        fixture = null;
    },
});

// ── CL1: the UI role over GraphQL ──────────────────────────────────────────────────────────────

/** A user holding only the UI role, created THROUGH MJAPI so its user cache has the user and the role. */
async function createUIReader(ctx: IntegrationCheckContext, wire: IMetadataProvider): Promise<string> {
    const uiRole = ctx.Provider.Roles.find((r) => r.Name === 'UI');
    if (!uiRole) throw new Error("CL1: the 'UI' role was not found");
    const email = `${UI_EMAIL_PREFIX}${Date.now()}${UI_EMAIL_DOMAIN}`;
    const user = await wire.GetEntityObject<MJUserEntity>('MJ: Users', wire.CurrentUser);
    user.NewRecord();
    user.Name = email;
    user.Email = email;
    user.FirstName = 'IT123';
    user.LastName = `UI Reader ${TAG}`;
    user.Type = 'User';
    user.IsActive = true;
    await saveOrThrow(user, 'the UI reader user');
    const role = await wire.GetEntityObject<MJUserRoleEntity>('MJ: User Roles', wire.CurrentUser);
    role.NewRecord();
    role.UserID = user.ID;
    role.RoleID = uiRole.ID;
    await saveOrThrow(role, 'the UI reader role');
    const roles = await readRows<MJUserRoleEntity>(ctx, 'MJ: User Roles', `UserID='${EscapeSQLString(user.ID)}'`);
    Assert(roles.length === 1 && UUIDsEqual(roles[0].RoleID, uiRole.ID), `CL1: fixture invalid: the reader must hold only the UI role, holds ${roles.map((r) => r.Role).join(', ')}`);
    return user.ID;
}

/** A user API key for the reader, granted full_access so only entity permissions can stop it. Written through MJAPI. */
async function mintReaderKey(ctx: IntegrationCheckContext, wire: IMetadataProvider, userID: string): Promise<string> {
    const created = await GetAPIKeyEngine().CreateAPIKey({ UserId: userID, Label: `IT123 UI reader ${TAG}` }, ctx.User, wire);
    if (!created.Success || !created.RawKey || !created.APIKeyId) {
        throw new Error(`CL1: CreateAPIKey failed: ${created.Error ?? 'no raw key returned'}`);
    }
    const scope = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>(
        { EntityName: 'MJ: API Scopes', ExtraFilter: `FullPath='full_access'`, Fields: ['ID'], ResultType: 'simple' },
        ctx.User
    );
    if (!scope.Success || scope.Results.length !== 1) throw new Error(`CL1: the 'full_access' API scope was not found: ${scope.ErrorMessage ?? ''}`);
    const rule = await wire.GetEntityObject<MJAPIKeyScopeEntity>('MJ: API Key Scopes', wire.CurrentUser);
    rule.NewRecord();
    rule.APIKeyID = created.APIKeyId;
    rule.ScopeID = scope.Results[0].ID;
    rule.ResourcePattern = '*';
    rule.PatternType = 'Include';
    rule.IsDeny = false;
    rule.Priority = 0;
    await saveOrThrow(rule, 'the full_access scope rule');
    return created.RawKey;
}

/** The reader's own GraphQL connection, or null (with a loud skip) when MJAPI or MJ_API_KEY is missing. */
async function connectUIReader(ctx: IntegrationCheckContext): Promise<GraphQLDataProvider | null> {
    let wire: IMetadataProvider;
    try {
        wire = await BuildSystemKeyProvider();
    } catch (e) {
        console.warn(`  ⚠ ${BUNDLE}.CL1 SKIPPED — needs MJAPI running and MJ_API_KEY set: ${e instanceof Error ? e.message : String(e)}`);
        return null;
    }
    const userID = await createUIReader(ctx, wire);
    const rawKey = await mintReaderKey(ctx, wire, userID);
    return (await BuildUserKeyProviderWithRetry(rawKey)) as GraphQLDataProvider;
}

/** One row of each entity for the reader to find, in an account CL2 never touches. Written directly; MJAPI reads the database. */
async function seedReadableRows(ctx: IntegrationCheckContext, fx: CalendarFixture): Promise<{ LinkID: string; SyncStateID: string }> {
    const link = await ctx.Provider.GetEntityObject<MJCalendarEventLinkEntity>(LINK_ENTITY, ctx.User);
    link.NewRecord();
    link.CommunicationProviderID = fx.ProviderID;
    link.AccountIdentifier = SEED_ACCOUNT;
    link.ExternalEventID = 'it122-seed-event';
    link.EntityID = fx.Handled.EntityID;
    link.RecordID = fx.Handled.RecordID;
    link.Status = 'Cancelled'; // never the record's active link, which CL2 looks up
    await saveOrThrow(link, 'the seed link');
    const state = await ctx.Provider.GetEntityObject<MJCalendarSyncStateEntity>(SYNC_STATE_ENTITY, ctx.User);
    state.NewRecord();
    state.CommunicationProviderID = fx.ProviderID;
    state.AccountIdentifier = SEED_ACCOUNT;
    await saveOrThrow(state, 'the seed sync state');
    return { LinkID: link.ID, SyncStateID: state.ID };
}

/** Polls (bounded) until the reader reads the row: MJAPI picks up the new role and key scope asynchronously. */
async function assertReaderReads(reader: GraphQLDataProvider, entityName: string, id: string): Promise<void> {
    const deadline = Date.now() + READ_PROPAGATION_MS;
    for (;;) {
        const result = await RunView.FromMetadataProvider(reader).RunView<{ ID: string }>({
            EntityName: entityName,
            ExtraFilter: `ID='${EscapeSQLString(id)}'`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
        });
        if (result.Success && result.Results.length === 1 && UUIDsEqual(result.Results[0].ID, id)) return;
        const got = result.Success ? `${result.Results.length} rows` : result.ErrorMessage;
        Assert(Date.now() < deadline, `CL1: a UI-role user could not read ${entityName} ${id} over GraphQL: ${got}`);
        await settle(3_000);
    }
}

/** Sends the generated create mutation straight over the wire, so no client-side check can be what refuses it. */
async function assertCreateRefused(reader: GraphQLDataProvider, typeName: string, input: Record<string, string>): Promise<void> {
    let error = '';
    try {
        await reader.ExecuteGQL(`mutation ($input: Create${typeName}Input!) { Create${typeName}(input: $input) { ID } }`, { input });
    } catch (e) {
        error = e instanceof Error ? e.message : String(e);
    }
    Assert(error.length > 0, `CL1: Create${typeName} SUCCEEDED for a user holding only the UI role, which has read only`);
    Assert(/permission/i.test(error), `CL1: Create${typeName} was refused, but not for permission, which proves nothing: ${error}`);
}

async function checkUIRoleOverGraphQL(ctx: IntegrationCheckContext): Promise<void> {
    const fx = requireFixture();
    const reader = await connectUIReader(ctx);
    if (!reader) return;
    const seeds = await seedReadableRows(ctx, fx);
    await assertReaderReads(reader, LINK_ENTITY, seeds.LinkID);
    await assertReaderReads(reader, SYNC_STATE_ENTITY, seeds.SyncStateID);

    const owner = { CommunicationProviderID: fx.ProviderID, AccountIdentifier: REFUSED_ACCOUNT };
    await assertCreateRefused(reader, 'MJCalendarEventLink', {
        ...owner,
        ExternalEventID: 'it122-refused-event',
        EntityID: fx.Handled.EntityID,
        RecordID: fx.Handled.RecordID,
    });
    await assertCreateRefused(reader, 'MJCalendarSyncState', owner);
    const byRefused = `CommunicationProviderID='${EscapeSQLString(fx.ProviderID)}' AND AccountIdentifier='${EscapeSQLString(REFUSED_ACCOUNT)}'`;
    AssertEqual((await readRows<BaseEntity>(ctx, LINK_ENTITY, byRefused)).length, 0, 'CL1: a refused link create left a row');
    AssertEqual((await readRows<BaseEntity>(ctx, SYNC_STATE_ENTITY, byRefused)).length, 0, 'CL1: a refused sync state create left a row');
}

// ── CL2: links and sync ────────────────────────────────────────────────────────────────────────

function eventInput(subject: string, start: Date): CalendarEventInput {
    return {
        Subject: `IT123 ${subject} ${TAG}`,
        Start: start,
        End: new Date(start.getTime() + HOUR_MS),
        TimeZone: 'UTC',
        Attendees: [{ Email: ATTENDEE, Type: 'Required' }],
    };
}

async function loadLink(ctx: IntegrationCheckContext, id: string): Promise<MJCalendarEventLinkEntity> {
    const link = await ctx.Provider.GetEntityObject<MJCalendarEventLinkEntity>(LINK_ENTITY, ctx.User);
    if (!(await link.Load(id))) throw new Error(`CL2: link ${id} could not be loaded`);
    return link;
}

async function calendarEvent(fake: FakeCalendarProvider, id: string): Promise<CalendarEvent> {
    const read = await fake.GetEvent({ Target: TARGET, ExternalEventID: id });
    if (!read.Event) throw new Error(`CL2: ${read.ErrorMessage}`);
    return read.Event;
}

/** The token stored for the organizer's calendar. */
async function storedToken(ctx: IntegrationCheckContext): Promise<string | null> {
    const filter = `CommunicationProviderID='${EscapeSQLString(requireFixture().ProviderID)}' AND AccountIdentifier='${EscapeSQLString(ACCOUNT)}'`;
    const states = await readRows<MJCalendarSyncStateEntity>(ctx, SYNC_STATE_ENTITY, filter);
    AssertEqual(states.length, 1, `CL2: expected one sync state for ${ACCOUNT}`);
    return states[0].SyncToken;
}

function assertSynced(result: SyncCalendarResult, label: string, expected: { Changes: number; Resynced: boolean }): void {
    Assert(result.Success, `${label} failed: ${result.ErrorMessage ?? ''} ${result.Errors.join('; ')}`);
    AssertEqual(result.Changes, expected.Changes, `${label}: changes read`);
    AssertEqual(result.LinksUpdated, expected.Changes, `${label}: links updated (one link per changed event)`);
    AssertEqual(result.Resynced, expected.Resynced, `${label}: Resynced`);
}

/** The calendar moves an event by some hours; returns its new times. */
async function moveInCalendar(fake: FakeCalendarProvider, id: string, hours: number): Promise<{ Start: Date; End: Date }> {
    const event = await calendarEvent(fake, id);
    if (!event.Start || !event.End) throw new Error(`CL2: event ${id} has no times`);
    const moved = { Start: new Date(event.Start.getTime() + hours * HOUR_MS), End: new Date(event.End.getTime() + hours * HOUR_MS) };
    const updated = await fake.UpdateEvent({ Target: TARGET, ExternalEventID: id, Changes: moved });
    Assert(updated.Success, `CL2: the fake calendar refused to move ${id}: ${updated.ErrorMessage}`);
    return moved;
}

async function createLinkedEvent(ctx: IntegrationCheckContext, links: CalendarEventLinks, record: LinkedRecord, label: string, start: Date): Promise<MJCalendarEventLinkEntity> {
    const fake = fakeCalendar();
    const result = await links.CreateLinkedEvent(
        { ProviderName: PROVIDER_NAME, Target: TARGET, Event: eventInput(label, start), EntityName: record.EntityName, RecordKey: record.Key },
        ctx.User
    );
    if (!result.Success || !result.Link) throw new Error(`CL2: CreateLinkedEvent ${label} failed: ${result.ErrorMessage}`);
    const stored = await loadLink(ctx, result.Link.ID);
    const event = await calendarEvent(fake, stored.ExternalEventID);
    Assert(!!event.ICalUID && stored.ICalUID === event.ICalUID, `CL2 ${label}: the link must store the event's iCalendar UID ${event.ICalUID}, has ${stored.ICalUID}`);
    Assert(UUIDsEqual(stored.RecordID, record.RecordID), `CL2 ${label}: RecordID must be the record's compact key ${record.RecordID}, is ${stored.RecordID}`);
    Assert(UUIDsEqual(stored.EntityID, record.EntityID), `CL2 ${label}: EntityID must be ${record.EntityName}'s`);
    Assert(UUIDsEqual(stored.CommunicationProviderID, requireFixture().ProviderID), `CL2 ${label}: the link must name the fake provider row`);
    AssertEqual(stored.AccountIdentifier, ACCOUNT, `CL2 ${label}: the link must record whose calendar`);
    AssertEqual(stored.Status, 'Active', `CL2 ${label}: a new link is Active`);
    return stored;
}

/** No token yet: a full sync, which stores the first token. */
async function firstSync(ctx: IntegrationCheckContext, links: CalendarEventLinks): Promise<void> {
    const fake = fakeCalendar();
    assertSynced(await links.SyncCalendar({ ProviderName: PROVIDER_NAME, Target: TARGET }, ctx.User), 'CL2 first sync', { Changes: 2, Resynced: false });
    AssertEqual(fake.SyncCalls.at(-1)?.SyncToken, undefined, 'CL2 first sync: with no stored token it must be a full sync');
    AssertEqual(await storedToken(ctx), fake.CurrentToken, 'CL2 first sync: the token must be stored');
    handledChanges.length = 0;
}

/** The calendar moves both events and the attendee of A accepts; one incremental sync brings it all back. */
async function syncMovedTimeAndRsvp(ctx: IntegrationCheckContext, links: CalendarEventLinks, linkA: MJCalendarEventLinkEntity, linkB: MJCalendarEventLinkEntity): Promise<void> {
    const fake = fakeCalendar();
    const tokenBefore = await storedToken(ctx);
    const bSyncedBefore = (await loadLink(ctx, linkB.ID)).LastSyncedAt?.getTime() ?? 0;
    const moved = await moveInCalendar(fake, linkA.ExternalEventID, 2);
    fake.SetResponse(linkA.ExternalEventID, ATTENDEE, 'Accepted');
    await moveInCalendar(fake, linkB.ExternalEventID, 1);

    assertSynced(await links.SyncCalendar({ ProviderName: PROVIDER_NAME, Target: TARGET }, ctx.User), 'CL2 incremental sync', { Changes: 2, Resynced: false });
    AssertEqual(fake.SyncCalls.at(-1)?.SyncToken, tokenBefore ?? undefined, 'CL2 incremental sync: must send the stored token');
    const forA = handledFor(linkA.ID);
    AssertEqual(forA.length, 1, `CL2: the ${HANDLED_ENTITY} handler must get the change once`);
    AssertEqual(forA[0].Start?.getTime(), moved.Start.getTime(), 'CL2: the handler must see the moved start');
    AssertEqual(forA[0].End?.getTime(), moved.End.getTime(), 'CL2: the handler must see the moved end');
    AssertEqual(forA[0].Attendees.find((a) => a.Email === ATTENDEE)?.Response, 'Accepted', 'CL2: the handler must see the RSVP');
    AssertEqual(await storedToken(ctx), fake.CurrentToken, 'CL2 incremental sync: the new token must be stored');
    Assert(fake.CurrentToken !== tokenBefore, 'CL2 incremental sync: the calendar issued no new token');

    // A record of an entity with no handler: its link is updated, and nothing else is called.
    AssertEqual(handledFor(linkB.ID).length, 0, `CL2: ${UNHANDLED_ENTITY} has no handler, yet one was called`);
    const bAfter = await loadLink(ctx, linkB.ID);
    Assert((bAfter.LastSyncedAt?.getTime() ?? 0) > bSyncedBefore, `CL2: the ${UNHANDLED_ENTITY} record's link must be updated by the sync`);
    AssertEqual(bAfter.Status, 'Active', `CL2: the ${UNHANDLED_ENTITY} record's link must stay Active`);
}

/** The calendar refuses the stored token: the sync drops it, reads the whole window, and says so. */
async function syncAfterRefusedToken(ctx: IntegrationCheckContext, links: CalendarEventLinks, linkA: MJCalendarEventLinkEntity): Promise<void> {
    const fake = fakeCalendar();
    const refusedToken = await storedToken(ctx);
    const moved = await moveInCalendar(fake, linkA.ExternalEventID, 1);
    fake.RefuseNextToken();
    const windowStart = new Date(Date.now() - DAY_MS);
    const windowEnd = new Date(Date.now() + 30 * DAY_MS);
    const callsBefore = fake.SyncCalls.length;

    const result = await links.SyncCalendar({ ProviderName: PROVIDER_NAME, Target: TARGET, WindowStart: windowStart, WindowEnd: windowEnd }, ctx.User);
    assertSynced(result, 'CL2 refused token', { Changes: 2, Resynced: true });
    const [refused, full, extra] = fake.SyncCalls.slice(callsBefore);
    AssertEqual(refused?.SyncToken, refusedToken ?? undefined, 'CL2 refused token: the first call must send the stored token');
    Assert(!!full && full.SyncToken === undefined && !extra, 'CL2 refused token: exactly one retry, a full sync with no token');
    AssertEqual(full.WindowStart?.getTime(), windowStart.getTime(), 'CL2 refused token: the full sync reads the given window (start)');
    AssertEqual(full.WindowEnd?.getTime(), windowEnd.getTime(), 'CL2 refused token: the full sync reads the given window (end)');
    AssertEqual(await storedToken(ctx), fake.CurrentToken, "CL2 refused token: the full sync's token must be stored");
    AssertEqual(handledFor(linkA.ID).at(-1)?.Start?.getTime(), moved.Start.getTime(), 'CL2 refused token: the full sync must deliver the latest time');
}

async function cancelLinkedEvent(ctx: IntegrationCheckContext, links: CalendarEventLinks, record: LinkedRecord, linkA: MJCalendarEventLinkEntity): Promise<void> {
    const result = await links.CancelLinkedEvent(
        { ProviderName: PROVIDER_NAME, EntityName: record.EntityName, RecordKey: record.Key, Comment: `Cancelled by IT123 ${TAG}` },
        ctx.User
    );
    Assert(result.Success, `CL2: CancelLinkedEvent failed: ${result.ErrorMessage}`);
    AssertEqual((await loadLink(ctx, linkA.ID)).Status, 'Cancelled', 'CL2: CancelLinkedEvent must mark the link Cancelled');
    AssertEqual((await calendarEvent(fakeCalendar(), linkA.ExternalEventID)).IsCancelled, true, 'CL2: the event must be cancelled in the calendar');
}

async function checkLinksAndSync(ctx: IntegrationCheckContext): Promise<void> {
    const fx = requireFixture();
    const unhandled = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseCalendarEventLinkHandler>(BaseCalendarEventLinkHandler, UNHANDLED_ENTITY);
    Assert(!unhandled.Resolved, `CL2: fixture invalid: a calendar link handler is registered for ${UNHANDLED_ENTITY}`);
    const links = new CalendarEventLinks(ctx.Provider);
    const start = new Date(Math.ceil(Date.now() / HOUR_MS) * HOUR_MS + 2 * DAY_MS);
    const linkA = await createLinkedEvent(ctx, links, fx.Handled, 'A', start);
    const linkB = await createLinkedEvent(ctx, links, fx.Unhandled, 'B', new Date(start.getTime() + DAY_MS));
    await firstSync(ctx, links);
    await syncMovedTimeAndRsvp(ctx, links, linkA, linkB);
    await syncAfterRefusedToken(ctx, links, linkA);
    await cancelLinkedEvent(ctx, links, fx.Handled, linkA);
}

export const CalendarEventLinksChecks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.CL1`,
        Name: 'CL1: over GraphQL a UI-role user reads calendar links and sync states, and a create of either is refused for permission',
        Fn: checkUIRoleOverGraphQL,
    },
    {
        Id: `${BUNDLE}.CL2`,
        Name: 'CL2: a linked event stores its iCalendar UID and compact RecordID; sync delivers a moved time and an RSVP to the handler, resyncs on a refused token, updates an unhandled record\'s link only; cancel marks the link Cancelled',
        Fn: checkLinksAndSync,
    },
];

for (const check of CalendarEventLinksChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
