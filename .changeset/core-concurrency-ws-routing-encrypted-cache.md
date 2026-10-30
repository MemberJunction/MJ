---
"@memberjunction/core": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/server": minor
"@memberjunction/integration-test-suite": patch
---

- **Optimistic concurrency & non-overlapping field merge (`ResolverBase.TestAndSetClientOldValuesToDBValues`)**: Reject conflicting overlapping concurrent field edits where `ClientNewValue !== DBValue` with `CONCURRENT_MODIFICATION_CONFLICT` after logging `SAVE_INCONSISTENCY` to `MJ: Error Logs`, allow idempotent concurrent writes to the same value, and preserve concurrent database modifications on non-overlapping fields instead of overwriting them with stale client values. The conflict comparison ignores representation drift: JSON strings are compared by canonical content, and `datetime` / `smalldatetime` values are compared at the column's resolution, so a cosmetic rewrite or a sub-tick timestamp difference is not a conflict.
- **Multi-user WebSocket entity message routing (`ResolverBase.ListenForEntityMessages`)**: Track active sessions dynamically per entity type so status updates fan out to every active matching session rather than closing over only the first caller's `userPayload`/`pubSub`, while still emitting CloudEvents once per event.
- **Ciphertext-preserving cache & zero decrypt-then-re-encrypt API reads**: Persist pre-decryption ciphertext in `LocalCacheManager` / Redis across `RunView`, `RunViews`, `RunViewsWithCacheCheck`, and `GetDatasetByName`, materialize decrypted rows on in-process cache hits, guard against plaintext `BaseEntity` `save` cache writes, skip `Decrypt()` + `Encrypt()` for `AllowDecryptInAPI === false` fields on GraphQL reads (`PreserveRestrictedApiCiphertext`), and apply `ArrayFilterEncryptedFieldsForAPI` on `RunViewResolver.RunViewsWithCacheCheck` stale and differential responses.
