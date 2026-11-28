---
"@memberjunction/ai-agents": patch
---

Extract step-execution loop, step dispatch, next-step validation, run setup (Phases 1–3), checkpoint restoration, teardown, and run finalization into pluggable `BaseAgentStepExecutionHelper` (`SeamKey: 'steps'`) and `BaseAgentRunSetupHelper` (`SeamKey: 'setup'`), shrink `packages/AI/Agents/src/base-agent.ts` below 500 lines, and permanently remove `base-agent.ts` from `.mj-standards.json`'s `file-line-limit` allowlist (slice s11).
