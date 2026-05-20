---
"@memberjunction/core": patch
"@memberjunction/ai-vectors": patch
"@memberjunction/ai-vector-sync": patch
---

Fix keyset (AfterKey) pagination infinite loop in vector sync. `GenerateRunViewFingerprint` omitted `AfterKey`, so sequential keyset pages produced identical fingerprints and the dedup/linger layer returned page N's result for page N+1, freezing the seek cursor (observed on multi-page entities like a 2k-row Members table). The fingerprint now includes `AfterKey` (appended only when present, so non-keyset fingerprints are unchanged), fixing all keyset callers. The vectorizer's page reads now also set `BypassCache` since full-table sweeps read each page once, and `EntityVectorSyncer` halts with a clear error if the cursor ever fails to advance.
