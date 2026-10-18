# Idea 2: Encryption Key Lifecycle & Envelope Governance

**Week of 2026-09-19 · Creative exploration · Framework-level (core, not a vertical app)**

> **Status (Implemented in PR #4612):** Self-describing versioned `$ENC$` envelopes, version-aware key lookup across providers, and `EncryptedStoreRegistration` (`RegisterEncryptedStore`) in `EncryptionEngine` + `RotateEncryptionKeyAction` are implemented and verified end-to-end against SQL Server. Expensive DB-wide arbitrary table scans for unregistered `$ENC$` strings were stripped out.

## The problem, framed for the world, not the codebase

When an organization rotates an encryption key, every value encrypted under that key must either be
re-encrypted within the rotation transaction or remain decryptable via historical key version lookup.
Previously (**#4580**):
1. `RotateEncryptionKeyAction` only discovered entity fields with `Encrypt = 1` in `MJ: Entity Fields`.
   Any out-of-band encrypted store calling `EncryptionEngine.Instance.Encrypt()` directly was
   invisible to rotation.
2. The ciphertext envelope (`$ENC$<keyId>$<algorithm>$<iv>$<ciphertext>[$<authTag>]`) did not
   embed the `keyVersion` that produced it, even though `KeyConfiguration.keyVersion` existed in
   memory. Once a key rotated to version 2, any unrotated v1 ciphertext attempted to decrypt with
   v2 key material and failed permanently.

## Implemented Architecture (PR #4612)

### 1. Self-Describing Versioned Ciphertext Envelopes (`@memberjunction/encryption`)

- `EncryptionEngine.Encrypt` and `EncryptWithLookup` now emit the key version inside the key
  identifier segment:
  ```
  $ENC$<keyId>:<keyVersion>$<algorithm>$<iv>$<ciphertext>[$<authTag>]
  ```
- `ParseEncryptedValue` and `IsEncrypted` support all three formats seamlessly:
  1. **Compact versioned (default emitted):** `$ENC$<keyId>:<keyVersion>$<algorithm>$<iv>$<ciphertext>[$<authTag>]`
  2. **Legacy unversioned (v1 backward-compatible):** `$ENC$<keyId>$<algorithm>$<iv>$<ciphertext>[$<authTag>]`
  3. **Explicit `$v<version>$` segment:** `$ENC$<keyId>$v<keyVersion>$<algorithm>$<iv>$<ciphertext>[$<authTag>]`
- `Decrypt` extracts `parsed.keyVersion` (falling back to `config.keyVersion` for legacy unversioned
  envelopes) and passes it to `getKeyMaterial(config, effectiveVersion)`.
- `EnvVarKeySource` and `ConfigFileKeySource` resolve version-suffixed keys (`<LOOKUP>_V<N>` /
  `<lookup>_v<N>`) with graceful fallback to the base lookup name when `version === '1'` or when the
  key was rotated by pointing `KeyLookupValue` directly at a versioned secret name.

### 2. Out-of-Band Encrypted Store Registry (`EncryptedStoreRegistration`)

- Added `RegisterEncryptedStore`, `UnregisterEncryptedStore`, `GetRegisteredEncryptedStores`, and
  `ClearRegisteredEncryptedStores` to `EncryptionEngine`:
  ```typescript
  EncryptionEngine.Instance.RegisterEncryptedStore({
      Name: 'AuditArchivePayloads',
      KeyID: encryptionKeyId,
      Description: 'Encrypted JSON snapshots in custom archive storage',
      RotateKey: async (params, contextUser) => {
          // Re-encrypt records using params.DecryptOldValue and params.EncryptNewValue
          return rotatedCount;
      }
  });
  ```
- `RotateEncryptionKeyAction` enumerates `GetRegisteredEncryptedStores(params. EncryptionKeyID)`
  inside the same rotation workflow after declared `EntityField` columns, invoking `RotateKey` when
  provided and logging an explicit retention warning if a store is registered as advisory-only (no
  `RotateKey` callback).

## Stripped-Out / Descoped Items (and Why)

1. **DB-Wide Arbitrary Column Scans for Unregistered `$ENC$` Values (Stripped Out):**
   Scanning every `NVARCHAR`/`VARCHAR` column across every table in a production database to hunt
   for unregistered `$ENC$` prefixes causes full table scans and severe lock/IO contention. With
   self-describing versioned envelopes (`$ENC$<keyId>:<keyVersion>$...`), even an unregistered
   hand-encrypted value remains decryptable after key rotation as long as the historical key version
   remains in the key source, and out-of-band stores that want active re-encryption during rotation
   register explicitly via `RegisterEncryptedStore`.

## Mockup

See [`mockups/encryption-health-dashboard.html`](./mockups/encryption-health-dashboard.html) and
[`screenshots/idea-2-encryption-health-dashboard.png`](./screenshots/idea-2-encryption-health-dashboard.png).

## Sources

- MemberJunction repo issue **#4580** ("Key rotation skips hand-encrypted columns, and the
  ciphertext envelope records no key version to detect it").
- `packages/Encryption/src/interfaces.ts`, `packages/Encryption/src/EncryptionEngine.ts`, and
  `packages/Encryption/src/actions/RotateEncryptionKeyAction.ts`.
