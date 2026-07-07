---
"@memberjunction/scheduling-engine-base": patch
"@memberjunction/scheduling-engine": patch
---

Auto-restart scheduled-job polling when a job is activated after MJAPI boot. Adds a JobsChanged$ notification on the base engine (covering local and cross-server changes) that wakes a suspended poll timer, and re-applies the Active-only filter on event-driven refreshes.
