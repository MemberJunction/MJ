-- Save MJ: Foo Bars (core SP call only)
DECLARE @ID_1234abcd UNIQUEIDENTIFIER,
@Name_1234abcd NVARCHAR(50)
SET
  @ID_1234abcd = 'DEADBEEF-1234-4EEF-8EAD-BEEFDEADBEEF'
SET
  @Name_1234abcd = N'Sample FooBar' EXEC [${flyway:defaultSchema}].spCreateFooBar @ID = @ID_1234abcd,
  @Name = @Name_1234abcd;

GO
