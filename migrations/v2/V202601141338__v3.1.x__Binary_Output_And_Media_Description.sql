-- Media Output Support and Media Description Fields
-- This migration adds:
-- 1. Description column to AIAgentRunMedia, AIPromptRunMedia, and ConversationDetailAttachment
-- 2. 'MediaOutput' value to ActionParam.ValueType CHECK constraint for media content handling
-- 3. MediaModality column to ActionParam for specifying what type of media an action outputs

-- ============================================
-- ADD DESCRIPTION COLUMNS
-- ============================================

-- Add Description to AIAgentRunMedia (already has Label)
ALTER TABLE ${flyway:defaultSchema}.AIAgentRunMedia
ADD Description NVARCHAR(MAX) NULL;
GO

-- Add Description to AIPromptRunMedia
ALTER TABLE ${flyway:defaultSchema}.AIPromptRunMedia
ADD Description NVARCHAR(MAX) NULL;
GO

-- Add Description to ConversationDetailAttachment
ALTER TABLE ${flyway:defaultSchema}.ConversationDetailAttachment
ADD Description NVARCHAR(MAX) NULL;
GO

-- ============================================
-- ADD MEDIAMODALITY COLUMN
-- ============================================

-- Add MediaModality to ActionParam with CHECK constraint
-- Values: Image, Audio, Video
ALTER TABLE ${flyway:defaultSchema}.ActionParam
ADD MediaModality NVARCHAR(20) NULL;
GO

-- Add CHECK constraint for MediaModality
ALTER TABLE ${flyway:defaultSchema}.ActionParam ADD CONSTRAINT [CK_MediaModality]
CHECK ([MediaModality] IN ('Image', 'Audio', 'Video'));
GO

-- ============================================
-- UPDATE VALUETYPE CHECK CONSTRAINT
-- ============================================

-- Drop original auto-generated CHECK constraint for ValueType (from V202407171600__v2.0.x.sql)
ALTER TABLE ${flyway:defaultSchema}.ActionParam DROP CONSTRAINT [CK__ActionPar__Value__7058A9C7];
GO

-- Drop named CHECK constraint if it exists (added by CodeGen)
ALTER TABLE ${flyway:defaultSchema}.ActionParam DROP CONSTRAINT [CK_ValueType];
GO

-- Add new CHECK constraint with 'MediaOutput' included
ALTER TABLE ${flyway:defaultSchema}.ActionParam ADD CONSTRAINT [CK_ValueType]
CHECK ([ValueType] IN ('Scalar', 'Simple Object', 'BaseEntity Sub-Class', 'Other', 'MediaOutput'));
GO

-- ============================================
-- EXTENDED PROPERTIES
-- ============================================

-- Description for AIAgentRunMedia.Description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Agent notes describing what this media represents. Used for internal tracking and can be displayed in UI.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentRunMedia',
    @level2type = N'COLUMN', @level2name = 'Description';
GO

-- Description for AIPromptRunMedia.Description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Description of the media generated during prompt execution. Provides context for audit trail.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIPromptRunMedia',
    @level2type = N'COLUMN', @level2name = 'Description';
GO

-- Description for ConversationDetailAttachment.Description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Description of the attachment providing context about its content and purpose.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ConversationDetailAttachment',
    @level2type = N'COLUMN', @level2name = 'Description';
GO

-- Description for ActionParam.MediaModality
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Specifies the type of media this parameter outputs when ValueType is MediaOutput. Used for action discovery and validation.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'ActionParam',
    @level2type = N'COLUMN', @level2name = 'MediaModality';
GO

PRINT 'Media output support and description fields added successfully';
GO

-- ============================================
-- CODEGEN
-- ============================================
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'bb8fc042-d5b2-4288-b44c-e6423a3494dd'  OR 
               (EntityID = 'C21CD727-D771-450D-BAFA-104922931BFC' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bb8fc042-d5b2-4288-b44c-e6423a3494dd',
            'C21CD727-D771-450D-BAFA-104922931BFC', -- Entity: MJ: AI Agent Run Medias
            100041,
            'Description',
            'Description',
            'Agent notes describing what this media represents. Used for internal tracking and can be displayed in UI.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e4e11217-97a8-43b2-b9de-45845e4930b0'  OR 
               (EntityID = '228FF492-57AD-4097-922F-50441FD19BA0' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e4e11217-97a8-43b2-b9de-45845e4930b0',
            '228FF492-57AD-4097-922F-50441FD19BA0', -- Entity: MJ: AI Prompt Run Medias
            100037,
            'Description',
            'Description',
            'Description of the media generated during prompt execution. Provides context for audit trail.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8acbea37-de84-4ad4-9dab-b5d8f1cf9c28'  OR 
               (EntityID = '3F248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'MediaModality')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8acbea37-de84-4ad4-9dab-b5d8f1cf9c28',
            '3F248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Action Params
            100025,
            'MediaModality',
            'Media Modality',
            'Specifies the type of media this parameter outputs when ValueType is MediaOutput. Used for action discovery and validation.',
            'nvarchar',
            40,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '17bc934a-9007-473a-b5eb-875758d651f1'  OR 
               (EntityID = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '17bc934a-9007-473a-b5eb-875758d651f1',
            '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3', -- Entity: MJ: Conversation Detail Attachments
            100035,
            'Description',
            'Description',
            'Description of the attachment providing context about its content and purpose.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert entity field value with ID d65e2d6c-c04a-4306-bcf1-573b3d7253f3 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('d65e2d6c-c04a-4306-bcf1-573b3d7253f3', '8ACBEA37-DE84-4AD4-9DAB-B5D8F1CF9C28', 1, 'Audio', 'Audio')

/* SQL text to insert entity field value with ID cb4b668b-a504-4cf1-8696-645b8a5dfede */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('cb4b668b-a504-4cf1-8696-645b8a5dfede', '8ACBEA37-DE84-4AD4-9DAB-B5D8F1CF9C28', 2, 'Image', 'Image')

/* SQL text to insert entity field value with ID b245aad1-daa4-49b7-a9b1-fb4289f77f38 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('b245aad1-daa4-49b7-a9b1-fb4289f77f38', '8ACBEA37-DE84-4AD4-9DAB-B5D8F1CF9C28', 3, 'Video', 'Video')

/* SQL text to update ValueListType for entity field ID 8ACBEA37-DE84-4AD4-9DAB-B5D8F1CF9C28 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='8ACBEA37-DE84-4AD4-9DAB-B5D8F1CF9C28'

/* SQL text to insert entity field value with ID 51976763-827e-4112-941e-8d9638e4f5cf */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('51976763-827e-4112-941e-8d9638e4f5cf', 'A34C17F0-6F36-EF11-86D4-6045BDEE16E6', 2, 'MediaOutput', 'MediaOutput')

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=3 WHERE ID='7579D40A-5EAD-409F-B843-014406F9E29F'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=4 WHERE ID='B1173798-AB9F-493D-AC30-6BB19D6DD579'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=5 WHERE ID='9748B58A-4AC1-4885-A6DF-1D85504D507D'

/* Index for Foreign Keys for ActionParam */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Params
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ActionID in table ActionParam
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionParam_ActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ActionParam]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionParam_ActionID ON [${flyway:defaultSchema}].[ActionParam] ([ActionID]);

/* Base View SQL for Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Params
-- Item: vwActionParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Action Params
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ActionParam
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwActionParams]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwActionParams];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwActionParams]
AS
SELECT
    a.*,
    Action_ActionID.[Name] AS [Action]
FROM
    [${flyway:defaultSchema}].[ActionParam] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Action] AS Action_ActionID
  ON
    [a].[ActionID] = Action_ActionID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwActionParams] TO [cdp_Integration], [cdp_UI], [cdp_Developer]
    

/* Base View Permissions SQL for Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Params
-- Item: Permissions for vwActionParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwActionParams] TO [cdp_Integration], [cdp_UI], [cdp_Developer]

/* spCreate SQL for Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Params
-- Item: spCreateActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ActionParam
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateActionParam]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateActionParam];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateActionParam]
    @ID uniqueidentifier = NULL,
    @ActionID uniqueidentifier,
    @Name nvarchar(255),
    @DefaultValue nvarchar(MAX),
    @Type nchar(10),
    @ValueType nvarchar(30),
    @IsArray bit = NULL,
    @Description nvarchar(MAX),
    @IsRequired bit = NULL,
    @MediaModality nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ActionParam]
            (
                [ID],
                [ActionID],
                [Name],
                [DefaultValue],
                [Type],
                [ValueType],
                [IsArray],
                [Description],
                [IsRequired],
                [MediaModality]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ActionID,
                @Name,
                @DefaultValue,
                @Type,
                @ValueType,
                ISNULL(@IsArray, 0),
                @Description,
                ISNULL(@IsRequired, 1),
                @MediaModality
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ActionParam]
            (
                [ActionID],
                [Name],
                [DefaultValue],
                [Type],
                [ValueType],
                [IsArray],
                [Description],
                [IsRequired],
                [MediaModality]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ActionID,
                @Name,
                @DefaultValue,
                @Type,
                @ValueType,
                ISNULL(@IsArray, 0),
                @Description,
                ISNULL(@IsRequired, 1),
                @MediaModality
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwActionParams] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateActionParam] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Action Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateActionParam] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Params
-- Item: spUpdateActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ActionParam
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateActionParam]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateActionParam];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateActionParam]
    @ID uniqueidentifier,
    @ActionID uniqueidentifier,
    @Name nvarchar(255),
    @DefaultValue nvarchar(MAX),
    @Type nchar(10),
    @ValueType nvarchar(30),
    @IsArray bit,
    @Description nvarchar(MAX),
    @IsRequired bit,
    @MediaModality nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ActionParam]
    SET
        [ActionID] = @ActionID,
        [Name] = @Name,
        [DefaultValue] = @DefaultValue,
        [Type] = @Type,
        [ValueType] = @ValueType,
        [IsArray] = @IsArray,
        [Description] = @Description,
        [IsRequired] = @IsRequired,
        [MediaModality] = @MediaModality
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwActionParams] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwActionParams]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateActionParam] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ActionParam table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateActionParam]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateActionParam];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateActionParam
ON [${flyway:defaultSchema}].[ActionParam]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ActionParam]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ActionParam] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Action Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateActionParam] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Params
-- Item: spDeleteActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActionParam
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteActionParam]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteActionParam];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteActionParam]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ActionParam]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteActionParam] TO [cdp_Integration]
    

/* spDelete Permissions for Action Params */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteActionParam] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID C9FF453E-F36B-1410-8494-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C9FF453E-F36B-1410-8494-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID E1FF453E-F36B-1410-8494-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E1FF453E-F36B-1410-8494-00E2629BC298',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID 99FF453E-F36B-1410-8494-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='99FF453E-F36B-1410-8494-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID BDFE453E-F36B-1410-8494-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BDFE453E-F36B-1410-8494-00E2629BC298',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID FDFE453E-F36B-1410-8494-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FDFE453E-F36B-1410-8494-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID A5FF453E-F36B-1410-8494-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A5FF453E-F36B-1410-8494-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID A9FF453E-F36B-1410-8494-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A9FF453E-F36B-1410-8494-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID ADFF453E-F36B-1410-8494-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='ADFF453E-F36B-1410-8494-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID E1FE453E-F36B-1410-8494-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E1FE453E-F36B-1410-8494-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 51FF453E-F36B-1410-8494-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='51FF453E-F36B-1410-8494-00E2629BC298',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID E5FE453E-F36B-1410-8494-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E5FE453E-F36B-1410-8494-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID E9FE453E-F36B-1410-8494-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E9FE453E-F36B-1410-8494-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentFileType'

/* Index for Foreign Keys for AIAgentRunMedia */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Medias
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentRunID in table AIAgentRunMedia
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRunMedia_AgentRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRunMedia]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRunMedia_AgentRunID ON [${flyway:defaultSchema}].[AIAgentRunMedia] ([AgentRunID]);

-- Index for foreign key SourcePromptRunMediaID in table AIAgentRunMedia
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRunMedia_SourcePromptRunMediaID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRunMedia]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRunMedia_SourcePromptRunMediaID ON [${flyway:defaultSchema}].[AIAgentRunMedia] ([SourcePromptRunMediaID]);

-- Index for foreign key ModalityID in table AIAgentRunMedia
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRunMedia_ModalityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRunMedia]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRunMedia_ModalityID ON [${flyway:defaultSchema}].[AIAgentRunMedia] ([ModalityID]);

-- Index for foreign key FileID in table AIAgentRunMedia
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRunMedia_FileID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRunMedia]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRunMedia_FileID ON [${flyway:defaultSchema}].[AIAgentRunMedia] ([FileID]);

/* SQL text to update entity field related entity name field map for entity field ID F5798CFE-136C-42CC-B751-979F29BA7DF9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F5798CFE-136C-42CC-B751-979F29BA7DF9',
         @RelatedEntityNameFieldMap='SourcePromptRunMedia'

/* Base View SQL for MJ: AI Agent Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Medias
-- Item: vwAIAgentRunMedias
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Run Medias
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentRunMedia
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentRunMedias]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentRunMedias];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentRunMedias]
AS
SELECT
    a.*,
    AIAgentRun_AgentRunID.[RunName] AS [AgentRun],
    AIPromptRunMedia_SourcePromptRunMediaID.[FileName] AS [SourcePromptRunMedia],
    AIModality_ModalityID.[Name] AS [Modality],
    File_FileID.[Name] AS [File]
FROM
    [${flyway:defaultSchema}].[AIAgentRunMedia] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS AIAgentRun_AgentRunID
  ON
    [a].[AgentRunID] = AIAgentRun_AgentRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptRunMedia] AS AIPromptRunMedia_SourcePromptRunMediaID
  ON
    [a].[SourcePromptRunMediaID] = AIPromptRunMedia_SourcePromptRunMediaID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModality] AS AIModality_ModalityID
  ON
    [a].[ModalityID] = AIModality_ModalityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[File] AS File_FileID
  ON
    [a].[FileID] = File_FileID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRunMedias] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agent Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Medias
-- Item: Permissions for vwAIAgentRunMedias
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRunMedias] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agent Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Medias
-- Item: spCreateAIAgentRunMedia
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRunMedia
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentRunMedia]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRunMedia];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRunMedia]
    @ID uniqueidentifier = NULL,
    @AgentRunID uniqueidentifier,
    @SourcePromptRunMediaID uniqueidentifier,
    @ModalityID uniqueidentifier,
    @MimeType nvarchar(100),
    @FileName nvarchar(255),
    @FileSizeBytes int,
    @Width int,
    @Height int,
    @DurationSeconds decimal(10, 2),
    @InlineData nvarchar(MAX),
    @FileID uniqueidentifier,
    @ThumbnailBase64 nvarchar(MAX),
    @Label nvarchar(255),
    @Metadata nvarchar(MAX),
    @DisplayOrder int = NULL,
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRunMedia]
            (
                [ID],
                [AgentRunID],
                [SourcePromptRunMediaID],
                [ModalityID],
                [MimeType],
                [FileName],
                [FileSizeBytes],
                [Width],
                [Height],
                [DurationSeconds],
                [InlineData],
                [FileID],
                [ThumbnailBase64],
                [Label],
                [Metadata],
                [DisplayOrder],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentRunID,
                @SourcePromptRunMediaID,
                @ModalityID,
                @MimeType,
                @FileName,
                @FileSizeBytes,
                @Width,
                @Height,
                @DurationSeconds,
                @InlineData,
                @FileID,
                @ThumbnailBase64,
                @Label,
                @Metadata,
                ISNULL(@DisplayOrder, 0),
                @Description
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRunMedia]
            (
                [AgentRunID],
                [SourcePromptRunMediaID],
                [ModalityID],
                [MimeType],
                [FileName],
                [FileSizeBytes],
                [Width],
                [Height],
                [DurationSeconds],
                [InlineData],
                [FileID],
                [ThumbnailBase64],
                [Label],
                [Metadata],
                [DisplayOrder],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentRunID,
                @SourcePromptRunMediaID,
                @ModalityID,
                @MimeType,
                @FileName,
                @FileSizeBytes,
                @Width,
                @Height,
                @DurationSeconds,
                @InlineData,
                @FileID,
                @ThumbnailBase64,
                @Label,
                @Metadata,
                ISNULL(@DisplayOrder, 0),
                @Description
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentRunMedias] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRunMedia] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agent Run Medias */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRunMedia] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agent Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Medias
-- Item: spUpdateAIAgentRunMedia
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRunMedia
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentRunMedia]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRunMedia];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRunMedia]
    @ID uniqueidentifier,
    @AgentRunID uniqueidentifier,
    @SourcePromptRunMediaID uniqueidentifier,
    @ModalityID uniqueidentifier,
    @MimeType nvarchar(100),
    @FileName nvarchar(255),
    @FileSizeBytes int,
    @Width int,
    @Height int,
    @DurationSeconds decimal(10, 2),
    @InlineData nvarchar(MAX),
    @FileID uniqueidentifier,
    @ThumbnailBase64 nvarchar(MAX),
    @Label nvarchar(255),
    @Metadata nvarchar(MAX),
    @DisplayOrder int,
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRunMedia]
    SET
        [AgentRunID] = @AgentRunID,
        [SourcePromptRunMediaID] = @SourcePromptRunMediaID,
        [ModalityID] = @ModalityID,
        [MimeType] = @MimeType,
        [FileName] = @FileName,
        [FileSizeBytes] = @FileSizeBytes,
        [Width] = @Width,
        [Height] = @Height,
        [DurationSeconds] = @DurationSeconds,
        [InlineData] = @InlineData,
        [FileID] = @FileID,
        [ThumbnailBase64] = @ThumbnailBase64,
        [Label] = @Label,
        [Metadata] = @Metadata,
        [DisplayOrder] = @DisplayOrder,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentRunMedias] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentRunMedias]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRunMedia] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRunMedia table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentRunMedia]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentRunMedia];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentRunMedia
ON [${flyway:defaultSchema}].[AIAgentRunMedia]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRunMedia]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentRunMedia] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Agent Run Medias */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRunMedia] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Agent Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Medias
-- Item: spDeleteAIAgentRunMedia
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRunMedia
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentRunMedia]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRunMedia];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRunMedia]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRunMedia]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRunMedia] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Run Medias */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRunMedia] TO [cdp_Integration]



/* Index for Foreign Keys for AIPromptRunMedia */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Run Medias
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PromptRunID in table AIPromptRunMedia
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRunMedia_PromptRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRunMedia]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRunMedia_PromptRunID ON [${flyway:defaultSchema}].[AIPromptRunMedia] ([PromptRunID]);

-- Index for foreign key ModalityID in table AIPromptRunMedia
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRunMedia_ModalityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRunMedia]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRunMedia_ModalityID ON [${flyway:defaultSchema}].[AIPromptRunMedia] ([ModalityID]);

-- Index for foreign key FileID in table AIPromptRunMedia
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIPromptRunMedia_FileID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIPromptRunMedia]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIPromptRunMedia_FileID ON [${flyway:defaultSchema}].[AIPromptRunMedia] ([FileID]);

/* Base View SQL for MJ: AI Prompt Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Run Medias
-- Item: vwAIPromptRunMedias
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompt Run Medias
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIPromptRunMedia
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIPromptRunMedias]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIPromptRunMedias];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIPromptRunMedias]
AS
SELECT
    a.*,
    AIPromptRun_PromptRunID.[RunName] AS [PromptRun],
    AIModality_ModalityID.[Name] AS [Modality],
    File_FileID.[Name] AS [File]
FROM
    [${flyway:defaultSchema}].[AIPromptRunMedia] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIPromptRun] AS AIPromptRun_PromptRunID
  ON
    [a].[PromptRunID] = AIPromptRun_PromptRunID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModality] AS AIModality_ModalityID
  ON
    [a].[ModalityID] = AIModality_ModalityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[File] AS File_FileID
  ON
    [a].[FileID] = File_FileID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptRunMedias] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Prompt Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Run Medias
-- Item: Permissions for vwAIPromptRunMedias
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptRunMedias] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Prompt Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Run Medias
-- Item: spCreateAIPromptRunMedia
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPromptRunMedia
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIPromptRunMedia]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptRunMedia];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptRunMedia]
    @ID uniqueidentifier = NULL,
    @PromptRunID uniqueidentifier,
    @ModalityID uniqueidentifier,
    @MimeType nvarchar(100),
    @FileName nvarchar(255),
    @FileSizeBytes int,
    @Width int,
    @Height int,
    @DurationSeconds decimal(10, 2),
    @InlineData nvarchar(MAX),
    @FileID uniqueidentifier,
    @ThumbnailBase64 nvarchar(MAX),
    @Metadata nvarchar(MAX),
    @DisplayOrder int = NULL,
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIPromptRunMedia]
            (
                [ID],
                [PromptRunID],
                [ModalityID],
                [MimeType],
                [FileName],
                [FileSizeBytes],
                [Width],
                [Height],
                [DurationSeconds],
                [InlineData],
                [FileID],
                [ThumbnailBase64],
                [Metadata],
                [DisplayOrder],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PromptRunID,
                @ModalityID,
                @MimeType,
                @FileName,
                @FileSizeBytes,
                @Width,
                @Height,
                @DurationSeconds,
                @InlineData,
                @FileID,
                @ThumbnailBase64,
                @Metadata,
                ISNULL(@DisplayOrder, 0),
                @Description
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIPromptRunMedia]
            (
                [PromptRunID],
                [ModalityID],
                [MimeType],
                [FileName],
                [FileSizeBytes],
                [Width],
                [Height],
                [DurationSeconds],
                [InlineData],
                [FileID],
                [ThumbnailBase64],
                [Metadata],
                [DisplayOrder],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PromptRunID,
                @ModalityID,
                @MimeType,
                @FileName,
                @FileSizeBytes,
                @Width,
                @Height,
                @DurationSeconds,
                @InlineData,
                @FileID,
                @ThumbnailBase64,
                @Metadata,
                ISNULL(@DisplayOrder, 0),
                @Description
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPromptRunMedias] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptRunMedia] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Prompt Run Medias */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptRunMedia] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Prompt Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Run Medias
-- Item: spUpdateAIPromptRunMedia
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIPromptRunMedia
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIPromptRunMedia]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPromptRunMedia];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPromptRunMedia]
    @ID uniqueidentifier,
    @PromptRunID uniqueidentifier,
    @ModalityID uniqueidentifier,
    @MimeType nvarchar(100),
    @FileName nvarchar(255),
    @FileSizeBytes int,
    @Width int,
    @Height int,
    @DurationSeconds decimal(10, 2),
    @InlineData nvarchar(MAX),
    @FileID uniqueidentifier,
    @ThumbnailBase64 nvarchar(MAX),
    @Metadata nvarchar(MAX),
    @DisplayOrder int,
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptRunMedia]
    SET
        [PromptRunID] = @PromptRunID,
        [ModalityID] = @ModalityID,
        [MimeType] = @MimeType,
        [FileName] = @FileName,
        [FileSizeBytes] = @FileSizeBytes,
        [Width] = @Width,
        [Height] = @Height,
        [DurationSeconds] = @DurationSeconds,
        [InlineData] = @InlineData,
        [FileID] = @FileID,
        [ThumbnailBase64] = @ThumbnailBase64,
        [Metadata] = @Metadata,
        [DisplayOrder] = @DisplayOrder,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIPromptRunMedias] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIPromptRunMedias]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptRunMedia] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPromptRunMedia table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIPromptRunMedia]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIPromptRunMedia];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIPromptRunMedia
ON [${flyway:defaultSchema}].[AIPromptRunMedia]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptRunMedia]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIPromptRunMedia] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Prompt Run Medias */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptRunMedia] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Prompt Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Run Medias
-- Item: spDeleteAIPromptRunMedia
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPromptRunMedia
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIPromptRunMedia]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptRunMedia];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptRunMedia]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIPromptRunMedia]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRunMedia] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Prompt Run Medias */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRunMedia] TO [cdp_Integration]



/* Index for Foreign Keys for ConversationDetailAttachment */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ConversationDetailID in table ConversationDetailAttachment
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetailAttachment_ConversationDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetailAttachment]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetailAttachment_ConversationDetailID ON [${flyway:defaultSchema}].[ConversationDetailAttachment] ([ConversationDetailID]);

-- Index for foreign key ModalityID in table ConversationDetailAttachment
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetailAttachment_ModalityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetailAttachment]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetailAttachment_ModalityID ON [${flyway:defaultSchema}].[ConversationDetailAttachment] ([ModalityID]);

-- Index for foreign key FileID in table ConversationDetailAttachment
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ConversationDetailAttachment_FileID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ConversationDetailAttachment]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ConversationDetailAttachment_FileID ON [${flyway:defaultSchema}].[ConversationDetailAttachment] ([FileID]);

/* Base View SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: vwConversationDetailAttachments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Detail Attachments
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ConversationDetailAttachment
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwConversationDetailAttachments]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwConversationDetailAttachments];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwConversationDetailAttachments]
AS
SELECT
    c.*,
    ConversationDetail_ConversationDetailID.[Message] AS [ConversationDetail],
    AIModality_ModalityID.[Name] AS [Modality],
    File_FileID.[Name] AS [File]
FROM
    [${flyway:defaultSchema}].[ConversationDetailAttachment] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ConversationDetail] AS ConversationDetail_ConversationDetailID
  ON
    [c].[ConversationDetailID] = ConversationDetail_ConversationDetailID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModality] AS AIModality_ModalityID
  ON
    [c].[ModalityID] = AIModality_ModalityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[File] AS File_FileID
  ON
    [c].[FileID] = File_FileID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationDetailAttachments] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: Permissions for vwConversationDetailAttachments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwConversationDetailAttachments] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: spCreateConversationDetailAttachment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationDetailAttachment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateConversationDetailAttachment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetailAttachment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateConversationDetailAttachment]
    @ID uniqueidentifier = NULL,
    @ConversationDetailID uniqueidentifier,
    @ModalityID uniqueidentifier,
    @MimeType nvarchar(100),
    @FileName nvarchar(4000),
    @FileSizeBytes int,
    @Width int,
    @Height int,
    @DurationSeconds int,
    @InlineData nvarchar(MAX),
    @FileID uniqueidentifier,
    @DisplayOrder int = NULL,
    @ThumbnailBase64 nvarchar(MAX),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ConversationDetailAttachment]
            (
                [ID],
                [ConversationDetailID],
                [ModalityID],
                [MimeType],
                [FileName],
                [FileSizeBytes],
                [Width],
                [Height],
                [DurationSeconds],
                [InlineData],
                [FileID],
                [DisplayOrder],
                [ThumbnailBase64],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ConversationDetailID,
                @ModalityID,
                @MimeType,
                @FileName,
                @FileSizeBytes,
                @Width,
                @Height,
                @DurationSeconds,
                @InlineData,
                @FileID,
                ISNULL(@DisplayOrder, 0),
                @ThumbnailBase64,
                @Description
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ConversationDetailAttachment]
            (
                [ConversationDetailID],
                [ModalityID],
                [MimeType],
                [FileName],
                [FileSizeBytes],
                [Width],
                [Height],
                [DurationSeconds],
                [InlineData],
                [FileID],
                [DisplayOrder],
                [ThumbnailBase64],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ConversationDetailID,
                @ModalityID,
                @MimeType,
                @FileName,
                @FileSizeBytes,
                @Width,
                @Height,
                @DurationSeconds,
                @InlineData,
                @FileID,
                ISNULL(@DisplayOrder, 0),
                @ThumbnailBase64,
                @Description
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwConversationDetailAttachments] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetailAttachment] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Conversation Detail Attachments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateConversationDetailAttachment] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: spUpdateConversationDetailAttachment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationDetailAttachment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateConversationDetailAttachment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationDetailAttachment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateConversationDetailAttachment]
    @ID uniqueidentifier,
    @ConversationDetailID uniqueidentifier,
    @ModalityID uniqueidentifier,
    @MimeType nvarchar(100),
    @FileName nvarchar(4000),
    @FileSizeBytes int,
    @Width int,
    @Height int,
    @DurationSeconds int,
    @InlineData nvarchar(MAX),
    @FileID uniqueidentifier,
    @DisplayOrder int,
    @ThumbnailBase64 nvarchar(MAX),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationDetailAttachment]
    SET
        [ConversationDetailID] = @ConversationDetailID,
        [ModalityID] = @ModalityID,
        [MimeType] = @MimeType,
        [FileName] = @FileName,
        [FileSizeBytes] = @FileSizeBytes,
        [Width] = @Width,
        [Height] = @Height,
        [DurationSeconds] = @DurationSeconds,
        [InlineData] = @InlineData,
        [FileID] = @FileID,
        [DisplayOrder] = @DisplayOrder,
        [ThumbnailBase64] = @ThumbnailBase64,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwConversationDetailAttachments] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwConversationDetailAttachments]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetailAttachment] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ConversationDetailAttachment table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateConversationDetailAttachment]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateConversationDetailAttachment];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateConversationDetailAttachment
ON [${flyway:defaultSchema}].[ConversationDetailAttachment]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ConversationDetailAttachment]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ConversationDetailAttachment] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Conversation Detail Attachments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateConversationDetailAttachment] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: spDeleteConversationDetailAttachment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetailAttachment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationDetailAttachment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetailAttachment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetailAttachment]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationDetailAttachment]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetailAttachment] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Conversation Detail Attachments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetailAttachment] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 5F00463E-F36B-1410-8494-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5F00463E-F36B-1410-8494-00E2629BC298',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 6500463E-F36B-1410-8494-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6500463E-F36B-1410-8494-00E2629BC298',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 2D00463E-F36B-1410-8494-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2D00463E-F36B-1410-8494-00E2629BC298',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 3500463E-F36B-1410-8494-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3500463E-F36B-1410-8494-00E2629BC298',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID 3700463E-F36B-1410-8494-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3700463E-F36B-1410-8494-00E2629BC298',
         @RelatedEntityNameFieldMap='User'

/* spDelete SQL for Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: spDeleteConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @AIAgentNotesID uniqueidentifier
    DECLARE @AIAgentNotes_AgentID uniqueidentifier
    DECLARE @AIAgentNotes_AgentNoteTypeID uniqueidentifier
    DECLARE @AIAgentNotes_Note nvarchar(MAX)
    DECLARE @AIAgentNotes_UserID uniqueidentifier
    DECLARE @AIAgentNotes_Type nvarchar(20)
    DECLARE @AIAgentNotes_IsAutoGenerated bit
    DECLARE @AIAgentNotes_Comments nvarchar(MAX)
    DECLARE @AIAgentNotes_Status nvarchar(20)
    DECLARE @AIAgentNotes_SourceConversationID uniqueidentifier
    DECLARE @AIAgentNotes_SourceConversationDetailID uniqueidentifier
    DECLARE @AIAgentNotes_SourceAIAgentRunID uniqueidentifier
    DECLARE @AIAgentNotes_CompanyID uniqueidentifier
    DECLARE @AIAgentNotes_EmbeddingVector nvarchar(MAX)
    DECLARE @AIAgentNotes_EmbeddingModelID uniqueidentifier
    DECLARE cascade_update_AIAgentNotes_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceConversationDetailID] = @ID
    
    OPEN cascade_update_AIAgentNotes_cursor
    FETCH NEXT FROM cascade_update_AIAgentNotes_cursor INTO @AIAgentNotesID, @AIAgentNotes_AgentID, @AIAgentNotes_AgentNoteTypeID, @AIAgentNotes_Note, @AIAgentNotes_UserID, @AIAgentNotes_Type, @AIAgentNotes_IsAutoGenerated, @AIAgentNotes_Comments, @AIAgentNotes_Status, @AIAgentNotes_SourceConversationID, @AIAgentNotes_SourceConversationDetailID, @AIAgentNotes_SourceAIAgentRunID, @AIAgentNotes_CompanyID, @AIAgentNotes_EmbeddingVector, @AIAgentNotes_EmbeddingModelID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @AIAgentNotes_SourceConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @AIAgentNotesID, @AgentID = @AIAgentNotes_AgentID, @AgentNoteTypeID = @AIAgentNotes_AgentNoteTypeID, @Note = @AIAgentNotes_Note, @UserID = @AIAgentNotes_UserID, @Type = @AIAgentNotes_Type, @IsAutoGenerated = @AIAgentNotes_IsAutoGenerated, @Comments = @AIAgentNotes_Comments, @Status = @AIAgentNotes_Status, @SourceConversationID = @AIAgentNotes_SourceConversationID, @SourceConversationDetailID = @AIAgentNotes_SourceConversationDetailID, @SourceAIAgentRunID = @AIAgentNotes_SourceAIAgentRunID, @CompanyID = @AIAgentNotes_CompanyID, @EmbeddingVector = @AIAgentNotes_EmbeddingVector, @EmbeddingModelID = @AIAgentNotes_EmbeddingModelID
        
        FETCH NEXT FROM cascade_update_AIAgentNotes_cursor INTO @AIAgentNotesID, @AIAgentNotes_AgentID, @AIAgentNotes_AgentNoteTypeID, @AIAgentNotes_Note, @AIAgentNotes_UserID, @AIAgentNotes_Type, @AIAgentNotes_IsAutoGenerated, @AIAgentNotes_Comments, @AIAgentNotes_Status, @AIAgentNotes_SourceConversationID, @AIAgentNotes_SourceConversationDetailID, @AIAgentNotes_SourceAIAgentRunID, @AIAgentNotes_CompanyID, @AIAgentNotes_EmbeddingVector, @AIAgentNotes_EmbeddingModelID
    END
    
    CLOSE cascade_update_AIAgentNotes_cursor
    DEALLOCATE cascade_update_AIAgentNotes_cursor
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @ConversationDetailsID uniqueidentifier
    DECLARE @ConversationDetails_ConversationID uniqueidentifier
    DECLARE @ConversationDetails_ExternalID nvarchar(100)
    DECLARE @ConversationDetails_Role nvarchar(20)
    DECLARE @ConversationDetails_Message nvarchar(MAX)
    DECLARE @ConversationDetails_Error nvarchar(MAX)
    DECLARE @ConversationDetails_HiddenToUser bit
    DECLARE @ConversationDetails_UserRating int
    DECLARE @ConversationDetails_UserFeedback nvarchar(MAX)
    DECLARE @ConversationDetails_ReflectionInsights nvarchar(MAX)
    DECLARE @ConversationDetails_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @ConversationDetails_UserID uniqueidentifier
    DECLARE @ConversationDetails_ArtifactID uniqueidentifier
    DECLARE @ConversationDetails_ArtifactVersionID uniqueidentifier
    DECLARE @ConversationDetails_CompletionTime bigint
    DECLARE @ConversationDetails_IsPinned bit
    DECLARE @ConversationDetails_ParentID uniqueidentifier
    DECLARE @ConversationDetails_AgentID uniqueidentifier
    DECLARE @ConversationDetails_Status nvarchar(20)
    DECLARE @ConversationDetails_SuggestedResponses nvarchar(MAX)
    DECLARE @ConversationDetails_TestRunID uniqueidentifier
    DECLARE @ConversationDetails_ResponseForm nvarchar(MAX)
    DECLARE @ConversationDetails_ActionableCommands nvarchar(MAX)
    DECLARE @ConversationDetails_AutomaticCommands nvarchar(MAX)
    DECLARE @ConversationDetails_OriginalMessageChanged bit
    DECLARE cascade_update_ConversationDetails_cursor CURSOR FOR 
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ParentID] = @ID
    
    OPEN cascade_update_ConversationDetails_cursor
    FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses, @ConversationDetails_TestRunID, @ConversationDetails_ResponseForm, @ConversationDetails_ActionableCommands, @ConversationDetails_AutomaticCommands, @ConversationDetails_OriginalMessageChanged
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @ConversationDetails_ParentID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @ConversationDetailsID, @ConversationID = @ConversationDetails_ConversationID, @ExternalID = @ConversationDetails_ExternalID, @Role = @ConversationDetails_Role, @Message = @ConversationDetails_Message, @Error = @ConversationDetails_Error, @HiddenToUser = @ConversationDetails_HiddenToUser, @UserRating = @ConversationDetails_UserRating, @UserFeedback = @ConversationDetails_UserFeedback, @ReflectionInsights = @ConversationDetails_ReflectionInsights, @SummaryOfEarlierConversation = @ConversationDetails_SummaryOfEarlierConversation, @UserID = @ConversationDetails_UserID, @ArtifactID = @ConversationDetails_ArtifactID, @ArtifactVersionID = @ConversationDetails_ArtifactVersionID, @CompletionTime = @ConversationDetails_CompletionTime, @IsPinned = @ConversationDetails_IsPinned, @ParentID = @ConversationDetails_ParentID, @AgentID = @ConversationDetails_AgentID, @Status = @ConversationDetails_Status, @SuggestedResponses = @ConversationDetails_SuggestedResponses, @TestRunID = @ConversationDetails_TestRunID, @ResponseForm = @ConversationDetails_ResponseForm, @ActionableCommands = @ConversationDetails_ActionableCommands, @AutomaticCommands = @ConversationDetails_AutomaticCommands, @OriginalMessageChanged = @ConversationDetails_OriginalMessageChanged
        
        FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status, @ConversationDetails_SuggestedResponses, @ConversationDetails_TestRunID, @ConversationDetails_ResponseForm, @ConversationDetails_ActionableCommands, @ConversationDetails_AutomaticCommands, @ConversationDetails_OriginalMessageChanged
    END
    
    CLOSE cascade_update_ConversationDetails_cursor
    DEALLOCATE cascade_update_ConversationDetails_cursor
    
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJ_AIAgentExamplesID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_AgentID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_UserID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_CompanyID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_Type nvarchar(20)
    DECLARE @MJ_AIAgentExamples_ExampleInput nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_ExampleOutput nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_IsAutoGenerated bit
    DECLARE @MJ_AIAgentExamples_SourceConversationID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SourceConversationDetailID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJ_AIAgentExamples_SuccessScore decimal(5, 2)
    DECLARE @MJ_AIAgentExamples_Comments nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_Status nvarchar(20)
    DECLARE @MJ_AIAgentExamples_EmbeddingVector nvarchar(MAX)
    DECLARE @MJ_AIAgentExamples_EmbeddingModelID uniqueidentifier
    DECLARE cascade_update_MJ_AIAgentExamples_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceConversationDetailID] = @ID
    
    OPEN cascade_update_MJ_AIAgentExamples_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentExamples_cursor INTO @MJ_AIAgentExamplesID, @MJ_AIAgentExamples_AgentID, @MJ_AIAgentExamples_UserID, @MJ_AIAgentExamples_CompanyID, @MJ_AIAgentExamples_Type, @MJ_AIAgentExamples_ExampleInput, @MJ_AIAgentExamples_ExampleOutput, @MJ_AIAgentExamples_IsAutoGenerated, @MJ_AIAgentExamples_SourceConversationID, @MJ_AIAgentExamples_SourceConversationDetailID, @MJ_AIAgentExamples_SourceAIAgentRunID, @MJ_AIAgentExamples_SuccessScore, @MJ_AIAgentExamples_Comments, @MJ_AIAgentExamples_Status, @MJ_AIAgentExamples_EmbeddingVector, @MJ_AIAgentExamples_EmbeddingModelID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentExamples_SourceConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJ_AIAgentExamplesID, @AgentID = @MJ_AIAgentExamples_AgentID, @UserID = @MJ_AIAgentExamples_UserID, @CompanyID = @MJ_AIAgentExamples_CompanyID, @Type = @MJ_AIAgentExamples_Type, @ExampleInput = @MJ_AIAgentExamples_ExampleInput, @ExampleOutput = @MJ_AIAgentExamples_ExampleOutput, @IsAutoGenerated = @MJ_AIAgentExamples_IsAutoGenerated, @SourceConversationID = @MJ_AIAgentExamples_SourceConversationID, @SourceConversationDetailID = @MJ_AIAgentExamples_SourceConversationDetailID, @SourceAIAgentRunID = @MJ_AIAgentExamples_SourceAIAgentRunID, @SuccessScore = @MJ_AIAgentExamples_SuccessScore, @Comments = @MJ_AIAgentExamples_Comments, @Status = @MJ_AIAgentExamples_Status, @EmbeddingVector = @MJ_AIAgentExamples_EmbeddingVector, @EmbeddingModelID = @MJ_AIAgentExamples_EmbeddingModelID
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentExamples_cursor INTO @MJ_AIAgentExamplesID, @MJ_AIAgentExamples_AgentID, @MJ_AIAgentExamples_UserID, @MJ_AIAgentExamples_CompanyID, @MJ_AIAgentExamples_Type, @MJ_AIAgentExamples_ExampleInput, @MJ_AIAgentExamples_ExampleOutput, @MJ_AIAgentExamples_IsAutoGenerated, @MJ_AIAgentExamples_SourceConversationID, @MJ_AIAgentExamples_SourceConversationDetailID, @MJ_AIAgentExamples_SourceAIAgentRunID, @MJ_AIAgentExamples_SuccessScore, @MJ_AIAgentExamples_Comments, @MJ_AIAgentExamples_Status, @MJ_AIAgentExamples_EmbeddingVector, @MJ_AIAgentExamples_EmbeddingModelID
    END
    
    CLOSE cascade_update_MJ_AIAgentExamples_cursor
    DEALLOCATE cascade_update_MJ_AIAgentExamples_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJ_AIAgentRunsID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_AgentID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_ParentRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Status nvarchar(50)
    DECLARE @MJ_AIAgentRuns_StartedAt datetimeoffset
    DECLARE @MJ_AIAgentRuns_CompletedAt datetimeoffset
    DECLARE @MJ_AIAgentRuns_Success bit
    DECLARE @MJ_AIAgentRuns_ErrorMessage nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_ConversationID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_UserID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Result nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_AgentState nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_TotalTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalCost decimal(18, 6)
    DECLARE @MJ_AIAgentRuns_TotalPromptTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalCompletionTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalPromptTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalCostRollup decimal(19, 8)
    DECLARE @MJ_AIAgentRuns_ConversationDetailID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_ConversationDetailSequence int
    DECLARE @MJ_AIAgentRuns_CancellationReason nvarchar(30)
    DECLARE @MJ_AIAgentRuns_FinalStep nvarchar(30)
    DECLARE @MJ_AIAgentRuns_FinalPayload nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_Message nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_LastRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_StartingPayload nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_TotalPromptIterations int
    DECLARE @MJ_AIAgentRuns_ConfigurationID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_OverrideModelID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_OverrideVendorID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Data nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_Verbose bit
    DECLARE @MJ_AIAgentRuns_EffortLevel int
    DECLARE @MJ_AIAgentRuns_RunName nvarchar(255)
    DECLARE @MJ_AIAgentRuns_Comments nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_ScheduledJobRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_TestRunID uniqueidentifier
    DECLARE cascade_update_MJ_AIAgentRuns_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_update_MJ_AIAgentRuns_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID, @MJ_AIAgentRuns_TestRunID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentRuns_ConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJ_AIAgentRunsID, @AgentID = @MJ_AIAgentRuns_AgentID, @ParentRunID = @MJ_AIAgentRuns_ParentRunID, @Status = @MJ_AIAgentRuns_Status, @StartedAt = @MJ_AIAgentRuns_StartedAt, @CompletedAt = @MJ_AIAgentRuns_CompletedAt, @Success = @MJ_AIAgentRuns_Success, @ErrorMessage = @MJ_AIAgentRuns_ErrorMessage, @ConversationID = @MJ_AIAgentRuns_ConversationID, @UserID = @MJ_AIAgentRuns_UserID, @Result = @MJ_AIAgentRuns_Result, @AgentState = @MJ_AIAgentRuns_AgentState, @TotalTokensUsed = @MJ_AIAgentRuns_TotalTokensUsed, @TotalCost = @MJ_AIAgentRuns_TotalCost, @TotalPromptTokensUsed = @MJ_AIAgentRuns_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJ_AIAgentRuns_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJ_AIAgentRuns_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJ_AIAgentRuns_TotalCostRollup, @ConversationDetailID = @MJ_AIAgentRuns_ConversationDetailID, @ConversationDetailSequence = @MJ_AIAgentRuns_ConversationDetailSequence, @CancellationReason = @MJ_AIAgentRuns_CancellationReason, @FinalStep = @MJ_AIAgentRuns_FinalStep, @FinalPayload = @MJ_AIAgentRuns_FinalPayload, @Message = @MJ_AIAgentRuns_Message, @LastRunID = @MJ_AIAgentRuns_LastRunID, @StartingPayload = @MJ_AIAgentRuns_StartingPayload, @TotalPromptIterations = @MJ_AIAgentRuns_TotalPromptIterations, @ConfigurationID = @MJ_AIAgentRuns_ConfigurationID, @OverrideModelID = @MJ_AIAgentRuns_OverrideModelID, @OverrideVendorID = @MJ_AIAgentRuns_OverrideVendorID, @Data = @MJ_AIAgentRuns_Data, @Verbose = @MJ_AIAgentRuns_Verbose, @EffortLevel = @MJ_AIAgentRuns_EffortLevel, @RunName = @MJ_AIAgentRuns_RunName, @Comments = @MJ_AIAgentRuns_Comments, @ScheduledJobRunID = @MJ_AIAgentRuns_ScheduledJobRunID, @TestRunID = @MJ_AIAgentRuns_TestRunID
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID, @MJ_AIAgentRuns_TestRunID
    END
    
    CLOSE cascade_update_MJ_AIAgentRuns_cursor
    DEALLOCATE cascade_update_MJ_AIAgentRuns_cursor
    
    -- Cascade delete from ConversationDetailArtifact using cursor to call spDeleteConversationDetailArtifact
    DECLARE @MJ_ConversationDetailArtifactsID uniqueidentifier
    DECLARE cascade_delete_MJ_ConversationDetailArtifacts_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailArtifact]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJ_ConversationDetailArtifacts_cursor
    FETCH NEXT FROM cascade_delete_MJ_ConversationDetailArtifacts_cursor INTO @MJ_ConversationDetailArtifactsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailArtifact] @ID = @MJ_ConversationDetailArtifactsID
        
        FETCH NEXT FROM cascade_delete_MJ_ConversationDetailArtifacts_cursor INTO @MJ_ConversationDetailArtifactsID
    END
    
    CLOSE cascade_delete_MJ_ConversationDetailArtifacts_cursor
    DEALLOCATE cascade_delete_MJ_ConversationDetailArtifacts_cursor
    
    -- Cascade delete from ConversationDetailAttachment using cursor to call spDeleteConversationDetailAttachment
    DECLARE @MJ_ConversationDetailAttachmentsID uniqueidentifier
    DECLARE cascade_delete_MJ_ConversationDetailAttachments_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailAttachment]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJ_ConversationDetailAttachments_cursor
    FETCH NEXT FROM cascade_delete_MJ_ConversationDetailAttachments_cursor INTO @MJ_ConversationDetailAttachmentsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailAttachment] @ID = @MJ_ConversationDetailAttachmentsID
        
        FETCH NEXT FROM cascade_delete_MJ_ConversationDetailAttachments_cursor INTO @MJ_ConversationDetailAttachmentsID
    END
    
    CLOSE cascade_delete_MJ_ConversationDetailAttachments_cursor
    DEALLOCATE cascade_delete_MJ_ConversationDetailAttachments_cursor
    
    -- Cascade delete from ConversationDetailRating using cursor to call spDeleteConversationDetailRating
    DECLARE @MJ_ConversationDetailRatingsID uniqueidentifier
    DECLARE cascade_delete_MJ_ConversationDetailRatings_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailRating]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJ_ConversationDetailRatings_cursor
    FETCH NEXT FROM cascade_delete_MJ_ConversationDetailRatings_cursor INTO @MJ_ConversationDetailRatingsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailRating] @ID = @MJ_ConversationDetailRatingsID
        
        FETCH NEXT FROM cascade_delete_MJ_ConversationDetailRatings_cursor INTO @MJ_ConversationDetailRatingsID
    END
    
    CLOSE cascade_delete_MJ_ConversationDetailRatings_cursor
    DEALLOCATE cascade_delete_MJ_ConversationDetailRatings_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJ_TasksID uniqueidentifier
    DECLARE @MJ_Tasks_ParentID uniqueidentifier
    DECLARE @MJ_Tasks_Name nvarchar(255)
    DECLARE @MJ_Tasks_Description nvarchar(MAX)
    DECLARE @MJ_Tasks_TypeID uniqueidentifier
    DECLARE @MJ_Tasks_EnvironmentID uniqueidentifier
    DECLARE @MJ_Tasks_ProjectID uniqueidentifier
    DECLARE @MJ_Tasks_ConversationDetailID uniqueidentifier
    DECLARE @MJ_Tasks_UserID uniqueidentifier
    DECLARE @MJ_Tasks_AgentID uniqueidentifier
    DECLARE @MJ_Tasks_Status nvarchar(50)
    DECLARE @MJ_Tasks_PercentComplete int
    DECLARE @MJ_Tasks_DueAt datetimeoffset
    DECLARE @MJ_Tasks_StartedAt datetimeoffset
    DECLARE @MJ_Tasks_CompletedAt datetimeoffset
    DECLARE cascade_update_MJ_Tasks_cursor CURSOR FOR 
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_update_MJ_Tasks_cursor
    FETCH NEXT FROM cascade_update_MJ_Tasks_cursor INTO @MJ_TasksID, @MJ_Tasks_ParentID, @MJ_Tasks_Name, @MJ_Tasks_Description, @MJ_Tasks_TypeID, @MJ_Tasks_EnvironmentID, @MJ_Tasks_ProjectID, @MJ_Tasks_ConversationDetailID, @MJ_Tasks_UserID, @MJ_Tasks_AgentID, @MJ_Tasks_Status, @MJ_Tasks_PercentComplete, @MJ_Tasks_DueAt, @MJ_Tasks_StartedAt, @MJ_Tasks_CompletedAt
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_Tasks_ConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJ_TasksID, @ParentID = @MJ_Tasks_ParentID, @Name = @MJ_Tasks_Name, @Description = @MJ_Tasks_Description, @TypeID = @MJ_Tasks_TypeID, @EnvironmentID = @MJ_Tasks_EnvironmentID, @ProjectID = @MJ_Tasks_ProjectID, @ConversationDetailID = @MJ_Tasks_ConversationDetailID, @UserID = @MJ_Tasks_UserID, @AgentID = @MJ_Tasks_AgentID, @Status = @MJ_Tasks_Status, @PercentComplete = @MJ_Tasks_PercentComplete, @DueAt = @MJ_Tasks_DueAt, @StartedAt = @MJ_Tasks_StartedAt, @CompletedAt = @MJ_Tasks_CompletedAt
        
        FETCH NEXT FROM cascade_update_MJ_Tasks_cursor INTO @MJ_TasksID, @MJ_Tasks_ParentID, @MJ_Tasks_Name, @MJ_Tasks_Description, @MJ_Tasks_TypeID, @MJ_Tasks_EnvironmentID, @MJ_Tasks_ProjectID, @MJ_Tasks_ConversationDetailID, @MJ_Tasks_UserID, @MJ_Tasks_AgentID, @MJ_Tasks_Status, @MJ_Tasks_PercentComplete, @MJ_Tasks_DueAt, @MJ_Tasks_StartedAt, @MJ_Tasks_CompletedAt
    END
    
    CLOSE cascade_update_MJ_Tasks_cursor
    DEALLOCATE cascade_update_MJ_Tasks_cursor
    
    -- Cascade update on Report using cursor to call spUpdateReport
    DECLARE @ReportsID uniqueidentifier
    DECLARE @Reports_Name nvarchar(255)
    DECLARE @Reports_Description nvarchar(MAX)
    DECLARE @Reports_CategoryID uniqueidentifier
    DECLARE @Reports_UserID uniqueidentifier
    DECLARE @Reports_SharingScope nvarchar(20)
    DECLARE @Reports_ConversationID uniqueidentifier
    DECLARE @Reports_ConversationDetailID uniqueidentifier
    DECLARE @Reports_DataContextID uniqueidentifier
    DECLARE @Reports_Configuration nvarchar(MAX)
    DECLARE @Reports_OutputTriggerTypeID uniqueidentifier
    DECLARE @Reports_OutputFormatTypeID uniqueidentifier
    DECLARE @Reports_OutputDeliveryTypeID uniqueidentifier
    DECLARE @Reports_OutputFrequency nvarchar(50)
    DECLARE @Reports_OutputTargetEmail nvarchar(255)
    DECLARE @Reports_OutputWorkflowID uniqueidentifier
    DECLARE @Reports_Thumbnail nvarchar(MAX)
    DECLARE @Reports_EnvironmentID uniqueidentifier
    DECLARE cascade_update_Reports_cursor CURSOR FOR 
        SELECT [ID], [Name], [Description], [CategoryID], [UserID], [SharingScope], [ConversationID], [ConversationDetailID], [DataContextID], [Configuration], [OutputTriggerTypeID], [OutputFormatTypeID], [OutputDeliveryTypeID], [OutputFrequency], [OutputTargetEmail], [OutputWorkflowID], [Thumbnail], [EnvironmentID]
        FROM [${flyway:defaultSchema}].[Report]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_update_Reports_cursor
    FETCH NEXT FROM cascade_update_Reports_cursor INTO @ReportsID, @Reports_Name, @Reports_Description, @Reports_CategoryID, @Reports_UserID, @Reports_SharingScope, @Reports_ConversationID, @Reports_ConversationDetailID, @Reports_DataContextID, @Reports_Configuration, @Reports_OutputTriggerTypeID, @Reports_OutputFormatTypeID, @Reports_OutputDeliveryTypeID, @Reports_OutputFrequency, @Reports_OutputTargetEmail, @Reports_OutputWorkflowID, @Reports_Thumbnail, @Reports_EnvironmentID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @Reports_ConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateReport] @ID = @ReportsID, @Name = @Reports_Name, @Description = @Reports_Description, @CategoryID = @Reports_CategoryID, @UserID = @Reports_UserID, @SharingScope = @Reports_SharingScope, @ConversationID = @Reports_ConversationID, @ConversationDetailID = @Reports_ConversationDetailID, @DataContextID = @Reports_DataContextID, @Configuration = @Reports_Configuration, @OutputTriggerTypeID = @Reports_OutputTriggerTypeID, @OutputFormatTypeID = @Reports_OutputFormatTypeID, @OutputDeliveryTypeID = @Reports_OutputDeliveryTypeID, @OutputFrequency = @Reports_OutputFrequency, @OutputTargetEmail = @Reports_OutputTargetEmail, @OutputWorkflowID = @Reports_OutputWorkflowID, @Thumbnail = @Reports_Thumbnail, @EnvironmentID = @Reports_EnvironmentID
        
        FETCH NEXT FROM cascade_update_Reports_cursor INTO @ReportsID, @Reports_Name, @Reports_Description, @Reports_CategoryID, @Reports_UserID, @Reports_SharingScope, @Reports_ConversationID, @Reports_ConversationDetailID, @Reports_DataContextID, @Reports_Configuration, @Reports_OutputTriggerTypeID, @Reports_OutputFormatTypeID, @Reports_OutputDeliveryTypeID, @Reports_OutputFrequency, @Reports_OutputTargetEmail, @Reports_OutputWorkflowID, @Reports_Thumbnail, @Reports_EnvironmentID
    END
    
    CLOSE cascade_update_Reports_cursor
    DEALLOCATE cascade_update_Reports_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spDelete Permissions for Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2cdd276a-c0c0-4f57-aaea-07fab0fedef3'  OR 
               (EntityID = 'C21CD727-D771-450D-BAFA-104922931BFC' AND Name = 'SourcePromptRunMedia')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2cdd276a-c0c0-4f57-aaea-07fab0fedef3',
            'C21CD727-D771-450D-BAFA-104922931BFC', -- Entity: MJ: AI Agent Run Medias
            100043,
            'SourcePromptRunMedia',
            'Source Prompt Run Media',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'A04C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A04C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A24C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A34C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A64C17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8ACBEA37-DE84-4AD4-9DAB-B5D8F1CF9C28'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A04C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A34C17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8ACBEA37-DE84-4AD4-9DAB-B5D8F1CF9C28'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'B7A7E938-5000-4966-A2CC-5BB754C01C0E'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4C2BADF2-E72C-4497-BF1C-B624A7171BCB'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B7A7E938-5000-4966-A2CC-5BB754C01C0E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '19373787-EAC3-4454-BEAC-0E687861368A'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '68BD96DE-8EE4-44F0-B7EF-50317EEA952B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AAB63CA9-D634-4075-8077-E07F273CDFEF'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '2435AE2F-E39F-4654-8EEE-363F9E3BF282'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5C63E41C-9D73-448E-A9D6-5BC925282823'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0823CFA2-D5FB-4FF6-9F2F-BB8269FEAD3D'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4C2BADF2-E72C-4497-BF1C-B624A7171BCB'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B7A7E938-5000-4966-A2CC-5BB754C01C0E'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '17BC934A-9007-473A-B5EB-875758D651F1'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0823CFA2-D5FB-4FF6-9F2F-BB8269FEAD3D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '3C807185-2F2B-41E3-B4B7-6AF0DF475E02'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A59B40B9-3811-47A9-9484-7EC23CE5CFCB'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3C807185-2F2B-41E3-B4B7-6AF0DF475E02'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E4E11217-97A8-43B2-B9DE-45845E4930B0'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '63F7B8EB-C5EE-4AF5-83E1-4D5325C6EEAC'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3C807185-2F2B-41E3-B4B7-6AF0DF475E02'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E4E11217-97A8-43B2-B9DE-45845E4930B0'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '348803A9-DDA4-491E-BBCF-F036F4C2B637'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '63F7B8EB-C5EE-4AF5-83E1-4D5325C6EEAC'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '6FEB9BB1-01A3-4D34-952D-FDCED06B55CA'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3EBCBC53-5FBD-4F6A-9F0F-7C9A6A96303E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '121A46DA-FA89-4004-88DC-70A4E210319C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0173B18F-1369-4E2D-9985-2676B1241F69'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6FEB9BB1-01A3-4D34-952D-FDCED06B55CA'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '316F664E-9CE4-42D0-8291-867B3FBFF094'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8AD2CC07-6CA4-4C5F-B54B-0FE604BF6F2D'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3EBCBC53-5FBD-4F6A-9F0F-7C9A6A96303E'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '121A46DA-FA89-4004-88DC-70A4E210319C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6FEB9BB1-01A3-4D34-952D-FDCED06B55CA'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BB8FC042-D5B2-4288-B44C-E6423A3494DD'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8AD2CC07-6CA4-4C5F-B54B-0FE604BF6F2D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 13 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Action Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9E4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Action Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Action',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9F4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Action Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Action',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A74C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parameter Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A04C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Value',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A14C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parameter Direction',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A24C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Value Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A34C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Array',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A44C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A54C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Required',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A64C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Parameter Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Media Modality',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8ACBEA37-DE84-4AD4-9DAB-B5D8F1CF9C28'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E05817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E15817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('a9bcc0d8-4b8f-420a-a3ca-3240958bd6f6', '3F248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Parameter Definition":{"icon":"fa fa-list-alt","description":""},"Action Association":{"icon":"fa fa-link","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Parameter Definition":"fa fa-list-alt","Action Association":"fa fa-link","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '3F248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 19 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6C461DE0-D8B1-4ECA-8924-89322F1CDAB6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E48FFA14-4B4C-42EA-8E7B-F74C0ADFFA40'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F34C1F6F-E865-4F5C-BB3F-8E2BD0042747'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F67B3F45-A45F-4F0C-A16C-939B1EF783B2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Modality',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6F304BC3-EA6B-41F3-BAE0-DB21B733A022'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'MIME Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4C2BADF2-E72C-4497-BF1C-B624A7171BCB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'File Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B7A7E938-5000-4966-A2CC-5BB754C01C0E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'File Size (Bytes)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '19373787-EAC3-4454-BEAC-0E687861368A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Display Order',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5C63E41C-9D73-448E-A9D6-5BC925282823'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Conversation Detail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'ED84FD05-9694-4816-82F5-1664E8EE0DA1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Modality',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0823CFA2-D5FB-4FF6-9F2F-BB8269FEAD3D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '17BC934A-9007-473A-B5EB-875758D651F1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Properties',
       GeneratedFormSection = 'Category',
       DisplayName = 'Width',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '68BD96DE-8EE4-44F0-B7EF-50317EEA952B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Properties',
       GeneratedFormSection = 'Category',
       DisplayName = 'Height',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AAB63CA9-D634-4075-8077-E07F273CDFEF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Properties',
       GeneratedFormSection = 'Category',
       DisplayName = 'Duration (Seconds)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2435AE2F-E39F-4654-8EEE-363F9E3BF282'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Properties',
       GeneratedFormSection = 'Category',
       DisplayName = 'Thumbnail',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8F7049B2-DBF7-47BB-88EE-89F8C5220297'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Storage Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Inline Data',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1BE8E682-9EE8-4B4F-8587-56786D5A25FF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Storage Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'File ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E6FB5C5E-7E62-4ED8-BD35-00DC7078D96B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Storage Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'File',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8D926FA8-6DA2-435B-8B5F-079BFD0E0FC8'
   AND AutoUpdateCategory = 1

/* Set categories for 23 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9882EB6B-C103-4B37-A823-BB066C66204D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '71155CD3-AB80-4CB9-AA59-E431FEBD29DF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7A7CEA6B-F52C-443C-B2EB-4F1AAA6D58EA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F6640624-C8AA-40E9-9476-FC5B05138D79'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source Prompt Run Media',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F5798CFE-136C-42CC-B751-979F29BA7DF9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Modality',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A6D8BF95-BEA7-4412-AE17-A985E046863A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Label',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6FEB9BB1-01A3-4D34-952D-FDCED06B55CA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Display Order',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '316F664E-9CE4-42D0-8291-867B3FBFF094'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BD9A8820-378D-4998-8C73-7805C0CE3D6D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Source Prompt Run Media',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2CDD276A-C0C0-4F57-AAEA-07FAB0FEDEF3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Run Context',
       GeneratedFormSection = 'Category',
       DisplayName = 'Modality',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8AD2CC07-6CA4-4C5F-B54B-0FE604BF6F2D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'File Attributes',
       GeneratedFormSection = 'Category',
       DisplayName = 'Mime Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3EBCBC53-5FBD-4F6A-9F0F-7C9A6A96303E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'File Attributes',
       GeneratedFormSection = 'Category',
       DisplayName = 'File Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '121A46DA-FA89-4004-88DC-70A4E210319C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'File Attributes',
       GeneratedFormSection = 'Category',
       DisplayName = 'File Size Bytes',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4C29A554-2DC8-44E4-8BD5-68455F3299E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'File Attributes',
       GeneratedFormSection = 'Category',
       DisplayName = 'Width',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E01BFCEC-0843-49D0-9351-BCD4A91180C5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'File Attributes',
       GeneratedFormSection = 'Category',
       DisplayName = 'Height',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5A3DF96C-A638-45CB-ADF8-CA910AF16158'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'File Attributes',
       GeneratedFormSection = 'Category',
       DisplayName = 'Duration Seconds',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0173B18F-1369-4E2D-9985-2676B1241F69'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'File Attributes',
       GeneratedFormSection = 'Category',
       DisplayName = 'File ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D5BC6DA5-A541-4D2B-B1E6-2A2171BB1F5A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'File Attributes',
       GeneratedFormSection = 'Category',
       DisplayName = 'File',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '11F44C13-FD93-4F19-BB0D-50FFB4794A5E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Inline Data',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4E624F95-8368-4B70-BB73-20AEDA8C7D0A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Thumbnail Base64',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '42CA522B-7A45-48CA-9BC5-7A77C13C2557'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Metadata',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C271F34B-36F6-4F6B-8928-904FC0AB628D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Content',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BB8FC042-D5B2-4288-B44C-E6423A3494DD'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Attachment Metadata":{"icon":"fa fa-paperclip","description":"Core information that identifies and describes the attachment, its type, and ordering within a conversation message"},"Media Properties":{"icon":"fa fa-image","description":"Technical characteristics of visual or audio media such as dimensions, duration, and preview thumbnail"},"Storage Details":{"icon":"fa fa-database","description":"How the attachment content is stored, either inline as Base64 or via a reference to external storage"},"System Metadata":{"icon":"fa fa-cog","description":"Audit and system-managed fields tracking creation, updates, and the internal record identifier"}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Run Context":{"icon":"fa fa-robot","description":"Information that ties a media item to a specific AI agent run, including identifiers, labels and ordering"},"File Attributes":{"icon":"fa fa-file","description":"Technical specifications of the stored media file such as name, type, size, dimensions and duration"},"Media Content":{"icon":"fa fa-image","description":"Embedded data, thumbnail previews and supplemental metadata describing the media"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields and primary identifier"}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'C21CD727-D771-450D-BAFA-104922931BFC' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Attachment Metadata":"fa fa-paperclip","Media Properties":"fa fa-image","Storage Details":"fa fa-database","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3' AND Name = 'FieldCategoryIcons'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Run Context":"fa fa-robot","File Attributes":"fa fa-file","Media Content":"fa fa-image","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'C21CD727-D771-450D-BAFA-104922931BFC' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 20 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '130D5E45-D2FA-4C00-94E6-B1F28287215A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '13A1EB13-184A-4A6B-8B3E-82CC6A83A8EB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AB9942F0-A077-431F-86FF-9A196C45423E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Prompt Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7B716E53-951C-44F5-A688-225FC0F04B75'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Modality',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8EE092AD-BD92-4FE7-A3F8-B94B6B6888DC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Display Order',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '344F278B-E7A1-4375-BA2C-8615CCC47718'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Prompt Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '348803A9-DDA4-491E-BBCF-F036F4C2B637'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Modality',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '63F7B8EB-C5EE-4AF5-83E1-4D5325C6EEAC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'MIME Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A59B40B9-3811-47A9-9484-7EC23CE5CFCB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'File Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3C807185-2F2B-41E3-B4B7-6AF0DF475E02'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'File Size (Bytes)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0CB636E1-F53B-483C-A561-C13CF41692C6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Width',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FEC4A6C1-6D1F-441D-AE75-D45FA2927636'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Height',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DFA33632-D484-4AF1-95F4-BCEB512AE496'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Duration (Seconds)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DF17AD06-EDC1-40F0-A48C-7C57F0BE322F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Metadata',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F2F3E535-FDBD-4312-988A-19DDD434C840'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Media Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E4E11217-97A8-43B2-B9DE-45845E4930B0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Content Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Inline Data',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '502A684F-F72D-41ED-998B-4913AE993487'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Content Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'File ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8FD697E8-4F1A-4DBE-B17E-6D099FE654FA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Content Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'Thumbnail (Base64)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '510D78B2-A971-4F5E-A4D8-71B5A0A7E9F1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Content Data',
       GeneratedFormSection = 'Category',
       DisplayName = 'File',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9A45B252-0266-4877-AC5D-9508674CDF6D'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields that track record creation and modification"},"Association":{"icon":"fa fa-link","description":"Fields that link a media item to a prompt run, modality, and define display ordering"},"Media Metadata":{"icon":"fa fa-image","description":"Core descriptive attributes of the media file such as type, size, dimensions and duration"},"Content Data":{"icon":"fa fa-database","description":"Raw data and storage references for the media content, including inline data and thumbnails"}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '228FF492-57AD-4097-922F-50441FD19BA0' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"System Metadata":"fa fa-cog","Association":"fa fa-link","Media Metadata":"fa fa-image","Content Data":"fa fa-database"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '228FF492-57AD-4097-922F-50441FD19BA0' AND Name = 'FieldCategoryIcons'
            



