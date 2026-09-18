-- A statement terminator is OPTIONAL in T-SQL, so this is a perfectly legal fixed-GUID
-- create. EXEC_RE ends its capture at the first ';', so without one the call is not matched
-- at all — and a create the parser never sees is reported as "all guarded" while it collides
-- exactly as MJ#4503 describes. The tool cannot know where the statement ends without a
-- terminator, and guessing a boundary is what the unbalanced-quote postcondition already
-- refuses to do, so the only safe answer is to refuse.
DECLARE @ID_nosemi UNIQUEIDENTIFIER = 'AAAAAAAA-7777-4777-8777-777777777777'
EXEC [${flyway:defaultSchema}].spCreateCredentialType @ID = @ID_nosemi, @Name = 'No terminator'

GO
