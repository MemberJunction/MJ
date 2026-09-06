-- spRecompileAllViews: refresh views in dependency order
--
-- The previous body walked sys.views in catalog order. That is wrong for LAYERED
-- base views (GeneratedBaseViewName): the application-owned outer view is
-- `SELECT g.* FROM <inner> g`, and SQL Server caches the outer column list at
-- create/refresh time. Refreshing the outer against a stale inner re-caches the
-- OLD columns — indistinguishable from the column never having been added.
-- CodeGen already refreshes inner then outer per entity; this procedure is what
-- R__RefreshMetadata and `mj migrate` (including after an Open App migrate) call,
-- so it has to do the same job for the whole catalog.
--
-- Inner-then-outer is a special case of "referenced views before referencers".
-- Cross-entity wrappers need that too: vwContactMethods joins vwPeople, so
-- People generated → People wrapper → Contact Methods, not just a per-entity pair.
--
-- Order is a longest-path depth over view-to-view edges from
-- sys.sql_expression_dependencies. Tables and functions are ignored (they are
-- not refreshed here). Views in a cycle, or with no recorded view-to-view edge,
-- are refreshed after the acyclic set.
--
-- @ExcludedSchemaNames / @IncludedSchemaNames match the other R__RefreshMetadata
-- procs: exclude always wins; a NULL/empty include list means every remaining
-- schema. Existing `EXEC spRecompileAllViews` (no args) is unchanged.

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spRecompileAllViews];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spRecompileAllViews]
    @ExcludedSchemaNames NVARCHAR(MAX) = N'sys,INFORMATION_SCHEMA',
    @IncludedSchemaNames NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Excluded TABLE (SchemaName NVARCHAR(128) PRIMARY KEY);
    INSERT INTO @Excluded (SchemaName)
    SELECT DISTINCT LTRIM(RTRIM(value))
    FROM STRING_SPLIT(ISNULL(@ExcludedSchemaNames, N''), N',')
    WHERE LTRIM(RTRIM(value)) <> N'';

    -- Always drop the SQL catalog schemas even if the caller omitted them.
    INSERT INTO @Excluded (SchemaName)
    SELECT v.SchemaName
    FROM (VALUES (N'sys'), (N'INFORMATION_SCHEMA')) AS v(SchemaName)
    WHERE NOT EXISTS (SELECT 1 FROM @Excluded e WHERE e.SchemaName = v.SchemaName);

    DECLARE @Included TABLE (SchemaName NVARCHAR(128) PRIMARY KEY);
    DECLARE @HasInclude BIT = 0;
    IF @IncludedSchemaNames IS NOT NULL AND LEN(LTRIM(RTRIM(@IncludedSchemaNames))) > 0
    BEGIN
        INSERT INTO @Included (SchemaName)
        SELECT DISTINCT LTRIM(RTRIM(value))
        FROM STRING_SPLIT(@IncludedSchemaNames, N',')
        WHERE LTRIM(RTRIM(value)) <> N'';
        IF EXISTS (SELECT 1 FROM @Included)
            SET @HasInclude = 1;
    END

    IF OBJECT_ID('tempdb..#ViewsToRefresh') IS NOT NULL
        DROP TABLE #ViewsToRefresh;

    CREATE TABLE #ViewsToRefresh (
        ObjectId INT NOT NULL PRIMARY KEY,
        SchemaName NVARCHAR(128) NOT NULL,
        ViewName NVARCHAR(128) NOT NULL,
        Depth INT NOT NULL
    );

    ;WITH Views AS (
        SELECT
            v.object_id AS ObjectId,
            s.name AS SchemaName,
            v.name AS ViewName
        FROM sys.views v
        INNER JOIN sys.schemas s
            ON s.schema_id = v.schema_id
        WHERE NOT EXISTS (
                SELECT 1 FROM @Excluded e WHERE e.SchemaName = s.name
            )
          AND (
                @HasInclude = 0
                OR EXISTS (SELECT 1 FROM @Included i WHERE i.SchemaName = s.name)
            )
    ),
    Edges AS (
        SELECT DISTINCT
            d.referencing_id AS ChildId,
            d.referenced_id AS ParentId
        FROM sys.sql_expression_dependencies d
        INNER JOIN Views child
            ON child.ObjectId = d.referencing_id
        INNER JOIN Views parent
            ON parent.ObjectId = d.referenced_id
        WHERE d.referenced_class = 1 -- OBJECT_OR_COLUMN
          AND d.referencing_id <> d.referenced_id
    ),
    Roots AS (
        SELECT
            v.ObjectId,
            v.SchemaName,
            v.ViewName,
            0 AS Depth
        FROM Views v
        WHERE NOT EXISTS (
            SELECT 1 FROM Edges e WHERE e.ChildId = v.ObjectId
        )
    ),
    Walk AS (
        SELECT ObjectId, SchemaName, ViewName, Depth
        FROM Roots
        UNION ALL
        SELECT
            v.ObjectId,
            v.SchemaName,
            v.ViewName,
            w.Depth + 1
        FROM Walk w
        INNER JOIN Edges e
            ON e.ParentId = w.ObjectId
        INNER JOIN Views v
            ON v.ObjectId = e.ChildId
        WHERE w.Depth < 100
    ),
    Ranked AS (
        SELECT
            ObjectId,
            SchemaName,
            ViewName,
            MAX(Depth) AS Depth
        FROM Walk
        GROUP BY ObjectId, SchemaName, ViewName
    )
    INSERT INTO #ViewsToRefresh (ObjectId, SchemaName, ViewName, Depth)
    SELECT ObjectId, SchemaName, ViewName, Depth
    FROM Ranked
    OPTION (MAXRECURSION 100);

    -- Cycles (or views whose only edges were dropped by the depth cap) never
    -- become roots, so they are missing from Ranked. Refresh them last.
    INSERT INTO #ViewsToRefresh (ObjectId, SchemaName, ViewName, Depth)
    SELECT
        v.object_id,
        s.name,
        v.name,
        1000
    FROM sys.views v
    INNER JOIN sys.schemas s
        ON s.schema_id = v.schema_id
    WHERE NOT EXISTS (
            SELECT 1 FROM @Excluded e WHERE e.SchemaName = s.name
        )
      AND (
            @HasInclude = 0
            OR EXISTS (SELECT 1 FROM @Included i WHERE i.SchemaName = s.name)
        )
      AND NOT EXISTS (
            SELECT 1 FROM #ViewsToRefresh r WHERE r.ObjectId = v.object_id
        );

    DECLARE @ViewSchema NVARCHAR(128);
    DECLARE @ViewName NVARCHAR(128);
    DECLARE @FullViewName NVARCHAR(516);

    DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
        SELECT SchemaName, ViewName
        FROM #ViewsToRefresh
        ORDER BY Depth, SchemaName, ViewName;

    OPEN cur;
    FETCH NEXT FROM cur INTO @ViewSchema, @ViewName;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @FullViewName = QUOTENAME(@ViewSchema) + N'.' + QUOTENAME(@ViewName);
        EXEC sp_refreshview @FullViewName;
        FETCH NEXT FROM cur INTO @ViewSchema, @ViewName;
    END

    CLOSE cur;
    DEALLOCATE cur;

    DROP TABLE #ViewsToRefresh;
END
GO
