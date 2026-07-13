-- =============================================================================
-- Realtime Client-Context Co-Agent — schema foundation
--   Move 1: Application.AgentSettings  (JSONType = IAgentSettings)
--   Move 3: AIAgentChannel.IsHeadless (behavioral) + UIConfig (JSONType = IChannelUIConfig)
--
-- JSONType metadata for AgentSettings / UIConfig is seeded via metadata sync
-- (metadata/entities/.entity-field-jsontype-agent-settings.json and
--  .entity-field-jsontype-channel-uiconfig.json). Run mj sync after this migration
-- and before CodeGen so the typed *Object accessors generate.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Move 1 — Application.AgentSettings
-- ---------------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.Application ADD
    AgentSettings NVARCHAR(MAX) NULL;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'App-scoped agent configuration JSON (shape = IAgentSettings). Declares the default/lead agent, relevant agents available to conversational and realtime co-agents, app-scoped client tool references, and realtime persona/disclosure overrides that layer into the agent config cascade. Null = no app-level agent config.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Application',
    @level2type = N'COLUMN', @level2name = N'AgentSettings';

-- ---------------------------------------------------------------------------
-- Move 3 — AIAgentChannel.IsHeadless + UIConfig
-- ---------------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.AIAgentChannel ADD
    IsHeadless BIT            NOT NULL DEFAULT 0,
    UIConfig   NVARCHAR(MAX)  NULL;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, the channel has no visible surface and is never mounted as a tab — it is a live wire (e.g. the headless ClientContextChannel that streams app context + capability manifest to the co-agent). When 0 (default), the channel renders a surface.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentChannel',
    @level2type = N'COLUMN', @level2name = N'IsHeadless';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Channel-definition-level presentation/chrome config JSON (shape = IChannelUIConfig): tab DisplayName, GroupName, Color (prefer a design-token name), Icon, SortOrder. Distinct from ConfigSchema, which validates per-session AIAgentSessionChannel.Config state-of-record. Null = host defaults.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentChannel',
    @level2type = N'COLUMN', @level2name = N'UIConfig';
















-- Metadata update as other 5.44 script before this affected some of the above tables

/* SQL text to recompile all views */
EXEC [${flyway:defaultSchema}].spRecompileAllViews

/* SQL text to update existing entities from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to sync schema info from database schemas */
EXEC [${flyway:defaultSchema}].spUpdateSchemaInfoFromDatabase @ExcludedSchemaNames='sys,staging'

/* SQL text to delete unneeded entity fields */
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'

/* SQL text to update existing entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to set default column width where needed */
EXEC [${flyway:defaultSchema}].spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'

/* SQL text to recompile all stored procedures in dependency order */
EXEC [${flyway:defaultSchema}].spRecompileAllProceduresInDependencyOrder @ExcludedSchemaNames='sys,staging', @LogOutput=0, @ContinueOnError=1






































-- =============================================================================
-- CODEGEN OUTPUT BELOW THIS LINE
-- -----------------------------------------------------------------------------
-- Paste the MemberJunction CodeGen-generated SQL here. The generated block will include: EntityField metadata for
-- AgentSettings / IsHeadless / UIConfig, regenerated base views + spCreate/spUpdate
-- for Application and AIAgentChannel, and permission grants.
-- =============================================================================
/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1ce2a185-77e7-4d14-860c-2e51618ebe35' OR (EntityID = 'E8238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AgentSettings')) BEGIN
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
            '1ce2a185-77e7-4d14-860c-2e51618ebe35',
            'E8238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Applications
            100037,
            'AgentSettings',
            'Agent Settings',
            'App-scoped agent configuration JSON (shape = IAgentSettings). Declares the default/lead agent, relevant agents available to conversational and realtime co-agents, app-scoped client tool references, and realtime persona/disclosure overrides that layer into the agent config cascade. Null = no app-level agent config.',
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
            'Dropdown',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '64a66fbc-25bd-4112-9ba4-0e7d7eeb7865' OR (EntityID = '31A90934-E8E7-4EF9-8430-D63E8F224ABD' AND Name = 'IsHeadless')) BEGIN
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
            '64a66fbc-25bd-4112-9ba4-0e7d7eeb7865',
            '31A90934-E8E7-4EF9-8430-D63E8F224ABD', -- Entity: MJ: AI Agent Channels
            100021,
            'IsHeadless',
            'Is Headless',
            'When 1, the channel has no visible surface and is never mounted as a tab — it is a live wire (e.g. the headless ClientContextChannel that streams app context + capability manifest to the co-agent). When 0 (default), the channel renders a surface.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '64ceff3e-9e6c-43e8-8b3c-559fa0e7eea1' OR (EntityID = '31A90934-E8E7-4EF9-8430-D63E8F224ABD' AND Name = 'UIConfig')) BEGIN
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
            '64ceff3e-9e6c-43e8-8b3c-559fa0e7eea1',
            '31A90934-E8E7-4EF9-8430-D63E8F224ABD', -- Entity: MJ: AI Agent Channels
            100022,
            'UIConfig',
            'UI Config',
            'Channel-definition-level presentation/chrome config JSON (shape = IChannelUIConfig): tab DisplayName, GroupName, Color (prefer a design-token name), Icon, SortOrder. Distinct from ConfigSchema, which validates per-session AIAgentSessionChannel.Config state-of-record. Null = host defaults.',
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

/* Index for Foreign Keys for AIAgentChannel */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Channels
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for MJ: AI Agent Channels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Channels
-- Item: vwAIAgentChannels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Channels
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentChannel
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentChannels]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentChannels];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentChannels]
AS
SELECT
    a.*
FROM
    [${flyway:defaultSchema}].[AIAgentChannel] AS a
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentChannels] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agent Channels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Channels
-- Item: Permissions for vwAIAgentChannels
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentChannels] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Agent Channels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Channels
-- Item: spCreateAIAgentChannel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentChannel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentChannel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentChannel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentChannel]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(1000) = NULL,
    @ServerPluginClass nvarchar(250),
    @ClientPluginClass nvarchar(250),
    @TransportType nvarchar(20) = NULL,
    @ConfigSchema_Clear bit = 0,
    @ConfigSchema nvarchar(MAX) = NULL,
    @IsActive bit = NULL,
    @IsHeadless bit = NULL,
    @UIConfig_Clear bit = 0,
    @UIConfig nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentChannel]
            (
                [ID],
                [Name],
                [Description],
                [ServerPluginClass],
                [ClientPluginClass],
                [TransportType],
                [ConfigSchema],
                [IsActive],
                [IsHeadless],
                [UIConfig]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @ServerPluginClass,
                @ClientPluginClass,
                ISNULL(@TransportType, 'PubSub'),
                CASE WHEN @ConfigSchema_Clear = 1 THEN NULL ELSE ISNULL(@ConfigSchema, NULL) END,
                ISNULL(@IsActive, 1),
                ISNULL(@IsHeadless, 0),
                CASE WHEN @UIConfig_Clear = 1 THEN NULL ELSE ISNULL(@UIConfig, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentChannel]
            (
                [Name],
                [Description],
                [ServerPluginClass],
                [ClientPluginClass],
                [TransportType],
                [ConfigSchema],
                [IsActive],
                [IsHeadless],
                [UIConfig]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @ServerPluginClass,
                @ClientPluginClass,
                ISNULL(@TransportType, 'PubSub'),
                CASE WHEN @ConfigSchema_Clear = 1 THEN NULL ELSE ISNULL(@ConfigSchema, NULL) END,
                ISNULL(@IsActive, 1),
                ISNULL(@IsHeadless, 0),
                CASE WHEN @UIConfig_Clear = 1 THEN NULL ELSE ISNULL(@UIConfig, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentChannels] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentChannel] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agent Channels */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentChannel] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Agent Channels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Channels
-- Item: spUpdateAIAgentChannel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentChannel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentChannel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentChannel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentChannel]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(1000) = NULL,
    @ServerPluginClass nvarchar(250) = NULL,
    @ClientPluginClass nvarchar(250) = NULL,
    @TransportType nvarchar(20) = NULL,
    @ConfigSchema_Clear bit = 0,
    @ConfigSchema nvarchar(MAX) = NULL,
    @IsActive bit = NULL,
    @IsHeadless bit = NULL,
    @UIConfig_Clear bit = 0,
    @UIConfig nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentChannel]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [ServerPluginClass] = ISNULL(@ServerPluginClass, [ServerPluginClass]),
        [ClientPluginClass] = ISNULL(@ClientPluginClass, [ClientPluginClass]),
        [TransportType] = ISNULL(@TransportType, [TransportType]),
        [ConfigSchema] = CASE WHEN @ConfigSchema_Clear = 1 THEN NULL ELSE ISNULL(@ConfigSchema, [ConfigSchema]) END,
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [IsHeadless] = ISNULL(@IsHeadless, [IsHeadless]),
        [UIConfig] = CASE WHEN @UIConfig_Clear = 1 THEN NULL ELSE ISNULL(@UIConfig, [UIConfig]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentChannels] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentChannels]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentChannel] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentChannel table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentChannel]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentChannel];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentChannel
ON [${flyway:defaultSchema}].[AIAgentChannel]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentChannel]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentChannel] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Agent Channels */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentChannel] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agent Channels */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Channels
-- Item: spDeleteAIAgentChannel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentChannel
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentChannel]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentChannel];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentChannel]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentChannel]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentChannel] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Channels */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentChannel] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for Application */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Applications
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for MJ: Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Applications
-- Item: vwApplications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Applications
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Application
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwApplications]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwApplications];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwApplications]
AS
SELECT
    a.*
FROM
    [${flyway:defaultSchema}].[Application] AS a
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwApplications] TO [cdp_Developer], [cdp_Integration], [cdp_UI];

/* Base View Permissions SQL for MJ: Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Applications
-- Item: Permissions for vwApplications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwApplications] TO [cdp_Developer], [cdp_Integration], [cdp_UI];

/* spCreate SQL for MJ: Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Applications
-- Item: spCreateApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Application
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateApplication]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateApplication];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateApplication]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(500) = NULL,
    @DefaultForNewUser bit = NULL,
    @SchemaAutoAddNewEntities_Clear bit = 0,
    @SchemaAutoAddNewEntities nvarchar(MAX) = NULL,
    @Color_Clear bit = 0,
    @Color nvarchar(20) = NULL,
    @DefaultNavItems_Clear bit = 0,
    @DefaultNavItems nvarchar(MAX) = NULL,
    @ClassName_Clear bit = 0,
    @ClassName nvarchar(255) = NULL,
    @DefaultSequence int = NULL,
    @Status nvarchar(20) = NULL,
    @NavigationStyle nvarchar(20) = NULL,
    @TopNavLocation_Clear bit = 0,
    @TopNavLocation nvarchar(30) = NULL,
    @HideNavBarIconWhenActive bit = NULL,
    @Path nvarchar(100),
    @AutoUpdatePath bit = NULL,
    @AgentSettings_Clear bit = 0,
    @AgentSettings nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Application]
            (
                [ID],
                [Name],
                [Description],
                [Icon],
                [DefaultForNewUser],
                [SchemaAutoAddNewEntities],
                [Color],
                [DefaultNavItems],
                [ClassName],
                [DefaultSequence],
                [Status],
                [NavigationStyle],
                [TopNavLocation],
                [HideNavBarIconWhenActive],
                [Path],
                [AutoUpdatePath],
                [AgentSettings]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                ISNULL(@DefaultForNewUser, 1),
                CASE WHEN @SchemaAutoAddNewEntities_Clear = 1 THEN NULL ELSE ISNULL(@SchemaAutoAddNewEntities, NULL) END,
                CASE WHEN @Color_Clear = 1 THEN NULL ELSE ISNULL(@Color, NULL) END,
                CASE WHEN @DefaultNavItems_Clear = 1 THEN NULL ELSE ISNULL(@DefaultNavItems, NULL) END,
                CASE WHEN @ClassName_Clear = 1 THEN NULL ELSE ISNULL(@ClassName, NULL) END,
                ISNULL(@DefaultSequence, 100),
                ISNULL(@Status, 'Active'),
                ISNULL(@NavigationStyle, 'App Switcher'),
                CASE WHEN @TopNavLocation_Clear = 1 THEN NULL ELSE ISNULL(@TopNavLocation, NULL) END,
                ISNULL(@HideNavBarIconWhenActive, 0),
                @Path,
                ISNULL(@AutoUpdatePath, 1),
                CASE WHEN @AgentSettings_Clear = 1 THEN NULL ELSE ISNULL(@AgentSettings, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Application]
            (
                [Name],
                [Description],
                [Icon],
                [DefaultForNewUser],
                [SchemaAutoAddNewEntities],
                [Color],
                [DefaultNavItems],
                [ClassName],
                [DefaultSequence],
                [Status],
                [NavigationStyle],
                [TopNavLocation],
                [HideNavBarIconWhenActive],
                [Path],
                [AutoUpdatePath],
                [AgentSettings]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                ISNULL(@DefaultForNewUser, 1),
                CASE WHEN @SchemaAutoAddNewEntities_Clear = 1 THEN NULL ELSE ISNULL(@SchemaAutoAddNewEntities, NULL) END,
                CASE WHEN @Color_Clear = 1 THEN NULL ELSE ISNULL(@Color, NULL) END,
                CASE WHEN @DefaultNavItems_Clear = 1 THEN NULL ELSE ISNULL(@DefaultNavItems, NULL) END,
                CASE WHEN @ClassName_Clear = 1 THEN NULL ELSE ISNULL(@ClassName, NULL) END,
                ISNULL(@DefaultSequence, 100),
                ISNULL(@Status, 'Active'),
                ISNULL(@NavigationStyle, 'App Switcher'),
                CASE WHEN @TopNavLocation_Clear = 1 THEN NULL ELSE ISNULL(@TopNavLocation, NULL) END,
                ISNULL(@HideNavBarIconWhenActive, 0),
                @Path,
                ISNULL(@AutoUpdatePath, 1),
                CASE WHEN @AgentSettings_Clear = 1 THEN NULL ELSE ISNULL(@AgentSettings, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwApplications] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateApplication] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Applications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateApplication] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Applications
-- Item: spUpdateApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Application
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateApplication]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateApplication];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateApplication]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(500) = NULL,
    @DefaultForNewUser bit = NULL,
    @SchemaAutoAddNewEntities_Clear bit = 0,
    @SchemaAutoAddNewEntities nvarchar(MAX) = NULL,
    @Color_Clear bit = 0,
    @Color nvarchar(20) = NULL,
    @DefaultNavItems_Clear bit = 0,
    @DefaultNavItems nvarchar(MAX) = NULL,
    @ClassName_Clear bit = 0,
    @ClassName nvarchar(255) = NULL,
    @DefaultSequence int = NULL,
    @Status nvarchar(20) = NULL,
    @NavigationStyle nvarchar(20) = NULL,
    @TopNavLocation_Clear bit = 0,
    @TopNavLocation nvarchar(30) = NULL,
    @HideNavBarIconWhenActive bit = NULL,
    @Path nvarchar(100) = NULL,
    @AutoUpdatePath bit = NULL,
    @AgentSettings_Clear bit = 0,
    @AgentSettings nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Application]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Icon] = CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, [Icon]) END,
        [DefaultForNewUser] = ISNULL(@DefaultForNewUser, [DefaultForNewUser]),
        [SchemaAutoAddNewEntities] = CASE WHEN @SchemaAutoAddNewEntities_Clear = 1 THEN NULL ELSE ISNULL(@SchemaAutoAddNewEntities, [SchemaAutoAddNewEntities]) END,
        [Color] = CASE WHEN @Color_Clear = 1 THEN NULL ELSE ISNULL(@Color, [Color]) END,
        [DefaultNavItems] = CASE WHEN @DefaultNavItems_Clear = 1 THEN NULL ELSE ISNULL(@DefaultNavItems, [DefaultNavItems]) END,
        [ClassName] = CASE WHEN @ClassName_Clear = 1 THEN NULL ELSE ISNULL(@ClassName, [ClassName]) END,
        [DefaultSequence] = ISNULL(@DefaultSequence, [DefaultSequence]),
        [Status] = ISNULL(@Status, [Status]),
        [NavigationStyle] = ISNULL(@NavigationStyle, [NavigationStyle]),
        [TopNavLocation] = CASE WHEN @TopNavLocation_Clear = 1 THEN NULL ELSE ISNULL(@TopNavLocation, [TopNavLocation]) END,
        [HideNavBarIconWhenActive] = ISNULL(@HideNavBarIconWhenActive, [HideNavBarIconWhenActive]),
        [Path] = ISNULL(@Path, [Path]),
        [AutoUpdatePath] = ISNULL(@AutoUpdatePath, [AutoUpdatePath]),
        [AgentSettings] = CASE WHEN @AgentSettings_Clear = 1 THEN NULL ELSE ISNULL(@AgentSettings, [AgentSettings]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwApplications] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwApplications]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateApplication] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Application table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateApplication]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateApplication];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateApplication
ON [${flyway:defaultSchema}].[Application]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Application]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Application] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Applications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateApplication] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Applications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Applications
-- Item: spDeleteApplication
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Application
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteApplication]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteApplication];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteApplication]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade delete from ApplicationEntity using cursor to call spDeleteApplicationEntity
    DECLARE @MJApplicationEntities_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJApplicationEntities_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ApplicationEntity]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJApplicationEntities_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJApplicationEntities_ApplicationID_cursor INTO @MJApplicationEntities_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteApplicationEntity] @ID = @MJApplicationEntities_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJApplicationEntities_ApplicationID_cursor INTO @MJApplicationEntities_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJApplicationEntities_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJApplicationEntities_ApplicationID_cursor
    
    -- Cascade delete from ApplicationRole using cursor to call spDeleteApplicationRole
    DECLARE @MJApplicationRoles_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJApplicationRoles_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ApplicationRole]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJApplicationRoles_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJApplicationRoles_ApplicationID_cursor INTO @MJApplicationRoles_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteApplicationRole] @ID = @MJApplicationRoles_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJApplicationRoles_ApplicationID_cursor INTO @MJApplicationRoles_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJApplicationRoles_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJApplicationRoles_ApplicationID_cursor
    
    -- Cascade delete from ApplicationSetting using cursor to call spDeleteApplicationSetting
    DECLARE @MJApplicationSettings_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJApplicationSettings_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ApplicationSetting]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJApplicationSettings_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJApplicationSettings_ApplicationID_cursor INTO @MJApplicationSettings_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteApplicationSetting] @ID = @MJApplicationSettings_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJApplicationSettings_ApplicationID_cursor INTO @MJApplicationSettings_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJApplicationSettings_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJApplicationSettings_ApplicationID_cursor
    
    -- Cascade update on Conversation using cursor to call spUpdateConversation
    DECLARE @MJConversations_ApplicationIDID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_UserID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_ExternalID nvarchar(500)
    DECLARE @MJConversations_ApplicationID_Name nvarchar(255)
    DECLARE @MJConversations_ApplicationID_Description nvarchar(MAX)
    DECLARE @MJConversations_ApplicationID_Type nvarchar(50)
    DECLARE @MJConversations_ApplicationID_IsArchived bit
    DECLARE @MJConversations_ApplicationID_LinkedEntityID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_LinkedRecordID nvarchar(500)
    DECLARE @MJConversations_ApplicationID_DataContextID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_Status nvarchar(20)
    DECLARE @MJConversations_ApplicationID_EnvironmentID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_ProjectID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_IsPinned bit
    DECLARE @MJConversations_ApplicationID_TestRunID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_ApplicationScope nvarchar(20)
    DECLARE @MJConversations_ApplicationID_ApplicationID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_DefaultAgentID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_AdditionalData nvarchar(MAX)
    DECLARE @MJConversations_ApplicationID_RecordingFileID uniqueidentifier
    DECLARE @MJConversations_ApplicationID_EgressID nvarchar(255)
    DECLARE cascade_update_MJConversations_ApplicationID_cursor CURSOR FOR
        SELECT [ID], [UserID], [ExternalID], [Name], [Description], [Type], [IsArchived], [LinkedEntityID], [LinkedRecordID], [DataContextID], [Status], [EnvironmentID], [ProjectID], [IsPinned], [TestRunID], [ApplicationScope], [ApplicationID], [DefaultAgentID], [AdditionalData], [RecordingFileID], [EgressID]
        FROM [${flyway:defaultSchema}].[Conversation]
        WHERE [ApplicationID] = @ID

    OPEN cascade_update_MJConversations_ApplicationID_cursor
    FETCH NEXT FROM cascade_update_MJConversations_ApplicationID_cursor INTO @MJConversations_ApplicationIDID, @MJConversations_ApplicationID_UserID, @MJConversations_ApplicationID_ExternalID, @MJConversations_ApplicationID_Name, @MJConversations_ApplicationID_Description, @MJConversations_ApplicationID_Type, @MJConversations_ApplicationID_IsArchived, @MJConversations_ApplicationID_LinkedEntityID, @MJConversations_ApplicationID_LinkedRecordID, @MJConversations_ApplicationID_DataContextID, @MJConversations_ApplicationID_Status, @MJConversations_ApplicationID_EnvironmentID, @MJConversations_ApplicationID_ProjectID, @MJConversations_ApplicationID_IsPinned, @MJConversations_ApplicationID_TestRunID, @MJConversations_ApplicationID_ApplicationScope, @MJConversations_ApplicationID_ApplicationID, @MJConversations_ApplicationID_DefaultAgentID, @MJConversations_ApplicationID_AdditionalData, @MJConversations_ApplicationID_RecordingFileID, @MJConversations_ApplicationID_EgressID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversations_ApplicationID_ApplicationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversation] @ID = @MJConversations_ApplicationIDID, @UserID = @MJConversations_ApplicationID_UserID, @ExternalID = @MJConversations_ApplicationID_ExternalID, @Name = @MJConversations_ApplicationID_Name, @Description = @MJConversations_ApplicationID_Description, @Type = @MJConversations_ApplicationID_Type, @IsArchived = @MJConversations_ApplicationID_IsArchived, @LinkedEntityID = @MJConversations_ApplicationID_LinkedEntityID, @LinkedRecordID = @MJConversations_ApplicationID_LinkedRecordID, @DataContextID = @MJConversations_ApplicationID_DataContextID, @Status = @MJConversations_ApplicationID_Status, @EnvironmentID = @MJConversations_ApplicationID_EnvironmentID, @ProjectID = @MJConversations_ApplicationID_ProjectID, @IsPinned = @MJConversations_ApplicationID_IsPinned, @TestRunID = @MJConversations_ApplicationID_TestRunID, @ApplicationScope = @MJConversations_ApplicationID_ApplicationScope, @ApplicationID_Clear = 1, @ApplicationID = @MJConversations_ApplicationID_ApplicationID, @DefaultAgentID = @MJConversations_ApplicationID_DefaultAgentID, @AdditionalData = @MJConversations_ApplicationID_AdditionalData, @RecordingFileID = @MJConversations_ApplicationID_RecordingFileID, @EgressID = @MJConversations_ApplicationID_EgressID

        FETCH NEXT FROM cascade_update_MJConversations_ApplicationID_cursor INTO @MJConversations_ApplicationIDID, @MJConversations_ApplicationID_UserID, @MJConversations_ApplicationID_ExternalID, @MJConversations_ApplicationID_Name, @MJConversations_ApplicationID_Description, @MJConversations_ApplicationID_Type, @MJConversations_ApplicationID_IsArchived, @MJConversations_ApplicationID_LinkedEntityID, @MJConversations_ApplicationID_LinkedRecordID, @MJConversations_ApplicationID_DataContextID, @MJConversations_ApplicationID_Status, @MJConversations_ApplicationID_EnvironmentID, @MJConversations_ApplicationID_ProjectID, @MJConversations_ApplicationID_IsPinned, @MJConversations_ApplicationID_TestRunID, @MJConversations_ApplicationID_ApplicationScope, @MJConversations_ApplicationID_ApplicationID, @MJConversations_ApplicationID_DefaultAgentID, @MJConversations_ApplicationID_AdditionalData, @MJConversations_ApplicationID_RecordingFileID, @MJConversations_ApplicationID_EgressID
    END

    CLOSE cascade_update_MJConversations_ApplicationID_cursor
    DEALLOCATE cascade_update_MJConversations_ApplicationID_cursor
    
    -- Cascade delete from DashboardUserPreference using cursor to call spDeleteDashboardUserPreference
    DECLARE @MJDashboardUserPreferences_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[DashboardUserPreference]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor INTO @MJDashboardUserPreferences_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteDashboardUserPreference] @ID = @MJDashboardUserPreferences_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor INTO @MJDashboardUserPreferences_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJDashboardUserPreferences_ApplicationID_cursor
    
    -- Cascade update on Dashboard using cursor to call spUpdateDashboard
    DECLARE @MJDashboards_ApplicationIDID uniqueidentifier
    DECLARE @MJDashboards_ApplicationID_Name nvarchar(255)
    DECLARE @MJDashboards_ApplicationID_Description nvarchar(MAX)
    DECLARE @MJDashboards_ApplicationID_UserID uniqueidentifier
    DECLARE @MJDashboards_ApplicationID_CategoryID uniqueidentifier
    DECLARE @MJDashboards_ApplicationID_UIConfigDetails nvarchar(MAX)
    DECLARE @MJDashboards_ApplicationID_Type nvarchar(20)
    DECLARE @MJDashboards_ApplicationID_Thumbnail nvarchar(MAX)
    DECLARE @MJDashboards_ApplicationID_Scope nvarchar(20)
    DECLARE @MJDashboards_ApplicationID_ApplicationID uniqueidentifier
    DECLARE @MJDashboards_ApplicationID_DriverClass nvarchar(255)
    DECLARE @MJDashboards_ApplicationID_Code nvarchar(255)
    DECLARE @MJDashboards_ApplicationID_EnvironmentID uniqueidentifier
    DECLARE cascade_update_MJDashboards_ApplicationID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [UserID], [CategoryID], [UIConfigDetails], [Type], [Thumbnail], [Scope], [ApplicationID], [DriverClass], [Code], [EnvironmentID]
        FROM [${flyway:defaultSchema}].[Dashboard]
        WHERE [ApplicationID] = @ID

    OPEN cascade_update_MJDashboards_ApplicationID_cursor
    FETCH NEXT FROM cascade_update_MJDashboards_ApplicationID_cursor INTO @MJDashboards_ApplicationIDID, @MJDashboards_ApplicationID_Name, @MJDashboards_ApplicationID_Description, @MJDashboards_ApplicationID_UserID, @MJDashboards_ApplicationID_CategoryID, @MJDashboards_ApplicationID_UIConfigDetails, @MJDashboards_ApplicationID_Type, @MJDashboards_ApplicationID_Thumbnail, @MJDashboards_ApplicationID_Scope, @MJDashboards_ApplicationID_ApplicationID, @MJDashboards_ApplicationID_DriverClass, @MJDashboards_ApplicationID_Code, @MJDashboards_ApplicationID_EnvironmentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJDashboards_ApplicationID_ApplicationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateDashboard] @ID = @MJDashboards_ApplicationIDID, @Name = @MJDashboards_ApplicationID_Name, @Description = @MJDashboards_ApplicationID_Description, @UserID = @MJDashboards_ApplicationID_UserID, @CategoryID = @MJDashboards_ApplicationID_CategoryID, @UIConfigDetails = @MJDashboards_ApplicationID_UIConfigDetails, @Type = @MJDashboards_ApplicationID_Type, @Thumbnail = @MJDashboards_ApplicationID_Thumbnail, @Scope = @MJDashboards_ApplicationID_Scope, @ApplicationID_Clear = 1, @ApplicationID = @MJDashboards_ApplicationID_ApplicationID, @DriverClass = @MJDashboards_ApplicationID_DriverClass, @Code = @MJDashboards_ApplicationID_Code, @EnvironmentID = @MJDashboards_ApplicationID_EnvironmentID

        FETCH NEXT FROM cascade_update_MJDashboards_ApplicationID_cursor INTO @MJDashboards_ApplicationIDID, @MJDashboards_ApplicationID_Name, @MJDashboards_ApplicationID_Description, @MJDashboards_ApplicationID_UserID, @MJDashboards_ApplicationID_CategoryID, @MJDashboards_ApplicationID_UIConfigDetails, @MJDashboards_ApplicationID_Type, @MJDashboards_ApplicationID_Thumbnail, @MJDashboards_ApplicationID_Scope, @MJDashboards_ApplicationID_ApplicationID, @MJDashboards_ApplicationID_DriverClass, @MJDashboards_ApplicationID_Code, @MJDashboards_ApplicationID_EnvironmentID
    END

    CLOSE cascade_update_MJDashboards_ApplicationID_cursor
    DEALLOCATE cascade_update_MJDashboards_ApplicationID_cursor
    
    -- Cascade delete from MagicLinkInviteApplication using cursor to call spDeleteMagicLinkInviteApplication
    DECLARE @MJMagicLinkInviteApplications_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[MagicLinkInviteApplication]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor INTO @MJMagicLinkInviteApplications_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteMagicLinkInviteApplication] @ID = @MJMagicLinkInviteApplications_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor INTO @MJMagicLinkInviteApplications_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJMagicLinkInviteApplications_ApplicationID_cursor
    
    -- Cascade delete from MagicLinkInvite using cursor to call spDeleteMagicLinkInvite
    DECLARE @MJMagicLinkInvites_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJMagicLinkInvites_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[MagicLinkInvite]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJMagicLinkInvites_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJMagicLinkInvites_ApplicationID_cursor INTO @MJMagicLinkInvites_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteMagicLinkInvite] @ID = @MJMagicLinkInvites_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJMagicLinkInvites_ApplicationID_cursor INTO @MJMagicLinkInvites_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJMagicLinkInvites_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJMagicLinkInvites_ApplicationID_cursor
    
    -- Cascade delete from UserApplication using cursor to call spDeleteUserApplication
    DECLARE @MJUserApplications_ApplicationIDID uniqueidentifier
    DECLARE cascade_delete_MJUserApplications_ApplicationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[UserApplication]
        WHERE [ApplicationID] = @ID
    
    OPEN cascade_delete_MJUserApplications_ApplicationID_cursor
    FETCH NEXT FROM cascade_delete_MJUserApplications_ApplicationID_cursor INTO @MJUserApplications_ApplicationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteUserApplication] @ID = @MJUserApplications_ApplicationIDID
        
        FETCH NEXT FROM cascade_delete_MJUserApplications_ApplicationID_cursor INTO @MJUserApplications_ApplicationIDID
    END
    
    CLOSE cascade_delete_MJUserApplications_ApplicationID_cursor
    DEALLOCATE cascade_delete_MJUserApplications_ApplicationID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[Application]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplication] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Applications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplication] TO [cdp_Developer], [cdp_Integration];

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '799CC5FB-663D-413B-AD76-8DE5F8C373EE'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '474F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '799CC5FB-663D-413B-AD76-8DE5F8C373EE'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '464F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = '799CC5FB-663D-413B-AD76-8DE5F8C373EE'
               AND AutoUpdateUserSearchPredicate = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 1
            WHERE ID = 'E8238F34-2837-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 19 fields */

-- UPDATE Entity Field Category Info MJ: Applications.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '454F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Applications.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '464F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Applications.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '474F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Applications.Icon 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B25717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Applications.DefaultForNewUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B35717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Applications.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '054D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Applications.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '064D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Applications.SchemaAutoAddNewEntities 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Auto Add Entities From Schema',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FCFF872D-0B33-4C53-BB9F-15910F91AD83' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Applications.Color 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9A6D6C48-40DC-45ED-A524-D82B7B2F9EC6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Applications.DefaultNavItems 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '6A46A06E-7B1C-466D-9447-1924D9EF2FA0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Applications.ClassName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9A21A856-C791-4363-9B29-2DE6BC6AFB29' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Applications.DefaultSequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B80AC534-6341-4F99-AA26-B119BAD3DE45' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Applications.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A584A155-01F7-4D79-BF72-47513BFFD6E7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Applications.NavigationStyle 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '09A7FABC-07CF-48E3-9985-DC92F3AF6F81' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Applications.TopNavLocation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '866E22FF-8E97-4436-9186-276076961988' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Applications.HideNavBarIconWhenActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1E997F79-B97C-47D4-8A84-1936227F577A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Applications.Path 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '799CC5FB-663D-413B-AD76-8DE5F8C373EE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Applications.AutoUpdatePath 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BD572C5C-1276-4495-8061-2C52BF71B437' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Applications.AgentSettings 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Agent Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '1CE2A185-77E7-4D14-860C-2E51618EBE35' AND AutoUpdateCategory = 1;

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET [Value] = '{"Agent Configuration":{"icon":"fa fa-robot","description":"Settings for conversational agents and co-agent integration"}}', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [EntityID] = 'E8238F34-2837-EF11-86D4-6045BDEE16E6' AND [Name] = 'FieldCategoryInfo';

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET [Value] = '{"Agent Configuration":"fa fa-robot"}', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [EntityID] = 'E8238F34-2837-EF11-86D4-6045BDEE16E6' AND [Name] = 'FieldCategoryIcons';

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '64A66FBC-25BD-4112-9BA4-0E7D7EEB7865'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info MJ: AI Agent Channels.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DB44A6C4-BAF0-4359-B418-E5FB718EE90E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Channels.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C90CE2DA-E8D8-4D71-973C-FE59F5D418C4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Channels.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0AD5C52D-1798-4641-AD57-FFBA62E2C76B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Channels.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Active',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C8CBC42F-51B8-45D1-8881-E2919A9C7F57' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Channels.IsHeadless 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Channel Definition',
   GeneratedFormSection = 'Category',
   DisplayName = 'Headless',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '64A66FBC-25BD-4112-9BA4-0E7D7EEB7865' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Channels.ServerPluginClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F73F7460-FF98-4456-BA1B-DC4DE6AA4084' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Channels.ClientPluginClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '082ADEA5-D3DC-45FE-94BF-3EF4F00213B7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Channels.TransportType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1156A613-E382-407F-B854-78726BEA9935' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Channels.ConfigSchema 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'AA605081-B521-4529-990F-3A6F0CA7BB6C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Channels.UIConfig 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Technical Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'UI Configuration',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '64CEFF3E-9E6C-43E8-8B3C-559FA0E7EEA1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Channels.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7F7E3F6B-81AB-438C-94F8-7DE7DD4D1FBB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: AI Agent Channels.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7EA84205-06E2-4257-BD39-3DE60EB0969F' AND AutoUpdateCategory = 1;

