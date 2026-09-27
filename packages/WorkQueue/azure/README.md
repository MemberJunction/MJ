# @memberjunction/work-queue-azure

Azure transport for the MemberJunction work queue: one Service Bus **topic** per MJ topic, one Service Bus
**subscription** (with its own dead-letter subqueue and a single SQL rule) per MJ subscription, and an Azure Functions
adapter for thin consumers. **No MemberJunction runtime dependencies** — only `@memberjunction/work-queue-core`, the
Service Bus SDK, `@azure/identity` and `long` — so Functions bundles stay small.

MJ servers load this package through the engine's **`@memberjunction/work-queue-engine/azure`** subpath
(`AzureTransportDriverFactory`), which only `ServerBootstrap` and the four cloud `mj queue` commands import — the
engine's main entry, CodeGen and the data providers never load a Service Bus client. Namespaces, topics, subscriptions
and rules are created by `infrastructure/terraform/work-queue/azure`, never at runtime.

**What runs here:** `None` and `Exclusive` subscriptions. **`Ordered` requires the Database transport** — validation
rejects it on an Azure topic. `Exclusive` uses Service Bus **sessions** (`SessionId = PartitionKey`): a session receiver
owns one key at a time, so a key's messages run one at a time in publish order; what sessions do not do is halt the
key when one of its messages dead-letters (that is `Ordered`).

## How the contract maps to Service Bus

| Contract | Service Bus |
| --- | --- |
| Lease / `LeaseToken` | Peek-lock; the lock token. `ExtendLease` renews the message lock (and the session lock) |
| `LeaseSeconds` | The subscription's `lockDuration`; the service caps it at **5 minutes**, so `LeaseSeconds > 300` is a binding error |
| Attempt | `mj_attempt` on the message (the attempt a copy starts at) plus Service Bus `DeliveryCount − 1` |
| `Retry(delay)` | `abandonMessage` has no delay, so a retry **schedules a copy** to the topic (`mj_target = <subscription>`, `mj_attempt = n + 1`, same `SessionId`) and completes the original. A crash between the two yields one duplicate, which at-least-once allows |
| `Release` | `abandonMessage`: immediate redelivery, `DeliveryCount + 1` (an attempt is consumed, as on SQS) |
| Dead letter | The subscription's `$DeadLetterQueue` subqueue, with `deadLetterReason` and the `mj_*` properties below |
| Crash-loop backstop | `maxDeliveryCount = MaxAttempts + 5`; the consumer's receive-time guard dead-letters at `MaxAttempts + 2` |
| Filter | One SQL rule named `$Default` replacing the service's catch-all: `(NOT EXISTS(mj_target) OR mj_target = '<subscription>') AND (<filter>)`. Rules OR together, so an extra rule is a binding error |
| Publish deduplication | The MJ ledger; the topic also enables duplicate detection on `MessageId = MessageID`, which is silent — a republish is reported `Accepted` |

Every subscription rule carries the **targeting clause** so retry and replay copies, which are published to the
topic, reach only the subscription they are for.

## Entry points

| Import | Use |
| --- | --- |
| `@memberjunction/work-queue-azure` | `AzureTransportDriver`, consumer, operator, SQL-rule translation, binding validation |
| `@memberjunction/work-queue-azure/functions` | `CreateServiceBusFunctionHandler` for Service Bus-triggered Azure Functions |
| `@memberjunction/work-queue-azure/testing` | The in-memory `FakeServiceBus`, fixtures and a conformance harness over the fake |

## Write an Azure Functions consumer

```typescript
import { app, type InvocationContext } from '@azure/functions';
import { Outcome, type WorkContext, type WorkHandler, type WorkMessage, type WorkOutcome } from '@memberjunction/work-queue-core';
import { CreateServiceBusFunctionHandler } from '@memberjunction/work-queue-azure/functions';

class ArchiveEmailEvent implements WorkHandler {
    public async Handle(message: WorkMessage, context: WorkContext): Promise<WorkOutcome> {
        await writeToArchive(message.MessageID, message.Payload, context.Signal);   // idempotent on MessageID
        return Outcome.Complete();
    }
}

const handle = CreateServiceBusFunctionHandler(() => new ArchiveEmailEvent());

app.serviceBusTopic('archive', {
    connection: 'SERVICEBUS',            // namespace connection setting (managed identity: SERVICEBUS__fullyQualifiedNamespace)
    topicName: 'mj-wq-prod-email-events',
    subscriptionName: 'email-archive',
    isSessionsEnabled: false,            // true for Exclusive subscriptions
    autoCompleteMessages: false,         // the adapter settles
    sdkBinding: true,
    handler: (message, context: InvocationContext) => handle(message, { actions: messageActionsOf(context), invocationId: context.invocationId }),
});
```

- Terraform outputs `MJ_WQ_SUBSCRIPTION` (the subscription's policy, filter, namespace and entity names) as an app
  setting; the adapter reads it at cold start. The policy in it is **frozen at apply time**.
- The adapter takes **one message per invocation** (`cardinality: one`) and settles it through the host's message
  actions: complete, abandon, dead-letter, and `renewMessageLock` when the host exposes it. `messageActionsOf` is the
  small mapping from the Functions Service Bus SDK-type binding's actions to the adapter's `FunctionsMessageActions`
  interface (the shape is documented in `functionTypes.ts`); the adapter does not depend on `@azure/functions`.
- Retries with backoff schedule a targeted copy to the topic, so the function's identity needs **Data Sender** on the
  topic as well as Data Receiver on its subscription.
- A message the adapter could not settle makes the invocation throw; the host abandons it and Service Bus redelivers.
- Consumption-plan Functions stop at 10 minutes; keep `MaxProcessingSeconds` below the plan's timeout and
  `LeaseSeconds` at or below 300.

Handler rules are the same as on every transport (`plans/work-queue-1/10-consumer-guide.md`): be idempotent on
`MessageID`, honour `context.Signal`, keep the item a claim check, and publish attribute values in the exact case your
filters use (Service Bus SQL string comparison is ordinal).

## Dead letters

| Source | Reason (`mj_dead_letter_reason`, else Service Bus's own) |
| --- | --- |
| Handler returned `DeadLetter` / threw `FatalWorkError` | the handler's reason |
| Retries exhausted | `MaxAttemptsExceeded` |
| Delivered more than `MaxAttempts + 2` times without being settled (receive-time guard) | `MaxAttemptsExceeded` |
| Body is not an envelope | `InvalidEnvelope` — listed as `sb:<SequenceNumber>` with the raw body in `LastError`; discardable, not replayable |
| Moved by Service Bus after `maxDeliveryCount` (`MaxAttempts + 5`: a crash loop the consumer never saw) | reported as `RedrivePolicy`, `Attempts = 0` |

Listing is a **non-destructive peek** with a `SequenceNumber` cursor, so every dead letter is reachable. Replay and
discard receive from the subqueue in peek-lock mode until they find the target and abandon everything else.

```bash
mj queue dead-letters --subscription email.unsubscribe
mj queue replay  --subscription email.unsubscribe --delivery <MessageID>
mj queue discard --subscription email.unsubscribe --delivery <MessageID> --reason "invalid address"
```

## Identity

`AzureTransportDriver.Create(config)` uses `DefaultAzureCredential` (managed identity first). A transport row with a
`CredentialID` resolves an MJ credential holding `TenantID`, `ClientID` and `ClientSecret` to a `ClientSecretCredential`
(engine `./azure` subpath). Roles the Terraform module assigns: MJAPI gets **Data Sender** on topics and **Data
Owner** on subscriptions (replay reads the dead-letter subqueue and re-sends to the topic); MJ workers get Data Receiver
on their subscriptions and Data Sender on their topics (retry copies); Functions consumers the same for their own.

## Limits (verify against current Azure quotas)

| Limit | Value |
| --- | --- |
| Envelope incl. properties | 262,144 bytes on Standard (the queue's own cap; Premium allows more but topics stay portable) |
| User attributes per message | 10 |
| Lock duration / `LeaseSeconds` | ≤ 5 minutes |
| Retry delay | scheduled enqueue; bounded only by the message TTL |
| Subscription name | 50 characters (the module hashes longer slugs); topic name 260 |
| Duplicate detection window (MessageId) | 10 minutes (set by the module) |

## Testing

- `pnpm test` — unit tests against `FakeServiceBus`, **including core's 26-case transport conformance suite** run
  against the fake (14 cases apply to this transport; the rest are gated by capability). Never calls Azure.
- `pnpm run test:servicebus` — the same conformance suite against a **real Standard namespace**. Set
  `AZURE_SERVICEBUS_NAMESPACE=<name>.servicebus.windows.net` and sign in (`az login`, or environment credentials)
  with an identity holding **Azure Service Bus Data Owner** on the namespace; the harness creates and deletes
  `wqc-sb-*` topics. There is no emulator with session parity, so this run is what proves the SDK gateways.
