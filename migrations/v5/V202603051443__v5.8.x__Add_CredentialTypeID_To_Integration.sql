-- Migration: Add CredentialTypeID to Integration and CredentialID to CompanyIntegration
-- This links integrations to the credential system so the UI can:
--   1. Pre-select the correct credential type when creating credentials for an integration
--   2. Filter existing credentials by type when attaching to a company integration
--   3. Store a direct reference from CompanyIntegration to the new Credential entity

-- Add CredentialTypeID (nullable FK) to Integration
ALTER TABLE ${flyway:defaultSchema}.Integration
ADD CredentialTypeID UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.Integration
ADD CONSTRAINT FK_Integration_CredentialType
    FOREIGN KEY (CredentialTypeID)
    REFERENCES ${flyway:defaultSchema}.CredentialType(ID);
GO

-- Add CredentialID (nullable FK) to CompanyIntegration
ALTER TABLE ${flyway:defaultSchema}.CompanyIntegration
ADD CredentialID UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.CompanyIntegration
ADD CONSTRAINT FK_CompanyIntegration_Credential
    FOREIGN KEY (CredentialID)
    REFERENCES ${flyway:defaultSchema}.Credential(ID);
GO

-- Extended properties for the new columns
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional link to the credential type required by this integration. Used by the UI to pre-select the credential type when creating new credentials and to filter existing credentials.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'Integration',
    @level2type = N'COLUMN', @level2name = 'CredentialTypeID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional reference to a Credential record that stores encrypted authentication values for this company integration. Replaces the legacy inline auth fields (AccessToken, RefreshToken, APIKey, etc.).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'CompanyIntegration',
    @level2type = N'COLUMN', @level2name = 'CredentialID';
GO























































-- CODE GEN RUN
/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9a4502a9-0e22-4038-8341-01b9a9211e44' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CredentialTypeID')) BEGIN
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
            '9a4502a9-0e22-4038-8341-01b9a9211e44',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100021,
            'CredentialTypeID',
            'Credential Type ID',
            'Optional link to the credential type required by this integration. Used by the UI to pre-select the credential type when creating new credentials and to filter existing credentials.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            'D512FF2E-A140-45A2-979A-20657AB77137',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '131b9cc4-3755-46f6-925a-7e3a13bcdfd6' OR (EntityID = 'DE238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CredentialID')) BEGIN
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
            '131b9cc4-3755-46f6-925a-7e3a13bcdfd6',
            'DE238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Company Integrations
            100045,
            'CredentialID',
            'Credential ID',
            'Optional reference to a Credential record that stores encrypted authentication values for this company integration. Replaces the legacy inline auth fields (AccessToken, RefreshToken, APIKey, etc.).',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0',
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
      END


/* Create Entity Relationship: MJ: Credential Types -> MJ: Integrations (One To Many via CredentialTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '86c97642-5ce8-475a-b3bf-ce6e1857beb4'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('86c97642-5ce8-475a-b3bf-ce6e1857beb4', 'D512FF2E-A140-45A2-979A-20657AB77137', 'DD238F34-2837-EF11-86D4-6045BDEE16E6', 'CredentialTypeID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Credentials -> MJ: Company Integrations (One To Many via CredentialID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '385afc53-989f-4fc6-924d-cec4c8a9aa21'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('385afc53-989f-4fc6-924d-cec4c8a9aa21', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', 'DE238F34-2837-EF11-86D4-6045BDEE16E6', 'CredentialID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;
                    

/* Index for Foreign Keys for CompanyIntegration */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyID in table CompanyIntegration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegration_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegration_CompanyID ON [${flyway:defaultSchema}].[CompanyIntegration] ([CompanyID]);

-- Index for foreign key IntegrationID in table CompanyIntegration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegration_IntegrationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegration_IntegrationID ON [${flyway:defaultSchema}].[CompanyIntegration] ([IntegrationID]);

-- Index for foreign key SourceTypeID in table CompanyIntegration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegration_SourceTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegration_SourceTypeID ON [${flyway:defaultSchema}].[CompanyIntegration] ([SourceTypeID]);

-- Index for foreign key CredentialID in table CompanyIntegration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegration_CredentialID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegration_CredentialID ON [${flyway:defaultSchema}].[CompanyIntegration] ([CredentialID]);

/* Base View Permissions SQL for MJ: Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: Permissions for vwCompanyIntegrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrations] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for MJ: Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: spCreateCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCompanyIntegration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegration]
    @ID uniqueidentifier = NULL,
    @CompanyID uniqueidentifier,
    @IntegrationID uniqueidentifier,
    @IsActive bit,
    @AccessToken nvarchar(255),
    @RefreshToken nvarchar(255),
    @TokenExpirationDate datetimeoffset,
    @APIKey nvarchar(255),
    @ExternalSystemID nvarchar(100),
    @IsExternalSystemReadOnly bit = NULL,
    @ClientID nvarchar(255),
    @ClientSecret nvarchar(255),
    @CustomAttribute1 nvarchar(255),
    @Name nvarchar(255),
    @SourceTypeID uniqueidentifier,
    @Configuration nvarchar(MAX),
    @CredentialID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegration]
            (
                [ID],
                [CompanyID],
                [IntegrationID],
                [IsActive],
                [AccessToken],
                [RefreshToken],
                [TokenExpirationDate],
                [APIKey],
                [ExternalSystemID],
                [IsExternalSystemReadOnly],
                [ClientID],
                [ClientSecret],
                [CustomAttribute1],
                [Name],
                [SourceTypeID],
                [Configuration],
                [CredentialID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CompanyID,
                @IntegrationID,
                @IsActive,
                @AccessToken,
                @RefreshToken,
                @TokenExpirationDate,
                @APIKey,
                @ExternalSystemID,
                ISNULL(@IsExternalSystemReadOnly, 0),
                @ClientID,
                @ClientSecret,
                @CustomAttribute1,
                @Name,
                @SourceTypeID,
                @Configuration,
                @CredentialID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegration]
            (
                [CompanyID],
                [IntegrationID],
                [IsActive],
                [AccessToken],
                [RefreshToken],
                [TokenExpirationDate],
                [APIKey],
                [ExternalSystemID],
                [IsExternalSystemReadOnly],
                [ClientID],
                [ClientSecret],
                [CustomAttribute1],
                [Name],
                [SourceTypeID],
                [Configuration],
                [CredentialID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CompanyID,
                @IntegrationID,
                @IsActive,
                @AccessToken,
                @RefreshToken,
                @TokenExpirationDate,
                @APIKey,
                @ExternalSystemID,
                ISNULL(@IsExternalSystemReadOnly, 0),
                @ClientID,
                @ClientSecret,
                @CustomAttribute1,
                @Name,
                @SourceTypeID,
                @Configuration,
                @CredentialID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCompanyIntegrations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegration] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for MJ: Company Integrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegration] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for MJ: Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: spUpdateCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCompanyIntegration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegration]
    @ID uniqueidentifier,
    @CompanyID uniqueidentifier,
    @IntegrationID uniqueidentifier,
    @IsActive bit,
    @AccessToken nvarchar(255),
    @RefreshToken nvarchar(255),
    @TokenExpirationDate datetimeoffset,
    @APIKey nvarchar(255),
    @ExternalSystemID nvarchar(100),
    @IsExternalSystemReadOnly bit,
    @ClientID nvarchar(255),
    @ClientSecret nvarchar(255),
    @CustomAttribute1 nvarchar(255),
    @Name nvarchar(255),
    @SourceTypeID uniqueidentifier,
    @Configuration nvarchar(MAX),
    @CredentialID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegration]
    SET
        [CompanyID] = @CompanyID,
        [IntegrationID] = @IntegrationID,
        [IsActive] = @IsActive,
        [AccessToken] = @AccessToken,
        [RefreshToken] = @RefreshToken,
        [TokenExpirationDate] = @TokenExpirationDate,
        [APIKey] = @APIKey,
        [ExternalSystemID] = @ExternalSystemID,
        [IsExternalSystemReadOnly] = @IsExternalSystemReadOnly,
        [ClientID] = @ClientID,
        [ClientSecret] = @ClientSecret,
        [CustomAttribute1] = @CustomAttribute1,
        [Name] = @Name,
        [SourceTypeID] = @SourceTypeID,
        [Configuration] = @Configuration,
        [CredentialID] = @CredentialID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCompanyIntegrations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCompanyIntegrations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegration] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegration table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCompanyIntegration]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCompanyIntegration];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCompanyIntegration
ON [${flyway:defaultSchema}].[CompanyIntegration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegration]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CompanyIntegration] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Company Integrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegration] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for MJ: Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: spDeleteCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCompanyIntegration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegration]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CompanyIntegration]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegration] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for MJ: Company Integrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegration] TO [cdp_Integration], [cdp_Developer]



/* Index for Foreign Keys for Integration */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integrations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CredentialTypeID in table Integration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Integration_CredentialTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Integration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Integration_CredentialTypeID ON [${flyway:defaultSchema}].[Integration] ([CredentialTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID 9A4502A9-0E22-4038-8341-01B9A9211E44 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='9A4502A9-0E22-4038-8341-01B9A9211E44', @RelatedEntityNameFieldMap='CredentialType'

/* Base View SQL for MJ: Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integrations
-- Item: vwIntegrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Integrations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Integration
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwIntegrations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwIntegrations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwIntegrations]
AS
SELECT
    i.*,
    MJCredentialType_CredentialTypeID.[Name] AS [CredentialType]
FROM
    [${flyway:defaultSchema}].[Integration] AS i
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[CredentialType] AS MJCredentialType_CredentialTypeID
  ON
    [i].[CredentialTypeID] = MJCredentialType_CredentialTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwIntegrations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integrations
-- Item: Permissions for vwIntegrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwIntegrations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integrations
-- Item: spCreateIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Integration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateIntegration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateIntegration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateIntegration]
    @Name nvarchar(100),
    @Description nvarchar(255),
    @NavigationBaseURL nvarchar(500),
    @ClassName nvarchar(100),
    @ImportPath nvarchar(100),
    @BatchMaxRequestCount int = NULL,
    @BatchRequestWaitTime int = NULL,
    @ID uniqueidentifier = NULL,
    @CredentialTypeID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Integration]
            (
                [ID],
                [Name],
                [Description],
                [NavigationBaseURL],
                [ClassName],
                [ImportPath],
                [BatchMaxRequestCount],
                [BatchRequestWaitTime],
                [CredentialTypeID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @NavigationBaseURL,
                @ClassName,
                @ImportPath,
                ISNULL(@BatchMaxRequestCount, -1),
                ISNULL(@BatchRequestWaitTime, -1),
                @CredentialTypeID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Integration]
            (
                [Name],
                [Description],
                [NavigationBaseURL],
                [ClassName],
                [ImportPath],
                [BatchMaxRequestCount],
                [BatchRequestWaitTime],
                [CredentialTypeID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @NavigationBaseURL,
                @ClassName,
                @ImportPath,
                ISNULL(@BatchMaxRequestCount, -1),
                ISNULL(@BatchRequestWaitTime, -1),
                @CredentialTypeID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwIntegrations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIntegration] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Integrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateIntegration] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integrations
-- Item: spUpdateIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Integration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateIntegration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateIntegration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateIntegration]
    @Name nvarchar(100),
    @Description nvarchar(255),
    @NavigationBaseURL nvarchar(500),
    @ClassName nvarchar(100),
    @ImportPath nvarchar(100),
    @BatchMaxRequestCount int,
    @BatchRequestWaitTime int,
    @ID uniqueidentifier,
    @CredentialTypeID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Integration]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [NavigationBaseURL] = @NavigationBaseURL,
        [ClassName] = @ClassName,
        [ImportPath] = @ImportPath,
        [BatchMaxRequestCount] = @BatchMaxRequestCount,
        [BatchRequestWaitTime] = @BatchRequestWaitTime,
        [CredentialTypeID] = @CredentialTypeID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwIntegrations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwIntegrations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIntegration] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Integration table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateIntegration]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateIntegration];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateIntegration
ON [${flyway:defaultSchema}].[Integration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Integration]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Integration] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Integrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateIntegration] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integrations
-- Item: spDeleteIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Integration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteIntegration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteIntegration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteIntegration]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Integration]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegration] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for MJ: Integrations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteIntegration] TO [cdp_Developer], [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '40ad55dc-4d32-4225-bbb9-fdd3ccd62eba' OR (EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CredentialType')) BEGIN
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
            '40ad55dc-4d32-4225-bbb9-fdd3ccd62eba',
            'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Integrations
            100023,
            'CredentialType',
            'Credential Type',
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
      END

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '40AD55DC-4D32-4225-BBB9-FDD3CCD62EBA'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '0F5817F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '345817F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '40AD55DC-4D32-4225-BBB9-FDD3CCD62EBA'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info MJ: Integrations.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0E5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integrations.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Description',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0F5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integrations.NavigationBaseURL 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'URL',
   CodeType = NULL
WHERE 
   ID = '105817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integrations.ClassName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'TypeScript'
WHERE 
   ID = '345817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integrations.ImportPath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '355817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integrations.BatchMaxRequestCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B04217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integrations.BatchRequestWaitTime 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B14217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integrations.CredentialTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Authentication & Security',
   GeneratedFormSection = 'Category',
   DisplayName = 'Credential Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9A4502A9-0E22-4038-8341-01B9A9211E44' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integrations.CredentialType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Authentication & Security',
   GeneratedFormSection = 'Category',
   DisplayName = 'Credential Type Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '40AD55DC-4D32-4225-BBB9-FDD3CCD62EBA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integrations.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0D5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integrations.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '495817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Integrations.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4A5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('d13fc7c4-57a1-4bc9-b828-7412b39a4c03', 'DD238F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Authentication & Security":{"icon":"fa fa-shield-alt","description":"Configuration regarding credential requirements and secure access for the integration."}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Authentication & Security":"fa fa-shield-alt"}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 26 fields */

-- UPDATE Entity Field Category Info MJ: Company Integrations.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '115817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.CompanyID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '125817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.IntegrationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '135817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '145817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '64799DD4-A537-4B9C-897F-EC2AFE9A28D0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.SourceTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F647023E-D909-4ECB-B59D-EE477C274827' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.Company 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '365817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.Integration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '375817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.IsExternalSystemReadOnly 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B24217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.AccessToken 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '155817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.RefreshToken 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '165817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.TokenExpirationDate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '175817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.APIKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '185817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.ClientID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B34217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.ClientSecret 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B44217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.CredentialID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Credentials & Tokens',
   GeneratedFormSection = 'Category',
   DisplayName = 'Credential',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '131B9CC4-3755-46F6-925A-7E3A13BCDFD6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.ExternalSystemID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '425817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.CustomAttribute1 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C44217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '987EAF20-227F-4043-BD87-06C9E01598F4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.DriverClassName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '385817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.DriverImportPath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '395817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.LastRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Last Run',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3A5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.LastRunStartedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3B5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.LastRunEndedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3C5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0D5917F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Company Integrations.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E85817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

