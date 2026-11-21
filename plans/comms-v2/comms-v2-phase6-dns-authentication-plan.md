# MJ Comms V2 — Phase 6: Sending Domain & DNS Authentication (SPF / DKIM / DMARC)

**Phase:** 6 of 7 (`migrations/v6/`, `packages/Communication/base-types`, `sendgrid`, `engine`, `packages/Angular/Explorer/dashboards/`)  
*(WorkQueue Enhancements shift to **Phase 7**.)*  
**Depends On:** **Phase 1** (Schema + CodeGen), **Phase 2** (`CommunicationEngine`), **Phase 3** (`SendGridProvider`), **Phase 4** (`MJExplorer` Communications Admin Dashboard)

---

## 1. What `CredentialID` Represents Here

`CredentialID` is a foreign key to **`MJ: Credentials`** (`Credential(ID)`), matching `CommunicationSender.CredentialID`:
* In SendGrid, domain authentication (SPF/DKIM CNAMEs) is registered **inside a specific SendGrid account or subuser**.
* `CredentialID` identifies *which* SendGrid account/subuser owns that verified domain (`NULL` when using default environment-variable credentials). Multiple `CommunicationSender`s sharing the same `(CommunicationProviderID, CredentialID, Domain)` share one `CommunicationSendingDomain` record.

---

## 2. Step-by-Step Implementation Plan

### Step 1: Additive Schema Migration & CodeGen (`migrations/v6/`)
1. Create `CommunicationSendingDomain`:
   * `ID` (`UNIQUEIDENTIFIER`), `CommunicationProviderID` (FK), `CredentialID` (nullable FK $\rightarrow$ `Credential(ID)`), `Domain` (`NVARCHAR(255)`).
   * `ProviderDomainID` (`NVARCHAR(200) NULL` — e.g., SendGrid `whitelabel/domains/{id}`).
   * `Status` (`'Pending'`, `'Verified'`, `'Failed'`, `'Revoked'`).
   * `DNSRecords` (`NVARCHAR(MAX)` JSON array of `{ Type: 'CNAME' | 'TXT', Purpose: 'DKIM' | 'SPF' | 'DMARC' | 'ReturnPath', Host, Value, Validated, LastError }`).
   * `LastVerifiedAt`, `VerifiedAt`.
   * Unique index on `(CommunicationProviderID, CredentialID, Domain)` (with `NULLS NOT DISTINCT` in PG conversion).
2. Add `RequireVerifiedDomain BIT NOT NULL DEFAULT 0` to `CommunicationProvider` (enabled for SendGrid-style ESPs; `0` for M365/Gmail where tenant auth is external).
3. Run migration + `mj codegen`.

---

### Step 2: Provider Domain-Auth Contract (`base-types` & `sendgrid`)
1. In [`BaseProvider.ts`](../../packages/Communication/base-types/src/BaseProvider.ts):
   * Add `'CreateDomainAuthentication' | 'VerifyDomainAuthentication' | 'DeleteDomainAuthentication'` to `ProviderOperation`.
   * Define `DomainDNSRecord`, `CreateDomainAuthResult`, and `VerifyDomainAuthResult` types, with default "not supported" implementations on `BaseCommunicationProvider`.
2. In [`SendGridProvider.ts`](../../packages/Communication/providers/sendgrid/src/SendGridProvider.ts):
   * `CreateDomainAuthentication(domain, credentials)`: Calls SendGrid `POST /v3/whitelabel/domains` and returns `ProviderDomainID` + generated SPF/DKIM CNAME/TXT records.
   * `VerifyDomainAuthentication(providerDomainId, domain, credentials)`: Calls SendGrid `POST /v3/whitelabel/domains/{id}/validate` + Node `dns.promises.resolveTxt('_dmarc.' + domain)` check, returning per-record `Validated` flags.
   * `DeleteDomainAuthentication(providerDomainId, credentials)`: Calls SendGrid `DELETE /v3/whitelabel/domains/{id}`.

---

### Step 3: Send-Time Enforcement (`packages/Communication/engine`)
* In `CommunicationEngine` dispatch (`Send()` / `comms.send` preflight):
  * When `providerEntity.RequireVerifiedDomain === true`, extract the domain from `CommunicationSender.SendingDomain` (or `FromEmail`) and verify a `CommunicationSendingDomain` row exists with `Status = 'Verified'` for `(CommunicationProviderID, CredentialID, Domain)`.
  * Fail fast with a clear error (`DOMAIN_NOT_VERIFIED`) before attempting provider delivery.

---

### Step 4: `MJExplorer` Admin UI (`packages/Angular/Explorer/dashboards/`)
Add a **"Sending Domains & DNS"** tab to Phase 4's `MJExplorer` Communications Admin Dashboard (plus GraphQL resolver/action endpoints in `MJServer` to invoke `CreateDomainAuthentication` / `VerifyDomainAuthentication` / `DeleteDomainAuthentication` securely):
* **Domain List:** Shows `Domain`, `Provider`, `Credential`, `Status` badge (`Pending`, `Verified`, `Failed`, `Revoked`), and `LastVerifiedAt`.
* **Add Sending Domain:** Select Provider + Credential + Domain $\rightarrow$ invokes `CreateDomainAuthentication` $\rightarrow$ renders a copy-friendly DNS records table (Type, Host, Value, Purpose).
* **Verify DNS:** One-click button invoking `VerifyDomainAuthentication`, updating per-record green/red validation badges live and surfacing `LastError` details if a record hasn't propagated yet.

---

### Step 5: Unit Tests (Vitest)
* **`SendGridProvider` Domain Auth Tests:** Mock SendGrid `/whitelabel/domains` create/validate/delete responses and `_dmarc` TXT DNS checks.
* **Send-Time Guard Tests:** Verify `RequireVerifiedDomain = true` blocks unverified/pending domains and allows verified domains, while `RequireVerifiedDomain = false` skips the check.
