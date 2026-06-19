-- ============================================================================
-- Fix NULL ordering in two custom (non-CodeGen-managed) views.
--
-- T-SQL `ORDER BY x DESC` sorts NULLs LAST; PostgreSQL's default for DESC is
-- NULLS FIRST. The committed definitions of these views came from the old
-- regex converter, which dropped the compensation — so "the latest run" could
-- select a row with a NULL sort key on PG but never on SQL Server.
--
-- (The CodeGen metadata-management support routines that previously shared
-- this migration now ship inside CodeGenLib itself — the PostgreSQL provider
-- ensures them at the start of every manageMetadata run. See
-- packages/CodeGenLib/src/Database/providers/postgresql/metadataSupportObjects.ts.)
--
-- Idempotent: CREATE OR REPLACE VIEW throughout.
-- ============================================================================

CREATE OR REPLACE VIEW __mj."vwCompanyIntegrationRunsRanked" AS
SELECT "ID",
    "CompanyIntegrationID",
    "StartedAt",
    "EndedAt",
    "TotalRecords",
    "RunByUserID",
    "Comments",
    rank() OVER (PARTITION BY "CompanyIntegrationID" ORDER BY "ID" DESC NULLS LAST) AS "RunOrder"
   FROM __mj."CompanyIntegrationRun" ci;

CREATE OR REPLACE VIEW __mj."vwCompanyIntegrations" AS
SELECT ci."ID",
    ci."CompanyID",
    ci."IntegrationID",
    ci."IsActive",
    ci."AccessToken",
    ci."RefreshToken",
    ci."TokenExpirationDate",
    ci."APIKey",
    ci."ExternalSystemID",
    ci."IsExternalSystemReadOnly",
    ci."ClientID",
    ci."ClientSecret",
    ci."CustomAttribute1",
    ci."__mj_CreatedAt",
    ci."__mj_UpdatedAt",
    ci."Name",
    ci."SourceTypeID",
    ci."Configuration",
    ci."CredentialID",
    ci."ScheduleEnabled",
    ci."ScheduleType",
    ci."ScheduleIntervalMinutes",
    ci."CronExpression",
    ci."NextScheduledRunAt",
    ci."LastScheduledRunAt",
    ci."IsLocked",
    ci."LockedAt",
    ci."LockedByInstance",
    ci."LockExpiresAt",
    ci."ScheduledJobID",
    c."Name" AS "Company",
    i."Name" AS "Integration",
    i."ClassName" AS "DriverClassName",
    i."ImportPath" AS "DriverImportPath",
    cir."ID" AS "LastRunID",
    cir."StartedAt" AS "LastRunStartedAt",
    cir."EndedAt" AS "LastRunEndedAt"
   FROM __mj."CompanyIntegration" ci
     JOIN __mj."Company" c ON ci."CompanyID" = c."ID"
     JOIN __mj."Integration" i ON ci."IntegrationID" = i."ID"
     LEFT JOIN __mj."CompanyIntegrationRun" cir ON ci."ID" = cir."CompanyIntegrationID" AND cir."ID" = (( SELECT cirinner."ID"
           FROM __mj."CompanyIntegrationRun" cirinner
          WHERE cirinner."CompanyIntegrationID" = ci."ID"
          ORDER BY cirinner."StartedAt" DESC NULLS LAST
         LIMIT 1));
