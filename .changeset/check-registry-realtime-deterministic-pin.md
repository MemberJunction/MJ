---
"@memberjunction/integration-test-suite": patch
---

The bundle-count guard in `check-registry.test.ts` pins `realtime-deterministic` at 12 checks. #5042 added RD10–RD12 without raising the pin from 9, which failed Unit Tests on `next`.
