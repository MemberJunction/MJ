---
"@memberjunction/core-entities": minor
"@memberjunction/scheduling-engine": minor
---

Add heartbeat-based lease renewal to the scheduled job engine (#2749): running jobs can opt in via context.heartbeat() to keep their concurrency slot alive (atomic, token-checked spExtendScheduledJobLease), with a new ScheduledJob.MaxRuntimeMinutes override for single-long-call jobs that can't beat mid-flight.
