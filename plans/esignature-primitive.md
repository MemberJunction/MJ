# eSignature Primitive for MemberJunction — Design & Implementation Plan

**Status:** Proposed
**Author:** Drafted with Claude (research-backed)
**Date:** 2026-06-05
**Origin:** Generalizing the DocuSign integration built in `app-secure-messaging` into a reusable MJ framework primitive.

---

## 1. Summary

MemberJunction needs a first-class **eSignature primitive**: a pluggable abstraction for sending documents out for electronic signature (DocuSign, Adobe Sign, Dropbox Sign, …), tracking the signing lifecycle, and retrieving signed documents — usable by any OpenApp, by AI agents, and by workflow/Action pipelines.

The `app-secure-messaging` OpenApp already contains a working, self-contained version of this: a `BaseSignatureProvider` abstract class with a `DocuSign` driver registered via `@RegisterClass` and resolved through `MJGlobal.ClassFactory`, backed by an app-local `SignatureRequest` table. This plan **lifts that abstraction into the framework**, backs it with MJ's metadata + Credential Engine infrastructure, and exposes it to agents/workflows via thin Actions.

**Decisions locked in (from design review):**
- **Full primitive** — MJ core owns the provider abstraction, the engine, credentials wiring, **and** the full set of tracking entities. Consuming apps merely link their domain record to a core `MJ: Signature Requests` row.
- **Document linkage** — the document is a soft reference to **`MJ: Artifacts`** (+ `MJ: Artifact Versions`); the originating business record is captured with MJ's standard **polymorphic `EntityID` / `RecordID`** pair, so a signature request can be attached to any entity.
- Credentials use the modern **`@memberjunction/credentials` Credential Engine** (encrypted, audited, multi-tenant) — **not** env vars and **not** the legacy `MJ: Company Integrations` inline-token columns.

---

## 2. Prior art this design is built on

### 2.1 The secure-messaging implementation (the thing being generalized)
`app-secure-messaging/packages/server/src/services/SignatureProvider.ts`:
- `abstract BaseSignatureProvider` with `createEnvelope(params)` and `getStatus(externalEnvelopeId)`.
- `@RegisterClass(BaseSignatureProvider, 'DocuSign')` concrete driver — DocuSign REST via JWT-grant OAuth (`signature impersonation` scope), envelope creation with base64 document + `signHereTabs`, and `mapDocuSignStatus()` normalizing DocuSign states.
- Config read from `DOCUSIGN_*` **environment variables** (`readDocuSignConfig()`).
- Resolved at runtime with `MJGlobal.Instance.ClassFactory.CreateInstance<BaseSignatureProvider>(BaseSignatureProvider, providerName)` in `handlers/signatures.ts`.
- App-local `SignatureRequest` table (`migrations/V202606040000__…Secure_Messaging_Core.sql`): `Status` (Draft/Sent/Signed/Declined/Cancelled), `Provider`, `ExternalEnvelopeID`, `ArtifactID` (soft ref), `SentAt`, `CompletedAt`, linked to `PortalSession`/`ThreadID`.

This is already a correct MJ provider pattern in miniature. What it lacks (and this plan adds): framework-level reuse, encrypted multi-tenant credentials, agent/workflow exposure, richer lifecycle, and webhook-driven status.

### 2.2 MJ's established pluggable-provider pattern (the template)
Every pluggable subsystem in MJ (Communication, Storage, AI) shares **five layers**:

1. **Abstract base provider** defining the operation contract — core ops `public abstract`; vendor-divergent ops non-abstract with a *"not supported"* default + capability discovery.
2. **`@RegisterClass(Base, 'Driver Key')`** on each concrete driver, in its own package.
3. **Runtime resolution** via `MJGlobal.Instance.ClassFactory.CreateInstance<Base>(Base, driverKey)` — never `new`.
4. **A metadata "Providers" entity** cached by a `BaseEngine` singleton, holding the registry + the driver key column.
5. **An engine facade** that resolves the driver, loads credentials, invokes the op, and logs runs.

**Reference implementations to copy from:**
- **Storage (closest model — Credential-Engine-native):** `packages/MJStorage/src/generic/FileStorageBase.ts` (base + optional-op defaults + `IsConfigured`), `packages/MJStorage/src/util.ts` (`initializeDriverWithAccountCredentials` — driver resolution + `CredentialEngine.getCredential` + `onTokenRefresh` persistence), `packages/MJStorage/src/FileStorageEngine.ts` (engine + driver cache). Two-entity split: **`MJ: File Storage Providers`** (type, with `ServerDriverKey`) + **`MJ: File Storage Accounts`** (instance, with `CredentialID` FK).
- **Communication (optional-op + capability discovery idiom):** `packages/Communication/base-types/src/BaseProvider.ts` (`getSupportedOperations()`, `supportsOperation()`, "provider does not support" defaults), `packages/Communication/engine/src/Engine.ts` (`GetProvider` — note the `constructor.name === 'Base…'` "not found" check).
- **Credentials:** `packages/Credentials/Engine/src/CredentialEngine.ts` (`getCredential`/`storeCredential`/`updateCredential`, encrypted `Values`, audit logging, JSON-Schema validation, `directValues` override).
- **Actions:** `packages/Actions/Engine/src/generic/BaseAction.ts` (`InternalRunAction` contract), `packages/Actions/Engine/src/generic/BaseOAuthAction.ts`, `packages/Actions/CoreActions/src/custom/integration/http-request.action.ts` & `…/gamma-generate-presentation.action.ts` (bounded polling pattern).

---

## 3. Architecture overview

```
┌─ Layer 4: ACTIONS (agent / workflow façade) ─────────────────────────────┐
│  "Send Document for Signature" · "Get Signature Status" ·                 │
│  "Download Signed Document" · "Void Signature Request"                    │
│  Thin BaseAction subclasses → call SignatureEngine, push output params    │
│  packages/Actions/CoreActions/src/custom/esignature/*.action.ts           │
└────────────────────────────────────────────────────────────────────────── ┘
            │ calls
┌─ Layer 3: ENGINE FACADE ─────────────────────────────────────────────────┐
│  SignatureEngine  (BaseEngine singleton, server-side)                     │
│   • Config() caches Signature Providers + Accounts metadata               │
│   • GetDriver(accountId, user):                                           │
│       ClassFactory.CreateInstance(BaseSignatureProvider, provider.Key)    │
│       + CredentialEngine.getCredential(account.CredentialID)              │
│       + driver.initialize(resolvedValues)  [cached per account]           │
│   • SendForSignature / RefreshStatus / Download / Void                    │
│   • persists MJ: Signature Requests lifecycle + MJ: Signature Request Logs│
│   • RecordWebhookEvent(driverKey, payload, headers) → normalize → update  │
└────────────────────────────────────────────────────────────────────────── ┘
      │ resolves driver by key                    │ reads / writes
┌─ Layer 1: BASE PACKAGE ───────────────┐  ┌─ Layer 3b: METADATA ENTITIES ────┐
│  @memberjunction/esignature           │  │  MJ: Signature Providers          │
│   abstract BaseSignatureProvider      │  │  MJ: Signature Accounts           │
│    + normalized types                 │  │  MJ: Signature Requests           │
│    + getSupportedOperations()         │  │  MJ: Signature Request Recipients │
│    + ParseWebhookEvent()              │  │  MJ: Signature Request Documents  │
│  (no MJ data deps — pure contract)    │  │  MJ: Signature Request Logs       │
└───────────────────────────────────────┘  └───────────────────────────────────┘
            ▲ implemented by               ┌─ Credentials (existing) ──────────┐
┌─ Layer 2: DRIVER PACKAGES ────────────┐  │  @memberjunction/credentials       │
│  @memberjunction/esignature-docusign   │  │  MJ: Credentials (encrypted,       │
│   @RegisterClass(…, 'DocuSign')        │  │   audited, multi-tenant)           │
│  (future) -adobesign, -dropboxsign     │  └────────────────────────────────────┘
└────────────────────────────────────────┘
```

---

## 4. The provider contract (`BaseSignatureProvider`)

Generalizes the app's two-method interface. **Core ops are `abstract`; vendor-divergent ops are non-abstract with a "not supported" default** (Communication-provider idiom). Each operation receives already-resolved credentials so the provider stays stateless and the engine owns credential resolution.

```typescript
// @memberjunction/esignature

export type SignatureOperation =
  | 'CreateEnvelope' | 'GetEnvelopeStatus' | 'DownloadSignedDocument' | 'VoidEnvelope'
  | 'CreateEmbeddedSigningUrl' | 'ApplyTemplate' | 'ResendNotification' | 'ParseWebhookEvent';

export abstract class BaseSignatureProvider {
  /** Driver key, must match @RegisterClass key and MJ: Signature Providers.ServerDriverKey */
  protected abstract readonly providerKey: string;

  /** One-time per-instance init with decrypted credential values from the engine. */
  public abstract initialize(config: SignatureProviderConfig): Promise<void>;
  public abstract get IsConfigured(): boolean;

  // ---- Core operations (every driver MUST implement) ----
  public abstract CreateEnvelope(req: CreateEnvelopeRequest): Promise<EnvelopeResult>;
  public abstract GetEnvelopeStatus(externalEnvelopeId: string): Promise<EnvelopeStatusResult>;
  public abstract DownloadSignedDocument(externalEnvelopeId: string): Promise<SignedDocumentResult>;
  public abstract VoidEnvelope(externalEnvelopeId: string, reason: string): Promise<OperationResult>;

  // ---- Optional operations (default: "not supported") ----
  public async CreateEmbeddedSigningUrl(_req: EmbeddedSigningRequest): Promise<SigningUrlResult> {
    return { Success: false, ErrorMessage: `${this.providerKey} does not support embedded signing.` };
  }
  public async ApplyTemplate(_req: TemplateEnvelopeRequest): Promise<EnvelopeResult> {
    return { Success: false, ErrorMessage: `${this.providerKey} does not support templates.` };
  }
  public async ResendNotification(_externalEnvelopeId: string): Promise<OperationResult> {
    return { Success: false, ErrorMessage: `${this.providerKey} does not support resend.` };
  }

  // ---- Capability discovery ----
  public abstract getSupportedOperations(): SignatureOperation[];
  public supportsOperation(op: SignatureOperation): boolean {
    return this.getSupportedOperations().includes(op);
  }

  // ---- Inbound webhook (Connect / event callbacks) ----
  /** Verify signature/HMAC and normalize a provider webhook payload. Return null if not handled. */
  public ParseWebhookEvent(_payload: unknown, _headers: Record<string, string>): NormalizedSignatureEvent | null {
    return null;
  }
}
```

### 4.1 Normalized types

```typescript
export type EnvelopeStatus =
  | 'Draft' | 'Sent' | 'Delivered' | 'Signed' | 'Completed' | 'Declined' | 'Voided' | 'Unknown';

export interface SignatureRecipientInput {
  email: string;
  name?: string;
  routingOrder?: number;
  role?: string;                 // template role name, if using ApplyTemplate
}

export interface SignatureDocumentInput {
  bytes: Buffer;
  filename: string;
  contentType: string;           // e.g. application/pdf
  documentId?: string;           // provider doc id; engine assigns if omitted
}

export interface CreateEnvelopeRequest {
  title: string;                 // emailSubject
  message?: string;
  documents: SignatureDocumentInput[];
  recipients: SignatureRecipientInput[];
  sendImmediately?: boolean;     // true → 'sent', false → 'created'/'draft'
  metadata?: Record<string, string>;  // provider custom fields / envelope metadata
}

export interface EnvelopeResult {
  Success: boolean;
  externalEnvelopeId?: string;
  status?: EnvelopeStatus;
  signingUrl?: string;           // when provider returns one inline
  ErrorMessage?: string;
}

export interface EnvelopeStatusResult { Success: boolean; status: EnvelopeStatus; recipients?: RecipientStatus[]; ErrorMessage?: string; }
export interface SignedDocumentResult { Success: boolean; document?: { bytes: Buffer; filename: string; contentType: string }; ErrorMessage?: string; }
export interface OperationResult { Success: boolean; ErrorMessage?: string; }

export interface NormalizedSignatureEvent {
  externalEnvelopeId: string;
  status: EnvelopeStatus;
  occurredAt: string;            // ISO
  raw: unknown;                  // original payload for audit
}
```

The existing `mapDocuSignStatus()` becomes the DocuSign driver's private mapping into `EnvelopeStatus`.

---

## 5. Data model (MJ core entities)

All entities use the **"MJ: " prefix** (new core entities). Authored in a migration under `migrations/v5/`; CodeGen generates the entity subclasses, views, and CRUD sprocs. **No `__mj_*` timestamp columns and no FK indexes in the migration** — CodeGen adds those. Multiple columns on one table use a single consolidated `ALTER`/`CREATE`. Every non-FK/PK column gets an `sp_addextendedproperty` description.

### 5.1 `MJ: Signature Providers` — provider-type registry
| Column | Type | Notes |
|---|---|---|
| `ID` | uniqueidentifier PK | `NEWSEQUENTIALID()` |
| `Name` | nvarchar(100) | e.g. `DocuSign` |
| `ServerDriverKey` | nvarchar(100) | **= `@RegisterClass` key** used by `ClassFactory` |
| `IsActive` | bit | default 1 |
| `Priority` | int | default 0 |
| `RequiresOAuth` | bit | default 1 |
| `SupportsTemplates` | bit | default 0 |
| `SupportsEmbeddedSigning` | bit | default 0 |
| `Configuration` | nvarchar(max) | JSON: non-secret provider defaults (oauthBase, restBase, …) |

Seeded via metadata files (see §9) — **not** SQL INSERTs.

### 5.2 `MJ: Signature Accounts` — per-tenant provider instance
| Column | Type | Notes |
|---|---|---|
| `ID` | uniqueidentifier PK | |
| `Name` | nvarchar(200) | e.g. "Acme Prod DocuSign" |
| `SignatureProviderID` | uniqueidentifier FK → `MJ: Signature Providers` | |
| `CredentialID` | uniqueidentifier FK → `MJ: Credentials` | **encrypted creds live here** |
| `CompanyID` | uniqueidentifier FK → `Companies` NULL | optional tenancy scope |
| `IsActive` | bit | default 1 |
| `IsDefault` | bit | default 0 — default account per provider/company |
| `DefaultFromName` | nvarchar(200) NULL | sender identity |
| `DefaultFromEmail` | nvarchar(320) NULL | |
| `Configuration` | nvarchar(max) NULL | JSON: per-account non-secret overrides (accountId, restBase) |

> The provider-type vs. account-instance split is lifted directly from Storage (`File Storage Providers` + `File Storage Accounts`). It gives "many DocuSign accounts across many tenants" for free.

### 5.3 `MJ: Signature Requests` — the envelope lifecycle record
| Column | Type | Notes |
|---|---|---|
| `ID` | uniqueidentifier PK | |
| `SignatureAccountID` | uniqueidentifier FK → `MJ: Signature Accounts` | which account/provider sent it |
| `Title` | nvarchar(255) | emailSubject |
| `Message` | nvarchar(max) NULL | |
| `Status` | nvarchar(20) | CHECK in (`Draft`,`Sent`,`Delivered`,`Signed`,`Completed`,`Declined`,`Voided`) |
| `ExternalEnvelopeID` | nvarchar(255) NULL | provider envelope id |
| `EntityID` | uniqueidentifier FK → `Entities` NULL | **polymorphic originating record** |
| `RecordID` | nvarchar(450) NULL | **polymorphic originating record id** |
| `SentAt` | datetimeoffset NULL | |
| `CompletedAt` | datetimeoffset NULL | |
| `VoidReason` | nvarchar(500) NULL | |

`EntityID` + `RecordID` is MJ's standard polymorphic-reference pair (used widely in the baseline), letting any entity own a signature request without a dedicated FK. Consuming apps (e.g. secure-messaging) set `EntityID`/`RecordID` to their domain record (a Thread, a PortalSession, etc.).

### 5.4 `MJ: Signature Request Documents` — documents in an envelope
| Column | Type | Notes |
|---|---|---|
| `ID` | uniqueidentifier PK | |
| `SignatureRequestID` | uniqueidentifier FK → `MJ: Signature Requests` | |
| `ArtifactID` | uniqueidentifier FK → `MJ: Artifacts` NULL | source document |
| `ArtifactVersionID` | uniqueidentifier FK → `MJ: Artifact Versions` NULL | pin the exact version signed |
| `Name` | nvarchar(255) | filename |
| `Sequence` | int | default 1 |
| `Role` | nvarchar(20) | CHECK in (`Source`,`Signed`) — Source = sent doc, Signed = completed doc artifact |

Storing both the **source** artifact (sent) and, on completion, a **signed** artifact (the downloaded executed PDF written back into the Artifacts subsystem) keeps everything in MJ's document management. The signed doc is produced by `DownloadSignedDocument` → new `MJ: Artifact Version`.

### 5.5 `MJ: Signature Request Recipients` — signers
| Column | Type | Notes |
|---|---|---|
| `ID` | uniqueidentifier PK | |
| `SignatureRequestID` | uniqueidentifier FK | |
| `Email` | nvarchar(320) | |
| `Name` | nvarchar(200) NULL | |
| `RoutingOrder` | int | default 1 |
| `Role` | nvarchar(100) NULL | template role name |
| `Status` | nvarchar(20) | per-recipient: `Created`,`Sent`,`Delivered`,`Signed`,`Declined` |
| `SignedAt` | datetimeoffset NULL | |
| `ExternalRecipientID` | nvarchar(255) NULL | provider recipient id |

### 5.6 `MJ: Signature Request Logs` — provider-call audit
| Column | Type | Notes |
|---|---|---|
| `ID` | uniqueidentifier PK | |
| `SignatureRequestID` | uniqueidentifier FK NULL | |
| `Operation` | nvarchar(50) | `CreateEnvelope`,`GetEnvelopeStatus`,`Webhook`,… |
| `Success` | bit | |
| `StatusBefore` / `StatusAfter` | nvarchar(20) NULL | |
| `Detail` | nvarchar(max) NULL | error text / normalized event JSON |

> Mirrors `MJ: Communication Runs`/`Logs`. Credential *access* is already audited separately by the Credential Engine.

---

## 6. Credential flow

Replace `readDocuSignConfig()` env-var reads with the Credential Engine, exactly as Storage's `util.ts` does:

1. A **`MJ: Credentials`** row (type e.g. `DocuSign JWT`) holds the encrypted `Values` JSON: `{ integrationKey, userId, accountId, oauthBase, restBase, privateKey }`. The credential **type** carries a JSON-Schema (`FieldSchema`) validated by the engine.
2. `MJ: Signature Accounts.CredentialID` → that row.
3. `SignatureEngine.GetDriver(accountId, user)`:
   ```
   provider = providers.find(p => p.ID === account.SignatureProviderID)
   driver   = ClassFactory.CreateInstance(BaseSignatureProvider, provider.ServerDriverKey)
   resolved = await CredentialEngine.Instance.getCredential(credential.Name,
                  { credentialId: account.CredentialID, contextUser: user, subsystem: 'eSignature' })
   await driver.initialize({ ...provider.Configuration, ...account.Configuration, ...resolved.values })
   ```
4. OAuth token refresh persists back via `CredentialEngine.Instance.updateCredential(...)` through an `onTokenRefresh` callback handed to `initialize()` (Storage `util.ts:176-201` is the reference). DocuSign's JWT grant is short-lived, so the driver requests a fresh token per session; longer-lived refresh tokens (Adobe) round-trip through `updateCredential`.

This yields encryption, per-access audit, multi-tenant accounts, and `directValues` override (for ad-hoc/agent calls) for free. **Do not** use the legacy `MJ: Company Integrations` inline-token columns.

---

## 7. Engine facade (`SignatureEngine`)

`SignatureEngine extends BaseEngine<SignatureEngine>` (singleton via the `BaseEngine`/`BaseSingleton` pattern). Lives in the base package's server entry (or a `-server` subpath) since it depends on Credential Engine + entities.

Responsibilities:
- `Config(forceRefresh, user, provider?)` — caches `MJ: Signature Providers` + `MJ: Signature Accounts` (small, cacheable reference data).
- `GetDriver(accountId, user)` — resolve + initialize + **cache the driver per account** (Storage `RefreshDriverCache` pattern).
- `SendForSignature(input, user)` — creates `MJ: Signature Requests` (+ Recipients + Documents), loads the document bytes from the Artifact/Version, calls `driver.CreateEnvelope`, persists `ExternalEnvelopeID` + `Status='Sent'` + `SentAt`, logs to `MJ: Signature Request Logs`.
- `RefreshStatus(requestId, user)` — `driver.GetEnvelopeStatus`, maps + persists status (and `CompletedAt` on `Completed`), updates recipients.
- `DownloadSigned(requestId, user)` — `driver.DownloadSignedDocument` → write a new `MJ: Artifact Version`, add a `Role='Signed'` `MJ: Signature Request Documents` row.
- `Void(requestId, reason, user)` — `driver.VoidEnvelope`.
- `RecordWebhookEvent(driverKey, payload, headers)` — find driver by key, `ParseWebhookEvent`, locate the request by `ExternalEnvelopeID`, update status, log. Per-provider/global mode: `new Metadata()` is fine only at the global app layer; inside the engine prefer the passed `provider`/`this`.

Follow the multi-provider rule from `CLAUDE.md`: methods accept `contextUser` and an optional `IMetadataProvider`; do not reach for the global `Metadata` in per-request code.

---

## 8. Actions (thin façade for agents & workflows)

Thin `BaseAction` subclasses under `packages/Actions/CoreActions/src/custom/esignature/`, each delegating to `SignatureEngine`. Params + result codes declared in metadata JSON under `metadata/actions/`. Per CLAUDE.md: Actions are the *boundary*, the engine is the *substance*.

| Action | Inputs | Outputs | Result codes |
|---|---|---|---|
| **Send Document for Signature** | `SignatureAccountID`, `ArtifactID`/`ArtifactVersionID`, `Title`, `Recipients` (array), `EntityID?`, `RecordID?`, `Message?`, `SendImmediately?` | `SignatureRequestID`, `ExternalEnvelopeID`, `Status` | `SENT`, `DRAFT_CREATED`, `MISSING_DOCUMENT`, `ACCOUNT_NOT_FOUND`, `PROVIDER_ERROR` |
| **Get Signature Status** | `SignatureRequestID` | `Status`, `Recipients` | `OK`, `NOT_SENT`, `PROVIDER_ERROR` |
| **Download Signed Document** | `SignatureRequestID` | `ArtifactVersionID` | `OK`, `NOT_COMPLETED`, `PROVIDER_ERROR` |
| **Void Signature Request** | `SignatureRequestID`, `Reason` | `Status` | `VOIDED`, `PROVIDER_ERROR` |

Authoring follows `http-request.action.ts`: case-insensitive param lookup, manual validation, push outputs onto `params.Params`, never throw for business failures. No automatic metadata-param validation exists in the engine — validate inside `InternalRunAction`.

---

## 9. Status updates: polling + webhooks

MJ's Actions engine has **no native inbound-webhook primitive**. Use both:

1. **Polling** (already present in secure-messaging's `refresh-status`): `SignatureEngine.RefreshStatus` / the "Get Signature Status" Action. For long synchronous waits, bound polling with the engine's `params.AbortSignal` (Gamma action pattern). Default to event-driven; poll as fallback / reconciliation.
2. **Inbound webhook** (DocuSign Connect, Adobe events): handled at the **HTTP layer** — an MJAPI endpoint (or an OpenApp REST route) — that calls `SignatureEngine.RecordWebhookEvent(driverKey, body, headers)`. Verification + parsing live **on the driver** (`ParseWebhookEvent`) so the HTTP handler is thin and vendor-agnostic. Each driver owns its own HMAC/signature verification.

---

## 10. Provider seed metadata

Seed `MJ: Signature Providers` via metadata files (per CLAUDE.md "Seeding New Lookup/Reference Tables" — never SQL INSERTs):

```
metadata/signature-providers/
  .mj-sync.json                 # entity: "MJ: Signature Providers"
  .signature-providers.json     # [{ fields: { Name: "DocuSign", ServerDriverKey: "DocuSign",
                                  #     RequiresOAuth: true, SupportsTemplates: true, … } }]
```

Push with `npx mj sync push --dir=metadata --include="signature-providers"`. Accounts + Credentials are tenant data, created at runtime (admin UI / API), not seeded.

---

## 11. Package & file layout (MJ repo)

```
packages/eSignature/
  Base/                         → @memberjunction/esignature
    src/
      BaseSignatureProvider.ts  (contract + normalized types)
      SignatureEngine.ts        (server engine facade; depends on credentials + entities)
      index.ts                  (barrel — re-export to fire @RegisterClass side-effects)
  Providers/
    DocuSign/                   → @memberjunction/esignature-docusign
      src/DocuSignSignatureProvider.ts   (@RegisterClass(BaseSignatureProvider, 'DocuSign'))
    (future) AdobeSign/, DropboxSign/

packages/Actions/CoreActions/src/custom/esignature/
  send-document-for-signature.action.ts
  get-signature-status.action.ts
  download-signed-document.action.ts
  void-signature-request.action.ts

migrations/v5/
  V<timestamp>__v5.x__eSignature_Primitive.sql   (6 entities; CodeGen handles subclasses/views/sprocs)

metadata/
  signature-providers/          (seed for MJ: Signature Providers)
  actions/.esignature-*.json    (Action + param + result-code metadata)
```

The base package must avoid re-exporting types from other packages (CLAUDE.md rule #5); drivers import contracts directly from `@memberjunction/esignature`.

---

## 12. Migration path for `app-secure-messaging` (the first consumer)

1. Add deps `@memberjunction/esignature` + `@memberjunction/esignature-docusign`; delete the local `services/SignatureProvider.ts`.
2. Move DocuSign credentials from `DOCUSIGN_*` env vars into a `MJ: Credentials` row + a `MJ: Signature Accounts` row (one-time setup / migration script).
3. Rewrite `handlers/signatures.ts` to call `SignatureEngine` (`SendForSignature`, `RefreshStatus`) instead of `ClassFactory` + env reads. Set `EntityID`/`RecordID` to the secure-messaging domain record (Thread/PortalSession) and `ArtifactID` to the document.
4. Decommission the app-local `SignatureRequest` table: either (a) drop it and read/write the core `MJ: Signature Requests` filtered by `EntityID`/`RecordID`, or (b) keep a thin app view over the core table for the existing REST response shape. **(a) is preferred** for the "full primitive" decision; subject to the app's published-version no-breaking-change policy.
5. Add a webhook route in the app (or MJAPI) → `SignatureEngine.RecordWebhookEvent` for DocuSign Connect, replacing poll-only status.

---

## 13. Phased implementation plan

**Phase 1 — Contract + DocuSign driver (no MJ data deps).**
`@memberjunction/esignature` base package (`BaseSignatureProvider` + normalized types) and `@memberjunction/esignature-docusign` (lift existing code, swap env-config for an injected `SignatureProviderConfig`). Unit-tested in isolation. *Deliverable: provider abstraction usable with caller-supplied credentials.*

**Phase 2 — Entities + migration + CodeGen.**
Author the 6-entity migration in `migrations/v5/`; run migration + CodeGen; commit generated subclasses. Seed `MJ: Signature Providers` via metadata. *Deliverable: data model live, strongly-typed entities.*

**Phase 3 — `SignatureEngine` + Credential Engine wiring.**
Engine facade with driver cache, credential resolution, lifecycle persistence, logging, `RecordWebhookEvent`. *Deliverable: end-to-end send/track/download in code, multi-tenant encrypted creds.*

**Phase 4 — Actions.**
The four thin Actions + metadata JSON. *Deliverable: agent/workflow exposure.*

**Phase 5 — secure-messaging migration (§12).**
First real consumer; validates the abstraction. *Deliverable: app runs on the framework primitive; local provider removed.*

**Phase 6 (later) — Adobe Sign / Dropbox Sign drivers + optional Explorer admin UI** for Signature Accounts/Requests.

> Per CLAUDE.md rule #2b: do **not** write engine/Action code that references the new entity fields until the migration has run and CodeGen has generated the typed properties. Phases 2 → 3 ordering is mandatory.

---

## 14. Open questions / future considerations

- **Embedded signing** (in-app signing ceremony) vs. email-only — modeled as the optional `CreateEmbeddedSigningUrl` op; decide if Phase 1 needs it for secure-messaging's portal UX.
- **Templates** — `ApplyTemplate` optional op; defer unless an early consumer needs it.
- **Webhook hosting** — standardize a single MJAPI `/esignature/webhook/:driverKey` endpoint vs. per-app routes. A core MJAPI endpoint is cleaner long-term.
- **Bulk send / reminders / expiration** — future engine methods + entity columns (`ExpiresAt`, `ReminderConfig`).
- **Notifications** — on `Completed`/`Declined`, optionally fan out via the Communication primitive (engine-to-engine, not Action-to-Action).
- **Published-version policy** — entity additions are additive/safe; the secure-messaging table decommission (§12 step 4) must respect `PUBLISH_NO_BREAK_POLICY.md`.

---

## 15. Why a package + Actions, not Actions-only (rationale)

DocuSign/Adobe/Dropbox Sign are **interchangeable backends invoked by code** — the exact shape `BaseCommunicationProvider`/`FileStorageBase` exist for. The CLAUDE.md Actions philosophy is explicit: *"NEVER use Actions for internal code-to-code communication… Keep Actions thin, delegate to service classes."* The substance belongs in a provider package with a `ClassFactory`-resolved abstraction; Actions are the thin agent/workflow façade on top. The optional-op-with-default pattern cleanly handles "not every vendor supports embedded signing / templates."
