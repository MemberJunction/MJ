---
"@memberjunction/db-auto-doc": patch
---

The primary- and foreign-key passes now see the operator's seed context.

`seedContext.customInstructions`, which also carries the text of `seedContext.file` / `files`, reached only the table-analysis prompt. The passes that decide keys never saw it: the discovery validator, PK pruning and FK pruning. A data-layout summary helps those passes most.

- A per-table pass (discovery validator, `pk-pruning-table`, `fk-pruning-table`) gets the paragraphs that name its table. The whole-schema passes (`pk-pruning-holistic`, `fk-pruning-holistic`) get the full text. The notes are framed as evidence that does not override the data and constraints.
- New setting `seedContext.keyPassMaxChars` caps the text sent to each of these prompts (default 6000; `0` sends none), so a long document doesn't multiply cost by the table count.
- New export: `SeedContextExcerpt`.
- `DBAutoDocAPI` now passes its `seedContext` on to the analysis. `buildFullConfig` never copied it, so programmatic callers got no seed context in any prompt, table analysis included. Its type also accepts `keyPassMaxChars`.
