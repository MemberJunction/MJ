---
"@memberjunction/db-auto-doc": patch
---

DBAutoDoc no longer flags a discovered or LLM-proposed primary key on a table whose key is declared in the catalog, so the two are never combined into one key. Flags discovery sets carry `primaryKeySource: 'discovery'`.
