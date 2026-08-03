-- =============================================================================
-- API-Key-Scoped Row Filters (5.52)
-- =============================================================================
-- Design: plans/api-key-row-filters.md
--
-- MJ's row filtering binds to ROLES (EntityPermission.*RLSFilterID) and to
-- SESSIONS (UserInfo.MagicLinkScope), but never to an API KEY. Two keys issued
-- to the same user therefore have identical row visibility, and there is no way
-- to narrow one below the other — an API key cannot be *less* than its owner,
-- which is what would make key rotation and revocation meaningful as a
-- blast-radius control.
--
-- This migration adds the storage for that third dimension: an optional row
-- filter on each scope-rule row.
--
--   * APIKeyScope.RowFilterID          — row restriction this key's grant carries
--   * APIApplicationScope.RowFilterID  — ceiling every key in the application
--                                        inherits and cannot widen
--
-- Both reference the EXISTING [RowLevelSecurityFilter] table already used by
-- role-based RLS (four existing FKs, all from EntityPermission). Reusing it
-- means the key filter flows through the same MarkupFilterText substitution
-- engine and the same enforcement points, rather than introducing a second
-- filter language with its own composition and audit semantics.
--
-- The FK is deliberate beyond convenience: with NO ACTION (the default), a
-- filter record cannot be deleted while a live API key references it. You
-- cannot silently un-filter a key by deleting its filter.
--
-- BOTH COLUMNS ARE NULLABLE. NULL = current behavior, unchanged. This migration
-- is additive and changes no existing behavior on its own; enforcement lands
-- with the WS3 code (see the plan's §5.5 — the filter must be evaluated OUTSIDE
-- the role-RLS exemption, or it is silently absent for exactly the privileged
-- principals that hold API keys).
--
-- Deliberately NOT in this migration:
--   * FK indexes — CodeGen creates IDX_AUTO_MJ_FKEY_<table>_<column>
--   * EntityField / entity metadata rows — CodeGen owns these
--   * Views and stored procedures — CodeGen owns these
-- =============================================================================

-- ---------------------------------------------------------------------------
-- APIKeyScope: per-key row filter
-- ---------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[APIKeyScope]
    ADD [RowFilterID] UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[APIKeyScope]
    ADD CONSTRAINT [FK_APIKeyScope_RowFilter]
    FOREIGN KEY ([RowFilterID]) REFERENCES [${flyway:defaultSchema}].[RowLevelSecurityFilter]([ID]);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional row-level filter narrowing WHICH RECORDS this scope grant applies to, in addition to the resource pattern that governs which entities. References the same RowLevelSecurityFilter catalog used by role-based RLS, so the filter text flows through the standard {{Token}} substitution engine and every existing RLS enforcement point (RunView, Load by primary key, save, delete, search). NULL (the default) means no row restriction — behavior identical to before this column existed. When set, the rule''s ResourcePattern must name a single exact entity (no wildcards, no comma-separated lists), every column the filter references must resolve to a real non-virtual field on that entity, and every other referrer of the same filter record must resolve to that same entity. Critically, this filter is evaluated INDEPENDENTLY of the role-RLS exemption: a user exempt from role RLS is still bound by their key''s filter, because narrowing a principal below what their roles allow is the entire purpose of a key ceiling.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'APIKeyScope',
    @level2type = N'COLUMN', @level2name = N'RowFilterID';
GO

-- ---------------------------------------------------------------------------
-- APIApplicationScope: application ceiling row filter
-- ---------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[APIApplicationScope]
    ADD [RowFilterID] UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[APIApplicationScope]
    ADD CONSTRAINT [FK_APIApplicationScope_RowFilter]
    FOREIGN KEY ([RowFilterID]) REFERENCES [${flyway:defaultSchema}].[RowLevelSecurityFilter]([ID]);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional row-level filter acting as a CEILING for every API key operating under this application — a restriction keys inherit and cannot widen. Composes with the per-key filter (APIKeyScope.RowFilterID) and with role-based RLS using AND, never OR, so no layer can broaden another. References the same RowLevelSecurityFilter catalog used by role-based RLS. NULL (the default) means the application imposes no row ceiling. The same authoring constraints as APIKeyScope.RowFilterID apply: exact single-entity resource pattern, all referenced columns must exist on that entity, and all referrers of the filter record must resolve to the same entity.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'APIApplicationScope',
    @level2type = N'COLUMN', @level2name = N'RowFilterID';
GO
