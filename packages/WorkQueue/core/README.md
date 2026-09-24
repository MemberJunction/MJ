# @memberjunction/work-queue-core

Transport-neutral contracts and runtime for the MemberJunction durable work queue. **No MemberJunction
runtime dependencies** — Lambda and other external consumers import only this package (plus a transport
package such as `@memberjunction/work-queue-aws`).

Design and contract: `plans/work-queue-1/02-implementation-overview.md` and `03-interfaces-and-tables.md`.

## What is in the box

| Area | Exports |
| --- | --- |
| Envelope & publishing | `WorkMessage`, `PublishRequest`, `PublishResult`, `IWorkPublisher`, `ValidatePublishRequest`, `BuildWorkMessage`, `CanonicalEnvelope`, `PublishErrorCodes` |
| Handlers | `WorkHandler`, `WorkContext`, `Outcome`, `FatalWorkError`, `TransientWorkError` |
| Policy & rules | `SubscriptionPolicy`, `ParseSubscriptionFilter`, `ValidateSubscriptionFilter`, `MatchesFilter`, `FilterFields`, `WORK_QUEUE_FILTER_SUPPORT`, `ComputeBackoffSeconds`, `HeartbeatIntervalSeconds`, `SubscriptionUnsupportedReason`, `FilterUnsupportedReason` |
| Transports | `ITransportDriver`, `ITransportConsumer`, `ITransportOperator`, `TransportCapabilities` |
| Runtime | `ConsumerRuntime` (loop or `ProcessBatch`), `DeliveryExecution` |
| Reference transport | `InMemoryTransport` (Database-transport semantics, in memory) |
| REST client | `WorkQueueApiPublisher`, REST mapping helpers |
| Testing (`/testing`) | `RunConformanceChecks`, `CONFORMANCE_CASES`, `ConformanceAssertionError`, `BuildTopicBinding`, `BuildSubscriptionBinding`, `ManualClock` |
| Testing with vitest (`/testing/vitest`) | `RunTransportConformanceSuite` |

## Writing a handler

```typescript
import { FatalWorkError, Outcome, type WorkContext, type WorkHandler, type WorkMessage } from '@memberjunction/work-queue-core';

interface UnsubscribePayload { email: string; occurredAt: string }

export class UnsubscribeHandler implements WorkHandler<UnsubscribePayload> {
    public async Handle(message: WorkMessage<UnsubscribePayload>, context: WorkContext) {
        if (!message.Payload?.email) {
            throw new FatalWorkError('email missing');           // dead-letter immediately
        }
        await suppress(message.Payload.email, message.MessageID); // idempotent by MessageID
        return Outcome.Complete();                                 // throw anything else → retry with backoff
    }
}
```

### Handler rules

The queue guarantees durable delivery, one valid lease holder while your handler runs, and fencing. Everything
else is yours — see `plans/work-queue-1/10-consumer-guide.md`. Four rules cover most handlers:

1. **Long awaits need no heartbeat code.** Keep `HeartbeatMode: 'Auto'` (the default) and set
   `MaxProcessingSeconds` to the longest a healthy run should take: the runtime renews the lease while your
   handler awaits, and aborts once the cap passes. Use `'Manual'` only when you want a *stuck* handler detected,
   then call `await context.Heartbeat({ Percent })` at real progress boundaries.
2. **Honor `context.Signal`.** It aborts when an operator cancels the item, the lease is lost, the processing cap
   is hit, or the host shuts down; `context.Signal.reason` says which (`'Cancelled'`, `'LeaseLost'`,
   `'MaxProcessingSeconds'`, `'Shutdown'`). Stop whatever external work you started — a child process, a remote
   job, a long query. Stopping promptly matters: after a cancel, the runtime acknowledges it as soon as your
   handler returns, which frees an `Exclusive`/`Ordered` key immediately instead of at lease expiry.
3. **Never block the event loop.** A long synchronous CPU-bound loop stops the heartbeat timer with it and the
   lease expires under you; move that work to a worker thread or child process.
4. **Non-restartable side effects need your own guard.** At-least-once delivery means a handler can run twice.
   Make handlers idempotent (`message.MessageID` is stable across redeliveries and replays), and for work that
   must not overlap — an infrastructure apply, a financial posting — set a `LeaseSeconds` larger than your worst
   heartbeat outage *and* hold a domain lock of your own.

`context.Heartbeat` resolves `false` once the lease is gone or the delivery is cancelled; a transient transport
error does not — it is retried on the next tick. The runtime heartbeats every `min(LeaseSeconds / 3, 30 s)`, so a
cancel or a lost lease is noticed within 30 seconds however long the lease, and it enforces the lease's expiry on
its own timer in both heartbeat modes — a `Manual` handler that stops heartbeating is aborted when its lease runs
out.

**Ordering is publish order.** There is no producer-supplied ordering number. If one producer owns a key's order,
it publishes in order: do not publish N+1 until N is accepted, or publish both in one call. `Ordered`
subscriptions need a topic on the Database transport.

## Subscription filters

A filter is MJ's standard `CompositeFilterDescriptor` JSON over **envelope attributes** — the shape
`mj-filter-builder` edits and user views persist — restricted to what every transport can express:

```jsonc
{ "logic": "and", "filters": [
  { "field": "eventType", "operator": "eq", "value": "click" },
  { "logic": "or", "filters": [
      { "field": "tenant", "operator": "eq", "value": "acme" },
      { "field": "tenant", "operator": "eq", "value": "globex" } ] }
] }
```

Operators: `eq`, `neq`, `startswith`, `isnull`, `isnotnull`. The root is `and`; a nested group may only be a
single-field OR of `eq`; and each field may be constrained only once (brokers read a field's values as OR, so two
AND-ed rules on one field would widen the filter rather than narrow it). Matching is **case-sensitive** (brokers match exactly, so MJ and the broker agree),
which is the one deliberate divergence from `CompositeFilter`'s case-insensitive comparison. Richer filters are
rejected by `ValidateSubscriptionFilter` / `SubscriptionUnsupportedReason` when a subscription is saved, rather
than silently delivering everything.

## Publishing from outside MJ

```typescript
import { WorkQueueApiPublisher } from '@memberjunction/work-queue-core';

const publisher = new WorkQueueApiPublisher({ BaseUrl: 'https://api.example.com/work-queue', ApiKey: process.env.MJ_API_KEY ?? '' });
const results = await publisher.Publish('email.events', [
    { PartitionKey: 'alice@example.com', Attributes: { eventType: 'unsubscribe' }, Payload: { email: 'alice@example.com', occurredAt: '2026-09-16T12:00:00Z' }, DeduplicationKey: 'sg:evt-123' },
]);
// Every result is Accepted, Duplicate or Rejected; retry Rejected items whose Error.Retryable is true.
```

## Testing a transport driver

```typescript
import { BuildTopicBinding, BuildSubscriptionBinding } from '@memberjunction/work-queue-core/testing';
import { RunTransportConformanceSuite } from '@memberjunction/work-queue-core/testing/vitest';

RunTransportConformanceSuite('MyTransport', {
    Capabilities: MY_CAPABILITIES,
    Traits: { ReleaseConsumesAttempt: false, ExpiredLeaseDeadLetters: true, ReceiveWaitSeconds: 0 },
    CreateDriver: async () => new MyTransport(),
    CreateTopic: async (_driver, name, overrides) => BuildTopicBinding(name, overrides),
    CreateSubscription: async (_driver, topic, name, overrides) => BuildSubscriptionBinding(topic, name, overrides),
    AdvanceTime: async (ms) => clock.Advance(ms),
});
```

Outside vitest (for example an integration runner against a live database), call
`await RunConformanceChecks(harness)` from `/testing`: it runs the same 26 cases sequentially, never throws, and
returns `{ Id, Title, Status: 'Passed' | 'Failed' | 'Skipped', Detail, DurationMs }` per case.

`vitest` is an optional peer dependency used only by `/testing/vitest`.

## Rules for contributors

- No `@memberjunction/*` dependency or import, and no runtime `dependencies` — enforced by `src/__tests__/dependencyGuard.test.ts`.
- `cd packages/WorkQueue/core && pnpm test` and `pnpm run build`.
