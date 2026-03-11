-- Composed query: Joins Active Users with Recent Entity Changes
-- Demonstrates {{query:"..."}} composition syntax
-- References two reusable queries and combines their data
SELECT
    au.Name AS UserName,
    au.Email,
    au.Type AS UserType,
    COALESCE(rc.ChangeCount, 0) AS RecentChanges,
    rc.LatestChange
FROM
    {{query:"Demos/Active Users"}} au
    LEFT JOIN {{query:"Demos/Recent Entity Changes(lookbackDays='30')"}} rc
        ON rc.EntityName IN (
            SELECT e.Name
            FROM __mj.vwEntities e
            WHERE e.ID IN (
                SELECT DISTINCT EntityID
                FROM __mj.vwRecordChanges
                WHERE UserID = au.ID
            )
        )
ORDER BY
    COALESCE(rc.ChangeCount, 0) DESC,
    au.Name
