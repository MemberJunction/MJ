# @memberjunction/diagnostics

Isomorphic, zero-external-dependency foundation for **MemberJunction Diagnostic Bundles** (`.mjdiag` and `.mjdiag.enc`). Works identically in Node.js (24+) and modern browsers via WebCrypto and `CompressionStream` / `DecompressionStream`.

## Overview

`@memberjunction/diagnostics` is an L0 package depending only on `@memberjunction/global`. It provides:

1. **Bounded Ring Buffers (`BoundedRingBuffer<T>`, `TraceCorrelationBuffer<T>`)** — fixed-capacity O(1) ring buffers with byte-budget eviction (`maxItems`, `maxBytes`) and an auxiliary `Map<traceId, RingBuffer<T>>` index for sub-millisecond trace slicing.
2. **Two-Stage Credential & Literal Scrubber (`ScrubString`, `ScrubValue`, `ScrubHeaders`, `NormalizeSqlLiterals`, `ScrubBundleData`)**:
   - **Stage 1 (`Always` — Non-Disableable)**: Strips PEM private keys, JWTs (`eyJ...`), `Bearer` and `Basic` credentials, cloud/AI API keys (`sk-`, `AKIA`, `ghp_`, `xoxb-`), URI credentials (`scheme://[REDACTED_CREDENTIALS]@host`), connection-string and URL query secrets, and the values of sensitive names in `name=value`, JSON `"name":"value"` (plain or escaped) and `name: value` pairs (header lines, YAML, log text). `IsSensitiveKeyName` matches a name by substring after it removes case, `-`, `_`, `.` and spaces (`password`, `secret`, `token`, `apikey`, `credential`, `signature`, `connectionstring`, ...), with an allow-list for ID, type, version, policy and token-usage names. `IsSensitiveHeaderName` (used by `ScrubHeaders`) also matches `*-token`, `*-key`, `*-secret`, `*-signature` and `*-credential(s)` headers. The full rule list is in the guide.
   - **Stage 2 (`Standard` vs `FullRaw`)**: `NormalizeSqlLiterals` replaces SQL string, hex and numeric literals with `?` and cuts SQL longer than 64 KB (`MAX_NORMALIZED_SQL_LENGTH`) with a `/* [SQL_TRUNCATED: N more characters] */` marker. `NormalizePlanLiterals` normalizes Showplan XML literal attributes, and `NormalizeSqlLiteralsInText` normalizes SQL and filter literals in log text. `ScrubBundleData` also normalizes filter-like telemetry params (`ExtraFilter`, `OrderBy`, `Filter(s)`, `OrderBys`, `SQL`, `WhereClause`; `AfterKey(s)` and `UserSearchString` become `?`). `FullRaw` keeps exact literals.
3. **`.mjdiag` ZIP Archive Writer & Strict Structural Verifier (`BuildMjdiagArchive`, `VerifyBundleArchive`, `ParseBundleDataFromArchive`)**:
   - Zero-dependency ZIP builder/reader with raw DEFLATE compression (`CompressionStream('deflate-raw')`), CRC-32 validation, and SHA-256 per-file digests recorded in `manifest.json`.
   - `VerifyBundleArchive()` enforces magic bytes (`PK\x03\x04`), entry count cap (`<= 128`), path traversal & symlink checks, canonical entry allowlist, local file headers that match the central directory (`CORRUPT_ZIP_STRUCTURE`), zip-bomb compression ratio limits (`<= 25:1` per entry, `<= 100 MB` total uncompressed), `manifest.json` schema version `1.0` with well-formed descriptors, no entry missing from the manifest (`UNLISTED_ENTRY`), and per-entry SHA-256 digest matching.
4. **Hybrid Envelope Cryptography (`EncryptDiagnosticBundle`, `DecryptDiagnosticBundle`, `InspectEncryptedEnvelopeHeader`, `GenerateDiagnosticKeyPair`, `SignRecipientPublicKey`, `VerifyRecipientPublicKeySignature`)**:
   - Ephemeral **X25519** key agreement + **HKDF-SHA256** (`info = "mj-diag-bundle-v1"`) + **AES-256-GCM** with the unencrypted header bound as Additional Authenticated Data (AAD).
   - **Ed25519** recipient public-key pinning and optional sender authentication signatures.
   - `DecryptDiagnosticBundle` refuses a malformed header (`INVALID_HEADER_FIELDS`). When the header carries `manifestSha256`, it must equal the SHA-256 hex of the whole decrypted archive (`MANIFEST_SHA256_MISMATCH`).
5. **Automated Findings Engine (`AnalyzeDiagnosticBundleData`)** — deterministic rules detecting N+1 query loops, slow SQL queries (`> 1000ms`), Waterfall gaps (`> 500ms`), GraphQL error spikes, failed entity saves, memory pressure (`> 85%` heap), database pool exhaustion, and clock skew (`> 2000ms`).
6. **Perfetto & OpenTelemetry Exporters (`ExportToPerfettoTrace`, `ExportToOtlpJson`)** — converts `.mjdiag` spans into Chrome DevTools / `ui.perfetto.dev` TraceEvents or OTLP/JSON (`ExportTraceServiceRequest`) for Jaeger, Tempo, Honeycomb, and Datadog.
7. **Contributor Plugin Contract (`BaseDiagnosticContributor`, `DiagnosticContributorRegistry`)** — extensible via `@RegisterClass(BaseDiagnosticContributor, '...')` so vertical packages (AI Agents, Actions, Communication, etc.) can contribute custom sections to diagnostic bundles without circular dependencies. `RegisterContributor` throws when a `SectionKey` is not 1–64 characters from `A-Z a-z 0-9 . _ -`, or when another contributor already holds the key. `BuildMjdiagArchive` skips contrib sections with an invalid key and notes the count in `README.txt`.

## Quick Usage

### Creating & Verifying a `.mjdiag` Bundle

```typescript
import {
  BuildMjdiagArchive,
  VerifyBundleArchive,
  AnalyzeDiagnosticBundleData,
  ScrubBundleData,
  ComputeSha256Hex,
  DiagnosticBundleData
} from '@memberjunction/diagnostics';

const scrubbed: DiagnosticBundleData = ScrubBundleData(rawBundleData, {
  scrubberProfile: 'Standard'
});
scrubbed.findings = AnalyzeDiagnosticBundleData(scrubbed);

const zipBytes: Uint8Array = await BuildMjdiagArchive(scrubbed);
const verification = await VerifyBundleArchive(zipBytes);
if (!verification.valid) {
  throw new Error(`Invalid bundle (${verification.reasonCode}): ${verification.reason}`);
}
```

### Encrypting & Decrypting (`.mjdiag.enc`)

```typescript
import {
  GenerateDiagnosticKeyPair,
  EncryptDiagnosticBundle,
  DecryptDiagnosticBundle,
  InspectEncryptedEnvelopeHeader
} from '@memberjunction/diagnostics';

const recipientKeyPair = await GenerateDiagnosticKeyPair('X25519', 'mjc-2026-04');

const encryptedBytes = await EncryptDiagnosticBundle(zipBytes, {
  recipientKeyId: recipientKeyPair.keyId,
  recipientPublicKeyBase64: recipientKeyPair.publicKeyBase64,
  senderEnvironmentId: 'env-prod-01',
  manifestSha256: await ComputeSha256Hex(zipBytes) // SHA-256 of the whole .mjdiag archive
});

// Pre-Verify header in <1ms before decrypting:
const headerCheck = InspectEncryptedEnvelopeHeader(encryptedBytes, ['mjc-2026-04']);

// Decrypt and verify inner archive:
const decrypted = await DecryptDiagnosticBundle(encryptedBytes, {
  PrivateKeysByKeyId: { [recipientKeyPair.keyId]: recipientKeyPair.privateKeyBase64 }
});
```

## Documentation

For complete architecture, deployment, security posture, and MJAPI collector intake setup (`MJStorage` Quarantine-then-Promote and malware scanning), see the **[Diagnostic Bundles Guide](../../../guides/DIAGNOSTIC_BUNDLES_GUIDE.md)**.
