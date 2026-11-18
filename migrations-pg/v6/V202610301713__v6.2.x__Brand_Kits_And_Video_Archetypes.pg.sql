
-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610301713__v6.2.x__Brand_Kits_And_Video_Archetypes.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ╔══ CONVERSION NOTE — RESOLVED BY HAND ══╗
-- The DDL and metadata DML below converted without gaps. The converter then stopped at its inline
-- CodeGen bake ("entity not found in working-DB metadata: MJ: Brand Kit Assets") although the rows
-- it looked up had just been inserted, so this file carries no baked CodeGen objects. The base
-- views, CRUD functions and grants for MJ: Brand Kits, MJ: Brand Kit Assets and MJ: Video Archetypes
-- are in this release's PG_CodeGen_Regen .pg-only migration.
-- ╚════════════════════════════════════════╝

/* ===================================================================== */
/* Brand Kits and Video Archetypes (v6.2.x) */
/* ===================================================================== */
/* Creates three core tables: */
/*   1. BrandKit        — General core entity holding colors, typography, */
/*                        voice, generation policy, facts never to invent, */
/*                        and associated assets so any generator, form, or */
/*                        application can stay on brand (D16). Video Studio */
/*                        is its first consumer. "One default kit per */
/*                        CompanyID scope" is enforced on save by */
/*                        MJBrandKitEntityServer (VS-FND-5), not here. */
/*   2. BrandKitAsset   — Files belonging to a brand kit (logos, fonts, */
/*                        reference imagery, music, etc.) with usage */
/*                        guidance, license notes, and generation-reference */
/*                        eligibility. */
/*   3. VideoArchetype  — Film templates with duration bounds, default */
/*                        formats, beat templates, pacing, and guidance. */
/* Note: DDL + extended properties only. Views, sprocs, FK indexes, the */
/* __mj_CreatedAt/__mj_UpdatedAt columns + triggers, and the EntityField / */
/* entity-class metadata are all produced by CodeGen from this schema and */
/* appended below the CODEGEN OUTPUT banner. */
/* ===================================================================== */
CREATE TABLE __mj."BrandKit" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "Name" VARCHAR(255) NOT NULL,
  "Description" TEXT NULL,
  "CompanyID" UUID NULL,
  "IsDefault" BOOLEAN NOT NULL DEFAULT FALSE,
  "Status" VARCHAR(20) NOT NULL DEFAULT (
    'Active'
  ),
  "Style" TEXT NULL,
  "Voice" TEXT NULL,
  "GenerationPolicy" TEXT NULL,
  "NeverInvent" TEXT NULL,
  CONSTRAINT "PK_BrandKit" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_BrandKit_Company" FOREIGN KEY ("CompanyID") REFERENCES __mj."Company" (
    "ID"
  ),
  CONSTRAINT "CK_BrandKit_Status" CHECK ("Status" IN ('Active', 'Inactive'))
);

CREATE TABLE __mj."BrandKitAsset" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "BrandKitID" UUID NOT NULL,
  "Name" VARCHAR(255) NOT NULL,
  "AssetType" VARCHAR(30) NOT NULL,
  "FileID" UUID NOT NULL,
  "Usage" TEXT NULL,
  "IsPrimary" BOOLEAN NOT NULL DEFAULT FALSE,
  "Sequence" INT NOT NULL DEFAULT (
    0
  ),
  "LicenseNotes" VARCHAR(500) NULL,
  "IsGenerationReference" BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT "PK_BrandKitAsset" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_BrandKitAsset_BrandKit" FOREIGN KEY ("BrandKitID") REFERENCES __mj."BrandKit" (
    "ID"
  ),
  CONSTRAINT "FK_BrandKitAsset_File" FOREIGN KEY ("FileID") REFERENCES __mj."File" (
    "ID"
  ),
  CONSTRAINT "CK_BrandKitAsset_AssetType" CHECK ("AssetType" IN (
    'Logo',
    'LogoMark',
    'Font',
    'Image',
    'Screenshot',
    'Video',
    'Music',
    'SoundEffect',
    'Other'
  )),
  CONSTRAINT "CK_BrandKitAsset_GenerationReference" CHECK ("IsGenerationReference" = FALSE
  OR "AssetType" IN ('Image', 'Screenshot', 'Logo', 'LogoMark', 'Video'))
);

CREATE TABLE __mj."VideoArchetype" (
  "ID" UUID NOT NULL DEFAULT (
    GEN_RANDOM_UUID()
  ),
  "Name" VARCHAR(100) NOT NULL,
  "Description" TEXT NOT NULL,
  "CompanyID" UUID NULL,
  "Category" VARCHAR(30) NOT NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT (
    'Active'
  ),
  "DefaultDurationSeconds" INT NOT NULL,
  "MinDurationSeconds" INT NOT NULL,
  "MaxDurationSeconds" INT NOT NULL,
  "DefaultFormats" VARCHAR(100) NOT NULL,
  "BeatTemplate" TEXT NOT NULL,
  "Pacing" TEXT NULL,
  "Guidance" TEXT NULL,
  "DefaultInteractionMode" VARCHAR(30) NOT NULL DEFAULT (
    'Autonomous'
  ),
  CONSTRAINT "PK_VideoArchetype" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_VideoArchetype_Company" FOREIGN KEY ("CompanyID") REFERENCES __mj."Company" (
    "ID"
  ),
  CONSTRAINT "UQ_VideoArchetype_CompanyID_Name" UNIQUE (
    "CompanyID",
    "Name"
  ),
  CONSTRAINT "CK_VideoArchetype_Category" CHECK ("Category" IN (
    'Explainer',
    'Product',
    'DataStory',
    'Social',
    'Tutorial',
    'Announcement',
    'Briefing'
  )),
  CONSTRAINT "CK_VideoArchetype_Status" CHECK ("Status" IN ('Active', 'Inactive')),
  CONSTRAINT "CK_VideoArchetype_DefaultInteractionMode" CHECK ("DefaultInteractionMode" IN ('Autonomous', 'ApproveStoryboard', 'ApproveStoryboardAndRoughCut')),
  CONSTRAINT "CK_VideoArchetype_Durations" CHECK ("MinDurationSeconds" > 0
  AND "MinDurationSeconds" <= "DefaultDurationSeconds"
  AND "DefaultDurationSeconds" <= "MaxDurationSeconds")
);

COMMENT ON TABLE __mj."BrandKit" IS 'A brand kit: colors, type, voice, generation policy, facts never to invent, and the files (logos, fonts, reference imagery, music) that generators, forms and applications use to stay on brand. CompanyID NULL makes the kit available to all companies.';

COMMENT ON COLUMN __mj."BrandKit"."Name" IS 'Display name of the brand kit.';

COMMENT ON COLUMN __mj."BrandKit"."Description" IS 'What the kit is for and when to use it.';

COMMENT ON COLUMN __mj."BrandKit"."CompanyID" IS 'The company this kit belongs to. NULL means org-wide: available to all companies.';

COMMENT ON COLUMN __mj."BrandKit"."IsDefault" IS 'The kit used when a caller names none. At most one default per CompanyID scope (NULL is its own scope), enforced on save by the server entity.';

COMMENT ON COLUMN __mj."BrandKit"."Status" IS 'Active kits are offered to users and generators; Inactive kits are kept but hidden.';

COMMENT ON COLUMN __mj."BrandKit"."Style" IS 'JSON (IBrandStyle): palette, typography, imagery style, keep and avoid lists, and an optional Motion section.';

COMMENT ON COLUMN __mj."BrandKit"."Voice" IS 'JSON (IBrandVoice): text-to-speech provider, voice ID, settings and pronunciation notes.';

COMMENT ON COLUMN __mj."BrandKit"."GenerationPolicy" IS 'JSON (IBrandGenerationPolicy): whether generated images and video may be used, a style prompt, subjects to avoid, whether generated people are allowed (default: not allowed), and an optional per-run generation spend cap. NULL applies the defaults.';

COMMENT ON COLUMN __mj."BrandKit"."NeverInvent" IS 'JSON array of strings: facts about the brand a model must never fabricate, for example product screens, logos, metrics or customer names.';

COMMENT ON TABLE __mj."BrandKitAsset" IS 'A file in a brand kit, with usage guidance, license notes, and whether generation models may receive it as a reference.';

COMMENT ON COLUMN __mj."BrandKitAsset"."BrandKitID" IS 'The brand kit this file belongs to.';

COMMENT ON COLUMN __mj."BrandKitAsset"."Name" IS 'Display name of the asset.';

COMMENT ON COLUMN __mj."BrandKitAsset"."AssetType" IS 'Logo, LogoMark, Font, Image, Screenshot, Video, Music, SoundEffect or Other.';

COMMENT ON COLUMN __mj."BrandKitAsset"."FileID" IS 'The stored file (MJ: Files).';

COMMENT ON COLUMN __mj."BrandKitAsset"."Usage" IS 'When and how to use the asset.';

COMMENT ON COLUMN __mj."BrandKitAsset"."IsPrimary" IS 'The main asset of its type, for example the primary logo.';

COMMENT ON COLUMN __mj."BrandKitAsset"."Sequence" IS 'Order within the kit; lower first.';

COMMENT ON COLUMN __mj."BrandKitAsset"."LicenseNotes" IS 'Who may use the file, and where (fonts, music, stock imagery).';

COMMENT ON COLUMN __mj."BrandKitAsset"."IsGenerationReference" IS 'When set, the file may be sent to image or video generation models as a style or subject reference. Allowed only for Image, Screenshot, Logo, LogoMark and Video assets.';

COMMENT ON TABLE __mj."VideoArchetype" IS 'A Video Studio film template: duration bounds, default formats, a beat template, pacing, and guidance for the Director and Storyboard. CompanyID NULL marks a shipped or org-wide archetype.';

COMMENT ON COLUMN __mj."VideoArchetype"."Name" IS 'Archetype name, unique within its CompanyID scope.';

COMMENT ON COLUMN __mj."VideoArchetype"."Description" IS 'What the archetype is for; the Director reads it to pick one.';

COMMENT ON COLUMN __mj."VideoArchetype"."CompanyID" IS 'The company that owns this archetype. NULL means shipped or org-wide: available to all companies.';

COMMENT ON COLUMN __mj."VideoArchetype"."Category" IS 'Explainer, Product, DataStory, Social, Tutorial, Announcement or Briefing.';

COMMENT ON COLUMN __mj."VideoArchetype"."Status" IS 'Active archetypes are offered; Inactive are hidden.';

COMMENT ON COLUMN __mj."VideoArchetype"."DefaultDurationSeconds" IS 'Default film length, in seconds.';

COMMENT ON COLUMN __mj."VideoArchetype"."MinDurationSeconds" IS 'Shortest film length, in seconds.';

COMMENT ON COLUMN __mj."VideoArchetype"."MaxDurationSeconds" IS 'Longest film length, in seconds.';

COMMENT ON COLUMN __mj."VideoArchetype"."DefaultFormats" IS 'Comma-separated default formats: any of 16:9, 9:16, 1:1.';

COMMENT ON COLUMN __mj."VideoArchetype"."BeatTemplate" IS 'JSON array (VideoBeatTemplate[]): the beat slots a film of this archetype follows, with per-beat duration bounds.';

COMMENT ON COLUMN __mj."VideoArchetype"."Pacing" IS 'JSON (VideoPacing): cut cadence and hold rules.';

COMMENT ON COLUMN __mj."VideoArchetype"."Guidance" IS 'Markdown guidance for the Director and Storyboard.';

COMMENT ON COLUMN __mj."VideoArchetype"."DefaultInteractionMode" IS 'Default approval mode: Autonomous, ApproveStoryboard or ApproveStoryboardAndRoughCut.';

/* *************************************************************************************************
 **************************************************************************************************
 **                                                                                              **
 **                    GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND                 **
 **                                                                                              **
 **  Everything below this block was produced by `mj codegen --no-ai` against the schema above   **
 **  for BrandKit, BrandKitAsset, and VideoArchetype (MJ_6_2_0_CLEAN_videostudio). It contains:  **
 **    • Entity / ApplicationEntity / EntityField / EntityFieldValue / EntityPermission          **
 **      / EntityRelationship metadata rows                                                      **
 **    • __mj_CreatedAt / __mj_UpdatedAt columns + defaults                                      **
 **    • foreign-key indexes (IDX_AUTO_MJ_FKEY_*)                                                **
 **    • base views (vwBrandKits, vwBrandKitAssets, vwVideoArchetypes)                           **
 **    • CRUD stored procedures (spCreate/spUpdate/spDelete) + permissions                       **
 **                                                                                              **
 **  No unrelated entity regenerations were emitted by CodeGen.                                  **
 **  It is appended here — rather than left as a standalone CodeGen_Run_*.sql file — so the      **
 **  BrandKit, BrandKitAsset, and VideoArchetype schema (hand-authored DDL + generated objects)  **
 **  applies as ONE migration, per MJ convention. DO NOT hand-edit below this line; it is        **
 **  regenerated by re-running CodeGen with `--no-ai`.                                           **
 **                                                                                              **
 **************************************************************************************************
 ************************************************************************************************* */
/* SQL generated to create new entity MJ: Video Archetypes */
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
    '8ecbea4b-2d6b-44e1-886c-96e904637866',
    'MJ: Video Archetypes',
    'Video Archetypes',
    'A Video Studio film template: duration bounds, default formats, a beat template, pacing, and guidance for the Director and Storyboard. CompanyID NULL marks a shipped or org-wide archetype.',
    NULL,
    'VideoArchetype',
    'vwVideoArchetypes',
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
/* SQL generated to add new entity MJ: Video Archetypes to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '8ecbea4b-2d6b-44e1-886c-96e904637866',
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
/* SQL generated to add new permission for entity MJ: Video Archetypes for role UI */
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
  CAST('8ecbea4b-2d6b-44e1-886c-96e904637866' AS UUID),
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
      "EntityID" = CAST('8ecbea4b-2d6b-44e1-886c-96e904637866' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Video Archetypes for role Developer */
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
  CAST('8ecbea4b-2d6b-44e1-886c-96e904637866' AS UUID),
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
      "EntityID" = CAST('8ecbea4b-2d6b-44e1-886c-96e904637866' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Video Archetypes for role Integration */
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
  CAST('8ecbea4b-2d6b-44e1-886c-96e904637866' AS UUID),
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
      "EntityID" = CAST('8ecbea4b-2d6b-44e1-886c-96e904637866' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Brand Kits */
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
    '370063b4-e662-43c2-bab6-88868597aebd',
    'MJ: Brand Kits',
    'Brand Kits',
    'A brand kit: colors, type, voice, generation policy, facts never to invent, and the files (logos, fonts, reference imagery, music) that generators, forms and applications use to stay on brand. CompanyID NULL makes the kit available to all companies.',
    NULL,
    'BrandKit',
    'vwBrandKits',
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
/* SQL generated to add new entity MJ: Brand Kits to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '370063b4-e662-43c2-bab6-88868597aebd',
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
/* SQL generated to add new permission for entity MJ: Brand Kits for role UI */
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
  CAST('370063b4-e662-43c2-bab6-88868597aebd' AS UUID),
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
      "EntityID" = CAST('370063b4-e662-43c2-bab6-88868597aebd' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Brand Kits for role Developer */
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
  CAST('370063b4-e662-43c2-bab6-88868597aebd' AS UUID),
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
      "EntityID" = CAST('370063b4-e662-43c2-bab6-88868597aebd' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Brand Kits for role Integration */
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
  CAST('370063b4-e662-43c2-bab6-88868597aebd' AS UUID),
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
      "EntityID" = CAST('370063b4-e662-43c2-bab6-88868597aebd' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to create new entity MJ: Brand Kit Assets */
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
    '712d12aa-7673-4221-a3fb-2bb7e4e50677',
    'MJ: Brand Kit Assets',
    'Brand Kit Assets',
    'A file in a brand kit, with usage guidance, license notes, and whether generation models may receive it as a reference.',
    NULL,
    'BrandKitAsset',
    'vwBrandKitAssets',
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
/* SQL generated to add new entity MJ: Brand Kit Assets to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
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
    '712d12aa-7673-4221-a3fb-2bb7e4e50677',
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
/* SQL generated to add new permission for entity MJ: Brand Kit Assets for role UI */
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
  CAST('712d12aa-7673-4221-a3fb-2bb7e4e50677' AS UUID),
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
      "EntityID" = CAST('712d12aa-7673-4221-a3fb-2bb7e4e50677' AS UUID)
      AND "RoleID" = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Brand Kit Assets for role Developer */
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
  CAST('712d12aa-7673-4221-a3fb-2bb7e4e50677' AS UUID),
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
      "EntityID" = CAST('712d12aa-7673-4221-a3fb-2bb7e4e50677' AS UUID)
      AND "RoleID" = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
/* SQL generated to add new permission for entity MJ: Brand Kit Assets for role Integration */
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
  CAST('712d12aa-7673-4221-a3fb-2bb7e4e50677' AS UUID),
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
      "EntityID" = CAST('712d12aa-7673-4221-a3fb-2bb7e4e50677' AS UUID)
      AND "RoleID" = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS UUID)
      AND "Type" = 'Allow'
  );
ALTER TABLE __mj."BrandKitAsset"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.BrandKitAsset */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.BrandKitAsset */
UPDATE __mj."BrandKitAsset" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'BrandKitAsset' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."BrandKitAsset" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."BrandKitAsset" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."BrandKitAsset"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.BrandKitAsset */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.BrandKitAsset */
UPDATE __mj."BrandKitAsset" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'BrandKitAsset' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."BrandKitAsset" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."BrandKitAsset" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."BrandKit"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.BrandKit */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.BrandKit */
UPDATE __mj."BrandKit" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'BrandKit' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."BrandKit" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."BrandKit" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."BrandKit"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.BrandKit */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.BrandKit */
UPDATE __mj."BrandKit" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'BrandKit' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."BrandKit" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."BrandKit" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."VideoArchetype"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.VideoArchetype */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.VideoArchetype */
UPDATE __mj."VideoArchetype" SET "__mj_CreatedAt" = NOW()
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
    WHERE tc.relname = 'VideoArchetype' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."VideoArchetype" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."VideoArchetype" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."VideoArchetype"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.VideoArchetype */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.VideoArchetype */
UPDATE __mj."VideoArchetype" SET "__mj_UpdatedAt" = NOW()
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
    WHERE tc.relname = 'VideoArchetype' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."VideoArchetype" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."VideoArchetype" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '371bd000-06fd-4848-b07e-83fb190babaf' OR ("EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('371bd000-06fd-4848-b07e-83fb190babaf', '712D12AA-7673-4221-A3FB-2BB7E4E50677' /* Entity: MJ: Brand Kit Assets */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9d994f0f-7a77-4864-8b4e-59b3eb0a269a' OR ("EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND "Name" = 'BrandKitID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9d994f0f-7a77-4864-8b4e-59b3eb0a269a', '712D12AA-7673-4221-A3FB-2BB7E4E50677' /* Entity: MJ: Brand Kit Assets */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677'), 'BrandKitID', 'Brand Kit ID', 'The brand kit this file belongs to.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '370063B4-E662-43C2-BAB6-88868597AEBD', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '86d3db43-b1ea-4cf0-8b6f-0f0baacc06cb' OR ("EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('86d3db43-b1ea-4cf0-8b6f-0f0baacc06cb', '712D12AA-7673-4221-A3FB-2BB7E4E50677' /* Entity: MJ: Brand Kit Assets */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677'), 'Name', 'Name', 'Display name of the asset.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '491901f6-61d6-4ea4-9ee2-195fd0bd55f6' OR ("EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND "Name" = 'AssetType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('491901f6-61d6-4ea4-9ee2-195fd0bd55f6', '712D12AA-7673-4221-A3FB-2BB7E4E50677' /* Entity: MJ: Brand Kit Assets */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677'), 'AssetType', 'Asset Type', 'Logo, LogoMark, Font, Image, Screenshot, Video, Music, SoundEffect or Other.', 'nvarchar', 60, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c66479ae-40c5-431e-81fa-3213bc22bff0' OR ("EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND "Name" = 'FileID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c66479ae-40c5-431e-81fa-3213bc22bff0', '712D12AA-7673-4221-A3FB-2BB7E4E50677' /* Entity: MJ: Brand Kit Assets */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677'), 'FileID', 'File ID', 'The stored file (MJ: Files).', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, '29248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'de1407be-4ab2-41a5-aa21-5e410cba7aef' OR ("EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND "Name" = 'Usage')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('de1407be-4ab2-41a5-aa21-5e410cba7aef', '712D12AA-7673-4221-A3FB-2BB7E4E50677' /* Entity: MJ: Brand Kit Assets */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677'), 'Usage', 'Usage', 'When and how to use the asset.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8b85f0b7-9ddb-46ca-ab0f-970d9205ae4e' OR ("EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND "Name" = 'IsPrimary')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8b85f0b7-9ddb-46ca-ab0f-970d9205ae4e', '712D12AA-7673-4221-A3FB-2BB7E4E50677' /* Entity: MJ: Brand Kit Assets */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677'), 'IsPrimary', 'Is Primary', 'The main asset of its type, for example the primary logo.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '27e829ad-eadd-4c41-a5d9-5e81aa36c554' OR ("EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND "Name" = 'Sequence')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('27e829ad-eadd-4c41-a5d9-5e81aa36c554', '712D12AA-7673-4221-A3FB-2BB7E4E50677' /* Entity: MJ: Brand Kit Assets */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677'), 'Sequence', 'Sequence', 'Order within the kit; lower first.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8fba9676-8d67-4cd9-8915-bb53c2f12c59' OR ("EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND "Name" = 'LicenseNotes')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8fba9676-8d67-4cd9-8915-bb53c2f12c59', '712D12AA-7673-4221-A3FB-2BB7E4E50677' /* Entity: MJ: Brand Kit Assets */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677'), 'LicenseNotes', 'License Notes', 'Who may use the file, and where (fonts, music, stock imagery).', 'nvarchar', 1000, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cf4c4218-dadf-4610-9921-75a99d4508d9' OR ("EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND "Name" = 'IsGenerationReference')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cf4c4218-dadf-4610-9921-75a99d4508d9', '712D12AA-7673-4221-A3FB-2BB7E4E50677' /* Entity: MJ: Brand Kit Assets */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677'), 'IsGenerationReference', 'Is Generation Reference', 'When set, the file may be sent to image or video generation models as a style or subject reference. Allowed only for Image, Screenshot, Logo, LogoMark and Video assets.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9f49223d-a4b6-414e-a3e8-98eb9acd6b81' OR ("EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9f49223d-a4b6-414e-a3e8-98eb9acd6b81', '712D12AA-7673-4221-A3FB-2BB7E4E50677' /* Entity: MJ: Brand Kit Assets */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '250413c3-e4a3-43f6-9252-6d279d1e2474' OR ("EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('250413c3-e4a3-43f6-9252-6d279d1e2474', '712D12AA-7673-4221-A3FB-2BB7E4E50677' /* Entity: MJ: Brand Kit Assets */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '107628f4-63dd-4598-a78a-ca280ee93c5f' OR ("EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('107628f4-63dd-4598-a78a-ca280ee93c5f', '370063B4-E662-43C2-BAB6-88868597AEBD' /* Entity: MJ: Brand Kits */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b0c62c2c-f7c3-4fc8-820a-b5445e2d7e8c' OR ("EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b0c62c2c-f7c3-4fc8-820a-b5445e2d7e8c', '370063B4-E662-43C2-BAB6-88868597AEBD' /* Entity: MJ: Brand Kits */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD'), 'Name', 'Name', 'Display name of the brand kit.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'aae1cc71-bf47-4611-a904-59c985f9b7ad' OR ("EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('aae1cc71-bf47-4611-a904-59c985f9b7ad', '370063B4-E662-43C2-BAB6-88868597AEBD' /* Entity: MJ: Brand Kits */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD'), 'Description', 'Description', 'What the kit is for and when to use it.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd03a71fc-bfb2-49a8-a190-984b5d102838' OR ("EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD' AND "Name" = 'CompanyID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d03a71fc-bfb2-49a8-a190-984b5d102838', '370063B4-E662-43C2-BAB6-88868597AEBD' /* Entity: MJ: Brand Kits */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD'), 'CompanyID', 'Company ID', 'The company this kit belongs to. NULL means org-wide: available to all companies.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'D4238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '766a7d3b-c4ec-43b0-ad09-4b4ac270ae1f' OR ("EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD' AND "Name" = 'IsDefault')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('766a7d3b-c4ec-43b0-ad09-4b4ac270ae1f', '370063B4-E662-43C2-BAB6-88868597AEBD' /* Entity: MJ: Brand Kits */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD'), 'IsDefault', 'Is Default', 'The kit used when a caller names none. At most one default per CompanyID scope (NULL is its own scope), enforced on save by the server entity.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '74e04c6d-7182-4ae7-977b-8f197523f3e0' OR ("EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('74e04c6d-7182-4ae7-977b-8f197523f3e0', '370063B4-E662-43C2-BAB6-88868597AEBD' /* Entity: MJ: Brand Kits */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD'), 'Status', 'Status', 'Active kits are offered to users and generators; Inactive kits are kept but hidden.', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4127f7a7-f569-4d35-a7c5-804122130f44' OR ("EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD' AND "Name" = 'Style')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4127f7a7-f569-4d35-a7c5-804122130f44', '370063B4-E662-43C2-BAB6-88868597AEBD' /* Entity: MJ: Brand Kits */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD'), 'Style', 'Style', 'JSON (IBrandStyle): palette, typography, imagery style, keep and avoid lists, and an optional Motion section.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9bc6f6cc-144e-447e-9a63-a24cb9025726' OR ("EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD' AND "Name" = 'Voice')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9bc6f6cc-144e-447e-9a63-a24cb9025726', '370063B4-E662-43C2-BAB6-88868597AEBD' /* Entity: MJ: Brand Kits */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD'), 'Voice', 'Voice', 'JSON (IBrandVoice): text-to-speech provider, voice ID, settings and pronunciation notes.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '121e45ac-aff0-407c-9ae6-1f5ac0e23ed2' OR ("EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD' AND "Name" = 'GenerationPolicy')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('121e45ac-aff0-407c-9ae6-1f5ac0e23ed2', '370063B4-E662-43C2-BAB6-88868597AEBD' /* Entity: MJ: Brand Kits */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD'), 'GenerationPolicy', 'Generation Policy', 'JSON (IBrandGenerationPolicy): whether generated images and video may be used, a style prompt, subjects to avoid, whether generated people are allowed (default: not allowed), and an optional per-run generation spend cap. NULL applies the defaults.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2842942b-d4e4-43b9-a644-87f8cc63d213' OR ("EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD' AND "Name" = 'NeverInvent')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2842942b-d4e4-43b9-a644-87f8cc63d213', '370063B4-E662-43C2-BAB6-88868597AEBD' /* Entity: MJ: Brand Kits */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD'), 'NeverInvent', 'Never Invent', 'JSON array of strings: facts about the brand a model must never fabricate, for example product screens, logos, metrics or customer names.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ae27ecc0-d163-46e4-b4aa-9f983b45c6a7' OR ("EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ae27ecc0-d163-46e4-b4aa-9f983b45c6a7', '370063B4-E662-43C2-BAB6-88868597AEBD' /* Entity: MJ: Brand Kits */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8c3e00d5-70e4-4af2-b435-f3884b06b12c' OR ("EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8c3e00d5-70e4-4af2-b435-f3884b06b12c', '370063B4-E662-43C2-BAB6-88868597AEBD' /* Entity: MJ: Brand Kits */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a5c16631-9a01-4645-9438-9ee404698d6f' OR ("EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a5c16631-9a01-4645-9438-9ee404698d6f', '8ECBEA4B-2D6B-44E1-886C-96E904637866' /* Entity: MJ: Video Archetypes */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866'), 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3af49dfe-0e00-45d8-b8e7-7165dee9fb2b' OR ("EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND "Name" = 'Name')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('3af49dfe-0e00-45d8-b8e7-7165dee9fb2b', '8ECBEA4B-2D6B-44E1-886C-96E904637866' /* Entity: MJ: Video Archetypes */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866'), 'Name', 'Name', 'Archetype name, unique within its CompanyID scope.', 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, TRUE, TRUE, FALSE, TRUE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c707c4cc-aa68-4179-92bb-a61dab9299ce' OR ("EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND "Name" = 'Description')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c707c4cc-aa68-4179-92bb-a61dab9299ce', '8ECBEA4B-2D6B-44E1-886C-96E904637866' /* Entity: MJ: Video Archetypes */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866'), 'Description', 'Description', 'What the archetype is for; the Director reads it to pick one.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '758729b8-8762-4843-8e04-046702ec1bcc' OR ("EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND "Name" = 'CompanyID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('758729b8-8762-4843-8e04-046702ec1bcc', '8ECBEA4B-2D6B-44E1-886C-96E904637866' /* Entity: MJ: Video Archetypes */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866'), 'CompanyID', 'Company ID', 'The company that owns this archetype. NULL means shipped or org-wide: available to all companies.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'D4238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '369870f9-fe4a-46fa-8485-9dad58b865ba' OR ("EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND "Name" = 'Category')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('369870f9-fe4a-46fa-8485-9dad58b865ba', '8ECBEA4B-2D6B-44E1-886C-96E904637866' /* Entity: MJ: Video Archetypes */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866'), 'Category', 'Category', 'Explainer, Product, DataStory, Social, Tutorial, Announcement or Briefing.', 'nvarchar', 60, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '719bc5fe-8c94-4bc4-94ba-c48f21e0baab' OR ("EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('719bc5fe-8c94-4bc4-94ba-c48f21e0baab', '8ECBEA4B-2D6B-44E1-886C-96E904637866' /* Entity: MJ: Video Archetypes */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866'), 'Status', 'Status', 'Active archetypes are offered; Inactive are hidden.', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2001b8cb-51a3-42a0-ab09-c739f43ad152' OR ("EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND "Name" = 'DefaultDurationSeconds')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2001b8cb-51a3-42a0-ab09-c739f43ad152', '8ECBEA4B-2D6B-44E1-886C-96E904637866' /* Entity: MJ: Video Archetypes */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866'), 'DefaultDurationSeconds', 'Default Duration Seconds', 'Default film length, in seconds.', 'int', 4, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e712d169-83f7-4dc6-a00b-e357a30982c1' OR ("EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND "Name" = 'MinDurationSeconds')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e712d169-83f7-4dc6-a00b-e357a30982c1', '8ECBEA4B-2D6B-44E1-886C-96E904637866' /* Entity: MJ: Video Archetypes */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866'), 'MinDurationSeconds', 'Min Duration Seconds', 'Shortest film length, in seconds.', 'int', 4, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd9527dc0-cc7d-45f1-ae8f-bbc8d84ca5aa' OR ("EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND "Name" = 'MaxDurationSeconds')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d9527dc0-cc7d-45f1-ae8f-bbc8d84ca5aa', '8ECBEA4B-2D6B-44E1-886C-96E904637866' /* Entity: MJ: Video Archetypes */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866'), 'MaxDurationSeconds', 'Max Duration Seconds', 'Longest film length, in seconds.', 'int', 4, 10, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9eae3b9a-7286-42da-ab64-ddce6dcc047f' OR ("EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND "Name" = 'DefaultFormats')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9eae3b9a-7286-42da-ab64-ddce6dcc047f', '8ECBEA4B-2D6B-44E1-886C-96E904637866' /* Entity: MJ: Video Archetypes */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866'), 'DefaultFormats', 'Default Formats', 'Comma-separated default formats: any of 16:9, 9:16, 1:1.', 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '05edd1b4-678f-4205-bd62-de2da303721b' OR ("EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND "Name" = 'BeatTemplate')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('05edd1b4-678f-4205-bd62-de2da303721b', '8ECBEA4B-2D6B-44E1-886C-96E904637866' /* Entity: MJ: Video Archetypes */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866'), 'BeatTemplate', 'Beat Template', 'JSON array (VideoBeatTemplate[]): the beat slots a film of this archetype follows, with per-beat duration bounds.', 'nvarchar', -1, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '18857309-b686-4d77-a196-beaf4fd3e726' OR ("EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND "Name" = 'Pacing')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('18857309-b686-4d77-a196-beaf4fd3e726', '8ECBEA4B-2D6B-44E1-886C-96E904637866' /* Entity: MJ: Video Archetypes */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866'), 'Pacing', 'Pacing', 'JSON (VideoPacing): cut cadence and hold rules.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '719265b7-aec8-473d-a147-119720393d95' OR ("EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND "Name" = 'Guidance')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('719265b7-aec8-473d-a147-119720393d95', '8ECBEA4B-2D6B-44E1-886C-96E904637866' /* Entity: MJ: Video Archetypes */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866'), 'Guidance', 'Guidance', 'Markdown guidance for the Director and Storyboard.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4b772e66-6f9d-4ea9-b0dd-ef62cce3b01b' OR ("EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND "Name" = 'DefaultInteractionMode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4b772e66-6f9d-4ea9-b0dd-ef62cce3b01b', '8ECBEA4B-2D6B-44E1-886C-96E904637866' /* Entity: MJ: Video Archetypes */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866'), 'DefaultInteractionMode', 'Default Interaction Mode', 'Default approval mode: Autonomous, ApproveStoryboard or ApproveStoryboardAndRoughCut.', 'nvarchar', 60, 0, 0, FALSE, 'Autonomous', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cd593def-6411-440f-9d73-c9dff0b14b32' OR ("EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('cd593def-6411-440f-9d73-c9dff0b14b32', '8ECBEA4B-2D6B-44E1-886C-96E904637866' /* Entity: MJ: Video Archetypes */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866'), '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a94077a5-92be-4f0d-b62f-9942b27f887b' OR ("EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a94077a5-92be-4f0d-b62f-9942b27f887b', '8ECBEA4B-2D6B-44E1-886C-96E904637866' /* Entity: MJ: Video Archetypes */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866'), '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 9a3ca880-b97f-4fb8-bd5f-53b527678929 */
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
    '9a3ca880-b97f-4fb8-bd5f-53b527678929',
    '491901F6-61D6-4EA4-9EE2-195FD0BD55F6',
    1,
    'Font',
    'Font',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID c77e7ed1-a5ad-4a04-b32e-8333deb09b12 */
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
    'c77e7ed1-a5ad-4a04-b32e-8333deb09b12',
    '491901F6-61D6-4EA4-9EE2-195FD0BD55F6',
    2,
    'Image',
    'Image',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 547e735f-eb9d-4bf0-b901-6c0ccad8f177 */
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
    '547e735f-eb9d-4bf0-b901-6c0ccad8f177',
    '491901F6-61D6-4EA4-9EE2-195FD0BD55F6',
    3,
    'Logo',
    'Logo',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 3ad01002-b1f3-490b-b7ca-4b614b1414bf */
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
    '3ad01002-b1f3-490b-b7ca-4b614b1414bf',
    '491901F6-61D6-4EA4-9EE2-195FD0BD55F6',
    4,
    'LogoMark',
    'LogoMark',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 3406d051-f750-473a-99a4-ee5043b66b36 */
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
    '3406d051-f750-473a-99a4-ee5043b66b36',
    '491901F6-61D6-4EA4-9EE2-195FD0BD55F6',
    5,
    'Music',
    'Music',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 3993c1cb-dafb-4495-9032-d21bfd76feb4 */
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
    '3993c1cb-dafb-4495-9032-d21bfd76feb4',
    '491901F6-61D6-4EA4-9EE2-195FD0BD55F6',
    6,
    'Other',
    'Other',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 13195cf2-604b-4240-86f7-a0f44893c35d */
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
    '13195cf2-604b-4240-86f7-a0f44893c35d',
    '491901F6-61D6-4EA4-9EE2-195FD0BD55F6',
    7,
    'Screenshot',
    'Screenshot',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID c6724a87-f5d7-4213-a616-a0d02b78b692 */
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
    'c6724a87-f5d7-4213-a616-a0d02b78b692',
    '491901F6-61D6-4EA4-9EE2-195FD0BD55F6',
    8,
    'SoundEffect',
    'SoundEffect',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 104df2af-e060-4368-8c8e-f05394c2c469 */
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
    '104df2af-e060-4368-8c8e-f05394c2c469',
    '491901F6-61D6-4EA4-9EE2-195FD0BD55F6',
    9,
    'Video',
    'Video',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 491901F6-61D6-4EA4-9EE2-195FD0BD55F6 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '491901F6-61D6-4EA4-9EE2-195FD0BD55F6';
/* SQL text to insert entity field value with ID 029e3686-a125-4add-8229-2f4cabb1f392 */
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
    '029e3686-a125-4add-8229-2f4cabb1f392',
    '74E04C6D-7182-4AE7-977B-8F197523F3E0',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 05f0f878-4f03-4b75-90d7-a03495c28427 */
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
    '05f0f878-4f03-4b75-90d7-a03495c28427',
    '74E04C6D-7182-4AE7-977B-8F197523F3E0',
    2,
    'Inactive',
    'Inactive',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 74E04C6D-7182-4AE7-977B-8F197523F3E0 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '74E04C6D-7182-4AE7-977B-8F197523F3E0';
/* SQL text to insert entity field value with ID 4fdef9ab-7f22-4a4d-8eb5-0aa6eb21481b */
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
    '4fdef9ab-7f22-4a4d-8eb5-0aa6eb21481b',
    '369870F9-FE4A-46FA-8485-9DAD58B865BA',
    1,
    'Announcement',
    'Announcement',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 5f8e86df-fdf4-448c-bbdf-807d75246b09 */
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
    '5f8e86df-fdf4-448c-bbdf-807d75246b09',
    '369870F9-FE4A-46FA-8485-9DAD58B865BA',
    2,
    'Briefing',
    'Briefing',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 8dc4850f-feb9-4552-bea5-febdc32db9ff */
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
    '8dc4850f-feb9-4552-bea5-febdc32db9ff',
    '369870F9-FE4A-46FA-8485-9DAD58B865BA',
    3,
    'DataStory',
    'DataStory',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 28d5eac2-cadc-4b63-b19e-72e8a57de900 */
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
    '28d5eac2-cadc-4b63-b19e-72e8a57de900',
    '369870F9-FE4A-46FA-8485-9DAD58B865BA',
    4,
    'Explainer',
    'Explainer',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 6d4d4bbf-befe-440b-bdb1-e8c5ecf2d058 */
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
    '6d4d4bbf-befe-440b-bdb1-e8c5ecf2d058',
    '369870F9-FE4A-46FA-8485-9DAD58B865BA',
    5,
    'Product',
    'Product',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 0d63f87c-06c2-432e-8940-74babcc92087 */
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
    '0d63f87c-06c2-432e-8940-74babcc92087',
    '369870F9-FE4A-46FA-8485-9DAD58B865BA',
    6,
    'Social',
    'Social',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 85836d37-2c4f-459c-a7b8-e37ea2c34914 */
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
    '85836d37-2c4f-459c-a7b8-e37ea2c34914',
    '369870F9-FE4A-46FA-8485-9DAD58B865BA',
    7,
    'Tutorial',
    'Tutorial',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 369870F9-FE4A-46FA-8485-9DAD58B865BA */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '369870F9-FE4A-46FA-8485-9DAD58B865BA';
/* SQL text to insert entity field value with ID 611afafb-3d86-45df-aa95-61bda7228d60 */
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
    '611afafb-3d86-45df-aa95-61bda7228d60',
    '719BC5FE-8C94-4BC4-94BA-C48F21E0BAAB',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID bf9c0505-d475-43e4-b19c-2da0e8d54f7a */
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
    'bf9c0505-d475-43e4-b19c-2da0e8d54f7a',
    '719BC5FE-8C94-4BC4-94BA-C48F21E0BAAB',
    2,
    'Inactive',
    'Inactive',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 719BC5FE-8C94-4BC4-94BA-C48F21E0BAAB */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '719BC5FE-8C94-4BC4-94BA-C48F21E0BAAB';
/* SQL text to insert entity field value with ID 7145150e-7060-4442-b822-771648d01dac */
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
    '7145150e-7060-4442-b822-771648d01dac',
    '4B772E66-6F9D-4EA9-B0DD-EF62CCE3B01B',
    1,
    'ApproveStoryboard',
    'ApproveStoryboard',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 8f2b17ed-7c15-4b99-b3ba-e70fc8e18c2b */
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
    '8f2b17ed-7c15-4b99-b3ba-e70fc8e18c2b',
    '4B772E66-6F9D-4EA9-B0DD-EF62CCE3B01B',
    2,
    'ApproveStoryboardAndRoughCut',
    'ApproveStoryboardAndRoughCut',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 78c16557-6d36-440c-a866-9f0b2e630035 */
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
    '78c16557-6d36-440c-a866-9f0b2e630035',
    '4B772E66-6F9D-4EA9-B0DD-EF62CCE3B01B',
    3,
    'Autonomous',
    'Autonomous',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 4B772E66-6F9D-4EA9-B0DD-EF62CCE3B01B */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '4B772E66-6F9D-4EA9-B0DD-EF62CCE3B01B';
/* Create Entity Relationship: MJ: Companies -> MJ: Brand Kits (One To Many via CompanyID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '21916f81-ae3b-4101-ae5f-2985cd864f7b') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('21916f81-ae3b-4101-ae5f-2985cd864f7b', 'D4238F34-2837-EF11-86D4-6045BDEE16E6', '370063B4-E662-43C2-BAB6-88868597AEBD', 'CompanyID', 'One To Many', TRUE, TRUE, 7, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '8f3c0693-1f9b-40a5-bc6e-1a4408826c36') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8f3c0693-1f9b-40a5-bc6e-1a4408826c36', 'D4238F34-2837-EF11-86D4-6045BDEE16E6', '8ECBEA4B-2D6B-44E1-886C-96E904637866', 'CompanyID', 'One To Many', TRUE, TRUE, 8, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '078da4a2-deb6-4887-bf2d-26a1dad153cc') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('078da4a2-deb6-4887-bf2d-26a1dad153cc', '29248F34-2837-EF11-86D4-6045BDEE16E6', '712D12AA-7673-4221-A3FB-2BB7E4E50677', 'FileID', 'One To Many', TRUE, TRUE, 9, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '81281ed2-bb13-4cd4-82c8-48fce0bf9246') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('81281ed2-bb13-4cd4-82c8-48fce0bf9246', '370063B4-E662-43C2-BAB6-88868597AEBD', '712D12AA-7673-4221-A3FB-2BB7E4E50677', 'BrandKitID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd21a88af-a314-4fac-b08f-eabb9307bb69' OR ("EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND "Name" = 'BrandKit')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d21a88af-a314-4fac-b08f-eabb9307bb69', '712D12AA-7673-4221-A3FB-2BB7E4E50677' /* Entity: MJ: Brand Kit Assets */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677'), 'BrandKit', 'Brand Kit', NULL, 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '83673970-247a-47ac-8ae2-c794169d23bd' OR ("EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND "Name" = 'File')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('83673970-247a-47ac-8ae2-c794169d23bd', '712D12AA-7673-4221-A3FB-2BB7E4E50677' /* Entity: MJ: Brand Kit Assets */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '712D12AA-7673-4221-A3FB-2BB7E4E50677'), 'File', 'File', NULL, 'nvarchar', 1000, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '344e9271-48b4-4ce0-93ed-5cdf2a734da5' OR ("EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD' AND "Name" = 'Company')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('344e9271-48b4-4ce0-93ed-5cdf2a734da5', '370063B4-E662-43C2-BAB6-88868597AEBD' /* Entity: MJ: Brand Kits */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '370063B4-E662-43C2-BAB6-88868597AEBD'), 'Company', 'Company', NULL, 'nvarchar', 100, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '23a96fc8-aed2-4ae4-b138-016149359579' OR ("EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND "Name" = 'Company')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('23a96fc8-aed2-4ae4-b138-016149359579', '8ECBEA4B-2D6B-44E1-886C-96E904637866' /* Entity: MJ: Video Archetypes */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '8ECBEA4B-2D6B-44E1-886C-96E904637866'), 'Company', 'Company', NULL, 'nvarchar', 100, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;
