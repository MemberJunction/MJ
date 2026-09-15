DECLARE @ID_deadbeef UNIQUEIDENTIFIER
SET
  @ID_deadbeef = '11111111-2222-3333-4444-555555555555' EXEC [${flyway:defaultSchema}].spCreateNoSuchEntity @ID = @ID_deadbeef;

GO
