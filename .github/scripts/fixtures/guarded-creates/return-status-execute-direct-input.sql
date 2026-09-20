-- The same return-status prefix, spelled with every other axis at its non-canonical end:
-- EXECUTE rather than EXEC, and the direct `__mj` schema rather than the Flyway placeholder.
-- Each axis was closed separately in an earlier round, which is exactly the pattern worth
-- pinning — a recogniser that handles each alone can still miss them combined. All three
-- spellings are the author's, so the rewrite must reproduce them rather than normalise them
-- to the canonical form.
DECLARE @rc INT;
DECLARE @ID_exec UNIQUEIDENTIFIER = 'CCCCCCCC-7777-4777-8777-777777777777';
EXECUTE @rc = [__mj].[spCreateCredentialType] @ID = @ID_exec,
  @Name = 'Execute keyword';

GO
