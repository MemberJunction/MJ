-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202607061429__v5.45.x__APIKeyUsageLog_Cascade_Delete.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."APIKeyUsageLog"
DROP CONSTRAINT "FK__APIKeyUsa__APIKe__56D4A469" /* Migration: APIKeyUsageLog -> APIKey ON DELETE CASCADE */ /* Description: The APIKeyUsageLog.APIKeyID foreign key was created with NO ACTION, */ /*              which blocks deleting an APIKey once any usage-log rows exist for it. */ /*              spDeleteAPIKey performs a plain DELETE FROM APIKey and relies on */ /*              DB-level cascade for its children; the sibling child FKs */ /*              (APIKeyScope.APIKeyID, APIKeyApplication.APIKeyID) are already */ /*              ON DELETE CASCADE. This aligns APIKeyUsageLog with them. */ /* Tradeoff: deleting an APIKey now also deletes its APIKeyUsageLog audit rows. */ /* FK-only change: no table columns change, so no CodeGen / entity regeneration */ /* is required (spDeleteAPIKey already relies on DB cascade for its children). */;

ALTER TABLE __mj."APIKeyUsageLog"
  ADD CONSTRAINT "FK__APIKeyUsa__APIKe__56D4A469" FOREIGN KEY ("APIKeyID") REFERENCES __mj."APIKey" (
    "ID"
  ) ON DELETE CASCADE;
