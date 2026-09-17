# 09 — Follow-on Specs

These specs extend the Phase 1 work queue defined in [../02-implementation-overview.md](../02-implementation-overview.md)
and [../03-interfaces-and-tables.md](../03-interfaces-and-tables.md) (normative). Each is self-contained:
Summary · Motivation · Scope · Design · Interfaces/Schema changes · Dependencies · Testing · Work breakdown ·
Open questions. Phase 1 is delivered by the task plans `../04-core-implementation-plan.md` (core),
`../05-native-data-implementation-plan.md` (schema, SQL, Database driver, dedup ledger, engine),
`../06-native-runtime-implementation-plan.md` (handlers, host, sweeper, remote operations, REST, CLI),
`../07-aws-implementation-plan.md` (AWS package, staging, Terraform) and `../08-legacy-queue-port-plan.md`.
This folder refers to their topics by name, not by task number. All specs assume **Revision 2** (see
[../README.md](../README.md)): MJ-database deduplication ledger, single flight via the unique in-flight index,
Remote Operations as the operator surface, REST publish only, and **no DynamoDB** (AWS `Ordered` is staged into
the Database transport by an MJ worker; AWS dead letters live in the SQS dead-letter queue).

…and **Revision 3**: the queue's guarantees stop when a handler settles
([02 §1a](../02-implementation-overview.md#1a-where-the-queue-stops), [10 — Consumer guide](../10-consumer-guide.md)).
Cancel revokes the lease for in-flight work (03 §7), delivery-state rows reject `BaseEntity.Save()`, one-shot
container workers and a backlog metric are in Phase 1, and four proposals were **declined** — `AwaitExternal`, a cloud
liveness probe, `UntilResolved` deduplication and child-process helpers
([09i](09i-minor-follow-ons.md#considered-and-declined-revision-3)).

## Index

| Spec | Phase | Priority | Depends on | One-line summary |
|---|---|---|---|---|
| [09a — Azure transport](09a-azure-transport.md) | **1a** | P0 | Phase 1 core, engine, server; AWS module shape | Service Bus topics/subscriptions with sessions and peek-lock leases. `Ordered` is staged into the Database transport for MJ workers (as on AWS); session state could later give External hosts native `Ordered`. Consumers run in Functions or MJ workers. Terraform `azurerm` module. |
| [09b — Explorer operator dashboard](09b-explorer-dashboard.md) | Fast follow | P1 | Phase 1 remote operations (03 §8) | Layered (L1/L2/L3) Explorer dashboard over the `WorkQueue.*` remote operations: stats, dead-letter browser, discard/cancel, blocked partitions, sequence skip, binding validation |
| [09c — Publish gateway host](09c-publish-gateway-host.md) | Fast follow | P1 | Phase 1 `work-queue-server` extension | Slim, horizontally scaled process hosting only the REST publish extension. MJAPI leaves the ingestion hot path. |
| [09d — Direct manifest publisher](09d-direct-manifest-publisher.md) | Fast follow | P2 | 09c optional; Phase 1 manifest export + dedup ledger | External producers cache a versioned topology manifest and publish straight to SNS / Service Bus using the same binding rules; deduplication keys use a lightweight MJ reserve/confirm call |
| [09e — Integration runs revamp](09e-integration-runs-revamp.md) | Follow-on | P1 | Phase 1 Database transport (staged on AWS); Ordered + ExplicitSequence; MJWorker host | Integration sync requests and pushed batches move onto the queue. `CompanyIntegrationRun` ownership moves to the delivery lease. Connectors whose sync finishes at the vendor use the split-message pattern; overlap, coalescing and stall detection stay in the integration. |
| [09f — Email event ingestion](09f-email-event-ingestion.md) | Follow-on | P1 | Phase 1 (DB and/or AWS); 09c recommended at volume | SendGrid Event Webhook + one-click unsubscribe feed a shared verify → normalize → publish ingress with fan-out subscriptions |
| [09g — Batch ingestion (Firehose)](09g-batch-ingestion-firehose.md) | **2** | P2 | 05/06 (claim semantics), 07; 09f as first consumer | Firehose → S3 → "batch ready" claim-check messages, a `BatchWorkHandler` contract, and DB micro-batching |
| [09h — GCP transport](09h-gcp-transport.md) | **2** | P3 | Phase 1; lessons from 09a | Pub/Sub with ordering keys, ack-deadline leases, native retry and dead-letter topics, and `Ordered` staged into the Database transport (no Firestore in the base design) |
| [09i — Minor follow-ons](09i-minor-follow-ons.md) | Backlog | P2–P3 | varies | Edited-payload replay, backfill, DB→cloud bridge, remote-pull API, `Ordered` for External hosts on cloud transports, Action handler adapter, priority, per-key concurrency and coalescing, sampled cloud ledger, cancel reason on the abort signal — plus the Revision 3 **declined** register |

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
already in 03 (Revision 2 or 3). Proposals **declined** in Revision 3 are not listed here; they are recorded with
their reopen conditions in [09i](09i-minor-follow-ons.md#considered-and-declined-revision-3).

| # | Change to 03 | Status | Raised by |
|---|---|---|---|
| C1 | Add publisher-relevant `BindingConfig` to `ManifestTopic` and a `ManifestHash`; expose the manifest to external producers through a `WorkQueue.GetTopologyManifest` remote operation (Revision 2 has no REST manifest route) | Proposed | 09d |
| C2 | `ValidatePublishRequest` / `BuildWorkMessage` / `SerializedEnvelopeBytes` exported from core (03 §1.1) | **Adopted** | 09d, 09c |
| C3 | Per-transport ceilings on policy values (e.g. Azure `LeaseSeconds ≤ 300`, GCP `≤ 600`) — extend `TransportCapabilities` (03 §5) with `MaxLeaseSeconds` and have `SubscriptionUnsupportedReason` check it | Proposed | 09a, 09h |
| C4 | Filter semantics for absent attributes (03 §4) | **Adopted** | 09a, 09h |
| C5 | Reserved attribute prefixes `mj.` / `mj_` (03 §1.1) — transport-internal names such as Azure `mj_target`, `mj_attempt`, `mj_control` fall under it | **Adopted** | 09a |
| C6 | Persist `WorkProgress.Checkpoint` on cloud transports (`TransportCapabilities.PersistsProgress` is `false` for AWS today). Options without new infrastructure: Azure session state; staged subscriptions already persist it | Proposed | 09g, 09e |
| C7 | Topic `DeliveryMode: 'Individual' \| 'Batched'` plus `BatchTopicID`; `BatchWorkHandler` and subscription `MaxBatchSize` | Proposed | 09g |
| C8 | Cancel of **in-flight** deliveries. **Adopted in Revision 3** with a simpler mechanism than proposed: `Discard` covers `Pending`, `InFlight` and `DeadLettered` — for in-flight it sets `CancelRequestedAt`, rotates the lease token and answers `CancelRequested: true` (03 §7, capability `CancelInFlight`). No separate `CancelInFlight` operator method. The abort **reason** on `WorkContext.Signal` is the only piece left (09i item 9) | **Adopted** (reason: Proposed) | 09e, 09i |
| C9 | Relax W9 when a remote-pull consumer exists (`SupportsExternalHosts` true on the Database transport) | Proposed | 09i |
| C10 | Deduplication key + TTL ledger in the MJ database for every transport (03 §2.1) | **Adopted** | 09d, 09f |
