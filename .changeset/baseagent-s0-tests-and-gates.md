---
"@memberjunction/standards": patch
"@memberjunction/ai-agents": patch
"@memberjunction/core-entities-server": patch
---

Add permanent `file-line-limit` check (`<= 1,000` lines, with per-file ratchet caps for grandfathered files) to `@memberjunction/standards`, adopt it on `packages/AI/Agents/src`, and land the Stage 1 behavior-pinning test suites (4-agent-type integration, prompt byte-for-byte snapshot, security & `#6852` instance/RLS verification, and deterministic performance baseline) alongside the locked architecture study (`plans/baseagent-refactor-study.md`).
