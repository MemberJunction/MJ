-- ============================================================================
-- Search hygiene, framework level. Two concerns:
--   (a) Disable AllowUserSearchAPI on __mj-schema entities that should not
--       appear in global search (audit logs, etc.).
--   (b) Correct CodeGen-introduced metadata bugs that mark primary keys, non-
--       text columns, and unbounded text columns as user-searchable. These
--       cause unindexed scans on every search and are never the right target.
-- Both concerns affect every MJ deployment, so the migration ships from MJ.
-- Reversible: re-running the same UPDATEs with IncludeInUserSearchAPI=1 /
-- AllowUserSearchAPI=1 restores prior state.
-- ============================================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- 1. Disable AllowUserSearchAPI on __mj-schema log / audit / run-history /
--    snapshot entities. Match by Name (IDs differ across environments).
--
--    Two behaviors come from one UPDATE:
--      (a) Entities currently AllowUserSearchAPI=1 are flipped off (Record
--          Changes, Archive Runs, Archive Run Details on stage today).
--      (b) Entities currently AllowUserSearchAPI=0 stay off, but get
--          AutoUpdateAllowUserSearchAPI=0 -- locking them so a future CodeGen
--          run cannot promote them. Without this freeze, every one of these
--          entities is at perpetual risk of being silently re-enabled by the
--          smart-field LLM step.
--
--    Excluded on purpose: lookup/type tables that happen to contain "Log" /
--    "Run" in the name (e.g. MJ: Audit Log Types, MJ: Test Run Output Types)
--    and legitimate user-data child entities that contain "Detail" /
--    "Message" (e.g. MJ: Conversation Details, MJ: List Details).
DECLARE @DisableMjEntities TABLE (Name NVARCHAR(255) NOT NULL PRIMARY KEY);
INSERT INTO @DisableMjEntities (Name) VALUES
    -- Audit / change-tracking
    (N'MJ: Record Changes'),
    (N'MJ: Record Change Replay Runs'),
    (N'MJ: Audit Logs'),
    (N'MJ: Tag Audit Logs'),
    (N'MJ: User Record Logs'),
    (N'MJ: Record Merge Logs'),
    (N'MJ: Record Merge Deletion Logs'),
    -- Error / API logs
    (N'MJ: Error Logs'),
    (N'MJ: API Key Usage Logs'),
    (N'MJ: Communication Logs'),
    (N'MJ: MCP Tool Execution Logs'),
    -- AI / prompt / agent execution telemetry
    (N'MJ: AI Agent Runs'),
    (N'MJ: AI Agent Run Steps'),
    (N'MJ: AI Agent Run Medias'),
    (N'MJ: AI Prompt Runs'),
    (N'MJ: AI Prompt Run Medias'),
    -- Action / workflow / recommendation / scheduled / duplicate execution
    (N'MJ: Action Execution Logs'),
    (N'MJ: Workflow Runs'),
    (N'MJ: Recommendation Runs'),
    (N'MJ: Scheduled Job Runs'),
    (N'MJ: Duplicate Runs'),
    (N'MJ: Duplicate Run Details'),
    (N'MJ: Duplicate Run Detail Matches'),
    -- Integration / content-pipeline runs
    (N'MJ: Company Integration Runs'),
    (N'MJ: Company Integration Run Details'),
    (N'MJ: Company Integration Run API Logs'),
    (N'MJ: Communication Runs'),
    (N'MJ: Content Process Runs'),
    (N'MJ: Content Process Run Details'),
    (N'MJ: Content Process Run Prompt Runs'),
    (N'MJ: Entity Document Runs'),
    -- Test execution
    (N'MJ: Test Runs'),
    (N'MJ: Test Suite Runs'),
    (N'MJ: Test Run Outputs'),
    (N'MJ: Test Run Feedbacks'),
    -- View / report execution + snapshots
    (N'MJ: User View Runs'),
    (N'MJ: User View Run Details'),
    (N'MJ: Report Snapshots'),
    -- Archive
    (N'MJ: Archive Runs'),
    (N'MJ: Archive Run Details');

UPDATE e
SET e.AllowUserSearchAPI = 0,
    e.AutoUpdateAllowUserSearchAPI = 0
FROM [${flyway:defaultSchema}].[Entity] e
JOIN @DisableMjEntities d ON d.Name = e.Name
WHERE e.SchemaName = N'${flyway:defaultSchema}';
-- The SchemaName guard ensures this MJ migration only flips entities owned by
-- the framework schema. Product-defined entities (e.g. CDP's crm.* / reference.*)
-- are handled by the consuming product's migration.

-- 2. Disable IncludeInUserSearchAPI on every primary-key column, system-wide.
--    LIKE '%term%' on uniqueidentifier/int/bigint forces a per-row CONVERT
--    and never seeks an index. There is no scenario where a user wants to
--    fuzzy-match a UUID.
UPDATE f
SET f.IncludeInUserSearchAPI = 0,
    f.AutoUpdateIncludeInUserSearchAPI = 0
FROM [${flyway:defaultSchema}].[EntityField] f
WHERE f.IncludeInUserSearchAPI = 1
  AND f.IsPrimaryKey = 1;

-- 3. Disable IncludeInUserSearchAPI on every non-text field, system-wide.
--    The data-provider LIKE path implicitly converts non-text to nvarchar
--    on every row, which is both expensive and never index-seekable.
UPDATE f
SET f.IncludeInUserSearchAPI = 0,
    f.AutoUpdateIncludeInUserSearchAPI = 0
FROM [${flyway:defaultSchema}].[EntityField] f
WHERE f.IncludeInUserSearchAPI = 1
  AND f.Type IN (
      N'int', N'bigint', N'smallint', N'tinyint',
      N'uniqueidentifier', N'bit',
      N'datetime', N'datetime2', N'datetimeoffset', N'date', N'time', N'smalldatetime',
      N'money', N'smallmoney',
      N'decimal', N'numeric', N'float', N'real',
      N'binary', N'varbinary', N'image',
      N'geography', N'geometry', N'hierarchyid', N'xml'
  );

-- 4. Disable IncludeInUserSearchAPI on nvarchar(MAX)/varchar(MAX)/ntext/text
--    fields, system-wide, EXCEPT when the parent entity has FullTextSearchEnabled = 1
--    (CONTAINS via the FTX path handles those efficiently). These are the most
--    expensive columns to LIKE-scan and almost never the right target for a
--    substring search outside FTX.
UPDATE f
SET f.IncludeInUserSearchAPI = 0,
    f.AutoUpdateIncludeInUserSearchAPI = 0
FROM [${flyway:defaultSchema}].[EntityField] f
JOIN [${flyway:defaultSchema}].[Entity] e ON e.ID = f.EntityID
WHERE f.IncludeInUserSearchAPI = 1
  AND e.FullTextSearchEnabled = 0
  AND (
      (f.Type IN (N'nvarchar', N'varchar', N'char', N'nchar') AND f.Length = -1)
      OR f.Type IN (N'ntext', N'text')
  );

COMMIT TRANSACTION;
