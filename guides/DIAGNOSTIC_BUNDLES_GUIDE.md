# Diagnostic Bundles Guide

This guide covers the **MemberJunction Diagnostic Bundles** subsystem end-to-end:
1. How client and server diagnostic capture works (`Snapshot`, `Record`, and `Watch` modes)
2. How `.mjdiag` archives are scrubbed, verified, and encrypted (`MJDB` v1 envelope)
3. How to configure an MJ instance to **submit** diagnostic bundles (or download them locally)
4. How to set up any MJAPI instance as a **receiving server** (`/diagnostics/intake/v1`), including **MJStorage Quarantine-then-Promote locations**, **Malware Scanning** (AWS GuardDuty, Azure Defender, ClamAV/Webhook, and structural verification), and **Collector Key Custody** (`MJ: Credentials`)
5. How to inspect, re-scrub, and export bundles with the `mj diag` CLI

---

## 1. Architecture Overview

```mermaid
flowchart LR
    subgraph Client["Browser (@memberjunction/ng-diagnostics)"]
        CLog["RegisterLoggerSink + Console"]
        CSpan["TelemetryManager Spans"]
        CIDB["MJ_Diagnostics IndexedDB (1s debounce)"]
    end

    subgraph Server["Customer MJAPI (@memberjunction/diagnostics-server)"]
        ALS["AsyncLocalStorage Context"]
        SLog["Logger Sink + Deduplicated Console Tap"]
        SSql["ISqlObserver (Normalized SQL)"]
        SApollo["Apollo Span Plugin"]
        Chunks[("MJ: Diagnostic Session Chunks")]
        Assembler["Bundle Assembler + Scrubber + Findings"]
    end

    subgraph Archive[".mjdiag Archive & MJDB Envelope"]
        Zip["Zero-Dep STORED/DEFLATE ZIP (.mjdiag)"]
        Env["MJDB v1 (X25519 + HKDF-SHA256 + AES-256-GCM)"]
    end

    subgraph Receiver["Receiving MJAPI (/diagnostics/intake/v1)"]
        PreCheck["MJDB Header & KeyID Pre-Check"]
        QStore[("MJStorage: Quarantine Bucket")]
        Decrypt["AEAD Decrypt + VerifyBundleArchive"]
        AV["IDiagnosticMalwareScanner"]
        VStore[("MJStorage: Verified Bucket")]
    end

    CLog --> Assembler
    CSpan --> Assembler
    CIDB --> Assembler
    ALS --> SLog & SSql & SApollo
    SLog & SSql & SApollo --> Chunks --> Assembler
    Assembler --> Zip --> Env
    Env --> PreCheck --> QStore --> Decrypt --> AV --> VStore
```

### Packages

| Package | Layer | Responsibility |
| --- | --- | --- |
| [`@memberjunction/diagnostics`](../packages/Diagnostics/Core/README.md) | L0 (Isomorphic, zero external runtime deps) | Ring buffers, `.mjdiag` ZIP reader/writer, `VerifyBundleArchive`, two-stage `DiagnosticScrubber`, X25519/AES-256-GCM/Ed25519 `MJDB` envelope crypto, automated findings engine, Perfetto & OTLP exporters, `BaseDiagnosticContributor`. |
| [`@memberjunction/diagnostics-server`](../packages/Diagnostics/Server/README.md) | Server (`MJAPI`) | `DiagnosticSessionManager`, `AsyncLocalStorage` request/session context, 3-stage `DiagnosticsServerMiddleware`, `ISqlObserver` hook, chunk persistence, `.mjdiag` assembly, single-use HMAC download tokens, outbound MJC transport, standard `/diagnostics/intake/v1` receiver, malware scanners, Remote Operations, and retention purge job driver. |
| [`@memberjunction/ng-diagnostics`](../packages/Angular/Generic/diagnostics/README.md) | Angular Generic (`widgets` layer) | `MJDiagnosticsService` (runs listeners inside `NgZone.runOutsideAngular()`), `<mj-diagnostic-recording-banner>`, `<mj-diagnostic-report-problem-dialog>`, and `<mj-diagnostic-bundle-viewer>`. |

---

## 2. Two-Stage Scrubbing Model

Diagnostic logs and telemetry spans rarely contain raw PII, and aggressive regex redaction of emails/phones/UUIDs destroys the exact record IDs and stack traces engineers need to debug issues. MemberJunction therefore uses a **two-stage scrubbing model** in `DiagnosticScrubber`:

1. **Stage 1 — Credential & Secret Scrubber (always on)**:
   - Strips high-confidence credentials across all logs, span attributes, GraphQL variables, SQL text, and HAR headers:
     - `Authorization: Bearer ...` and `Basic ...` headers
     - JWTs (`eyJ...`)
     - `x-api-key`, `api_key`, `client_secret`, `password`, `secret`, `token`, `cookie`, `set-cookie` keys
     - Database connection strings (`Server=...;Password=...;`, `postgres://user:pass@...`, `redis://:pass@...`)
     - Cloud & AI provider keys (`sk-...`, `AKIA...`, `AIza...`, `ghp_...`, `xoxb-...`)
     - PEM private keys (`-----BEGIN ... PRIVATE KEY-----`)
2. **Stage 2 — Literal & Payload Scrubber (opt-in)**:
   - Replaces SQL string literals (`'...'`) and numeric literals with `?` via `NormalizeSql`.
   - Scrubs `RunView` `ExtraFilter` literals and GraphQL variable string values while preserving structural keys, entity names, and UUID primary keys.

**Default.** Stage 1 runs on every bundle. Stage 2 is off by default: a session or bundle keeps SQL and filter literals (`ScrubLiterals = false`, scrubber profile `FullRaw`). Turn Stage 2 on per session or bundle with `ScrubLiterals = true` (profile `Standard` in the Explorer dialog), or for the whole instance with `Diagnostics.RequireLiteralScrubbing = true`, which forces `ScrubLiterals = true` in `Diagnostics.StartSession` and `Diagnostics.BuildBundle`.

### Suppressing Capture in Sensitive Code Paths

Wrap secret-rotation or vault operations in `WithoutDiagnosticCapture` so no SQL events, logs, or spans are recorded for that async tree:

```typescript
import { WithoutDiagnosticCapture, RunDetached } from '@memberjunction/diagnostics-server';

await WithoutDiagnosticCapture(async () => {
  await rotateMasterKeys();
});

// Preserve diagnostic session correlation across detached fire-and-forget callbacks:
RunDetached(() => {
  void backgroundSync();
});
```

---

## 3. Submission Side: Capturing, Downloading & Sending Bundles

### Explorer UX Entry Points (`@memberjunction/ng-explorer-core` + `@memberjunction/ng-diagnostics`)

Users and administrators can launch diagnostic capture or download a `.mjdiag` bundle from three places in the Explorer UI:

1. **About Dialog (`About MemberJunction` → `Diagnostics`)**:
   - Inside `AboutDialogComponent`'s collapsible **Diagnostics** accordion section, click **"Diagnostic Bundle..."** right next to **"Copy diagnostics"** to open `<mj-diagnostic-report-problem-dialog>`.
2. **User Avatar Menu (Top-Right Header)**:
   - Open the user profile menu and click **"Diagnostic Bundle"** (in the `system` section right above `About MemberJunction`).
   - When the user starts a live recording session and closes the dialog to reproduce an issue, `<mj-diagnostic-recording-banner>` stays pinned in the shell with a **Stop & Package** button. It stops the recording, builds the snapshot for that session, and reopens the dialog with the result. The banner renders inside the shell container (anything placed after it is clipped by the shell's `overflow: hidden`). When the server did not start a session for the user, the banner shows a **client-only** tag and the dialog explains why; the resulting bundle then holds browser data only.
3. **Stuck-Loading Screen (Pre-Reset Capture)**:
   - `ShellComponent.ngOnInit()` initializes `MJDiagnosticsService` immediately at boot. If startup stalls and the *"Taking longer than expected"* reset panel appears, a **"Download Diagnostic Bundle"** button is shown right next to **"Reset"** so the user can download the startup `.mjdiag` flight-recorder snapshot *before* `ResetApplication()` clears IndexedDB and caches.

### Capture Modes & Submission Flows

- **Snapshot** (**Download Client Snapshot** in the dialog, or **Stop & Package** on the banner): packages the browser's ring buffers (`client/logs.ndjson`, `client/waterfall.ndjson`, `client/telemetry.ndjson`) immediately, without a session. A client snapshot never contains `server/traces.ndjson`, `server/sql.ndjson` or `server/logs.ndjson`; those files are empty placeholders required by the archive layout. Server data comes only from a server-built bundle (**Submit to Support**, or `Diagnostics.BuildBundle` for a session).
  - `client/telemetry.ndjson` fills while a live recording runs: the service turns `TelemetryManager` on for the recording and restores the prior setting on stop. Outside a recording the file is empty unless the application enables telemetry itself.
  - `requestBytes` / `responseBytes` in `client/waterfall.ndjson` are approximate JSON text lengths (query plus variables; response data). They are measured only while a diagnostic observer is registered or telemetry is on, and are 0 otherwise.
  - A live recording without `Diagnostics: Run Sessions` (or self-service recording, `Diagnostics.SelfServiceRecording`) is **client-only**: it runs under a local `rec-…` ID that is never sent to the server, so no server session exists and no server data is captured for it.
- **Record**: Starts a live session (`MJ: Diagnostic Sessions`). The browser attaches `X-MJ-Diagnostic-Session: <sessionId>` on GraphQL requests (`GraphQLDataProvider.Instance.SetActiveDiagnosticSessionId(sessionId)`) and flushes client buffers to the `MJ_Diagnostics` IndexedDB database every 1 second (preserved across `ResetApplication()`).
- **One-Click "Submit to Support" (`MJDiagnosticsService.SubmitBundleToSupport()`)**:
  - Directly from `<mj-diagnostic-report-problem-dialog>`, clicking **"Submit to Support"** executes:
    1. `Diagnostics.UploadClientCapture` — uploads the scrubbed client flight-recorder seed to the server.
    2. `Diagnostics.BuildBundle` — merges client and server chunks, runs the 9 automated diagnostic rules, and verifies the `.mjdiag` archive.
    3. `Diagnostics.SendBundle` — encrypts the `.mjdiag` archive with `MJDB` v1 hybrid encryption (`X25519` + `AES-256-GCM` with header AAD) and sends it, displaying the returned `diagref_...` Support Reference ID in the dialog. The server picks one path (see [Sending to a Collector](#sending-to-a-collector-enrolment-and-signed-requests)):
       - `Diagnostics.External.CollectorUrl` is set → send to that collector. The installation must be enrolled; otherwise the send fails with "This installation is not enrolled with the collector".
       - No collector URL and local intake enabled (`Diagnostics.Intake.Enabled` and its key loaded) → hand the bundle to this server's own `DiagnosticIntakeService` in process.
       - Neither → the send fails with a message that names both settings. A fresh server with default settings takes this path.
- **Server-Initiated "Watch Sessions" + Automatic Browser Flush (`X-MJ-Diagnostic-Trigger`)**:
  - An administrator or automated rule can arm a server-side Watch Session (`Diagnostics.StartSession`) scoped by `Users` (`UserID`, `BrowserSessionID`, `APIKeyID` isolated by `CompanyID`) or `Operations` (GraphQL operation name, error-only, or `minDurationMs` latency threshold).
  - `Diagnostics.UploadClientCapture` accepts uploads to a `BrowserSession`-scoped session from any caller who presents that browser session ID, so treat the browser session ID as a capability and do not share or log it.
  - When `DiagnosticsServerMiddleware` matches an incoming browser request to an active Watch Session, it sets `X-MJ-Diagnostic-Trigger: <sessionId>` on the HTTP response.
  - `MJDiagnosticsService.HandleServerTriggerHeader(sessionId)` in the browser detects this header and automatically flushes the client flight-recorder snapshot via `Diagnostics.UploadClientCapture` (deduplicated per session ID) without requiring any user interaction.

### Remote Operations

All five operations are metadata-registered under the `Diagnostics` category and enforce `Diagnostics.*` authorizations + `diagnostics:*` API scopes:

- `StartDiagnosticSession` (`Diagnostics.Record` or `Diagnostics.WatchOtherUsers`)
- `StopDiagnosticSession`
- `CreateDiagnosticBundle` (`Diagnostics.Export`)
- `SendDiagnosticBundleToMJC` (`Diagnostics.SendToMJC`)
- `IssueDiagnosticBundleDownloadUrl` (`Diagnostics.Export` — mints a 60-second, single-use, user-bound HMAC-SHA256 token for `GET /diagnostics/bundles/:bundleId/download?token=...`)

### Submission Instance Configuration (`MJ: Instance Configurations`)

The server reads these settings through `DiagnosticsSettings` (`@memberjunction/diagnostics-server`). A missing row uses the default.

| Configuration Key | Default | Description |
| --- | --- | --- |
| `Diagnostics.Capture.Enabled` | `true` | When `false`, `Diagnostics.StartSession` refuses and the middleware does not attach requests to sessions. |
| `Diagnostics.SelfServiceRecording` | `false` | When `true`, a user without `Diagnostics: Run Sessions` may start a session scoped to their own user ID only. |
| `Diagnostics.RequireLiteralScrubbing` | `false` | Forces `ScrubLiterals = true` (Stage 2) on every session and bundle. |
| `Diagnostics.MaxSessionMinutes` | `60` | Upper limit for a session's `DurationMinutes`. |
| `Diagnostics.RetentionDays` | `14` | Days before the retention job purges local sessions and bundles. |
| `Diagnostics.External.Enabled` | `false` | Allows `Diagnostics.SendBundle` to send to an external collector. Sending to the in-process intake is not external. |
| `Diagnostics.External.Destinations` | `[]` | JSON array of allowed destinations (`MJC`, `CustomerCollector`, `StorageAccount`). An empty list allows all. |
| `Diagnostics.External.CollectorUrl` | `''` | Public API URL of the collector MJAPI (its `MJAPI_PUBLIC_URL`, for example `https://support.example.com/api`). The only collector URL `SendBundle` uses; the request cannot override it. |
| `Diagnostics.External.SenderCredentialID` | `''` | `MJ: Credentials` row that holds this installation's Ed25519 sender key. Written by `Diagnostics.EnrolSender`. |
| `Diagnostics.External.SenderKeyID` | `''` | Key ID the collector knows the sender key by. Written by `Diagnostics.EnrolSender`. |
| `Diagnostics.External.CollectorPublicKeyBase64` | `''` | Collector X25519 public key (SPKI base64) recorded at enrolment. A different key that the pinned signing key signed is accepted and logged once as a key rotation. |
| `Diagnostics.External.CollectorSigningPublicKeyBase64` | `''` | Collector Ed25519 signing key (SPKI base64) pinned at enrolment. The collector's X25519 key must carry a signature from this key. |
| `Diagnostics.InstallID` | `''` | Stable ID of this installation. Generated (UUID) and saved at enrolment; `DiagnosticSessionManager.InstallID` reads it. A server that never enrols uses a per-process ID, which is enough for in-process local intake. |

### Sending to a Collector: Enrolment and Signed Requests

**Collector audience.** The sender and the collector compute the same intake URL, which is also the signed `aud`:
`TrimTrailingSlashes(Diagnostics.External.CollectorUrl) + '/diagnostics/intake/v1'` (not added twice when the URL already ends with it). On the collector this is `ApiRoute('/diagnostics/intake/v1', { absolute: true })` with trailing slashes removed, so `Diagnostics.External.CollectorUrl` must equal the collector's public API URL.

**Collector URL rules.** `Diagnostics.External.CollectorUrl` must use `https:` (plain `http:` is accepted only for `localhost`, `127.0.0.1` and `[::1]`). Redirects from the collector are never followed: a 3xx answer fails the step.

**Enrolment (once per installation, and again to rotate the key).** Enrolment is trust-on-first-use: the collector keys returned by `/enroll` are pinned without other proof, so the first contact must be over TLS to the right host.
1. The collector administrator issues a registration code (`Diagnostics.IssueSenderRegistrationCode`, see §4).
2. On the sending server, set `Diagnostics.External.CollectorUrl`, then run the remote operation `Diagnostics.EnrolSender` with `{ RegistrationCode }` (authorization `Diagnostics: Manage Intake`). There is no `mj diag enroll` CLI command: `@memberjunction/cli` does not depend on `@memberjunction/diagnostics-server`, so the remote operation is the enrolment path. Code can call `EnrolSender()` from `@memberjunction/diagnostics-server`.
3. `EnrolSender` reads or creates `Diagnostics.InstallID`, generates an Ed25519 key pair with the key ID `<first 8 chars of the install ID>-<yyyymm>-<4 hex>`, and posts `{ installId, registrationCode, keyId, publicKeyBase64, proof }` to `<aud>/enroll`. `proof` is the Ed25519 signature over `mjdiag-enrol-v1:<installId>:<keyId>:<registrationCode>:<aud>`.
4. When the collector accepts, the server stores the private key in `MJ: Credentials` (credential type `Diagnostics Sender Key`, values `{ keyId, publicKey, privateKey }`) and saves `Diagnostics.External.SenderCredentialID`, `SenderKeyID`, `CollectorPublicKeyBase64` and `CollectorSigningPublicKeyBase64`.

**Every send.**
- Each request to the collector (`GET /public-key`, `POST /bundles`, `PUT` payload, `POST /complete`) carries `Authorization: MJDiag-Ed25519 keyId="…",installId="…",aud="…",ts="…",nonce="…",sig="…"`. `sig` is the Ed25519 signature over `mjdiag-http-v1:<METHOD>:<path>:<aud>:<installId>:<ts>:<nonce>:<bodySha256>`, where `path` is the full URL path of the request (no query string, base path included), `ts` is unix seconds, `nonce` a fresh UUID and `bodySha256` the hex SHA-256 of the exact bytes sent (of the empty string for `GET`).
- The collector's X25519 key must carry a valid signature from the pinned `CollectorSigningPublicKeyBase64`; otherwise nothing is encrypted or uploaded.
- The envelope is signed with the same sender key (`senderKeyId` = the stored key ID), so the collector can bind the envelope to the HTTP identity.
- The `uploadUrl` the collector returns must be on the collector URL's origin (a relative URL resolves against the intake URL); otherwise the send stops before the upload.
- No API key (`MJ_API_KEY` or any other) is read or sent on this path.

---

## 4. Setting Up a Receiving MJAPI Server (`/diagnostics/intake/v1`)

Any MemberJunction server (`MJAPI`) can act as a secure diagnostic bundle receiver — whether for **MemberJunction Central (MJC)** or an enterprise's own internal support hub.

### Step 1: Generate Collector Keys & Store in `MJ: Credentials`

Generate an X25519 encryption keypair and an Ed25519 signing keypair using the CLI:

```bash
npx mj diag keygen --key-id mjc-intake-2026-01 --signing
```

1. Store both key pairs in one `MJ: Credentials` row of type `Diagnostics Intake Key` (encrypted at rest via `@memberjunction/encryption`). The values are JSON with five fields: `keyId`, `publicKey` (X25519 SPKI base64), `privateKey` (X25519 PKCS#8 base64), `signingPublicKey` (Ed25519 SPKI base64) and `signingPrivateKey` (Ed25519 PKCS#8 base64).
2. Record the `MJ: Credentials` row ID in the `Diagnostics.Intake.KeyPairCredentialID` instance configuration setting. At startup the server loads the credential and enables intake only when `Diagnostics.Intake.Enabled` is `true`, all five values are present, and each public key is the one derived from its private key. Otherwise intake stays disabled and the server logs one error. Startup never generates a key pair.
3. `GET /diagnostics/intake/v1/public-key` returns the X25519 public key with its Ed25519 signature (`SignRecipientPublicKey`). It never serves an unsigned key: without a signing key it answers 503. Senders pin `signingPublicKey` at enrolment (below) and refuse any public key it did not sign.

### Step 2: Set Up `MJStorage` Locations (Quarantine-then-Promote)

To ensure unverified or infected bytes never mingle with trusted support artifacts, configure **two separate storage locations** (`MJ: File Storage Providers`). When `Diagnostics.Intake.StorageProviderID` is empty, intake keeps payloads in memory only. When `Diagnostics.Intake.QuarantineStorageProviderID` is empty, quarantine uses the verified provider.

1. **Quarantine Storage Provider** (`Diagnostics.Intake.QuarantineStorageProviderID`):
   - Dedicated S3 bucket, Azure Blob container, or GCS bucket with **no public read access**, **no execution permissions**, and a **24-hour object lifecycle expiration rule**.
   - Incoming encrypted uploads are staged at:
     ```text
     quarantine/<referenceId>.mjdiag.enc
     ```
2. **Verified Storage Provider** (`Diagnostics.Intake.StorageProviderID`):
   - Long-term support bucket accessible to support engineers.
   - Only after a bundle passes **all four verification gates** (MJDB header pre-check → AEAD AES-256-GCM decryption → `VerifyBundleArchive` ZIP/manifest verification → Malware Scan verdict `Clean`) are the decrypted `.mjdiag` bytes promoted to:
     ```text
     verified/<YYYY-MM-DD>/<referenceId>.mjdiag
     ```
   - The quarantine object is immediately deleted upon promotion or rejection.
   - With `Diagnostics.Intake.DecryptOnIngest = false` the still-encrypted envelope is promoted instead, to `verified/<YYYY-MM-DD>/<referenceId>.mjdiag.enc`.
3. **Received bundle rows**: each upload saves a `MJ: Diagnostic Bundles` row with `Direction = 'Received'`, `Status = 'Receiving'`, `SenderInstallID` (the authenticated install), `SenderMJVersion`, `ContactInfo`, `ExternalReferenceID` (the reference ID) and `ExpiresAt` (from `Diagnostics.Intake.RetentionDays`). On complete the row becomes `Ready` (with `SizeBytes`, `SHA256` of the stored bytes, an `MJ: Files` row in `FileID` when the verified storage provider is set, and `ManifestJSON`/`FindingsJSON` when decrypted) or `Failed` with the reason. The retention job purges these rows and their files.

### Step 3: Configure Malware Scanning (`IDiagnosticMalwareScanner`)

No instance setting selects the scanner. Startup uses `StructuralOnlyMalwareScanner` (Option C). To use another scanner, call `DiagnosticIntakeService.Instance.Configure({ malwareScanner })` from server code after startup:

#### Option A: Cloud-Native Object Tagging (`CloudObjectTag`) — Recommended for AWS / Azure / GCP
When the Quarantine bucket is backed by **AWS S3 with GuardDuty Malware Protection**, **Azure Blob Storage with Microsoft Defender for Storage**, or **GCP Cloud Storage**, the cloud provider automatically scans every object written to the quarantine bucket and writes the verdict to the object's tags/metadata.
- `CloudObjectTagMalwareScanner` polls the quarantine object's tags until a verdict appears:
  - **AWS GuardDuty**: `GuardDutyMalwareScanStatus = 'NO_THREATS_FOUND'` → `Clean`; `'THREATS_FOUND'` → `Infected` (quarantine purged immediately).
  - **Azure Defender**: `Malware Scanning scan result = 'No threats found'` → `Clean`; `'Malicious'` → `Infected`.
  - **Custom Tag**: `mj-malware-scan-status = 'clean' | 'infected'`.

#### Option B: ClamAV / HTTP Webhook (`ClamAVWebhook`)
For self-hosted, Docker, or Kubernetes deployments running a ClamAV REST sidecar (e.g., `clamav-rest` or an internal scanning microservice):
- `ClamAvWebhookMalwareScanner` streams the archive bytes via `POST` (`application/octet-stream`) to your scanner endpoint and requires `{ "clean": true }` before promoting the bundle.

#### Option C: Cryptographic + Structural Verification (`None` / `StructuralOnlyMalwareScanner`)
Even when no external antivirus daemon is configured, the intake pipeline **always** enforces:
1. **`MJDB` v1 Magic Header & Key ID Pre-Check** before writing to quarantine (`InspectEncryptedBundleEnvelope`) — rejects random junk uploads immediately at the HTTP edge.
2. **X25519 + HKDF-SHA256 + AES-256-GCM AEAD Decryption** with AAD binding (`bundleId`, `manifestSha256`, `ticketNumber`, `keyId`) — proves the payload was encrypted specifically for this collector and was not tampered with in transit.
3. **`VerifyBundleArchive` Structural Verification**:
   - Rejects non-ZIP files, path-traversal entries (`../` or leading `/`), unexpected file extensions, compression-ratio zip bombs (`> 100:1`), and oversized archives (`> 100 MB` uncompressed).
   - Verifies that every entry in the archive is on the `.mjdiag` allow-list (`manifest.json`, `environment.json`, `findings.json`, `traces/*.json`, `logs/*.jsonl`, `sql/*.jsonl`, `network/*.json`, `custom/*.json`), parses as valid JSON/JSONL, and matches the SHA-256 digest recorded in `manifest.json`.

### Step 4: Register Senders (enrolment, signed requests, revocation)

Only registered installations can submit. A sender is a `MJ: Diagnostic Sender Registrations` row (`InstallID`, `Name`, `Status` `Pending` | `Active` | `Revoked`, `KeyID`, `PublicKeyBase64`, `MaxBundlesPerDay`, `LastSeenAt`). Code can also register a key in memory with `DiagnosticIntakeService.Instance.RegisterSenderPublicKey(installId, keyId, publicKeyBase64)` (no row; for a self-hosted hub or tests). Nothing else grants access; no API key (`MJ_API_KEY` or any other) is read.

**Enrolment.**
1. Create a registration row with the sender's `InstallID` and a `Name` (status `Pending`).
2. Run `Diagnostics.IssueSenderRegistrationCode` with `{ RegistrationID }` (authorization `Diagnostics: Manage Intake`). It returns `{ Code, ExpiresAt }`: 32 random bytes as base64url, valid for 24 hours. Only the SHA-256 hash is stored; give the plain code to the sender's administrator once.
3. The sender runs `Diagnostics.EnrolSender` (§3), which posts `{ installId, registrationCode, keyId, publicKeyBase64, proof }` to `POST /diagnostics/intake/v1/enroll`. That route needs no signature. Failed enrolments count against the IP failure limit (below).
4. The collector loads the row by `InstallID`, requires an unexpired code hash, compares the code hash in constant time, and verifies `proof` (Ed25519 over `mjdiag-enrol-v1:<installId>:<keyId>:<registrationCode>:<aud>`) with `publicKeyBase64`. It then saves `KeyID`, `PublicKeyBase64`, `Status = 'Active'`, `EnrolledAt`, and clears the code. The response is `{ installId, keyId, collectorPublicKeyBase64, collectorSigningPublicKeyBase64 }`. Any failure answers 400 or 401 with a generic message; the reason is in the server log.

**Signed requests.** `POST /bundles`, `PUT /bundles/:referenceId/payload` and `POST /bundles/:referenceId/complete` require `Authorization: MJDiag-Ed25519 keyId="…",installId="…",aud="…",ts="…",nonce="…",sig="…"`. The collector:
- finds the `Active` registration for `installId` and requires `keyId` to equal its `KeyID`;
- rejects `|now − ts| > 300 s`;
- requires `aud` to equal its audience, `TrimTrailingSlashes(ApiRoute('/diagnostics/intake/v1', { absolute: true }))`. So `MJAPI_PUBLIC_URL` must be the URL senders put in `Diagnostics.External.CollectorUrl`;
- verifies `sig` over `mjdiag-http-v1:<METHOD>:<path>:<aud>:<installId>:<ts>:<nonce>:<bodySha256>`. The signed path is the public URL's path: the collector verifies the path of its audience URL followed by the route subpath (for example `/api/diagnostics/intake/v1/bundles` for `MJAPI_PUBLIC_URL=https://x/api`), without the query string, so a proxy that strips a path prefix does not break signatures. `bodySha256` is the hex SHA-256 of the raw body;
- refuses a repeated `(installId, nonce)`.

Any failure answers 401 with a generic message, and the reason is logged. The header and registration are checked before the body is read, and a payload body is never read past its declared `sizeBytes` (413). Rate limits:

| Limit | Applies to | Default |
|-------|-----------|---------|
| IP failure limit | Failed attempts before the signature check (missing or malformed header, unknown or non-Active install, key ID mismatch), failed signature checks (bad `sig`, skewed `ts`, wrong `aud`, replayed nonce) and failed enrolments, counted per client IP. When an IP is over the limit, its unsigned requests (including `GET /public-key` and `POST /enroll`) and its further failures get 429. A request with a valid signature is never counted or IP-limited. | 60 per minute (`Configure` option `maxFailedAttemptsPerMinute`) |
| Sender limit | Verified requests on the bundle routes, counted per install ID. | 30 per minute (`Configure` option `maxRequestsPerMinute`) |
| Open intakes | Intakes of one install that are not completed (created, or uploaded and waiting for complete). `POST /bundles` beyond the limit gets 429. An intake whose 10-minute upload window has passed without an upload is removed. An uploaded intake not completed within 10 minutes after the upload window is rejected and removed (quarantine object deleted, row `Failed`); a complete that arrives after the deadline gets 410 `COMPLETE_EXPIRED`, or 422 `MISSING_PAYLOAD` once the sweep has already removed the record. | 5 (`Configure` option `maxOpenIntakesPerSender`) |
| Records in memory | Intake records kept in memory. When full, the oldest completed record is removed; when none is completed, `POST /bundles` gets 429. A completed record keeps no encrypted payload, and keeps the decrypted bytes only when no storage provider is set. | 200 (`Configure` option `maxRecordsInMemory`) |
| Daily quota | See below. | `MaxBundlesPerDay` |

The four `Configure` limit options must be positive integers; any other value throws.

The counters are per process, and each holds at most 10,000 keys (the oldest are dropped first). A collector behind a reverse proxy or load balancer must set Express `trust proxy` (for example in a middleware's `ConfigureExpressApp`) so that `req.ip` is the client address. Otherwise all clients share the proxy's IP and one failure budget.

`POST /bundles` and the payload upload refuse (429) a sender that already has `MaxBundlesPerDay` `Received` bundle rows from the last 24 hours (0 means no limit).

**Binding.** The intake record keeps the authenticated `(installId, keyId)`. A body `installId` that differs answers 400, and payload or complete from another sender answers 403. On complete the envelope must carry a valid sender signature by the same key (`senderKeyId` equal to the authenticated `keyId`), or the bundle is rejected. A successful complete updates only the registration's `LastSeenAt`, on a freshly loaded row, and not when the row is no longer `Active`. The `uploadUrl` returned by `POST /bundles` is the public absolute URL (`ApiRoute(…, { absolute: true })`).

**Revocation and rotation.** Set `Status = 'Revoked'` (and `RevokedAt`): every request from that install then answers 401. To rotate a key, issue a new registration code; the sender enrols again with a new key, and the row's `KeyID` and `PublicKeyBase64` are replaced. Issuing a code re-enables a revoked sender: an enrolment with that code sets the row back to `Active`.

**Replay store.** The nonce cache is in memory, per process. It keeps each nonce for 602 s (the ±300 s skew window plus 2 s, because the skew check compares whole seconds), removes expired entries, and refuses new nonces when it is full. A collector that runs more than one MJAPI instance needs a shared store (for example Redis `SET NX EX`), or a nonce replayed to another instance is accepted.

### Step 5: Intake Configuration Reference (`MJ: Instance Configurations`)

| Configuration Key | Default | Description |
| --- | --- | --- |
| `Diagnostics.Intake.Enabled` | `false` | Enables `/diagnostics/intake/v1/*` routes on this MJAPI instance. Intake also needs a receiver key (below). |
| `Diagnostics.Intake.KeyPairCredentialID` | `''` | `MJ: Credentials` ID (type `Diagnostics Intake Key`) holding `keyId`, `publicKey`, `privateKey`, `signingPublicKey` and `signingPrivateKey`. Intake stays disabled while it is empty, incomplete, or a public key does not match its private key. |
| `Diagnostics.Intake.StorageProviderID` | `''` | `MJ: File Storage Providers` ID for promoted, verified `.mjdiag` bundles. |
| `Diagnostics.Intake.QuarantineStorageProviderID` | `''` | Optional `MJ: File Storage Providers` ID for staging unverified encrypted uploads. |
| `Diagnostics.Intake.DecryptOnIngest` | `true` | `true`: intake decrypts, verifies the archive, runs the malware scan, and saves the manifest and findings. `false`: intake checks the envelope header, the sender signature and the declared hash, then stores the envelope still encrypted. No malware scan runs, and `ManifestJSON`/`FindingsJSON` stay empty; decrypt offline with the private key. |
| `Diagnostics.Intake.RetentionDays` | `30` | Days to keep received bundles. |
| `Diagnostics.Intake.OnBundleReceivedActionID` | `''` | Optional `MJ: Actions` ID run after a bundle passes verification. It runs as the system user with the inputs `ReferenceID`, `BundleID`, `SenderInstallID`, `SenderMJVersion`, `Summary`, `Contact`, `FindingsCount` and `VerifiedStoragePath`. |

---

## 5. CLI Reference (`mj diag`)

```bash
# 1. Verify and inspect a bundle (plain .mjdiag or encrypted MJDB envelope)
npx mj diag inspect ./bundle.mjdiag
npx mj diag inspect ./bundle.mjdiag.enc --private-key <base64-pkcs8> --json

# 2. List slow spans and SQL queries (>= 250ms)
npx mj diag slow ./bundle.mjdiag --threshold 250

# 3. View chronological merged timeline of client spans, server spans, and SQL queries
npx mj diag timeline ./bundle.mjdiag --limit 100

# 4. Re-scrub an existing bundle at strict tier before sharing externally
npx mj diag scrub ./bundle.mjdiag --tier strict -o ./bundle.strict.mjdiag

# 5. Export traces to Perfetto (https://ui.perfetto.dev) or OpenTelemetry OTLP JSON
npx mj diag export ./bundle.mjdiag --perfetto -o ./trace.perfetto.json
npx mj diag export ./bundle.mjdiag --otlp -o ./trace.otlp.json

# 6. Generate collector X25519 + Ed25519 keypairs for an intake server
npx mj diag keygen --key-id mjc-intake-2026-01 --signing
```
