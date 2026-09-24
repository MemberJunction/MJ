---
"@memberjunction/core-entities": minor
"@memberjunction/work-queue-base": minor
"@memberjunction/work-queue-engine": minor
---

Add the durable work queue's database layer: six work-queue tables and entities (transports, topics, subscriptions, messages, deliveries and the deduplication ledger), `workqueue:*` API scopes, the seeded `Database` transport, the guarded-write `spWorkQueue*` stored procedures, the browser-safe `@memberjunction/work-queue-base` metadata tier (`WorkQueueEngineBase`, topology rows, binding builders, filter and topology validation, manifest export), and `@memberjunction/work-queue-engine` with the procedure-call builders, the Database transport driver, consumer and operator, the deduplication ledger, the sweep lock, and the server `WorkQueueEngine` facade.
