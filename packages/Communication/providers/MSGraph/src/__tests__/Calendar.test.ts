/**
 * Calendar writes and sync on the MS Graph provider, against recorded Graph payloads
 * (`fixtures/*.json`, the shapes Graph returns for POST /events and calendarView/delta).
 *
 * The Graph client is replaced by a recorder that captures every request (verb, path, headers,
 * body) and answers from a queue, so each test checks both what was ASKED of Graph and what came
 * back to the caller.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import type { Event as GraphEvent } from '@microsoft/microsoft-graph-types';

type RecordedCall = { method: 'get' | 'post' | 'patch' | 'delete'; path: string; headers: Record<string, string>; select?: string; body?: object };

const { shared, calls, queue, initWithMiddleware } = await vi.hoisted(async () => {
    const shared = await import('./graph-mocks');
    const calls: RecordedCall[] = [];
    const queue: (object | Error)[] = [];
    const next = async (): Promise<object> => {
        const reply = queue.shift();
        if (reply instanceof Error) throw reply;
        return reply ?? {};
    };
    const api = (path: string) => {
        const headers: Record<string, string> = {};
        let select: string | undefined;
        const record = (method: RecordedCall['method'], body?: object): Promise<object> => {
            calls.push({ method, path, headers, select, body });
            return next();
        };
        const chain = {
            header(name: string, value: string) {
                headers[name] = value;
                return chain;
            },
            select(fields: string) {
                select = fields;
                return chain;
            },
            get: () => record('get'),
            post: (body: object) => record('post', body),
            patch: (body: object) => record('patch', body),
            delete: () => record('delete'),
        };
        return chain;
    };
    const initWithMiddleware = vi.fn().mockReturnValue({ api });
    return { shared, calls, queue, initWithMiddleware };
});

vi.mock('@memberjunction/communication-types', async () => ({
    ...shared.communicationTypesMock(),
    // The real calendar helpers, from source: the Target check and the wall-clock conversion are
    // what these tests are about, so they must not be stubs.
    ...(await vi.importActual<{
        CalendarTargetError: (operation: string, target: { Identifier: string } | null | undefined) => string | null;
        CalendarWallClock: (when: Date, timeZone: string) => string;
    }>('../../../../base-types/src/Calendar')),
}));
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: Function) => target };
});
vi.mock('@memberjunction/core', () => ({ LogError: vi.fn(), LogStatus: vi.fn() }));
vi.mock('env-var', () => shared.envVarMock());
vi.mock('@microsoft/microsoft-graph-client', () => ({ Client: { initWithMiddleware } }));
vi.mock('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials', () => ({
    TokenCredentialAuthenticationProvider: vi.fn().mockImplementation(function () {
        return {};
    }),
}));

import { MSGraphProvider } from '../MSGraphProvider';

function fixture<T>(name: string): T {
    return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
}

const GRAPH = 'https://graph.microsoft.com/v1.0/users';
/** What an untyped caller (plain JS, a JSON payload) can send: the type system cannot stop it, so the provider must. */
const NO_TARGET = undefined as never;
const ORGANIZER = { Identifier: 'organizer@contoso.com' };
const CREATED = fixture<GraphEvent>('graph-event-created.json');
const MEETING = {
    Subject: 'Board planning',
    Body: '<p>Agenda attached.</p>',
    BodyType: 'HTML' as const,
    Start: new Date('2026-10-20T14:00:00Z'),
    End: new Date('2026-10-20T15:00:00Z'),
    Location: 'Room 4',
    IsOnlineMeeting: true,
    Attendees: [
        { Email: 'ada@contoso.com', Name: 'Ada Lovelace', Type: 'Required' as const },
        { Email: 'grace@fabrikam.com', Type: 'Optional' as const },
    ],
};

function graphError(statusCode: number, code: string): Error {
    return Object.assign(new Error(code), { statusCode, code });
}

let provider: MSGraphProvider;
beforeEach(() => {
    calls.length = 0;
    queue.length = 0;
    initWithMiddleware.mockClear();
    provider = new MSGraphProvider();
});

describe('capability', () => {
    it('reports the five calendar operations, and still GetEvents', () => {
        // getSupportedOperations is what the base class's SupportsOperation reads; the base is stubbed here.
        expect(provider.getSupportedOperations()).toEqual(
            expect.arrayContaining(['GetEvents', 'CreateEvent', 'UpdateEvent', 'CancelEvent', 'GetEvent', 'SyncEvents'])
        );
    });
});

describe('the target is required on every calendar call', () => {
    /**
     * The env mock sets AZURE_ACCOUNT_EMAIL, so a fallback WOULD find a mailbox. The refusal must come
     * anyway, before any request, or an event lands in the service mailbox.
     */
    it.each([
        ['CreateEvent', () => provider.CreateEvent({ Target: NO_TARGET, Event: MEETING })],
        ['UpdateEvent', () => provider.UpdateEvent({ Target: { Identifier: ' ' }, ExternalEventID: 'e', Changes: {} })],
        ['CancelEvent', () => provider.CancelEvent({ Target: { Identifier: '' }, ExternalEventID: 'e' })],
        ['GetEvent', () => provider.GetEvent({ Target: NO_TARGET, ExternalEventID: 'e' })],
        ['SyncEvents', () => provider.SyncEvents({ Target: NO_TARGET })],
    ])('%s is refused with no request sent', async (operation, call) => {
        const result = await call();
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain(`${operation} needs a Target`);
        expect(calls).toHaveLength(0);
    });
});

describe('CreateEvent', () => {
    it('posts the event to the target mailbox, with attendees, so Graph sends the invitations', async () => {
        queue.push(CREATED);
        await provider.CreateEvent({ Target: ORGANIZER, Event: MEETING });

        expect(calls[0].method).toBe('post');
        expect(calls[0].path).toBe(`${GRAPH}/${encodeURIComponent('organizer@contoso.com')}/events`);
        expect(calls[0].headers.Prefer).toBe('outlook.timezone="UTC"');
        expect(calls[0].body).toEqual({
            subject: 'Board planning',
            body: { contentType: 'html', content: '<p>Agenda attached.</p>' },
            start: { dateTime: '2026-10-20T14:00:00', timeZone: 'UTC' },
            end: { dateTime: '2026-10-20T15:00:00', timeZone: 'UTC' },
            location: { displayName: 'Room 4' },
            attendees: [
                { emailAddress: { address: 'ada@contoso.com', name: 'Ada Lovelace' }, type: 'required' },
                { emailAddress: { address: 'grace@fabrikam.com' }, type: 'optional' },
            ],
            isOnlineMeeting: true,
            onlineMeetingProvider: 'teamsForBusiness',
        });
    });

    it('returns the created event with its iCalendar UID, organizer and the join URL', async () => {
        queue.push(CREATED);
        const result = await provider.CreateEvent({ Target: ORGANIZER, Event: MEETING });

        expect(result.Success).toBe(true);
        expect(result.Event).toMatchObject({
            ExternalEventID: CREATED.id,
            ICalUID: CREATED.iCalUId,
            SeriesID: null,
            Subject: 'Board planning',
            Start: new Date('2026-10-20T14:00:00Z'),
            End: new Date('2026-10-20T15:00:00Z'),
            Organizer: { Email: 'organizer@contoso.com', Name: 'Org Anizer' },
            OnlineMeetingUrl: CREATED.onlineMeeting?.joinUrl,
            IsCancelled: false,
        });
        expect(result.Event?.Attendees).toEqual([
            { Email: 'ada@contoso.com', Name: 'Ada Lovelace', Type: 'Required', Response: 'None' },
            { Email: 'grace@fabrikam.com', Name: 'Grace Hopper', Type: 'Optional', Response: 'None' },
        ]);
    });

    it('writes into a named calendar when the target has one', async () => {
        queue.push(CREATED);
        await provider.CreateEvent({ Target: { Identifier: 'organizer@contoso.com', CalendarID: 'AAMk/team' }, Event: MEETING });
        expect(calls[0].path).toBe(`${GRAPH}/${encodeURIComponent('organizer@contoso.com')}/calendars/${encodeURIComponent('AAMk/team')}/events`);
    });

    it('sends times as wall clock in the event time zone', async () => {
        queue.push(CREATED);
        await provider.CreateEvent({ Target: ORGANIZER, Event: { ...MEETING, TimeZone: 'America/New_York' } });
        const body = calls[0].body as GraphEvent;
        expect(body.start).toEqual({ dateTime: '2026-10-20T10:00:00', timeZone: 'America/New_York' });
        expect(body.end).toEqual({ dateTime: '2026-10-20T11:00:00', timeZone: 'America/New_York' });
    });

    it('sends an all-day event as midnight of each day, flagged all-day', async () => {
        queue.push(CREATED);
        const allDay = { Subject: 'Offsite', Start: new Date('2026-10-20T12:00:00Z'), End: new Date('2026-10-21T12:00:00Z'), IsAllDay: true };
        await provider.CreateEvent({ Target: ORGANIZER, Event: allDay });
        expect(calls[0].body).toMatchObject({
            isAllDay: true,
            start: { dateTime: '2026-10-20T00:00:00', timeZone: 'UTC' },
            end: { dateTime: '2026-10-21T00:00:00', timeZone: 'UTC' },
        });
    });

    it('reports a Graph failure as a result, naming the mailbox', async () => {
        queue.push(graphError(403, 'ErrorAccessDenied'));
        const result = await provider.CreateEvent({ Target: ORGANIZER, Event: MEETING });
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('CreateEvent failed for organizer@contoso.com');
    });
});

describe('UpdateEvent', () => {
    it('patches only the fields that changed', async () => {
        queue.push({ ...CREATED, start: { dateTime: '2026-10-20T16:00:00.0000000', timeZone: 'UTC' } });
        const result = await provider.UpdateEvent({
            Target: ORGANIZER,
            ExternalEventID: 'AAMk=1',
            Changes: { Start: new Date('2026-10-20T16:00:00Z'), End: new Date('2026-10-20T17:00:00Z'), TimeZone: 'UTC', IsAllDay: false },
        });

        expect(calls[0].method).toBe('patch');
        expect(calls[0].path).toBe(`${GRAPH}/${encodeURIComponent('organizer@contoso.com')}/events/${encodeURIComponent('AAMk=1')}`);
        expect(calls[0].body).toEqual({
            start: { dateTime: '2026-10-20T16:00:00', timeZone: 'UTC' },
            end: { dateTime: '2026-10-20T17:00:00', timeZone: 'UTC' },
            isAllDay: false,
        });
        expect(result.Event?.Start).toEqual(new Date('2026-10-20T16:00:00Z'));
    });

    /** Without them the patch would rewrite an all-day or local event as timed, in UTC. */
    it.each([
        ['IsAllDay', { TimeZone: 'Europe/Paris' }],
        ['TimeZone', { IsAllDay: true }],
    ])('refuses a time change without %s and sends nothing', async (_missing, extra) => {
        const result = await provider.UpdateEvent({
            Target: ORGANIZER,
            ExternalEventID: 'AAMk=1',
            Changes: { Start: new Date('2026-10-20T00:00:00Z'), ...extra },
        });
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/must also carry IsAllDay and TimeZone/);
        expect(calls).toHaveLength(0);
    });
});

describe('CancelEvent', () => {
    it('cancels with the comment when the mailbox is the organizer', async () => {
        queue.push({ isOrganizer: true }, {});
        const result = await provider.CancelEvent({ Target: ORGANIZER, ExternalEventID: 'AAMk=1', Comment: 'Moved to next week' });

        expect(result.Success).toBe(true);
        expect(calls[0]).toMatchObject({ method: 'get', select: 'isOrganizer' });
        expect(calls[1]).toMatchObject({ method: 'post', body: { Comment: 'Moved to next week' } });
        expect(calls[1].path).toMatch(/\/events\/AAMk%3D1\/cancel$/);
    });

    it('deletes its own copy when the mailbox is only an attendee', async () => {
        queue.push({ isOrganizer: false }, {});
        const result = await provider.CancelEvent({ Target: { Identifier: 'ada@contoso.com' }, ExternalEventID: 'AAMk=1' });

        expect(result.Success).toBe(true);
        expect(calls.map((c) => c.method)).toEqual(['get', 'delete']);
    });

    it('treats an event that is already gone as cancelled', async () => {
        queue.push(graphError(404, 'ErrorItemNotFound'));
        const result = await provider.CancelEvent({ Target: ORGANIZER, ExternalEventID: 'gone' });
        expect(result.Success).toBe(true);
    });

    /** Graph answers an unknown mailbox with 404 too. That cancelled nothing, so it must not read as done. */
    it('reports a 404 for the mailbox as a failure, not as already cancelled', async () => {
        queue.push(graphError(404, 'ErrorInvalidUser'));
        const result = await provider.CancelEvent({ Target: { Identifier: 'typo@contoso.com' }, ExternalEventID: 'AAMk=1' });
        expect(result.Success).toBe(false);
    });

    it('reports any other failure', async () => {
        queue.push({ isOrganizer: true }, graphError(500, 'ErrorInternalServerError'));
        const result = await provider.CancelEvent({ Target: ORGANIZER, ExternalEventID: 'AAMk=1' });
        expect(result.Success).toBe(false);
    });
});

describe('GetEvent', () => {
    it('reads each attendee response', async () => {
        const page = fixture<{ value: GraphEvent[] }>('graph-delta-page-2.json');
        queue.push(page.value[0]);
        const result = await provider.GetEvent({ Target: ORGANIZER, ExternalEventID: 'x' });

        expect(calls[0]).toMatchObject({ method: 'get', headers: { Prefer: 'outlook.timezone="UTC"' } });
        expect(result.Event?.Attendees.map((a) => [a.Email, a.Response])).toEqual([
            ['ada@contoso.com', 'Accepted'],
            ['alan@contoso.com', 'Tentative'],
            ['grace@fabrikam.com', 'Declined'],
        ]);
        expect(result.Event?.SeriesID).toBe(page.value[0].seriesMasterId);
    });
});

describe('SyncEvents', () => {
    const WINDOW = { WindowStart: new Date('2026-10-01T00:00:00Z'), WindowEnd: new Date('2026-11-01T00:00:00Z') };

    it('starts a full sync on the windowed calendar view delta', async () => {
        queue.push(fixture('graph-delta-page-1.json'), fixture('graph-delta-page-2.json'));
        await provider.SyncEvents({ Target: ORGANIZER, ...WINDOW });

        const start = encodeURIComponent('2026-10-01T00:00:00.000Z');
        const end = encodeURIComponent('2026-11-01T00:00:00.000Z');
        expect(calls[0].path).toBe(`${GRAPH}/${encodeURIComponent('organizer@contoso.com')}/calendarView/delta?startDateTime=${start}&endDateTime=${end}`);
        expect(calls[0].headers.Prefer).toBe('outlook.timezone="UTC"');
    });

    it('follows nextLink to the deltaLink, which becomes the next token', async () => {
        const page1 = fixture<{ '@odata.nextLink': string }>('graph-delta-page-1.json');
        const page2 = fixture<{ '@odata.deltaLink': string }>('graph-delta-page-2.json');
        queue.push(page1, page2);
        const result = await provider.SyncEvents({ Target: ORGANIZER, ...WINDOW });

        expect(calls[1].path).toBe(page1['@odata.nextLink']);
        expect(result.Success).toBe(true);
        expect(result.NextSyncToken).toBe(page2['@odata.deltaLink']);
    });

    it('reports a moved time, changed RSVPs and a deletion as changes', async () => {
        queue.push(fixture('graph-delta-page-1.json'), fixture('graph-delta-page-2.json'), graphError(404, 'ErrorItemNotFound'));
        const result = await provider.SyncEvents({ Target: ORGANIZER, ...WINDOW });

        expect(result.Changes.map((c) => c.Kind)).toEqual(['Upserted', 'Upserted', 'Removed']);
        const moved = result.Changes[0].Event;
        expect(moved?.ICalUID).toBe(CREATED.iCalUId);
        expect(moved?.Start).toEqual(new Date('2026-10-20T16:00:00Z'));
        expect(result.Changes[1].Event?.Attendees.find((a) => a.Email === 'grace@fabrikam.com')?.Response).toBe('Declined');
        expect(result.Changes[2]).toEqual({ Kind: 'Removed', ExternalEventID: 'AAMkAGI1AGU4LTk4ZmEtNDhkMy1iYTU2LTQ5NzEwNjc5NTA2NgBGAAAAAAAt9AHlAAA=' });
    });

    /**
     * Graph also lists under `@removed` an event changed or moved OUTSIDE the window. Read as a
     * deletion, a meeting rescheduled past the window would be cancelled in MJ. The provider reads
     * the event: still there is an upsert, and only a 404 stays a removal.
     */
    it('reads each tombstone, and reports one whose event still exists as an upsert', async () => {
        const moved = { ...CREATED, start: { dateTime: '2027-12-01T15:00:00.0000000', timeZone: 'UTC' } };
        queue.push(fixture('graph-delta-page-1.json'), fixture('graph-delta-page-2.json'), moved);
        const result = await provider.SyncEvents({ Target: ORGANIZER, ...WINDOW });

        const removedID = 'AAMkAGI1AGU4LTk4ZmEtNDhkMy1iYTU2LTQ5NzEwNjc5NTA2NgBGAAAAAAAt9AHlAAA=';
        expect(calls[2]).toMatchObject({ method: 'get', path: `${GRAPH}/${encodeURIComponent('organizer@contoso.com')}/events/${encodeURIComponent(removedID)}` });
        expect(calls[2].headers.Prefer).toBe('outlook.timezone="UTC"');
        expect(result.Changes[2].Kind).toBe('Upserted');
        expect(result.Changes[2].ExternalEventID).toBe(removedID);
        expect(result.Changes[2].Event?.Start).toEqual(new Date('2027-12-01T15:00:00Z'));
    });

    it('fails the whole sync when a tombstone cannot be read, so its token is not stored', async () => {
        queue.push(fixture('graph-delta-page-1.json'), fixture('graph-delta-page-2.json'), graphError(503, 'ServiceUnavailable'));
        const result = await provider.SyncEvents({ Target: ORGANIZER, ...WINDOW });
        expect(result.Success).toBe(false);
        expect(result.NextSyncToken).toBeUndefined();
    });

    it('requests a stored token verbatim and ignores the window', async () => {
        const token = `${GRAPH}/organizer%40contoso.com/calendarView/delta?$deltatoken=abc`;
        queue.push(fixture('graph-delta-page-2.json'));
        await provider.SyncEvents({ Target: ORGANIZER, SyncToken: token, ...WINDOW });
        expect(calls[0].path).toBe(token);
    });

    it('refuses a full sync with no window', async () => {
        const result = await provider.SyncEvents({ Target: ORGANIZER });
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('needs WindowStart and WindowEnd');
        expect(calls).toHaveLength(0);
    });

    /** Graph answers an expired delta token with 410 Gone; the caller must drop it and start over. */
    it('asks for a resync when Graph refuses the token as gone', async () => {
        queue.push(graphError(410, 'SyncStateNotFound'));
        const result = await provider.SyncEvents({ Target: ORGANIZER, SyncToken: `${GRAPH}/x/calendarView/delta?$deltatoken=old` });
        expect(result.Success).toBe(false);
        expect(result.ResyncRequired).toBe(true);
        expect(result.Changes).toEqual([]);
    });

    it('does not ask for a resync for other failures', async () => {
        queue.push(graphError(503, 'ServiceUnavailable'));
        const result = await provider.SyncEvents({ Target: ORGANIZER, SyncToken: 'https://graph.microsoft.com/v1.0/x' });
        expect(result.ResyncRequired).toBe(false);
    });

    it('returns nothing when the stream ends without a deltaLink, so no half-read is applied', async () => {
        queue.push({ value: [{ id: 'a' }] });
        const result = await provider.SyncEvents({ Target: ORGANIZER, ...WINDOW });
        expect(result.Success).toBe(false);
        expect(result.Changes).toEqual([]);
    });
});

describe('a caller-supplied access token', () => {
    it('authenticates with the token and needs no client secret', async () => {
        queue.push(CREATED);
        const result = await provider.GetEvent(
            { Target: ORGANIZER, ExternalEventID: 'x' },
            { accessToken: 'bot-token', disableEnvironmentFallback: true }
        );

        expect(result.Success).toBe(true);
        const options = initWithMiddleware.mock.calls[0][0] as { authProvider: { getAccessToken: () => Promise<string> } };
        await expect(options.authProvider.getAccessToken()).resolves.toBe('bot-token');
    });

    /** The opt-in pin: a caller that never passes a token gets the client-secret client it always got. */
    it('without one, authenticates with the client secret exactly as before', async () => {
        queue.push({ value: [] });
        await provider.GetEvents({ Identifier: 'rep@contoso.com', NumEvents: 5 }, { tenantId: 'other-tenant', clientId: 'other-client', clientSecret: 'secret' });
        const options = initWithMiddleware.mock.calls[0][0] as { authProvider: object };
        expect('getAccessToken' in options.authProvider).toBe(false);
    });

    it('without one, still demands the client secret when env fallback is off', async () => {
        const result = await provider.GetEvent({ Target: ORGANIZER, ExternalEventID: 'x' }, { disableEnvironmentFallback: true });
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('Missing required credential');
    });
});
