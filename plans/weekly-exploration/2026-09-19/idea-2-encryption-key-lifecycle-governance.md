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
- `Decrypt` reads `parsed.keyVersion`. An envelope at the key's current version (or a legacy
  unversioned one) uses the current key material; an envelope at any other version calls the new
  `EncryptionKeySourceBase.GetHistoricalKey(currentLookupValue, keyVersion)`.
- `EnvVarKeySource` and `ConfigFileKeySource` override `GetHistoricalKey` to find an older version
  from the current lookup value's suffix (`<LOOKUP>_V3` → `<LOOKUP>_V2`, or `<LOOKUP>` for
  version 1). Their current-version lookup is unchanged except that a lookup value already naming
  its version (`<LOOKUP>_V2` at version 2, as rotation leaves it) is used as-is.
- `RotateEncryptionKeyAction` validates the new lookup value at the version it rotates into before
  touching any data. Legacy unversioned values that rotation does not re-encrypt are NOT covered:
  they have no version to look up.

### 2. Out-of-Band Encrypted Store Registry (`EncryptedStoreRegistration`)

- Added `RegisterEncryptedStore`, `UnregisterEncryptedStore`, `GetRegisteredEncryptedStores`, and
  `ClearRegisteredEncryptedStores` to `EncryptionEngine`:
  ```typescript
  EncryptionEngine.Instance.RegisterEncryptedStore({
      storeName: 'AuditArchivePayloads',
      encryptionKeyId,
      rotate: async (context) => {
          // For each stored value: value = await context.reEncrypt(value);
          return rotatedCount;
      }
  });
  ```
- `RotateEncryptionKeyAction` enumerates `GetRegisteredEncryptedStores(encryptionKeyId)`
  inside the same rotation workflow after declared `EntityField` columns, invoking `rotate` when
  provided and reporting a store registered without one in `RotateKeyResult.skippedStores`.

## Stripped-Out / Descoped Items (and Why)

1. **DB-Wide Arbitrary Column Scans for Unregistered `$ENC$` Values (Stripped Out):**
   Scanning every `NVARCHAR`/`VARCHAR` column across every table in a production database to hunt
   for unregistered `$ENC$` prefixes causes full table scans and severe lock/IO contention. With
   self-describing versioned envelopes (`$ENC$<keyId>:<keyVersion>$...`), an unregistered
   hand-encrypted value written after this change remains decryptable after key rotation as long as
   the historical key version remains in the key source, and out-of-band stores that want active re-encryption during rotation
   register explicitly via `RegisterEncryptedStore`.

## Mockup

See [`mockups/encryption-health-dashboard.html`](./mockups/encryption-health-dashboard.html) and
[`screenshots/idea-2-encryption-health-dashboard.png`](./screenshots/idea-2-encryption-health-dashboard.png).

## Sources

- MemberJunction repo issue **#4580** ("Key rotation skips hand-encrypted columns, and the
  ciphertext envelope records no key version to detect it").
- `packages/Encryption/src/interfaces.ts`, `packages/Encryption/src/EncryptionEngine.ts`, and
  `packages/Encryption/src/actions/RotateEncryptionKeyAction.ts`.
