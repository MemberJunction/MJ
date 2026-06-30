-- =====================================================================
-- Scoped Prompt Parts — Resolver Controls (v5.44.x)
-- =====================================================================
--
-- Adds metadata controls that drive the PromptComponentResolver's
-- inclusion/exclusion decision, so the merge semantics are DATA-driven
-- (per row) rather than hardcoded:
--
--   * MergeBehavior — within a part Name, does the most-specific part
--     REPLACE less-specific same-named parts ('Override', the default),
--     or are all in-scope same-named parts INCLUDED additively ('Append')?
--     This is the additive-vs-replace knob, per row.
--   * Priority — precedence/tie-break beyond scope-specificity (higher
--     wins when two same-Name parts tie on scope specificity), and a
--     secondary ordering key.
--
-- The base PromptComponentResolver honors these; downstream consumers can
-- subclass PromptComponentResolver (registered via @RegisterClass, resolved
-- through ClassFactory) and override the protected hooks for fully custom
-- inclusion logic. See plans/scoped-prompt-components.
--
-- Note: DDL + extended properties only.
-- =====================================================================

ALTER TABLE ${flyway:defaultSchema}.ScopedPromptPart ADD
    MergeBehavior NVARCHAR(20) NOT NULL DEFAULT 'Override',
    Priority INT NOT NULL DEFAULT 0,
    CONSTRAINT CK_ScopedPromptPart_MergeBehavior CHECK (MergeBehavior IN ('Override', 'Append'));

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Within a part Name, how this part combines with less-specific same-named parts: ''Override'' (default) = the most-specific part replaces the others; ''Append'' = all in-scope same-named parts are included additively (ordered by specificity then Priority then Sort). Read by the PromptComponentResolver.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ScopedPromptPart',
    @level2type = N'COLUMN', @level2name = N'MergeBehavior';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Precedence / tie-break for resolution. Higher wins when two same-Name parts tie on scope specificity; also used as a secondary ordering key after Sort. Default 0.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ScopedPromptPart',
    @level2type = N'COLUMN', @level2name = N'Priority';
