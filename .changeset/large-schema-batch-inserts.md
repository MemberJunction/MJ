---
"@memberjunction/codegen-lib": patch
---

Large-schema CodeGen efficiency: batch the per-field metadata INSERTs in `createNewEntityFieldsFromSchema`. Previously one INSERT + one synchronous migration-log append per field (~40k on a 2k-table install, ~37s); now flushed in chunks through the existing `LogSQLBatchAndExecute`, preserving the exact per-row SQL and replayable migration output. createNew 37s → 10.6s. Both dialects.

Chunk size is configurable via the new top-level `metadataInsertBatchSize` CodeGen config field (default 250) for installs that want to tune round-trip size.
