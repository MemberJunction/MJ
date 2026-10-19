---
"@memberjunction/encryption": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/server": patch
---

A value encrypted with a key this install doesn't have now logs one warning per key instead of an error on every load.

An app can ship values already encrypted with its own key, an MJ Encryption Key whose material only some installs are given (say, an environment variable). On an install without that key, every load of every such row logged `Failed to decrypt field …`, at MJAPI startup too, because the credential engine loads all credentials.

- **`EncryptionKeyUnavailableError`** (code `ENCRYPTION_KEY_UNAVAILABLE`). `EncryptionEngine` throws it when reading a key fails and the key's source reports it doesn't hold the key (`KeyExists` is false), for example an unset environment variable. Any other failure is thrown as before. The check runs only after a failed read, so a remote key source costs nothing extra on the normal path.
- **`IsEncryptionKeyUnavailable(err)`** checks the code rather than the class, so it still works when two copies of the package are loaded. **`ReportEncryptionKeyUnavailable(err)`** logs one warning per key per process, naming where the key is looked for.
- **Decrypt on load** (`GenericDatabaseProvider`) and **API decryption** (`ResolverBase`) report an unavailable key once and leave the value as it was: still encrypted on load, the encrypted sentinel in an API response. Other decrypt failures are still logged as errors.
