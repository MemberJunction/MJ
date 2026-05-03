---
"@memberjunction/ai-agents": patch
---

Add `DelegationOnly` flag to `AIAgent` so a parent agent can opt out of the post-sub-agent re-prompt iteration. When set, `BaseAgent` terminates the parent's run immediately after a successful sub-agent invocation, skipping the otherwise-required second LLM call where the parent re-reads the sub-agent's result. Saves the latency + cost of that wasted iteration on agents whose entire job is to dispatch to one sub-agent and pass the result back unchanged. Default `0`/`false` preserves existing two-iteration behaviour for every existing agent; opt in per-agent. Companion migration adds the column on SQL Server and PostgreSQL.
