# Work Queue — Plan Set

**Status:** Proposed. Nothing here is implemented.
**Date:** 2026-09-15
**Supersedes:** `memberjunction/implementation_plan.md` (the 14 September 2026 draft built around an outbox relay).

A durable, multi-server work queue for MemberJunction: topics, queues and subscriptions; at-least-once
delivery; FIFO one-at-a-time processing per partition key; progress-driven leases; retries, dead letters and
operator repair; a database-native driver and an Amazon SQS FIFO driver behind one contract.

## Documents

| Doc | What it is | Phase |
| --- | --- | --- |
| [01-design.md](01-design.md) | Concepts, architecture, guarantees, lifecycle, claiming, fan-out, two use cases (link clicks; ordered long-running imports), security, operations, drivers, decisions | 1 |
| [02-interfaces-and-schema.md](02-interfaces-and-schema.md) | Normative contracts: five tables, TypeScript types, driver and handler contracts, REST, remote operations, configuration, metadata | 1 |
| [03-native-implementation-plan.md](03-native-implementation-plan.md) | 17 tasks: schema, `@memberjunction/work-queue`, native driver (SQL Server and PostgreSQL), producer, worker, maintenance, admin operations, MJServer wiring, REST publish, integration bundle IT87, README | 1 |
| [04-legacy-queue-port-plan.md](04-legacy-queue-port-plan.md) | 5 tasks: repair `QueueTask.Status`, serialisable Entity AI Action references, opt-in routing of `@memberjunction/queue` task types onto same-named work queues, QU8–QU10 | 1 |
| [05-aws-implementation-plan.md](05-aws-implementation-plan.md) | 6 tasks: ledger reservations, `@memberjunction/work-queue-aws` (SQS FIFO), Lambda adapter, wiring and provisioning | 1 |
| [06-path-a-gcp-azure.md](06-path-a-gcp-azure.md) | Design only: Google Pub/Sub and Azure Service Bus drivers | Path A |
| — | Batched delivery (Kinesis Firehose-like bulk consumers) — **not yet sketched**; `07` is reserved for it | Path B |
| [08-path-c-staged-batches-parked.md](08-path-c-staged-batches-parked.md) | Parked: staged batch ingestion (open, register parts, seal), lifted out of Phase 1 | Path C |

## Phases and paths

**Phase 1** is the work queue itself, taken through design and implementation, including AWS.

| Order | Plan | Depends on |
| --- | --- | --- |
| 1 | 03 — native driver and server | — |
| 2a | 04 — legacy queue port | 03 |
| 2b | 05 — AWS driver | 03 |

04 and 05 are independent of each other and can run in parallel after 03.

**Later paths**, each additive and none required by Phase 1:

- **A — other cloud drivers.** Implement `BaseWorkQueueDriver`; producers, handlers and metadata do not change.
- **B — batched delivery.** A handler base that receives many items per call and flushes them in bulk to storage
  or a warehouse. To be sketched.
- **C — staged batch ingestion.** Consumes only `WorkQueueProducer.Publish`, with its own tables and endpoints.
  Parked until its motivating use case is settled; doc 08 lists the questions to answer first.

## Findings worth knowing before you start

These came out of research on the MemberJunction codebase and shaped the plans.

| Finding | Where it matters |
| --- | --- |
| `@memberjunction/queue` cannot persist a task: `CK_QueueTask_Status` rejects the `'Pending'` value its own code, default and create procedure write, and `NCHAR(10)` cannot hold `'In Progress'` | 04 Task 1 repairs it |
| The only production callers of `QueueManager.AddTask` enqueue Entity AI Actions carrying a live `BaseEntity`, which cannot be serialised; the path is deprecated and currently inert | 04 Tasks 2–3 switch to record references |
| CodeGen puts triggers on every table, so SQL Server `OUTPUT` must use `OUTPUT … INTO @table` (otherwise error 334); every row-returning work queue statement ends in exactly one result set | 03 Tasks 5–7, 05 Task 1 |
| Neither SQL Server filtered indexes nor PostgreSQL partial indexes accept a clock function, so the in-flight partition index has no time condition and lease takeover updates the row in place | 01 §7, 03 Task 1 |
| MJ apps load `@RegisterClass` registrations through generated manifests; a driver missing from the server manifest fails only in bundled builds | 03 Task 15, 04 Task 5, 05 Task 6 |

## Executing a plan

- Each implementation plan is written for task-by-task execution with
  `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Every task ends with passing tests
  and a commit.
- Use one development database per agent. Migrations are T-SQL; PostgreSQL migration counterparts are produced
  separately by the release tooling.
- Metadata primary keys used by the plans are already allocated in their JSON. Unallocated UUIDs, free for
  follow-up work: `ABFE362F-74E3-4D10-9C2F-E6C3E158B0CB`, `69402B3D-118E-47FF-B169-452A1E54A5D5`,
  `33EDA380-0D5F-4013-89A4-B50E8733BD3B`, `3316CDFB-136C-4315-9E40-7B20D45E36A9`,
  `7E687682-1A55-4BC8-B1BB-34BFF6E69D95`, `74965951-1116-49E1-AC47-52CFEE667C47`,
  `DA7A5825-C359-4DBB-8256-D3461972D003`, `E9E537AB-F8E2-4A84-8614-7CC36761F546`,
  `F5E274BE-34E2-4B45-A8D8-0F22D18F8604`, `C4B92AD2-B96C-4D9B-9FA7-4768EE1B2A26`, and five freed when staged
  batches left Phase 1: `4A945E70-7647-4606-96E5-CC961AFD507D`, `18934EAF-E5E4-4A1A-B8D5-44337AAA044F`,
  `40D2263E-2D81-478F-AE70-FA35897F1ACB`, `D08A93E6-C64A-4A57-9946-C44CEAC666D9`,
  `C580E4FA-09BB-43FF-9B40-9CB39E6A6386`.
- Where a plan and 02 disagree, 02 wins; fix the plan.
