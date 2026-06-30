# eSignature Primitive — File-by-File Build Plan

**Status:** For approval (precedes any code)
**Date:** 2026-06-05
**Companion to:** [esignature-primitive.md](esignature-primitive.md) (design)
**Decisions:** Packages live at `packages/eSignature/{Base,Providers/DocuSign}`. Build scoped Phase-at-a-time; this plan covers the full path with the **CodeGen gate** called out explicitly.

---

## 0. Grounding (verified against the live repo, not the design doc)

These were confirmed by reading the actual source so the build copies real idioms:

- **MJ package version:** `5.39.0` (all new packages + workspace deps pin to this). Root `1.0.10` is the monorepo wrapper, not a package version.
- **Engine is a TWO-class split** (the design doc's §7 single-class assumption is wrong): `FileStorageEngineBase extends BaseEngine` owns the `Load()` + `BaseEnginePropertyConfig[]`; `FileStorageEngine extends BaseSingleton<…>` wraps it and owns the driver cache. **We mirror this exactly** → `SignatureEngineBase` + `SignatureEngine`.
- **Driver-init merge order:** `driver.initialize({ ...baseConfig, ...resolved.values, onTokenRefresh })` — credential values override provider/account config.
- **Credential Engine API (verbatim):**
  - `await CredentialEngine.Instance.Config(false, contextUser)`
  - `CredentialEngine.Instance.getCredentialById(id)` → entity
  - `getCredential(name, { credentialId, contextUser, subsystem }) → { credential, values, source, expiresAt }`
  - `updateCredential(id, values, contextUser)`
- **secure-messaging source location:** `/Users/bcianzygmunt/Projects/MJ/app-secure-messaging` — a **sibling repo, outside both working dirs**. Phase 5 (its migration) is therefore a *separate-repo* change; this plan delivers Phases 1–4 in MJ and treats Phase 5 as a documented handoff.
- **Single-driver-per-package** is the Communication convention (`communication-sendgrid`, `-twilio`, …) and matches the design's `esignature-docusign`. Build: `"build": "tsc && tsc-alias -f"`, `"type": "module"`, `vitest` for tests.
- **Migration filename format in use:** `V<YYYYMMDDHHMM>__v5.39.x__<Description>.sql` (e.g. `V202606042130__v5.39.x__Metadata_Sync.sql`).

---

## 1. Phasing & PR boundaries

| Phase | Deliverable | DB? | PR |
|---|---|---|---|
| **1** | `@memberjunction/esignature` (contract+types) + `@memberjunction/esignature-docusign` (driver) | No | PR-1 |
| **2** | 6-entity migration + seed metadata. **You run migrate+CodeGen.** | Yes (you) | PR-2 |
| **3** | `SignatureEngineBase` + `SignatureEngine` (server) — built on generated types | uses gen'd | PR-3 |
| **4** | 4 thin Actions + Action metadata | uses engine | PR-4 |
| **5** | secure-messaging migration (**separate repo**) | sep. repo | sep. |
| 6 | (later) Adobe/Dropbox drivers, Explorer admin UI | — | — |

**Hard gate (CLAUDE.md rule 2b):** No Phase-3/4 code may reference new entity fields until Phase 2's migrate+CodeGen has run. I will **stop and hand off** after Phase 2 writes the migration; I cannot run migrate+CodeGen (needs your DB).

Each phase = one reviewable PR off `next`. I do not commit/push without your explicit go.

---

## 2. PHASE 1 — Base contract + DocuSign driver

### 2.1 `packages/eSignature/Base/` → `@memberjunction/esignature`

```
packages/eSignature/Base/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    index.ts                      # barrel: export * from './BaseSignatureProvider'; export * from './types'
    types.ts                      # normalized types (§4.1 of design)
    BaseSignatureProvider.ts      # abstract contract (§4 of design)
  src/__tests__/
    BaseSignatureProvider.test.ts # capability-discovery + not-supported defaults
```

**`types.ts`** — exactly the design §4.1 set, with one correction: drop `EnvelopeStatusResult` name collision risk by keeping the design's names. Exports:
`SignatureOperation`, `EnvelopeStatus`, `SignatureProviderConfig` (incl. optional `onTokenRefresh?: (refresh: string, access?: string) => Promise<void>` + `accountId?`/`accountName?` to match Storage's `StorageProviderConfig`), `SignatureRecipientInput`, `SignatureDocumentInput`, `CreateEnvelopeRequest`, `EnvelopeResult`, `RecipientStatus`, `EnvelopeStatusResult`, `SignedDocumentResult`, `OperationResult`, `EmbeddedSigningRequest`, `SigningUrlResult`, `TemplateEnvelopeRequest`, `NormalizedSignatureEvent`.

**`BaseSignatureProvider.ts`** — design §4 verbatim shape:
- `protected abstract readonly providerKey: string`
- `abstract initialize(config: SignatureProviderConfig): Promise<void>`; `abstract get IsConfigured(): boolean`
- Core abstract: `CreateEnvelope`, `GetEnvelopeStatus`, `DownloadSignedDocument`, `VoidEnvelope`
- Optional non-abstract w/ "not supported" defaults: `CreateEmbeddedSigningUrl`, `ApplyTemplate`, `ResendNotification`
- `abstract getSupportedOperations(): SignatureOperation[]` + concrete `supportsOperation()`
- `ParseWebhookEvent(payload, headers): NormalizedSignatureEvent | null` default `null`
- MJ naming: **PascalCase public members**, camelCase protected.

**`package.json`** (mirrors communication-types — pure contract, minimal deps):
```jsonc
{
  "name": "@memberjunction/esignature",
  "version": "5.39.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["/dist"],
  "scripts": { "build": "tsc && tsc-alias -f", "watch": "tsc -w", "test": "vitest run", "test:watch": "vitest" },
  "dependencies": {
    "@memberjunction/global": "5.39.0"   // for @RegisterClass base usage downstream; contract itself ~dep-free
  }
}
```
*(No `@memberjunction/core-entities` here — keeps the contract free of MJ data deps per design Layer-1.)*

### 2.2 `packages/eSignature/Providers/DocuSign/` → `@memberjunction/esignature-docusign`

```
packages/eSignature/Providers/DocuSign/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    index.ts                          # export * from './DocuSignSignatureProvider'
    DocuSignSignatureProvider.ts      # @RegisterClass(BaseSignatureProvider, 'DocuSign')
  src/__tests__/
    DocuSignSignatureProvider.test.ts # mapDocuSignStatus + envelope-build (fetch mocked)
```

**`DocuSignSignatureProvider.ts`** — lift from `app-secure-messaging/.../SignatureProvider.ts`, transformed:
- `@RegisterClass(BaseSignatureProvider, 'DocuSign')`, `providerKey = 'DocuSign'`.
- **Remove `readDocuSignConfig()` env reads.** `initialize(config)` takes injected values: `{ integrationKey, userId, accountId, privateKey, oauthBase, restBase }` (from `resolved.values`). Store on protected fields; `IsConfigured` = all four required present.
- Keep JWT-grant OAuth (`getAccessToken`) verbatim, reading from instance config not `process.env`.
- Map old `createEnvelope(params)` → new `CreateEnvelope(req: CreateEnvelopeRequest)` (now multi-document, multi-recipient: loop docs/signers instead of single).
- Map old `getStatus` → `GetEnvelopeStatus` returning `{ Success, status, recipients }`.
- Add `DownloadSignedDocument` (DocuSign `GET …/envelopes/{id}/documents/combined`) and `VoidEnvelope` (`PUT status=voided`) — new, design-required core ops not in the app version.
- `mapDocuSignStatus()` → private, returns the new `EnvelopeStatus` union (note the new `Completed`/`Voided`/`Delivered` values vs the app's `Cancelled`).
- `getSupportedOperations()` returns the core 4 + (DocuSign supports) `ApplyTemplate`, embedded signing, `ParseWebhookEvent`.
- `ParseWebhookEvent` — DocuSign Connect HMAC verify + normalize (new; design §9). Can stub-verify in P1, harden later — will note as TODO.

**`package.json`:**
```jsonc
{
  "name": "@memberjunction/esignature-docusign",
  "version": "5.39.0", "type": "module",
  "main": "dist/index.js", "types": "dist/index.d.ts", "files": ["/dist"],
  "scripts": { "build": "tsc && tsc-alias -f", "watch": "tsc -w", "test": "vitest run" },
  "dependencies": {
    "@memberjunction/esignature": "5.39.0",
    "@memberjunction/global": "5.39.0",
    "jsonwebtoken": "<match app-secure-messaging's version>"
  },
  "devDependencies": { "@types/jsonwebtoken": "..." }
}
```
*(`fetch` is global in Node 18+ — no `node-fetch` dep, matching the app code.)*

### 2.3 Phase-1 wiring chores
- Add both dirs to root `package.json` `workspaces` if it uses an explicit list (check; MJ uses globbed `packages/**` so likely automatic — verify).
- `tsconfig.json` per package: extend the repo base config like sibling packages do (copy `communication-sendgrid/tsconfig.json`).
- `npm install` at **repo root** (never in package dirs) to link.
- `npm run build` from root for both packages; fix TS errors.
- `npm run test` in each package. **Report pass/fail counts** (CLAUDE.md rule 6).

**Phase-1 acceptance:** both packages compile; driver usable with caller-supplied credentials; unit tests green; zero `any`; no cross-package re-exports.

---

## 3. PHASE 2 — Entities, migration, seed (DB; you run CodeGen)

### 3.1 Migration `migrations/v5/V<ts>__v5.39.x__eSignature_Primitive.sql`
Six tables, **business columns only** (CodeGen adds `__mj_*` + FK indexes + sprocs + views):

1. `MJ: Signature Providers` (table `SignatureProvider`)
2. `MJ: Signature Accounts` (table `SignatureAccount`, FK→Provider, FK→`MJ: Credentials`, FK→`Company` NULL)
3. `MJ: Signature Requests` (table `SignatureRequest`, FK→Account, polymorphic `EntityID`→`Entity` NULL + `RecordID` NVARCHAR(450) NULL, `Status` CHECK)
4. `MJ: Signature Request Documents` (table `SignatureRequestDocument`, FK→Request, FK→`MJ: Artifacts` NULL, FK→`MJ: Artifact Versions` NULL, `Role` CHECK Source/Signed)
5. `MJ: Signature Request Recipients` (table `SignatureRequestRecipient`, FK→Request, `Status` CHECK)
6. `MJ: Signature Request Logs` (table `SignatureRequestLog`, FK→Request NULL)

Migration rules I will follow (CLAUDE.md migrations + PUBLISH policy):
- `${flyway:defaultSchema}` placeholder; hardcoded UUIDs for any seeds (none here — seeds via metadata).
- **Consolidated `ALTER`/single `CREATE`** per table; `sp_addextendedproperty` on every non-PK/FK column.
- **No** `__mj_CreatedAt/UpdatedAt`; **no** FK indexes; **no** INSERTs to lookup tables.
- Verify FK target table names against the live schema before writing (e.g. exact `MJ: Artifacts` table name, `Company` vs `Companies`).

### 3.2 Seed metadata `metadata/signature-providers/`
- `.mj-sync.json` (entity `MJ: Signature Providers`, the standard pull block).
- `.signature-providers.json` — one DocuSign row: `Name=DocuSign`, `ServerDriverKey=DocuSign`, `RequiresOAuth=true`, `SupportsTemplates=true`, `SupportsEmbeddedSigning=true`, `Configuration` JSON with non-secret defaults (`oauthBase`, `restBase`). Omit `primaryKey`/`sync`.
- Push: `npx mj sync push --dir=metadata --include="signature-providers"` (you, after migrate).

### 3.3 ⛔ HANDOFF POINT
**You run:** Flyway migrate → `mj codegen` → review generated `CodeGen_Run_*.sql` + new subclasses in `MJCoreEntities` → metadata push. Then I resume on the generated, strongly-typed entities. I will not write Phase-3 code before this.

**Phase-2 acceptance:** migration applies clean; CodeGen produces 6 entity subclasses + views + sprocs; provider row seeded.

---

## 4. PHASE 3 — SignatureEngine (server)

Location: `packages/eSignature/Base/src/server/` exposed as a subpath export `@memberjunction/esignature/server` (Storage co-locates engine + base in one package; we do the same but isolate server-only deps behind a subpath so the pure contract stays importable client-side).

```
packages/eSignature/Base/src/server/
  index.ts
  SignatureEngineBase.ts   # extends BaseEngine; Load() of Providers+Accounts (CacheLocal)
  SignatureEngine.ts       # extends BaseSingleton; driver cache; Send/Refresh/Download/Void/RecordWebhookEvent
  util.ts                  # initializeDriverWithAccountCredentials (mirror MJStorage/util.ts)
```
Add `@memberjunction/core`, `@memberjunction/core-entities`, `@memberjunction/credentials` to `package.json` deps; add the `"./server"` entry to `exports` + `typesVersions`.

- `SignatureEngineBase` config array:
  `{ Type:'entity', EntityName:'MJ: Signature Providers', PropertyName:'_providers', CacheLocal:true }`,
  `{ …'MJ: Signature Accounts', '_accounts', CacheLocal:true }`.
- `util.initializeDriverWithAccountCredentials` — copy MJStorage signature: resolve driver via `ClassFactory.CreateInstance(BaseSignatureProvider, provider.ServerDriverKey)`, `CredentialEngine.Instance.Config` → `getCredentialById` → `getCredential(name,{credentialId,contextUser,subsystem:'eSignature'})`, build `onTokenRefresh` → `updateCredential`, `driver.initialize({ ...base, ...resolved.values, onTokenRefresh })`.
- `SignatureEngine` methods (design §7): `SendForSignature`, `RefreshStatus`, `DownloadSigned`, `Void`, `RecordWebhookEvent`, `GetDriver` (cache `Map<accountId,driver>` + on-demand fallback). All take `contextUser` + optional `IMetadataProvider`; use `this`/passed provider, **never** `new Metadata()` in per-request paths (CLAUDE.md multi-provider rule).
- Persist lifecycle to the 6 entities via `GetEntityObject<T>(…, contextUser)`; check `Save()` boolean + `LatestResult.CompleteMessage`.
- Document bytes: load from `MJ: Artifact Versions`; signed doc → write new Artifact Version + `Role='Signed'` doc row.
- **Decompose** (CLAUDE.md): no method >~40 lines; helpers for persistence, recipient sync, logging.

**Phase-3 acceptance:** engine compiles against generated types; unit tests (mocked driver + mocked CredentialEngine) for Send/Refresh/Void/webhook-normalize; pass counts reported.

---

## 5. PHASE 4 — Actions

`packages/Actions/CoreActions/src/custom/esignature/`:
```
send-document-for-signature.action.ts   # @RegisterClass(BaseAction, 'Send Document for Signature')
get-signature-status.action.ts
download-signed-document.action.ts
void-signature-request.action.ts
```
- Thin `BaseAction` subclasses → delegate to `SignatureEngine`. Authoring per `http-request.action.ts`: case-insensitive param lookup, manual validation, push outputs to `params.Params`, never throw on business failure, return result codes.
- Result codes per design §8 table.
- Metadata JSON under `metadata/actions/.esignature-*.json` (Action + params + result codes), pushed via `mj sync push`.
- Register load fn / ensure tree-shaking safe (manifest will pick up `@RegisterClass`).

**Phase-4 acceptance:** CoreActions builds with the 4 actions; metadata pushes; a smoke test invoking one action against a mocked engine.

---

## 6. PHASE 5 — secure-messaging migration (separate repo, handoff)

Lives in `/Users/bcianzygmunt/Projects/MJ/app-secure-messaging` (not a current working dir). Per design §12: add deps, delete local `SignatureProvider.ts`, move `DOCUSIGN_*` env → `MJ: Credentials` + `MJ: Signature Accounts`, rewrite `handlers/signatures.ts` to call `SignatureEngine`, decommission the app-local `SignatureRequest` table (respecting `PUBLISH_NO_BREAK_POLICY.md`), add webhook route → `RecordWebhookEvent`. **Deferred** — requires opening that repo and is gated on PRs 1–4 publishing.

---

## 7. Cross-cutting compliance checklist (applied every phase)

- No `any` / no `.Get()`/`.Set()` on entities (rule 2/2b) — wait for CodeGen before typed access.
- No re-exports across packages (rule 5); drivers import contract from `@memberjunction/esignature`.
- `BaseSingleton`/`BaseEngine` for singletons (rule 7).
- Static imports only (rule 8) — `jsonwebtoken` declared in deps.
- PascalCase public / camelCase private members.
- Functions ≤ ~40 lines; decompose.
- `npm install` at root; `npm run build` from root; run+report unit tests (rule 6).
- No commits/pushes without explicit per-PR approval (rule 1). New feature branch per phase, tracking same-named remote.

---

## 8. Decisions (settled)

1. **Webhook hosting — DECIDED: core MJAPI endpoint.** A single `/esignature/webhook/:driverKey` route added to MJAPI (Phase 3/4) calls `SignatureEngine.RecordWebhookEvent(driverKey, body, headers)`. Per-app routes are not used. Verification + parsing stay on the driver (`ParseWebhookEvent`); the MJAPI handler is thin and vendor-agnostic.
2. **Engine packaging — DECIDED: `/server` subpath of `@memberjunction/esignature`.** Engine + util live under `src/server/`, exposed as `@memberjunction/esignature/server` via `exports` + `typesVersions`. The pure contract (`src/index.ts`) stays client-importable and free of server-only deps (credentials, core-entities). No separate `-server` package. Matches Storage's co-location.

## 9. Still open (don't block Phase 1)

1. **Embedded signing in Phase 1?** Design §14 — only needed if secure-messaging's portal wants in-app signing now. Default: ship as optional op, no driver impl yet.
2. **`jsonwebtoken` version** — I'll pin to whatever app-secure-messaging already uses for parity; confirm acceptable.
