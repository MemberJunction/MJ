---
"@memberjunction/external-change-detection": patch
---

Fix double-encryption of fields with Encrypt=1 during External Change Detection replay. buildEntityFromRow now decrypts $ENC$ values before loading into the replay entity so Save() re-encrypts plaintext instead of wrapping already-encrypted ciphertext. Adds a new @memberjunction/encryption dependency (was already transitively available). Fixes #2367.
