# Diagnostic Bundles Guide

This guide covers the **MemberJunction Diagnostic Bundles** subsystem end-to-end:
1. How client and server diagnostic capture works (`Snapshot`, `Record`, and `Watch` modes)
2. How `.mjdiag` archives are scrubbed, verified, and encrypted (`MJDB` v1 envelope)
3. How to configure an MJ instance to **submit** diagnostic bundles (or download them locally)
4. How to set up any MJAPI instance as a **receiving server** (`/diagnostics/intake/v1`), including **MJStorage Quarantine-then-Promote locations**, **Malware Scanning** (AWS GuardDuty, Azure Defender, ClamAV/Webhook, and structural verification), and **Collector Key Custody** (`MJ: Credentials`)
5. How to inspect, re-scrub, and export bundles with the `mj diag` CLI and the `@Diagnostic Analyst` agent

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
   - When the user starts a live recording session and closes the dialog to reproduce an issue, `<mj-diagnostic-recording-banner>` stays pinned in the shell with an elapsed timer and a one-click **Stop & Build** button.
3. **Stuck-Loading Screen (Pre-Reset Capture)**:
   - `ShellComponent.ngOnInit()` initializes `MJDiagnosticsService` immediately at boot. If startup stalls and the *"Taking longer than expected"* reset panel appears, a **"Download Diagnostic Bundle"** button is shown right next to **"Reset"** so the user can download the startup `.mjdiag` flight-recorder snapshot *before* `ResetApplication()` clears IndexedDB and caches.

### Capture Modes & Submission Flows

- **Snapshot**: Packages the current client and server ring buffers immediately without starting a persistent session.
- **Record**: Starts a live session (`MJ: Diagnostic Sessions`). The browser attaches `X-MJ-Diagnostic-Session: <sessionId>` on GraphQL requests (`GraphQLDataProvider.Instance.SetActiveDiagnosticSessionId(sessionId)`) and flushes client buffers to the `MJ_Diagnostics` IndexedDB database every 1 second (preserved across `ResetApplication()`).
- **One-Click "Submit to Support" (`MJDiagnosticsService.SubmitBundleToSupport()`)**:
  - Directly from `<mj-diagnostic-report-problem-dialog>`, clicking **"Submit to Support"** executes:
    1. `Diagnostics.UploadClientCapture` — uploads the scrubbed client flight-recorder seed to the server.
    2. `Diagnostics.BuildBundle` — merges client and server chunks, runs the 9 automated diagnostic rules, and verifies the `.mjdiag` archive.
    3. `Diagnostics.SendBundle` — encrypts the `.mjdiag` archive with `MJDB` v1 hybrid encryption (`X25519` + `AES-256-GCM` with header AAD) and uploads it to the configured collector endpoint, displaying the returned `diagref_...` Support Reference ID in the dialog.
- **Server-Initiated "Watch Sessions" + Automatic Browser Flush (`X-MJ-Diagnostic-Trigger`)**:
  - An administrator or automated rule can arm a server-side Watch Session (`Diagnostics.StartSession`) scoped by `Users` (`UserID`, `BrowserSessionID`, `APIKeyID` isolated by `CompanyID`) or `Operations` (GraphQL operation name, error-only, or `minDurationMs` latency threshold).
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
| `Diagnostics.External.CollectorUrl` | `''` | Intake base URL of the external collector. |

---

## 4. Setting Up a Receiving MJAPI Server (`/diagnostics/intake/v1`)

Any MemberJunction server (`MJAPI`) can act as a secure diagnostic bundle receiver — whether for **MemberJunction Central (MJC)** or an enterprise's own internal support hub.

### Step 1: Generate Collector Keys & Store in `MJ: Credentials`

Generate an X25519 encryption keypair (and optional Ed25519 signing keypair) using the CLI:

```bash
npx mj diag keygen --key-id mjc-intake-2026-01 --signing
```

1. Store the X25519 key in `MJ: Credentials` (encrypted at rest via `@memberjunction/encryption`). The credential values are JSON with three fields: `keyId`, `publicKey` (SPKI base64) and `privateKey` (PKCS#8 base64).
2. Record the `MJ: Credentials` row ID in the `Diagnostics.Intake.KeyPairCredentialID` instance configuration setting. At startup the server loads this key and enables intake only when `Diagnostics.Intake.Enabled` is `true` and the key loads; otherwise intake stays disabled and the server logs a warning. Startup never generates a key pair.
3. Publish the **X25519 Public Key (SPKI base64)** and `keyId` so submitting instances can encrypt bundles to your collector via `EncryptBundleForCollector`.

### Step 2: Set Up `MJStorage` Locations (Quarantine-then-Promote)

To ensure unverified or infected bytes never mingle with trusted support artifacts, configure **two separate storage locations** (`MJ: File Storage Providers`). When `Diagnostics.Intake.StorageProviderID` is empty, intake keeps payloads in memory only. When `Diagnostics.Intake.QuarantineStorageProviderID` is empty, quarantine uses the verified provider.

1. **Quarantine Storage Provider** (`Diagnostics.Intake.QuarantineStorageProviderID`):
   - Dedicated S3 bucket, Azure Blob container, or GCS bucket with **no public read access**, **no execution permissions**, and a **24-hour object lifecycle expiration rule**.
   - Incoming encrypted uploads are staged at:
     ```text
     quarantine/<referenceId>.mjdiag.enc
     ```
2. **Verified Storage Provider** (`Diagnostics.Intake.StorageProviderID`):
   - Long-term support bucket accessible to support engineers and the `@Diagnostic Analyst` agent.
   - Only after a bundle passes **all four verification gates** (MJDB header pre-check → AEAD AES-256-GCM decryption → `VerifyBundleArchive` ZIP/manifest verification → Malware Scan verdict `Clean`) are the decrypted `.mjdiag` bytes promoted to:
     ```text
     verified/<YYYY-MM-DD>/<referenceId>.mjdiag
     ```
   - The quarantine object is immediately deleted upon promotion or rejection.

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

### Step 4: Intake Configuration Reference (`MJ: Instance Configurations`)

| Configuration Key | Default | Description |
| --- | --- | --- |
| `Diagnostics.Intake.Enabled` | `false` | Enables `/diagnostics/intake/v1/*` routes on this MJAPI instance. Intake also needs a receiver key (below). |
| `Diagnostics.Intake.KeyPairCredentialID` | `''` | `MJ: Credentials` ID holding this receiver's X25519 key (`keyId`, `publicKey`, `privateKey`). Intake stays disabled while it is empty. |
| `Diagnostics.Intake.StorageProviderID` | `''` | `MJ: File Storage Providers` ID for promoted, verified `.mjdiag` bundles. |
| `Diagnostics.Intake.QuarantineStorageProviderID` | `''` | Optional `MJ: File Storage Providers` ID for staging unverified encrypted uploads. |
| `Diagnostics.Intake.DecryptOnIngest` | `true` | Passed to intake. Intake always decrypts and verifies in this version; `false` has no effect yet. |
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
