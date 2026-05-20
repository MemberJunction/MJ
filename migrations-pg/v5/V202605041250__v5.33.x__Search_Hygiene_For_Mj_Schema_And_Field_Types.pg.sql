-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- NOTE: Earlier converter versions made INTEGER to BOOLEAN cast implicit by
-- modifying the system catalog so SS-style INSERT INTO bool_col VALUES (1)
-- would work. That modification required pg_catalog write privileges, which
-- managed PG (RDS, Aurora, Cloud SQL, Azure) does not grant. As of v5.30 all
-- bulk INSERTs are emitted with native TRUE/FALSE values directly, so the
-- cast modification is no longer needed. Removed to support managed-PG
-- installs out of the box.


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

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

UPDATE __mj."Entity"
SET "AllowUserSearchAPI" = FALSE,
    "AutoUpdateAllowUserSearchAPI" = FALSE
WHERE "Name" IN (
      'MJ: Record Changes',
      'MJ: Record Change Replay Runs',
      'MJ: Audit Logs',
      'MJ: Tag Audit Logs',
      'MJ: User Record Logs',
      'MJ: Record Merge Logs',
      'MJ: Record Merge Deletion Logs',
      'MJ: Error Logs',
      'MJ: API Key Usage Logs',
      'MJ: Communication Logs',
      'MJ: MCP Tool Execution Logs',
      'MJ: AI Agent Runs',
      'MJ: AI Agent Run Steps',
      'MJ: AI Agent Run Medias',
      'MJ: AI Prompt Runs',
      'MJ: AI Prompt Run Medias',
      'MJ: Action Execution Logs',
      'MJ: Workflow Runs',
      'MJ: Recommendation Runs',
      'MJ: Scheduled Job Runs',
      'MJ: Duplicate Runs',
      'MJ: Duplicate Run Details',
      'MJ: Duplicate Run Detail Matches',
      'MJ: Company Integration Runs',
      'MJ: Company Integration Run Details',
      'MJ: Company Integration Run API Logs',
      'MJ: Communication Runs',
      'MJ: Content Process Runs',
      'MJ: Content Process Run Details',
      'MJ: Content Process Run Prompt Runs',
      'MJ: Entity Document Runs',
      'MJ: Test Runs',
      'MJ: Test Suite Runs',
      'MJ: Test Run Outputs',
      'MJ: Test Run Feedbacks',
      'MJ: User View Runs',
      'MJ: User View Run Details',
      'MJ: Report Snapshots',
      'MJ: Archive Runs',
      'MJ: Archive Run Details'
  )
  AND "SchemaName" = '__mj';


-- The SchemaName guard ensures this MJ migration only flips entities owned by
-- the framework schema. Product-defined entities (e.g. CDP's crm.* / reference.*)
-- are handled by the consuming product's migration.

-- 2. Disable IncludeInUserSearchAPI on every primary-key column, system-wide.
--    LIKE '%term%' on UUID/INTEGER/bigint forces a per-row CONVERT
--    and never seeks an index. There is no scenario where a user wants to
--    fuzzy-match a UUID.
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = FALSE,
    "AutoUpdateIncludeInUserSearchAPI" = FALSE
WHERE "IncludeInUserSearchAPI" = TRUE
  AND "IsPrimaryKey" = TRUE;


-- 3. Disable IncludeInUserSearchAPI on every non-text field, system-wide.
--    The data-provider LIKE path implicitly converts non-text to TEXT
--    on every row, which is both expensive and never index-seekable.
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = FALSE,
    "AutoUpdateIncludeInUserSearchAPI" = FALSE
WHERE "IncludeInUserSearchAPI" = TRUE
  AND "Type" IN (
      'int', 'bigint', 'smallint', 'tinyint',
      'uniqueidentifier', 'bit',
      'datetime', 'datetime2', 'datetimeoffset', 'date', 'time', 'smalldatetime',
      'money', 'smallmoney',
      'decimal', 'numeric', 'float', 'real',
      'binary', 'varbinary', 'image',
      'geography', 'geometry', 'hierarchyid', 'xml'
  );


-- 4. Disable IncludeInUserSearchAPI on TEXT/varchar(MAX)/ntext/text
--    fields, system-wide, EXCEPT when the parent entity has FullTextSearchEnabled = 1
--    (CONTAINS via the FTX path handles those efficiently). These are the most
--    expensive columns to LIKE-scan and almost never the right target for a
--    substring search outside FTX.
UPDATE __mj."EntityField" SET "IncludeInUserSearchAPI" = FALSE,
    "AutoUpdateIncludeInUserSearchAPI" = FALSE
FROM __mj."Entity" e
WHERE e."ID" = __mj."EntityField"."EntityID"
  AND __mj."EntityField"."IncludeInUserSearchAPI" = TRUE
  AND e."FullTextSearchEnabled" = FALSE
  AND (
      (__mj."EntityField"."Type" IN ('nvarchar', 'varchar', 'char', 'nchar') AND __mj."EntityField"."Length" = -1)
      OR __mj."EntityField"."Type" IN ('ntext', 'text')
  );
