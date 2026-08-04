-- PG-ONLY forward drift-repair (no SQL Server twin — this reconciles ALREADY-DEPLOYED PostgreSQL
-- databases whose historical .pg.sql ledger drifted from SQL Server). The split-and-regenerate flow
-- only fixes NEW migrations + fresh installs; an existing PG that applied a wrong/partial migration
-- (e.g. V202603080719's PG version left CompanyIntegration short of its scheduling/lock columns —
-- PG_MIGRATION_REPORT.md: 25/29 columns) is NOT retroactively repaired by forward-conversion. This
-- migration is that repair. Every statement is IDEMPOTENT (ADD COLUMN / INDEX / CONSTRAINT IF NOT
-- EXISTS), so it is a no-op on a clean/fresh PG install and only fills genuine gaps on a drifted one.

-- 1) CompanyIntegration scheduling + distributed-lock columns (V202603080719 drift on PG).
ALTER TABLE __mj."CompanyIntegration"
    ADD COLUMN IF NOT EXISTS "ScheduleEnabled"          BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "ScheduleType"             VARCHAR(20)  NOT NULL DEFAULT 'Manual',
    ADD COLUMN IF NOT EXISTS "ScheduleIntervalMinutes"  INTEGER      NULL,
    ADD COLUMN IF NOT EXISTS "CronExpression"           VARCHAR(200) NULL,
    ADD COLUMN IF NOT EXISTS "NextScheduledRunAt"       TIMESTAMPTZ  NULL,
    ADD COLUMN IF NOT EXISTS "LastScheduledRunAt"       TIMESTAMPTZ  NULL,
    ADD COLUMN IF NOT EXISTS "IsLocked"                 BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "LockedAt"                 TIMESTAMPTZ  NULL,
    ADD COLUMN IF NOT EXISTS "LockedByInstance"         VARCHAR(200) NULL,
    ADD COLUMN IF NOT EXISTS "LockExpiresAt"            TIMESTAMPTZ  NULL;

-- ScheduleType CHECK constraint (guarded — PG has no ADD CONSTRAINT IF NOT EXISTS).
DO $mj_ck_scheduletype$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CK_CompanyIntegration_ScheduleType') THEN
        ALTER TABLE __mj."CompanyIntegration"
            ADD CONSTRAINT "CK_CompanyIntegration_ScheduleType"
            CHECK ("ScheduleType" IN ('Manual', 'Interval', 'Cron'));
    END IF;
END
$mj_ck_scheduletype$;

-- 2) v5.41.x DeclaredIntent capability columns — re-asserted for an EXISTING PG that is already past
--    version V202606171600 (where flyway would skip the .pg.sql twin as out-of-order). No-op if present.
ALTER TABLE __mj."IntegrationObject"
    ADD COLUMN IF NOT EXISTS "SupportsCreate"        BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "SupportsUpdate"        BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "SupportsDelete"        BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "SyncStrategy"          VARCHAR(50)  NULL,
    ADD COLUMN IF NOT EXISTS "ContentHashApplicable" BOOLEAN      NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS "StableOrderingKey"     VARCHAR(255) NULL;

ALTER TABLE __mj."Integration"
    ADD COLUMN IF NOT EXISTS "Configuration" TEXT NULL;

-- 3) Sync dedup/upsert identity index (v5.41.x) — re-asserted for the same out-of-order reason.
CREATE INDEX IF NOT EXISTS "IDX_CompanyIntegrationRecordMap_Identity"
    ON __mj."CompanyIntegrationRecordMap" ("CompanyIntegrationID", "EntityID", "ExternalSystemRecordID");

-- NOTE (follow-up, requires a live PG↔SS schema diff to author safely): PG_MIGRATION_REPORT.md also
-- flags 2-column gaps on CompanyIntegrationEntityMap / CompanyIntegrationFieldMap /
-- CompanyIntegrationSyncWatermark / IntegrationSourceType. Those exact columns are not hard-coded here
-- because they must be diffed against the live PG schema (done at PG-test time) to avoid guessing — the
-- same idempotent ADD COLUMN IF NOT EXISTS pattern applies once the diff confirms the names/types.
