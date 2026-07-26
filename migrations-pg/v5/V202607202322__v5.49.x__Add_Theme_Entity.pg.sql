-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202607202322__v5.49.x__Add_Theme_Entity.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* ============================================================================
   Add Theme Entity — Org Theming
   v5.49.x

   Companion plan: org-theming-implementation-plan.md (Skip-Brain).

   Introduces the "Theme" primitive: a named brand authored as a small set of
   seeds. A theme is a *brand*; light/dark is the user's mode layered under it
   (design decision #1), so a theme carries no per-mode values. The table stores
   ~8 brand seeds as JSON (decision #2), NOT tokens — the full --mj-* design-token
   contract is derived from the seeds at load by @memberjunction/theme-engine.

   Scoping (decision #5): NO OrganizationID — MJ core has no Organization entity
   (a BCSaaS concept) — and NO BaseTheme (decision #1). v1 scoping is IsDefault +
   Status only. Logos are variant uploads, never recolored (decision #9): dark
   mode swaps artwork, it does not transform it.

   Advanced layer (power users): Overrides is a JSON map of individual --mj-*
   token overrides applied on top of the derived tokens; CustomCSS is raw CSS
   appended to the theme overlay, auto-scoped under [data-theme-overlay="<id>"].
   Both are NULL by default — a theme with no advanced data derives purely from
   its seeds.

   This migration is the consolidated final state of the Theme entity (table +
   seed default theme). The CodeGen output (entity metadata, EntityField rows,
   view, and spCreate/Update/Delete procedures) is appended below this DDL.

   CodeGen convention (per migrations/CLAUDE.md):
     * NO __mj_CreatedAt / __mj_UpdatedAt columns — CodeGen adds + triggers them.
     * NO indexes — CodeGen creates them automatically.
     * sp_addextendedproperty for every non-PK column so CodeGen surfaces
       descriptions on regen.
   ============================================================================ */
/* ============================================================================ */
/* Theme  ("MJ: Themes") — brand themes authored as seeds */
/* ============================================================================ */
CREATE TABLE __mj."Theme" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "Name" VARCHAR(100) NOT NULL,
  "Description" TEXT NULL,
  "Seeds" TEXT NOT NULL,
  "LightMarkURL" VARCHAR(1000) NULL,
  "DarkMarkURL" VARCHAR(1000) NULL,
  "WordmarkURL" VARCHAR(1000) NULL,
  "MonochromeURL" VARCHAR(1000) NULL,
  "IsDefault" BOOLEAN NOT NULL CONSTRAINT "DF_Theme_IsDefault" DEFAULT FALSE,
  "Status" VARCHAR(20) NOT NULL CONSTRAINT "DF_Theme_Status" DEFAULT (
    'Active'
  ),
  "Overrides" TEXT NULL,
  "CustomCSS" TEXT NULL,
  CONSTRAINT "PK_Theme" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_Theme_Name" UNIQUE (
    "Name"
  ),
  CONSTRAINT "CK_Theme_Status" CHECK ("Status" IN ('Active', 'Inactive', 'Draft'))
);

COMMENT ON TABLE __mj."Theme" IS 'A named brand theme. Stores ~8 brand seeds (color hue anchors, neutral character, vibrancy, shape, depth, type, viz palette) as JSON; the full --mj-* design-token contract is derived from the seeds at load. A theme is a brand — light/dark is the user''s mode layered under it, so a theme carries no per-mode values.';

COMMENT ON COLUMN __mj."Theme"."Name" IS 'Display name for the theme (unique).';

COMMENT ON COLUMN __mj."Theme"."Description" IS 'Optional description of the theme.';

COMMENT ON COLUMN __mj."Theme"."Seeds" IS 'Brand seeds as JSON (the ThemeSeeds shape from @memberjunction/theme-engine): primary/accent/tertiary hue anchors, neutralChroma, vibrancy, radius, depth, fontFamily, and an optional vizPalette override. Source of truth — the full token contract is derived from this, not stored.';

COMMENT ON COLUMN __mj."Theme"."LightMarkURL" IS 'Public URL of the logo mark for light surfaces. Logos are variant uploads, never recolored.';

COMMENT ON COLUMN __mj."Theme"."DarkMarkURL" IS 'Public URL of the logo mark for dark surfaces. Dark mode swaps to this artwork rather than transforming the light mark.';

COMMENT ON COLUMN __mj."Theme"."WordmarkURL" IS 'Optional public URL of the full wordmark logo.';

COMMENT ON COLUMN __mj."Theme"."MonochromeURL" IS 'Optional public URL of a single-fill monochrome logo variant.';

COMMENT ON COLUMN __mj."Theme"."IsDefault" IS 'When 1, this is the default theme applied when no other is selected. Single-default enforcement is handled at the application layer.';

COMMENT ON COLUMN __mj."Theme"."Status" IS 'Lifecycle status: Active (available), Inactive (retired), or Draft (in progress, not applied).';

COMMENT ON COLUMN __mj."Theme"."Overrides" IS 'Optional advanced token overrides as a JSON object mapping a --mj-* CSS custom property name to a value (e.g. {"--mj-brand-primary-hover":"#0a5cff"}). Applied on top of the seed-derived token contract at load, before CustomCSS. Leave null to use the pure derived theme.';

COMMENT ON COLUMN __mj."Theme"."CustomCSS" IS 'Optional advanced raw CSS appended to the theme overlay and auto-scoped under [data-theme-overlay="<id>"]. Applied last, after the derived tokens and Overrides. Escape hatch for rules the seed/token model cannot express; leave null for none.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."Theme" WHERE "ID" = '64A6B519-CFBA-4F25-98D4-8398D397E21C') THEN
    INSERT INTO __mj."Theme" ("ID", "Name", "Description", "Seeds", "IsDefault", "Status") VALUES ('64A6B519-CFBA-4F25-98D4-8398D397E21C', 'MemberJunction', 'The default MemberJunction brand theme. Derived seeds reproduce the stock MJ light/dark design tokens.', '{"primary":"#0076b6","accent":"#5cc0ed","tertiary":"#06b6d4","neutralChroma":0.037,"vibrancy":1,"radius":8,"depth":1}', TRUE, 'Active');
  END IF;
END $$;

/* ============================================================================= */
/* ============================================================================= */
/*                    ⚙️  CODEGEN OUTPUT BELOW THIS LINE  ⚙️ */
/* Everything below this block was generated by the MemberJunction CodeGen tool */
/* after the hand-written DDL above was applied to the development database. */
/* It contains the framework plumbing for the new Theme entity: Entity / */
/* EntityField metadata inserts, EntityFieldValue rows, the regenerated base */
/* view (vwThemes), stored procedures (spCreate/spUpdate/spDelete), permission */
/* grants, and related settings. */
/* DO NOT EDIT BY HAND. If the hand-written DDL above changes, re-run CodeGen */
/* and replace this entire section with the fresh output. */
/* ============================================================================= */
/* ============================================================================= */
/* SQL generated to create new entity MJ: Themes */
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
    'f38184cd-4ccd-4b52-b3bf-2a1f1a92a8eb',
    'MJ: Themes',
    'Themes',
    'A named brand theme. Stores ~8 brand seeds (color hue anchors, neutral character, vibrancy, shape, depth, type, viz palette) as JSON; the full --mj-* design-token contract is derived from the seeds at load. A theme is a brand — light/dark is the user''s mode layered under it, so a theme carries no per-mode values.',
    NULL,
    'Theme',
    'vwThemes',
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
/* SQL generated to add new entity MJ: Themes to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    'f38184cd-4ccd-4b52-b3bf-2a1f1a92a8eb',
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
/* SQL generated to add new permission for entity MJ: Themes for role UI */
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
    'f38184cd-4ccd-4b52-b3bf-2a1f1a92a8eb',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Themes for role Developer */
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
    'f38184cd-4ccd-4b52-b3bf-2a1f1a92a8eb',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Themes for role Integration */
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
    'f38184cd-4ccd-4b52-b3bf-2a1f1a92a8eb',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
ALTER TABLE __mj."Theme"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.Theme */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.Theme */
UPDATE __mj."Theme" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'Theme' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."Theme" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."Theme" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."Theme"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.Theme */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.Theme */
UPDATE __mj."Theme" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'Theme' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."Theme" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."Theme" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd64de3b0-b319-4584-a98b-a826010f1753' OR ("EntityID" = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d64de3b0-b319-4584-a98b-a826010f1753', 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' /* Entity: MJ: Themes */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0c00d10a-24e5-4d8e-84da-6e71c425c967' OR ("EntityID" = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0c00d10a-24e5-4d8e-84da-6e71c425c967', 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' /* Entity: MJ: Themes */, 100002, 'Name', 'Name', 'Display name for the theme (unique).', 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a8b41183-7e1a-4738-a749-d9e96ae45438' OR ("EntityID" = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a8b41183-7e1a-4738-a749-d9e96ae45438', 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' /* Entity: MJ: Themes */, 100003, 'Description', 'Description', 'Optional description of the theme.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '88fd6368-ec85-479a-b94e-99b770aeb1c6' OR ("EntityID" = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND "Name" = 'Seeds')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('88fd6368-ec85-479a-b94e-99b770aeb1c6', 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' /* Entity: MJ: Themes */, 100004, 'Seeds', 'Seeds', 'Brand seeds as JSON (the ThemeSeeds shape from @memberjunction/theme-engine): primary/accent/tertiary hue anchors, neutralChroma, vibrancy, radius, depth, fontFamily, and an optional vizPalette override. Source of truth — the full token contract is derived from this, not stored.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'af638c3f-c2b2-4eb2-bde0-1a0653b99c07' OR ("EntityID" = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND "Name" = 'LightMarkURL')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('af638c3f-c2b2-4eb2-bde0-1a0653b99c07', 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' /* Entity: MJ: Themes */, 100005, 'LightMarkURL', 'Light Mark URL', 'Public URL of the logo mark for light surfaces. Logos are variant uploads, never recolored.', 'nvarchar', 2000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'acda295a-2c7d-4c19-8c48-82cfd29cab42' OR ("EntityID" = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND "Name" = 'DarkMarkURL')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('acda295a-2c7d-4c19-8c48-82cfd29cab42', 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' /* Entity: MJ: Themes */, 100006, 'DarkMarkURL', 'Dark Mark URL', 'Public URL of the logo mark for dark surfaces. Dark mode swaps to this artwork rather than transforming the light mark.', 'nvarchar', 2000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b0bdf921-97ab-4e70-aa4f-0d817aff28d2' OR ("EntityID" = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND "Name" = 'WordmarkURL')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b0bdf921-97ab-4e70-aa4f-0d817aff28d2', 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' /* Entity: MJ: Themes */, 100007, 'WordmarkURL', 'Wordmark URL', 'Optional public URL of the full wordmark logo.', 'nvarchar', 2000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6857af21-cf95-4f71-81ce-d45f50960f69' OR ("EntityID" = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND "Name" = 'MonochromeURL')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6857af21-cf95-4f71-81ce-d45f50960f69', 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' /* Entity: MJ: Themes */, 100008, 'MonochromeURL', 'Monochrome URL', 'Optional public URL of a single-fill monochrome logo variant.', 'nvarchar', 2000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '127ec8c9-676b-48ef-a601-8a4c07a2e13f' OR ("EntityID" = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND "Name" = 'IsDefault')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('127ec8c9-676b-48ef-a601-8a4c07a2e13f', 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' /* Entity: MJ: Themes */, 100009, 'IsDefault', 'Is Default', 'When 1, this is the default theme applied when no other is selected. Single-default enforcement is handled at the application layer.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '333dd5e1-99dd-4a35-b9ac-ea92feda7d60' OR ("EntityID" = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('333dd5e1-99dd-4a35-b9ac-ea92feda7d60', 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' /* Entity: MJ: Themes */, 100010, 'Status', 'Status', 'Lifecycle status: Active (available), Inactive (retired), or Draft (in progress, not applied).', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '33703231-3b34-468b-992a-aa68cfb293d7' OR ("EntityID" = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND "Name" = 'Overrides')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('33703231-3b34-468b-992a-aa68cfb293d7', 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' /* Entity: MJ: Themes */, 100011, 'Overrides', 'Overrides', 'Optional advanced token overrides as a JSON object mapping a --mj-* CSS custom property name to a value (e.g. {"--mj-brand-primary-hover":"#0a5cff"}). Applied on top of the seed-derived token contract at load, before CustomCSS. Leave null to use the pure derived theme.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '88d23cfa-617f-4c2d-8852-d53a4dcf1064' OR ("EntityID" = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND "Name" = 'CustomCSS')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('88d23cfa-617f-4c2d-8852-d53a4dcf1064', 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' /* Entity: MJ: Themes */, 100012, 'CustomCSS', 'Custom CSS', 'Optional advanced raw CSS appended to the theme overlay and auto-scoped under [data-theme-overlay="<id>"]. Applied last, after the derived tokens and Overrides. Escape hatch for rules the seed/token model cannot express; leave null for none.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '23c23c48-efc9-4a5f-8adb-62c931449e48' OR ("EntityID" = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('23c23c48-efc9-4a5f-8adb-62c931449e48', 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' /* Entity: MJ: Themes */, 100013, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '685ddc27-4652-4103-9d87-437501043203' OR ("EntityID" = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('685ddc27-4652-4103-9d87-437501043203', 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' /* Entity: MJ: Themes */, 100014, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID c0c38596-a091-4814-a113-5fcb0254a476 */
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
    'c0c38596-a091-4814-a113-5fcb0254a476',
    '333DD5E1-99DD-4A35-B9AC-EA92FEDA7D60',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID dc26733c-dbee-418f-ba84-da8f00449b12 */
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
    'dc26733c-dbee-418f-ba84-da8f00449b12',
    '333DD5E1-99DD-4A35-B9AC-EA92FEDA7D60',
    2,
    'Draft',
    'Draft',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID f33aef06-6b6f-4b99-94c3-3129462b8725 */
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
    'f33aef06-6b6f-4b99-94c3-3129462b8725',
    '333DD5E1-99DD-4A35-B9AC-EA92FEDA7D60',
    3,
    'Inactive',
    'Inactive',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 333DD5E1-99DD-4A35-B9AC-EA92FEDA7D60 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '333DD5E1-99DD-4A35-B9AC-EA92FEDA7D60';

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '127EC8C9-676B-48EF-A601-8A4C07A2E13F'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "DefaultInView" = TRUE
WHERE
  "ID" = '333DD5E1-99DD-4A35-B9AC-EA92FEDA7D60'
  AND "AutoUpdateDefaultInView" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'BeginsWith'
WHERE
  "ID" = '0C00D10A-24E5-4D8E-84DA-6E71C425C967'
  AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set categories for 14 fields */
/* UPDATE Entity Field Category Info MJ: Themes.ID */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'D64DE3B0-B319-4584-A98B-A826010F1753' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Themes.Name */
UPDATE __mj."EntityField" SET "Category" = 'Theme Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '0C00D10A-24E5-4D8E-84DA-6E71C425C967' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Themes.Description */
UPDATE __mj."EntityField" SET "Category" = 'Theme Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A8B41183-7E1A-4738-A749-D9E96AE45438' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Themes.Seeds */
UPDATE __mj."EntityField" SET "Category" = 'Theme Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '88FD6368-EC85-479A-B94E-99B770AEB1C6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Themes.LightMarkURL */
UPDATE __mj."EntityField" SET "Category" = 'Brand Assets', "GeneratedFormSection" = 'Category', "DisplayName" = 'Light Mode Logo', "ExtendedType" = 'URL', "CodeType" = NULL
WHERE
  "ID" = 'AF638C3F-C2B2-4EB2-BDE0-1A0653B99C07' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Themes.DarkMarkURL */
UPDATE __mj."EntityField" SET "Category" = 'Brand Assets', "GeneratedFormSection" = 'Category', "DisplayName" = 'Dark Mode Logo', "ExtendedType" = 'URL', "CodeType" = NULL
WHERE
  "ID" = 'ACDA295A-2C7D-4C19-8C48-82CFD29CAB42' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Themes.WordmarkURL */
UPDATE __mj."EntityField" SET "Category" = 'Brand Assets', "GeneratedFormSection" = 'Category', "DisplayName" = 'Wordmark Logo', "ExtendedType" = 'URL', "CodeType" = NULL
WHERE
  "ID" = 'B0BDF921-97AB-4E70-AA4F-0D817AFF28D2' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Themes.MonochromeURL */
UPDATE __mj."EntityField" SET "Category" = 'Brand Assets', "GeneratedFormSection" = 'Category', "DisplayName" = 'Monochrome Logo', "ExtendedType" = 'URL', "CodeType" = NULL
WHERE
  "ID" = '6857AF21-CF95-4F71-81CE-D45F50960F69' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Themes.IsDefault */
UPDATE __mj."EntityField" SET "Category" = 'Theme Configuration', "GeneratedFormSection" = 'Category', "DisplayName" = 'Is Default Theme', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '127EC8C9-676B-48EF-A601-8A4C07A2E13F' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Themes.Status */
UPDATE __mj."EntityField" SET "Category" = 'Theme Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '333DD5E1-99DD-4A35-B9AC-EA92FEDA7D60' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Themes.Overrides */
UPDATE __mj."EntityField" SET "Category" = 'Advanced Styling', "GeneratedFormSection" = 'Category', "DisplayName" = 'Token Overrides', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '33703231-3B34-468B-992A-AA68CFB293D7' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Themes.CustomCSS */
UPDATE __mj."EntityField" SET "Category" = 'Advanced Styling', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'CSS'
WHERE
  "ID" = '88D23CFA-617F-4C2D-8852-D53A4DCF1064' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Themes.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '23C23C48-EFC9-4A5F-8ADB-62C931449E48' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Themes.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "Category" = 'System Metadata', "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '685DDC27-4652-4103-9D87-437501043203' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-palette */
UPDATE __mj."Entity" SET "Icon" = 'fa fa-palette', "__mj_UpdatedAt" = NOW()
WHERE
  "ID" = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB';

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
    '1753c9ab-4de4-46ff-b65f-ac32a3920d53',
    'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB',
    'FieldCategoryInfo',
    '{"Theme Configuration":{"icon":"fa fa-sliders-h","description":"Core identity, status, and seed configuration for the brand theme"},"Brand Assets":{"icon":"fa fa-image","description":"Logo variants and brand imagery for different surfaces"},"Advanced Styling":{"icon":"fa fa-code","description":"Advanced token overrides and custom CSS for bespoke styling"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}',
    NOW(),
    NOW()
  );

/* Insert FieldCategoryIcons setting (legacy) */
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
    'a15572f4-ea8f-45c4-9bd3-256914a167b4',
    'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB',
    'FieldCategoryIcons',
    '{"Theme Configuration":"fa fa-sliders-h","Brand Assets":"fa fa-image","Advanced Styling":"fa fa-code","System Metadata":"fa fa-cog"}',
    NOW(),
    NOW()
  );

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */
UPDATE __mj."ApplicationEntity" SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
WHERE
  "EntityID" = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Themes
-- Item: Index for Foreign Keys
-- ============================================================


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Themes
-- Item: vwThemes
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Themes
-----               SCHEMA:      __mj
-----               BASE TABLE:  Theme
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwThemes"
AS
SELECT
    t.*
FROM
    __mj."Theme" AS t
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
    AND tc.relname = 'vwThemes'
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
    AND tc.relname = 'vwThemes'
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
        AND tc.relname = 'vwThemes'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwThemes" CASCADE;
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
GRANT SELECT ON __mj."vwThemes" TO "cdp_UI";
GRANT SELECT ON __mj."vwThemes" TO "cdp_Developer";
GRANT SELECT ON __mj."vwThemes" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Themes
-- Item: spCreateTheme
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Theme
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateTheme'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateTheme"(
    p_id UUID DEFAULT NULL,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_seeds TEXT DEFAULT NULL,
    p_lightmarkurl_clear boolean DEFAULT false,
    p_lightmarkurl varchar(1000) DEFAULT NULL,
    p_darkmarkurl_clear boolean DEFAULT false,
    p_darkmarkurl varchar(1000) DEFAULT NULL,
    p_wordmarkurl_clear boolean DEFAULT false,
    p_wordmarkurl varchar(1000) DEFAULT NULL,
    p_monochromeurl_clear boolean DEFAULT false,
    p_monochromeurl varchar(1000) DEFAULT NULL,
    p_isdefault BOOLEAN DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_overrides_clear boolean DEFAULT false,
    p_overrides TEXT DEFAULT NULL,
    p_customcss_clear boolean DEFAULT false,
    p_customcss TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwThemes" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."Theme"
        (
            "ID",
            "Name",
                "Description",
                "Seeds",
                "LightMarkURL",
                "DarkMarkURL",
                "WordmarkURL",
                "MonochromeURL",
                "IsDefault",
                "Status",
                "Overrides",
                "CustomCSS"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_seeds,
                CASE WHEN p_lightmarkurl_clear = true THEN NULL ELSE COALESCE(p_lightmarkurl, NULL) END,
                CASE WHEN p_darkmarkurl_clear = true THEN NULL ELSE COALESCE(p_darkmarkurl, NULL) END,
                CASE WHEN p_wordmarkurl_clear = true THEN NULL ELSE COALESCE(p_wordmarkurl, NULL) END,
                CASE WHEN p_monochromeurl_clear = true THEN NULL ELSE COALESCE(p_monochromeurl, NULL) END,
                COALESCE(p_isdefault, FALSE),
                COALESCE(p_status, 'Active'),
                CASE WHEN p_overrides_clear = true THEN NULL ELSE COALESCE(p_overrides, NULL) END,
                CASE WHEN p_customcss_clear = true THEN NULL ELSE COALESCE(p_customcss, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwThemes"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateTheme" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateTheme" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Themes
-- Item: spUpdateTheme
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Theme
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateTheme'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateTheme"(
    p_id UUID,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_seeds TEXT DEFAULT NULL,
    p_lightmarkurl_clear boolean DEFAULT false,
    p_lightmarkurl varchar(1000) DEFAULT NULL,
    p_darkmarkurl_clear boolean DEFAULT false,
    p_darkmarkurl varchar(1000) DEFAULT NULL,
    p_wordmarkurl_clear boolean DEFAULT false,
    p_wordmarkurl varchar(1000) DEFAULT NULL,
    p_monochromeurl_clear boolean DEFAULT false,
    p_monochromeurl varchar(1000) DEFAULT NULL,
    p_isdefault BOOLEAN DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_overrides_clear boolean DEFAULT false,
    p_overrides TEXT DEFAULT NULL,
    p_customcss_clear boolean DEFAULT false,
    p_customcss TEXT DEFAULT NULL
) RETURNS SETOF __mj."vwThemes" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."Theme"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Seeds" = COALESCE(p_seeds, "Seeds"),
        "LightMarkURL" = CASE WHEN p_lightmarkurl_clear = true THEN NULL ELSE COALESCE(p_lightmarkurl, "LightMarkURL") END,
        "DarkMarkURL" = CASE WHEN p_darkmarkurl_clear = true THEN NULL ELSE COALESCE(p_darkmarkurl, "DarkMarkURL") END,
        "WordmarkURL" = CASE WHEN p_wordmarkurl_clear = true THEN NULL ELSE COALESCE(p_wordmarkurl, "WordmarkURL") END,
        "MonochromeURL" = CASE WHEN p_monochromeurl_clear = true THEN NULL ELSE COALESCE(p_monochromeurl, "MonochromeURL") END,
        "IsDefault" = COALESCE(p_isdefault, "IsDefault"),
        "Status" = COALESCE(p_status, "Status"),
        "Overrides" = CASE WHEN p_overrides_clear = true THEN NULL ELSE COALESCE(p_overrides, "Overrides") END,
        "CustomCSS" = CASE WHEN p_customcss_clear = true THEN NULL ELSE COALESCE(p_customcss, "CustomCSS") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwThemes"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateTheme" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateTheme" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Theme table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_theme"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_theme" ON __mj."Theme";

CREATE TRIGGER "trg_update_theme"
BEFORE UPDATE ON __mj."Theme"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_theme"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Themes
-- Item: spDeleteTheme
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Theme
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteTheme'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteTheme"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."Theme"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteTheme" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteTheme" TO "cdp_Integration";
