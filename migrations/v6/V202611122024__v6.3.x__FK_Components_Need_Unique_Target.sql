-- ════════════════════════════════════════════════════════════════════════════════════════
-- Composite foreign keys: a component needs a target that is unique on its own (#4534)
--
-- A multi-column foreign key such as OrderLine(a_key, a_prd_key, a_ptp_key) -> Price(prc_key,
-- prc_prd_key, prc_prd_ptp_key) gave EVERY component a RelatedEntityID. Only a component whose
-- referenced column is unique by itself (here prc_key, the primary key) is a valid single-column
-- reference. The others reference copies of the parent's own keys, so the base view's label join
-- on them matched many Price rows and multiplied OrderLine rows without any error.
--
-- spUpdateExistingEntityFieldsFromSchema now drops those components from #uef_fk before the
-- RelatedEntity join, using the single-column key rules V202611101200 introduced (#uef_pk with
-- KeyColumnCount = 1, #uef_uk). With AutoUpdateRelatedEntityInfo = 1 the next CodeGen run clears
-- the relationship on fields that already have one. Soft foreign keys are untouched.
--
-- Starts from V202611101200 (the newest definition). Only the DELETE after #uef_uk is new.
-- The PostgreSQL counterpart is produced at release.
-- ════════════════════════════════════════════════════════════════════════════════════════

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
    SELECT * INTO #uef_fk FROM [${flyway:defaultSchema}].vwForeignKeys;
    IF OBJECT_ID('tempdb..#uef_pk') IS NOT NULL DROP TABLE #uef_pk;
    -- KeyColumnCount: a column of a composite primary key is not unique on its own (#4536).
    SELECT pk.SchemaName, pk.TableName, pk.ColumnName,
           COUNT(*) OVER (PARTITION BY pk.SchemaName, pk.TableName) AS KeyColumnCount
    INTO #uef_pk
    FROM [${flyway:defaultSchema}].vwTablePrimaryKeys pk;
    IF OBJECT_ID('tempdb..#uef_uk') IS NOT NULL DROP TABLE #uef_uk;
    -- Only columns that are, alone, the key of an unfiltered unique index or constraint (#4536).
    -- vwTableUniqueKeys lists every key column of every unique index; composite members, INCLUDE
    -- columns and filtered indexes are not a per-column uniqueness guarantee. Composite keys are
    -- recorded as key sets in EntityUniqueKey instead. DISTINCT: a column can be the sole key of
    -- more than one index.
    SELECT DISTINCT uk.SchemaName, uk.TableName, uk.ColumnName
    INTO #uef_uk
    FROM [${flyway:defaultSchema}].vwTableUniqueKeys uk
    WHERE uk.KeyColumnCount = 1
      AND uk.IsFiltered = 0;

    -- A column of a multi-column foreign key is a usable single-column reference only when the
    -- column it references is unique on its own: a single-column primary key, or the sole key of
    -- an unfiltered unique index. Joined alone, any other component matches many referenced rows
    -- and the base view's label join multiplies rows, so it gets no related entity, and a run on
    -- an existing database clears the relationship it was given before.
    DELETE fk
    FROM #uef_fk fk
    WHERE EXISTS (
              SELECT 1 FROM #uef_fk sibling
              WHERE sibling.FK_NAME = fk.FK_NAME AND sibling.[schema_name] = fk.[schema_name]
                AND sibling.[table] = fk.[table] AND sibling.[column] <> fk.[column]
          )
      AND NOT EXISTS (
              SELECT 1 FROM #uef_pk pk
              WHERE pk.SchemaName = fk.referenced_schema AND pk.TableName = fk.referenced_table
                AND pk.ColumnName = fk.referenced_column AND pk.KeyColumnCount = 1
          )
      AND NOT EXISTS (
              SELECT 1 FROM #uef_uk uk
              WHERE uk.SchemaName = fk.referenced_schema AND uk.TableName = fk.referenced_table
                AND uk.ColumnName = fk.referenced_column
          );

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
             WHEN pk.ColumnName IS NOT NULL AND pk.KeyColumnCount = 1 THEN 1
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
              WHEN pk.ColumnName IS NOT NULL AND pk.KeyColumnCount = 1 THEN 1
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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateExistingEntityFieldsFromSchema] TO [cdp_Developer], [cdp_Integration];
GO
