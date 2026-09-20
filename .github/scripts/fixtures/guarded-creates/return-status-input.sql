-- `EXEC @rc = <proc>` is the return-status form, and it is ordinary T-SQL: the grammar is
-- EXEC[UTE] [ @return_status = ] [[[server.]database.]schema.]procedure. The recogniser
-- modelled the call as EXEC + optional one-level schema + spCreate<X> and nothing else, so
-- the assignment prefix matched neither pattern, the create was never seen, and the gate
-- printed "all guarded" over it. Detection is not enough here — the repair path must handle
-- it too, and must carry `@rc =` into BOTH branches or the ELSE silently stops capturing the
-- status the author asked for.
DECLARE @rc INT;
DECLARE @ID_rc UNIQUEIDENTIFIER = 'DDDDDDDD-6666-4666-8666-666666666666';
EXEC @rc = [${flyway:defaultSchema}].[spCreateCredentialType] @ID = @ID_rc,
  @Name = 'Return status';

GO
