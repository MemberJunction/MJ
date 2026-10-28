import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/communication-types', async () => {
  const addressUtils = await vi.importActual<{
    ParseEmailAddressList: (headerValue: string | null | undefined) => string[];
  }>('../../../../base-types/src/AddressUtils');
  const filterUtils = await vi.importActual<{
    CombineFilterClauses: (clauses: (string | null | undefined)[], operator: string) => string;
  }>('../../../../base-types/src/FilterUtils');
  return {
    ...addressUtils,
    ...filterUtils,
    BaseCommunicationProvider: class {
      getSupportedOperations() { return []; }
    },
    resolveCredentialValue: (requestVal: string | undefined, envVal: string | undefined, disableFallback: boolean) => {
      if (requestVal) return requestVal;
      if (!disableFallback && envVal) return envVal;
      return undefined;
    },
    validateRequiredCredentials: (creds: Record<string, unknown>, required: string[], provider: string) => {
      for (const key of required) {
        if (!creds[key]) {
          throw new Error(`${provider}: Missing required credential: ${key}`);
        }
      }
    },
  };
});

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return {
    ...actual,
    RegisterClass: () => (target: unknown) => target,
  };
});

vi.mock('@memberjunction/core', () => ({
  LogError: vi.fn(),
  LogStatus: vi.fn(),
}));

vi.mock('env-var', () => {
  const envMap: Record<string, string> = {
    GMAIL_CLIENT_ID: 'env-client-id',
    GMAIL_CLIENT_SECRET: 'env-client-secret',
    GMAIL_REDIRECT_URI: 'http://localhost:3000/callback',
    GMAIL_REFRESH_TOKEN: 'env-refresh-token',
    GMAIL_SERVICE_ACCOUNT_EMAIL: 'service@example.com',
  };
  return {
    default: {
      get: (key: string) => ({
        default: (def: string) => ({
          asString: () => envMap[key] ?? def,
        }),
      }),
    },
  };
});

vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

const {
  mockGetProfile,
  mockEventsList,
  mockEventsInsert,
  mockEventsPatch,
  mockEventsGet,
  mockEventsDelete,
  mockFreebusyQuery,
  mockCalendarsGet
} = vi.hoisted(() => ({
  mockGetProfile: vi.fn(),
  mockEventsList: vi.fn(),
  mockEventsInsert: vi.fn(),
  mockEventsPatch: vi.fn(),
  mockEventsGet: vi.fn(),
  mockEventsDelete: vi.fn(),
  mockFreebusyQuery: vi.fn(),
  mockCalendarsGet: vi.fn(),
}));

vi.mock('googleapis', () => {
  class FakeOAuth2 {
    setCredentials = vi.fn();
  }
  return {
    default: {
      google: {
        auth: {
          OAuth2: FakeOAuth2,
        },
        gmail: vi.fn().mockReturnValue({
          users: {
            getProfile: mockGetProfile,
          },
        }),
        calendar: vi.fn().mockReturnValue({
          events: {
            list: mockEventsList,
            insert: mockEventsInsert,
            patch: mockEventsPatch,
            get: mockEventsGet,
            delete: mockEventsDelete,
          },
          freebusy: {
            query: mockFreebusyQuery,
          },
          calendars: {
            get: mockCalendarsGet,
          },
        }),
      },
    },
  };
});

import { GmailProvider } from '../GmailProvider';

describe('GmailProvider Calendar, Free/Busy & Mailbox Preflight Operations', () => {
  let provider: GmailProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GmailProvider();
    mockGetProfile.mockResolvedValue({ data: { emailAddress: 'alice@example.com' } });
    mockCalendarsGet.mockResolvedValue({ data: { id: 'alice@example.com' } });
  });

  it('includes Google Calendar and mailbox preflight operations in getSupportedOperations()', () => {
    const ops = provider.getSupportedOperations();
    expect(ops).toContain('GetEvents');
    expect(ops).toContain('GetFreeBusy');
    expect(ops).toContain('CreateCalendarEvent');
    expect(ops).toContain('UpdateCalendarEvent');
    expect(ops).toContain('RespondToCalendarEvent');
    expect(ops).toContain('CancelCalendarEvent');
    expect(ops).toContain('VerifyMailboxAccess');
  });

  it('lists and normalizes Google Calendar events via GetEvents', async () => {
    mockEventsList.mockResolvedValue({
      data: {
        items: [
          {
            id: 'gcal-1',
            summary: 'Product Sync',
            description: 'Weekly review',
            start: { dateTime: '2026-10-20T14:00:00Z' },
            end: { dateTime: '2026-10-20T14:30:00Z' },
            organizer: { email: 'alice@example.com' },
            attendees: [
              { email: 'alice@example.com' },
              { email: 'bob@example.com' },
            ],
            status: 'confirmed',
          },
        ],
      },
    });

    const res = await provider.GetEvents({
      Identifier: 'alice@example.com',
      NumEvents: 10,
      StartDateTime: new Date('2026-10-20T00:00:00Z'),
      EndDateTime: new Date('2026-10-21T00:00:00Z'),
    });

    expect(res.Success).toBe(true);
    expect(res.RecurrenceExpanded).toBe(true);
    expect(res.Events).toHaveLength(1);
    expect(res.Events[0].ExternalSystemRecordID).toBe('gcal-1');
    expect(res.Events[0].Subject).toBe('Product Sync');
    expect(res.Events[0].Attendees).toEqual(['bob@example.com']);
  });

  it('queries Google Calendar free/busy via GetFreeBusy', async () => {
    mockFreebusyQuery.mockResolvedValue({
      data: {
        calendars: {
          'alice@example.com': {
            busy: [
              { start: '2026-10-20T14:00:00Z', end: '2026-10-20T15:00:00Z' },
            ],
          },
        },
      },
    });

    const res = await provider.GetFreeBusy({
      Identifier: 'alice@example.com',
      Schedules: ['alice@example.com'],
      StartDateTime: new Date('2026-10-20T12:00:00Z'),
      EndDateTime: new Date('2026-10-20T18:00:00Z'),
    });

    expect(res.Success).toBe(true);
    expect(res.Schedules).toHaveLength(1);
    expect(res.Schedules[0].Slots).toHaveLength(1);
    expect(res.Schedules[0].Slots[0].Status).toBe('Busy');
  });

  it('supports DryRun and live execution for CreateCalendarEvent, UpdateCalendarEvent, RespondToCalendarEvent, and CancelCalendarEvent', async () => {
    const dryRes = await provider.CreateCalendarEvent({
      Identifier: 'alice@example.com',
      Subject: 'Dry Run Meeting',
      StartTime: new Date('2026-10-20T14:00:00Z'),
      EndTime: new Date('2026-10-20T14:30:00Z'),
      DryRun: true,
    });
    expect(dryRes.Success).toBe(true);
    expect(dryRes.DryRun).toBe(true);
    expect(mockEventsInsert).not.toHaveBeenCalled();

    mockEventsInsert.mockResolvedValue({
      data: {
        id: 'gcal-new-1',
        summary: 'Live Meeting',
        start: { dateTime: '2026-10-20T14:00:00Z' },
        end: { dateTime: '2026-10-20T14:30:00Z' },
        hangoutLink: 'https://meet.google.com/abc-defg-hij',
      },
    });

    const liveRes = await provider.CreateCalendarEvent({
      Identifier: 'alice@example.com',
      Subject: 'Live Meeting',
      StartTime: new Date('2026-10-20T14:00:00Z'),
      EndTime: new Date('2026-10-20T14:30:00Z'),
      IsOnlineMeeting: true,
    });
    expect(liveRes.Success).toBe(true);
    expect(liveRes.Event?.ExternalSystemRecordID).toBe('gcal-new-1');
    expect(liveRes.OnlineMeetingUrl).toBe('https://meet.google.com/abc-defg-hij');

    mockEventsGet.mockResolvedValue({
      data: {
        id: 'gcal-new-1',
        attendees: [{ email: 'alice@example.com', responseStatus: 'needsAction' }],
      },
    });
    mockEventsPatch.mockResolvedValue({ data: { id: 'gcal-new-1' } });

    const rsvpRes = await provider.RespondToCalendarEvent({
      Identifier: 'alice@example.com',
      EventID: 'gcal-new-1',
      Response: 'Accept',
    });
    expect(rsvpRes.Success).toBe(true);
    expect(mockEventsPatch).toHaveBeenCalled();

    mockEventsDelete.mockResolvedValue({});
    const cancelRes = await provider.CancelCalendarEvent({
      Identifier: 'alice@example.com',
      EventID: 'gcal-new-1',
    });
    expect(cancelRes.Success).toBe(true);
    expect(mockEventsDelete).toHaveBeenCalled();
  });

  it('verifies mailbox and calendar access and detects profile mismatch in VerifyMailboxAccess', async () => {
    const okRes = await provider.VerifyMailboxAccess({
      Identifier: 'alice@example.com',
      CheckMailRead: true,
      CheckCalendarRead: true,
    });
    expect(okRes.Success).toBe(true);
    expect(okRes.CanReadMail).toBe(true);
    expect(okRes.CanReadCalendar).toBe(true);

    const mismatchRes = await provider.VerifyMailboxAccess({
      Identifier: 'other-user@example.com',
      CheckMailRead: true,
      CheckCalendarRead: true,
    });
    expect(mismatchRes.Success).toBe(false);
    expect(mismatchRes.CanReadMail).toBe(false);
    expect(mismatchRes.MailErrorMessage).toContain('does not match target mailbox');
  });
});
