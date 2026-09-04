---
"@memberjunction/integration-engine": patch
---

The content-hash prefetch now bypasses the RunView result cache. Every prefetch queries that batch's own keys, so its cache fingerprint is unique and the cached result can never be hit again — with a result cache active, each batch deposited one dead entry and a long first sync grew the process by O(records processed). Measured in production: a full-history drain of ~500k records exhausted a default node heap and took the host down. The match lookups in the same path already bypass for correctness; the prefetch now bypasses for survival.
