# @memberjunction/diagnostics-server

Server-side diagnostic capture, session orchestration, bundle assembly, outbound collector transport, and standard MJAPI intake endpoint for MemberJunction.

## Features

- **`DiagnosticSessionManager`**: Singleton coordinator managing active diagnostic sessions (`Record` and `Watch` modes), `AsyncLocalStorage` request/session context propagation (`RunWithContext`, `RunDetached`, `WithoutDiagnosticCapture`), `RegisterLoggerSink` + deduplicated console tap, SQL observer (`ISqlObserver`), chunk buffering/draining (`MJ: Diagnostic Session Chunks`), health snapshots, `.mjdiag` bundle assembly, outbound encrypted MJC submission, and single-use HMAC-SHA256 download tokens.
- **`DiagnosticsServerMiddleware`**: `BaseServerMiddleware` subclass wiring:
  - **Stage 1 (Pre-Auth)**: Attaches request IDs, propagates `x-mj-diag-session` / `x-mj-diag-trace` headers, and wraps requests in `AsyncLocalStorage`.
  - **Stage 2 (Post-Auth)**: Enforces strict `CompanyID` tenant isolation and `TargetUserID` session matching.
  - **Stage 3 (Apollo Plugin)**: Captures GraphQL operation spans, variables (structural or scrubbed), and errors.
  - **REST Routes**: Single-use bundle download (`/diagnostics/bundles/:bundleId/download`) and standard MJAPI intake (`/diagnostics/intake/v1/*`).
- **`DiagnosticIntakeService` & `IDiagnosticMalwareScanner`**:
  - Standard MJAPI receiver endpoint (`GET /diagnostics/intake/v1/public-key`, `POST /enroll`, `POST /bundles`, `PUT /bundles/:referenceId/payload`, `POST /bundles/:referenceId/complete`). The bundle routes require an `MJDiag-Ed25519` signed request from a registered sender.
  - Pre-storage `MJDB` v1 envelope header verification, X25519 + HKDF-SHA256 + AES-256-GCM AAD decryption, and `VerifyBundleArchive` structural verification.
  - Quarantine-then-Promote `MJStorage` integration with pluggable malware scanning:
    - `CloudObjectTagMalwareScanner` (AWS GuardDuty S3 Malware Protection, Azure Defender for Storage, GCP Cloud Storage)
    - `ClamAvWebhookMalwareScanner` (HTTP scanning microservice / ClamAV REST bridge)
    - `StructuralOnlyMalwareScanner` (cryptographic + ZIP/JSON structural verification)
- **Remote Operations**:
  - `StartDiagnosticSessionServerOperation`
  - `StopDiagnosticSessionServerOperation`
  - `CreateDiagnosticBundleServerOperation`
  - `SendDiagnosticBundleToMJCServerOperation`
  - `IssueDiagnosticBundleDownloadUrlServerOperation`
- **`DiagnosticRetentionScheduledJobDriver`**: Scheduled job driver (`BaseScheduledJob`) that purges expired `MJ: Diagnostic Bundles` (and their underlying `MJStorage` objects) and expired `MJ: Diagnostic Sessions`.

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

`Diagnostics.SendBundle` sends only to `Diagnostics.External.CollectorUrl`, and only after the installation is enrolled. Enrol once with the `Diagnostics.EnrolSender` remote operation (or `EnrolSender()` from this package) and a registration code from the collector. Each collector request is signed with the installation's Ed25519 key (`MJDiag-Ed25519` Authorization header), the collector key is checked against the signing key pinned at enrolment, and the upload must stay on the collector's origin. With no collector URL, the bundle goes to this server's own intake only when `Diagnostics.Intake.Enabled` is on; otherwise the send fails with a clear message.

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
3. The sender enrols with that code (`POST /enroll`, which proves possession of its new key) and the row becomes `Active`.

Each bundle request then carries `Authorization: MJDiag-Ed25519 keyId,installId,aud,ts,nonce,sig`. The collector verifies:

- the registered key;
- `|now − ts| ≤ 300 s`;
- `aud` = `ApiRoute('/diagnostics/intake/v1', { absolute: true })` without the trailing slash;
- the signature over `mjdiag-http-v1:METHOD:path:aud:installId:ts:nonce:bodySha256` (`path` is the full request path, base path included, without the query);
- a fresh nonce.

Each failure answers 401. The rest of the flow:

- The intake record is bound to the authenticated sender. Another sender gets 403, and the envelope must be signed by the same key.
- `MaxBundlesPerDay` counts the sender's `Received` bundle rows from the last 24 hours.
- Set `Status = 'Revoked'` to block a sender, or issue a new code to rotate its key.
- The nonce replay cache is per process. Run more than one collector instance only with a shared replay store.

`DiagnosticIntakeService.Instance.RegisterSenderPublicKey(installId, keyId, publicKeyBase64)` registers a sender in memory (no row), for a self-hosted hub or tests.

See the [Diagnostic Bundles Guide](../../../guides/DIAGNOSTIC_BUNDLES_GUIDE.md) §4 for full architecture, configuration (`Diagnostics.*` and `Diagnostics.Intake.*`), `MJStorage` setup, and malware scanning configuration.
