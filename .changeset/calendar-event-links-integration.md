---
"@memberjunction/integration-test-suite": patch
---

IT122, the `calendar-event-links` integration bundle: a user holding only the UI role reads `MJ: Calendar Event Links` and `MJ: Calendar Sync States` over GraphQL and cannot create either; and, through a test-only calendar provider, a linked event keeps its iCalendar UID and compact record key, sync delivers a moved time and an RSVP to the record's handler and stores the new token, a refused token falls back to a full sync of the window, a record whose entity has no handler gets only its link updated, and cancelling marks the link Cancelled.
