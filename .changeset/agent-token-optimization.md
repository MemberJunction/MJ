---
"@memberjunction/context-crush": minor
"@memberjunction/ai-agents": minor
---

Add agent token-optimization primitives and framework wiring (Headroom-inspired).

New package `@memberjunction/context-crush` — dependency-light, framework-agnostic token-optimization primitives:
- `CrushJSON` / `DescribeCrush` — deterministic, byte-stable structural JSON compression (array-of-objects → columns/rows, null elision, string interning, budget guard) with a reversible legend.
- `PartitionStablePrefix` — splits a conversation into a cache-stable prefix and a volatile tail.
- `CrushCode` (subpath `@memberjunction/context-crush/code`) — AST-aware SQL/TypeScript reduction that preserves signatures and collapses non-focal bodies.

`@memberjunction/ai-agents` wiring:
- Action-result summaries structurally compress large inline JSON values — whether an output param is a raw object/array **or a JSON string** (many actions `JSON.stringify` their payload, e.g. `run-adhoc-query`'s `Results`); default on, opt out per agent via `crushActionResults: false`.
- `pruneAndCompactExpiredMessages` now confines pruning/compaction to the volatile tail, preserving the provider KV-cache prefix; overflow recovery still reaches the prefix when required.
- Opt-in AST reduction of large *code-string* action results, enabled per agent type via the `crushCodeLang` prompt param (`'sql'` | `'typescript'`); not wired to any agent by default.
- `MemoryManagerAgent` now mines failed runs for corrective `Issue`/`Context` notes (never `Constraint`), tagged `Ephemeral` so they decay unless reinforced, with full run-step observability. The selector keys on the run's own failure signals — `Status IN ('Failed','Cancelled')` **or** `Success = 0` (subsuming the safety-net and context-recovery failures the engine records as `Status='Failed'`).

Credits the Headroom project (Apache-2.0) as the conceptual source; all primitives are independent TypeScript re-implementations.
