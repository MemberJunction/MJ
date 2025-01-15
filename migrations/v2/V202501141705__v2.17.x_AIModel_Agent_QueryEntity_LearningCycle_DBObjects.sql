------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AIAgents
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgent
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgents]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgents]
AS
SELECT
    a.*
FROM
    [${flyway:defaultSchema}].[AIAgent] AS a
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]



------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AIAgent Note Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentNoteType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgentNoteTypes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentNoteTypes]
AS
SELECT
    a.*
FROM
    [${flyway:defaultSchema}].[AIAgentNoteType] AS a
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentNoteTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]


------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AIAgent Notes
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
    AIAgentNoteType_AgentNoteTypeID.[Name] AS [AgentNoteType]
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
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentNotes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]


------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AIAgent Models
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentModel
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgentModels]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentModels]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    AIModel_ModelID.[Name] AS [Model]
FROM
    [${flyway:defaultSchema}].[AIAgentModel] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_ModelID
  ON
    [a].[ModelID] = AIModel_ModelID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentModels] TO [cdp_UI], [cdp_Developer], [cdp_Integration]


------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AIAgent Actions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentAction
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgentActions]
GO
CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentActions]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    Action_ActionID.[Name] AS [Action]
FROM
    [${flyway:defaultSchema}].[AIAgentAction] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Action] AS Action_ActionID
  ON
    [a].[ActionID] = Action_ActionID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentActions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]






------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgent
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgent]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgent]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @LogoURL nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIAgent]
        (
            [Name],
            [Description],
            [LogoURL]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @LogoURL
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgent] TO [cdp_Developer], [cdp_Integration]



------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentAction
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgentAction]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentAction]
    @AgentID uniqueidentifier,
    @ActionID uniqueidentifier,
    @Status nvarchar(15)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIAgentAction]
        (
            [AgentID],
            [ActionID],
            [Status]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @AgentID,
            @ActionID,
            @Status
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentActions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentAction] TO [cdp_Developer], [cdp_Integration]



------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentModel
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgentModel]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentModel]
    @AgentID uniqueidentifier,
    @ModelID uniqueidentifier,
    @Active bit,
    @Priority int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIAgentModel]
        (
            [AgentID],
            [ModelID],
            [Active],
            [Priority]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @AgentID,
            @ModelID,
            @Active,
            @Priority
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentModels] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentModel] TO [cdp_Developer], [cdp_Integration]




------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentNoteType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgentNoteType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentNoteType]
    @Name nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIAgentNoteType]
        (
            [Name],
            [Description]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentNoteTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentNoteType] TO [cdp_Developer], [cdp_Integration]


------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentNote
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgentNote]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentNote]
    @AgentID uniqueidentifier,
    @AgentNoteTypeID uniqueidentifier,
    @Note nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIAgentNote]
        (
            [AgentID],
            [AgentNoteTypeID],
            [Note]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @AgentID,
            @AgentNoteTypeID,
            @Note
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentNotes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentNote] TO [cdp_Developer], [cdp_Integration]




------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgent
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgent]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgent]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Integration]



------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentAction
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgentAction]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentAction]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentAction]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentAction] TO [cdp_Integration]


------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentModel
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgentModel]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentModel]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentModel]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentModel] TO [cdp_Integration]



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



------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentNoteType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgentNoteType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentNoteType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentNoteType]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentNoteType] TO [cdp_Integration]



------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgent
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgent]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgent]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @LogoURL nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgent]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [LogoURL] = @LogoURL
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgents]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgent table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgent
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgent
ON [${flyway:defaultSchema}].[AIAgent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgent]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgent] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentAction
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgentAction]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentAction]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ActionID uniqueidentifier,
    @Status nvarchar(15)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentAction]
    SET
        [AgentID] = @AgentID,
        [ActionID] = @ActionID,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentActions]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentAction] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentAction table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgentAction
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentAction
ON [${flyway:defaultSchema}].[AIAgentAction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentAction]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentAction] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO



------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentModel
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgentModel]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentModel]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ModelID uniqueidentifier,
    @Active bit,
    @Priority int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentModel]
    SET
        [AgentID] = @AgentID,
        [ModelID] = @ModelID,
        [Active] = @Active,
        [Priority] = @Priority
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentModels]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentModel] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentModel table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgentModel
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentModel
ON [${flyway:defaultSchema}].[AIAgentModel]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentModel]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentModel] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentNote
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgentNote]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentNote]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @AgentNoteTypeID uniqueidentifier,
    @Note nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentNote]
    SET
        [AgentID] = @AgentID,
        [AgentNoteTypeID] = @AgentNoteTypeID,
        [Note] = @Note
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
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentNote table
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
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentNote] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentNoteType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgentNoteType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentNoteType]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentNoteType]
    SET
        [Name] = @Name,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentNoteTypes]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentNoteType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentNoteType table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgentNoteType
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentNoteType
ON [${flyway:defaultSchema}].[AIAgentNoteType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentNoteType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentNoteType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO













-- QUERY ENTITY STUFF



------------------------------------------------------------
----- CREATE PROCEDURE FOR QueryEntity
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateQueryEntity]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQueryEntity]
    @QueryID uniqueidentifier,
    @EntityID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[QueryEntity]
        (
            [QueryID],
            [EntityID]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @QueryID,
            @EntityID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwQueryEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueryEntity] TO [cdp_Developer], [cdp_Integration]


------------------------------------------------------------
----- DELETE PROCEDURE FOR QueryEntity
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteQueryEntity]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteQueryEntity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[QueryEntity]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteQueryEntity] TO [cdp_Integration]



------------------------------------------------------------
----- UPDATE PROCEDURE FOR QueryEntity
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateQueryEntity]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQueryEntity]
    @ID uniqueidentifier,
    @QueryID uniqueidentifier,
    @EntityID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueryEntity]
    SET
        [QueryID] = @QueryID,
        [EntityID] = @EntityID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwQueryEntities]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueryEntity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the QueryEntity table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateQueryEntity
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateQueryEntity
ON [${flyway:defaultSchema}].[QueryEntity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueryEntity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[QueryEntity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Query Entities
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  QueryEntity
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwQueryEntities]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwQueryEntities]
AS
SELECT
    q.*,
    Query_QueryID.[Name] AS [Query],
    Entity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[QueryEntity] AS q
INNER JOIN
    [${flyway:defaultSchema}].[Query] AS Query_QueryID
  ON
    [q].[QueryID] = Query_QueryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS Entity_EntityID
  ON
    [q].[EntityID] = Entity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwQueryEntities] TO [cdp_UI], [cdp_Developer], [cdp_Integration]



/**************************************************************************
 **************************************************************************
 **************************************************************************
 **************************************************************************
 **************************************************************************

 AI AGENT LEARNING CYCLE STUFF

 **************************************************************************
 **************************************************************************
 **************************************************************************
 **************************************************************************
 **************************************************************************/





/* SQL generated to create new entity AIAgent Learning Cycles */

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
         '96a815c7-49e4-4794-8739-dc5a2d3b2d9c',
         'AIAgent Learning Cycles',
         NULL,
         NULL,
         'AIAgentLearningCycle',
         'vwAIAgentLearningCycles',
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


/* SQL generated to add new permission for entity AIAgent Learning Cycles for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('96a815c7-49e4-4794-8739-dc5a2d3b2d9c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity AIAgent Learning Cycles for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('96a815c7-49e4-4794-8739-dc5a2d3b2d9c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity AIAgent Learning Cycles for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('96a815c7-49e4-4794-8739-dc5a2d3b2d9c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         'e657301b-c4da-4fe0-a779-5928b333159c',
         '96A815C7-49E4-4794-8739-DC5A2D3B2D9C',
         1,
         'ID',
         'ID',
         'Unique identifier for the learning cycle.',
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
         'ae488b17-64d4-4bbd-aba6-8c4f4f684a47',
         '96A815C7-49E4-4794-8739-DC5A2D3B2D9C',
         2,
         'AgentID',
         'Agent ID',
         'Identifier for the AI Agent associated with this learning cycle.',
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
         'f541ff9b-9c7a-4026-8f61-ee9a1060cb29',
         '96A815C7-49E4-4794-8739-DC5A2D3B2D9C',
         3,
         'StartedAt',
         'Started At',
         'Timestamp indicating when the learning cycle started.',
         'datetimeoffset',
         10,
         34,
         7,
         0,
         'getutcdate()',
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
         '18a56e3b-3de5-4d0b-8c41-9980595e1de1',
         '96A815C7-49E4-4794-8739-DC5A2D3B2D9C',
         4,
         'EndedAt',
         'Ended At',
         'Timestamp indicating when the learning cycle ended.',
         'datetimeoffset',
         10,
         34,
         7,
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
         '0b4be8eb-0560-48d4-ae4f-828b7d688cd1',
         '96A815C7-49E4-4794-8739-DC5A2D3B2D9C',
         5,
         'Status',
         'Status',
         'Status of the learning cycle (In-Progress, Complete, or Failed).',
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
         'ef24fe2e-3dd5-4dd6-9b1e-8a0768dfab24',
         '96A815C7-49E4-4794-8739-DC5A2D3B2D9C',
         6,
         'AgentSummary',
         'Agent Summary',
         'Text summary provided by the agent about what it learned and any changes it requested for stored metadata.',
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
         '92445a33-f4fc-4340-8fcf-77c9597919cf',
         '96A815C7-49E4-4794-8739-DC5A2D3B2D9C',
         7,
         '__mj_CreatedAt',
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
         '35b915c4-c17f-4491-90a5-fbe1c6b3026f',
         '96A815C7-49E4-4794-8739-DC5A2D3B2D9C',
         8,
         '__mj_UpdatedAt',
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
         'daa400e5-a6c3-43b0-87d5-7f330fffa9af',
         '96A815C7-49E4-4794-8739-DC5A2D3B2D9C',
         9,
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
                                       ('0B4BE8EB-0560-48D4-AE4F-828B7D688CD1', 1, 'In-Progress', 'In-Progress')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('0B4BE8EB-0560-48D4-AE4F-828B7D688CD1', 2, 'Complete', 'Complete')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('0B4BE8EB-0560-48D4-AE4F-828B7D688CD1', 3, 'Failed', 'Failed')

/* SQL text to update ValueListType for entity field ID 0B4BE8EB-0560-48D4-AE4F-828B7D688CD1 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='0B4BE8EB-0560-48D4-AE4F-828B7D688CD1'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=1 WHERE ID='BE51302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=3 WHERE ID='C051302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to create Entitiy Relationships */
INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                                          VALUES ('4b2736bf-88e7-4511-a871-2eac712d27b5', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', '96A815C7-49E4-4794-8739-DC5A2D3B2D9C', 'AgentID', 'One To Many', 1, 1, 'AIAgent Learning Cycles', 1);


/* Index for Foreign Keys for AIAgentLearningCycle */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AIAgent Learning Cycles
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentLearningCycle
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentLearningCycle_AgentID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentLearningCycle]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentLearningCycle_AgentID ON [${flyway:defaultSchema}].[AIAgentLearningCycle] ([AgentID]);

/* SQL text to update entity field related entity name field map for entity field ID AE488B17-64D4-4BBD-ABA6-8C4F4F684A47 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='AE488B17-64D4-4BBD-ABA6-8C4F4F684A47',
         @RelatedEntityNameFieldMap='Agent'

/* Base View SQL for AIAgent Learning Cycles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AIAgent Learning Cycles
-- Item: vwAIAgentLearningCycles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AIAgent Learning Cycles
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentLearningCycle
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgentLearningCycles]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentLearningCycles]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent]
FROM
    [${flyway:defaultSchema}].[AIAgentLearningCycle] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentLearningCycles] TO [cdp_UI], [cdp_Developer], [cdp_Integration]


/* Base View Permissions SQL for AIAgent Learning Cycles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AIAgent Learning Cycles
-- Item: Permissions for vwAIAgentLearningCycles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentLearningCycles] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for AIAgent Learning Cycles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AIAgent Learning Cycles
-- Item: spCreateAIAgentLearningCycle
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentLearningCycle
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgentLearningCycle]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentLearningCycle]
    @AgentID uniqueidentifier = '00000000-0000-0000-0000-000000000000',
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Status nvarchar(20),
    @AgentSummary nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[AIAgentLearningCycle]
        (
            [AgentID],
            [StartedAt],
            [EndedAt],
            [Status],
            [AgentSummary]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            CASE @AgentID WHEN '00000000-0000-0000-0000-000000000000' THEN null ELSE @AgentID END,
            @StartedAt,
            @EndedAt,
            @Status,
            @AgentSummary
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentLearningCycles] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentLearningCycle] TO [cdp_Developer], [cdp_Integration]


/* spCreate Permissions for AIAgent Learning Cycles */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentLearningCycle] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for AIAgent Learning Cycles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AIAgent Learning Cycles
-- Item: spUpdateAIAgentLearningCycle
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentLearningCycle
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgentLearningCycle]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentLearningCycle]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @Status nvarchar(20),
    @AgentSummary nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentLearningCycle]
    SET
        [AgentID] = @AgentID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [Status] = @Status,
        [AgentSummary] = @AgentSummary
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentLearningCycles]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentLearningCycle] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentLearningCycle table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgentLearningCycle
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentLearningCycle
ON [${flyway:defaultSchema}].[AIAgentLearningCycle]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentLearningCycle]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentLearningCycle] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for AIAgent Learning Cycles */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentLearningCycle] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for AIAgent Learning Cycles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AIAgent Learning Cycles
-- Item: spDeleteAIAgentLearningCycle
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentLearningCycle
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgentLearningCycle]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentLearningCycle]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentLearningCycle]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentLearningCycle] TO [cdp_Integration]


/* spDelete Permissions for AIAgent Learning Cycles */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentLearningCycle] TO [cdp_Integration]



/* SQL text to delete unneeded entity fields */
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'

/* SQL text to update existingg entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to set default column width where needed */
EXEC ${flyway:defaultSchema}.spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'


