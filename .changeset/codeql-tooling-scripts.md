---
"@memberjunction/ai-agents": patch
"@memberjunction/actions": patch
---

The three live-database harness scripts (`memory-write-smoke.ts`, `contextcrush-smoke.ts` in ai-agents; `entity-action-workflow-integration.ts` in actions) decide TLS for Azure SQL with an anchored host check (`endsWith`) instead of a substring match. Not part of the published output; recorded for the release notes.
