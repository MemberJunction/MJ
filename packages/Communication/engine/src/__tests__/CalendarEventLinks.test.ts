/**
 * Calendar event links and calendar sync, over an in-memory store.
 *
 * The provider is a fake whose SyncEvents/CreateEvent/... answer what each test sets; the metadata
 * provider and RunView are fakes over a store of plain rows, so a test can see exactly which link and
 * sync-state rows were written. RunView's ExtraFilter is parsed (Field='value' AND Field IS NULL), so
 * the filters the code builds are exercised, not ignored.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CalendarEvent, CalendarEventChange, SyncEventsResult } from '@memberjunction/communication-types';

type Row = Record<string, string | Date | null>;

const { store, engine, credentialEngine, providerCalls } = vi.hoisted(() => {
    const store: Record<string, Row[]> = { 'MJ: Calendar Event Links': [], 'MJ: Calendar Sync States': [] };
    const providerCalls: { method: string; params: Record<string, unknown>; credentials?: object }[] = [];
    const engine = {
        Config: vi.fn().mockResolvedValue(undefined),
        Providers: [
            { ID: 'prov-graph', Name: 'Microsoft Graph' },
            { ID: 'prov-gmail', Name: 'Gmail' },
        ],
        GetProvider: vi.fn(),
    };
    const credentialEngine = {
        Config: vi.fn().mockResolvedValue(undefined),
        GetCredential: vi.fn().mockResolvedValue({ values: { tenantId: 't', clientId: 'c', clientSecret: 's' } }),
    };
    return { store, engine, credentialEngine, providerCalls };
});

vi.mock('../Engine', () => ({ CommunicationEngine: { Instance: engine } }));
vi.mock('@memberjunction/credentials', () => ({ CredentialEngine: { Instance: credentialEngine } }));
vi.mock('@memberjunction/communication-types', async () => ({
    BaseCommunicationProvider: class {},
    ...(await vi.importActual<{ CalendarTargetError: (op: string, target: { Identifier: string } | undefined) => string | null }>(
        '../../../base-types/src/Calendar'
    )),
}));
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    /** Reads `A='x' AND B IS NULL` (as built by the code under test) into a row predicate. */
    const parse = (filter: string) => {
        const clauses = filter.split(' AND ').map((clause) => {
            const isNull = clause.match(/^(\w+) IS NULL$/);
            if (isNull) return (row: Row) => row[isNull[1]] == null;
            const equals = clause.match(/^(\w+)='((?:[^']|'')*)'$/);
            if (!equals) throw new Error(`Unparsed filter clause: ${clause}`);
            const value = equals[2].replace(/''/g, "'");
            return (row: Row) => row[equals[1]] === value;
        });
        return (row: Row) => clauses.every((matches) => matches(row));
    };
    class FakeRunView {
        public static FromMetadataProvider() {
            return new FakeRunView();
        }
        public async RunView(params: { EntityName: string; ExtraFilter: string }) {
            const rows = (store[params.EntityName] ?? []).filter(parse(params.ExtraFilter));
            return { Success: true, Results: rows.map((row) => new FakeEntity(params.EntityName, row)) };
        }
    }
    return { ...actual, RunView: FakeRunView, LogError: vi.fn() };
});

/** A stand-in for a BaseEntity: the row's fields as properties, Save() writes them back to the store. */
class FakeEntity {
    [field: string]: unknown;
    public static FailNextSave = false;
    public LatestResult: { CompleteMessage: string } | null = null;
    constructor(private readonly entityName: string, row: Row = {}) {
        Object.assign(this, row);
    }
    get IsSaved(): boolean {
        return !!this.ID;
    }
    get Entity(): string {
        return this.EntityID === 'entity-meetings' ? 'Meetings' : 'Notes';
    }
    async Save(): Promise<boolean> {
        if (FakeEntity.FailNextSave) {
            FakeEntity.FailNextSave = false;
            this.LatestResult = { CompleteMessage: 'simulated save failure' };
            return false;
        }
        const rows = store[this.entityName];
        const fields = Object.fromEntries(Object.entries(this).filter(([k]) => !['entityName', 'LatestResult'].includes(k))) as Row;
        if (!this.ID) {
            this.ID = `${this.entityName === 'MJ: Calendar Sync States' ? 'state' : 'link'}-${rows.length + 1}`;
            fields.ID = this.ID as string;
            rows.push(fields);
        } else {
            Object.assign(rows.find((r) => r.ID === this.ID)!, fields);
        }
        return true;
    }
}

import { RegisterClass } from '@memberjunction/global';
import { CompositeKey, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BaseCalendarEventLinkHandler, CalendarEventLinks, CalendarLinkChange } from '../CalendarEventLinks';

const handled: CalendarLinkChange[] = [];
let handlerAnswer = true;

@RegisterClass(BaseCalendarEventLinkHandler, 'Meetings')
class MeetingHandler extends BaseCalendarEventLinkHandler {
    public async HandleChange(change: CalendarLinkChange): Promise<boolean> {
        handled.push(change);
        return handlerAnswer;
    }
}

const metadata = {
    EntityByName: (name: string) => (name === 'Meetings' ? { ID: 'entity-meetings', Name: 'Meetings' } : name === 'Notes' ? { ID: 'entity-notes', Name: 'Notes' } : undefined),
    GetEntityObject: async (name: string) => new FakeEntity(name),
} as unknown as IMetadataProvider;
const user = { ID: 'user-1', Name: 'Tester' } as UserInfo;
const ORGANIZER = { Identifier: 'organizer@contoso.com' };
const MEETING_KEY = CompositeKey.FromKeyValuePairs([{ FieldName: 'ID', Value: 'meeting-1' }]);

function event(overrides: Partial<CalendarEvent>): CalendarEvent {
    return {
        ExternalEventID: 'evt-1',
        SeriesID: null,
        ICalUID: 'uid-1',
        Subject: 'Board planning',
        Body: '',
        Start: new Date('2026-10-20T14:00:00Z'),
        End: new Date('2026-10-20T15:00:00Z'),
        IsAllDay: false,
        Location: null,
        Organizer: { Email: 'organizer@contoso.com' },
        Attendees: [{ Email: 'ada@contoso.com', Type: 'Required', Response: 'None' }],
        IsCancelled: false,
        OnlineMeetingUrl: null,
        LastModified: null,
        ...overrides,
    };
}

/** A provider whose answers each test queues; every call is recorded. */
function fakeProvider(syncAnswers: SyncEventsResult[] = []) {
    const answer = (method: string, result: object) => async (params: Record<string, unknown>, credentials?: object) => {
        providerCalls.push({ method, params, credentials });
        return result;
    };
    return {
        CreateEvent: answer('CreateEvent', { Success: true, Event: event({}) }),
        UpdateEvent: answer('UpdateEvent', { Success: true, Event: event({ Start: new Date('2026-10-20T16:00:00Z') }) }),
        CancelEvent: answer('CancelEvent', { Success: true }),
        SyncEvents: async (params: Record<string, unknown>, credentials?: object) => {
            providerCalls.push({ method: 'SyncEvents', params, credentials });
            return syncAnswers.shift() ?? { Success: true, Changes: [], NextSyncToken: 'tok-empty' };
        },
    };
}

function addLink(row: Row): void {
    store['MJ: Calendar Event Links'].push({
        ID: `link-${store['MJ: Calendar Event Links'].length + 1}`,
        CommunicationProviderID: 'prov-graph',
        AccountIdentifier: 'organizer@contoso.com',
        CalendarID: null,
        ExternalSeriesID: null,
        EntityID: 'entity-meetings',
        Status: 'Active',
        LastSyncedAt: null,
        ...row,
    });
}

const links = () => store['MJ: Calendar Event Links'];
const states = () => store['MJ: Calendar Sync States'];
let service: CalendarEventLinks;

beforeEach(() => {
    store['MJ: Calendar Event Links'] = [];
    store['MJ: Calendar Sync States'] = [];
    providerCalls.length = 0;
    handled.length = 0;
    handlerAnswer = true;
    FakeEntity.FailNextSave = false;
    credentialEngine.GetCredential.mockClear();
    engine.GetProvider.mockReturnValue(fakeProvider());
    service = new CalendarEventLinks(metadata);
});

describe('CreateLinkedEvent', () => {
    const params = { ProviderName: 'Microsoft Graph', Target: ORGANIZER, Event: { Subject: 'Board planning', Start: new Date(), End: new Date() }, EntityName: 'Meetings', RecordKey: MEETING_KEY };

    it('creates the event in the target calendar and links it to the record, storing its iCalendar UID', async () => {
        const result = await service.CreateLinkedEvent(params, user);

        expect(result.Success).toBe(true);
        expect(providerCalls[0]).toMatchObject({ method: 'CreateEvent', params: { Target: ORGANIZER } });
        expect(links()).toHaveLength(1);
        expect(links()[0]).toMatchObject({
            CommunicationProviderID: 'prov-graph',
            AccountIdentifier: 'organizer@contoso.com',
            CalendarID: null,
            ExternalEventID: 'evt-1',
            ICalUID: 'uid-1',
            EntityID: 'entity-meetings',
            RecordID: 'meeting-1',
            Status: 'Active',
        });
        expect(links()[0].LastSyncedAt).toBeInstanceOf(Date);
    });

    it('stores a composite key in the compact URL-segment form', async () => {
        const composite = CompositeKey.FromKeyValuePairs([{ FieldName: 'OrderID', Value: '7' }, { FieldName: 'LineNo', Value: '2' }]);
        await service.CreateLinkedEvent({ ...params, RecordKey: composite }, user);
        expect(links()[0].RecordID).toBe(composite.ToCompactURLSegment());
        expect(links()[0].RecordID).toContain('OrderID');
    });

    it('refuses without a target, before calling the provider', async () => {
        const result = await service.CreateLinkedEvent({ ...params, Target: { Identifier: '' } }, user);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('needs a Target');
        expect(providerCalls).toHaveLength(0);
    });

    it('says the event exists, with its ID, when the link cannot be saved', async () => {
        FakeEntity.FailNextSave = true;
        const result = await service.CreateLinkedEvent(params, user);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('was created (evt-1) but its link was not saved');
        expect(result.Event?.ExternalEventID).toBe('evt-1');
    });

    it('refuses an unknown provider by name', async () => {
        const result = await service.CreateLinkedEvent({ ...params, ProviderName: 'Carrier Pigeon' }, user);
        expect(result.ErrorMessage).toContain("Communication provider 'Carrier Pigeon' not found");
    });
});

describe('credentials', () => {
    const params = { ProviderName: 'Microsoft Graph', Target: ORGANIZER, Event: { Subject: 's', Start: new Date(), End: new Date() }, EntityName: 'Meetings', RecordKey: MEETING_KEY };

    it('passes caller credentials through untouched', async () => {
        const callerCredentials = { accessToken: 'tok', disableEnvironmentFallback: true };
        await service.CreateLinkedEvent({ ...params, Credentials: callerCredentials }, user);
        expect(providerCalls[0].credentials).toBe(callerCredentials);
        expect(credentialEngine.GetCredential).not.toHaveBeenCalled();
    });

    it('resolves a stored credential through CredentialEngine, with the environment fallback off', async () => {
        await service.CreateLinkedEvent({ ...params, CredentialID: 'cred-9' }, user);
        expect(credentialEngine.GetCredential).toHaveBeenCalledWith('', { credentialId: 'cred-9', contextUser: user, subsystem: 'Communication' });
        expect(providerCalls[0].credentials).toEqual({ tenantId: 't', clientId: 'c', clientSecret: 's', disableEnvironmentFallback: true });
    });

    it('passes none when none is named, leaving the provider its own fallback', async () => {
        await service.CreateLinkedEvent(params, user);
        expect(providerCalls[0].credentials).toBeUndefined();
    });
});

describe('UpdateLinkedEvent and CancelLinkedEvent', () => {
    it("updates the event in the link's own calendar and refreshes the link", async () => {
        addLink({ ExternalEventID: 'evt-1', ICalUID: 'uid-1', RecordID: 'meeting-1', CalendarID: 'cal-7' });
        const result = await service.UpdateLinkedEvent({ ProviderName: 'Microsoft Graph', EntityName: 'Meetings', RecordKey: MEETING_KEY, Changes: { Location: 'Room 9' } }, user);

        expect(result.Success).toBe(true);
        expect(providerCalls[0]).toMatchObject({
            method: 'UpdateEvent',
            params: { Target: { Identifier: 'organizer@contoso.com', CalendarID: 'cal-7' }, ExternalEventID: 'evt-1', Changes: { Location: 'Room 9' } },
        });
        expect(links()[0].LastSyncedAt).toBeInstanceOf(Date);
    });

    it('cancels the event and marks the link Cancelled', async () => {
        addLink({ ExternalEventID: 'evt-1', ICalUID: 'uid-1', RecordID: 'meeting-1' });
        const result = await service.CancelLinkedEvent({ ProviderName: 'Microsoft Graph', EntityName: 'Meetings', RecordKey: MEETING_KEY, Comment: 'Off' }, user);

        expect(result.Success).toBe(true);
        expect(providerCalls[0]).toMatchObject({ method: 'CancelEvent', params: { ExternalEventID: 'evt-1', Comment: 'Off' } });
        expect(links()[0].Status).toBe('Cancelled');
    });

    it('asks which account when the record has events in two, and uses the one named', async () => {
        addLink({ ExternalEventID: 'evt-a', RecordID: 'meeting-1', AccountIdentifier: 'a@contoso.com' });
        addLink({ ExternalEventID: 'evt-b', RecordID: 'meeting-1', AccountIdentifier: 'b@contoso.com' });
        const key = { ProviderName: 'Microsoft Graph', EntityName: 'Meetings', RecordKey: MEETING_KEY };

        const ambiguous = await service.CancelLinkedEvent(key, user);
        expect(ambiguous.ErrorMessage).toContain('2 active calendar links');
        expect(providerCalls).toHaveLength(0);

        await service.CancelLinkedEvent({ ...key, Identifier: 'b@contoso.com' }, user);
        expect(providerCalls[0].params.ExternalEventID).toBe('evt-b');
    });

    it('reports a record with no link', async () => {
        const result = await service.UpdateLinkedEvent({ ProviderName: 'Microsoft Graph', EntityName: 'Meetings', RecordKey: MEETING_KEY, Changes: {} }, user);
        expect(result.ErrorMessage).toContain('No active calendar link');
    });
});

describe('SyncCalendar', () => {
    const SYNC = { ProviderName: 'Microsoft Graph', Target: ORGANIZER };
    const moved: CalendarEventChange = { Kind: 'Upserted', ExternalEventID: 'evt-1', Event: event({ Start: new Date('2026-10-20T16:00:00Z'), End: new Date('2026-10-20T17:00:00Z') }) };
    const rsvp: CalendarEventChange = {
        Kind: 'Upserted',
        ExternalEventID: 'evt-2-new-id',
        Event: event({ ExternalEventID: 'evt-2-new-id', ICalUID: 'uid-2', Attendees: [{ Email: 'ada@contoso.com', Type: 'Required', Response: 'Declined' }] }),
    };

    it('runs a full sync of a window on the first run and stores the token', async () => {
        engine.GetProvider.mockReturnValue(fakeProvider([{ Success: true, Changes: [], NextSyncToken: 'tok-1' }]));
        const result = await service.SyncCalendar(SYNC, user);

        expect(result.Success).toBe(true);
        expect(providerCalls[0].params.SyncToken).toBeUndefined();
        expect(providerCalls[0].params.WindowStart).toBeInstanceOf(Date);
        expect(states()).toHaveLength(1);
        expect(states()[0]).toMatchObject({ CommunicationProviderID: 'prov-graph', AccountIdentifier: 'organizer@contoso.com', CalendarID: null, SyncToken: 'tok-1' });
    });

    it('sends the stored token on the next run', async () => {
        states().push({ ID: 'state-1', CommunicationProviderID: 'prov-graph', AccountIdentifier: 'organizer@contoso.com', CalendarID: null, SyncToken: 'tok-1' });
        engine.GetProvider.mockReturnValue(fakeProvider([{ Success: true, Changes: [], NextSyncToken: 'tok-2' }]));
        await service.SyncCalendar(SYNC, user);

        expect(providerCalls[0].params.SyncToken).toBe('tok-1');
        expect(states()[0].SyncToken).toBe('tok-2');
    });

    it('applies a moved time and a changed RSVP to the links, matching by event ID then iCalendar UID, and calls the handler', async () => {
        addLink({ ExternalEventID: 'evt-1', ICalUID: 'uid-1', RecordID: 'meeting-1' });
        addLink({ ExternalEventID: 'evt-2-old-id', ICalUID: 'uid-2', RecordID: 'meeting-2' });
        addLink({ ExternalEventID: 'evt-3', ICalUID: 'uid-3', RecordID: 'meeting-3' });
        engine.GetProvider.mockReturnValue(fakeProvider([{ Success: true, Changes: [moved, rsvp, { Kind: 'Upserted', ExternalEventID: 'unlinked', Event: event({ ExternalEventID: 'unlinked', ICalUID: 'uid-x' }) }], NextSyncToken: 'tok-1' }]));
        const result = await service.SyncCalendar(SYNC, user);

        expect(result).toMatchObject({ Success: true, Changes: 3, LinksUpdated: 2, Errors: [] });
        expect(links()[1].ExternalEventID).toBe('evt-2-new-id'); // re-keyed through the UID match
        expect(links()[2].LastSyncedAt).toBeNull(); // untouched

        expect(handled.map((h) => h.Link.RecordID)).toEqual(['meeting-1', 'meeting-2']);
        expect(handled[0]).toMatchObject({ Kind: 'Upserted', IsCancelled: false });
        expect(handled[0].Event?.Start).toEqual(new Date('2026-10-20T16:00:00Z'));
        expect(handled[1].Event?.Attendees[0].Response).toBe('Declined');
        expect(states()[0].SyncToken).toBe('tok-1');
    });

    it('marks a removed event Cancelled and tells the handler', async () => {
        addLink({ ExternalEventID: 'evt-1', ICalUID: 'uid-1', RecordID: 'meeting-1' });
        engine.GetProvider.mockReturnValue(fakeProvider([{ Success: true, Changes: [{ Kind: 'Removed', ExternalEventID: 'evt-1' }], NextSyncToken: 'tok-1' }]));
        await service.SyncCalendar(SYNC, user);

        expect(links()[0].Status).toBe('Cancelled');
        expect(handled[0]).toMatchObject({ Kind: 'Removed', IsCancelled: true, Event: undefined });
    });

    it('treats an event its organizer cancelled as a cancellation too', async () => {
        addLink({ ExternalEventID: 'evt-1', ICalUID: 'uid-1', RecordID: 'meeting-1' });
        engine.GetProvider.mockReturnValue(fakeProvider([{ Success: true, Changes: [{ Kind: 'Upserted', ExternalEventID: 'evt-1', Event: event({ IsCancelled: true }) }], NextSyncToken: 'tok-1' }]));
        await service.SyncCalendar(SYNC, user);
        expect(links()[0].Status).toBe('Cancelled');
        expect(handled[0].IsCancelled).toBe(true);
    });

    it('updates the link alone when the entity has no handler', async () => {
        addLink({ ExternalEventID: 'evt-1', ICalUID: 'uid-1', RecordID: 'note-1', EntityID: 'entity-notes' });
        engine.GetProvider.mockReturnValue(fakeProvider([{ Success: true, Changes: [moved], NextSyncToken: 'tok-1' }]));
        const result = await service.SyncCalendar(SYNC, user);

        expect(result).toMatchObject({ Success: true, LinksUpdated: 1 });
        expect(handled).toHaveLength(0);
        expect(links()[0].LastSyncedAt).toBeInstanceOf(Date);
    });

    it('keeps the old token when a handler fails, so the change is delivered again', async () => {
        states().push({ ID: 'state-1', CommunicationProviderID: 'prov-graph', AccountIdentifier: 'organizer@contoso.com', CalendarID: null, SyncToken: 'tok-old' });
        addLink({ ExternalEventID: 'evt-1', ICalUID: 'uid-1', RecordID: 'meeting-1' });
        handlerAnswer = false;
        engine.GetProvider.mockReturnValue(fakeProvider([{ Success: true, Changes: [moved], NextSyncToken: 'tok-new' }]));
        const result = await service.SyncCalendar(SYNC, user);

        expect(result.Success).toBe(false);
        expect(result.Errors[0]).toContain('Meetings handler did not apply the change');
        expect(states()[0].SyncToken).toBe('tok-old');
    });

    it('clears a refused token and runs a full sync of the window', async () => {
        states().push({ ID: 'state-1', CommunicationProviderID: 'prov-graph', AccountIdentifier: 'organizer@contoso.com', CalendarID: null, SyncToken: 'tok-expired' });
        engine.GetProvider.mockReturnValue(
            fakeProvider([
                { Success: false, Changes: [], ResyncRequired: true, ErrorMessage: 'gone' },
                { Success: true, Changes: [], NextSyncToken: 'tok-fresh' },
            ])
        );
        const windowStart = new Date('2026-10-01T00:00:00Z');
        const windowEnd = new Date('2026-12-01T00:00:00Z');
        const result = await service.SyncCalendar({ ...SYNC, WindowStart: windowStart, WindowEnd: windowEnd }, user);

        expect(result).toMatchObject({ Success: true, Resynced: true });
        expect(providerCalls.map((c) => c.params.SyncToken)).toEqual(['tok-expired', undefined]);
        expect(providerCalls[1].params).toMatchObject({ WindowStart: windowStart, WindowEnd: windowEnd });
        expect(states()[0].SyncToken).toBe('tok-fresh');
    });

    it('stores nothing when the provider read fails', async () => {
        engine.GetProvider.mockReturnValue(fakeProvider([{ Success: false, Changes: [], ErrorMessage: 'throttled' }]));
        const result = await service.SyncCalendar(SYNC, user);
        expect(result).toMatchObject({ Success: false, ErrorMessage: 'throttled' });
        expect(states()).toHaveLength(0);
    });

    it('keeps calendars apart: a link in another calendar of the account is not matched', async () => {
        addLink({ ExternalEventID: 'evt-1', ICalUID: 'uid-1', RecordID: 'meeting-1', CalendarID: 'other' });
        engine.GetProvider.mockReturnValue(fakeProvider([{ Success: true, Changes: [moved], NextSyncToken: 'tok-1' }]));
        const result = await service.SyncCalendar(SYNC, user);
        expect(result.LinksUpdated).toBe(0);
    });

    it('refuses without a target', async () => {
        const result = await service.SyncCalendar({ ProviderName: 'Microsoft Graph', Target: { Identifier: ' ' } }, user);
        expect(result.ErrorMessage).toContain('needs a Target');
        expect(providerCalls).toHaveLength(0);
    });
});

// Referenced so the registration above is not tree-shaken by a future bundler config.
void MeetingHandler;
