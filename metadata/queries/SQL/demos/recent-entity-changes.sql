-- Reusable base query: Returns recent record changes grouped by entity
-- Parameterized by lookbackDays (how far back to look)
SELECT
    e.Name AS EntityName,
    COUNT(*) AS ChangeCount,
    MAX(rc.CreatedAt) AS LatestChange,
    MIN(rc.CreatedAt) AS EarliestChange
FROM
    __mj.vwRecordChanges rc
    INNER JOIN __mj.vwEntities e ON e.ID = rc.EntityID
WHERE
    rc.CreatedAt >= DATEADD(DAY, -{{lookbackDays}}, GETUTCDATE())
GROUP BY
    e.Name
