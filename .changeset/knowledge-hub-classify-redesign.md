---
"@memberjunction/ng-dashboards": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-bootstrap": minor
---

feat(knowledge-hub): Classify sub-app decomposition + new classification features

Decompose the Classify (content autotagging) dashboard from a single ~5,150-line component into a thin host shell plus 6 self-contained tab sub-page components and 4 dialog components, with a shared pure helper layer. Cacheable metadata reuses the existing `KnowledgeHubMetadataEngine` / `TagEngineBase` / `AIEngineBase`; high-volume rows stay on `RunView`.

Surfaces backend capabilities that previously had no UI:

- **Suggestions Inbox** — human-in-the-loop review queue over `MJ: Tag Suggestions` (approve / merge / reject).
- **Tag Health** — real merge-candidate / low-usage / wide-node signals, replacing the prior heuristic.
- **Governance / Synonyms / Scope** editors on the Taxonomy tag panel (typed `MJTag` flags, synonym approval workflow, tag scope).
- **Config parity** — full `IContentSourceConfiguration` (taxonomy mode, thresholds, tag root, budgets, toggles, effective-values) inline in the source form, which is now sectioned and a resizable, width-remembering slide-in.
- **Dry-run preview** — in-memory disposition preview of a source's tags under its current mode + thresholds (no LLM call, nothing persisted).

Adds `TagSynonym.Status` (`Active`/`Pending`/`Rejected`, default `Active`) for the synonym approval workflow — additive and backward-compatible — with the regenerated entity, server, and form code. `ng-bootstrap`'s class manifest + allow-list pick up `TagEngineBase`.
