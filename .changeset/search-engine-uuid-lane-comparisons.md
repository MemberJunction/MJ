---
"@memberjunction/search-engine": patch
---

Use `UUIDsEqual` instead of `===` when matching rendered constraints to their scope rows in `SearchEngine.buildLaneExplanations` (external-index, entity and storage-account lanes).

PostgreSQL returns UUIDs lowercased where SQL Server returns them uppercased, so on a case mismatch the `find` returned `undefined` and the lane reported `RenderedFilter: null` — `ExplainScope` telling an admin a lane carries no filter when it does. Silent, and a wrong answer from the one feature whose purpose is answering that question. Also unbreaks the `Unit Tests` job on `next`, where the repo's `UUIDCompliance` gate flagged the three comparisons.
