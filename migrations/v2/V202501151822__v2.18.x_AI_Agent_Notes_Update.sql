-- Alter the table to add the columns
ALTER TABLE ${flyway:defaultSchema}.AIAgentNote 
   ADD Type NVARCHAR(20) NOT NULL CHECK (Type IN ('User', 'Global')),
       UserID UNIQUEIDENTIFIER NULL;

-- Add a foreign key constraint for the UserID column
ALTER TABLE ${flyway:defaultSchema}.AIAgentNote
   ADD CONSTRAINT FK_AIAgentNote_User FOREIGN KEY (UserID) REFERENCES ${flyway:defaultSchema}.[User](ID);

-- Add extended property for the Type column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Indicates the type of note, either User-specific or Global.', 
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentNote',
    @level2type = N'COLUMN', @level2name = N'Type';

-- Add extended property for the UserID column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Foreign key referencing the ID column in the User table, indicating the user associated with the note. Used when Type=User', 
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentNote',
    @level2type = N'COLUMN', @level2name = N'UserID';




----- METADATA FROM CODEGEN

/* SQL text to update existing entities from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to delete unneeded entity fields */
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'

/* SQL text to update existingg entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to insert new entity field */

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
         'c01717be-ff5a-4c92-820a-a547324f6f1b',
         'A24EF5EC-D32C-4A53-85A9-364E322451E6',
         7,
         'Type',
         'Type',
         'Indicates the type of note, either User-specific or Global.',
         'nvarchar',
         40,
         0,
         0,
         0,
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

/* SQL text to insert new entity field */

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
         'b8b8c7b4-2f27-4555-80f1-fef0d2f662c3',
         'A24EF5EC-D32C-4A53-85A9-364E322451E6',
         8,
         'UserID',
         'User ID',
         'Foreign key referencing the ID column in the User table, indicating the user associated with the note. Used when Type=User',
         'uniqueidentifier',
         16,
         0,
         0,
         1,
         'null',
         0,
         1,
         0,
         'E1238F34-2837-EF11-86D4-6045BDEE16E6',
         'ID',
         0,
         0,
         1,
         0,
         0,
         0,
         'Search'
      )

/* SQL text to set default column width where needed */
EXEC ${flyway:defaultSchema}.spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('C01717BE-FF5A-4C92-820A-A547324F6F1B', 1, 'User', 'User')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('C01717BE-FF5A-4C92-820A-A547324F6F1B', 2, 'Global', 'Global')

/* SQL text to update ValueListType for entity field ID C01717BE-FF5A-4C92-820A-A547324F6F1B */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='C01717BE-FF5A-4C92-820A-A547324F6F1B'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=1 WHERE ID='C051302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=3 WHERE ID='BE51302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to create Entitiy Relationships */
INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                                          VALUES ('cae3b137-2933-482d-8e76-2b2ae64ae67e', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'F3C49FE2-B5D9-40D4-8562-6596261772A0', 'ResponseByUserID', 'One To Many', 1, 1, 'AI Agent Requests', 1);
                              

/* SQL text to create Entitiy Relationships */
INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                                          VALUES ('0c01eb16-40ab-4c8e-bbfe-de934b121dae', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'A24EF5EC-D32C-4A53-85A9-364E322451E6', 'UserID', 'One To Many', 1, 1, 'AI Agent Notes', 1);
                              INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                                          VALUES ('0910e31d-cee4-4d08-80b0-51f13b0dce85', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'F3C49FE2-B5D9-40D4-8562-6596261772A0', 'RequestForUserID', 'One To Many', 1, 1, 'AI Agent Requests', 2);
                              

/* Index for Foreign Keys for AIAgentNote */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Notes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentNote
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentNote_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentNote]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentNote_AgentID ON [${flyway:defaultSchema}].[AIAgentNote] ([AgentID]);

-- Index for foreign key AgentNoteTypeID in table AIAgentNote
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentNote_AgentNoteTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentNote]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentNote_AgentNoteTypeID ON [${flyway:defaultSchema}].[AIAgentNote] ([AgentNoteTypeID]);

-- Index for foreign key UserID in table AIAgentNote
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentNote_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentNote]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentNote_UserID ON [${flyway:defaultSchema}].[AIAgentNote] ([UserID]);

/* SQL text to update entity field related entity name field map for entity field ID B8B8C7B4-2F27-4555-80F1-FEF0D2F662C3 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B8B8C7B4-2F27-4555-80F1-FEF0D2F662C3',
         @RelatedEntityNameFieldMap='User'

/* Base View SQL for AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Notes
-- Item: vwAIAgentNotes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Agent Notes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentNote
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgentNotes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentNotes]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    AIAgentNoteType_AgentNoteTypeID.[Name] AS [AgentNoteType],
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[AIAgentNote] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentNoteType] AS AIAgentNoteType_AgentNoteTypeID
  ON
    [a].[AgentNoteTypeID] = AIAgentNoteType_AgentNoteTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [a].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentNotes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Notes
-- Item: Permissions for vwAIAgentNotes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentNotes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Notes
-- Item: spCreateAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentNote
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgentNote]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentNote]
    @AgentID uniqueidentifier,
    @AgentNoteTypeID uniqueidentifier,
    @Note nvarchar(MAX),
    @Type nvarchar(20),
    @UserID uniqueidentifier = '00000000-0000-0000-0000-000000000000'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIAgentNote]
        (
            [AgentID],
            [AgentNoteTypeID],
            [Note],
            [Type],
            [UserID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @AgentID,
            @AgentNoteTypeID,
            @Note,
            @Type,
            CASE @UserID WHEN '00000000-0000-0000-0000-000000000000' THEN null ELSE @UserID END
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentNotes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentNote] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for AI Agent Notes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentNote] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Notes
-- Item: spUpdateAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentNote
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgentNote]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentNote]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @AgentNoteTypeID uniqueidentifier,
    @Note nvarchar(MAX),
    @Type nvarchar(20),
    @UserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentNote]
    SET
        [AgentID] = @AgentID,
        [AgentNoteTypeID] = @AgentNoteTypeID,
        [Note] = @Note,
        [Type] = @Type,
        [UserID] = @UserID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentNotes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentNote] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the AIAgentNote table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgentNote
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentNote
ON [${flyway:defaultSchema}].[AIAgentNote]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentNote]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentNote] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Agent Notes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentNote] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Notes
-- Item: spDeleteAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentNote
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgentNote]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentNote]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentNote]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentNote] TO [cdp_Integration]
    

/* spDelete Permissions for AI Agent Notes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentNote] TO [cdp_Integration]



/* Index for Foreign Keys for AIAgentRequest */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Requests
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentRequest
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRequest_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRequest]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRequest_AgentID ON [${flyway:defaultSchema}].[AIAgentRequest] ([AgentID]);

-- Index for foreign key RequestForUserID in table AIAgentRequest
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRequest_RequestForUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRequest]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRequest_RequestForUserID ON [${flyway:defaultSchema}].[AIAgentRequest] ([RequestForUserID]);

-- Index for foreign key ResponseByUserID in table AIAgentRequest
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRequest_ResponseByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRequest]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRequest_ResponseByUserID ON [${flyway:defaultSchema}].[AIAgentRequest] ([ResponseByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 4DACDDC8-2461-4995-A2CA-469250521F44 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4DACDDC8-2461-4995-A2CA-469250521F44',
         @RelatedEntityNameFieldMap='RequestForUser'

/* SQL text to update entity field related entity name field map for entity field ID 3D9F4176-C838-47F2-8E96-E3D45B588FE6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3D9F4176-C838-47F2-8E96-E3D45B588FE6',
         @RelatedEntityNameFieldMap='ResponseByUser'

/* Base View SQL for AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Requests
-- Item: vwAIAgentRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Agent Requests
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentRequest
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgentRequests]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentRequests]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    User_RequestForUserID.[Name] AS [RequestForUser],
    User_ResponseByUserID.[Name] AS [ResponseByUser]
FROM
    [${flyway:defaultSchema}].[AIAgentRequest] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_RequestForUserID
  ON
    [a].[RequestForUserID] = User_RequestForUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_ResponseByUserID
  ON
    [a].[ResponseByUserID] = User_ResponseByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRequests] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Requests
-- Item: Permissions for vwAIAgentRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRequests] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Requests
-- Item: spCreateAIAgentRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRequest
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgentRequest]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRequest]
    @AgentID uniqueidentifier,
    @RequestedAt datetime,
    @RequestForUserID uniqueidentifier,
    @Status nvarchar(20),
    @Request nvarchar(MAX),
    @Response nvarchar(MAX),
    @ResponseByUserID uniqueidentifier,
    @RespondedAt datetime,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIAgentRequest]
        (
            [AgentID],
            [RequestedAt],
            [RequestForUserID],
            [Status],
            [Request],
            [Response],
            [ResponseByUserID],
            [RespondedAt],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @AgentID,
            @RequestedAt,
            @RequestForUserID,
            @Status,
            @Request,
            @Response,
            @ResponseByUserID,
            @RespondedAt,
            @Comments
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentRequests] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRequest] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for AI Agent Requests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRequest] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Requests
-- Item: spUpdateAIAgentRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRequest
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgentRequest]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRequest]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @RequestedAt datetime,
    @RequestForUserID uniqueidentifier,
    @Status nvarchar(20),
    @Request nvarchar(MAX),
    @Response nvarchar(MAX),
    @ResponseByUserID uniqueidentifier,
    @RespondedAt datetime,
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRequest]
    SET
        [AgentID] = @AgentID,
        [RequestedAt] = @RequestedAt,
        [RequestForUserID] = @RequestForUserID,
        [Status] = @Status,
        [Request] = @Request,
        [Response] = @Response,
        [ResponseByUserID] = @ResponseByUserID,
        [RespondedAt] = @RespondedAt,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentRequests]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRequest] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the AIAgentRequest table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgentRequest
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentRequest
ON [${flyway:defaultSchema}].[AIAgentRequest]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRequest]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentRequest] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Agent Requests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRequest] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Requests
-- Item: spDeleteAIAgentRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRequest
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgentRequest]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRequest]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRequest]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRequest] TO [cdp_Integration]
    

/* spDelete Permissions for AI Agent Requests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRequest] TO [cdp_Integration]



/* SQL text to delete unneeded entity fields */
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'

/* SQL text to update existingg entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to insert new entity field */

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
         'b5569f04-cbf7-4660-8ba5-ca0d1eab75cf',
         'A24EF5EC-D32C-4A53-85A9-364E322451E6',
         11,
         'User',
         'User',
         NULL,
         'nvarchar',
         200,
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

/* SQL text to insert new entity field */

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
         '99ad5962-a952-4d4a-9b43-10aaae11a448',
         'F3C49FE2-B5D9-40D4-8562-6596261772A0',
         14,
         'RequestForUser',
         'Request For User',
         NULL,
         'nvarchar',
         200,
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

/* SQL text to insert new entity field */

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
         '206573b2-f307-4269-a4e9-196753ca82c0',
         'F3C49FE2-B5D9-40D4-8562-6596261772A0',
         15,
         'ResponseByUser',
         'Response By User',
         NULL,
         'nvarchar',
         200,
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

/* SQL text to set default column width where needed */
EXEC ${flyway:defaultSchema}.spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'

