---
"@memberjunction/core": patch
"@memberjunction/credentials": patch
---

A peer server's cache event no longer leaves an engine holding encrypted field values. Server caches store encrypted fields as ciphertext and only the cache-read path decrypts them, but `BaseEngine` applied a peer's `set` or `row_delta` rows without decrypting whenever they carried a newer version than the engine held. With two or more servers on one Redis, `CredentialEngine` then held `Values` as `$ENC$…` and `GetCredential` returned empty values as a success, until that server's next save of the credential. An engine now reloads instead of applying a payload that carries ciphertext on an encrypted field; the reload reads the same slot and decrypts it. In a three-process reproduction on MJ 6.2.1, 20 of 20 targeted trials, 3 of 20 runs of a two-saves-then-read pattern and 8 of 20 key rotations left a server holding ciphertext; with the fix, none did. `CredentialEngine` also stops reading unparseable `Values` as `{}`: it throws `CredentialValuesUnreadableError` (with `StillEncrypted` set for ciphertext), and its message no longer quotes the start of the stored value.
