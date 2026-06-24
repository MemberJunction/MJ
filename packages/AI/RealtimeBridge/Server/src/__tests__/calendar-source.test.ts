import { describe, it, expect, vi } from 'vitest';
import {
    CalendarSourceNotBoundError,
    GraphCalendarSource,
    GoogleCalendarSource,
    IGraphCalendarLike,
    IGoogleCalendarLike,
    GraphEventPage,
    GoogleEventPage,
    GraphCalendarEvent,
    GoogleCalendarEvent,
    GoogleListEventsArgs,
    normalizeGraphEvent,
    parseGraphDateTime,
    extractGraphJoinUrl,
    mapGraphResponseStatus,
    normalizeGoogleEvent,
    parseGoogleDateTime,
    extractGoogleJoinUrl,
    mapGoogleResponseStatus,
} from '../calendar-source';

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures.
// ──────────────────────────────────────────────────────────────────────────────

const TEAMS_JOIN_URL =
    'https://teams.microsoft.com/l/meetup-join/19%3Ameeting_X%40thread.v2/0?context=%7B%7D';
const MEET_JOIN_URL = 'https://meet.google.com/abc-defg-hij';

function graphEvent(overrides: Partial<GraphCalendarEvent> = {}): GraphCalendarEvent {
    return {
        id: 'evt-1',
        subject: 'Standup',
        onlineMeeting: { joinUrl: TEAMS_JOIN_URL },
        start: { dateTime: '2026-06-25T15:00:00.0000000', timeZone: 'UTC' },
        end: { dateTime: '2026-06-25T15:30:00.0000000', timeZone: 'UTC' },
        attendees: [
            { emailAddress: { address: 'sage@customer.com', name: 'Sage' }, status: { response: 'accepted' } },
            { emailAddress: { address: 'human@customer.com' }, status: { response: 'notResponded' } },
        ],
        organizer: { emailAddress: { address: 'human@customer.com', name: 'Human' } },
        ...overrides,
    };
}

function googleEvent(overrides: Partial<GoogleCalendarEvent> = {}): GoogleCalendarEvent {
    return {
        id: 'gevt-1',
        summary: 'Sync',
        conferenceData: { entryPoints: [{ entryPointType: 'video', uri: MEET_JOIN_URL }] },
        start: { dateTime: '2026-06-25T15:00:00-07:00' },
        end: { dateTime: '2026-06-25T15:30:00-07:00' },
        attendees: [
            { email: 'sage@customer.com', displayName: 'Sage', responseStatus: 'accepted' },
            { email: 'human@customer.com', responseStatus: 'needsAction' },
        ],
        organizer: { email: 'human@customer.com', displayName: 'Human' },
        ...overrides,
    };
}

/** A fake Graph surface that yields preset pages in order, recording the cursors it was called with. */
function fakeGraph(pages: GraphEventPage[]): { surface: IGraphCalendarLike; cursors: (string | undefined)[] } {
    const cursors: (string | undefined)[] = [];
    let i = 0;
    return {
        cursors,
        surface: {
            listEvents: vi.fn(async (_userId: string, cursor?: string) => {
                cursors.push(cursor);
                return pages[Math.min(i++, pages.length - 1)];
            }),
        },
    };
}

/** A fake Google surface that yields preset pages in order, recording the args it was called with. */
function fakeGoogle(pages: GoogleEventPage[]): {
    surface: IGoogleCalendarLike;
    calls: GoogleListEventsArgs[];
} {
    const calls: GoogleListEventsArgs[] = [];
    let i = 0;
    return {
        calls,
        surface: {
            listEvents: vi.fn(async (args: GoogleListEventsArgs) => {
                calls.push(args);
                return pages[Math.min(i++, pages.length - 1)];
            }),
        },
    };
}

// ──────────────────────────────────────────────────────────────────────────────
// GraphCalendarSource.
// ──────────────────────────────────────────────────────────────────────────────

describe('GraphCalendarSource', () => {
    describe('NotBound → bound transition', () => {
        it('throws CalendarSourceNotBoundError when no surface is injected', async () => {
            const source = new GraphCalendarSource();
            await expect(source.ListUpcomingInvites('sage@customer.com')).rejects.toBeInstanceOf(
                CalendarSourceNotBoundError,
            );
        });

        it('resolves invites once a surface is injected', async () => {
            const { surface } = fakeGraph([{ value: [graphEvent()], deltaLink: 'delta-1' }]);
            const source = new GraphCalendarSource(surface);
            const result = await source.ListUpcomingInvites('sage@customer.com');
            expect(result.Invites).toHaveLength(1);
        });
    });

    describe('delta paging', () => {
        it('follows @odata.nextLink across pages then captures the @odata.deltaLink cursor', async () => {
            const { surface, cursors } = fakeGraph([
                { value: [graphEvent({ id: 'a' })], nextLink: 'next-1' },
                { value: [graphEvent({ id: 'b' })], nextLink: 'next-2' },
                { value: [graphEvent({ id: 'c' })], deltaLink: 'delta-final' },
            ]);
            const source = new GraphCalendarSource(surface);
            const result = await source.ListUpcomingInvites('sage@customer.com', 'prior-delta');

            expect(result.Invites.map((i) => i.ExternalEventID)).toEqual(['a', 'b', 'c']);
            expect(result.NextCursor).toBe('delta-final');
            // First call uses the prior cursor; subsequent calls follow the in-poll nextLinks.
            expect(cursors).toEqual(['prior-delta', 'next-1', 'next-2']);
        });

        it('leaves the cursor unchanged (no NextCursor) when a page has neither next nor delta link', async () => {
            const { surface } = fakeGraph([{ value: [graphEvent()] }]);
            const source = new GraphCalendarSource(surface);
            const result = await source.ListUpcomingInvites('sage@customer.com', 'prior');
            expect(result.NextCursor).toBeUndefined();
            expect(result.Invites).toHaveLength(1);
        });
    });

    describe('event → CalendarPollResult normalization', () => {
        it('normalizes id, subject, join URL, start/end, attendees, organizer', async () => {
            const { surface } = fakeGraph([{ value: [graphEvent()], deltaLink: 'd' }]);
            const source = new GraphCalendarSource(surface);
            const { Invites } = await source.ListUpcomingInvites('sage@customer.com');
            const invite = Invites[0];

            expect(invite.ExternalEventID).toBe('evt-1');
            expect(invite.Subject).toBe('Standup');
            expect(invite.JoinUrl).toBe(TEAMS_JOIN_URL);
            expect(invite.StartTime.toISOString()).toBe('2026-06-25T15:00:00.000Z');
            expect(invite.EndTime?.toISOString()).toBe('2026-06-25T15:30:00.000Z');
            expect(invite.Attendees).toEqual([
                { Email: 'sage@customer.com', DisplayName: 'Sage', ResponseStatus: 'Accepted' },
                { Email: 'human@customer.com', ResponseStatus: 'NeedsAction' },
            ]);
            expect(invite.Organizer).toEqual({ Email: 'human@customer.com', DisplayName: 'Human' });
        });

        it('drops events with no id or no start time during paging', async () => {
            const { surface } = fakeGraph([
                {
                    value: [
                        graphEvent({ id: undefined }),
                        graphEvent({ id: 'ok', start: undefined }),
                        graphEvent({ id: 'keep' }),
                    ],
                    deltaLink: 'd',
                },
            ]);
            const source = new GraphCalendarSource(surface);
            const { Invites } = await source.ListUpcomingInvites('sage@customer.com');
            expect(Invites.map((i) => i.ExternalEventID)).toEqual(['keep']);
        });
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Graph pure helpers.
// ──────────────────────────────────────────────────────────────────────────────

describe('Graph pure helpers', () => {
    describe('parseGraphDateTime', () => {
        it('treats UTC and missing zone as UTC', () => {
            expect(parseGraphDateTime({ dateTime: '2026-06-25T15:00:00', timeZone: 'UTC' })?.toISOString()).toBe(
                '2026-06-25T15:00:00.000Z',
            );
            expect(parseGraphDateTime({ dateTime: '2026-06-25T15:00:00' })?.toISOString()).toBe(
                '2026-06-25T15:00:00.000Z',
            );
        });
        it('honors an explicit offset/Z suffix on the string', () => {
            expect(parseGraphDateTime({ dateTime: '2026-06-25T15:00:00Z' })?.toISOString()).toBe(
                '2026-06-25T15:00:00.000Z',
            );
        });
        it('returns null on absent/invalid', () => {
            expect(parseGraphDateTime(undefined)).toBeNull();
            expect(parseGraphDateTime({ dateTime: 'nope' })).toBeNull();
        });
    });

    describe('extractGraphJoinUrl', () => {
        it('prefers structured onlineMeeting.joinUrl', () => {
            expect(extractGraphJoinUrl(graphEvent())).toBe(TEAMS_JOIN_URL);
        });
        it('falls back to the legacy flat onlineMeetingUrl', () => {
            expect(
                extractGraphJoinUrl(graphEvent({ onlineMeeting: undefined, onlineMeetingUrl: TEAMS_JOIN_URL })),
            ).toBe(TEAMS_JOIN_URL);
        });
        it('extracts a meetup-join URL from the event body when no structured field exists', () => {
            const event = graphEvent({
                onlineMeeting: undefined,
                onlineMeetingUrl: undefined,
                body: { contentType: 'html', content: `<a href="${TEAMS_JOIN_URL}">Join</a>` },
            });
            expect(extractGraphJoinUrl(event)).toBe(TEAMS_JOIN_URL);
        });
        it('returns undefined for a non-online event', () => {
            expect(
                extractGraphJoinUrl(graphEvent({ onlineMeeting: undefined, onlineMeetingUrl: undefined, body: undefined })),
            ).toBeUndefined();
        });
    });

    it('mapGraphResponseStatus maps known + unknown responses', () => {
        expect(mapGraphResponseStatus('accepted')).toBe('Accepted');
        expect(mapGraphResponseStatus('organizer')).toBe('Accepted');
        expect(mapGraphResponseStatus('declined')).toBe('Declined');
        expect(mapGraphResponseStatus('tentativelyAccepted')).toBe('Tentative');
        expect(mapGraphResponseStatus('notResponded')).toBe('NeedsAction');
        expect(mapGraphResponseStatus('weird')).toBeUndefined();
    });

    it('normalizeGraphEvent omits join URL and end when absent', () => {
        const invite = normalizeGraphEvent(
            graphEvent({ onlineMeeting: undefined, onlineMeetingUrl: undefined, body: undefined, end: undefined }),
        );
        expect(invite?.JoinUrl).toBeUndefined();
        expect(invite?.EndTime).toBeUndefined();
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// GoogleCalendarSource.
// ──────────────────────────────────────────────────────────────────────────────

describe('GoogleCalendarSource', () => {
    describe('NotBound → bound transition', () => {
        it('throws CalendarSourceNotBoundError when no surface is injected', async () => {
            const source = new GoogleCalendarSource();
            await expect(source.ListUpcomingInvites('sage@customer.com')).rejects.toBeInstanceOf(
                CalendarSourceNotBoundError,
            );
        });

        it('resolves invites once a surface is injected', async () => {
            const { surface } = fakeGoogle([{ items: [googleEvent()], nextSyncToken: 'sync-1' }]);
            const source = new GoogleCalendarSource(surface);
            const result = await source.ListUpcomingInvites('sage@customer.com');
            expect(result.Invites).toHaveLength(1);
            expect(result.NextCursor).toBe('sync-1');
        });
    });

    describe('sync-token paging', () => {
        it('uses syncToken on the first call, then pageToken, then captures nextSyncToken', async () => {
            const { surface, calls } = fakeGoogle([
                { items: [googleEvent({ id: 'a' })], nextPageToken: 'page-1' },
                { items: [googleEvent({ id: 'b' })], nextPageToken: 'page-2' },
                { items: [googleEvent({ id: 'c' })], nextSyncToken: 'sync-final' },
            ]);
            const source = new GoogleCalendarSource(surface);
            const result = await source.ListUpcomingInvites('sage@customer.com', 'prior-sync');

            expect(result.Invites.map((i) => i.ExternalEventID)).toEqual(['a', 'b', 'c']);
            expect(result.NextCursor).toBe('sync-final');
            expect(calls).toEqual([
                { calendarId: 'sage@customer.com', syncToken: 'prior-sync' },
                { calendarId: 'sage@customer.com', pageToken: 'page-1' },
                { calendarId: 'sage@customer.com', pageToken: 'page-2' },
            ]);
        });

        it('omits syncToken on a first poll with no prior cursor', async () => {
            const { surface, calls } = fakeGoogle([{ items: [], nextSyncToken: 's' }]);
            const source = new GoogleCalendarSource(surface);
            await source.ListUpcomingInvites('sage@customer.com');
            expect(calls[0]).toEqual({ calendarId: 'sage@customer.com' });
        });
    });

    describe('event → CalendarPollResult normalization', () => {
        it('normalizes id, summary, join URL, start/end, attendees, organizer', async () => {
            const { surface } = fakeGoogle([{ items: [googleEvent()], nextSyncToken: 's' }]);
            const source = new GoogleCalendarSource(surface);
            const invite = (await source.ListUpcomingInvites('sage@customer.com')).Invites[0];

            expect(invite.ExternalEventID).toBe('gevt-1');
            expect(invite.Subject).toBe('Sync');
            expect(invite.JoinUrl).toBe(MEET_JOIN_URL);
            expect(invite.StartTime.toISOString()).toBe('2026-06-25T22:00:00.000Z'); // -07:00 → UTC
            expect(invite.Attendees).toEqual([
                { Email: 'sage@customer.com', DisplayName: 'Sage', ResponseStatus: 'Accepted' },
                { Email: 'human@customer.com', ResponseStatus: 'NeedsAction' },
            ]);
            expect(invite.Organizer).toEqual({ Email: 'human@customer.com', DisplayName: 'Human' });
        });

        it('drops cancelled events during paging', async () => {
            const { surface } = fakeGoogle([
                { items: [googleEvent({ id: 'gone', status: 'cancelled' }), googleEvent({ id: 'live' })], nextSyncToken: 's' },
            ]);
            const source = new GoogleCalendarSource(surface);
            const { Invites } = await source.ListUpcomingInvites('sage@customer.com');
            expect(Invites.map((i) => i.ExternalEventID)).toEqual(['live']);
        });
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Google pure helpers.
// ──────────────────────────────────────────────────────────────────────────────

describe('Google pure helpers', () => {
    describe('parseGoogleDateTime', () => {
        it('parses RFC3339 with offset', () => {
            expect(parseGoogleDateTime({ dateTime: '2026-06-25T15:00:00-07:00' })?.toISOString()).toBe(
                '2026-06-25T22:00:00.000Z',
            );
        });
        it('parses an all-day date as UTC midnight', () => {
            expect(parseGoogleDateTime({ date: '2026-06-25' })?.toISOString()).toBe('2026-06-25T00:00:00.000Z');
        });
        it('returns null on absent/invalid', () => {
            expect(parseGoogleDateTime(undefined)).toBeNull();
            expect(parseGoogleDateTime({ dateTime: 'nope' })).toBeNull();
        });
    });

    describe('extractGoogleJoinUrl', () => {
        it('prefers a video conferenceData entry point', () => {
            expect(extractGoogleJoinUrl(googleEvent())).toBe(MEET_JOIN_URL);
        });
        it('falls back to hangoutLink', () => {
            expect(extractGoogleJoinUrl(googleEvent({ conferenceData: undefined, hangoutLink: MEET_JOIN_URL }))).toBe(
                MEET_JOIN_URL,
            );
        });
        it('returns undefined when no conferencing is attached', () => {
            expect(
                extractGoogleJoinUrl(googleEvent({ conferenceData: undefined, hangoutLink: undefined })),
            ).toBeUndefined();
        });
    });

    it('mapGoogleResponseStatus maps known + unknown responses', () => {
        expect(mapGoogleResponseStatus('accepted')).toBe('Accepted');
        expect(mapGoogleResponseStatus('declined')).toBe('Declined');
        expect(mapGoogleResponseStatus('tentative')).toBe('Tentative');
        expect(mapGoogleResponseStatus('needsAction')).toBe('NeedsAction');
        expect(mapGoogleResponseStatus('mystery')).toBeUndefined();
    });

    it('normalizeGoogleEvent returns null for a cancelled event', () => {
        expect(normalizeGoogleEvent(googleEvent({ status: 'cancelled' }))).toBeNull();
    });
});
