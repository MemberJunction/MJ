# @memberjunction/diagnostics-server

Server-side diagnostic capture, session orchestration, bundle assembly, outbound collector transport, and standard MJAPI intake endpoint for MemberJunction.

## Features

- **`DiagnosticSessionManager`**: Singleton coordinator managing active diagnostic sessions (`Record` and `Watch` modes), `AsyncLocalStorage` request/session context propagation (`RunWithContext`, `RunDetached`, `WithoutDiagnosticCapture`), `RegisterLoggerSink` + deduplicated console tap, SQL observer (`ISqlObserver`), chunk buffering/draining (`MJ: Diagnostic Session Chunks`), health snapshots, `.mjdiag` bundle assembly, outbound encrypted MJC submission, and single-use HMAC-SHA256 download tokens.
- **`DiagnosticsServerMiddleware`**: `BaseServerMiddleware` subclass wiring:
  - **Stage 1 (Pre-Auth)**: Attaches request IDs, propagates `x-mj-diag-session` / `x-mj-diag-trace` headers, and wraps requests in `AsyncLocalStorage`.
  - **Stage 2 (Post-Auth)**: Matches the authenticated request to active sessions by their `Users` or `Operations` scope.
  - **Stage 3 (Apollo Plugin)**: Captures GraphQL operation spans, variables (structural or scrubbed), and errors.
  - **REST Routes**: Single-use bundle download (`/diagnostics/bundles/:bundleId/download`) and standard MJAPI intake (`/diagnostics/intake/v1/*`).
- **`DiagnosticIntakeService` & `IDiagnosticMalwareScanner`**:
  - Standard MJAPI receiver endpoint (`GET /diagnostics/intake/v1/public-key`, `POST /enroll`, `POST /bundles`, `PUT /bundles/:referenceId/payload`, `POST /bundles/:referenceId/complete`). The bundle routes require an `MJDiag-Ed25519` signed request from a registered sender.
  - Pre-storage `MJDB` v1 envelope header verification, X25519 + HKDF-SHA256 + AES-256-GCM AAD decryption, and `VerifyBundleArchive` structural verification.
  - Quarantine-then-Promote `MJStorage` integration with pluggable malware scanning:
    - `CloudObjectTagMalwareScanner` (AWS GuardDuty S3 Malware Protection, Azure Defender for Storage, GCP Cloud Storage)
    - `ClamAvWebhookMalwareScanner` (HTTP scanning microservice / ClamAV REST bridge)
    - `StructuralOnlyMalwareScanner` (cryptographic + ZIP/JSON structural verification)
- **Remote Operations** (`Diagnostics.StartSession`, `StopSession`, `GetMySessionStatus`, `UploadClientCapture`, `BuildBundle`, `GetBundlePreview`, `SendBundle`, `IssueSenderRegistrationCode`, `EnrolSender`, `RevokeSender`, `ReactivateSender`). Each checks a `Diagnostics: *` authorization (`Run Sessions`, `Send Externally` or `Manage Intake`). An Owner passes every check. The roles Developer and Administrator do not grant access on their own, and a missing authorization record or unloaded metadata fails the check.
- **`MJDiagnosticSenderRegistrationEntityServer`**: Server entity class for `MJ: Diagnostic Sender Registrations` that guards direct writes (see below).
- **`DiagnosticRetentionScheduledJobDriver`**: Scheduled job driver (`BaseScheduledJob`) that purges expired `MJ: Diagnostic Bundles` (and their underlying `MJStorage` objects and in-memory bytes) and expired `MJ: Diagnostic Sessions`.

## Capture and memory

- The log sink, SQL observer and console tap are installed only while `Diagnostics.Capture.Enabled` is on and this process holds a session.
- `WithoutDiagnosticCapture` suppresses capture only in the current async context.
- A session's `MaxBytes` counts the serialized (UTF-8 JSON) bytes of its entries, not the stored compressed size. `StartSession` clamps it to 50 MB, and to 10 MB for a self-service session. Entries past the cap are dropped with one warning.
- Buffers are saved when they reach 1 MB, on Stop, upload and build, and when the session expires. A chunk that fails to save stays in memory for the next save.
- A built bundle stays in memory until it is idle for 2 hours or the total passes 256 MB (least recently used first). Rebuild it after that.
- A download token is used up only when the route sends the bundle bytes. A 410 answer keeps it usable.

## Usage

```typescript
import {
  DiagnosticSessionManager,
  WithoutDiagnosticCapture,
  RunDetached,
} from '@memberjunction/diagnostics-server';

// Suppress diagnostic capture during sensitive operations (e.g., secret rotation):
await WithoutDiagnosticCapture(async () => {
  await rotateCredentials();
});

// Preserve diagnostic session context across fire-and-forget background work:
RunDetached(() => {
  void backgroundTask();
});
```

### Sending to a collector

`Diagnostics.SendBundle` sends only to `Diagnostics.External.CollectorUrl`, and only after the installation is enrolled. The bundle must be built with literal scrubbing (`ScrubLiterals = true`) unless `Diagnostics.External.AllowUnscrubbedSend` is `true`. A re-enrolment that returns a collector signing key other than the pinned `Diagnostics.External.CollectorSigningPublicKeyBase64` fails; clear that setting first to switch collectors. Enrol once with the `Diagnostics.EnrolSender` remote operation (or `EnrolSender()` from this package) and a registration code from the collector. Each collector request is signed with the installation's Ed25519 key (`MJDiag-Ed25519` Authorization header), the collector key is checked against the signing key pinned at enrolment, and the upload must stay on the collector's origin. With no collector URL, the bundle goes to this server's own intake only when `Diagnostics.Intake.Enabled` is on; otherwise the send fails with a clear message.

```typescript
import { EnrolSender } from '@memberjunction/diagnostics-server';

const result = await EnrolSender({ RegistrationCode: code, ContextUser: contextUser });
// result: { InstallID, KeyID, EnrolledAt }
```

### Receiving bundles (collector)

Set `Diagnostics.Intake.Enabled` and `Diagnostics.Intake.KeyPairCredentialID`. The `Diagnostics Intake Key` credential holds `keyId`, `publicKey`, `privateKey` (X25519) and `signingPublicKey`, `signingPrivateKey` (Ed25519). Each public key must match its private key, or intake stays disabled with one logged error. `GET /public-key` returns the X25519 key signed with the collector signing key, or 503 when no signing key is configured (intake is disabled then).

Senders must be registered:

1. Create a `MJ: Diagnostic Sender Registrations` row (`InstallID`, `Name`, status `Pending`).
2. Run `Diagnostics.IssueSenderRegistrationCode` with `{ RegistrationID }` (authorization `Diagnostics: Manage Intake`). It returns a one-time code, valid for 24 hours; only its hash is stored.
3. The sender enrols with that code (`POST /enroll`, which proves possession of its new key) and the row becomes `Active`. A code works once.

A save that this package does not make itself needs `Diagnostics: Manage Intake`. It cannot create a row other than a `Pending` row with no key, code or timestamps, cannot change `InstallID`, `Status`, `KeyAlgorithm`, `KeyID`, `PublicKeyBase64`, `RegistrationCodeHash`, `RegistrationCodeExpiresAt`, `EnrolledAt`, `RevokedAt` or `LastSeenAt`, and cannot be a `ReplayOnly` save. A delete also needs Manage Intake.

Each bundle request then carries `Authorization: MJDiag-Ed25519 keyId,installId,aud,ts,nonce,sig`. The collector verifies:

- the registered key;
- `|now − ts| ≤ 300 s`;
- `aud` = `ApiRoute('/diagnostics/intake/v1', { absolute: true })` without the trailing slash;
- the signature over `mjdiag-http-v1:METHOD:path:aud:installId:ts:nonce:bodySha256` (`path` is the path of the public URL, `MJAPI_PUBLIC_URL`'s path included, followed by the route subpath, without the query);
- a fresh nonce.

Each failure answers 401 and counts toward the per-IP failure budget. While an IP is over its budget, every request from it gets 429 before any sender lookup, signed requests included. Install IDs with no registration are remembered for 60 seconds. The rest of the flow:

- The intake record is bound to the authenticated sender. Another sender gets 403, and the envelope must be signed by the same key.
- `MaxBundlesPerDay` counts the sender's `Received` bundle rows from the last 24 hours plus its open intakes.
- Run `Diagnostics.RevokeSender` with `{ RegistrationID }` to block a sender; it also clears an outstanding code. `Diagnostics.ReactivateSender` sets a `Revoked` row with an enrolled key back to `Active`. Issue a new code to rotate a key.
- The nonce replay cache, the download-token nonce store, the registration-code lock and the daily-quota reservation are per process. Run more than one collector instance only with a shared replay store, and expect the code and quota checks to hold within one process only.

`DiagnosticIntakeService.Instance.RegisterSenderPublicKey(installId, keyId, publicKeyBase64)` registers a sender in memory (no row), for a self-hosted hub or tests.

See the [Diagnostic Bundles Guide](../../../guides/DIAGNOSTIC_BUNDLES_GUIDE.md) §4 for full architecture, §6 for known limits, configuration (`Diagnostics.*` and `Diagnostics.Intake.*`), `MJStorage` setup, and malware scanning configuration.
