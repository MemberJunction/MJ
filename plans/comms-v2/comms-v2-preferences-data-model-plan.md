# MJ Comms V2 — Phase 1: Preferences, Senders & Compliance Data Model Plan

**Status:** Implemented. Where this plan and the code differ, the generated entities and [`guides/COMMUNICATIONS_V2_GUIDE.md`](../../guides/COMMUNICATIONS_V2_GUIDE.md) are authoritative.  
**Migration:** [V202611231029__v6.3.x__Communications_V2_Schema.sql](../../migrations/v6/V202611231029__v6.3.x__Communications_V2_Schema.sql)  
---

## Phase 1–6 Implementation Sequence (At a Glance)

| Phase | Scope | Dependencies |
| :--- | :--- | :--- |
| **Phase 1** | **Schema & CodeGen Foundation** (18 new tables + `CommunicationLog` / `EntityCommunicationMessageType` extensions + `mj codegen`) | None |
| **Phase 2** | **Core Deliverability Primitive & Compliance Gate (Layer 1)** (`EvaluateEligibility`, `Send`, open-pixel injection, 8 rule drivers, `comms.dispatch` $\rightarrow$ `comms.send`) | Phase 1 |
| **Phase 3** | **Providers, Webhooks, Open Pixel & Unsubscribe** (`SendGridProvider`, `/webhooks/sendgrid/:credentialId`, durable `/unsubscribe`, `/open/:token.gif`, `comms.activity`) | Phase 1, Phase 2 types |
| **Phase 4** | **Metadata Seed, Preference Center & Admin UI** (`/metadata` JSON, `bizapps-common` PR #356 cleanup, `MJServer` Preference Center, `MJExplorer` Admin UI) | Phases 1–3 |
| **Phase 5** | **Templated Rendering & Delivery Wrapper (Layer 2)** (`ITemplatedCommunicationService.RenderAndSend` over Phase 2) | Phase 2 |
| **Phase 6** | **Sending Domain & DNS Authentication** (SPF / DKIM / DMARC through the provider, `CreateSendingDomain` / `VerifySendingDomain` operations, admin tab) | Phases 1–4 |
| *Out of scope* | *WorkQueue enhancements (`ScheduledAt` on `PublishRequest`, per-key rate limiting). Deferred sends use `CommunicationLog.ScheduledAt` and the engine's sweep instead.* | - |

---

## 1. Summary of Model Updates & Refinements

All schema updates are incorporated directly into `CREATE TABLE` / `ALTER TABLE CommunicationLog` in [V202611231029__v6.3.x__Communications_V2_Schema.sql](../../migrations/v6/V202611231029__v6.3.x__Communications_V2_Schema.sql):

1. **`Pending` State + Single vs. Double Opt-In Tracking (`CommunicationPrincipalPreference`):**
   * `State` `CHECK` constraint: `('Pending', 'Opted In', 'Opted Out')`. `'Pending'` blocks `Marketing` and `Operational` sends only (allowing transactional confirmation emails).
   * **`OptInMethod`** (`'Single'`, `'Double'`) and **`ConfirmedAt`** preserve double opt-in proof after `State` transitions from `'Pending'` to `'Opted In'`.
   * `RequireDoubleOptIn` is included in the 8 starter `CommunicationComplianceRuleType` drivers.
2. **Non-Enumerable Capability Token (`CommunicationLog.UnsubscribeToken`):**
   * Added `UnsubscribeToken UNIQUEIDENTIFIER DEFAULT NEWID()` with unique filtered index `UX_CommunicationLog_UnsubscribeToken` so one-click unsubscribe headers, open-tracking pixels, and preference center links cannot be enumerated.
3. **Absence of a Row = "No Information":**
   * No default `CommunicationPrincipalPreference` rows are pre-populated per principal. Absence of a row means *"no explicit permission or denial"*—allowed in `Opt-Out` regimes (`CAN-SPAM`) when `CommunicationPreference.DefaultState = 'Opted In'`, and blocked in `Opt-In` regimes (`GDPR`).
4. **Simplified Preference Ownership + Gate-Time Recency Override (Option B):**
   * Each `CommunicationPreference` is either shared (`CommunicationSenderID IS NULL`) or owned by a single sender (`CommunicationSenderID = <SenderID>`). Independent brands/theaters own their own `CommunicationPreference` rows rather than overriding a parent's preference row for the same preference.
   * **Global Opt-Out vs. Newer Specific Opt-In (Option B):** A global `User Unsubscribe` suppression (`CommunicationPreferenceID IS NULL`) is **not** revoked when a user later opts into a single preference. Instead, the Compliance Gate compares timestamps: an explicit, evidenced `'Opted In'` row with `ConsentAt > Suppression.EffectiveAt` is allowed for *that specific preference*, while the global unsubscribe continues to block all untouched preferences. *(Hard bounces, spam complaints, and admin blocks are never overridden by recency.)*
5. **Compliance Quiet Hours Only in Phase 1:**
   * Legal quiet hours (e.g., TCPA SMS hours) live in `CommunicationComplianceRegimeRule` (`QuietHours`). Preferential quiet hours / send windows (sender- or principal-defined) are deferred to a later phase.
6. **Optional `CommunicationActivity` Storage + Dual Retention Policies:**
   * `CommunicationActivity` DB persistence is an optional WorkQueue subscriber (off by default). When enabled, retention uses two policies: (a) scrubbing `RawPayload`, `IPAddress`, and `UserAgent` after 30–90 days via `IX_CommunicationActivity_ReceivedAt`, and (b) archiving/deleting normalized activity rows after 1–3 years. `CommunicationConsentAuditLog` keeps IP/UserAgent long-term (3–7 years) as legal proof.
7. **Starter `GDPR` / `UK GDPR` `AppliesBy` Setting:**
   * Starter `GDPR` and `UK GDPR` regimes are seeded with `AppliesBy = 'Recipient or Sender'` so UK/EU-based senders are always governed by GDPR regardless of recipient address.

---

## 2. Concrete Examples: Creating & Interpreting Records

### Example 1: Example Association (Single-Tenant US Association, International Members)

#### A. Setup Records Created
1. **`CommunicationPrincipal`:** `EntityID = Entity('Association: Members')`, `Configuration = '{"Slots":{"FullName":"DisplayName","Jurisdiction":"Addresses.JurisdictionCode","Timezone":"Timezone"}}'`, plus `EntityCommunicationField` pointing to `PrimaryEmail`.
2. **`CommunicationSender`:** `Example Association` (`IsDefault = 1`, `FromEmail = 'news@association.example'`, `PostalAddress = '100 Example Ave, Springfield, IL 62701'`, `JurisdictionID = Jurisdiction('US')`).
3. **`CommunicationPreference`:** `Name = 'Member Newsletter'`, `CommunicationSenderID = Example Association`, `MessageClass = 'Marketing'`, `DefaultState = 'Opted In'`.
4. **`Jurisdiction` & `CommunicationComplianceRegime`:**
   * `US` (contains `US-CA`, `US-TX`), `GB`, `AU`.
   * Active Regimes: `CAN-SPAM` (`AppliesBy = 'Sender'`, `Jurisdiction = US`, `ConsentModel = opt-out`), `UK GDPR` (`AppliesBy = 'Recipient or Sender'`, `Jurisdiction = GB`, `ConsentModel = opt-in`, `ConsentEvidence = required`), and optionally `AU Spam Act` (`AppliesBy = 'Recipient'`, `Jurisdiction = AU`, `ConsentModel = opt-in`).

#### B. How the Gate Interprets Four Members (Marketing Blast, No Suppress/Opt-Out)

| Member | Jurisdiction Expansion | Merged `ConsentModel` | Principal Preference State | Gate Decision & Interpretation |
| :--- | :--- | :--- | :--- | :--- |
| **Sarah** (`US-CA`) | `US-CA` $\rightarrow$ `US` | `opt-out` (`CAN-SPAM`) | *No row* ("no info") | **ALLOWED** — Falls back to `DefaultState = 'Opted In'`. Injects 1-click header + postal footer. |
| **Jane** (`US-TX`) | `US-TX` $\rightarrow$ `US` | `opt-out` (`CAN-SPAM`) | *No row* ("no info") | **ALLOWED** — Falls back to `DefaultState = 'Opted In'`. Injects 1-click header + postal footer. |
| **Molly** (`GB`) | `GB` + `US` (Sender) | **`opt-in`** (`UK GDPR` beats `CAN-SPAM`) | *No row* ("no info") | **BLOCKED** — `UK GDPR` overrides `DefaultState`; requires explicit `'Opted In'` row with evidence. |
| **Molly** (`GB`) | `GB` + `US` (Sender) | **`opt-in`** + `ConsentEvidence` | `'Opted In'`, `ConsentSource = 'Signup Form'`, `ConsentAt`, `ConsentText` | **ALLOWED** — Explicit opt-in with valid evidence satisfies `UK GDPR`. |
| **Lisa** (`AU`) | `AU` + `US` (Sender) | `opt-in` (if `AU Spam Act` active) or `opt-out` (if not) | *No row* ("no info") | **BLOCKED** if `AU Spam Act` regime row is `Active` as `opt-in`; **ALLOWED** if only `CAN-SPAM` applies. |

---

### Example 2: Double Opt-In Lifecycle (`Pending` $\rightarrow$ `Opted In`)

Suppose **Molly (`GB`)** submits a newsletter signup form and must confirm via email:

1. **Step 1 — Form Submission:**
   * Create `CommunicationPrincipalPreference`:
     `State = 'Pending'`, `OptInMethod = 'Double'`, `ConfirmedAt = NULL`, `ConsentSource = 'Signup Form'`, `ConsentAt = '2026-11-17T12:00:00Z'`, `ConsentText = 'Yes, send me the Member Newsletter'`, `IPAddress = '81.x.x.x'`.
   * Append `CommunicationConsentAuditLog`: `Action = 'Created'`, `NewValue = '{"State":"Pending","OptInMethod":"Double"}'`.
   * *Gate behavior:* Any `Marketing` send to Molly is **BLOCKED** (`PREFERENCE_PENDING`). Only the `Transactional` confirmation email is sent.
2. **Step 2 — Confirmation Link Clicked:**
   * Update `CommunicationPrincipalPreference`:
     `State = 'Opted In'`, `ConfirmedAt = '2026-11-17T12:04:12Z'`.
   * Append `CommunicationConsentAuditLog`: `Action = 'Updated'`, `PreviousValue = '{"State":"Pending"}'`, `NewValue = '{"State":"Opted In","ConfirmedAt":"2026-11-17T12:04:12Z"}'`.
   * *Gate behavior:* Molly is now **ALLOWED**, and `OptInMethod = 'Double'` + `ConfirmedAt` prove double opt-in.

---

### Example 3: Global Unsubscribe in March $\rightarrow$ Specific Opt-In in June (Option B)

Suppose **Jane** clicks *"Unsubscribe from all"* in March, then explicitly signs up for *"Weekly Newsletter"* in June:

1. **March (`Unsubscribe from all`):**
   * `CommunicationSuppression` row created:
     `CommunicationEndpointID = <jane@example.com>`, `CommunicationSenderID = <Example Association>`, `CommunicationPreferenceID = NULL` (all preferences), `Reason = 'User Unsubscribe'`, `Source = 'One-Click Header'`, `Status = 'Active'`, `EffectiveAt = '2026-03-10T15:00:00Z'`.
2. **June (`Weekly Newsletter` Signup Form):**
   * Global suppression row is **left untouched** (`Status = 'Active'`).
   * `CommunicationPrincipalPreference` row created for `Weekly Newsletter`:
     `State = 'Opted In'`, `ConsentSource = 'Signup Form'`, `ConsentAt = '2026-06-15T10:00:00Z'`, `ConsentText = '...'`.
3. **Gate Interpretation on Subsequent Sends:**
   * **Send `"Promotions"` to Jane:** Finds active March global `User Unsubscribe` (`CommunicationPreferenceID = NULL`), no newer opt-in for `"Promotions"` $\rightarrow$ **BLOCKED**.
   * **Send `"Weekly Newsletter"` to Jane:** Finds active March global `User Unsubscribe`, **and** finds `'Opted In'` for `"Weekly Newsletter"` with `ConsentAt (June) > EffectiveAt (March)` $\rightarrow$ **ALLOWED** (logged in `ComplianceDecision`).
   * **If Jane later Hard Bounces (`Reason = 'Hard Bounce'`):** Recency does *not* override deliverability blocks $\rightarrow$ **BLOCKED** for everything.

---

### Example 4: Arts Organisation (Independent UK & US Theaters)

#### A. Setup Records Created
1. **`CommunicationSenderType`:** `Name = 'Theater'`, `EntityID = Entity('Arts: Theaters')`.
2. **`CommunicationSender` Rows:**
   * `London Theater`: `CommunicationSenderTypeID = 'Theater'`, `RecordID = 'T-LON'`, `JurisdictionID = Jurisdiction('GB')`, `FromEmail = 'boxoffice@londontheatre.co.uk'`, `PostalAddress = '... London, UK'`.
   * `NY Theater`: `CommunicationSenderTypeID = 'Theater'`, `RecordID = 'T-NYC'`, `JurisdictionID = Jurisdiction('US')`, `FromEmail = 'tickets@nytheater.org'`, `PostalAddress = '... New York, NY'`.
3. **`CommunicationPreference` Rows (Theater-Owned):**
   * `'Season Announcements'` with `CommunicationSenderID = <London Theater>`.
   * `'Season Announcements'` with `CommunicationSenderID = <NY Theater>`.

#### B. How the Gate Interprets Pat (`pat@gmail.com`)
* **London Theater sends:** Sender `JurisdictionID = GB` triggers `UK GDPR` (`AppliesBy = 'Recipient or Sender'`). Pat requires an explicit `'Opted In'` row on London Theater's `'Season Announcements'` preference.
* **NY Theater sends:** Sender `JurisdictionID = US` triggers `CAN-SPAM`. Unless Pat is in a GDPR jurisdiction or opted out, NY Theater can mail Pat.
* **Pat unsubscribes from London Theater:** Writes `CommunicationSuppression` with `CommunicationSenderID = <London Theater>`. London Theater is blocked; **NY Theater is completely unaffected**. *(There is no cross-theater "never email Pat on behalf of any theater" user unsubscribe—global `CommunicationSenderID = NULL` blocks only occur on physical `Hard Bounce` / `Invalid Address` or an optional platform `CommunicationSuppressionPolicy`.)*
