/**
 * Pure mapping between MemberJunction's calendar shapes and Google Calendar's `Event` resource. No
 * client, no network: {@link GmailProvider} does the calls and these build the bodies and read the
 * replies.
 */
import { randomUUID } from 'crypto';
import {
    CalendarAttendeeResponse,
    CalendarEvent,
    CalendarEventAttendee,
    CalendarEventChange,
    CalendarEventInput,
    CalendarWallClock
} from '@memberjunction/communication-types';
import googleApis from 'googleapis';

type GoogleEvent = googleApis.calendar_v3.Schema$Event;
type GoogleEventDateTime = googleApis.calendar_v3.Schema$EventDateTime;

/**
 * The request body for `events.insert` (all fields) or `events.patch` (only those present).
 *
 * A timed slot is the instant (RFC 3339, UTC) plus the zone the event is shown and recurs in; an
 * all-day slot is the calendar day in that zone. Google's descriptions take HTML, so `BodyType`
 * needs no translation.
 */
export function BuildGoogleEventBody(input: Partial<CalendarEventInput>): GoogleEvent {
    const body: GoogleEvent = {};
    const zone = input.TimeZone?.trim() || 'UTC';
    if (input.Subject !== undefined) body.summary = input.Subject;
    if (input.Body !== undefined) body.description = input.Body;
    if (input.Start) body.start = googleSlot(input.Start, zone, input.IsAllDay === true);
    if (input.End) body.end = googleSlot(input.End, zone, input.IsAllDay === true);
    if (input.Location !== undefined) body.location = input.Location;
    if (input.Attendees) {
        body.attendees = input.Attendees.map((a) => ({
            email: a.Email,
            ...(a.Name ? { displayName: a.Name } : {}),
            ...(a.Type === 'Optional' ? { optional: true } : {})
        }));
    }
    if (input.IsOnlineMeeting) {
        // Google creates the Meet link asynchronously from this request; the call must also pass
        // conferenceDataVersion: 1 or the request is silently ignored.
        body.conferenceData = { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } };
    }
    return body;
}

function googleSlot(when: Date, zone: string, allDay: boolean): GoogleEventDateTime {
    return allDay ? { date: CalendarWallClock(when, zone).slice(0, 10) } : { dateTime: when.toISOString(), timeZone: zone };
}

/** A Google event as MemberJunction's read model. */
export function ToCalendarEvent(raw: GoogleEvent): CalendarEvent {
    const organizer = raw.organizer?.email?.trim();
    return {
        ExternalEventID: raw.id ?? '',
        SeriesID: raw.recurringEventId ?? null,
        ICalUID: raw.iCalUID ?? null,
        Subject: raw.summary ?? '',
        Body: raw.description ?? '',
        Start: GoogleInstant(raw.start),
        End: GoogleInstant(raw.end),
        IsAllDay: !!raw.start?.date && !raw.start?.dateTime,
        Location: raw.location ?? null,
        Organizer: organizer ? { Email: organizer, ...(raw.organizer?.displayName ? { Name: raw.organizer.displayName } : {}) } : null,
        Attendees: (raw.attendees ?? []).map(toAttendee).filter((a): a is CalendarEventAttendee => a !== null),
        IsCancelled: raw.status === 'cancelled',
        OnlineMeetingUrl: meetingUrl(raw),
        LastModified: raw.updated ? new Date(raw.updated) : null
    };
}

/**
 * A synced item as a change. Google reports a deleted event, or one its organizer cancelled, as an
 * item with `status: cancelled` and little else, so that is a `Removed`.
 */
export function ToCalendarChange(item: GoogleEvent): CalendarEventChange {
    if (item.status === 'cancelled') {
        return { Kind: 'Removed', ExternalEventID: item.id ?? '' };
    }
    return { Kind: 'Upserted', ExternalEventID: item.id ?? '', Event: ToCalendarEvent(item) };
}

/** A timed value carries its own offset; an all-day `date` is midnight UTC of that day. Null when neither parses. */
export function GoogleInstant(slot: GoogleEventDateTime | null | undefined): Date | null {
    const raw = slot?.dateTime?.trim() || (slot?.date?.trim() ? `${slot.date.trim()}T00:00:00Z` : '');
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Google's `responseStatus` as MemberJunction's. `needsAction` and anything unknown read as `None`. */
export function MapGoogleResponse(response: string | null | undefined): CalendarAttendeeResponse {
    switch (response) {
        case 'accepted':
            return 'Accepted';
        case 'tentative':
            return 'Tentative';
        case 'declined':
            return 'Declined';
        default:
            return 'None';
    }
}

function toAttendee(raw: googleApis.calendar_v3.Schema$EventAttendee): CalendarEventAttendee | null {
    const email = raw.email?.trim();
    if (!email) return null;
    return {
        Email: email,
        ...(raw.displayName ? { Name: raw.displayName } : {}),
        Type: raw.optional ? 'Optional' : 'Required',
        Response: MapGoogleResponse(raw.responseStatus)
    };
}

function meetingUrl(raw: GoogleEvent): string | null {
    const video = (raw.conferenceData?.entryPoints ?? []).find((e) => e.entryPointType === 'video' && !!e.uri);
    return video?.uri ?? raw.hangoutLink ?? null;
}
