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


-- ============================================================================
-- Theme  ("MJ: Themes") — brand themes authored as seeds
-- ============================================================================
CREATE TABLE ${flyway:defaultSchema}.Theme (
    ID            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name          NVARCHAR(100)    NOT NULL,
    Description   NVARCHAR(MAX)    NULL,
    Seeds         NVARCHAR(MAX)    NOT NULL,
    LightMarkURL  NVARCHAR(1000)   NULL,
    DarkMarkURL   NVARCHAR(1000)   NULL,
    WordmarkURL   NVARCHAR(1000)   NULL,
    MonochromeURL NVARCHAR(1000)   NULL,
    IsDefault     BIT              NOT NULL CONSTRAINT DF_Theme_IsDefault DEFAULT (0),
    Status        NVARCHAR(20)     NOT NULL CONSTRAINT DF_Theme_Status DEFAULT (N'Active'),
    Overrides     NVARCHAR(MAX)    NULL,
    CustomCSS     NVARCHAR(MAX)    NULL,
    CONSTRAINT PK_Theme PRIMARY KEY (ID),
    CONSTRAINT UQ_Theme_Name UNIQUE (Name),
    CONSTRAINT CK_Theme_Status CHECK (Status IN (N'Active', N'Inactive', N'Draft'))
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A named brand theme. Stores ~8 brand seeds (color hue anchors, neutral character, vibrancy, shape, depth, type, viz palette) as JSON; the full --mj-* design-token contract is derived from the seeds at load. A theme is a brand — light/dark is the user''s mode layered under it, so a theme carries no per-mode values.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Theme';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display name for the theme (unique).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Theme',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional description of the theme.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Theme',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Brand seeds as JSON (the ThemeSeeds shape from @memberjunction/theme-engine): primary/accent/tertiary hue anchors, neutralChroma, vibrancy, radius, depth, fontFamily, and an optional vizPalette override. Source of truth — the full token contract is derived from this, not stored.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Theme',
    @level2type = N'COLUMN', @level2name = N'Seeds';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Public URL of the logo mark for light surfaces. Logos are variant uploads, never recolored.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Theme',
    @level2type = N'COLUMN', @level2name = N'LightMarkURL';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Public URL of the logo mark for dark surfaces. Dark mode swaps to this artwork rather than transforming the light mark.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Theme',
    @level2type = N'COLUMN', @level2name = N'DarkMarkURL';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional public URL of the full wordmark logo.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Theme',
    @level2type = N'COLUMN', @level2name = N'WordmarkURL';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional public URL of a single-fill monochrome logo variant.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Theme',
    @level2type = N'COLUMN', @level2name = N'MonochromeURL';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, this is the default theme applied when no other is selected. Single-default enforcement is handled at the application layer.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Theme',
    @level2type = N'COLUMN', @level2name = N'IsDefault';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lifecycle status: Active (available), Inactive (retired), or Draft (in progress, not applied).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Theme',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional advanced token overrides as a JSON object mapping a --mj-* CSS custom property name to a value (e.g. {"--mj-brand-primary-hover":"#0a5cff"}). Applied on top of the seed-derived token contract at load, before CustomCSS. Leave null to use the pure derived theme.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Theme',
    @level2type = N'COLUMN', @level2name = N'Overrides';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional advanced raw CSS appended to the theme overlay and auto-scoped under [data-theme-overlay="<id>"]. Applied last, after the derived tokens and Overrides. Escape hatch for rules the seed/token model cannot express; leave null for none.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Theme',
    @level2type = N'COLUMN', @level2name = N'CustomCSS';
GO


-- ============================================================================
-- Seed the single default brand theme (the MemberJunction house brand).
-- Minimal seed JSON: only values that differ from / anchor the engine defaults;
-- resolveSeeds() fills in fonts. Hardcoded UUID for a stable ID across envs.
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.Theme WHERE ID = '64A6B519-CFBA-4F25-98D4-8398D397E21C')
BEGIN
    INSERT INTO ${flyway:defaultSchema}.Theme (ID, Name, Description, Seeds, IsDefault, Status)
    VALUES (
        '64A6B519-CFBA-4F25-98D4-8398D397E21C',
        N'MemberJunction',
        N'The default MemberJunction brand theme. Derived seeds reproduce the stock MJ light/dark design tokens.',
        N'{"primary":"#0076b6","accent":"#5cc0ed","tertiary":"#06b6d4","neutralChroma":0.037,"vibrancy":1,"radius":8,"depth":1}',
        1,
        N'Active'
    );
END
GO











































































-- =============================================================================
-- =============================================================================
--
--                    ⚙️  CODEGEN OUTPUT BELOW THIS LINE  ⚙️
--
-- Everything below this block was generated by the MemberJunction CodeGen tool
-- after the hand-written DDL above was applied to the development database.
-- It contains the framework plumbing for the new Theme entity: Entity /
-- EntityField metadata inserts, EntityFieldValue rows, the regenerated base
-- view (vwThemes), stored procedures (spCreate/spUpdate/spDelete), permission
-- grants, and related settings.
--
-- DO NOT EDIT BY HAND. If the hand-written DDL above changes, re-run CodeGen
-- and replace this entire section with the fresh output.
--
-- =============================================================================
-- =============================================================================

/* SQL generated to create new entity MJ: Themes */

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
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'f38184cd-4ccd-4b52-b3bf-2a1f1a92a8eb',
         'MJ: Themes',
         'Themes',
         'A named brand theme. Stores ~8 brand seeds (color hue anchors, neutral character, vibrancy, shape, depth, type, viz palette) as JSON; the full --mj-* design-token contract is derived from the seeds at load. A theme is a brand — light/dark is the user''s mode layered under it, so a theme carries no per-mode values.',
         NULL,
         'Theme',
         'vwThemes',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Themes to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'f38184cd-4ccd-4b52-b3bf-2a1f1a92a8eb', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Themes for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('f38184cd-4ccd-4b52-b3bf-2a1f1a92a8eb', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Themes for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('f38184cd-4ccd-4b52-b3bf-2a1f1a92a8eb', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Themes for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('f38184cd-4ccd-4b52-b3bf-2a1f1a92a8eb', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Theme */
ALTER TABLE [${flyway:defaultSchema}].[Theme] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Theme */
UPDATE [${flyway:defaultSchema}].[Theme] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Theme */
ALTER TABLE [${flyway:defaultSchema}].[Theme] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Theme */
ALTER TABLE [${flyway:defaultSchema}].[Theme] ADD CONSTRAINT [DF___mj_Theme___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Theme */
ALTER TABLE [${flyway:defaultSchema}].[Theme] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Theme */
UPDATE [${flyway:defaultSchema}].[Theme] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Theme */
ALTER TABLE [${flyway:defaultSchema}].[Theme] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Theme */
ALTER TABLE [${flyway:defaultSchema}].[Theme] ADD CONSTRAINT [DF___mj_Theme___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd64de3b0-b319-4584-a98b-a826010f1753' OR (EntityID = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND Name = 'ID')) BEGIN
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
            'd64de3b0-b319-4584-a98b-a826010f1753',
            'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB', -- Entity: MJ: Themes
            100001,
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
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0c00d10a-24e5-4d8e-84da-6e71c425c967' OR (EntityID = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND Name = 'Name')) BEGIN
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
            '0c00d10a-24e5-4d8e-84da-6e71c425c967',
            'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB', -- Entity: MJ: Themes
            100002,
            'Name',
            'Name',
            'Display name for the theme (unique).',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a8b41183-7e1a-4738-a749-d9e96ae45438' OR (EntityID = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND Name = 'Description')) BEGIN
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
            'a8b41183-7e1a-4738-a749-d9e96ae45438',
            'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB', -- Entity: MJ: Themes
            100003,
            'Description',
            'Description',
            'Optional description of the theme.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '88fd6368-ec85-479a-b94e-99b770aeb1c6' OR (EntityID = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND Name = 'Seeds')) BEGIN
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
            '88fd6368-ec85-479a-b94e-99b770aeb1c6',
            'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB', -- Entity: MJ: Themes
            100004,
            'Seeds',
            'Seeds',
            'Brand seeds as JSON (the ThemeSeeds shape from @memberjunction/theme-engine): primary/accent/tertiary hue anchors, neutralChroma, vibrancy, radius, depth, fontFamily, and an optional vizPalette override. Source of truth — the full token contract is derived from this, not stored.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'af638c3f-c2b2-4eb2-bde0-1a0653b99c07' OR (EntityID = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND Name = 'LightMarkURL')) BEGIN
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
            'af638c3f-c2b2-4eb2-bde0-1a0653b99c07',
            'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB', -- Entity: MJ: Themes
            100005,
            'LightMarkURL',
            'Light Mark URL',
            'Public URL of the logo mark for light surfaces. Logos are variant uploads, never recolored.',
            'nvarchar',
            2000,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'acda295a-2c7d-4c19-8c48-82cfd29cab42' OR (EntityID = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND Name = 'DarkMarkURL')) BEGIN
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
            'acda295a-2c7d-4c19-8c48-82cfd29cab42',
            'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB', -- Entity: MJ: Themes
            100006,
            'DarkMarkURL',
            'Dark Mark URL',
            'Public URL of the logo mark for dark surfaces. Dark mode swaps to this artwork rather than transforming the light mark.',
            'nvarchar',
            2000,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b0bdf921-97ab-4e70-aa4f-0d817aff28d2' OR (EntityID = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND Name = 'WordmarkURL')) BEGIN
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
            'b0bdf921-97ab-4e70-aa4f-0d817aff28d2',
            'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB', -- Entity: MJ: Themes
            100007,
            'WordmarkURL',
            'Wordmark URL',
            'Optional public URL of the full wordmark logo.',
            'nvarchar',
            2000,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6857af21-cf95-4f71-81ce-d45f50960f69' OR (EntityID = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND Name = 'MonochromeURL')) BEGIN
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
            '6857af21-cf95-4f71-81ce-d45f50960f69',
            'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB', -- Entity: MJ: Themes
            100008,
            'MonochromeURL',
            'Monochrome URL',
            'Optional public URL of a single-fill monochrome logo variant.',
            'nvarchar',
            2000,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '127ec8c9-676b-48ef-a601-8a4c07a2e13f' OR (EntityID = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND Name = 'IsDefault')) BEGIN
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
            '127ec8c9-676b-48ef-a601-8a4c07a2e13f',
            'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB', -- Entity: MJ: Themes
            100009,
            'IsDefault',
            'Is Default',
            'When 1, this is the default theme applied when no other is selected. Single-default enforcement is handled at the application layer.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '333dd5e1-99dd-4a35-b9ac-ea92feda7d60' OR (EntityID = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND Name = 'Status')) BEGIN
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
            '333dd5e1-99dd-4a35-b9ac-ea92feda7d60',
            'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB', -- Entity: MJ: Themes
            100010,
            'Status',
            'Status',
            'Lifecycle status: Active (available), Inactive (retired), or Draft (in progress, not applied).',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '33703231-3b34-468b-992a-aa68cfb293d7' OR (EntityID = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND Name = 'Overrides')) BEGIN
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
            '33703231-3b34-468b-992a-aa68cfb293d7',
            'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB', -- Entity: MJ: Themes
            100011,
            'Overrides',
            'Overrides',
            'Optional advanced token overrides as a JSON object mapping a --mj-* CSS custom property name to a value (e.g. {"--mj-brand-primary-hover":"#0a5cff"}). Applied on top of the seed-derived token contract at load, before CustomCSS. Leave null to use the pure derived theme.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '88d23cfa-617f-4c2d-8852-d53a4dcf1064' OR (EntityID = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND Name = 'CustomCSS')) BEGIN
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
            '88d23cfa-617f-4c2d-8852-d53a4dcf1064',
            'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB', -- Entity: MJ: Themes
            100012,
            'CustomCSS',
            'Custom CSS',
            'Optional advanced raw CSS appended to the theme overlay and auto-scoped under [data-theme-overlay="<id>"]. Applied last, after the derived tokens and Overrides. Escape hatch for rules the seed/token model cannot express; leave null for none.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '23c23c48-efc9-4a5f-8adb-62c931449e48' OR (EntityID = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND Name = '__mj_CreatedAt')) BEGIN
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
            '23c23c48-efc9-4a5f-8adb-62c931449e48',
            'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB', -- Entity: MJ: Themes
            100013,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '685ddc27-4652-4103-9d87-437501043203' OR (EntityID = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '685ddc27-4652-4103-9d87-437501043203',
            'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB', -- Entity: MJ: Themes
            100014,
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

/* SQL text to insert entity field value with ID c0c38596-a091-4814-a113-5fcb0254a476 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c0c38596-a091-4814-a113-5fcb0254a476', '333DD5E1-99DD-4A35-B9AC-EA92FEDA7D60', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID dc26733c-dbee-418f-ba84-da8f00449b12 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('dc26733c-dbee-418f-ba84-da8f00449b12', '333DD5E1-99DD-4A35-B9AC-EA92FEDA7D60', 2, 'Draft', 'Draft', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f33aef06-6b6f-4b99-94c3-3129462b8725 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f33aef06-6b6f-4b99-94c3-3129462b8725', '333DD5E1-99DD-4A35-B9AC-EA92FEDA7D60', 3, 'Inactive', 'Inactive', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 333DD5E1-99DD-4A35-B9AC-EA92FEDA7D60 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='333DD5E1-99DD-4A35-B9AC-EA92FEDA7D60';

/* Index for Foreign Keys for Theme */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Themes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for MJ: Themes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Themes
-- Item: vwThemes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Themes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Theme
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwThemes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwThemes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwThemes]
AS
SELECT
    t.*
FROM
    [${flyway:defaultSchema}].[Theme] AS t
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwThemes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Themes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Themes
-- Item: Permissions for vwThemes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwThemes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Themes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Themes
-- Item: spCreateTheme
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Theme
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTheme]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTheme];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTheme]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Seeds nvarchar(MAX),
    @LightMarkURL_Clear bit = 0,
    @LightMarkURL nvarchar(1000) = NULL,
    @DarkMarkURL_Clear bit = 0,
    @DarkMarkURL nvarchar(1000) = NULL,
    @WordmarkURL_Clear bit = 0,
    @WordmarkURL nvarchar(1000) = NULL,
    @MonochromeURL_Clear bit = 0,
    @MonochromeURL nvarchar(1000) = NULL,
    @IsDefault bit = NULL,
    @Status nvarchar(20) = NULL,
    @Overrides_Clear bit = 0,
    @Overrides nvarchar(MAX) = NULL,
    @CustomCSS_Clear bit = 0,
    @CustomCSS nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Theme]
            (
                [ID],
                [Name],
                [Description],
                [Seeds],
                [LightMarkURL],
                [DarkMarkURL],
                [WordmarkURL],
                [MonochromeURL],
                [IsDefault],
                [Status],
                [Overrides],
                [CustomCSS]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @Seeds,
                CASE WHEN @LightMarkURL_Clear = 1 THEN NULL ELSE ISNULL(@LightMarkURL, NULL) END,
                CASE WHEN @DarkMarkURL_Clear = 1 THEN NULL ELSE ISNULL(@DarkMarkURL, NULL) END,
                CASE WHEN @WordmarkURL_Clear = 1 THEN NULL ELSE ISNULL(@WordmarkURL, NULL) END,
                CASE WHEN @MonochromeURL_Clear = 1 THEN NULL ELSE ISNULL(@MonochromeURL, NULL) END,
                ISNULL(@IsDefault, 0),
                ISNULL(@Status, 'Active'),
                CASE WHEN @Overrides_Clear = 1 THEN NULL ELSE ISNULL(@Overrides, NULL) END,
                CASE WHEN @CustomCSS_Clear = 1 THEN NULL ELSE ISNULL(@CustomCSS, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Theme]
            (
                [Name],
                [Description],
                [Seeds],
                [LightMarkURL],
                [DarkMarkURL],
                [WordmarkURL],
                [MonochromeURL],
                [IsDefault],
                [Status],
                [Overrides],
                [CustomCSS]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @Seeds,
                CASE WHEN @LightMarkURL_Clear = 1 THEN NULL ELSE ISNULL(@LightMarkURL, NULL) END,
                CASE WHEN @DarkMarkURL_Clear = 1 THEN NULL ELSE ISNULL(@DarkMarkURL, NULL) END,
                CASE WHEN @WordmarkURL_Clear = 1 THEN NULL ELSE ISNULL(@WordmarkURL, NULL) END,
                CASE WHEN @MonochromeURL_Clear = 1 THEN NULL ELSE ISNULL(@MonochromeURL, NULL) END,
                ISNULL(@IsDefault, 0),
                ISNULL(@Status, 'Active'),
                CASE WHEN @Overrides_Clear = 1 THEN NULL ELSE ISNULL(@Overrides, NULL) END,
                CASE WHEN @CustomCSS_Clear = 1 THEN NULL ELSE ISNULL(@CustomCSS, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwThemes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTheme] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Themes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTheme] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Themes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Themes
-- Item: spUpdateTheme
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Theme
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTheme]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTheme];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTheme]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Seeds nvarchar(MAX) = NULL,
    @LightMarkURL_Clear bit = 0,
    @LightMarkURL nvarchar(1000) = NULL,
    @DarkMarkURL_Clear bit = 0,
    @DarkMarkURL nvarchar(1000) = NULL,
    @WordmarkURL_Clear bit = 0,
    @WordmarkURL nvarchar(1000) = NULL,
    @MonochromeURL_Clear bit = 0,
    @MonochromeURL nvarchar(1000) = NULL,
    @IsDefault bit = NULL,
    @Status nvarchar(20) = NULL,
    @Overrides_Clear bit = 0,
    @Overrides nvarchar(MAX) = NULL,
    @CustomCSS_Clear bit = 0,
    @CustomCSS nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Theme]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Seeds] = ISNULL(@Seeds, [Seeds]),
        [LightMarkURL] = CASE WHEN @LightMarkURL_Clear = 1 THEN NULL ELSE ISNULL(@LightMarkURL, [LightMarkURL]) END,
        [DarkMarkURL] = CASE WHEN @DarkMarkURL_Clear = 1 THEN NULL ELSE ISNULL(@DarkMarkURL, [DarkMarkURL]) END,
        [WordmarkURL] = CASE WHEN @WordmarkURL_Clear = 1 THEN NULL ELSE ISNULL(@WordmarkURL, [WordmarkURL]) END,
        [MonochromeURL] = CASE WHEN @MonochromeURL_Clear = 1 THEN NULL ELSE ISNULL(@MonochromeURL, [MonochromeURL]) END,
        [IsDefault] = ISNULL(@IsDefault, [IsDefault]),
        [Status] = ISNULL(@Status, [Status]),
        [Overrides] = CASE WHEN @Overrides_Clear = 1 THEN NULL ELSE ISNULL(@Overrides, [Overrides]) END,
        [CustomCSS] = CASE WHEN @CustomCSS_Clear = 1 THEN NULL ELSE ISNULL(@CustomCSS, [CustomCSS]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwThemes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwThemes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTheme] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Theme table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTheme]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTheme];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTheme
ON [${flyway:defaultSchema}].[Theme]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Theme]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Theme] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Themes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTheme] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Themes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Themes
-- Item: spDeleteTheme
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Theme
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteTheme]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteTheme];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteTheme]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Theme]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTheme] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Themes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteTheme] TO [cdp_Developer], [cdp_Integration];

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '127EC8C9-676B-48EF-A601-8A4C07A2E13F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '333DD5E1-99DD-4A35-B9AC-EA92FEDA7D60'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '0C00D10A-24E5-4D8E-84DA-6E71C425C967'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ: Themes.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D64DE3B0-B319-4584-A98B-A826010F1753' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Themes.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Theme Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0C00D10A-24E5-4D8E-84DA-6E71C425C967' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Themes.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Theme Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A8B41183-7E1A-4738-A749-D9E96AE45438' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Themes.Seeds 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Theme Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '88FD6368-EC85-479A-B94E-99B770AEB1C6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Themes.LightMarkURL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Brand Assets',
   GeneratedFormSection = 'Category',
   DisplayName = 'Light Mode Logo',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = 'AF638C3F-C2B2-4EB2-BDE0-1A0653B99C07' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Themes.DarkMarkURL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Brand Assets',
   GeneratedFormSection = 'Category',
   DisplayName = 'Dark Mode Logo',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = 'ACDA295A-2C7D-4C19-8C48-82CFD29CAB42' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Themes.WordmarkURL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Brand Assets',
   GeneratedFormSection = 'Category',
   DisplayName = 'Wordmark Logo',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = 'B0BDF921-97AB-4E70-AA4F-0D817AFF28D2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Themes.MonochromeURL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Brand Assets',
   GeneratedFormSection = 'Category',
   DisplayName = 'Monochrome Logo',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = '6857AF21-CF95-4F71-81CE-D45F50960F69' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Themes.IsDefault 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Theme Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Is Default Theme',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '127EC8C9-676B-48EF-A601-8A4C07A2E13F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Themes.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Theme Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '333DD5E1-99DD-4A35-B9AC-EA92FEDA7D60' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Themes.Overrides 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Advanced Styling',
   GeneratedFormSection = 'Category',
   DisplayName = 'Token Overrides',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '33703231-3B34-468B-992A-AA68CFB293D7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Themes.CustomCSS 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Advanced Styling',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'CSS'
WHERE 
   ID = '88D23CFA-617F-4C2D-8852-D53A4DCF1064' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Themes.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '23C23C48-EFC9-4A5F-8ADB-62C931449E48' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Themes.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '685DDC27-4652-4103-9D87-437501043203' AND AutoUpdateCategory = 1;

/* Set entity icon to fa fa-palette */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-palette', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB';

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('1753c9ab-4de4-46ff-b65f-ac32a3920d53', 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB', 'FieldCategoryInfo', '{"Theme Configuration":{"icon":"fa fa-sliders-h","description":"Core identity, status, and seed configuration for the brand theme"},"Brand Assets":{"icon":"fa fa-image","description":"Logo variants and brand imagery for different surfaces"},"Advanced Styling":{"icon":"fa fa-code","description":"Advanced token overrides and custom CSS for bespoke styling"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE());

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('a15572f4-ea8f-45c4-9bd3-256914a167b4', 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB', 'FieldCategoryIcons', '{"Theme Configuration":"fa fa-sliders-h","Brand Assets":"fa fa-image","Advanced Styling":"fa fa-code","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE());

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB';

