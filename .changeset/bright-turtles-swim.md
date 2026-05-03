---
"@memberjunction/core": minor
"@memberjunction/core-actions": patch
"@memberjunction/geo-core": patch
---

fix(geo): prevent OOM crash loops in ScheduledGeocodingAction by paginating RunView calls (500 records/page), replacing N+1 per-record SQL queries with a bulk Map lookup, adding a safety MaxTotal default of 50,000, and fixing a race condition in CreateGeoCodeRow on concurrent batch inserts
