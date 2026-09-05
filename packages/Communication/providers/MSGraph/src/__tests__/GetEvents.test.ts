/**
 * Calendar retrieval on the MS Graph provider.
 *
 * WHY THESE ARE MOSTLY ABOUT WHICH ENDPOINT WAS CALLED. Graph exposes calendar data two ways that
 * return materially different things from the same calendar:
 *
 *   /calendarView  needs a window, and EXPANDS a recurring series into one entry per occurrence
 *   /events        needs no window, and returns the series MASTER - one row whose start time is
 *                  whenever the series began
 *
 * A caller logging what actually happened wants occurrences. One that received masters instead gets
 * a plausible-looking result with the wrong count and wrong times, and nothing in the payload says
 * which it received - a series master and a single occurrence look alike. So the endpoint choice is
 * driven by the window and REPORTED back as `RecurrenceExpanded`, and these tests pin both halves.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/communication-types', () => ({
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
    validateRequiredCredentials: (creds: Record<string, unknown>, required: string[], provider: string) => {
        for (const key of required) {
            if (!creds[key]) throw new Error(`${provider}: Missing required credential: ${key}`);
        }
    },
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/core', () => ({ LogError: vi.fn(), LogStatus: vi.fn() }));

vi.mock('env-var', () => {
    const envMap: Record<string, string> = {
        AZURE_CLIENT_ID: 'env-client-id',
        AZURE_CLIENT_SECRET: 'env-client-secret',
        AZURE_TENANT_ID: 'env-tenant-id',
        AZURE_ACCOUNT_EMAIL: 'test@example.com',
        AZURE_ACCOUNT_ID: 'env-user-id',
        AZURE_AAD_ENDPOINT: 'https://login.microsoftonline.com',
        AZURE_GRAPH_ENDPOINT: 'https://graph.microsoft.com',
    };
    return {
        default: { get: (key: string) => ({ default: (def: string) => ({ asString: () => envMap[key] ?? def }) }) },
    };
});

vi.mock('@azure/identity', () => ({
    ClientSecretCredential: vi.fn().mockImplementation(function () {
        return { getToken: vi.fn().mockResolvedValue({ token: 'test-token' }) };
    }),
    ConfidentialClientApplication: vi.fn(),
}));

/** Records path, query, filter, orderby and top so a test can assert what Graph was actually asked. */
const { calls, setResponse, mockGraphApi } = vi.hoisted(() => {
    const calls: { path: string; query?: Record<string, string>; filter?: string; orderby?: string; top?: number }[] = [];
    const state: { response: unknown; throws: Error | null } = { response: { value: [] }, throws: null };
    const setResponse = (response: unknown, throws: Error | null = null) => {
        state.response = response;
        state.throws = throws;
    };
    const mockGraphApi = vi.fn().mockImplementation((path: string) => {
        const call: { path: string; query?: Record<string, string>; filter?: string; orderby?: string; top?: number } = { path };
        calls.push(call);
        const chain = {
            query(q: Record<string, string>) {
                call.query = q;
                return chain;
            },
            filter(f: string) {
                call.filter = f;
                return chain;
            },
            orderby(o: string) {
                call.orderby = o;
                return chain;
            },
            top(n: number) {
                call.top = n;
                return chain;
            },
            get: async () => {
                if (state.throws) throw state.throws;
                return state.response;
            },
            post: async () => ({}),
        };
        return chain;
    });
    return { calls, setResponse, mockGraphApi };
});

vi.mock('@microsoft/microsoft-graph-client', () => ({
    Client: { initWithMiddleware: vi.fn().mockReturnValue({ api: mockGraphApi }) },
}));

vi.mock('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials', () => ({
    TokenCredentialAuthenticationProvider: vi.fn().mockImplementation(function () {
        return {};
    }),
}));

import { MSGraphProvider } from '../MSGraphProvider';

const WINDOW = { StartDateTime: new Date('2026-09-01T00:00:00Z'), EndDateTime: new Date('2026-09-08T00:00:00Z') };

const EVENT = {
    id: 'evt-1',
    seriesMasterId: 'series-9',
    subject: 'Renewal review',
    bodyPreview: 'agenda',
    start: { dateTime: '2026-09-02T14:00:00.0000000', timeZone: 'UTC' },
    end: { dateTime: '2026-09-02T15:00:00.0000000', timeZone: 'UTC' },
    location: { displayName: 'Teams' },
    organizer: { emailAddress: { address: 'Rep@Example.com' } },
    attendees: [
        { emailAddress: { address: 'buyer@customer.com' } },
        { emailAddress: { address: 'REP@example.com' } }, // the organizer again, differently cased
        { emailAddress: { address: 'buyer@customer.com' } }, // duplicate
    ],
    isCancelled: false,
};

describe('choosing an endpoint, and saying which was chosen', () => {
    let provider: MSGraphProvider;
    beforeEach(() => {
        calls.length = 0;
        setResponse({ value: [] });
        provider = new MSGraphProvider();
    });

    it('uses calendarView when a full window is supplied', async () => {
        await provider.GetEvents({ Identifier: 'rep@example.com', NumEvents: 50, ...WINDOW });
        expect(calls[0].path).toContain('/calendarView');
        expect(calls[0].query).toEqual({
            startDateTime: '2026-09-01T00:00:00.000Z',
            endDateTime: '2026-09-08T00:00:00.000Z',
        });
    });

    it('reports that recurrence WAS expanded in that case', async () => {
        const r = await provider.GetEvents({ Identifier: 'rep@example.com', NumEvents: 50, ...WINDOW });
        expect(r.RecurrenceExpanded).toBe(true);
    });

    it('falls back to /events with no window', async () => {
        await provider.GetEvents({ Identifier: 'rep@example.com', NumEvents: 50 });
        expect(calls[0].path).toContain('/events');
        expect(calls[0].path).not.toContain('calendarView');
    });

    /**
     * The load-bearing half. Without this the caller cannot tell a series master from an occurrence,
     * and would file a weekly meeting once, at whatever date the series began.
     */
    it('reports that recurrence was NOT expanded in that case', async () => {
        const r = await provider.GetEvents({ Identifier: 'rep@example.com', NumEvents: 50 });
        expect(r.RecurrenceExpanded).toBe(false);
    });

    /** One bound is not a window; calendarView would reject it, so it must not be used. */
    it('treats a half-supplied window as no window', async () => {
        await provider.GetEvents({ Identifier: 'rep@example.com', NumEvents: 50, StartDateTime: WINDOW.StartDateTime });
        expect(calls[0].path).toContain('/events');
        const r = await provider.GetEvents({ Identifier: 'rep@example.com', NumEvents: 50, EndDateTime: WINDOW.EndDateTime });
        expect(r.RecurrenceExpanded).toBe(false);
    });
});

describe('what is asked of Graph', () => {
    let provider: MSGraphProvider;
    beforeEach(() => {
        calls.length = 0;
        setResponse({ value: [] });
        provider = new MSGraphProvider();
    });

    /**
     * Server-side, before $top. Dropping cancelled events after the fetch would return fewer than
     * NumEvents and read as a quiet calendar rather than a filtered one.
     */
    it('excludes cancelled events by default, in the query', async () => {
        await provider.GetEvents({ Identifier: 'rep@example.com', NumEvents: 50, ...WINDOW });
        expect(calls[0].filter).toBe('isCancelled eq false');
    });

    it('includes them when asked, by sending no filter at all', async () => {
        await provider.GetEvents({ Identifier: 'rep@example.com', NumEvents: 50, IncludeCancelled: true, ...WINDOW });
        expect(calls[0].filter).toBeUndefined();
    });

    it('passes the cap through', async () => {
        await provider.GetEvents({ Identifier: 'rep@example.com', NumEvents: 17, ...WINDOW });
        expect(calls[0].top).toBe(17);
    });

    it('orders a windowed read by start time', async () => {
        await provider.GetEvents({ Identifier: 'rep@example.com', NumEvents: 50, ...WINDOW });
        expect(calls[0].orderby).toBe('start/dateTime');
    });

    it('encodes the mailbox into the path', async () => {
        await provider.GetEvents({ Identifier: 'first last@example.com', NumEvents: 5, ...WINDOW });
        expect(calls[0].path).toContain(encodeURIComponent('first last@example.com'));
    });
});

describe('mapping an event', () => {
    let provider: MSGraphProvider;
    beforeEach(() => {
        calls.length = 0;
        provider = new MSGraphProvider();
    });

    it('keeps the provider payload verbatim alongside the normalized form', async () => {
        setResponse({ value: [EVENT] });
        const r = await provider.GetEvents({ Identifier: 'rep@example.com', NumEvents: 5, ...WINDOW });
        expect(r.SourceData).toEqual([EVENT]);
    });

    it('normalizes the fields a caller needs', async () => {
        setResponse({ value: [EVENT] });
        const r = await provider.GetEvents({ Identifier: 'rep@example.com', NumEvents: 5, ...WINDOW });
        expect(r.Events[0]).toMatchObject({
            ExternalSystemRecordID: 'evt-1',
            SeriesID: 'series-9',
            Subject: 'Renewal review',
            Location: 'Teams',
            Organizer: 'rep@example.com',
            IsCancelled: false,
        });
        expect(r.Events[0].StartTime).toEqual(new Date('2026-09-02T14:00:00Z'));
    });

    /** The organizer is already carried separately; repeating them as an attendee double-counts. */
    it('excludes the organizer from attendees, case-insensitively, and de-duplicates', async () => {
        setResponse({ value: [EVENT] });
        const r = await provider.GetEvents({ Identifier: 'rep@example.com', NumEvents: 5, ...WINDOW });
        expect(r.Events[0].Attendees).toEqual(['buyer@customer.com']);
    });

    /**
     * Graph sends a naive local string plus a separate timeZone. Without a tz database, a named zone
     * does not determine an instant — and guessing files the meeting hours from when it happened.
     * Null is the honest answer.
     */
    it('returns null for a start whose zone cannot be resolved', async () => {
        setResponse({
            value: [{ ...EVENT, start: { dateTime: '2026-09-02T14:00:00.0000000', timeZone: 'Pacific Standard Time' } }],
        });
        const r = await provider.GetEvents({ Identifier: 'rep@example.com', NumEvents: 5, ...WINDOW });
        expect(r.Events[0].StartTime).toBeNull();
    });

    it('accepts an explicit offset regardless of the named zone', async () => {
        setResponse({
            value: [{ ...EVENT, start: { dateTime: '2026-09-02T14:00:00-04:00', timeZone: 'Eastern Standard Time' } }],
        });
        const r = await provider.GetEvents({ Identifier: 'rep@example.com', NumEvents: 5, ...WINDOW });
        expect(r.Events[0].StartTime).toEqual(new Date('2026-09-02T18:00:00Z'));
    });

    it('returns null rather than an Invalid Date for unparseable text', async () => {
        setResponse({ value: [{ ...EVENT, start: { dateTime: 'not a date', timeZone: 'UTC' } }] });
        const r = await provider.GetEvents({ Identifier: 'rep@example.com', NumEvents: 5, ...WINDOW });
        expect(r.Events[0].StartTime).toBeNull();
    });
});

describe('failing loudly rather than looking empty', () => {
    let provider: MSGraphProvider;
    beforeEach(() => {
        calls.length = 0;
        setResponse({ value: [] });
        provider = new MSGraphProvider();
    });

    /**
     * The distinction the whole result shape exists for: a caller advancing a watermark must not
     * read "could not look" as "nothing scheduled".
     */
    it('reports a thrown Graph error as a failure, not an empty calendar', async () => {
        setResponse(null, new Error('Forbidden'));
        const r = await provider.GetEvents({ Identifier: 'rep@example.com', NumEvents: 5, ...WINDOW });
        expect(r.Success).toBe(false);
        expect(r.Events).toEqual([]);
        expect(r.ErrorMessage).toMatch(/Forbidden/);
        expect(r.ErrorMessage).toMatch(/rep@example.com/);
    });

    it('reports a missing response as a failure', async () => {
        setResponse(null);
        const r = await provider.GetEvents({ Identifier: 'rep@example.com', NumEvents: 5, ...WINDOW });
        expect(r.Success).toBe(false);
    });

    it('succeeds with an empty list when the calendar really is empty', async () => {
        setResponse({ value: [] });
        const r = await provider.GetEvents({ Identifier: 'rep@example.com', NumEvents: 5, ...WINDOW });
        expect(r.Success).toBe(true);
        expect(r.Events).toEqual([]);
    });

    it('declares the capability, so a caller can ask before calling', () => {
        expect(provider.getSupportedOperations()).toContain('GetEvents');
    });
});
