-- The inline-initialiser DECLARE form. The GUID is fixed and collides exactly like the
-- emitter's DECLARE-then-SET pair does; only the syntax differs.
DECLARE @ID_ab12cd34 UNIQUEIDENTIFIER = 'DDDDDDDD-4444-4444-8444-444444444444',
        @Name_ab12cd34 NVARCHAR(100) = N'Inline declare';
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CredentialType] WHERE [ID] = @ID_ab12cd34)
BEGIN
    EXEC [${flyway:defaultSchema}].spCreateCredentialType @ID = @ID_ab12cd34,
  @Name = @Name_ab12cd34;
END
ELSE
BEGIN
    EXEC [${flyway:defaultSchema}].spUpdateCredentialType @ID = @ID_ab12cd34,
  @Name = @Name_ab12cd34;
END


GO
