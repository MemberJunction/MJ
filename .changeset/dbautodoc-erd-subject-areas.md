---
"@memberjunction/db-auto-doc": patch
"@memberjunction/cli": patch
---

DBAutoDoc for large databases:

- `export --erd-mode clusters` draws the schema as hub-centred subject areas, one Mermaid diagram per area, for databases too large for a single ERD (Mermaid refuses sources above ~50,000 characters). Reference tables are listed beside each diagram instead of drawn, large areas are paginated, and `documentation.html` gains a Subject Areas section linking to them. Thresholds and manual overrides (`hubs`, `lookupTables`, `excludeTables`) live in `config.json` under `output.erd` and can be overridden per run by the new `--erd-*` flags, which `mj dbdoc export` passes through. The Mermaid generator also gains a `columns` option (`all`, `keys`, `none`).
- `analyze --skip-sampling` (and `analysis.skipSampling`) skips the table data sampling pass. Sampling reports per-table progress, saves state every 25 tables, and a `--resume` samples only the tables that have no statistics yet, so an interrupted pass on a large database continues where it stopped. Organic-key detection is skipped with a warning when no table carries column statistics, since its cardinality gate needs them; a resume of a previously sampled run keeps its statistics and still runs it. A sampling pass with failed tables records `partial` rather than `completed` in `state.json`, and the subject-area planner warns about any area left below `minClusterSize`.
- `seedContext.file` / `seedContext.files` read one or more context documents into `customInstructions`; a file that cannot be read is reported by setting name. `ai.model` is trimmed.
