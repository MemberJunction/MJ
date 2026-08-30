---
"@memberjunction/core": patch
---

Fix a memory leak in `ProviderBase.ensureInflightViewInvalidation()`: it subscribed to `MJGlobal`'s process-wide event bus once per provider instance and never unsubscribed. Since MJServer mints a fresh provider on every GraphQL request (and the task-graph dispatcher mints one per task execution), this pinned one more provider object graph on the bus per request/task, forever. The subscription is now wired once per process and fans out to live provider instances via `WeakRef`, so creating more providers no longer adds more permanent subscribers.
