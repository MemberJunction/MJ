---
"@memberjunction/core": patch
---

A scoped metadata refresh (after a saved-query write, or from `RefreshIfNeeded()` when only the saved-query family is stale) now reads the metadata dataset status once instead of twice.
