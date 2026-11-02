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
  - Standard MJAPI receiver endpoint (`/diagnostics/intake/v1/initiate`, `/diagnostics/intake/v1/upload/:uploadId`, `/diagnostics/intake/v1/complete/:uploadId`).
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

See the [Diagnostic Bundles Guide](../../../guides/DIAGNOSTIC_BUNDLES_GUIDE.md) for full architecture, configuration (`Diagnostics.*` and `Diagnostics.Intake.*`), `MJStorage` setup, and malware scanning configuration.
