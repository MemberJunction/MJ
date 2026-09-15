-- Save MJ: AI Prompt Templates (core SP call only)
DECLARE @ID_a1b2c3d4 UNIQUEIDENTIFIER,
@Name_a1b2c3d4 NVARCHAR(100)
SET
  @ID_a1b2c3d4 = 'F00DFACE-1234-4567-89AB-CDEF01234567'
SET
  @Name_a1b2c3d4 = N'Greeting' EXEC [${flyway:defaultSchema}].spCreateAIPromptTemplate @ID = @ID_a1b2c3d4,
  @Name = @Name_a1b2c3d4,
  @Template = N'Say hi; then say bye';

GO
