-- =============================================================================
-- Entity.GeneratedBaseViewName — let an entity have BOTH a generated base view
-- and a custom one layered over it.
-- =============================================================================
--
-- THE PROBLEM THIS SOLVES. `BaseViewGenerated = 0` is all-or-nothing: CodeGen
-- stops generating the base view entirely, so the application inherits the WHOLE
-- thing — every related-entity display join, the geo join, the recursive root-ID
-- OUTER APPLY, the soft-delete predicate — in order to add one computed column.
--
-- That inheritance is not a one-time cost. It is a standing obligation to
-- hand-maintain generated SQL: add a foreign key later and its display field
-- simply never appears, because nothing regenerates the join. The failure is
-- silent — the column is absent rather than wrong — which is the worst shape a
-- schema defect can take. It also freezes the entity at whatever MemberJunction
-- generated on the day the view was copied; geo columns and root-ID columns both
-- arrived after custom views existed in the wild, and no custom view has them
-- unless somebody hand-merged.
--
-- WHAT THIS COLUMN DOES. When `GeneratedBaseViewName` is non-NULL, CodeGen keeps
-- generating a full base view — under THAT name — and the application owns
-- `BaseView`, which is expected to wrap it:
--
--     CREATE VIEW vwOrderHeaders AS
--     SELECT g.*, CASE WHEN ... END AS IsOverdue
--     FROM   vwOrderHeadersGenerated g
--
-- The application layer is then a few reviewable lines, and everything
-- underneath keeps regenerating. A new foreign key appears automatically.
--
-- ADDITIVE ON PURPOSE. NULL — every existing row — reproduces today's behaviour
-- exactly: `BaseViewGenerated` alone decides, and there is no second view. This
-- introduces no migration of semantics and nothing to re-verify for installs
-- that do not opt in.
--
-- WHAT READS WHICH. `BaseView` remains the entity's public surface: entity field
-- discovery, permissions, and the generated CRUD procedures all target it, so a
-- computed column added in the custom layer becomes a first-class EntityField
-- (IsVirtual = 1) and is returned by spCreate/spUpdate/spDelete like any other.
-- `GeneratedBaseViewName` is an implementation detail of that surface.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[Entity]
    ADD [GeneratedBaseViewName] NVARCHAR(255) NULL;
GO

-- A view cannot select from itself. Equal names would be an infinite recursion
-- that SQL Server reports at query time, far from the metadata that caused it,
-- so it is refused where it is written.
--
-- The BaseView IS NOT NULL arm is not redundant. `X <> NULL` evaluates to UNKNOWN,
-- and a CHECK constraint PASSES on UNKNOWN — so without it a row could name an
-- inner view while leaving the public surface NULL. That row is "layered" by every
-- runtime test, but permissions and the CRUD procedures target BaseView, so CodeGen
-- would emit GRANT/SELECT against [schema].[null]. Layering requires a public view
-- to layer onto.
ALTER TABLE [${flyway:defaultSchema}].[Entity]
    ADD CONSTRAINT [CK_Entity_GeneratedBaseViewName_NotBaseView]
    CHECK ([GeneratedBaseViewName] IS NULL
           OR ([BaseView] IS NOT NULL AND [GeneratedBaseViewName] <> [BaseView]));
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When set, CodeGen generates the entity''s full base view under THIS name instead of BaseView, and the application owns BaseView — which is expected to wrap it (SELECT g.*, <extras> FROM <GeneratedBaseViewName> g). This gives an entity a custom base view WITHOUT inheriting the generated SQL: related-entity display joins, geo columns and recursive root-ID columns keep regenerating underneath, so a foreign key added later still appears. NULL (the default, and every pre-existing row) means the previous all-or-nothing behaviour: BaseViewGenerated alone decides whether CodeGen writes BaseView, and there is no second view. BaseView remains the public surface — entity field discovery, permissions and the generated CRUD procedures all target it. SQL SERVER ONLY: layering relies on sp_refreshview to re-resolve the application-owned outer view''s SELECT * against a regenerated inner view. PostgreSQL freezes a view''s column list at creation and has no refresh equivalent, so CodeGen rejects this column on PostgreSQL rather than let the outer view go silently stale.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'GeneratedBaseViewName';
GO
