-- Reusable composable query: Aggregates tag counts across all records of a given entity.
-- Powers "what topics are most common" and "major categories of inquiries" questions.
-- Parameters: entityName (entity display name)
SELECT
    t.ID AS TagID,
    t.DisplayName AS TagDisplayName,
    t.Description AS TagDescription,
    t.ParentID AS TagParentID,
    tp.DisplayName AS ParentTagDisplayName,
    COUNT(*) AS RecordCount,
    AVG(ti.Weight) AS AvgWeight,
    MIN(ti.__mj_CreatedAt) AS EarliestTaggedAt,
    MAX(ti.__mj_CreatedAt) AS LatestTaggedAt
FROM
    __mj.vwTaggedItems ti
    INNER JOIN __mj.vwTags t ON ti.TagID = t.ID
    LEFT JOIN __mj.vwTags tp ON t.ParentID = tp.ID
WHERE
    ti.Entity = {{ entityName | sqlString }}
    AND t.Status = 'Active'
GROUP BY
    t.ID, t.DisplayName, t.Description, t.ParentID, tp.DisplayName
