-- The direct `__mj` schema form. This is repo vocabulary, not a hypothetical:
-- migrations/v2/V202506131707 and V202506151907 both use it. It is fully parseable — only
-- EXEC_RE refused it, while buildProcTableMap and isGuardedFor's tableTest have always
-- accepted both spellings. Being unmatched, the create was invisible to the gate AND to
-- --fix. It must be guarded like any other, keeping the author's own schema spelling.
DECLARE @ID_direct UNIQUEIDENTIFIER = 'EEEEEEEE-5555-4555-8555-555555555555';
IF NOT EXISTS (SELECT 1 FROM [__mj].[CredentialType] WHERE [ID] = @ID_direct)
BEGIN
    EXEC [__mj].spCreateCredentialType @ID = @ID_direct,
  @Name = 'Direct schema';
END
ELSE
BEGIN
    EXEC [__mj].spUpdateCredentialType @ID = @ID_direct,
  @Name = 'Direct schema';
END


GO
