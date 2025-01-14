------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AIAgents
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgent
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [__mj].[vwAIAgents]
GO

CREATE VIEW [__mj].[vwAIAgents]
AS
SELECT
    a.*
FROM
    [__mj].[AIAgent] AS a
GO
GRANT SELECT ON [__mj].[vwAIAgents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    


------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AIAgent Note Types
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentNoteType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [__mj].[vwAIAgentNoteTypes]
GO

CREATE VIEW [__mj].[vwAIAgentNoteTypes]
AS
SELECT
    a.*
FROM
    [__mj].[AIAgentNoteType] AS a
GO
GRANT SELECT ON [__mj].[vwAIAgentNoteTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AIAgent Notes
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentNote
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [__mj].[vwAIAgentNotes]
GO

CREATE VIEW [__mj].[vwAIAgentNotes]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    AIAgentNoteType_AgentNoteTypeID.[Name] AS [AgentNoteType]
FROM
    [__mj].[AIAgentNote] AS a
LEFT OUTER JOIN
    [__mj].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [__mj].[AIAgentNoteType] AS AIAgentNoteType_AgentNoteTypeID
  ON
    [a].[AgentNoteTypeID] = AIAgentNoteType_AgentNoteTypeID.[ID]
GO
GRANT SELECT ON [__mj].[vwAIAgentNotes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]


------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AIAgent Models
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentModel
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [__mj].[vwAIAgentModels]
GO

CREATE VIEW [__mj].[vwAIAgentModels]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    AIModel_ModelID.[Name] AS [Model]
FROM
    [__mj].[AIAgentModel] AS a
LEFT OUTER JOIN
    [__mj].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [__mj].[AIModel] AS AIModel_ModelID
  ON
    [a].[ModelID] = AIModel_ModelID.[ID]
GO
GRANT SELECT ON [__mj].[vwAIAgentModels] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AIAgent Actions
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentAction
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [__mj].[vwAIAgentActions]
GO
CREATE VIEW [__mj].[vwAIAgentActions]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    Action_ActionID.[Name] AS [Action]
FROM
    [__mj].[AIAgentAction] AS a
LEFT OUTER JOIN
    [__mj].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [__mj].[Action] AS Action_ActionID
  ON
    [a].[ActionID] = Action_ActionID.[ID]
GO
GRANT SELECT ON [__mj].[vwAIAgentActions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]






------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgent
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spCreateAIAgent]
GO

CREATE PROCEDURE [__mj].[spCreateAIAgent]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @LogoURL nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [__mj].[AIAgent]
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
    SELECT * FROM [__mj].[vwAIAgents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateAIAgent] TO [cdp_Developer], [cdp_Integration]



------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentAction
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spCreateAIAgentAction]
GO

CREATE PROCEDURE [__mj].[spCreateAIAgentAction]
    @AgentID uniqueidentifier,
    @ActionID uniqueidentifier,
    @Status nvarchar(15)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [__mj].[AIAgentAction]
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
    SELECT * FROM [__mj].[vwAIAgentActions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateAIAgentAction] TO [cdp_Developer], [cdp_Integration]
    

    
------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentModel
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spCreateAIAgentModel]
GO

CREATE PROCEDURE [__mj].[spCreateAIAgentModel]
    @AgentID uniqueidentifier,
    @ModelID uniqueidentifier,
    @Active bit,
    @Priority int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [__mj].[AIAgentModel]
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
    SELECT * FROM [__mj].[vwAIAgentModels] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateAIAgentModel] TO [cdp_Developer], [cdp_Integration]
    



------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentNoteType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spCreateAIAgentNoteType]
GO

CREATE PROCEDURE [__mj].[spCreateAIAgentNoteType]
    @Name nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [__mj].[AIAgentNoteType]
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
    SELECT * FROM [__mj].[vwAIAgentNoteTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateAIAgentNoteType] TO [cdp_Developer], [cdp_Integration]
        

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentNote
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spCreateAIAgentNote]
GO

CREATE PROCEDURE [__mj].[spCreateAIAgentNote]
    @AgentID uniqueidentifier,
    @AgentNoteTypeID uniqueidentifier,
    @Note nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [__mj].[AIAgentNote]
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
    SELECT * FROM [__mj].[vwAIAgentNotes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateAIAgentNote] TO [cdp_Developer], [cdp_Integration]
            



------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgent
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spDeleteAIAgent]
GO

CREATE PROCEDURE [__mj].[spDeleteAIAgent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [__mj].[AIAgent]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteAIAgent] TO [cdp_Integration]



------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentAction
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spDeleteAIAgentAction]
GO

CREATE PROCEDURE [__mj].[spDeleteAIAgentAction]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [__mj].[AIAgentAction]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteAIAgentAction] TO [cdp_Integration]
    
    
------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentModel
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spDeleteAIAgentModel]
GO

CREATE PROCEDURE [__mj].[spDeleteAIAgentModel]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [__mj].[AIAgentModel]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteAIAgentModel] TO [cdp_Integration]
    

    
------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentNote
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spDeleteAIAgentNote]
GO

CREATE PROCEDURE [__mj].[spDeleteAIAgentNote]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [__mj].[AIAgentNote]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteAIAgentNote] TO [cdp_Integration]
    

    
------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentNoteType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spDeleteAIAgentNoteType]
GO

CREATE PROCEDURE [__mj].[spDeleteAIAgentNoteType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [__mj].[AIAgentNoteType]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteAIAgentNoteType] TO [cdp_Integration]
    


------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgent
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spUpdateAIAgent]
GO

CREATE PROCEDURE [__mj].[spUpdateAIAgent]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @LogoURL nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[AIAgent]
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
                                        [__mj].[vwAIAgents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateAIAgent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgent table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [__mj].trgUpdateAIAgent
GO
CREATE TRIGGER [__mj].trgUpdateAIAgent
ON [__mj].[AIAgent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[AIAgent]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [__mj].[AIAgent] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentAction
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spUpdateAIAgentAction]
GO

CREATE PROCEDURE [__mj].[spUpdateAIAgentAction]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ActionID uniqueidentifier,
    @Status nvarchar(15)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[AIAgentAction]
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
                                        [__mj].[vwAIAgentActions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateAIAgentAction] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentAction table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [__mj].trgUpdateAIAgentAction
GO
CREATE TRIGGER [__mj].trgUpdateAIAgentAction
ON [__mj].[AIAgentAction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[AIAgentAction]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [__mj].[AIAgentAction] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        


------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentModel
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spUpdateAIAgentModel]
GO

CREATE PROCEDURE [__mj].[spUpdateAIAgentModel]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ModelID uniqueidentifier,
    @Active bit,
    @Priority int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[AIAgentModel]
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
                                        [__mj].[vwAIAgentModels]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateAIAgentModel] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentModel table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [__mj].trgUpdateAIAgentModel
GO
CREATE TRIGGER [__mj].trgUpdateAIAgentModel
ON [__mj].[AIAgentModel]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[AIAgentModel]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [__mj].[AIAgentModel] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentNote
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spUpdateAIAgentNote]
GO

CREATE PROCEDURE [__mj].[spUpdateAIAgentNote]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @AgentNoteTypeID uniqueidentifier,
    @Note nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[AIAgentNote]
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
                                        [__mj].[vwAIAgentNotes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateAIAgentNote] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentNote table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [__mj].trgUpdateAIAgentNote
GO
CREATE TRIGGER [__mj].trgUpdateAIAgentNote
ON [__mj].[AIAgentNote]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[AIAgentNote]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [__mj].[AIAgentNote] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
                        
                        
------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentNoteType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spUpdateAIAgentNoteType]
GO

CREATE PROCEDURE [__mj].[spUpdateAIAgentNoteType]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[AIAgentNoteType]
    SET
        [Name] = @Name,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [__mj].[vwAIAgentNoteTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateAIAgentNoteType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentNoteType table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [__mj].trgUpdateAIAgentNoteType
GO
CREATE TRIGGER [__mj].trgUpdateAIAgentNoteType
ON [__mj].[AIAgentNoteType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[AIAgentNoteType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [__mj].[AIAgentNoteType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        












-- QUERY ENTITY STUFF



------------------------------------------------------------
----- CREATE PROCEDURE FOR QueryEntity
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spCreateQueryEntity]
GO

CREATE PROCEDURE [__mj].[spCreateQueryEntity]
    @QueryID uniqueidentifier,
    @EntityID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [__mj].[QueryEntity]
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
    SELECT * FROM [__mj].[vwQueryEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateQueryEntity] TO [cdp_Developer], [cdp_Integration]
    
    
------------------------------------------------------------
----- DELETE PROCEDURE FOR QueryEntity
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spDeleteQueryEntity]
GO

CREATE PROCEDURE [__mj].[spDeleteQueryEntity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [__mj].[QueryEntity]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteQueryEntity] TO [cdp_Integration]
    


------------------------------------------------------------
----- UPDATE PROCEDURE FOR QueryEntity
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [__mj].[spUpdateQueryEntity]
GO

CREATE PROCEDURE [__mj].[spUpdateQueryEntity]
    @ID uniqueidentifier,
    @QueryID uniqueidentifier,
    @EntityID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[QueryEntity]
    SET
        [QueryID] = @QueryID,
        [EntityID] = @EntityID
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [__mj].[vwQueryEntities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateQueryEntity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the QueryEntity table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [__mj].trgUpdateQueryEntity
GO
CREATE TRIGGER [__mj].trgUpdateQueryEntity
ON [__mj].[QueryEntity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[QueryEntity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [__mj].[QueryEntity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Query Entities
-----               SCHEMA:      __mj
-----               BASE TABLE:  QueryEntity
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [__mj].[vwQueryEntities]
GO

CREATE VIEW [__mj].[vwQueryEntities]
AS
SELECT
    q.*,
    Query_QueryID.[Name] AS [Query],
    Entity_EntityID.[Name] AS [Entity]
FROM
    [__mj].[QueryEntity] AS q
INNER JOIN
    [__mj].[Query] AS Query_QueryID
  ON
    [q].[QueryID] = Query_QueryID.[ID]
INNER JOIN
    [__mj].[Entity] AS Entity_EntityID
  ON
    [q].[EntityID] = Entity_EntityID.[ID]
GO
GRANT SELECT ON [__mj].[vwQueryEntities] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    



---- AI AGENT LEARNING CYCLE STUFF

