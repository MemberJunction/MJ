# 10 — Consumer Guide

How to write a handler and a producer against this queue, and which problems stay yours. The boundary is in
[02 §1a](02-implementation-overview.md#1a-where-the-queue-stops): the queue guarantees durable delivery, one valid
lease holder while a handler runs, and fencing. Everything here is what sits on your side of that line.

---

## 1. The item is a claim check, not the record

Keep your own domain row (an import run, a provisioning run, a sync). The message carries a **reference** to it.

```ts
await WorkQueueEngine.Instance.PublishAs('import.ready', [{
  PartitionKey: `venue-${venueId}`,
  Attributes: { sourceSystem: 'tessitura' },
  Payload: { importRunId, venueId },          // small; the row holds everything else
}], { ContextUser: user, Provider: provider });
```

| Belongs on your domain row | Belongs on the queue item |
|---|---|
| Request details, results, output tail, error text, history, retry lineage, operator UI state | `MessageID`, partition key, attributes, a reference payload |

Why: the delivery row is claimed, leased and purged on a retention schedule, and every byte of `Payload` is copied
through the transport (256 KB cap, 10 attributes). `Progress` is a small operator hint (a percentage, a short message,
a resume checkpoint), not a log.

## 2. Handlers must be idempotent

At-least-once delivery plus lease takeover means your handler can run twice for one message — after a crash, a network
partition, or a redelivery. `MessageID` is stable across redeliveries and replays and **globally unique** (not per
topic), so use it (or your own natural key) as the idempotency key:

```ts
// "insert if this provider event hasn't been recorded" — safe to run twice
await RecordClickOnce(message.MessageID, message.Payload, this.ContextUser);
```

**Producers: reuse your `MessageID`s when you retry a publish.** A retry with the same `MessageID` and the same content
is answered `Duplicate`; the same ID with different content is rejected as `MessageIDConflict`. `WorkQueueApiPublisher`
generates IDs up front for exactly this reason.

Ordering never substitutes for idempotency: on `None`/`Exclusive` subscriptions, arrival order is not guaranteed, so
prefer last-writer-wins on an event timestamp over "latest arrival wins".

## 3. Long-running work

- **Set `HeartbeatMode = 'Auto'`** (the default). While your handler awaits anything — a child process, an HTTP call,
  a database query — the runtime renews the lease on its own timer. You write no heartbeat code.
- **Set `MaxProcessingSeconds`** to the longest a healthy run should take. After that the runtime stops renewing and
  aborts, which is your guard against a hung external command.
- **Pick a host that allows the runtime you need.** Lambda caps at 15 minutes; an MJ worker or container job does not.
- **Use `Manual` mode only when you want a stuck handler detected.** Then call `context.Heartbeat(progress)` at real
  progress boundaries; it resolves `false` once the lease is gone or the item has been cancelled.
- Heartbeats run every 30 seconds at most, however long the lease is, so a long lease does not make your handler slow
  to hear about a cancel.

```ts
async Handle(message: WorkMessage<ImportPayload>, context: WorkContext): Promise<WorkOutcome> {
  await RunImport(message.Payload.importRunId, context.Signal);   // may take an hour
  return Outcome.Complete();
}
```

**Always honor `context.Signal`.** Whatever external work you started — a child process, a remote job, a long query —
stop it when the signal aborts. `context.Signal.reason` tells you why:

| `reason` | Meaning | What happens to the item |
|---|---|---|
| `'Cancelled'` | An operator discarded the in-flight item | `Discarded` as soon as your handler returns |
| `'LeaseLost'` | The lease expired or was taken over | Another worker may already be running it; your outcome is ignored |
| `'MaxProcessingSeconds'` | You ran past the subscription's cap | Treated as a failed attempt |
| `'Shutdown'` | The host is stopping | Released back to the queue without consuming an attempt (Database) |

**Stop promptly on `'Cancelled'`.** The key of an `Exclusive` or `Ordered` subscription stays busy until your handler
returns; the moment it does, the runtime acknowledges the cancel and the next item for that key can run. A handler
that ignores the signal holds the key until its lease runs out.

**Don't block the event loop.** A long *synchronous* CPU-bound loop stops the heartbeat timer along with everything
else, so the lease expires while you are still working. Move that work to a worker thread or child process. (This is
plain Node behavior, not a queue rule: awaiting is fine, blocking is not.)

## 4. Non-restartable side effects

The queue prevents two *settles*, not two *side effects*. If a second concurrent run would be harmful (an infrastructure
apply, a financial posting), do both of these:

1. **Size the lease for your worst heartbeat outage** — `LeaseSeconds` of 15–20 minutes for work that must not be
   restarted, rather than the 60-second default. The trade-off is that genuine crash recovery waits that long.
2. **Keep your own guard**: a state lock (Terraform's state lock), or a domain row you claim with a conditional
   `UPDATE` before starting. The handler's first act is to acquire it; if it can't, return `Retry`.

## 5. Work that finishes somewhere else (split-message pattern)

When a handler only *starts* work that another system completes — a vendor sync finished by webhook — do not hold the
lease for hours:

```
handler(sync request):  start vendor job, store jobId + status on the domain row, Outcome.Complete()
webhook(job done):      publish 'connector.sync-completed' { connectorId, jobId }
handler(completion):    load the domain row, apply results, mark it complete
```

The queue's guarantees end when the first handler settles, so **overlap is now your policy**, which is usually what you
want: when a second sync is requested while one is active, your producer or handler decides — skip it, coalesce it into
the running job, queue it for after, or supersede. Stall detection is yours too: your domain row knows the job started
at time T, so sweep it on your own schedule.

## 5a. Publishing in order

The queue has no sequence numbers: for an `Ordered` subscription, order **is** the order you published. You own it.

- For one partition key, **do not publish N+1 until N has been accepted**, or publish both in **one call** (on the
  Database transport one `Publish` call is one transaction, in array order).
- The trap is a retry: you publish batch 3, the call times out, you move on and publish batch 4, then retry batch 3 —
  now they are out of order with only one producer involved. Await each acceptance and it cannot happen.
- If your order really is assigned elsewhere (a provider stamps its own numbers and delivers webhooks in any order),
  do not ask the queue to reorder. Use `Exclusive`, and have the handler apply an event only if its version is newer
  than what your domain row holds.
- **`Ordered` needs a Database topic.** Cloud transports offer `None` and `Exclusive`.

## 6. "Only one at a time per key"

Set `PartitionMode = 'Exclusive'` and a partition key with high cardinality (a subscriber ID, a connector ID, a venue
ID — not a campaign or tenant, which would bottleneck). The queue then runs one delivery at a time per key, and your
handler can check domain state without races:

```ts
// Exclusive by connector: no other delivery for this connector is running right now
if (await SyncedSince(connectorId, minutesAgo(5))) {
  return Outcome.Complete();          // coalesce: a fresh sync already covered this request
}
```

For genuine double-submits (a user clicking five times), add a publish-time `DeduplicationKey` with a short TTL. Use
`Ordered` only when strict order matters — it blocks the key on a dead letter until an operator intervenes.

**`Exclusive` behaves differently while a message retries.** On SQS FIFO a retrying message keeps its key busy, so
later messages for that key wait behind it (and therefore stay in publish order). On the Database transport a delivery
in backoff does not hold its key: later deliveries for the key run while it waits. If "later items must wait for the
failed one" matters to you, that is `Ordered`, on a Database topic.

## 6a. Filters

A subscription's filter is MJ's standard `CompositeFilterDescriptor` JSON over **envelope attributes**, edited with the
generic `mj-filter-builder` component. The queue accepts the subset every transport can express: `eq`, `neq`,
`startswith`, `isnull`/`isnotnull`, AND across fields, and OR of `eq` on a single field.

```jsonc
{ "logic": "and", "filters": [ { "field": "eventType", "operator": "eq", "value": "unsubscribe" } ] }
```

Two things to know:
- **Matching is case-sensitive** (brokers are), unlike MJ's usual case-insensitive filter comparison. Normalise
  attribute values when you publish.
- **Richer filters are rejected when the subscription is saved**, not silently ignored. If you need `contains` or a
  comparison, put the distinguishing value in an attribute at publish time, or filter inside the handler.

## 7. Outcomes and failures

| Situation | Return |
|---|---|
| Done | `Outcome.Complete()` |
| Transient problem (rate limit, temporary outage) | `Outcome.Retry(reason, delaySeconds?)` or throw `TransientWorkError` |
| Poison input that will never succeed | `Outcome.DeadLetter(reason)` or throw `FatalWorkError` |
| Anything else thrown | Treated as `Retry` |

Retries use full-jitter backoff up to `MaxAttempts`, then dead-letter. Dead letters are visible to operators
(`mj queue dead-letters`) and can be replayed after a fix, keeping the item's identity and its place in an `Ordered`
key.

**Alerting on dead letters.** `WorkQueueEngine.OnDeadLettered(...)` is an **in-process** convenience: it fires only in
the process that dead-lettered the item, so a dead letter produced by another instance's sweeper, or inside a one-shot
container job, reaches no listener elsewhere. For anything that must not be missed (an unsubscribe), alert from
`WorkQueue.GetSubscriptionStats` (`DeadLettered > 0`) on the Database transport and from the DLQ alarms on AWS.

## 8. Container-job workers

For bursty or heavy work, run the same handler in a one-shot container job instead of the MJAPI host:

```bash
mj queue work --subscription venue-import --once      # claim → run → drain → exit 0
```

Scale it from queue depth (KEDA, Azure Container Apps jobs, Kubernetes). The scaler query counts **claimable `Pending`
plus `InFlight`** — including in-flight matters, because scalers subtract running executions from the metric, and a
Pending-only count starves the queue. Give the scaler a SELECT-only login. The recipe is in the
[native runtime plan](06-native-runtime-implementation-plan.md).

## 9. Operator-facing habits

- Put enough in `Attributes` for filters and triage (`eventType`, `tenant`), and nothing sensitive: attributes are
  visible in transports and logs.
- Set `CorrelationID` from the originating request so one user action can be traced across subscriptions.
- Report progress on long work (`context.Heartbeat({ Percent, Message })`, persisted on the Database transport), so a stuck item is
  recognisable in the operator views.
