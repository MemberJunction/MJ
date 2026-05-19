-- Reusable composable query: Returns all active tags for a given entity record.
-- Compose via {{query:"MJ/Tags/Tags For Entity Record"}} and join on RecordID.
-- Parameters: entityName (entity display name), recordID (record primary key)
SELECT
    t.ID AS TagID,
    t.Name AS TagName,
    t.DisplayName AS TagDisplayName,
    t.Description AS TagDescription,
    t.ParentID AS TagParentID,
    tp.DisplayName AS ParentTagDisplayName,
    ti.Weight,
    ti.RecordID,
    ti.__mj_CreatedAt AS TaggedAt
FROM
    __mj.vwTaggedItems ti
    INNER JOIN __mj.vwTags t ON ti.TagID = t.ID
    LEFT JOIN __mj.vwTags tp ON t.ParentID = tp.ID
WHERE
    ti.Entity = {{ entityName | sqlString }}
    AND ti.RecordID = {{ recordID | sqlString }}
    AND t.Status = 'Active'
