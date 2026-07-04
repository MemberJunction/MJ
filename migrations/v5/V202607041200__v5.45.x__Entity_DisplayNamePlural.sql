-- Adds DisplayNamePlural + AutoUpdateDisplayNamePlural to the Entity table.
--
-- WHY: business-user surfaces (grid headers, "no records" empty states, counts) read
-- better with the entity's own domain noun in PLURAL form — "No Contacts yet",
-- "142 Companies" — instead of the platform meta-noun "entity" or a generic "records".
-- The runtime already derives a plural algorithmically (EntityInfo.DisplayNamePlural →
-- generatePluralName), but an algorithm mis-handles some words and only speaks English.
-- These columns let the correct plural be STORED (and edited), mirroring the existing
-- DisplayName / AutoUpdateDescription pattern already on this table:
--
--   * DisplayNamePlural           — the stored plural. When set, it is used verbatim.
--                                   This is where an admin (or CodeGen's LLM) fixes a
--                                   word the algorithm gets wrong, and the seam for
--                                   non-English plurals.
--   * AutoUpdateDisplayNamePlural — when 1 (default), CodeGen may (re)derive
--                                   DisplayNamePlural on each run; set to 0 to LOCK a
--                                   human-authored value so codegen won't overwrite it.
--                                   Parallels the entity's AutoUpdateDescription flag.
--
-- The runtime getter prefers the stored value and falls back to the algorithmic plural
-- when it is null — so behavior is unchanged until CodeGen populates the column, and any
-- entity created before this migration keeps working via the fallback.
--
-- NOTE: the EntityField rows for these columns, the regenerated vwEntities view, and the
-- spCreate/spUpdate procs are all produced by CodeGen — do NOT hand-write them here.
-- Run `mj codegen` after applying this migration.

ALTER TABLE ${flyway:defaultSchema}.Entity ADD
    DisplayNamePlural NVARCHAR(255) NULL,
    AutoUpdateDisplayNamePlural BIT NOT NULL DEFAULT 1;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional business-friendly PLURAL of the entity''s display name (e.g. "Contacts", "Companies", "Addresses"). When set, it is used verbatim on business-user surfaces (grid headers, empty states, counts); when null, the runtime derives a plural from DisplayName/Name via generatePluralName. Lets an admin or CodeGen override cases the algorithmic pluralizer gets wrong, and is the seam for non-English plurals. Display-only — never a lookup key.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'DisplayNamePlural';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1 (default), allows the system/LLM to auto-update DisplayNamePlural during CodeGen; when 0, the user has locked this field and codegen will not overwrite it. Mirrors AutoUpdateDescription.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'AutoUpdateDisplayNamePlural';
