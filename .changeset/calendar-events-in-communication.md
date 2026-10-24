---
"@memberjunction/communication-types": patch
"@memberjunction/communication-ms-graph": patch
"@memberjunction/communication-gmail": patch
"@memberjunction/communication-engine": patch
"@memberjunction/ai-bridge-server": patch
"@memberjunction/telephony-adapters": patch
---

Calendars in Communication (#4789, A18). Communication providers gain CreateEvent, UpdateEvent, CancelEvent, GetEvent and SyncEvents, each taking a required CalendarTarget so an event never lands in a default mailbox; a provider without a calendar refuses each by name. The MS Graph provider implements them (calendarView delta sync, organizer cancel or attendee delete) and accepts a caller-supplied `accessToken`; the Gmail provider implements them on Google Calendar with the same OAuth client (the refresh token needs a calendar scope). The Communication engine adds `CalendarEventLinks` to create, update and cancel events linked to any record through `MJ: Calendar Event Links`, and to sync a calendar from the cursor in `MJ: Calendar Sync States`, handing each change to a `BaseCalendarEventLinkHandler` registered for the record's entity; stored credentials resolve through CredentialEngine. The realtime bridge's `GraphCalendarSource` and `GoogleCalendarSource` now read through the providers' SyncEvents; `GraphCalendarClient`, `GoogleCalendarClient`, the `IGraphCalendarLike`/`IGoogleCalendarLike` surfaces and the raw Graph/Google normalizers are removed, along with the bridge's optional Graph and googleapis dependencies. The Teams calendar scheduler polls through the MS Graph provider with the bot token. GetEvents and every existing operation behave as before.
