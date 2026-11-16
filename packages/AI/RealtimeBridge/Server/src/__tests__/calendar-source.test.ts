import { describe, it, expect, vi } from 'vitest';
import type { CalendarEvent, SyncEventsParams, SyncEventsResult } from '@memberjunction/communication-types';
import {
    CalendarSourceNotBoundError,
    CalendarSyncProvider,
    CommunicationCalendarSource,
    GraphCalendarSource,
    GoogleCalendarSource,
    NormalizeCalendarEvent,
} from '../calendar-source';

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures: events as the Communication providers return them from SyncEvents.
// ──────────────────────────────────────────────────────────────────────────────

const TEAMS_JOIN_URL = 'https://teams.microsoft.com/l/meetup-join/19%3Ameeting_X%40thread.v2/0?context=%7B%7D';
const MEET_JOIN_URL = 'https://meet.google.com/abc-defg-hij';
const NOW = Date.UTC(2026, 5, 13, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

function calendarEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
    return {
        ExternalEventID: 'evt-1',
        SeriesID: null,
        ICalUID: 'uid-1',
        Subject: 'Standup',
        Body: '',
        Start: new Date('2026-06-25T15:00:00Z'),
        End: new Date('2026-06-25T15:30:00Z'),
        IsAllDay: false,
        Location: null,
        Organizer: { Email: 'human@customer.com', Name: 'Human' },
        Attendees: [
            { Email: 'sage@customer.com', Name: 'Sage', Type: 'Required', Response: 'Accepted' },
            { Email: 'human@customer.com', Type: 'Required', Response: 'None' },
        ],
        IsCancelled: false,
        OnlineMeetingUrl: TEAMS_JOIN_URL,
        LastModified: null,
        ...overrides,
    };
}

/** A provider whose SyncEvents answers from a queue and records every request. */
function fakeProvider(...answers: SyncEventsResult[]): CalendarSyncProvider & { Calls: { params: SyncEventsParams; credentials?: object }[] } {
    const calls: { params: SyncEventsParams; credentials?: object }[] = [];
    return {
        Calls: calls,
        SyncEvents: vi.fn(async (params: SyncEventsParams, credentials?: object) => {
            calls.push({ params, credentials });
            return answers.shift() ?? { Success: true, Changes: [], NextSyncToken: 'tok-end' };
        }),
    };
}

const upserted = (event: CalendarEvent) => ({ Kind: 'Upserted' as const, ExternalEventID: event.ExternalEventID, Event: event });

// ──────────────────────────────────────────────────────────────────────────────

describe.each([
    ['GraphCalendarSource', 'Microsoft Graph', (p?: CalendarSyncProvider) => new GraphCalendarSource(p)],
    ['GoogleCalendarSource', 'Google Calendar', (p?: CalendarSyncProvider) => new GoogleCalendarSource(p)],
])('%s: not bound → bound', (_name, label, make) => {
    it('throws CalendarSourceNotBoundError, naming the provider, when built with no provider', async () => {
        const source = make();
        await expect(source.ListUpcomingInvites('sage@customer.com')).rejects.toBeInstanceOf(CalendarSourceNotBoundError);
        await expect(source.ListUpcomingInvites('sage@customer.com')).rejects.toThrow(label);
    });

    it('resolves invites once given a provider', async () => {
        const source = make(fakeProvider({ Success: true, Changes: [upserted(calendarEvent())], NextSyncToken: 'tok-1' }));
        const poll = await source.ListUpcomingInvites('sage@customer.com');
        expect(poll.Invites).toHaveLength(1);
        expect(poll.NextCursor).toBe('tok-1');
    });
});

describe('polling through SyncEvents', () => {
    it('reads a forward window on the first poll, as the target identity, with the given credentials', async () => {
        const provider = fakeProvider();
        const botCredentials = { accessToken: 'bot-token', disableEnvironmentFallback: true };
        const source = new GraphCalendarSource(provider, botCredentials, { Now: () => NOW });
        await source.ListUpcomingInvites('sage@customer.com');

        expect(provider.Calls[0].params).toEqual({
            Target: { Identifier: 'sage@customer.com' },
            SyncToken: undefined,
            WindowStart: new Date(NOW),
            WindowEnd: new Date(NOW + 30 * DAY),
        });
        expect(provider.Calls[0].credentials).toBe(botCredentials);
    });

    it('honours LookaheadDays', async () => {
        const provider = fakeProvider();
        await new GraphCalendarSource(provider, undefined, { Now: () => NOW, LookaheadDays: 7 }).ListUpcomingInvites('sage@customer.com');
        expect(provider.Calls[0].params.WindowEnd).toEqual(new Date(NOW + 7 * DAY));
    });

    it('passes the cursor back as the sync token, and returns the new token as the next cursor', async () => {
        const provider = fakeProvider({ Success: true, Changes: [], NextSyncToken: 'delta-2' });
        const poll = await new GraphCalendarSource(provider).ListUpcomingInvites('sage@customer.com', 'delta-1');
        expect(provider.Calls[0].params.SyncToken).toBe('delta-1');
        expect(poll.NextCursor).toBe('delta-2');
    });

    it('leaves the cursor unchanged when the provider returns no token', async () => {
        const poll = await new GraphCalendarSource(fakeProvider({ Success: true, Changes: [] })).ListUpcomingInvites('sage@customer.com', 'delta-1');
        expect(poll.NextCursor).toBeUndefined();
    });

    it('reads Google calendars by the identity address as the calendar ID, as before', async () => {
        const provider = fakeProvider();
        await new GoogleCalendarSource(provider).ListUpcomingInvites('sage@customer.com');
        expect(provider.Calls[0].params.Target).toEqual({ Identifier: 'sage@customer.com', CalendarID: 'sage@customer.com' });
    });

    /** An expired Graph delta link or Google sync token used to throw on every poll, for good. */
    it('drops a refused cursor and reads the window again', async () => {
        const provider = fakeProvider(
            { Success: false, Changes: [], ResyncRequired: true, ErrorMessage: 'gone' },
            { Success: true, Changes: [upserted(calendarEvent())], NextSyncToken: 'fresh' }
        );
        const poll = await new GraphCalendarSource(provider).ListUpcomingInvites('sage@customer.com', 'expired');

        expect(provider.Calls.map((c) => c.params.SyncToken)).toEqual(['expired', undefined]);
        expect(poll.Invites).toHaveLength(1);
        expect(poll.NextCursor).toBe('fresh');
    });

    it('throws the provider error so the watcher logs it and moves on', async () => {
        const source = new GraphCalendarSource(fakeProvider({ Success: false, Changes: [], ErrorMessage: 'Graph calendar read failed: 403' }));
        await expect(source.ListUpcomingInvites('sage@customer.com', 'delta-1')).rejects.toThrow('403');
    });

    it('works over any provider through the base class', async () => {
        const source = new CommunicationCalendarSource(fakeProvider({ Success: true, Changes: [upserted(calendarEvent())], NextSyncToken: 't' }));
        expect((await source.ListUpcomingInvites('sage@customer.com')).Invites).toHaveLength(1);
    });
});

describe('changes → invites', () => {
    it('normalizes id, subject, join URL, start/end, attendees and organizer', async () => {
        const poll = await new GraphCalendarSource(fakeProvider({ Success: true, Changes: [upserted(calendarEvent())], NextSyncToken: 't' })).ListUpcomingInvites('sage@customer.com');
        expect(poll.Invites[0]).toEqual({
            ExternalEventID: 'evt-1',
            Subject: 'Standup',
            JoinUrl: TEAMS_JOIN_URL,
            StartTime: new Date('2026-06-25T15:00:00Z'),
            EndTime: new Date('2026-06-25T15:30:00Z'),
            Attendees: [
                { Email: 'sage@customer.com', DisplayName: 'Sage', ResponseStatus: 'Accepted' },
                { Email: 'human@customer.com', ResponseStatus: 'NeedsAction' },
            ],
            Organizer: { Email: 'human@customer.com', DisplayName: 'Human' },
        });
    });

    it('skips removed and cancelled events, and events with no id or no start', async () => {
        const poll = await new GoogleCalendarSource(
            fakeProvider({
                Success: true,
                NextSyncToken: 't',
                Changes: [
                    { Kind: 'Removed', ExternalEventID: 'gone' },
                    upserted(calendarEvent({ ExternalEventID: 'cancelled', IsCancelled: true })),
                    upserted(calendarEvent({ ExternalEventID: '' })),
                    upserted(calendarEvent({ ExternalEventID: 'no-start', Start: null })),
                    upserted(calendarEvent({ ExternalEventID: 'kept', OnlineMeetingUrl: MEET_JOIN_URL })),
                ],
            })
        ).ListUpcomingInvites('sage@customer.com');
        expect(poll.Invites.map((i) => [i.ExternalEventID, i.JoinUrl])).toEqual([['kept', MEET_JOIN_URL]]);
    });
});

describe('NormalizeCalendarEvent', () => {
    it('falls back to a meeting link in the body when the provider reports none', () => {
        const invite = NormalizeCalendarEvent(calendarEvent({ OnlineMeetingUrl: null, Body: `<p>Join: <a href="${TEAMS_JOIN_URL}">here</a></p>` }));
        expect(invite?.JoinUrl).toBe(TEAMS_JOIN_URL);
    });

    it('omits the join URL and end when absent', () => {
        const invite = NormalizeCalendarEvent(calendarEvent({ OnlineMeetingUrl: null, Body: 'no link', End: null, Subject: '' }));
        expect(invite).not.toHaveProperty('JoinUrl');
        expect(invite).not.toHaveProperty('EndTime');
        expect(invite).not.toHaveProperty('Subject');
    });

    it('extracts join URLs wrapped in parentheses, markdown links, trailing punctuation, or HTML quote entities while rejecting embedded-host redirects', () => {
        expect(NormalizeCalendarEvent(calendarEvent({ OnlineMeetingUrl: null, Body: `Join (${MEET_JOIN_URL}).` }))?.JoinUrl).toBe(MEET_JOIN_URL);
        expect(NormalizeCalendarEvent(calendarEvent({ OnlineMeetingUrl: null, Body: `[Join call](${TEAMS_JOIN_URL});` }))?.JoinUrl).toBe(TEAMS_JOIN_URL);
        expect(NormalizeCalendarEvent(calendarEvent({ OnlineMeetingUrl: null, Body: `href=&quot;https://us02web.zoom.us/j/12345?pwd=abc&quot;` }))?.JoinUrl).toBe(
            'https://us02web.zoom.us/j/12345?pwd=abc'
        );
        expect(NormalizeCalendarEvent(calendarEvent({ OnlineMeetingUrl: null, Body: `href=&#34;${MEET_JOIN_URL}&#34;!` }))?.JoinUrl).toBe(MEET_JOIN_URL);
        expect(
            NormalizeCalendarEvent(calendarEvent({ OnlineMeetingUrl: null, Body: `https://evil.example/redirect?url=${MEET_JOIN_URL}` }))
        ).not.toHaveProperty('JoinUrl');
    });

    it('maps attendee responses, with None read as NeedsAction', () => {
        const invite = NormalizeCalendarEvent(
            calendarEvent({
                Attendees: [
                    { Email: 'a@x.com', Type: 'Required', Response: 'Accepted' },
                    { Email: 'b@x.com', Type: 'Required', Response: 'Tentative' },
                    { Email: 'c@x.com', Type: 'Optional', Response: 'Declined' },
                    { Email: 'd@x.com', Type: 'Optional', Response: 'None' },
                ],
            })
        );
        expect(invite?.Attendees.map((a) => a.ResponseStatus)).toEqual(['Accepted', 'Tentative', 'Declined', 'NeedsAction']);
    });
});
