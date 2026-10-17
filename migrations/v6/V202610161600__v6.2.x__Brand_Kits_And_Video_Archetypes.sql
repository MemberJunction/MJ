-- =====================================================================
-- Brand Kits and Video Archetypes (v6.2.x)
-- =====================================================================
--
-- Creates three core tables:
--   1. BrandKit        — General core entity holding colors, typography,
--                        voice, generation policy, facts never to invent,
--                        and associated assets so any generator, form, or
--                        application can stay on brand (D16). Video Studio
--                        is its first consumer. "One default kit per
--                        CompanyID scope" is enforced on save by
--                        MJBrandKitEntityServer (VS-FND-5), not here.
--   2. BrandKitAsset   — Files belonging to a brand kit (logos, fonts,
--                        reference imagery, music, etc.) with usage
--                        guidance, license notes, and generation-reference
--                        eligibility.
--   3. VideoArchetype  — Film templates with duration bounds, default
--                        formats, beat templates, pacing, and guidance.
--
-- Note: DDL + extended properties only. Views, sprocs, FK indexes, the
-- __mj_CreatedAt/__mj_UpdatedAt columns + triggers, and the EntityField /
-- entity-class metadata are all produced by CodeGen from this schema and
-- appended below the CODEGEN OUTPUT banner.
-- =====================================================================

CREATE TABLE ${flyway:defaultSchema}.BrandKit (
    ID               UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_BrandKit_ID DEFAULT (NEWSEQUENTIALID()),
    Name             NVARCHAR(255)    NOT NULL,
    Description      NVARCHAR(MAX)    NULL,
    CompanyID        UNIQUEIDENTIFIER NULL,
    IsDefault        BIT              NOT NULL CONSTRAINT DF_BrandKit_IsDefault DEFAULT (0),
    Status           NVARCHAR(20)     NOT NULL CONSTRAINT DF_BrandKit_Status DEFAULT (N'Active'),
    Style            NVARCHAR(MAX)    NULL,
    Voice            NVARCHAR(MAX)    NULL,
    GenerationPolicy NVARCHAR(MAX)    NULL,
    NeverInvent      NVARCHAR(MAX)    NULL,
    CONSTRAINT PK_BrandKit PRIMARY KEY (ID),
    CONSTRAINT FK_BrandKit_Company
        FOREIGN KEY (CompanyID) REFERENCES ${flyway:defaultSchema}.Company(ID),
    CONSTRAINT CK_BrandKit_Status
        CHECK (Status IN (N'Active', N'Inactive'))
);
GO

CREATE TABLE ${flyway:defaultSchema}.BrandKitAsset (
    ID                    UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_BrandKitAsset_ID DEFAULT (NEWSEQUENTIALID()),
    BrandKitID            UNIQUEIDENTIFIER NOT NULL,
    Name                  NVARCHAR(255)    NOT NULL,
    AssetType             NVARCHAR(30)     NOT NULL,
    FileID                UNIQUEIDENTIFIER NOT NULL,
    Usage                 NVARCHAR(MAX)    NULL,
    IsPrimary             BIT              NOT NULL CONSTRAINT DF_BrandKitAsset_IsPrimary DEFAULT (0),
    Sequence              INT              NOT NULL CONSTRAINT DF_BrandKitAsset_Sequence DEFAULT (0),
    LicenseNotes          NVARCHAR(500)    NULL,
    IsGenerationReference BIT              NOT NULL CONSTRAINT DF_BrandKitAsset_IsGenerationReference DEFAULT (0),
    CONSTRAINT PK_BrandKitAsset PRIMARY KEY (ID),
    CONSTRAINT FK_BrandKitAsset_BrandKit
        FOREIGN KEY (BrandKitID) REFERENCES ${flyway:defaultSchema}.BrandKit(ID),
    CONSTRAINT FK_BrandKitAsset_File
        FOREIGN KEY (FileID) REFERENCES ${flyway:defaultSchema}.[File](ID),
    CONSTRAINT CK_BrandKitAsset_AssetType
        CHECK (AssetType IN (N'Logo', N'LogoMark', N'Font', N'Image', N'Screenshot', N'Video', N'Music', N'SoundEffect', N'Other')),
    CONSTRAINT CK_BrandKitAsset_GenerationReference
        CHECK (IsGenerationReference = 0 OR AssetType IN (N'Image', N'Screenshot', N'Logo', N'LogoMark', N'Video'))
);
GO

CREATE TABLE ${flyway:defaultSchema}.VideoArchetype (
    ID                     UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_VideoArchetype_ID DEFAULT (NEWSEQUENTIALID()),
    Name                   NVARCHAR(100)    NOT NULL,
    Description            NVARCHAR(MAX)    NOT NULL,
    CompanyID              UNIQUEIDENTIFIER NULL,
    Category               NVARCHAR(30)     NOT NULL,
    Status                 NVARCHAR(20)     NOT NULL CONSTRAINT DF_VideoArchetype_Status DEFAULT (N'Active'),
    DefaultDurationSeconds INT              NOT NULL,
    MinDurationSeconds     INT              NOT NULL,
    MaxDurationSeconds     INT              NOT NULL,
    DefaultFormats         NVARCHAR(100)    NOT NULL,
    BeatTemplate           NVARCHAR(MAX)    NOT NULL,
    Pacing                 NVARCHAR(MAX)    NULL,
    Guidance               NVARCHAR(MAX)    NULL,
    DefaultInteractionMode NVARCHAR(30)     NOT NULL CONSTRAINT DF_VideoArchetype_DefaultInteractionMode DEFAULT (N'Autonomous'),
    CONSTRAINT PK_VideoArchetype PRIMARY KEY (ID),
    CONSTRAINT FK_VideoArchetype_Company
        FOREIGN KEY (CompanyID) REFERENCES ${flyway:defaultSchema}.Company(ID),
    CONSTRAINT UQ_VideoArchetype_CompanyID_Name
        UNIQUE (CompanyID, Name),
    CONSTRAINT CK_VideoArchetype_Category
        CHECK (Category IN (N'Explainer', N'Product', N'DataStory', N'Social', N'Tutorial', N'Announcement', N'Briefing')),
    CONSTRAINT CK_VideoArchetype_Status
        CHECK (Status IN (N'Active', N'Inactive')),
    CONSTRAINT CK_VideoArchetype_DefaultInteractionMode
        CHECK (DefaultInteractionMode IN (N'Autonomous', N'ApproveStoryboard', N'ApproveStoryboardAndRoughCut')),
    CONSTRAINT CK_VideoArchetype_Durations
        CHECK (MinDurationSeconds > 0 AND MinDurationSeconds <= DefaultDurationSeconds AND DefaultDurationSeconds <= MaxDurationSeconds)
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'A brand kit: colors, type, voice, generation policy, facts never to invent, and the files (logos, fonts, reference imagery, music) that generators, forms and applications use to stay on brand. CompanyID NULL makes the kit available to all companies.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'BrandKit';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Display name of the brand kit.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'BrandKit', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'What the kit is for and when to use it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'BrandKit', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The company this kit belongs to. NULL means org-wide: available to all companies.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'BrandKit', @level2type = N'COLUMN', @level2name = N'CompanyID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The kit used when a caller names none. At most one default per CompanyID scope (NULL is its own scope), enforced on save by the server entity.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'BrandKit', @level2type = N'COLUMN', @level2name = N'IsDefault';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Active kits are offered to users and generators; Inactive kits are kept but hidden.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'BrandKit', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON (IBrandStyle): palette, typography, imagery style, keep and avoid lists, and an optional Motion section.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'BrandKit', @level2type = N'COLUMN', @level2name = N'Style';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON (IBrandVoice): text-to-speech provider, voice ID, settings and pronunciation notes.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'BrandKit', @level2type = N'COLUMN', @level2name = N'Voice';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON (IBrandGenerationPolicy): whether generated images and video may be used, a style prompt, subjects to avoid, whether generated people are allowed (default: not allowed), and an optional per-run generation spend cap. NULL applies the defaults.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'BrandKit', @level2type = N'COLUMN', @level2name = N'GenerationPolicy';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of strings: facts about the brand a model must never fabricate, for example product screens, logos, metrics or customer names.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'BrandKit', @level2type = N'COLUMN', @level2name = N'NeverInvent';
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'A file in a brand kit, with usage guidance, license notes, and whether generation models may receive it as a reference.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'BrandKitAsset';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The brand kit this file belongs to.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'BrandKitAsset', @level2type = N'COLUMN', @level2name = N'BrandKitID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Display name of the asset.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'BrandKitAsset', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Logo, LogoMark, Font, Image, Screenshot, Video, Music, SoundEffect or Other.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'BrandKitAsset', @level2type = N'COLUMN', @level2name = N'AssetType';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The stored file (MJ: Files).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'BrandKitAsset', @level2type = N'COLUMN', @level2name = N'FileID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When and how to use the asset.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'BrandKitAsset', @level2type = N'COLUMN', @level2name = N'Usage';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The main asset of its type, for example the primary logo.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'BrandKitAsset', @level2type = N'COLUMN', @level2name = N'IsPrimary';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Order within the kit; lower first.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'BrandKitAsset', @level2type = N'COLUMN', @level2name = N'Sequence';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Who may use the file, and where (fonts, music, stock imagery).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'BrandKitAsset', @level2type = N'COLUMN', @level2name = N'LicenseNotes';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When set, the file may be sent to image or video generation models as a style or subject reference. Allowed only for Image, Screenshot, Logo, LogoMark and Video assets.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'BrandKitAsset', @level2type = N'COLUMN', @level2name = N'IsGenerationReference';
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'A Video Studio film template: duration bounds, default formats, a beat template, pacing, and guidance for the Director and Storyboard. CompanyID NULL marks a shipped or org-wide archetype.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'VideoArchetype';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Archetype name, unique within its CompanyID scope.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'VideoArchetype', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'What the archetype is for; the Director reads it to pick one.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'VideoArchetype', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The company that owns this archetype. NULL means shipped or org-wide: available to all companies.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'VideoArchetype', @level2type = N'COLUMN', @level2name = N'CompanyID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Explainer, Product, DataStory, Social, Tutorial, Announcement or Briefing.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'VideoArchetype', @level2type = N'COLUMN', @level2name = N'Category';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Active archetypes are offered; Inactive are hidden.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'VideoArchetype', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Default film length, in seconds.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'VideoArchetype', @level2type = N'COLUMN', @level2name = N'DefaultDurationSeconds';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Shortest film length, in seconds.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'VideoArchetype', @level2type = N'COLUMN', @level2name = N'MinDurationSeconds';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Longest film length, in seconds.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'VideoArchetype', @level2type = N'COLUMN', @level2name = N'MaxDurationSeconds';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Comma-separated default formats: any of 16:9, 9:16, 1:1.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'VideoArchetype', @level2type = N'COLUMN', @level2name = N'DefaultFormats';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array (VideoBeatTemplate[]): the beat slots a film of this archetype follows, with per-beat duration bounds.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'VideoArchetype', @level2type = N'COLUMN', @level2name = N'BeatTemplate';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON (VideoPacing): cut cadence and hold rules.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'VideoArchetype', @level2type = N'COLUMN', @level2name = N'Pacing';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Markdown guidance for the Director and Storyboard.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'VideoArchetype', @level2type = N'COLUMN', @level2name = N'Guidance';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Default approval mode: Autonomous, ApproveStoryboard or ApproveStoryboardAndRoughCut.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'VideoArchetype', @level2type = N'COLUMN', @level2name = N'DefaultInteractionMode';
GO























































/**************************************************************************************************
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
 **************************************************************************************************/

/* SQL generated to create new entity MJ: Video Archetypes */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '8ecbea4b-2d6b-44e1-886c-96e904637866',
         'MJ: Video Archetypes',
         'Video Archetypes',
         'A Video Studio film template: duration bounds, default formats, a beat template, pacing, and guidance for the Director and Storyboard. CompanyID NULL marks a shipped or org-wide archetype.',
         NULL,
         'VideoArchetype',
         'vwVideoArchetypes',
         '${flyway:defaultSchema}',
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Video Archetypes to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '8ecbea4b-2d6b-44e1-886c-96e904637866', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Video Archetypes for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('8ecbea4b-2d6b-44e1-886c-96e904637866' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('8ecbea4b-2d6b-44e1-886c-96e904637866' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Video Archetypes for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('8ecbea4b-2d6b-44e1-886c-96e904637866' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('8ecbea4b-2d6b-44e1-886c-96e904637866' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Video Archetypes for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('8ecbea4b-2d6b-44e1-886c-96e904637866' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('8ecbea4b-2d6b-44e1-886c-96e904637866' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Brand Kits */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '370063b4-e662-43c2-bab6-88868597aebd',
         'MJ: Brand Kits',
         'Brand Kits',
         'A brand kit: colors, type, voice, generation policy, facts never to invent, and the files (logos, fonts, reference imagery, music) that generators, forms and applications use to stay on brand. CompanyID NULL makes the kit available to all companies.',
         NULL,
         'BrandKit',
         'vwBrandKits',
         '${flyway:defaultSchema}',
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Brand Kits to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '370063b4-e662-43c2-bab6-88868597aebd', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Brand Kits for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('370063b4-e662-43c2-bab6-88868597aebd' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('370063b4-e662-43c2-bab6-88868597aebd' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Brand Kits for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('370063b4-e662-43c2-bab6-88868597aebd' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('370063b4-e662-43c2-bab6-88868597aebd' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Brand Kits for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('370063b4-e662-43c2-bab6-88868597aebd' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('370063b4-e662-43c2-bab6-88868597aebd' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Brand Kit Assets */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '712d12aa-7673-4221-a3fb-2bb7e4e50677',
         'MJ: Brand Kit Assets',
         'Brand Kit Assets',
         'A file in a brand kit, with usage guidance, license notes, and whether generation models may receive it as a reference.',
         NULL,
         'BrandKitAsset',
         'vwBrandKitAssets',
         '${flyway:defaultSchema}',
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Brand Kit Assets to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '712d12aa-7673-4221-a3fb-2bb7e4e50677', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Brand Kit Assets for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('712d12aa-7673-4221-a3fb-2bb7e4e50677' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('712d12aa-7673-4221-a3fb-2bb7e4e50677' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Brand Kit Assets for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('712d12aa-7673-4221-a3fb-2bb7e4e50677' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('712d12aa-7673-4221-a3fb-2bb7e4e50677' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Brand Kit Assets for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('712d12aa-7673-4221-a3fb-2bb7e4e50677' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('712d12aa-7673-4221-a3fb-2bb7e4e50677' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.BrandKitAsset */
ALTER TABLE [${flyway:defaultSchema}].[BrandKitAsset] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.BrandKitAsset */
UPDATE [${flyway:defaultSchema}].[BrandKitAsset] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.BrandKitAsset */
ALTER TABLE [${flyway:defaultSchema}].[BrandKitAsset] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.BrandKitAsset */
ALTER TABLE [${flyway:defaultSchema}].[BrandKitAsset] ADD CONSTRAINT [DF___mj_BrandKitAsset___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.BrandKitAsset */
ALTER TABLE [${flyway:defaultSchema}].[BrandKitAsset] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.BrandKitAsset */
UPDATE [${flyway:defaultSchema}].[BrandKitAsset] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.BrandKitAsset */
ALTER TABLE [${flyway:defaultSchema}].[BrandKitAsset] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.BrandKitAsset */
ALTER TABLE [${flyway:defaultSchema}].[BrandKitAsset] ADD CONSTRAINT [DF___mj_BrandKitAsset___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.BrandKit */
ALTER TABLE [${flyway:defaultSchema}].[BrandKit] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.BrandKit */
UPDATE [${flyway:defaultSchema}].[BrandKit] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.BrandKit */
ALTER TABLE [${flyway:defaultSchema}].[BrandKit] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.BrandKit */
ALTER TABLE [${flyway:defaultSchema}].[BrandKit] ADD CONSTRAINT [DF___mj_BrandKit___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.BrandKit */
ALTER TABLE [${flyway:defaultSchema}].[BrandKit] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.BrandKit */
UPDATE [${flyway:defaultSchema}].[BrandKit] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.BrandKit */
ALTER TABLE [${flyway:defaultSchema}].[BrandKit] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.BrandKit */
ALTER TABLE [${flyway:defaultSchema}].[BrandKit] ADD CONSTRAINT [DF___mj_BrandKit___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.VideoArchetype */
ALTER TABLE [${flyway:defaultSchema}].[VideoArchetype] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.VideoArchetype */
UPDATE [${flyway:defaultSchema}].[VideoArchetype] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.VideoArchetype */
ALTER TABLE [${flyway:defaultSchema}].[VideoArchetype] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.VideoArchetype */
ALTER TABLE [${flyway:defaultSchema}].[VideoArchetype] ADD CONSTRAINT [DF___mj_VideoArchetype___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.VideoArchetype */
ALTER TABLE [${flyway:defaultSchema}].[VideoArchetype] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.VideoArchetype */
UPDATE [${flyway:defaultSchema}].[VideoArchetype] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.VideoArchetype */
ALTER TABLE [${flyway:defaultSchema}].[VideoArchetype] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.VideoArchetype */
ALTER TABLE [${flyway:defaultSchema}].[VideoArchetype] ADD CONSTRAINT [DF___mj_VideoArchetype___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 40 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '371bd000-06fd-4848-b07e-83fb190babaf' OR (EntityID = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '371bd000-06fd-4848-b07e-83fb190babaf',
            '712D12AA-7673-4221-A3FB-2BB7E4E50677', -- Entity: MJ: Brand Kit Assets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '712D12AA-7673-4221-A3FB-2BB7E4E50677'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9d994f0f-7a77-4864-8b4e-59b3eb0a269a' OR (EntityID = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND Name = 'BrandKitID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9d994f0f-7a77-4864-8b4e-59b3eb0a269a',
            '712D12AA-7673-4221-A3FB-2BB7E4E50677', -- Entity: MJ: Brand Kit Assets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '712D12AA-7673-4221-A3FB-2BB7E4E50677'),
            'BrandKitID',
            'Brand Kit ID',
            'The brand kit this file belongs to.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '370063B4-E662-43C2-BAB6-88868597AEBD',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '86d3db43-b1ea-4cf0-8b6f-0f0baacc06cb' OR (EntityID = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '86d3db43-b1ea-4cf0-8b6f-0f0baacc06cb',
            '712D12AA-7673-4221-A3FB-2BB7E4E50677', -- Entity: MJ: Brand Kit Assets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '712D12AA-7673-4221-A3FB-2BB7E4E50677'),
            'Name',
            'Name',
            'Display name of the asset.',
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '491901f6-61d6-4ea4-9ee2-195fd0bd55f6' OR (EntityID = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND Name = 'AssetType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '491901f6-61d6-4ea4-9ee2-195fd0bd55f6',
            '712D12AA-7673-4221-A3FB-2BB7E4E50677', -- Entity: MJ: Brand Kit Assets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '712D12AA-7673-4221-A3FB-2BB7E4E50677'),
            'AssetType',
            'Asset Type',
            'Logo, LogoMark, Font, Image, Screenshot, Video, Music, SoundEffect or Other.',
            'nvarchar',
            60,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c66479ae-40c5-431e-81fa-3213bc22bff0' OR (EntityID = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND Name = 'FileID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c66479ae-40c5-431e-81fa-3213bc22bff0',
            '712D12AA-7673-4221-A3FB-2BB7E4E50677', -- Entity: MJ: Brand Kit Assets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '712D12AA-7673-4221-A3FB-2BB7E4E50677'),
            'FileID',
            'File ID',
            'The stored file (MJ: Files).',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '29248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'de1407be-4ab2-41a5-aa21-5e410cba7aef' OR (EntityID = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND Name = 'Usage')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'de1407be-4ab2-41a5-aa21-5e410cba7aef',
            '712D12AA-7673-4221-A3FB-2BB7E4E50677', -- Entity: MJ: Brand Kit Assets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '712D12AA-7673-4221-A3FB-2BB7E4E50677'),
            'Usage',
            'Usage',
            'When and how to use the asset.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8b85f0b7-9ddb-46ca-ab0f-970d9205ae4e' OR (EntityID = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND Name = 'IsPrimary')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8b85f0b7-9ddb-46ca-ab0f-970d9205ae4e',
            '712D12AA-7673-4221-A3FB-2BB7E4E50677', -- Entity: MJ: Brand Kit Assets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '712D12AA-7673-4221-A3FB-2BB7E4E50677'),
            'IsPrimary',
            'Is Primary',
            'The main asset of its type, for example the primary logo.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '27e829ad-eadd-4c41-a5d9-5e81aa36c554' OR (EntityID = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND Name = 'Sequence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '27e829ad-eadd-4c41-a5d9-5e81aa36c554',
            '712D12AA-7673-4221-A3FB-2BB7E4E50677', -- Entity: MJ: Brand Kit Assets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '712D12AA-7673-4221-A3FB-2BB7E4E50677'),
            'Sequence',
            'Sequence',
            'Order within the kit; lower first.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8fba9676-8d67-4cd9-8915-bb53c2f12c59' OR (EntityID = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND Name = 'LicenseNotes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8fba9676-8d67-4cd9-8915-bb53c2f12c59',
            '712D12AA-7673-4221-A3FB-2BB7E4E50677', -- Entity: MJ: Brand Kit Assets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '712D12AA-7673-4221-A3FB-2BB7E4E50677'),
            'LicenseNotes',
            'License Notes',
            'Who may use the file, and where (fonts, music, stock imagery).',
            'nvarchar',
            1000,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cf4c4218-dadf-4610-9921-75a99d4508d9' OR (EntityID = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND Name = 'IsGenerationReference')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cf4c4218-dadf-4610-9921-75a99d4508d9',
            '712D12AA-7673-4221-A3FB-2BB7E4E50677', -- Entity: MJ: Brand Kit Assets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '712D12AA-7673-4221-A3FB-2BB7E4E50677'),
            'IsGenerationReference',
            'Is Generation Reference',
            'When set, the file may be sent to image or video generation models as a style or subject reference. Allowed only for Image, Screenshot, Logo, LogoMark and Video assets.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9f49223d-a4b6-414e-a3e8-98eb9acd6b81' OR (EntityID = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9f49223d-a4b6-414e-a3e8-98eb9acd6b81',
            '712D12AA-7673-4221-A3FB-2BB7E4E50677', -- Entity: MJ: Brand Kit Assets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '712D12AA-7673-4221-A3FB-2BB7E4E50677'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '250413c3-e4a3-43f6-9252-6d279d1e2474' OR (EntityID = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '250413c3-e4a3-43f6-9252-6d279d1e2474',
            '712D12AA-7673-4221-A3FB-2BB7E4E50677', -- Entity: MJ: Brand Kit Assets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '712D12AA-7673-4221-A3FB-2BB7E4E50677'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '107628f4-63dd-4598-a78a-ca280ee93c5f' OR (EntityID = '370063B4-E662-43C2-BAB6-88868597AEBD' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '107628f4-63dd-4598-a78a-ca280ee93c5f',
            '370063B4-E662-43C2-BAB6-88868597AEBD', -- Entity: MJ: Brand Kits
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '370063B4-E662-43C2-BAB6-88868597AEBD'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b0c62c2c-f7c3-4fc8-820a-b5445e2d7e8c' OR (EntityID = '370063B4-E662-43C2-BAB6-88868597AEBD' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b0c62c2c-f7c3-4fc8-820a-b5445e2d7e8c',
            '370063B4-E662-43C2-BAB6-88868597AEBD', -- Entity: MJ: Brand Kits
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '370063B4-E662-43C2-BAB6-88868597AEBD'),
            'Name',
            'Name',
            'Display name of the brand kit.',
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aae1cc71-bf47-4611-a904-59c985f9b7ad' OR (EntityID = '370063B4-E662-43C2-BAB6-88868597AEBD' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'aae1cc71-bf47-4611-a904-59c985f9b7ad',
            '370063B4-E662-43C2-BAB6-88868597AEBD', -- Entity: MJ: Brand Kits
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '370063B4-E662-43C2-BAB6-88868597AEBD'),
            'Description',
            'Description',
            'What the kit is for and when to use it.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd03a71fc-bfb2-49a8-a190-984b5d102838' OR (EntityID = '370063B4-E662-43C2-BAB6-88868597AEBD' AND Name = 'CompanyID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd03a71fc-bfb2-49a8-a190-984b5d102838',
            '370063B4-E662-43C2-BAB6-88868597AEBD', -- Entity: MJ: Brand Kits
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '370063B4-E662-43C2-BAB6-88868597AEBD'),
            'CompanyID',
            'Company ID',
            'The company this kit belongs to. NULL means org-wide: available to all companies.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'D4238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '766a7d3b-c4ec-43b0-ad09-4b4ac270ae1f' OR (EntityID = '370063B4-E662-43C2-BAB6-88868597AEBD' AND Name = 'IsDefault')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '766a7d3b-c4ec-43b0-ad09-4b4ac270ae1f',
            '370063B4-E662-43C2-BAB6-88868597AEBD', -- Entity: MJ: Brand Kits
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '370063B4-E662-43C2-BAB6-88868597AEBD'),
            'IsDefault',
            'Is Default',
            'The kit used when a caller names none. At most one default per CompanyID scope (NULL is its own scope), enforced on save by the server entity.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '74e04c6d-7182-4ae7-977b-8f197523f3e0' OR (EntityID = '370063B4-E662-43C2-BAB6-88868597AEBD' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '74e04c6d-7182-4ae7-977b-8f197523f3e0',
            '370063B4-E662-43C2-BAB6-88868597AEBD', -- Entity: MJ: Brand Kits
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '370063B4-E662-43C2-BAB6-88868597AEBD'),
            'Status',
            'Status',
            'Active kits are offered to users and generators; Inactive kits are kept but hidden.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4127f7a7-f569-4d35-a7c5-804122130f44' OR (EntityID = '370063B4-E662-43C2-BAB6-88868597AEBD' AND Name = 'Style')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4127f7a7-f569-4d35-a7c5-804122130f44',
            '370063B4-E662-43C2-BAB6-88868597AEBD', -- Entity: MJ: Brand Kits
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '370063B4-E662-43C2-BAB6-88868597AEBD'),
            'Style',
            'Style',
            'JSON (IBrandStyle): palette, typography, imagery style, keep and avoid lists, and an optional Motion section.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9bc6f6cc-144e-447e-9a63-a24cb9025726' OR (EntityID = '370063B4-E662-43C2-BAB6-88868597AEBD' AND Name = 'Voice')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9bc6f6cc-144e-447e-9a63-a24cb9025726',
            '370063B4-E662-43C2-BAB6-88868597AEBD', -- Entity: MJ: Brand Kits
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '370063B4-E662-43C2-BAB6-88868597AEBD'),
            'Voice',
            'Voice',
            'JSON (IBrandVoice): text-to-speech provider, voice ID, settings and pronunciation notes.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '121e45ac-aff0-407c-9ae6-1f5ac0e23ed2' OR (EntityID = '370063B4-E662-43C2-BAB6-88868597AEBD' AND Name = 'GenerationPolicy')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '121e45ac-aff0-407c-9ae6-1f5ac0e23ed2',
            '370063B4-E662-43C2-BAB6-88868597AEBD', -- Entity: MJ: Brand Kits
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '370063B4-E662-43C2-BAB6-88868597AEBD'),
            'GenerationPolicy',
            'Generation Policy',
            'JSON (IBrandGenerationPolicy): whether generated images and video may be used, a style prompt, subjects to avoid, whether generated people are allowed (default: not allowed), and an optional per-run generation spend cap. NULL applies the defaults.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2842942b-d4e4-43b9-a644-87f8cc63d213' OR (EntityID = '370063B4-E662-43C2-BAB6-88868597AEBD' AND Name = 'NeverInvent')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2842942b-d4e4-43b9-a644-87f8cc63d213',
            '370063B4-E662-43C2-BAB6-88868597AEBD', -- Entity: MJ: Brand Kits
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '370063B4-E662-43C2-BAB6-88868597AEBD'),
            'NeverInvent',
            'Never Invent',
            'JSON array of strings: facts about the brand a model must never fabricate, for example product screens, logos, metrics or customer names.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ae27ecc0-d163-46e4-b4aa-9f983b45c6a7' OR (EntityID = '370063B4-E662-43C2-BAB6-88868597AEBD' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ae27ecc0-d163-46e4-b4aa-9f983b45c6a7',
            '370063B4-E662-43C2-BAB6-88868597AEBD', -- Entity: MJ: Brand Kits
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '370063B4-E662-43C2-BAB6-88868597AEBD'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8c3e00d5-70e4-4af2-b435-f3884b06b12c' OR (EntityID = '370063B4-E662-43C2-BAB6-88868597AEBD' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8c3e00d5-70e4-4af2-b435-f3884b06b12c',
            '370063B4-E662-43C2-BAB6-88868597AEBD', -- Entity: MJ: Brand Kits
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '370063B4-E662-43C2-BAB6-88868597AEBD'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a5c16631-9a01-4645-9438-9ee404698d6f' OR (EntityID = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a5c16631-9a01-4645-9438-9ee404698d6f',
            '8ECBEA4B-2D6B-44E1-886C-96E904637866', -- Entity: MJ: Video Archetypes
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8ECBEA4B-2D6B-44E1-886C-96E904637866'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3af49dfe-0e00-45d8-b8e7-7165dee9fb2b' OR (EntityID = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3af49dfe-0e00-45d8-b8e7-7165dee9fb2b',
            '8ECBEA4B-2D6B-44E1-886C-96E904637866', -- Entity: MJ: Video Archetypes
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8ECBEA4B-2D6B-44E1-886C-96E904637866'),
            'Name',
            'Name',
            'Archetype name, unique within its CompanyID scope.',
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c707c4cc-aa68-4179-92bb-a61dab9299ce' OR (EntityID = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c707c4cc-aa68-4179-92bb-a61dab9299ce',
            '8ECBEA4B-2D6B-44E1-886C-96E904637866', -- Entity: MJ: Video Archetypes
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8ECBEA4B-2D6B-44E1-886C-96E904637866'),
            'Description',
            'Description',
            'What the archetype is for; the Director reads it to pick one.',
            'nvarchar',
            -1,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '758729b8-8762-4843-8e04-046702ec1bcc' OR (EntityID = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND Name = 'CompanyID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '758729b8-8762-4843-8e04-046702ec1bcc',
            '8ECBEA4B-2D6B-44E1-886C-96E904637866', -- Entity: MJ: Video Archetypes
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8ECBEA4B-2D6B-44E1-886C-96E904637866'),
            'CompanyID',
            'Company ID',
            'The company that owns this archetype. NULL means shipped or org-wide: available to all companies.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'D4238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '369870f9-fe4a-46fa-8485-9dad58b865ba' OR (EntityID = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND Name = 'Category')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '369870f9-fe4a-46fa-8485-9dad58b865ba',
            '8ECBEA4B-2D6B-44E1-886C-96E904637866', -- Entity: MJ: Video Archetypes
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8ECBEA4B-2D6B-44E1-886C-96E904637866'),
            'Category',
            'Category',
            'Explainer, Product, DataStory, Social, Tutorial, Announcement or Briefing.',
            'nvarchar',
            60,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '719bc5fe-8c94-4bc4-94ba-c48f21e0baab' OR (EntityID = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '719bc5fe-8c94-4bc4-94ba-c48f21e0baab',
            '8ECBEA4B-2D6B-44E1-886C-96E904637866', -- Entity: MJ: Video Archetypes
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8ECBEA4B-2D6B-44E1-886C-96E904637866'),
            'Status',
            'Status',
            'Active archetypes are offered; Inactive are hidden.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2001b8cb-51a3-42a0-ab09-c739f43ad152' OR (EntityID = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND Name = 'DefaultDurationSeconds')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2001b8cb-51a3-42a0-ab09-c739f43ad152',
            '8ECBEA4B-2D6B-44E1-886C-96E904637866', -- Entity: MJ: Video Archetypes
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8ECBEA4B-2D6B-44E1-886C-96E904637866'),
            'DefaultDurationSeconds',
            'Default Duration Seconds',
            'Default film length, in seconds.',
            'int',
            4,
            10,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e712d169-83f7-4dc6-a00b-e357a30982c1' OR (EntityID = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND Name = 'MinDurationSeconds')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e712d169-83f7-4dc6-a00b-e357a30982c1',
            '8ECBEA4B-2D6B-44E1-886C-96E904637866', -- Entity: MJ: Video Archetypes
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8ECBEA4B-2D6B-44E1-886C-96E904637866'),
            'MinDurationSeconds',
            'Min Duration Seconds',
            'Shortest film length, in seconds.',
            'int',
            4,
            10,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd9527dc0-cc7d-45f1-ae8f-bbc8d84ca5aa' OR (EntityID = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND Name = 'MaxDurationSeconds')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd9527dc0-cc7d-45f1-ae8f-bbc8d84ca5aa',
            '8ECBEA4B-2D6B-44E1-886C-96E904637866', -- Entity: MJ: Video Archetypes
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8ECBEA4B-2D6B-44E1-886C-96E904637866'),
            'MaxDurationSeconds',
            'Max Duration Seconds',
            'Longest film length, in seconds.',
            'int',
            4,
            10,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9eae3b9a-7286-42da-ab64-ddce6dcc047f' OR (EntityID = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND Name = 'DefaultFormats')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9eae3b9a-7286-42da-ab64-ddce6dcc047f',
            '8ECBEA4B-2D6B-44E1-886C-96E904637866', -- Entity: MJ: Video Archetypes
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8ECBEA4B-2D6B-44E1-886C-96E904637866'),
            'DefaultFormats',
            'Default Formats',
            'Comma-separated default formats: any of 16:9, 9:16, 1:1.',
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '05edd1b4-678f-4205-bd62-de2da303721b' OR (EntityID = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND Name = 'BeatTemplate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '05edd1b4-678f-4205-bd62-de2da303721b',
            '8ECBEA4B-2D6B-44E1-886C-96E904637866', -- Entity: MJ: Video Archetypes
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8ECBEA4B-2D6B-44E1-886C-96E904637866'),
            'BeatTemplate',
            'Beat Template',
            'JSON array (VideoBeatTemplate[]): the beat slots a film of this archetype follows, with per-beat duration bounds.',
            'nvarchar',
            -1,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '18857309-b686-4d77-a196-beaf4fd3e726' OR (EntityID = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND Name = 'Pacing')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '18857309-b686-4d77-a196-beaf4fd3e726',
            '8ECBEA4B-2D6B-44E1-886C-96E904637866', -- Entity: MJ: Video Archetypes
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8ECBEA4B-2D6B-44E1-886C-96E904637866'),
            'Pacing',
            'Pacing',
            'JSON (VideoPacing): cut cadence and hold rules.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '719265b7-aec8-473d-a147-119720393d95' OR (EntityID = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND Name = 'Guidance')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '719265b7-aec8-473d-a147-119720393d95',
            '8ECBEA4B-2D6B-44E1-886C-96E904637866', -- Entity: MJ: Video Archetypes
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8ECBEA4B-2D6B-44E1-886C-96E904637866'),
            'Guidance',
            'Guidance',
            'Markdown guidance for the Director and Storyboard.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4b772e66-6f9d-4ea9-b0dd-ef62cce3b01b' OR (EntityID = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND Name = 'DefaultInteractionMode')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4b772e66-6f9d-4ea9-b0dd-ef62cce3b01b',
            '8ECBEA4B-2D6B-44E1-886C-96E904637866', -- Entity: MJ: Video Archetypes
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8ECBEA4B-2D6B-44E1-886C-96E904637866'),
            'DefaultInteractionMode',
            'Default Interaction Mode',
            'Default approval mode: Autonomous, ApproveStoryboard or ApproveStoryboardAndRoughCut.',
            'nvarchar',
            60,
            0,
            0,
            0,
            'Autonomous',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cd593def-6411-440f-9d73-c9dff0b14b32' OR (EntityID = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cd593def-6411-440f-9d73-c9dff0b14b32',
            '8ECBEA4B-2D6B-44E1-886C-96E904637866', -- Entity: MJ: Video Archetypes
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8ECBEA4B-2D6B-44E1-886C-96E904637866'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a94077a5-92be-4f0d-b62f-9942b27f887b' OR (EntityID = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a94077a5-92be-4f0d-b62f-9942b27f887b',
            '8ECBEA4B-2D6B-44E1-886C-96E904637866', -- Entity: MJ: Video Archetypes
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8ECBEA4B-2D6B-44E1-886C-96E904637866'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert entity field value with ID 9a3ca880-b97f-4fb8-bd5f-53b527678929 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9a3ca880-b97f-4fb8-bd5f-53b527678929', '491901F6-61D6-4EA4-9EE2-195FD0BD55F6', 1, 'Font', 'Font', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c77e7ed1-a5ad-4a04-b32e-8333deb09b12 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c77e7ed1-a5ad-4a04-b32e-8333deb09b12', '491901F6-61D6-4EA4-9EE2-195FD0BD55F6', 2, 'Image', 'Image', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 547e735f-eb9d-4bf0-b901-6c0ccad8f177 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('547e735f-eb9d-4bf0-b901-6c0ccad8f177', '491901F6-61D6-4EA4-9EE2-195FD0BD55F6', 3, 'Logo', 'Logo', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3ad01002-b1f3-490b-b7ca-4b614b1414bf */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3ad01002-b1f3-490b-b7ca-4b614b1414bf', '491901F6-61D6-4EA4-9EE2-195FD0BD55F6', 4, 'LogoMark', 'LogoMark', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3406d051-f750-473a-99a4-ee5043b66b36 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3406d051-f750-473a-99a4-ee5043b66b36', '491901F6-61D6-4EA4-9EE2-195FD0BD55F6', 5, 'Music', 'Music', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3993c1cb-dafb-4495-9032-d21bfd76feb4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3993c1cb-dafb-4495-9032-d21bfd76feb4', '491901F6-61D6-4EA4-9EE2-195FD0BD55F6', 6, 'Other', 'Other', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 13195cf2-604b-4240-86f7-a0f44893c35d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('13195cf2-604b-4240-86f7-a0f44893c35d', '491901F6-61D6-4EA4-9EE2-195FD0BD55F6', 7, 'Screenshot', 'Screenshot', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c6724a87-f5d7-4213-a616-a0d02b78b692 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c6724a87-f5d7-4213-a616-a0d02b78b692', '491901F6-61D6-4EA4-9EE2-195FD0BD55F6', 8, 'SoundEffect', 'SoundEffect', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 104df2af-e060-4368-8c8e-f05394c2c469 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('104df2af-e060-4368-8c8e-f05394c2c469', '491901F6-61D6-4EA4-9EE2-195FD0BD55F6', 9, 'Video', 'Video', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 491901F6-61D6-4EA4-9EE2-195FD0BD55F6 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='491901F6-61D6-4EA4-9EE2-195FD0BD55F6';

/* SQL text to insert entity field value with ID 029e3686-a125-4add-8229-2f4cabb1f392 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('029e3686-a125-4add-8229-2f4cabb1f392', '74E04C6D-7182-4AE7-977B-8F197523F3E0', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 05f0f878-4f03-4b75-90d7-a03495c28427 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('05f0f878-4f03-4b75-90d7-a03495c28427', '74E04C6D-7182-4AE7-977B-8F197523F3E0', 2, 'Inactive', 'Inactive', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 74E04C6D-7182-4AE7-977B-8F197523F3E0 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='74E04C6D-7182-4AE7-977B-8F197523F3E0';

/* SQL text to insert entity field value with ID 4fdef9ab-7f22-4a4d-8eb5-0aa6eb21481b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4fdef9ab-7f22-4a4d-8eb5-0aa6eb21481b', '369870F9-FE4A-46FA-8485-9DAD58B865BA', 1, 'Announcement', 'Announcement', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5f8e86df-fdf4-448c-bbdf-807d75246b09 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5f8e86df-fdf4-448c-bbdf-807d75246b09', '369870F9-FE4A-46FA-8485-9DAD58B865BA', 2, 'Briefing', 'Briefing', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8dc4850f-feb9-4552-bea5-febdc32db9ff */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8dc4850f-feb9-4552-bea5-febdc32db9ff', '369870F9-FE4A-46FA-8485-9DAD58B865BA', 3, 'DataStory', 'DataStory', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 28d5eac2-cadc-4b63-b19e-72e8a57de900 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('28d5eac2-cadc-4b63-b19e-72e8a57de900', '369870F9-FE4A-46FA-8485-9DAD58B865BA', 4, 'Explainer', 'Explainer', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6d4d4bbf-befe-440b-bdb1-e8c5ecf2d058 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6d4d4bbf-befe-440b-bdb1-e8c5ecf2d058', '369870F9-FE4A-46FA-8485-9DAD58B865BA', 5, 'Product', 'Product', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0d63f87c-06c2-432e-8940-74babcc92087 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0d63f87c-06c2-432e-8940-74babcc92087', '369870F9-FE4A-46FA-8485-9DAD58B865BA', 6, 'Social', 'Social', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 85836d37-2c4f-459c-a7b8-e37ea2c34914 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('85836d37-2c4f-459c-a7b8-e37ea2c34914', '369870F9-FE4A-46FA-8485-9DAD58B865BA', 7, 'Tutorial', 'Tutorial', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 369870F9-FE4A-46FA-8485-9DAD58B865BA */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='369870F9-FE4A-46FA-8485-9DAD58B865BA';

/* SQL text to insert entity field value with ID 611afafb-3d86-45df-aa95-61bda7228d60 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('611afafb-3d86-45df-aa95-61bda7228d60', '719BC5FE-8C94-4BC4-94BA-C48F21E0BAAB', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID bf9c0505-d475-43e4-b19c-2da0e8d54f7a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bf9c0505-d475-43e4-b19c-2da0e8d54f7a', '719BC5FE-8C94-4BC4-94BA-C48F21E0BAAB', 2, 'Inactive', 'Inactive', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 719BC5FE-8C94-4BC4-94BA-C48F21E0BAAB */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='719BC5FE-8C94-4BC4-94BA-C48F21E0BAAB';

/* SQL text to insert entity field value with ID 7145150e-7060-4442-b822-771648d01dac */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7145150e-7060-4442-b822-771648d01dac', '4B772E66-6F9D-4EA9-B0DD-EF62CCE3B01B', 1, 'ApproveStoryboard', 'ApproveStoryboard', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8f2b17ed-7c15-4b99-b3ba-e70fc8e18c2b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8f2b17ed-7c15-4b99-b3ba-e70fc8e18c2b', '4B772E66-6F9D-4EA9-B0DD-EF62CCE3B01B', 2, 'ApproveStoryboardAndRoughCut', 'ApproveStoryboardAndRoughCut', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 78c16557-6d36-440c-a866-9f0b2e630035 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('78c16557-6d36-440c-a866-9f0b2e630035', '4B772E66-6F9D-4EA9-B0DD-EF62CCE3B01B', 3, 'Autonomous', 'Autonomous', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 4B772E66-6F9D-4EA9-B0DD-EF62CCE3B01B */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='4B772E66-6F9D-4EA9-B0DD-EF62CCE3B01B';


/* Create Entity Relationship: MJ: Companies -> MJ: Brand Kits (One To Many via CompanyID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '21916f81-ae3b-4101-ae5f-2985cd864f7b'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('21916f81-ae3b-4101-ae5f-2985cd864f7b', 'D4238F34-2837-EF11-86D4-6045BDEE16E6', '370063B4-E662-43C2-BAB6-88868597AEBD', 'CompanyID', 'One To Many', 1, 1, 7, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Companies -> MJ: Video Archetypes (One To Many via CompanyID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '8f3c0693-1f9b-40a5-bc6e-1a4408826c36'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8f3c0693-1f9b-40a5-bc6e-1a4408826c36', 'D4238F34-2837-EF11-86D4-6045BDEE16E6', '8ECBEA4B-2D6B-44E1-886C-96E904637866', 'CompanyID', 'One To Many', 1, 1, 8, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Files -> MJ: Brand Kit Assets (One To Many via FileID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '078da4a2-deb6-4887-bf2d-26a1dad153cc'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('078da4a2-deb6-4887-bf2d-26a1dad153cc', '29248F34-2837-EF11-86D4-6045BDEE16E6', '712D12AA-7673-4221-A3FB-2BB7E4E50677', 'FileID', 'One To Many', 1, 1, 9, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Brand Kits -> MJ: Brand Kit Assets (One To Many via BrandKitID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '81281ed2-bb13-4cd4-82c8-48fce0bf9246'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('81281ed2-bb13-4cd4-82c8-48fce0bf9246', '370063B4-E662-43C2-BAB6-88868597AEBD', '712D12AA-7673-4221-A3FB-2BB7E4E50677', 'BrandKitID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for BrandKitAsset */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Brand Kit Assets
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key BrandKitID in table BrandKitAsset
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_BrandKitAsset_BrandKitID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[BrandKitAsset]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_BrandKitAsset_BrandKitID ON [${flyway:defaultSchema}].[BrandKitAsset] ([BrandKitID]);

-- Index for foreign key FileID in table BrandKitAsset
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_BrandKitAsset_FileID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[BrandKitAsset]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_BrandKitAsset_FileID ON [${flyway:defaultSchema}].[BrandKitAsset] ([FileID]);

/* SQL text to update entity field related entity name field map for entity field ID 9D994F0F-7A77-4864-8B4E-59B3EB0A269A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='9D994F0F-7A77-4864-8B4E-59B3EB0A269A', @RelatedEntityNameFieldMap='BrandKit';

/* Index for Foreign Keys for BrandKit */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Brand Kits
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyID in table BrandKit
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_BrandKit_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[BrandKit]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_BrandKit_CompanyID ON [${flyway:defaultSchema}].[BrandKit] ([CompanyID]);

/* SQL text to update entity field related entity name field map for entity field ID D03A71FC-BFB2-49A8-A190-984B5D102838 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='D03A71FC-BFB2-49A8-A190-984B5D102838', @RelatedEntityNameFieldMap='Company';

/* Base View SQL for MJ: Brand Kits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Brand Kits
-- Item: vwBrandKits
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Brand Kits
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  BrandKit
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwBrandKits]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwBrandKits];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwBrandKits]
AS
SELECT
    b.*,
    MJCompany_CompanyID.[Name] AS [Company]
FROM
    [${flyway:defaultSchema}].[BrandKit] AS b
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Company] AS MJCompany_CompanyID
  ON
    [b].[CompanyID] = MJCompany_CompanyID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwBrandKits] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Brand Kits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Brand Kits
-- Item: Permissions for vwBrandKits
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwBrandKits] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Brand Kits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Brand Kits
-- Item: spCreateBrandKit
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR BrandKit
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateBrandKit]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateBrandKit];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateBrandKit]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @IsDefault bit = NULL,
    @Status nvarchar(20) = NULL,
    @Style_Clear bit = 0,
    @Style nvarchar(MAX) = NULL,
    @Voice_Clear bit = 0,
    @Voice nvarchar(MAX) = NULL,
    @GenerationPolicy_Clear bit = 0,
    @GenerationPolicy nvarchar(MAX) = NULL,
    @NeverInvent_Clear bit = 0,
    @NeverInvent nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[BrandKit]
            (
                [ID],
                [Name],
                [Description],
                [CompanyID],
                [IsDefault],
                [Status],
                [Style],
                [Voice],
                [GenerationPolicy],
                [NeverInvent]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                ISNULL(@IsDefault, 0),
                ISNULL(@Status, 'Active'),
                CASE WHEN @Style_Clear = 1 THEN NULL ELSE ISNULL(@Style, NULL) END,
                CASE WHEN @Voice_Clear = 1 THEN NULL ELSE ISNULL(@Voice, NULL) END,
                CASE WHEN @GenerationPolicy_Clear = 1 THEN NULL ELSE ISNULL(@GenerationPolicy, NULL) END,
                CASE WHEN @NeverInvent_Clear = 1 THEN NULL ELSE ISNULL(@NeverInvent, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[BrandKit]
            (
                [Name],
                [Description],
                [CompanyID],
                [IsDefault],
                [Status],
                [Style],
                [Voice],
                [GenerationPolicy],
                [NeverInvent]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                ISNULL(@IsDefault, 0),
                ISNULL(@Status, 'Active'),
                CASE WHEN @Style_Clear = 1 THEN NULL ELSE ISNULL(@Style, NULL) END,
                CASE WHEN @Voice_Clear = 1 THEN NULL ELSE ISNULL(@Voice, NULL) END,
                CASE WHEN @GenerationPolicy_Clear = 1 THEN NULL ELSE ISNULL(@GenerationPolicy, NULL) END,
                CASE WHEN @NeverInvent_Clear = 1 THEN NULL ELSE ISNULL(@NeverInvent, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwBrandKits] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateBrandKit] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Brand Kits */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateBrandKit] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Brand Kits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Brand Kits
-- Item: spUpdateBrandKit
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR BrandKit
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateBrandKit]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateBrandKit];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateBrandKit]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @IsDefault bit = NULL,
    @Status nvarchar(20) = NULL,
    @Style_Clear bit = 0,
    @Style nvarchar(MAX) = NULL,
    @Voice_Clear bit = 0,
    @Voice nvarchar(MAX) = NULL,
    @GenerationPolicy_Clear bit = 0,
    @GenerationPolicy nvarchar(MAX) = NULL,
    @NeverInvent_Clear bit = 0,
    @NeverInvent nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[BrandKit]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [CompanyID] = CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, [CompanyID]) END,
        [IsDefault] = ISNULL(@IsDefault, [IsDefault]),
        [Status] = ISNULL(@Status, [Status]),
        [Style] = CASE WHEN @Style_Clear = 1 THEN NULL ELSE ISNULL(@Style, [Style]) END,
        [Voice] = CASE WHEN @Voice_Clear = 1 THEN NULL ELSE ISNULL(@Voice, [Voice]) END,
        [GenerationPolicy] = CASE WHEN @GenerationPolicy_Clear = 1 THEN NULL ELSE ISNULL(@GenerationPolicy, [GenerationPolicy]) END,
        [NeverInvent] = CASE WHEN @NeverInvent_Clear = 1 THEN NULL ELSE ISNULL(@NeverInvent, [NeverInvent]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwBrandKits] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwBrandKits]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateBrandKit] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the BrandKit table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateBrandKit]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateBrandKit];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateBrandKit
ON [${flyway:defaultSchema}].[BrandKit]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[BrandKit]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[BrandKit] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Brand Kits */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateBrandKit] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Brand Kits */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Brand Kits
-- Item: spDeleteBrandKit
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR BrandKit
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteBrandKit]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteBrandKit];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteBrandKit]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[BrandKit]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteBrandKit] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Brand Kits */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteBrandKit] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID C66479AE-40C5-431E-81FA-3213BC22BFF0 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='C66479AE-40C5-431E-81FA-3213BC22BFF0', @RelatedEntityNameFieldMap='File';

/* Base View SQL for MJ: Brand Kit Assets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Brand Kit Assets
-- Item: vwBrandKitAssets
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Brand Kit Assets
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  BrandKitAsset
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwBrandKitAssets]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwBrandKitAssets];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwBrandKitAssets]
AS
SELECT
    b.*,
    MJBrandKit_BrandKitID.[Name] AS [BrandKit],
    MJFile_FileID.[Name] AS [File]
FROM
    [${flyway:defaultSchema}].[BrandKitAsset] AS b
INNER JOIN
    [${flyway:defaultSchema}].[BrandKit] AS MJBrandKit_BrandKitID
  ON
    [b].[BrandKitID] = MJBrandKit_BrandKitID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_FileID
  ON
    [b].[FileID] = MJFile_FileID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwBrandKitAssets] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Brand Kit Assets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Brand Kit Assets
-- Item: Permissions for vwBrandKitAssets
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwBrandKitAssets] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Brand Kit Assets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Brand Kit Assets
-- Item: spCreateBrandKitAsset
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR BrandKitAsset
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateBrandKitAsset]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateBrandKitAsset];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateBrandKitAsset]
    @ID uniqueidentifier = NULL,
    @BrandKitID uniqueidentifier,
    @Name nvarchar(255),
    @AssetType nvarchar(30),
    @FileID uniqueidentifier,
    @Usage_Clear bit = 0,
    @Usage nvarchar(MAX) = NULL,
    @IsPrimary bit = NULL,
    @Sequence int = NULL,
    @LicenseNotes_Clear bit = 0,
    @LicenseNotes nvarchar(500) = NULL,
    @IsGenerationReference bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[BrandKitAsset]
            (
                [ID],
                [BrandKitID],
                [Name],
                [AssetType],
                [FileID],
                [Usage],
                [IsPrimary],
                [Sequence],
                [LicenseNotes],
                [IsGenerationReference]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @BrandKitID,
                @Name,
                @AssetType,
                @FileID,
                CASE WHEN @Usage_Clear = 1 THEN NULL ELSE ISNULL(@Usage, NULL) END,
                ISNULL(@IsPrimary, 0),
                ISNULL(@Sequence, 0),
                CASE WHEN @LicenseNotes_Clear = 1 THEN NULL ELSE ISNULL(@LicenseNotes, NULL) END,
                ISNULL(@IsGenerationReference, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[BrandKitAsset]
            (
                [BrandKitID],
                [Name],
                [AssetType],
                [FileID],
                [Usage],
                [IsPrimary],
                [Sequence],
                [LicenseNotes],
                [IsGenerationReference]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @BrandKitID,
                @Name,
                @AssetType,
                @FileID,
                CASE WHEN @Usage_Clear = 1 THEN NULL ELSE ISNULL(@Usage, NULL) END,
                ISNULL(@IsPrimary, 0),
                ISNULL(@Sequence, 0),
                CASE WHEN @LicenseNotes_Clear = 1 THEN NULL ELSE ISNULL(@LicenseNotes, NULL) END,
                ISNULL(@IsGenerationReference, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwBrandKitAssets] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateBrandKitAsset] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Brand Kit Assets */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateBrandKitAsset] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Brand Kit Assets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Brand Kit Assets
-- Item: spUpdateBrandKitAsset
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR BrandKitAsset
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateBrandKitAsset]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateBrandKitAsset];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateBrandKitAsset]
    @ID uniqueidentifier,
    @BrandKitID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @AssetType nvarchar(30) = NULL,
    @FileID uniqueidentifier = NULL,
    @Usage_Clear bit = 0,
    @Usage nvarchar(MAX) = NULL,
    @IsPrimary bit = NULL,
    @Sequence int = NULL,
    @LicenseNotes_Clear bit = 0,
    @LicenseNotes nvarchar(500) = NULL,
    @IsGenerationReference bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[BrandKitAsset]
    SET
        [BrandKitID] = ISNULL(@BrandKitID, [BrandKitID]),
        [Name] = ISNULL(@Name, [Name]),
        [AssetType] = ISNULL(@AssetType, [AssetType]),
        [FileID] = ISNULL(@FileID, [FileID]),
        [Usage] = CASE WHEN @Usage_Clear = 1 THEN NULL ELSE ISNULL(@Usage, [Usage]) END,
        [IsPrimary] = ISNULL(@IsPrimary, [IsPrimary]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [LicenseNotes] = CASE WHEN @LicenseNotes_Clear = 1 THEN NULL ELSE ISNULL(@LicenseNotes, [LicenseNotes]) END,
        [IsGenerationReference] = ISNULL(@IsGenerationReference, [IsGenerationReference])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwBrandKitAssets] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwBrandKitAssets]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateBrandKitAsset] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the BrandKitAsset table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateBrandKitAsset]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateBrandKitAsset];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateBrandKitAsset
ON [${flyway:defaultSchema}].[BrandKitAsset]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[BrandKitAsset]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[BrandKitAsset] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Brand Kit Assets */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateBrandKitAsset] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Brand Kit Assets */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Brand Kit Assets
-- Item: spDeleteBrandKitAsset
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR BrandKitAsset
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteBrandKitAsset]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteBrandKitAsset];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteBrandKitAsset]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[BrandKitAsset]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteBrandKitAsset] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Brand Kit Assets */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteBrandKitAsset] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for VideoArchetype */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Video Archetypes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyID in table VideoArchetype
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_VideoArchetype_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[VideoArchetype]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_VideoArchetype_CompanyID ON [${flyway:defaultSchema}].[VideoArchetype] ([CompanyID]);

/* SQL text to update entity field related entity name field map for entity field ID 758729B8-8762-4843-8E04-046702EC1BCC */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='758729B8-8762-4843-8E04-046702EC1BCC', @RelatedEntityNameFieldMap='Company';

/* Base View SQL for MJ: Video Archetypes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Video Archetypes
-- Item: vwVideoArchetypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Video Archetypes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  VideoArchetype
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwVideoArchetypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwVideoArchetypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwVideoArchetypes]
AS
SELECT
    v.*,
    MJCompany_CompanyID.[Name] AS [Company]
FROM
    [${flyway:defaultSchema}].[VideoArchetype] AS v
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Company] AS MJCompany_CompanyID
  ON
    [v].[CompanyID] = MJCompany_CompanyID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwVideoArchetypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Video Archetypes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Video Archetypes
-- Item: Permissions for vwVideoArchetypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwVideoArchetypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Video Archetypes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Video Archetypes
-- Item: spCreateVideoArchetype
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR VideoArchetype
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateVideoArchetype]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateVideoArchetype];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateVideoArchetype]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @Category nvarchar(30),
    @Status nvarchar(20) = NULL,
    @DefaultDurationSeconds int,
    @MinDurationSeconds int,
    @MaxDurationSeconds int,
    @DefaultFormats nvarchar(100),
    @BeatTemplate nvarchar(MAX),
    @Pacing_Clear bit = 0,
    @Pacing nvarchar(MAX) = NULL,
    @Guidance_Clear bit = 0,
    @Guidance nvarchar(MAX) = NULL,
    @DefaultInteractionMode nvarchar(30) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[VideoArchetype]
            (
                [ID],
                [Name],
                [Description],
                [CompanyID],
                [Category],
                [Status],
                [DefaultDurationSeconds],
                [MinDurationSeconds],
                [MaxDurationSeconds],
                [DefaultFormats],
                [BeatTemplate],
                [Pacing],
                [Guidance],
                [DefaultInteractionMode]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                @Category,
                ISNULL(@Status, 'Active'),
                @DefaultDurationSeconds,
                @MinDurationSeconds,
                @MaxDurationSeconds,
                @DefaultFormats,
                @BeatTemplate,
                CASE WHEN @Pacing_Clear = 1 THEN NULL ELSE ISNULL(@Pacing, NULL) END,
                CASE WHEN @Guidance_Clear = 1 THEN NULL ELSE ISNULL(@Guidance, NULL) END,
                ISNULL(@DefaultInteractionMode, 'Autonomous')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[VideoArchetype]
            (
                [Name],
                [Description],
                [CompanyID],
                [Category],
                [Status],
                [DefaultDurationSeconds],
                [MinDurationSeconds],
                [MaxDurationSeconds],
                [DefaultFormats],
                [BeatTemplate],
                [Pacing],
                [Guidance],
                [DefaultInteractionMode]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                @Category,
                ISNULL(@Status, 'Active'),
                @DefaultDurationSeconds,
                @MinDurationSeconds,
                @MaxDurationSeconds,
                @DefaultFormats,
                @BeatTemplate,
                CASE WHEN @Pacing_Clear = 1 THEN NULL ELSE ISNULL(@Pacing, NULL) END,
                CASE WHEN @Guidance_Clear = 1 THEN NULL ELSE ISNULL(@Guidance, NULL) END,
                ISNULL(@DefaultInteractionMode, 'Autonomous')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwVideoArchetypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateVideoArchetype] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Video Archetypes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateVideoArchetype] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Video Archetypes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Video Archetypes
-- Item: spUpdateVideoArchetype
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR VideoArchetype
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateVideoArchetype]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateVideoArchetype];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateVideoArchetype]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Description nvarchar(MAX) = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @Category nvarchar(30) = NULL,
    @Status nvarchar(20) = NULL,
    @DefaultDurationSeconds int = NULL,
    @MinDurationSeconds int = NULL,
    @MaxDurationSeconds int = NULL,
    @DefaultFormats nvarchar(100) = NULL,
    @BeatTemplate nvarchar(MAX) = NULL,
    @Pacing_Clear bit = 0,
    @Pacing nvarchar(MAX) = NULL,
    @Guidance_Clear bit = 0,
    @Guidance nvarchar(MAX) = NULL,
    @DefaultInteractionMode nvarchar(30) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[VideoArchetype]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = ISNULL(@Description, [Description]),
        [CompanyID] = CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, [CompanyID]) END,
        [Category] = ISNULL(@Category, [Category]),
        [Status] = ISNULL(@Status, [Status]),
        [DefaultDurationSeconds] = ISNULL(@DefaultDurationSeconds, [DefaultDurationSeconds]),
        [MinDurationSeconds] = ISNULL(@MinDurationSeconds, [MinDurationSeconds]),
        [MaxDurationSeconds] = ISNULL(@MaxDurationSeconds, [MaxDurationSeconds]),
        [DefaultFormats] = ISNULL(@DefaultFormats, [DefaultFormats]),
        [BeatTemplate] = ISNULL(@BeatTemplate, [BeatTemplate]),
        [Pacing] = CASE WHEN @Pacing_Clear = 1 THEN NULL ELSE ISNULL(@Pacing, [Pacing]) END,
        [Guidance] = CASE WHEN @Guidance_Clear = 1 THEN NULL ELSE ISNULL(@Guidance, [Guidance]) END,
        [DefaultInteractionMode] = ISNULL(@DefaultInteractionMode, [DefaultInteractionMode])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwVideoArchetypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwVideoArchetypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateVideoArchetype] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the VideoArchetype table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateVideoArchetype]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateVideoArchetype];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateVideoArchetype
ON [${flyway:defaultSchema}].[VideoArchetype]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[VideoArchetype]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[VideoArchetype] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Video Archetypes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateVideoArchetype] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Video Archetypes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Video Archetypes
-- Item: spDeleteVideoArchetype
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR VideoArchetype
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteVideoArchetype]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteVideoArchetype];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteVideoArchetype]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[VideoArchetype]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteVideoArchetype] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Video Archetypes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteVideoArchetype] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 4 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd21a88af-a314-4fac-b08f-eabb9307bb69' OR (EntityID = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND Name = 'BrandKit')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd21a88af-a314-4fac-b08f-eabb9307bb69',
            '712D12AA-7673-4221-A3FB-2BB7E4E50677', -- Entity: MJ: Brand Kit Assets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '712D12AA-7673-4221-A3FB-2BB7E4E50677'),
            'BrandKit',
            'Brand Kit',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '83673970-247a-47ac-8ae2-c794169d23bd' OR (EntityID = '712D12AA-7673-4221-A3FB-2BB7E4E50677' AND Name = 'File')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '83673970-247a-47ac-8ae2-c794169d23bd',
            '712D12AA-7673-4221-A3FB-2BB7E4E50677', -- Entity: MJ: Brand Kit Assets
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '712D12AA-7673-4221-A3FB-2BB7E4E50677'),
            'File',
            'File',
            NULL,
            'nvarchar',
            1000,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '344e9271-48b4-4ce0-93ed-5cdf2a734da5' OR (EntityID = '370063B4-E662-43C2-BAB6-88868597AEBD' AND Name = 'Company')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '344e9271-48b4-4ce0-93ed-5cdf2a734da5',
            '370063B4-E662-43C2-BAB6-88868597AEBD', -- Entity: MJ: Brand Kits
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '370063B4-E662-43C2-BAB6-88868597AEBD'),
            'Company',
            'Company',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '23a96fc8-aed2-4ae4-b138-016149359579' OR (EntityID = '8ECBEA4B-2D6B-44E1-886C-96E904637866' AND Name = 'Company')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '23a96fc8-aed2-4ae4-b138-016149359579',
            '8ECBEA4B-2D6B-44E1-886C-96E904637866', -- Entity: MJ: Video Archetypes
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8ECBEA4B-2D6B-44E1-886C-96E904637866'),
            'Company',
            'Company',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

