/************************************************************************************/
/***** MANUAL PATCH - two related seed rows added by hand in one batch, pre-dating
       the one-call-per-GO-batch convention the SQL logger now follows *****/
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CredentialType] WHERE [ID] = 'AAAAAAAA-1111-4111-8111-111111111111')
BEGIN
    EXEC [${flyway:defaultSchema}].spCreateCredentialType @ID = 'AAAAAAAA-1111-4111-8111-111111111111',
  @Name = 'Type A';
END
ELSE
BEGIN
    EXEC [${flyway:defaultSchema}].spUpdateCredentialType @ID = 'AAAAAAAA-1111-4111-8111-111111111111',
  @Name = 'Type A';
END

IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CredentialType] WHERE [ID] = 'BBBBBBBB-2222-4222-8222-222222222222')
BEGIN
    EXEC [${flyway:defaultSchema}].spCreateCredentialType @ID = 'BBBBBBBB-2222-4222-8222-222222222222',
  @Name = 'Type B';
END
ELSE
BEGIN
    EXEC [${flyway:defaultSchema}].spUpdateCredentialType @ID = 'BBBBBBBB-2222-4222-8222-222222222222',
  @Name = 'Type B';
END

/** END MANUAL PATCH **/

GO
