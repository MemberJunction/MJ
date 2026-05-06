-- ============================================================================
-- Search hygiene, framework level. PG counterpart of V202605041250__v5.33.x.
-- Two concerns:
--   (a) Disable AllowUserSearchAPI on __mj-schema entities that should not
--       appear in global search (audit logs, etc.).
--   (b) Correct CodeGen-introduced metadata bugs that mark primary keys, non-
--       text columns, and unbounded text columns as user-searchable.
-- The auto-converter dropped the T-SQL table-variable + UPDATE-FROM-JOIN
-- patterns, so this file is hand-authored to mirror the T-SQL semantics.
-- ============================================================================

-- 1. Disable AllowUserSearchAPI on __mj-schema log / audit / run-history /
--    snapshot entities. Match by Name (IDs differ across environments).
--    The SchemaName guard ensures this MJ migration only flips entities owned
--    by the framework schema.
UPDATE "${flyway:defaultSchema}"."Entity" e
SET "AllowUserSearchAPI" = false,
    "AutoUpdateAllowUserSearchAPI" = false
WHERE e."SchemaName" = '${flyway:defaultSchema}'
  AND e."Name" IN (
    -- Audit / change-tracking
    'MJ: Record Changes',
    'MJ: Record Change Replay Runs',
    'MJ: Audit Logs',
    'MJ: Tag Audit Logs',
    'MJ: User Record Logs',
    'MJ: Record Merge Logs',
    'MJ: Record Merge Deletion Logs',
    -- Error / API logs
    'MJ: Error Logs',
    'MJ: API Key Usage Logs',
    'MJ: Communication Logs',
    'MJ: MCP Tool Execution Logs',
    -- AI / prompt / agent execution telemetry
    'MJ: AI Agent Runs',
    'MJ: AI Agent Run Steps',
    'MJ: AI Agent Run Medias',
    'MJ: AI Prompt Runs',
    'MJ: AI Prompt Run Medias',
    -- Action / workflow / recommendation / scheduled / duplicate execution
    'MJ: Action Execution Logs',
    'MJ: Workflow Runs',
    'MJ: Recommendation Runs',
    'MJ: Scheduled Job Runs',
    'MJ: Duplicate Runs',
    'MJ: Duplicate Run Details',
    'MJ: Duplicate Run Detail Matches',
    -- Integration / content-pipeline runs
    'MJ: Company Integration Runs',
    'MJ: Company Integration Run Details',
    'MJ: Company Integration Run API Logs',
    'MJ: Communication Runs',
    'MJ: Content Process Runs',
    'MJ: Content Process Run Details',
    'MJ: Content Process Run Prompt Runs',
    'MJ: Entity Document Runs',
    -- Test execution
    'MJ: Test Runs',
    'MJ: Test Suite Runs',
    'MJ: Test Run Outputs',
    'MJ: Test Run Feedbacks',
    -- View / report execution + snapshots
    'MJ: User View Runs',
    'MJ: User View Run Details',
    'MJ: Report Snapshots',
    -- Archive
    'MJ: Archive Runs',
    'MJ: Archive Run Details'
  );

-- 2. Disable IncludeInUserSearchAPI on every primary-key column, system-wide.
--    LIKE '%term%' on uniqueidentifier/int/bigint forces a per-row CONVERT
--    and never seeks an index. There is no scenario where a user wants to
--    fuzzy-match a UUID.
UPDATE "${flyway:defaultSchema}"."EntityField" f
SET "IncludeInUserSearchAPI" = false,
    "AutoUpdateIncludeInUserSearchAPI" = false
WHERE f."IncludeInUserSearchAPI" = true
  AND f."IsPrimaryKey" = true;

-- 3. Disable IncludeInUserSearchAPI on every non-text field, system-wide.
UPDATE "${flyway:defaultSchema}"."EntityField" f
SET "IncludeInUserSearchAPI" = false,
    "AutoUpdateIncludeInUserSearchAPI" = false
WHERE f."IncludeInUserSearchAPI" = true
  AND f."Type" IN (
      'int', 'bigint', 'smallint', 'tinyint',
      'uniqueidentifier', 'bit',
      'datetime', 'datetime2', 'datetimeoffset', 'date', 'time', 'smalldatetime',
      'money', 'smallmoney',
      'decimal', 'numeric', 'float', 'real',
      'binary', 'varbinary', 'image',
      'geography', 'geometry', 'hierarchyid', 'xml'
  );

-- 4. Disable IncludeInUserSearchAPI on nvarchar(MAX)/varchar(MAX)/ntext/text
--    fields, system-wide, EXCEPT when the parent entity has FullTextSearchEnabled = 1.
UPDATE "${flyway:defaultSchema}"."EntityField" f
SET "IncludeInUserSearchAPI" = false,
    "AutoUpdateIncludeInUserSearchAPI" = false
FROM "${flyway:defaultSchema}"."Entity" e
WHERE e."ID" = f."EntityID"
  AND f."IncludeInUserSearchAPI" = true
  AND e."FullTextSearchEnabled" = false
  AND (
      (f."Type" IN ('nvarchar', 'varchar', 'char', 'nchar') AND f."Length" = -1)
      OR f."Type" IN ('ntext', 'text')
  );
