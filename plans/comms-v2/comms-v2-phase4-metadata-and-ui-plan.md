# MJ Comms V2 — Phase 4: Metadata Seed, Preference Center & Admin UI

**Phase:** 4 of 6 (`metadata/`, `packages/Angular/Generic/communications`, `MJServer`, `packages/Angular/Explorer/dashboards/`)  
**Depends On:** **Phase 1** (Schema + CodeGen), **Phase 2** (Core Deliverability & Compliance Gate), **Phase 3** (`/api/comms/unsubscribe` + `UnsubscribeToken`)

---

## 1. Step-by-Step Implementation Plan

### Step 1: Starter Metadata Seed (`/metadata/*.json`, via `mj sync push`)

1. **Built-in Principal & Default Sender:**
   * `CommunicationPrincipal`: `MJ: Users` (so core Notifications pass through the gate).
   * `CommunicationSenderType`: `Company` over `MJ: Companies`, plus one default `CommunicationSender` (`IsDefault = 1`).
2. **Jurisdictions & Containment Tree:**
   * ISO 3166-1 countries (linked to `MJ: Countries`), key subdivisions (`US-CA`, `US-FL`, `US-OK`, `US-TX`, `CA-QC`), and groups (`EU`, `EEA`) with `JurisdictionMember` links.
3. **Compliance Rule Types & Starter Regimes:**
   * Seed the exact 8 `CommunicationComplianceRuleType` rows matching Phase 2's drivers (`ConsentModel`, `RequireDoubleOptIn`, `ConsentEvidence`, `ConsentExpiry`, `UnsubscribeMechanism`, `UnsubscribeHonorWindow`, `SenderIdentification`, `QuietHours`).
   * Seed starter regimes (`CAN-SPAM` with `AppliesBy = 'Sender'`, `GDPR` / `UK GDPR` with `AppliesBy = 'Recipient or Sender'`, plus `CASL`, `TCPA`, `CCPA` seeded `Disabled` for admin activation).
4. **System Suppression Policy:**
   * Seed `SoftBounceThresholdPolicy` (`{"threshold": 5, "cooldownDays": 30}`, `Status = 'Active'`).
5. **`bizapps-common` PR #356 Cleanup:**
   * Coordinate migrating any published preference rows from `bizapps-common` into Core `CommunicationPreference` / `CommunicationPrincipalPreference`, and release `bizapps-common` dropping its duplicate tables.

---

### Step 2: Public Preference Center Angular Element (`packages/Angular/Generic/communications`)

Following the [`bizapps-orders` checkout-element blueprint](file:///Users/paulchristmann/Documents/src/bluecypress/bizapps-orders/packages/Angular/scripts/checkout-element-entry.ts):
* **Standalone Angular Component (`<mj-comms-preference-center>`):**
  * Lives in `packages/Angular/Generic/communications` (no `MJExplorer` shell, no Auth0/MSAL providers, no Router imports).
  * Bootstrapped via `createApplication({ providers: [provideZoneChangeDetection(), { provide: CSP_NONCE, useFactory: readCspNonce }] })` + `createCustomElement()`, bundled with the Angular linker so **no `unsafe-eval` / JIT** is required.
* **Capabilities:**
  * Reads `token`, `api-root`, and `csp-nonce` from host element attributes.
  * Renders brand styling from `CommunicationSender.TemplateContext` (`BrandName`, `LogoURL`, `PrimaryColor`, `FooterText`).
  * Displays `IsUserVisible = 1` `CommunicationPreference` rows grouped by `Category`, current status (`Opted In`, `Opted Out`, `Pending`), and *"Unsubscribe from all"*.
  * Submits updates to `POST /api/comms/preferences/:token`.

---

### Step 3: `MJServer` Public Host Page & Capability-Scoped REST API (`packages/MJServer`)

Mounted in `MountPublicCoreRoutes()` ([`coreRoutes.ts`](file:///Users/paulchristmann/Documents/src/bluecypress/mj/packages/MJServer/src/coreRoutes.ts)), following [`checkout-host-page.ts`](file:///Users/paulchristmann/Documents/src/bluecypress/bizapps-orders/packages/Server/src/checkout-host-page.ts):
* **Security Headers:** Per-response `cspNonce`, `default-src 'none'`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.
* **`GET /api/comms/preferences/:token`:**
  * `Accept: text/html` $\rightarrow$ serves the CSP-nonce HTML shell hosting `<mj-comms-preference-center token="..." api-root="..." csp-nonce="...">` (with a minimal vanilla HTML confirm-button fallback if the element bundle is not configured, covering `W3-8`).
  * `Accept: application/json` $\rightarrow$ validates `CommunicationLog.UnsubscribeToken` (random UUIDv4) and returns *only* the masked recipient address, `Sender.TemplateContext` branding, and `IsUserVisible = 1` preferences + current states.
* **`POST /api/comms/preferences/:token`:**
  * Applies preference toggles or `"UnsubscribeAll": true`, updates `CommunicationPrincipalPreference` / `CommunicationSuppression`, and appends `CommunicationConsentAuditLog` (`ConsentSource = 'Preference Center'`, `IPAddress`, `UserAgent`).
* **`GET /api/comms/confirm/:token` (Double Opt-In Confirmation):**
  * Transitions `'Pending'` $\rightarrow$ `'Opted In'`, sets `ConfirmedAt`, appends `CommunicationConsentAuditLog`, and renders confirmation.
* **Phase 3 `/api/comms/unsubscribe` `GET` Target:** Redirects to `CommunicationSender.PreferenceCenterURL?token=...` if configured, otherwise `/api/comms/preferences/:token`.

---

### Step 4: `MJExplorer` Communications Admin Dashboard (`packages/Angular/Explorer/dashboards/`)

Built as an authenticated Explorer dashboard (`<mj-page-layout>`) with four views:
1. **Senders & Permissions:** Visual `CommunicationSender` hierarchy tree, `TemplateContext` JSON editor/preview, `CredentialID` / provider assignment, and `CommunicationSenderPermission` management.
2. **Compliance & Regimes:** Toggle active `CommunicationComplianceRegime`s, inspect `JurisdictionMember` groups, and run a **Gate Simulator** (*pick Sender + Principal + Preference $\rightarrow$ inspect `Allowed`/`Blocked`/`Deferred` + `ComplianceDecision` JSON*).
3. **Endpoints & Suppressions:** Search by email/phone, inspect `SoftBounceCount` and `CommunicationConsentAuditLog` history, and add/revoke `Admin Block`s (triggering SendGrid suppression clear per `W3-7`).
4. **Policies & Defaults:** Configure `CommunicationSuppressionPolicy` (`SoftBounceThresholdPolicy`) and activity retention/WorkQueue settings.
5. **Principals & Channels:** Manage `CommunicationPrincipal` slot mappings (`Jurisdiction`, `Timezone`, `FullName`) and surface any unregistered V1 `EntityCommunicationMessageType` entities with a one-click **"Register as Principal"** action.

---

### Step 5: Unit & Integration Tests (Vitest)
* **`MJServer` Host Page & REST Tests:** Verify CSP nonce headers, HTML attribute escaping (XSS guard), JSON response scoping (masked address + `IsUserVisible = 1` only), preference updates + audit log writes, and Double Opt-In `Pending` $\rightarrow$ `Opted In` confirmation.
* **Angular Element & Dashboard Tests:** Verify `<mj-comms-preference-center>` rendering, toggle state submission, and Gate Simulator / Admin Dashboard interactions.
