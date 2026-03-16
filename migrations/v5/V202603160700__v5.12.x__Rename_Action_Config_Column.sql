-- Rename Action.Config to ActionConfig to avoid clash with BaseEntity.Config() method.
-- The Actions-Integrations unification migration added a Config column to Actions,
-- but BaseEntity already has a Config() method. CodeGen generates a getter/setter
-- that conflicts with the base class method, causing TypeScript compilation failure.
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('${flyway:defaultSchema}.Action')
    AND name = 'Config'
)
BEGIN
    EXEC sp_rename '${flyway:defaultSchema}.Action.Config', 'ActionConfig', 'COLUMN';
END
