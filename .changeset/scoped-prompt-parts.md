---
"@memberjunction/core-entities": minor
---

feat(prompt-parts): scope-aware prompt construction primitive (ScopedPromptPart)

Adds a first-class, scope-aware prompt-construction primitive to MJ core. `ScopedPromptPart`
is a small, named, role-tagged fragment of prompt text attached to an `AIPrompt` and optionally
narrowed by the **same polymorphic scope the agent runtime already carries for memory**
(`PrimaryScopeEntity`/`PrimaryScopeRecordID` + `SecondaryScopes`). Any MJ app can then control
LLM behavior per scope by editing rows, not code: ship a global default for a part, override it
for a specific scoped record (an organization, tenant, channel, …) — most-specific wins per part
`Name`, while distinct names compose additively by `Sort`.

Because the scope is polymorphic (entity + record + JSON secondary dimensions), MJ core stays
tenancy-agnostic; a multi-tenant layer (e.g. BCSaaS) simply sets the scope to its
Organization/Channel and may layer extra metadata on top.

This changeset covers the schema + generated entity. Resolution + role-faithful assembly (a
cached engine over this table) and the agent-runtime wiring follow in the same effort.
