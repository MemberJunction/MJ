-- Phase 3 (DirtyGroupRecompute): records the SOURCE row count observed at the last successful refresh.
-- Used as the cheap delete-detection guard for incremental dirty-group recompute: if the current source
-- COUNT(*) is LOWER than this value, rows were deleted (a net decrease that dirty-group recompute — which
-- only re-computes groups whose SURVIVING rows changed since Watermark — cannot localize), so the refresh
-- falls back to a full rebuild. NULL = no baseline yet (first run → full rebuild, which sets it).
-- (This is distinct from RowCount, which is the count of MATERIALIZED rows i.e. groups, not source rows.)
ALTER TABLE ${flyway:defaultSchema}.MaterializedResult ADD
    SourceRowCount BIGINT NULL;  -- BIGINT (like RowCount): stores source COUNT(*), which can exceed int32.

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Phase 3 (DirtyGroupRecompute): the SOURCE table row count observed at the last successful refresh. Delete-detection guard — if the current source COUNT(*) is lower than this, rows were deleted and the refresh falls back to a full rebuild (dirty-group recompute cannot localize deletes from surviving rows). NULL means no baseline yet (first run does a full rebuild and sets it). Distinct from RowCount, which counts materialized rows (groups).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'MaterializedResult',
    @level2type = N'COLUMN', @level2name = N'SourceRowCount';
