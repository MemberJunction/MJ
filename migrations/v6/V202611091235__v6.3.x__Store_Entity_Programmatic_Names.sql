-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Store entity and field programmatic names instead of computing them on every read
--
-- vwEntities computed CodeName, ClassName and BaseTableCodeName, and vwEntityFields computed
-- FieldCodeName, by calling GetProgrammaticName / GetClassNameSchemaPrefix / StripToAlphanumeric
-- per row. Those functions loop character by character, so SQL Server cannot inline them and runs
-- the whole query single-threaded. vwEntityFields joins vwEntities twice, so every field row paid
-- for its entity's names again: the MJ metadata load spent most of its time here, and the cost grew
-- with the number of fields (about 10 s of CPU at 39,000 fields).
--
-- The names change only when an entity's Name, NameSuffix, BaseTable or SchemaName changes, a field
-- is renamed, or a schema's EntityNamePrefix or CanonicalSchemaName changes. They are now stored on
-- Entity and EntityField and recomputed by triggers on exactly those writes, so reads are plain
-- column reads. Triggers (rather than CodeGen) keep them current because several writers bypass
-- both CodeGen and the ORM: CodeGen's own raw INSERTs replayed from migrations, the SchemaInfo
-- refresh run on every migrate, and the OpenApp installer.
--
-- The formulas are unchanged: the triggers call the same functions the views called, so every
-- value is identical to what the views returned before this migration.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────────────────────
-- 1. Stored columns. Nullable: an AFTER trigger fills them, so the INSERT itself carries NULL.
-- ───────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE [${flyway:defaultSchema}].[Entity] ADD
    [CodeName] NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [ClassName] NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [BaseTableCodeName] NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[EntityField] ADD
    [FieldCodeName] NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Schema-prefixed programmatic name derived from the entity Name: GetClassNameSchemaPrefix(COALESCE(CanonicalSchemaName, SchemaName)) followed by the Name with the schema''s EntityNamePrefix and spaces removed. Maintained by trigger; read-only.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'CodeName';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Schema-prefixed programmatic class name used for TypeScript entity classes, Zod schemas and Angular form components: GetProgrammaticName(GetClassNameSchemaPrefix(COALESCE(CanonicalSchemaName, SchemaName)) + BaseTable + NameSuffix). Maintained by trigger; read-only.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'ClassName';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Programmatic name of the base table plus NameSuffix, without a schema prefix: GetProgrammaticName(BaseTable + NameSuffix). Used to name generated procedures and triggers. Maintained by trigger; read-only.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'BaseTableCodeName';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Programmatic name of the field: GetProgrammaticName of the Name with spaces removed. Maintained by trigger; read-only.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'EntityField',
    @level2type = N'COLUMN', @level2name = N'FieldCodeName';
GO


-- ───────────────────────────────────────────────────────────────────────────────────────────
-- 2. The one definition of the entity-level names, shared by the backfill and both triggers.
--    Inline, so a caller that joins it to a few rows only evaluates those rows.
-- ───────────────────────────────────────────────────────────────────────────────────────────
CREATE OR ALTER FUNCTION [${flyway:defaultSchema}].[GetEntityProgrammaticNames]()
RETURNS TABLE
AS
RETURN
    SELECT
        e.ID,
        [${flyway:defaultSchema}].GetProgrammaticName(
            [${flyway:defaultSchema}].GetClassNameSchemaPrefix(COALESCE(si.CanonicalSchemaName, e.SchemaName)) +
            REPLACE(
                IIF(si.EntityNamePrefix IS NOT NULL, REPLACE(e.Name, si.EntityNamePrefix, ''), e.Name),
                ' ',
                ''
            )
        ) AS CodeName,
        [${flyway:defaultSchema}].GetProgrammaticName(
            [${flyway:defaultSchema}].GetClassNameSchemaPrefix(COALESCE(si.CanonicalSchemaName, e.SchemaName)) +
            e.BaseTable +
            ISNULL(e.NameSuffix, '')
        ) AS ClassName,
        [${flyway:defaultSchema}].GetProgrammaticName(e.BaseTable + ISNULL(e.NameSuffix, '')) AS BaseTableCodeName
    FROM
        [${flyway:defaultSchema}].[Entity] e
    LEFT OUTER JOIN
        [${flyway:defaultSchema}].[SchemaInfo] si
    ON
        e.SchemaName = si.SchemaName;
GO


-- ───────────────────────────────────────────────────────────────────────────────────────────
-- 3. Backfill existing rows (before the triggers exist, so each row is written once).
-- ───────────────────────────────────────────────────────────────────────────────────────────
UPDATE e
SET
    e.CodeName = n.CodeName,
    e.ClassName = n.ClassName,
    e.BaseTableCodeName = n.BaseTableCodeName
FROM
    [${flyway:defaultSchema}].[Entity] e
INNER JOIN
    [${flyway:defaultSchema}].GetEntityProgrammaticNames() n ON n.ID = e.ID;
GO

UPDATE [${flyway:defaultSchema}].[EntityField]
SET FieldCodeName = [${flyway:defaultSchema}].GetProgrammaticName(REPLACE(Name, ' ', ''));
GO


-- ───────────────────────────────────────────────────────────────────────────────────────────
-- 4. Triggers. Each recomputes only the affected rows and writes only rows whose value changed,
--    compared case-sensitively so a case-only change (e.g. a new CanonicalSchemaName) is kept.
--    They also fire when a stored name column itself is written, so a direct write is replaced
--    by the computed value; their own write then fires them once more and changes nothing.
--    Names avoid CodeGen's trgUpdate<Table> pattern, which CodeGen drops and recreates.
-- ───────────────────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER [${flyway:defaultSchema}].[trgEntity_SyncProgrammaticNames]
ON [${flyway:defaultSchema}].[Entity]
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT (UPDATE(Name) OR UPDATE(NameSuffix) OR UPDATE(BaseTable) OR UPDATE(SchemaName)
            OR UPDATE(CodeName) OR UPDATE(ClassName) OR UPDATE(BaseTableCodeName))
        RETURN;

    UPDATE e
    SET
        e.CodeName = n.CodeName,
        e.ClassName = n.ClassName,
        e.BaseTableCodeName = n.BaseTableCodeName
    FROM
        [${flyway:defaultSchema}].[Entity] e
    INNER JOIN
        inserted i ON i.ID = e.ID
    INNER JOIN
        [${flyway:defaultSchema}].GetEntityProgrammaticNames() n ON n.ID = e.ID
    WHERE EXISTS (
        SELECT e.CodeName COLLATE Latin1_General_BIN2, e.ClassName COLLATE Latin1_General_BIN2, e.BaseTableCodeName COLLATE Latin1_General_BIN2
        EXCEPT
        SELECT n.CodeName COLLATE Latin1_General_BIN2, n.ClassName COLLATE Latin1_General_BIN2, n.BaseTableCodeName COLLATE Latin1_General_BIN2
    );
END;
GO

CREATE TRIGGER [${flyway:defaultSchema}].[trgSchemaInfo_SyncEntityProgrammaticNames]
ON [${flyway:defaultSchema}].[SchemaInfo]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (SELECT 1 FROM inserted) AND EXISTS (SELECT 1 FROM deleted)
       AND NOT (UPDATE(SchemaName) OR UPDATE(EntityNamePrefix) OR UPDATE(CanonicalSchemaName))
        RETURN;

    UPDATE e
    SET
        e.CodeName = n.CodeName,
        e.ClassName = n.ClassName,
        e.BaseTableCodeName = n.BaseTableCodeName
    FROM
        [${flyway:defaultSchema}].[Entity] e
    INNER JOIN
        [${flyway:defaultSchema}].GetEntityProgrammaticNames() n ON n.ID = e.ID
    WHERE
        e.SchemaName IN (SELECT SchemaName FROM inserted UNION SELECT SchemaName FROM deleted)
        AND EXISTS (
            SELECT e.CodeName COLLATE Latin1_General_BIN2, e.ClassName COLLATE Latin1_General_BIN2, e.BaseTableCodeName COLLATE Latin1_General_BIN2
            EXCEPT
            SELECT n.CodeName COLLATE Latin1_General_BIN2, n.ClassName COLLATE Latin1_General_BIN2, n.BaseTableCodeName COLLATE Latin1_General_BIN2
        );
END;
GO

CREATE TRIGGER [${flyway:defaultSchema}].[trgEntityField_SyncFieldCodeName]
ON [${flyway:defaultSchema}].[EntityField]
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT (UPDATE(Name) OR UPDATE(FieldCodeName))
        RETURN;

    UPDATE ef
    SET ef.FieldCodeName = c.FieldCodeName
    FROM
        [${flyway:defaultSchema}].[EntityField] ef
    INNER JOIN
        inserted i ON i.ID = ef.ID
    CROSS APPLY
        (SELECT [${flyway:defaultSchema}].GetProgrammaticName(REPLACE(ef.Name, ' ', '')) AS FieldCodeName) c
    WHERE EXISTS (
        SELECT ef.FieldCodeName COLLATE Latin1_General_BIN2
        EXCEPT
        SELECT c.FieldCodeName COLLATE Latin1_General_BIN2
    );
END;
GO


-- ───────────────────────────────────────────────────────────────────────────────────────────
-- 5. Views read the stored columns (now part of e.* / ef.*) instead of computing them.
-- ───────────────────────────────────────────────────────────────────────────────────────────
CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwEntities]
AS
SELECT
    e.*,
    par.Name ParentEntity,
    par.BaseTable ParentBaseTable,
    par.BaseView ParentBaseView,
    si.CanonicalSchemaName AS CanonicalSchemaName
FROM
    [${flyway:defaultSchema}].[Entity] e
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] par
ON
    e.ParentID = par.ID
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[SchemaInfo] si
ON
    e.SchemaName = si.SchemaName
GO

CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwEntityFields]
AS
SELECT
    ef.*,
    e.Name Entity,
    e.SchemaName,
    e.BaseTable,
    e.BaseView,
    e.CodeName EntityCodeName,
    e.ClassName EntityClassName,
    re.Name RelatedEntity,
    re.SchemaName RelatedEntitySchemaName,
    re.BaseTable RelatedEntityBaseTable,
    re.BaseView RelatedEntityBaseView,
    re.CodeName RelatedEntityCodeName,
    re.ClassName RelatedEntityClassName
FROM
    [${flyway:defaultSchema}].[EntityField] ef
INNER JOIN
    [${flyway:defaultSchema}].[vwEntities] e ON ef.EntityID = e.ID
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwEntities] re ON ef.RelatedEntityID = re.ID
GO

-- Views that read vwEntities / vwEntityFields: refresh their column bindings.
EXEC sp_refreshview '[${flyway:defaultSchema}].[vwEntitiesWithExternalChangeTracking]';
EXEC sp_refreshview '[${flyway:defaultSchema}].[vwEntitiesWithMissingBaseTables]';
EXEC sp_refreshview '[${flyway:defaultSchema}].[vwApplicationEntities]';
EXEC sp_refreshview '[${flyway:defaultSchema}].[vwEntityRelationships]';
EXEC sp_refreshview '[${flyway:defaultSchema}].[vwEntityFieldValues]';
EXEC sp_refreshview '[${flyway:defaultSchema}].[vwUserFavorites]';
GO
