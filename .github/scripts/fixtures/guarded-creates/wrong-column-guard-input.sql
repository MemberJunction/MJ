-- Right table, right value, WRONG column. idTest was unanchored on the left, so the `ID]` at
-- the tail of `[EntityID]` satisfied it — and in MJ that means EntityID, CategoryID, TemplateID
-- and ApplicationID all read as primary-key guards. A predicate on a foreign key says nothing
-- about whether THIS row exists, which is the one question the guard is asked. v6 already
-- carries six `WHERE [EntityID]` predicates, so this shape is repo vocabulary, not invention.
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CredentialType] WHERE [EntityID] = 'AAAAAAAA-1111-4111-8111-111111111111')
BEGIN
    EXEC [${flyway:defaultSchema}].spCreateCredentialType @ID = 'AAAAAAAA-1111-4111-8111-111111111111',
  @Name = 'Wrong column';
END

GO
