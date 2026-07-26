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

-- Migration: APIKeyUsageLog -> APIKey ON DELETE CASCADE
-- Description: The APIKeyUsageLog.APIKeyID foreign key was created with NO ACTION,
--              which blocks deleting an APIKey once any usage-log rows exist for it.
--              spDeleteAPIKey performs a plain DELETE FROM APIKey and relies on
--              DB-level cascade for its children; the sibling child FKs
--              (APIKeyScope.APIKeyID, APIKeyApplication.APIKeyID) are already
--              ON DELETE CASCADE. This aligns APIKeyUsageLog with them.
--
-- Tradeoff: deleting an APIKey now also deletes its APIKeyUsageLog audit rows.
--
-- FK-only change: no table columns change, so no CodeGen / entity regeneration
-- is required (spDeleteAPIKey already relies on DB cascade for its children).

-- Dynamically look up the FK constraint name since PostgreSQL auto-generates
-- the suffix when no explicit name is provided, and the name may differ per
-- database instance.
DO $$
DECLARE
    v_fk_name TEXT;
BEGIN
    SELECT con.conname INTO v_fk_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_class ref ON ref.oid = con.confrelid
    JOIN pg_attribute att ON att.attrelid = con.conrelid
                         AND att.attnum = ANY(con.conkey)
    WHERE rel.relname   = 'APIKeyUsageLog'
      AND nsp.nspname   = '__mj'
      AND att.attname    = 'APIKeyID'
      AND ref.relname    = 'APIKey'
      AND con.contype    = 'f';

    IF v_fk_name IS NOT NULL THEN
        EXECUTE format(
            'ALTER TABLE __mj."APIKeyUsageLog" DROP CONSTRAINT %I',
            v_fk_name
        );
    END IF;
END
$$;

ALTER TABLE __mj."APIKeyUsageLog"
  ADD CONSTRAINT "FK_APIKeyUsageLog_APIKeyID"
  FOREIGN KEY ("APIKeyID") REFERENCES __mj."APIKey" ("ID")
  ON DELETE CASCADE;
