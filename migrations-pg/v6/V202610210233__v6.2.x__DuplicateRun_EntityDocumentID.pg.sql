-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610210233__v6.2.x__DuplicateRun_EntityDocumentID.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ╔══ CONVERSION GAPS — RESOLVED BY HAND ══╗
-- The transpiler kept T-SQL's alias forms in the step 2 backfill (`UPDATE alias … FROM t AS alias`)
-- and the step 3 deletes (`DELETE alias FROM … JOIN …`); they are written here as PostgreSQL's
-- `UPDATE t AS alias … WHERE` and `DELETE FROM … USING …`, same rows. Its drop-dependent-views
-- block before the NOT NULL is removed: no view references the column this migration adds, and
-- SET NOT NULL needs no type change.
-- This file carries no CodeGen objects (a gapped file is not baked). The base view and CRUD
-- routines of MJ: Duplicate Runs are in the release's PG_CodeGen_Regen.pg-only.sql.
-- ╚════════════════════════════════════════╝

ALTER TABLE __mj."DuplicateRun"
ADD COLUMN "EntityDocumentID" UUID NULL /* ============================================================================= */ /* DuplicateRun.EntityDocumentID (v6.2.x) */ /* ============================================================================= */ /* A duplicate run now records the Entity Document it ran with. Until now a run carried only its */ /* EntityID, and the server chose the entity's newest active Record Duplicate document itself, so */ /* when an entity had more than one, the document picked in the Duplicates tab was ignored and */ /* nothing recorded which document produced a run's matches. */ /* Steps: */ /*   1. Add the column, nullable. */ /*   2. Backfill existing runs from their entity's documents: a 'Record Duplicate' document first, */ /*      then an Active one, then the most recently updated. */ /*   3. Delete runs whose entity has no Entity Document at all, with their details and matches. */ /*      They cannot satisfy the NOT NULL below, and with no document their results cannot be */ /*      reproduced or traced. Most installs have no such rows. */ /*   4. Add the foreign key and make the column NOT NULL, so every run names its document. */ /* An Entity Document with history (duplicate runs, synced vectors) cannot be deleted: nothing */ /* cascades from it (metadata/entities/.entity-cascade-deletes-entity-documents.json turns */ /* CascadeDeletes off for MJ: Entity Documents), so the foreign keys refuse the delete before */ /* anything is removed and the history stays as an audit trail. A document that is no longer */ /* needed is set Inactive instead. */ /* DDL, the backfill the NOT NULL needs, and extended properties only. The FK index, base view, */ /* stored procedures and EntityField metadata are produced by CodeGen and appended below the */ /* CodeGen banner. */ /* ============================================================================= */ /* 1. Column */;

/* 2. Backfill */
UPDATE __mj."DuplicateRun" AS "dr" SET "EntityDocumentID" = (
  SELECT
    "ed"."ID"
  FROM __mj."EntityDocument" AS "ed"
  LEFT JOIN __mj."EntityDocumentType" AS "edt"
    ON "edt"."ID" = "ed"."TypeID"
  WHERE
    "ed"."EntityID" = "dr"."EntityID"
  ORDER BY
    CASE WHEN "edt"."Name" = 'Record Duplicate' THEN 0 ELSE 1 END,
    CASE WHEN "ed"."Status" = 'Active' THEN 0 ELSE 1 END,
    "ed"."__mj_UpdatedAt" DESC NULLS LAST
  LIMIT 1
)
WHERE
  "dr"."EntityDocumentID" IS NULL;

/* 3. Runs that cannot be backfilled: their entity has no Entity Document */
DELETE FROM __mj."DuplicateRunDetailMatch" AS "drdm"
  USING __mj."DuplicateRunDetail" AS "drd", __mj."DuplicateRun" AS "dr"
WHERE
  "drd"."ID" = "drdm"."DuplicateRunDetailID"
  AND "dr"."ID" = "drd"."DuplicateRunID"
  AND "dr"."EntityDocumentID" IS NULL;
DELETE FROM __mj."DuplicateRunDetail" AS "drd"
  USING __mj."DuplicateRun" AS "dr"
WHERE
  "dr"."ID" = "drd"."DuplicateRunID"
  AND "dr"."EntityDocumentID" IS NULL;
DELETE FROM __mj."DuplicateRun"
WHERE
  "EntityDocumentID" IS NULL;

ALTER TABLE __mj."DuplicateRun"
  ADD CONSTRAINT "FK_DuplicateRun_EntityDocument" FOREIGN KEY ("EntityDocumentID") REFERENCES __mj."EntityDocument" (
    "ID"
  )
 /* 4. Foreign key, then mandatory */;

ALTER TABLE __mj."DuplicateRun" ALTER COLUMN "EntityDocumentID" SET NOT NULL;

COMMENT ON COLUMN __mj."DuplicateRun"."EntityDocumentID" IS 'The Entity Document this run used: its template, vectors, match thresholds and LLM reasoning settings produced the run''s matches.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '19586230-545f-4177-8b82-e1840440cd58' OR ("EntityID" = '30248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'EntityDocumentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('19586230-545f-4177-8b82-e1840440cd58', '30248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Duplicate Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '30248F34-2837-EF11-86D4-6045BDEE16E6'), 'EntityDocumentID', 'Entity Document ID', 'The Entity Document this run used: its template, vectors, match thresholds and LLM reasoning settings produced the run''s matches.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '22248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'bf132d70-0aae-4e34-9882-c49b0e918c51') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bf132d70-0aae-4e34-9882-c49b0e918c51', '22248F34-2837-EF11-86D4-6045BDEE16E6', '30248F34-2837-EF11-86D4-6045BDEE16E6', 'EntityDocumentID', 'One To Many', TRUE, TRUE, 5, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8265b3e3-cfc4-4f3e-b740-9db9de5f68ee' OR ("EntityID" = '30248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'EntityDocument')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8265b3e3-cfc4-4f3e-b740-9db9de5f68ee', '30248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Duplicate Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '30248F34-2837-EF11-86D4-6045BDEE16E6'), 'EntityDocument', 'Entity Document', NULL, 'nvarchar', 500, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = FALSE
WHERE
  "ID" = '424417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateIsNameField" = TRUE;

/* Set categories for 2 fields */
/* UPDATE Entity Field Category Info MJ: Duplicate Runs.EntityDocumentID */
UPDATE __mj."EntityField" SET "Category" = 'Run Overview', "GeneratedFormSection" = 'Category', "DisplayName" = 'Entity Document'
WHERE
  "ID" = '19586230-545F-4177-8B82-E1840440CD58';
/* UPDATE Entity Field Category Info MJ: Duplicate Runs.EntityDocument */
UPDATE __mj."EntityField" SET "Category" = 'Run Overview', "GeneratedFormSection" = 'Category', "DisplayName" = 'Entity Document Name'
WHERE
  "ID" = '8265B3E3-CFC4-4F3E-B740-9DB9DE5F68EE';
