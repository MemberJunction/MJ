-- `SELECT @x = '<guid>'` is ordinary T-SQL and assigns a literal exactly as SET does. The gate
-- must treat this as a fixed-GUID create, not report it as "computed — cannot collide
-- deterministically", which is the opposite of the truth.
DECLARE @ID_sel UNIQUEIDENTIFIER;
SELECT @ID_sel = 'EEEEEEEE-5555-4555-8555-555555555555';
EXEC [${flyway:defaultSchema}].spCreateCredentialType @ID = @ID_sel,
  @Name = 'Select assigned';

GO
