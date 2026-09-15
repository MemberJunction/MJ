/************************************************************************************/
/***** MANUAL PATCH - two related seed rows added by hand in one batch, pre-dating
       the one-call-per-GO-batch convention the SQL logger now follows *****/
EXEC [${flyway:defaultSchema}].spCreateCredentialType @ID = 'AAAAAAAA-1111-4111-8111-111111111111',
  @Name = 'Type A';

EXEC [${flyway:defaultSchema}].spCreateCredentialType @ID = 'BBBBBBBB-2222-4222-8222-222222222222',
  @Name = 'Type B';
/** END MANUAL PATCH **/

GO
