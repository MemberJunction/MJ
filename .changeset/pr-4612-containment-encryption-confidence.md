---
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
"@memberjunction/encryption": patch
"@memberjunction/ng-ui-components": patch
---

Add byte-based agent payload guardrails (`PayloadSizeGuard`), self-describing versioned `$ENC$<keyId>:<keyVersion>$...` encryption envelopes with out-of-band store registration (`RegisterEncryptedStore`), and the shared `AIConfidenceSignal` contract with `<mj-ai-confidence-badge>` and `<mj-ai-explanation-panel>` L1 Angular components.

Encrypted values written by this release carry their key version in the envelope, and earlier releases cannot read them: do not roll back past this release, or run older and newer MJAPI instances against one database, once it has written encrypted values. Key rotation now validates the new lookup value at the version it rotates into (name it `<base>_V<n>`), and a value left at an older version decrypts from that version's sibling key (`<base>_V<n-1>`, or `<base>` for version 1) through the new `EncryptionKeySourceBase.GetHistoricalKey`.
