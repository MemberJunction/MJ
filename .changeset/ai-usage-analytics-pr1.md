---
"@memberjunction/ai-agents": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/integration-test-suite": patch
---

**AI Usage Analytics PR1: Foundation, Guides, and Guardrails**

- **Documentation & Doctrine**: Added `guides/AI_USAGE_AND_COST_ANALYTICS_GUIDE.md` establishing the nine doctrine rules for AI usage and cost reporting, auditing all 18 existing consumers, and cross-linking regression guard tests. Registered in `guides/README.md`.
- **Sub-agent CompanyID propagation**: `BaseAgent.ExecuteSubAgent` now propagates `companyId: params.companyId` to sub-agent `RunAgent` calls, ensuring consistent memory-scoping across agent hierarchies.
- **Batch pricing seam**: Introduced `protected ResolveProcessingType(): 'Realtime' | 'Batch'` on `MJAIPromptRunEntityServer` as an extensible hook for batch prompt run pricing.
- **Guardrail zero-limit enforcement**: Fixed `hasExceededAgentRunGuardrails` in `BaseAgent` to check `!= null` for `MaxCostPerRun` and `MaxTokensPerRun`, preventing falsy 0 limits or costs from short-circuiting guardrail checks.
- **Cost basis invariants check**: Added `ai-cost.AC8` to `AiCostChecks` in `@memberjunction/integration-test-suite` asserting parallel parent zero-own-cost, non-negative agent run costs, reporting leaf child runs, and probing sub-cent precision rows.
