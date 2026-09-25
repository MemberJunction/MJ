# @memberjunction/work-queue-aws

AWS transport for the MemberJunction work queue: SNS topics, one SQS queue (plus dead-letter queue) per subscription,
and a Lambda adapter for thin consumers. **No MemberJunction runtime dependencies** — only
`@memberjunction/work-queue-core` and the AWS SDK SNS/SQS clients — so Lambda bundles stay small.

MJ servers load this package through the engine's **`@memberjunction/work-queue-engine/aws`** subpath
(`AWSTransportDriverFactory`), which only `ServerBootstrap` imports — the engine's main entry, the CLI's other
commands, CodeGen and the data providers never load an AWS client. Cloud resources are created by
`infrastructure/terraform/work-queue/aws`, never at runtime.

**What runs here:** `None` and `Exclusive` subscriptions. **`Ordered` requires the Database transport** — validation
rejects it on an AWS topic. `Exclusive` on SQS FIFO already processes a key's messages in order, one at a time; what it
does not do is halt the key when one of them dead-letters.

## Entry points

| Import | Use |
| --- | --- |
| `@memberjunction/work-queue-aws` | `AwsTransportDriver`, consumer, operator, filter-policy translation, binding validation |
| `@memberjunction/work-queue-aws/lambda` | `CreateSqsLambdaHandler` for SQS-triggered Lambda consumers. Built on an SQS-only client factory: it never pulls the SNS client into a bundle |
| `@memberjunction/work-queue-aws/testing` | In-memory SNS/SQS fakes and fixtures for tests |

## Write a Lambda consumer

```typescript
import { Outcome, type WorkContext, type WorkHandler, type WorkMessage, type WorkOutcome } from '@memberjunction/work-queue-core';
import { CreateSqsLambdaHandler } from '@memberjunction/work-queue-aws/lambda';

class ArchiveEmailEvent implements WorkHandler {
    public async Handle(message: WorkMessage, context: WorkContext): Promise<WorkOutcome> {
        await writeToArchive(message.MessageID, message.Payload, context.Signal);   // idempotent on MessageID
        return Outcome.Complete();
    }
}

export const handler = CreateSqsLambdaHandler(() => new ArchiveEmailEvent());
```

- Terraform sets `MJ_WQ_SUBSCRIPTION` (the subscription's policy, filter and queue URLs) and enables
  `ReportBatchItemFailures` on the event source mapping. The policy in it is **frozen at apply time**: changing
  `MaxAttempts` or backoff in MJ does nothing here until the manifest is re-exported and applied.
- FIFO event sources use **`batch_size = 1`** (the module enforces it); scale with the event source's
  `maximum_concurrency`, never reserved concurrency.
- Bundle with esbuild (`platform: node`, `format: esm`, `external: ['@aws-sdk/*']`); the Lambda Node.js runtime
  provides the SDK. `examples/thin-consumer/index.ts` is a complete consumer.
- Return `Outcome.Retry(reason, delaySeconds)` or throw `TransientWorkError` to retry; return `Outcome.DeadLetter(reason)`
  or throw `FatalWorkError` to dead-letter now. Any other thrown error retries with backoff.

### Handler rules

The full version is the consumer guide (`plans/work-queue-1/10-consumer-guide.md`); the short version:

- **Be idempotent.** Delivery is at least once, and `MessageID` is stable across redeliveries and replays — use it (or
  your own natural key) as the idempotency key.
- **Honour `context.Signal`.** It aborts when the lease is lost, `MaxProcessingSeconds` passes or the host is shutting
  down (`Signal.reason` says which; `'Cancelled'` never occurs on this transport). Stop whatever external
  work you started; anything you write after that is fenced out anyway.
- **Keep the item a claim check.** Results, output and history belong on your own domain row, referenced from the
  payload — not in `Payload` (256 KB cap) and not in `Progress`.
- **Fit the host.** Lambda's hard ceiling is 15 minutes, and the adapter stops starting records 10 s before the
  deadline and releases them. Set `MaxProcessingSeconds` below the function timeout; work that can run longer belongs
  on an MJ worker or a container job, not here.
- **Publish attributes in the exact case your filters use.** SNS matches attribute values case-sensitively, so the
  queue's filters are case-sensitive everywhere (03 §4.3); normalise values when you publish.
- **Own your side effects.** The queue guarantees delivery and one valid lease holder while your handler runs — not
  that a non-idempotent side effect happens exactly once, and not anything after your handler returns. Work finished
  later by a webhook uses the split-message pattern (record the job on a domain row, complete, publish a completion
  message when the callback arrives); overlap and coalescing policy are yours.

**FIFO queues:** with `batch_size = 1` each invocation gets one message, and SQS holds the rest of its key until it
settles — including for the whole delay of a retry. If a larger batch is ever configured, records of one message group
still run in order, and after a record retries or fails the rest of its group in that batch is released unprocessed
so nothing overtakes it (each such release costs the follower one receive).

**Metrics:** each invocation writes one CloudWatch Embedded Metric Format line in namespace `MJ/WorkQueue`
(`Processed`, `Completed`, `Retried`, `DeadLettered`, `Failed`, `NotStarted`, `DurationMs`; dimension `Subscription`).

## What this transport does not do for you

Per 02 §1a, the queue's guarantees stop when your handler settles. On SQS specifically:

| Not provided | Consequence |
| --- | --- |
| Cancelling a pending or in-flight message (`CancelPending`/`CancelInFlight` are `false`) | An operator can discard a dead letter, not a running one. Handlers that must be interruptible should poll their own domain flag, or live on a Database-transport topic, where 03 §7's cancel flag applies. |
| `Ordered` (halt a key when one of its messages dead-letters) | Put the topic on the Database transport. A cloud topic that needs one such consumer bridges to it: a subscriber republishes onto a Database topic. |
| `None` semantics on a FIFO topic | One `Exclusive` subscription makes the topic — and every queue on it — FIFO. A `None` subscription there is serialised per `PartitionKey`, and a message in retry backoff holds its key. |
| Waiting for work that finishes elsewhere | Use the split-message pattern; the queue never parks a message awaiting a webhook. |
| Suppressing duplicate side effects | Handlers are idempotent, or they hold their own lock. |
| Knowing whether a consumer is still alive | The visibility timeout is the only liveness signal; size `LeaseSeconds` accordingly. |

## Known limits

- **FIFO throughput.** A topic with any `Exclusive` subscription must be FIFO, which caps **every** subscription on it
  at the FIFO quotas (verify the current SNS/SQS FIFO and high-throughput-mode numbers for your region). For a
  firehose, use the **two-topic pattern**: a standard topic for permanence and reporting subscriptions, and a second
  FIFO topic for per-subscriber work.
- **Every publish passes through MJ** (in-process or the REST endpoint), and a `DeduplicationKey` costs two
  MJ-database writes (reserve, confirm). Producers at firehose volume should rely on stable `MessageID`s — on a FIFO
  topic they are the SNS deduplication ID for five minutes — and on the direct publisher follow-on (09d).
- **Receives are attempts.** `Attempt` is SQS's receive count, so a `Release` on shutdown or a Lambda throttle uses
  one up. The receive-time guard (`MaxAttempts + 2`) and the redrive policy (`MaxAttempts + 5`) leave room for that;
  sustained throttling does not.
- **A new subscription starts empty.** SNS delivers only what is published after the subscription exists.

## Calling MemberJunction from a Lambda consumer

Thin consumers do not load MJ. When a handler needs MJ data, call the MJ API with an API key held in AWS Secrets
Manager (scope the key to the operations the handler needs). Handlers that need MJ entities throughout should run
as `MJWorker` subscriptions instead.

## Dead letters

| Source | Reason attribute (`mj_dead_letter_reason`) |
| --- | --- |
| Handler returned `DeadLetter` / threw `FatalWorkError` | the handler's reason |
| Retries exhausted | `MaxAttemptsExceeded` |
| Received more than `MaxAttempts + 2` times without being settled (the consumer's receive-time guard) | `MaxAttemptsExceeded` |
| Body is not an envelope | `InvalidEnvelope` — listed as `sqs:<SQS MessageId>` with the raw body in `LastError`; discardable, not replayable |
| Moved by the SQS redrive policy (`MaxAttempts + 5` receives: a crash loop the consumer never saw) | no attribute — reported as `RedrivePolicy`, `Attempts = 0` |

Every dead letter is its own FIFO message group, so a scan can reach all of a poison key's dead letters.

Operate them from MJ:

```bash
mj queue dead-letters --subscription email.unsubscribe
mj queue replay  --subscription email.unsubscribe --delivery <MessageID>
mj queue discard --subscription email.unsubscribe --delivery <MessageID> --reason "invalid address"
```

Listing, replay and discard are **best effort** on SQS: they long-poll up to 100 dead letters at a time and stop after
three consecutive empty receives. For large dead-letter queues, fix the cause and move everything back with SQS's own
redrive (`aws sqs start-message-move-task --source-arn <dlq-arn> --destination-arn <queue-arn>`); moved messages keep
their body and are processed again.

## IAM

The Terraform module outputs `mjapi_policy_json` (publish, validation, dead-letter operations) and
`mj_worker_policy_json` (consume MJ worker queues, plus the read-only `sns:Get*`/`sqs:GetQueueAttributes` calls binding
validation makes at host start). Lambda consumer roles are created by the module with access to
their own queue, dead-letter queue and log group only.

## Limits (verify against current AWS quotas)

| Limit | Value |
| --- | --- |
| Envelope incl. attributes | 262,144 bytes |
| User attributes per message | 10 |
| Retry delay / lease extension | ≤ 12 hours from receive |
| Lambda batch size | 1 on FIFO queues (enforced); ≤ 10 on standard queues |
| Event source `maximum_concurrency` | ≥ 2 |
| FIFO deduplication window (MessageID) | 5 minutes |

## Testing

- `pnpm test` — unit tests against in-memory fakes; never calls AWS.
- `pnpm run test:localstack` — the shared transport conformance suite against LocalStack
  (`docker compose -f localstack/docker-compose.yml up -d --wait` first). Two cases are skipped there as
  **environment divergences**, not transport behaviour: LocalStack keeps honouring an SQS receipt handle after its
  visibility timeout has expired and the message has been re-received, so C07 (a stale lease token is fenced out) and
  C09 (extending a lost lease reports Lost) cannot be observed. Real SQS rejects the stale handle
  ("The receipt handle has expired"), which `SdkSqsGateway` maps to `LeaseLost` / `Lost`; confirm those two cases
  against a sandbox AWS account before relying on them.
- `pnpm run check:lambda-bundle` — fails if the `./lambda` entry reaches the SNS client or an MJ runtime package, or
  its own code exceeds 150 KB.
