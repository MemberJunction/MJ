-- ============================================================================
-- PG-ONLY: CodeGen object regeneration for the v6.1.0-edge.2 content
--
-- WHY THIS FILE EXISTS. On SQL Server, every migration that changes a table carries its regenerated
-- CodeGen objects inline, because `mj migrate convert --split --bake-codegen` bakes them in as it
-- converts. Baking HALTS at a conversion gap, and five of this release's migrations have gaps, so
-- their PostgreSQL counterparts ship DDL only. Without the regenerated views and CRUD routines, PG
-- is left with tables carrying new columns and base views that do not — metadata and views then
-- disagree, and the failure surfaces far from its cause: `mj sync push` dies on the first entity it
-- touches ("column ModelConfiguration does not exist") and the next CodeGen run dies with it.
--
-- Rather than hand-author those objects into five migrations, this carries the whole regenerated
-- set, produced by `mj codegen` against a database with every DDL migration of this release applied
-- and nothing else.
--
-- STAMPED BEFORE Metadata_Sync ON PURPOSE. That migration calls CRUD routines whose signatures only
-- exist once these objects are in place — spCreateAIModelType gains p_supportsprefill and
-- p_modelconfiguration here. Stamped after it, the release cannot apply at all.
--
-- pg-only, because SQL Server receives the identical objects through its own inline baking.
-- ============================================================================

/* SQL text to remove entity MJ: Scheduled Actions */
DO $$ BEGIN PERFORM "${flyway:defaultSchema}"."spDeleteEntityWithCoreDependencies"('12cd5a5d-a83b-ef11-86d4-0022481d1b23'); END $$;

/* SQL text to remove view ${flyway:defaultSchema}.vwScheduledActions */
DROP VIEW IF EXISTS "${flyway:defaultSchema}"."vwScheduledActions";

/* SQL text to remove procedure ${flyway:defaultSchema}.spCreateScheduledAction */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spCreateScheduledAction" CASCADE;

/* SQL text to remove procedure ${flyway:defaultSchema}.spDeleteScheduledAction */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spDeleteScheduledAction" CASCADE;

/* SQL text to remove procedure ${flyway:defaultSchema}.spUpdateScheduledAction */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spUpdateScheduledAction" CASCADE;

/* SQL text to remove entity MJ: Scheduled Action Params */
DO $$ BEGIN PERFORM "${flyway:defaultSchema}"."spDeleteEntityWithCoreDependencies"('58e4ee77-0a3c-ef11-86d4-0022481d1b23'); END $$;

/* SQL text to remove view ${flyway:defaultSchema}.vwScheduledActionParams */
DROP VIEW IF EXISTS "${flyway:defaultSchema}"."vwScheduledActionParams";

/* SQL text to remove procedure ${flyway:defaultSchema}.spCreateScheduledActionParam */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spCreateScheduledActionParam" CASCADE;

/* SQL text to remove procedure ${flyway:defaultSchema}.spDeleteScheduledActionParam */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spDeleteScheduledActionParam" CASCADE;

/* SQL text to remove procedure ${flyway:defaultSchema}.spUpdateScheduledActionParam */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spUpdateScheduledActionParam" CASCADE;

/* SQL text to remove entity MJ: Workflow Runs */
DO $$ BEGIN PERFORM "${flyway:defaultSchema}"."spDeleteEntityWithCoreDependencies"('f2238f34-2837-ef11-86d4-6045bdee16e6'); END $$;

/* SQL text to remove procedure ${flyway:defaultSchema}.spCreateWorkflowRun */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spCreateWorkflowRun" CASCADE;

/* SQL text to remove procedure ${flyway:defaultSchema}.spDeleteWorkflowRun */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spDeleteWorkflowRun" CASCADE;

/* SQL text to remove procedure ${flyway:defaultSchema}.spUpdateWorkflowRun */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spUpdateWorkflowRun" CASCADE;

/* SQL text to remove entity MJ: Workflows */
DO $$ BEGIN PERFORM "${flyway:defaultSchema}"."spDeleteEntityWithCoreDependencies"('f3238f34-2837-ef11-86d4-6045bdee16e6'); END $$;

/* SQL text to remove procedure ${flyway:defaultSchema}.spCreateWorkflow */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spCreateWorkflow" CASCADE;

/* SQL text to remove procedure ${flyway:defaultSchema}.spDeleteWorkflow */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spDeleteWorkflow" CASCADE;

/* SQL text to remove procedure ${flyway:defaultSchema}.spUpdateWorkflow */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spUpdateWorkflow" CASCADE;

/* SQL text to remove entity MJ: Workflow Engines */
DO $$ BEGIN PERFORM "${flyway:defaultSchema}"."spDeleteEntityWithCoreDependencies"('f4238f34-2837-ef11-86d4-6045bdee16e6'); END $$;

/* SQL text to remove view ${flyway:defaultSchema}.vwWorkflowEngines */
DROP VIEW IF EXISTS "${flyway:defaultSchema}"."vwWorkflowEngines";

/* SQL text to remove procedure ${flyway:defaultSchema}.spCreateWorkflowEngine */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spCreateWorkflowEngine" CASCADE;

/* SQL text to remove procedure ${flyway:defaultSchema}.spDeleteWorkflowEngine */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spDeleteWorkflowEngine" CASCADE;

/* SQL text to remove procedure ${flyway:defaultSchema}.spUpdateWorkflowEngine */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spUpdateWorkflowEngine" CASCADE;

/* SQL text to remove entity MJ: Output Trigger Types */
DO $$ BEGIN PERFORM "${flyway:defaultSchema}"."spDeleteEntityWithCoreDependencies"('06248f34-2837-ef11-86d4-6045bdee16e6'); END $$;

/* SQL text to remove view ${flyway:defaultSchema}.vwOutputTriggerTypes */
DROP VIEW IF EXISTS "${flyway:defaultSchema}"."vwOutputTriggerTypes";

/* SQL text to remove procedure ${flyway:defaultSchema}.spCreateOutputTriggerType */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spCreateOutputTriggerType" CASCADE;

/* SQL text to remove procedure ${flyway:defaultSchema}.spDeleteOutputTriggerType */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spDeleteOutputTriggerType" CASCADE;

/* SQL text to remove procedure ${flyway:defaultSchema}.spUpdateOutputTriggerType */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spUpdateOutputTriggerType" CASCADE;

/* SQL text to remove entity MJ: Reports */
DO $$ BEGIN PERFORM "${flyway:defaultSchema}"."spDeleteEntityWithCoreDependencies"('09248f34-2837-ef11-86d4-6045bdee16e6'); END $$;

/* SQL text to remove view ${flyway:defaultSchema}.vwReports */
DROP VIEW IF EXISTS "${flyway:defaultSchema}"."vwReports";

/* SQL text to remove procedure ${flyway:defaultSchema}.spCreateReport */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spCreateReport" CASCADE;

/* SQL text to remove procedure ${flyway:defaultSchema}.spDeleteReport */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spDeleteReport" CASCADE;

/* SQL text to remove procedure ${flyway:defaultSchema}.spUpdateReport */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spUpdateReport" CASCADE;

/* SQL text to remove entity MJ: Report Categories */
DO $$ BEGIN PERFORM "${flyway:defaultSchema}"."spDeleteEntityWithCoreDependencies"('27248f34-2837-ef11-86d4-6045bdee16e6'); END $$;

/* SQL text to remove view ${flyway:defaultSchema}.vwReportCategories */
DROP VIEW IF EXISTS "${flyway:defaultSchema}"."vwReportCategories";

/* SQL text to remove procedure ${flyway:defaultSchema}.spCreateReportCategory */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spCreateReportCategory" CASCADE;

/* SQL text to remove procedure ${flyway:defaultSchema}.spDeleteReportCategory */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spDeleteReportCategory" CASCADE;

/* SQL text to remove procedure ${flyway:defaultSchema}.spUpdateReportCategory */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spUpdateReportCategory" CASCADE;

/* SQL text to remove entity MJ: Report User States */
DO $$ BEGIN PERFORM "${flyway:defaultSchema}"."spDeleteEntityWithCoreDependencies"('4a4c2ee1-bfdd-434e-9a03-6f6c2384d01f'); END $$;

/* SQL text to remove view ${flyway:defaultSchema}.vwReportUserStates */
DROP VIEW IF EXISTS "${flyway:defaultSchema}"."vwReportUserStates";

/* SQL text to remove procedure ${flyway:defaultSchema}.spCreateReportUserState */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spCreateReportUserState" CASCADE;

/* SQL text to remove procedure ${flyway:defaultSchema}.spDeleteReportUserState */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spDeleteReportUserState" CASCADE;

/* SQL text to remove procedure ${flyway:defaultSchema}.spUpdateReportUserState */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spUpdateReportUserState" CASCADE;

/* SQL text to remove entity MJ: Report Versions */
DO $$ BEGIN PERFORM "${flyway:defaultSchema}"."spDeleteEntityWithCoreDependencies"('9516058d-9729-48ec-b0b8-e91a8221fc8f'); END $$;

/* SQL text to remove view ${flyway:defaultSchema}.vwReportVersions */
DROP VIEW IF EXISTS "${flyway:defaultSchema}"."vwReportVersions";

/* SQL text to remove procedure ${flyway:defaultSchema}.spCreateReportVersion */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spCreateReportVersion" CASCADE;

/* SQL text to remove procedure ${flyway:defaultSchema}.spDeleteReportVersion */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spDeleteReportVersion" CASCADE;

/* SQL text to remove procedure ${flyway:defaultSchema}.spUpdateReportVersion */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spUpdateReportVersion" CASCADE;

/* SQL text to remove entity MJ: Report Snapshots */
DO $$ BEGIN PERFORM "${flyway:defaultSchema}"."spDeleteEntityWithCoreDependencies"('0a248f34-2837-ef11-86d4-6045bdee16e6'); END $$;

/* SQL text to remove view ${flyway:defaultSchema}.vwReportSnapshots */
DROP VIEW IF EXISTS "${flyway:defaultSchema}"."vwReportSnapshots";

/* SQL text to remove procedure ${flyway:defaultSchema}.spCreateReportSnapshot */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spCreateReportSnapshot" CASCADE;

/* SQL text to remove procedure ${flyway:defaultSchema}.spDeleteReportSnapshot */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spDeleteReportSnapshot" CASCADE;

/* SQL text to remove procedure ${flyway:defaultSchema}.spUpdateReportSnapshot */
DROP FUNCTION IF EXISTS "${flyway:defaultSchema}"."spUpdateReportSnapshot" CASCADE;

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.GeneratedCodeCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'GeneratedCodeCategory'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'GeneratedCodeCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."GeneratedCodeCategory" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.GeneratedCodeCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."GeneratedCodeCategory" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.GeneratedCodeCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'GeneratedCodeCategory'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'GeneratedCodeCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."GeneratedCodeCategory" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.GeneratedCodeCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."GeneratedCodeCategory" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentModel */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentModel'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentModel', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentModel" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentModel */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentModel" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentModel */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentModel'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentModel', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentModel" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentModel */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentModel" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ComponentRegistry */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ComponentRegistry'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ComponentRegistry', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ComponentRegistry" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ComponentRegistry */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ComponentRegistry" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ComponentRegistry */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ComponentRegistry'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ComponentRegistry', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ComponentRegistry" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ComponentRegistry */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ComponentRegistry" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.VersionLabelItem */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'VersionLabelItem'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'VersionLabelItem', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."VersionLabelItem" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.VersionLabelItem */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."VersionLabelItem" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.VersionLabelItem */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'VersionLabelItem'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'VersionLabelItem', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."VersionLabelItem" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.VersionLabelItem */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."VersionLabelItem" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.APIKey */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'APIKey'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'APIKey', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."APIKey" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.APIKey */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."APIKey" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.APIKey */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'APIKey'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'APIKey', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."APIKey" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.APIKey */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."APIKey" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentNoteType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentNoteType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentNoteType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentNoteType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentNoteType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentNoteType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentNoteType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentNoteType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentNoteType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentNoteType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentNoteType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentNoteType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ComponentDependency */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ComponentDependency'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ComponentDependency', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ComponentDependency" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ComponentDependency */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ComponentDependency" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ComponentDependency */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ComponentDependency'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ComponentDependency', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ComponentDependency" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ComponentDependency */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ComponentDependency" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Test */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Test'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Test', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Test" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Test */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Test" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Test */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Test'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Test', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Test" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Test */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Test" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TestType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TestType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TestType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TestType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.TestType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TestType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TestType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TestType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TestType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TestType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.TestType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TestType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.QueryDependency */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'QueryDependency'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'QueryDependency', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."QueryDependency" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.QueryDependency */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."QueryDependency" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.QueryDependency */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'QueryDependency'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'QueryDependency', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."QueryDependency" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.QueryDependency */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."QueryDependency" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIVendor */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIVendor'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIVendor', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIVendor" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIVendor */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIVendor" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIVendor */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIVendor'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIVendor', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIVendor" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIVendor */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIVendor" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ApplicationRole */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ApplicationRole'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ApplicationRole', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ApplicationRole" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ApplicationRole */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ApplicationRole" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ApplicationRole */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ApplicationRole'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ApplicationRole', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ApplicationRole" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ApplicationRole */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ApplicationRole" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentCategory'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentCategory" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentCategory" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentCategory'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentCategory" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentCategory" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentClientTool */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentClientTool'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentClientTool', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentClientTool" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentClientTool */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentClientTool" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentClientTool */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentClientTool'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentClientTool', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentClientTool" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentClientTool */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentClientTool" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SignatureRequest */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SignatureRequest'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SignatureRequest', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SignatureRequest" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.SignatureRequest */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SignatureRequest" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SignatureRequest */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SignatureRequest'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SignatureRequest', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SignatureRequest" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.SignatureRequest */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SignatureRequest" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TaskType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TaskType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TaskType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TaskType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.TaskType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TaskType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TaskType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TaskType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TaskType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TaskType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.TaskType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TaskType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CredentialType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CredentialType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CredentialType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CredentialType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.CredentialType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CredentialType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CredentialType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CredentialType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CredentialType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CredentialType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.CredentialType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CredentialType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIConfiguration */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIConfiguration'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIConfiguration', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIConfiguration" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIConfiguration */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIConfiguration" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIConfiguration */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIConfiguration'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIConfiguration', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIConfiguration" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIConfiguration */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIConfiguration" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EncryptionKeySource */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EncryptionKeySource'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EncryptionKeySource', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EncryptionKeySource" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EncryptionKeySource */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EncryptionKeySource" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EncryptionKeySource */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EncryptionKeySource'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EncryptionKeySource', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EncryptionKeySource" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EncryptionKeySource */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EncryptionKeySource" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgent */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgent'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgent', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgent" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgent */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgent" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgent */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgent'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgent', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgent" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgent */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgent" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentStep */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentStep'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentStep', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentStep" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentStep */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentStep" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentStep */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentStep'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentStep', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentStep" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentStep */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentStep" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIPromptModel */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIPromptModel'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIPromptModel', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIPromptModel" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIPromptModel */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIPromptModel" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIPromptModel */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIPromptModel'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIPromptModel', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIPromptModel" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIPromptModel */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIPromptModel" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.DashboardPartType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'DashboardPartType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'DashboardPartType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."DashboardPartType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.DashboardPartType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."DashboardPartType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.DashboardPartType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'DashboardPartType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'DashboardPartType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."DashboardPartType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.DashboardPartType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."DashboardPartType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SearchScopeStorageAccount */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SearchScopeStorageAccount'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SearchScopeStorageAccount', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SearchScopeStorageAccount" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.SearchScopeStorageAccount */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SearchScopeStorageAccount" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SearchScopeStorageAccount */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SearchScopeStorageAccount'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SearchScopeStorageAccount', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SearchScopeStorageAccount" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.SearchScopeStorageAccount */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SearchScopeStorageAccount" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CompanyIntegrationEntityMap */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CompanyIntegrationEntityMap'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CompanyIntegrationEntityMap', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CompanyIntegrationEntityMap" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.CompanyIntegrationEntityMap */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CompanyIntegrationEntityMap" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CompanyIntegrationEntityMap */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CompanyIntegrationEntityMap'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CompanyIntegrationEntityMap', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CompanyIntegrationEntityMap" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.CompanyIntegrationEntityMap */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CompanyIntegrationEntityMap" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.KnowledgeHubSavedSearch */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'KnowledgeHubSavedSearch'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'KnowledgeHubSavedSearch', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."KnowledgeHubSavedSearch" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.KnowledgeHubSavedSearch */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."KnowledgeHubSavedSearch" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.KnowledgeHubSavedSearch */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'KnowledgeHubSavedSearch'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'KnowledgeHubSavedSearch', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."KnowledgeHubSavedSearch" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.KnowledgeHubSavedSearch */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."KnowledgeHubSavedSearch" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentConfiguration */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentConfiguration'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentConfiguration', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentConfiguration" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentConfiguration */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentConfiguration" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentConfiguration */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentConfiguration'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentConfiguration', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentConfiguration" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentConfiguration */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentConfiguration" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CompanyIntegrationSyncWatermark */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CompanyIntegrationSyncWatermark'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CompanyIntegrationSyncWatermark', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CompanyIntegrationSyncWatermark" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.CompanyIntegrationSyncWatermark */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CompanyIntegrationSyncWatermark" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CompanyIntegrationSyncWatermark */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CompanyIntegrationSyncWatermark'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CompanyIntegrationSyncWatermark', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CompanyIntegrationSyncWatermark" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.CompanyIntegrationSyncWatermark */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CompanyIntegrationSyncWatermark" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TestSuiteTest */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TestSuiteTest'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TestSuiteTest', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TestSuiteTest" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.TestSuiteTest */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TestSuiteTest" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TestSuiteTest */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TestSuiteTest'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TestSuiteTest', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TestSuiteTest" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.TestSuiteTest */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TestSuiteTest" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SearchExecutionLog */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SearchExecutionLog'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SearchExecutionLog', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SearchExecutionLog" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.SearchExecutionLog */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SearchExecutionLog" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SearchExecutionLog */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SearchExecutionLog'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SearchExecutionLog', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SearchExecutionLog" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.SearchExecutionLog */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SearchExecutionLog" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ArchiveConfigurationEntity */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ArchiveConfigurationEntity'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ArchiveConfigurationEntity', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ArchiveConfigurationEntity" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ArchiveConfigurationEntity */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ArchiveConfigurationEntity" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ArchiveConfigurationEntity */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ArchiveConfigurationEntity'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ArchiveConfigurationEntity', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ArchiveConfigurationEntity" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ArchiveConfigurationEntity */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ArchiveConfigurationEntity" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.APIApplication */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'APIApplication'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'APIApplication', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."APIApplication" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.APIApplication */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."APIApplication" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.APIApplication */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'APIApplication'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'APIApplication', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."APIApplication" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.APIApplication */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."APIApplication" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Environment */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Environment'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Environment', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Environment" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Environment */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Environment" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Environment */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Environment'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Environment', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Environment" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Environment */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Environment" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SearchScopeProvider */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SearchScopeProvider'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SearchScopeProvider', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SearchScopeProvider" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.SearchScopeProvider */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SearchScopeProvider" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SearchScopeProvider */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SearchScopeProvider'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SearchScopeProvider', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SearchScopeProvider" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.SearchScopeProvider */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SearchScopeProvider" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ArtifactPermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ArtifactPermission'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ArtifactPermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ArtifactPermission" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ArtifactPermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ArtifactPermission" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ArtifactPermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ArtifactPermission'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ArtifactPermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ArtifactPermission" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ArtifactPermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ArtifactPermission" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentAction */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentAction'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentAction', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentAction" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentAction */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentAction" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentAction */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentAction'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentAction', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentAction" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentAction */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentAction" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SearchScope */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SearchScope'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SearchScope', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SearchScope" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.SearchScope */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SearchScope" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SearchScope */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SearchScope'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SearchScope', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SearchScope" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.SearchScope */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SearchScope" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TestRubric */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TestRubric'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TestRubric', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TestRubric" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.TestRubric */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TestRubric" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TestRubric */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TestRubric'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TestRubric', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TestRubric" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.TestRubric */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TestRubric" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TaskDependency */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TaskDependency'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TaskDependency', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TaskDependency" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.TaskDependency */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TaskDependency" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TaskDependency */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TaskDependency'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TaskDependency', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TaskDependency" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.TaskDependency */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TaskDependency" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ArchiveConfiguration */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ArchiveConfiguration'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ArchiveConfiguration', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ArchiveConfiguration" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ArchiveConfiguration */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ArchiveConfiguration" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ArchiveConfiguration */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ArchiveConfiguration'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ArchiveConfiguration', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ArchiveConfiguration" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ArchiveConfiguration */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ArchiveConfiguration" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EncryptionAlgorithm */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EncryptionAlgorithm'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EncryptionAlgorithm', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EncryptionAlgorithm" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EncryptionAlgorithm */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EncryptionAlgorithm" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EncryptionAlgorithm */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EncryptionAlgorithm'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EncryptionAlgorithm', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EncryptionAlgorithm" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EncryptionAlgorithm */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EncryptionAlgorithm" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIModelPriceType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIModelPriceType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIModelPriceType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIModelPriceType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIModelPriceType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIModelPriceType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIModelPriceType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIModelPriceType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIModelPriceType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIModelPriceType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIModelPriceType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIModelPriceType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MCPServerConnectionTool */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MCPServerConnectionTool'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MCPServerConnectionTool', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MCPServerConnectionTool" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.MCPServerConnectionTool */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MCPServerConnectionTool" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MCPServerConnectionTool */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MCPServerConnectionTool'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MCPServerConnectionTool', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MCPServerConnectionTool" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.MCPServerConnectionTool */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MCPServerConnectionTool" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SQLDialect */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SQLDialect'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SQLDialect', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SQLDialect" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.SQLDialect */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SQLDialect" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SQLDialect */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SQLDialect'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SQLDialect', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SQLDialect" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.SQLDialect */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SQLDialect" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Collection */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Collection'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Collection', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Collection" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Collection */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Collection" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Collection */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Collection'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Collection', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Collection" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Collection */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Collection" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ListShare */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ListShare'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ListShare', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ListShare" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ListShare */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ListShare" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ListShare */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ListShare'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ListShare', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ListShare" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ListShare */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ListShare" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentRequestType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentRequestType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentRequestType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentRequestType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentRequestType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentRequestType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentRequestType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentRequestType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentRequestType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentRequestType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentRequestType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentRequestType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SchemaInfo */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SchemaInfo'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SchemaInfo', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SchemaInfo" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.SchemaInfo */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SchemaInfo" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SchemaInfo */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SchemaInfo'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SchemaInfo', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SchemaInfo" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.SchemaInfo */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SchemaInfo" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityOrganicKeyRelatedEntity */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityOrganicKeyRelatedEntity'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityOrganicKeyRelatedEntity', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityOrganicKeyRelatedEntity" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EntityOrganicKeyRelatedEntity */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityOrganicKeyRelatedEntity" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityOrganicKeyRelatedEntity */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityOrganicKeyRelatedEntity'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityOrganicKeyRelatedEntity', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityOrganicKeyRelatedEntity" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EntityOrganicKeyRelatedEntity */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityOrganicKeyRelatedEntity" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MCPServerConnectionPermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MCPServerConnectionPermission'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MCPServerConnectionPermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MCPServerConnectionPermission" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.MCPServerConnectionPermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MCPServerConnectionPermission" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MCPServerConnectionPermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MCPServerConnectionPermission'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MCPServerConnectionPermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MCPServerConnectionPermission" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.MCPServerConnectionPermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MCPServerConnectionPermission" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIPrompt */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIPrompt'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIPrompt', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIPrompt" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIPrompt */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIPrompt" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIPrompt */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIPrompt'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIPrompt', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIPrompt" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIPrompt */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIPrompt" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIPromptCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIPromptCategory'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIPromptCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIPromptCategory" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIPromptCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIPromptCategory" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIPromptCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIPromptCategory'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIPromptCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIPromptCategory" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIPromptCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIPromptCategory" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIPromptType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIPromptType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIPromptType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIPromptType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIPromptType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIPromptType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIPromptType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIPromptType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIPromptType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIPromptType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIPromptType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIPromptType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Company */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Company'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Company', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Company" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Company */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Company" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Company */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Company'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Company', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Company" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Company */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Company" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Employee */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Employee'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Employee', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Employee" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Employee */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Employee" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Employee */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Employee'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Employee', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Employee" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Employee */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Employee" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EmployeeCompanyIntegration */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EmployeeCompanyIntegration'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EmployeeCompanyIntegration', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EmployeeCompanyIntegration" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EmployeeCompanyIntegration */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EmployeeCompanyIntegration" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EmployeeCompanyIntegration */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EmployeeCompanyIntegration'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EmployeeCompanyIntegration', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EmployeeCompanyIntegration" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EmployeeCompanyIntegration */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EmployeeCompanyIntegration" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EmployeeRole */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EmployeeRole'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EmployeeRole', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EmployeeRole" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EmployeeRole */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EmployeeRole" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EmployeeRole */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EmployeeRole'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EmployeeRole', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EmployeeRole" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EmployeeRole */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EmployeeRole" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EmployeeSkill */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EmployeeSkill'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EmployeeSkill', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EmployeeSkill" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EmployeeSkill */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EmployeeSkill" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EmployeeSkill */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EmployeeSkill'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EmployeeSkill', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EmployeeSkill" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EmployeeSkill */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EmployeeSkill" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Role */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Role'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Role', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Role" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Role */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Role" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Role */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Role'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Role', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Role" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Role */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Role" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Skill */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Skill'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Skill', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Skill" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Skill */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Skill" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Skill */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Skill'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Skill', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Skill" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Skill */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Skill" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.IntegrationURLFormat */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'IntegrationURLFormat'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'IntegrationURLFormat', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."IntegrationURLFormat" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.IntegrationURLFormat */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."IntegrationURLFormat" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.IntegrationURLFormat */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'IntegrationURLFormat'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'IntegrationURLFormat', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."IntegrationURLFormat" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.IntegrationURLFormat */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."IntegrationURLFormat" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CompanyIntegration */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CompanyIntegration'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CompanyIntegration', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CompanyIntegration" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.CompanyIntegration */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CompanyIntegration" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CompanyIntegration */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CompanyIntegration'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CompanyIntegration', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CompanyIntegration" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.CompanyIntegration */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CompanyIntegration" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityField */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityField'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityField', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityField" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EntityField */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityField" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityField */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityField'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityField', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityField" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EntityField */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityField" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.User */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'User'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'User', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."User" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.User */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."User" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.User */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'User'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'User', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."User" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.User */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."User" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityRelationship */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityRelationship'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityRelationship', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityRelationship" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EntityRelationship */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityRelationship" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityRelationship */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityRelationship'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityRelationship', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityRelationship" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EntityRelationship */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityRelationship" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.UserView */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'UserView'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'UserView', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."UserView" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.UserView */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."UserView" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.UserView */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'UserView'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'UserView', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."UserView" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.UserView */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."UserView" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Entity */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Entity'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Entity', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Entity" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Entity */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Entity" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Entity */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Entity'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Entity', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Entity" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Entity */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Entity" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ApplicationEntity */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ApplicationEntity'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ApplicationEntity', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ApplicationEntity" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ApplicationEntity */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ApplicationEntity" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ApplicationEntity */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ApplicationEntity'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ApplicationEntity', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ApplicationEntity" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ApplicationEntity */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ApplicationEntity" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityPermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityPermission'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityPermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityPermission" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EntityPermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityPermission" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityPermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityPermission'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityPermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityPermission" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EntityPermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityPermission" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Queue */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Queue'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Queue', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Queue" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Queue */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Queue" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Queue */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Queue'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Queue', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Queue" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Queue */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Queue" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.List */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'List'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'List', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."List" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.List */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."List" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.List */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'List'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'List', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."List" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.List */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."List" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.UserRole */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'UserRole'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'UserRole', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."UserRole" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.UserRole */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."UserRole" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.UserRole */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'UserRole'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'UserRole', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."UserRole" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.UserRole */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."UserRole" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.RowLevelSecurityFilter */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'RowLevelSecurityFilter'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'RowLevelSecurityFilter', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."RowLevelSecurityFilter" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.RowLevelSecurityFilter */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."RowLevelSecurityFilter" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.RowLevelSecurityFilter */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'RowLevelSecurityFilter'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'RowLevelSecurityFilter', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."RowLevelSecurityFilter" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.RowLevelSecurityFilter */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."RowLevelSecurityFilter" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Authorization */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Authorization'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Authorization', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Authorization" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Authorization */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Authorization" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Authorization */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Authorization'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Authorization', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Authorization" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Authorization */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Authorization" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AuthorizationRole */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AuthorizationRole'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AuthorizationRole', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AuthorizationRole" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AuthorizationRole */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AuthorizationRole" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AuthorizationRole */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AuthorizationRole'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AuthorizationRole', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AuthorizationRole" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AuthorizationRole */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AuthorizationRole" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AuditLogType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AuditLogType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AuditLogType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AuditLogType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AuditLogType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AuditLogType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AuditLogType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AuditLogType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AuditLogType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AuditLogType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AuditLogType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AuditLogType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityFieldValue */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityFieldValue'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityFieldValue', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityFieldValue" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EntityFieldValue */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityFieldValue" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityFieldValue */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityFieldValue'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityFieldValue', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityFieldValue" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EntityFieldValue */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityFieldValue" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAction */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAction'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAction', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAction" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAction */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAction" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAction */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAction'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAction', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAction" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAction */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAction" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIModelAction */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIModelAction'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIModelAction', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIModelAction" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIModelAction */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIModelAction" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIModelAction */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIModelAction'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIModelAction', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIModelAction" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIModelAction */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIModelAction" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityAIAction */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityAIAction'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityAIAction', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityAIAction" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EntityAIAction */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityAIAction" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityAIAction */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityAIAction'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityAIAction', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityAIAction" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EntityAIAction */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityAIAction" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIModelType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIModelType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIModelType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIModelType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIModelType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIModelType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIModelType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIModelType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIModelType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIModelType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIModelType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIModelType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.QueueType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'QueueType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'QueueType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."QueueType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.QueueType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."QueueType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.QueueType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'QueueType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'QueueType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."QueueType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.QueueType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."QueueType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIModel */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIModel'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIModel', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIModel" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIModel */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIModel" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIModel */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIModel'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIModel', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIModel" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIModel */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIModel" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Dashboard */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Dashboard'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Dashboard', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Dashboard" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Dashboard */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Dashboard" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Dashboard */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Dashboard'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Dashboard', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Dashboard" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Dashboard */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Dashboard" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.OutputFormatType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'OutputFormatType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'OutputFormatType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."OutputFormatType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.OutputFormatType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."OutputFormatType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.OutputFormatType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'OutputFormatType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'OutputFormatType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."OutputFormatType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.OutputFormatType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."OutputFormatType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.OutputDeliveryType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'OutputDeliveryType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'OutputDeliveryType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."OutputDeliveryType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.OutputDeliveryType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."OutputDeliveryType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.OutputDeliveryType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'OutputDeliveryType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'OutputDeliveryType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."OutputDeliveryType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.OutputDeliveryType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."OutputDeliveryType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ResourceType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ResourceType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ResourceType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ResourceType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ResourceType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ResourceType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ResourceType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ResourceType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ResourceType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ResourceType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ResourceType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ResourceType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Tag */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Tag'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Tag', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Tag" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Tag */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Tag" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Tag */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Tag'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Tag', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Tag" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Tag */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Tag" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Workspace */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Workspace'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Workspace', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Workspace" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Workspace */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Workspace" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Workspace */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Workspace'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Workspace', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Workspace" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Workspace */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Workspace" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.WorkspaceItem */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'WorkspaceItem'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'WorkspaceItem', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."WorkspaceItem" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.WorkspaceItem */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."WorkspaceItem" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.WorkspaceItem */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'WorkspaceItem'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'WorkspaceItem', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."WorkspaceItem" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.WorkspaceItem */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."WorkspaceItem" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Dataset */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Dataset'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Dataset', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Dataset" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Dataset */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Dataset" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Dataset */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Dataset'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Dataset', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Dataset" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Dataset */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Dataset" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.DatasetItem */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'DatasetItem'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'DatasetItem', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."DatasetItem" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.DatasetItem */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."DatasetItem" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.DatasetItem */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'DatasetItem'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'DatasetItem', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."DatasetItem" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.DatasetItem */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."DatasetItem" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CompanyIntegrationRecordMap */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CompanyIntegrationRecordMap'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CompanyIntegrationRecordMap', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CompanyIntegrationRecordMap" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.CompanyIntegrationRecordMap */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CompanyIntegrationRecordMap" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CompanyIntegrationRecordMap */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CompanyIntegrationRecordMap'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CompanyIntegrationRecordMap', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CompanyIntegrationRecordMap" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.CompanyIntegrationRecordMap */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CompanyIntegrationRecordMap" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.QueryField */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'QueryField'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'QueryField', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."QueryField" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.QueryField */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."QueryField" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.QueryField */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'QueryField'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'QueryField', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."QueryField" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.QueryField */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."QueryField" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.QueryCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'QueryCategory'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'QueryCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."QueryCategory" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.QueryCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."QueryCategory" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.QueryCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'QueryCategory'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'QueryCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."QueryCategory" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.QueryCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."QueryCategory" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Query */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Query'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Query', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Query" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Query */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Query" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Query */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Query'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Query', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Query" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Query */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Query" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.QueryPermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'QueryPermission'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'QueryPermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."QueryPermission" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.QueryPermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."QueryPermission" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.QueryPermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'QueryPermission'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'QueryPermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."QueryPermission" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.QueryPermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."QueryPermission" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.VectorIndex */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'VectorIndex'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'VectorIndex', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."VectorIndex" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.VectorIndex */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."VectorIndex" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.VectorIndex */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'VectorIndex'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'VectorIndex', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."VectorIndex" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.VectorIndex */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."VectorIndex" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityDocumentType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityDocumentType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityDocumentType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityDocumentType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EntityDocumentType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityDocumentType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityDocumentType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityDocumentType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityDocumentType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityDocumentType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EntityDocumentType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityDocumentType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.VectorDatabase */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'VectorDatabase'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'VectorDatabase', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."VectorDatabase" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.VectorDatabase */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."VectorDatabase" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.VectorDatabase */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'VectorDatabase'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'VectorDatabase', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."VectorDatabase" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.VectorDatabase */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."VectorDatabase" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityRecordDocument */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityRecordDocument'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityRecordDocument', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityRecordDocument" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EntityRecordDocument */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityRecordDocument" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityRecordDocument */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityRecordDocument'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityRecordDocument', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityRecordDocument" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EntityRecordDocument */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityRecordDocument" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.DataContext */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'DataContext'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'DataContext', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."DataContext" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.DataContext */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."DataContext" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.DataContext */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'DataContext'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'DataContext', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."DataContext" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.DataContext */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."DataContext" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.DashboardCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'DashboardCategory'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'DashboardCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."DashboardCategory" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.DashboardCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."DashboardCategory" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.DashboardCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'DashboardCategory'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'DashboardCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."DashboardCategory" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.DashboardCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."DashboardCategory" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.FileStorageProvider */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'FileStorageProvider'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'FileStorageProvider', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."FileStorageProvider" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.FileStorageProvider */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."FileStorageProvider" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.FileStorageProvider */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'FileStorageProvider'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'FileStorageProvider', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."FileStorageProvider" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.FileStorageProvider */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."FileStorageProvider" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.File */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'File'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'File', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."File" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.File */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."File" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.File */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'File'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'File', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."File" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.File */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."File" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SignatureRequestLog */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SignatureRequestLog'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SignatureRequestLog', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SignatureRequestLog" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.SignatureRequestLog */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SignatureRequestLog" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SignatureRequestLog */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SignatureRequestLog'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SignatureRequestLog', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SignatureRequestLog" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.SignatureRequestLog */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SignatureRequestLog" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.FileCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'FileCategory'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'FileCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."FileCategory" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.FileCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."FileCategory" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.FileCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'FileCategory'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'FileCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."FileCategory" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.FileCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."FileCategory" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.FileEntityRecordLink */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'FileEntityRecordLink'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'FileEntityRecordLink', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."FileEntityRecordLink" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.FileEntityRecordLink */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."FileEntityRecordLink" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.FileEntityRecordLink */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'FileEntityRecordLink'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'FileEntityRecordLink', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."FileEntityRecordLink" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.FileEntityRecordLink */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."FileEntityRecordLink" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityDocumentSetting */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityDocumentSetting'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityDocumentSetting', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityDocumentSetting" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EntityDocumentSetting */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityDocumentSetting" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityDocumentSetting */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityDocumentSetting'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityDocumentSetting', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityDocumentSetting" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EntityDocumentSetting */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityDocumentSetting" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntitySetting */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntitySetting'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntitySetting', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntitySetting" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EntitySetting */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntitySetting" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntitySetting */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntitySetting'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntitySetting', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntitySetting" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EntitySetting */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntitySetting" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ApplicationSetting */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ApplicationSetting'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ApplicationSetting', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ApplicationSetting" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ApplicationSetting */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ApplicationSetting" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ApplicationSetting */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ApplicationSetting'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ApplicationSetting', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ApplicationSetting" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ApplicationSetting */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ApplicationSetting" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ActionCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ActionCategory'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ActionCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ActionCategory" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ActionCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ActionCategory" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ActionCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ActionCategory'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ActionCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ActionCategory" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ActionCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ActionCategory" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityAction */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityAction'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityAction', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityAction" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EntityAction */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityAction" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityAction */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityAction'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityAction', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityAction" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EntityAction */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityAction" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ActionAuthorization */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ActionAuthorization'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ActionAuthorization', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ActionAuthorization" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ActionAuthorization */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ActionAuthorization" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ActionAuthorization */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ActionAuthorization'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ActionAuthorization', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ActionAuthorization" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ActionAuthorization */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ActionAuthorization" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityActionInvocationType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityActionInvocationType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityActionInvocationType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityActionInvocationType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EntityActionInvocationType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityActionInvocationType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityActionInvocationType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityActionInvocationType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityActionInvocationType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityActionInvocationType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EntityActionInvocationType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityActionInvocationType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Action */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Action'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Action', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Action" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Action */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Action" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Action */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Action'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Action', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Action" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Action */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Action" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityActionFilter */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityActionFilter'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityActionFilter', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityActionFilter" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EntityActionFilter */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityActionFilter" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityActionFilter */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityActionFilter'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityActionFilter', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityActionFilter" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EntityActionFilter */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityActionFilter" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ActionFilter */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ActionFilter'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ActionFilter', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ActionFilter" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ActionFilter */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ActionFilter" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ActionFilter */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ActionFilter'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ActionFilter', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ActionFilter" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ActionFilter */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ActionFilter" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ActionContextType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ActionContextType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ActionContextType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ActionContextType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ActionContextType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ActionContextType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ActionContextType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ActionContextType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ActionContextType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ActionContextType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ActionContextType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ActionContextType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ActionResultCode */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ActionResultCode'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ActionResultCode', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ActionResultCode" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ActionResultCode */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ActionResultCode" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ActionResultCode */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ActionResultCode'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ActionResultCode', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ActionResultCode" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ActionResultCode */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ActionResultCode" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ActionContext */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ActionContext'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ActionContext', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ActionContext" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ActionContext */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ActionContext" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ActionContext */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ActionContext'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ActionContext', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ActionContext" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ActionContext */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ActionContext" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ActionParam */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ActionParam'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ActionParam', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ActionParam" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ActionParam */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ActionParam" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ActionParam */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ActionParam'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ActionParam', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ActionParam" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ActionParam */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ActionParam" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ActionLibrary */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ActionLibrary'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ActionLibrary', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ActionLibrary" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ActionLibrary */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ActionLibrary" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ActionLibrary */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ActionLibrary'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ActionLibrary', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ActionLibrary" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ActionLibrary */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ActionLibrary" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Library */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Library'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Library', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Library" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Library */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Library" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Library */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Library'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Library', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Library" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Library */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Library" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ListCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ListCategory'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ListCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ListCategory" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ListCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ListCategory" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ListCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ListCategory'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ListCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ListCategory" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ListCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ListCategory" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CommunicationProvider */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CommunicationProvider'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CommunicationProvider', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CommunicationProvider" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.CommunicationProvider */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CommunicationProvider" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CommunicationProvider */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CommunicationProvider'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CommunicationProvider', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CommunicationProvider" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.CommunicationProvider */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CommunicationProvider" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CommunicationProviderMessageType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CommunicationProviderMessageType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CommunicationProviderMessageType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CommunicationProviderMessageType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.CommunicationProviderMessageType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CommunicationProviderMessageType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CommunicationProviderMessageType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CommunicationProviderMessageType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CommunicationProviderMessageType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CommunicationProviderMessageType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.CommunicationProviderMessageType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CommunicationProviderMessageType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CommunicationBaseMessageType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CommunicationBaseMessageType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CommunicationBaseMessageType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CommunicationBaseMessageType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.CommunicationBaseMessageType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CommunicationBaseMessageType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CommunicationBaseMessageType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CommunicationBaseMessageType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CommunicationBaseMessageType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CommunicationBaseMessageType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.CommunicationBaseMessageType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CommunicationBaseMessageType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Template */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Template'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Template', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Template" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Template */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Template" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Template */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Template'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Template', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Template" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Template */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Template" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TemplateCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TemplateCategory'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TemplateCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TemplateCategory" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.TemplateCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TemplateCategory" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TemplateCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TemplateCategory'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TemplateCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TemplateCategory" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.TemplateCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TemplateCategory" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TemplateContent */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TemplateContent'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TemplateContent', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TemplateContent" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.TemplateContent */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TemplateContent" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TemplateContent */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TemplateContent'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TemplateContent', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TemplateContent" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.TemplateContent */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TemplateContent" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TemplateParam */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TemplateParam'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TemplateParam', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TemplateParam" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.TemplateParam */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TemplateParam" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TemplateParam */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TemplateParam'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TemplateParam', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TemplateParam" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.TemplateParam */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TemplateParam" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TemplateContentType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TemplateContentType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TemplateContentType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TemplateContentType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.TemplateContentType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TemplateContentType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TemplateContentType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TemplateContentType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TemplateContentType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TemplateContentType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.TemplateContentType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TemplateContentType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Recommendation */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Recommendation'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Recommendation', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Recommendation" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Recommendation */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Recommendation" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Recommendation */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Recommendation'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Recommendation', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Recommendation" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Recommendation */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Recommendation" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.RecommendationProvider */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'RecommendationProvider'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'RecommendationProvider', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."RecommendationProvider" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.RecommendationProvider */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."RecommendationProvider" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.RecommendationProvider */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'RecommendationProvider'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'RecommendationProvider', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."RecommendationProvider" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.RecommendationProvider */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."RecommendationProvider" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.RecommendationItem */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'RecommendationItem'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'RecommendationItem', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."RecommendationItem" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.RecommendationItem */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."RecommendationItem" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.RecommendationItem */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'RecommendationItem'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'RecommendationItem', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."RecommendationItem" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.RecommendationItem */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."RecommendationItem" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityCommunicationMessageType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityCommunicationMessageType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityCommunicationMessageType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityCommunicationMessageType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EntityCommunicationMessageType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityCommunicationMessageType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityCommunicationMessageType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityCommunicationMessageType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityCommunicationMessageType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityCommunicationMessageType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EntityCommunicationMessageType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityCommunicationMessageType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityCommunicationField */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityCommunicationField'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityCommunicationField', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityCommunicationField" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EntityCommunicationField */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityCommunicationField" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityCommunicationField */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityCommunicationField'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityCommunicationField', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityCommunicationField" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EntityCommunicationField */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityCommunicationField" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.LibraryItem */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'LibraryItem'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'LibraryItem', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."LibraryItem" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.LibraryItem */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."LibraryItem" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.LibraryItem */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'LibraryItem'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'LibraryItem', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."LibraryItem" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.LibraryItem */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."LibraryItem" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityRelationshipDisplayComponent */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityRelationshipDisplayComponent'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityRelationshipDisplayComponent', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityRelationshipDisplayComponent" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EntityRelationshipDisplayComponent */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityRelationshipDisplayComponent" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityRelationshipDisplayComponent */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityRelationshipDisplayComponent'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityRelationshipDisplayComponent', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityRelationshipDisplayComponent" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EntityRelationshipDisplayComponent */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityRelationshipDisplayComponent" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityActionParam */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityActionParam'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityActionParam', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityActionParam" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EntityActionParam */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityActionParam" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityActionParam */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityActionParam'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityActionParam', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityActionParam" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EntityActionParam */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityActionParam" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ResourcePermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ResourcePermission'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ResourcePermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ResourcePermission" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ResourcePermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ResourcePermission" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ResourcePermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ResourcePermission'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ResourcePermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ResourcePermission" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ResourcePermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ResourcePermission" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ResourceLink */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ResourceLink'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ResourceLink', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ResourceLink" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ResourceLink */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ResourceLink" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ResourceLink */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ResourceLink'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ResourceLink', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ResourceLink" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ResourceLink */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ResourceLink" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentArtifactType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentArtifactType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentArtifactType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentArtifactType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentArtifactType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentArtifactType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentArtifactType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentArtifactType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentArtifactType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentArtifactType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentArtifactType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentArtifactType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ConversationArtifactVersion */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ConversationArtifactVersion'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ConversationArtifactVersion', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ConversationArtifactVersion" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ConversationArtifactVersion */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ConversationArtifactVersion" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ConversationArtifactVersion */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ConversationArtifactVersion'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ConversationArtifactVersion', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ConversationArtifactVersion" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ConversationArtifactVersion */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ConversationArtifactVersion" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentRequest */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentRequest'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentRequest', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentRequest" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentRequest */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentRequest" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentRequest */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentRequest'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentRequest', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentRequest" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentRequest */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentRequest" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.PermissionDomain */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'PermissionDomain'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'PermissionDomain', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."PermissionDomain" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.PermissionDomain */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."PermissionDomain" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.PermissionDomain */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'PermissionDomain'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'PermissionDomain', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."PermissionDomain" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.PermissionDomain */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."PermissionDomain" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SearchScopeEntity */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SearchScopeEntity'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SearchScopeEntity', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SearchScopeEntity" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.SearchScopeEntity */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SearchScopeEntity" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SearchScopeEntity */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SearchScopeEntity'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SearchScopeEntity', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SearchScopeEntity" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.SearchScopeEntity */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SearchScopeEntity" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MCPServer */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MCPServer'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MCPServer', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MCPServer" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.MCPServer */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MCPServer" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MCPServer */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MCPServer'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MCPServer', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MCPServer" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.MCPServer */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MCPServer" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.OpenAppDependency */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'OpenAppDependency'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'OpenAppDependency', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."OpenAppDependency" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.OpenAppDependency */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."OpenAppDependency" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.OpenAppDependency */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'OpenAppDependency'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'OpenAppDependency', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."OpenAppDependency" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.OpenAppDependency */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."OpenAppDependency" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIVendorTypeDefinition */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIVendorTypeDefinition'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIVendorTypeDefinition', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIVendorTypeDefinition" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIVendorTypeDefinition */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIVendorTypeDefinition" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIVendorTypeDefinition */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIVendorTypeDefinition'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIVendorTypeDefinition', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIVendorTypeDefinition" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIVendorTypeDefinition */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIVendorTypeDefinition" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentSearchScope */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentSearchScope'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentSearchScope', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentSearchScope" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentSearchScope */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentSearchScope" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentSearchScope */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentSearchScope'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentSearchScope', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentSearchScope" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentSearchScope */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentSearchScope" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EncryptionKey */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EncryptionKey'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EncryptionKey', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EncryptionKey" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EncryptionKey */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EncryptionKey" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EncryptionKey */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EncryptionKey'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EncryptionKey', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EncryptionKey" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EncryptionKey */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EncryptionKey" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.QueryEntity */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'QueryEntity'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'QueryEntity', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."QueryEntity" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.QueryEntity */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."QueryEntity" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.QueryEntity */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'QueryEntity'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'QueryEntity', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."QueryEntity" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.QueryEntity */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."QueryEntity" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MCPToolFavorite */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MCPToolFavorite'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MCPToolFavorite', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MCPToolFavorite" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.MCPToolFavorite */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MCPToolFavorite" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MCPToolFavorite */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MCPToolFavorite'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MCPToolFavorite', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MCPToolFavorite" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.MCPToolFavorite */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MCPToolFavorite" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Component */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Component'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Component', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Component" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Component */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Component" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Component */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Component'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Component', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Component" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Component */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Component" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AccessControlRule */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AccessControlRule'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AccessControlRule', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AccessControlRule" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AccessControlRule */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AccessControlRule" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AccessControlRule */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AccessControlRule'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AccessControlRule', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AccessControlRule" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AccessControlRule */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AccessControlRule" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ArtifactUse */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ArtifactUse'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ArtifactUse', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ArtifactUse" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ArtifactUse */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ArtifactUse" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ArtifactUse */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ArtifactUse'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ArtifactUse', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ArtifactUse" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ArtifactUse */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ArtifactUse" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.PublicLink */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'PublicLink'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'PublicLink', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."PublicLink" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.PublicLink */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."PublicLink" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.PublicLink */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'PublicLink'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'PublicLink', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."PublicLink" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.PublicLink */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."PublicLink" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentModality */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentModality'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentModality', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentModality" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentModality */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentModality" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentModality */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentModality'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentModality', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentModality" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentModality */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentModality" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ArtifactType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ArtifactType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ArtifactType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ArtifactType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ArtifactType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ArtifactType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ArtifactType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ArtifactType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ArtifactType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ArtifactType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ArtifactType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ArtifactType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIModelModality */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIModelModality'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIModelModality', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIModelModality" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIModelModality */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIModelModality" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIModelModality */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIModelModality'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIModelModality', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIModelModality" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIModelModality */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIModelModality" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIVendorType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIVendorType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIVendorType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIVendorType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIVendorType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIVendorType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIVendorType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIVendorType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIVendorType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIVendorType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIVendorType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIVendorType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Artifact */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Artifact'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Artifact', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Artifact" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Artifact */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Artifact" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Artifact */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Artifact'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Artifact', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Artifact" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Artifact */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Artifact" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.IntegrationObjectField */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'IntegrationObjectField'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'IntegrationObjectField', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."IntegrationObjectField" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.IntegrationObjectField */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."IntegrationObjectField" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.IntegrationObjectField */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'IntegrationObjectField'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'IntegrationObjectField', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."IntegrationObjectField" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.IntegrationObjectField */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."IntegrationObjectField" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ListInvitation */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ListInvitation'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ListInvitation', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ListInvitation" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ListInvitation */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ListInvitation" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ListInvitation */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ListInvitation'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ListInvitation', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ListInvitation" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ListInvitation */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ListInvitation" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Credential */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Credential'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Credential', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Credential" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Credential */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Credential" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Credential */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Credential'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Credential', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Credential" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Credential */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Credential" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SearchScopeTestQuery */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SearchScopeTestQuery'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SearchScopeTestQuery', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SearchScopeTestQuery" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.SearchScopeTestQuery */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SearchScopeTestQuery" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SearchScopeTestQuery */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SearchScopeTestQuery'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SearchScopeTestQuery', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SearchScopeTestQuery" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.SearchScopeTestQuery */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SearchScopeTestQuery" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TestSuite */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TestSuite'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TestSuite', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TestSuite" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.TestSuite */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TestSuite" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TestSuite */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TestSuite'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TestSuite', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TestSuite" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.TestSuite */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TestSuite" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TagSuggestion */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TagSuggestion'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TagSuggestion', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TagSuggestion" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.TagSuggestion */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TagSuggestion" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TagSuggestion */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TagSuggestion'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TagSuggestion', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TagSuggestion" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.TagSuggestion */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TagSuggestion" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ConversationArtifact */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ConversationArtifact'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ConversationArtifact', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ConversationArtifact" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ConversationArtifact */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ConversationArtifact" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ConversationArtifact */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ConversationArtifact'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ConversationArtifact', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ConversationArtifact" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ConversationArtifact */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ConversationArtifact" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TestRunOutputType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TestRunOutputType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TestRunOutputType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TestRunOutputType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.TestRunOutputType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TestRunOutputType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TestRunOutputType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TestRunOutputType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TestRunOutputType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TestRunOutputType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.TestRunOutputType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TestRunOutputType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CollectionPermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CollectionPermission'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CollectionPermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CollectionPermission" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.CollectionPermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CollectionPermission" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CollectionPermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CollectionPermission'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CollectionPermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CollectionPermission" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.CollectionPermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CollectionPermission" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentPrompt */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentPrompt'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentPrompt', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentPrompt" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentPrompt */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentPrompt" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentPrompt */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentPrompt'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentPrompt', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentPrompt" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentPrompt */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentPrompt" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.QuerySQL */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'QuerySQL'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'QuerySQL', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."QuerySQL" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.QuerySQL */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."QuerySQL" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.QuerySQL */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'QuerySQL'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'QuerySQL', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."QuerySQL" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.QuerySQL */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."QuerySQL" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.APIKeyScope */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'APIKeyScope'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'APIKeyScope', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."APIKeyScope" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.APIKeyScope */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."APIKeyScope" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.APIKeyScope */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'APIKeyScope'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'APIKeyScope', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."APIKeyScope" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.APIKeyScope */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."APIKeyScope" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ContentItemDuplicate */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ContentItemDuplicate'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ContentItemDuplicate', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ContentItemDuplicate" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ContentItemDuplicate */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ContentItemDuplicate" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ContentItemDuplicate */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ContentItemDuplicate'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ContentItemDuplicate', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ContentItemDuplicate" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ContentItemDuplicate */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ContentItemDuplicate" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.InstanceConfiguration */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'InstanceConfiguration'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'InstanceConfiguration', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."InstanceConfiguration" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.InstanceConfiguration */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."InstanceConfiguration" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.InstanceConfiguration */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'InstanceConfiguration'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'InstanceConfiguration', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."InstanceConfiguration" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.InstanceConfiguration */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."InstanceConfiguration" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.DashboardCategoryPermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'DashboardCategoryPermission'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'DashboardCategoryPermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."DashboardCategoryPermission" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.DashboardCategoryPermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."DashboardCategoryPermission" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.DashboardCategoryPermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'DashboardCategoryPermission'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'DashboardCategoryPermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."DashboardCategoryPermission" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.DashboardCategoryPermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."DashboardCategoryPermission" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.VersionLabel */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'VersionLabel'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'VersionLabel', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."VersionLabel" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.VersionLabel */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."VersionLabel" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.VersionLabel */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'VersionLabel'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'VersionLabel', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."VersionLabel" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.VersionLabel */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."VersionLabel" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ComponentLibrary */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ComponentLibrary'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ComponentLibrary', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ComponentLibrary" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ComponentLibrary */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ComponentLibrary" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ComponentLibrary */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ComponentLibrary'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ComponentLibrary', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ComponentLibrary" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ComponentLibrary */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ComponentLibrary" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SearchScopePermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SearchScopePermission'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SearchScopePermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SearchScopePermission" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.SearchScopePermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SearchScopePermission" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SearchScopePermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SearchScopePermission'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SearchScopePermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SearchScopePermission" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.SearchScopePermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SearchScopePermission" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ScheduledJobType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ScheduledJobType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ScheduledJobType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ScheduledJobType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ScheduledJobType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ScheduledJobType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ScheduledJobType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ScheduledJobType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ScheduledJobType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ScheduledJobType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ScheduledJobType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ScheduledJobType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIClientToolDefinition */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIClientToolDefinition'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIClientToolDefinition', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIClientToolDefinition" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIClientToolDefinition */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIClientToolDefinition" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIClientToolDefinition */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIClientToolDefinition'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIClientToolDefinition', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIClientToolDefinition" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIClientToolDefinition */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIClientToolDefinition" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.QueryParameter */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'QueryParameter'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'QueryParameter', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."QueryParameter" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.QueryParameter */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."QueryParameter" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.QueryParameter */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'QueryParameter'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'QueryParameter', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."QueryParameter" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.QueryParameter */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."QueryParameter" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.RecordGeoCode */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'RecordGeoCode'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'RecordGeoCode', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."RecordGeoCode" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.RecordGeoCode */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."RecordGeoCode" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.RecordGeoCode */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'RecordGeoCode'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'RecordGeoCode', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."RecordGeoCode" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.RecordGeoCode */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."RecordGeoCode" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentPermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentPermission'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentPermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentPermission" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentPermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentPermission" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentPermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentPermission'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentPermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentPermission" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentPermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentPermission" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.APIApplicationScope */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'APIApplicationScope'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'APIApplicationScope', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."APIApplicationScope" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.APIApplicationScope */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."APIApplicationScope" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.APIApplicationScope */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'APIApplicationScope'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'APIApplicationScope', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."APIApplicationScope" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.APIApplicationScope */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."APIApplicationScope" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SignatureProvider */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SignatureProvider'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SignatureProvider', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SignatureProvider" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.SignatureProvider */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SignatureProvider" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SignatureProvider */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SignatureProvider'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SignatureProvider', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SignatureProvider" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.SignatureProvider */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SignatureProvider" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIArchitecture */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIArchitecture'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIArchitecture', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIArchitecture" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIArchitecture */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIArchitecture" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIArchitecture */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIArchitecture'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIArchitecture', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIArchitecture" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIArchitecture */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIArchitecture" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentRelationship */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentRelationship'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentRelationship', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentRelationship" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentRelationship */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentRelationship" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentRelationship */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentRelationship'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentRelationship', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentRelationship" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentRelationship */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentRelationship" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.APIScope */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'APIScope'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'APIScope', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."APIScope" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.APIScope */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."APIScope" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.APIScope */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'APIScope'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'APIScope', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."APIScope" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.APIScope */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."APIScope" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ComponentLibraryLink */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ComponentLibraryLink'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ComponentLibraryLink', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ComponentLibraryLink" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ComponentLibraryLink */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ComponentLibraryLink" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ComponentLibraryLink */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ComponentLibraryLink'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ComponentLibraryLink', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ComponentLibraryLink" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ComponentLibraryLink */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ComponentLibraryLink" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIModelArchitecture */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIModelArchitecture'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIModelArchitecture', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIModelArchitecture" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIModelArchitecture */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIModelArchitecture" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIModelArchitecture */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIModelArchitecture'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIModelArchitecture', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIModelArchitecture" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIModelArchitecture */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIModelArchitecture" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.GeneratedCode */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'GeneratedCode'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'GeneratedCode', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."GeneratedCode" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.GeneratedCode */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."GeneratedCode" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.GeneratedCode */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'GeneratedCode'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'GeneratedCode', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."GeneratedCode" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.GeneratedCode */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."GeneratedCode" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityOrganicKey */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityOrganicKey'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityOrganicKey', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityOrganicKey" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EntityOrganicKey */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityOrganicKey" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityOrganicKey */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityOrganicKey'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityOrganicKey', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityOrganicKey" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EntityOrganicKey */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityOrganicKey" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CredentialCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CredentialCategory'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CredentialCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CredentialCategory" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.CredentialCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CredentialCategory" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CredentialCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CredentialCategory'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CredentialCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CredentialCategory" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.CredentialCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CredentialCategory" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SearchScopeExternalIndex */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SearchScopeExternalIndex'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SearchScopeExternalIndex', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SearchScopeExternalIndex" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.SearchScopeExternalIndex */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SearchScopeExternalIndex" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SearchScopeExternalIndex */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SearchScopeExternalIndex'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SearchScopeExternalIndex', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SearchScopeExternalIndex" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.SearchScopeExternalIndex */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SearchScopeExternalIndex" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.DashboardPermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'DashboardPermission'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'DashboardPermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."DashboardPermission" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.DashboardPermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."DashboardPermission" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.DashboardPermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'DashboardPermission'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'DashboardPermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."DashboardPermission" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.DashboardPermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."DashboardPermission" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.UserNotificationType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'UserNotificationType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'UserNotificationType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."UserNotificationType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.UserNotificationType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."UserNotificationType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.UserNotificationType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'UserNotificationType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'UserNotificationType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."UserNotificationType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.UserNotificationType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."UserNotificationType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MCPServerConnection */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MCPServerConnection'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MCPServerConnection', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MCPServerConnection" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.MCPServerConnection */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MCPServerConnection" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MCPServerConnection */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MCPServerConnection'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MCPServerConnection', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MCPServerConnection" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.MCPServerConnection */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MCPServerConnection" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIModality */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIModality'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIModality', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIModality" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIModality */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIModality" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIModality */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIModality'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIModality', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIModality" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIModality */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIModality" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AICredentialBinding */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AICredentialBinding'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AICredentialBinding', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AICredentialBinding" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AICredentialBinding */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AICredentialBinding" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AICredentialBinding */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AICredentialBinding'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AICredentialBinding', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AICredentialBinding" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AICredentialBinding */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AICredentialBinding" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TagCoOccurrence */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TagCoOccurrence'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TagCoOccurrence', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TagCoOccurrence" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.TagCoOccurrence */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TagCoOccurrence" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TagCoOccurrence */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TagCoOccurrence'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TagCoOccurrence', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TagCoOccurrence" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.TagCoOccurrence */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TagCoOccurrence" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Project */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Project'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Project', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Project" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Project */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Project" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Project */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Project'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Project', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Project" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Project */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Project" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ConversationArtifactPermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ConversationArtifactPermission'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ConversationArtifactPermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ConversationArtifactPermission" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ConversationArtifactPermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ConversationArtifactPermission" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ConversationArtifactPermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ConversationArtifactPermission'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ConversationArtifactPermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ConversationArtifactPermission" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ConversationArtifactPermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ConversationArtifactPermission" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.FileStorageAccountPermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'FileStorageAccountPermission'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'FileStorageAccountPermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."FileStorageAccountPermission" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.FileStorageAccountPermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."FileStorageAccountPermission" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.FileStorageAccountPermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'FileStorageAccountPermission'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'FileStorageAccountPermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."FileStorageAccountPermission" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.FileStorageAccountPermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."FileStorageAccountPermission" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Country */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Country'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Country', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Country" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Country */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Country" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Country */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Country'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Country', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Country" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Country */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Country" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIModelPriceUnitType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIModelPriceUnitType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIModelPriceUnitType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIModelPriceUnitType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIModelPriceUnitType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIModelPriceUnitType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIModelPriceUnitType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIModelPriceUnitType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIModelPriceUnitType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIModelPriceUnitType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIModelPriceUnitType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIModelPriceUnitType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ArtifactVersion */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ArtifactVersion'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ArtifactVersion', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ArtifactVersion" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ArtifactVersion */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ArtifactVersion" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ArtifactVersion */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ArtifactVersion'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ArtifactVersion', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ArtifactVersion" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ArtifactVersion */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ArtifactVersion" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SignatureRequestDocument */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SignatureRequestDocument'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SignatureRequestDocument', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SignatureRequestDocument" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.SignatureRequestDocument */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SignatureRequestDocument" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SignatureRequestDocument */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SignatureRequestDocument'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SignatureRequestDocument', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SignatureRequestDocument" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.SignatureRequestDocument */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SignatureRequestDocument" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SignatureRequestRecipient */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SignatureRequestRecipient'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SignatureRequestRecipient', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SignatureRequestRecipient" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.SignatureRequestRecipient */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SignatureRequestRecipient" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SignatureRequestRecipient */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SignatureRequestRecipient'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SignatureRequestRecipient', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SignatureRequestRecipient" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.SignatureRequestRecipient */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SignatureRequestRecipient" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentStepPath */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentStepPath'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentStepPath', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentStepPath" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentStepPath */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentStepPath" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentStepPath */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentStepPath'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentStepPath', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentStepPath" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentStepPath */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentStepPath" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentLearningCycle */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentLearningCycle'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentLearningCycle', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentLearningCycle" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentLearningCycle */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentLearningCycle" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentLearningCycle */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentLearningCycle'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentLearningCycle', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentLearningCycle" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentLearningCycle */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentLearningCycle" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MCPServerTool */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MCPServerTool'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MCPServerTool', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MCPServerTool" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.MCPServerTool */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MCPServerTool" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MCPServerTool */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MCPServerTool'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MCPServerTool', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MCPServerTool" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.MCPServerTool */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MCPServerTool" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.FileStorageAccount */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'FileStorageAccount'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'FileStorageAccount', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."FileStorageAccount" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.FileStorageAccount */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."FileStorageAccount" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.FileStorageAccount */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'FileStorageAccount'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'FileStorageAccount', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."FileStorageAccount" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.FileStorageAccount */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."FileStorageAccount" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.IntegrationSourceType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'IntegrationSourceType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'IntegrationSourceType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."IntegrationSourceType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.IntegrationSourceType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."IntegrationSourceType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.IntegrationSourceType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'IntegrationSourceType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'IntegrationSourceType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."IntegrationSourceType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.IntegrationSourceType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."IntegrationSourceType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SearchProvider */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SearchProvider'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SearchProvider', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SearchProvider" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.SearchProvider */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SearchProvider" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SearchProvider */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SearchProvider'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SearchProvider', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SearchProvider" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.SearchProvider */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SearchProvider" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CompanyIntegrationFieldMap */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CompanyIntegrationFieldMap'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CompanyIntegrationFieldMap', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CompanyIntegrationFieldMap" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.CompanyIntegrationFieldMap */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CompanyIntegrationFieldMap" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CompanyIntegrationFieldMap */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CompanyIntegrationFieldMap'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CompanyIntegrationFieldMap', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CompanyIntegrationFieldMap" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.CompanyIntegrationFieldMap */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CompanyIntegrationFieldMap" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.APIKeyApplication */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'APIKeyApplication'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'APIKeyApplication', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."APIKeyApplication" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.APIKeyApplication */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."APIKeyApplication" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.APIKeyApplication */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'APIKeyApplication'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'APIKeyApplication', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."APIKeyApplication" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.APIKeyApplication */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."APIKeyApplication" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TagSynonym */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TagSynonym'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TagSynonym', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TagSynonym" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.TagSynonym */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TagSynonym" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TagSynonym */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TagSynonym'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TagSynonym', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TagSynonym" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.TagSynonym */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TagSynonym" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.DashboardCategoryLink */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'DashboardCategoryLink'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'DashboardCategoryLink', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."DashboardCategoryLink" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.DashboardCategoryLink */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."DashboardCategoryLink" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.DashboardCategoryLink */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'DashboardCategoryLink'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'DashboardCategoryLink', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."DashboardCategoryLink" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.DashboardCategoryLink */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."DashboardCategoryLink" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIConfigurationParam */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIConfigurationParam'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIConfigurationParam', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIConfigurationParam" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIConfigurationParam */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIConfigurationParam" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIConfigurationParam */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIConfigurationParam'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIConfigurationParam', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIConfigurationParam" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIConfigurationParam */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIConfigurationParam" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TagScope */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TagScope'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TagScope', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TagScope" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.TagScope */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TagScope" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.TagScope */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'TagScope'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'TagScope', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."TagScope" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.TagScope */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."TagScope" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ArtifactVersionAttribute */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ArtifactVersionAttribute'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ArtifactVersionAttribute', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ArtifactVersionAttribute" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ArtifactVersionAttribute */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ArtifactVersionAttribute" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ArtifactVersionAttribute */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ArtifactVersionAttribute'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ArtifactVersionAttribute', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ArtifactVersionAttribute" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ArtifactVersionAttribute */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ArtifactVersionAttribute" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.IntegrationObject */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'IntegrationObject'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'IntegrationObject', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."IntegrationObject" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.IntegrationObject */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."IntegrationObject" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.IntegrationObject */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'IntegrationObject'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'IntegrationObject', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."IntegrationObject" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.IntegrationObject */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."IntegrationObject" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentDataSource */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentDataSource'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentDataSource', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentDataSource" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentDataSource */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentDataSource" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentDataSource */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentDataSource'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentDataSource', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentDataSource" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentDataSource */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentDataSource" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.StateProvince */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'StateProvince'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'StateProvince', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."StateProvince" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.StateProvince */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."StateProvince" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.StateProvince */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'StateProvince'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'StateProvince', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."StateProvince" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.StateProvince */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."StateProvince" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ScheduledJob */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ScheduledJob'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ScheduledJob', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ScheduledJob" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ScheduledJob */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ScheduledJob" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ScheduledJob */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ScheduledJob'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ScheduledJob', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ScheduledJob" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ScheduledJob */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ScheduledJob" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIModelCost */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIModelCost'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIModelCost', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIModelCost" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIModelCost */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIModelCost" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIModelCost */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIModelCost'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIModelCost', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIModelCost" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIModelCost */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIModelCost" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MagicLinkInvite */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MagicLinkInvite'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MagicLinkInvite', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MagicLinkInvite" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.MagicLinkInvite */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MagicLinkInvite" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MagicLinkInvite */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MagicLinkInvite'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MagicLinkInvite', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MagicLinkInvite" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.MagicLinkInvite */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MagicLinkInvite" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MagicLinkRedemption */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MagicLinkRedemption'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MagicLinkRedemption', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MagicLinkRedemption" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.MagicLinkRedemption */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MagicLinkRedemption" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MagicLinkRedemption */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MagicLinkRedemption'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MagicLinkRedemption', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MagicLinkRedemption" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.MagicLinkRedemption */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MagicLinkRedemption" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MagicLinkInviteApplication */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MagicLinkInviteApplication'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MagicLinkInviteApplication', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MagicLinkInviteApplication" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.MagicLinkInviteApplication */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MagicLinkInviteApplication" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MagicLinkInviteApplication */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MagicLinkInviteApplication'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MagicLinkInviteApplication', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MagicLinkInviteApplication" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.MagicLinkInviteApplication */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MagicLinkInviteApplication" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MagicLinkInviteRole */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MagicLinkInviteRole'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MagicLinkInviteRole', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MagicLinkInviteRole" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.MagicLinkInviteRole */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MagicLinkInviteRole" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MagicLinkInviteRole */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MagicLinkInviteRole'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MagicLinkInviteRole', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MagicLinkInviteRole" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.MagicLinkInviteRole */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MagicLinkInviteRole" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MagicLinkInviteAllowedDomain */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MagicLinkInviteAllowedDomain'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MagicLinkInviteAllowedDomain', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MagicLinkInviteAllowedDomain" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.MagicLinkInviteAllowedDomain */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MagicLinkInviteAllowedDomain" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MagicLinkInviteAllowedDomain */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MagicLinkInviteAllowedDomain'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MagicLinkInviteAllowedDomain', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MagicLinkInviteAllowedDomain" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.MagicLinkInviteAllowedDomain */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MagicLinkInviteAllowedDomain" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MagicLinkInviteAllowedPath */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MagicLinkInviteAllowedPath'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MagicLinkInviteAllowedPath', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MagicLinkInviteAllowedPath" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.MagicLinkInviteAllowedPath */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MagicLinkInviteAllowedPath" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MagicLinkInviteAllowedPath */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MagicLinkInviteAllowedPath'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MagicLinkInviteAllowedPath', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MagicLinkInviteAllowedPath" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.MagicLinkInviteAllowedPath */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MagicLinkInviteAllowedPath" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ClusterAnalysisCluster */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ClusterAnalysisCluster'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ClusterAnalysisCluster', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ClusterAnalysisCluster" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ClusterAnalysisCluster */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ClusterAnalysisCluster" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ClusterAnalysisCluster */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ClusterAnalysisCluster'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ClusterAnalysisCluster', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ClusterAnalysisCluster" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ClusterAnalysisCluster */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ClusterAnalysisCluster" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ClusterAnalysis */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ClusterAnalysis'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ClusterAnalysis', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ClusterAnalysis" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ClusterAnalysis */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ClusterAnalysis" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ClusterAnalysis */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ClusterAnalysis'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ClusterAnalysis', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ClusterAnalysis" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ClusterAnalysis */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ClusterAnalysis" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ViewType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ViewType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ViewType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ViewType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ViewType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ViewType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ViewType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ViewType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ViewType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ViewType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ViewType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ViewType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Application */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Application'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Application', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Application" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Application */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Application" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Application */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Application'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Application', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Application" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Application */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Application" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SignatureAccount */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SignatureAccount'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SignatureAccount', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SignatureAccount" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.SignatureAccount */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SignatureAccount" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SignatureAccount */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SignatureAccount'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SignatureAccount', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SignatureAccount" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.SignatureAccount */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SignatureAccount" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentChannel */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentChannel'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentChannel', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentChannel" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentChannel */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentChannel" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentChannel */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentChannel'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentChannel', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentChannel" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentChannel */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentChannel" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentSessionChannel */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentSessionChannel'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentSessionChannel', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentSessionChannel" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentSessionChannel */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentSessionChannel" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentSessionChannel */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentSessionChannel'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentSessionChannel', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentSessionChannel" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentSessionChannel */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentSessionChannel" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentCoAgent */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentCoAgent'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentCoAgent', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentCoAgent" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentCoAgent */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentCoAgent" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentCoAgent */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentCoAgent'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentCoAgent', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentCoAgent" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentCoAgent */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentCoAgent" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIBridgeProviderChannel */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIBridgeProviderChannel'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIBridgeProviderChannel', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIBridgeProviderChannel" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIBridgeProviderChannel */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIBridgeProviderChannel" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIBridgeProviderChannel */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIBridgeProviderChannel'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIBridgeProviderChannel', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIBridgeProviderChannel" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIBridgeProviderChannel */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIBridgeProviderChannel" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIBridgeProvider */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIBridgeProvider'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIBridgeProvider', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIBridgeProvider" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIBridgeProvider */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIBridgeProvider" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIBridgeProvider */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIBridgeProvider'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIBridgeProvider', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIBridgeProvider" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIBridgeProvider */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIBridgeProvider" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIBridgeAgentIdentity */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIBridgeAgentIdentity'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIBridgeAgentIdentity', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIBridgeAgentIdentity" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIBridgeAgentIdentity */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIBridgeAgentIdentity" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIBridgeAgentIdentity */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIBridgeAgentIdentity'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIBridgeAgentIdentity', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIBridgeAgentIdentity" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIBridgeAgentIdentity */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIBridgeAgentIdentity" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentSessionBridgeParticipant */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentSessionBridgeParticipant'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentSessionBridgeParticipant', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentSessionBridgeParticipant" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentSessionBridgeParticipant */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentSessionBridgeParticipant" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentSessionBridgeParticipant */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentSessionBridgeParticipant'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentSessionBridgeParticipant', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentSessionBridgeParticipant" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentSessionBridgeParticipant */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentSessionBridgeParticipant" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentSessionBridge */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentSessionBridge'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentSessionBridge', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentSessionBridge" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentSessionBridge */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentSessionBridge" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentSessionBridge */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentSessionBridge'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentSessionBridge', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentSessionBridge" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentSessionBridge */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentSessionBridge" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Task */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Task'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Task', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Task" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Task */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Task" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Task */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Task'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Task', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Task" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Task */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Task" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentSession */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentSession'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentSession', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentSession" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentSession */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentSession" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentSession */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentSession'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentSession', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentSession" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentSession */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentSession" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityDocument */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityDocument'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityDocument', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityDocument" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EntityDocument */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityDocument" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityDocument */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityDocument'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityDocument', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityDocument" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EntityDocument */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityDocument" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentExample */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentExample'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentExample', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentExample" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentExample */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentExample" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentExample */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentExample'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentExample', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentExample" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentExample */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentExample" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentNote */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentNote'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentNote', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentNote" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentNote */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentNote" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentNote */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentNote'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentNote', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentNote" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentNote */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentNote" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIRemoteBrowserProvider */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIRemoteBrowserProvider'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIRemoteBrowserProvider', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIRemoteBrowserProvider" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIRemoteBrowserProvider */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIRemoteBrowserProvider" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIRemoteBrowserProvider */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIRemoteBrowserProvider'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIRemoteBrowserProvider', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIRemoteBrowserProvider" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIRemoteBrowserProvider */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIRemoteBrowserProvider" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SystemEvent */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SystemEvent'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SystemEvent', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SystemEvent" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.SystemEvent */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SystemEvent" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.SystemEvent */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'SystemEvent'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'SystemEvent', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."SystemEvent" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.SystemEvent */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."SystemEvent" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityFormOverride */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityFormOverride'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityFormOverride', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityFormOverride" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EntityFormOverride */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityFormOverride" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityFormOverride */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityFormOverride'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityFormOverride', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityFormOverride" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EntityFormOverride */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityFormOverride" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Integration */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Integration'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Integration', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Integration" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Integration */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Integration" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Integration */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Integration'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Integration', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Integration" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Integration */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Integration" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.RecordProcessCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'RecordProcessCategory'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'RecordProcessCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."RecordProcessCategory" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.RecordProcessCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."RecordProcessCategory" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.RecordProcessCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'RecordProcessCategory'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'RecordProcessCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."RecordProcessCategory" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.RecordProcessCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."RecordProcessCategory" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.RemoteOperationCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'RemoteOperationCategory'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'RemoteOperationCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."RemoteOperationCategory" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.RemoteOperationCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."RemoteOperationCategory" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.RemoteOperationCategory */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'RemoteOperationCategory'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'RemoteOperationCategory', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."RemoteOperationCategory" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.RemoteOperationCategory */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."RemoteOperationCategory" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.RecordProcessWatermark */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'RecordProcessWatermark'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'RecordProcessWatermark', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."RecordProcessWatermark" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.RecordProcessWatermark */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."RecordProcessWatermark" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.RecordProcessWatermark */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'RecordProcessWatermark'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'RecordProcessWatermark', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."RecordProcessWatermark" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.RecordProcessWatermark */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."RecordProcessWatermark" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ProcessRunDetail */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ProcessRunDetail'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ProcessRunDetail', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ProcessRunDetail" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ProcessRunDetail */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ProcessRunDetail" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ProcessRunDetail */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ProcessRunDetail'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ProcessRunDetail', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ProcessRunDetail" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ProcessRunDetail */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ProcessRunDetail" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.RemoteOperation */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'RemoteOperation'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'RemoteOperation', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."RemoteOperation" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.RemoteOperation */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."RemoteOperation" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.RemoteOperation */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'RemoteOperation'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'RemoteOperation', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."RemoteOperation" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.RemoteOperation */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."RemoteOperation" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ProcessRun */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ProcessRun'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ProcessRun', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ProcessRun" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ProcessRun */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ProcessRun" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ProcessRun */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ProcessRun'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ProcessRun', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ProcessRun" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ProcessRun */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ProcessRun" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.RecordProcess */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'RecordProcess'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'RecordProcess', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."RecordProcess" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.RecordProcess */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."RecordProcess" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.RecordProcess */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'RecordProcess'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'RecordProcess', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."RecordProcess" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.RecordProcess */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."RecordProcess" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MLAlgorithm */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MLAlgorithm'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MLAlgorithm', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MLAlgorithm" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.MLAlgorithm */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MLAlgorithm" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MLAlgorithm */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MLAlgorithm'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MLAlgorithm', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MLAlgorithm" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.MLAlgorithm */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MLAlgorithm" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ExperimentSessionIteration */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ExperimentSessionIteration'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ExperimentSessionIteration', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ExperimentSessionIteration" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ExperimentSessionIteration */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ExperimentSessionIteration" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ExperimentSessionIteration */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ExperimentSessionIteration'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ExperimentSessionIteration', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ExperimentSessionIteration" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ExperimentSessionIteration */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ExperimentSessionIteration" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MLTrainingPipeline */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MLTrainingPipeline'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MLTrainingPipeline', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MLTrainingPipeline" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.MLTrainingPipeline */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MLTrainingPipeline" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MLTrainingPipeline */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MLTrainingPipeline'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MLTrainingPipeline', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MLTrainingPipeline" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.MLTrainingPipeline */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MLTrainingPipeline" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MLTrainingRun */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MLTrainingRun'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MLTrainingRun', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MLTrainingRun" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.MLTrainingRun */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MLTrainingRun" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MLTrainingRun */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MLTrainingRun'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MLTrainingRun', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MLTrainingRun" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.MLTrainingRun */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MLTrainingRun" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.OpenApp */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'OpenApp'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'OpenApp', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."OpenApp" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.OpenApp */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."OpenApp" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.OpenApp */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'OpenApp'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'OpenApp', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."OpenApp" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.OpenApp */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."OpenApp" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MLAlgorithmUseCaseRanking */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MLAlgorithmUseCaseRanking'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MLAlgorithmUseCaseRanking', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MLAlgorithmUseCaseRanking" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.MLAlgorithmUseCaseRanking */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MLAlgorithmUseCaseRanking" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MLAlgorithmUseCaseRanking */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MLAlgorithmUseCaseRanking'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MLAlgorithmUseCaseRanking', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MLAlgorithmUseCaseRanking" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.MLAlgorithmUseCaseRanking */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MLAlgorithmUseCaseRanking" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MLAlgorithmUseCase */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MLAlgorithmUseCase'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MLAlgorithmUseCase', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MLAlgorithmUseCase" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.MLAlgorithmUseCase */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MLAlgorithmUseCase" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MLAlgorithmUseCase */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MLAlgorithmUseCase'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MLAlgorithmUseCase', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MLAlgorithmUseCase" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.MLAlgorithmUseCase */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MLAlgorithmUseCase" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Experiment */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Experiment'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Experiment', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Experiment" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Experiment */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Experiment" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Experiment */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Experiment'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Experiment', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Experiment" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Experiment */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Experiment" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ExperimentSession */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ExperimentSession'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ExperimentSession', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ExperimentSession" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ExperimentSession */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ExperimentSession" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ExperimentSession */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ExperimentSession'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ExperimentSession', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ExperimentSession" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ExperimentSession */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ExperimentSession" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MLModelScoringBinding */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MLModelScoringBinding'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MLModelScoringBinding', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MLModelScoringBinding" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.MLModelScoringBinding */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MLModelScoringBinding" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MLModelScoringBinding */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MLModelScoringBinding'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MLModelScoringBinding', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MLModelScoringBinding" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.MLModelScoringBinding */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MLModelScoringBinding" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MLModel */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MLModel'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MLModel', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MLModel" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.MLModel */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MLModel" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.MLModel */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'MLModel'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'MLModel', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."MLModel" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.MLModel */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."MLModel" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CollectionArtifact */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CollectionArtifact'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CollectionArtifact', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CollectionArtifact" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.CollectionArtifact */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CollectionArtifact" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.CollectionArtifact */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'CollectionArtifact'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'CollectionArtifact', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."CollectionArtifact" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.CollectionArtifact */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."CollectionArtifact" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ScopedPromptPart */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ScopedPromptPart'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ScopedPromptPart', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ScopedPromptPart" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ScopedPromptPart */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ScopedPromptPart" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ScopedPromptPart */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ScopedPromptPart'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ScopedPromptPart', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ScopedPromptPart" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ScopedPromptPart */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ScopedPromptPart" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentSkill */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentSkill'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentSkill', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentSkill" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentSkill */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentSkill" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentSkill */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentSkill'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentSkill', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentSkill" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentSkill */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentSkill" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AISkill */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AISkill'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AISkill', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AISkill" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AISkill */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AISkill" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AISkill */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AISkill'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AISkill', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AISkill" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AISkill */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AISkill" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AISkillSubAgent */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AISkillSubAgent'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AISkillSubAgent', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AISkillSubAgent" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AISkillSubAgent */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AISkillSubAgent" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AISkillSubAgent */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AISkillSubAgent'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AISkillSubAgent', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AISkillSubAgent" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AISkillSubAgent */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AISkillSubAgent" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AISkillAction */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AISkillAction'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AISkillAction', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AISkillAction" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AISkillAction */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AISkillAction" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AISkillAction */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AISkillAction'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AISkillAction', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AISkillAction" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AISkillAction */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AISkillAction" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AISkillPermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AISkillPermission'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AISkillPermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AISkillPermission" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AISkillPermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AISkillPermission" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AISkillPermission */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AISkillPermission'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AISkillPermission', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AISkillPermission" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AISkillPermission */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AISkillPermission" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.UserRoutineRecipient */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'UserRoutineRecipient'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'UserRoutineRecipient', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."UserRoutineRecipient" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.UserRoutineRecipient */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."UserRoutineRecipient" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.UserRoutineRecipient */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'UserRoutineRecipient'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'UserRoutineRecipient', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."UserRoutineRecipient" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.UserRoutineRecipient */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."UserRoutineRecipient" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.UserRoutineRun */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'UserRoutineRun'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'UserRoutineRun', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."UserRoutineRun" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.UserRoutineRun */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."UserRoutineRun" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.UserRoutineRun */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'UserRoutineRun'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'UserRoutineRun', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."UserRoutineRun" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.UserRoutineRun */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."UserRoutineRun" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.UserRoutine */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'UserRoutine'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'UserRoutine', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."UserRoutine" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.UserRoutine */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."UserRoutine" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.UserRoutine */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'UserRoutine'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'UserRoutine', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."UserRoutine" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.UserRoutine */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."UserRoutine" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ExternalDataSourceType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ExternalDataSourceType'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ExternalDataSourceType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ExternalDataSourceType" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ExternalDataSourceType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ExternalDataSourceType" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ExternalDataSourceType */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ExternalDataSourceType'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ExternalDataSourceType', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ExternalDataSourceType" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ExternalDataSourceType */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ExternalDataSourceType" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ExternalDataSource */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ExternalDataSource'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ExternalDataSource', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ExternalDataSource" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ExternalDataSource */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ExternalDataSource" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ExternalDataSource */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ExternalDataSource'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ExternalDataSource', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ExternalDataSource" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ExternalDataSource */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ExternalDataSource" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ConversationWidgetInstance */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ConversationWidgetInstance'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ConversationWidgetInstance', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ConversationWidgetInstance" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ConversationWidgetInstance */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ConversationWidgetInstance" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ConversationWidgetInstance */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ConversationWidgetInstance'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ConversationWidgetInstance', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ConversationWidgetInstance" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ConversationWidgetInstance */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ConversationWidgetInstance" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ScopedPromptConfig */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ScopedPromptConfig'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ScopedPromptConfig', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ScopedPromptConfig" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ScopedPromptConfig */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ScopedPromptConfig" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ScopedPromptConfig */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ScopedPromptConfig'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ScopedPromptConfig', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ScopedPromptConfig" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ScopedPromptConfig */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ScopedPromptConfig" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Theme */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Theme'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Theme', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Theme" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.Theme */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Theme" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.Theme */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'Theme'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'Theme', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."Theme" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.Theme */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."Theme" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ContentItemChunk */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ContentItemChunk'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ContentItemChunk', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ContentItemChunk" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ContentItemChunk */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ContentItemChunk" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ContentItemChunk */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ContentItemChunk'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ContentItemChunk', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ContentItemChunk" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ContentItemChunk */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ContentItemChunk" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ConversationCompactionRun */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ConversationCompactionRun'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ConversationCompactionRun', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ConversationCompactionRun" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.ConversationCompactionRun */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ConversationCompactionRun" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.ConversationCompactionRun */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'ConversationCompactionRun'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'ConversationCompactionRun', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."ConversationCompactionRun" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.ConversationCompactionRun */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."ConversationCompactionRun" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AISkillSearchScope */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AISkillSearchScope'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AISkillSearchScope', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AISkillSearchScope" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AISkillSearchScope */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AISkillSearchScope" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AISkillSearchScope */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AISkillSearchScope'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AISkillSearchScope', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AISkillSearchScope" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AISkillSearchScope */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AISkillSearchScope" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.VersionInstallation */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'VersionInstallation'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'VersionInstallation', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."VersionInstallation" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.VersionInstallation */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."VersionInstallation" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.VersionInstallation */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'VersionInstallation'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'VersionInstallation', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."VersionInstallation" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.VersionInstallation */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."VersionInstallation" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentCredential */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentCredential'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentCredential', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentCredential" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentCredential */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentCredential" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentCredential */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentCredential'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentCredential', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentCredential" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentCredential */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentCredential" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentHarness */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentHarness'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentHarness', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentHarness" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIAgentHarness */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentHarness" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIAgentHarness */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIAgentHarness'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIAgentHarness', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIAgentHarness" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIAgentHarness */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIAgentHarness" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIModelVendor */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIModelVendor'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIModelVendor', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIModelVendor" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.AIModelVendor */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIModelVendor" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.AIModelVendor */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'AIModelVendor'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'AIModelVendor', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."AIModelVendor" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.AIModelVendor */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."AIModelVendor" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityActionInvocation */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityActionInvocation'
     AND att.attname = '__mj_CreatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityActionInvocation', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityActionInvocation" ALTER COLUMN "__mj_CreatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.EntityActionInvocation */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityActionInvocation" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.EntityActionInvocation */
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
DECLARE
   v_constraint_name TEXT;
BEGIN
   SELECT con.conname INTO v_constraint_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
   JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
   JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
   WHERE nsp.nspname = '${flyway:defaultSchema}'
     AND rel.relname = 'EntityActionInvocation'
     AND att.attname = '__mj_UpdatedAt'
     AND con.contype = 'c';

   IF v_constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${flyway:defaultSchema}', 'EntityActionInvocation', v_constraint_name);
   END IF;

   -- Also drop any column default
   ALTER TABLE "${flyway:defaultSchema}"."EntityActionInvocation" ALTER COLUMN "__mj_UpdatedAt" DROP DEFAULT;
END $$;

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.EntityActionInvocation */
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE "${flyway:defaultSchema}"."EntityActionInvocation" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (NOW() AT TIME ZONE 'UTC');

/* SQL to fix virtual field nullability */

UPDATE "${flyway:defaultSchema}"."EntityField" vf
SET "AllowsNull" = fk."AllowsNull"
FROM "${flyway:defaultSchema}"."EntityField" fk
WHERE vf."IsVirtual" = true
  AND fk."IsVirtual" = false
  AND vf."EntityID" = fk."EntityID"
  AND fk."RelatedEntityID" IS NOT NULL
  AND (
     (LENGTH(fk."Name") > 2
      AND LOWER(vf."Name") = LOWER(LEFT(fk."Name", LENGTH(fk."Name") - 2)))
     OR
     (LENGTH(fk."Name") > 2
      AND LOWER(vf."Name") = LOWER(LEFT(fk."Name", LENGTH(fk."Name") - 2) || '_Virtual'))
     OR
     (fk."RelatedEntityNameFieldMap" IS NOT NULL
      AND fk."RelatedEntityNameFieldMap" != ''
      AND LOWER(vf."Name") = LOWER(fk."RelatedEntityNameFieldMap"))
  )
  AND vf."AllowsNull" != fk."AllowsNull";

/* SQL text to update entity field related entity name field map for entity field ID 82f166b9-98c5-419b-8ca3-94c75f6923d0 */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('82f166b9-98c5-419b-8ca3-94c75f6923d0', 'EntityActionInvocationType');

/* SQL text to update entity field related entity name field map for entity field ID 927cfe61-12a6-42fe-9cef-dd20f4475ba5 */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('927cfe61-12a6-42fe-9cef-dd20f4475ba5', 'TargetEntity');

/* SQL text to update entity field related entity name field map for entity field ID b72932f4-0bc6-4bbf-af9f-c7994d77f8cc */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('b72932f4-0bc6-4bbf-af9f-c7994d77f8cc', 'Agent');

/* SQL text to update entity field related entity name field map for entity field ID 6f5b1cb3-f389-4c66-8d35-6a3e7f36a21d */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('6f5b1cb3-f389-4c66-8d35-6a3e7f36a21d', 'Credential');

/* SQL text to update entity field related entity name field map for entity field ID 2f2ae4e4-49fb-412a-8e86-fe0b178d156d */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('2f2ae4e4-49fb-412a-8e86-fe0b178d156d', 'AIVendor');

/* SQL text to update entity field related entity name field map for entity field ID a4f91e08-3cb8-44ae-9fce-ae07f5188ecc */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('a4f91e08-3cb8-44ae-9fce-ae07f5188ecc', 'AIModel');

/* SQL text to update entity field related entity name field map for entity field ID 72c550a2-3d67-4e7b-b374-df5f63b599d8 */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('72c550a2-3d67-4e7b-b374-df5f63b599d8', 'OriginatingTask');

/* Base View SQL for MJ: AI Agent Requests */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Requests
-- Item: vwAIAgentRequests
-- Generated at: 2026-08-12T02:39:13.608Z
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Requests
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentRequest
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "${flyway:defaultSchema}"."vwAIAgentRequests"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJUser_RequestForUserID."Name" AS "RequestForUser",
    MJUser_ResponseByUserID."Name" AS "ResponseByUser",
    MJAIAgentRequestType_RequestTypeID."Name" AS "RequestType",
    MJAIAgentRun_OriginatingAgentRunID."RunName" AS "OriginatingAgentRun",
    MJAIAgentRunStep_OriginatingAgentRunStepID."StepName" AS "OriginatingAgentRunStep",
    MJAIAgentRun_ResumingAgentRunID."RunName" AS "ResumingAgentRun",
    MJTask_OriginatingTaskID."Name" AS "OriginatingTask"
FROM
    "${flyway:defaultSchema}"."AIAgentRequest" AS a
INNER JOIN
    "${flyway:defaultSchema}"."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    "${flyway:defaultSchema}"."User" AS MJUser_RequestForUserID
  ON
    "a"."RequestForUserID" = MJUser_RequestForUserID."ID"
LEFT OUTER JOIN
    "${flyway:defaultSchema}"."User" AS MJUser_ResponseByUserID
  ON
    "a"."ResponseByUserID" = MJUser_ResponseByUserID."ID"
LEFT OUTER JOIN
    "${flyway:defaultSchema}"."AIAgentRequestType" AS MJAIAgentRequestType_RequestTypeID
  ON
    "a"."RequestTypeID" = MJAIAgentRequestType_RequestTypeID."ID"
LEFT OUTER JOIN
    "${flyway:defaultSchema}"."AIAgentRun" AS MJAIAgentRun_OriginatingAgentRunID
  ON
    "a"."OriginatingAgentRunID" = MJAIAgentRun_OriginatingAgentRunID."ID"
LEFT OUTER JOIN
    "${flyway:defaultSchema}"."AIAgentRunStep" AS MJAIAgentRunStep_OriginatingAgentRunStepID
  ON
    "a"."OriginatingAgentRunStepID" = MJAIAgentRunStep_OriginatingAgentRunStepID."ID"
LEFT OUTER JOIN
    "${flyway:defaultSchema}"."AIAgentRun" AS MJAIAgentRun_ResumingAgentRunID
  ON
    "a"."ResumingAgentRunID" = MJAIAgentRun_ResumingAgentRunID."ID"
LEFT OUTER JOIN
    "${flyway:defaultSchema}"."Task" AS MJTask_OriginatingTaskID
  ON
    "a"."OriginatingTaskID" = MJTask_OriginatingTaskID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '${flyway:defaultSchema}'
    AND tc.relname = 'vwAIAgentRequests'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '${flyway:defaultSchema}'
    AND tc.relname = 'vwAIAgentRequests'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '${flyway:defaultSchema}'
        AND tc.relname = 'vwAIAgentRequests'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "${flyway:defaultSchema}"."vwAIAgentRequests" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "${flyway:defaultSchema}"."vwAIAgentRequests" TO "cdp_UI";
GRANT SELECT ON "${flyway:defaultSchema}"."vwAIAgentRequests" TO "cdp_Developer";
GRANT SELECT ON "${flyway:defaultSchema}"."vwAIAgentRequests" TO "cdp_Integration";

/* Base View Permissions SQL for MJ: AI Agent Requests */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Requests
-- Item: Permissions for vwAIAgentRequests
-- Generated at: 2026-08-12T02:39:13.610Z
-- ============================================================
GRANT SELECT ON "${flyway:defaultSchema}"."vwAIAgentRequests" TO "cdp_UI";
GRANT SELECT ON "${flyway:defaultSchema}"."vwAIAgentRequests" TO "cdp_Developer";
GRANT SELECT ON "${flyway:defaultSchema}"."vwAIAgentRequests" TO "cdp_Integration";

/* spCreate SQL for MJ: AI Agent Requests */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Requests
-- Item: spCreateAIAgentRequest
-- Generated at: 2026-08-12T02:39:13.610Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentRequest
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentRequest'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."spCreateAIAgentRequest"(
    p_id UUID DEFAULT NULL,
    p_agentid UUID DEFAULT NULL,
    p_requestedat TIMESTAMPTZ DEFAULT NULL,
    p_requestforuserid_clear boolean DEFAULT false,
    p_requestforuserid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_request TEXT DEFAULT NULL,
    p_response_clear boolean DEFAULT false,
    p_response TEXT DEFAULT NULL,
    p_responsebyuserid_clear boolean DEFAULT false,
    p_responsebyuserid UUID DEFAULT NULL,
    p_respondedat_clear boolean DEFAULT false,
    p_respondedat TIMESTAMPTZ DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_requesttypeid_clear boolean DEFAULT false,
    p_requesttypeid UUID DEFAULT NULL,
    p_responseschema_clear boolean DEFAULT false,
    p_responseschema TEXT DEFAULT NULL,
    p_responsedata_clear boolean DEFAULT false,
    p_responsedata TEXT DEFAULT NULL,
    p_priority int DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL,
    p_originatingagentrunid_clear boolean DEFAULT false,
    p_originatingagentrunid UUID DEFAULT NULL,
    p_originatingagentrunstepid_clear boolean DEFAULT false,
    p_originatingagentrunstepid UUID DEFAULT NULL,
    p_resumingagentrunid_clear boolean DEFAULT false,
    p_resumingagentrunid UUID DEFAULT NULL,
    p_responsesource_clear boolean DEFAULT false,
    p_responsesource varchar(20) DEFAULT NULL,
    p_originatingtaskid_clear boolean DEFAULT false,
    p_originatingtaskid UUID DEFAULT NULL
) RETURNS SETOF "${flyway:defaultSchema}"."vwAIAgentRequests" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "${flyway:defaultSchema}"."AIAgentRequest"
        (
            "ID",
            "AgentID",
                "RequestedAt",
                "RequestForUserID",
                "Status",
                "Request",
                "Response",
                "ResponseByUserID",
                "RespondedAt",
                "Comments",
                "RequestTypeID",
                "ResponseSchema",
                "ResponseData",
                "Priority",
                "ExpiresAt",
                "OriginatingAgentRunID",
                "OriginatingAgentRunStepID",
                "ResumingAgentRunID",
                "ResponseSource",
                "OriginatingTaskID"
        )
    VALUES
        (
            v_new_id,
            p_agentid,
                p_requestedat,
                CASE WHEN p_requestforuserid_clear = true THEN NULL ELSE COALESCE(p_requestforuserid, NULL) END,
                p_status,
                p_request,
                CASE WHEN p_response_clear = true THEN NULL ELSE COALESCE(p_response, NULL) END,
                CASE WHEN p_responsebyuserid_clear = true THEN NULL ELSE COALESCE(p_responsebyuserid, NULL) END,
                CASE WHEN p_respondedat_clear = true THEN NULL ELSE COALESCE(p_respondedat, NULL) END,
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END,
                CASE WHEN p_requesttypeid_clear = true THEN NULL ELSE COALESCE(p_requesttypeid, NULL) END,
                CASE WHEN p_responseschema_clear = true THEN NULL ELSE COALESCE(p_responseschema, NULL) END,
                CASE WHEN p_responsedata_clear = true THEN NULL ELSE COALESCE(p_responsedata, NULL) END,
                COALESCE(p_priority, 50),
                CASE WHEN p_expiresat_clear = true THEN NULL ELSE COALESCE(p_expiresat, NULL) END,
                CASE WHEN p_originatingagentrunid_clear = true THEN NULL ELSE COALESCE(p_originatingagentrunid, NULL) END,
                CASE WHEN p_originatingagentrunstepid_clear = true THEN NULL ELSE COALESCE(p_originatingagentrunstepid, NULL) END,
                CASE WHEN p_resumingagentrunid_clear = true THEN NULL ELSE COALESCE(p_resumingagentrunid, NULL) END,
                CASE WHEN p_responsesource_clear = true THEN NULL ELSE COALESCE(p_responsesource, NULL) END,
                CASE WHEN p_originatingtaskid_clear = true THEN NULL ELSE COALESCE(p_originatingtaskid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "${flyway:defaultSchema}"."vwAIAgentRequests"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateAIAgentRequest" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateAIAgentRequest" TO "cdp_Integration";

/* spCreate Permissions for MJ: AI Agent Requests */
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateAIAgentRequest" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateAIAgentRequest" TO "cdp_Integration";

/* spUpdate SQL for MJ: AI Agent Requests */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Requests
-- Item: spUpdateAIAgentRequest
-- Generated at: 2026-08-12T02:39:13.611Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentRequest
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentRequest'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."spUpdateAIAgentRequest"(
    p_id UUID,
    p_agentid UUID DEFAULT NULL,
    p_requestedat TIMESTAMPTZ DEFAULT NULL,
    p_requestforuserid_clear boolean DEFAULT false,
    p_requestforuserid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_request TEXT DEFAULT NULL,
    p_response_clear boolean DEFAULT false,
    p_response TEXT DEFAULT NULL,
    p_responsebyuserid_clear boolean DEFAULT false,
    p_responsebyuserid UUID DEFAULT NULL,
    p_respondedat_clear boolean DEFAULT false,
    p_respondedat TIMESTAMPTZ DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_requesttypeid_clear boolean DEFAULT false,
    p_requesttypeid UUID DEFAULT NULL,
    p_responseschema_clear boolean DEFAULT false,
    p_responseschema TEXT DEFAULT NULL,
    p_responsedata_clear boolean DEFAULT false,
    p_responsedata TEXT DEFAULT NULL,
    p_priority int DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL,
    p_originatingagentrunid_clear boolean DEFAULT false,
    p_originatingagentrunid UUID DEFAULT NULL,
    p_originatingagentrunstepid_clear boolean DEFAULT false,
    p_originatingagentrunstepid UUID DEFAULT NULL,
    p_resumingagentrunid_clear boolean DEFAULT false,
    p_resumingagentrunid UUID DEFAULT NULL,
    p_responsesource_clear boolean DEFAULT false,
    p_responsesource varchar(20) DEFAULT NULL,
    p_originatingtaskid_clear boolean DEFAULT false,
    p_originatingtaskid UUID DEFAULT NULL
) RETURNS SETOF "${flyway:defaultSchema}"."vwAIAgentRequests" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "${flyway:defaultSchema}"."AIAgentRequest"
    SET
        "AgentID" = COALESCE(p_agentid, "AgentID"),
        "RequestedAt" = COALESCE(p_requestedat, "RequestedAt"),
        "RequestForUserID" = CASE WHEN p_requestforuserid_clear = true THEN NULL ELSE COALESCE(p_requestforuserid, "RequestForUserID") END,
        "Status" = COALESCE(p_status, "Status"),
        "Request" = COALESCE(p_request, "Request"),
        "Response" = CASE WHEN p_response_clear = true THEN NULL ELSE COALESCE(p_response, "Response") END,
        "ResponseByUserID" = CASE WHEN p_responsebyuserid_clear = true THEN NULL ELSE COALESCE(p_responsebyuserid, "ResponseByUserID") END,
        "RespondedAt" = CASE WHEN p_respondedat_clear = true THEN NULL ELSE COALESCE(p_respondedat, "RespondedAt") END,
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END,
        "RequestTypeID" = CASE WHEN p_requesttypeid_clear = true THEN NULL ELSE COALESCE(p_requesttypeid, "RequestTypeID") END,
        "ResponseSchema" = CASE WHEN p_responseschema_clear = true THEN NULL ELSE COALESCE(p_responseschema, "ResponseSchema") END,
        "ResponseData" = CASE WHEN p_responsedata_clear = true THEN NULL ELSE COALESCE(p_responsedata, "ResponseData") END,
        "Priority" = COALESCE(p_priority, "Priority"),
        "ExpiresAt" = CASE WHEN p_expiresat_clear = true THEN NULL ELSE COALESCE(p_expiresat, "ExpiresAt") END,
        "OriginatingAgentRunID" = CASE WHEN p_originatingagentrunid_clear = true THEN NULL ELSE COALESCE(p_originatingagentrunid, "OriginatingAgentRunID") END,
        "OriginatingAgentRunStepID" = CASE WHEN p_originatingagentrunstepid_clear = true THEN NULL ELSE COALESCE(p_originatingagentrunstepid, "OriginatingAgentRunStepID") END,
        "ResumingAgentRunID" = CASE WHEN p_resumingagentrunid_clear = true THEN NULL ELSE COALESCE(p_resumingagentrunid, "ResumingAgentRunID") END,
        "ResponseSource" = CASE WHEN p_responsesource_clear = true THEN NULL ELSE COALESCE(p_responsesource, "ResponseSource") END,
        "OriginatingTaskID" = CASE WHEN p_originatingtaskid_clear = true THEN NULL ELSE COALESCE(p_originatingtaskid, "OriginatingTaskID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "${flyway:defaultSchema}"."vwAIAgentRequests"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateAIAgentRequest" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateAIAgentRequest" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRequest table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."fn_trg_update_ai_agent_request"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_request" ON "${flyway:defaultSchema}"."AIAgentRequest";

CREATE TRIGGER "trg_update_ai_agent_request"
BEFORE UPDATE ON "${flyway:defaultSchema}"."AIAgentRequest"
FOR EACH ROW
EXECUTE FUNCTION "${flyway:defaultSchema}"."fn_trg_update_ai_agent_request"();

/* spUpdate Permissions for MJ: AI Agent Requests */
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateAIAgentRequest" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateAIAgentRequest" TO "cdp_Integration";

/* spDelete SQL for MJ: AI Agent Requests */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Requests
-- Item: spDeleteAIAgentRequest
-- Generated at: 2026-08-12T02:39:13.611Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentRequest
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentRequest'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."spDeleteAIAgentRequest"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "${flyway:defaultSchema}"."AIAgentRequest"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteAIAgentRequest" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteAIAgentRequest" TO "cdp_Integration";

/* spDelete Permissions for MJ: AI Agent Requests */
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteAIAgentRequest" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteAIAgentRequest" TO "cdp_Integration";

/* SQL text to update entity field related entity name field map for entity field ID 1e82d32e-0170-4cee-8e95-45233138a6d1 */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('1e82d32e-0170-4cee-8e95-45233138a6d1', 'ContextCompressionPrompt');

/* SQL text to update entity field related entity name field map for entity field ID 51e3a46c-0f14-45bd-b607-42ccb658a60f */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('51e3a46c-0f14-45bd-b607-42ccb658a60f', 'ConversationSummaryPrompt');

/* SQL text to update entity field related entity name field map for entity field ID c0ca3839-427c-4003-afd7-6354086172ad */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('c0ca3839-427c-4003-afd7-6354086172ad', 'ConversationSummaryPrompt');

/* Base View SQL for MJ: AI Model Types */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Model Types
-- Item: vwAIModelTypes
-- Generated at: 2026-08-12T02:39:13.878Z
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Model Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIModelType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "${flyway:defaultSchema}"."vwAIModelTypes"
AS
SELECT
    a.*,
    MJAIModality_DefaultInputModalityID."Name" AS "DefaultInputModality",
    MJAIModality_DefaultOutputModalityID."Name" AS "DefaultOutputModality"
FROM
    "${flyway:defaultSchema}"."AIModelType" AS a
INNER JOIN
    "${flyway:defaultSchema}"."AIModality" AS MJAIModality_DefaultInputModalityID
  ON
    "a"."DefaultInputModalityID" = MJAIModality_DefaultInputModalityID."ID"
INNER JOIN
    "${flyway:defaultSchema}"."AIModality" AS MJAIModality_DefaultOutputModalityID
  ON
    "a"."DefaultOutputModalityID" = MJAIModality_DefaultOutputModalityID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '${flyway:defaultSchema}'
    AND tc.relname = 'vwAIModelTypes'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '${flyway:defaultSchema}'
    AND tc.relname = 'vwAIModelTypes'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '${flyway:defaultSchema}'
        AND tc.relname = 'vwAIModelTypes'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "${flyway:defaultSchema}"."vwAIModelTypes" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "${flyway:defaultSchema}"."vwAIModelTypes" TO "cdp_Integration";
GRANT SELECT ON "${flyway:defaultSchema}"."vwAIModelTypes" TO "cdp_Developer";
GRANT SELECT ON "${flyway:defaultSchema}"."vwAIModelTypes" TO "cdp_UI";

/* Base View Permissions SQL for MJ: AI Model Types */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Model Types
-- Item: Permissions for vwAIModelTypes
-- Generated at: 2026-08-12T02:39:13.880Z
-- ============================================================
GRANT SELECT ON "${flyway:defaultSchema}"."vwAIModelTypes" TO "cdp_Integration";
GRANT SELECT ON "${flyway:defaultSchema}"."vwAIModelTypes" TO "cdp_Developer";
GRANT SELECT ON "${flyway:defaultSchema}"."vwAIModelTypes" TO "cdp_UI";

/* spCreate SQL for MJ: AI Model Types */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Model Types
-- Item: spCreateAIModelType
-- Generated at: 2026-08-12T02:39:13.880Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIModelType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIModelType'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."spCreateAIModelType"(
    p_id UUID DEFAULT NULL,
    p_name varchar(50) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_defaultinputmodalityid UUID DEFAULT NULL,
    p_defaultoutputmodalityid UUID DEFAULT NULL,
    p_supportsprefill BOOLEAN DEFAULT NULL,
    p_prefillfallbacktext_clear boolean DEFAULT false,
    p_prefillfallbacktext TEXT DEFAULT NULL,
    p_modelconfiguration_clear boolean DEFAULT false,
    p_modelconfiguration TEXT DEFAULT NULL
) RETURNS SETOF "${flyway:defaultSchema}"."vwAIModelTypes" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "${flyway:defaultSchema}"."AIModelType"
        (
            "ID",
            "Name",
                "Description",
                "DefaultInputModalityID",
                "DefaultOutputModalityID",
                "SupportsPrefill",
                "PrefillFallbackText",
                "ModelConfiguration"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_defaultinputmodalityid,
                p_defaultoutputmodalityid,
                COALESCE(p_supportsprefill, FALSE),
                CASE WHEN p_prefillfallbacktext_clear = true THEN NULL ELSE COALESCE(p_prefillfallbacktext, NULL) END,
                CASE WHEN p_modelconfiguration_clear = true THEN NULL ELSE COALESCE(p_modelconfiguration, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "${flyway:defaultSchema}"."vwAIModelTypes"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateAIModelType" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateAIModelType" TO "cdp_Developer";

/* spCreate Permissions for MJ: AI Model Types */
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateAIModelType" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateAIModelType" TO "cdp_Developer";

/* spUpdate SQL for MJ: AI Model Types */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Model Types
-- Item: spUpdateAIModelType
-- Generated at: 2026-08-12T02:39:13.880Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIModelType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIModelType'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."spUpdateAIModelType"(
    p_id UUID,
    p_name varchar(50) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_defaultinputmodalityid UUID DEFAULT NULL,
    p_defaultoutputmodalityid UUID DEFAULT NULL,
    p_supportsprefill BOOLEAN DEFAULT NULL,
    p_prefillfallbacktext_clear boolean DEFAULT false,
    p_prefillfallbacktext TEXT DEFAULT NULL,
    p_modelconfiguration_clear boolean DEFAULT false,
    p_modelconfiguration TEXT DEFAULT NULL
) RETURNS SETOF "${flyway:defaultSchema}"."vwAIModelTypes" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "${flyway:defaultSchema}"."AIModelType"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "DefaultInputModalityID" = COALESCE(p_defaultinputmodalityid, "DefaultInputModalityID"),
        "DefaultOutputModalityID" = COALESCE(p_defaultoutputmodalityid, "DefaultOutputModalityID"),
        "SupportsPrefill" = COALESCE(p_supportsprefill, "SupportsPrefill"),
        "PrefillFallbackText" = CASE WHEN p_prefillfallbacktext_clear = true THEN NULL ELSE COALESCE(p_prefillfallbacktext, "PrefillFallbackText") END,
        "ModelConfiguration" = CASE WHEN p_modelconfiguration_clear = true THEN NULL ELSE COALESCE(p_modelconfiguration, "ModelConfiguration") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "${flyway:defaultSchema}"."vwAIModelTypes"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateAIModelType" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateAIModelType" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIModelType table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."fn_trg_update_ai_model_type"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_model_type" ON "${flyway:defaultSchema}"."AIModelType";

CREATE TRIGGER "trg_update_ai_model_type"
BEFORE UPDATE ON "${flyway:defaultSchema}"."AIModelType"
FOR EACH ROW
EXECUTE FUNCTION "${flyway:defaultSchema}"."fn_trg_update_ai_model_type"();

/* spUpdate Permissions for MJ: AI Model Types */
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateAIModelType" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateAIModelType" TO "cdp_Developer";

/* spDelete SQL for MJ: AI Model Types */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Model Types
-- Item: spDeleteAIModelType
-- Generated at: 2026-08-12T02:39:13.880Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIModelType
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIModelType'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."spDeleteAIModelType"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "${flyway:defaultSchema}"."AIModelType"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteAIModelType" TO "cdp_Developer";

/* spDelete Permissions for MJ: AI Model Types */
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteAIModelType" TO "cdp_Developer";

/* Base View SQL for MJ: AI Model Vendors */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Model Vendors
-- Item: vwAIModelVendors
-- Generated at: 2026-08-12T02:39:13.891Z
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Model Vendors
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIModelVendor
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "${flyway:defaultSchema}"."vwAIModelVendors"
AS
SELECT
    a.*,
    MJAIModel_ModelID."Name" AS "Model",
    MJAIVendor_VendorID."Name" AS "Vendor",
    MJAIVendorTypeDefinition_TypeID."Name" AS "Type"
FROM
    "${flyway:defaultSchema}"."AIModelVendor" AS a
INNER JOIN
    "${flyway:defaultSchema}"."AIModel" AS MJAIModel_ModelID
  ON
    "a"."ModelID" = MJAIModel_ModelID."ID"
INNER JOIN
    "${flyway:defaultSchema}"."AIVendor" AS MJAIVendor_VendorID
  ON
    "a"."VendorID" = MJAIVendor_VendorID."ID"
INNER JOIN
    "${flyway:defaultSchema}"."AIVendorTypeDefinition" AS MJAIVendorTypeDefinition_TypeID
  ON
    "a"."TypeID" = MJAIVendorTypeDefinition_TypeID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '${flyway:defaultSchema}'
    AND tc.relname = 'vwAIModelVendors'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '${flyway:defaultSchema}'
    AND tc.relname = 'vwAIModelVendors'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '${flyway:defaultSchema}'
        AND tc.relname = 'vwAIModelVendors'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "${flyway:defaultSchema}"."vwAIModelVendors" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "${flyway:defaultSchema}"."vwAIModelVendors" TO "cdp_UI";
GRANT SELECT ON "${flyway:defaultSchema}"."vwAIModelVendors" TO "cdp_Developer";
GRANT SELECT ON "${flyway:defaultSchema}"."vwAIModelVendors" TO "cdp_Integration";

/* Base View Permissions SQL for MJ: AI Model Vendors */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Model Vendors
-- Item: Permissions for vwAIModelVendors
-- Generated at: 2026-08-12T02:39:13.893Z
-- ============================================================
GRANT SELECT ON "${flyway:defaultSchema}"."vwAIModelVendors" TO "cdp_UI";
GRANT SELECT ON "${flyway:defaultSchema}"."vwAIModelVendors" TO "cdp_Developer";
GRANT SELECT ON "${flyway:defaultSchema}"."vwAIModelVendors" TO "cdp_Integration";

/* spCreate SQL for MJ: AI Model Vendors */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Model Vendors
-- Item: spCreateAIModelVendor
-- Generated at: 2026-08-12T02:39:13.893Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIModelVendor
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIModelVendor'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."spCreateAIModelVendor"(
    p_id UUID DEFAULT NULL,
    p_modelid UUID DEFAULT NULL,
    p_vendorid UUID DEFAULT NULL,
    p_priority int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_driverclass_clear boolean DEFAULT false,
    p_driverclass varchar(100) DEFAULT NULL,
    p_driverimportpath_clear boolean DEFAULT false,
    p_driverimportpath varchar(255) DEFAULT NULL,
    p_apiname_clear boolean DEFAULT false,
    p_apiname varchar(100) DEFAULT NULL,
    p_maxinputtokens_clear boolean DEFAULT false,
    p_maxinputtokens int DEFAULT NULL,
    p_maxoutputtokens_clear boolean DEFAULT false,
    p_maxoutputtokens int DEFAULT NULL,
    p_supportedresponseformats varchar(100) DEFAULT NULL,
    p_supportseffortlevel BOOLEAN DEFAULT NULL,
    p_supportsstreaming BOOLEAN DEFAULT NULL,
    p_typeid UUID DEFAULT NULL,
    p_supportsprefill_clear boolean DEFAULT false,
    p_supportsprefill BOOLEAN DEFAULT NULL,
    p_prefillfallbacktext_clear boolean DEFAULT false,
    p_prefillfallbacktext TEXT DEFAULT NULL,
    p_modelconfiguration_clear boolean DEFAULT false,
    p_modelconfiguration TEXT DEFAULT NULL
) RETURNS SETOF "${flyway:defaultSchema}"."vwAIModelVendors" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "${flyway:defaultSchema}"."AIModelVendor"
        (
            "ID",
            "ModelID",
                "VendorID",
                "Priority",
                "Status",
                "DriverClass",
                "DriverImportPath",
                "APIName",
                "MaxInputTokens",
                "MaxOutputTokens",
                "SupportedResponseFormats",
                "SupportsEffortLevel",
                "SupportsStreaming",
                "TypeID",
                "SupportsPrefill",
                "PrefillFallbackText",
                "ModelConfiguration"
        )
    VALUES
        (
            v_new_id,
            p_modelid,
                p_vendorid,
                COALESCE(p_priority, 0),
                COALESCE(p_status, 'Active'),
                CASE WHEN p_driverclass_clear = true THEN NULL ELSE COALESCE(p_driverclass, NULL) END,
                CASE WHEN p_driverimportpath_clear = true THEN NULL ELSE COALESCE(p_driverimportpath, NULL) END,
                CASE WHEN p_apiname_clear = true THEN NULL ELSE COALESCE(p_apiname, NULL) END,
                CASE WHEN p_maxinputtokens_clear = true THEN NULL ELSE COALESCE(p_maxinputtokens, NULL) END,
                CASE WHEN p_maxoutputtokens_clear = true THEN NULL ELSE COALESCE(p_maxoutputtokens, NULL) END,
                COALESCE(p_supportedresponseformats, 'Any'),
                COALESCE(p_supportseffortlevel, FALSE),
                COALESCE(p_supportsstreaming, FALSE),
                p_typeid,
                CASE WHEN p_supportsprefill_clear = true THEN NULL ELSE COALESCE(p_supportsprefill, NULL) END,
                CASE WHEN p_prefillfallbacktext_clear = true THEN NULL ELSE COALESCE(p_prefillfallbacktext, NULL) END,
                CASE WHEN p_modelconfiguration_clear = true THEN NULL ELSE COALESCE(p_modelconfiguration, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "${flyway:defaultSchema}"."vwAIModelVendors"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateAIModelVendor" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateAIModelVendor" TO "cdp_Integration";

/* spCreate Permissions for MJ: AI Model Vendors */
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateAIModelVendor" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateAIModelVendor" TO "cdp_Integration";

/* spUpdate SQL for MJ: AI Model Vendors */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Model Vendors
-- Item: spUpdateAIModelVendor
-- Generated at: 2026-08-12T02:39:13.894Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIModelVendor
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIModelVendor'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."spUpdateAIModelVendor"(
    p_id UUID,
    p_modelid UUID DEFAULT NULL,
    p_vendorid UUID DEFAULT NULL,
    p_priority int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_driverclass_clear boolean DEFAULT false,
    p_driverclass varchar(100) DEFAULT NULL,
    p_driverimportpath_clear boolean DEFAULT false,
    p_driverimportpath varchar(255) DEFAULT NULL,
    p_apiname_clear boolean DEFAULT false,
    p_apiname varchar(100) DEFAULT NULL,
    p_maxinputtokens_clear boolean DEFAULT false,
    p_maxinputtokens int DEFAULT NULL,
    p_maxoutputtokens_clear boolean DEFAULT false,
    p_maxoutputtokens int DEFAULT NULL,
    p_supportedresponseformats varchar(100) DEFAULT NULL,
    p_supportseffortlevel BOOLEAN DEFAULT NULL,
    p_supportsstreaming BOOLEAN DEFAULT NULL,
    p_typeid UUID DEFAULT NULL,
    p_supportsprefill_clear boolean DEFAULT false,
    p_supportsprefill BOOLEAN DEFAULT NULL,
    p_prefillfallbacktext_clear boolean DEFAULT false,
    p_prefillfallbacktext TEXT DEFAULT NULL,
    p_modelconfiguration_clear boolean DEFAULT false,
    p_modelconfiguration TEXT DEFAULT NULL
) RETURNS SETOF "${flyway:defaultSchema}"."vwAIModelVendors" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "${flyway:defaultSchema}"."AIModelVendor"
    SET
        "ModelID" = COALESCE(p_modelid, "ModelID"),
        "VendorID" = COALESCE(p_vendorid, "VendorID"),
        "Priority" = COALESCE(p_priority, "Priority"),
        "Status" = COALESCE(p_status, "Status"),
        "DriverClass" = CASE WHEN p_driverclass_clear = true THEN NULL ELSE COALESCE(p_driverclass, "DriverClass") END,
        "DriverImportPath" = CASE WHEN p_driverimportpath_clear = true THEN NULL ELSE COALESCE(p_driverimportpath, "DriverImportPath") END,
        "APIName" = CASE WHEN p_apiname_clear = true THEN NULL ELSE COALESCE(p_apiname, "APIName") END,
        "MaxInputTokens" = CASE WHEN p_maxinputtokens_clear = true THEN NULL ELSE COALESCE(p_maxinputtokens, "MaxInputTokens") END,
        "MaxOutputTokens" = CASE WHEN p_maxoutputtokens_clear = true THEN NULL ELSE COALESCE(p_maxoutputtokens, "MaxOutputTokens") END,
        "SupportedResponseFormats" = COALESCE(p_supportedresponseformats, "SupportedResponseFormats"),
        "SupportsEffortLevel" = COALESCE(p_supportseffortlevel, "SupportsEffortLevel"),
        "SupportsStreaming" = COALESCE(p_supportsstreaming, "SupportsStreaming"),
        "TypeID" = COALESCE(p_typeid, "TypeID"),
        "SupportsPrefill" = CASE WHEN p_supportsprefill_clear = true THEN NULL ELSE COALESCE(p_supportsprefill, "SupportsPrefill") END,
        "PrefillFallbackText" = CASE WHEN p_prefillfallbacktext_clear = true THEN NULL ELSE COALESCE(p_prefillfallbacktext, "PrefillFallbackText") END,
        "ModelConfiguration" = CASE WHEN p_modelconfiguration_clear = true THEN NULL ELSE COALESCE(p_modelconfiguration, "ModelConfiguration") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "${flyway:defaultSchema}"."vwAIModelVendors"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateAIModelVendor" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateAIModelVendor" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIModelVendor table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."fn_trg_update_ai_model_vendor"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_model_vendor" ON "${flyway:defaultSchema}"."AIModelVendor";

CREATE TRIGGER "trg_update_ai_model_vendor"
BEFORE UPDATE ON "${flyway:defaultSchema}"."AIModelVendor"
FOR EACH ROW
EXECUTE FUNCTION "${flyway:defaultSchema}"."fn_trg_update_ai_model_vendor"();

/* spUpdate Permissions for MJ: AI Model Vendors */
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateAIModelVendor" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateAIModelVendor" TO "cdp_Integration";

/* spDelete SQL for MJ: AI Model Vendors */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Model Vendors
-- Item: spDeleteAIModelVendor
-- Generated at: 2026-08-12T02:39:13.894Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIModelVendor
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIModelVendor'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."spDeleteAIModelVendor"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "${flyway:defaultSchema}"."AIModelVendor"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteAIModelVendor" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteAIModelVendor" TO "cdp_Integration";

/* spDelete Permissions for MJ: AI Model Vendors */
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteAIModelVendor" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteAIModelVendor" TO "cdp_Integration";

/* SQL text to update entity field related entity name field map for entity field ID 0e07fe6e-54e8-4282-a207-c69ed11ec095 */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('0e07fe6e-54e8-4282-a207-c69ed11ec095', 'Skill');

/* SQL text to update entity field related entity name field map for entity field ID 99e97675-3efa-4ea7-936c-f836b82ea832 */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('99e97675-3efa-4ea7-936c-f836b82ea832', 'SearchScope');

/* SQL text to update entity field related entity name field map for entity field ID 16b21ba4-eeb6-400d-9d7e-6799482be897 */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('16b21ba4-eeb6-400d-9d7e-6799482be897', 'RowFilter');

/* SQL text to update entity field related entity name field map for entity field ID 7c0fd852-97ab-4d57-86fc-52813e049e1e */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('7c0fd852-97ab-4d57-86fc-52813e049e1e', 'RowFilter');

/* SQL text to update entity field related entity name field map for entity field ID 073f4c8a-f2ab-4f27-9fe3-743882972f31 */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('073f4c8a-f2ab-4f27-9fe3-743882972f31', 'ContentItem');

/* SQL text to update entity field related entity name field map for entity field ID b2686a87-4b1e-4eb2-bf22-5122a3346e72 */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('b2686a87-4b1e-4eb2-bf22-5122a3346e72', 'Parent');

/* SQL text to update entity field related entity name field map for entity field ID 80731e62-5565-4cff-9d75-faecee04174c */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('80731e62-5565-4cff-9d75-faecee04174c', 'ScheduledJob');

/* Base View SQL for MJ: Content Sources */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Sources
-- Item: vwContentSources
-- Generated at: 2026-08-12T02:39:14.348Z
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Sources
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentSource
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "${flyway:defaultSchema}"."vwContentSources"
AS
SELECT
    c.*,
    MJContentType_ContentTypeID."Name" AS "ContentType",
    MJContentSourceType_ContentSourceTypeID."Name" AS "ContentSourceType",
    MJContentFileType_ContentFileTypeID."Name" AS "ContentFileType",
    MJAIModel_EmbeddingModelID."Name" AS "EmbeddingModel",
    MJVectorIndex_VectorIndexID."Name" AS "VectorIndex",
    MJEntity_EntityID."Name" AS "Entity",
    MJEntityDocument_EntityDocumentID."Name" AS "EntityDocument",
    MJScheduledJob_ScheduledJobID."Name" AS "ScheduledJob"
FROM
    "${flyway:defaultSchema}"."ContentSource" AS c
INNER JOIN
    "${flyway:defaultSchema}"."ContentType" AS MJContentType_ContentTypeID
  ON
    "c"."ContentTypeID" = MJContentType_ContentTypeID."ID"
INNER JOIN
    "${flyway:defaultSchema}"."ContentSourceType" AS MJContentSourceType_ContentSourceTypeID
  ON
    "c"."ContentSourceTypeID" = MJContentSourceType_ContentSourceTypeID."ID"
INNER JOIN
    "${flyway:defaultSchema}"."ContentFileType" AS MJContentFileType_ContentFileTypeID
  ON
    "c"."ContentFileTypeID" = MJContentFileType_ContentFileTypeID."ID"
LEFT OUTER JOIN
    "${flyway:defaultSchema}"."AIModel" AS MJAIModel_EmbeddingModelID
  ON
    "c"."EmbeddingModelID" = MJAIModel_EmbeddingModelID."ID"
LEFT OUTER JOIN
    "${flyway:defaultSchema}"."VectorIndex" AS MJVectorIndex_VectorIndexID
  ON
    "c"."VectorIndexID" = MJVectorIndex_VectorIndexID."ID"
LEFT OUTER JOIN
    "${flyway:defaultSchema}"."Entity" AS MJEntity_EntityID
  ON
    "c"."EntityID" = MJEntity_EntityID."ID"
LEFT OUTER JOIN
    "${flyway:defaultSchema}"."EntityDocument" AS MJEntityDocument_EntityDocumentID
  ON
    "c"."EntityDocumentID" = MJEntityDocument_EntityDocumentID."ID"
LEFT OUTER JOIN
    "${flyway:defaultSchema}"."ScheduledJob" AS MJScheduledJob_ScheduledJobID
  ON
    "c"."ScheduledJobID" = MJScheduledJob_ScheduledJobID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '${flyway:defaultSchema}'
    AND tc.relname = 'vwContentSources'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '${flyway:defaultSchema}'
    AND tc.relname = 'vwContentSources'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '${flyway:defaultSchema}'
        AND tc.relname = 'vwContentSources'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "${flyway:defaultSchema}"."vwContentSources" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "${flyway:defaultSchema}"."vwContentSources" TO "cdp_UI";
GRANT SELECT ON "${flyway:defaultSchema}"."vwContentSources" TO "cdp_Developer";
GRANT SELECT ON "${flyway:defaultSchema}"."vwContentSources" TO "cdp_Integration";

/* Base View Permissions SQL for MJ: Content Sources */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Sources
-- Item: Permissions for vwContentSources
-- Generated at: 2026-08-12T02:39:14.350Z
-- ============================================================
GRANT SELECT ON "${flyway:defaultSchema}"."vwContentSources" TO "cdp_UI";
GRANT SELECT ON "${flyway:defaultSchema}"."vwContentSources" TO "cdp_Developer";
GRANT SELECT ON "${flyway:defaultSchema}"."vwContentSources" TO "cdp_Integration";

/* spCreate SQL for MJ: Content Sources */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Sources
-- Item: spCreateContentSource
-- Generated at: 2026-08-12T02:39:14.350Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ContentSource
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateContentSource'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."spCreateContentSource"(
    p_id UUID DEFAULT NULL,
    p_name_clear boolean DEFAULT false,
    p_name varchar(255) DEFAULT NULL,
    p_contenttypeid UUID DEFAULT NULL,
    p_contentsourcetypeid UUID DEFAULT NULL,
    p_contentfiletypeid UUID DEFAULT NULL,
    p_url varchar(2000) DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_vectorindexid_clear boolean DEFAULT false,
    p_vectorindexid UUID DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_entityid_clear boolean DEFAULT false,
    p_entityid UUID DEFAULT NULL,
    p_entitydocumentid_clear boolean DEFAULT false,
    p_entitydocumentid UUID DEFAULT NULL,
    p_scheduledactionid_clear boolean DEFAULT false,
    p_scheduledactionid UUID DEFAULT NULL,
    p_scheduledjobid_clear boolean DEFAULT false,
    p_scheduledjobid uuid DEFAULT NULL,
    p_segmenterkey_clear boolean DEFAULT false,
    p_segmenterkey varchar(100) DEFAULT NULL,
    p_cleanerkey_clear boolean DEFAULT false,
    p_cleanerkey varchar(100) DEFAULT NULL
) RETURNS SETOF "${flyway:defaultSchema}"."vwContentSources" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "${flyway:defaultSchema}"."ContentSource"
        (
            "ID",
            "Name",
                "ContentTypeID",
                "ContentSourceTypeID",
                "ContentFileTypeID",
                "URL",
                "EmbeddingModelID",
                "VectorIndexID",
                "Configuration",
                "EntityID",
                "EntityDocumentID",
                "ScheduledActionID",
                "ScheduledJobID",
                "SegmenterKey",
                "CleanerKey"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_name_clear = true THEN NULL ELSE COALESCE(p_name, NULL) END,
                p_contenttypeid,
                p_contentsourcetypeid,
                p_contentfiletypeid,
                p_url,
                CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, NULL) END,
                CASE WHEN p_vectorindexid_clear = true THEN NULL ELSE COALESCE(p_vectorindexid, NULL) END,
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                CASE WHEN p_entityid_clear = true THEN NULL ELSE COALESCE(p_entityid, NULL) END,
                CASE WHEN p_entitydocumentid_clear = true THEN NULL ELSE COALESCE(p_entitydocumentid, NULL) END,
                CASE WHEN p_scheduledactionid_clear = true THEN NULL ELSE COALESCE(p_scheduledactionid, NULL) END,
                CASE WHEN p_scheduledjobid_clear = true THEN NULL ELSE COALESCE(p_scheduledjobid, NULL) END,
                CASE WHEN p_segmenterkey_clear = true THEN NULL ELSE COALESCE(p_segmenterkey, NULL) END,
                CASE WHEN p_cleanerkey_clear = true THEN NULL ELSE COALESCE(p_cleanerkey, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "${flyway:defaultSchema}"."vwContentSources"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateContentSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateContentSource" TO "cdp_Integration";

/* spCreate Permissions for MJ: Content Sources */
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateContentSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateContentSource" TO "cdp_Integration";

/* spUpdate SQL for MJ: Content Sources */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Sources
-- Item: spUpdateContentSource
-- Generated at: 2026-08-12T02:39:14.350Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ContentSource
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateContentSource'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."spUpdateContentSource"(
    p_id UUID,
    p_name_clear boolean DEFAULT false,
    p_name varchar(255) DEFAULT NULL,
    p_contenttypeid UUID DEFAULT NULL,
    p_contentsourcetypeid UUID DEFAULT NULL,
    p_contentfiletypeid UUID DEFAULT NULL,
    p_url varchar(2000) DEFAULT NULL,
    p_embeddingmodelid_clear boolean DEFAULT false,
    p_embeddingmodelid UUID DEFAULT NULL,
    p_vectorindexid_clear boolean DEFAULT false,
    p_vectorindexid UUID DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_entityid_clear boolean DEFAULT false,
    p_entityid UUID DEFAULT NULL,
    p_entitydocumentid_clear boolean DEFAULT false,
    p_entitydocumentid UUID DEFAULT NULL,
    p_scheduledactionid_clear boolean DEFAULT false,
    p_scheduledactionid UUID DEFAULT NULL,
    p_scheduledjobid_clear boolean DEFAULT false,
    p_scheduledjobid uuid DEFAULT NULL,
    p_segmenterkey_clear boolean DEFAULT false,
    p_segmenterkey varchar(100) DEFAULT NULL,
    p_cleanerkey_clear boolean DEFAULT false,
    p_cleanerkey varchar(100) DEFAULT NULL
) RETURNS SETOF "${flyway:defaultSchema}"."vwContentSources" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "${flyway:defaultSchema}"."ContentSource"
    SET
        "Name" = CASE WHEN p_name_clear = true THEN NULL ELSE COALESCE(p_name, "Name") END,
        "ContentTypeID" = COALESCE(p_contenttypeid, "ContentTypeID"),
        "ContentSourceTypeID" = COALESCE(p_contentsourcetypeid, "ContentSourceTypeID"),
        "ContentFileTypeID" = COALESCE(p_contentfiletypeid, "ContentFileTypeID"),
        "URL" = COALESCE(p_url, "URL"),
        "EmbeddingModelID" = CASE WHEN p_embeddingmodelid_clear = true THEN NULL ELSE COALESCE(p_embeddingmodelid, "EmbeddingModelID") END,
        "VectorIndexID" = CASE WHEN p_vectorindexid_clear = true THEN NULL ELSE COALESCE(p_vectorindexid, "VectorIndexID") END,
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "EntityID" = CASE WHEN p_entityid_clear = true THEN NULL ELSE COALESCE(p_entityid, "EntityID") END,
        "EntityDocumentID" = CASE WHEN p_entitydocumentid_clear = true THEN NULL ELSE COALESCE(p_entitydocumentid, "EntityDocumentID") END,
        "ScheduledActionID" = CASE WHEN p_scheduledactionid_clear = true THEN NULL ELSE COALESCE(p_scheduledactionid, "ScheduledActionID") END,
        "ScheduledJobID" = CASE WHEN p_scheduledjobid_clear = true THEN NULL ELSE COALESCE(p_scheduledjobid, "ScheduledJobID") END,
        "SegmenterKey" = CASE WHEN p_segmenterkey_clear = true THEN NULL ELSE COALESCE(p_segmenterkey, "SegmenterKey") END,
        "CleanerKey" = CASE WHEN p_cleanerkey_clear = true THEN NULL ELSE COALESCE(p_cleanerkey, "CleanerKey") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "${flyway:defaultSchema}"."vwContentSources"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateContentSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateContentSource" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentSource table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."fn_trg_update_content_source"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_content_source" ON "${flyway:defaultSchema}"."ContentSource";

CREATE TRIGGER "trg_update_content_source"
BEFORE UPDATE ON "${flyway:defaultSchema}"."ContentSource"
FOR EACH ROW
EXECUTE FUNCTION "${flyway:defaultSchema}"."fn_trg_update_content_source"();

/* spUpdate Permissions for MJ: Content Sources */
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateContentSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateContentSource" TO "cdp_Integration";

/* spDelete SQL for MJ: Content Sources */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Sources
-- Item: spDeleteContentSource
-- Generated at: 2026-08-12T02:39:14.351Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ContentSource
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteContentSource'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."spDeleteContentSource"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "${flyway:defaultSchema}"."ContentSource"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteContentSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteContentSource" TO "cdp_Integration";

/* spDelete Permissions for MJ: Content Sources */
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteContentSource" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteContentSource" TO "cdp_Integration";

/* SQL text to update entity field related entity name field map for entity field ID b65d6fe8-b3f5-4bf9-b4b7-cfe536d50d93 */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('b65d6fe8-b3f5-4bf9-b4b7-cfe536d50d93', 'ConversationDetail');

/* SQL text to update entity field related entity name field map for entity field ID 91226f06-c330-4876-a609-22df823b12e3 */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('91226f06-c330-4876-a609-22df823b12e3', 'PromptRun');

/* SQL text to update entity field related entity name field map for entity field ID 86caa55a-44d1-46cd-b073-1e864e1233ae */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('86caa55a-44d1-46cd-b073-1e864e1233ae', 'ScopeEntity');

/* Base View SQL for MJ: Entity Actions */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Actions
-- Item: vwEntityActions
-- Generated at: 2026-08-12T02:39:14.635Z
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Actions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntityAction
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "${flyway:defaultSchema}"."vwEntityActions"
AS
SELECT
    e.*,
    MJEntity_EntityID."Name" AS "Entity",
    MJAction_ActionID."Name" AS "Action",
    MJEntity_ScopeEntityID."Name" AS "ScopeEntity"
FROM
    "${flyway:defaultSchema}"."EntityAction" AS e
INNER JOIN
    "${flyway:defaultSchema}"."Entity" AS MJEntity_EntityID
  ON
    "e"."EntityID" = MJEntity_EntityID."ID"
INNER JOIN
    "${flyway:defaultSchema}"."Action" AS MJAction_ActionID
  ON
    "e"."ActionID" = MJAction_ActionID."ID"
LEFT OUTER JOIN
    "${flyway:defaultSchema}"."Entity" AS MJEntity_ScopeEntityID
  ON
    "e"."ScopeEntityID" = MJEntity_ScopeEntityID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '${flyway:defaultSchema}'
    AND tc.relname = 'vwEntityActions'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '${flyway:defaultSchema}'
    AND tc.relname = 'vwEntityActions'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '${flyway:defaultSchema}'
        AND tc.relname = 'vwEntityActions'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "${flyway:defaultSchema}"."vwEntityActions" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "${flyway:defaultSchema}"."vwEntityActions" TO "cdp_UI";
GRANT SELECT ON "${flyway:defaultSchema}"."vwEntityActions" TO "cdp_Integration";
GRANT SELECT ON "${flyway:defaultSchema}"."vwEntityActions" TO "cdp_Developer";

/* Base View Permissions SQL for MJ: Entity Actions */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Actions
-- Item: Permissions for vwEntityActions
-- Generated at: 2026-08-12T02:39:14.637Z
-- ============================================================
GRANT SELECT ON "${flyway:defaultSchema}"."vwEntityActions" TO "cdp_UI";
GRANT SELECT ON "${flyway:defaultSchema}"."vwEntityActions" TO "cdp_Integration";
GRANT SELECT ON "${flyway:defaultSchema}"."vwEntityActions" TO "cdp_Developer";

/* spCreate SQL for MJ: Entity Actions */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Actions
-- Item: spCreateEntityAction
-- Generated at: 2026-08-12T02:39:14.637Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR EntityAction
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntityAction'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."spCreateEntityAction"(
    p_entityid UUID,
    p_actionid UUID,
    p_status varchar(20) DEFAULT NULL,
    p_id UUID DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_scopeentityid_clear boolean DEFAULT false,
    p_scopeentityid UUID DEFAULT NULL,
    p_scoperecordid_clear boolean DEFAULT false,
    p_scoperecordid varchar(450) DEFAULT NULL,
    p_loggingmode varchar(20) DEFAULT NULL,
    p_runmode varchar(20) DEFAULT NULL
) RETURNS SETOF "${flyway:defaultSchema}"."vwEntityActions" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "${flyway:defaultSchema}"."EntityAction"
        (
            "ID",
            "EntityID",
                "ActionID",
                "Status",
                "Sequence",
                "ScopeEntityID",
                "ScopeRecordID",
                "LoggingMode",
                "RunMode"
        )
    VALUES
        (
            v_new_id,
            p_entityid,
                p_actionid,
                COALESCE(p_status, 'Pending'),
                COALESCE(p_sequence, 0),
                CASE WHEN p_scopeentityid_clear = true THEN NULL ELSE COALESCE(p_scopeentityid, NULL) END,
                CASE WHEN p_scoperecordid_clear = true THEN NULL ELSE COALESCE(p_scoperecordid, NULL) END,
                COALESCE(p_loggingmode, 'All'),
                COALESCE(p_runmode, 'Inline')
        )
    ;

    RETURN QUERY
    SELECT * FROM "${flyway:defaultSchema}"."vwEntityActions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateEntityAction" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateEntityAction" TO "cdp_Developer";

/* spCreate Permissions for MJ: Entity Actions */
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateEntityAction" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateEntityAction" TO "cdp_Developer";

/* spUpdate SQL for MJ: Entity Actions */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Actions
-- Item: spUpdateEntityAction
-- Generated at: 2026-08-12T02:39:14.638Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR EntityAction
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntityAction'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."spUpdateEntityAction"(
    p_entityid UUID DEFAULT NULL,
    p_actionid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_id UUID DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_scopeentityid_clear boolean DEFAULT false,
    p_scopeentityid UUID DEFAULT NULL,
    p_scoperecordid_clear boolean DEFAULT false,
    p_scoperecordid varchar(450) DEFAULT NULL,
    p_loggingmode varchar(20) DEFAULT NULL,
    p_runmode varchar(20) DEFAULT NULL
) RETURNS SETOF "${flyway:defaultSchema}"."vwEntityActions" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "${flyway:defaultSchema}"."EntityAction"
    SET
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "ActionID" = COALESCE(p_actionid, "ActionID"),
        "Status" = COALESCE(p_status, "Status"),
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "ScopeEntityID" = CASE WHEN p_scopeentityid_clear = true THEN NULL ELSE COALESCE(p_scopeentityid, "ScopeEntityID") END,
        "ScopeRecordID" = CASE WHEN p_scoperecordid_clear = true THEN NULL ELSE COALESCE(p_scoperecordid, "ScopeRecordID") END,
        "LoggingMode" = COALESCE(p_loggingmode, "LoggingMode"),
        "RunMode" = COALESCE(p_runmode, "RunMode")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "${flyway:defaultSchema}"."vwEntityActions"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateEntityAction" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateEntityAction" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityAction table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."fn_trg_update_entity_action"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_entity_action" ON "${flyway:defaultSchema}"."EntityAction";

CREATE TRIGGER "trg_update_entity_action"
BEFORE UPDATE ON "${flyway:defaultSchema}"."EntityAction"
FOR EACH ROW
EXECUTE FUNCTION "${flyway:defaultSchema}"."fn_trg_update_entity_action"();

/* spUpdate Permissions for MJ: Entity Actions */
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateEntityAction" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateEntityAction" TO "cdp_Developer";

/* spDelete SQL for MJ: Entity Actions */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Actions
-- Item: spDeleteEntityAction
-- Generated at: 2026-08-12T02:39:14.638Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR EntityAction
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteEntityAction'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."spDeleteEntityAction"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "${flyway:defaultSchema}"."EntityAction"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteEntityAction" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteEntityAction" TO "cdp_Developer";

/* spDelete Permissions for MJ: Entity Actions */
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteEntityAction" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteEntityAction" TO "cdp_Developer";

/* SQL text to update entity field related entity name field map for entity field ID 01763e29-5f3a-49b2-9003-eca37b943d4e */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('01763e29-5f3a-49b2-9003-eca37b943d4e', 'AISkill');

/* Base View SQL for MJ: Task Dependencies */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Task Dependencies
-- Item: vwTaskDependencies
-- Generated at: 2026-08-12T02:39:15.363Z
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Task Dependencies
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  TaskDependency
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "${flyway:defaultSchema}"."vwTaskDependencies"
AS
SELECT
    t.*,
    MJTask_TaskID."Name" AS "Task",
    MJTask_DependsOnTaskID."Name" AS "DependsOnTask"
FROM
    "${flyway:defaultSchema}"."TaskDependency" AS t
INNER JOIN
    "${flyway:defaultSchema}"."Task" AS MJTask_TaskID
  ON
    "t"."TaskID" = MJTask_TaskID."ID"
INNER JOIN
    "${flyway:defaultSchema}"."Task" AS MJTask_DependsOnTaskID
  ON
    "t"."DependsOnTaskID" = MJTask_DependsOnTaskID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '${flyway:defaultSchema}'
    AND tc.relname = 'vwTaskDependencies'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '${flyway:defaultSchema}'
    AND tc.relname = 'vwTaskDependencies'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '${flyway:defaultSchema}'
        AND tc.relname = 'vwTaskDependencies'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "${flyway:defaultSchema}"."vwTaskDependencies" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "${flyway:defaultSchema}"."vwTaskDependencies" TO "cdp_UI";
GRANT SELECT ON "${flyway:defaultSchema}"."vwTaskDependencies" TO "cdp_Developer";
GRANT SELECT ON "${flyway:defaultSchema}"."vwTaskDependencies" TO "cdp_Integration";

/* Base View Permissions SQL for MJ: Task Dependencies */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Task Dependencies
-- Item: Permissions for vwTaskDependencies
-- Generated at: 2026-08-12T02:39:15.365Z
-- ============================================================
GRANT SELECT ON "${flyway:defaultSchema}"."vwTaskDependencies" TO "cdp_UI";
GRANT SELECT ON "${flyway:defaultSchema}"."vwTaskDependencies" TO "cdp_Developer";
GRANT SELECT ON "${flyway:defaultSchema}"."vwTaskDependencies" TO "cdp_Integration";

/* spCreate SQL for MJ: Task Dependencies */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Task Dependencies
-- Item: spCreateTaskDependency
-- Generated at: 2026-08-12T02:39:15.365Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR TaskDependency
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateTaskDependency'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."spCreateTaskDependency"(
    p_id UUID DEFAULT NULL,
    p_taskid UUID DEFAULT NULL,
    p_dependsontaskid UUID DEFAULT NULL,
    p_dependencytype varchar(50) DEFAULT NULL,
    p_condition_clear boolean DEFAULT false,
    p_condition text DEFAULT NULL,
    p_priority int DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_exclusivegroup_clear boolean DEFAULT false,
    p_exclusivegroup varchar(255) DEFAULT NULL
) RETURNS SETOF "${flyway:defaultSchema}"."vwTaskDependencies" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "${flyway:defaultSchema}"."TaskDependency"
        (
            "ID",
            "TaskID",
                "DependsOnTaskID",
                "DependencyType",
                "Condition",
                "Priority",
                "Sequence",
                "ExclusiveGroup"
        )
    VALUES
        (
            v_new_id,
            p_taskid,
                p_dependsontaskid,
                COALESCE(p_dependencytype, 'Prerequisite'),
                CASE WHEN p_condition_clear = true THEN NULL ELSE COALESCE(p_condition, NULL) END,
                COALESCE(p_priority, 0),
                COALESCE(p_sequence, 0),
                CASE WHEN p_exclusivegroup_clear = true THEN NULL ELSE COALESCE(p_exclusivegroup, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "${flyway:defaultSchema}"."vwTaskDependencies"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateTaskDependency" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateTaskDependency" TO "cdp_Integration";

/* spCreate Permissions for MJ: Task Dependencies */
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateTaskDependency" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateTaskDependency" TO "cdp_Integration";

/* spUpdate SQL for MJ: Task Dependencies */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Task Dependencies
-- Item: spUpdateTaskDependency
-- Generated at: 2026-08-12T02:39:15.365Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR TaskDependency
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateTaskDependency'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."spUpdateTaskDependency"(
    p_id UUID,
    p_taskid UUID DEFAULT NULL,
    p_dependsontaskid UUID DEFAULT NULL,
    p_dependencytype varchar(50) DEFAULT NULL,
    p_condition_clear boolean DEFAULT false,
    p_condition text DEFAULT NULL,
    p_priority int DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_exclusivegroup_clear boolean DEFAULT false,
    p_exclusivegroup varchar(255) DEFAULT NULL
) RETURNS SETOF "${flyway:defaultSchema}"."vwTaskDependencies" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "${flyway:defaultSchema}"."TaskDependency"
    SET
        "TaskID" = COALESCE(p_taskid, "TaskID"),
        "DependsOnTaskID" = COALESCE(p_dependsontaskid, "DependsOnTaskID"),
        "DependencyType" = COALESCE(p_dependencytype, "DependencyType"),
        "Condition" = CASE WHEN p_condition_clear = true THEN NULL ELSE COALESCE(p_condition, "Condition") END,
        "Priority" = COALESCE(p_priority, "Priority"),
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "ExclusiveGroup" = CASE WHEN p_exclusivegroup_clear = true THEN NULL ELSE COALESCE(p_exclusivegroup, "ExclusiveGroup") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "${flyway:defaultSchema}"."vwTaskDependencies"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateTaskDependency" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateTaskDependency" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TaskDependency table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."fn_trg_update_task_dependency"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_task_dependency" ON "${flyway:defaultSchema}"."TaskDependency";

CREATE TRIGGER "trg_update_task_dependency"
BEFORE UPDATE ON "${flyway:defaultSchema}"."TaskDependency"
FOR EACH ROW
EXECUTE FUNCTION "${flyway:defaultSchema}"."fn_trg_update_task_dependency"();

/* spUpdate Permissions for MJ: Task Dependencies */
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateTaskDependency" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateTaskDependency" TO "cdp_Integration";

/* spDelete SQL for MJ: Task Dependencies */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Task Dependencies
-- Item: spDeleteTaskDependency
-- Generated at: 2026-08-12T02:39:15.365Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR TaskDependency
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteTaskDependency'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."spDeleteTaskDependency"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "${flyway:defaultSchema}"."TaskDependency"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteTaskDependency" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteTaskDependency" TO "cdp_Integration";

/* spDelete Permissions for MJ: Task Dependencies */
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteTaskDependency" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteTaskDependency" TO "cdp_Integration";

/* SQL text to update entity field related entity name field map for entity field ID 4bbbbcc7-939d-4263-8e9e-739734722f01 */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('4bbbbcc7-939d-4263-8e9e-739734722f01', 'AgentRun');

/* SQL text to update entity field related entity name field map for entity field ID 24ee08a4-b3a0-45d6-8b08-1cf6750b17eb */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('24ee08a4-b3a0-45d6-8b08-1cf6750b17eb', 'Action');

/* SQL text to update entity field related entity name field map for entity field ID 42cf0a0b-1729-468d-ad07-9697999fa8b8 */
SELECT * FROM "${flyway:defaultSchema}"."spUpdateEntityFieldRelatedEntityNameFieldMap"('42cf0a0b-1729-468d-ad07-9697999fa8b8', 'Prompt');

/* Root ID Function SQL for MJ: Tasks.ParentID */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tasks
-- Item: fnTaskParentID_GetRootID
-- Generated at: 2026-08-12T02:39:15.383Z
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: Task.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."fn_task_parent_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            "${flyway:defaultSchema}"."Task"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            "${flyway:defaultSchema}"."Task" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;

/* Base View SQL for MJ: Tasks */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tasks
-- Item: vwTasks
-- Generated at: 2026-08-12T02:39:15.383Z
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Tasks
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Task
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "${flyway:defaultSchema}"."vwTasks"
AS
SELECT
    t.*,
    MJTask_ParentID."Name" AS "Parent",
    MJTaskType_TypeID."Name" AS "Type",
    MJEnvironment_EnvironmentID."Name" AS "Environment",
    MJProject_ProjectID."Name" AS "Project",
    MJConversationDetail_ConversationDetailID."ExternalID" AS "ConversationDetail",
    MJUser_UserID."Name" AS "User",
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIAgentRun_AgentRunID."RunName" AS "AgentRun",
    MJAction_ActionID."Name" AS "Action",
    MJAIPrompt_PromptID."Name" AS "Prompt",
    root_ParentID.root_id AS "RootParentID"
FROM
    "${flyway:defaultSchema}"."Task" AS t
LEFT OUTER JOIN
    "${flyway:defaultSchema}"."Task" AS MJTask_ParentID
  ON
    "t"."ParentID" = MJTask_ParentID."ID"
INNER JOIN
    "${flyway:defaultSchema}"."TaskType" AS MJTaskType_TypeID
  ON
    "t"."TypeID" = MJTaskType_TypeID."ID"
INNER JOIN
    "${flyway:defaultSchema}"."Environment" AS MJEnvironment_EnvironmentID
  ON
    "t"."EnvironmentID" = MJEnvironment_EnvironmentID."ID"
LEFT OUTER JOIN
    "${flyway:defaultSchema}"."Project" AS MJProject_ProjectID
  ON
    "t"."ProjectID" = MJProject_ProjectID."ID"
LEFT OUTER JOIN
    "${flyway:defaultSchema}"."ConversationDetail" AS MJConversationDetail_ConversationDetailID
  ON
    "t"."ConversationDetailID" = MJConversationDetail_ConversationDetailID."ID"
LEFT OUTER JOIN
    "${flyway:defaultSchema}"."User" AS MJUser_UserID
  ON
    "t"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    "${flyway:defaultSchema}"."AIAgent" AS MJAIAgent_AgentID
  ON
    "t"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    "${flyway:defaultSchema}"."AIAgentRun" AS MJAIAgentRun_AgentRunID
  ON
    "t"."AgentRunID" = MJAIAgentRun_AgentRunID."ID"
LEFT OUTER JOIN
    "${flyway:defaultSchema}"."Action" AS MJAction_ActionID
  ON
    "t"."ActionID" = MJAction_ActionID."ID"
LEFT OUTER JOIN
    "${flyway:defaultSchema}"."AIPrompt" AS MJAIPrompt_PromptID
  ON
    "t"."PromptID" = MJAIPrompt_PromptID."ID"

LEFT JOIN LATERAL (
    SELECT "${flyway:defaultSchema}"."fn_task_parent_id_get_root_id"(t."ID", t."ParentID") AS root_id
) AS root_ParentID ON true
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '${flyway:defaultSchema}'
    AND tc.relname = 'vwTasks'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '${flyway:defaultSchema}'
    AND tc.relname = 'vwTasks'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '${flyway:defaultSchema}'
        AND tc.relname = 'vwTasks'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "${flyway:defaultSchema}"."vwTasks" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "${flyway:defaultSchema}"."vwTasks" TO "cdp_UI";
GRANT SELECT ON "${flyway:defaultSchema}"."vwTasks" TO "cdp_Developer";
GRANT SELECT ON "${flyway:defaultSchema}"."vwTasks" TO "cdp_Integration";

/* Base View Permissions SQL for MJ: Tasks */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tasks
-- Item: Permissions for vwTasks
-- Generated at: 2026-08-12T02:39:15.387Z
-- ============================================================
GRANT SELECT ON "${flyway:defaultSchema}"."vwTasks" TO "cdp_UI";
GRANT SELECT ON "${flyway:defaultSchema}"."vwTasks" TO "cdp_Developer";
GRANT SELECT ON "${flyway:defaultSchema}"."vwTasks" TO "cdp_Integration";

/* spCreate SQL for MJ: Tasks */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tasks
-- Item: spCreateTask
-- Generated at: 2026-08-12T02:39:15.387Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Task
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateTask'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."spCreateTask"(
    p_id UUID DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_typeid UUID DEFAULT NULL,
    p_environmentid UUID DEFAULT NULL,
    p_projectid_clear boolean DEFAULT false,
    p_projectid UUID DEFAULT NULL,
    p_conversationdetailid_clear boolean DEFAULT false,
    p_conversationdetailid UUID DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid UUID DEFAULT NULL,
    p_agentid_clear boolean DEFAULT false,
    p_agentid UUID DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_percentcomplete_clear boolean DEFAULT false,
    p_percentcomplete int DEFAULT NULL,
    p_dueat_clear boolean DEFAULT false,
    p_dueat TIMESTAMPTZ DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_inputpayload_clear boolean DEFAULT false,
    p_inputpayload text DEFAULT NULL,
    p_outputpayload_clear boolean DEFAULT false,
    p_outputpayload text DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage text DEFAULT NULL,
    p_agentrunid_clear boolean DEFAULT false,
    p_agentrunid uuid DEFAULT NULL,
    p_claimedby_clear boolean DEFAULT false,
    p_claimedby text DEFAULT NULL,
    p_claimexpiresat_clear boolean DEFAULT false,
    p_claimexpiresat timestamptz DEFAULT NULL,
    p_actionid_clear boolean DEFAULT false,
    p_actionid UUID DEFAULT NULL,
    p_steptype_clear boolean DEFAULT false,
    p_steptype varchar(20) DEFAULT NULL,
    p_promptid_clear boolean DEFAULT false,
    p_promptid UUID DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL
) RETURNS SETOF "${flyway:defaultSchema}"."vwTasks" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "${flyway:defaultSchema}"."Task"
        (
            "ID",
            "ParentID",
                "Name",
                "Description",
                "TypeID",
                "EnvironmentID",
                "ProjectID",
                "ConversationDetailID",
                "UserID",
                "AgentID",
                "Status",
                "PercentComplete",
                "DueAt",
                "StartedAt",
                "CompletedAt",
                "InputPayload",
                "OutputPayload",
                "ErrorMessage",
                "AgentRunID",
                "ClaimedBy",
                "ClaimExpiresAt",
                "ActionID",
                "StepType",
                "PromptID",
                "Configuration"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END,
                p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_typeid,
                CASE WHEN p_environmentid = '00000000-0000-0000-0000-000000000000'::UUID THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE COALESCE(p_environmentid, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                CASE WHEN p_projectid_clear = true THEN NULL ELSE COALESCE(p_projectid, NULL) END,
                CASE WHEN p_conversationdetailid_clear = true THEN NULL ELSE COALESCE(p_conversationdetailid, NULL) END,
                CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, NULL) END,
                CASE WHEN p_agentid_clear = true THEN NULL ELSE COALESCE(p_agentid, NULL) END,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_percentcomplete_clear = true THEN NULL ELSE COALESCE(p_percentcomplete, 0) END,
                CASE WHEN p_dueat_clear = true THEN NULL ELSE COALESCE(p_dueat, NULL) END,
                CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, NULL) END,
                CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, NULL) END,
                CASE WHEN p_inputpayload_clear = true THEN NULL ELSE COALESCE(p_inputpayload, NULL) END,
                CASE WHEN p_outputpayload_clear = true THEN NULL ELSE COALESCE(p_outputpayload, NULL) END,
                CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, NULL) END,
                CASE WHEN p_agentrunid_clear = true THEN NULL ELSE COALESCE(p_agentrunid, NULL) END,
                CASE WHEN p_claimedby_clear = true THEN NULL ELSE COALESCE(p_claimedby, NULL) END,
                CASE WHEN p_claimexpiresat_clear = true THEN NULL ELSE COALESCE(p_claimexpiresat, NULL) END,
                CASE WHEN p_actionid_clear = true THEN NULL ELSE COALESCE(p_actionid, NULL) END,
                CASE WHEN p_steptype_clear = true THEN NULL ELSE COALESCE(p_steptype, NULL) END,
                CASE WHEN p_promptid_clear = true THEN NULL ELSE COALESCE(p_promptid, NULL) END,
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "${flyway:defaultSchema}"."vwTasks"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateTask" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateTask" TO "cdp_Integration";

/* spCreate Permissions for MJ: Tasks */
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateTask" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spCreateTask" TO "cdp_Integration";

/* spUpdate SQL for MJ: Tasks */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tasks
-- Item: spUpdateTask
-- Generated at: 2026-08-12T02:39:15.387Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Task
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateTask'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."spUpdateTask"(
    p_id UUID,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_typeid UUID DEFAULT NULL,
    p_environmentid UUID DEFAULT NULL,
    p_projectid_clear boolean DEFAULT false,
    p_projectid UUID DEFAULT NULL,
    p_conversationdetailid_clear boolean DEFAULT false,
    p_conversationdetailid UUID DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid UUID DEFAULT NULL,
    p_agentid_clear boolean DEFAULT false,
    p_agentid UUID DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_percentcomplete_clear boolean DEFAULT false,
    p_percentcomplete int DEFAULT NULL,
    p_dueat_clear boolean DEFAULT false,
    p_dueat TIMESTAMPTZ DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_inputpayload_clear boolean DEFAULT false,
    p_inputpayload text DEFAULT NULL,
    p_outputpayload_clear boolean DEFAULT false,
    p_outputpayload text DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage text DEFAULT NULL,
    p_agentrunid_clear boolean DEFAULT false,
    p_agentrunid uuid DEFAULT NULL,
    p_claimedby_clear boolean DEFAULT false,
    p_claimedby text DEFAULT NULL,
    p_claimexpiresat_clear boolean DEFAULT false,
    p_claimexpiresat timestamptz DEFAULT NULL,
    p_actionid_clear boolean DEFAULT false,
    p_actionid UUID DEFAULT NULL,
    p_steptype_clear boolean DEFAULT false,
    p_steptype varchar(20) DEFAULT NULL,
    p_promptid_clear boolean DEFAULT false,
    p_promptid UUID DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL
) RETURNS SETOF "${flyway:defaultSchema}"."vwTasks" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "${flyway:defaultSchema}"."Task"
    SET
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END,
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "TypeID" = COALESCE(p_typeid, "TypeID"),
        "EnvironmentID" = COALESCE(p_environmentid, "EnvironmentID"),
        "ProjectID" = CASE WHEN p_projectid_clear = true THEN NULL ELSE COALESCE(p_projectid, "ProjectID") END,
        "ConversationDetailID" = CASE WHEN p_conversationdetailid_clear = true THEN NULL ELSE COALESCE(p_conversationdetailid, "ConversationDetailID") END,
        "UserID" = CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, "UserID") END,
        "AgentID" = CASE WHEN p_agentid_clear = true THEN NULL ELSE COALESCE(p_agentid, "AgentID") END,
        "Status" = COALESCE(p_status, "Status"),
        "PercentComplete" = CASE WHEN p_percentcomplete_clear = true THEN NULL ELSE COALESCE(p_percentcomplete, "PercentComplete") END,
        "DueAt" = CASE WHEN p_dueat_clear = true THEN NULL ELSE COALESCE(p_dueat, "DueAt") END,
        "StartedAt" = CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, "StartedAt") END,
        "CompletedAt" = CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, "CompletedAt") END,
        "InputPayload" = CASE WHEN p_inputpayload_clear = true THEN NULL ELSE COALESCE(p_inputpayload, "InputPayload") END,
        "OutputPayload" = CASE WHEN p_outputpayload_clear = true THEN NULL ELSE COALESCE(p_outputpayload, "OutputPayload") END,
        "ErrorMessage" = CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, "ErrorMessage") END,
        "AgentRunID" = CASE WHEN p_agentrunid_clear = true THEN NULL ELSE COALESCE(p_agentrunid, "AgentRunID") END,
        "ClaimedBy" = CASE WHEN p_claimedby_clear = true THEN NULL ELSE COALESCE(p_claimedby, "ClaimedBy") END,
        "ClaimExpiresAt" = CASE WHEN p_claimexpiresat_clear = true THEN NULL ELSE COALESCE(p_claimexpiresat, "ClaimExpiresAt") END,
        "ActionID" = CASE WHEN p_actionid_clear = true THEN NULL ELSE COALESCE(p_actionid, "ActionID") END,
        "StepType" = CASE WHEN p_steptype_clear = true THEN NULL ELSE COALESCE(p_steptype, "StepType") END,
        "PromptID" = CASE WHEN p_promptid_clear = true THEN NULL ELSE COALESCE(p_promptid, "PromptID") END,
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "${flyway:defaultSchema}"."vwTasks"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateTask" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateTask" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Task table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."fn_trg_update_task"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_task" ON "${flyway:defaultSchema}"."Task";

CREATE TRIGGER "trg_update_task"
BEFORE UPDATE ON "${flyway:defaultSchema}"."Task"
FOR EACH ROW
EXECUTE FUNCTION "${flyway:defaultSchema}"."fn_trg_update_task"();

/* spUpdate Permissions for MJ: Tasks */
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateTask" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spUpdateTask" TO "cdp_Integration";

/* spDelete SQL for MJ: Tasks */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Tasks
-- Item: spDeleteTask
-- Generated at: 2026-08-12T02:39:15.387Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Task
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteTask'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "${flyway:defaultSchema}"."spDeleteTask"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "${flyway:defaultSchema}"."Task"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteTask" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteTask" TO "cdp_Integration";

/* spDelete Permissions for MJ: Tasks */
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteTask" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "${flyway:defaultSchema}"."spDeleteTask" TO "cdp_Integration";


-- ============================================================================
-- APP-OWNED BASE VIEW: MJ: AI Models
--
-- MJ: AI Models has BaseViewGenerated = false, so CodeGen does not write vwAIModels — the
-- application owns it. On SQL Server that still works when a column is added, because the migration
-- calls sp_refreshview and the view re-resolves. PostgreSQL has no equivalent: it expands the column
-- list at CREATE time and freezes it (see packages/CodeGenLib/CLAUDE.md). So an app-owned view on PG
-- silently keeps its old column list forever, and this release adds AIModel.ModelConfiguration.
--
-- The consequence is not a missing column in one view. spDeleteUnneededEntityFields treats a
-- metadata field with no matching view column as unneeded and DELETES the EntityField row, so the
-- new column disappears from metadata too — and Metadata_Sync then calls spCreateAIModel with a
-- p_modelconfiguration argument that no longer exists in the signature. That is the failure this
-- section prevents.
--
-- Recreated, not refreshed, because recreation is the only mechanism PostgreSQL offers. The
-- definition is the live one with m."ModelConfiguration" inserted in table-column order; nothing
-- else about the view changes. CASCADE is deliberately NOT used — dependent objects are recreated
-- explicitly below, so a dependency this migration does not know about stays a loud failure.
-- ============================================================================

DROP VIEW IF EXISTS __mj."vwAIModels";
CREATE VIEW __mj."vwAIModels" AS
 SELECT m."ID",
    m."Name",
    m."Description",
    m."AIModelTypeID",
    m."PowerRank",
    m."IsActive",
    m."__mj_CreatedAt",
    m."__mj_UpdatedAt",
    m."SpeedRank",
    m."CostRank",
    m."ModelSelectionInsights",
    m."InheritTypeModalities",
    m."PriorVersionID",
    m."SupportsPrefill",
    m."PrefillFallbackText",
    m."ModelConfiguration",
    "AIModelType_AIModelTypeID"."Name" AS "AIModelType",
    v."Name" AS "Vendor",
    mv."DriverClass",
    mv."DriverImportPath",
    mv."APIName",
    mv."MaxInputTokens" AS "InputTokenLimit",
    mv."SupportedResponseFormats",
    mv."SupportsEffortLevel"
   FROM __mj."AIModel" m
     JOIN __mj."AIModelType" "AIModelType_AIModelTypeID" ON m."AIModelTypeID" = "AIModelType_AIModelTypeID"."ID"
     LEFT JOIN LATERAL ( SELECT mv_1."ModelID",
            mv_1."DriverClass",
            mv_1."DriverImportPath",
            mv_1."APIName",
            mv_1."MaxInputTokens",
            mv_1."SupportedResponseFormats",
            mv_1."SupportsEffortLevel",
            mv_1."VendorID"
           FROM __mj."vwAIModelVendors" mv_1
          WHERE mv_1."ModelID" = m."ID" AND mv_1."Status"::text = 'Active'::text AND mv_1."Type"::text = 'Inference Provider'::text
          ORDER BY mv_1."Priority" DESC
         LIMIT 1) mv ON true
     LEFT JOIN __mj."AIVendor" v ON mv."VendorID" = v."ID";

GRANT SELECT ON __mj."vwAIModels" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

-- ============================================================================
-- CRUD routines for MJ: AI Models, regenerated for the new column.
--
-- Taken verbatim from CodeGen's own output (SQL Scripts/generated/__mj/spCreateAIModel.sp.generated.sql
-- and spUpdateAIModel.sp.generated.sql), not hand-written — CodeGen produced them correctly, it just
-- omitted them from the CodeGen_Run migration because the entity was never flagged as modified (its
-- base view, which CodeGen does not own, did not change).
-- ============================================================================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Models
-- Item: spCreateAIModel
-- Generated at: 2026-08-12T02:42:21.066Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIModel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIModel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIModel"(
    p_id UUID DEFAULT NULL,
    p_name varchar(50) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_aimodeltypeid UUID DEFAULT NULL,
    p_powerrank_clear boolean DEFAULT false,
    p_powerrank int DEFAULT NULL,
    p_isactive BOOLEAN DEFAULT NULL,
    p_speedrank_clear boolean DEFAULT false,
    p_speedrank int DEFAULT NULL,
    p_costrank_clear boolean DEFAULT false,
    p_costrank int DEFAULT NULL,
    p_modelselectioninsights_clear boolean DEFAULT false,
    p_modelselectioninsights TEXT DEFAULT NULL,
    p_inherittypemodalities BOOLEAN DEFAULT NULL,
    p_priorversionid_clear boolean DEFAULT false,
    p_priorversionid UUID DEFAULT NULL,
    p_supportsprefill_clear boolean DEFAULT false,
    p_supportsprefill BOOLEAN DEFAULT NULL,
    p_prefillfallbacktext_clear boolean DEFAULT false,
    p_prefillfallbacktext TEXT DEFAULT NULL,
    p_modelconfiguration_clear boolean DEFAULT false,
    p_modelconfiguration TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIModels" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIModel"
        (
            "ID",
            "Name",
                "Description",
                "AIModelTypeID",
                "PowerRank",
                "IsActive",
                "SpeedRank",
                "CostRank",
                "ModelSelectionInsights",
                "InheritTypeModalities",
                "PriorVersionID",
                "SupportsPrefill",
                "PrefillFallbackText",
                "ModelConfiguration"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_aimodeltypeid,
                CASE WHEN p_powerrank_clear = true THEN NULL ELSE COALESCE(p_powerrank, 0) END,
                COALESCE(p_isactive, TRUE),
                CASE WHEN p_speedrank_clear = true THEN NULL ELSE COALESCE(p_speedrank, 0) END,
                CASE WHEN p_costrank_clear = true THEN NULL ELSE COALESCE(p_costrank, 0) END,
                CASE WHEN p_modelselectioninsights_clear = true THEN NULL ELSE COALESCE(p_modelselectioninsights, NULL) END,
                COALESCE(p_inherittypemodalities, TRUE),
                CASE WHEN p_priorversionid_clear = true THEN NULL ELSE COALESCE(p_priorversionid, NULL) END,
                CASE WHEN p_supportsprefill_clear = true THEN NULL ELSE COALESCE(p_supportsprefill, NULL) END,
                CASE WHEN p_prefillfallbacktext_clear = true THEN NULL ELSE COALESCE(p_prefillfallbacktext, NULL) END,
                CASE WHEN p_modelconfiguration_clear = true THEN NULL ELSE COALESCE(p_modelconfiguration, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIModels"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIModel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIModel" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Models
-- Item: spUpdateAIModel
-- Generated at: 2026-08-12T02:42:21.066Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIModel
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIModel'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIModel"(
    p_id UUID,
    p_name varchar(50) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_aimodeltypeid UUID DEFAULT NULL,
    p_powerrank_clear boolean DEFAULT false,
    p_powerrank int DEFAULT NULL,
    p_isactive BOOLEAN DEFAULT NULL,
    p_speedrank_clear boolean DEFAULT false,
    p_speedrank int DEFAULT NULL,
    p_costrank_clear boolean DEFAULT false,
    p_costrank int DEFAULT NULL,
    p_modelselectioninsights_clear boolean DEFAULT false,
    p_modelselectioninsights TEXT DEFAULT NULL,
    p_inherittypemodalities BOOLEAN DEFAULT NULL,
    p_priorversionid_clear boolean DEFAULT false,
    p_priorversionid UUID DEFAULT NULL,
    p_supportsprefill_clear boolean DEFAULT false,
    p_supportsprefill BOOLEAN DEFAULT NULL,
    p_prefillfallbacktext_clear boolean DEFAULT false,
    p_prefillfallbacktext TEXT DEFAULT NULL,
    p_modelconfiguration_clear boolean DEFAULT false,
    p_modelconfiguration TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIModels" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIModel"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "AIModelTypeID" = COALESCE(p_aimodeltypeid, "AIModelTypeID"),
        "PowerRank" = CASE WHEN p_powerrank_clear = true THEN NULL ELSE COALESCE(p_powerrank, "PowerRank") END,
        "IsActive" = COALESCE(p_isactive, "IsActive"),
        "SpeedRank" = CASE WHEN p_speedrank_clear = true THEN NULL ELSE COALESCE(p_speedrank, "SpeedRank") END,
        "CostRank" = CASE WHEN p_costrank_clear = true THEN NULL ELSE COALESCE(p_costrank, "CostRank") END,
        "ModelSelectionInsights" = CASE WHEN p_modelselectioninsights_clear = true THEN NULL ELSE COALESCE(p_modelselectioninsights, "ModelSelectionInsights") END,
        "InheritTypeModalities" = COALESCE(p_inherittypemodalities, "InheritTypeModalities"),
        "PriorVersionID" = CASE WHEN p_priorversionid_clear = true THEN NULL ELSE COALESCE(p_priorversionid, "PriorVersionID") END,
        "SupportsPrefill" = CASE WHEN p_supportsprefill_clear = true THEN NULL ELSE COALESCE(p_supportsprefill, "SupportsPrefill") END,
        "PrefillFallbackText" = CASE WHEN p_prefillfallbacktext_clear = true THEN NULL ELSE COALESCE(p_prefillfallbacktext, "PrefillFallbackText") END,
        "ModelConfiguration" = CASE WHEN p_modelconfiguration_clear = true THEN NULL ELSE COALESCE(p_modelconfiguration, "ModelConfiguration") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIModels"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIModel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIModel" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIModel table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_model"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_model" ON "__mj"."AIModel";

CREATE TRIGGER "trg_update_ai_model"
BEFORE UPDATE ON "__mj"."AIModel"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_model"();


GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIModel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIModel" TO "cdp_Integration";


GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIModel" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIModel" TO "cdp_Integration";

