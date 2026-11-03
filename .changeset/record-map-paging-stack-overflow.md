---
"@memberjunction/integration-engine": patch
---

Fix "Maximum call stack size exceeded" in the full-sync orphan sweep and full push on large record maps. The record-map loader set `IgnoreMaxRows`, which also drops `MaxRows`, so its first "page" was the whole map (~126k rows on one HubSpot portal) and `rows.push(...page)` overflowed the stack. It now pages at `MaxRows` and appends without spreading.
