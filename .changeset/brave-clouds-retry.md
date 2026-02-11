---
"@memberjunction/ai-agents": minor
---

Fix Memory Manager contradiction handling: collapse duplicate merge candidates to create one replacement note instead of duplicates, update dedup prompt to distinguish additive preferences from true duplicates, skip dedup for merge notes, revoke-and-create instead of in-place overwrite, add verbose support from UI, and fallback gracefully when merge targets are missing
