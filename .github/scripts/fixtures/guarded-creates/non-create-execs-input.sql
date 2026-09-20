-- The counterweight to the walk: it now inspects EVERY EXEC in every migration, not only the
-- ones already shaped like a create, so ordinary calls must stay silent. A gate that raises on
-- `EXEC sp_executesql` is a gate nobody can keep green, and noisy-closed is still broken.
-- Covered here: a system proc, the EXEC(@sql) dynamic form, a return-status call to a proc
-- that is not a create, and a module name held in a variable — which no static tool can
-- resolve and which must therefore be passed over rather than raised on.
DECLARE @sql NVARCHAR(MAX) = N'SELECT 1';
DECLARE @rc INT;
DECLARE @procName NVARCHAR(128) = N'spCreateCredentialType';
EXEC sp_executesql @sql;
EXEC (@sql);
EXEC @rc = [${flyway:defaultSchema}].spUpdateCredentialType @ID = '77777777-1111-4111-8111-111111111111';
EXEC @procName;

GO
