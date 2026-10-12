import type {
    BaseCommunicationProvider,
    CalendarEvent,
    CalendarTarget,
    ProviderCredentialsBase,
    SyncEventsResult,
} from '@memberjunction/communication-types';

/**
 * One attendee on a normalized calendar invite. Platform-agnostic — Graph's `attendees[].emailAddress`
 * and Google's `attendees[].email` both normalize to this shape.
 */
export interface CalendarInviteAttendee {
    /** The attendee's email address (the join key used to match an agent identity). */
    Email: string;

    /** The attendee's display name, when the calendar provides one. */
    DisplayName?: string;

    /** Response status, when known — used later for "the agent accepted" UX; not required to join. */
    ResponseStatus?: 'Accepted' | 'Declined' | 'Tentative' | 'NeedsAction';
}

/**
 * The organizer of a calendar invite (normalized).
 */
export interface CalendarInviteOrganizer {
    /** The organizer's email address. */
    Email: string;

    /** The organizer's display name, when provided. */
    DisplayName?: string;
}

/**
 * A **normalized** calendar invite — the provider-agnostic shape every {@link ICalendarSource}
 * adapter returns, regardless of whether it came from Microsoft Graph (`/me/events`) or the Google
 * Calendar API. The {@link CalendarWatcher} consumes only this shape, so adding a new calendar backend
 * never touches the watcher.
 */
export interface NormalizedCalendarInvite {
    /**
     * The platform's stable unique id for the event (Graph `event.id`, Google `event.id`). The
     * watcher dedupes on this so the same invite never spawns two scheduled bridges.
     */
    ExternalEventID: string;

    /** Human-readable subject/title of the meeting, when available (for diagnostics + display). */
    Subject?: string;

    /**
     * The online-meeting join URL (Graph `onlineMeeting.joinUrl`, Google `hangoutLink` /
     * `conferenceData.entryPoints[].uri`). May be absent for a non-online event — the watcher skips
     * invites with no join URL (there is nothing to bridge to).
     */
    JoinUrl?: string;

    /** The meeting's scheduled start time (UTC) — becomes the bridge's `ScheduledStartTime`. */
    StartTime: Date;

    /** The meeting's scheduled end time (UTC), when known. */
    EndTime?: Date;

    /** The full attendee list (normalized). The watcher confirms the agent identity is among them. */
    Attendees: CalendarInviteAttendee[];

    /** The organizer (normalized). */
    Organizer?: CalendarInviteOrganizer;
}

/**
 * The result of one poll of a calendar source: the new invites since the cursor, plus the cursor to
 * pass on the next poll. Cursors are opaque, provider-defined strings (Graph `deltaLink`, Google
 * `syncToken`, or an ISO timestamp watermark) — the watcher persists/forwards them without
 * interpreting them.
 */
export interface CalendarPollResult {
    /** The invites discovered in this poll (may be empty). */
    Invites: NormalizedCalendarInvite[];

    /**
     * The cursor to pass as `sinceCursor` on the next {@link ICalendarSource.ListUpcomingInvites}
     * call for this identity. `undefined` leaves the watcher's stored cursor unchanged.
     */
    NextCursor?: string;
}

/**
 * The **injectable calendar-API seam** — the per-provider calendar backend the {@link CalendarWatcher}
 * polls. This is the bridge program's "documented seam, not a hard dependency" pattern (mirroring the
 * bridge SDK seams and `IRealtimeSession`): the watcher depends only on this interface, so it is fully
 * unit-testable with an in-memory mock and production binds a Communication provider (Microsoft Graph,
 * Google Calendar) behind it.
 *
 * An implementation watches **one** agent identity's calendar (the identity value is passed per call
 * so a single adapter instance can serve many identities on the same provider/credential).
 *
 * @see {@link GraphCalendarSource} / {@link GoogleCalendarSource}, which read through the Communication providers.
 */
export interface ICalendarSource {
    /**
     * Lists invites for `identityValue`'s calendar that are new since `sinceCursor`. The adapter is
     * responsible only for *fetching + normalizing* — the watcher decides attendee-membership,
     * join-URL resolution, and dedupe. An adapter SHOULD return only upcoming (future-start) invites
     * where it can, but the watcher defends against past-start invites regardless.
     *
     * @param identityValue The agent identity's address (an email, for `IdentityType='Email'`).
     * @param sinceCursor The cursor returned by the previous poll, or `undefined` on the first poll.
     * @returns The new invites + the next cursor.
     * @throws May reject on transport/auth failure; the watcher catches per-identity and continues.
     */
    ListUpcomingInvites(identityValue: string, sinceCursor?: string): Promise<CalendarPollResult>;
}

/**
 * The error a {@link CommunicationCalendarSource} throws when it was built with no provider. Distinct
 * type so a host can detect "not yet bound" vs. a genuine transport failure.
 */
export class CalendarSourceNotBoundError extends Error {
    constructor(providerLabel: string) {
        super(
            `Calendar source for '${providerLabel}' is not bound. ` +
                `Construct it with the ${providerLabel} communication provider before use.`,
        );
        this.name = 'CalendarSourceNotBoundError';
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// The production sources: calendars read through MemberJunction Communication.
// The Microsoft Graph and Google Calendar providers own the vendor calls (SyncEvents: a Graph
// calendarView delta, a Google sync token); a source asks for changes since its cursor and keeps
// the events that can become invites. Only the communication-types package is needed here, and only
// for types: the caller hands in the provider instance.
// ──────────────────────────────────────────────────────────────────────────────

/** The one provider operation a calendar source uses. Any `BaseCommunicationProvider` satisfies it. */
export type CalendarSyncProvider = Pick<BaseCommunicationProvider, 'SyncEvents'>;

/** Options for {@link CommunicationCalendarSource}. */
export interface CommunicationCalendarSourceOptions {
    /** How far ahead (days) the first poll, or a poll after a refused cursor, reads. Defaults to 30. */
    LookaheadDays?: number;
    /** Clock seam for the first-poll window. Defaults to `Date.now`. */
    Now?: () => number;
}

/**
 * An {@link ICalendarSource} over a Communication provider's `SyncEvents`.
 *
 * The first poll reads `[now, now + LookaheadDays]`; later polls pass the provider's token back as
 * the cursor. A token the provider refuses (expired) is dropped and the window is read again, which
 * the watcher's dedupe makes harmless. Removed and cancelled events are not invites and are skipped.
 */
export class CommunicationCalendarSource implements ICalendarSource {
    private readonly provider?: CalendarSyncProvider;
    private readonly credentials?: ProviderCredentialsBase;
    private readonly options: CommunicationCalendarSourceOptions;
    private readonly providerLabel: string;

    /**
     * @param provider The communication provider to read through. Omit to keep the not-bound
     *   behaviour (every poll throws {@link CalendarSourceNotBoundError}).
     * @param credentials Passed to every call (for Graph, `{ accessToken }` with a bot token).
     * @param options Window and clock settings.
     * @param providerLabel Names the provider in errors.
     */
    constructor(provider?: CalendarSyncProvider, credentials?: ProviderCredentialsBase, options: CommunicationCalendarSourceOptions = {}, providerLabel: string = 'calendar') {
        this.provider = provider;
        this.credentials = credentials;
        this.options = options;
        this.providerLabel = providerLabel;
    }

    /** @inheritdoc */
    public async ListUpcomingInvites(identityValue: string, sinceCursor?: string): Promise<CalendarPollResult> {
        if (!this.provider) {
            throw new CalendarSourceNotBoundError(this.providerLabel);
        }
        let result = await this.sync(this.provider, identityValue, sinceCursor);
        if (sinceCursor && result.ResyncRequired) {
            result = await this.sync(this.provider, identityValue, undefined);
        }
        if (!result.Success) {
            throw new Error(result.ErrorMessage ?? `${this.providerLabel} calendar sync failed for ${identityValue}`);
        }
        const invites = result.Changes.map((change) => (change.Kind === 'Upserted' && change.Event ? NormalizeCalendarEvent(change.Event) : null)).filter(
            (invite): invite is NormalizedCalendarInvite => invite !== null,
        );
        return { Invites: invites, ...(result.NextSyncToken ? { NextCursor: result.NextSyncToken } : {}) };
    }

    /** Whose calendar a poll reads. The identity's address, in the account's default calendar. */
    protected BuildTarget(identityValue: string): CalendarTarget {
        return { Identifier: identityValue };
    }

    private sync(provider: CalendarSyncProvider, identityValue: string, cursor: string | undefined): Promise<SyncEventsResult> {
        const now = (this.options.Now ?? Date.now)();
        const lookaheadDays = this.options.LookaheadDays ?? DEFAULT_LOOKAHEAD_DAYS;
        return provider.SyncEvents(
            {
                Target: this.BuildTarget(identityValue),
                SyncToken: cursor,
                WindowStart: new Date(now),
                WindowEnd: new Date(now + lookaheadDays * MS_PER_DAY),
            },
            this.credentials,
        );
    }
}

/** Microsoft Graph calendars, read through `@memberjunction/communication-ms-graph`'s `MSGraphProvider`. */
export class GraphCalendarSource extends CommunicationCalendarSource {
    constructor(provider?: CalendarSyncProvider, credentials?: ProviderCredentialsBase, options: CommunicationCalendarSourceOptions = {}) {
        super(provider, credentials, options, 'Microsoft Graph');
    }
}

/**
 * Google calendars, read through `@memberjunction/communication-gmail`'s `GmailProvider`. Reads the
 * calendar whose ID is the identity's address, as the bridge always has: that is the account's
 * primary calendar when the credentials are the agent's own, and a shared one otherwise.
 */
export class GoogleCalendarSource extends CommunicationCalendarSource {
    constructor(provider?: CalendarSyncProvider, credentials?: ProviderCredentialsBase, options: CommunicationCalendarSourceOptions = {}) {
        super(provider, credentials, options, 'Google Calendar');
    }

    /** @inheritdoc */
    protected override BuildTarget(identityValue: string): CalendarTarget {
        return { Identifier: identityValue, CalendarID: identityValue };
    }
}

/**
 * **Pure** normalization of a Communication calendar event to a {@link NormalizedCalendarInvite}.
 * Returns `null` for a cancelled event or one with no id or no start. The join URL is the provider's
 * online-meeting URL, else the first Teams/Meet/Zoom link in the body.
 */
export function NormalizeCalendarEvent(event: CalendarEvent): NormalizedCalendarInvite | null {
    if (event.IsCancelled || !event.ExternalEventID || !event.Start) {
        return null;
    }
    const joinUrl = event.OnlineMeetingUrl?.trim() || extractJoinUrlFromText(event.Body);
    return {
        ExternalEventID: event.ExternalEventID,
        ...(event.Subject ? { Subject: event.Subject } : {}),
        ...(joinUrl ? { JoinUrl: joinUrl } : {}),
        StartTime: event.Start,
        ...(event.End ? { EndTime: event.End } : {}),
        Attendees: event.Attendees.map((a) => ({
            Email: a.Email,
            ...(a.Name ? { DisplayName: a.Name } : {}),
            ResponseStatus: a.Response === 'None' ? 'NeedsAction' : a.Response,
        })),
        ...(event.Organizer
            ? { Organizer: { Email: event.Organizer.Email, ...(event.Organizer.Name ? { DisplayName: event.Organizer.Name } : {}) } }
            : {}),
    };
}

/** Best-effort first online-meeting join URL embedded in a free-text/HTML body. Never throws. */
function extractJoinUrlFromText(content?: string): string | undefined {
    if (!content) {
        return undefined;
    }
    const match = content.match(
        /https?:\/\/[^\s"'<>]*(?:teams\.microsoft\.com\/l\/meetup-join|meet\.google\.com|zoom\.us\/j)[^\s"'<>]*/i,
    );
    return match ? match[0] : undefined;
}

/** First-poll window default (days). */
const DEFAULT_LOOKAHEAD_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
