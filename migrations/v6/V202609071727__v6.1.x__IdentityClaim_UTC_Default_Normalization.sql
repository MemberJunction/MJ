/*
    Normalize the __mj_CreatedAt / __mj_UpdatedAt defaults on IdentityClaim and IdentityClaimType
    to GETUTCDATE(), the default CodeGen expects on every MJ table.

    V202608202300 created these four columns with DEFAULT (SYSUTCDATETIME()). CodeGen compares the
    stored default against GETUTCDATE() by text, so on every run it drops and recreates all four
    constraints. That churn is harmless at run time but lands four consecutive
    `DECLARE @constraintName` blocks in the SQL log, and a migration built from that log fails on
    a fresh database with "The variable name '@constraintName' has already been declared"
    (v6.1.0-edge.4 / edge.5). CodeGen now separates those blocks; this migration removes the
    reason they were emitted at all.

    Idempotent: a database where CodeGen already rewrote the constraints (any name, GETUTCDATE()
    definition, however parenthesized) is left alone. Each column is its own batch so each DECLARE is scoped to its batch.
*/

DECLARE @constraintName NVARCHAR(255), @definition NVARCHAR(MAX);
SELECT @constraintName = d.name, @definition = d.definition
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id = s.schema_id
JOIN sys.columns c ON t.object_id = c.object_id
JOIN sys.default_constraints d ON c.default_object_id = d.object_id
WHERE s.name = '${flyway:defaultSchema}' AND t.name = 'IdentityClaimType' AND c.name = '__mj_CreatedAt';
IF @constraintName IS NULL OR REPLACE(REPLACE(LOWER(@definition), '(', ''), ')', '') <> 'getutcdate'
BEGIN
    IF @constraintName IS NOT NULL
    BEGIN
        SET @constraintName = QUOTENAME(@constraintName);
        EXEC('ALTER TABLE [${flyway:defaultSchema}].[IdentityClaimType] DROP CONSTRAINT ' + @constraintName);
    END
    ALTER TABLE [${flyway:defaultSchema}].[IdentityClaimType] ADD CONSTRAINT [DF_${flyway:defaultSchema}_IdentityClaimType___mj_CreatedAt] DEFAULT (GETUTCDATE()) FOR [__mj_CreatedAt];
END
GO

DECLARE @constraintName NVARCHAR(255), @definition NVARCHAR(MAX);
SELECT @constraintName = d.name, @definition = d.definition
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id = s.schema_id
JOIN sys.columns c ON t.object_id = c.object_id
JOIN sys.default_constraints d ON c.default_object_id = d.object_id
WHERE s.name = '${flyway:defaultSchema}' AND t.name = 'IdentityClaimType' AND c.name = '__mj_UpdatedAt';
IF @constraintName IS NULL OR REPLACE(REPLACE(LOWER(@definition), '(', ''), ')', '') <> 'getutcdate'
BEGIN
    IF @constraintName IS NOT NULL
    BEGIN
        SET @constraintName = QUOTENAME(@constraintName);
        EXEC('ALTER TABLE [${flyway:defaultSchema}].[IdentityClaimType] DROP CONSTRAINT ' + @constraintName);
    END
    ALTER TABLE [${flyway:defaultSchema}].[IdentityClaimType] ADD CONSTRAINT [DF_${flyway:defaultSchema}_IdentityClaimType___mj_UpdatedAt] DEFAULT (GETUTCDATE()) FOR [__mj_UpdatedAt];
END
GO

DECLARE @constraintName NVARCHAR(255), @definition NVARCHAR(MAX);
SELECT @constraintName = d.name, @definition = d.definition
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id = s.schema_id
JOIN sys.columns c ON t.object_id = c.object_id
JOIN sys.default_constraints d ON c.default_object_id = d.object_id
WHERE s.name = '${flyway:defaultSchema}' AND t.name = 'IdentityClaim' AND c.name = '__mj_CreatedAt';
IF @constraintName IS NULL OR REPLACE(REPLACE(LOWER(@definition), '(', ''), ')', '') <> 'getutcdate'
BEGIN
    IF @constraintName IS NOT NULL
    BEGIN
        SET @constraintName = QUOTENAME(@constraintName);
        EXEC('ALTER TABLE [${flyway:defaultSchema}].[IdentityClaim] DROP CONSTRAINT ' + @constraintName);
    END
    ALTER TABLE [${flyway:defaultSchema}].[IdentityClaim] ADD CONSTRAINT [DF_${flyway:defaultSchema}_IdentityClaim___mj_CreatedAt] DEFAULT (GETUTCDATE()) FOR [__mj_CreatedAt];
END
GO

DECLARE @constraintName NVARCHAR(255), @definition NVARCHAR(MAX);
SELECT @constraintName = d.name, @definition = d.definition
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id = s.schema_id
JOIN sys.columns c ON t.object_id = c.object_id
JOIN sys.default_constraints d ON c.default_object_id = d.object_id
WHERE s.name = '${flyway:defaultSchema}' AND t.name = 'IdentityClaim' AND c.name = '__mj_UpdatedAt';
IF @constraintName IS NULL OR REPLACE(REPLACE(LOWER(@definition), '(', ''), ')', '') <> 'getutcdate'
BEGIN
    IF @constraintName IS NOT NULL
    BEGIN
        SET @constraintName = QUOTENAME(@constraintName);
        EXEC('ALTER TABLE [${flyway:defaultSchema}].[IdentityClaim] DROP CONSTRAINT ' + @constraintName);
    END
    ALTER TABLE [${flyway:defaultSchema}].[IdentityClaim] ADD CONSTRAINT [DF_${flyway:defaultSchema}_IdentityClaim___mj_UpdatedAt] DEFAULT (GETUTCDATE()) FOR [__mj_UpdatedAt];
END
GO
