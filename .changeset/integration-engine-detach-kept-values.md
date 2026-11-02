---
"@memberjunction/integration-engine": patch
---

A sync no longer keeps the response pages of a connector in memory after it has processed them.

A connector that parses response text with a regex returns values that point into the page they came from, so keeping one value keeps the whole page. The engine kept two kinds of these values after their batch:

- **Record IDs for orphan detection.** The ID of every record of an entity map stays in a Set until the map ends, so every page of the map stayed in memory until then.
- **Samples of unmapped columns.** Up to 20 values per unmapped column stay in the run result until the run ends, for schema promotion. A column that is mostly empty takes its samples from many pages.

Both now keep a copy of the value (`DetachString`), so a page is released when its batch is done. On a production sync of wide objects (about 7 MB per page of 200 rows), these values kept more than 2 GB of pages in memory.
