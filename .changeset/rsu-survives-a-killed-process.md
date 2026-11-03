---
"@memberjunction/integration-progress-artifacts": patch
"@memberjunction/server": patch
"@memberjunction/schema-engine": patch
---

A runtime schema update survives the process being killed, and says so if it doesn't. Child builds get a heap ceiling sized to free memory instead of inheriting the parent's, so a large build can no longer take down the server. Pending work is recorded before the build starts, so a restart resumes it. At startup, MJServer closes out any run a dead process left open (`SweepInterruptedRuns`) and marks it failed with a `process-killed` result, so the wizard and the active-operations panel stop waiting on it.
