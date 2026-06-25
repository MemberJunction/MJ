-- PostgreSQL twin of migrations/v5/V202606171600__v5.41.x__Integration_DeclaredIntent_Columns.sql
-- Adds the v5.41.x connector capability + declared-intent columns to IntegrationObject + Integration.
-- Type mapping: BIT -> BOOLEAN, NVARCHAR(n) -> VARCHAR(n), NVARCHAR(MAX) -> TEXT, DEFAULT (0/1) -> FALSE/TRUE.
-- Idempotent (ADD COLUMN IF NOT EXISTS) so it is safe on a fresh install AND when re-asserted by the
-- drift-backfill migration. Column descriptions are carried by MJ metadata/CodeGen on PG (no SS extended
-- properties on this platform), so none are emitted here.
ALTER TABLE __mj."IntegrationObject"
    ADD COLUMN IF NOT EXISTS "SupportsCreate"        BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "SupportsUpdate"        BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "SupportsDelete"        BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "SyncStrategy"          VARCHAR(50)  NULL,
    ADD COLUMN IF NOT EXISTS "ContentHashApplicable" BOOLEAN      NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS "StableOrderingKey"     VARCHAR(255) NULL;

ALTER TABLE __mj."Integration"
    ADD COLUMN IF NOT EXISTS "Configuration" TEXT NULL;
