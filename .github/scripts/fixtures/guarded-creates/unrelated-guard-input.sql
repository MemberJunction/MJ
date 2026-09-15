-- An IF NOT EXISTS that has nothing to do with the create below it: a sys.columns probe
-- ahead of an ALTER TABLE, the single most common shape in migrations/v6 (38 of 64 files
-- contain one). The fixed-GUID create that follows it is completely unguarded.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE [name] = N'Foo'
               AND [object_id] = OBJECT_ID(N'[${flyway:defaultSchema}].[CredentialType]'))
    ALTER TABLE [${flyway:defaultSchema}].[CredentialType] ADD [Foo] NVARCHAR(10) NULL;

EXEC [${flyway:defaultSchema}].spCreateCredentialType @ID = 'CCCCCCCC-3333-4333-8333-333333333333',
  @Name = 'Unrelated guard';

GO
