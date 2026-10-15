---
"@memberjunction/integration-test-suite": patch
---

`check-registry.test.ts` pins 116 bundles, the count after #5590 (IT114, `ai-vendor-effort`) and #5647 (IT122, `agent-prompt-cancellation`) each added one. Both raised the pin from 114 to 115 on their own branches, so `next` failed "expected 115 but got 116" once both merged.
