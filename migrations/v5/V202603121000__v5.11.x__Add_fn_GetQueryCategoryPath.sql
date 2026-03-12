-- Migration: Add fn_GetQueryCategoryPath scalar function
-- Purpose: Computes the full category path for a query category, enabling
-- the {{query:"Category/SubCat/Name"}} composition reference syntax.
-- Used by agent data sources to provide category paths in query catalog results.

CREATE FUNCTION ${flyway:defaultSchema}.fn_GetQueryCategoryPath(@CategoryID UNIQUEIDENTIFIER)
RETURNS NVARCHAR(2000)
AS
BEGIN
    DECLARE @Path NVARCHAR(2000) = '';
    DECLARE @CurrentID UNIQUEIDENTIFIER = @CategoryID;
    DECLARE @Depth INT = 0;

    WHILE @CurrentID IS NOT NULL AND @Depth < 20
    BEGIN
        SELECT @Path = Name + CASE WHEN @Path = '' THEN '' ELSE '/' + @Path END,
               @CurrentID = ParentID
        FROM ${flyway:defaultSchema}.QueryCategory
        WHERE ID = @CurrentID;

        SET @Depth = @Depth + 1;
    END

    RETURN @Path;
END
GO
