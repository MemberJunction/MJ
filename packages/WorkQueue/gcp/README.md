# @memberjunction/work-queue-gcp

Google Cloud Pub/Sub transport for the MemberJunction work queue: Pub/Sub topics, pull subscriptions with ordering-key `Exclusive` partition isolation, dead-letter topic routing & inspection, and a Cloud Run HTTP Push adapter for thin serverless workers. **No MemberJunction runtime dependencies** — only `@memberjunction/work-queue-core` and `@google-cloud/pubsub`.

MJ servers load this package through the engine's **`@memberjunction/work-queue-engine/gcp`** subpath (`GcpTransportDriverFactory`), which `ServerBootstrap` and the `mj queue` CLI commands import — the engine's main entry, `ServerBootstrapLite`, CodeGen, and data providers never load Google Cloud Pub/Sub clients.

**What runs here:** `None` and `Exclusive` subscriptions. **`Ordered` requires the Database transport** — validation rejects it on a GCP topic. `Exclusive` uses Pub/Sub message ordering (`EnableMessageOrdering = true`, mapped from `PartitionKey` -> `orderingKey`), guaranteeing one in-flight message per key at a time while keeping different keys concurrent.

## Entry points

| Import | Use |
| --- | --- |
| `@memberjunction/work-queue-gcp` | `GcpTransportDriver`, `PubSubTransportConsumer`, `PubSubMessagePump`, `GcpTransportOperator`, Pub/Sub filter translation, binding validation |
| `@memberjunction/work-queue-gcp/cloudrun` | `CreateCloudRunPushHandler` and `HandleNodeHttpPushRequest` for Pub/Sub HTTP Push endpoints on Cloud Run. Never imports `adminClient` or `SdkPubSubAdminGateway` |
| `@memberjunction/work-queue-gcp/testing` | In-memory `FakePubSubGateway`, `GcpConformanceHarness`, and fixtures for deterministic tests |

## Write a Cloud Run HTTP Push consumer

```typescript
import { Outcome, type WorkContext, type WorkHandler, type WorkMessage, type WorkOutcome } from '@memberjunction/work-queue-core';
import { CreateCloudRunPushHandler } from '@memberjunction/work-queue-gcp/cloudrun';

class ArchiveEmailEvent implements WorkHandler {
    public async Handle(message: WorkMessage, context: WorkContext): Promise<WorkOutcome> {
        await writeToArchive(message.MessageID, message.Payload, context.Signal);
        return Outcome.Complete();
    }
}

export const HandlePush = CreateCloudRunPushHandler(() => new ArchiveEmailEvent(), {
    RequireBearerToken: true,
});
```

- Set `MJ_WQ_SUBSCRIPTION` (the JSON `SubscriptionBinding` policy, filter, and Pub/Sub topic/subscription/DLQ config) in the Cloud Run service environment.
- Parses standard Pub/Sub push envelopes (`{ message: { data (base64), messageId, publishTime, attributes, orderingKey }, subscription, deliveryAttempt }`).
- Returns HTTP `200`/`204` on `Outcome.Complete()` and `Outcome.DeadLetter(...)` / `FatalWorkError` (after publishing to `DeadLetterTopicName` when configured) so Pub/Sub ACKs the delivery.
- Returns HTTP `503` (with `Retry-After` when specified) on `Outcome.Retry(...)` / `TransientWorkError`, `401`/`403` on failed bearer/OIDC auth hooks, and `400` on malformed push requests.

## Authentication & Configuration

`MJ: Work Queue Transports` row with `DriverClass = 'GCP'`:

```json
{
  "ProjectId": "my-gcp-project",
  "ApiEndpoint": null,
  "UseEmulator": false
}
```

| `CredentialID` | Credentials MJAPI uses |
| --- | --- |
| `null` | Google Application Default Credentials (Workload Identity on GKE / Cloud Run, GCE metadata, or `gcloud auth application-default login` locally). |
| An `MJ: Credentials` row | Decrypted `{ "CredentialsJson": "..." }`, `{ "ClientEmail": "...", "PrivateKey": "..." }`, or `{ "KeyFilename": "..." }`. |

## Dead letters & Operator actions

- Configure `DeadLetterTopicName` and `DeadLetterSubscriptionName` in the subscription's `BindingConfig`.
- `ListDeadLetters` pulls from `DeadLetterSubscriptionName` and immediately nacks non-settled entries (`AckDeadlineSeconds = 0`) so inspection is non-destructive.
- `Replay` re-publishes the envelope to the primary topic marked with `mj_replay = '1'` and acknowledges the dead-letter entry.
- `Discard` acknowledges and removes the dead-letter entry from `DeadLetterSubscriptionName`.
- Native `deadLetterPolicy.maxDeliveryAttempts` is validated against `max(5, MaxAttempts + 5)` (`REDRIVE_MARGIN`).

## Limits (Google Cloud Pub/Sub)

| Limit | Value |
| --- | --- |
| Envelope + attributes | 262,144 bytes (256 KB MJ WorkQueue default; Pub/Sub max 10 MB) |
| Topic / Subscription ID length | 255 characters |
| OrderingKey length | 1,024 bytes |
| Ack deadline | 10–600 seconds (auto-extended via `ExtendLease` / `Heartbeat`) |

## Testing

- `pnpm test` — deterministic unit and full WorkQueue transport conformance suite against `FakePubSubGateway`; never calls GCP.
- `pnpm run check:cloudrun-bundle` — fails if `./cloudrun` reaches `SdkPubSubAdminGateway` / `adminClient` or an MJ runtime package, or exceeds 150 KB.
- `MJ_TEST_LIVE_GCP_PUBSUB=1` with `GCP_PUBSUB_PROJECT_ID` (and optional `PUBSUB_EMULATOR_HOST`) — runs `pnpm run test:live` against a live Google Cloud Pub/Sub project or local emulator with bounded timeouts and automatic topic/subscription cleanup.
