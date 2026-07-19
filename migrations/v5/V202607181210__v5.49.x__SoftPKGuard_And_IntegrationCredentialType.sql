-- =============================================================================
-- RSU-spec alignment — consolidated migration.
-- Folds two INDEPENDENT, order-independent changes into a single file:
--   §1 (U2): SQL Server soft-PK guard in spUpdateExistingEntityFieldsFromSchema
--   §2 (D1): IntegrationCredentialType junction table + seed ("one or more"
--            credential types per integration)
-- Neither depends on the other; they were previously two separate migration
-- files (V202607181200 + V202607181210) and are combined here 1:1 with no
-- change to their SQL.
-- =============================================================================


-- =============================================================================
-- §1 (U2) — soft-PK guard for spUpdateExistingEntityFieldsFromSchema.
--
-- A SOFT primary key (EntityField.IsSoftPrimaryKey = 1, resolved from additionalSchemaInfo for
-- integration tables) has NO physical PK/UNIQUE constraint in the database. The schema-sync
-- sproc compared IsPrimaryKey/IsUnique against the PHYSICAL constraint catalog unconditionally,
-- so every run (a) flagged each soft-PK field as a material change and (b) overwrote
-- IsPrimaryKey/IsUnique back to 0 — wiping the resolved soft PK (the ACGI keyless-entity root)
-- despite the documented IsSoftPrimaryKey protection.
--
-- Fix: soft-PK rows are excluded from the PK/unique material-change predicate and their
-- IsPrimaryKey/IsUnique values are frozen in the UPDATE. All other attributes still sync.
-- (The PostgreSQL function receives the same guard via the CodeGenLib emitter, which
-- re-creates it on every codegen run.)
-- =============================================================================

CREATE OR ALTER PROC [${flyway:defaultSchema}].[spUpdateExistingEntityFieldsFromSchema]
    @ExcludedSchemaNames NVARCHAR(MAX),
    @EntityIDs NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ExcludedSchemas TABLE (SchemaName NVARCHAR(255));
    INSERT INTO @ExcludedSchemas(SchemaName)
    SELECT TRIM(value) FROM STRING_SPLIT(@ExcludedSchemaNames, ',');

    -- Materialize the optional entity scope list once (see spDeleteUnneededEntityFields
    -- header comment in V202604261352 for rationale). @IsScoped collapses the WHERE
    -- branch to a cheap int compare on the unscoped path.
    DECLARE @ScopedEntityIDs TABLE (EntityID UNIQUEIDENTIFIER PRIMARY KEY);
    DECLARE @IsScoped BIT = 0;
    IF @EntityIDs IS NOT NULL AND LEN(@EntityIDs) > 0
    BEGIN
        INSERT INTO @ScopedEntityIDs (EntityID)
        SELECT DISTINCT TRY_CONVERT(UNIQUEIDENTIFIER, LTRIM(RTRIM(value)))
        FROM STRING_SPLIT(@EntityIDs, ',')
        WHERE LTRIM(RTRIM(value)) <> ''
          AND TRY_CONVERT(UNIQUEIDENTIFIER, LTRIM(RTRIM(value))) IS NOT NULL;
        IF EXISTS (SELECT 1 FROM @ScopedEntityIDs) SET @IsScoped = 1;
    END

    DECLARE @FilteredRows TABLE (
        EntityID UNIQUEIDENTIFIER,
        EntityName NVARCHAR(500),
        EntityFieldID UNIQUEIDENTIFIER,
        EntityFieldName NVARCHAR(500),
        AutoUpdateDescription BIT,
        ExistingDescription NVARCHAR(MAX),
        SQLDescription NVARCHAR(MAX),
        Type NVARCHAR(255),
        Length INT,
        Precision INT,
        Scale INT,
        AllowsNull BIT,
        DefaultValue NVARCHAR(MAX),
        AutoIncrement BIT,
        IsVirtual BIT,
        IsComputed BIT,
        Sequence INT,
        RelatedEntityID UNIQUEIDENTIFIER,
        RelatedEntityFieldName NVARCHAR(255),
        IsPrimaryKey BIT,
        IsUnique BIT
    );

    INSERT INTO @FilteredRows
    SELECT
        e.ID as EntityID,
        e.Name as EntityName,
        ef.ID AS EntityFieldID,
        ef.Name as EntityFieldName,
        ef.AutoUpdateDescription,
        ef.Description AS ExistingDescription,
        CONVERT(nvarchar(max),fromSQL.Description) AS SQLDescription,
        fromSQL.Type,
        fromSQL.Length,
        fromSQL.Precision,
        fromSQL.Scale,
        fromSQL.AllowsNull,
        CONVERT(nvarchar(max),fromSQL.DefaultValue),
        fromSQL.AutoIncrement,
        fromSQL.IsVirtual,
        fromSQL.IsComputed,
        fromSQL.Sequence,
        re.ID AS RelatedEntityID,
        fk.referenced_column AS RelatedEntityFieldName,
        -- U2 soft-PK guard: carry the FROZEN flags for soft-PK rows so the UPDATE + the
        -- returned rowset both preserve them; physical rows keep the catalog-derived values.
        CASE WHEN ef.IsSoftPrimaryKey = 1 THEN ef.IsPrimaryKey
             WHEN pk.ColumnName IS NOT NULL THEN 1 ELSE 0 END AS IsPrimaryKey,
        CASE WHEN ef.IsSoftPrimaryKey = 1 THEN ef.IsUnique
             WHEN pk.ColumnName IS NOT NULL THEN 1
             ELSE CASE WHEN uk.ColumnName IS NOT NULL THEN 1 ELSE 0 END
        END AS IsUnique
    FROM
        [${flyway:defaultSchema}].EntityField ef
    INNER JOIN
        [${flyway:defaultSchema}].vwSQLColumnsAndEntityFields fromSQL
        ON ef.EntityID = fromSQL.EntityID AND ef.Name = fromSQL.FieldName
    INNER JOIN
        [${flyway:defaultSchema}].Entity e ON ef.EntityID = e.ID
    LEFT OUTER JOIN
        [${flyway:defaultSchema}].vwForeignKeys fk
        ON ef.Name = fk.[column]
           AND e.BaseTable = fk.[table]
           AND e.SchemaName = fk.[schema_name]
    LEFT OUTER JOIN
        [${flyway:defaultSchema}].Entity re
        ON re.BaseTable = fk.referenced_table AND re.SchemaName = fk.[referenced_schema]
    LEFT OUTER JOIN
        [${flyway:defaultSchema}].vwTablePrimaryKeys pk
        ON e.BaseTable = pk.TableName AND ef.Name = pk.ColumnName AND e.SchemaName = pk.SchemaName
    LEFT OUTER JOIN
        [${flyway:defaultSchema}].vwTableUniqueKeys uk
        ON e.BaseTable = uk.TableName AND ef.Name = uk.ColumnName AND e.SchemaName = uk.SchemaName
    LEFT OUTER JOIN
        @ExcludedSchemas excludedSchemas ON e.SchemaName = excludedSchemas.SchemaName
    WHERE
        e.VirtualEntity = 0
        AND excludedSchemas.SchemaName IS NULL
        AND ef.ID IS NOT NULL
        AND (@IsScoped = 0 OR e.ID IN (SELECT EntityID FROM @ScopedEntityIDs)) -- scoped run: only listed entities
        AND (
          ISNULL(LTRIM(RTRIM(ef.Description)), '') <> ISNULL(LTRIM(RTRIM(IIF(ef.AutoUpdateDescription=1, CONVERT(NVARCHAR(MAX), fromSQL.Description), ef.Description))), '') OR
          ef.Type <> fromSQL.Type OR
          ef.Length <> fromSQL.Length OR
          ef.Precision <> fromSQL.Precision OR
          ef.Scale <> fromSQL.Scale OR
          ef.AllowsNull <> fromSQL.AllowsNull OR
          ISNULL(LTRIM(RTRIM(ef.DefaultValue)), '') <> ISNULL(LTRIM(RTRIM(CONVERT(NVARCHAR(MAX), fromSQL.DefaultValue))), '') OR
          ef.AutoIncrement <> fromSQL.AutoIncrement OR
          ef.IsVirtual <> fromSQL.IsVirtual OR
          ef.IsComputed <> fromSQL.IsComputed OR
          ef.Sequence <> fromSQL.Sequence OR
          ISNULL(TRY_CONVERT(UNIQUEIDENTIFIER, ef.RelatedEntityID), '00000000-0000-0000-0000-000000000000') <> ISNULL(TRY_CONVERT(UNIQUEIDENTIFIER, re.ID), '00000000-0000-0000-0000-000000000000') OR
          ISNULL(LTRIM(RTRIM(ef.RelatedEntityFieldName)), '') <> ISNULL(LTRIM(RTRIM(fk.referenced_column)), '') OR
          -- U2 soft-PK guard: soft-PK rows are never a PK/unique "material change" — the physical
          -- catalog has no row for them, so the raw comparison fired on EVERY run and the update
          -- wiped the resolved soft PK (ACGI keyless-entity root). Physical rows sync as before.
          (ef.IsSoftPrimaryKey = 0 AND ef.IsPrimaryKey <> CASE WHEN pk.ColumnName IS NOT NULL THEN 1 ELSE 0 END) OR
          (ef.IsSoftPrimaryKey = 0 AND ef.IsUnique <> CASE
              WHEN pk.ColumnName IS NOT NULL THEN 1
              ELSE CASE WHEN uk.ColumnName IS NOT NULL THEN 1 ELSE 0 END
          END) OR
          -- Detect AllowUpdateAPI that needs clearing on virtual transition
          (ef.AllowUpdateAPI = 1 AND fromSQL.IsVirtual = 1 AND ef.IsVirtual = 0)
        );

    UPDATE ef
    SET
        ef.Description = IIF(fr.AutoUpdateDescription=1, fr.SQLDescription, ef.Description),
        ef.Type = fr.Type,
        ef.Length = fr.Length,
        ef.Precision = fr.Precision,
        ef.Scale = fr.Scale,
        ef.AllowsNull = fr.AllowsNull,
        ef.DefaultValue = fr.DefaultValue,
        ef.AutoIncrement = fr.AutoIncrement,
        ef.IsVirtual = fr.IsVirtual,
        ef.IsComputed = fr.IsComputed,
        ef.Sequence = fr.Sequence,
        ef.RelatedEntityID = IIF(ef.AutoUpdateRelatedEntityInfo = 1, fr.RelatedEntityID, ef.RelatedEntityID),
        ef.RelatedEntityFieldName = IIF(ef.AutoUpdateRelatedEntityInfo = 1, fr.RelatedEntityFieldName, ef.RelatedEntityFieldName),
        -- U2 soft-PK guard: @FilteredRows already carries the frozen flags for soft-PK rows
        -- (see the INSERT above), so this assignment cannot wipe a resolved soft PK.
        ef.IsPrimaryKey = fr.IsPrimaryKey,
        ef.IsUnique = fr.IsUnique,
        -- When a field transitions to virtual, it can no longer be written to.
        -- IS-A parent fields are unaffected: they are created as virtual and
        -- never go through a 0→1 transition in this SP.
        ef.AllowUpdateAPI = IIF(fr.IsVirtual = 1 AND ef.IsVirtual = 0, 0, ef.AllowUpdateAPI),
        ef.__mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].EntityField ef
    INNER JOIN
        @FilteredRows fr ON ef.ID = fr.EntityFieldID;

    SELECT * FROM @FilteredRows;
END;
GO


-- =============================================================================
-- §2 (D1) — IntegrationCredentialType junction ("one or more" credential types).
--
-- RSU-spec §metadata modeling — an Integration's credential type "can be one or more".
-- Integration.CredentialTypeID is a single FK; this adds the additive junction
-- IntegrationCredentialType so an integration can declare MULTIPLE acceptable credential
-- types (e.g. API key OR OAuth2). Publish-no-break: the legacy single column is KEPT and
-- remains the primary/default; consumers treat the allowed set as junction ∪ legacy column.
-- CodeGen adds __mj timestamps + FK indexes — deliberately not included here.
-- =============================================================================

CREATE TABLE [${flyway:defaultSchema}].[IntegrationCredentialType] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [IntegrationID] UNIQUEIDENTIFIER NOT NULL,
    [CredentialTypeID] UNIQUEIDENTIFIER NOT NULL,
    [IsPrimary] BIT NOT NULL DEFAULT 0,
    [Sequence] INT NOT NULL DEFAULT 0,
    CONSTRAINT [PK_IntegrationCredentialType] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_IntegrationCredentialType_Integration] FOREIGN KEY ([IntegrationID]) REFERENCES [${flyway:defaultSchema}].[Integration] ([ID]),
    CONSTRAINT [FK_IntegrationCredentialType_CredentialType] FOREIGN KEY ([CredentialTypeID]) REFERENCES [${flyway:defaultSchema}].[CredentialType] ([ID]),
    CONSTRAINT [UQ_IntegrationCredentialType] UNIQUE ([IntegrationID], [CredentialTypeID])
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Junction between an Integration and the credential types it accepts (RSU-spec: one or more per integration). The legacy Integration.CredentialTypeID remains the primary/default type; the allowed set a connection-create validates against is this junction unioned with that column.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationCredentialType';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, this is the integration''s preferred/default credential type (mirrors the legacy Integration.CredentialTypeID). At most one row per integration should be primary.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationCredentialType',
    @level2type = N'COLUMN', @level2name = N'IsPrimary';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display/preference order of the credential types offered for this integration (lower first).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationCredentialType',
    @level2type = N'COLUMN', @level2name = N'Sequence';
GO

-- Seed: one junction row per existing Integration that already declares a credential type.
-- Data migration over tenant rows (IDs are inherently per-install; NEWID() is correct here —
-- these are NOT fixed metadata rows that must share an ID across installs).
INSERT INTO [${flyway:defaultSchema}].[IntegrationCredentialType] ([ID], [IntegrationID], [CredentialTypeID], [IsPrimary], [Sequence])
SELECT NEWID(), i.[ID], i.[CredentialTypeID], 1, 0
FROM [${flyway:defaultSchema}].[Integration] i
WHERE i.[CredentialTypeID] IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[IntegrationCredentialType] j
      WHERE j.[IntegrationID] = i.[ID] AND j.[CredentialTypeID] = i.[CredentialTypeID]
  );
GO
