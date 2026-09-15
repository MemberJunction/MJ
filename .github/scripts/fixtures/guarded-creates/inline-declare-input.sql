-- The inline-initialiser DECLARE form. The GUID is fixed and collides exactly like the
-- emitter's DECLARE-then-SET pair does; only the syntax differs.
DECLARE @ID_ab12cd34 UNIQUEIDENTIFIER = 'DDDDDDDD-4444-4444-8444-444444444444',
        @Name_ab12cd34 NVARCHAR(100) = N'Inline declare';
EXEC [${flyway:defaultSchema}].spCreateCredentialType @ID = @ID_ab12cd34,
  @Name = @Name_ab12cd34;

GO
