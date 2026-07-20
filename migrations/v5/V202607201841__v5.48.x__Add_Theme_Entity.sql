/* ============================================================================
   Add Theme Entity — Org Theming
   v5.48.x

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
