-- An IF NOT EXISTS that tests the RIGHT id against the WRONG table. This is not a weaker
-- guard, it is no guard at all: [AIAgent] never holds a CredentialType id, so the predicate
-- is always true, the create always runs, and it collides exactly as MJ#4503 describes.
-- The gate must treat it as absent and wrap the create properly.
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[AIAgent] WHERE [ID] = 'DDDDDDDD-4444-4444-8444-444444444444')
BEGIN
    EXEC [${flyway:defaultSchema}].spCreateCredentialType @ID = 'DDDDDDDD-4444-4444-8444-444444444444',
  @Name = 'Cross table guard';
END

GO
