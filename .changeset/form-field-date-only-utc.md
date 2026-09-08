---
"@memberjunction/ng-base-forms": patch
---

fix(ng-base-forms): a `date` column is a calendar day, not an instant. Read mode formatted date-only fields with a local-time formatter, so a stored 2026-11-20 rendered as 11/19/2026 for anyone west of Greenwich while edit mode showed the 20th. Date-only fields now render the stored day in the reader's locale format; `datetime` / `datetimeoffset` fields are unchanged and still render as local time.
