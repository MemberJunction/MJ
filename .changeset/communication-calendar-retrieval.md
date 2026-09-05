---
'@memberjunction/communication-types': minor
'@memberjunction/communication-ms-graph': minor
---

Communication: calendar retrieval, so a provider can be asked what is on a calendar.

`BaseCommunicationProvider` could send mail, read mail, reply, forward, draft, move, archive, search
and subscribe — and had no way to read a calendar. Any caller needing events had to build its own
Graph client, which means duplicating token acquisition, the credential-keyed client cache and paging
that this provider already owns.

**`GetEvents` is concrete on the base, not abstract.** Making it abstract would break every existing
provider at compile time for a capability most will never have. Providers that support it override
and declare `'GetEvents'` in `getSupportedOperations()`; the rest inherit a refusal that names itself,
so a caller learns which provider declined instead of receiving an empty list. That is also why the
default returns `Success: false` rather than `{Events: []}` — "this provider cannot look" and "there
was nothing in the window" are different facts, and a caller advancing a watermark must not read the
first as the second.

**Separate from `GetMessages` rather than a mode of it.** A calendar read is bounded by a time window,
not a count and a folder. "The next 200 messages" is a sensible request; "the next 200 events" is not.
Folding it in would have left `NumMessages` meaning different things depending on a flag.

**The endpoint choice is reported, because it silently changes the answer.** Graph exposes calendar
data two ways: `/calendarView` requires a window and expands a recurring series into one entry per
OCCURRENCE; `/events` needs no window and returns the series MASTER — a weekly stand-up is one row
whose start time is whenever the series began. Supplying both bounds selects the first. Since a master
and an occurrence are indistinguishable by inspection, the result carries `RecurrenceExpanded` rather
than leaving the caller to infer which it received.

**Cancelled events are excluded server-side, before `$top`.** Filtering them out after the fetch would
return fewer than `NumEvents` and read as a quiet calendar rather than a filtered one.
`IncludeCancelled` opts back in.

**A start Graph cannot express as an instant becomes null, never a guess.** Graph sends a naive local
string plus a separate `timeZone`; without a tz database a named zone does not determine an instant,
and guessing files a meeting hours from when it happened. An explicit offset is honoured regardless of
the named zone.

20 tests, each mutation-checked: pinning either endpoint unconditionally, accepting one bound as a
window, dropping the cancelled filter, omitting `RecurrenceExpanded`, leaving the organizer in the
attendee list, guessing at a named zone, and turning a thrown Graph error into a successful empty
result are all caught.
