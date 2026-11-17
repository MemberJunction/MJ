---
"@memberjunction/ai-agents": patch
---

`SpreadsheetToolLibrary` exposes its regex search budget as `RegexBudgetMs` (default 150 ms, unchanged). The R8-6 test, which asserts that a 10,000-cell regex search completes, now runs with a 750 ms budget, so a slow CI runner no longer fails it by marking the search `partial`.
