-- Composed query: Joins Active Users with Recent Entity Changes
-- Demonstrates {{query:"..."}} composition syntax
-- References two reusable queries and combines their data
--
-- Each active user is paired with the recent-change row of every entity that user has ever
-- changed. The user-to-entity pairs are built once, set-based (DISTINCT over RecordChange),
-- and joined by key; a per-user correlated subquery here makes the optimizer re-scan
-- RecordChange once per user and entity, which grows with the size of RecordChange.
SELECT
    au.Name AS UserName,
    au.Email,
    au.Type AS UserType,
    COALESCE(ua.ChangeCount, 0) AS RecentChanges,
    ua.LatestChange
FROM
    {{query:"Demos/Active Users"}} au
    LEFT JOIN (
        SELECT
            ue.UserID,
            rc.ChangeCount,
            rc.LatestChange
        FROM (
            SELECT DISTINCT
                urc.UserID,
                urc.EntityID
            FROM __mj.vwRecordChanges urc
        ) ue
            INNER JOIN __mj.vwEntities e ON e.ID = ue.EntityID
            INNER JOIN {{query:"Demos/Recent Entity Changes(lookbackDays='30')"}} rc
                ON rc.EntityName = e.Name
    ) ua ON ua.UserID = au.ID
ORDER BY
    COALESCE(ua.ChangeCount, 0) DESC,
    au.Name
