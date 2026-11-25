---
"@memberjunction/core": patch
---

A failed or undated dataset result is no longer written to the local dataset cache, and a failed dataset status read now counts as "not up to date" instead of serving the cached copy or throwing.
