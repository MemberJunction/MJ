-- A positional invocation carries its @ID as the first argument, so no `@ID =` appears
-- anywhere. The gate must not read "no named @ID" as "the SP defaults it, nothing to collide
-- with" — it cannot see the id, so it must refuse rather than pass.
EXEC [${flyway:defaultSchema}].spCreateCredentialType 'FFFFFFFF-6666-4666-8666-666666666666', N'Positional', N'd', N'Storage', N'{}';

GO
