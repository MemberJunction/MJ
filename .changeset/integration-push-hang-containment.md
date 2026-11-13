---
"@memberjunction/testing-integration": patch
"@memberjunction/integration-test-suite": patch
"@memberjunction/metadata-sync": patch
---

Integration suite: every `metadata-sync-push` check bounds its push at 120 s, and the driver rolls back a transaction a check leaves open on the shared provider (failing that check with "left a transaction open"), so one hung check no longer stalls the rest of the run (#5389).
