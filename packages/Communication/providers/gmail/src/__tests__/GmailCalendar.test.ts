/**
 * Google Calendar on the Gmail provider, against recorded Calendar API payloads
 * (`fixtures/*.json`, the shapes `events.insert` and `events.list` return).
 *
 * googleapis is replaced: the calendar client's `events` methods are spies that answer from the
 * fixtures, so each test checks both the request sent and the result returned.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import googleApis from 'googleapis';

type GoogleEvent = googleApis.calendar_v3.Schema$Event;

const { events, calendarFactory } = vi.hoisted(() => {
    const events = {
        insert: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
        get: vi.fn(),
        list: vi.fn(),
    };
    return { events, calendarFactory: vi.fn().mockReturnValue({ events }) };
});

vi.mock('@memberjunction/communication-types', async () => ({
    BaseCommunicationProvider: class {
        getSupportedOperations() {
            return [];
        }
    },
    resolveCredentialValue: (requestVal: string | undefined, envVal: string | undefined, disableFallback: boolean) => {
        if (requestVal) return requestVal;
        if (!disableFallback && envVal) return envVal;
        return undefined;
    },
    validateRequiredCredentials: (creds: Record<string, string | undefined>, required: string[], provider: string) => {
        for (const key of required) {
            if (!creds[key]) throw new Error(`${provider}: Missing required credential: ${key}`);
        }
    },
    // The real calendar helpers, from source (typed structurally so that file stays out of this
    // package's TS program): the Target check and the wall-clock conversion are under test here.
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
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
vi.mock('env-var', () => {
    const envMap: Record<string, string> = {
        GMAIL_CLIENT_ID: 'env-client-id',
        GMAIL_CLIENT_SECRET: 'env-client-secret',
        GMAIL_REDIRECT_URI: 'http://localhost:3000/callback',
        GMAIL_REFRESH_TOKEN: 'env-refresh-token',
    };
    return { default: { get: (key: string) => ({ default: (def: string) => ({ asString: () => envMap[key] ?? def }) }) } };
});
vi.mock('googleapis', () => {
    class FakeOAuth2 {
        setCredentials = vi.fn();
    }
    return { default: { google: { auth: { OAuth2: FakeOAuth2 }, gmail: vi.fn().mockReturnValue({ users: {} }), calendar: calendarFactory } } };
});

import { GmailProvider } from '../GmailProvider';

function fixture<T>(name: string): T {
    return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
}

/** What an untyped caller (plain JS, a JSON payload) can send: the type system cannot stop it, so the provider must. */
const NO_TARGET = undefined as never;
const ACCOUNT = { Identifier: 'organizer@example.org' };
const INSERTED = fixture<GoogleEvent>('google-event-inserted.json');
const MEETING = {
    Subject: 'Board planning',
    Body: '<p>Agenda attached.</p>',
    Start: new Date('2026-10-20T14:00:00Z'),
    End: new Date('2026-10-20T15:00:00Z'),
    TimeZone: 'America/New_York',
    Location: 'Room 4',
    IsOnlineMeeting: true,
    Attendees: [
        { Email: 'ada@example.org', Name: 'Ada Lovelace', Type: 'Required' as const },
        { Email: 'grace@example.com', Type: 'Optional' as const },
    ],
};

function gaxiosError(status: number): Error {
    return Object.assign(new Error(`Request failed with status code ${status}`), { code: status, response: { status } });
}

let provider: GmailProvider;
beforeEach(() => {
    vi.clearAllMocks();
    calendarFactory.mockReturnValue({ events });
    provider = new GmailProvider();
});

describe('capability', () => {
    it('reports the five calendar operations beside the mail ones', () => {
        expect(provider.getSupportedOperations()).toEqual(
            expect.arrayContaining(['SendSingleMessage', 'CreateEvent', 'UpdateEvent', 'CancelEvent', 'GetEvent', 'SyncEvents'])
        );
    });

    it('builds the calendar client only when a calendar call is made, on the same OAuth2 client', async () => {
        expect(calendarFactory).not.toHaveBeenCalled();
        events.get.mockResolvedValue({ data: INSERTED });
        await provider.GetEvent({ Target: ACCOUNT, ExternalEventID: 'x' });
        await provider.GetEvent({ Target: ACCOUNT, ExternalEventID: 'x' });
        expect(calendarFactory).toHaveBeenCalledTimes(1);
        expect(calendarFactory.mock.calls[0][0]).toMatchObject({ version: 'v3' });
    });
});

describe('the target is required on every calendar call', () => {
    it.each([
        ['CreateEvent', () => provider.CreateEvent({ Target: NO_TARGET, Event: MEETING })],
        ['UpdateEvent', () => provider.UpdateEvent({ Target: { Identifier: '' }, ExternalEventID: 'e', Changes: {} })],
        ['CancelEvent', () => provider.CancelEvent({ Target: NO_TARGET, ExternalEventID: 'e' })],
        ['GetEvent', () => provider.GetEvent({ Target: { Identifier: '  ' }, ExternalEventID: 'e' })],
        ['SyncEvents', () => provider.SyncEvents({ Target: NO_TARGET })],
    ])('%s is refused with no request sent', async (operation, call) => {
        const result = await call();
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain(`${operation} needs a Target`);
        expect(Object.values(events).every((spy) => spy.mock.calls.length === 0)).toBe(true);
    });
});

describe('CreateEvent', () => {
    it('inserts into the calendar the target names (its primary, for the account itself), sends invitations to the attendees, and asks for a Meet link', async () => {
        events.insert.mockResolvedValue({ data: INSERTED });
        await provider.CreateEvent({ Target: ACCOUNT, Event: MEETING });

        const request = events.insert.mock.calls[0][0];
        expect(request).toMatchObject({ calendarId: 'organizer@example.org', sendUpdates: 'all', conferenceDataVersion: 1 });
        expect(request.requestBody).toMatchObject({
            summary: 'Board planning',
            description: '<p>Agenda attached.</p>',
            location: 'Room 4',
            start: { dateTime: '2026-10-20T14:00:00.000Z', timeZone: 'America/New_York' },
            end: { dateTime: '2026-10-20T15:00:00.000Z', timeZone: 'America/New_York' },
            attendees: [
                { email: 'ada@example.org', displayName: 'Ada Lovelace' },
                { email: 'grace@example.com', optional: true },
            ],
            conferenceData: { createRequest: { conferenceSolutionKey: { type: 'hangoutsMeet' } } },
        });
        expect(request.requestBody.conferenceData.createRequest.requestId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('returns the event with its iCalendar UID, attendee responses and the Meet link', async () => {
        events.insert.mockResolvedValue({ data: INSERTED });
        const result = await provider.CreateEvent({ Target: ACCOUNT, Event: MEETING });

        expect(result.Success).toBe(true);
        expect(result.Event).toMatchObject({
            ExternalEventID: '7cbh8rpc10lrc0ckih9tafss99',
            ICalUID: '7cbh8rpc10lrc0ckih9tafss99@google.com',
            Start: new Date('2026-10-20T14:00:00Z'),
            End: new Date('2026-10-20T15:00:00Z'),
            Organizer: { Email: 'organizer@example.org', Name: 'Org Anizer' },
            OnlineMeetingUrl: 'https://meet.google.com/abc-defg-hij',
            IsAllDay: false,
        });
        expect(result.Event?.Attendees.map((a) => [a.Email, a.Type, a.Response])).toEqual([
            ['organizer@example.org', 'Required', 'Accepted'],
            ['ada@example.org', 'Required', 'None'],
            ['grace@example.com', 'Optional', 'None'],
        ]);
    });

    it('uses the named calendar and sends no conference request when none is asked for', async () => {
        events.insert.mockResolvedValue({ data: INSERTED });
        await provider.CreateEvent({ Target: { ...ACCOUNT, CalendarID: 'team@group.calendar.google.com' }, Event: { ...MEETING, IsOnlineMeeting: false } });
        const request = events.insert.mock.calls[0][0];
        expect(request.calendarId).toBe('team@group.calendar.google.com');
        expect(request.conferenceDataVersion).toBeUndefined();
        expect(request.requestBody.conferenceData).toBeUndefined();
    });

    it('sends an all-day event as calendar days in its zone', async () => {
        events.insert.mockResolvedValue({ data: INSERTED });
        const allDay = { Subject: 'Offsite', Start: new Date('2026-10-20T02:00:00Z'), End: new Date('2026-10-21T02:00:00Z'), TimeZone: 'America/New_York', IsAllDay: true };
        await provider.CreateEvent({ Target: ACCOUNT, Event: allDay });
        expect(events.insert.mock.calls[0][0].requestBody).toMatchObject({ start: { date: '2026-10-19' }, end: { date: '2026-10-20' } });
        expect(events.insert.mock.calls[0][0].requestBody.start).toEqual({ date: '2026-10-19' }); // an insert sends no null forms
    });

    /**
     * The refresh token decides the account. Writing to 'primary' would put a meeting for anyone the
     * caller names into the token owner's calendar; the target's address as calendarId cannot.
     */
    it('never falls back to the token owner\'s primary calendar for another address', async () => {
        events.insert.mockResolvedValue({ data: INSERTED });
        await provider.CreateEvent({ Target: { Identifier: ' someone.else@example.org ' }, Event: MEETING });
        expect(events.insert.mock.calls[0][0].calendarId).toBe('someone.else@example.org');
    });

    it('reports a missing calendar scope as a failure', async () => {
        events.insert.mockRejectedValue(gaxiosError(403));
        const result = await provider.CreateEvent({ Target: ACCOUNT, Event: MEETING });
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('CreateEvent failed for organizer@example.org');
    });
});

describe('UpdateEvent', () => {
    /** A patch merges into the stored start/end, so switching form must clear the other one. */
    it('clears the other form when an event switches between all-day and timed', async () => {
        events.patch.mockResolvedValue({ data: INSERTED });
        await provider.UpdateEvent({
            Target: ACCOUNT,
            ExternalEventID: 'evt1',
            Changes: { IsAllDay: true, TimeZone: 'UTC', Start: new Date('2026-10-20T00:00:00Z'), End: new Date('2026-10-21T00:00:00Z') },
        });
        await provider.UpdateEvent({
            Target: ACCOUNT,
            ExternalEventID: 'evt1',
            Changes: { IsAllDay: false, TimeZone: 'UTC', Start: new Date('2026-10-20T14:00:00Z'), End: new Date('2026-10-20T15:00:00Z') },
        });
        expect(events.patch.mock.calls[0][0].requestBody.start).toEqual({ date: '2026-10-20', dateTime: null, timeZone: null });
        expect(events.patch.mock.calls[1][0].requestBody.start).toEqual({ date: null, dateTime: '2026-10-20T14:00:00.000Z', timeZone: 'UTC' });
    });

    it('refuses a time change that does not say whether it is all-day and in which zone', async () => {
        const result = await provider.UpdateEvent({ Target: ACCOUNT, ExternalEventID: 'evt1', Changes: { End: new Date('2026-10-20T15:00:00Z') } });
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/must also carry IsAllDay and TimeZone/);
        expect(events.patch).not.toHaveBeenCalled();
    });

    it('patches only the changed fields and tells attendees', async () => {
        events.patch.mockResolvedValue({ data: INSERTED });
        await provider.UpdateEvent({ Target: ACCOUNT, ExternalEventID: 'evt1', Changes: { Location: 'Room 9' } });
        expect(events.patch.mock.calls[0][0]).toEqual({ calendarId: 'organizer@example.org', eventId: 'evt1', sendUpdates: 'all', requestBody: { location: 'Room 9' } });
    });
});

describe('CancelEvent', () => {
    it('deletes the event and sends the cancellation to attendees', async () => {
        events.delete.mockResolvedValue({ data: '' });
        const result = await provider.CancelEvent({ Target: ACCOUNT, ExternalEventID: 'evt1', Comment: 'not sent: Google has no comment' });
        expect(result.Success).toBe(true);
        expect(events.delete.mock.calls[0][0]).toEqual({ calendarId: 'organizer@example.org', eventId: 'evt1', sendUpdates: 'all' });
    });

    it.each([404, 410])('treats an event that is already gone (%i) as cancelled', async (status) => {
        events.delete.mockRejectedValue(gaxiosError(status));
        const result = await provider.CancelEvent({ Target: ACCOUNT, ExternalEventID: 'gone' });
        expect(result.Success).toBe(true);
    });
});

describe('SyncEvents', () => {
    const WINDOW = { WindowStart: new Date('2026-10-01T00:00:00Z'), WindowEnd: new Date('2026-11-01T00:00:00Z') };

    it('runs a full sync of the window with recurring events expanded', async () => {
        events.list.mockResolvedValueOnce({ data: fixture('google-sync-page-1.json') }).mockResolvedValueOnce({ data: fixture('google-sync-page-2.json') });
        await provider.SyncEvents({ Target: ACCOUNT, ...WINDOW });
        expect(events.list.mock.calls[0][0]).toEqual({
            calendarId: 'organizer@example.org',
            singleEvents: true,
            timeMin: '2026-10-01T00:00:00.000Z',
            timeMax: '2026-11-01T00:00:00.000Z',
        });
    });

    it('follows page tokens to the sync token, keeping the same parameters on every page', async () => {
        const page1 = fixture<{ nextPageToken: string }>('google-sync-page-1.json');
        events.list.mockResolvedValueOnce({ data: page1 }).mockResolvedValueOnce({ data: fixture('google-sync-page-2.json') });
        const result = await provider.SyncEvents({ Target: ACCOUNT, SyncToken: 'CPDAold=', ...WINDOW });

        expect(events.list.mock.calls[0][0]).toEqual({ calendarId: 'organizer@example.org', singleEvents: true, syncToken: 'CPDAold=' });
        expect(events.list.mock.calls[1][0]).toEqual({ calendarId: 'organizer@example.org', singleEvents: true, syncToken: 'CPDAold=', pageToken: page1.nextPageToken });
        expect(result.NextSyncToken).toBe('CPDAlvWDx70CEPDAlvWDx70CGAUggICA6NKw8wI=');
    });

    it('reports a moved time, changed RSVPs and a cancellation as changes', async () => {
        events.list.mockResolvedValueOnce({ data: fixture('google-sync-page-1.json') }).mockResolvedValueOnce({ data: fixture('google-sync-page-2.json') });
        const result = await provider.SyncEvents({ Target: ACCOUNT, SyncToken: 'CPDAold=' });

        expect(result.Success).toBe(true);
        expect(result.Changes.map((c) => c.Kind)).toEqual(['Upserted', 'Upserted', 'Removed']);
        expect(result.Changes[0].Event?.ICalUID).toBe(INSERTED.iCalUID);
        expect(result.Changes[0].Event?.Start).toEqual(new Date('2026-10-20T16:00:00Z'));
        const responses = result.Changes[1].Event?.Attendees.map((a) => [a.Email, a.Response]);
        expect(responses).toEqual([
            ['organizer@example.org', 'Accepted'],
            ['ada@example.org', 'Accepted'],
            ['alan@example.org', 'Tentative'],
            ['grace@example.com', 'Declined'],
        ]);
        expect(result.Changes[1].Event?.SeriesID).toBe('4p1mdkjvo9kq3c1oe8b6qoh3l8');
        expect(result.Changes[2]).toEqual({ Kind: 'Removed', ExternalEventID: '0q9u3fh2c1v7o8r4k6b5e7m1a2' });
    });

    /** Google answers an expired sync token with 410 Gone; the caller must drop it and run a full sync. */
    it('asks for a resync when Google refuses the token as gone', async () => {
        events.list.mockRejectedValue(gaxiosError(410));
        const result = await provider.SyncEvents({ Target: ACCOUNT, SyncToken: 'expired' });
        expect(result.Success).toBe(false);
        expect(result.ResyncRequired).toBe(true);
    });

    it('does not ask for a resync for a 410 on a full sync, or for other failures', async () => {
        events.list.mockRejectedValue(gaxiosError(410));
        expect((await provider.SyncEvents({ Target: ACCOUNT, ...WINDOW })).ResyncRequired).toBe(false);
        events.list.mockRejectedValue(gaxiosError(500));
        expect((await provider.SyncEvents({ Target: ACCOUNT, SyncToken: 't' })).ResyncRequired).toBe(false);
    });

    it('returns nothing when the last page carries no sync token, so no half-read is applied', async () => {
        events.list.mockResolvedValue({ data: { items: [INSERTED] } });
        const result = await provider.SyncEvents({ Target: ACCOUNT, ...WINDOW });
        expect(result.Success).toBe(false);
        expect(result.Changes).toEqual([]);
    });
});
