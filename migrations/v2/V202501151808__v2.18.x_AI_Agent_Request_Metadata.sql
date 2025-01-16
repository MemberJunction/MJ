/* SQL generated to create new entity AI Agent Requests */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         'f3c49fe2-b5d9-40d4-8562-6596261772a0',
         'AI Agent Requests',
         NULL,
         NULL,
         'AIAgentRequest',
         'vwAIAgentRequests',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new permission for entity AI Agent Requests for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f3c49fe2-b5d9-40d4-8562-6596261772a0', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity AI Agent Requests for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f3c49fe2-b5d9-40d4-8562-6596261772a0', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity AI Agent Requests for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f3c49fe2-b5d9-40d4-8562-6596261772a0', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to update existing entities from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to add special date field ${flyway:defaultSchema}_CreatedAt to entity ${flyway:defaultSchema}.AIAgentRequest */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentRequest] ADD ${flyway:defaultSchema}_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field ${flyway:defaultSchema}_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentRequest */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentRequest] ADD ${flyway:defaultSchema}_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

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
         '2aec7ef2-934a-4296-bf14-f98c9f9b5357',
         'F3C49FE2-B5D9-40D4-8562-6596261772A0',
         1,
         'ID',
         'ID',
         'Primary key for the AIAgentRequest table, uniquely identifies each record.',
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'newsequentialid()',
         0,
         0,
         0,
         NULL,
         NULL,
         0,
         1,
         0,
         1,
         1,
         1,
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
         '7825be5d-b314-4d44-9145-e8641009aa85',
         'F3C49FE2-B5D9-40D4-8562-6596261772A0',
         2,
         'AgentID',
         'Agent ID',
         'Foreign key referencing the ID column in the AIAgent table.',
         'uniqueidentifier',
         16,
         0,
         0,
         0,
         'null',
         0,
         1,
         0,
         'CDB135CC-6D3C-480B-90AE-25B7805F82C1',
         'ID',
         0,
         0,
         1,
         1,
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
         '949e0012-3ecd-4dbf-b66f-8a560da01da3',
         'F3C49FE2-B5D9-40D4-8562-6596261772A0',
         3,
         'RequestedAt',
         'Requested At',
         'Timestamp when the request was made by the agent.',
         'datetime',
         8,
         23,
         3,
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
         1,
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
         '49218650-7b04-4c4c-b109-a255d6627eab',
         'F3C49FE2-B5D9-40D4-8562-6596261772A0',
         4,
         'Status',
         'Status',
         'Current status of the request (Requested, Approved, Rejected, Canceled).',
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
         1,
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
         '50da67d1-bf71-4e90-9f16-74d359285ce5',
         'F3C49FE2-B5D9-40D4-8562-6596261772A0',
         5,
         'Request',
         'Request',
         'Details of what the AI Agent is requesting.',
         'nvarchar',
         -1,
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
         1,
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
         'fa548a7c-380a-41d7-8e62-1a43376f34f8',
         'F3C49FE2-B5D9-40D4-8562-6596261772A0',
         6,
         'Response',
         'Response',
         'Response provided by the human to the agent request.',
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
         '8ae9367c-44ff-4d15-84f9-8742882c3706',
         'F3C49FE2-B5D9-40D4-8562-6596261772A0',
         7,
         'RespondedAt',
         'Responded At',
         'Timestamp when the response was provided by the human.',
         'datetime',
         8,
         23,
         3,
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
         '15362783-b0ec-4cf6-8457-fb3adfafa4b2',
         'F3C49FE2-B5D9-40D4-8562-6596261772A0',
         8,
         'CreatedBy',
         'Created By',
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
         '9087f477-068b-4f38-9ee4-2c0b7bc65a90',
         'F3C49FE2-B5D9-40D4-8562-6596261772A0',
         9,
         'Comments',
         'Comments',
         'Additional comments about the request. Not shared with the agent, purely record keeping.',
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
         '75a2e62e-3914-48b6-9a31-e7728a1b92b0',
         'F3C49FE2-B5D9-40D4-8562-6596261772A0',
         10,
         '${flyway:defaultSchema}_CreatedAt',
         'Created At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
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
         '2bc4635d-0f49-43b5-8e7c-fb57c0d4f6b8',
         'F3C49FE2-B5D9-40D4-8562-6596261772A0',
         11,
         '${flyway:defaultSchema}_UpdatedAt',
         'Updated At',
         NULL,
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
         0,
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
         'a41e6bf9-7cc3-4b3a-aa78-a2c82de6ee75',
         'F3C49FE2-B5D9-40D4-8562-6596261772A0',
         12,
         'Agent',
         'Agent',
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

/* SQL text to set default column width where needed */
EXEC ${flyway:defaultSchema}.spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('49218650-7B04-4C4C-B109-A255D6627EAB', 1, 'Requested', 'Requested')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('49218650-7B04-4C4C-B109-A255D6627EAB', 2, 'Approved', 'Approved')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('49218650-7B04-4C4C-B109-A255D6627EAB', 3, 'Rejected', 'Rejected')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('49218650-7B04-4C4C-B109-A255D6627EAB', 4, 'Canceled', 'Canceled')

/* SQL text to update ValueListType for entity field ID 49218650-7B04-4C4C-B109-A255D6627EAB */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='49218650-7B04-4C4C-B109-A255D6627EAB'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=1 WHERE ID='BE51302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=3 WHERE ID='C051302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to create Entitiy Relationships */
INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                                          VALUES ('659f4a26-d4a8-4514-92d1-117cf28c83bc', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'F3C49FE2-B5D9-40D4-8562-6596261772A0', 'AgentID', 'One To Many', 1, 1, 'AI Agent Requests', 1);
                              

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

/* SQL text to update entity field related entity name field map for entity field ID 7825BE5D-B314-4D44-9145-E8641009AA85 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7825BE5D-B314-4D44-9145-E8641009AA85',
         @RelatedEntityNameFieldMap='Agent'

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
    AIAgent_AgentID.[Name] AS [Agent]
FROM
    [${flyway:defaultSchema}].[AIAgentRequest] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
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
    @AgentID uniqueidentifier = '00000000-0000-0000-0000-000000000000',
    @RequestedAt datetime,
    @Status nvarchar(20),
    @Request nvarchar(MAX),
    @Response nvarchar(MAX),
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
            [Status],
            [Request],
            [Response],
            [RespondedAt],
            [Comments]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            CASE @AgentID WHEN '00000000-0000-0000-0000-000000000000' THEN null ELSE @AgentID END,
            @RequestedAt,
            @Status,
            @Request,
            @Response,
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
    @Status nvarchar(20),
    @Request nvarchar(MAX),
    @Response nvarchar(MAX),
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
        [Status] = @Status,
        [Request] = @Request,
        [Response] = @Response,
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
         '4dacddc8-2461-4995-a2ca-469250521f44',
         'F3C49FE2-B5D9-40D4-8562-6596261772A0',
         4,
         'RequestForUserID',
         'Request For User ID',
         'Optional, a user that the AI specifically is directing the request to, if null intended for general system owner.',
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
         1,
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
         '3d9f4176-c838-47f2-8e96-e3d45b588fe6',
         'F3C49FE2-B5D9-40D4-8562-6596261772A0',
         8,
         'ResponseByUserID',
         'Response By User ID',
         'Populated when a user responds indicating which user responded to the request.',
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

