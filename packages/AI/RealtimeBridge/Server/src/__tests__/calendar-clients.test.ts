import { describe, it, expect } from 'vitest';
import {
    GraphCalendarClient,
    GoogleCalendarClient,
    type GraphCalendarModuleLike,
    type GraphCalendarClientLike,
    type GraphCalendarRequestLike,
    type GoogleApisModuleLike,
    type GoogleCalendarClientLike,
} from '../calendar-clients';

// ──────────────────────────────────────────────────────────────────────────────
// Microsoft Graph calendar client.
// ──────────────────────────────────────────────────────────────────────────────

/** A fake Graph client that records every requested path + header and replays canned pages. */
function fakeGraphModule(pages: unknown[]): { module: GraphCalendarModuleLike; paths: string[]; headers: Array<[string, string]> } {
    const paths: string[] = [];
    const headers: Array<[string, string]> = [];
    let call = 0;
    const request = (path: string): GraphCalendarRequestLike => ({
        header(name, value) {
            headers.push([name, value]);
            return this;
        },
        async get() {
            paths.push(path);
            return pages[call++];
        },
    });
    const client: GraphCalendarClientLike = { api: (path) => request(path) };
    return { module: { Client: { init: () => client } }, paths, headers };
}

describe('GraphCalendarClient', () => {
    it('builds a UTC calendarView/delta window on the first poll and sets the UTC timezone preference', async () => {
        const { module, paths, headers } = fakeGraphModule([
            { value: [{ id: 'e1', start: { dateTime: '2026-07-01T15:00:00', timeZone: 'UTC' }, attendees: [] }], '@odata.deltaLink': 'DELTA-1' },
        ]);
        const client = new GraphCalendarClient({
            Credentials: { AccessToken: 'tok' },
            ModuleLoader: async () => module,
            Now: new Date('2026-06-28T00:00:00Z'),
            LookaheadDays: 10,
        });

        const page = await client.listEvents('sage@customer.com');

        expect(paths[0]).toContain('/users/sage%40customer.com/calendarView/delta');
        expect(paths[0]).toContain('startDateTime=2026-06-28T00%3A00%3A00.000Z');
        expect(paths[0]).toContain('endDateTime=2026-07-08T00%3A00%3A00.000Z');
        expect(headers).toContainEqual(['Prefer', 'outlook.timezone="UTC"']);
        expect(page.value).toHaveLength(1);
        expect(page.deltaLink).toBe('DELTA-1');
    });

    it('requests an opaque cursor verbatim (no first-poll window) on a subsequent poll', async () => {
        const { module, paths } = fakeGraphModule([{ value: [], '@odata.deltaLink': 'DELTA-2' }]);
        const client = new GraphCalendarClient({ Credentials: { AccessToken: 'tok' }, ModuleLoader: async () => module });

        const page = await client.listEvents('sage@customer.com', 'https://graph.microsoft.com/v1.0/delta?$skiptoken=ABC');

        expect(paths[0]).toBe('https://graph.microsoft.com/v1.0/delta?$skiptoken=ABC');
        expect(page.deltaLink).toBe('DELTA-2');
    });

    it('surfaces @odata.nextLink as the in-poll continuation cursor', async () => {
        const { module } = fakeGraphModule([{ value: [], '@odata.nextLink': 'NEXT-1' }]);
        const client = new GraphCalendarClient({ Credentials: { AccessToken: 'tok' }, ModuleLoader: async () => module });

        const page = await client.listEvents('sage@customer.com', 'cursor');

        expect(page.nextLink).toBe('NEXT-1');
        expect(page.deltaLink).toBeUndefined();
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// Google Calendar client.
// ──────────────────────────────────────────────────────────────────────────────

/** A fake googleapis module recording every events.list params object and replaying canned pages. */
function fakeGoogleModule(pages: unknown[]): { module: GoogleApisModuleLike; calls: Array<Record<string, unknown>> } {
    const calls: Array<Record<string, unknown>> = [];
    let call = 0;
    const client: GoogleCalendarClientLike = {
        events: {
            async list(params) {
                calls.push(params);
                return { data: pages[call++] };
            },
        },
    };
    return { module: { google: { calendar: () => client } }, calls };
}

describe('GoogleCalendarClient', () => {
    it('sends a forward window + singleEvents on the first poll and captures the sync token', async () => {
        const { module, calls } = fakeGoogleModule([
            { items: [{ id: 'g1', start: { dateTime: '2026-07-01T15:00:00Z' }, attendees: [] }], nextSyncToken: 'SYNC-1' },
        ]);
        const client = new GoogleCalendarClient({
            Auth: {},
            ModuleLoader: async () => module,
            Now: new Date('2026-06-28T00:00:00Z'),
            LookaheadDays: 10,
        });

        const page = await client.listEvents({ calendarId: 'sage@customer.com' });

        expect(calls[0]).toMatchObject({
            calendarId: 'sage@customer.com',
            timeMin: '2026-06-28T00:00:00.000Z',
            timeMax: '2026-07-08T00:00:00.000Z',
            singleEvents: true,
            orderBy: 'startTime',
        });
        expect(page.items).toHaveLength(1);
        expect(page.nextSyncToken).toBe('SYNC-1');
    });

    it('passes a sync token alone (no window) on an incremental poll', async () => {
        const { module, calls } = fakeGoogleModule([{ items: [], nextSyncToken: 'SYNC-2' }]);
        const client = new GoogleCalendarClient({ Auth: {}, ModuleLoader: async () => module });

        await client.listEvents({ calendarId: 'sage@customer.com', syncToken: 'SYNC-1' });

        expect(calls[0]).toEqual({ calendarId: 'sage@customer.com', syncToken: 'SYNC-1' });
    });

    it('passes a page token alone for in-poll continuation', async () => {
        const { module, calls } = fakeGoogleModule([{ items: [], nextPageToken: 'PAGE-2' }]);
        const client = new GoogleCalendarClient({ Auth: {}, ModuleLoader: async () => module });

        const page = await client.listEvents({ calendarId: 'sage@customer.com', pageToken: 'PAGE-1' });

        expect(calls[0]).toEqual({ calendarId: 'sage@customer.com', pageToken: 'PAGE-1' });
        expect(page.nextPageToken).toBe('PAGE-2');
    });
});
