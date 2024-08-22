-- Create views and stored procedures for the entities created in migration V202408091458__v2.3.x
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO


CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwAIPrompts]
AS
SELECT 
    a.*,
    Template_TemplateID.[Name] AS [Template],
    AIPromptCategory_CategoryID.[Name] AS [Category],
    AIPromptType_TypeID.[Name] AS [Type]
FROM
    [${flyway:defaultSchema}].[AIPrompt] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Template] AS Template_TemplateID
  ON
    [a].[TemplateID] = Template_TemplateID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptCategory] AS AIPromptCategory_CategoryID
  ON
    [a].[CategoryID] = AIPromptCategory_CategoryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIPromptType] AS AIPromptType_TypeID
  ON
    [a].[TypeID] = AIPromptType_TypeID.[ID]
GO


CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwAIResultCaches]
AS
SELECT 
    a.*,
    AIPrompt_AIPromptID.[Name] AS [AIPrompt],
    AIModel_AIModelID.[Name] AS [AIModel]
FROM
    [${flyway:defaultSchema}].[AIResultCache] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_AIPromptID
  ON
    [a].[AIPromptID] = AIPrompt_AIPromptID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_AIModelID
  ON
    [a].[AIModelID] = AIModel_AIModelID.[ID]
GO


CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwAIPromptCategories]
AS
SELECT 
    a.*,
    AIPromptCategory_ParentID.[Name] AS [Parent]
FROM
    [${flyway:defaultSchema}].[AIPromptCategory] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptCategory] AS AIPromptCategory_ParentID
  ON
    [a].[ParentID] = AIPromptCategory_ParentID.[ID]
GO

CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwAIPromptTypes]
AS
SELECT 
    a.*
FROM
    [${flyway:defaultSchema}].[AIPromptType] AS a
GO


CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].[spCreateAIPrompt]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TemplateID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @TypeID uniqueidentifier,
    @Status nvarchar(50),
    @CacheResults bit,
    @CacheExpiration decimal(10, 2)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [${flyway:defaultSchema}].[AIPrompt]
        (
            [Name],
            [Description],
            [TemplateID],
            [CategoryID],
            [TypeID],
            [Status],
            [CacheResults],
            [CacheExpiration]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @TemplateID,
            @CategoryID,
            @TypeID,
            @Status,
            @CacheResults,
            @CacheExpiration
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPrompts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO


CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptCategory]
    @Name nvarchar(255),
    @ParentID uniqueidentifier,
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [${flyway:defaultSchema}].[AIPromptCategory]
        (
            [Name],
            [ParentID],
            [Description]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @ParentID,
            @Description
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPromptCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO


CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptType]
    @Name nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [${flyway:defaultSchema}].[AIPromptType]
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
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPromptTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO


CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].[spCreateAIResultCache]
    @AIPromptID uniqueidentifier,
    @AIModelID uniqueidentifier,
    @RunAt datetimeoffset,
    @PromptText nvarchar(MAX),
    @ResultText nvarchar(MAX),
    @Status nvarchar(50),
    @ExpiredOn datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [${flyway:defaultSchema}].[AIResultCache]
        (
            [AIPromptID],
            [AIModelID],
            [RunAt],
            [PromptText],
            [ResultText],
            [Status],
            [ExpiredOn]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @AIPromptID,
            @AIModelID,
            @RunAt,
            @PromptText,
            @ResultText,
            @Status,
            @ExpiredOn
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIResultCaches] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO


CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPrompt]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [${flyway:defaultSchema}].[AIPrompt]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO


CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptCategory]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [${flyway:defaultSchema}].[AIPromptCategory]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO


CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptType]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [${flyway:defaultSchema}].[AIPromptType]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO


CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].[spDeleteAIResultCache]
    @ID uniqueidentifier
AS  
BEGIN
    SET NOCOUNT ON;

    DELETE FROM 
        [${flyway:defaultSchema}].[AIResultCache]
    WHERE 
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO


CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPrompt]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TemplateID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @TypeID uniqueidentifier,
    @Status nvarchar(50),
    @CacheResults bit,
    @CacheExpiration decimal(10, 2)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [${flyway:defaultSchema}].[AIPrompt]
    SET 
        [Name] = @Name,
        [Description] = @Description,
        [TemplateID] = @TemplateID,
        [CategoryID] = @CategoryID,
        [TypeID] = @TypeID,
        [Status] = @Status,
        [CacheResults] = @CacheResults,
        [CacheExpiration] = @CacheExpiration
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [${flyway:defaultSchema}].[vwAIPrompts] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPromptCategory]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @ParentID uniqueidentifier,
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [${flyway:defaultSchema}].[AIPromptCategory]
    SET 
        [Name] = @Name,
        [ParentID] = @ParentID,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [${flyway:defaultSchema}].[vwAIPromptCategories] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO


CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPromptType]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [${flyway:defaultSchema}].[AIPromptType]
    SET 
        [Name] = @Name,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [${flyway:defaultSchema}].[vwAIPromptTypes] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO


CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].[spUpdateAIResultCache]
    @ID uniqueidentifier,
    @AIPromptID uniqueidentifier,
    @AIModelID uniqueidentifier,
    @RunAt datetimeoffset,
    @PromptText nvarchar(MAX),
    @ResultText nvarchar(MAX),
    @Status nvarchar(50),
    @ExpiredOn datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE 
        [${flyway:defaultSchema}].[AIResultCache]
    SET 
        [AIPromptID] = @AIPromptID,
        [AIModelID] = @AIModelID,
        [RunAt] = @RunAt,
        [PromptText] = @PromptText,
        [ResultText] = @ResultText,
        [Status] = @Status,
        [ExpiredOn] = @ExpiredOn
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT 
                                        * 
                                    FROM 
                                        [${flyway:defaultSchema}].[vwAIResultCaches] 
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPrompts] TO [cdp_Integration], [cdp_Developer]
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptCategories] TO [cdp_Integration], [cdp_Developer]
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptTypes] TO [cdp_Integration], [cdp_Developer]
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIResultCaches] TO [cdp_Integration], [cdp_Developer]
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPrompt] TO [cdp_Integration], [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptCategory] TO [cdp_Integration], [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptType] TO [cdp_Integration], [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIResultCache] TO [cdp_Integration], [cdp_Developer]
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPrompt] TO [cdp_Integration], [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptCategory] TO [cdp_Integration], [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptType] TO [cdp_Integration], [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIResultCache] TO [cdp_Integration], [cdp_Developer]
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPrompt] TO [cdp_Integration], [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptCategory] TO [cdp_Integration], [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptType] TO [cdp_Integration], [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIResultCache] TO [cdp_Integration], [cdp_Developer]
GO



