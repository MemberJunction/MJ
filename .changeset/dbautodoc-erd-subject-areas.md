---
"@memberjunction/db-auto-doc": patch
"@memberjunction/cli": patch
---

DBAutoDoc for large databases:

- `export --erd-mode clusters` draws the schema as hub-centred subject areas, one Mermaid diagram per area, for databases too large for a single ERD (Mermaid refuses sources above ~50,000 characters). Reference tables are listed beside each diagram instead of drawn, large areas are paginated, and `documentation.html` gains a Subject Areas section linking to them. Thresholds and manual overrides (`hubs`, `lookupTables`, `excludeTables`) live in `config.json` under `output.erd` and can be overridden per run by the new `--erd-*` flags, which `mj dbdoc export` passes through. The Mermaid generator also gains a `columns` option (`all`, `keys`, `none`).
- `analyze --skip-sampling` (and `analysis.skipSampling`) skips the table data sampling pass; sampling reports per-table progress and saves state every 25 tables so an interrupted run on a large database keeps its progress.
- SQL Server sampling queries use `WITH (NOLOCK)` and draw random samples from a 1,000-row pool instead of sorting the whole table with `ORDER BY NEWID()`, which stalled on multi-million-row tables.
- `seedContext.file` / `seedContext.files` read one or more context documents into `customInstructions`; `ai.model` is trimmed.
