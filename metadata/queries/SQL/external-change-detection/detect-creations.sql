-- T-SQL variant for External Change Detection - Detect Creations
SELECT
    ot.*, ot.[{{ CreatedAtField }}] AS __ecd_CreatedAt, ot.[{{ UpdatedAtField }}] AS __ecd_UpdatedAt
FROM
    [{{ SchemaName }}].[{{ BaseView }}] ot
LEFT JOIN
    __mj.vwRecordChanges rc
    ON
    ({{ PrimaryKeyJoin }} = rc.RecordID) AND
    rc.Type = 'Create' AND
    rc.EntityID = {{ EntityID | sqlString }}
WHERE
    rc.RecordID IS NULL
ORDER BY
    {{ PrimaryKeyOrderBy }}
