-- =============================================================================
-- Betty Content Full-Text Search setup
-- =============================================================================
-- Flips the FullTextSearchEnabled flag on:
--   * MJ: Content Items entity  + its [Text] field   (table: __mj.ContentItem)
--   * Content Items entity (betty) + its [Decorator] field (table: betty.ContentItem)
--
-- Run this once, then run CodeGen. CodeGen will detect the flag and emit the
-- platform-specific DDL (CREATE FULLTEXT CATALOG / INDEX / search function)
-- as a CodeGen_Run_*.sql migration in /migrations/v5/.
--
-- Apply the generated migration normally via Flyway/Skyway.
-- =============================================================================

DECLARE @MJContentItemsEntityID UNIQUEIDENTIFIER;
DECLARE @BettyContentItemsEntityID UNIQUEIDENTIFIER;

SELECT @MJContentItemsEntityID = ID
FROM __mj.Entity
WHERE Name = 'MJ: Content Items';

SELECT @BettyContentItemsEntityID = ID
FROM __mj.Entity
WHERE Name = 'Content Items' AND SchemaName = 'betty';

IF @MJContentItemsEntityID IS NULL
    THROW 50000, 'Entity "MJ: Content Items" not found.', 1;
IF @BettyContentItemsEntityID IS NULL
    THROW 50000, 'Entity "Content Items" in schema "betty" not found. Run CodeGen for the betty schema first.', 1;

-- 1. Enable FTS on the entities (catalog will be auto-managed by CodeGen).
UPDATE __mj.Entity
SET FullTextSearchEnabled = 1
WHERE ID IN (@MJContentItemsEntityID, @BettyContentItemsEntityID)
  AND FullTextSearchEnabled = 0;

-- 2. Enable FTS on the specific fields that should be indexed.
UPDATE ef
SET FullTextSearchEnabled = 1
FROM __mj.EntityField ef
WHERE (ef.EntityID = @MJContentItemsEntityID    AND ef.Name = 'Text')
   OR (ef.EntityID = @BettyContentItemsEntityID AND ef.Name = 'Decorator');

-- Sanity check
SELECT
    e.Name AS Entity,
    e.SchemaName,
    e.FullTextSearchEnabled AS EntityFTSEnabled,
    ef.Name  AS Field,
    ef.FullTextSearchEnabled AS FieldFTSEnabled
FROM __mj.Entity e
JOIN __mj.EntityField ef ON ef.EntityID = e.ID
WHERE e.ID IN (@MJContentItemsEntityID, @BettyContentItemsEntityID)
  AND ef.Name IN ('Text', 'Decorator')
ORDER BY e.SchemaName, e.Name, ef.Sequence;
