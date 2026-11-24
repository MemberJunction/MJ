---
"@memberjunction/cli": patch
"@memberjunction/ai-agent-harness": patch
---

Complete `@memberjunction/cli` documentation across all 32 command domains (129 commands) with an automated Vitest CLI docs coverage guard, restore full domain discovery in `mj usage` / `mj <domain> usage`, add tier-2 `usage` commands for all remaining domains, and add memoized per-vendor CLI binary executability probing (`<binary> --version` -> `Binary Missing`) to `HarnessAccountPoolService` and `mj harness account list`.
