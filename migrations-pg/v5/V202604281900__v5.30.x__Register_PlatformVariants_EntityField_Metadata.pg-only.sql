-- Register the PG-only PlatformVariants column on MJ: Queries in EntityField
-- metadata so BaseEntity.SetMany() doesn't throw "Field PlatformVariants does
-- not exist on MJ: Queries" when loading rows from vwQueries (which still
-- exposes the column via SELECT q.*).
--
-- Background: V202602151201 (PG-only) added PlatformVariants TEXT NULL columns
-- to Query, UserView, and RowLevelSecurityFilter as part of an early multi-
-- dialect-SQL design. The corresponding SQL Server migration was deleted as
-- "errant" (commit 36df75cf0c, 2026-03-01) — that codebase shifted to the
-- MJ: Query SQLs child table + GetPlatformSQL() resolver, leaving PG with
-- orphaned columns and no EntityField metadata for them.
--
-- TODO (post-ship cleanup): drop the PlatformVariants columns and the
-- corresponding deprecated QueryInfo.PlatformVariants property. That requires
-- a coordinated migration because spCreateQuery and spUpdateQuery RETURN SETOF
-- vwQueries (so dropping the view CASCADEs the sprocs) and the sprocs accept
-- PlatformVariants as a parameter. CodeGen would need to regenerate both. For
-- this PR we take the lower-risk path of registering the column in metadata
-- so existing CRUD continues to work; the column stays unused (replaced by
-- QuerySQL) but is now visible to BaseEntity.

DO $$
DECLARE
    v_query_entity_id    UUID := '1b248f34-2837-ef11-86d4-6045bdee16e6';  -- MJ: Queries
    v_userview_entity_id UUID := 'e4238f34-2837-ef11-86d4-6045bdee16e6';  -- MJ: User Views
    v_rlsfilter_entity_id UUID := 'f7238f34-2837-ef11-86d4-6045bdee16e6';  -- MJ: Row Level Security Filters
    v_description TEXT := 'JSON column containing platform-specific SQL variants for multi-database support. Stores alternative SQL for platforms other than the default. DEPRECATED: prefer the MJ: Query SQLs child table via GetPlatformSQL().';
BEGIN
    -- Query.PlatformVariants
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField"
        WHERE "EntityID" = v_query_entity_id AND "Name" = 'PlatformVariants'
    ) THEN
        INSERT INTO __mj."EntityField"
            ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description",
             "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue",
             "AutoIncrement", "ValueListType", "ExtendedType", "DefaultInView",
             "IsVirtual", "IsNameField", "IsPrimaryKey", "IsUnique",
             "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView",
             "GeneratedFormSection", "AllowUpdateAPI", "AllowUpdateInView")
        VALUES
            ('a3f7c601-b13b-4e58-9dcd-173c82f13771'::uuid, v_query_entity_id,
             100100, 'PlatformVariants', 'Platform Variants', v_description,
             'TEXT', -1, 0, 0, true, NULL,
             false, 'None', NULL, false,
             false, false, false, false,
             false, false,
             'Details', true, true);
    END IF;

    -- UserView.PlatformVariants
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField"
        WHERE "EntityID" = v_userview_entity_id AND "Name" = 'PlatformVariants'
    ) THEN
        INSERT INTO __mj."EntityField"
            ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description",
             "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue",
             "AutoIncrement", "ValueListType", "ExtendedType", "DefaultInView",
             "IsVirtual", "IsNameField", "IsPrimaryKey", "IsUnique",
             "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView",
             "GeneratedFormSection", "AllowUpdateAPI", "AllowUpdateInView")
        VALUES
            ('a3f7c602-b13b-4e58-9dcd-173c82f13772'::uuid, v_userview_entity_id,
             100100, 'PlatformVariants', 'Platform Variants', v_description,
             'TEXT', -1, 0, 0, true, NULL,
             false, 'None', NULL, false,
             false, false, false, false,
             false, false,
             'Details', true, true);
    END IF;

    -- RowLevelSecurityFilter.PlatformVariants
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField"
        WHERE "EntityID" = v_rlsfilter_entity_id AND "Name" = 'PlatformVariants'
    ) THEN
        INSERT INTO __mj."EntityField"
            ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description",
             "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue",
             "AutoIncrement", "ValueListType", "ExtendedType", "DefaultInView",
             "IsVirtual", "IsNameField", "IsPrimaryKey", "IsUnique",
             "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView",
             "GeneratedFormSection", "AllowUpdateAPI", "AllowUpdateInView")
        VALUES
            ('a3f7c603-b13b-4e58-9dcd-173c82f13773'::uuid, v_rlsfilter_entity_id,
             100100, 'PlatformVariants', 'Platform Variants', v_description,
             'TEXT', -1, 0, 0, true, NULL,
             false, 'None', NULL, false,
             false, false, false, false,
             false, false,
             'Details', true, true);
    END IF;
END $$;
