-- Reusable composable query: Returns record IDs for a given entity that have a specific tag.
-- Join the output on RecordID to the target entity to enrich with full record data.
-- Parameters: entityName (entity display name), tagName (tag DisplayName to match)
SELECT
    ti.RecordID,
    ti.Weight,
    ti.__mj_CreatedAt AS TaggedAt
FROM
    __mj.vwTaggedItems ti
    INNER JOIN __mj.vwTags t ON ti.TagID = t.ID
WHERE
    ti.Entity = {{ entityName | sqlString }}
    AND t.DisplayName = {{ tagName | sqlString }}
    AND t.Status = 'Active'
