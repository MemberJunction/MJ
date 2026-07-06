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

// ──────────────────────────────────────────────────────────────────────────────
// Microsoft Graph calendar — injected minimal surface + PURE event normalization.
// Production wires `IGraphCalendarLike` over `@microsoft/microsoft-graph-client`
// (an optionalDependency); tests inject a fake. NO Graph SDK types leak through.
// ──────────────────────────────────────────────────────────────────────────────

/** A Graph `dateTimeTimeZone` value (`{ dateTime, timeZone }`) as `/me/events` reports start/end. */
export interface GraphDateTimeTimeZone {
    /** The local date-time string (e.g. `2026-06-24T15:00:00.0000000`). */
    dateTime?: string;
    /** The IANA/Windows time-zone name (e.g. `UTC`, `Pacific Standard Time`). `UTC` is the common case. */
    timeZone?: string;
}

/** A Graph `emailAddress` value (`{ address, name }`) used by attendees + organizer. */
export interface GraphEmailAddress {
    /** The email address. */
    address?: string;
    /** The display name, when Graph provides one. */
    name?: string;
}

/** One Graph attendee (`event.attendees[]`). */
export interface GraphAttendee {
    /** The attendee's email-address block. */
    emailAddress?: GraphEmailAddress;
    /** The attendee's response (`{ response, time }`). */
    status?: { response?: string };
}

/** The Graph `onlineMeeting` facet (`event.onlineMeeting.joinUrl`). */
export interface GraphOnlineMeeting {
    /** The online-meeting join URL. */
    joinUrl?: string;
}

/** The Graph `event.body` facet — HTML/text body that may carry a join URL when `onlineMeeting` is absent. */
export interface GraphItemBody {
    /** `'html'` or `'text'`. */
    contentType?: string;
    /** The body content (HTML or plain text). */
    content?: string;
}

/** The subset of a Graph calendar `event` resource this adapter normalizes. */
export interface GraphCalendarEvent {
    /** Graph `event.id` — the stable external event id. */
    id?: string;
    /** Graph `event.subject` — the meeting title. */
    subject?: string;
    /** Graph `event.onlineMeeting.joinUrl`. */
    onlineMeeting?: GraphOnlineMeeting;
    /** Graph `event.onlineMeetingUrl` (legacy flat field, when present). */
    onlineMeetingUrl?: string;
    /** Graph `event.body` — searched for a join URL when no structured field is present. */
    body?: GraphItemBody;
    /** Graph `event.start`. */
    start?: GraphDateTimeTimeZone;
    /** Graph `event.end`. */
    end?: GraphDateTimeTimeZone;
    /** Graph `event.attendees`. */
    attendees?: GraphAttendee[];
    /** Graph `event.organizer.emailAddress`. */
    organizer?: { emailAddress?: GraphEmailAddress };
}

/** One page of Graph delta results — the events + the cursor for the next call. */
export interface GraphEventPage {
    /** The events on this page. */
    value: GraphCalendarEvent[];
    /** Graph `@odata.nextLink` — present when more pages remain in this poll. */
    nextLink?: string;
    /** Graph `@odata.deltaLink` — present on the final page; becomes the next poll's `sinceCursor`. */
    deltaLink?: string;
}

/**
 * The minimal Microsoft Graph calendar surface {@link GraphCalendarSource} drives. A production wiring
 * implements this over `@microsoft/microsoft-graph-client` — `GET /users/{userId}/calendarView/delta`
 * (or `/me/events/delta`), following `@odata.nextLink` page-to-page and capturing the final
 * `@odata.deltaLink`. Tests inject a fake. NO Graph SDK types leak through this surface.
 */
export interface IGraphCalendarLike {
    /**
     * Lists one page of calendar events for `userId`. `deltaLink` is the opaque cursor from a prior
     * poll's final page (or `undefined` for the first poll); `nextLink` is the in-poll continuation
     * token. The adapter pages by following `nextLink` until the surface returns a `deltaLink`.
     *
     * @param userId The mailbox/identity address whose calendar to read.
     * @param cursor The Graph delta/next link to resume from (opaque), or `undefined` to start fresh.
     */
    listEvents(userId: string, cursor?: string): Promise<GraphEventPage>;
}

/**
 * **Pure** parse of a Graph {@link GraphDateTimeTimeZone} to a UTC {@link Date}. Treats a missing or
 * `UTC`/`Z` time zone as UTC (the common case for Graph delta queries, which can be requested in UTC);
 * for a non-UTC named zone it parses the wall-clock string and appends `Z` (best-effort — production
 * SHOULD request UTC via the `Prefer: outlook.timezone="UTC"` header). Returns `null` on absent/invalid.
 */
export function parseGraphDateTime(value?: GraphDateTimeTimeZone): Date | null {
    const raw = value?.dateTime?.trim();
    if (!raw) {
        return null;
    }
    const zone = (value?.timeZone ?? '').trim().toLowerCase();
    const hasZoneSuffix = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
    const iso = hasZoneSuffix || zone === 'utc' || zone === '' ? ensureUtcSuffix(raw) : `${raw}Z`;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Appends `Z` to a bare wall-clock string that lacks any zone suffix, leaving zoned strings untouched. */
function ensureUtcSuffix(raw: string): string {
    return /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
}

/** Maps a Graph attendee `status.response` to the normalized {@link CalendarInviteAttendee.ResponseStatus}. */
export function mapGraphResponseStatus(
    response?: string,
): CalendarInviteAttendee['ResponseStatus'] | undefined {
    switch ((response ?? '').trim().toLowerCase()) {
        case 'accepted':
        case 'organizer':
            return 'Accepted';
        case 'declined':
            return 'Declined';
        case 'tentativelyaccepted':
            return 'Tentative';
        case 'notresponded':
        case 'none':
            return 'NeedsAction';
        default:
            return undefined;
    }
}

/**
 * **Pure** extraction of an online-meeting join URL from a Graph event. Prefers the structured
 * `onlineMeeting.joinUrl`, then the legacy flat `onlineMeetingUrl`, then the first Teams `meetup-join`
 * URL found in the event body (HTML or text). Returns `undefined` when no join URL is present.
 */
export function extractGraphJoinUrl(event: GraphCalendarEvent): string | undefined {
    const structured = event.onlineMeeting?.joinUrl?.trim() || event.onlineMeetingUrl?.trim();
    if (structured) {
        return structured;
    }
    return extractJoinUrlFromText(event.body?.content);
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

/**
 * **Pure** normalization of one Graph calendar event to a {@link NormalizedCalendarInvite}. Skips
 * (returns `null`) an event with no id or no resolvable start time, so the caller can drop it cleanly.
 */
export function normalizeGraphEvent(event: GraphCalendarEvent): NormalizedCalendarInvite | null {
    const start = parseGraphDateTime(event.start);
    if (!event.id || !start) {
        return null;
    }
    const attendees: CalendarInviteAttendee[] = (event.attendees ?? [])
        .map(toNormalizedAttendee)
        .filter((a): a is CalendarInviteAttendee => a !== null);
    const organizerEmail = event.organizer?.emailAddress?.address?.trim();
    const end = parseGraphDateTime(event.end);
    return {
        ExternalEventID: event.id,
        ...(event.subject ? { Subject: event.subject } : {}),
        ...(extractGraphJoinUrl(event) ? { JoinUrl: extractGraphJoinUrl(event) } : {}),
        StartTime: start,
        ...(end ? { EndTime: end } : {}),
        Attendees: attendees,
        ...(organizerEmail
            ? {
                  Organizer: {
                      Email: organizerEmail,
                      ...(event.organizer?.emailAddress?.name
                          ? { DisplayName: event.organizer.emailAddress.name }
                          : {}),
                  },
              }
            : {}),
    };
}

/** Maps one Graph attendee to a normalized attendee, or `null` when it carries no email address. */
function toNormalizedAttendee(attendee: GraphAttendee): CalendarInviteAttendee | null {
    const email = attendee.emailAddress?.address?.trim();
    if (!email) {
        return null;
    }
    const responseStatus = mapGraphResponseStatus(attendee.status?.response);
    return {
        Email: email,
        ...(attendee.emailAddress?.name ? { DisplayName: attendee.emailAddress.name } : {}),
        ...(responseStatus ? { ResponseStatus: responseStatus } : {}),
    };
}

/**
 * **Production binding** for Microsoft Graph calendars over an injected {@link IGraphCalendarLike}
 * surface, so it builds + unit-tests with no Graph SDK install and no network.
 *
 * Pages a Graph delta poll: starting from `sinceCursor` (a prior `@odata.deltaLink`), it follows
 * `@odata.nextLink` page-to-page, normalizing every event via {@link normalizeGraphEvent}, until the
 * surface returns a `@odata.deltaLink` — which becomes the {@link CalendarPollResult.NextCursor} for the
 * next poll. Credentials are resolved upstream (the host binds {@link IGraphCalendarLike} with a Graph
 * client authenticated from the provider `Configuration` via MJ's credential system — never inline).
 *
 * When no surface is supplied it preserves the original not-bound behavior, throwing
 * {@link CalendarSourceNotBoundError} so a misconfigured deployment fails loudly.
 *
 * @remarks **TODO (production):** bind `@microsoft/microsoft-graph-client` (an optionalDependency,
 * loaded only when a Graph-backed identity is configured), request UTC via
 * `Prefer: outlook.timezone="UTC"`, and inject it as {@link IGraphCalendarLike}.
 */
export class GraphCalendarSource implements ICalendarSource {
    private readonly graph?: IGraphCalendarLike;

    /**
     * @param graph The injected Graph calendar surface. Omit to preserve the not-bound seam behavior
     *   (every poll throws {@link CalendarSourceNotBoundError}).
     */
    constructor(graph?: IGraphCalendarLike) {
        this.graph = graph;
    }

    /** @inheritdoc */
    public async ListUpcomingInvites(
        identityValue: string,
        sinceCursor?: string,
    ): Promise<CalendarPollResult> {
        if (!this.graph) {
            throw new CalendarSourceNotBoundError('Microsoft Graph');
        }
        const invites: NormalizedCalendarInvite[] = [];
        let cursor = sinceCursor;
        let nextCursor: string | undefined;
        // Follow @odata.nextLink within the poll; stop once a @odata.deltaLink (the next poll's cursor)
        // is returned. A defensive page cap guards a misbehaving surface from an unbounded loop.
        for (let page = 0; page < MAX_GRAPH_PAGES; page++) {
            const result = await this.graph.listEvents(identityValue, cursor);
            for (const event of result.value ?? []) {
                const invite = normalizeGraphEvent(event);
                if (invite) {
                    invites.push(invite);
                }
            }
            if (result.deltaLink) {
                nextCursor = result.deltaLink;
                break;
            }
            if (!result.nextLink) {
                break; // no further pages and no delta link — leave the stored cursor unchanged.
            }
            cursor = result.nextLink;
        }
        return { Invites: invites, ...(nextCursor ? { NextCursor: nextCursor } : {}) };
    }
}

/** Defensive cap on Graph delta pages followed in a single poll (guards a misbehaving surface). */
const MAX_GRAPH_PAGES = 1000;

// ──────────────────────────────────────────────────────────────────────────────
// Google Calendar — injected minimal surface + PURE event normalization.
// Production wires `IGoogleCalendarLike` over `googleapis` (an optionalDependency);
// tests inject a fake. NO googleapis types leak through.
// ──────────────────────────────────────────────────────────────────────────────

/** A Google `EventDateTime` (`{ dateTime, date, timeZone }`). `dateTime` is RFC3339 with offset. */
export interface GoogleEventDateTime {
    /** RFC3339 timed value with offset (e.g. `2026-06-24T15:00:00-07:00` or `…Z`). */
    dateTime?: string;
    /** All-day `date` value (`YYYY-MM-DD`) — treated as UTC midnight when no `dateTime` is present. */
    date?: string;
    /** The IANA time zone, when supplied. */
    timeZone?: string;
}

/** One Google `Event.attendees[]`. */
export interface GoogleAttendee {
    /** The attendee's email address. */
    email?: string;
    /** The attendee's display name, when present. */
    displayName?: string;
    /** Google response status (`accepted` / `declined` / `tentative` / `needsAction`). */
    responseStatus?: string;
    /** Whether this attendee is the organizer. */
    organizer?: boolean;
}

/** One Google `conferenceData.entryPoints[]`. */
export interface GoogleConferenceEntryPoint {
    /** Entry-point type (`video` / `phone` / `more` / `sip`). Only `video` carries a join URL we use. */
    entryPointType?: string;
    /** The entry-point URI (the join URL for `video`). */
    uri?: string;
}

/** The subset of a Google Calendar `Event` resource this adapter normalizes. */
export interface GoogleCalendarEvent {
    /** Google `event.id` — the stable external event id. */
    id?: string;
    /** Google `event.summary` — the meeting title. */
    summary?: string;
    /** Google `event.hangoutLink` — the Meet join URL (legacy flat field). */
    hangoutLink?: string;
    /** Google `event.conferenceData.entryPoints` — the modern conferencing block. */
    conferenceData?: { entryPoints?: GoogleConferenceEntryPoint[] };
    /** Google `event.start`. */
    start?: GoogleEventDateTime;
    /** Google `event.end`. */
    end?: GoogleEventDateTime;
    /** Google `event.attendees`. */
    attendees?: GoogleAttendee[];
    /** Google `event.organizer` (`{ email, displayName }`). */
    organizer?: { email?: string; displayName?: string };
    /** Google `event.status` — `cancelled` events are dropped from the normalized result. */
    status?: string;
}

/** One page of Google `events.list` results — events + paging/sync tokens. */
export interface GoogleEventPage {
    /** The events on this page. */
    items: GoogleCalendarEvent[];
    /** Google `nextPageToken` — present when more pages remain in this poll. */
    nextPageToken?: string;
    /** Google `nextSyncToken` — present on the final page; becomes the next poll's `sinceCursor`. */
    nextSyncToken?: string;
}

/** Arguments for one {@link IGoogleCalendarLike.listEvents} call — sync-token OR page-token paging. */
export interface GoogleListEventsArgs {
    /** The calendar id to read (the agent's mailbox/identity address; `primary` for the user's default). */
    calendarId: string;
    /** Incremental-sync token from a prior poll's final page (mutually exclusive with `pageToken`). */
    syncToken?: string;
    /** In-poll continuation token (`nextPageToken`) when following pages of the current poll. */
    pageToken?: string;
}

/**
 * The minimal Google Calendar surface {@link GoogleCalendarSource} drives. A production wiring
 * implements this over `googleapis` — `calendar.events.list({ calendarId, syncToken | pageToken })` —
 * following `nextPageToken` page-to-page and capturing the final `nextSyncToken`. Tests inject a fake.
 * NO googleapis types leak through this surface.
 */
export interface IGoogleCalendarLike {
    /** Lists one page of events for a calendar, paging via `pageToken` and syncing via `syncToken`. */
    listEvents(args: GoogleListEventsArgs): Promise<GoogleEventPage>;
}

/**
 * **Pure** parse of a Google {@link GoogleEventDateTime} to a UTC {@link Date}. Uses the RFC3339
 * `dateTime` (which carries its own offset) when present, else an all-day `date` as UTC midnight.
 * Returns `null` on absent/invalid.
 */
export function parseGoogleDateTime(value?: GoogleEventDateTime): Date | null {
    const timed = value?.dateTime?.trim();
    if (timed) {
        const parsed = new Date(timed);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const allDay = value?.date?.trim();
    if (allDay) {
        const parsed = new Date(`${allDay}T00:00:00Z`);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
}

/** Maps a Google `responseStatus` to the normalized {@link CalendarInviteAttendee.ResponseStatus}. */
export function mapGoogleResponseStatus(
    response?: string,
): CalendarInviteAttendee['ResponseStatus'] | undefined {
    switch ((response ?? '').trim().toLowerCase()) {
        case 'accepted':
            return 'Accepted';
        case 'declined':
            return 'Declined';
        case 'tentative':
            return 'Tentative';
        case 'needsaction':
            return 'NeedsAction';
        default:
            return undefined;
    }
}

/**
 * **Pure** extraction of the Meet/online-meeting join URL from a Google event. Prefers the first
 * `video` entry-point in `conferenceData`, then the legacy `hangoutLink`. Returns `undefined` when no
 * video conferencing is attached.
 */
export function extractGoogleJoinUrl(event: GoogleCalendarEvent): string | undefined {
    const video = (event.conferenceData?.entryPoints ?? []).find(
        (e) => (e.entryPointType ?? '').trim().toLowerCase() === 'video' && !!e.uri?.trim(),
    );
    return video?.uri?.trim() || event.hangoutLink?.trim() || undefined;
}

/**
 * **Pure** normalization of one Google calendar event to a {@link NormalizedCalendarInvite}. Skips
 * (returns `null`) a cancelled event or one with no id or no resolvable start time.
 */
export function normalizeGoogleEvent(event: GoogleCalendarEvent): NormalizedCalendarInvite | null {
    if ((event.status ?? '').trim().toLowerCase() === 'cancelled') {
        return null;
    }
    const start = parseGoogleDateTime(event.start);
    if (!event.id || !start) {
        return null;
    }
    const attendees: CalendarInviteAttendee[] = (event.attendees ?? [])
        .map(toNormalizedGoogleAttendee)
        .filter((a): a is CalendarInviteAttendee => a !== null);
    const organizerEmail = event.organizer?.email?.trim();
    const joinUrl = extractGoogleJoinUrl(event);
    const end = parseGoogleDateTime(event.end);
    return {
        ExternalEventID: event.id,
        ...(event.summary ? { Subject: event.summary } : {}),
        ...(joinUrl ? { JoinUrl: joinUrl } : {}),
        StartTime: start,
        ...(end ? { EndTime: end } : {}),
        Attendees: attendees,
        ...(organizerEmail
            ? {
                  Organizer: {
                      Email: organizerEmail,
                      ...(event.organizer?.displayName ? { DisplayName: event.organizer.displayName } : {}),
                  },
              }
            : {}),
    };
}

/** Maps one Google attendee to a normalized attendee, or `null` when it carries no email address. */
function toNormalizedGoogleAttendee(attendee: GoogleAttendee): CalendarInviteAttendee | null {
    const email = attendee.email?.trim();
    if (!email) {
        return null;
    }
    const responseStatus = mapGoogleResponseStatus(attendee.responseStatus);
    return {
        Email: email,
        ...(attendee.displayName ? { DisplayName: attendee.displayName } : {}),
        ...(responseStatus ? { ResponseStatus: responseStatus } : {}),
    };
}

/**
 * **Production binding** for Google Calendar over an injected {@link IGoogleCalendarLike} surface, so
 * it builds + unit-tests with no `googleapis` install and no network.
 *
 * Pages an incremental sync: starting from `sinceCursor` (a prior `nextSyncToken`), it follows
 * `nextPageToken` page-to-page, normalizing every event via {@link normalizeGoogleEvent}, until the
 * surface returns a `nextSyncToken` — which becomes the {@link CalendarPollResult.NextCursor}.
 * Credentials are resolved upstream (the host binds {@link IGoogleCalendarLike} with a Calendar client
 * authenticated from the provider `Configuration` via MJ's credential system — never inline).
 *
 * When no surface is supplied it preserves the original not-bound behavior, throwing
 * {@link CalendarSourceNotBoundError}.
 *
 * @remarks **TODO (production):** bind `googleapis` (an optionalDependency, loaded only when a
 * Google-backed identity is configured) and inject it as {@link IGoogleCalendarLike}.
 */
export class GoogleCalendarSource implements ICalendarSource {
    private readonly calendar?: IGoogleCalendarLike;

    /**
     * @param calendar The injected Google calendar surface. Omit to preserve the not-bound seam
     *   behavior (every poll throws {@link CalendarSourceNotBoundError}).
     */
    constructor(calendar?: IGoogleCalendarLike) {
        this.calendar = calendar;
    }

    /** @inheritdoc */
    public async ListUpcomingInvites(
        identityValue: string,
        sinceCursor?: string,
    ): Promise<CalendarPollResult> {
        if (!this.calendar) {
            throw new CalendarSourceNotBoundError('Google Calendar');
        }
        const invites: NormalizedCalendarInvite[] = [];
        let pageToken: string | undefined;
        let nextCursor: string | undefined;
        for (let page = 0; page < MAX_GOOGLE_PAGES; page++) {
            // syncToken and pageToken are mutually exclusive: use the sync token only on the first
            // request of a poll, then switch to page tokens for in-poll continuation.
            const args: GoogleListEventsArgs =
                pageToken !== undefined
                    ? { calendarId: identityValue, pageToken }
                    : { calendarId: identityValue, ...(sinceCursor ? { syncToken: sinceCursor } : {}) };
            const result = await this.calendar.listEvents(args);
            for (const event of result.items ?? []) {
                const invite = normalizeGoogleEvent(event);
                if (invite) {
                    invites.push(invite);
                }
            }
            if (result.nextPageToken) {
                pageToken = result.nextPageToken;
                continue;
            }
            nextCursor = result.nextSyncToken; // final page carries the sync token for the next poll.
            break;
        }
        return { Invites: invites, ...(nextCursor ? { NextCursor: nextCursor } : {}) };
    }
}

/** Defensive cap on Google page-token follows in a single poll (guards a misbehaving surface). */
const MAX_GOOGLE_PAGES = 1000;
