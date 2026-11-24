# MJ Comms V2 — Phase 2: Core Deliverability Primitive & Compliance Gate

**Status:** Implemented. Where this plan and the code differ, the code and [`guides/COMMUNICATIONS_V2_GUIDE.md`](../../guides/COMMUNICATIONS_V2_GUIDE.md) are authoritative.  
**Phase:** 2 of 6 (`packages/Communication/base-types` & `@memberjunction/communication-engine`)  
**Prerequisite:** **Phase 1** ([V202611231029__v6.3.x__Communications_V2_Schema.sql](../../migrations/v6/V202611231029__v6.3.x__Communications_V2_Schema.sql) + `mj codegen`)

---

## 1. Two Separable Entry Points (Message-Based vs. Template-Based)

Comms V2 explicitly separates **deliverability** from **template rendering**:

1. **Deliverability Primitive ("Message-Based" — Implemented in Phase 2):**
   * `CommunicationEngine.EvaluateEligibility()`, `ResolveEndpoints()`, and `Send()` accept **pre-rendered** `Subject`, `PreviewText`, `Body`, and `HTMLBody` (shared or per-recipient `PayloadOverride`).
   * Zero template rendering or entity-relation data fetching inside Phase 2—built as a standalone primitive for external engines or AI agents.
2. **Template-Based Entry Point (Legacy V1 + Future Phase 5 Layer 2):**
   * **Existing V1 Callers:** `CommunicationEngine.SendMessages()` / `SendSingleMessage()` and `EntityCommunicationsEngine` remain intact for backward compatibility (defaulting to `IsDefault = 1` sender and `Operational` / `Transactional` class, while closing the direct-provider bypass).
   * **Future Phase 5 Wrapper (`ITemplatedCommunicationService.RenderAndSend`):** Documented in this phase as a separable Layer 2 wrapper that calls `EvaluateEligibility()` $\rightarrow$ WorkQueue/inline template rendering (`comms.render`) $\rightarrow$ `Send()`.

---

## 2. Isolation Strategy & Explicit Dependencies

| Workstream | Exact Dependency / Seam | How Phase 2 Stays Isolated Now |
| :--- | :--- | :--- |
| **Phase 1 (Schema + CodeGen)** *(Hard Prereq)* | `V202611231029__v6.3.x__Communications_V2_Schema.sql` + `mj codegen` | Must run first so `@memberjunction/core-entities` exports strongly-typed entities and `CHECK`-derived unions. |
| **Phase 3 (Providers & Endpoints)** | `SendGridProvider` headers/`mj_log_id`, webhook & open-pixel routes | Phase 2 defines `MessageResult.ProviderMessageID`, `NormalizedActivityEvent`, and `BaseCommunicationProvider` guardrails; verified via `DryRun: true` and mock providers. |
| **Phase 4 (Metadata Seed)** | Starter `Jurisdiction`s, `RuleType`s, `CAN-SPAM`/`GDPR`, `MJ: Users`, default `Company` sender | Phase 2 unit tests use in-memory metadata fixtures; engine degrades gracefully when regime tables are empty. |
| **WorkQueue enhancements (out of scope)** | `PublishRequest.ScheduledAt` + per-key rate limiting | Not built. Phase 2 publishes immediate `comms.dispatch` jobs and records `CommunicationLog.ScheduledAt`; the engine's sweep sends deferred logs when they come due. |

---

## 3. Step-by-Step Implementation Plan

### Step 1: Contracts & Metadata Cache (`packages/Communication/base-types`)

1. **V2 Dispatch & Telemetry Types** *(new `src/V2Types.ts`, exported from [`src/index.ts`](../../packages/Communication/base-types/src/index.ts))*:
   * `SendingEnvelope` (`SenderID?`, `PreferenceID?`, `MessageClass`, `ChannelID`, `ProviderID?`, `ScheduledAt?`, `TrackOpens?`, `DryRun?`, `CorrelationData?`).
   * `MessagePayload` (`Subject?`, `PreviewText?`, `Body?`, `HTMLBody?`, `Headers?`).
   * `PrincipalRecordRef`, `SendToPrincipalsParams`, `SendV2Result`, `ResolvedEndpoint`, `PrincipalAttributes` (`FullName`, `Timezone`, `PreferredLanguage`, `IsExistingCustomer?`).
   * `EvaluateEligibilityParams`, `SendableRecipient` (includes `ComplianceObligations` + `SenderTemplateContext`), `EvaluateEligibilityResult`.
   * Future Phase 5 interface doc: `RenderAndSendParams` & `ITemplatedCommunicationService`.
   * `NormalizedActivityEventType`, `NormalizedActivityEvent`, `ComplianceGateResult`, `ComplianceObligations`, `ComplianceAuditSnapshot`.
2. **Driver Base Classes**:
   * `BaseCommunicationPrincipal`: Default metadata-driven implementations + batch-shaped overrides (`ResolveEndpoints`, `ResolveJurisdiction`, `ResolveAttributes`, `PreProcess`, `PostProcess`, `OnActivity`).
   * `PrincipalMessageContext`: Read-only `Envelope`, `Principal`, `Endpoint`, `Payload` + controlled verbs (`AddContent`, `SetHeader` rejecting protected headers, `RequestMutation`).
   * `BaseCommunicationSender`, `BaseComplianceRule` (`MergeStrictest`, `Evaluate`), `BaseCommunicationSuppressionPolicy`.
3. **Provider & Result Updates ([`src/BaseProvider.ts`](../../packages/Communication/base-types/src/BaseProvider.ts))**:
   * Add `ProviderMessageID?: string` to `MessageResult`.
   * Close direct provider bypass (`W2-5`): `BaseCommunicationProvider.SendSingleMessage()` requires an engine-verified compliance token, or runs a **batch-friendly / cached** endpoint suppression check covering V1 `SendMessages()` and `Notifications`.
4. **Metadata Cache ([`src/BaseEngine.ts`](../../packages/Communication/base-types/src/BaseEngine.ts)) (`W2-10`)**:
   * Cache small global tables (`CommunicationPrincipal`, `CommunicationSenderType`, `Jurisdiction`, `JurisdictionMember`, `CommunicationComplianceRegime`, `CommunicationComplianceRuleType`, `CommunicationComplianceRegimeRule`, `CommunicationComplianceRegimeJurisdiction`) in `Config()`.
   * Load `CommunicationSender` (with ancestors) and `CommunicationPreference` **on demand** with a bounded LRU/TTL cache for multi-tenant scale.
5. **Polymorphic FK Metadata**:
   * Add `EntityIDFieldName: "EntityID"` in `metadata/entities/.polymorphic-fk-entity-fields.json` for `CommunicationEndpointPrincipal.RecordID`, `CommunicationPrincipalPreference.RecordID`, `CommunicationSuppression.RecordID`, and **`MJ: Communication Logs`** (`RecordID`).

---

### Step 2: Compliance Rule Drivers (`packages/Communication/engine/src/compliance/rules/`)

Implement and `@RegisterClass(BaseComplianceRule, ...)` the 9 starter rule drivers:
1. `ConsentModelRuleDriver` (`opt-in` beats `opt-out`; supports `softOptIn` parameter + `IsExistingCustomer` principal slot per `W2-7`).
2. `RequireDoubleOptInRuleDriver` (`true` wins; checks `OptInMethod === 'Double'`).
3. `ConsentEvidenceRuleDriver` (`true` wins per field: source, timestamp, consent text).
4. `ConsentExpiryRuleDriver` (shortest `maxDays` wins; checks `ExpiresAt` / `ConsentAt`).
5. `UnsubscribeMechanismRuleDriver` (`required` beats `optional` for 1-click header & footer link).
6. `UnsubscribeHonorWindowRuleDriver` (shortest `maxHours` wins; drives `comms.activity` queue-lag SLA monitoring per `W2-9`).
7. `SenderIdentificationRuleDriver` (`true` wins for postal address & sender name).
8. `QuietHoursRuleDriver` (union of blocked local-time windows wins; fallback per `W2-8`: principal timezone $\rightarrow$ jurisdiction timezone [union of zones for multi-zone countries] $\rightarrow$ sender timezone if jurisdiction unknown).
9. `TrackingConsentRuleDriver` (controls whether open-pixel and click/link tracking are permitted under the resolved regimes).

---

### Step 3: Jurisdiction Resolver & Compliance Gate (`packages/Communication/engine/src/compliance/`)

1. **`JurisdictionResolver`**: Pre-builds `JurisdictionMember` containment graph ($O(1)$ expansion) and collects active regimes by `AppliesBy` + `AppliesWhenJurisdictionUnknown`.
2. **`ComplianceGate`** *(batch-capable)*:
   * **Step 1 (Endpoint & Suppression):** `Hard Bounced` / `Invalid` blocks all classes. Query active `CommunicationSuppression` rows scoped by `[null, ...senderAncestors]`, `[null, preferenceID]`, `[null, channelID]`, and `MessageClass`.
   * **Step 2 (Regimes & Rules):** Expand sender + recipient jurisdictions, collect applicable regimes, and run `MergeStrictest()`.
   * **Step 3 (Preferences — `W2-3` & Option B):** Runs **only when `PreferenceID` is set** (`Transactional` skips it). `'Pending'` blocks `Marketing` and `Operational` only. `'Opted Out'` blocks. `'Opted In'` checks evidence/expiry/double opt-in and overrides a `User Unsubscribe` suppression only when `ConsentAt > Suppression.EffectiveAt`. Absence of a row falls back to `ConsentModel` (`opt-in` blocks; `opt-out` uses `DefaultState`).
   * **Step 4 (Quiet Hours):** Returns `Deferred` with `DeferUntil` if inside legal quiet hours.
   * **Step 5 (Result):** Returns `Allowed` + `Obligations` (`RequireOneClickHeader`, `RequireFooterUnsubscribe`, `RequireSenderPostalAddress`, `SenderPostalAddress`) + `ComplianceAuditSnapshot`.

---

### Step 4: V2 Dispatch, Two-Stage Fan-Out, Open Pixel & Protected Hash (`packages/Communication/engine/src/`)

1. **`ResolveEndpoints()` & Avoiding Write Amplification (`W2-2`)**:
   * Batch-extracts addresses via `BaseCommunicationPrincipal.ResolveEndpoints()`, normalizes them, and **inserts `CommunicationEndpoint` / `CommunicationEndpointPrincipal` only when missing**.
   * Refreshes `LastSeenAt` / `LastSentAt` in one set-based batch `UPDATE` guarded by `LastSeenAt IS NULL OR LastSeenAt < DATEADD(day, -1, GETUTCDATE())` inside the batch worker (no separate daily cron job).
2. **`EvaluateEligibility()`**:
   * Runs endpoint resolution, `ResolveAttributes()`, `ResolveJurisdiction()`, and `ComplianceGate` in batch without requiring message content—returning `Sendable` (with `ComplianceObligations` for body disclosures + `SenderTemplateContext`) and `Blocked` lists.
3. **`Send()` Two-Stage Fan-Out (`W2-1`)**:
   * Configurable `InlineThreshold` (1 chunk, e.g., 500–1,000 recipients):
     * **Small sends ($\le 1$ chunk):** Resolve, gate, bulk-insert `CommunicationLog`s (`UnsubscribeToken` generated), publish to `comms.send`, and return immediate `Blocked`/`Skipped` details.
     * **Large sends ($> 1$ chunk):** Create `CommunicationRun`, publish chunks of 500–1,000 recipients to **`comms.dispatch`**, and return `CommunicationRunID` for progress tracking. `comms.dispatch` workers resolve, gate, bulk-insert logs, and publish to `comms.send`.
4. **Post-`PostProcess` Protected Injection, Body Validation, Open Pixel & Link Rewriting (`W2-4`)**:
   * Run `PreProcess` $\rightarrow$ `ComplianceGate` $\rightarrow$ `PostProcess` hooks **first**.
   * Validate caller-rendered `Body` / `HTMLBody` against body-level `ComplianceObligations` (detecting missing required `PostalAddress` or unsubscribe link/placeholder at send time).
   * **Send-time Link Rewriting (never in rendering or `PreviewOnly`/`DryRun`):** When `Envelope.TrackClicks` and `TrackingConsent` permit, rewrite `<a href="http(s)://...">` in `HTMLBody` (excluding `mailto:`, `tel:`, `#`, `List-Unsubscribe`, `ConfirmationToken`, and `data-mj-no-track`) to `<publicUrl>/comms/click/<TrackingToken>?u=<encodedUrl>&sig=<hmac>` so every click resolves who clicked (`CommunicationLog` $\rightarrow$ `Endpoint`, `Principal`, `CorrelationData`) and what URL was clicked.
   * **Inject protected elements last:** `From` / sender identity, `List-Unsubscribe` + `List-Unsubscribe-Post` (using `CommunicationLog.UnsubscribeToken`), `mj_log_id`, and **1×1 open-tracking pixel** (`<img src=".../comms/open/<TrackingToken>.gif" ...>`) into `HTMLBody` when `Envelope.TrackOpens` and `TrackingConsent` permit.
   * Compute final SHA-256 hash assertion over all protected elements before dispatch.
5. **Idempotent `comms.send` Handler (`W2-6`)**:
   * Marks `CommunicationLog.Status = 'Sending'` before calling the provider; skips any log with `ProviderMessageID` already set.
   * For `Marketing` / `Operational`, prefers **no-send** (does not retry `'Sending'` on crash); for `Transactional`, allows **at-least-once** retry if `ProviderMessageID` is null.

---

### Step 5: Unit Test Suite (Vitest)

* **Compliance Gate Matrix:** single-tenant association (`US-CA`, `US-TX`, `GB`, `AU`), multi-sender arts organisation (UK vs. US independent theaters), Option B recency override, Double Opt-In (`Pending` $\rightarrow$ `Opted In` confirmation allowed), `softOptIn`, unknown jurisdiction, and `QuietHours` multi-zone fallback.
* **Two-Stage Fan-Out & Write-Amplification Tests:** Chunking threshold (inline vs. `comms.dispatch`), set-based 24-hour guarded timestamp updates.
* **Protected-Element & Body Compliance Tests:** `EvaluateEligibility` returning body obligations; `Send()` rejecting missing postal address or unsubscribe link; `PostProcess` running before protected injection + open-pixel HTML injection.
* **Idempotency & V1 Bypass Tests:** `Status = 'Sending'` crash semantics (`Marketing` vs. `Transactional`) and `BaseCommunicationProvider` fallback blocking V1 suppressed sends.
