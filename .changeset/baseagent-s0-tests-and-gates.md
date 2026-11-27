---
"@memberjunction/standards": patch
"@memberjunction/ai-agents": patch
"@memberjunction/core-entities-server": patch
---

Add permanent `file-line-limit` check (`<= 1,000` lines) to `@memberjunction/standards`, adopt it on `packages/AI/Agents/src` with the current 20-file allowlist, add the temporary BaseAgent refactor freeze guard + locked architecture study (`plans/baseagent-refactor-study.md`), and land the Stage 1 behavior-pinning test suites (4-agent-type integration, prompt byte-for-byte snapshot, security & `#6852` instance/RLS verification, and deterministic performance baseline) against untouched `BaseAgent`.
