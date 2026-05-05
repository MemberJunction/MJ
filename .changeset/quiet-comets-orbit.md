---
"@memberjunction/core-actions": patch
---

Fix scheduled geocoding orphan-cleanup filter to query the entity's `BaseView` (not `BaseTable`) and bracket-quote the schema, view, and primary-key identifiers, so cleanup works for entities backed by views and tolerates spaces/reserved words in identifiers.
