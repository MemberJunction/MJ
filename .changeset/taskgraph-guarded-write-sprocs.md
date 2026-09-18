---
"@memberjunction/task-graph": patch
---

The durable task-graph dispatcher works under a least-privilege login again (#4575). `TaskClaimStore`'s guarded writes moved from raw SQL against the `Task` and `AIAgentRun` base tables into dedicated stored procedures granted to `cdp_Developer` and `cdp_Integration`, and its two reads moved onto the `MJ: Tasks` entity. The guards, the rowcount arbitration and the single-clock rule are unchanged. A refused write is now reported as a failure rather than as a lost race, the dispatcher stops the wave and says so, and it probes for the EXECUTE grant at startup.
