# 09f — Email Event Ingestion (SendGrid Event Webhook + One-Click Unsubscribe) — Follow-on

## Summary

This is the first production consumer for use case 1. A thin **ingress** receives email provider events, and
the same **verify → normalize → publish** library runs in two hosts:
- a Lambda on AWS deployments
- an MJ Server Extension on DB-transport deployments

It publishes normalized events to `email.events`. Independent subscriptions record events permanently, feed
reporting, update subscriber state, and process unsubscribes with at-least-once guarantees. It also closes a
data gap: Communication Logs can't currently be linked to provider events.

## Motivation & verified current state

- **No tracking-event ingestion exists.** The SendGrid provider (`packages/Communication/providers/sendgrid/src/SendGridProvider.ts`)
  supports Inbound Parse (inbound mail) only. `BaseCommunicationProvider.ParseNotification`
  (`packages/Communication/base-types/src/BaseProvider.ts`, documented ~:993–1003) parses inbound message
  notifications, not engagement events.
- **`MJ: Communication Logs` has no provider message identifier.** Its fields are `ID`, `CommunicationProviderID`,
  `CommunicationProviderMessageTypeID`, `CommunicationRunID`, `Direction`, `MessageDate`, `Status`,
  `MessageContent`, `ErrorMessage` (`packages/MJCoreEntities/src/generated/entities/__mj.ts` ~:11495–11551).
  A provider event therefore can't be joined back to the send that produced it.
- **One-click unsubscribe** (RFC 8058) must never be dropped (use case 1, R1.1).

## Scope / Non-goals

**In scope:**
- Package `@memberjunction/email-event-ingress` (no MJ dependencies): SendGrid verifier and normalizer,
  one-click unsubscribe endpoint handler, publish helper.
- Lambda host and MJ Server Extension host.
- Topics/subscriptions metadata.
- Communication Log linkage schema.
- A permanence event table.
- Reference handlers for permanence and unsubscribe.

**Non-goals:**
- Reporting dashboards themselves (the subscription and handler contract only).
- Other providers (the normalizer interface allows them later).
- Bounce classification policy.
- Choosing which entity is "the subscriber" (open question 1).

## Design

### Topology

```
SendGrid Event Webhook ──POST (JSON array, ECDSA signed)──┐
List-Unsubscribe-Post one-click (RFC 8058) ──POST─────────┤
                                                           ▼
                           ingress (Lambda | MJ Server Extension)
                           verify → normalize → publish (MessageID = UUIDv5(provider, eventId))
                                                           │
             ┌─────────────────────────────────────────────┴───────────────────────────┐
  DB deployment: one topic                              AWS deployment: two topics (W7 two-topic pattern)
  email.events (PublishOrder, not FIFO)                 email.events            (standard SNS)
   ├ email.record          None                          ├ email.record          None      (Lambda)
   ├ email.reporting       None                          └ email.reporting       None      (Lambda)
   ├ email.subscriber      Exclusive                    email.subscriber-events (FIFO SNS; ingress publishes
   └ email.unsubscribe     Exclusive, filtered            only subscriber-affecting types)
                                                         ├ email.subscriber      Exclusive (MJWorker, needs MJ)
                                                         └ email.unsubscribe     Exclusive, filtered (MJWorker)
```

Why two topics on AWS: `Exclusive` requires a FIFO topic (W7), and FIFO throughput ceilings shouldn't
constrain the full event firehose. Only subscriber-affecting events (`bounce`, `dropped`, `spamreport`,
`unsubscribe`, `group_unsubscribe`, `group_resubscribe`, plus `click` / `open` for last-engaged if enabled)
go to the FIFO topic.

| Subscription | Filter (03 §4) | Partition | Host | Handler responsibility |
|---|---|---|---|---|
| `email.record` | — | None | External (AWS) / MJWorker (DB) | idempotent upsert into `CommunicationEvent` keyed `(ProviderID, ProviderEventID)` |
| `email.reporting` | — | None | External | aggregate counters (commutative) |
| `email.subscriber` | `eventType: [bounce, dropped, spamreport, click, open]` | Exclusive by `RecipientKey` | MJWorker | last-writer-wins by `OccurredAt` on subscriber status fields |
| `email.unsubscribe` | `eventType: [unsubscribe, group_unsubscribe, group_resubscribe]` | Exclusive by `RecipientKey` | MJWorker | apply suppression/preference; compare `OccurredAt` against the latest preference change; alert on dead letter |

`email.unsubscribe` policy: `MaxAttempts: 10`, `BackoffMaxSeconds: 3600`. A CloudWatch / DB alert fires on
any dead letter (legal significance).

### Partition key privacy

`RecipientKey` = `hex(SHA-256(lowercase(trim(email))))[0..32]`. Partition keys show up in SQS
`MessageGroupId` and logs, so the raw email isn't used. Handlers read the email from the payload.

### Normalized event (payload schema, `WorkJson`-compatible)

```ts
export type EmailEventType =
  | 'processed' | 'dropped' | 'delivered' | 'deferred' | 'bounce'
  | 'open' | 'click' | 'spamreport' | 'unsubscribe' | 'group_unsubscribe' | 'group_resubscribe';

export type UnsubscribeKind = 'OneClick' | 'Link' | 'Group' | 'SpamReport';

export interface NormalizedEmailEvent {
  SchemaVersion: 1;
  Provider: 'SendGrid' | 'MJ';            // 'MJ' for MJ-hosted one-click endpoint
  EventType: EmailEventType;
  ProviderEventID: string;                // sg_event_id; MJ endpoint: UUID it generates
  ProviderMessageID: string | null;       // sg_message_id (prefix before first '.' = X-Message-Id at send)
  OccurredAt: string;                     // ISO from event timestamp (unix seconds)
  ReceivedAt: string;
  RecipientEmail: string;                 // normalized lowercase/trimmed
  RecipientKey: string;                   // hash above
  CampaignRef: string | null;             // marketing_campaign_id / custom_args.mjCampaignId
  CommunicationLogID: string | null;      // custom_args.mjCommunicationLogId when MJ sent the mail
  Categories: string[];
  URL: string | null;                     // click
  UnsubscribeKind: UnsubscribeKind | null;
  GroupID: string | null;                 // asm_group_id
  Bounce: { Type: string | null; Status: string | null; Reason: string | null } | null;
  Client: { UserAgent: string | null; IP: string | null } | null;   // omitted unless config.captureClientInfo (PII)
}
```

Attributes (≤ 10): `eventType`, `provider`, `isUnsubscribe` (`'true'|'false'`), `campaign` (optional).

### Identity & idempotency

| Layer | Key |
|---|---|
| Publish dedup | `MessageID = UUIDv5(WQ_EMAIL_NAMESPACE, provider + ':' + ProviderEventID)`: stable across SendGrid retries. DB: reported as `Duplicate`. AWS FIFO: silently suppressed within the 5-minute window, returned as `Accepted`. AWS standard: not deduplicated. **`DeduplicationKey` is deliberately not used for the firehose topic** — each key costs two MJ-ledger writes per event (03 §2.1); stable `MessageID` + idempotent handlers is sufficient. It *is* used on the one-click endpoint (`unsubscribe:{token}`, TTL 7 days), where volume is low and a double-submitted POST should not publish twice. |
| Handler idempotency | `CommunicationEvent` unique `(CommunicationProviderID, ProviderEventID)`; subscriber updates guarded by `OccurredAt` comparison |
| Send linkage | **custom args at send time**: MJ adds `mjCommunicationLogId` to SendGrid `custom_args` so events carry it back, plus a stored `ProviderMessageID` fallback |

### Ingress library (`@memberjunction/email-event-ingress`)

```ts
export interface RawWebhookRequest { Headers: Record<string, string>; RawBody: Uint8Array; }

export function VerifySendGridSignature(req: RawWebhookRequest, publicKeyBase64Der: string, maxSkewSeconds: number): boolean;
//  headers X-Twilio-Email-Event-Webhook-Signature (base64 ECDSA P-256 / SHA-256) and
//  X-Twilio-Email-Event-Webhook-Timestamp; signed content = timestamp + raw body bytes (verify exact
//  construction against current SendGrid docs); reject if |now - timestamp| > maxSkewSeconds (default 300)

export function NormalizeSendGridEvents(body: WorkJson, receivedAt: Date, options: NormalizeOptions): NormalizedEmailEvent[];

export async function PublishEmailEvents(
  publisher: IWorkPublisher, events: NormalizedEmailEvent[], routing: EmailTopicRouting
): Promise<{ AllDurable: boolean; Results: PublishResult[] }>;
//  chunks ≤ 100 per request; routes to one or two topics per EmailTopicRouting;
//  AllDurable = every result Accepted|Duplicate

export function HandleOneClickUnsubscribe(req: RawWebhookRequest, tokenVerifier: UnsubscribeTokenVerifier): NormalizedEmailEvent | null;
//  RFC 8058: POST body "List-Unsubscribe=One-Click"; recipient/list identity from a signed token in the URL
```

### Response semantics (R1.1)

```
verify fails            → 401 (provider will not "fix" by retry; alert on rate)
body invalid JSON       → 400
normalize: unknown event types → skipped + counted (not an error)
publish AllDurable      → 200
any Rejected Retryable / transport error → 503  → SendGrid retries the WHOLE batch
                          (already-accepted events: `Duplicate` on DB, silently suppressed on AWS FIFO within 5 min, re-delivered on AWS standard, which handlers absorb idempotently)
any Rejected non-retryable (validation) → log + dead-letter record to ingress error log, still 200
                          (retrying won't help; prevents a poison event from blocking the provider's queue)
```

- **Provider retry window:** SendGrid retries non-2xx responses for a limited period (documented as up to
  24 hours; verify at implementation). Ingress outages longer than that lose events. Alarm on a sustained
  503 rate > 1% for 5 minutes.
- **Latency budget:** p99 < 3 s end to end (verify SendGrid's webhook timeout). Batch publish through the MJ
  API; move to the 09c gateway or 09d direct publisher once volume warrants.

### Hosts

| Deployment | Ingress host | Publisher |
|---|---|---|
| AWS | API Gateway HTTP API (or Lambda Function URL) → `email-ingress` Lambda (raw body: `isBase64Encoded` decode). Secrets: SendGrid public key + MJ API key in Secrets Manager. | `WorkQueueApiPublisher` (Phase 1); `DirectManifestPublisher` (09d) later |
| DB / MJ-only | `EmailEventIngressExtension` (Server Extension, pre-auth route, raw body preserved like `packages/MJServer/src/rest/SignatureWebhookHandler.ts`, pattern per `packages/MessagingAdapters/src/slack/SlackMessagingExtension.ts`) | `WorkQueueEngine` in-process |

One-click unsubscribe: when MJ controls the `List-Unsubscribe` header, the URL points at the same ingress host
(`POST /email/unsubscribe/one-click/{token}`). When SendGrid subscription tracking controls it, SendGrid emits
`unsubscribe` / `group_unsubscribe` events instead. Both paths normalize to the same event.

## Interfaces / schema changes

| Change | Detail |
|---|---|
| `CommunicationLog.ProviderMessageID nvarchar(255) NULL` + index | set by providers on send (SendGrid: `X-Message-Id` response header); lets events without `mjCommunicationLogId` be matched on the `sg_message_id` prefix |
| New table `CommunicationEvent` → `MJ: Communication Events` | `ID`, `CommunicationProviderID` FK, `CommunicationLogID` FK NULL, `ProviderEventID nvarchar(255)`, `ProviderMessageID nvarchar(255) NULL`, `EventType nvarchar(30)` CHECK list, `OccurredAt datetimeoffset`, `RecipientEmail nvarchar(320)`, `RecipientKey char(32)`, `CampaignRef nvarchar(255) NULL`, `URL nvarchar(2000) NULL`, `UnsubscribeKind nvarchar(20) NULL` CHECK, `Details nvarchar(max) NULL` (bounce/client JSON); UNIQUE (`CommunicationProviderID`, `ProviderEventID`); `TrackRecordChanges=0` |
| SendGrid provider send | add `custom_args.mjCommunicationLogId`; capture `X-Message-Id` |
| Metadata | topics/subscriptions for both deployment shapes (variant chosen by transport) |

For high-volume deployments, the `email.record` handler can target an external event store instead of
`CommunicationEvent` (open question 3).

## Dependencies on Phase 1

AWS transport (FIFO + standard topics, Lambda adapter; dead letters in the SQS dead-letter queue with `mj_*`
reason attributes, alarmed via CloudWatch), DB transport, publish REST API + API keys + `AllowExternalPublish` on
the email topics, deduplication ledger (one-click endpoint), Server Extension hosting, `WorkQueue.*` remote
operations for dead-letter replay.

## Testing

| Tier | What |
|---|---|
| Unit | signature verification against SendGrid's published test vectors / a generated P-256 key; normalization golden files for every event type; UUIDv5 stability; response-semantics table |
| Integration (DB) | extension → `email.events` → four subscriptions; replaying the same webhook body yields `Duplicate` and no double rows |
| AWS (LocalStack) | Lambda ingress → two topics → queues; subscriber FIFO grouping by RecipientKey |
| Load | 5k events/s synthetic bursts in 1k-event batches; verify zero loss (count reconciliation per MessageID) |
| Failure | MJ API unavailable → 503 → re-post succeeds; one poison event → 200 with ingress error record |

## Work breakdown

| Item | Size |
|---|---|
| Ingress library (verify, normalize, publish, one-click) | M |
| Lambda host + Terraform wiring (API Gateway, secrets) | M |
| Server Extension host | S |
| Communication Log linkage (schema + SendGrid send changes) | M |
| `CommunicationEvent` table + `email.record` handler | M |
| `email.unsubscribe` + `email.subscriber` reference handlers | M (depends on open question 1) |
| Metadata + alerts | S |
| Tests incl. load | M |

## Open questions

1. Which entity is the "subscriber" / suppression list in core MJ, versus BizApps (e.g. a membership/contact app)? The handlers may need to be pluggable per app.
2. Should `open` / `click` feed `email.subscriber` by default (volume on the FIFO topic), or be opt-in?
3. Should permanence at high volume go to `CommunicationEvent` in the MJ DB, or to an analytics store (S3/Athena) via 09g batching?
4. Is capturing IP/User-Agent allowed under customers' privacy policies? It's off by default here.
