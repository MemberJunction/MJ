---
'@memberjunction/core': patch
---

TelemetryManager: `trimIfNeeded()` now bounds the collections it derives from events, not only the events — `_insights` is capped by the new `autoTrim.maxInsights` (default 1000), and at most once a minute patterns unseen for longer than `autoTrim.maxAgeMs` and insight dedupe entries older than `analyzers.dedupeWindowMs` are released (the dedupe sweep compares on the wall clock the window is stamped with).
