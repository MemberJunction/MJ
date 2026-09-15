-- Save MJ: Credential Types (core SP call only)
DECLARE @ID_8f85b67b UNIQUEIDENTIFIER,
@Name_8f85b67b NVARCHAR(100)
SET
  @ID_8f85b67b = '82DFF26B-2ABB-4A69-8718-1FE550B60816'
SET
  @Name_8f85b67b = N'Azure Blob Storage'
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CredentialType] WHERE [ID] = @ID_8f85b67b)
BEGIN
    EXEC [${flyway:defaultSchema}].spCreateCredentialType @ID = @ID_8f85b67b,
  @Name = @Name_8f85b67b;
END
ELSE
BEGIN
    EXEC [${flyway:defaultSchema}].spUpdateCredentialType @ID = @ID_8f85b67b,
  @Name = @Name_8f85b67b;
END


GO
