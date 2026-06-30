---
"@memberjunction/core-entities": minor
"@memberjunction/ai-engine-base": minor
"@memberjunction/aiengine": minor
"@memberjunction/ai-agents": minor
"@memberjunction/server": minor
---

feat(prompt-parts): scope-aware, pluggable prompt construction (ScopedPromptPart + PromptComponentResolver)

Adds a first-class, scope-aware prompt-construction primitive to MJ core. `ScopedPromptPart` is a
small, named, role-tagged fragment of prompt text attached to an `AIPrompt` and optionally narrowed
by the **same polymorphic scope the agent runtime already carries for memory** (`PrimaryScopeEntity`/
`PrimaryScopeRecordID` + `SecondaryScopes`). Any MJ app can control LLM behavior per scope by editing
rows, not code.

- **Entity + controls:** `__mj.ScopedPromptPart` with `Name`, `Role`, `Sort`, `Text`, `Status`, the
  polymorphic scope columns, and the resolver controls `MergeBehavior` (`Override` | `Append`) and
  `Priority`. The inclusion rule is data-driven, not hardcoded.
- **Resolution + assembly:** cached on `AIEngine` (`ScopedPromptParts`); resolved by
  `PromptComponentResolver` — a **template-method** class whose protected hooks (`getCandidates`,
  `isInScope`, `score`, `selectIncluded`, `order`) are the extension points. Within a part `Name`,
  the most-specific scope wins (`Override`) or all in-scope parts accumulate (`Append`); distinct
  names compose additively. Roles are preserved (System/User/Assistant) — assembled messages drive
  the model directly, not flattened.
- **Pluggable:** the agent runtime obtains the resolver via
  `MJGlobal.ClassFactory.CreateInstance(PromptComponentResolver)`, so a downstream consumer can
  `@RegisterClass(PromptComponentResolver) class X extends PromptComponentResolver { … }` and override
  the protected hooks for custom inclusion/scope logic — **no core change required**.
- **Agent wiring:** `BaseAgent` resolves + injects scoped parts (role-faithful) alongside memory/RAG,
  using the run's existing primary/secondary scopes.

Verified by unit tests (`PromptComponentResolver`) and a full agent run demonstrating the scope cascade.
