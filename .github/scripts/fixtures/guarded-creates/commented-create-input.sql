-- The backstop must recognise a create in CODE, not a mention of one in prose. All three
-- shapes below are inert text and must not raise: migrations/v6/V202608301800 really does
-- discuss `EXEC spCreateAIModelCost` inside a block comment, and a gate that refuses to run
-- because a comment mentions a proc is a gate nobody can keep green.
/*
    A block comment that names EXEC [${flyway:defaultSchema}].spCreateCredentialType in prose,
    the way a migration explains what it is deprecating.
*/
-- A line comment: EXEC [__mj].spCreateCredentialType @ID = 'not-real'
DECLARE @DynamicSql NVARCHAR(MAX) = N'EXEC [${flyway:defaultSchema}].spCreateCredentialType @ID = @x;';
DECLARE @ID_live UNIQUEIDENTIFIER = 'BBBBBBBB-8888-4888-8888-888888888888';
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CredentialType] WHERE [ID] = @ID_live)
BEGIN
    EXEC [${flyway:defaultSchema}].spCreateCredentialType @ID = @ID_live, @Name = 'Real one';
END
ELSE
BEGIN
    EXEC [${flyway:defaultSchema}].spUpdateCredentialType @ID = @ID_live, @Name = 'Real one';
END

GO
