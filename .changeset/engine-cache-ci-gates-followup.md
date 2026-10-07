---
'@memberjunction/redis-provider': patch
---

Follow-up to the Redis CI gate: the main test step now runs the Redis-backed suites too.

`REDIS_URL` was set on the job but not declared on the `test` task in `turbo.json`. Turbo 2.x runs
tasks in strict env mode, so it was stripped before vitest started and the main test step skipped
every gated suite — only the gate step ran them for real. Declaring it also puts it in the task's
cache key, so turbo cannot replay a result produced without Redis.

Also: the gate script is now in the workflow's `paths:` triggers, so a PR that edits only the gate
still runs it; `REDIS_KEY_PREFIX` is removed from the job because nothing reads it (the suites set
their own prefix and each job has its own Redis container); and stale comments are corrected.

No runtime behaviour changes.
