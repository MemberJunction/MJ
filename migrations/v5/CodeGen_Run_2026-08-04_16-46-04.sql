/* SQL text to insert 2 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7c0fd852-97ab-4d57-86fc-52813e049e1e' OR (EntityID = 'F1741CE5-EACA-492D-9869-9B55D33D9C29' AND Name = 'RowFilterID')) BEGIN
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
            '7c0fd852-97ab-4d57-86fc-52813e049e1e',
            'F1741CE5-EACA-492D-9869-9B55D33D9C29', -- Entity: MJ: API Key Scopes
            100022,
            'RowFilterID',
            'Row Filter ID',
            'Optional row-level filter narrowing WHICH RECORDS this scope grant applies to, in addition to the resource pattern that governs which entities. References the same RowLevelSecurityFilter catalog used by role-based RLS, so the filter text flows through the standard {{Token}} substitution engine and every existing RLS enforcement point (RunView, Load by primary key, save, delete, search). NULL (the default) means no row restriction — behavior identical to before this column existed. When set, the rule''s ResourcePattern must name a single exact entity (no wildcards, no comma-separated lists), every column the filter references must resolve to a real non-virtual field on that entity, and every other referrer of the same filter record must resolve to that same entity. Critically, this filter is evaluated INDEPENDENTLY of the role-RLS exemption: a user exempt from role RLS is still bound by their key''s filter, because narrowing a principal below what their roles allow is the entire purpose of a key ceiling.',
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
            'F7238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '16b21ba4-eeb6-400d-9d7e-6799482be897' OR (EntityID = 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF' AND Name = 'RowFilterID')) BEGIN
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
            '16b21ba4-eeb6-400d-9d7e-6799482be897',
            'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF', -- Entity: MJ: API Application Scopes
            100022,
            'RowFilterID',
            'Row Filter ID',
            'Optional row-level filter acting as a CEILING for every API key operating under this application — a restriction keys inherit and cannot widen. Composes with the per-key filter (APIKeyScope.RowFilterID) and with role-based RLS using AND, never OR, so no layer can broaden another. References the same RowLevelSecurityFilter catalog used by role-based RLS. NULL (the default) means the application imposes no row ceiling. The same authoring constraints as APIKeyScope.RowFilterID apply: exact single-entity resource pattern, all referenced columns must exist on that entity, and all referrers of the filter record must resolve to the same entity.',
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
            'F7238F34-2837-EF11-86D4-6045BDEE16E6',
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


/* Create Entity Relationship: MJ: Row Level Security Filters -> MJ: API Key Scopes (One To Many via RowFilterID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5362464c-a454-4408-a95d-be0f69839a77'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5362464c-a454-4408-a95d-be0f69839a77', 'F7238F34-2837-EF11-86D4-6045BDEE16E6', 'F1741CE5-EACA-492D-9869-9B55D33D9C29', 'RowFilterID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Row Level Security Filters -> MJ: API Application Scopes (One To Many via RowFilterID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'da3507bf-5489-43e2-987c-d786c4496c82'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('da3507bf-5489-43e2-987c-d786c4496c82', 'F7238F34-2837-EF11-86D4-6045BDEE16E6', 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF', 'RowFilterID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for APIApplicationScope */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Application Scopes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ApplicationID in table APIApplicationScope
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIApplicationScope_ApplicationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIApplicationScope]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIApplicationScope_ApplicationID ON [${flyway:defaultSchema}].[APIApplicationScope] ([ApplicationID]);

-- Index for foreign key ScopeID in table APIApplicationScope
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIApplicationScope_ScopeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIApplicationScope]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIApplicationScope_ScopeID ON [${flyway:defaultSchema}].[APIApplicationScope] ([ScopeID]);

-- Index for foreign key RowFilterID in table APIApplicationScope
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIApplicationScope_RowFilterID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIApplicationScope]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIApplicationScope_RowFilterID ON [${flyway:defaultSchema}].[APIApplicationScope] ([RowFilterID]);

/* SQL text to update entity field related entity name field map for entity field ID 16B21BA4-EEB6-400D-9D7E-6799482BE897 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='16B21BA4-EEB6-400D-9D7E-6799482BE897', @RelatedEntityNameFieldMap='RowFilter';

/* Base View SQL for MJ: API Application Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Application Scopes
-- Item: vwAPIApplicationScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: API Application Scopes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  APIApplicationScope
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAPIApplicationScopes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAPIApplicationScopes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAPIApplicationScopes]
AS
SELECT
    a.*,
    MJAPIApplication_ApplicationID.[Name] AS [Application],
    MJAPIScope_ScopeID.[Name] AS [Scope],
    MJRowLevelSecurityFilter_RowFilterID.[Name] AS [RowFilter]
FROM
    [${flyway:defaultSchema}].[APIApplicationScope] AS a
INNER JOIN
    [${flyway:defaultSchema}].[APIApplication] AS MJAPIApplication_ApplicationID
  ON
    [a].[ApplicationID] = MJAPIApplication_ApplicationID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[APIScope] AS MJAPIScope_ScopeID
  ON
    [a].[ScopeID] = MJAPIScope_ScopeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[RowLevelSecurityFilter] AS MJRowLevelSecurityFilter_RowFilterID
  ON
    [a].[RowFilterID] = MJRowLevelSecurityFilter_RowFilterID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIApplicationScopes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: API Application Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Application Scopes
-- Item: Permissions for vwAPIApplicationScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIApplicationScopes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: API Application Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Application Scopes
-- Item: spCreateAPIApplicationScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR APIApplicationScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAPIApplicationScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAPIApplicationScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAPIApplicationScope]
    @ID uniqueidentifier = NULL,
    @ApplicationID uniqueidentifier,
    @ScopeID uniqueidentifier,
    @ResourcePattern_Clear bit = 0,
    @ResourcePattern nvarchar(750) = NULL,
    @PatternType nvarchar(20) = NULL,
    @IsDeny bit = NULL,
    @Priority int = NULL,
    @RowFilterID_Clear bit = 0,
    @RowFilterID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[APIApplicationScope]
            (
                [ID],
                [ApplicationID],
                [ScopeID],
                [ResourcePattern],
                [PatternType],
                [IsDeny],
                [Priority],
                [RowFilterID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ApplicationID,
                @ScopeID,
                CASE WHEN @ResourcePattern_Clear = 1 THEN NULL ELSE ISNULL(@ResourcePattern, NULL) END,
                ISNULL(@PatternType, 'Include'),
                ISNULL(@IsDeny, 0),
                ISNULL(@Priority, 0),
                CASE WHEN @RowFilterID_Clear = 1 THEN NULL ELSE ISNULL(@RowFilterID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[APIApplicationScope]
            (
                [ApplicationID],
                [ScopeID],
                [ResourcePattern],
                [PatternType],
                [IsDeny],
                [Priority],
                [RowFilterID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ApplicationID,
                @ScopeID,
                CASE WHEN @ResourcePattern_Clear = 1 THEN NULL ELSE ISNULL(@ResourcePattern, NULL) END,
                ISNULL(@PatternType, 'Include'),
                ISNULL(@IsDeny, 0),
                ISNULL(@Priority, 0),
                CASE WHEN @RowFilterID_Clear = 1 THEN NULL ELSE ISNULL(@RowFilterID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAPIApplicationScopes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIApplicationScope] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: API Application Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIApplicationScope] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: API Application Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Application Scopes
-- Item: spUpdateAPIApplicationScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR APIApplicationScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAPIApplicationScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIApplicationScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIApplicationScope]
    @ID uniqueidentifier,
    @ApplicationID uniqueidentifier = NULL,
    @ScopeID uniqueidentifier = NULL,
    @ResourcePattern_Clear bit = 0,
    @ResourcePattern nvarchar(750) = NULL,
    @PatternType nvarchar(20) = NULL,
    @IsDeny bit = NULL,
    @Priority int = NULL,
    @RowFilterID_Clear bit = 0,
    @RowFilterID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIApplicationScope]
    SET
        [ApplicationID] = ISNULL(@ApplicationID, [ApplicationID]),
        [ScopeID] = ISNULL(@ScopeID, [ScopeID]),
        [ResourcePattern] = CASE WHEN @ResourcePattern_Clear = 1 THEN NULL ELSE ISNULL(@ResourcePattern, [ResourcePattern]) END,
        [PatternType] = ISNULL(@PatternType, [PatternType]),
        [IsDeny] = ISNULL(@IsDeny, [IsDeny]),
        [Priority] = ISNULL(@Priority, [Priority]),
        [RowFilterID] = CASE WHEN @RowFilterID_Clear = 1 THEN NULL ELSE ISNULL(@RowFilterID, [RowFilterID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAPIApplicationScopes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAPIApplicationScopes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIApplicationScope] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the APIApplicationScope table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAPIApplicationScope]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAPIApplicationScope];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAPIApplicationScope
ON [${flyway:defaultSchema}].[APIApplicationScope]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIApplicationScope]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[APIApplicationScope] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: API Application Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIApplicationScope] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: API Application Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Application Scopes
-- Item: spDeleteAPIApplicationScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIApplicationScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAPIApplicationScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIApplicationScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIApplicationScope]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[APIApplicationScope]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIApplicationScope] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: API Application Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIApplicationScope] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for APIKeyScope */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key APIKeyID in table APIKeyScope
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIKeyScope_APIKeyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIKeyScope]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIKeyScope_APIKeyID ON [${flyway:defaultSchema}].[APIKeyScope] ([APIKeyID]);

-- Index for foreign key ScopeID in table APIKeyScope
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIKeyScope_ScopeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIKeyScope]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIKeyScope_ScopeID ON [${flyway:defaultSchema}].[APIKeyScope] ([ScopeID]);

-- Index for foreign key RowFilterID in table APIKeyScope
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIKeyScope_RowFilterID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIKeyScope]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIKeyScope_RowFilterID ON [${flyway:defaultSchema}].[APIKeyScope] ([RowFilterID]);

/* SQL text to update entity field related entity name field map for entity field ID 7C0FD852-97AB-4D57-86FC-52813E049E1E */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7C0FD852-97AB-4D57-86FC-52813E049E1E', @RelatedEntityNameFieldMap='RowFilter';

/* Base View SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: vwAPIKeyScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: API Key Scopes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  APIKeyScope
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAPIKeyScopes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAPIKeyScopes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAPIKeyScopes]
AS
SELECT
    a.*,
    MJAPIKey_APIKeyID.[Label] AS [APIKey],
    MJAPIScope_ScopeID.[Name] AS [Scope],
    MJRowLevelSecurityFilter_RowFilterID.[Name] AS [RowFilter]
FROM
    [${flyway:defaultSchema}].[APIKeyScope] AS a
INNER JOIN
    [${flyway:defaultSchema}].[APIKey] AS MJAPIKey_APIKeyID
  ON
    [a].[APIKeyID] = MJAPIKey_APIKeyID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[APIScope] AS MJAPIScope_ScopeID
  ON
    [a].[ScopeID] = MJAPIScope_ScopeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[RowLevelSecurityFilter] AS MJRowLevelSecurityFilter_RowFilterID
  ON
    [a].[RowFilterID] = MJRowLevelSecurityFilter_RowFilterID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIKeyScopes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: Permissions for vwAPIKeyScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIKeyScopes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: spCreateAPIKeyScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR APIKeyScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAPIKeyScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAPIKeyScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAPIKeyScope]
    @ID uniqueidentifier = NULL,
    @APIKeyID uniqueidentifier,
    @ScopeID uniqueidentifier,
    @ResourcePattern_Clear bit = 0,
    @ResourcePattern nvarchar(750) = NULL,
    @PatternType nvarchar(20) = NULL,
    @IsDeny bit = NULL,
    @Priority int = NULL,
    @RowFilterID_Clear bit = 0,
    @RowFilterID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[APIKeyScope]
            (
                [ID],
                [APIKeyID],
                [ScopeID],
                [ResourcePattern],
                [PatternType],
                [IsDeny],
                [Priority],
                [RowFilterID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @APIKeyID,
                @ScopeID,
                CASE WHEN @ResourcePattern_Clear = 1 THEN NULL ELSE ISNULL(@ResourcePattern, NULL) END,
                ISNULL(@PatternType, 'Include'),
                ISNULL(@IsDeny, 0),
                ISNULL(@Priority, 0),
                CASE WHEN @RowFilterID_Clear = 1 THEN NULL ELSE ISNULL(@RowFilterID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[APIKeyScope]
            (
                [APIKeyID],
                [ScopeID],
                [ResourcePattern],
                [PatternType],
                [IsDeny],
                [Priority],
                [RowFilterID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @APIKeyID,
                @ScopeID,
                CASE WHEN @ResourcePattern_Clear = 1 THEN NULL ELSE ISNULL(@ResourcePattern, NULL) END,
                ISNULL(@PatternType, 'Include'),
                ISNULL(@IsDeny, 0),
                ISNULL(@Priority, 0),
                CASE WHEN @RowFilterID_Clear = 1 THEN NULL ELSE ISNULL(@RowFilterID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAPIKeyScopes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIKeyScope] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: API Key Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIKeyScope] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: spUpdateAPIKeyScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR APIKeyScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAPIKeyScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIKeyScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIKeyScope]
    @ID uniqueidentifier,
    @APIKeyID uniqueidentifier = NULL,
    @ScopeID uniqueidentifier = NULL,
    @ResourcePattern_Clear bit = 0,
    @ResourcePattern nvarchar(750) = NULL,
    @PatternType nvarchar(20) = NULL,
    @IsDeny bit = NULL,
    @Priority int = NULL,
    @RowFilterID_Clear bit = 0,
    @RowFilterID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIKeyScope]
    SET
        [APIKeyID] = ISNULL(@APIKeyID, [APIKeyID]),
        [ScopeID] = ISNULL(@ScopeID, [ScopeID]),
        [ResourcePattern] = CASE WHEN @ResourcePattern_Clear = 1 THEN NULL ELSE ISNULL(@ResourcePattern, [ResourcePattern]) END,
        [PatternType] = ISNULL(@PatternType, [PatternType]),
        [IsDeny] = ISNULL(@IsDeny, [IsDeny]),
        [Priority] = ISNULL(@Priority, [Priority]),
        [RowFilterID] = CASE WHEN @RowFilterID_Clear = 1 THEN NULL ELSE ISNULL(@RowFilterID, [RowFilterID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAPIKeyScopes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAPIKeyScopes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIKeyScope] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the APIKeyScope table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAPIKeyScope]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAPIKeyScope];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAPIKeyScope
ON [${flyway:defaultSchema}].[APIKeyScope]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIKeyScope]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[APIKeyScope] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: API Key Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIKeyScope] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: spDeleteAPIKeyScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIKeyScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAPIKeyScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIKeyScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIKeyScope]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[APIKeyScope]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIKeyScope] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: API Key Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIKeyScope] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 96841354-26BF-4919-91A3-B3170EA58F68 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='96841354-26BF-4919-91A3-B3170EA58F68', @RelatedEntityNameFieldMap='ParentChunk';

/* Root ID Function SQL for MJ: Content Item Chunks.ParentChunkID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: fnContentItemChunkParentChunkID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [ContentItemChunk].[ParentChunkID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [ParentChunkID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[ContentItemChunk]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentChunkID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[ContentItemChunk] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentChunkID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentChunkID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: vwContentItemChunks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Item Chunks
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentItemChunk
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentItemChunks]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentItemChunks];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentItemChunks]
AS
SELECT
    c.*,
    MJContentItem_ContentItemID.[Name] AS [ContentItem],
    MJContentItemChunk_ParentChunkID.[SegmentTitle] AS [ParentChunk],
    root_ParentChunkID.RootID AS [RootParentChunkID]
FROM
    [${flyway:defaultSchema}].[ContentItemChunk] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentItem] AS MJContentItem_ContentItemID
  ON
    [c].[ContentItemID] = MJContentItem_ContentItemID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ContentItemChunk] AS MJContentItemChunk_ParentChunkID
  ON
    [c].[ParentChunkID] = MJContentItemChunk_ParentChunkID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnContentItemChunkParentChunkID_GetRootID]([c].[ID], [c].[ParentChunkID]) AS root_ParentChunkID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItemChunks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: Permissions for vwContentItemChunks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwContentItemChunks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: spCreateContentItemChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentItemChunk
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentItemChunk]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentItemChunk];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentItemChunk]
    @ID uniqueidentifier = NULL,
    @ContentItemID uniqueidentifier,
    @Sequence int,
    @Text_Clear bit = 0,
    @Text nvarchar(MAX) = NULL,
    @VectorRecordID_Clear bit = 0,
    @VectorRecordID nvarchar(100) = NULL,
    @EmbeddingStatus nvarchar(20) = NULL,
    @TaggingStatus nvarchar(20) = NULL,
    @DeleteStatus_Clear bit = 0,
    @DeleteStatus nvarchar(20) = NULL,
    @LastEmbeddedAt_Clear bit = 0,
    @LastEmbeddedAt datetimeoffset = NULL,
    @LastTaggedAt_Clear bit = 0,
    @LastTaggedAt datetimeoffset = NULL,
    @LastDeletedAt_Clear bit = 0,
    @LastDeletedAt datetimeoffset = NULL,
    @Modality nvarchar(20) = NULL,
    @StartOffset_Clear bit = 0,
    @StartOffset int = NULL,
    @EndOffset_Clear bit = 0,
    @EndOffset int = NULL,
    @StartMs_Clear bit = 0,
    @StartMs int = NULL,
    @EndMs_Clear bit = 0,
    @EndMs int = NULL,
    @PageNumber_Clear bit = 0,
    @PageNumber int = NULL,
    @SegmentTitle_Clear bit = 0,
    @SegmentTitle nvarchar(500) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Transcript_Clear bit = 0,
    @Transcript nvarchar(MAX) = NULL,
    @SegmenterKey_Clear bit = 0,
    @SegmenterKey nvarchar(100) = NULL,
    @ParentChunkID_Clear bit = 0,
    @ParentChunkID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentItemChunk]
            (
                [ID],
                [ContentItemID],
                [Sequence],
                [Text],
                [VectorRecordID],
                [EmbeddingStatus],
                [TaggingStatus],
                [DeleteStatus],
                [LastEmbeddedAt],
                [LastTaggedAt],
                [LastDeletedAt],
                [Modality],
                [StartOffset],
                [EndOffset],
                [StartMs],
                [EndMs],
                [PageNumber],
                [SegmentTitle],
                [Description],
                [Transcript],
                [SegmenterKey],
                [ParentChunkID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ContentItemID,
                @Sequence,
                CASE WHEN @Text_Clear = 1 THEN NULL ELSE ISNULL(@Text, NULL) END,
                CASE WHEN @VectorRecordID_Clear = 1 THEN NULL ELSE ISNULL(@VectorRecordID, NULL) END,
                ISNULL(@EmbeddingStatus, 'Pending'),
                ISNULL(@TaggingStatus, 'Pending'),
                CASE WHEN @DeleteStatus_Clear = 1 THEN NULL ELSE ISNULL(@DeleteStatus, NULL) END,
                CASE WHEN @LastEmbeddedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEmbeddedAt, NULL) END,
                CASE WHEN @LastTaggedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastTaggedAt, NULL) END,
                CASE WHEN @LastDeletedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDeletedAt, NULL) END,
                ISNULL(@Modality, 'text'),
                CASE WHEN @StartOffset_Clear = 1 THEN NULL ELSE ISNULL(@StartOffset, NULL) END,
                CASE WHEN @EndOffset_Clear = 1 THEN NULL ELSE ISNULL(@EndOffset, NULL) END,
                CASE WHEN @StartMs_Clear = 1 THEN NULL ELSE ISNULL(@StartMs, NULL) END,
                CASE WHEN @EndMs_Clear = 1 THEN NULL ELSE ISNULL(@EndMs, NULL) END,
                CASE WHEN @PageNumber_Clear = 1 THEN NULL ELSE ISNULL(@PageNumber, NULL) END,
                CASE WHEN @SegmentTitle_Clear = 1 THEN NULL ELSE ISNULL(@SegmentTitle, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Transcript_Clear = 1 THEN NULL ELSE ISNULL(@Transcript, NULL) END,
                CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, NULL) END,
                CASE WHEN @ParentChunkID_Clear = 1 THEN NULL ELSE ISNULL(@ParentChunkID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentItemChunk]
            (
                [ContentItemID],
                [Sequence],
                [Text],
                [VectorRecordID],
                [EmbeddingStatus],
                [TaggingStatus],
                [DeleteStatus],
                [LastEmbeddedAt],
                [LastTaggedAt],
                [LastDeletedAt],
                [Modality],
                [StartOffset],
                [EndOffset],
                [StartMs],
                [EndMs],
                [PageNumber],
                [SegmentTitle],
                [Description],
                [Transcript],
                [SegmenterKey],
                [ParentChunkID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ContentItemID,
                @Sequence,
                CASE WHEN @Text_Clear = 1 THEN NULL ELSE ISNULL(@Text, NULL) END,
                CASE WHEN @VectorRecordID_Clear = 1 THEN NULL ELSE ISNULL(@VectorRecordID, NULL) END,
                ISNULL(@EmbeddingStatus, 'Pending'),
                ISNULL(@TaggingStatus, 'Pending'),
                CASE WHEN @DeleteStatus_Clear = 1 THEN NULL ELSE ISNULL(@DeleteStatus, NULL) END,
                CASE WHEN @LastEmbeddedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEmbeddedAt, NULL) END,
                CASE WHEN @LastTaggedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastTaggedAt, NULL) END,
                CASE WHEN @LastDeletedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDeletedAt, NULL) END,
                ISNULL(@Modality, 'text'),
                CASE WHEN @StartOffset_Clear = 1 THEN NULL ELSE ISNULL(@StartOffset, NULL) END,
                CASE WHEN @EndOffset_Clear = 1 THEN NULL ELSE ISNULL(@EndOffset, NULL) END,
                CASE WHEN @StartMs_Clear = 1 THEN NULL ELSE ISNULL(@StartMs, NULL) END,
                CASE WHEN @EndMs_Clear = 1 THEN NULL ELSE ISNULL(@EndMs, NULL) END,
                CASE WHEN @PageNumber_Clear = 1 THEN NULL ELSE ISNULL(@PageNumber, NULL) END,
                CASE WHEN @SegmentTitle_Clear = 1 THEN NULL ELSE ISNULL(@SegmentTitle, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Transcript_Clear = 1 THEN NULL ELSE ISNULL(@Transcript, NULL) END,
                CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, NULL) END,
                CASE WHEN @ParentChunkID_Clear = 1 THEN NULL ELSE ISNULL(@ParentChunkID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentItemChunks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Content Item Chunks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: spUpdateContentItemChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentItemChunk
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentItemChunk]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItemChunk];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentItemChunk]
    @ID uniqueidentifier,
    @ContentItemID uniqueidentifier = NULL,
    @Sequence int = NULL,
    @Text_Clear bit = 0,
    @Text nvarchar(MAX) = NULL,
    @VectorRecordID_Clear bit = 0,
    @VectorRecordID nvarchar(100) = NULL,
    @EmbeddingStatus nvarchar(20) = NULL,
    @TaggingStatus nvarchar(20) = NULL,
    @DeleteStatus_Clear bit = 0,
    @DeleteStatus nvarchar(20) = NULL,
    @LastEmbeddedAt_Clear bit = 0,
    @LastEmbeddedAt datetimeoffset = NULL,
    @LastTaggedAt_Clear bit = 0,
    @LastTaggedAt datetimeoffset = NULL,
    @LastDeletedAt_Clear bit = 0,
    @LastDeletedAt datetimeoffset = NULL,
    @Modality nvarchar(20) = NULL,
    @StartOffset_Clear bit = 0,
    @StartOffset int = NULL,
    @EndOffset_Clear bit = 0,
    @EndOffset int = NULL,
    @StartMs_Clear bit = 0,
    @StartMs int = NULL,
    @EndMs_Clear bit = 0,
    @EndMs int = NULL,
    @PageNumber_Clear bit = 0,
    @PageNumber int = NULL,
    @SegmentTitle_Clear bit = 0,
    @SegmentTitle nvarchar(500) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Transcript_Clear bit = 0,
    @Transcript nvarchar(MAX) = NULL,
    @SegmenterKey_Clear bit = 0,
    @SegmenterKey nvarchar(100) = NULL,
    @ParentChunkID_Clear bit = 0,
    @ParentChunkID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItemChunk]
    SET
        [ContentItemID] = ISNULL(@ContentItemID, [ContentItemID]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [Text] = CASE WHEN @Text_Clear = 1 THEN NULL ELSE ISNULL(@Text, [Text]) END,
        [VectorRecordID] = CASE WHEN @VectorRecordID_Clear = 1 THEN NULL ELSE ISNULL(@VectorRecordID, [VectorRecordID]) END,
        [EmbeddingStatus] = ISNULL(@EmbeddingStatus, [EmbeddingStatus]),
        [TaggingStatus] = ISNULL(@TaggingStatus, [TaggingStatus]),
        [DeleteStatus] = CASE WHEN @DeleteStatus_Clear = 1 THEN NULL ELSE ISNULL(@DeleteStatus, [DeleteStatus]) END,
        [LastEmbeddedAt] = CASE WHEN @LastEmbeddedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEmbeddedAt, [LastEmbeddedAt]) END,
        [LastTaggedAt] = CASE WHEN @LastTaggedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastTaggedAt, [LastTaggedAt]) END,
        [LastDeletedAt] = CASE WHEN @LastDeletedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDeletedAt, [LastDeletedAt]) END,
        [Modality] = ISNULL(@Modality, [Modality]),
        [StartOffset] = CASE WHEN @StartOffset_Clear = 1 THEN NULL ELSE ISNULL(@StartOffset, [StartOffset]) END,
        [EndOffset] = CASE WHEN @EndOffset_Clear = 1 THEN NULL ELSE ISNULL(@EndOffset, [EndOffset]) END,
        [StartMs] = CASE WHEN @StartMs_Clear = 1 THEN NULL ELSE ISNULL(@StartMs, [StartMs]) END,
        [EndMs] = CASE WHEN @EndMs_Clear = 1 THEN NULL ELSE ISNULL(@EndMs, [EndMs]) END,
        [PageNumber] = CASE WHEN @PageNumber_Clear = 1 THEN NULL ELSE ISNULL(@PageNumber, [PageNumber]) END,
        [SegmentTitle] = CASE WHEN @SegmentTitle_Clear = 1 THEN NULL ELSE ISNULL(@SegmentTitle, [SegmentTitle]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Transcript] = CASE WHEN @Transcript_Clear = 1 THEN NULL ELSE ISNULL(@Transcript, [Transcript]) END,
        [SegmenterKey] = CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, [SegmenterKey]) END,
        [ParentChunkID] = CASE WHEN @ParentChunkID_Clear = 1 THEN NULL ELSE ISNULL(@ParentChunkID, [ParentChunkID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentItemChunks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentItemChunks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItemChunk] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentItemChunk table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentItemChunk]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentItemChunk];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentItemChunk
ON [${flyway:defaultSchema}].[ContentItemChunk]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentItemChunk]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentItemChunk] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Content Item Chunks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Content Item Chunks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Chunks
-- Item: spDeleteContentItemChunk
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentItemChunk
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentItemChunk]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItemChunk];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentItemChunk]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentItemChunk]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Content Item Chunks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentItemChunk] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 2 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f4d15efb-00b7-4c78-ad2e-f7a3ecfa6a64' OR (EntityID = 'F1741CE5-EACA-492D-9869-9B55D33D9C29' AND Name = 'RowFilter')) BEGIN
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
            'f4d15efb-00b7-4c78-ad2e-f7a3ecfa6a64',
            'F1741CE5-EACA-492D-9869-9B55D33D9C29', -- Entity: MJ: API Key Scopes
            100025,
            'RowFilter',
            'Row Filter',
            NULL,
            'nvarchar',
            200,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7368ae64-62e7-4380-b0b4-5615064f2a52' OR (EntityID = 'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF' AND Name = 'RowFilter')) BEGIN
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
            '7368ae64-62e7-4380-b0b4-5615064f2a52',
            'F2A7C2ED-008C-41F8-9404-B303E2EDBBCF', -- Entity: MJ: API Application Scopes
            100025,
            'RowFilter',
            'Row Filter',
            NULL,
            'nvarchar',
            200,
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

