---
"@memberjunction/codegen-lib": patch
---

Large-schema CodeGen efficiency: batch the per-field metadata INSERTs in `createNewEntityFieldsFromSchema`. Previously one INSERT + one synchronous migration-log append per field (~40k on a 2k-table install, ~37s); now flushed in 250-row chunks through the existing `LogSQLBatchAndExecute`, preserving the exact per-row SQL and replayable migration output. createNew 37s → 10.6s. Both dialects.
