# 09 — Follow-on Specs

These specs extend the Phase 1 work queue defined in [../02-implementation-overview.md](../02-implementation-overview.md)
and [../03-interfaces-and-tables.md](../03-interfaces-and-tables.md) (normative). Each is self-contained:
Summary · Motivation · Scope · Design · Interfaces/Schema changes · Dependencies · Testing · Work breakdown ·
Open questions. Phase 1 is delivered by the task plans `../04-core-implementation-plan.md` (core),
`../05-native-data-implementation-plan.md` (schema, SQL, Database driver, dedup ledger, engine),
`../06-native-runtime-implementation-plan.md` (handlers, host, sweeper, remote operations, REST, CLI),
`../07-aws-implementation-plan.md` (AWS package, Lambda adapter, Terraform) and `../08-legacy-queue-port-plan.md`
(legacy queue repair plus the `work-queue-legacy-bridge` package).
This folder refers to their topics by name, not by task number. All specs assume **Revision 2** (see
[../README.md](../README.md)): MJ-database deduplication ledger, single flight via the unique in-flight index,
Remote Operations as the operator surface, REST publish only, and **no DynamoDB** (AWS dead letters live in the SQS
dead-letter queue).

…and **Revision 3**: the queue's guarantees stop when a handler settles
([02 §1a](../02-implementation-overview.md#1a-where-the-queue-stops), [10 — Consumer guide](../10-consumer-guide.md)).
In-flight work can be cancelled (03 §7), delivery-state rows reject `BaseEntity.Save()`, one-shot container workers
and a backlog metric are in Phase 1, and four proposals were **declined** — `AwaitExternal`, a cloud liveness probe,
`UntilResolved` deduplication and child-process helpers. Also Revision 3: filters are MJ's `CompositeFilterDescriptor`
restricted to a broker-translatable subset and edited with `mj-filter-builder` (**R15**); topology metadata lives in
the browser-safe `WorkQueueEngineBase`, with the server `WorkQueueEngine` a facade over it (**R16**); Azure stays
Phase 1a (**R17**).

…and **Revision 4** ([11 — review and changes](../11-revision-4-review.md); README R18–R24):

| # | Assumption every spec here now makes |
|---|---|
| R18 | **No explicit sequences.** `Ordered` = publish order from a single producer; no `Sequence`, `OrderingMode`, gap waiting, `SkipSequence` or partition-state table |
| R19 | **`Ordered` is Database-only.** Cloud transports offer `None` and `Exclusive`; nothing is staged from a cloud queue into the database |
| R20 | **Only a confirmed dedup reservation is a `Duplicate`**; a reservation by the same `MessageID` is re-taken, by another is `DeduplicationPending` (retryable) |
| R21 | **Cancel is a flag the holder acknowledges** — no token rotation; `ExtendLease` can return `Cancelled`; `Signal.reason`; heartbeat every `min(LeaseSeconds/3, 30 s)`; the key frees when the handler stops |
| R22 | **SQS FIFO is consumed one message per receive**; `Attempt` = receive count with a `+2` guard and `+5` redrive margin; FIFO DLQs group by SQS `MessageId` |
| R23 | **Operators are authorized** (entity permissions for interactive users, scopes for API keys; REST publish is API-key only), and **queue SQL never rides an ambient transaction** |
| R24 | **Engine loading:** the AWS driver factory registers from `@memberjunction/work-queue-engine/aws`; `@memberjunction/queue` does not depend on the engine (legacy-bridge package); hot paths are bounded and index-backed; SQL Server needs `READ_COMMITTED_SNAPSHOT` |

Proposals declined in Revision 3 and features cut in Revision 4 are recorded, with the evidence that would reopen
each, in [09i](09i-minor-follow-ons.md#considered-and-declined-revision-3-or-cut-revision-4).

## Index

| Spec | Phase | Priority | Depends on | One-line summary |
|---|---|---|---|---|
| [09a — Azure transport](09a-azure-transport.md) | **1a** | P0 | Phase 1 core, engine, server; AWS module shape | Service Bus topics/subscriptions with sessions (`Exclusive`) and peek-lock leases. `Ordered` is unsupported, as on AWS (Database-only); session state could later give Azure native `Ordered`. Consumers run in Functions or MJ workers. Terraform `azurerm` module. |
| [09b — Explorer operator dashboard](09b-explorer-dashboard.md) | Fast follow | P1 | Phase 1 remote operations (03 §8) | Layered (L1/L2/L3) Explorer dashboard over the `WorkQueue.*` remote operations: stats and backlog, dead-letter browser, discard/cancel, blocked partitions, filter editing with `mj-filter-builder`, binding validation; topology from `WorkQueueEngineBase` |
| [09c — Publish gateway host](09c-publish-gateway-host.md) | Fast follow | P1 | Phase 1 `work-queue-server` extension | Slim, horizontally scaled process hosting only the REST publish extension. MJAPI leaves the ingestion hot path. |
| [09d — Direct manifest publisher](09d-direct-manifest-publisher.md) | Fast follow | P2 | 09c optional; Phase 1 manifest export + dedup ledger | External producers cache a versioned topology manifest and publish straight to SNS / Service Bus using the same binding rules; deduplication keys use a lightweight MJ reserve/confirm call |
| [09e — Integration runs revamp](09e-integration-runs-revamp.md) | Follow-on | P1 | Phase 1 Database transport (`Exclusive`, `Ordered`, per-key publish-order lock); MJWorker host | Integration sync requests and pushed batches move onto the queue. `CompanyIntegrationRun` ownership moves to the delivery lease. Pushed batches are `Ordered` on a Database topic, published in order by the ingress (no sequence numbers). Connectors whose sync finishes at the vendor use the split-message pattern; overlap, coalescing and stall detection stay in the integration. |
| [09f — Email event ingestion](09f-email-event-ingestion.md) | Follow-on | P1 | Phase 1 (DB and/or AWS); 09c recommended at volume | SendGrid Event Webhook + one-click unsubscribe feed a shared verify → normalize → publish ingress with fan-out subscriptions |
| [09g — Batch ingestion (Firehose)](09g-batch-ingestion-firehose.md) | **2** | P2 | 05/06 (claim semantics), 07; 09f as first consumer | Firehose → S3 → "batch ready" claim-check messages, a `BatchWorkHandler` contract, and DB micro-batching |
| [09h — GCP transport](09h-gcp-transport.md) | **2** | P3 | Phase 1; lessons from 09a | Pub/Sub with ordering keys (`Exclusive`), ack-deadline leases, native retry and dead-letter topics; `Ordered` unsupported, as on AWS (no Firestore in the base design) |
| [09i — Minor follow-ons](09i-minor-follow-ons.md) | Backlog | P2–P3 | varies | Edited-payload replay, backfill, DB↔cloud bridge, remote-pull API, `Ordered` on cloud transports, Action handler adapter, priority, per-key concurrency, sampled cloud ledger — plus the register of proposals **declined** (Revision 3, incl. coalescing) and features **cut** (Revision 4: explicit sequences, staged cloud `Ordered`) |

## Dependency graph

```
                 Phase 1 (03; plans 04–08)
                 │
   ┌─────────────┼───────────────┬────────────────┬──────────────┐
   ▼             ▼               ▼                ▼              ▼
 09a Azure    09b Dashboard   09c Gateway      09e Integration  09i minors
   │                             │                               (remote-pull,
   │                             ▼                                bridge, …)
   │                          09d Direct publisher
   │                             │
   │             09f Email ingestion ◄─── (09c recommended at volume)
   │                             │
   ▼                             ▼
 09h GCP                      09g Batch ingestion (Firehose / Event Hubs Capture)
```

## Contract changes these specs propose to 03

Collected here so 03 can be amended in one pass. Each spec explains its own item. Items marked **Adopted** are
already in 03 (Revisions 2–4). Proposals **declined** in Revision 3 and features **cut** in Revision 4 are not listed
here; they are recorded with their reopen conditions in
[09i](09i-minor-follow-ons.md#considered-and-declined-revision-3-or-cut-revision-4).

| # | Change to 03 | Status | Raised by |
|---|---|---|---|
| C1 | Add publisher-relevant `BindingConfig`, `Status` and `BindingEpoch` to `ManifestTopic` and a `ManifestHash`; expose the manifest to external producers through a `WorkQueue.GetTopologyManifest` remote operation (there is no REST manifest route). `ManifestSubscription.Status` is already in 03 §10 (Revision 4) | Proposed | 09d |
| C2 | `ValidatePublishRequest` / `BuildWorkMessage` / `SerializedEnvelopeBytes` exported from core (03 §1.1) | **Adopted** | 09d, 09c |
| C3 | Per-transport ceilings on policy values (e.g. Azure `LeaseSeconds ≤ 300`, GCP `≤ 600`) — extend `TransportCapabilities` (03 §5) with `MaxLeaseSeconds` and have `SubscriptionUnsupportedReason` check it | Proposed | 09a, 09h |
| C4 | Filter semantics for absent attributes (03 §4) | **Adopted** | 09a, 09h |
| C5 | Reserved attribute prefixes `mj.` / `mj_` (03 §1.1) — transport-internal names such as Azure `mj_target`, `mj_attempt`, `mj_control` fall under it | **Adopted** | 09a |
| C6 | Persist `WorkProgress.Checkpoint` on cloud transports (`TransportCapabilities.PersistsProgress` is `false` for AWS today). Options without new infrastructure: a checkpoint object beside the batch object (09g); Azure session state. No longer needed by 09e (its subscriptions are on the Database transport) | Proposed | 09g |
| C7 | Topic `DeliveryMode: 'Individual' \| 'Batched'` plus `BatchTopicID`; `BatchWorkHandler` and subscription `MaxBatchSize` | Proposed | 09g |
| C8 | Cancel of **in-flight** deliveries, and the abort **reason**. `Discard` covers `Pending`, `InFlight` and `DeadLettered`; for in-flight it sets `CancelRequestedAt` (no token rotation — Revision 4, F2), `ExtendLease` returns `Cancelled`, `WorkContext.Signal.reason` says why, and the runtime's `AcknowledgeCancel` frees the key as soon as the handler stops (03 §3, §7, capability `CancelInFlight`) | **Adopted** (Revision 3; reworked and completed in Revision 4) | 09e, 09i |
| C9 | Relax W9 when a remote-pull consumer exists (`SupportsExternalHosts` true on the Database transport) | Proposed | 09i |
| C10 | Deduplication key + TTL ledger in the MJ database for every transport (03 §2.1) | **Adopted** | 09d, 09f |
| C11 | Filters as restricted `CompositeFilterDescriptor` with a per-transport `FilterSupport` capability (03 §4, §5) — 09a and 09h translate from operators, not from an SNS-shaped grammar | **Adopted** (Revision 3, R15) | 09a, 09h, 09f |
| C12 | `WorkQueueEngineBase` (browser-safe) + `WorkQueueEngine` facade (03 §0, §11) — 09b reads topology from the base tier; 09c describes the facade | **Adopted** (Revision 3, R16) | 09b, 09c |
