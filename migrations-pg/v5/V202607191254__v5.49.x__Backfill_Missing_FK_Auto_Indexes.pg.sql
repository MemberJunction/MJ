-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202607191254__v5.49.x__Backfill_Missing_FK_Auto_Indexes
-- Hand-authored PG counterpart of the SQL Server FK-auto-index backfill.
-- Six CodeGen-convention foreign key indexes (IDX_AUTO_MJ_FKEY_{Table}_{Column})
-- that were never emitted into an executed migration (see the SS file's root-cause
-- notes). Index names match CodeGen's convention EXACTLY so consistency checks
-- pass and future CodeGen runs recognize them as present.
--
-- IDEMPOTENT by construction: PG's CREATE INDEX IF NOT EXISTS is the native
-- analog of the SS file's sys.indexes existence guards. Safe to re-run.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- CompanyIntegrationRun.ScheduledJobRunID
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_CompanyIntegrationRun_ScheduledJobRunID"
    ON __mj."CompanyIntegrationRun" ("ScheduledJobRunID");

-- CompanyIntegration.ScheduledJobID
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_CompanyIntegration_ScheduledJobID"
    ON __mj."CompanyIntegration" ("ScheduledJobID");

-- TemplateCategory.ParentID (self-referencing FK)
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TemplateCategory_ParentID"
    ON __mj."TemplateCategory" ("ParentID");

-- TemplateCategory.UserID
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TemplateCategory_UserID"
    ON __mj."TemplateCategory" ("UserID");

-- TemplateContent.TemplateID
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TemplateContent_TemplateID"
    ON __mj."TemplateContent" ("TemplateID");

-- TemplateContent.TypeID
CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TemplateContent_TypeID"
    ON __mj."TemplateContent" ("TypeID");
