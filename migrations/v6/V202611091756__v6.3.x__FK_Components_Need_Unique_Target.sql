-- ----------------------------------------------------------------------------
-- #4534 / #4536: a foreign-key component is a single-column reference only when its target is
-- unique on its own, and a column is IsUnique only when a unique index or the primary key covers it alone.
--
-- vwTableUniqueKeys listed every member column of a composite unique index, so CodeGen marked each
-- of them IsUnique (#4536). The view now lists the columns of single-key-column, unfiltered unique
-- indexes only: a composite unique index makes the tuple unique, not its members.
--
-- spUpdateExistingEntityFieldsFromSchema stamped RelatedEntityID on every column of a composite
-- foreign key by positional pairing, so trailing components whose referenced column is not unique
-- (denormalised copies of the parent's own keys) got a related entity, and the base view's label
-- join on them multiplied rows (#4534). The procedure keeps a component only when its constraint is
-- single-column or its referenced column is unique on its own; the other components get no
-- related entity rather than a guessed one. The pending-fields query in CodeGen applies the same
-- rule in code (SQLServerCodeGenProvider / PostgreSQLCodeGenProvider).
--
-- The procedure body is otherwise the one from V202610261530 (CodeGen_EntityField_Drift_Repairs).
-- ----------------------------------------------------------------------------

CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwTableUniqueKeys] AS
SELECT
    s.name AS SchemaName,
    t.name AS TableName,
    c.name AS ColumnName
FROM
    sys.tables t
INNER JOIN
    sys.schemas s ON t.schema_id = s.schema_id
INNER JOIN
    sys.indexes i ON t.object_id = i.object_id
INNER JOIN
    sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id AND ic.is_included_column = 0
INNER JOIN
    sys.columns c ON ic.object_id = c.object_id AND c.column_id = ic.column_id
WHERE
    i.is_unique = 1
    AND i.is_primary_key = 0
    AND i.has_filter = 0
    -- Single key column only: a composite unique index does not make its members unique (#4536).
    AND (SELECT COUNT(*) FROM sys.index_columns k WHERE k.object_id = i.object_id AND k.index_id = i.index_id AND k.is_included_column = 0) = 1;
GO

CREATE OR ALTER PROC [${flyway:defaultSchema}].[spUpdateExistingEntityFieldsFromSchema]
    @ExcludedSchemaNames NVARCHAR(MAX),
    @EntityIDs NVARCHAR(MAX) = NULL,
    @IncludedSchemaNames NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ExcludedSchemas TABLE (SchemaName NVARCHAR(255));
    INSERT INTO @ExcludedSchemas(SchemaName)
    SELECT TRIM(value) FROM STRING_SPLIT(@ExcludedSchemaNames, ',');

    -- Materialize the optional entity scope list once
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

    DECLARE @IncludedSchemas TABLE (SchemaName NVARCHAR(255) PRIMARY KEY);
    DECLARE @HasInclude BIT = 0;
    IF @IncludedSchemaNames IS NOT NULL AND LEN(LTRIM(RTRIM(@IncludedSchemaNames))) > 0
    BEGIN
        INSERT INTO @IncludedSchemas (SchemaName)
        SELECT DISTINCT TRIM(value)
        FROM STRING_SPLIT(@IncludedSchemaNames, ',')
        WHERE TRIM(value) <> '';
        IF EXISTS (SELECT 1 FROM @IncludedSchemas) SET @HasInclude = 1;
    END

    -- Materialize catalog-introspection views into #temp tables
    IF OBJECT_ID('tempdb..#uef_cols') IS NOT NULL DROP TABLE #uef_cols;
    SELECT * INTO #uef_cols FROM [${flyway:defaultSchema}].vwSQLColumnsAndEntityFields
        WHERE @IsScoped = 0 OR EntityID IN (SELECT EntityID FROM @ScopedEntityIDs);
    IF OBJECT_ID('tempdb..#uef_fk') IS NOT NULL DROP TABLE #uef_fk;
    -- Two columns beside the view's: ColumnCount (components in the constraint) and TargetIsUnique
    -- (the referenced column is unique on its own). A composite FK's components are valid
    -- single-column references only when their target is unique; the others would join a
    -- non-unique target and multiply rows in the base view (#4534).
    SELECT fk.*,
           COUNT(*) OVER (PARTITION BY fk.FK_NAME, fk.[schema_name], fk.[table]) AS ColumnCount,
           CASE WHEN EXISTS (
           SELECT 1
           FROM sys.indexes ri
           INNER JOIN sys.tables rt ON rt.object_id = ri.object_id
           INNER JOIN sys.schemas rs ON rs.schema_id = rt.schema_id
           INNER JOIN sys.index_columns ric ON ric.object_id = ri.object_id AND ric.index_id = ri.index_id AND ric.is_included_column = 0
           INNER JOIN sys.columns rc ON rc.object_id = ric.object_id AND rc.column_id = ric.column_id
           WHERE ri.is_unique = 1 AND ri.has_filter = 0
             AND rs.name = fk.referenced_schema AND rt.name = fk.referenced_table AND rc.name = fk.referenced_column
             AND (SELECT COUNT(*) FROM sys.index_columns k WHERE k.object_id = ri.object_id AND k.index_id = ri.index_id AND k.is_included_column = 0) = 1
       ) THEN 1 ELSE 0 END AS TargetIsUnique
    INTO #uef_fk FROM [${flyway:defaultSchema}].vwForeignKeys fk;
    IF OBJECT_ID('tempdb..#uef_pk') IS NOT NULL DROP TABLE #uef_pk;
    -- ColumnCount: members of the table's primary key; IsUnique needs a single-column key (#4536).
    SELECT pk.*, COUNT(*) OVER (PARTITION BY pk.SchemaName, pk.TableName) AS ColumnCount
    INTO #uef_pk FROM [${flyway:defaultSchema}].vwTablePrimaryKeys pk;
    IF OBJECT_ID('tempdb..#uef_uk') IS NOT NULL DROP TABLE #uef_uk;
    SELECT * INTO #uef_uk FROM [${flyway:defaultSchema}].vwTableUniqueKeys;

    -- Orphan-tolerant renumber (#4050). A row whose column is no longer in the base view never
    -- joins #uef_cols below, so the renumber cannot move it. If its Sequence sits inside the live
    -- column range, the live field assigned that slot collides on UQ_EntityField_EntityID_Sequence
    -- and the pass fails. Park such orphans above the entity's current maximum first (above every
    -- existing value, so the park itself cannot collide). Orphans already above the live range are
    -- left where they are, so repeated runs do not keep moving them.
    UPDATE ef
    SET ef.Sequence = mx.MaxSequence + o.rn
    FROM [${flyway:defaultSchema}].EntityField ef
    INNER JOIN (
        SELECT
            f.ID,
            f.EntityID,
            ROW_NUMBER() OVER (PARTITION BY f.EntityID ORDER BY f.Sequence, f.Name) AS rn
        FROM [${flyway:defaultSchema}].EntityField f
        INNER JOIN [${flyway:defaultSchema}].Entity e ON e.ID = f.EntityID
        INNER JOIN (
            SELECT EntityID, MAX(Sequence) AS LiveMax FROM #uef_cols GROUP BY EntityID
        ) lm ON lm.EntityID = f.EntityID
        LEFT OUTER JOIN @ExcludedSchemas x ON e.SchemaName = x.SchemaName
        WHERE e.VirtualEntity = 0
          AND x.SchemaName IS NULL
          AND (@HasInclude = 0 OR e.SchemaName IN (SELECT SchemaName FROM @IncludedSchemas))
          AND (@IsScoped = 0 OR e.ID IN (SELECT EntityID FROM @ScopedEntityIDs))
          AND f.Sequence <= lm.LiveMax
          AND NOT EXISTS (
              SELECT 1 FROM #uef_cols c WHERE c.EntityID = f.EntityID AND c.FieldName = f.Name
          )
    ) o ON o.ID = ef.ID
    INNER JOIN (
        SELECT EntityID, MAX(Sequence) AS MaxSequence
        FROM [${flyway:defaultSchema}].EntityField
        GROUP BY EntityID
    ) mx ON mx.EntityID = o.EntityID;

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
        -- Soft-PK guard: carry the FROZEN flags for soft-PK rows
        CASE WHEN ef.IsSoftPrimaryKey = 1 THEN ef.IsPrimaryKey
             WHEN pk.ColumnName IS NOT NULL THEN 1 ELSE 0 END AS IsPrimaryKey,
        CASE WHEN ef.IsSoftPrimaryKey = 1 THEN ef.IsUnique
             WHEN pk.ColumnName IS NOT NULL AND pk.ColumnCount = 1 THEN 1
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
           AND (fk.ColumnCount = 1 OR fk.TargetIsUnique = 1)
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
        AND (@HasInclude = 0 OR e.SchemaName IN (SELECT SchemaName FROM @IncludedSchemas))
        AND ef.ID IS NOT NULL
        AND (@IsScoped = 0 OR e.ID IN (SELECT EntityID FROM @ScopedEntityIDs))
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
          -- Soft-FK guard: wrap RelatedEntity* predicates to respect AutoUpdateRelatedEntityInfo and IsSoftForeignKey.
          -- IS-A inherited rows (#4569) are excluded: their column lives in the parent's table, so the FK
          -- lookup above finds nothing and would null the relationship CodeGen copied from the parent field.
          (ef.AutoUpdateRelatedEntityInfo = 1 AND ef.IsSoftForeignKey = 0
           AND NOT (e.ParentID IS NOT NULL AND ef.IsVirtual = 1 AND ef.AllowUpdateAPI = 1) AND (
              ISNULL(TRY_CONVERT(UNIQUEIDENTIFIER, ef.RelatedEntityID), '00000000-0000-0000-0000-000000000000') <> ISNULL(TRY_CONVERT(UNIQUEIDENTIFIER, re.ID), '00000000-0000-0000-0000-000000000000') OR
              ISNULL(LTRIM(RTRIM(ef.RelatedEntityFieldName)), '') <> ISNULL(LTRIM(RTRIM(fk.referenced_column)), '')
          )) OR
          -- Soft-PK guard: soft-PK rows are never a PK/unique material change
          (ef.IsSoftPrimaryKey = 0 AND ef.IsPrimaryKey <> CASE WHEN pk.ColumnName IS NOT NULL THEN 1 ELSE 0 END) OR
          (ef.IsSoftPrimaryKey = 0 AND ef.IsUnique <> CASE
              WHEN pk.ColumnName IS NOT NULL AND pk.ColumnCount = 1 THEN 1
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
        -- Soft-FK guard: preserve soft FKs; IS-A inherited rows keep the parent field's relationship
        ef.RelatedEntityID = IIF(ef.AutoUpdateRelatedEntityInfo = 1 AND ef.IsSoftForeignKey = 0
                                 AND NOT (e.ParentID IS NOT NULL AND ef.IsVirtual = 1 AND ef.AllowUpdateAPI = 1),
                                 fr.RelatedEntityID, ef.RelatedEntityID),
        ef.RelatedEntityFieldName = IIF(ef.AutoUpdateRelatedEntityInfo = 1 AND ef.IsSoftForeignKey = 0
                                        AND NOT (e.ParentID IS NOT NULL AND ef.IsVirtual = 1 AND ef.AllowUpdateAPI = 1),
                                        fr.RelatedEntityFieldName, ef.RelatedEntityFieldName),
        -- Soft-PK guard: preserve soft PKs
        ef.IsPrimaryKey = fr.IsPrimaryKey,
        ef.IsUnique = fr.IsUnique,
        ef.AllowUpdateAPI = IIF(fr.IsVirtual = 1 AND ef.IsVirtual = 0, 0, ef.AllowUpdateAPI),
        ef.__mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].EntityField ef
    INNER JOIN
        @FilteredRows fr ON ef.ID = fr.EntityFieldID
    INNER JOIN
        [${flyway:defaultSchema}].Entity e ON e.ID = ef.EntityID;

    SELECT * FROM @FilteredRows;
END;
GO
