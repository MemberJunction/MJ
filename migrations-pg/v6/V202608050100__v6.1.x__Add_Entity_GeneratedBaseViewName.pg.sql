-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202608050100__v6.1.x__Add_Entity_GeneratedBaseViewName.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."Entity"
ADD COLUMN "GeneratedBaseViewName" VARCHAR(255) NULL /* ============================================================================= */ /* Entity.GeneratedBaseViewName — let an entity have BOTH a generated base view */ /* and a custom one layered over it. */ /* ============================================================================= */ /* THE PROBLEM THIS SOLVES. `BaseViewGenerated = 0` is all-or-nothing: CodeGen */ /* stops generating the base view entirely, so the application inherits the WHOLE */ /* thing — every related-entity display join, the geo join, the recursive root-ID */ /* OUTER APPLY, the soft-delete predicate — in order to add one computed column. */ /* That inheritance is not a one-time cost. It is a standing obligation to */ /* hand-maintain generated SQL: add a foreign key later and its display field */ /* simply never appears, because nothing regenerates the join. The failure is */ /* silent — the column is absent rather than wrong — which is the worst shape a */ /* schema defect can take. It also freezes the entity at whatever MemberJunction */ /* generated on the day the view was copied; geo columns and root-ID columns both */ /* arrived after custom views existed in the wild, and no custom view has them */ /* unless somebody hand-merged. */ /* WHAT THIS COLUMN DOES. When `GeneratedBaseViewName` is non-NULL, CodeGen keeps */ /* generating a full base view — under THAT name — and the application owns */ /* `BaseView`, which is expected to wrap it: */ /*     CREATE VIEW vwOrderHeaders AS */ /*     SELECT g.*, CASE WHEN ... END AS IsOverdue */ /*     FROM   vwOrderHeadersGenerated g */ /* The application layer is then a few reviewable lines, and everything */ /* underneath keeps regenerating. A new foreign key appears automatically. */ /* ADDITIVE ON PURPOSE. NULL — every existing row — reproduces today's behaviour */ /* exactly: `BaseViewGenerated` alone decides, and there is no second view. This */ /* introduces no migration of semantics and nothing to re-verify for installs */ /* that do not opt in. */ /* WHAT READS WHICH. `BaseView` remains the entity's public surface: entity field */ /* discovery, permissions, and the generated CRUD procedures all target it, so a */ /* computed column added in the custom layer becomes a first-class EntityField */ /* (IsVirtual = 1) and is returned by spCreate/spUpdate/spDelete like any other. */ /* `GeneratedBaseViewName` is an implementation detail of that surface. */ /* ============================================================================= */;

ALTER TABLE __mj."Entity"
  ADD CONSTRAINT "CK_Entity_GeneratedBaseViewName_NotBaseView" CHECK ("GeneratedBaseViewName" IS NULL
  OR (
    NOT "BaseView" IS NULL AND "GeneratedBaseViewName" <> "BaseView"
  ))
 /* A view cannot select from itself. Equal names would be an infinite recursion */ /* that SQL Server reports at query time, far from the metadata that caused it, */ /* so it is refused where it is written. */ /* The BaseView IS NOT NULL arm is not redundant. `X <> NULL` evaluates to UNKNOWN, */ /* and a CHECK constraint PASSES on UNKNOWN — so without it a row could name an */ /* inner view while leaving the public surface NULL. That row is "layered" by every */ /* runtime test, but permissions and the CRUD procedures target BaseView, so CodeGen */ /* would emit GRANT/SELECT against [schema].[null]. Layering requires a public view */ /* to layer onto. */;

ALTER TABLE __mj."Entity"
  ADD CONSTRAINT "CK_Entity_LayeredBaseView_RequiresCustomBaseView" CHECK ("GeneratedBaseViewName" IS NULL OR "BaseViewGenerated" = FALSE)
 /* Layering requires BaseViewGenerated = 0. The combination BaseViewGenerated = 1 */ /* WITH an inner name is contradictory — the flag claims CodeGen writes BaseView, */ /* the name says the application owns it — and the two halves of CodeGen read */ /* different columns, so in that state they disagree: */ /*   · View GENERATION gates on `BaseViewGenerated || HasLayeredBaseView`, so the */ /*     inner view is written. */ /*   · The outer view's REFRESH and its GRANTs gate on `!BaseViewGenerated`, so */ /*     both are skipped. */ /* The result is an entity whose public surface is never granted and never */ /* refreshed, while CodeGen reports success. Nothing errors; the view is simply */ /* unreadable by the roles that should have it, and stale besides. */ /* `EntityInfo.HasLayeredBaseView` deliberately ignores BaseViewGenerated — were it */ /* to honour it, this same combination would make CodeGen treat the entity as */ /* ordinary and OVERWRITE the application's hand-written BaseView. That fail-safe is */ /* the right default and stays; refusing the state here means it is never relied on. */ /* Together with the constraint above, the three documented arrangements are now the */ /* only reachable ones. */;

COMMENT ON COLUMN __mj."Entity"."GeneratedBaseViewName" IS 'When set, CodeGen generates the entity''s full base view under THIS name instead of BaseView, and the application owns BaseView — which is expected to wrap it (SELECT g.*, <extras> FROM <GeneratedBaseViewName> g). This gives an entity a custom base view WITHOUT inheriting the generated SQL: related-entity display joins, geo columns and recursive root-ID columns keep regenerating underneath, so a foreign key added later still appears. NULL (the default, and every pre-existing row) means the previous all-or-nothing behaviour: BaseViewGenerated alone decides whether CodeGen writes BaseView, and there is no second view. BaseView remains the public surface — entity field discovery, permissions and the generated CRUD procedures all target it. SQL SERVER ONLY: layering relies on sp_refreshview to re-resolve the application-owned outer view''s SELECT * against a regenerated inner view. PostgreSQL freezes a view''s column list at creation and has no refresh equivalent, so CodeGen rejects this column on PostgreSQL rather than let the outer view go silently stale.';

ALTER TABLE __mj."Entity"
  ADD COLUMN "AllowDirectSQLInsert" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "AllowDirectSQLUpdate" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "AllowDirectSQLDelete" BOOLEAN NOT NULL DEFAULT FALSE
 /* ============================================================================= */ /* Entity.AllowDirectSQLInsert / AllowDirectSQLUpdate / AllowDirectSQLDelete */ /* Declare, per entity, which writes may bypass BaseEntity. */ /* ============================================================================= */ /* THE DEFAULT IS "NO". MemberJunction's contract is that every mutation flows */ /* through `BaseEntity.Save()` / `.Delete()`, because that is the only path where */ /* the platform's guarantees actually run: */ /*   · Record Changes         — the audit trail (TrackRecordChanges) */ /*   · Cache invalidation     — BaseEntity events maintain the server RunView */ /*                              cache and drive cross-server pub/sub */ /*   · Entity Actions         — create/update/delete hooks */ /*   · Validation             — field rules and BaseEntity subclass overrides */ /*   · Soft delete            — DELETE means "set DeletedAt", not "remove the row" */ /* SQL written outside that path silently skips ALL of it. These three columns */ /* make the exception explicit and reviewable instead of tribal knowledge. */ /* WHAT THEY ARE. A DECLARATION, not an enforcement. Nothing here can stop anyone */ /* from opening a query window and issuing DML — no constraint, trigger or grant */ /* in this migration attempts to. They record which entities are SANCTIONED for */ /* direct SQL so that the code paths and tooling which *choose* to honour the */ /* contract can consult one authoritative answer: bulk/ETL and integration sync, */ /* record-set processing, and agents or generators authoring SQL. Treat a `0` as */ /* "if you are about to write raw DML against this table, you are doing something */ /* the platform does not expect." */ /* WHY THREE COLUMNS AND NOT ONE. The verbs carry genuinely different risk. A */ /* bulk INSERT on a staging-shaped entity is routine; a direct DELETE on a */ /* soft-delete entity destroys rows the platform promised to keep. Splitting them */ /* lets an entity sanction the cheap case without also sanctioning the dangerous */ /* one. */ /* THE INVARIANTS ARE ENFORCED. Two CHECK constraints below, because both failure */ /* modes they prevent are silent: */ /*   1. Direct SQL requires TrackRecordChanges = 0 AND TrustServerCacheCompletely = 0. */ /*      Direct DML writes no RecordChange row and fires no invalidation event, so */ /*      leaving either flag on yields an audit trail that LOOKS complete but is */ /*      not, and a server cache that serves stale rows indefinitely. Neither */ /*      errors; both are discovered long after the fact. Note that */ /*      `TrustServerCacheCompletely` already documents exactly this scenario */ /*      ("entities whose rows are created as side-effects of other operations via */ /*      raw SQL") — these columns are the declarative half of that same fact. */ /*   2. AllowDirectSQLDelete requires DeleteType = 'Hard'. A direct DELETE against */ /*      a soft-delete entity removes the row outright rather than setting */ /*      DeletedAt, defeating soft delete entirely. */ /* Consequence worth knowing: you cannot later turn TrackRecordChanges back on */ /* (or convert an entity to soft delete) while a direct-SQL flag is set. That is */ /* deliberate — it forces the conversation rather than silently degrading the */ /* guarantee. */ /* ADDITIVE. All three default to 0, which is exactly today's behaviour, so every */ /* existing row satisfies both constraints on creation and no install changes */ /* semantics unless it opts in. */ /* ============================================================================= */;

ALTER TABLE __mj."Entity"
  ADD CONSTRAINT "CK_Entity_AllowDirectSQL_RequiresUntrackedUncached" CHECK ((
    "AllowDirectSQLInsert" = FALSE
    AND "AllowDirectSQLUpdate" = FALSE
    AND "AllowDirectSQLDelete" = FALSE
  )
  OR (
    "TrackRecordChanges" = FALSE AND "TrustServerCacheCompletely" = FALSE
  ))
 /* Direct SQL bypasses both the audit trail and cache invalidation. An entity that */ /* sanctions it must therefore claim neither guarantee. Multi-column CHECK, so it is */ /* a TABLE-level constraint and CodeGen will not mistake it for a column value list. */;

ALTER TABLE __mj."Entity"
  ADD CONSTRAINT "CK_Entity_AllowDirectSQLDelete_RequiresHardDelete" CHECK ("AllowDirectSQLDelete" = FALSE OR "DeleteType" = 'Hard')
 /* A direct DELETE removes the row; it does not set DeletedAt. Sanctioning it on a */ /* soft-delete entity would quietly defeat soft delete, so the combination is refused. */;

COMMENT ON COLUMN __mj."Entity"."AllowDirectSQLInsert" IS 'When 1, this entity may be populated by INSERT statements that do not go through BaseEntity.Save() — bulk loads, ETL/integration sync, or rows created as a side effect of a stored procedure. Default 0, meaning every insert is expected to flow through BaseEntity so that record-change tracking, entity actions, validation and cache invalidation all run. This column DECLARES intent for the code paths and tooling that consult it; it does not and cannot prevent anyone from executing SQL. Requires TrackRecordChanges = 0 and TrustServerCacheCompletely = 0, because a direct insert produces neither an audit row nor a cache-invalidation event.';

COMMENT ON COLUMN __mj."Entity"."AllowDirectSQLUpdate" IS 'When 1, this entity may be modified by UPDATE statements that do not go through BaseEntity.Save() — bulk backfills, integration sync, or maintenance routines. Default 0, meaning every update is expected to flow through BaseEntity so that record-change tracking, entity actions, validation and cache invalidation all run. This column DECLARES intent for the code paths and tooling that consult it; it does not and cannot prevent anyone from executing SQL. Requires TrackRecordChanges = 0 and TrustServerCacheCompletely = 0, because a direct update produces neither an audit row nor a cache-invalidation event.';

COMMENT ON COLUMN __mj."Entity"."AllowDirectSQLDelete" IS 'When 1, this entity may have rows removed by DELETE statements that do not go through BaseEntity.Delete() — purge and retention routines, or integration sync reconciling a remote source. Default 0, meaning every delete is expected to flow through BaseEntity so that record-change tracking, entity actions, cascade handling and cache invalidation all run. This column DECLARES intent for the code paths and tooling that consult it; it does not and cannot prevent anyone from executing SQL. Requires TrackRecordChanges = 0 and TrustServerCacheCompletely = 0, and additionally requires DeleteType = ''Hard'' — a direct DELETE removes the row outright rather than setting DeletedAt, which would defeat soft delete.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '750c9831-e23f-4edf-85ed-acf1685bbceb' OR ("EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'GeneratedBaseViewName')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('750c9831-e23f-4edf-85ed-acf1685bbceb', 'E0238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Entities */, 100146, 'GeneratedBaseViewName', 'Generated Base View Name', 'When set, CodeGen generates the entity''s full base view under THIS name instead of BaseView, and the application owns BaseView — which is expected to wrap it (SELECT g.*, <extras> FROM <GeneratedBaseViewName> g). This gives an entity a custom base view WITHOUT inheriting the generated SQL: related-entity display joins, geo columns and recursive root-ID columns keep regenerating underneath, so a foreign key added later still appears. NULL (the default, and every pre-existing row) means the previous all-or-nothing behaviour: BaseViewGenerated alone decides whether CodeGen writes BaseView, and there is no second view. BaseView remains the public surface — entity field discovery, permissions and the generated CRUD procedures all target it. SQL SERVER ONLY: layering relies on sp_refreshview to re-resolve the application-owned outer view''s SELECT * against a regenerated inner view. PostgreSQL freezes a view''s column list at creation and has no refresh equivalent, so CodeGen rejects this column on PostgreSQL rather than let the outer view go silently stale.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4a020410-e5a6-4484-9f1e-88c5c010f42a' OR ("EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'AllowDirectSQLInsert')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4a020410-e5a6-4484-9f1e-88c5c010f42a', 'E0238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Entities */, 100147, 'AllowDirectSQLInsert', 'Allow Direct SQL Insert', 'When 1, this entity may be populated by INSERT statements that do not go through BaseEntity.Save() — bulk loads, ETL/integration sync, or rows created as a side effect of a stored procedure. Default 0, meaning every insert is expected to flow through BaseEntity so that record-change tracking, entity actions, validation and cache invalidation all run. This column DECLARES intent for the code paths and tooling that consult it; it does not and cannot prevent anyone from executing SQL. Requires TrackRecordChanges = 0 and TrustServerCacheCompletely = 0, because a direct insert produces neither an audit row nor a cache-invalidation event.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7e46d739-bfcc-4fff-a831-c38b8ad195c0' OR ("EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'AllowDirectSQLUpdate')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7e46d739-bfcc-4fff-a831-c38b8ad195c0', 'E0238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Entities */, 100148, 'AllowDirectSQLUpdate', 'Allow Direct SQL Update', 'When 1, this entity may be modified by UPDATE statements that do not go through BaseEntity.Save() — bulk backfills, integration sync, or maintenance routines. Default 0, meaning every update is expected to flow through BaseEntity so that record-change tracking, entity actions, validation and cache invalidation all run. This column DECLARES intent for the code paths and tooling that consult it; it does not and cannot prevent anyone from executing SQL. Requires TrackRecordChanges = 0 and TrustServerCacheCompletely = 0, because a direct update produces neither an audit row nor a cache-invalidation event.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '81621c87-9505-456c-9c8e-6f955ec7c22c' OR ("EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'AllowDirectSQLDelete')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('81621c87-9505-456c-9c8e-6f955ec7c22c', 'E0238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Entities */, 100149, 'AllowDirectSQLDelete', 'Allow Direct SQL Delete', 'When 1, this entity may have rows removed by DELETE statements that do not go through BaseEntity.Delete() — purge and retention routines, or integration sync reconciling a remote source. Default 0, meaning every delete is expected to flow through BaseEntity so that record-change tracking, entity actions, cascade handling and cache invalidation all run. This column DECLARES intent for the code paths and tooling that consult it; it does not and cannot prevent anyone from executing SQL. Requires TrackRecordChanges = 0 and TrustServerCacheCompletely = 0, and additionally requires DeleteType = ''Hard'' — a direct DELETE removes the row outright rather than setting DeletedAt, which would defeat soft delete.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = '__mj' AND tablename = 'Entity' AND indexname = 'IDX_AUTO_MJ_FKEY_Entity_ParentID') THEN
    CREATE INDEX "IDX_AUTO_MJ_FKEY_Entity_ParentID" ON __mj."Entity"("ParentID");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = '__mj' AND tablename = 'Entity' AND indexname = 'IDX_AUTO_MJ_FKEY_Entity_ExternalDataSourceID') THEN
    CREATE INDEX "IDX_AUTO_MJ_FKEY_Entity_ExternalDataSourceID" ON __mj."Entity"("ExternalDataSourceID");
  END IF;
END $$;

/* Set categories for 6 fields */ /* UPDATE Entity Field Category Info MJ: Entities.ExternalDataSourceID */
UPDATE __mj."EntityField" SET "Category" = 'External Integration', "GeneratedFormSection" = 'Category', "DisplayName" = 'External Data Source', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3C919DAE-C8E3-46BE-A0B7-A7C96B56DFA8' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Entities.ExternalObjectName */
UPDATE __mj."EntityField" SET "Category" = 'External Integration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F1EC0ED5-1BFA-4170-8AB5-67D57E63375E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Entities.GeneratedBaseViewName */
UPDATE __mj."EntityField" SET "Category" = 'Identity & Structure', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '750C9831-E23F-4EDF-85ED-ACF1685BBCEB' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Entities.AllowDirectSQLInsert */
UPDATE __mj."EntityField" SET "Category" = 'Procedures & Deletion', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4A020410-E5A6-4484-9F1E-88C5C010F42A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Entities.AllowDirectSQLUpdate */
UPDATE __mj."EntityField" SET "Category" = 'Procedures & Deletion', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7E46D739-BFCC-4FFF-A831-C38B8AD195C0' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Entities.AllowDirectSQLDelete */
UPDATE __mj."EntityField" SET "Category" = 'Procedures & Deletion', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '81621C87-9505-456C-9C8E-6F955EC7C22C' AND "AutoUpdateCategory" = TRUE;

/* Insert FieldCategoryInfo setting for entity */
INSERT INTO __mj."EntitySetting" (
  "ID",
  "EntityID",
  "Name",
  "Value",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '79e92137-7a7b-47a0-8de8-ec7f8bb91283',
    'E0238F34-2837-EF11-86D4-6045BDEE16E6',
    'FieldCategoryInfo',
    '{"External Integration":{"icon":"fa fa-plug","description":"Settings for connecting and mapping to external data sources and objects"}}',
    NOW(),
    NOW()
  );

/* Update FieldCategoryIcons setting (legacy) */
UPDATE __mj."EntitySetting" SET "Value" = '{"External Integration":"fa fa-plug"}', "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6'
  AND "Name" = 'FieldCategoryIcons';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4d201b4b-bedf-4475-a6b0-9ce3063072b3' OR ("EntityID" = '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' AND "Name" = 'ParentChunk')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4d201b4b-bedf-4475-a6b0-9ce3063072b3', '2324CD0B-D589-41A9-9F6F-EB5A4E7CEB21' /* Entity: MJ: Content Item Chunks */, 100052, 'ParentChunk', 'Parent Chunk', NULL, 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to update entity field related entity name field map for entity field ID 96841354-26BF-4919-91A3-B3170EA58F68 */
/* Hand-ported: the source calls this as a bare `EXEC …spUpdateEntityFieldRelatedEntityNameFieldMap`,
   which the AST transpiler reports as an unhandled EXEC. Signature verified against the live
   PG catalog: (p_entityfieldid uuid, p_relatedentitynamefieldmap varchar). */
DO $$
BEGIN
  PERFORM __mj."spUpdateEntityFieldRelatedEntityNameFieldMap"(
    p_EntityFieldID := '96841354-26BF-4919-91A3-B3170EA58F68'::uuid,
    p_RelatedEntityNameFieldMap := 'ParentChunk'
  );
END $$;

/* Set categories for 27 fields */ /* UPDATE Entity Field Category Info MJ: Content Item Chunks.ID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C07B5B08-0084-4F59-B638-243F526546E4' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2D402F99-B9A1-4ABB-9D19-A4B204D09BAC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9E337B81-5B94-46AC-B696-0EFA27C9F85B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.ContentItemID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '073F4C8A-F2AB-4F27-9FE3-743882972F31' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.Sequence */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7618B84A-5040-4C23-9007-71F193E13B8A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.Modality */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7CA10D77-D4C3-4844-9AC6-CF684C1027A5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.SegmentTitle */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '62FF46F8-8815-462F-9F31-8818D831B2BB' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.SegmenterKey */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8C51C895-93BF-43D8-9049-6A6AC8484A76' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.ParentChunkID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '96841354-26BF-4919-91A3-B3170EA58F68' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.ContentItem */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Content Item Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9527FB1B-0C05-4C0E-A709-C8922FAC9C8E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.ParentChunk */
UPDATE __mj."EntityField" SET "Category" = 'Chunk Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Parent Chunk Name', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4D201B4B-BEDF-4475-A6B0-9CE3063072B3' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.RootParentChunkID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '3AB39FD0-661F-4722-8D8B-39966220D555' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.Text */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '80DC7D33-19F5-4781-BC71-E1E1B882C514' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.Description */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5CB468A1-7C22-47EB-BF54-F53BC2C45714' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.Transcript */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D0B9E206-C912-4BAF-9336-A2AF8BABA492' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.VectorRecordID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F761D312-981B-47E1-94DC-42FF4550CC13' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.EmbeddingStatus */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '06DB407C-561A-4740-8A28-E93DC745435B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.TaggingStatus */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A805FBDB-79C6-4B2B-B39D-693CCE47A9E7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.DeleteStatus */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'EDEFD181-AC1E-4533-A7F7-CAD268E1EC07' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.LastEmbeddedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9F645E2C-17FF-4569-B28C-BF8CAEAA0B68' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.LastTaggedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2C847A8B-A352-43F7-BCDF-CA951AD2F9A6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.LastDeletedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7EB2AE41-CE4E-45E5-B481-B929099AC6E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.StartOffset */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'F0F04464-9380-4CFE-A012-27E6EDA15913' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.EndOffset */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C98F7A52-C1DC-4A2F-8733-5A4A49A6CDE9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.StartMs */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Start Milliseconds', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1E8A8A29-A598-49A4-AC97-C8DD923E506A' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.EndMs */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'End Milliseconds', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4B42C9ED-789E-4417-AD71-44BBB7EBF7D5' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Content Item Chunks.PageNumber */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D52720E3-05A7-41B2-8C00-C57D8767A930' AND "AutoUpdateCategory" = TRUE;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_item_chunk_content_item_id"
    ON __mj."ContentItemChunk" ("ContentItemID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_item_chunk_parent_chunk_id"
    ON __mj."ContentItemChunk" ("ParentChunkID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: fnContentItemChunkParentChunkID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: ContentItemChunk.ParentChunkID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_content_item_chunk_parent_chunk_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentChunkID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."ContentItemChunk"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentChunkID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."ContentItemChunk" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentChunkID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentChunkID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: vwContentItemChunks
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Item Chunks
-----               SCHEMA:      __mj
-----               BASE TABLE:  ContentItemChunk
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwContentItemChunks"
AS
SELECT
    c.*,
    MJContentItem_ContentItemID."Name" AS "ContentItem",
    MJContentItemChunk_ParentChunkID."SegmentTitle" AS "ParentChunk",
    root_ParentChunkID.root_id AS "RootParentChunkID"
FROM
    __mj."ContentItemChunk" AS c
INNER JOIN
    __mj."ContentItem" AS MJContentItem_ContentItemID
  ON
    "c"."ContentItemID" = MJContentItem_ContentItemID."ID"
LEFT OUTER JOIN
    __mj."ContentItemChunk" AS MJContentItemChunk_ParentChunkID
  ON
    "c"."ParentChunkID" = MJContentItemChunk_ParentChunkID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_content_item_chunk_parent_chunk_id_get_root_id"(c."ID", c."ParentChunkID") AS root_id
) AS root_ParentChunkID ON true
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
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwContentItemChunks'
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
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwContentItemChunks'
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
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwContentItemChunks'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwContentItemChunks" CASCADE;
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
GRANT SELECT ON __mj."vwContentItemChunks" TO "cdp_UI";
GRANT SELECT ON __mj."vwContentItemChunks" TO "cdp_Developer";
GRANT SELECT ON __mj."vwContentItemChunks" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: spCreateContentItemChunk
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ContentItemChunk
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateContentItemChunk'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateContentItemChunk"(
    p_id UUID DEFAULT NULL,
    p_contentitemid UUID DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_text_clear boolean DEFAULT false,
    p_text TEXT DEFAULT NULL,
    p_vectorrecordid_clear boolean DEFAULT false,
    p_vectorrecordid varchar(100) DEFAULT NULL,
    p_embeddingstatus varchar(20) DEFAULT NULL,
    p_taggingstatus varchar(20) DEFAULT NULL,
    p_deletestatus_clear boolean DEFAULT false,
    p_deletestatus varchar(20) DEFAULT NULL,
    p_lastembeddedat_clear boolean DEFAULT false,
    p_lastembeddedat TIMESTAMPTZ DEFAULT NULL,
    p_lasttaggedat_clear boolean DEFAULT false,
    p_lasttaggedat TIMESTAMPTZ DEFAULT NULL,
    p_lastdeletedat_clear boolean DEFAULT false,
    p_lastdeletedat TIMESTAMPTZ DEFAULT NULL,
    p_modality varchar(20) DEFAULT NULL,
    p_startoffset_clear boolean DEFAULT false,
    p_startoffset int DEFAULT NULL,
    p_endoffset_clear boolean DEFAULT false,
    p_endoffset int DEFAULT NULL,
    p_startms_clear boolean DEFAULT false,
    p_startms int DEFAULT NULL,
    p_endms_clear boolean DEFAULT false,
    p_endms int DEFAULT NULL,
    p_pagenumber_clear boolean DEFAULT false,
    p_pagenumber int DEFAULT NULL,
    p_segmenttitle_clear boolean DEFAULT false,
    p_segmenttitle varchar(500) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_transcript_clear boolean DEFAULT false,
    p_transcript TEXT DEFAULT NULL,
    p_segmenterkey_clear boolean DEFAULT false,
    p_segmenterkey varchar(100) DEFAULT NULL,
    p_parentchunkid_clear boolean DEFAULT false,
    p_parentchunkid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwContentItemChunks" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ContentItemChunk"
        (
            "ID",
            "ContentItemID",
                "Sequence",
                "Text",
                "VectorRecordID",
                "EmbeddingStatus",
                "TaggingStatus",
                "DeleteStatus",
                "LastEmbeddedAt",
                "LastTaggedAt",
                "LastDeletedAt",
                "Modality",
                "StartOffset",
                "EndOffset",
                "StartMs",
                "EndMs",
                "PageNumber",
                "SegmentTitle",
                "Description",
                "Transcript",
                "SegmenterKey",
                "ParentChunkID"
        )
    VALUES
        (
            v_new_id,
            p_contentitemid,
                p_sequence,
                CASE WHEN p_text_clear = true THEN NULL ELSE COALESCE(p_text, NULL) END,
                CASE WHEN p_vectorrecordid_clear = true THEN NULL ELSE COALESCE(p_vectorrecordid, NULL) END,
                COALESCE(p_embeddingstatus, 'Pending'),
                COALESCE(p_taggingstatus, 'Pending'),
                CASE WHEN p_deletestatus_clear = true THEN NULL ELSE COALESCE(p_deletestatus, NULL) END,
                CASE WHEN p_lastembeddedat_clear = true THEN NULL ELSE COALESCE(p_lastembeddedat, NULL) END,
                CASE WHEN p_lasttaggedat_clear = true THEN NULL ELSE COALESCE(p_lasttaggedat, NULL) END,
                CASE WHEN p_lastdeletedat_clear = true THEN NULL ELSE COALESCE(p_lastdeletedat, NULL) END,
                COALESCE(p_modality, 'text'),
                CASE WHEN p_startoffset_clear = true THEN NULL ELSE COALESCE(p_startoffset, NULL) END,
                CASE WHEN p_endoffset_clear = true THEN NULL ELSE COALESCE(p_endoffset, NULL) END,
                CASE WHEN p_startms_clear = true THEN NULL ELSE COALESCE(p_startms, NULL) END,
                CASE WHEN p_endms_clear = true THEN NULL ELSE COALESCE(p_endms, NULL) END,
                CASE WHEN p_pagenumber_clear = true THEN NULL ELSE COALESCE(p_pagenumber, NULL) END,
                CASE WHEN p_segmenttitle_clear = true THEN NULL ELSE COALESCE(p_segmenttitle, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_transcript_clear = true THEN NULL ELSE COALESCE(p_transcript, NULL) END,
                CASE WHEN p_segmenterkey_clear = true THEN NULL ELSE COALESCE(p_segmenterkey, NULL) END,
                CASE WHEN p_parentchunkid_clear = true THEN NULL ELSE COALESCE(p_parentchunkid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwContentItemChunks"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateContentItemChunk" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateContentItemChunk" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: spUpdateContentItemChunk
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ContentItemChunk
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateContentItemChunk'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentItemChunk"(
    p_id UUID,
    p_contentitemid UUID DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_text_clear boolean DEFAULT false,
    p_text TEXT DEFAULT NULL,
    p_vectorrecordid_clear boolean DEFAULT false,
    p_vectorrecordid varchar(100) DEFAULT NULL,
    p_embeddingstatus varchar(20) DEFAULT NULL,
    p_taggingstatus varchar(20) DEFAULT NULL,
    p_deletestatus_clear boolean DEFAULT false,
    p_deletestatus varchar(20) DEFAULT NULL,
    p_lastembeddedat_clear boolean DEFAULT false,
    p_lastembeddedat TIMESTAMPTZ DEFAULT NULL,
    p_lasttaggedat_clear boolean DEFAULT false,
    p_lasttaggedat TIMESTAMPTZ DEFAULT NULL,
    p_lastdeletedat_clear boolean DEFAULT false,
    p_lastdeletedat TIMESTAMPTZ DEFAULT NULL,
    p_modality varchar(20) DEFAULT NULL,
    p_startoffset_clear boolean DEFAULT false,
    p_startoffset int DEFAULT NULL,
    p_endoffset_clear boolean DEFAULT false,
    p_endoffset int DEFAULT NULL,
    p_startms_clear boolean DEFAULT false,
    p_startms int DEFAULT NULL,
    p_endms_clear boolean DEFAULT false,
    p_endms int DEFAULT NULL,
    p_pagenumber_clear boolean DEFAULT false,
    p_pagenumber int DEFAULT NULL,
    p_segmenttitle_clear boolean DEFAULT false,
    p_segmenttitle varchar(500) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_transcript_clear boolean DEFAULT false,
    p_transcript TEXT DEFAULT NULL,
    p_segmenterkey_clear boolean DEFAULT false,
    p_segmenterkey varchar(100) DEFAULT NULL,
    p_parentchunkid_clear boolean DEFAULT false,
    p_parentchunkid UUID DEFAULT NULL
) RETURNS SETOF __mj."vwContentItemChunks" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ContentItemChunk"
    SET
        "ContentItemID" = COALESCE(p_contentitemid, "ContentItemID"),
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "Text" = CASE WHEN p_text_clear = true THEN NULL ELSE COALESCE(p_text, "Text") END,
        "VectorRecordID" = CASE WHEN p_vectorrecordid_clear = true THEN NULL ELSE COALESCE(p_vectorrecordid, "VectorRecordID") END,
        "EmbeddingStatus" = COALESCE(p_embeddingstatus, "EmbeddingStatus"),
        "TaggingStatus" = COALESCE(p_taggingstatus, "TaggingStatus"),
        "DeleteStatus" = CASE WHEN p_deletestatus_clear = true THEN NULL ELSE COALESCE(p_deletestatus, "DeleteStatus") END,
        "LastEmbeddedAt" = CASE WHEN p_lastembeddedat_clear = true THEN NULL ELSE COALESCE(p_lastembeddedat, "LastEmbeddedAt") END,
        "LastTaggedAt" = CASE WHEN p_lasttaggedat_clear = true THEN NULL ELSE COALESCE(p_lasttaggedat, "LastTaggedAt") END,
        "LastDeletedAt" = CASE WHEN p_lastdeletedat_clear = true THEN NULL ELSE COALESCE(p_lastdeletedat, "LastDeletedAt") END,
        "Modality" = COALESCE(p_modality, "Modality"),
        "StartOffset" = CASE WHEN p_startoffset_clear = true THEN NULL ELSE COALESCE(p_startoffset, "StartOffset") END,
        "EndOffset" = CASE WHEN p_endoffset_clear = true THEN NULL ELSE COALESCE(p_endoffset, "EndOffset") END,
        "StartMs" = CASE WHEN p_startms_clear = true THEN NULL ELSE COALESCE(p_startms, "StartMs") END,
        "EndMs" = CASE WHEN p_endms_clear = true THEN NULL ELSE COALESCE(p_endms, "EndMs") END,
        "PageNumber" = CASE WHEN p_pagenumber_clear = true THEN NULL ELSE COALESCE(p_pagenumber, "PageNumber") END,
        "SegmentTitle" = CASE WHEN p_segmenttitle_clear = true THEN NULL ELSE COALESCE(p_segmenttitle, "SegmentTitle") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Transcript" = CASE WHEN p_transcript_clear = true THEN NULL ELSE COALESCE(p_transcript, "Transcript") END,
        "SegmenterKey" = CASE WHEN p_segmenterkey_clear = true THEN NULL ELSE COALESCE(p_segmenterkey, "SegmenterKey") END,
        "ParentChunkID" = CASE WHEN p_parentchunkid_clear = true THEN NULL ELSE COALESCE(p_parentchunkid, "ParentChunkID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwContentItemChunks"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateContentItemChunk" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateContentItemChunk" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItemChunk table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_content_item_chunk"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_content_item_chunk" ON __mj."ContentItemChunk";

CREATE TRIGGER "trg_update_content_item_chunk"
BEFORE UPDATE ON __mj."ContentItemChunk"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_content_item_chunk"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Item Chunks
-- Item: spDeleteContentItemChunk
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ContentItemChunk
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteContentItemChunk'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentItemChunk"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."ContentItemChunk"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteContentItemChunk" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteContentItemChunk" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entities
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_parent_id"
    ON __mj."Entity" ("ParentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entities
-- Item: Permissions for vwEntities
-- ============================================================
GRANT SELECT ON __mj."vwEntities" TO "cdp_Developer";
GRANT SELECT ON __mj."vwEntities" TO "cdp_Integration";
GRANT SELECT ON __mj."vwEntities" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entities
-- Item: spCreateEntity
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Entity
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntity'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateEntity"(
    p_id UUID DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_namesuffix_clear boolean DEFAULT false,
    p_namesuffix varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_autoupdatedescription BOOLEAN DEFAULT NULL,
    p_baseview varchar(255) DEFAULT NULL,
    p_baseviewgenerated BOOLEAN DEFAULT NULL,
    p_virtualentity BOOLEAN DEFAULT NULL,
    p_trackrecordchanges BOOLEAN DEFAULT NULL,
    p_auditrecordaccess BOOLEAN DEFAULT NULL,
    p_auditviewruns BOOLEAN DEFAULT NULL,
    p_includeinapi BOOLEAN DEFAULT NULL,
    p_allowallrowsapi BOOLEAN DEFAULT NULL,
    p_allowupdateapi BOOLEAN DEFAULT NULL,
    p_allowcreateapi BOOLEAN DEFAULT NULL,
    p_allowdeleteapi BOOLEAN DEFAULT NULL,
    p_customresolverapi BOOLEAN DEFAULT NULL,
    p_allowusersearchapi BOOLEAN DEFAULT NULL,
    p_fulltextsearchenabled BOOLEAN DEFAULT NULL,
    p_fulltextcatalog_clear boolean DEFAULT false,
    p_fulltextcatalog varchar(255) DEFAULT NULL,
    p_fulltextcataloggenerated BOOLEAN DEFAULT NULL,
    p_fulltextindex_clear boolean DEFAULT false,
    p_fulltextindex varchar(255) DEFAULT NULL,
    p_fulltextindexgenerated BOOLEAN DEFAULT NULL,
    p_fulltextsearchfunction_clear boolean DEFAULT false,
    p_fulltextsearchfunction varchar(255) DEFAULT NULL,
    p_fulltextsearchfunctiongenerated BOOLEAN DEFAULT NULL,
    p_userviewmaxrows_clear boolean DEFAULT false,
    p_userviewmaxrows int DEFAULT NULL,
    p_spcreate_clear boolean DEFAULT false,
    p_spcreate varchar(255) DEFAULT NULL,
    p_spupdate_clear boolean DEFAULT false,
    p_spupdate varchar(255) DEFAULT NULL,
    p_spdelete_clear boolean DEFAULT false,
    p_spdelete varchar(255) DEFAULT NULL,
    p_spcreategenerated BOOLEAN DEFAULT NULL,
    p_spupdategenerated BOOLEAN DEFAULT NULL,
    p_spdeletegenerated BOOLEAN DEFAULT NULL,
    p_cascadedeletes BOOLEAN DEFAULT NULL,
    p_deletetype varchar(10) DEFAULT NULL,
    p_allowrecordmerge BOOLEAN DEFAULT NULL,
    p_spmatch_clear boolean DEFAULT false,
    p_spmatch varchar(255) DEFAULT NULL,
    p_relationshipdefaultdisplaytype varchar(20) DEFAULT NULL,
    p_userformgenerated BOOLEAN DEFAULT NULL,
    p_entityobjectsubclassname_clear boolean DEFAULT false,
    p_entityobjectsubclassname varchar(255) DEFAULT NULL,
    p_entityobjectsubclassimport_clear boolean DEFAULT false,
    p_entityobjectsubclassimport varchar(255) DEFAULT NULL,
    p_preferredcommunicationfield_clear boolean DEFAULT false,
    p_preferredcommunicationfield varchar(255) DEFAULT NULL,
    p_icon_clear boolean DEFAULT false,
    p_icon varchar(500) DEFAULT NULL,
    p_scopedefault_clear boolean DEFAULT false,
    p_scopedefault varchar(100) DEFAULT NULL,
    p_rowstopackwithschema varchar(20) DEFAULT NULL,
    p_rowstopacksamplemethod varchar(20) DEFAULT NULL,
    p_rowstopacksamplecount int DEFAULT NULL,
    p_rowstopacksampleorder_clear boolean DEFAULT false,
    p_rowstopacksampleorder TEXT DEFAULT NULL,
    p_autorowcountfrequency_clear boolean DEFAULT false,
    p_autorowcountfrequency int DEFAULT NULL,
    p_rowcount_clear boolean DEFAULT false,
    p_rowcount bigint DEFAULT NULL,
    p_rowcountrunat_clear boolean DEFAULT false,
    p_rowcountrunat TIMESTAMPTZ DEFAULT NULL,
    p_status varchar(25) DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(255) DEFAULT NULL,
    p_allowmultiplesubtypes BOOLEAN DEFAULT NULL,
    p_autoupdatefulltextsearch BOOLEAN DEFAULT NULL,
    p_autoupdateallowusersearchapi BOOLEAN DEFAULT NULL,
    p_trustservercachecompletely BOOLEAN DEFAULT NULL,
    p_supportsgeocoding BOOLEAN DEFAULT NULL,
    p_autoupdatesupportsgeocoding BOOLEAN DEFAULT NULL,
    p_allowcaching BOOLEAN DEFAULT NULL,
    p_detectexternalchanges BOOLEAN DEFAULT NULL,
    p_externaldatasourceid_clear boolean DEFAULT false,
    p_externaldatasourceid UUID DEFAULT NULL,
    p_externalobjectname_clear boolean DEFAULT false,
    p_externalobjectname varchar(255) DEFAULT NULL,
    p_generatedbaseviewname_clear boolean DEFAULT false,
    p_generatedbaseviewname varchar(255) DEFAULT NULL,
    p_allowdirectsqlinsert BOOLEAN DEFAULT NULL,
    p_allowdirectsqlupdate BOOLEAN DEFAULT NULL,
    p_allowdirectsqldelete BOOLEAN DEFAULT NULL
) RETURNS SETOF __mj."vwEntities" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."Entity"
        (
            "ID",
            "ParentID",
                "Name",
                "NameSuffix",
                "Description",
                "AutoUpdateDescription",
                "BaseView",
                "BaseViewGenerated",
                "VirtualEntity",
                "TrackRecordChanges",
                "AuditRecordAccess",
                "AuditViewRuns",
                "IncludeInAPI",
                "AllowAllRowsAPI",
                "AllowUpdateAPI",
                "AllowCreateAPI",
                "AllowDeleteAPI",
                "CustomResolverAPI",
                "AllowUserSearchAPI",
                "FullTextSearchEnabled",
                "FullTextCatalog",
                "FullTextCatalogGenerated",
                "FullTextIndex",
                "FullTextIndexGenerated",
                "FullTextSearchFunction",
                "FullTextSearchFunctionGenerated",
                "UserViewMaxRows",
                "spCreate",
                "spUpdate",
                "spDelete",
                "spCreateGenerated",
                "spUpdateGenerated",
                "spDeleteGenerated",
                "CascadeDeletes",
                "DeleteType",
                "AllowRecordMerge",
                "spMatch",
                "RelationshipDefaultDisplayType",
                "UserFormGenerated",
                "EntityObjectSubclassName",
                "EntityObjectSubclassImport",
                "PreferredCommunicationField",
                "Icon",
                "ScopeDefault",
                "RowsToPackWithSchema",
                "RowsToPackSampleMethod",
                "RowsToPackSampleCount",
                "RowsToPackSampleOrder",
                "AutoRowCountFrequency",
                "RowCount",
                "RowCountRunAt",
                "Status",
                "DisplayName",
                "AllowMultipleSubtypes",
                "AutoUpdateFullTextSearch",
                "AutoUpdateAllowUserSearchAPI",
                "TrustServerCacheCompletely",
                "SupportsGeoCoding",
                "AutoUpdateSupportsGeoCoding",
                "AllowCaching",
                "DetectExternalChanges",
                "ExternalDataSourceID",
                "ExternalObjectName",
                "GeneratedBaseViewName",
                "AllowDirectSQLInsert",
                "AllowDirectSQLUpdate",
                "AllowDirectSQLDelete"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END,
                p_name,
                CASE WHEN p_namesuffix_clear = true THEN NULL ELSE COALESCE(p_namesuffix, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_autoupdatedescription, TRUE),
                p_baseview,
                COALESCE(p_baseviewgenerated, TRUE),
                COALESCE(p_virtualentity, FALSE),
                COALESCE(p_trackrecordchanges, TRUE),
                COALESCE(p_auditrecordaccess, TRUE),
                COALESCE(p_auditviewruns, TRUE),
                COALESCE(p_includeinapi, FALSE),
                COALESCE(p_allowallrowsapi, FALSE),
                COALESCE(p_allowupdateapi, FALSE),
                COALESCE(p_allowcreateapi, FALSE),
                COALESCE(p_allowdeleteapi, FALSE),
                COALESCE(p_customresolverapi, FALSE),
                COALESCE(p_allowusersearchapi, FALSE),
                COALESCE(p_fulltextsearchenabled, FALSE),
                CASE WHEN p_fulltextcatalog_clear = true THEN NULL ELSE COALESCE(p_fulltextcatalog, NULL) END,
                COALESCE(p_fulltextcataloggenerated, TRUE),
                CASE WHEN p_fulltextindex_clear = true THEN NULL ELSE COALESCE(p_fulltextindex, NULL) END,
                COALESCE(p_fulltextindexgenerated, TRUE),
                CASE WHEN p_fulltextsearchfunction_clear = true THEN NULL ELSE COALESCE(p_fulltextsearchfunction, NULL) END,
                COALESCE(p_fulltextsearchfunctiongenerated, TRUE),
                CASE WHEN p_userviewmaxrows_clear = true THEN NULL ELSE COALESCE(p_userviewmaxrows, 1000) END,
                CASE WHEN p_spcreate_clear = true THEN NULL ELSE COALESCE(p_spcreate, NULL) END,
                CASE WHEN p_spupdate_clear = true THEN NULL ELSE COALESCE(p_spupdate, NULL) END,
                CASE WHEN p_spdelete_clear = true THEN NULL ELSE COALESCE(p_spdelete, NULL) END,
                COALESCE(p_spcreategenerated, TRUE),
                COALESCE(p_spupdategenerated, TRUE),
                COALESCE(p_spdeletegenerated, TRUE),
                COALESCE(p_cascadedeletes, FALSE),
                COALESCE(p_deletetype, 'Hard'),
                COALESCE(p_allowrecordmerge, FALSE),
                CASE WHEN p_spmatch_clear = true THEN NULL ELSE COALESCE(p_spmatch, NULL) END,
                COALESCE(p_relationshipdefaultdisplaytype, 'Search'),
                COALESCE(p_userformgenerated, TRUE),
                CASE WHEN p_entityobjectsubclassname_clear = true THEN NULL ELSE COALESCE(p_entityobjectsubclassname, NULL) END,
                CASE WHEN p_entityobjectsubclassimport_clear = true THEN NULL ELSE COALESCE(p_entityobjectsubclassimport, NULL) END,
                CASE WHEN p_preferredcommunicationfield_clear = true THEN NULL ELSE COALESCE(p_preferredcommunicationfield, NULL) END,
                CASE WHEN p_icon_clear = true THEN NULL ELSE COALESCE(p_icon, NULL) END,
                CASE WHEN p_scopedefault_clear = true THEN NULL ELSE COALESCE(p_scopedefault, NULL) END,
                COALESCE(p_rowstopackwithschema, 'None'),
                COALESCE(p_rowstopacksamplemethod, 'random'),
                COALESCE(p_rowstopacksamplecount, 0),
                CASE WHEN p_rowstopacksampleorder_clear = true THEN NULL ELSE COALESCE(p_rowstopacksampleorder, NULL) END,
                CASE WHEN p_autorowcountfrequency_clear = true THEN NULL ELSE COALESCE(p_autorowcountfrequency, NULL) END,
                CASE WHEN p_rowcount_clear = true THEN NULL ELSE COALESCE(p_rowcount, NULL) END,
                CASE WHEN p_rowcountrunat_clear = true THEN NULL ELSE COALESCE(p_rowcountrunat, NULL) END,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, NULL) END,
                COALESCE(p_allowmultiplesubtypes, FALSE),
                COALESCE(p_autoupdatefulltextsearch, TRUE),
                COALESCE(p_autoupdateallowusersearchapi, TRUE),
                COALESCE(p_trustservercachecompletely, TRUE),
                COALESCE(p_supportsgeocoding, FALSE),
                COALESCE(p_autoupdatesupportsgeocoding, TRUE),
                COALESCE(p_allowcaching, FALSE),
                COALESCE(p_detectexternalchanges, FALSE),
                CASE WHEN p_externaldatasourceid_clear = true THEN NULL ELSE COALESCE(p_externaldatasourceid, NULL) END,
                CASE WHEN p_externalobjectname_clear = true THEN NULL ELSE COALESCE(p_externalobjectname, NULL) END,
                CASE WHEN p_generatedbaseviewname_clear = true THEN NULL ELSE COALESCE(p_generatedbaseviewname, NULL) END,
                COALESCE(p_allowdirectsqlinsert, FALSE),
                COALESCE(p_allowdirectsqlupdate, FALSE),
                COALESCE(p_allowdirectsqldelete, FALSE)
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwEntities"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateEntity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateEntity" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entities
-- Item: spUpdateEntity
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Entity
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntity'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntity"(
    p_id UUID,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_namesuffix_clear boolean DEFAULT false,
    p_namesuffix varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_autoupdatedescription BOOLEAN DEFAULT NULL,
    p_baseview varchar(255) DEFAULT NULL,
    p_baseviewgenerated BOOLEAN DEFAULT NULL,
    p_virtualentity BOOLEAN DEFAULT NULL,
    p_trackrecordchanges BOOLEAN DEFAULT NULL,
    p_auditrecordaccess BOOLEAN DEFAULT NULL,
    p_auditviewruns BOOLEAN DEFAULT NULL,
    p_includeinapi BOOLEAN DEFAULT NULL,
    p_allowallrowsapi BOOLEAN DEFAULT NULL,
    p_allowupdateapi BOOLEAN DEFAULT NULL,
    p_allowcreateapi BOOLEAN DEFAULT NULL,
    p_allowdeleteapi BOOLEAN DEFAULT NULL,
    p_customresolverapi BOOLEAN DEFAULT NULL,
    p_allowusersearchapi BOOLEAN DEFAULT NULL,
    p_fulltextsearchenabled BOOLEAN DEFAULT NULL,
    p_fulltextcatalog_clear boolean DEFAULT false,
    p_fulltextcatalog varchar(255) DEFAULT NULL,
    p_fulltextcataloggenerated BOOLEAN DEFAULT NULL,
    p_fulltextindex_clear boolean DEFAULT false,
    p_fulltextindex varchar(255) DEFAULT NULL,
    p_fulltextindexgenerated BOOLEAN DEFAULT NULL,
    p_fulltextsearchfunction_clear boolean DEFAULT false,
    p_fulltextsearchfunction varchar(255) DEFAULT NULL,
    p_fulltextsearchfunctiongenerated BOOLEAN DEFAULT NULL,
    p_userviewmaxrows_clear boolean DEFAULT false,
    p_userviewmaxrows int DEFAULT NULL,
    p_spcreate_clear boolean DEFAULT false,
    p_spcreate varchar(255) DEFAULT NULL,
    p_spupdate_clear boolean DEFAULT false,
    p_spupdate varchar(255) DEFAULT NULL,
    p_spdelete_clear boolean DEFAULT false,
    p_spdelete varchar(255) DEFAULT NULL,
    p_spcreategenerated BOOLEAN DEFAULT NULL,
    p_spupdategenerated BOOLEAN DEFAULT NULL,
    p_spdeletegenerated BOOLEAN DEFAULT NULL,
    p_cascadedeletes BOOLEAN DEFAULT NULL,
    p_deletetype varchar(10) DEFAULT NULL,
    p_allowrecordmerge BOOLEAN DEFAULT NULL,
    p_spmatch_clear boolean DEFAULT false,
    p_spmatch varchar(255) DEFAULT NULL,
    p_relationshipdefaultdisplaytype varchar(20) DEFAULT NULL,
    p_userformgenerated BOOLEAN DEFAULT NULL,
    p_entityobjectsubclassname_clear boolean DEFAULT false,
    p_entityobjectsubclassname varchar(255) DEFAULT NULL,
    p_entityobjectsubclassimport_clear boolean DEFAULT false,
    p_entityobjectsubclassimport varchar(255) DEFAULT NULL,
    p_preferredcommunicationfield_clear boolean DEFAULT false,
    p_preferredcommunicationfield varchar(255) DEFAULT NULL,
    p_icon_clear boolean DEFAULT false,
    p_icon varchar(500) DEFAULT NULL,
    p_scopedefault_clear boolean DEFAULT false,
    p_scopedefault varchar(100) DEFAULT NULL,
    p_rowstopackwithschema varchar(20) DEFAULT NULL,
    p_rowstopacksamplemethod varchar(20) DEFAULT NULL,
    p_rowstopacksamplecount int DEFAULT NULL,
    p_rowstopacksampleorder_clear boolean DEFAULT false,
    p_rowstopacksampleorder TEXT DEFAULT NULL,
    p_autorowcountfrequency_clear boolean DEFAULT false,
    p_autorowcountfrequency int DEFAULT NULL,
    p_rowcount_clear boolean DEFAULT false,
    p_rowcount bigint DEFAULT NULL,
    p_rowcountrunat_clear boolean DEFAULT false,
    p_rowcountrunat TIMESTAMPTZ DEFAULT NULL,
    p_status varchar(25) DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(255) DEFAULT NULL,
    p_allowmultiplesubtypes BOOLEAN DEFAULT NULL,
    p_autoupdatefulltextsearch BOOLEAN DEFAULT NULL,
    p_autoupdateallowusersearchapi BOOLEAN DEFAULT NULL,
    p_trustservercachecompletely BOOLEAN DEFAULT NULL,
    p_supportsgeocoding BOOLEAN DEFAULT NULL,
    p_autoupdatesupportsgeocoding BOOLEAN DEFAULT NULL,
    p_allowcaching BOOLEAN DEFAULT NULL,
    p_detectexternalchanges BOOLEAN DEFAULT NULL,
    p_externaldatasourceid_clear boolean DEFAULT false,
    p_externaldatasourceid UUID DEFAULT NULL,
    p_externalobjectname_clear boolean DEFAULT false,
    p_externalobjectname varchar(255) DEFAULT NULL,
    p_generatedbaseviewname_clear boolean DEFAULT false,
    p_generatedbaseviewname varchar(255) DEFAULT NULL,
    p_allowdirectsqlinsert BOOLEAN DEFAULT NULL,
    p_allowdirectsqlupdate BOOLEAN DEFAULT NULL,
    p_allowdirectsqldelete BOOLEAN DEFAULT NULL
) RETURNS SETOF __mj."vwEntities" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."Entity"
    SET
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END,
        "Name" = COALESCE(p_name, "Name"),
        "NameSuffix" = CASE WHEN p_namesuffix_clear = true THEN NULL ELSE COALESCE(p_namesuffix, "NameSuffix") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "AutoUpdateDescription" = COALESCE(p_autoupdatedescription, "AutoUpdateDescription"),
        "BaseView" = COALESCE(p_baseview, "BaseView"),
        "BaseViewGenerated" = COALESCE(p_baseviewgenerated, "BaseViewGenerated"),
        "VirtualEntity" = COALESCE(p_virtualentity, "VirtualEntity"),
        "TrackRecordChanges" = COALESCE(p_trackrecordchanges, "TrackRecordChanges"),
        "AuditRecordAccess" = COALESCE(p_auditrecordaccess, "AuditRecordAccess"),
        "AuditViewRuns" = COALESCE(p_auditviewruns, "AuditViewRuns"),
        "IncludeInAPI" = COALESCE(p_includeinapi, "IncludeInAPI"),
        "AllowAllRowsAPI" = COALESCE(p_allowallrowsapi, "AllowAllRowsAPI"),
        "AllowUpdateAPI" = COALESCE(p_allowupdateapi, "AllowUpdateAPI"),
        "AllowCreateAPI" = COALESCE(p_allowcreateapi, "AllowCreateAPI"),
        "AllowDeleteAPI" = COALESCE(p_allowdeleteapi, "AllowDeleteAPI"),
        "CustomResolverAPI" = COALESCE(p_customresolverapi, "CustomResolverAPI"),
        "AllowUserSearchAPI" = COALESCE(p_allowusersearchapi, "AllowUserSearchAPI"),
        "FullTextSearchEnabled" = COALESCE(p_fulltextsearchenabled, "FullTextSearchEnabled"),
        "FullTextCatalog" = CASE WHEN p_fulltextcatalog_clear = true THEN NULL ELSE COALESCE(p_fulltextcatalog, "FullTextCatalog") END,
        "FullTextCatalogGenerated" = COALESCE(p_fulltextcataloggenerated, "FullTextCatalogGenerated"),
        "FullTextIndex" = CASE WHEN p_fulltextindex_clear = true THEN NULL ELSE COALESCE(p_fulltextindex, "FullTextIndex") END,
        "FullTextIndexGenerated" = COALESCE(p_fulltextindexgenerated, "FullTextIndexGenerated"),
        "FullTextSearchFunction" = CASE WHEN p_fulltextsearchfunction_clear = true THEN NULL ELSE COALESCE(p_fulltextsearchfunction, "FullTextSearchFunction") END,
        "FullTextSearchFunctionGenerated" = COALESCE(p_fulltextsearchfunctiongenerated, "FullTextSearchFunctionGenerated"),
        "UserViewMaxRows" = CASE WHEN p_userviewmaxrows_clear = true THEN NULL ELSE COALESCE(p_userviewmaxrows, "UserViewMaxRows") END,
        "spCreate" = CASE WHEN p_spcreate_clear = true THEN NULL ELSE COALESCE(p_spcreate, "spCreate") END,
        "spUpdate" = CASE WHEN p_spupdate_clear = true THEN NULL ELSE COALESCE(p_spupdate, "spUpdate") END,
        "spDelete" = CASE WHEN p_spdelete_clear = true THEN NULL ELSE COALESCE(p_spdelete, "spDelete") END,
        "spCreateGenerated" = COALESCE(p_spcreategenerated, "spCreateGenerated"),
        "spUpdateGenerated" = COALESCE(p_spupdategenerated, "spUpdateGenerated"),
        "spDeleteGenerated" = COALESCE(p_spdeletegenerated, "spDeleteGenerated"),
        "CascadeDeletes" = COALESCE(p_cascadedeletes, "CascadeDeletes"),
        "DeleteType" = COALESCE(p_deletetype, "DeleteType"),
        "AllowRecordMerge" = COALESCE(p_allowrecordmerge, "AllowRecordMerge"),
        "spMatch" = CASE WHEN p_spmatch_clear = true THEN NULL ELSE COALESCE(p_spmatch, "spMatch") END,
        "RelationshipDefaultDisplayType" = COALESCE(p_relationshipdefaultdisplaytype, "RelationshipDefaultDisplayType"),
        "UserFormGenerated" = COALESCE(p_userformgenerated, "UserFormGenerated"),
        "EntityObjectSubclassName" = CASE WHEN p_entityobjectsubclassname_clear = true THEN NULL ELSE COALESCE(p_entityobjectsubclassname, "EntityObjectSubclassName") END,
        "EntityObjectSubclassImport" = CASE WHEN p_entityobjectsubclassimport_clear = true THEN NULL ELSE COALESCE(p_entityobjectsubclassimport, "EntityObjectSubclassImport") END,
        "PreferredCommunicationField" = CASE WHEN p_preferredcommunicationfield_clear = true THEN NULL ELSE COALESCE(p_preferredcommunicationfield, "PreferredCommunicationField") END,
        "Icon" = CASE WHEN p_icon_clear = true THEN NULL ELSE COALESCE(p_icon, "Icon") END,
        "ScopeDefault" = CASE WHEN p_scopedefault_clear = true THEN NULL ELSE COALESCE(p_scopedefault, "ScopeDefault") END,
        "RowsToPackWithSchema" = COALESCE(p_rowstopackwithschema, "RowsToPackWithSchema"),
        "RowsToPackSampleMethod" = COALESCE(p_rowstopacksamplemethod, "RowsToPackSampleMethod"),
        "RowsToPackSampleCount" = COALESCE(p_rowstopacksamplecount, "RowsToPackSampleCount"),
        "RowsToPackSampleOrder" = CASE WHEN p_rowstopacksampleorder_clear = true THEN NULL ELSE COALESCE(p_rowstopacksampleorder, "RowsToPackSampleOrder") END,
        "AutoRowCountFrequency" = CASE WHEN p_autorowcountfrequency_clear = true THEN NULL ELSE COALESCE(p_autorowcountfrequency, "AutoRowCountFrequency") END,
        "RowCount" = CASE WHEN p_rowcount_clear = true THEN NULL ELSE COALESCE(p_rowcount, "RowCount") END,
        "RowCountRunAt" = CASE WHEN p_rowcountrunat_clear = true THEN NULL ELSE COALESCE(p_rowcountrunat, "RowCountRunAt") END,
        "Status" = COALESCE(p_status, "Status"),
        "DisplayName" = CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, "DisplayName") END,
        "AllowMultipleSubtypes" = COALESCE(p_allowmultiplesubtypes, "AllowMultipleSubtypes"),
        "AutoUpdateFullTextSearch" = COALESCE(p_autoupdatefulltextsearch, "AutoUpdateFullTextSearch"),
        "AutoUpdateAllowUserSearchAPI" = COALESCE(p_autoupdateallowusersearchapi, "AutoUpdateAllowUserSearchAPI"),
        "TrustServerCacheCompletely" = COALESCE(p_trustservercachecompletely, "TrustServerCacheCompletely"),
        "SupportsGeoCoding" = COALESCE(p_supportsgeocoding, "SupportsGeoCoding"),
        "AutoUpdateSupportsGeoCoding" = COALESCE(p_autoupdatesupportsgeocoding, "AutoUpdateSupportsGeoCoding"),
        "AllowCaching" = COALESCE(p_allowcaching, "AllowCaching"),
        "DetectExternalChanges" = COALESCE(p_detectexternalchanges, "DetectExternalChanges"),
        "ExternalDataSourceID" = CASE WHEN p_externaldatasourceid_clear = true THEN NULL ELSE COALESCE(p_externaldatasourceid, "ExternalDataSourceID") END,
        "ExternalObjectName" = CASE WHEN p_externalobjectname_clear = true THEN NULL ELSE COALESCE(p_externalobjectname, "ExternalObjectName") END,
        "GeneratedBaseViewName" = CASE WHEN p_generatedbaseviewname_clear = true THEN NULL ELSE COALESCE(p_generatedbaseviewname, "GeneratedBaseViewName") END,
        "AllowDirectSQLInsert" = COALESCE(p_allowdirectsqlinsert, "AllowDirectSQLInsert"),
        "AllowDirectSQLUpdate" = COALESCE(p_allowdirectsqlupdate, "AllowDirectSQLUpdate"),
        "AllowDirectSQLDelete" = COALESCE(p_allowdirectsqldelete, "AllowDirectSQLDelete")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwEntities"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateEntity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateEntity" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Entity table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_entity"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_entity" ON __mj."Entity";

CREATE TRIGGER "trg_update_entity"
BEFORE UPDATE ON __mj."Entity"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_entity"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entities
-- Item: spDeleteEntity
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Entity
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteEntity'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntity"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."Entity"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteEntity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteEntity" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User View Run Details
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_view_run_detail_user_view_run_id"
    ON __mj."UserViewRunDetail" ("UserViewRunID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User View Run Details
-- Item: Permissions for vwUserViewRunDetails
-- ============================================================
GRANT SELECT ON __mj."vwUserViewRunDetails" TO "cdp_Developer";
GRANT SELECT ON __mj."vwUserViewRunDetails" TO "cdp_UI";
GRANT SELECT ON __mj."vwUserViewRunDetails" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User View Run Details
-- Item: spCreateUserViewRunDetail
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR UserViewRunDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateUserViewRunDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateUserViewRunDetail"(
    p_id UUID DEFAULT NULL,
    p_userviewrunid UUID DEFAULT NULL,
    p_recordid varchar(450) DEFAULT NULL
) RETURNS SETOF __mj."vwUserViewRunDetails" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."UserViewRunDetail"
        (
            "ID",
            "UserViewRunID",
                "RecordID"
        )
    VALUES
        (
            v_new_id,
            p_userviewrunid,
                p_recordid
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwUserViewRunDetails"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateUserViewRunDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateUserViewRunDetail" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User View Run Details
-- Item: spUpdateUserViewRunDetail
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR UserViewRunDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateUserViewRunDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateUserViewRunDetail"(
    p_id UUID,
    p_userviewrunid UUID DEFAULT NULL,
    p_recordid varchar(450) DEFAULT NULL
) RETURNS SETOF __mj."vwUserViewRunDetails" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."UserViewRunDetail"
    SET
        "UserViewRunID" = COALESCE(p_userviewrunid, "UserViewRunID"),
        "RecordID" = COALESCE(p_recordid, "RecordID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwUserViewRunDetails"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateUserViewRunDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateUserViewRunDetail" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserViewRunDetail table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_user_view_run_detail"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_user_view_run_detail" ON __mj."UserViewRunDetail";

CREATE TRIGGER "trg_update_user_view_run_detail"
BEFORE UPDATE ON __mj."UserViewRunDetail"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_user_view_run_detail"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User View Run Details
-- Item: spDeleteUserViewRunDetail
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR UserViewRunDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteUserViewRunDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteUserViewRunDetail"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."UserViewRunDetail"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteUserViewRunDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteUserViewRunDetail" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Version Installations
-- Item: Index for Foreign Keys
-- ============================================================


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Version Installations
-- Item: Permissions for vwVersionInstallations
-- ============================================================
GRANT SELECT ON __mj."vwVersionInstallations" TO "cdp_Integration";
GRANT SELECT ON __mj."vwVersionInstallations" TO "cdp_UI";
GRANT SELECT ON __mj."vwVersionInstallations" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Version Installations
-- Item: spCreateVersionInstallation
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR VersionInstallation
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateVersionInstallation'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateVersionInstallation"(
    p_id UUID DEFAULT NULL,
    p_majorversion int DEFAULT NULL,
    p_minorversion int DEFAULT NULL,
    p_patchversion int DEFAULT NULL,
    p_type_clear boolean DEFAULT false,
    p_type varchar(20) DEFAULT NULL,
    p_installedat TIMESTAMPTZ DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_installlog_clear boolean DEFAULT false,
    p_installlog TEXT DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwVersionInstallations" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."VersionInstallation"
        (
            "ID",
            "MajorVersion",
                "MinorVersion",
                "PatchVersion",
                "Type",
                "InstalledAt",
                "Status",
                "InstallLog",
                "Comments"
        )
    VALUES
        (
            v_new_id,
            p_majorversion,
                p_minorversion,
                p_patchversion,
                CASE WHEN p_type_clear = true THEN NULL ELSE COALESCE(p_type, 'System') END,
                p_installedat,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_installlog_clear = true THEN NULL ELSE COALESCE(p_installlog, NULL) END,
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwVersionInstallations"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateVersionInstallation" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spCreateVersionInstallation" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Version Installations
-- Item: spUpdateVersionInstallation
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR VersionInstallation
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateVersionInstallation'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateVersionInstallation"(
    p_id UUID,
    p_majorversion int DEFAULT NULL,
    p_minorversion int DEFAULT NULL,
    p_patchversion int DEFAULT NULL,
    p_type_clear boolean DEFAULT false,
    p_type varchar(20) DEFAULT NULL,
    p_installedat TIMESTAMPTZ DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_installlog_clear boolean DEFAULT false,
    p_installlog TEXT DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwVersionInstallations" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."VersionInstallation"
    SET
        "MajorVersion" = COALESCE(p_majorversion, "MajorVersion"),
        "MinorVersion" = COALESCE(p_minorversion, "MinorVersion"),
        "PatchVersion" = COALESCE(p_patchversion, "PatchVersion"),
        "Type" = CASE WHEN p_type_clear = true THEN NULL ELSE COALESCE(p_type, "Type") END,
        "InstalledAt" = COALESCE(p_installedat, "InstalledAt"),
        "Status" = COALESCE(p_status, "Status"),
        "InstallLog" = CASE WHEN p_installlog_clear = true THEN NULL ELSE COALESCE(p_installlog, "InstallLog") END,
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwVersionInstallations"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateVersionInstallation" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spUpdateVersionInstallation" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the VersionInstallation table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_version_installation"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_version_installation" ON __mj."VersionInstallation";

CREATE TRIGGER "trg_update_version_installation"
BEFORE UPDATE ON __mj."VersionInstallation"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_version_installation"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Version Installations
-- Item: spDeleteVersionInstallation
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR VersionInstallation
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteVersionInstallation'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteVersionInstallation"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."VersionInstallation"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteVersionInstallation" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spDeleteVersionInstallation" TO "cdp_Developer";
