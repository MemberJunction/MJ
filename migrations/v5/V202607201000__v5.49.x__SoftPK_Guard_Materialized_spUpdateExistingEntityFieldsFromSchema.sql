-- U2 soft-PK guard + catalog-view materialization for spUpdateExistingEntityFieldsFromSchema (SQL Server).
--
-- This migration SUPERSEDES the guard-only V202607181210 (deleted in this same change) and folds in
-- the #temp-table materialization so the FINAL sproc definition carries BOTH fixes regardless of the
-- order the two independent changes land in. Its timestamp sorts AFTER the standalone materialization
-- migration (V202607181900, shipped separately), so on a fresh install this definition wins. Without
-- this reconciliation, whichever of "guard" and "materialize" had the later timestamp would silently
-- revert the other (both CREATE OR ALTER the same routine and do not textually conflict, so nothing
-- would flag it).
--
-- (1) SOFT-PK GUARD (U2): a SOFT primary key (EntityField.IsSoftPrimaryKey = 1, resolved from
--     additionalSchemaInfo for integration tables) has NO physical PK/UNIQUE constraint. The sproc
--     compared IsPrimaryKey/IsUnique against the PHYSICAL constraint catalog unconditionally, so every
--     run (a) flagged each soft-PK field as a material change and (b) overwrote IsPrimaryKey/IsUnique
--     back to 0 — undoing the resolved soft PK (the keyless-entity root) despite the documented
--     IsSoftPrimaryKey protection. Fix: soft-PK rows are excluded from the PK/unique material-change
--     predicate and their IsPrimaryKey/IsUnique values are frozen in the UPDATE. All other attributes
--     still sync. (PostgreSQL receives the same guard via the CodeGenLib emitter, which re-creates the
--     function on every codegen run.)
--
-- (2) MATERIALIZATION: the four catalog-introspection views, joined directly over the sys.* catalog,
--     get poor cardinality estimates and the optimizer nested-loops, going super-linear as CodeGen
--     inflates the catalog mid-run (a single call exceeded 2 min at 600 tables; SS codegen at 600
--     tables did not complete in 15 min). Materialize each view into a #temp table first (SQL Server
--     auto-creates statistics on #temp tables) so the reconciliation join hash-joins. Mirrors the
--     pattern the sibling spDeleteUnneededEntityFields already uses. Behavior is otherwise identical.

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

    -- Materialize the catalog-introspection views into #temp tables before the reconciliation
    -- join below (see header note 2). #temp tables auto-get statistics, so the join hash-joins
    -- instead of nested-looping over the sys.* catalog. #uef_cols honors the scope filter so a
    -- scoped run only materializes the listed entities' columns.
    IF OBJECT_ID('tempdb..#uef_cols') IS NOT NULL DROP TABLE #uef_cols;
    SELECT * INTO #uef_cols FROM [${flyway:defaultSchema}].vwSQLColumnsAndEntityFields
        WHERE @IsScoped = 0 OR EntityID IN (SELECT EntityID FROM @ScopedEntityIDs);
    IF OBJECT_ID('tempdb..#uef_fk') IS NOT NULL DROP TABLE #uef_fk;
    SELECT * INTO #uef_fk FROM [${flyway:defaultSchema}].vwForeignKeys;
    IF OBJECT_ID('tempdb..#uef_pk') IS NOT NULL DROP TABLE #uef_pk;
    SELECT * INTO #uef_pk FROM [${flyway:defaultSchema}].vwTablePrimaryKeys;
    IF OBJECT_ID('tempdb..#uef_uk') IS NOT NULL DROP TABLE #uef_uk;
    SELECT * INTO #uef_uk FROM [${flyway:defaultSchema}].vwTableUniqueKeys;

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
        #uef_cols fromSQL
        ON ef.EntityID = fromSQL.EntityID AND ef.Name = fromSQL.FieldName
    INNER JOIN
        [${flyway:defaultSchema}].Entity e ON ef.EntityID = e.ID
    LEFT OUTER JOIN
        #uef_fk fk
        ON ef.Name = fk.[column]
           AND e.BaseTable = fk.[table]
           AND e.SchemaName = fk.[schema_name]
    LEFT OUTER JOIN
        [${flyway:defaultSchema}].Entity re
        ON re.BaseTable = fk.referenced_table AND re.SchemaName = fk.[referenced_schema]
    LEFT OUTER JOIN
        #uef_pk pk
        ON e.BaseTable = pk.TableName AND ef.Name = pk.ColumnName AND e.SchemaName = pk.SchemaName
    LEFT OUTER JOIN
        #uef_uk uk
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
          -- undid the resolved soft PK (keyless-entity root). Physical rows sync as before.
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
        -- (see the INSERT above), so this assignment cannot undo a resolved soft PK.
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
