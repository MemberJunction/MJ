-- Fixes the missing stored procedure for creating AI Prompt Categories

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPromptCategory
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIPromptCategory]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptCategory]
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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptCategory] TO [cdp_Developer]