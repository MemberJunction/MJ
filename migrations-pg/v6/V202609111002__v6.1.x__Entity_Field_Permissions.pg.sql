-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202609111002__v6.1.x__Entity_Field_Permissions.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."Entity"
ADD COLUMN "EnableFieldLevelSecurity" BOOLEAN NOT NULL DEFAULT FALSE /* ============================================================================
   Entity Field Permissions — Field-Level (Column-Level) Security
   v6.1.x

   Adds role-based FIELD-level access control, filling the gap between the
   existing entity-level CRUD permissions (EntityPermission) and row-level
   security (RowLevelSecurityFilter). Until now the only field-scoped feature
   was encryption-at-rest, which obfuscates data but does not control per-role
   visibility.

   TWO PIECES SHIP HERE:

   1. Entity.EnableFieldLevelSecurity — field-level security is ON or OFF per
      entity, explicitly, and enforcement gates on this flag alone. Flipping it
      ON snapshots the entity's existing entity-level permissions into per-field
      rows, so enabling changes no behavior until an admin tightens a field.

   2. EntityFieldPermission — one row per (field, role), carrying three
      INDEPENDENT trinary verbs: ReadAccess, UpdateAccess, CreateAccess.

   Trinary semantics, modelled on SQL Server's own posture:
     * 'No Access' — NEUTRAL. Grants nothing, blocks nothing. Another role's
       Allow still wins. This is the default, so a hand-inserted row grants
       nothing by accident.
     * 'Allow'     — grants the action for this role.
     * 'Deny'      — trumps everything. Any Deny across any of the user's roles
       wins, no matter how many Allows sit beside it.

   Aggregation across the roles a user holds, per verb:
       effective = (any matching row Allows) AND NOT (any matching row Denies)

   READ IS REQUIRED FOR UPDATE AND CREATE. The CK_..._ReadRequired constraint
   below enforces that WITHIN A ROW. It cannot enforce it ACROSS roles — role A
   granting Read+Update and role B denying Read are each individually legal, and
   a user holding both aggregates to read-denied + update-allowed. So the rule is
   applied a SECOND time after aggregation (EntityFieldInfo.GetUserFieldPermissions):
   if effective Read is not Allow, Update and Create are forced down. The
   constraint catches the configuration mistake; the aggregation clamp is the
   enforcement. Neither alone is sufficient.

   CodeGen convention (per migrations/CLAUDE.md):
     * NO __mj_CreatedAt / __mj_UpdatedAt columns — CodeGen adds + triggers them.
     * NO foreign-key indexes — CodeGen creates them automatically.
     * sp_addextendedproperty for every non-PK/FK column so CodeGen surfaces
       descriptions on regen.
     * PostgreSQL counterpart is NOT hand-authored — conversion is deterministic
       transpilation run by the build engineer at release time.
   ============================================================================ */ /* ============================================================================ */ /* Entity.EnableFieldLevelSecurity */ /* ============================================================================ */;

COMMENT ON COLUMN __mj."Entity"."EnableFieldLevelSecurity" IS 'When 1, field-level (column-level) security is enforced for this entity and every enforcement point consults EntityFieldPermission rows. When 0 (the default), field-level security is off entirely and any existing permission rows are retained but inactive. Enabling snapshots the entity''s current entity-level permissions into per-field rows, so turning it on changes no behavior until an administrator tightens a field; disabling preserves the rows so re-enabling does not lose the configuration.';

/* ============================================================================ */
/* EntityFieldPermission  ("MJ: Entity Field Permissions") */
/* ============================================================================ */
CREATE TABLE __mj."EntityFieldPermission" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "EntityFieldID" UUID NOT NULL,
  "RoleID" UUID NOT NULL,
  "ReadAccess" VARCHAR(20) NOT NULL DEFAULT (
    'No Access'
  ),
  "UpdateAccess" VARCHAR(20) NOT NULL DEFAULT (
    'No Access'
  ),
  "CreateAccess" VARCHAR(20) NOT NULL DEFAULT (
    'No Access'
  ),
  CONSTRAINT "PK_EntityFieldPermission" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_EntityFieldPermission_EntityField" FOREIGN KEY ("EntityFieldID") REFERENCES __mj."EntityField" (
    "ID"
  ) ON DELETE CASCADE,
  CONSTRAINT "FK_EntityFieldPermission_Role" FOREIGN KEY ("RoleID") REFERENCES __mj."Role" (
    "ID"
  ),
  CONSTRAINT "UQ_EntityFieldPermission_Field_Role" UNIQUE (
    "EntityFieldID",
    "RoleID"
  ),
  CONSTRAINT "CK_EntityFieldPermission_ReadAccess" CHECK ("ReadAccess" IN ('Allow', 'Deny', 'No Access')),
  CONSTRAINT "CK_EntityFieldPermission_UpdateAccess" CHECK ("UpdateAccess" IN ('Allow', 'Deny', 'No Access')),
  CONSTRAINT "CK_EntityFieldPermission_CreateAccess" CHECK ("CreateAccess" IN ('Allow', 'Deny', 'No Access')),
  CONSTRAINT "CK_EntityFieldPermission_ReadRequired" CHECK (NOT (
    "ReadAccess" <> 'Allow' AND "UpdateAccess" = 'Allow'
  )
  AND NOT (
    "ReadAccess" <> 'Allow' AND "CreateAccess" = 'Allow'
  ))
);

COMMENT ON TABLE __mj."EntityFieldPermission" IS 'Role-based field-level (column-level) security. One row per (entity field, role), carrying three independent trinary verbs — ReadAccess, UpdateAccess and CreateAccess — each Allow, Deny or No Access. Rows are only consulted when the parent entity has EnableFieldLevelSecurity = 1. Across the roles a user holds, a verb resolves to (any Allow) AND NOT (any Deny); No Access is neutral and grants nothing while blocking nothing. Read is required for Update and Create, enforced per row by a CHECK constraint and again after aggregation. Primary keys and MemberJunction system audit columns are never restrictable.';

COMMENT ON COLUMN __mj."EntityFieldPermission"."ReadAccess" IS 'Whether this role may read the field''s values. Allow grants it; Deny blocks it and beats every Allow from the user''s other roles; No Access is neutral (the default) and leaves the outcome to the user''s other roles. Enforced at the API output boundary (result projection and GraphQL field mapping), by predicate validation which rejects an ExtraFilter/OrderBy/Aggregate referencing an unreadable field, and by the strongly-typed accessor path which throws.';

COMMENT ON COLUMN __mj."EntityFieldPermission"."UpdateAccess" IS 'Whether this role may modify the field''s value on an EXISTING record. Allow grants it; Deny blocks it and beats every Allow from the user''s other roles; No Access is neutral (the default). Requires ReadAccess = Allow — a field a user cannot see is one they cannot change. Enforced server-side before SQL generation; the client-side BaseEntity check is UX-level defense-in-depth only.';

COMMENT ON COLUMN __mj."EntityFieldPermission"."CreateAccess" IS 'Whether this role may supply the field''s value when INSERTING a record. Allow grants it; Deny blocks it and beats every Allow from the user''s other roles; No Access is neutral (the default). Requires ReadAccess = Allow. When a user may not create a field, any value they supply is dropped and the column takes its default — the insert is not rejected, matching the read path where a denied field is simply absent rather than an error. A NOT NULL column with no default that a user cannot create makes records uncreatable for that user; restricted fields should be nullable or defaulted.';

/* ============================================================================= */
/* ============================================================================= */
/*                    ⚙️  CODEGEN OUTPUT BELOW THIS LINE  ⚙️                      */
/*                                                                               */
/* Everything below this block was generated by the MemberJunction CodeGen tool  */
/* after the hand-written DDL above was applied to the development database.     */
/*                                                                               */
/* It contains the framework plumbing for the new EntityFieldPermission entity:  */
/*   - Entity metadata INSERT ("MJ: Entity Field Permissions")                   */
/*   - Application entity registration and role permission grants                */
/*   - __mj_CreatedAt / __mj_UpdatedAt columns, defaults, and update trigger     */
/*   - EntityField metadata rows (including the EntityField/Role virtual name    */
/*     columns the base view joins in) and EntityFieldValue rows for the         */
/*     Type CHECK constraint                                                     */
/*   - Foreign key indexes (IDX_AUTO_MJ_FKEY_*)                                  */
/*   - The base view vwEntityFieldPermissions                                    */
/*   - spCreate / spUpdate / spDelete stored procedures + EXECUTE grants         */
/*   - Extended properties                                                       */
/*                                                                               */
/* DO NOT EDIT BY HAND. If the hand-written DDL above changes, re-run CodeGen    */
/* and replace this entire section with the fresh output.                        */
/* ============================================================================= */
/* ============================================================================= */
/* ============================================================================
   TRIMMED CodeGen output — Entity Field Permissions feature only.

   This run (2026-09-04 19:00) was the FIRST CodeGen against a from-scratch
   database (mj_test_2, rebuilt 18:38), so the raw output also contained
   fresh-install healing unrelated to this feature. Per migrations/CLAUDE.md,
   those sections were EXCLUDED here (see CodeGen_Run_2026-09-04_19-00-13.original.sql
   for the unedited output):

     - IdentityClaim / IdentityClaimType __mj default-constraint churn,
       relationships, views, procs, value lists, and AI form-layout categories
       (healing of V202608202300's tail — not this feature)
     - The 80-field MJ: Entities AI relayout, EXCEPT the single category
       update for the new EnableFieldLevelSecurity field
     - Regenerated validation functions for MJ: AI Model Price Unit Types,
       MJ: AI Prompt Runs, and MJ: Form Chrome Rules

   Everything below pertains to EntityFieldPermission ("MJ: Entity Field
   Permissions") and Entity.EnableFieldLevelSecurity.
   ============================================================================ */
/* SQL generated to create new entity MJ: Entity Field Permissions */
/* SQL generated to create new entity MJ: Entity Field Permissions */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f60ea8ef-c552-4dd6-a8e3-65ffac57a88d',
    'MJ: Entity Field Permissions',
    'Entity Field Permissions',
    'Role-based field-level (column-level) security. One row per (entity field, role), carrying three independent trinary verbs — ReadAccess, UpdateAccess and CreateAccess — each Allow, Deny or No Access. Rows are only consulted when the parent entity has EnableFieldLevelSecurity = 1. Across the roles a user holds, a verb resolves to (any Allow) AND NOT (any Deny); No Access is neutral and grants nothing while blocking nothing. Read is required for Update and Create, enforced per row by a CHECK constraint and again after aggregation. Primary keys and MemberJunction system audit columns are never restrictable.',
    NULL,
    'EntityFieldPermission',
    'vwEntityFieldPermissions',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ: Entity Field Permissions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    'f60ea8ef-c552-4dd6-a8e3-65ffac57a88d',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Entity Field Permissions for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f60ea8ef-c552-4dd6-a8e3-65ffac57a88d',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Entity Field Permissions for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f60ea8ef-c552-4dd6-a8e3-65ffac57a88d',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Entity Field Permissions for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f60ea8ef-c552-4dd6-a8e3-65ffac57a88d',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
ALTER TABLE __mj."EntityFieldPermission"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.EntityFieldPermission */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.EntityFieldPermission */
UPDATE __mj."EntityFieldPermission" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'EntityFieldPermission' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."EntityFieldPermission" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."EntityFieldPermission" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."EntityFieldPermission"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.EntityFieldPermission */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.EntityFieldPermission */
UPDATE __mj."EntityFieldPermission" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'EntityFieldPermission' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."EntityFieldPermission" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."EntityFieldPermission" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0ca35a65-cf53-4b82-b4ad-e1f7fce6fdec' OR ("EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'EnableFieldLevelSecurity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0ca35a65-cf53-4b82-b4ad-e1f7fce6fdec', 'E0238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Entities */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6'), 'EnableFieldLevelSecurity', 'Enable Field Level Security', 'When 1, field-level (column-level) security is enforced for this entity and every enforcement point consults EntityFieldPermission rows. When 0 (the default), field-level security is off entirely and any existing permission rows are retained but inactive. Enabling snapshots the entity''s current entity-level permissions into per-field rows, so turning it on changes no behavior until an administrator tightens a field; disabling preserves the rows so re-enabling does not lose the configuration.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '779281d5-eba2-488e-95e9-e0436e3541b1' OR ("EntityID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('779281d5-eba2-488e-95e9-e0436e3541b1', 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D' /* Entity: MJ: Entity Field Permissions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '818235f5-b2c5-464a-b000-0f75f01c907e' OR ("EntityID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D' AND "Name" = 'EntityFieldID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('818235f5-b2c5-464a-b000-0f75f01c907e', 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D' /* Entity: MJ: Entity Field Permissions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D'), 'EntityFieldID', 'Entity Field ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '17661b68-b560-4d65-bdc1-c7ac33761134' OR ("EntityID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D' AND "Name" = 'RoleID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('17661b68-b560-4d65-bdc1-c7ac33761134', 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D' /* Entity: MJ: Entity Field Permissions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D'), 'RoleID', 'Role ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'DA238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b6f951ef-9149-4f64-af7d-fc7751672b63' OR ("EntityID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D' AND "Name" = 'ReadAccess')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b6f951ef-9149-4f64-af7d-fc7751672b63', 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D' /* Entity: MJ: Entity Field Permissions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D'), 'ReadAccess', 'Read Access', 'Whether this role may read the field''s values. Allow grants it; Deny blocks it and beats every Allow from the user''s other roles; No Access is neutral (the default) and leaves the outcome to the user''s other roles. Enforced at the API output boundary (result projection and GraphQL field mapping), by predicate validation which rejects an ExtraFilter/OrderBy/Aggregate referencing an unreadable field, and by the strongly-typed accessor path which throws.', 'nvarchar', 40, 0, 0, FALSE, 'No Access', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fbccadbc-512c-4e0f-a1ae-2fc2a88f17c4' OR ("EntityID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D' AND "Name" = 'UpdateAccess')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fbccadbc-512c-4e0f-a1ae-2fc2a88f17c4', 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D' /* Entity: MJ: Entity Field Permissions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D'), 'UpdateAccess', 'Update Access', 'Whether this role may modify the field''s value on an EXISTING record. Allow grants it; Deny blocks it and beats every Allow from the user''s other roles; No Access is neutral (the default). Requires ReadAccess = Allow — a field a user cannot see is one they cannot change. Enforced server-side before SQL generation; the client-side BaseEntity check is UX-level defense-in-depth only.', 'nvarchar', 40, 0, 0, FALSE, 'No Access', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4beb776e-3a02-488d-979e-8a3e4fac8dff' OR ("EntityID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D' AND "Name" = 'CreateAccess')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4beb776e-3a02-488d-979e-8a3e4fac8dff', 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D' /* Entity: MJ: Entity Field Permissions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D'), 'CreateAccess', 'Create Access', 'Whether this role may supply the field''s value when INSERTING a record. Allow grants it; Deny blocks it and beats every Allow from the user''s other roles; No Access is neutral (the default). Requires ReadAccess = Allow. When a user may not create a field, any value they supply is dropped and the column takes its default — the insert is not rejected, matching the read path where a denied field is simply absent rather than an error. A NOT NULL column with no default that a user cannot create makes records uncreatable for that user; restricted fields should be nullable or defaulted.', 'nvarchar', 40, 0, 0, FALSE, 'No Access', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bcf2e6b9-b15f-4998-bd92-2b9afeb68f90' OR ("EntityID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bcf2e6b9-b15f-4998-bd92-2b9afeb68f90', 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D' /* Entity: MJ: Entity Field Permissions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '03805990-2c81-4b08-b0bb-b27dbdce07cd' OR ("EntityID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('03805990-2c81-4b08-b0bb-b27dbdce07cd', 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D' /* Entity: MJ: Entity Field Permissions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 27e52fa7-254f-407f-85c9-cf9c75d5602c */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '27e52fa7-254f-407f-85c9-cf9c75d5602c',
    'B6F951EF-9149-4F64-AF7D-FC7751672B63',
    1,
    'Allow',
    'Allow',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 486d7890-3a72-4bd0-bcbd-8d7b3291e661 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '486d7890-3a72-4bd0-bcbd-8d7b3291e661',
    'B6F951EF-9149-4F64-AF7D-FC7751672B63',
    2,
    'Deny',
    'Deny',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID ca202e15-f98b-4854-a685-be2fbafee36e */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'ca202e15-f98b-4854-a685-be2fbafee36e',
    'B6F951EF-9149-4F64-AF7D-FC7751672B63',
    3,
    'No Access',
    'No Access',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID B6F951EF-9149-4F64-AF7D-FC7751672B63 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'B6F951EF-9149-4F64-AF7D-FC7751672B63';
/* SQL text to insert entity field value with ID d87500fa-4a93-4815-adf4-1f9ba7cf3889 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd87500fa-4a93-4815-adf4-1f9ba7cf3889',
    'FBCCADBC-512C-4E0F-A1AE-2FC2A88F17C4',
    1,
    'Allow',
    'Allow',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 60f5b886-aaae-459f-ae5a-0b608ed86789 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '60f5b886-aaae-459f-ae5a-0b608ed86789',
    'FBCCADBC-512C-4E0F-A1AE-2FC2A88F17C4',
    2,
    'Deny',
    'Deny',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 80b76002-cb37-4a33-8b10-2ba76ba78994 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '80b76002-cb37-4a33-8b10-2ba76ba78994',
    'FBCCADBC-512C-4E0F-A1AE-2FC2A88F17C4',
    3,
    'No Access',
    'No Access',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID FBCCADBC-512C-4E0F-A1AE-2FC2A88F17C4 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'FBCCADBC-512C-4E0F-A1AE-2FC2A88F17C4';
/* SQL text to insert entity field value with ID d2249514-be65-4c07-b728-cbf7c0ad115e */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd2249514-be65-4c07-b728-cbf7c0ad115e',
    '4BEB776E-3A02-488D-979E-8A3E4FAC8DFF',
    1,
    'Allow',
    'Allow',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID ac22de3b-3e5c-4e88-8f9f-1165886e2b14 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'ac22de3b-3e5c-4e88-8f9f-1165886e2b14',
    '4BEB776E-3A02-488D-979E-8A3E4FAC8DFF',
    2,
    'Deny',
    'Deny',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID db45d04a-9f17-4517-a5eb-2f12375d6645 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'db45d04a-9f17-4517-a5eb-2f12375d6645',
    '4BEB776E-3A02-488D-979E-8A3E4FAC8DFF',
    3,
    'No Access',
    'No Access',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 4BEB776E-3A02-488D-979E-8A3E4FAC8DFF */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '4BEB776E-3A02-488D-979E-8A3E4FAC8DFF';
/* Create Entity Relationship: MJ: Roles -> MJ: Entity Field Permissions (One To Many via RoleID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'ec7bce48-dcea-44db-945e-87a840b2baef') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ec7bce48-dcea-44db-945e-87a840b2baef', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D', 'RoleID', 'One To Many', TRUE, TRUE, 17, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '5699601b-e629-4400-a4ac-6824b44cd5d6') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('5699601b-e629-4400-a4ac-6824b44cd5d6', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D', 'EntityFieldID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

-- Flush any pending deferred trigger events from prior DML so the index DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = '__mj' AND tablename = 'Entity' AND indexname = 'IDX_AUTO_MJ_FKEY_Entity_ParentID') THEN
    CREATE INDEX "IDX_AUTO_MJ_FKEY_Entity_ParentID" ON __mj."Entity"("ParentID");
  END IF;
END $$;

-- Flush any pending deferred trigger events from prior DML so the index DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = '__mj' AND tablename = 'Entity' AND indexname = 'IDX_AUTO_MJ_FKEY_Entity_ExternalDataSourceID') THEN
    CREATE INDEX "IDX_AUTO_MJ_FKEY_Entity_ExternalDataSourceID" ON __mj."Entity"("ExternalDataSourceID");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4e3164a4-65d9-445f-9513-db52b42566de' OR ("EntityID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D' AND "Name" = 'EntityField')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4e3164a4-65d9-445f-9513-db52b42566de', 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D' /* Entity: MJ: Entity Field Permissions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D'), 'EntityField', 'Entity Field', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4960ed2a-0205-45bb-bd9b-1a13425afd4e' OR ("EntityID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D' AND "Name" = 'Role')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4960ed2a-0205-45bb-bd9b-1a13425afd4e', 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D' /* Entity: MJ: Entity Field Permissions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D'), 'Role', 'Role', NULL, 'nvarchar', 100, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '4BEB776E-3A02-488D-979E-8A3E4FAC8DFF'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '4E3164A4-65D9-445F-9513-DB52B42566DE'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '4960ED2A-0205-45BB-BD9B-1A13425AFD4E'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = FALSE
WHERE
  "ID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set categories for 1 fields */
/* UPDATE Entity Field Category Info MJ: Entities.EnableFieldLevelSecurity */
UPDATE __mj."EntityField" SET "Category" = 'API & Search Settings', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '0CA35A65-CF53-4B82-B4AD-E1F7FCE6FDEC';

/* Set categories for 10 fields */
/* UPDATE Entity Field Category Info MJ: Entity Field Permissions.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '779281D5-EBA2-488E-95E9-E0436E3541B1';
/* UPDATE Entity Field Category Info MJ: Entity Field Permissions.EntityFieldID */
UPDATE __mj."EntityField" SET "Category" = 'Permission Scope', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '818235F5-B2C5-464A-B000-0F75F01C907E';
/* UPDATE Entity Field Category Info MJ: Entity Field Permissions.EntityField */
UPDATE __mj."EntityField" SET "Category" = 'Permission Scope', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '4E3164A4-65D9-445F-9513-DB52B42566DE';
/* UPDATE Entity Field Category Info MJ: Entity Field Permissions.RoleID */
UPDATE __mj."EntityField" SET "Category" = 'Permission Scope', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '17661B68-B560-4D65-BDC1-C7AC33761134';
/* UPDATE Entity Field Category Info MJ: Entity Field Permissions.Role */
UPDATE __mj."EntityField" SET "Category" = 'Permission Scope', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '4960ED2A-0205-45BB-BD9B-1A13425AFD4E';
/* UPDATE Entity Field Category Info MJ: Entity Field Permissions.ReadAccess */
UPDATE __mj."EntityField" SET "Category" = 'Access Controls', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'B6F951EF-9149-4F64-AF7D-FC7751672B63';
/* UPDATE Entity Field Category Info MJ: Entity Field Permissions.UpdateAccess */
UPDATE __mj."EntityField" SET "Category" = 'Access Controls', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'FBCCADBC-512C-4E0F-A1AE-2FC2A88F17C4';
/* UPDATE Entity Field Category Info MJ: Entity Field Permissions.CreateAccess */
UPDATE __mj."EntityField" SET "Category" = 'Access Controls', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '4BEB776E-3A02-488D-979E-8A3E4FAC8DFF';
/* UPDATE Entity Field Category Info MJ: Entity Field Permissions.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'BCF2E6B9-B15F-4998-BD92-2B9AFEB68F90';
/* UPDATE Entity Field Category Info MJ: Entity Field Permissions.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '03805990-2C81-4B08-B0BB-B27DBDCE07CD';

/* Set entity icon to fa fa-shield-alt */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-shield-alt', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bcf841d1-21ee-5067-a132-647c58ed5010', 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D', 'FieldCategoryInfo', '{
  "Access Controls": {
    "description": "Security settings defining Read, Update, and Create permissions",
    "icon": "fa fa-lock"
  },
  "Permission Scope": {
    "description": "Defines the target entity field and the role to which these permissions apply",
    "icon": "fa fa-crosshairs"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ac6b3853-57c8-5a33-9c18-fe4fdbb7dd8e', 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D', 'FieldCategoryIcons', '{
  "Access Controls": "fa fa-lock",
  "Permission Scope": "fa fa-crosshairs",
  "System Metadata": "fa fa-cog"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'F60EA8EF-C552-4DD6-A8E3-65FFAC57A88D';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entities
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_parent_id"
    ON "__mj"."Entity" ("ParentID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entities
-- Item: Permissions for vwEntities
-- ============================================================
GRANT SELECT ON "__mj"."vwEntities" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwEntities" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwEntities" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entities
-- Item: spCreateEntity
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Entity (JSON-arg shape)
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

CREATE OR REPLACE FUNCTION "__mj"."spCreateEntity"(p_data JSONB)
RETURNS SETOF "__mj"."vwEntities"
AS $$
DECLARE
    v_id UUID;
    v_field_name TEXT;
    v_cast_expr  TEXT;
    v_col_list   TEXT;
    v_val_list   TEXT;
    v_sql        TEXT;
BEGIN
    IF p_data ? 'ID' THEN
        v_id := (p_data->>'ID')::UUID;
    ELSE
        v_id := gen_random_uuid();
    END IF;

    v_col_list := quote_ident('ID');
    v_val_list := quote_literal(v_id) || '::UUID';

    -- Build column / value lists from keys present in p_data. Absent keys are
    -- omitted entirely so the column's DEFAULT applies (matching the typed-arg
    -- sproc's default-substitution semantics).
    FOREACH v_field_name IN ARRAY ARRAY['ParentID', 'Name', 'NameSuffix', 'Description', 'AutoUpdateDescription', 'BaseView', 'BaseViewGenerated', 'VirtualEntity', 'TrackRecordChanges', 'AuditRecordAccess', 'AuditViewRuns', 'IncludeInAPI', 'AllowAllRowsAPI', 'AllowUpdateAPI', 'AllowCreateAPI', 'AllowDeleteAPI', 'CustomResolverAPI', 'AllowUserSearchAPI', 'FullTextSearchEnabled', 'FullTextCatalog', 'FullTextCatalogGenerated', 'FullTextIndex', 'FullTextIndexGenerated', 'FullTextSearchFunction', 'FullTextSearchFunctionGenerated', 'UserViewMaxRows', 'spCreate', 'spUpdate', 'spDelete', 'spCreateGenerated', 'spUpdateGenerated', 'spDeleteGenerated', 'CascadeDeletes', 'DeleteType', 'AllowRecordMerge', 'spMatch', 'RelationshipDefaultDisplayType', 'UserFormGenerated', 'EntityObjectSubclassName', 'EntityObjectSubclassImport', 'PreferredCommunicationField', 'Icon', 'ScopeDefault', 'RowsToPackWithSchema', 'RowsToPackSampleMethod', 'RowsToPackSampleCount', 'RowsToPackSampleOrder', 'AutoRowCountFrequency', 'RowCount', 'RowCountRunAt', 'Status', 'DisplayName', 'AllowMultipleSubtypes', 'AutoUpdateFullTextSearch', 'AutoUpdateAllowUserSearchAPI', 'TrustServerCacheCompletely', 'SupportsGeoCoding', 'AutoUpdateSupportsGeoCoding', 'AllowCaching', 'DetectExternalChanges', 'GeneratedBaseViewName', 'AllowDirectSQLInsert', 'AllowDirectSQLUpdate', 'AllowDirectSQLDelete', 'Configuration', 'SubtypeSelector', 'EnableFieldLevelSecurity']
    LOOP
        IF p_data ? v_field_name THEN
            v_cast_expr := CASE v_field_name
        WHEN 'ParentID' THEN '($1->>''ParentID'')::UUID'
        WHEN 'Name' THEN '($1->>''Name'')'
        WHEN 'NameSuffix' THEN '($1->>''NameSuffix'')'
        WHEN 'Description' THEN '($1->>''Description'')'
        WHEN 'AutoUpdateDescription' THEN 'COALESCE(($1->>''AutoUpdateDescription'')::BOOLEAN, TRUE)'
        WHEN 'BaseView' THEN '($1->>''BaseView'')'
        WHEN 'BaseViewGenerated' THEN 'COALESCE(($1->>''BaseViewGenerated'')::BOOLEAN, TRUE)'
        WHEN 'VirtualEntity' THEN 'COALESCE(($1->>''VirtualEntity'')::BOOLEAN, FALSE)'
        WHEN 'TrackRecordChanges' THEN 'COALESCE(($1->>''TrackRecordChanges'')::BOOLEAN, TRUE)'
        WHEN 'AuditRecordAccess' THEN 'COALESCE(($1->>''AuditRecordAccess'')::BOOLEAN, TRUE)'
        WHEN 'AuditViewRuns' THEN 'COALESCE(($1->>''AuditViewRuns'')::BOOLEAN, TRUE)'
        WHEN 'IncludeInAPI' THEN 'COALESCE(($1->>''IncludeInAPI'')::BOOLEAN, FALSE)'
        WHEN 'AllowAllRowsAPI' THEN 'COALESCE(($1->>''AllowAllRowsAPI'')::BOOLEAN, FALSE)'
        WHEN 'AllowUpdateAPI' THEN 'COALESCE(($1->>''AllowUpdateAPI'')::BOOLEAN, FALSE)'
        WHEN 'AllowCreateAPI' THEN 'COALESCE(($1->>''AllowCreateAPI'')::BOOLEAN, FALSE)'
        WHEN 'AllowDeleteAPI' THEN 'COALESCE(($1->>''AllowDeleteAPI'')::BOOLEAN, FALSE)'
        WHEN 'CustomResolverAPI' THEN 'COALESCE(($1->>''CustomResolverAPI'')::BOOLEAN, FALSE)'
        WHEN 'AllowUserSearchAPI' THEN 'COALESCE(($1->>''AllowUserSearchAPI'')::BOOLEAN, FALSE)'
        WHEN 'FullTextSearchEnabled' THEN 'COALESCE(($1->>''FullTextSearchEnabled'')::BOOLEAN, FALSE)'
        WHEN 'FullTextCatalog' THEN '($1->>''FullTextCatalog'')'
        WHEN 'FullTextCatalogGenerated' THEN 'COALESCE(($1->>''FullTextCatalogGenerated'')::BOOLEAN, TRUE)'
        WHEN 'FullTextIndex' THEN '($1->>''FullTextIndex'')'
        WHEN 'FullTextIndexGenerated' THEN 'COALESCE(($1->>''FullTextIndexGenerated'')::BOOLEAN, TRUE)'
        WHEN 'FullTextSearchFunction' THEN '($1->>''FullTextSearchFunction'')'
        WHEN 'FullTextSearchFunctionGenerated' THEN 'COALESCE(($1->>''FullTextSearchFunctionGenerated'')::BOOLEAN, TRUE)'
        WHEN 'UserViewMaxRows' THEN '($1->>''UserViewMaxRows'')::INT'
        WHEN 'spCreate' THEN '($1->>''spCreate'')'
        WHEN 'spUpdate' THEN '($1->>''spUpdate'')'
        WHEN 'spDelete' THEN '($1->>''spDelete'')'
        WHEN 'spCreateGenerated' THEN 'COALESCE(($1->>''spCreateGenerated'')::BOOLEAN, TRUE)'
        WHEN 'spUpdateGenerated' THEN 'COALESCE(($1->>''spUpdateGenerated'')::BOOLEAN, TRUE)'
        WHEN 'spDeleteGenerated' THEN 'COALESCE(($1->>''spDeleteGenerated'')::BOOLEAN, TRUE)'
        WHEN 'CascadeDeletes' THEN 'COALESCE(($1->>''CascadeDeletes'')::BOOLEAN, FALSE)'
        WHEN 'DeleteType' THEN 'COALESCE(($1->>''DeleteType''), ''Hard'')'
        WHEN 'AllowRecordMerge' THEN 'COALESCE(($1->>''AllowRecordMerge'')::BOOLEAN, FALSE)'
        WHEN 'spMatch' THEN '($1->>''spMatch'')'
        WHEN 'RelationshipDefaultDisplayType' THEN 'COALESCE(($1->>''RelationshipDefaultDisplayType''), ''Search'')'
        WHEN 'UserFormGenerated' THEN 'COALESCE(($1->>''UserFormGenerated'')::BOOLEAN, TRUE)'
        WHEN 'EntityObjectSubclassName' THEN '($1->>''EntityObjectSubclassName'')'
        WHEN 'EntityObjectSubclassImport' THEN '($1->>''EntityObjectSubclassImport'')'
        WHEN 'PreferredCommunicationField' THEN '($1->>''PreferredCommunicationField'')'
        WHEN 'Icon' THEN '($1->>''Icon'')'
        WHEN 'ScopeDefault' THEN '($1->>''ScopeDefault'')'
        WHEN 'RowsToPackWithSchema' THEN 'COALESCE(($1->>''RowsToPackWithSchema''), ''None'')'
        WHEN 'RowsToPackSampleMethod' THEN 'COALESCE(($1->>''RowsToPackSampleMethod''), ''random'')'
        WHEN 'RowsToPackSampleCount' THEN 'COALESCE(($1->>''RowsToPackSampleCount'')::INT, 0)'
        WHEN 'RowsToPackSampleOrder' THEN '($1->>''RowsToPackSampleOrder'')'
        WHEN 'AutoRowCountFrequency' THEN '($1->>''AutoRowCountFrequency'')::INT'
        WHEN 'RowCount' THEN '($1->>''RowCount'')::BIGINT'
        WHEN 'RowCountRunAt' THEN '($1->>''RowCountRunAt'')::TIMESTAMPTZ'
        WHEN 'Status' THEN 'COALESCE(($1->>''Status''), ''Active'')'
        WHEN 'DisplayName' THEN '($1->>''DisplayName'')'
        WHEN 'AllowMultipleSubtypes' THEN 'COALESCE(($1->>''AllowMultipleSubtypes'')::BOOLEAN, FALSE)'
        WHEN 'AutoUpdateFullTextSearch' THEN 'COALESCE(($1->>''AutoUpdateFullTextSearch'')::BOOLEAN, TRUE)'
        WHEN 'AutoUpdateAllowUserSearchAPI' THEN 'COALESCE(($1->>''AutoUpdateAllowUserSearchAPI'')::BOOLEAN, TRUE)'
        WHEN 'TrustServerCacheCompletely' THEN 'COALESCE(($1->>''TrustServerCacheCompletely'')::BOOLEAN, TRUE)'
        WHEN 'SupportsGeoCoding' THEN 'COALESCE(($1->>''SupportsGeoCoding'')::BOOLEAN, FALSE)'
        WHEN 'AutoUpdateSupportsGeoCoding' THEN 'COALESCE(($1->>''AutoUpdateSupportsGeoCoding'')::BOOLEAN, TRUE)'
        WHEN 'AllowCaching' THEN 'COALESCE(($1->>''AllowCaching'')::BOOLEAN, FALSE)'
        WHEN 'DetectExternalChanges' THEN 'COALESCE(($1->>''DetectExternalChanges'')::BOOLEAN, FALSE)'
        WHEN 'GeneratedBaseViewName' THEN '($1->>''GeneratedBaseViewName'')'
        WHEN 'AllowDirectSQLInsert' THEN 'COALESCE(($1->>''AllowDirectSQLInsert'')::BOOLEAN, FALSE)'
        WHEN 'AllowDirectSQLUpdate' THEN 'COALESCE(($1->>''AllowDirectSQLUpdate'')::BOOLEAN, FALSE)'
        WHEN 'AllowDirectSQLDelete' THEN 'COALESCE(($1->>''AllowDirectSQLDelete'')::BOOLEAN, FALSE)'
        WHEN 'Configuration' THEN '($1->>''Configuration'')'
        WHEN 'SubtypeSelector' THEN '($1->>''SubtypeSelector'')'
        WHEN 'EnableFieldLevelSecurity' THEN 'COALESCE(($1->>''EnableFieldLevelSecurity'')::BOOLEAN, FALSE)'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO "__mj"."Entity" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM "__mj"."vwEntities"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntity" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entities
-- Item: spUpdateEntity
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Entity (JSON-arg shape)
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

CREATE OR REPLACE FUNCTION "__mj"."spUpdateEntity"(p_data JSONB)
RETURNS SETOF "__mj"."vwEntities"
AS $$
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateEntity: p_data must include "ID"';
    END IF;

    UPDATE "__mj"."Entity"
    SET
        "ParentID" = CASE WHEN p_data ? 'ParentID' THEN (p_data->>'ParentID')::UUID ELSE "ParentID" END,
        "Name" = CASE WHEN p_data ? 'Name' THEN (p_data->>'Name') ELSE "Name" END,
        "NameSuffix" = CASE WHEN p_data ? 'NameSuffix' THEN (p_data->>'NameSuffix') ELSE "NameSuffix" END,
        "Description" = CASE WHEN p_data ? 'Description' THEN (p_data->>'Description') ELSE "Description" END,
        "AutoUpdateDescription" = CASE WHEN p_data ? 'AutoUpdateDescription' THEN (p_data->>'AutoUpdateDescription')::BOOLEAN ELSE "AutoUpdateDescription" END,
        "BaseView" = CASE WHEN p_data ? 'BaseView' THEN (p_data->>'BaseView') ELSE "BaseView" END,
        "BaseViewGenerated" = CASE WHEN p_data ? 'BaseViewGenerated' THEN (p_data->>'BaseViewGenerated')::BOOLEAN ELSE "BaseViewGenerated" END,
        "VirtualEntity" = CASE WHEN p_data ? 'VirtualEntity' THEN (p_data->>'VirtualEntity')::BOOLEAN ELSE "VirtualEntity" END,
        "TrackRecordChanges" = CASE WHEN p_data ? 'TrackRecordChanges' THEN (p_data->>'TrackRecordChanges')::BOOLEAN ELSE "TrackRecordChanges" END,
        "AuditRecordAccess" = CASE WHEN p_data ? 'AuditRecordAccess' THEN (p_data->>'AuditRecordAccess')::BOOLEAN ELSE "AuditRecordAccess" END,
        "AuditViewRuns" = CASE WHEN p_data ? 'AuditViewRuns' THEN (p_data->>'AuditViewRuns')::BOOLEAN ELSE "AuditViewRuns" END,
        "IncludeInAPI" = CASE WHEN p_data ? 'IncludeInAPI' THEN (p_data->>'IncludeInAPI')::BOOLEAN ELSE "IncludeInAPI" END,
        "AllowAllRowsAPI" = CASE WHEN p_data ? 'AllowAllRowsAPI' THEN (p_data->>'AllowAllRowsAPI')::BOOLEAN ELSE "AllowAllRowsAPI" END,
        "AllowUpdateAPI" = CASE WHEN p_data ? 'AllowUpdateAPI' THEN (p_data->>'AllowUpdateAPI')::BOOLEAN ELSE "AllowUpdateAPI" END,
        "AllowCreateAPI" = CASE WHEN p_data ? 'AllowCreateAPI' THEN (p_data->>'AllowCreateAPI')::BOOLEAN ELSE "AllowCreateAPI" END,
        "AllowDeleteAPI" = CASE WHEN p_data ? 'AllowDeleteAPI' THEN (p_data->>'AllowDeleteAPI')::BOOLEAN ELSE "AllowDeleteAPI" END,
        "CustomResolverAPI" = CASE WHEN p_data ? 'CustomResolverAPI' THEN (p_data->>'CustomResolverAPI')::BOOLEAN ELSE "CustomResolverAPI" END,
        "AllowUserSearchAPI" = CASE WHEN p_data ? 'AllowUserSearchAPI' THEN (p_data->>'AllowUserSearchAPI')::BOOLEAN ELSE "AllowUserSearchAPI" END,
        "FullTextSearchEnabled" = CASE WHEN p_data ? 'FullTextSearchEnabled' THEN (p_data->>'FullTextSearchEnabled')::BOOLEAN ELSE "FullTextSearchEnabled" END,
        "FullTextCatalog" = CASE WHEN p_data ? 'FullTextCatalog' THEN (p_data->>'FullTextCatalog') ELSE "FullTextCatalog" END,
        "FullTextCatalogGenerated" = CASE WHEN p_data ? 'FullTextCatalogGenerated' THEN (p_data->>'FullTextCatalogGenerated')::BOOLEAN ELSE "FullTextCatalogGenerated" END,
        "FullTextIndex" = CASE WHEN p_data ? 'FullTextIndex' THEN (p_data->>'FullTextIndex') ELSE "FullTextIndex" END,
        "FullTextIndexGenerated" = CASE WHEN p_data ? 'FullTextIndexGenerated' THEN (p_data->>'FullTextIndexGenerated')::BOOLEAN ELSE "FullTextIndexGenerated" END,
        "FullTextSearchFunction" = CASE WHEN p_data ? 'FullTextSearchFunction' THEN (p_data->>'FullTextSearchFunction') ELSE "FullTextSearchFunction" END,
        "FullTextSearchFunctionGenerated" = CASE WHEN p_data ? 'FullTextSearchFunctionGenerated' THEN (p_data->>'FullTextSearchFunctionGenerated')::BOOLEAN ELSE "FullTextSearchFunctionGenerated" END,
        "UserViewMaxRows" = CASE WHEN p_data ? 'UserViewMaxRows' THEN (p_data->>'UserViewMaxRows')::INT ELSE "UserViewMaxRows" END,
        "spCreate" = CASE WHEN p_data ? 'spCreate' THEN (p_data->>'spCreate') ELSE "spCreate" END,
        "spUpdate" = CASE WHEN p_data ? 'spUpdate' THEN (p_data->>'spUpdate') ELSE "spUpdate" END,
        "spDelete" = CASE WHEN p_data ? 'spDelete' THEN (p_data->>'spDelete') ELSE "spDelete" END,
        "spCreateGenerated" = CASE WHEN p_data ? 'spCreateGenerated' THEN (p_data->>'spCreateGenerated')::BOOLEAN ELSE "spCreateGenerated" END,
        "spUpdateGenerated" = CASE WHEN p_data ? 'spUpdateGenerated' THEN (p_data->>'spUpdateGenerated')::BOOLEAN ELSE "spUpdateGenerated" END,
        "spDeleteGenerated" = CASE WHEN p_data ? 'spDeleteGenerated' THEN (p_data->>'spDeleteGenerated')::BOOLEAN ELSE "spDeleteGenerated" END,
        "CascadeDeletes" = CASE WHEN p_data ? 'CascadeDeletes' THEN (p_data->>'CascadeDeletes')::BOOLEAN ELSE "CascadeDeletes" END,
        "DeleteType" = CASE WHEN p_data ? 'DeleteType' THEN (p_data->>'DeleteType') ELSE "DeleteType" END,
        "AllowRecordMerge" = CASE WHEN p_data ? 'AllowRecordMerge' THEN (p_data->>'AllowRecordMerge')::BOOLEAN ELSE "AllowRecordMerge" END,
        "spMatch" = CASE WHEN p_data ? 'spMatch' THEN (p_data->>'spMatch') ELSE "spMatch" END,
        "RelationshipDefaultDisplayType" = CASE WHEN p_data ? 'RelationshipDefaultDisplayType' THEN (p_data->>'RelationshipDefaultDisplayType') ELSE "RelationshipDefaultDisplayType" END,
        "UserFormGenerated" = CASE WHEN p_data ? 'UserFormGenerated' THEN (p_data->>'UserFormGenerated')::BOOLEAN ELSE "UserFormGenerated" END,
        "EntityObjectSubclassName" = CASE WHEN p_data ? 'EntityObjectSubclassName' THEN (p_data->>'EntityObjectSubclassName') ELSE "EntityObjectSubclassName" END,
        "EntityObjectSubclassImport" = CASE WHEN p_data ? 'EntityObjectSubclassImport' THEN (p_data->>'EntityObjectSubclassImport') ELSE "EntityObjectSubclassImport" END,
        "PreferredCommunicationField" = CASE WHEN p_data ? 'PreferredCommunicationField' THEN (p_data->>'PreferredCommunicationField') ELSE "PreferredCommunicationField" END,
        "Icon" = CASE WHEN p_data ? 'Icon' THEN (p_data->>'Icon') ELSE "Icon" END,
        "ScopeDefault" = CASE WHEN p_data ? 'ScopeDefault' THEN (p_data->>'ScopeDefault') ELSE "ScopeDefault" END,
        "RowsToPackWithSchema" = CASE WHEN p_data ? 'RowsToPackWithSchema' THEN (p_data->>'RowsToPackWithSchema') ELSE "RowsToPackWithSchema" END,
        "RowsToPackSampleMethod" = CASE WHEN p_data ? 'RowsToPackSampleMethod' THEN (p_data->>'RowsToPackSampleMethod') ELSE "RowsToPackSampleMethod" END,
        "RowsToPackSampleCount" = CASE WHEN p_data ? 'RowsToPackSampleCount' THEN (p_data->>'RowsToPackSampleCount')::INT ELSE "RowsToPackSampleCount" END,
        "RowsToPackSampleOrder" = CASE WHEN p_data ? 'RowsToPackSampleOrder' THEN (p_data->>'RowsToPackSampleOrder') ELSE "RowsToPackSampleOrder" END,
        "AutoRowCountFrequency" = CASE WHEN p_data ? 'AutoRowCountFrequency' THEN (p_data->>'AutoRowCountFrequency')::INT ELSE "AutoRowCountFrequency" END,
        "RowCount" = CASE WHEN p_data ? 'RowCount' THEN (p_data->>'RowCount')::BIGINT ELSE "RowCount" END,
        "RowCountRunAt" = CASE WHEN p_data ? 'RowCountRunAt' THEN (p_data->>'RowCountRunAt')::TIMESTAMPTZ ELSE "RowCountRunAt" END,
        "Status" = CASE WHEN p_data ? 'Status' THEN (p_data->>'Status') ELSE "Status" END,
        "DisplayName" = CASE WHEN p_data ? 'DisplayName' THEN (p_data->>'DisplayName') ELSE "DisplayName" END,
        "AllowMultipleSubtypes" = CASE WHEN p_data ? 'AllowMultipleSubtypes' THEN (p_data->>'AllowMultipleSubtypes')::BOOLEAN ELSE "AllowMultipleSubtypes" END,
        "AutoUpdateFullTextSearch" = CASE WHEN p_data ? 'AutoUpdateFullTextSearch' THEN (p_data->>'AutoUpdateFullTextSearch')::BOOLEAN ELSE "AutoUpdateFullTextSearch" END,
        "AutoUpdateAllowUserSearchAPI" = CASE WHEN p_data ? 'AutoUpdateAllowUserSearchAPI' THEN (p_data->>'AutoUpdateAllowUserSearchAPI')::BOOLEAN ELSE "AutoUpdateAllowUserSearchAPI" END,
        "TrustServerCacheCompletely" = CASE WHEN p_data ? 'TrustServerCacheCompletely' THEN (p_data->>'TrustServerCacheCompletely')::BOOLEAN ELSE "TrustServerCacheCompletely" END,
        "SupportsGeoCoding" = CASE WHEN p_data ? 'SupportsGeoCoding' THEN (p_data->>'SupportsGeoCoding')::BOOLEAN ELSE "SupportsGeoCoding" END,
        "AutoUpdateSupportsGeoCoding" = CASE WHEN p_data ? 'AutoUpdateSupportsGeoCoding' THEN (p_data->>'AutoUpdateSupportsGeoCoding')::BOOLEAN ELSE "AutoUpdateSupportsGeoCoding" END,
        "AllowCaching" = CASE WHEN p_data ? 'AllowCaching' THEN (p_data->>'AllowCaching')::BOOLEAN ELSE "AllowCaching" END,
        "DetectExternalChanges" = CASE WHEN p_data ? 'DetectExternalChanges' THEN (p_data->>'DetectExternalChanges')::BOOLEAN ELSE "DetectExternalChanges" END,
        "GeneratedBaseViewName" = CASE WHEN p_data ? 'GeneratedBaseViewName' THEN (p_data->>'GeneratedBaseViewName') ELSE "GeneratedBaseViewName" END,
        "AllowDirectSQLInsert" = CASE WHEN p_data ? 'AllowDirectSQLInsert' THEN (p_data->>'AllowDirectSQLInsert')::BOOLEAN ELSE "AllowDirectSQLInsert" END,
        "AllowDirectSQLUpdate" = CASE WHEN p_data ? 'AllowDirectSQLUpdate' THEN (p_data->>'AllowDirectSQLUpdate')::BOOLEAN ELSE "AllowDirectSQLUpdate" END,
        "AllowDirectSQLDelete" = CASE WHEN p_data ? 'AllowDirectSQLDelete' THEN (p_data->>'AllowDirectSQLDelete')::BOOLEAN ELSE "AllowDirectSQLDelete" END,
        "Configuration" = CASE WHEN p_data ? 'Configuration' THEN (p_data->>'Configuration') ELSE "Configuration" END,
        "SubtypeSelector" = CASE WHEN p_data ? 'SubtypeSelector' THEN (p_data->>'SubtypeSelector') ELSE "SubtypeSelector" END,
        "EnableFieldLevelSecurity" = CASE WHEN p_data ? 'EnableFieldLevelSecurity' THEN (p_data->>'EnableFieldLevelSecurity')::BOOLEAN ELSE "EnableFieldLevelSecurity" END,
        "__mj_UpdatedAt" = NOW()
    WHERE
        "ID" = v_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwEntities"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntity" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Entity table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_entity"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_entity" ON "__mj"."Entity";

CREATE TRIGGER "trg_update_entity"
BEFORE UPDATE ON "__mj"."Entity"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_entity"();



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

CREATE OR REPLACE FUNCTION "__mj"."spDeleteEntity"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."Entity"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntity" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Field Permissions
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_field_permission_entity_field_id"
    ON "__mj"."EntityFieldPermission" ("EntityFieldID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_field_permission_role_id"
    ON "__mj"."EntityFieldPermission" ("RoleID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Field Permissions
-- Item: vwEntityFieldPermissions
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Field Permissions
-----               SCHEMA:      __mj
-----               BASE TABLE:  EntityFieldPermission
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwEntityFieldPermissions"
AS
SELECT
    e.*,
    MJEntityField_EntityFieldID."Name" AS "EntityField",
    MJRole_RoleID."Name" AS "Role"
FROM
    "__mj"."EntityFieldPermission" AS e
INNER JOIN
    "__mj"."EntityField" AS MJEntityField_EntityFieldID
  ON
    "e"."EntityFieldID" = MJEntityField_EntityFieldID."ID"
INNER JOIN
    "__mj"."Role" AS MJRole_RoleID
  ON
    "e"."RoleID" = MJRole_RoleID."ID"
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
    AND tc.relname = 'vwEntityFieldPermissions'
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
    AND tc.relname = 'vwEntityFieldPermissions'
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
        AND tc.relname = 'vwEntityFieldPermissions'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS "__mj"."vwEntityFieldPermissions" CASCADE;
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
GRANT SELECT ON "__mj"."vwEntityFieldPermissions" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwEntityFieldPermissions" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwEntityFieldPermissions" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Field Permissions
-- Item: spCreateEntityFieldPermission
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR EntityFieldPermission
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntityFieldPermission'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateEntityFieldPermission"(
    p_id UUID DEFAULT NULL,
    p_entityfieldid UUID DEFAULT NULL,
    p_roleid UUID DEFAULT NULL,
    p_readaccess varchar(20) DEFAULT NULL,
    p_updateaccess varchar(20) DEFAULT NULL,
    p_createaccess varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityFieldPermissions" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."EntityFieldPermission"
        (
            "ID",
            "EntityFieldID",
                "RoleID",
                "ReadAccess",
                "UpdateAccess",
                "CreateAccess"
        )
    VALUES
        (
            v_new_id,
            p_entityfieldid,
                p_roleid,
                COALESCE(p_readaccess, 'No Access'),
                COALESCE(p_updateaccess, 'No Access'),
                COALESCE(p_createaccess, 'No Access')
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityFieldPermissions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityFieldPermission" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityFieldPermission" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Field Permissions
-- Item: spUpdateEntityFieldPermission
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR EntityFieldPermission
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntityFieldPermission'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateEntityFieldPermission"(
    p_id UUID,
    p_entityfieldid UUID DEFAULT NULL,
    p_roleid UUID DEFAULT NULL,
    p_readaccess varchar(20) DEFAULT NULL,
    p_updateaccess varchar(20) DEFAULT NULL,
    p_createaccess varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityFieldPermissions" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."EntityFieldPermission"
    SET
        "EntityFieldID" = COALESCE(p_entityfieldid, "EntityFieldID"),
        "RoleID" = COALESCE(p_roleid, "RoleID"),
        "ReadAccess" = COALESCE(p_readaccess, "ReadAccess"),
        "UpdateAccess" = COALESCE(p_updateaccess, "UpdateAccess"),
        "CreateAccess" = COALESCE(p_createaccess, "CreateAccess")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityFieldPermissions"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityFieldPermission" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityFieldPermission" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityFieldPermission table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_entity_field_permission"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_entity_field_permission" ON "__mj"."EntityFieldPermission";

CREATE TRIGGER "trg_update_entity_field_permission"
BEFORE UPDATE ON "__mj"."EntityFieldPermission"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_entity_field_permission"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Field Permissions
-- Item: spDeleteEntityFieldPermission
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR EntityFieldPermission
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteEntityFieldPermission'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteEntityFieldPermission"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."EntityFieldPermission"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityFieldPermission" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityFieldPermission" TO "cdp_Integration";
