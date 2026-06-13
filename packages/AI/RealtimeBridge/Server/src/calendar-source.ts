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
 * unit-testable with an in-memory mock and production binds the real Microsoft Graph / Google Calendar
 * client behind it.
 *
 * An implementation watches **one** agent identity's calendar (the identity value is passed per call
 * so a single adapter instance can serve many identities on the same provider/credential).
 *
 * @see {@link GraphCalendarSource} / {@link GoogleCalendarSource} for the production binding stubs.
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
 * The error thrown by the production-binding stubs ({@link GraphCalendarSource},
 * {@link GoogleCalendarSource}) until a real calendar API is wired. Distinct type so a host can
 * detect "not yet bound" vs. a genuine transport failure.
 */
export class CalendarSourceNotBoundError extends Error {
    constructor(providerLabel: string) {
        super(
            `Calendar source for '${providerLabel}' is not bound. ` +
                `Bind the real ${providerLabel} calendar API (see TODO in the adapter) before use.`,
        );
        this.name = 'CalendarSourceNotBoundError';
    }
}

/**
 * **Production-binding stub** for Microsoft Graph calendars.
 *
 * In production this adapter binds the Microsoft Graph API — either delegated `/me/events` (per-user
 * mailbox) or the app-level `/users/{id}/events` / `/users/{id}/calendarView` with a `deltaLink`
 * cursor — using credentials resolved from the bridge provider's `Configuration` via MJ's credential
 * system (never inline). It must map each Graph event to a {@link NormalizedCalendarInvite}
 * (`onlineMeeting.joinUrl` → `JoinUrl`, `attendees[].emailAddress.address` → `Attendees[].Email`,
 * `start.dateTime`+`start.timeZone` → UTC `StartTime`) and carry the Graph `@odata.deltaLink` as the
 * cursor.
 *
 * Until that binding is implemented it throws {@link CalendarSourceNotBoundError} so a misconfigured
 * deployment fails loudly rather than silently never joining meetings.
 *
 * @remarks **TODO (production):** bind `@microsoft/microsoft-graph-client` (an optional dependency,
 * loaded only when a Graph-backed identity is configured), resolve the credential, and implement the
 * delta-query poll + normalization. Keep this class as the seam.
 */
export class GraphCalendarSource implements ICalendarSource {
    /** @inheritdoc */
    public async ListUpcomingInvites(
        _identityValue: string,
        _sinceCursor?: string,
    ): Promise<CalendarPollResult> {
        // TODO(production): call Microsoft Graph (/me/events or /users/{id}/calendarView delta),
        // resolve the credential from the provider Configuration, and normalize each event.
        throw new CalendarSourceNotBoundError('Microsoft Graph');
    }
}

/**
 * **Production-binding stub** for Google Calendar.
 *
 * In production this adapter binds the Google Calendar API (`calendar.events.list` on the agent's
 * calendar with a `syncToken` cursor, or a watch-channel push subscription) using credentials
 * resolved from the bridge provider's `Configuration` via MJ's credential system. It maps each Google
 * event to a {@link NormalizedCalendarInvite} (`hangoutLink` or
 * `conferenceData.entryPoints[].uri` → `JoinUrl`, `attendees[].email` → `Attendees[].Email`,
 * `start.dateTime` → UTC `StartTime`) and carries the Google `nextSyncToken` as the cursor.
 *
 * Until that binding is implemented it throws {@link CalendarSourceNotBoundError}.
 *
 * @remarks **TODO (production):** bind `googleapis` (an optional dependency, loaded only when a
 * Google-backed identity is configured), resolve the credential, and implement the sync-token poll +
 * normalization. Keep this class as the seam.
 */
export class GoogleCalendarSource implements ICalendarSource {
    /** @inheritdoc */
    public async ListUpcomingInvites(
        _identityValue: string,
        _sinceCursor?: string,
    ): Promise<CalendarPollResult> {
        // TODO(production): call Google Calendar (events.list with syncToken, or a watch channel),
        // resolve the credential from the provider Configuration, and normalize each event.
        throw new CalendarSourceNotBoundError('Google Calendar');
    }
}
