/**
 * Pure mapping between MemberJunction's calendar shapes and Graph's `event` resource. No client, no
 * network: {@link MSGraphProvider} does the calls and these build the bodies and read the replies.
 */
import {
    CalendarAttendeeResponse,
    CalendarEvent,
    CalendarEventAttendee,
    CalendarEventChange,
    CalendarEventInput,
    CalendarWallClock
} from '@memberjunction/communication-types';
import type { Attendee as GraphAttendee, Event as GraphEvent } from '@microsoft/microsoft-graph-types';

/** An item from a `calendarView/delta` page: an event, or a tombstone for one that is gone. */
export type GraphDeltaItem = GraphEvent & {
    // case-violation-ok-legacy-back-compat: Graph's wire format, not ours to choose
    '@removed'?: { reason?: string };
};

/** One page of a `calendarView/delta` read. */
export type GraphDeltaPage = {
    value?: GraphDeltaItem[]; // case-violation-ok-legacy-back-compat: Graph's wire format, not ours to choose
    '@odata.nextLink'?: string;
    '@odata.deltaLink'?: string;
};

/** A Graph date slot as an instant, or null when it does not determine one. */
export function GraphInstant(slot: { dateTime?: string | null; timeZone?: string | null } | null | undefined): Date | null {
    const raw = slot?.dateTime?.trim();
    if (!raw) return null;
    // Both alternatives anchored. Unanchored, the `[Zz]` matched a "z" ANYWHERE in the string, so
    // a value that merely contained one counted as carrying an offset and skipped the UTC check.
    const hasOffset = /(?:[Zz]|[+-]\d{2}:?\d{2})$/.test(raw);
    const zone = (slot?.timeZone ?? 'UTC').trim().toUpperCase();
    // Only UTC is safe to assume. Any other named zone would need a tz database to resolve, and
    // guessing puts the meeting hours away from when it happened.
    if (!hasOffset && zone !== 'UTC') return null;
    const parsed = new Date(hasOffset ? raw : `${raw}Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * The JSON body for `POST /events` (all fields) or `PATCH /events/{id}` (only those present).
 *
 * Times go as wall clock in the event's zone, which is what Graph's `dateTimeTimeZone` means, so
 * Outlook shows and recurs the event in that zone. With no zone the event is in UTC.
 */
export function BuildGraphEventBody(input: Partial<CalendarEventInput>): GraphEvent {
    const body: GraphEvent = {};
    const zone = input.TimeZone?.trim() || 'UTC';
    if (input.Subject !== undefined) body.subject = input.Subject;
    if (input.Body !== undefined) body.body = { contentType: input.BodyType === 'HTML' ? 'html' : 'text', content: input.Body };
    if (input.Start) body.start = graphSlot(input.Start, zone, input.IsAllDay === true);
    if (input.End) body.end = graphSlot(input.End, zone, input.IsAllDay === true);
    if (input.IsAllDay !== undefined) body.isAllDay = input.IsAllDay;
    if (input.Location !== undefined) body.location = { displayName: input.Location };
    if (input.Attendees) {
        body.attendees = input.Attendees.map((a) => ({
            emailAddress: { address: a.Email, ...(a.Name ? { name: a.Name } : {}) },
            type: a.Type === 'Optional' ? 'optional' : 'required'
        }));
    }
    if (input.IsOnlineMeeting !== undefined) {
        body.isOnlineMeeting = input.IsOnlineMeeting;
        if (input.IsOnlineMeeting) body.onlineMeetingProvider = 'teamsForBusiness';
    }
    return body;
}

/** An instant as Graph's `dateTimeTimeZone`. An all-day slot is midnight of the zone's calendar day. */
function graphSlot(when: Date, zone: string, allDay: boolean): { dateTime: string; timeZone: string } {
    const wallClock = CalendarWallClock(when, zone);
    return { dateTime: allDay ? `${wallClock.slice(0, 10)}T00:00:00` : wallClock, timeZone: zone };
}

/** A Graph event as MemberJunction's read model. Callers ask Graph for UTC, which {@link GraphInstant} relies on. */
export function ToCalendarEvent(raw: GraphEvent): CalendarEvent {
    const organizer = raw.organizer?.emailAddress?.address?.trim();
    return {
        ExternalEventID: raw.id ?? '',
        SeriesID: raw.seriesMasterId ?? null,
        ICalUID: raw.iCalUId ?? null,
        Subject: raw.subject ?? '',
        Body: raw.body?.content ?? raw.bodyPreview ?? '',
        Start: GraphInstant(raw.start),
        End: GraphInstant(raw.end),
        IsAllDay: raw.isAllDay === true,
        Location: raw.location?.displayName ?? null,
        Organizer: organizer ? { Email: organizer, ...(raw.organizer?.emailAddress?.name ? { Name: raw.organizer.emailAddress.name } : {}) } : null,
        Attendees: (raw.attendees ?? []).map(toAttendee).filter((a): a is CalendarEventAttendee => a !== null),
        IsCancelled: raw.isCancelled === true,
        OnlineMeetingUrl: raw.onlineMeeting?.joinUrl ?? raw.onlineMeetingUrl ?? null,
        LastModified: raw.lastModifiedDateTime ? new Date(raw.lastModifiedDateTime) : null
    };
}

/** A delta item as a change: a tombstone is `Removed`, anything else `Upserted` (cancelled ones carry `IsCancelled`). */
export function ToCalendarChange(item: GraphDeltaItem): CalendarEventChange {
    if (item['@removed']) {
        return { Kind: 'Removed', ExternalEventID: item.id ?? '' };
    }
    return { Kind: 'Upserted', ExternalEventID: item.id ?? '', Event: ToCalendarEvent(item) };
}

/** Graph's attendee `status.response` as MemberJunction's. The organizer's own row reads as accepted. */
export function MapGraphResponse(response: string | null | undefined): CalendarAttendeeResponse {
    switch (response) {
        case 'accepted':
        case 'organizer':
            return 'Accepted';
        case 'tentativelyAccepted':
            return 'Tentative';
        case 'declined':
            return 'Declined';
        default:
            return 'None';
    }
}

function toAttendee(raw: GraphAttendee): CalendarEventAttendee | null {
    const email = raw.emailAddress?.address?.trim();
    if (!email) return null;
    return {
        Email: email,
        ...(raw.emailAddress?.name ? { Name: raw.emailAddress.name } : {}),
        Type: raw.type === 'optional' ? 'Optional' : 'Required',
        Response: MapGraphResponse(raw.status?.response)
    };
}
