# MJ Comms V2 — Phase 3: Providers, Webhooks, Open Pixel & Unsubscribe

**Status:** Implemented. Where this plan and the code differ, the code and [`guides/COMMUNICATIONS_V2_GUIDE.md`](../../guides/COMMUNICATIONS_V2_GUIDE.md) are authoritative.  
**Phase:** 3 of 6 (`packages/Communication/base-types`, `sendgrid`, `engine`, and `MJServer`)  
**Depends On:** **Phase 1** (Schema + CodeGen) & **Phase 2** (`NormalizedActivityEvent`, `MessageResult.ProviderMessageID`, `BaseCommunicationSuppressionPolicy`, `BaseCommunicationPrincipal.OnActivity`)  
**WorkQueue Note:** Uses existing `packages/WorkQueue` (`comms.activity` topic) immediately—no dependency on WorkQueue `ScheduledAt` or rate limiting (out of scope).

---

## 1. Key Design Decisions Locked In

1. **Per-Account / Subuser Webhook Routing (`W3-2`):** SendGrid webhooks are configured per SendGrid API account/subuser (`MJ: Credential`), not per `CommunicationSender`. The webhook route keys on **`:credentialId`** (`/comms/webhooks/sendgrid/:credentialId`) so `MJServer` loads the exact verification key before validating the payload.
2. **Batch Queueing, Not Per-Event Flooding (`W3-3` / `W3-4`):** The webhook handler verifies the ECDSA signature + 10-minute replay window on raw bytes, publishes **one `comms.activity` WorkQueue message per webhook POST batch**, and returns `202 Accepted` immediately. The worker unpacks the batch, deduplicates on `(ProviderID, ProviderEventID)` for >24h, and compares `OccurredAt` before resetting `SoftBounceCount`.
3. **`mj_log_id` Only in `custom_args` (`W3-6`):** Only `mj_log_id` is sent to SendGrid; `CorrelationData` is joined back from `CommunicationLog` inside the `comms.activity` worker, keeping PII out of 3rd-party providers.
4. **Guaranteed One-Click Unsubscribe (`W3-8` / `W3-9`):** `POST /comms/unsubscribe` validates `CommunicationLog.UnsubscribeToken` (non-enumerable random UUIDv4), **awaits durable persistence** onto `WorkQueue` (`comms.activity`), and returns `200 OK` immediately. Human-facing fallback/confirmation UI is handled in **Phase 4 (Preference Center)**.
5. **First-Party Open-Tracking Pixel:** `GET /comms/open/:token.gif` serves a 43-byte 1×1 transparent GIF (`no-store`) and publishes an `Opened` event to `comms.activity` with `IsMachineEvent` detection.
6. **System-Level Soft Bounce Policy & SendGrid Sync (`W3-5` / `W3-7`):** `SoftBounceThresholdPolicy` defaults to `5` consecutive soft bounces with a `30`-day `ExpiresAt`. `Dropped` (suppression) events act as sync signals, and revoking a suppression in MJ clears the matching SendGrid suppression via API.

---

## 2. Step-by-Step Implementation Plan

### Step 1: Extend Webhook Contract (`packages/Communication/base-types`)
In [`src/BaseProvider.ts`](../../packages/Communication/base-types/src/BaseProvider.ts):
* Extend `NormalizedNotification.Kind` to `'message' | 'lifecycle' | 'activity'`.
* Add `ActivityEvents?: NormalizedActivityEvent[]` to `NormalizedNotification`.

---

### Step 2: `SendGridProvider` Updates (`packages/Communication/providers/sendgrid`)
In [`src/SendGridProvider.ts`](../../packages/Communication/providers/sendgrid/src/SendGridProvider.ts):
1. **Outbound Payload:**
   * Pass `message.Headers` **verbatim** (do not auto-prefix `X-` onto `List-Unsubscribe` or `List-Unsubscribe-Post`).
   * Keep `trackingSettings.subscriptionTracking.enable = false` (MJ owns unsubscribes); disable SendGrid `openTracking` and `clickTracking` when MJ's first-party pixel / link tracking are active so opens and clicks are not double-counted or double-wrapped.
   * Inject `customArgs: { mj_log_id }` only (no `CorrelationData` PII) onto `MailDataRequired`.
   * Capture `result[0].headers['x-message-id']` into `MessageResult.ProviderMessageID`.
2. **Inbound Event Webhook (`ParseNotification`):**
   * Verify ECDSA signature (`X-Twilio-Email-Event-Webhook-Signature` + `X-Twilio-Email-Event-Webhook-Timestamp` over `RawBody`) and **reject timestamps older than ~10 minutes** (`W3-1`).
   * Normalize SendGrid Event Webhook JSON arrays into `NormalizedActivityEvent[]`:
     * `processed` $\rightarrow$ `Queued` | `delivered` $\rightarrow$ `Delivered` | `deferred` $\rightarrow$ `Deferred` | `dropped` $\rightarrow$ `Dropped` (flagging suppression-reason drops)
     * `bounce` $\rightarrow$ map SendGrid's native `bounce_classification` / `type` directly to `Hard Bounce` vs. `Soft Bounce` (storing raw `status` in `BounceCode` for diagnostics only)
     * `open` $\rightarrow$ `Opened` (`IsMachineEvent = true` for `sg_machine_open` / Apple MPP proxies)
     * `click` $\rightarrow$ `Clicked` (`TargetURL` + link-scanner heuristics)
     * `spamreport` $\rightarrow$ `Spam Complaint` | `unsubscribe` / `group_unsubscribe` $\rightarrow$ `Unsubscribed`
   * Set `ProviderEventID = sg_event_id`.
3. **Suppression Removal Helper (`W3-7`):**
   * Implement SendGrid suppression-clear API call invoked when an admin revokes a `CommunicationSuppression` row in MJ.

---

### Step 3: `MJServer` Public Routes (`packages/MJServer`)
Mounted in `MountPublicCoreRoutes()` ([`src/coreRoutes.ts`](../../packages/MJServer/src/coreRoutes.ts)) **ahead of JSON body-parser middleware** for raw-body signature verification:
1. **`POST /comms/webhooks/sendgrid/:credentialId`** (and default route without `:credentialId`):
   * Capture exact raw body bytes + headers into `WebhookNotificationInput`.
   * Load verification key from the specified `MJ: Credential` (`credentialId`), call `SendGridProvider.ParseNotification(input)`.
   * Return `401` on invalid signature or expired timestamp (>10 min).
   * Publish **one `comms.activity` WorkQueue message per webhook POST batch** and return `202 Accepted`.
2. **`POST` & `GET /comms/unsubscribe` (`W3-8` / `W3-9`):**
   * Validate `token` against `CommunicationLog.UnsubscribeToken` (random UUIDv4).
   * **`POST` (RFC 8058 One-Click):** Await `WorkQueue.Publish('comms.activity', { UnsubscribeToken, EventType: 'Unsubscribed', Source: 'One-Click Header (Mailbox Provider)', IPAddress, UserAgent, OccurredAt })` and return `200 OK` immediately.
   * **`GET` (Footer Link):** Redirect to `CommunicationSender.PreferenceCenterURL?token=<UnsubscribeToken>` (or Phase 4's default Preference Center endpoint).
3. **`GET /comms/open/:token.gif` (First-Party Open Pixel):**
   * Validates `TrackingToken` (separate from `UnsubscribeToken`), immediately returns `200 OK` with a 43-byte 1×1 transparent GIF (`Content-Type: image/gif`, `Cache-Control: no-store, no-cache, must-revalidate`, `Pragma: no-cache`), and publishes `Opened` to `comms.activity` with `{ TrackingToken, OccurredAt, IPAddress, UserAgent }`.
4. **`GET /comms/click/:token` (First-Party Link Tracking):**
   * Validates `TrackingToken` and verifies `sig` (`HMAC-SHA256` over `TrackingToken + '|' + u`) to prevent open-redirect abuse.
   * Publishes `Clicked` (`{ TrackingToken, TargetURL: u, OccurredAt, IPAddress, UserAgent }`) to `WorkQueue` (`comms.activity`) and immediately returns `302 Found` (`Location: u`, `Cache-Control: no-store`).

---

### Step 4: `comms.activity` WorkQueue Handlers (`packages/Communication/engine`)
1. **Batch Unpack & Deduplication:**
   * Unpacks batch webhook payloads into individual events; deduplicates on `(CommunicationProviderID, ProviderEventID)` via `CommunicationProviderEvent` (purged after 7 days).
   * Re-hydrates `CommunicationLogID`, `CommunicationEndpointID`, `CommunicationSenderID`, `Principal`, and `CorrelationData` from `CommunicationLog` (matched by `mj_log_id`, `UnsubscribeToken`, `TrackingToken`, or `(CommunicationProviderID, ProviderMessageID)`).
   * Classifies `IsMachineEvent = true` on first-party pixel opens and click-redirect hits from known mail privacy proxies and security link scanners (Apple MPP, GoogleImageProxy, SafeLinks, Proofpoint).
2. **Core Compliance & Health Handler (Always On):**
   * Updates `CommunicationEndpoint` timestamps (`LastDeliveredAt`, `LastBouncedAt`, `LastEngagedAt` excluding machine events).
   * On `Delivered`: resets `SoftBounceCount = 0` **only if `OccurredAt` is newer** than `LastBouncedAt` (`W3-4`).
   * On `Soft Bounce`: increments `SoftBounceCount`; evaluates `SoftBounceThresholdPolicy` (`threshold = 5`, `ExpiresAt = +30 days`).
   * On `Hard Bounce` or `Dropped` (suppression): writes global `CommunicationSuppression` + `Endpoint.Status = 'Hard Bounced'`.
   * On `Spam Complaint`: writes sender-scoped `CommunicationSuppression` + `Endpoint.Status = 'Complained'`.
   * On `Unsubscribed` (`W3-9`):
     * Message had `CommunicationPreferenceID`: sets `CommunicationPrincipalPreference.State = 'Opted Out'` + scoped `CommunicationSuppression`.
     * No preference: writes sender-scoped `CommunicationSuppression` (`CommunicationPreferenceID = NULL`).
     * No principal (bare transactional): writes endpoint-only `CommunicationSuppression`.
     * Appends `CommunicationConsentAuditLog` with clear `Source` (`One-Click Header (Mailbox Provider)` vs. `Provider Webhook` vs. `Preference Center`).
   * Invokes `BaseCommunicationSuppressionPolicy` and `BaseCommunicationPrincipal.OnActivity()`.
3. **Optional MJ Activity Store Subscriber (Off by Default):**
   * Separate WorkQueue subscriber that writes `CommunicationActivity` rows when enabled, leaving `comms.activity` clean for external analytics (third-party engagement tools) by default.

---

### Step 5: Unit & Integration Tests (Vitest)
* **SendGrid Outbound & Webhook Tests:** Verbatim `List-Unsubscribe` headers (no `X-` prefix), `mj_log_id`-only `customArgs`, `x-message-id` capture, raw-body ECDSA verification + 10-min replay rejection, and native `bounce_classification` mapping.
* **Open Pixel, Link Tracking & Unsubscribe Durability Tests:** `GET /comms/open/:token.gif` returning 43-byte GIF + `no-store` + `IsMachineEvent` detection; `GET /comms/click/:token` verifying HMAC (rejecting tampered `u=`), publishing `Clicked` with `TargetURL` + `TrackingToken` correlation, and returning `302`; `POST /comms/unsubscribe` awaiting `WorkQueue.Publish` before `200 OK` and testing all three `W3-9` write rules.
* **Out-of-Order & Expiring Soft-Bounce Tests:** Late `Delivered` event does not reset a newer `SoftBounceCount`; 5th soft bounce creates a 30-day expiring suppression.
