import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { MJGlobal, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import {
    ArchiveMessageParams,
    ArchiveMessageResult,
    BaseCommunicationProvider,
    BaseMessageResult,
    CalendarEvent,
    CalendarEventAttendee,
    CalendarEventResult,
    CalendarTargetError,
    CalendarUpdateError,
    CancelCalendarEventParams,
    CancelCalendarEventResult,
    CancelEventParams,
    CreateCalendarEventParams,
    CreateCalendarEventResult,
    CreateDraftParams,
    CreateDraftResult,
    CreateEventParams,
    DeleteMessageParams,
    DeleteMessageResult,
    FindMeetingTimesParams,
    FindMeetingTimesResult,
    ForwardMessageParams,
    ForwardMessageResult,
    FreeBusyScheduleSlot,
    GetEventParams,
    GetEventsEvent,
    GetEventsParams,
    GetEventsResult,
    GetFreeBusyParams,
    GetFreeBusyResult,
    GetMessageMessage,
    GetMessagesParams,
    GetMessagesResult,
    GetSingleMessageParams,
    GetSingleMessageResult,
    MarkAsReadParams,
    MarkAsReadResult,
    MeetingTimeSuggestion,
    MessageRetrievalCapabilities,
    MessageResult,
    ProcessedMessage,
    ProviderCredentialsBase,
    ProviderOperation,
    ReplyToMessageParams,
    ReplyToMessageResult,
    RespondToCalendarEventParams,
    RespondToCalendarEventResult,
    SearchMessagesParams,
    SearchMessagesResult,
    SyncEventsParams,
    SyncEventsResult,
    UpdateCalendarEventParams,
    UpdateCalendarEventResult,
    UpdateEventParams,
    VerifyMailboxAccessParams,
    VerifyMailboxAccessResult,
} from '@memberjunction/communication-types';

/** Registered ClassFactory key and Communication Provider name for the local JSON mock driver. */
export const LOCAL_JSON_COMMUNICATION_PROVIDER_NAME = 'Local JSON Mock';

/** Environment variable controlling the root directory for per-mailbox JSON mock files. */
export const MJ_MOCK_COMM_DIR_ENV = 'MJ_MOCK_COMM_DIR';

/** Optional credential extension allowing per-request directory override in tests. */
export interface LocalJsonCommunicationCredentials extends ProviderCredentialsBase {
    mockDir?: string;
}

export interface LocalJsonStoredMessage {
    ID: string;
    ThreadID: string;
    Folder: 'Inbox' | 'Sent' | 'Drafts' | 'Archive';
    Direction: 'Inbound' | 'Outbound';
    From: string;
    To: string;
    ToRecipients: string[];
    CCRecipients: string[];
    BCCRecipients: string[];
    Subject: string;
    Body: string;
    HTMLBody?: string;
    IsRead: boolean;
    CreatedAt: string;
    ReceivedAt?: string;
    SentAt?: string;
}

export interface LocalJsonStoredEventAttendee {
    Email: string;
    Name?: string;
    Required: boolean;
    Response: 'None' | 'Accepted' | 'Tentative' | 'Declined';
}

export interface LocalJsonStoredEvent {
    ID: string;
    SeriesID: string | null;
    ICalUID: string;
    Subject: string;
    Body: string;
    StartTime: string;
    EndTime: string;
    TimeZone: string;
    IsAllDay: boolean;
    Location: string | null;
    Organizer: string;
    Attendees: LocalJsonStoredEventAttendee[];
    IsCancelled: boolean;
    OnlineMeetingUrl: string | null;
    ShowAs: 'Free' | 'Tentative' | 'Busy' | 'OutOfOffice' | 'WorkingElsewhere';
    LastModified: string;
}

export interface LocalJsonMailboxState {
    Mailbox: string;
    SeededAt: string;
    Messages: LocalJsonStoredMessage[];
    Events: LocalJsonStoredEvent[];
}

interface MailboxContextData {
    Email?: string;
    Mailbox?: string;
    Identifier?: string;
}

/**
 * Local filesystem JSON mock Email & Calendar communication provider for development,
 * smoke testing, and automated CI suites.
 *
 * Persists per-mailbox state in `<MJ_MOCK_COMM_DIR>/<sanitized-email>.json` and auto-seeds
 * a realistic executive inbox (4 threads) and calendar (4 events including a 2:00 PM conflict)
 * on first access so Chief of Staff and user-scoped communication actions work out of the box
 * without external OAuth credentials.
 */
export class LocalJsonCommunicationProvider extends BaseCommunicationProvider {
    private readonly _overrideDir: string | null;

    constructor(baseDir?: string) {
        super();
        this._overrideDir = baseDir && baseDir.trim().length > 0 ? baseDir.trim() : null;
    }

    protected override get ProviderName(): string {
        return LOCAL_JSON_COMMUNICATION_PROVIDER_NAME;
    }

    public override get MessageRetrieval(): MessageRetrievalCapabilities {
        return {
            FilterByReceivedDate: true,
            FilterByUnread: true,
        };
    }

    public override getSupportedOperations(): ProviderOperation[] {
        return [
            'SendSingleMessage',
            'GetMessages',
            'GetSingleMessage',
            'DeleteMessage',
            'MarkAsRead',
            'ArchiveMessage',
            'SearchMessages',
            'ForwardMessage',
            'ReplyToMessage',
            'CreateDraft',
            'GetEvents',
            'CreateEvent',
            'UpdateEvent',
            'CancelEvent',
            'GetEvent',
            'SyncEvents',
            'GetFreeBusy',
            'FindMeetingTimes',
            'CreateCalendarEvent',
            'UpdateCalendarEvent',
            'RespondToCalendarEvent',
            'CancelCalendarEvent',
            'VerifyMailboxAccess',
        ];
    }

    /**
     * Resolves the filesystem directory for JSON mailbox files, throwing null when unconfigured.
     */
    public ResolveDataDir(credentials?: ProviderCredentialsBase): string | null {
        const credDir = (credentials as LocalJsonCommunicationCredentials | undefined)?.mockDir?.trim();
        if (credDir) {
            return credDir;
        }
        if (this._overrideDir) {
            return this._overrideDir;
        }
        const envDir = process.env[MJ_MOCK_COMM_DIR_ENV]?.trim();
        return envDir && envDir.length > 0 ? envDir : null;
    }

    /**
     * Converts an email/identifier into a safe filename inside the mock directory.
     */
    public static SanitizeMailboxFilename(identifier: string): string {
        const normalized = identifier.trim().toLowerCase();
        const safe = normalized.replace(/[^a-z0-9._@+-]/g, '_').replace(/^\.+/, '');
        return `${safe || 'default'}.json`;
    }

    /**
     * Returns the full JSON file path for a mailbox identifier.
     */
    public GetMailboxFilePath(identifier: string, credentials?: ProviderCredentialsBase): string | null {
        const dir = this.ResolveDataDir(credentials);
        if (!dir) {
            return null;
        }
        return path.join(dir, LocalJsonCommunicationProvider.SanitizeMailboxFilename(identifier));
    }

    /**
     * Reads a mailbox JSON state file, auto-seeding realistic inbox + calendar data if missing.
     */
    public LoadOrSeedMailbox(identifier: string, credentials?: ProviderCredentialsBase): LocalJsonMailboxState {
        const dir = this.ResolveDataDir(credentials);
        if (!dir) {
            throw new Error(
                `${LOCAL_JSON_COMMUNICATION_PROVIDER_NAME} requires ${MJ_MOCK_COMM_DIR_ENV} or a configured directory.`
            );
        }
        fs.mkdirSync(dir, { recursive: true });
        const normalizedEmail = identifier.trim().toLowerCase() || 'default@local.mock';
        const filePath = path.join(dir, LocalJsonCommunicationProvider.SanitizeMailboxFilename(normalizedEmail));

        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(raw) as Partial<LocalJsonMailboxState>;
            return {
                Mailbox: parsed.Mailbox || normalizedEmail,
                SeededAt: parsed.SeededAt || new Date().toISOString(),
                Messages: Array.isArray(parsed.Messages) ? parsed.Messages : [],
                Events: Array.isArray(parsed.Events) ? parsed.Events : [],
            };
        }

        const seeded = this.buildDefaultSeedState(normalizedEmail);
        this.saveMailboxState(filePath, seeded);
        return seeded;
    }

    /**
     * Persists a mailbox JSON state file atomically to disk.
     */
    public SaveMailbox(state: LocalJsonMailboxState, credentials?: ProviderCredentialsBase): void {
        const dir = this.ResolveDataDir(credentials);
        if (!dir) {
            throw new Error(
                `${LOCAL_JSON_COMMUNICATION_PROVIDER_NAME} requires ${MJ_MOCK_COMM_DIR_ENV} or a configured directory.`
            );
        }
        fs.mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, LocalJsonCommunicationProvider.SanitizeMailboxFilename(state.Mailbox));
        this.saveMailboxState(filePath, state);
    }

    private saveMailboxState(filePath: string, state: LocalJsonMailboxState): void {
        fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
    }

    private buildDefaultSeedState(mailbox: string): LocalJsonMailboxState {
        const now = new Date();
        const nowIso = now.toISOString();
        const hourMs = 3_600_000;

        // Anchor the 2:00 PM conflict today when it is still before 1:00 PM local time,
        // or tomorrow when running late in the day so default GetEvents(now .. +7d) always sees it.
        const conflictDayOffset = now.getHours() < 13 ? 0 : 1;
        const makeLocalSlot = (dayOffset: number, hour: number, minute: number): string => {
            const d = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate() + dayOffset,
                hour,
                minute,
                0,
                0
            );
            return d.toISOString();
        };

        const messages: LocalJsonStoredMessage[] = [
            {
                ID: 'mock-msg-001',
                ThreadID: 'thread-board-deck',
                Folder: 'Inbox',
                Direction: 'Inbound',
                From: 'sarah.chen@bluecypress.io',
                To: mailbox,
                ToRecipients: [mailbox],
                CCRecipients: ['marcus.rivera@bluecypress.io'],
                BCCRecipients: [],
                Subject: 'Q4 Board Deck — Final Numbers Needed by 4 PM',
                Body: 'Hi — can we confirm the Q4 enterprise ARR forecast and EMEA churn breakdown before we freeze the board deck at 4:00 PM? Also flagged a 2:00 PM calendar overlap with the customer escalation call.',
                IsRead: false,
                CreatedAt: new Date(now.getTime() - 2 * hourMs).toISOString(),
                ReceivedAt: new Date(now.getTime() - 2 * hourMs).toISOString(),
            },
            {
                ID: 'mock-msg-002',
                ThreadID: 'thread-renewal-escalation',
                Folder: 'Inbox',
                Direction: 'Inbound',
                From: 'marcus.rivera@bluecypress.io',
                To: mailbox,
                ToRecipients: [mailbox],
                CCRecipients: [],
                BCCRecipients: [],
                Subject: 'Apex Health Enterprise Renewal — Scheduling Conflict at 2:00 PM',
                Body: 'Apex Health requested a quick 45-minute executive alignment at 2:00 PM to review their 3-year expansion terms. Let me know if we should push this to 3:30 PM or tomorrow morning.',
                IsRead: false,
                CreatedAt: new Date(now.getTime() - 4 * hourMs).toISOString(),
                ReceivedAt: new Date(now.getTime() - 4 * hourMs).toISOString(),
            },
            {
                ID: 'mock-msg-003',
                ThreadID: 'thread-cab-keynote',
                Folder: 'Inbox',
                Direction: 'Inbound',
                From: 'elena.vance@association.org',
                To: mailbox,
                ToRecipients: [mailbox],
                CCRecipients: ['events@association.org'],
                BCCRecipients: [],
                Subject: 'Invitation: Customer Advisory Board Keynote Outline',
                Body: 'We would love to confirm your 20-minute opening keynote topic on autonomous enterprise agent orchestration. Please send a brief draft outline when convenient.',
                IsRead: true,
                CreatedAt: new Date(now.getTime() - 18 * hourMs).toISOString(),
                ReceivedAt: new Date(now.getTime() - 18 * hourMs).toISOString(),
            },
            {
                ID: 'mock-msg-004',
                ThreadID: 'thread-eng-velocity',
                Folder: 'Inbox',
                Direction: 'Inbound',
                From: 'eng-ops@bluecypress.io',
                To: mailbox,
                ToRecipients: [mailbox],
                CCRecipients: [],
                BCCRecipients: [],
                Subject: 'Weekly Engineering Velocity & Release Readiness Digest',
                Body: 'Agent Instances & Inheritance milestone is tracking green: 100% unit tests passing across core packages and zero P0 regressions.',
                IsRead: true,
                CreatedAt: new Date(now.getTime() - 28 * hourMs).toISOString(),
                ReceivedAt: new Date(now.getTime() - 28 * hourMs).toISOString(),
            },
        ];

        const events: LocalJsonStoredEvent[] = [
            {
                ID: 'mock-evt-001',
                SeriesID: 'series-exec-standup',
                ICalUID: 'ical-mock-evt-001@local.mock',
                Subject: 'Executive Daily Standup',
                Body: 'Daily leadership sync on top priorities and blockers.',
                StartTime: makeLocalSlot(conflictDayOffset, 9, 30),
                EndTime: makeLocalSlot(conflictDayOffset, 10, 0),
                TimeZone: 'UTC',
                IsAllDay: false,
                Location: 'Zoom / Executive Room',
                Organizer: mailbox,
                Attendees: [
                    { Email: 'sarah.chen@bluecypress.io', Name: 'Sarah Chen', Required: true, Response: 'Accepted' },
                    { Email: 'marcus.rivera@bluecypress.io', Name: 'Marcus Rivera', Required: true, Response: 'Accepted' },
                ],
                IsCancelled: false,
                OnlineMeetingUrl: 'https://meet.local.mock/exec-standup',
                ShowAs: 'Busy',
                LastModified: nowIso,
            },
            {
                ID: 'mock-evt-002',
                SeriesID: null,
                ICalUID: 'ical-mock-evt-002@local.mock',
                Subject: 'Q4 Board Deck Review',
                Body: 'Final walkthrough of Q4 board slides, ARR metrics, and strategic priorities.',
                StartTime: makeLocalSlot(conflictDayOffset, 14, 0),
                EndTime: makeLocalSlot(conflictDayOffset, 15, 0),
                TimeZone: 'UTC',
                IsAllDay: false,
                Location: 'Boardroom A / Teams',
                Organizer: 'sarah.chen@bluecypress.io',
                Attendees: [
                    { Email: mailbox, Required: true, Response: 'Accepted' },
                    { Email: 'sarah.chen@bluecypress.io', Name: 'Sarah Chen', Required: true, Response: 'Accepted' },
                ],
                IsCancelled: false,
                OnlineMeetingUrl: 'https://meet.local.mock/q4-board-review',
                ShowAs: 'Busy',
                LastModified: nowIso,
            },
            {
                ID: 'mock-evt-003',
                SeriesID: null,
                ICalUID: 'ical-mock-evt-003@local.mock',
                Subject: 'Apex Health Enterprise Renewal Check-in (2:00 PM Conflict)',
                Body: 'Double-booked at 2:00 PM against Q4 Board Deck Review — review 3-year expansion terms.',
                StartTime: makeLocalSlot(conflictDayOffset, 14, 0),
                EndTime: makeLocalSlot(conflictDayOffset, 14, 45),
                TimeZone: 'UTC',
                IsAllDay: false,
                Location: 'Teams Meeting',
                Organizer: 'marcus.rivera@bluecypress.io',
                Attendees: [
                    { Email: mailbox, Required: true, Response: 'Tentative' },
                    { Email: 'marcus.rivera@bluecypress.io', Name: 'Marcus Rivera', Required: true, Response: 'Accepted' },
                ],
                IsCancelled: false,
                OnlineMeetingUrl: 'https://meet.local.mock/apex-renewal',
                ShowAs: 'Busy',
                LastModified: nowIso,
            },
            {
                ID: 'mock-evt-004',
                SeriesID: null,
                ICalUID: 'ical-mock-evt-004@local.mock',
                Subject: 'Product Strategy & AI Roadmap Sync',
                Body: 'Review Agent Instances UX, Smart @Mentions, and multi-agent roadmap.',
                StartTime: makeLocalSlot(conflictDayOffset + 1, 11, 0),
                EndTime: makeLocalSlot(conflictDayOffset + 1, 12, 0),
                TimeZone: 'UTC',
                IsAllDay: false,
                Location: 'Teams Meeting',
                Organizer: mailbox,
                Attendees: [
                    { Email: 'sarah.chen@bluecypress.io', Name: 'Sarah Chen', Required: true, Response: 'Accepted' },
                    { Email: 'eng-ops@bluecypress.io', Name: 'Engineering Ops', Required: false, Response: 'None' },
                ],
                IsCancelled: false,
                OnlineMeetingUrl: 'https://meet.local.mock/ai-roadmap',
                ShowAs: 'Busy',
                LastModified: nowIso,
            },
        ];

        return {
            Mailbox: mailbox,
            SeededAt: nowIso,
            Messages: messages,
            Events: events,
        };
    }

    private resolveMailboxIdentifier(
        explicitIdentifier?: string | null,
        contextData?: MailboxContextData | null,
        fallbackEmail?: string | null
    ): string {
        const candidate =
            explicitIdentifier?.trim() ||
            contextData?.Email?.trim() ||
            contextData?.Mailbox?.trim() ||
            contextData?.Identifier?.trim() ||
            fallbackEmail?.trim() ||
            'default@local.mock';
        return candidate.toLowerCase();
    }

    private toGetMessageMessage(stored: LocalJsonStoredMessage): GetMessageMessage {
        return {
            From: stored.From,
            To: stored.To,
            ToRecipients: [...stored.ToRecipients],
            CCRecipients: [...stored.CCRecipients],
            BCCRecipients: [...stored.BCCRecipients],
            Direction: stored.Direction,
            Body: stored.Body,
            Subject: stored.Subject,
            ExternalSystemRecordID: stored.ID,
            ThreadID: stored.ThreadID,
            CreatedAt: new Date(stored.CreatedAt),
            LastModifiedAt: new Date(stored.CreatedAt),
            ReceivedAt: stored.ReceivedAt ? new Date(stored.ReceivedAt) : undefined,
            SentAt: stored.SentAt ? new Date(stored.SentAt) : undefined,
        };
    }

    private toGetEventsEvent(stored: LocalJsonStoredEvent): GetEventsEvent {
        const organizerLower = stored.Organizer.trim().toLowerCase();
        return {
            ExternalSystemRecordID: stored.ID,
            SeriesID: stored.SeriesID,
            Subject: stored.Subject,
            Body: stored.Body,
            StartTime: new Date(stored.StartTime),
            EndTime: new Date(stored.EndTime),
            Location: stored.Location,
            Organizer: stored.Organizer,
            Attendees: stored.Attendees
                .map((a) => a.Email)
                .filter((email) => email.trim().toLowerCase() !== organizerLower),
            IsCancelled: stored.IsCancelled,
        };
    }

    private toCalendarEvent(stored: LocalJsonStoredEvent): CalendarEvent {
        const attendees: CalendarEventAttendee[] = stored.Attendees.map((a) => ({
            Email: a.Email,
            Name: a.Name,
            Type: a.Required ? 'Required' : 'Optional',
            Response: a.Response,
        }));
        return {
            ExternalEventID: stored.ID,
            SeriesID: stored.SeriesID,
            ICalUID: stored.ICalUID,
            Subject: stored.Subject,
            Body: stored.Body,
            Start: new Date(stored.StartTime),
            End: new Date(stored.EndTime),
            IsAllDay: stored.IsAllDay,
            Location: stored.Location,
            Organizer: { Email: stored.Organizer },
            Attendees: attendees,
            IsCancelled: stored.IsCancelled,
            OnlineMeetingUrl: stored.OnlineMeetingUrl,
            LastModified: new Date(stored.LastModified),
        };
    }

    // =========================================================================
    // MAIL OPERATIONS
    // =========================================================================

    public override async SendSingleMessage(
        message: ProcessedMessage,
        credentials?: ProviderCredentialsBase
    ): Promise<MessageResult> {
        try {
            const dir = this.ResolveDataDir(credentials);
            if (!dir) {
                return {
                    Message: message,
                    Success: false,
                    Error: `${LOCAL_JSON_COMMUNICATION_PROVIDER_NAME} requires ${MJ_MOCK_COMM_DIR_ENV}.`,
                };
            }

            if (message.DryRun) {
                return {
                    Message: message,
                    Success: true,
                    Error: '',
                    DryRun: true,
                };
            }

            const mailbox = this.resolveMailboxIdentifier(
                null,
                message.ContextData as MailboxContextData | undefined,
                message.From
            );
            const state = this.LoadOrSeedMailbox(mailbox, credentials);
            const nowIso = new Date().toISOString();
            const id = `mock-sent-${crypto.randomUUID()}`;
            const threadId = `thread-${crypto.randomUUID().slice(0, 8)}`;
            const toList = message.To ? [message.To] : [];

            const sentRecord: LocalJsonStoredMessage = {
                ID: id,
                ThreadID: threadId,
                Folder: 'Sent',
                Direction: 'Outbound',
                From: message.From || mailbox,
                To: message.To || '',
                ToRecipients: toList,
                CCRecipients: message.CCRecipients ? [...message.CCRecipients] : [],
                BCCRecipients: message.BCCRecipients ? [...message.BCCRecipients] : [],
                Subject: message.ProcessedSubject || message.Subject || '',
                Body: message.ProcessedBody || message.Body || '',
                HTMLBody: message.ProcessedHTMLBody || message.HTMLBody || undefined,
                IsRead: true,
                CreatedAt: nowIso,
                SentAt: nowIso,
            };

            state.Messages.unshift(sentRecord);
            this.SaveMailbox(state, credentials);

            return {
                Message: message,
                Success: true,
                Error: '',
            };
        } catch (error) {
            return {
                Message: message,
                Success: false,
                Error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public override async GetMessages(
        params: GetMessagesParams,
        credentials?: ProviderCredentialsBase
    ): Promise<GetMessagesResult> {
        try {
            const mailbox = this.resolveMailboxIdentifier(
                params.Identifier,
                params.ContextData as MailboxContextData | undefined
            );
            const state = this.LoadOrSeedMailbox(mailbox, credentials);

            let filtered = state.Messages.filter((m) => m.Folder !== 'Drafts');
            if (params.UnreadOnly) {
                filtered = filtered.filter((m) => !m.IsRead);
            }
            if (params.ReceivedAfter) {
                const afterMs = params.ReceivedAfter.getTime();
                filtered = filtered.filter((m) => Date.parse(m.ReceivedAt || m.CreatedAt) >= afterMs);
            }
            if (params.ReceivedBefore) {
                const beforeMs = params.ReceivedBefore.getTime();
                filtered = filtered.filter((m) => Date.parse(m.ReceivedAt || m.CreatedAt) <= beforeMs);
            }

            filtered.sort(
                (a, b) => Date.parse(b.ReceivedAt || b.CreatedAt) - Date.parse(a.ReceivedAt || a.CreatedAt)
            );

            const cap = params.NumMessages > 0 ? params.NumMessages : 20;
            const sliced = filtered.slice(0, cap);

            return {
                Success: true,
                Messages: sliced.map((m) => this.toGetMessageMessage(m)),
                SourceData: sliced,
                AppliedFilters: {
                    ReceivedAfter: Boolean(params.ReceivedAfter),
                    ReceivedBefore: Boolean(params.ReceivedBefore),
                    UnreadOnly: Boolean(params.UnreadOnly),
                },
            };
        } catch (error) {
            return {
                Success: false,
                Messages: [],
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public override async GetSingleMessage(
        params: GetSingleMessageParams,
        credentials?: ProviderCredentialsBase
    ): Promise<GetSingleMessageResult> {
        try {
            const mailbox = this.resolveMailboxIdentifier(
                null,
                params.ContextData as MailboxContextData | undefined
            );
            const state = this.LoadOrSeedMailbox(mailbox, credentials);
            const found = state.Messages.find((m) => UUIDsEqual(m.ID, params.MessageID));
            if (!found) {
                return {
                    Success: false,
                    ErrorMessage: `Message '${params.MessageID}' not found in mailbox '${mailbox}'.`,
                };
            }
            return {
                Success: true,
                Message: this.toGetMessageMessage(found),
                SourceData: found,
            };
        } catch (error) {
            return {
                Success: false,
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public override async SearchMessages(
        params: SearchMessagesParams,
        credentials?: ProviderCredentialsBase
    ): Promise<SearchMessagesResult> {
        try {
            const mailbox = this.resolveMailboxIdentifier(
                null,
                params.ContextData as MailboxContextData | undefined
            );
            const state = this.LoadOrSeedMailbox(mailbox, credentials);
            const query = params.Query.trim().toLowerCase();
            const tokens = query.split(/\s+/).filter(Boolean);
            const searchIn = params.SearchIn && params.SearchIn.length > 0 ? params.SearchIn : ['all'];

            let matches = state.Messages.filter((m) => {
                if (params.FolderID && m.Folder.toLowerCase() !== params.FolderID.toLowerCase()) {
                    return false;
                }
                const ts = Date.parse(m.ReceivedAt || m.CreatedAt);
                if (params.FromDate && ts < params.FromDate.getTime()) {
                    return false;
                }
                if (params.ToDate && ts > params.ToDate.getTime()) {
                    return false;
                }
                if (tokens.length === 0) {
                    return true;
                }
                const parts: string[] = [];
                if (searchIn.includes('all') || searchIn.includes('subject')) parts.push(m.Subject);
                if (searchIn.includes('all') || searchIn.includes('body')) parts.push(m.Body);
                if (searchIn.includes('all') || searchIn.includes('from')) parts.push(m.From);
                if (searchIn.includes('all') || searchIn.includes('to')) parts.push(m.To, ...m.ToRecipients);
                const haystack = parts.join(' ').toLowerCase();
                return tokens.every((t) => haystack.includes(t));
            });

            matches.sort(
                (a, b) => Date.parse(b.ReceivedAt || b.CreatedAt) - Date.parse(a.ReceivedAt || a.CreatedAt)
            );
            const totalCount = matches.length;
            const max = params.MaxResults && params.MaxResults > 0 ? params.MaxResults : 20;
            matches = matches.slice(0, max);

            return {
                Success: true,
                Messages: matches.map((m) => this.toGetMessageMessage(m)),
                TotalCount: totalCount,
                SourceData: matches,
            };
        } catch (error) {
            return {
                Success: false,
                Messages: [],
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public override async ForwardMessage(
        params: ForwardMessageParams,
        credentials?: ProviderCredentialsBase
    ): Promise<ForwardMessageResult> {
        try {
            const mailbox = this.resolveMailboxIdentifier(
                null,
                params.ContextData as MailboxContextData | undefined
            );
            const state = this.LoadOrSeedMailbox(mailbox, credentials);
            const original = state.Messages.find((m) => UUIDsEqual(m.ID, params.MessageID));
            if (!original) {
                return {
                    Success: false,
                    ErrorMessage: `Message '${params.MessageID}' not found in mailbox '${mailbox}'.`,
                };
            }

            const nowIso = new Date().toISOString();
            const forwardedId = `mock-fwd-${crypto.randomUUID()}`;
            const forwarded: LocalJsonStoredMessage = {
                ID: forwardedId,
                ThreadID: original.ThreadID,
                Folder: 'Sent',
                Direction: 'Outbound',
                From: mailbox,
                To: params.ToRecipients[0] || '',
                ToRecipients: [...params.ToRecipients],
                CCRecipients: params.CCRecipients ? [...params.CCRecipients] : [],
                BCCRecipients: params.BCCRecipients ? [...params.BCCRecipients] : [],
                Subject: original.Subject.startsWith('Fwd:') ? original.Subject : `Fwd: ${original.Subject}`,
                Body: `${params.Message ? `${params.Message}\n\n` : ''}--- Forwarded message ---\n${original.Body}`,
                IsRead: true,
                CreatedAt: nowIso,
                SentAt: nowIso,
            };

            state.Messages.unshift(forwarded);
            this.SaveMailbox(state, credentials);

            return {
                Success: true,
                Result: { MessageID: forwardedId },
            };
        } catch (error) {
            return {
                Success: false,
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public override async ReplyToMessage(
        params: ReplyToMessageParams,
        credentials?: ProviderCredentialsBase
    ): Promise<ReplyToMessageResult> {
        try {
            const mailbox = this.resolveMailboxIdentifier(
                null,
                params.ContextData as MailboxContextData | undefined,
                params.Message?.From
            );
            const state = this.LoadOrSeedMailbox(mailbox, credentials);
            const original = state.Messages.find((m) => UUIDsEqual(m.ID, params.MessageID));
            if (!original) {
                return {
                    Success: false,
                    ErrorMessage: `Message '${params.MessageID}' not found in mailbox '${mailbox}'.`,
                };
            }

            const nowIso = new Date().toISOString();
            const replyId = `mock-reply-${crypto.randomUUID()}`;
            const recipient = params.Message.To || original.From;
            const subject =
                params.Message.ProcessedSubject ||
                params.Message.Subject ||
                (original.Subject.startsWith('Re:') ? original.Subject : `Re: ${original.Subject}`);

            const reply: LocalJsonStoredMessage = {
                ID: replyId,
                ThreadID: original.ThreadID,
                Folder: 'Sent',
                Direction: 'Outbound',
                From: params.Message.From || mailbox,
                To: recipient,
                ToRecipients: [recipient],
                CCRecipients: params.Message.CCRecipients ? [...params.Message.CCRecipients] : [],
                BCCRecipients: params.Message.BCCRecipients ? [...params.Message.BCCRecipients] : [],
                Subject: subject,
                Body: params.Message.ProcessedBody || params.Message.Body || '',
                HTMLBody: params.Message.ProcessedHTMLBody || params.Message.HTMLBody || undefined,
                IsRead: true,
                CreatedAt: nowIso,
                SentAt: nowIso,
            };

            state.Messages.unshift(reply);
            this.SaveMailbox(state, credentials);

            return {
                Success: true,
                Result: { MessageID: replyId, ThreadID: original.ThreadID },
            };
        } catch (error) {
            return {
                Success: false,
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public override async CreateDraft(
        params: CreateDraftParams,
        credentials?: ProviderCredentialsBase
    ): Promise<CreateDraftResult> {
        try {
            const mailbox = this.resolveMailboxIdentifier(
                null,
                params.ContextData as MailboxContextData | undefined,
                params.Message?.From
            );
            const state = this.LoadOrSeedMailbox(mailbox, credentials);
            const nowIso = new Date().toISOString();
            const draftId = `mock-draft-${crypto.randomUUID()}`;

            const draft: LocalJsonStoredMessage = {
                ID: draftId,
                ThreadID: `thread-${crypto.randomUUID().slice(0, 8)}`,
                Folder: 'Drafts',
                Direction: 'Outbound',
                From: params.Message.From || mailbox,
                To: params.Message.To || '',
                ToRecipients: params.Message.To ? [params.Message.To] : [],
                CCRecipients: params.Message.CCRecipients ? [...params.Message.CCRecipients] : [],
                BCCRecipients: params.Message.BCCRecipients ? [...params.Message.BCCRecipients] : [],
                Subject: params.Message.ProcessedSubject || params.Message.Subject || '',
                Body: params.Message.ProcessedBody || params.Message.Body || '',
                HTMLBody: params.Message.ProcessedHTMLBody || params.Message.HTMLBody || undefined,
                IsRead: true,
                CreatedAt: nowIso,
            };

            state.Messages.unshift(draft);
            this.SaveMailbox(state, credentials);

            return {
                Success: true,
                DraftID: draftId,
                Result: draft,
            };
        } catch (error) {
            return {
                Success: false,
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public override async DeleteMessage(
        params: DeleteMessageParams,
        credentials?: ProviderCredentialsBase
    ): Promise<DeleteMessageResult> {
        try {
            const mailbox = this.resolveMailboxIdentifier(
                null,
                params.ContextData as MailboxContextData | undefined
            );
            const state = this.LoadOrSeedMailbox(mailbox, credentials);
            const idx = state.Messages.findIndex((m) => UUIDsEqual(m.ID, params.MessageID));
            if (idx < 0) {
                return { Success: false, ErrorMessage: `Message '${params.MessageID}' not found.` };
            }
            state.Messages.splice(idx, 1);
            this.SaveMailbox(state, credentials);
            return { Success: true };
        } catch (error) {
            return {
                Success: false,
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public override async MarkAsRead(
        params: MarkAsReadParams,
        credentials?: ProviderCredentialsBase
    ): Promise<MarkAsReadResult> {
        try {
            const mailbox = this.resolveMailboxIdentifier(
                null,
                params.ContextData as MailboxContextData | undefined
            );
            const state = this.LoadOrSeedMailbox(mailbox, credentials);
            const ids = new UUIDSet(params.MessageIDs);
            for (const msg of state.Messages) {
                if (ids.Has(msg.ID)) {
                    msg.IsRead = params.IsRead;
                }
            }
            this.SaveMailbox(state, credentials);
            return { Success: true };
        } catch (error) {
            return {
                Success: false,
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public override async ArchiveMessage(
        params: ArchiveMessageParams,
        credentials?: ProviderCredentialsBase
    ): Promise<ArchiveMessageResult> {
        try {
            const mailbox = this.resolveMailboxIdentifier(
                null,
                params.ContextData as MailboxContextData | undefined
            );
            const state = this.LoadOrSeedMailbox(mailbox, credentials);
            const msg = state.Messages.find((m) => UUIDsEqual(m.ID, params.MessageID));
            if (!msg) {
                return { Success: false, ErrorMessage: `Message '${params.MessageID}' not found.` };
            }
            msg.Folder = 'Archive';
            this.SaveMailbox(state, credentials);
            return { Success: true };
        } catch (error) {
            return {
                Success: false,
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }

    // =========================================================================
    // CALENDAR OPERATIONS
    // =========================================================================

    public override async GetEvents(
        params: GetEventsParams,
        credentials?: ProviderCredentialsBase
    ): Promise<GetEventsResult> {
        try {
            const mailbox = this.resolveMailboxIdentifier(
                params.Identifier,
                params.ContextData as MailboxContextData | undefined
            );
            const state = this.LoadOrSeedMailbox(mailbox, credentials);

            let events = state.Events.filter((evt) => {
                if (!params.IncludeCancelled && evt.IsCancelled) {
                    return false;
                }
                const startMs = Date.parse(evt.StartTime);
                const endMs = Date.parse(evt.EndTime);
                if (params.StartDateTime && endMs <= params.StartDateTime.getTime()) {
                    return false;
                }
                if (params.EndDateTime && startMs >= params.EndDateTime.getTime()) {
                    return false;
                }
                return true;
            });

            events.sort((a, b) => Date.parse(a.StartTime) - Date.parse(b.StartTime));
            const cap = params.NumEvents > 0 ? params.NumEvents : 25;
            events = events.slice(0, cap);

            return {
                Success: true,
                Events: events.map((e) => this.toGetEventsEvent(e)),
                SourceData: events,
                RecurrenceExpanded: false,
            };
        } catch (error) {
            return {
                Success: false,
                Events: [],
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /** Convenience alias for {@link GetEvents}. */
    public async ListCalendarEvents(
        params: GetEventsParams,
        credentials?: ProviderCredentialsBase
    ): Promise<GetEventsResult> {
        return this.GetEvents(params, credentials);
    }

    public override async CreateCalendarEvent(
        params: CreateCalendarEventParams,
        credentials?: ProviderCredentialsBase
    ): Promise<CreateCalendarEventResult> {
        try {
            const mailbox = this.resolveMailboxIdentifier(
                params.Identifier,
                params.ContextData as MailboxContextData | undefined
            );
            const nowIso = new Date().toISOString();
            const eventId = params.DryRun ? 'DRY_RUN_EVENT_ID' : `mock-evt-${crypto.randomUUID()}`;
            const onlineUrl = params.IsOnlineMeeting
                ? `https://meet.local.mock/${eventId.slice(-8)}`
                : null;

            const stored: LocalJsonStoredEvent = {
                ID: eventId,
                SeriesID: null,
                ICalUID: `ical-${eventId}@local.mock`,
                Subject: params.Subject,
                Body: params.Body ?? '',
                StartTime: params.StartTime.toISOString(),
                EndTime: params.EndTime.toISOString(),
                TimeZone: params.TimeZone ?? 'UTC',
                IsAllDay: false,
                Location: params.Location ?? null,
                Organizer: mailbox,
                Attendees: (params.Attendees ?? []).map((a) => ({
                    Email: a.Email,
                    Name: a.Name,
                    Required: a.Required ?? true,
                    Response: 'None',
                })),
                IsCancelled: false,
                OnlineMeetingUrl: onlineUrl,
                ShowAs: 'Busy',
                LastModified: nowIso,
            };

            if (params.DryRun) {
                return {
                    Success: true,
                    DryRun: true,
                    Event: this.toGetEventsEvent(stored),
                    OnlineMeetingUrl: onlineUrl,
                    SourceData: { Preview: stored },
                };
            }

            const state = this.LoadOrSeedMailbox(mailbox, credentials);
            state.Events.push(stored);
            this.SaveMailbox(state, credentials);

            return {
                Success: true,
                DryRun: false,
                Event: this.toGetEventsEvent(stored),
                OnlineMeetingUrl: onlineUrl,
                SourceData: { Stored: stored },
            };
        } catch (error) {
            return {
                Success: false,
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public override async UpdateCalendarEvent(
        params: UpdateCalendarEventParams,
        credentials?: ProviderCredentialsBase
    ): Promise<UpdateCalendarEventResult> {
        try {
            const mailbox = this.resolveMailboxIdentifier(
                params.Identifier,
                params.ContextData as MailboxContextData | undefined
            );
            const state = this.LoadOrSeedMailbox(mailbox, credentials);
            const existing = state.Events.find((e) => UUIDsEqual(e.ID, params.EventID));
            if (!existing) {
                return {
                    Success: false,
                    ErrorMessage: `Calendar event '${params.EventID}' not found in mailbox '${mailbox}'.`,
                };
            }

            const updated: LocalJsonStoredEvent = {
                ...existing,
                Subject: params.Subject ?? existing.Subject,
                Body: params.Body ?? existing.Body,
                StartTime: params.StartTime ? params.StartTime.toISOString() : existing.StartTime,
                EndTime: params.EndTime ? params.EndTime.toISOString() : existing.EndTime,
                TimeZone: params.TimeZone ?? existing.TimeZone,
                Location: params.Location !== undefined ? params.Location : existing.Location,
                Attendees: params.Attendees
                    ? params.Attendees.map((a) => ({
                          Email: a.Email,
                          Name: a.Name,
                          Required: a.Required ?? true,
                          Response: 'None' as const,
                      }))
                    : existing.Attendees,
                LastModified: new Date().toISOString(),
            };

            if (params.DryRun) {
                return {
                    Success: true,
                    DryRun: true,
                    Event: this.toGetEventsEvent(updated),
                    SourceData: { Preview: updated },
                };
            }

            const idx = state.Events.findIndex((e) => UUIDsEqual(e.ID, params.EventID));
            state.Events[idx] = updated;
            this.SaveMailbox(state, credentials);

            return {
                Success: true,
                DryRun: false,
                Event: this.toGetEventsEvent(updated),
                SourceData: { Stored: updated },
            };
        } catch (error) {
            return {
                Success: false,
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public override async CancelCalendarEvent(
        params: CancelCalendarEventParams,
        credentials?: ProviderCredentialsBase
    ): Promise<CancelCalendarEventResult> {
        try {
            const mailbox = this.resolveMailboxIdentifier(
                params.Identifier,
                params.ContextData as MailboxContextData | undefined
            );
            const state = this.LoadOrSeedMailbox(mailbox, credentials);
            const existing = state.Events.find((e) => UUIDsEqual(e.ID, params.EventID));
            if (!existing) {
                return {
                    Success: false,
                    ErrorMessage: `Calendar event '${params.EventID}' not found in mailbox '${mailbox}'.`,
                };
            }

            if (params.DryRun) {
                return { Success: true, DryRun: true };
            }

            existing.IsCancelled = true;
            existing.LastModified = new Date().toISOString();
            this.SaveMailbox(state, credentials);

            return { Success: true, DryRun: false };
        } catch (error) {
            return {
                Success: false,
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /** Convenience alias for {@link CancelCalendarEvent}. */
    public async DeleteCalendarEvent(
        params: CancelCalendarEventParams,
        credentials?: ProviderCredentialsBase
    ): Promise<CancelCalendarEventResult> {
        return this.CancelCalendarEvent(params, credentials);
    }

    public override async RespondToCalendarEvent(
        params: RespondToCalendarEventParams,
        credentials?: ProviderCredentialsBase
    ): Promise<RespondToCalendarEventResult> {
        try {
            const mailbox = this.resolveMailboxIdentifier(
                params.Identifier,
                params.ContextData as MailboxContextData | undefined
            );
            const state = this.LoadOrSeedMailbox(mailbox, credentials);
            const existing = state.Events.find((e) => UUIDsEqual(e.ID, params.EventID));
            if (!existing) {
                return {
                    Success: false,
                    ErrorMessage: `Calendar event '${params.EventID}' not found in mailbox '${mailbox}'.`,
                };
            }

            if (params.DryRun) {
                return { Success: true, DryRun: true };
            }

            const mappedResponse: LocalJsonStoredEventAttendee['Response'] =
                params.Response === 'Accept'
                    ? 'Accepted'
                    : params.Response === 'TentativelyAccept'
                      ? 'Tentative'
                      : 'Declined';

            const attendee = existing.Attendees.find(
                (a) => a.Email.trim().toLowerCase() === mailbox
            );
            if (attendee) {
                attendee.Response = mappedResponse;
            } else {
                existing.Attendees.push({
                    Email: mailbox,
                    Required: true,
                    Response: mappedResponse,
                });
            }
            if (mappedResponse === 'Declined') {
                existing.ShowAs = 'Free';
            }
            existing.LastModified = new Date().toISOString();
            this.SaveMailbox(state, credentials);

            return { Success: true, DryRun: false };
        } catch (error) {
            return {
                Success: false,
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public override async GetFreeBusy(
        params: GetFreeBusyParams,
        credentials?: ProviderCredentialsBase
    ): Promise<GetFreeBusyResult> {
        try {
            const startMs = params.StartDateTime.getTime();
            const endMs = params.EndDateTime.getTime();
            const intervalMinutes = Math.max(5, params.AvailabilityViewIntervalMinutes ?? 30);
            const intervalMs = intervalMinutes * 60_000;

            const schedules = params.Schedules.map((scheduleId) => {
                const state = this.LoadOrSeedMailbox(scheduleId, credentials);
                const overlapping = state.Events
                    .filter((evt) => {
                        if (evt.IsCancelled) return false;
                        const s = Date.parse(evt.StartTime);
                        const e = Date.parse(evt.EndTime);
                        return e > startMs && s < endMs;
                    })
                    .sort((a, b) => Date.parse(a.StartTime) - Date.parse(b.StartTime));

                const slots: FreeBusyScheduleSlot[] = overlapping.map((evt) => ({
                    StartTime: new Date(evt.StartTime),
                    EndTime: new Date(evt.EndTime),
                    Status: evt.ShowAs,
                    Subject: evt.Subject,
                }));

                // Build compact Graph-style availability view string ('0'=Free,'1'=Tentative,'2'=Busy,'3'=OOF)
                const chars: string[] = [];
                for (let cursor = startMs; cursor < endMs && chars.length < 480; cursor += intervalMs) {
                    const bucketEnd = Math.min(cursor + intervalMs, endMs);
                    let code = '0';
                    for (const evt of overlapping) {
                        const s = Date.parse(evt.StartTime);
                        const e = Date.parse(evt.EndTime);
                        if (e > cursor && s < bucketEnd) {
                            if (evt.ShowAs === 'OutOfOffice') {
                                code = '3';
                                break;
                            }
                            if (evt.ShowAs === 'Busy' || evt.ShowAs === 'WorkingElsewhere') {
                                code = '2';
                            } else if (evt.ShowAs === 'Tentative' && code === '0') {
                                code = '1';
                            }
                        }
                    }
                    chars.push(code);
                }

                return {
                    ScheduleID: scheduleId,
                    AvailabilityView: chars.join(''),
                    Slots: slots,
                };
            });

            return {
                Success: true,
                Schedules: schedules,
            };
        } catch (error) {
            return {
                Success: false,
                Schedules: [],
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public override async FindMeetingTimes(
        params: FindMeetingTimesParams,
        credentials?: ProviderCredentialsBase
    ): Promise<FindMeetingTimesResult> {
        try {
            const organizer = this.resolveMailboxIdentifier(
                params.Identifier,
                params.ContextData as MailboxContextData | undefined
            );
            const attendeeEmails = params.Attendees.map((a) => a.Email.trim().toLowerCase());
            const allSchedules = Array.from(new Set([organizer, ...attendeeEmails]));

            const busyBySchedule = new Map<string, Array<{ start: number; end: number }>>();
            for (const email of allSchedules) {
                const state = this.LoadOrSeedMailbox(email, credentials);
                busyBySchedule.set(
                    email,
                    state.Events
                        .filter((e) => !e.IsCancelled && e.ShowAs !== 'Free')
                        .map((e) => ({ start: Date.parse(e.StartTime), end: Date.parse(e.EndTime) }))
                );
            }

            const durationMs = Math.max(15, params.DurationMinutes) * 60_000;
            const stepMs = 30 * 60_000;
            const maxCandidates = Math.max(1, params.MaxCandidates ?? 5);
            const startMs = params.StartDateTime.getTime();
            const endMs = params.EndDateTime.getTime();
            const spanHours = (endMs - startMs) / 3_600_000;

            const suggestions: MeetingTimeSuggestion[] = [];
            // Snap cursor up to nearest 30-minute boundary
            let cursor = Math.ceil(startMs / stepMs) * stepMs;

            while (cursor + durationMs <= endMs && suggestions.length < maxCandidates) {
                const candidateEnd = cursor + durationMs;
                const candidateDate = new Date(cursor);
                const hour = candidateDate.getHours();

                // Prefer business hours (08:00-18:00 local) when searching multi-day windows
                const withinBusinessHours = spanHours <= 12 || (hour >= 8 && hour < 18);
                if (withinBusinessHours) {
                    const isFree = (email: string): boolean => {
                        const blocks = busyBySchedule.get(email) ?? [];
                        return !blocks.some((b) => b.end > cursor && b.start < candidateEnd);
                    };

                    const organizerFree = isFree(organizer);
                    const attendeeStatuses = attendeeEmails.map((email) => ({
                        Email: email,
                        Availability: isFree(email) ? 'free' : 'busy',
                    }));
                    const allFree =
                        organizerFree && attendeeStatuses.every((a) => a.Availability === 'free');

                    if (allFree) {
                        suggestions.push({
                            StartTime: new Date(cursor),
                            EndTime: new Date(candidateEnd),
                            Confidence: 100,
                            OrganizerAvailability: 'free',
                            AttendeeAvailability: attendeeStatuses,
                            SuggestionReason: 'All attendees are available in local JSON calendar.',
                        });
                    }
                }
                cursor += stepMs;
            }

            return {
                Success: true,
                Suggestions: suggestions,
                EmptySuggestionsReason:
                    suggestions.length === 0 ? 'No mutually free meeting slots found in window.' : undefined,
            };
        } catch (error) {
            return {
                Success: false,
                Suggestions: [],
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public override async VerifyMailboxAccess(
        params: VerifyMailboxAccessParams,
        credentials?: ProviderCredentialsBase
    ): Promise<VerifyMailboxAccessResult> {
        const dir = this.ResolveDataDir(credentials);
        if (!dir) {
            return {
                Success: false,
                Identifier: params.Identifier,
                CanReadMail: false,
                CanReadCalendar: false,
                ErrorMessage: `${LOCAL_JSON_COMMUNICATION_PROVIDER_NAME} requires ${MJ_MOCK_COMM_DIR_ENV}.`,
            };
        }
        if (!params.Identifier || params.Identifier.trim().length === 0) {
            return {
                Success: false,
                Identifier: '',
                CanReadMail: false,
                CanReadCalendar: false,
                ErrorMessage: 'Mailbox Identifier is required.',
            };
        }
        try {
            this.LoadOrSeedMailbox(params.Identifier, credentials);
            return {
                Success: true,
                Identifier: params.Identifier,
                CanReadMail: true,
                CanReadCalendar: true,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return {
                Success: false,
                Identifier: params.Identifier,
                CanReadMail: false,
                CanReadCalendar: false,
                ErrorMessage: msg,
                MailErrorMessage: msg,
                CalendarErrorMessage: msg,
            };
        }
    }

    // =========================================================================
    // STANDARD CALENDAR CRUD OPERATIONS (Calendar.ts contract)
    // =========================================================================

    public override async CreateEvent(
        params: CreateEventParams,
        credentials?: ProviderCredentialsBase
    ): Promise<CalendarEventResult> {
        const targetErr = CalendarTargetError('CreateEvent', params.Target);
        if (targetErr) {
            return { Success: false, ErrorMessage: targetErr };
        }
        try {
            const mailbox = params.Target.Identifier.trim().toLowerCase();
            const state = this.LoadOrSeedMailbox(mailbox, credentials);
            const nowIso = new Date().toISOString();
            const eventId = `mock-evt-${crypto.randomUUID()}`;

            const stored: LocalJsonStoredEvent = {
                ID: eventId,
                SeriesID: null,
                ICalUID: `ical-${eventId}@local.mock`,
                Subject: params.Event.Subject,
                Body: params.Event.Body ?? '',
                StartTime: params.Event.Start.toISOString(),
                EndTime: params.Event.End.toISOString(),
                TimeZone: params.Event.TimeZone ?? 'UTC',
                IsAllDay: params.Event.IsAllDay ?? false,
                Location: params.Event.Location ?? null,
                Organizer: mailbox,
                Attendees: (params.Event.Attendees ?? []).map((a) => ({
                    Email: a.Email,
                    Name: a.Name,
                    Required: a.Type === 'Required',
                    Response: 'None',
                })),
                IsCancelled: false,
                OnlineMeetingUrl: params.Event.IsOnlineMeeting
                    ? `https://meet.local.mock/${eventId.slice(-8)}`
                    : null,
                ShowAs: 'Busy',
                LastModified: nowIso,
            };

            state.Events.push(stored);
            this.SaveMailbox(state, credentials);
            return { Success: true, Event: this.toCalendarEvent(stored) };
        } catch (error) {
            return {
                Success: false,
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public override async UpdateEvent(
        params: UpdateEventParams,
        credentials?: ProviderCredentialsBase
    ): Promise<CalendarEventResult> {
        const targetErr = CalendarTargetError('UpdateEvent', params.Target);
        if (targetErr) {
            return { Success: false, ErrorMessage: targetErr };
        }
        const updateErr = CalendarUpdateError(params.Changes);
        if (updateErr) {
            return { Success: false, ErrorMessage: updateErr };
        }
        try {
            const mailbox = params.Target.Identifier.trim().toLowerCase();
            const state = this.LoadOrSeedMailbox(mailbox, credentials);
            const idx = state.Events.findIndex((e) => UUIDsEqual(e.ID, params.ExternalEventID));
            if (idx < 0) {
                return {
                    Success: false,
                    ErrorMessage: `Calendar event '${params.ExternalEventID}' not found.`,
                };
            }
            const existing = state.Events[idx];
            const updated: LocalJsonStoredEvent = {
                ...existing,
                Subject: params.Changes.Subject ?? existing.Subject,
                Body: params.Changes.Body ?? existing.Body,
                StartTime: params.Changes.Start ? params.Changes.Start.toISOString() : existing.StartTime,
                EndTime: params.Changes.End ? params.Changes.End.toISOString() : existing.EndTime,
                TimeZone: params.Changes.TimeZone ?? existing.TimeZone,
                IsAllDay: params.Changes.IsAllDay ?? existing.IsAllDay,
                Location: params.Changes.Location !== undefined ? params.Changes.Location : existing.Location,
                Attendees: params.Changes.Attendees
                    ? params.Changes.Attendees.map((a) => ({
                          Email: a.Email,
                          Name: a.Name,
                          Required: a.Type === 'Required',
                          Response: 'None',
                      }))
                    : existing.Attendees,
                LastModified: new Date().toISOString(),
            };
            state.Events[idx] = updated;
            this.SaveMailbox(state, credentials);
            return { Success: true, Event: this.toCalendarEvent(updated) };
        } catch (error) {
            return {
                Success: false,
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public override async CancelEvent(
        params: CancelEventParams,
        credentials?: ProviderCredentialsBase
    ): Promise<BaseMessageResult> {
        const targetErr = CalendarTargetError('CancelEvent', params.Target);
        if (targetErr) {
            return { Success: false, ErrorMessage: targetErr };
        }
        try {
            const mailbox = params.Target.Identifier.trim().toLowerCase();
            const state = this.LoadOrSeedMailbox(mailbox, credentials);
            const existing = state.Events.find((e) => UUIDsEqual(e.ID, params.ExternalEventID));
            if (existing) {
                existing.IsCancelled = true;
                existing.LastModified = new Date().toISOString();
                this.SaveMailbox(state, credentials);
            }
            return { Success: true };
        } catch (error) {
            return {
                Success: false,
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public override async GetEvent(
        params: GetEventParams,
        credentials?: ProviderCredentialsBase
    ): Promise<CalendarEventResult> {
        const targetErr = CalendarTargetError('GetEvent', params.Target);
        if (targetErr) {
            return { Success: false, ErrorMessage: targetErr };
        }
        try {
            const mailbox = params.Target.Identifier.trim().toLowerCase();
            const state = this.LoadOrSeedMailbox(mailbox, credentials);
            const existing = state.Events.find((e) => UUIDsEqual(e.ID, params.ExternalEventID));
            if (!existing) {
                return {
                    Success: false,
                    ErrorMessage: `Calendar event '${params.ExternalEventID}' not found.`,
                };
            }
            return { Success: true, Event: this.toCalendarEvent(existing) };
        } catch (error) {
            return {
                Success: false,
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public override async SyncEvents(
        params: SyncEventsParams,
        credentials?: ProviderCredentialsBase
    ): Promise<SyncEventsResult> {
        const targetErr = CalendarTargetError('SyncEvents', params.Target);
        if (targetErr) {
            return { Success: false, Changes: [], ErrorMessage: targetErr };
        }
        try {
            const mailbox = params.Target.Identifier.trim().toLowerCase();
            const state = this.LoadOrSeedMailbox(mailbox, credentials);
            const sinceMs = params.SyncToken ? Date.parse(params.SyncToken) : NaN;

            const matching = state.Events.filter((e) => {
                if (Number.isFinite(sinceMs)) {
                    return Date.parse(e.LastModified) > sinceMs;
                }
                const s = Date.parse(e.StartTime);
                const end = Date.parse(e.EndTime);
                if (params.WindowStart && end <= params.WindowStart.getTime()) return false;
                if (params.WindowEnd && s >= params.WindowEnd.getTime()) return false;
                return true;
            });

            return {
                Success: true,
                Changes: matching.map((e) =>
                    e.IsCancelled
                        ? { Kind: 'Removed' as const, ExternalEventID: e.ID }
                        : { Kind: 'Upserted' as const, ExternalEventID: e.ID, Event: this.toCalendarEvent(e) }
                ),
                NextSyncToken: new Date().toISOString(),
            };
        } catch (error) {
            return {
                Success: false,
                Changes: [],
                ErrorMessage: error instanceof Error ? error.message : String(error),
            };
        }
    }
}

let _localJsonProviderRegistered = false;

/**
 * Programmatically registers {@link LocalJsonCommunicationProvider} with `MJGlobal.ClassFactory`
 * when `@memberjunction/communication-engine` is loaded (avoiding static manifest coupling in
 * `ServerBootstrap` while keeping `ClassFactory.CreateInstance(BaseCommunicationProvider, 'Local JSON Mock')` active).
 */
export function LoadLocalJsonCommunicationProvider(): void {
    if (_localJsonProviderRegistered) {
        return;
    }
    const cf = MJGlobal.Instance?.ClassFactory;
    if (cf && typeof cf.Register === 'function') {
        const existing =
            typeof cf.GetRegistration === 'function'
                ? cf.GetRegistration(BaseCommunicationProvider, LOCAL_JSON_COMMUNICATION_PROVIDER_NAME)
                : undefined;
        if (!existing) {
            cf.Register(BaseCommunicationProvider, LocalJsonCommunicationProvider, LOCAL_JSON_COMMUNICATION_PROVIDER_NAME);
        }
        _localJsonProviderRegistered = true;
    }
}

LoadLocalJsonCommunicationProvider();
