---
"@memberjunction/integration-engine": patch
---

A sync no longer keeps the response pages of a connector in memory after it has processed them.

A connector that parses response text with a regex returns values that point into the page they came from, so keeping one value keeps the whole page. The engine kept three kinds of these values after their batch:

- **Record IDs for orphan detection.** The ID of every record of an entity map stays in a Set until the map ends, so every page of the map stayed in memory until then.
- **Samples of IDs that a later page serves again.** Up to 5 per entity map stay until the map ends, for the overlapping-pages warning.
- **Samples of unmapped columns.** Up to 20 values per unmapped column stay in the run result until the run ends, for schema promotion. A column that is mostly empty takes its samples from many pages. A sample can also be an object or an array (for example, from an XML parser) that holds parsed strings.

All three now keep a copy (`DetachString`; a plain object or array sample is parsed back from its JSON), so a page is released when its batch is done. On a production sync of wide objects (about 7 MB per page of 200 rows), these values kept more than 2 GB of pages in memory.
