-- The guard's block is CLOSED before the create, so the IF governs the PRINT and nothing else.
-- isGuardedFor only asked whether a matching IF NOT EXISTS appeared earlier in the batch, never
-- whether the create sits inside it, so this read as guarded: the create runs unconditionally
-- and collides exactly as MJ#4503 describes, while the gate reports it guarded and --fix
-- declines to repair it. A predicate that does not govern the statement is not a guard.
DECLARE @ID_early UNIQUEIDENTIFIER = 'CCCCCCCC-9999-4999-8999-999999999999';
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CredentialType] WHERE [ID] = @ID_early)
BEGIN
    PRINT 'row is absent';
END
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[CredentialType] WHERE [ID] = @ID_early)
BEGIN
    EXEC [${flyway:defaultSchema}].spCreateCredentialType @ID = @ID_early,
  @Name = 'Closed early';
END
ELSE
BEGIN
    EXEC [${flyway:defaultSchema}].spUpdateCredentialType @ID = @ID_early,
  @Name = 'Closed early';
END


GO
