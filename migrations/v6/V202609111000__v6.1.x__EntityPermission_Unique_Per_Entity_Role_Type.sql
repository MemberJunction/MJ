/*
    EntityPermission: one row per (EntityID, RoleID, Type)
    ------------------------------------------------------

    `EntityPermission` has never carried a uniqueness constraint — the only unique index is the
    primary key on `ID`. Nothing stopped a second row for the same entity, role and type, and in
    practice several producers created them: CodeGen's "grant default permissions to a new entity"
    paths insert unconditionally, and a handful of migrations have inserted a narrow grant followed
    by a wider one.

    Duplicates are not merely untidy. `EntityInfo.GetUserPermisions` folds every matching row into
    one aggregate by OR-ing the verb flags, so N rows and their OR-merged equivalent are already
    indistinguishable at runtime — but field-level security now needs the (entity, role) pair to
    identify exactly one permission row, so that a field permission can be tied to the entity
    permission it refines.

    WHY (EntityID, RoleID, Type) AND NOT (EntityID, RoleID)
    -------------------------------------------------------
    `Type` is a real discriminator, not decoration. `CK_EntityPermission_Type` restricts it to
    'Allow' or 'Deny'; `GetUserPermisions` aggregates the two into separate buckets and subtracts
    Deny from Allow per verb; and `EntityPermissionProvider` is the ONLY one of the ten unified-
    permission providers that declares `SupportsDeny = true`. An Allow row and a Deny row for the
    same entity and role are therefore a designed, meaningful pair. Keying uniqueness on
    (EntityID, RoleID) alone would forbid it.

    THE MERGE RULE
    --------------
    Duplicates are merged, never simply deleted — deleting the "extra" row would silently revoke
    access wherever the duplicates disagree, which they do. The surviving row takes the OR of every
    verb flag across the group. That is exactly what `GetUserPermisions` computes today, so the
    merge is behaviour-preserving by construction: every user's effective permissions are identical
    before and after this migration.

    Row-level-security filter columns cannot be merged that way. Two rows naming DIFFERENT filters
    have no defensible union — picking one silently changes which rows a role can see. The migration
    therefore refuses to run when it finds such a group, naming the offenders, and asks a human to
    resolve them first. A group where only one row names a filter is not a conflict; the filter is
    carried onto the survivor.

    Survivor selection is the oldest row (earliest `__mj_CreatedAt`, ties broken by `ID`), so the
    original record's identity and creation timestamp are preserved and the choice is deterministic
    across environments.

    ORDERING
    --------
    This migration must run BEFORE the field-level-security migrations (V202609111001 /
    V202609111002): the uniqueness it establishes is what lets a field permission be tied to the one
    entity permission it refines, so the duplicates have to be gone before those tables exist.

    No foreign keys reference `EntityPermission`, so removing the duplicate rows has no cascade.
*/

-- ---------------------------------------------------------------------------------------------
-- 1. Refuse to proceed on un-mergeable RLS filter conflicts
-- ---------------------------------------------------------------------------------------------
-- COUNT(DISTINCT col) ignores NULLs, so a group where only one row names a filter counts 1 and is
-- not a conflict. Two rows naming different filters count 2 and are.
DECLARE @Conflicts NVARCHAR(MAX);

SELECT @Conflicts = STRING_AGG(CAST(Detail AS NVARCHAR(MAX)), CHAR(13) + CHAR(10))
FROM (
    SELECT TOP 50
           '    Entity=' + ISNULL(e.[Name], CAST(p.[EntityID] AS NVARCHAR(50)))
         + '  Role='     + ISNULL(r.[Name], CAST(p.[RoleID]   AS NVARCHAR(50)))
         + '  Type='     + p.[Type]
         + '  (rows='    + CAST(COUNT(*) AS NVARCHAR(10)) + ')' AS Detail
    FROM [${flyway:defaultSchema}].[EntityPermission] p
    LEFT JOIN [${flyway:defaultSchema}].[Entity] e ON e.[ID] = p.[EntityID]
    LEFT JOIN [${flyway:defaultSchema}].[Role]   r ON r.[ID] = p.[RoleID]
    GROUP BY p.[EntityID], p.[RoleID], p.[Type], e.[Name], r.[Name]
    HAVING COUNT(*) > 1
       AND (COUNT(DISTINCT p.[ReadRLSFilterID])   > 1
         OR COUNT(DISTINCT p.[CreateRLSFilterID]) > 1
         OR COUNT(DISTINCT p.[UpdateRLSFilterID]) > 1
         OR COUNT(DISTINCT p.[DeleteRLSFilterID]) > 1)
) AS Conflicting;

IF @Conflicts IS NOT NULL
BEGIN
    DECLARE @ConflictMsg NVARCHAR(MAX) =
        N'EntityPermission has duplicate (EntityID, RoleID, Type) groups whose row-level-security '
      + N'filters DISAGREE. Their verb flags can be merged automatically, but two different RLS '
      + N'filters have no safe union — choosing one would silently change which rows the role can '
      + N'see. Resolve these by hand (keep the correct row, delete the other) and re-run:'
      + CHAR(13) + CHAR(10) + @Conflicts;
    RAISERROR(@ConflictMsg, 16, 1);
END
GO

-- ---------------------------------------------------------------------------------------------
-- 2. Merge duplicates into the oldest row of each group
-- ---------------------------------------------------------------------------------------------
IF OBJECT_ID('tempdb..#EPMerged') IS NOT NULL DROP TABLE #EPMerged;
IF OBJECT_ID('tempdb..#EPSurvivor') IS NOT NULL DROP TABLE #EPSurvivor;

-- The OR-merged shape of every duplicated group. MAX over a BIT cast to TINYINT is a boolean OR;
-- MAX over a uniqueidentifier ignores NULLs, and section 1 has already established that at most one
-- distinct non-NULL filter exists per column per group.
SELECT
    [EntityID],
    [RoleID],
    [Type],
    MAX(CAST([CanCreate] AS TINYINT)) AS [CanCreate],
    MAX(CAST([CanRead]   AS TINYINT)) AS [CanRead],
    MAX(CAST([CanUpdate] AS TINYINT)) AS [CanUpdate],
    MAX(CAST([CanDelete] AS TINYINT)) AS [CanDelete],
    MAX([ReadRLSFilterID])   AS [ReadRLSFilterID],
    MAX([CreateRLSFilterID]) AS [CreateRLSFilterID],
    MAX([UpdateRLSFilterID]) AS [UpdateRLSFilterID],
    MAX([DeleteRLSFilterID]) AS [DeleteRLSFilterID],
    COUNT(*) AS [RowCount]
INTO #EPMerged
FROM [${flyway:defaultSchema}].[EntityPermission]
GROUP BY [EntityID], [RoleID], [Type]
HAVING COUNT(*) > 1;

-- The row that survives each group: oldest first, ties broken deterministically by ID.
SELECT ranked.[ID], ranked.[EntityID], ranked.[RoleID], ranked.[Type]
INTO #EPSurvivor
FROM (
    SELECT p.[ID], p.[EntityID], p.[RoleID], p.[Type],
           ROW_NUMBER() OVER (
               PARTITION BY p.[EntityID], p.[RoleID], p.[Type]
               ORDER BY p.[__mj_CreatedAt] ASC, p.[ID] ASC
           ) AS RowRank
    FROM [${flyway:defaultSchema}].[EntityPermission] p
    WHERE EXISTS (
        SELECT 1 FROM #EPMerged m
        WHERE m.[EntityID] = p.[EntityID] AND m.[RoleID] = p.[RoleID] AND m.[Type] = p.[Type]
    )
) AS ranked
WHERE ranked.RowRank = 1;

DECLARE @GroupCount INT = (SELECT COUNT(*) FROM #EPMerged);
DECLARE @RowsToRemove INT = (SELECT ISNULL(SUM([RowCount]), 0) - COUNT(*) FROM #EPMerged);

IF @GroupCount > 0
BEGIN
    PRINT CONCAT('EntityPermission: merging ', @GroupCount, ' duplicated (EntityID, RoleID, Type) group(s); removing ', @RowsToRemove, ' redundant row(s).');

    -- Fold the group's flags onto the survivor. __mj_UpdatedAt is left to its trigger.
    UPDATE p
    SET p.[CanCreate]         = CAST(m.[CanCreate] AS BIT),
        p.[CanRead]           = CAST(m.[CanRead]   AS BIT),
        p.[CanUpdate]         = CAST(m.[CanUpdate] AS BIT),
        p.[CanDelete]         = CAST(m.[CanDelete] AS BIT),
        p.[ReadRLSFilterID]   = m.[ReadRLSFilterID],
        p.[CreateRLSFilterID] = m.[CreateRLSFilterID],
        p.[UpdateRLSFilterID] = m.[UpdateRLSFilterID],
        p.[DeleteRLSFilterID] = m.[DeleteRLSFilterID]
    FROM [${flyway:defaultSchema}].[EntityPermission] p
    INNER JOIN #EPSurvivor s ON s.[ID] = p.[ID]
    INNER JOIN #EPMerged   m ON m.[EntityID] = s.[EntityID] AND m.[RoleID] = s.[RoleID] AND m.[Type] = s.[Type];

    DELETE p
    FROM [${flyway:defaultSchema}].[EntityPermission] p
    INNER JOIN #EPMerged m ON m.[EntityID] = p.[EntityID] AND m.[RoleID] = p.[RoleID] AND m.[Type] = p.[Type]
    WHERE NOT EXISTS (SELECT 1 FROM #EPSurvivor s WHERE s.[ID] = p.[ID]);
END
ELSE
BEGIN
    PRINT 'EntityPermission: no duplicate (EntityID, RoleID, Type) groups found.';
END

DROP TABLE #EPMerged;
DROP TABLE #EPSurvivor;
GO

-- ---------------------------------------------------------------------------------------------
-- 3. Enforce it from here on
-- ---------------------------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE [name] = 'UQ_EntityPermission_EntityID_RoleID_Type'
      AND [object_id] = OBJECT_ID('[${flyway:defaultSchema}].[EntityPermission]')
)
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[EntityPermission]
        ADD CONSTRAINT [UQ_EntityPermission_EntityID_RoleID_Type]
        UNIQUE ([EntityID], [RoleID], [Type]);
END
GO
