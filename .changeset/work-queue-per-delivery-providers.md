---
"@memberjunction/work-queue-engine": patch
"@memberjunction/server": patch
"@memberjunction/cli": patch
---

Work queue hosts mint a provider per delivery and release it when the handler settles (`IndependentProviderSource`, `WorkQueueProviderSource.ReleaseProvider`); a release failure is logged and never discards the handler's outcome. A long-running `mj queue work` sweeps every 60 s and re-plans every 30 s by default (`--sweeper-interval-ms`, `--reconcile-interval-ms`); `--once` keeps both off. New `mj queue sweep [--json]` runs one sweeper pass for a cron and exits 1 when the pass or any step fails. `MJServerWorkQueueProviderSource` releases the instances it mints.
