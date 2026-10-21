-- =============================================================================
-- Entity.AutoUpdateDisplayName — a per-entity lock on the display name, so
-- CodeGen can improve `Entity.DisplayName` without ever overwriting a human.
-- =============================================================================
--
-- THE ASYMMETRY THIS CLOSES. `EntityField` has carried `AutoUpdateDisplayName`
-- since v2.122, and CodeGen uses it: the LLM-generated field display names from
-- the FormLayout feature are written only where that flag is 1, so a display
-- name an administrator typed is never clobbered by a later run.
--
-- `Entity` has no such flag. It carries AutoUpdateDescription,
-- AutoUpdateFullTextSearch, AutoUpdateAllowUserSearchAPI and
-- AutoUpdateSupportsGeoCoding — but nothing governing DisplayName. That is not
-- an oversight so much as a consequence: nothing ever auto-updated an entity's
-- display name, so there was nothing to lock. `Entity.DisplayName` is set once,
-- at entity creation, by stripping the schema's configured prefix/suffix off the
-- entity name, and is never revisited.
--
-- Adding the flag is therefore a precondition for the feature that uses it, not
-- a change in its own right: without it, an LLM display-name pass would have no
-- way to distinguish "this is the mechanical default" from "an administrator
-- chose this", and would have to either skip every entity that already has a
-- DisplayName (making it useless on exactly the legacy schemas it exists to fix)
-- or overwrite deliberate human choices.
--
-- DEFAULT 1, MATCHING EntityField. Existing rows opt in. That is safe because
-- the flag alone changes nothing: the display-name generation it gates is a
-- separate advanced-generation feature that ships DISABLED, and an administrator
-- who never enables it will never see a display name change. Defaulting to 0
-- instead would mean every existing entity is locked at rollout, so enabling the
-- feature later would silently do nothing until each row was flipped by hand —
-- the flag would read as broken rather than off.
--
-- Administrators who want a specific entity's display name frozen set it to 0,
-- exactly as they already do for a field.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[Entity]
ADD [AutoUpdateDisplayName] BIT NOT NULL
    CONSTRAINT [DF_Entity_AutoUpdateDisplayName] DEFAULT 1;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1 (the default), CodeGen may auto-update this entity''s DisplayName — currently via the optional EntityDisplayNames advanced-generation feature, which asks an LLM to expand opaque table-derived names (ACCT_STAT_CD) into readable ones (Account Status Codes). When 0, the DisplayName is locked and CodeGen will not change it, whatever any generator proposes. Mirrors EntityField.AutoUpdateDisplayName. Note this flag governs only AUTOMATIC updates: a user editing the DisplayName directly is unaffected either way.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'AutoUpdateDisplayName';
GO
