-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610051244__v6.2.x__Entity_Form_Contributions.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* ============================================================================
   MJ: Entity Form Contributions — metadata-registered form contributions

   One row mounts a `componentRole: 'form-panel'` Component (Type='Widget') on a
   parent entity's form. It draws at a slot, inside a section, or in the place of
   what it claims: one or several baked sections, a rail tab, a set of fields or a
   related grid. Peer of compiled BaseFormPanel registrations: the same composer,
   chrome layers and MJ: Form Chrome Rules apply.

   CodeGen handles automatically (intentionally omitted):
     - __mj_CreatedAt / __mj_UpdatedAt columns + triggers
     - Foreign-key indexes (IDX_AUTO_MJ_FKEY_*)
     - Entity / EntityField metadata ("MJ: Entity Form Contributions")
   ============================================================================ */
CREATE TABLE __mj."EntityFormContribution" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "EntityID" UUID NOT NULL,
  "ComponentID" UUID NOT NULL,
  "Name" VARCHAR(255) NOT NULL,
  "Description" TEXT NULL,
  "Slot" VARCHAR(30) NOT NULL DEFAULT 'after-fields',
  "SortKey" INT NOT NULL DEFAULT 0,
  "ContributionKey" VARCHAR(256) NULL,
  "RelatedEntityID" UUID NULL,
  "RelatedJoinField" VARCHAR(255) NULL,
  "ReplacesSectionKey" VARCHAR(255) NULL,
  "ReplacesSectionKeys" TEXT NULL,
  "ReplacesFieldNames" TEXT NULL,
  "InSectionKey" VARCHAR(255) NULL,
  "SectionPosition" VARCHAR(10) NULL,
  "Inclusion" VARCHAR(10) NULL,
  "ChromeGroup" VARCHAR(10) NULL,
  "Presentation" VARCHAR(10) NOT NULL DEFAULT 'panel',
  "Title" VARCHAR(255) NULL,
  "Icon" VARCHAR(100) NULL,
  "Scope" VARCHAR(20) NOT NULL DEFAULT 'User',
  "UserID" UUID NULL,
  "RoleID" UUID NULL,
  "Precedence" INT NOT NULL DEFAULT 0,
  "Status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
  "Configuration" TEXT NULL,
  "Notes" TEXT NULL,
  CONSTRAINT "PK_EntityFormContribution" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_EntityFormContribution_Entity" FOREIGN KEY ("EntityID") REFERENCES __mj."Entity" (
    "ID"
  ),
  CONSTRAINT "FK_EntityFormContribution_Component" FOREIGN KEY ("ComponentID") REFERENCES __mj."Component" (
    "ID"
  ),
  CONSTRAINT "FK_EntityFormContribution_RelatedEntity" FOREIGN KEY ("RelatedEntityID") REFERENCES __mj."Entity" (
    "ID"
  ),
  CONSTRAINT "FK_EntityFormContribution_User" FOREIGN KEY ("UserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "FK_EntityFormContribution_Role" FOREIGN KEY ("RoleID") REFERENCES __mj."Role" (
    "ID"
  ),
  CONSTRAINT "CK_EntityFormContribution_Slot" CHECK ("Slot" IN ('top-area', 'before-fields', 'after-fields', 'after-related', 'after-everything')),
  CONSTRAINT "CK_EntityFormContribution_Inclusion" CHECK ("Inclusion" IS NULL OR "Inclusion" IN ('Primary', 'More', 'None')),
  CONSTRAINT "CK_EntityFormContribution_ChromeGroup" CHECK ("ChromeGroup" IS NULL OR "ChromeGroup" IN ('details', 'more')),
  CONSTRAINT "CK_EntityFormContribution_Presentation" CHECK ("Presentation" IN ('panel', 'bare')),
  CONSTRAINT "CK_EntityFormContribution_Scope" CHECK ("Scope" IN ('User', 'Role', 'Global')),
  CONSTRAINT "CK_EntityFormContribution_ScopeShape" CHECK ((
    "Scope" = 'User' AND NOT "UserID" IS NULL AND "RoleID" IS NULL
  )
  OR (
    "Scope" = 'Role' AND NOT "RoleID" IS NULL AND "UserID" IS NULL
  )
  OR (
    "Scope" = 'Global' AND "UserID" IS NULL AND "RoleID" IS NULL
  )),
  CONSTRAINT "CK_EntityFormContribution_Status" CHECK ("Status" IN ('Active', 'Inactive', 'Pending')),
  CONSTRAINT "CK_EntityFormContribution_BareNoChrome" CHECK ("Presentation" <> 'bare' OR (
    "Inclusion" IS NULL AND "ChromeGroup" IS NULL
  )),
  CONSTRAINT "CK_EntityFormContribution_JoinNeedsRelated" CHECK ("RelatedJoinField" IS NULL OR NOT "RelatedEntityID" IS NULL),
  CONSTRAINT "CK_EntityFormContribution_OneClaim" CHECK ((
    CASE WHEN "ReplacesSectionKey" IS NULL THEN 0 ELSE 1 END
  ) + (
    CASE WHEN "RelatedEntityID" IS NULL THEN 0 ELSE 1 END
  ) + (
    CASE WHEN "ReplacesFieldNames" IS NULL THEN 0 ELSE 1 END
  ) + (
    CASE WHEN "ReplacesSectionKeys" IS NULL THEN 0 ELSE 1 END
  ) + (
    CASE WHEN "InSectionKey" IS NULL THEN 0 ELSE 1 END
  ) <= 1),
  CONSTRAINT "CK_EntityFormContribution_SectionPosition" CHECK ("SectionPosition" IS NULL OR "SectionPosition" IN ('start', 'end')),
  CONSTRAINT "CK_EntityFormContribution_SectionPositionNeedsSection" CHECK ("SectionPosition" IS NULL
  OR NOT "ReplacesFieldNames" IS NULL
  OR NOT "InSectionKey" IS NULL)
);

CREATE UNIQUE INDEX "UQ_EntityFormContribution_Key" ON __mj."EntityFormContribution"("EntityID", "ContributionKey", "Scope", "UserID", "RoleID")
WHERE
  NOT "ContributionKey" IS NULL AND "Status" = 'Active';

/* Keyless related claims derive `related:<entity>:<join>` at runtime, so the index above */
/* (ContributionKey IS NOT NULL) does not see them. Without this one, two Active rows can */
/* claim the same grid and the winner is decided by row order. */
CREATE UNIQUE INDEX "UQ_EntityFormContribution_RelatedClaim" ON __mj."EntityFormContribution"("EntityID", "RelatedEntityID", "RelatedJoinField", "Scope", "UserID", "RoleID")
WHERE
  "ContributionKey" IS NULL
  AND NOT "RelatedEntityID" IS NULL
  AND "Status" = 'Active';

COMMENT ON TABLE __mj."EntityFormContribution" IS 'Metadata-registered form contribution: mounts a form-panel Component on a parent entity''s form at a slot or inside a section, optionally standing in for baked sections, a rail tab, a set of fields or a related grid. Peer of compiled BaseFormPanel registrations.';

COMMENT ON COLUMN __mj."EntityFormContribution"."EntityID" IS 'Parent form entity the panel mounts on.';

COMMENT ON COLUMN __mj."EntityFormContribution"."ComponentID" IS 'MJ: Components row (Type=Widget) whose Specification declares componentRole=form-panel.';

COMMENT ON COLUMN __mj."EntityFormContribution"."Slot" IS 'Slot inside the generated form: top-area, before-fields, after-fields, after-related, after-everything.';

COMMENT ON COLUMN __mj."EntityFormContribution"."SortKey" IS 'Order among panels drawn in the same place; higher renders earlier.';

COMMENT ON COLUMN __mj."EntityFormContribution"."ContributionKey" IS 'Last-wins identity shared with compiled registrations and MJ: Form Chrome Rules. Null derives related:<entity>:<join> for related claims, otherwise the row never collapses.';

COMMENT ON COLUMN __mj."EntityFormContribution"."RelatedEntityID" IS 'When set, this panel replaces the related-entity grid for that relationship on the parent form.';

COMMENT ON COLUMN __mj."EntityFormContribution"."RelatedJoinField" IS 'Disambiguates two FKs to the same related entity (BillToPersonID vs ShipToPersonID).';

COMMENT ON COLUMN __mj."EntityFormContribution"."ReplacesSectionKey" IS 'Section key of one baked block, or rail key of one tab, this contribution stands in for. The panel draws in its place. Mutually exclusive with every other claim.';

COMMENT ON COLUMN __mj."EntityFormContribution"."ReplacesSectionKeys" IS 'JSON array of section keys this contribution stands in for, all within one tab. The panel draws in the place of the first of them and the others are not drawn. Mutually exclusive with every other claim.';

COMMENT ON COLUMN __mj."EntityFormContribution"."ReplacesFieldNames" IS 'JSON array of field names this contribution stands in for, all within one section. The panel draws inside that section, at SectionPosition, and the named fields are not drawn. Mutually exclusive with every other claim.';

COMMENT ON COLUMN __mj."EntityFormContribution"."InSectionKey" IS 'Section key of a section this contribution draws inside, replacing nothing. SectionPosition says whether it draws at the start or the end. Mutually exclusive with every other claim.';

COMMENT ON COLUMN __mj."EntityFormContribution"."SectionPosition" IS 'Where inside its section the panel draws: start or end. Applies to InSectionKey and to a ReplacesFieldNames claim; null means start.';

COMMENT ON COLUMN __mj."EntityFormContribution"."Inclusion" IS 'L1 chrome inclusion: Primary (own rail item), More (folder), None (hidden). Null = default rail behavior.';

COMMENT ON COLUMN __mj."EntityFormContribution"."ChromeGroup" IS 'Pin to the details or more chrome bucket instead of an own rail item.';

COMMENT ON COLUMN __mj."EntityFormContribution"."Presentation" IS 'panel = wrapped in a collapsible section with header; bare = hero strip with no chrome and no rail item.';

COMMENT ON COLUMN __mj."EntityFormContribution"."Title" IS 'Section header and rail label. Null falls back to Name.';

COMMENT ON COLUMN __mj."EntityFormContribution"."Icon" IS 'Font Awesome class for the section header and rail item.';

COMMENT ON COLUMN __mj."EntityFormContribution"."Scope" IS 'Who sees the contribution: User (UserID), Role (RoleID) or Global.';

COMMENT ON COLUMN __mj."EntityFormContribution"."Precedence" IS 'Last-wins precedence against compiled registrations sharing ContributionKey. Ties go to the compiled registration; a row wins only when strictly higher.';

COMMENT ON COLUMN __mj."EntityFormContribution"."Status" IS 'Active rows render. Pending rows are drafts awaiting activation. Inactive rows are history.';

COMMENT ON COLUMN __mj."EntityFormContribution"."Configuration" IS 'JSON passed to the component as contribution.configuration so one component can serve several rows.';

COMMENT ON COLUMN __mj."EntityFormContribution"."Notes" IS 'Free-form authoring notes; agents append an iteration log here.';

/* *************************************************************************************************
 * EVERYTHING BELOW THIS LINE WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL.
 *
 * Entity and field metadata for MJ: Entity Form Contributions, its value lists, field categories,
 * AI-generated validators, foreign-key indexes, vwEntityFormContributions, the spCreate / spUpdate /
 * spDelete procedures and their permission grants.
 *
 * DO NOT EDIT BY HAND. If the hand-written DDL above changes, re-run CodeGen and replace this entire
 * section with the fresh output.
 ************************************************************************************************* */
/* SQL generated to create new entity MJ: Entity Form Contributions */
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
    '139ab3b7-c1ab-49bd-a473-47d45a962578',
    'MJ: Entity Form Contributions',
    'Entity Form Contributions',
    'Metadata-registered form contribution: mounts a form-panel Component on a parent entity''s form at a slot or inside a section, optionally standing in for baked sections, a rail tab, a set of fields or a related grid. Peer of compiled BaseFormPanel registrations.',
    NULL,
    'EntityFormContribution',
    'vwEntityFormContributions',
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
/* SQL generated to add new entity MJ: Entity Form Contributions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '139ab3b7-c1ab-49bd-a473-47d45a962578',
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
/* SQL generated to add new permission for entity MJ: Entity Form Contributions for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('139ab3b7-c1ab-49bd-a473-47d45a962578' AS UUID),
  CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  FALSE,
  FALSE,
  FALSE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('139ab3b7-c1ab-49bd-a473-47d45a962578' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Entity Form Contributions for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('139ab3b7-c1ab-49bd-a473-47d45a962578' AS UUID),
  CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('139ab3b7-c1ab-49bd-a473-47d45a962578' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Entity Form Contributions for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "Type",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
SELECT
  CAST('139ab3b7-c1ab-49bd-a473-47d45a962578' AS UUID),
  CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID),
  'Allow',
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NOW()
WHERE
  NOT EXISTS(
    SELECT
      1
    FROM __mj."EntityPermission"
    WHERE
      "EntityID" = CAST('139ab3b7-c1ab-49bd-a473-47d45a962578' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
ALTER TABLE __mj."EntityFormContribution"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.EntityFormContribution */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.EntityFormContribution */
UPDATE __mj."EntityFormContribution" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'EntityFormContribution' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."EntityFormContribution" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."EntityFormContribution" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."EntityFormContribution"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.EntityFormContribution */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.EntityFormContribution */
UPDATE __mj."EntityFormContribution" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'EntityFormContribution' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."EntityFormContribution" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."EntityFormContribution" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '17fd3305-b65b-416b-a5c7-fc26047c1df5' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('17fd3305-b65b-416b-a5c7-fc26047c1df5', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '69fca6df-29f3-4c0d-80ab-3322a4118287' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'EntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('69fca6df-29f3-4c0d-80ab-3322a4118287', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'EntityID', 'Entity ID', 'Parent form entity the panel mounts on.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1dcf744d-1a04-4d80-9d09-541e7c39c9cc' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'ComponentID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1dcf744d-1a04-4d80-9d09-541e7c39c9cc', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'ComponentID', 'Component ID', 'MJ: Components row (Type=Widget) whose Specification declares componentRole=form-panel.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '0FB98A1D-C6AE-4427-B66C-7B31E669756F', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '928676b2-9e5e-4ad9-968a-2c1a1228c992' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('928676b2-9e5e-4ad9-968a-2c1a1228c992', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'Name', 'Name', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'afee789b-d246-4c62-bbdd-d1be0b95751a' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('afee789b-d246-4c62-bbdd-d1be0b95751a', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'Description', 'Description', NULL, 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8afb7d87-e209-4ada-98a2-0743c5906aad' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'Slot')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8afb7d87-e209-4ada-98a2-0743c5906aad', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'Slot', 'Slot', 'Slot inside the generated form: top-area, before-fields, after-fields, after-related, after-everything.', 'nvarchar', 60, 0, 0, FALSE, 'after-fields', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '189d2cbd-0ae2-4477-839d-1349118074f9' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'SortKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('189d2cbd-0ae2-4477-839d-1349118074f9', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'SortKey', 'Sort Key', 'Order among panels drawn in the same place; higher renders earlier.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cf2f27ff-0af5-452a-b390-ea7bce43fb81' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'ContributionKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cf2f27ff-0af5-452a-b390-ea7bce43fb81', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'ContributionKey', 'Contribution Key', 'Last-wins identity shared with compiled registrations and MJ: Form Chrome Rules. Null derives related:<entity>:<join> for related claims, otherwise the row never collapses.', 'nvarchar', 512, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fd7e1b49-aad6-4ef7-8b4f-552a133d859f' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'RelatedEntityID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fd7e1b49-aad6-4ef7-8b4f-552a133d859f', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'RelatedEntityID', 'Related Entity ID', 'When set, this panel replaces the related-entity grid for that relationship on the parent form.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3deebc53-7763-43c2-b432-cb7e7537c067' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'RelatedJoinField')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3deebc53-7763-43c2-b432-cb7e7537c067', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'RelatedJoinField', 'Related Join Field', 'Disambiguates two FKs to the same related entity (BillToPersonID vs ShipToPersonID).', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '46f2f4b1-c1b0-4f8e-990f-c70b8f8390d8' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'ReplacesSectionKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('46f2f4b1-c1b0-4f8e-990f-c70b8f8390d8', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'ReplacesSectionKey', 'Replaces Section Key', 'Section key of one baked block, or rail key of one tab, this contribution stands in for. The panel draws in its place. Mutually exclusive with every other claim.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '28351f96-9d9b-4037-9ed0-239e6850614a' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'ReplacesSectionKeys')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('28351f96-9d9b-4037-9ed0-239e6850614a', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'ReplacesSectionKeys', 'Replaces Section Keys', 'JSON array of section keys this contribution stands in for, all within one tab. The panel draws in the place of the first of them and the others are not drawn. Mutually exclusive with every other claim.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4000b0d2-dbcd-45be-8367-2537f2b9f6a4' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'ReplacesFieldNames')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4000b0d2-dbcd-45be-8367-2537f2b9f6a4', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'ReplacesFieldNames', 'Replaces Field Names', 'JSON array of field names this contribution stands in for, all within one section. The panel draws inside that section, at SectionPosition, and the named fields are not drawn. Mutually exclusive with every other claim.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2e2a6623-6759-4b68-9b56-874b744e8bbe' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'InSectionKey')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2e2a6623-6759-4b68-9b56-874b744e8bbe', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'InSectionKey', 'In Section Key', 'Section key of a section this contribution draws inside, replacing nothing. SectionPosition says whether it draws at the start or the end. Mutually exclusive with every other claim.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cf73cd22-fa9a-494e-8fcc-5411d0efb1a2' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'SectionPosition')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cf73cd22-fa9a-494e-8fcc-5411d0efb1a2', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'SectionPosition', 'Section Position', 'Where inside its section the panel draws: start or end. Applies to InSectionKey and to a ReplacesFieldNames claim; null means start.', 'nvarchar', 20, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4e737863-e486-478c-8d5a-f0f1b74855cc' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'Inclusion')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4e737863-e486-478c-8d5a-f0f1b74855cc', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'Inclusion', 'Inclusion', 'L1 chrome inclusion: Primary (own rail item), More (folder), None (hidden). Null = default rail behavior.', 'nvarchar', 20, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '41d1a5e5-7c6b-40d2-acca-0b083120ab22' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'ChromeGroup')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('41d1a5e5-7c6b-40d2-acca-0b083120ab22', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'ChromeGroup', 'Chrome Group', 'Pin to the details or more chrome bucket instead of an own rail item.', 'nvarchar', 20, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f3f6eeed-0971-467a-8c17-df4b771b2d44' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'Presentation')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f3f6eeed-0971-467a-8c17-df4b771b2d44', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'Presentation', 'Presentation', 'panel = wrapped in a collapsible section with header; bare = hero strip with no chrome and no rail item.', 'nvarchar', 20, 0, 0, FALSE, 'panel', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3fe33932-e90a-4937-8f79-e06a9c2eeb32' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'Title')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3fe33932-e90a-4937-8f79-e06a9c2eeb32', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'Title', 'Title', 'Section header and rail label. Null falls back to Name.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4e9a8f05-a588-4717-b6e2-c9d93f3b45cc' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'Icon')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4e9a8f05-a588-4717-b6e2-c9d93f3b45cc', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'Icon', 'Icon', 'Font Awesome class for the section header and rail item.', 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '058c54dd-6a76-4aec-ab76-33755b4392b4' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'Scope')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('058c54dd-6a76-4aec-ab76-33755b4392b4', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'Scope', 'Scope', 'Who sees the contribution: User (UserID), Role (RoleID) or Global.', 'nvarchar', 40, 0, 0, FALSE, 'User', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2988e27c-6545-4c38-a9df-7e526f200e48' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'UserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2988e27c-6545-4c38-a9df-7e526f200e48', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'UserID', 'User ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c044722c-69a2-4735-a5af-eea3a2801e84' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'RoleID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c044722c-69a2-4735-a5af-eea3a2801e84', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'RoleID', 'Role ID', NULL, 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'DA238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '160585ff-9839-4174-bdd7-069a8c97fe36' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'Precedence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('160585ff-9839-4174-bdd7-069a8c97fe36', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'Precedence', 'Precedence', 'Last-wins precedence against compiled registrations sharing ContributionKey. Ties go to the compiled registration; a row wins only when strictly higher.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '228ec6cb-548c-4a7b-98bf-a0cea8ef223c' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('228ec6cb-548c-4a7b-98bf-a0cea8ef223c', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'Status', 'Status', 'Active rows render. Pending rows are drafts awaiting activation. Inactive rows are history.', 'nvarchar', 40, 0, 0, FALSE, 'Pending', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '18f46076-91c5-448c-8987-e08a8609e050' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'Configuration')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('18f46076-91c5-448c-8987-e08a8609e050', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'Configuration', 'Configuration', 'JSON passed to the component as contribution.configuration so one component can serve several rows.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b629edfa-30e5-49ec-be46-0029cff32364' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'Notes')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b629edfa-30e5-49ec-be46-0029cff32364', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'Notes', 'Notes', 'Free-form authoring notes; agents append an iteration log here.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f7c5c0fe-b8bb-4fd5-9280-d48f7b361285' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f7c5c0fe-b8bb-4fd5-9280-d48f7b361285', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6e54e325-6cd8-4910-926a-ea4270de3197' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6e54e325-6cd8-4910-926a-ea4270de3197', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID ece45e48-45e9-45c7-8ae4-ca62b510e328 */
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
    'ece45e48-45e9-45c7-8ae4-ca62b510e328',
    '8AFB7D87-E209-4ADA-98A2-0743C5906AAD',
    1,
    'after-everything',
    'after-everything',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID a6234aad-4370-4871-9e0f-e578ff12008d */
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
    'a6234aad-4370-4871-9e0f-e578ff12008d',
    '8AFB7D87-E209-4ADA-98A2-0743C5906AAD',
    2,
    'after-fields',
    'after-fields',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 7b1aa439-087b-49d8-93a0-376256eb2a49 */
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
    '7b1aa439-087b-49d8-93a0-376256eb2a49',
    '8AFB7D87-E209-4ADA-98A2-0743C5906AAD',
    3,
    'after-related',
    'after-related',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID b39095ea-e272-46a4-a3f0-8ee8c094b4c1 */
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
    'b39095ea-e272-46a4-a3f0-8ee8c094b4c1',
    '8AFB7D87-E209-4ADA-98A2-0743C5906AAD',
    4,
    'before-fields',
    'before-fields',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 0e35aa06-e095-4443-b355-cef084cd20c5 */
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
    '0e35aa06-e095-4443-b355-cef084cd20c5',
    '8AFB7D87-E209-4ADA-98A2-0743C5906AAD',
    5,
    'top-area',
    'top-area',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 8AFB7D87-E209-4ADA-98A2-0743C5906AAD */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '8AFB7D87-E209-4ADA-98A2-0743C5906AAD';
/* SQL text to insert entity field value with ID 90627987-cc03-486a-b915-1eaf20bf775b */
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
    '90627987-cc03-486a-b915-1eaf20bf775b',
    '4E737863-E486-478C-8D5A-F0F1B74855CC',
    1,
    'More',
    'More',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 5938352c-6bfb-4add-9aff-fe537c975cd5 */
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
    '5938352c-6bfb-4add-9aff-fe537c975cd5',
    '4E737863-E486-478C-8D5A-F0F1B74855CC',
    2,
    'None',
    'None',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 16cacfac-dcc8-4e3a-bfcd-0fcad93c9e3c */
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
    '16cacfac-dcc8-4e3a-bfcd-0fcad93c9e3c',
    '4E737863-E486-478C-8D5A-F0F1B74855CC',
    3,
    'Primary',
    'Primary',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 4E737863-E486-478C-8D5A-F0F1B74855CC */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '4E737863-E486-478C-8D5A-F0F1B74855CC';
/* SQL text to insert entity field value with ID 9d593f4c-c07d-4538-aaf9-2be046e7c852 */
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
    '9d593f4c-c07d-4538-aaf9-2be046e7c852',
    '41D1A5E5-7C6B-40D2-ACCA-0B083120AB22',
    1,
    'details',
    'details',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 4c4d0110-aabe-4ccf-a208-e0f84c304205 */
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
    '4c4d0110-aabe-4ccf-a208-e0f84c304205',
    '41D1A5E5-7C6B-40D2-ACCA-0B083120AB22',
    2,
    'more',
    'more',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 41D1A5E5-7C6B-40D2-ACCA-0B083120AB22 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '41D1A5E5-7C6B-40D2-ACCA-0B083120AB22';
/* SQL text to insert entity field value with ID b24ecd17-8321-4581-b5c3-961e486e08a0 */
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
    'b24ecd17-8321-4581-b5c3-961e486e08a0',
    'F3F6EEED-0971-467A-8C17-DF4B771B2D44',
    1,
    'bare',
    'bare',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 0031b77b-092a-40b2-95fb-44a4565dd34a */
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
    '0031b77b-092a-40b2-95fb-44a4565dd34a',
    'F3F6EEED-0971-467A-8C17-DF4B771B2D44',
    2,
    'panel',
    'panel',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID F3F6EEED-0971-467A-8C17-DF4B771B2D44 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'F3F6EEED-0971-467A-8C17-DF4B771B2D44';
/* SQL text to insert entity field value with ID aa60690c-4ecc-47dd-8c06-d1ee581b4701 */
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
    'aa60690c-4ecc-47dd-8c06-d1ee581b4701',
    '058C54DD-6A76-4AEC-AB76-33755B4392B4',
    1,
    'Global',
    'Global',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 0de5be8a-f9f9-47e8-9702-0dba85213ce0 */
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
    '0de5be8a-f9f9-47e8-9702-0dba85213ce0',
    '058C54DD-6A76-4AEC-AB76-33755B4392B4',
    2,
    'Role',
    'Role',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 9ba4603d-470a-48fe-a5fa-3421f0ad1a69 */
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
    '9ba4603d-470a-48fe-a5fa-3421f0ad1a69',
    '058C54DD-6A76-4AEC-AB76-33755B4392B4',
    3,
    'User',
    'User',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 058C54DD-6A76-4AEC-AB76-33755B4392B4 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '058C54DD-6A76-4AEC-AB76-33755B4392B4';
/* SQL text to insert entity field value with ID bb89b16a-af26-4c7f-93a8-7baf4219a95d */
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
    'bb89b16a-af26-4c7f-93a8-7baf4219a95d',
    '228EC6CB-548C-4A7B-98BF-A0CEA8EF223C',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 4c859037-62a4-46e3-9e55-59e998521307 */
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
    '4c859037-62a4-46e3-9e55-59e998521307',
    '228EC6CB-548C-4A7B-98BF-A0CEA8EF223C',
    2,
    'Inactive',
    'Inactive',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 98840feb-0487-416a-ad9f-c56be20f0637 */
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
    '98840feb-0487-416a-ad9f-c56be20f0637',
    '228EC6CB-548C-4A7B-98BF-A0CEA8EF223C',
    3,
    'Pending',
    'Pending',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 228EC6CB-548C-4A7B-98BF-A0CEA8EF223C */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '228EC6CB-548C-4A7B-98BF-A0CEA8EF223C';
/* SQL text to insert entity field value with ID 1c748b3c-2235-4388-b83f-7b94f2f9a69e */
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
    '1c748b3c-2235-4388-b83f-7b94f2f9a69e',
    'CF73CD22-FA9A-494E-8FCC-5411D0EFB1A2',
    1,
    'end',
    'end',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID cfc33d84-385c-4079-9c90-7d1ad75b2e52 */
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
    'cfc33d84-385c-4079-9c90-7d1ad75b2e52',
    'CF73CD22-FA9A-494E-8FCC-5411D0EFB1A2',
    2,
    'start',
    'start',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID CF73CD22-FA9A-494E-8FCC-5411D0EFB1A2 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'CF73CD22-FA9A-494E-8FCC-5411D0EFB1A2';
/* Create Entity Relationship: MJ: Roles -> MJ: Entity Form Contributions (One To Many via RoleID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '97ff9621-3bc7-424e-ba3b-e35f38d20c0b') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('97ff9621-3bc7-424e-ba3b-e35f38d20c0b', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', '139AB3B7-C1AB-49BD-A473-47D45A962578', 'RoleID', 'One To Many', TRUE, TRUE, 18, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'ec59d16b-b7b7-4fac-99b4-a26692646d64') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ec59d16b-b7b7-4fac-99b4-a26692646d64', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '139AB3B7-C1AB-49BD-A473-47D45A962578', 'EntityID', 'One To Many', TRUE, TRUE, 80, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '419a9802-44d2-401b-ae3a-dc8a897cb22a') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('419a9802-44d2-401b-ae3a-dc8a897cb22a', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '139AB3B7-C1AB-49BD-A473-47D45A962578', 'RelatedEntityID', 'One To Many', TRUE, TRUE, 81, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '2f756edd-f8e9-418d-ae18-c3be44ac2ae4') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2f756edd-f8e9-418d-ae18-c3be44ac2ae4', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '139AB3B7-C1AB-49BD-A473-47D45A962578', 'UserID', 'One To Many', TRUE, TRUE, 108, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'e946da3d-f113-4d16-bbc6-0a1beb92792e') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e946da3d-f113-4d16-bbc6-0a1beb92792e', '0FB98A1D-C6AE-4427-B66C-7B31E669756F', '139AB3B7-C1AB-49BD-A473-47D45A962578', 'ComponentID', 'One To Many', TRUE, TRUE, 5, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd5f2ad37-ecbd-4611-a8b6-8c980482fe70' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'Entity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d5f2ad37-ecbd-4611-a8b6-8c980482fe70', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'Entity', 'Entity', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '49c265e7-9707-438e-bb18-c4d12c116c5f' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'Component')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('49c265e7-9707-438e-bb18-c4d12c116c5f', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'Component', 'Component', NULL, 'nvarchar', 1000, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8b74c5cc-1418-404e-bcef-66489ea04456' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'RelatedEntity')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8b74c5cc-1418-404e-bcef-66489ea04456', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'RelatedEntity', 'Related Entity', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd73c4665-7ba9-4f67-8293-a0250ea8bd79' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'User')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d73c4665-7ba9-4f67-8293-a0250ea8bd79', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'User', 'User', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd35ffe16-f1f2-4f3f-b7bb-6e1a66dfb073' OR ("EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'Role')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d35ffe16-f1f2-4f3f-b7bb-6e1a66dfb073', '139AB3B7-C1AB-49BD-A473-47D45A962578' /* Entity: MJ: Entity Form Contributions */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'), 'Role', 'Role', NULL, 'nvarchar', 100, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '8AFB7D87-E209-4ADA-98A2-0743C5906AAD'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '228EC6CB-548C-4A7B-98BF-A0CEA8EF223C'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = 'D5F2AD37-ECBD-4611-A8B6-8C980482FE70'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '49C265E7-9707-438E-BB18-C4D12C116C5F'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = FALSE
WHERE
  "ID" = '139AB3B7-C1AB-49BD-A473-47D45A962578'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set categories for 28 fields */
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.EntityID */
UPDATE __mj."EntityField" SET "Category" = 'Target Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Parent Entity'
WHERE
  "ID" = '69FCA6DF-29F3-4C0D-80AB-3322A4118287';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.ComponentID */
UPDATE __mj."EntityField" SET "Category" = 'Target Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Component'
WHERE
  "ID" = '1DCF744D-1A04-4D80-9D09-541E7C39C9CC';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.Slot */
UPDATE __mj."EntityField" SET "Category" = 'Target Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '8AFB7D87-E209-4ADA-98A2-0743C5906AAD';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.SortKey */
UPDATE __mj."EntityField" SET "Category" = 'Target Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '189D2CBD-0AE2-4477-839D-1349118074F9';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.Name */
UPDATE __mj."EntityField" SET "Category" = 'General Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '928676B2-9E5E-4AD9-968A-2C1A1228C992';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.Description */
UPDATE __mj."EntityField" SET "Category" = 'General Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'AFEE789B-D246-4C62-BBDD-D1BE0B95751A';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.Title */
UPDATE __mj."EntityField" SET "Category" = 'General Information', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '3FE33932-E90A-4937-8F79-E06A9C2EEB32';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.Icon */
UPDATE __mj."EntityField" SET "Category" = 'General Information', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Icon'
WHERE
  "ID" = '4E9A8F05-A588-4717-B6E2-C9D93F3B45CC';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.ContributionKey */
UPDATE __mj."EntityField" SET "Category" = 'Override Logic', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'CF2F27FF-0AF5-452A-B390-EA7BCE43FB81';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.Precedence */
UPDATE __mj."EntityField" SET "Category" = 'Override Logic', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '160585FF-9839-4174-BDD7-069A8C97FE36';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.RelatedEntityID */
UPDATE __mj."EntityField" SET "Category" = 'Replacement Logic', "GeneratedFormSection" = 'Category', "DisplayName" = 'Related Entity'
WHERE
  "ID" = 'FD7E1B49-AAD6-4EF7-8B4F-552A133D859F';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.RelatedJoinField */
UPDATE __mj."EntityField" SET "Category" = 'Replacement Logic', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '3DEEBC53-7763-43C2-B432-CB7E7537C067';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.ReplacesSectionKey */
UPDATE __mj."EntityField" SET "Category" = 'Replacement Logic', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '46F2F4B1-C1B0-4F8E-990F-C70B8F8390D8';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.ReplacesSectionKeys */
UPDATE __mj."EntityField" SET "Category" = 'Replacement Logic', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '28351F96-9D9B-4037-9ED0-239E6850614A';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.ReplacesFieldNames */
UPDATE __mj."EntityField" SET "Category" = 'Replacement Logic', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '4000B0D2-DBCD-45BE-8367-2537F2B9F6A4';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.InSectionKey */
UPDATE __mj."EntityField" SET "Category" = 'Replacement Logic', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '2E2A6623-6759-4B68-9B56-874B744E8BBE';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.SectionPosition */
UPDATE __mj."EntityField" SET "Category" = 'Replacement Logic', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'CF73CD22-FA9A-494E-8FCC-5411D0EFB1A2';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.Inclusion */
UPDATE __mj."EntityField" SET "Category" = 'Display Settings', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '4E737863-E486-478C-8D5A-F0F1B74855CC';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.ChromeGroup */
UPDATE __mj."EntityField" SET "Category" = 'Display Settings', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '41D1A5E5-7C6B-40D2-ACCA-0B083120AB22';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.Presentation */
UPDATE __mj."EntityField" SET "Category" = 'Display Settings', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'F3F6EEED-0971-467A-8C17-DF4B771B2D44';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.Scope */
UPDATE __mj."EntityField" SET "Category" = 'Access Control', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '058C54DD-6A76-4AEC-AB76-33755B4392B4';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.UserID */
UPDATE __mj."EntityField" SET "Category" = 'Access Control', "GeneratedFormSection" = 'Category', "DisplayName" = 'User'
WHERE
  "ID" = '2988E27C-6545-4C38-A9DF-7E526F200E48';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.RoleID */
UPDATE __mj."EntityField" SET "Category" = 'Access Control', "GeneratedFormSection" = 'Category', "DisplayName" = 'Role'
WHERE
  "ID" = 'C044722C-69A2-4735-A5AF-EEA3A2801E84';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.Status */
UPDATE __mj."EntityField" SET "Category" = 'Lifecycle Management', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '228EC6CB-548C-4A7B-98BF-A0CEA8EF223C';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.Configuration */
UPDATE __mj."EntityField" SET "Category" = 'Lifecycle Management', "GeneratedFormSection" = 'Category', "ExtendedType" = 'JSON'
WHERE
  "ID" = '18F46076-91C5-448C-8987-E08A8609E050';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.Notes */
UPDATE __mj."EntityField" SET "Category" = 'Lifecycle Management', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'B629EDFA-30E5-49EC-BE46-0029CFF32364';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = 'F7C5C0FE-B8BB-4FD5-9280-D48F7B361285';
/* UPDATE Entity Field Category Info MJ: Entity Form Contributions.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '6E54E325-6CD8-4910-926A-EA4270DE3197';

/* Set entity icon to fa fa-puzzle-piece */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-puzzle-piece', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = '139AB3B7-C1AB-49BD-A473-47D45A962578';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'FieldCategoryInfo') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7922d42c-ac5e-50c7-9e66-ecac664c657b', '139AB3B7-C1AB-49BD-A473-47D45A962578', 'FieldCategoryInfo', '{
  "Access Control": {
    "description": "Visibility constraints based on users or roles.",
    "icon": "fa fa-lock"
  },
  "Display Settings": {
    "description": "Visual presentation and chrome behavior settings.",
    "icon": "fa fa-desktop"
  },
  "General Information": {
    "description": "Basic naming and labeling for the contribution.",
    "icon": "fa fa-info-circle"
  },
  "Lifecycle Management": {
    "description": "Operational status, configuration, and audit notes.",
    "icon": "fa fa-tasks"
  },
  "Override Logic": {
    "description": "Settings for resolving conflicts between multiple contributions.",
    "icon": "fa fa-balance-scale"
  },
  "Replacement Logic": {
    "description": "Rules for replacing existing form sections or fields.",
    "icon": "fa fa-exchange-alt"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields.",
    "icon": "fa fa-cog"
  },
  "Target Configuration": {
    "description": "Defines where and how the component mounts on the parent form.",
    "icon": "fa fa-crosshairs"
  }
}', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntitySetting" WHERE "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578' AND "Name" = 'FieldCategoryIcons') THEN
    INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d1f59d2d-f879-54dc-bffe-1d042cd2d64d', '139AB3B7-C1AB-49BD-A473-47D45A962578', 'FieldCategoryIcons', '{
  "Access Control": "fa fa-lock",
  "Display Settings": "fa fa-desktop",
  "General Information": "fa fa-info-circle",
  "Lifecycle Management": "fa fa-tasks",
  "Override Logic": "fa fa-balance-scale",
  "Replacement Logic": "fa fa-exchange-alt",
  "System Metadata": "fa fa-cog",
  "Target Configuration": "fa fa-crosshairs"
}', NOW(), NOW());
  END IF;
END $$;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = '139AB3B7-C1AB-49BD-A473-47D45A962578';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Form Contributions
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_form_contribution_entity_id"
    ON "__mj"."EntityFormContribution" ("EntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_form_contribution_component_id"
    ON "__mj"."EntityFormContribution" ("ComponentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_form_contribution_related_entity_id"
    ON "__mj"."EntityFormContribution" ("RelatedEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_form_contribution_user_id"
    ON "__mj"."EntityFormContribution" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_form_contribution_role_id"
    ON "__mj"."EntityFormContribution" ("RoleID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Form Contributions
-- Item: vwEntityFormContributions
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Form Contributions
-----               SCHEMA:      __mj
-----               BASE TABLE:  EntityFormContribution
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwEntityFormContributions"
AS
SELECT
    e.*,
    MJEntity_EntityID."Name" AS "Entity",
    MJComponent_ComponentID."Name" AS "Component",
    MJEntity_RelatedEntityID."Name" AS "RelatedEntity",
    MJUser_UserID."Name" AS "User",
    MJRole_RoleID."Name" AS "Role"
FROM
    "__mj"."EntityFormContribution" AS e
INNER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "e"."EntityID" = MJEntity_EntityID."ID"
INNER JOIN
    "__mj"."Component" AS MJComponent_ComponentID
  ON
    "e"."ComponentID" = MJComponent_ComponentID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_RelatedEntityID
  ON
    "e"."RelatedEntityID" = MJEntity_RelatedEntityID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "e"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
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
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwEntityFormContributions'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

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
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwEntityFormContributions'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwEntityFormContributions" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
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
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwEntityFormContributions" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwEntityFormContributions" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwEntityFormContributions" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Form Contributions
-- Item: spCreateEntityFormContribution
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR EntityFormContribution
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntityFormContribution'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateEntityFormContribution"(
    p_id UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_componentid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_slot varchar(30) DEFAULT NULL,
    p_sortkey int DEFAULT NULL,
    p_contributionkey_clear boolean DEFAULT false,
    p_contributionkey varchar(256) DEFAULT NULL,
    p_relatedentityid_clear boolean DEFAULT false,
    p_relatedentityid UUID DEFAULT NULL,
    p_relatedjoinfield_clear boolean DEFAULT false,
    p_relatedjoinfield varchar(255) DEFAULT NULL,
    p_replacessectionkey_clear boolean DEFAULT false,
    p_replacessectionkey varchar(255) DEFAULT NULL,
    p_replacessectionkeys_clear boolean DEFAULT false,
    p_replacessectionkeys TEXT DEFAULT NULL,
    p_replacesfieldnames_clear boolean DEFAULT false,
    p_replacesfieldnames TEXT DEFAULT NULL,
    p_insectionkey_clear boolean DEFAULT false,
    p_insectionkey varchar(255) DEFAULT NULL,
    p_sectionposition_clear boolean DEFAULT false,
    p_sectionposition varchar(10) DEFAULT NULL,
    p_inclusion_clear boolean DEFAULT false,
    p_inclusion varchar(10) DEFAULT NULL,
    p_chromegroup_clear boolean DEFAULT false,
    p_chromegroup varchar(10) DEFAULT NULL,
    p_presentation varchar(10) DEFAULT NULL,
    p_title_clear boolean DEFAULT false,
    p_title varchar(255) DEFAULT NULL,
    p_icon_clear boolean DEFAULT false,
    p_icon varchar(100) DEFAULT NULL,
    p_scope varchar(20) DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid UUID DEFAULT NULL,
    p_roleid_clear boolean DEFAULT false,
    p_roleid UUID DEFAULT NULL,
    p_precedence int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_notes_clear boolean DEFAULT false,
    p_notes TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityFormContributions" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."EntityFormContribution"
        (
            "ID",
            "EntityID",
                "ComponentID",
                "Name",
                "Description",
                "Slot",
                "SortKey",
                "ContributionKey",
                "RelatedEntityID",
                "RelatedJoinField",
                "ReplacesSectionKey",
                "ReplacesSectionKeys",
                "ReplacesFieldNames",
                "InSectionKey",
                "SectionPosition",
                "Inclusion",
                "ChromeGroup",
                "Presentation",
                "Title",
                "Icon",
                "Scope",
                "UserID",
                "RoleID",
                "Precedence",
                "Status",
                "Configuration",
                "Notes"
        )
    VALUES
        (
            v_new_id,
            p_entityid,
                p_componentid,
                p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_slot, 'after-fields'),
                COALESCE(p_sortkey, 0),
                CASE WHEN p_contributionkey_clear = true THEN NULL ELSE COALESCE(p_contributionkey, NULL) END,
                CASE WHEN p_relatedentityid_clear = true THEN NULL ELSE COALESCE(p_relatedentityid, NULL) END,
                CASE WHEN p_relatedjoinfield_clear = true THEN NULL ELSE COALESCE(p_relatedjoinfield, NULL) END,
                CASE WHEN p_replacessectionkey_clear = true THEN NULL ELSE COALESCE(p_replacessectionkey, NULL) END,
                CASE WHEN p_replacessectionkeys_clear = true THEN NULL ELSE COALESCE(p_replacessectionkeys, NULL) END,
                CASE WHEN p_replacesfieldnames_clear = true THEN NULL ELSE COALESCE(p_replacesfieldnames, NULL) END,
                CASE WHEN p_insectionkey_clear = true THEN NULL ELSE COALESCE(p_insectionkey, NULL) END,
                CASE WHEN p_sectionposition_clear = true THEN NULL ELSE COALESCE(p_sectionposition, NULL) END,
                CASE WHEN p_inclusion_clear = true THEN NULL ELSE COALESCE(p_inclusion, NULL) END,
                CASE WHEN p_chromegroup_clear = true THEN NULL ELSE COALESCE(p_chromegroup, NULL) END,
                COALESCE(p_presentation, 'panel'),
                CASE WHEN p_title_clear = true THEN NULL ELSE COALESCE(p_title, NULL) END,
                CASE WHEN p_icon_clear = true THEN NULL ELSE COALESCE(p_icon, NULL) END,
                COALESCE(p_scope, 'User'),
                CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, NULL) END,
                CASE WHEN p_roleid_clear = true THEN NULL ELSE COALESCE(p_roleid, NULL) END,
                COALESCE(p_precedence, 0),
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                CASE WHEN p_notes_clear = true THEN NULL ELSE COALESCE(p_notes, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityFormContributions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityFormContribution" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityFormContribution" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Form Contributions
-- Item: spUpdateEntityFormContribution
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR EntityFormContribution
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntityFormContribution'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateEntityFormContribution"(
    p_id UUID,
    p_entityid UUID DEFAULT NULL,
    p_componentid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_slot varchar(30) DEFAULT NULL,
    p_sortkey int DEFAULT NULL,
    p_contributionkey_clear boolean DEFAULT false,
    p_contributionkey varchar(256) DEFAULT NULL,
    p_relatedentityid_clear boolean DEFAULT false,
    p_relatedentityid UUID DEFAULT NULL,
    p_relatedjoinfield_clear boolean DEFAULT false,
    p_relatedjoinfield varchar(255) DEFAULT NULL,
    p_replacessectionkey_clear boolean DEFAULT false,
    p_replacessectionkey varchar(255) DEFAULT NULL,
    p_replacessectionkeys_clear boolean DEFAULT false,
    p_replacessectionkeys TEXT DEFAULT NULL,
    p_replacesfieldnames_clear boolean DEFAULT false,
    p_replacesfieldnames TEXT DEFAULT NULL,
    p_insectionkey_clear boolean DEFAULT false,
    p_insectionkey varchar(255) DEFAULT NULL,
    p_sectionposition_clear boolean DEFAULT false,
    p_sectionposition varchar(10) DEFAULT NULL,
    p_inclusion_clear boolean DEFAULT false,
    p_inclusion varchar(10) DEFAULT NULL,
    p_chromegroup_clear boolean DEFAULT false,
    p_chromegroup varchar(10) DEFAULT NULL,
    p_presentation varchar(10) DEFAULT NULL,
    p_title_clear boolean DEFAULT false,
    p_title varchar(255) DEFAULT NULL,
    p_icon_clear boolean DEFAULT false,
    p_icon varchar(100) DEFAULT NULL,
    p_scope varchar(20) DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid UUID DEFAULT NULL,
    p_roleid_clear boolean DEFAULT false,
    p_roleid UUID DEFAULT NULL,
    p_precedence int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_notes_clear boolean DEFAULT false,
    p_notes TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityFormContributions" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."EntityFormContribution"
    SET
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "ComponentID" = COALESCE(p_componentid, "ComponentID"),
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Slot" = COALESCE(p_slot, "Slot"),
        "SortKey" = COALESCE(p_sortkey, "SortKey"),
        "ContributionKey" = CASE WHEN p_contributionkey_clear = true THEN NULL ELSE COALESCE(p_contributionkey, "ContributionKey") END,
        "RelatedEntityID" = CASE WHEN p_relatedentityid_clear = true THEN NULL ELSE COALESCE(p_relatedentityid, "RelatedEntityID") END,
        "RelatedJoinField" = CASE WHEN p_relatedjoinfield_clear = true THEN NULL ELSE COALESCE(p_relatedjoinfield, "RelatedJoinField") END,
        "ReplacesSectionKey" = CASE WHEN p_replacessectionkey_clear = true THEN NULL ELSE COALESCE(p_replacessectionkey, "ReplacesSectionKey") END,
        "ReplacesSectionKeys" = CASE WHEN p_replacessectionkeys_clear = true THEN NULL ELSE COALESCE(p_replacessectionkeys, "ReplacesSectionKeys") END,
        "ReplacesFieldNames" = CASE WHEN p_replacesfieldnames_clear = true THEN NULL ELSE COALESCE(p_replacesfieldnames, "ReplacesFieldNames") END,
        "InSectionKey" = CASE WHEN p_insectionkey_clear = true THEN NULL ELSE COALESCE(p_insectionkey, "InSectionKey") END,
        "SectionPosition" = CASE WHEN p_sectionposition_clear = true THEN NULL ELSE COALESCE(p_sectionposition, "SectionPosition") END,
        "Inclusion" = CASE WHEN p_inclusion_clear = true THEN NULL ELSE COALESCE(p_inclusion, "Inclusion") END,
        "ChromeGroup" = CASE WHEN p_chromegroup_clear = true THEN NULL ELSE COALESCE(p_chromegroup, "ChromeGroup") END,
        "Presentation" = COALESCE(p_presentation, "Presentation"),
        "Title" = CASE WHEN p_title_clear = true THEN NULL ELSE COALESCE(p_title, "Title") END,
        "Icon" = CASE WHEN p_icon_clear = true THEN NULL ELSE COALESCE(p_icon, "Icon") END,
        "Scope" = COALESCE(p_scope, "Scope"),
        "UserID" = CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, "UserID") END,
        "RoleID" = CASE WHEN p_roleid_clear = true THEN NULL ELSE COALESCE(p_roleid, "RoleID") END,
        "Precedence" = COALESCE(p_precedence, "Precedence"),
        "Status" = COALESCE(p_status, "Status"),
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "Notes" = CASE WHEN p_notes_clear = true THEN NULL ELSE COALESCE(p_notes, "Notes") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityFormContributions"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityFormContribution" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityFormContribution" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityFormContribution table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_entity_form_contribution"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_entity_form_contribution" ON "__mj"."EntityFormContribution";

CREATE TRIGGER "trg_update_entity_form_contribution"
BEFORE UPDATE ON "__mj"."EntityFormContribution"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_entity_form_contribution"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Form Contributions
-- Item: spDeleteEntityFormContribution
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR EntityFormContribution
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteEntityFormContribution'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteEntityFormContribution"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."EntityFormContribution"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityFormContribution" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityFormContribution" TO "cdp_Integration";
