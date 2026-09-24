# 09d — Direct Manifest Publisher — Fast Follow

## Summary

`DirectManifestPublisher` is an `IWorkPublisher` implementation in core for **external producers on cloud
transports**:
- It fetches a **versioned topology manifest** from MJ and caches it.
- It publishes **straight to SNS (or Service Bus / Pub/Sub)** using exactly the binding rules the MJ publisher
  applies.

MJ stays the single authority on how a topic is published (D9), but leaves the per-message path. Producers
code against `IWorkPublisher`, so switching from `WorkQueueApiPublisher` is a configuration change.

## Motivation

- The publish API (inside MJAPI, or the 09c gateway) adds one network hop and a shared scaling tier to every
  message.
- For producers already running in the same cloud (webhook Lambdas, 09g bridges), direct publish removes
  latency, cost and an availability dependency, without letting producers hardcode binding decisions. That
  hardcoding was the original objection to direct SNS publishing.

## Scope / Non-goals

**In scope:** manifest versioning (hash), a manifest remote operation, the publisher implementation using core's
shared validation, a deduplication-key protocol, a skew-handling protocol, IAM guidance, and a decision guide.

**Non-goals:**
- **Database transport.** Publishing there requires the MJ DB. `DirectManifestPublisher` rejects DB-transport
  topics with `Code: 'TransportNotDirect'`.
- Publishing without any MJ contact at all: the manifest must be fetched at least once.

## Design

### Manifest access (contract proposal C1)

Revision 2 exposes no REST manifest route (REST is publish-only; `mj queue export-topology` is CLI). This spec adds
a remote operation, callable by an API key over the generic `ExecuteRemoteOperation` GraphQL mutation:

| Key | RequiredScope | Input | Output |
|---|---|---|---|
| `WorkQueue.GetTopologyManifest` | `workqueue:read` | `{ transportName: string; topics: string[]; view: 'publisher'; ifNoneMatch?: string }` | `{ notModified: boolean; manifestHash: string; manifest: TopologyManifest \| null }` |

- `manifestHash`: SHA-256 over the canonical JSON of the publisher-relevant fields only; `ifNoneMatch` equal to it →
  `notModified: true`, `manifest: null`.
- `view: 'publisher'` omits subscriptions and filters.
- `ManifestTopic` gains publisher-relevant fields:

```ts
export interface ManifestTopic {
  Name: string;
  IsFifo: boolean;
  MaxPayloadBytes: number;
  Status: 'Active' | 'Disabled';                 // new
  BindingConfig: Record<string, WorkJson>;       // new — e.g. { SnsTopicArn }
  BindingEpoch: number;                          // new — increments on breaking binding change
  Subscriptions: ManifestSubscription[];         // omitted when ?view=publisher
}
export interface TopologyManifest { /* … */ ManifestHash: string; }   // new
```

`BindingEpoch` is a new `WorkQueueTopic.BindingEpoch int NOT NULL DEFAULT 1`. It is incremented by the engine
whenever `TransportID`, `IsFifo` or the binding's resource identifier changes.

### Shared validation (adopted in 03 §1.1)

```ts
// core (Phase 1)
export function ValidatePublishRequest(topic: TopicBinding, request: PublishRequest): PublishError | null;
export function BuildWorkMessage(topicName: string, request: PublishRequest, publishedAt: Date, newId: () => string): WorkMessage;
```

The MJ engine, the gateway and `DirectManifestPublisher` all call these. Each transport package exports a pure
`ToNativePublishEntry` (AWS: `PublishBatchRequestEntry`; Azure: `ServiceBusMessage`), so the native
attributes, `MessageGroupId`/`SessionId` and dedup IDs are built identically everywhere.

### Deduplication keys (the MJ ledger is bypassed)

Revision 2 keeps the `DeduplicationKey` + TTL ledger in the MJ database for every transport (03 §2.1). Publishing
straight to the cloud skips it. Options:

| Option | Behavior | Verdict |
|---|---|---|
| A — MessageID-only dedup | Reject requests carrying `DeduplicationKey` (`Code: 'DeduplicationKeyRequiresMJ'`); producers derive a stable `MessageID` instead (e.g. UUIDv5 of the provider event ID). FIFO topics suppress repeats within SNS's 5-minute window; standard topics don't dedup; handlers stay idempotent. | ✅ **default** — keeps the per-message path free of MJ |
| B — lightweight reserve/confirm call | Remote operations `WorkQueue.ReserveDeduplication` / `WorkQueue.ConfirmDeduplication` (batched, `workqueue:publish`) wrap `DeduplicationLedger`; the publisher reserves, sends, confirms/releases. | ✅ **opt-in** per publisher (`UseDeduplicationLedger: true`) for producers that truly need key-window dedup (e.g. "re-announce import X within 7 days") |
| C — cloud-native dedup store | a producer-side table (DynamoDB etc.) | ❌ reintroduces the infrastructure Revision 2 removed |

**Recommendation:** A by default; B when a producer needs windows longer than the transport's own dedup. With B,
MJ is back in the path for those requests only, and an MJ outage turns them into `Rejected(TransportUnavailable,
Retryable=true)` rather than silently publishing duplicates.

Option B must follow the Revision 4 ledger protocol (03 §2.1, F1) exactly, because the crash window it closes is
wider for a remote publisher: **only a `Confirmed` row returns `Duplicate`**. A `Reserved` row owned by the **same**
`MessageID` is re-taken and the send repeated (the publisher crashed or timed out between reserve and send; a FIFO
topic's 5-minute window absorbs the double send); a `Reserved` row owned by a **different** `MessageID` returns
`Rejected(DeduplicationPending, Retryable=true)`. The direct publisher therefore generates its `MessageID`s before
reserving and reuses them on every retry, as `WorkQueueApiPublisher` does. This also bears on 11 §4's known limit:
the ledger is two MJ-database writes per keyed message, so firehose producers should use option A.

### Publisher

```ts
export interface DirectManifestPublisherOptions {
  MjBaseUrl: string;
  ApiKeyProvider: () => Promise<string>;          // e.g. Secrets Manager
  Transport: 'AWS' | 'Azure' | 'GCP';
  Topics: string[];                               // pre-fetch set
  ManifestTtlSeconds?: number;                    // default 60
  UseDeduplicationLedger?: boolean;               // default false (option B above)
  MaxStaleSeconds?: number;                       // default 900: serve stale manifest if MJ unreachable
  NativeClientFactory: NativePublishClientFactory; // injected SDK clients (credentials = producer's own identity)
}
export class DirectManifestPublisher implements IWorkPublisher { /* Publish(topic, requests) */ }
```

Flow:

```
Publish(topic, reqs)
  manifest = cache.get()  (refresh if age > TTL; ifNoneMatch = cached hash; on MJ failure keep stale ≤ MaxStale)
  t = manifest.topic(topic)  → missing/Disabled → Rejected(TopicNotFound/TopicDisabled, Retryable=false)
  per req: ValidatePublishRequest(t, req) → Rejected or message = BuildWorkMessage(...)
           DeduplicationKey present → option A: Rejected(DeduplicationKeyRequiresMJ) | option B: batch Reserve (Duplicate → skip)
  native.publishBatch(ToNativePublishEntry(t, message)…)  // chunks
  native error classes:
     NotFound / AuthorizationError on resource / InvalidParameter(MessageGroupId…)
        → force manifest refresh; if BindingEpoch or hash changed → rebuild & retry chunk once
        → else Rejected(BindingMismatch, Retryable=true)
     throttling / 5xx → Rejected(TransportUnavailable, Retryable=true)
  option B: Confirm keys of sent messages, Release keys of failed ones
```

### Version skew rules

| Change in MJ | Classification | Handling |
|---|---|---|
| Subscription added/removed/filter changed | non-breaking | invisible to publishers (the transport applies filters) |
| Topic `MaxPayloadBytes` lowered | soft | stale publishers may send larger messages until refresh; still ≤ transport hard limit (256 KB) |
| Topic `Disabled` | soft | honored within TTL. Operators wait TTL + MaxStale before relying on it, or revoke IAM for hard stop. |
| `IsFifo`, transport or resource change | **breaking** (`BindingEpoch++`) | **Runbook:** create a new topic (preferred), or keep the old resource alive through `MaxStaleSeconds` + TTL so stale publishers still succeed, then retire it. MJ `ValidateBindings` warns when a topic's epoch changed within the drain window. |

Direct publishers don't stamp the manifest version on messages. Consumers never depend on the publisher's
manifest version, because their own binding is authoritative.

### Security

| Concern | Control |
|---|---|
| Producer identity for publish | the producer's own cloud identity: IAM role with `sns:Publish` **only on the ARNs it is allowed** (Terraform module output `publisher_policy_json` per topic set); Azure `Data Sender` role on topics |
| Producer identity toward MJ | API key with `workqueue:read` on the topic names (manifest only), plus `workqueue:publish` only when option B is enabled; it can't operate |
| Manifest contents | contains ARNs and policy only, no secrets. `?view=publisher` omits subscriptions and filters. |
| Audit | MJ no longer sees each publish. `PublishedByUserID` isn't available. Cloud-native audit (CloudTrail data events for SNS, if enabled) is the record. Documented trade-off. |
| Tampering with rules | a producer that skips validation can only do what IAM allows. Consumers still validate envelope shape defensively (runtime rejects malformed envelopes → dead letter `InvalidEnvelope`). |

### When to use

| Use `WorkQueueApiPublisher` (default) | Use `DirectManifestPublisher` |
|---|---|
| DB-transport topics | cloud-transport topics only |
| Producer outside the cloud account / no IAM identity | producer runs with a cloud identity in the same account/tenant |
| MJ-side audit of each publish required | cloud audit acceptable |
| Key-window deduplication on every message | stable `MessageID` dedup suffices (or option B for the few that need keys) |
| Volume the gateway handles comfortably | sustained volume where gateway cost/latency matters, or ingress must survive MJ outages (up to `MaxStaleSeconds`) |

## Interfaces / schema changes

- `WorkQueueTopic.BindingEpoch` (new column).
- `ManifestTopic.Status/BindingConfig/BindingEpoch`, `TopologyManifest.ManifestHash`.
- Remote operation `WorkQueue.GetTopologyManifest` (hash-conditional); optional `WorkQueue.ReserveDeduplication` /
  `WorkQueue.ConfirmDeduplication` (option B).
- (Already in Phase 1: core `ValidatePublishRequest`, `BuildWorkMessage`.)
- Per-transport `ToNativePublishEntry`.
- Terraform output `publisher_policy_json`.

## Dependencies on Phase 1

`WorkQueueEngine.ExportManifest`, `DeduplicationLedger` (plan 05), the AWS driver publish path in
`@memberjunction/work-queue-aws` (refactored to expose `ToNativePublishEntry`, plan 07), and core envelope
validation (plan 04).

## Testing

| Tier | What |
|---|---|
| Dedup | option A rejects keyed requests; option B reserve → send failure → release, and duplicate key → `Duplicate` |
| Golden | for a matrix of topics (standard/FIFO × with/without partition key × with/without attributes), the engine publisher and direct publisher produce **byte-identical** native entries |
| Unit | cache TTL/stale behavior, 304 handling, skew retry path, error classification |
| LocalStack | publish via direct publisher → conformance consumers receive identical envelopes |
| Security | IAM policy simulation: publisher role denied on non-listed topic ARNs |

## Work breakdown

| Item | Size |
|---|---|
| `ToNativePublishEntry` refactor (validation already in core) | S |
| Manifest remote operation (hash/epoch, publisher view) + optional dedup remote operations | M |
| `DirectManifestPublisher` + cache + skew handling | M |
| Terraform publisher policy output | S |
| Golden + LocalStack tests | M |

## Open questions

1. Should MJ refuse breaking binding edits on topics with direct publishers registered (would require publishers to register), or is the runbook enough?
2. Is `MaxStaleSeconds` default 900 s right for webhook ingress during MJ outages?
3. Should a sampled "publish receipt" be sent back to MJ asynchronously for audit dashboards?
