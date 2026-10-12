/**
 * Calendar events on communication providers: create, update, cancel, read one, and sync.
 *
 * `GetEvents` (in `BaseProvider.ts`) stays what it was: a read of a time window. These are the
 * write and change-tracking half. A provider that supports them lists the operations in
 * `getSupportedOperations()`; every other provider inherits a refusal that names itself.
 *
 * WHOSE CALENDAR IS NEVER IMPLIED. Every call names it through a {@link CalendarTarget}. A provider
 * must not fall back to a deployment default (an `accountEmail` on the credential, an env var) for
 * these operations, so an event never lands in a service mailbox because a caller forgot to say
 * whose meeting it is. {@link CalendarTargetError} is the one check every provider runs first.
 *
 * This module has no runtime imports, so provider tests can load it without the rest of the package.
 */
import type { BaseMessageResult } from './BaseProvider';

/** Which calendar an operation acts on. */
export type CalendarTarget = {
    /** Whose calendar: a mailbox address for MS Graph, the account for Google. Required. */
    Identifier: string;
    /** A calendar within the account. Omit for the account's default calendar. */
    CalendarID?: string;
};

export type CalendarAttendeeType = 'Required' | 'Optional';

/** An attendee's reply. `None` covers "not yet replied" and anything a provider reports that is not a reply. */
export type CalendarAttendeeResponse = 'None' | 'Accepted' | 'Tentative' | 'Declined';

export type CalendarEventAttendeeInput = {
    Email: string;
    Name?: string;
    Type: CalendarAttendeeType;
};

/**
 * An event to create, or (as a `Partial`) the fields to change on one.
 *
 * Start and End are instants. `TimeZone` (an IANA name, default UTC) is the zone the event is shown
 * and recurs in. For an all-day event Start and End are read as calendar days in that zone, and End
 * is exclusive: a one-day event on 3 March ends on 4 March, as both Graph and Google expect.
 */
export type CalendarEventInput = {
    Subject: string;
    Body?: string;
    /** How `Body` is to be read. Default `Text`. */
    BodyType?: 'Text' | 'HTML';
    Start: Date;
    End: Date;
    TimeZone?: string;
    IsAllDay?: boolean;
    Location?: string;
    /** Invitations go to these addresses when the event is created or its attendees change. Replaces the list on update. */
    Attendees?: CalendarEventAttendeeInput[];
    /** Ask the provider to attach an online meeting (Teams for Graph, Meet for Google). */
    IsOnlineMeeting?: boolean;
};

export type CalendarEventAttendee = CalendarEventAttendeeInput & {
    Response: CalendarAttendeeResponse;
};

/** One event as a provider reports it. Lossy by design, like `GetEventsEvent`. */
export type CalendarEvent = {
    /** The provider's ID for the event in this calendar. Differs between attendees' calendars. */
    ExternalEventID: string;
    /** The recurring series this occurrence belongs to, when it is one. */
    SeriesID: string | null;
    /** The iCalendar UID: the same in every attendee's calendar, so it is what other calendars match on. */
    ICalUID: string | null;
    Subject: string;
    Body: string;
    /** Null when the provider sent a time that does not determine an instant. Never a guess. */
    Start: Date | null;
    End: Date | null;
    IsAllDay: boolean;
    Location: string | null;
    Organizer: { Email: string; Name?: string } | null;
    /** As the provider lists them (Google includes the organizer, Graph does not). */
    Attendees: CalendarEventAttendee[];
    IsCancelled: boolean;
    OnlineMeetingUrl: string | null;
    LastModified: Date | null;
};

export type CreateEventParams = {
    Target: CalendarTarget;
    Event: CalendarEventInput;
};

export type UpdateEventParams = {
    Target: CalendarTarget;
    ExternalEventID: string;
    /** Only the fields to change. */
    Changes: Partial<CalendarEventInput>;
};

export type CancelEventParams = {
    Target: CalendarTarget;
    ExternalEventID: string;
    /** Sent to attendees with the cancellation, where the provider supports one. */
    Comment?: string;
};

export type GetEventParams = {
    Target: CalendarTarget;
    ExternalEventID: string;
};

export type CalendarEventResult = BaseMessageResult & {
    Event?: CalendarEvent;
};

/**
 * One incremental read of a calendar's changes.
 *
 * With no `SyncToken` this is a full sync of the window; with one, the window is ignored and the
 * provider returns what changed since the token was issued.
 */
export type SyncEventsParams = {
    Target: CalendarTarget;
    SyncToken?: string;
    WindowStart?: Date;
    WindowEnd?: Date;
};

export type CalendarEventChange = {
    /** `Removed`: the event is gone from this calendar (deleted, or cancelled by its organizer). */
    Kind: 'Upserted' | 'Removed';
    ExternalEventID: string;
    /** Present for `Upserted`. */
    Event?: CalendarEvent;
};

export type SyncEventsResult = BaseMessageResult & {
    Changes: CalendarEventChange[];
    /** The token for the next incremental sync. Store it only after the changes are applied. */
    NextSyncToken?: string;
    /** The token was refused as expired or invalid: drop it and run a full sync of the window. */
    ResyncRequired?: boolean;
};

/**
 * The check every calendar operation runs before anything else: a message when the call names no
 * calendar, `null` when it does.
 */
export function CalendarTargetError(operation: string, target: CalendarTarget | null | undefined): string | null {
    if (target && typeof target.Identifier === 'string' && target.Identifier.trim() !== '') {
        return null;
    }
    return `${operation} needs a Target with an Identifier (whose calendar). Calendar operations never fall back to a default account.`;
}

/**
 * An instant as wall-clock time in an IANA time zone, `YYYY-MM-DDTHH:mm:ss`, which is the form
 * Graph's `dateTimeTimeZone` wants. The first ten characters are the calendar day, which is what an
 * all-day event needs. Throws `RangeError` for a zone the runtime does not know.
 */
export function CalendarWallClock(when: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).formatToParts(when);
    const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '00';
    return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`;
}
