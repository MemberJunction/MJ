-- Phase 3 (combined-key surrogate hashing): records the key columns of a keyed/aggregation
-- materialization so the refresh can compute a stable hash surrogate (the match key for incremental
-- refresh / dirty-group recompute) instead of a synthetic IDENTITY/ROW_NUMBER row id.
-- NULL = not keyed (Phase 1/2 behavior: synthetic surrogate).
ALTER TABLE ${flyway:defaultSchema}.MaterializedResult ADD
    KeyColumns NVARCHAR(MAX) NULL;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Phase 3: JSON array of the key columns ({name, type}) for a keyed/aggregation materialization — the combined key hashed into the surrogate (the stable match key for incremental refresh / dirty-group recompute). NULL means not keyed, in which case a synthetic IDENTITY/ROW_NUMBER surrogate is used.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'MaterializedResult',
    @level2type = N'COLUMN', @level2name = N'KeyColumns';
