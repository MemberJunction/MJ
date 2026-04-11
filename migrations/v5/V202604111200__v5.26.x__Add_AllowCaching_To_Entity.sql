-- Add AllowCaching column to Entity table.
-- When false (default for non-__mj entities), the entire cache code path is
-- short-circuited for that entity: no PreRunView cache check, no auto-cache
-- storage, no HandleBaseEntityEvent fingerprint scan, no client-side cache.
-- __mj schema entities default to true (metadata is read-heavy, write-rarely).

ALTER TABLE ${flyway:defaultSchema}.Entity
    ADD AllowCaching BIT NOT NULL
    CONSTRAINT DF_Entity_AllowCaching DEFAULT 0;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Controls whether this entity participates in server-side and client-side caching. When false, all cache operations (PreRunView checks, auto-cache storage, BaseEntity event fingerprint scans, client-side IndexedDB cache) are skipped entirely for zero overhead on the hot save/query paths. __mj metadata entities default to true; all others default to false.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'AllowCaching';
GO

-- Enable caching for all __mj schema entities (metadata is read-heavy, write-rarely)
UPDATE e
SET e.AllowCaching = 1
FROM ${flyway:defaultSchema}.Entity e
WHERE e.SchemaName = '__mj';
GO
