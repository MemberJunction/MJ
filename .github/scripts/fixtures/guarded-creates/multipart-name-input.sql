-- A three-part name. T-SQL allows [[[server.]database.]schema.]procedure, and the recogniser
-- admitted exactly one qualifier level, so this create matched nothing and passed the gate
-- silently — the same fail-open as the return-status prefix, one grammar production over.
-- Refusing rather than guarding is deliberate: the guard's own SELECT would have to name the
-- table in that other database, this tool has never emitted such a thing, and a guard reading
-- the wrong database is a guard that is never true.
DECLARE @ID_multipart UNIQUEIDENTIFIER = 'BBBBBBBB-9999-4999-8999-999999999999';
EXEC [MJ_Dev].[__mj].[spCreateCredentialType] @ID = @ID_multipart,
  @Name = 'Three part name';

GO
