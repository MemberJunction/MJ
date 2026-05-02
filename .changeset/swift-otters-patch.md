---
"@memberjunction/core": minor
---

Fix RLS filter target for Unified Permissions Phase 2: rewrite the two `RowLevelSecurityFilter` rows seeded by V202604241700 to reference `__mj.vwAIAgentRuns` instead of the unschema-qualified base table `AIAgentRun`. The original values failed at runtime for UI-role users reading `MJ: AI Agent Run Steps` and `MJ: AI Prompt Runs` because the bare table name didn't resolve and, even schema-qualified, the role lacks SELECT on the base table — only the view.
