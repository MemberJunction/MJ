import { describe, it, expect, vi, beforeEach } from 'vitest';

const { shared, calls, setResponse, mockGraphApi } = await vi.hoisted(async () => {
    const shared = await import('./graph-mocks');
    const calls: Array<{
        path: string;
        method?: string;
        headers: Record<string, string>;
        select?: string;
        body?: unknown;
    }> = [];
    const state: {
        response: unknown;
        throws: Error | null;
        perPathThrows: Record<string, Error>;
    } = {
        response: { value: [] },
        throws: null,
        perPathThrows: {}
    };

    const setResponse = (
        response: unknown,
        throws: Error | null = null,
        perPathThrows: Record<string, Error> = {}
    ) => {
        state.response = response;
        state.throws = throws;
        state.perPathThrows = perPathThrows;
    };

    const mockGraphApi = vi.fn().mockImplementation((path: string) => {
        const call: {
            path: string;
            method?: string;
            headers: Record<string, string>;
            select?: string;
            body?: unknown;
        } = { path, headers: {} };
        calls.push(call);

        const checkThrow = () => {
            for (const [pattern, err] of Object.entries(state.perPathThrows)) {
                if (path.includes(pattern)) {
                    throw err;
                }
            }
            if (state.throws) {
                throw state.throws;
            }
        };

        const chain = {
            header(name: string, value: string) {
                call.headers[name] = value;
                return chain;
            },
            select(fields: string) {
                call.select = fields;
                return chain;
            },
            get: async () => {
                call.method = 'GET';
                checkThrow();
                return state.response;
            },
            post: async (body?: unknown) => {
                call.method = 'POST';
                call.body = body;
                checkThrow();
                return state.response;
            },
            patch: async (body?: unknown) => {
                call.method = 'PATCH';
                call.body = body;
                checkThrow();
                return state.response;
            }
        };
        return chain;
    });

    return { shared, calls, setResponse, mockGraphApi };
});

vi.mock('@memberjunction/communication-types', () => shared.communicationTypesMock());

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/core', () => ({ LogError: vi.fn(), LogStatus: vi.fn() }));

vi.mock('env-var', () => shared.envVarMock());

vi.mock('@microsoft/microsoft-graph-client', () => ({
    Client: { initWithMiddleware: vi.fn().mockReturnValue({ api: mockGraphApi }) }
}));

vi.mock('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials', () => ({
    TokenCredentialAuthenticationProvider: vi.fn().mockImplementation(function () {
        return {};
    })
}));

import { MSGraphProvider } from '../MSGraphProvider';

describe('MSGraphProvider Calendar, Availability & Mailbox Preflight Operations', () => {
    let provider: MSGraphProvider;

    beforeEach(() => {
        calls.length = 0;
        setResponse({ value: [] });
        provider = new MSGraphProvider();
    });

    it('declares all new calendar, availability, and mailbox preflight operations in getSupportedOperations()', () => {
        const ops = provider.getSupportedOperations();
        expect(ops).toContain('GetFreeBusy');
        expect(ops).toContain('FindMeetingTimes');
        expect(ops).toContain('CreateCalendarEvent');
        expect(ops).toContain('UpdateCalendarEvent');
        expect(ops).toContain('RespondToCalendarEvent');
        expect(ops).toContain('CancelCalendarEvent');
        expect(ops).toContain('VerifyMailboxAccess');
    });

    describe('GetFreeBusy', () => {
        it('posts to /calendar/getSchedule and normalizes free/busy intervals', async () => {
            setResponse({
                value: [
                    {
                        scheduleId: 'alice@example.com',
                        availabilityView: '0220',
                        scheduleItems: [
                            {
                                status: 'busy',
                                subject: 'Board Prep',
                                location: 'Room A',
                                start: { dateTime: '2026-10-20T14:00:00Z', timeZone: 'UTC' },
                                end: { dateTime: '2026-10-20T15:00:00Z', timeZone: 'UTC' }
                            },
                            {
                                status: 'oof',
                                start: { dateTime: '2026-10-20T16:00:00Z', timeZone: 'UTC' },
                                end: { dateTime: '2026-10-20T17:00:00Z', timeZone: 'UTC' }
                            }
                        ]
                    }
                ]
            });

            const res = await provider.GetFreeBusy({
                Identifier: 'alice@example.com',
                Schedules: ['alice@example.com'],
                StartDateTime: new Date('2026-10-20T13:00:00Z'),
                EndDateTime: new Date('2026-10-20T18:00:00Z'),
                AvailabilityViewIntervalMinutes: 30
            });

            expect(res.Success).toBe(true);
            expect(calls[0].path).toContain('/alice%40example.com/calendar/getSchedule');
            expect(calls[0].method).toBe('POST');
            expect(res.Schedules).toHaveLength(1);
            expect(res.Schedules[0].ScheduleID).toBe('alice@example.com');
            expect(res.Schedules[0].AvailabilityView).toBe('0220');
            expect(res.Schedules[0].Slots).toHaveLength(2);
            expect(res.Schedules[0].Slots[0].Status).toBe('Busy');
            expect(res.Schedules[0].Slots[1].Status).toBe('OutOfOffice');
        });
    });

    describe('FindMeetingTimes', () => {
        it('posts to /findMeetingTimes and maps candidate slots and attendee availability', async () => {
            setResponse({
                meetingTimeSuggestions: [
                    {
                        confidence: 100,
                        suggestionReason: 'All attendees are available.',
                        meetingTimeSlot: {
                            start: { dateTime: '2026-10-21T15:00:00Z', timeZone: 'UTC' },
                            end: { dateTime: '2026-10-21T15:30:00Z', timeZone: 'UTC' }
                        },
                        attendeeAvailability: [
                            {
                                attendee: { emailAddress: { address: 'bob@example.com' } },
                                availability: 'free'
                            }
                        ]
                    }
                ]
            });

            const res = await provider.FindMeetingTimes({
                Identifier: 'alice@example.com',
                Attendees: [{ Email: 'bob@example.com', Required: true }],
                StartDateTime: new Date('2026-10-21T13:00:00Z'),
                EndDateTime: new Date('2026-10-21T18:00:00Z'),
                DurationMinutes: 30,
                MaxCandidates: 3
            });

            expect(res.Success).toBe(true);
            expect(calls[0].path).toContain('/alice%40example.com/findMeetingTimes');
            expect(res.Suggestions).toHaveLength(1);
            expect(res.Suggestions[0].Confidence).toBe(100);
            expect(res.Suggestions[0].AttendeeAvailability?.[0]).toEqual({
                Email: 'bob@example.com',
                Availability: 'Free'
            });
        });
    });

    describe('CreateCalendarEvent, UpdateCalendarEvent, RespondToCalendarEvent, CancelCalendarEvent', () => {
        it('supports DryRun on CreateCalendarEvent without calling Graph', async () => {
            const res = await provider.CreateCalendarEvent({
                Identifier: 'alice@example.com',
                Subject: 'Q4 OKR Sync',
                StartTime: new Date('2026-10-22T14:00:00Z'),
                EndTime: new Date('2026-10-22T14:30:00Z'),
                Attendees: [{ Email: 'bob@example.com', Name: 'Bob' }],
                DryRun: true
            });

            expect(res.Success).toBe(true);
            expect(res.DryRun).toBe(true);
            expect(res.Event?.ExternalSystemRecordID).toBe('DRY_RUN_EVENT_ID');
            expect(calls).toHaveLength(0);
        });

        it('creates a live calendar event with online meeting when DryRun is false', async () => {
            setResponse({
                id: 'evt-created-1',
                subject: 'Q4 OKR Sync',
                start: { dateTime: '2026-10-22T14:00:00Z', timeZone: 'UTC' },
                end: { dateTime: '2026-10-22T14:30:00Z', timeZone: 'UTC' },
                onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/123' }
            });

            const res = await provider.CreateCalendarEvent({
                Identifier: 'alice@example.com',
                Subject: 'Q4 OKR Sync',
                StartTime: new Date('2026-10-22T14:00:00Z'),
                EndTime: new Date('2026-10-22T14:30:00Z'),
                IsOnlineMeeting: true
            });

            expect(res.Success).toBe(true);
            expect(res.Event?.ExternalSystemRecordID).toBe('evt-created-1');
            expect(res.OnlineMeetingUrl).toBe('https://teams.microsoft.com/l/meetup-join/123');
            expect(calls[0].method).toBe('POST');
            expect(calls[0].path).toContain('/alice%40example.com/events');
        });

        it('patches an event on UpdateCalendarEvent', async () => {
            setResponse({
                id: 'evt-created-1',
                subject: 'Updated Subject',
                start: { dateTime: '2026-10-22T15:00:00Z', timeZone: 'UTC' },
                end: { dateTime: '2026-10-22T15:30:00Z', timeZone: 'UTC' }
            });

            const res = await provider.UpdateCalendarEvent({
                Identifier: 'alice@example.com',
                EventID: 'evt-created-1',
                Subject: 'Updated Subject'
            });

            expect(res.Success).toBe(true);
            expect(calls[0].method).toBe('PATCH');
            expect(calls[0].path).toContain('/alice%40example.com/events/evt-created-1');
        });

        it('posts to /accept, /tentativelyAccept, or /decline on RespondToCalendarEvent', async () => {
            setResponse({});
            const res = await provider.RespondToCalendarEvent({
                Identifier: 'alice@example.com',
                EventID: 'evt-99',
                Response: 'TentativelyAccept',
                Comment: 'Checking conflict'
            });

            expect(res.Success).toBe(true);
            expect(calls[0].method).toBe('POST');
            expect(calls[0].path).toContain('/alice%40example.com/events/evt-99/tentativelyAccept');
        });

        it('posts to /cancel on CancelCalendarEvent', async () => {
            setResponse({});
            const res = await provider.CancelCalendarEvent({
                Identifier: 'alice@example.com',
                EventID: 'evt-99',
                Comment: 'Rescheduling next week'
            });

            expect(res.Success).toBe(true);
            expect(calls[0].method).toBe('POST');
            expect(calls[0].path).toContain('/alice%40example.com/events/evt-99/cancel');
        });
    });

    describe('VerifyMailboxAccess', () => {
        it('returns CanReadMail=true and CanReadCalendar=true when both probes succeed', async () => {
            setResponse({ id: 'ok' });

            const res = await provider.VerifyMailboxAccess({
                Identifier: 'alice@example.com',
                CheckMailRead: true,
                CheckCalendarRead: true
            });

            expect(res.Success).toBe(true);
            expect(res.CanReadMail).toBe(true);
            expect(res.CanReadCalendar).toBe(true);
            expect(calls).toHaveLength(2);
            expect(calls[0].path).toContain('/mailFolders/inbox');
            expect(calls[1].path).toContain('/calendar');
        });

        it('captures partial failure when Exchange Application Access Policy blocks mail or calendar', async () => {
            setResponse(
                { id: 'ok' },
                null,
                { '/mailFolders/inbox': new Error('ErrorAccessDenied: Access to OData is disabled.') }
            );

            const res = await provider.VerifyMailboxAccess({
                Identifier: 'restricted@example.com',
                CheckMailRead: true,
                CheckCalendarRead: true
            });

            expect(res.Success).toBe(false);
            expect(res.CanReadMail).toBe(false);
            expect(res.CanReadCalendar).toBe(true);
            expect(res.MailErrorMessage).toContain('ErrorAccessDenied');
        });
    });
});
