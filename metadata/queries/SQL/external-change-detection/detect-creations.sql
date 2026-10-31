-- T-SQL variant for External Change Detection - Detect Creations
SELECT
    ot.*, ot.{{ CreatedAtField | sqlIdentifier }} AS __ecd_CreatedAt, ot.{{ UpdatedAtField | sqlIdentifier }} AS __ecd_UpdatedAt
FROM
    {{ SchemaName | sqlIdentifier }}.{{ BaseView | sqlIdentifier }} ot
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
