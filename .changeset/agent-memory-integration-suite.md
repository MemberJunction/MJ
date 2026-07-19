---
"@memberjunction/server": patch
---

Add `agent-memory-tests.ts` — a client-first, live-model integration suite covering the AI agent MEMORY lifecycle end-to-end over the GraphQL wire (`GraphQLAIClient` → live MJAPI).

The specific memories an LLM forms are nondeterministic, so every assertion is a deterministic predicate at the PROCESS level, isolated by a per-run marker so pre-existing `MJ: AI Agent Notes` rows can never satisfy it:

- **Formation** — memory-triggering convos produce notes with the in-flight write invariants (`Status='Provisional'`, `AuthorType='Agent'`, agent-scoped).
- **Hardening** — running the Memory Manager transitions those specific note IDs to `Active` with the 7-day `ExpiresAt` TTL cleared.
- **Injection** — a later agent run references those same note IDs in its run-step `memoryAttribution`, scoped to that run's window so the Memory Manager's own hardening steps cannot false-positive it.

Self-cleaning (every marker note is deleted in `finally`) and gated behind `RUN_AGENT_TESTS=1`; registered in the `run-all.ts` Live Model tier.
