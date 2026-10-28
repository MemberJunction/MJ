---
"@memberjunction/integration-engine": patch
---

The discovery watchdog stops reporting work that is not running.

`End` is called in a `finally`, so an in-flight entry survives its owner only when the owner never unwound at all — a process killed mid-discovery, or an await that neither settled nor rejected. The registry had no way to notice: the entry stayed, and every report line kept claiming `"Orders" 4211s still in flight`.

That is the failure this class exists to prevent, pointed the other way. Its own doc argues a watchdog that under-reports what is in flight is worse than no watchdog, because the whole contract is that the report is true; a watchdog that OVER-reports sends an operator chasing a sample that stopped existing an hour ago.

`Tick` now evicts entries older than `StaleAfterMs` (default one hour, `<= 0` disables) before building the report, so a single tick can never both describe an entry and bury it. Eviction is loud: a sample disappearing quietly would read as completion, which is the opposite of what happened, so each one is named along with how long it sat and what stage it died at.

This is not a timeout and it cancels nothing. It only decides when the watchdog should stop asserting something it cannot know.
