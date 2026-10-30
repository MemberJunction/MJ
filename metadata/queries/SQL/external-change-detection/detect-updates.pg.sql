-- PostgreSQL variant for External Change Detection - Detect Updates
SELECT
    ot.*, ot.{{ UpdatedAtField | sqlIdentifier }} AS "__ecd_UpdatedAt", rc.last_change_time AS "__ecd_LatestRecordChangeAt"
FROM
    {{ SchemaName | sqlIdentifier }}.{{ BaseView | sqlIdentifier }} ot
INNER JOIN (
    SELECT
        RecordID, MAX(ChangedAt) AS last_change_time
    FROM
        __mj.vwRecordChanges
    WHERE
        Type IN ('Update', 'Create') AND EntityID = {{ EntityID | sqlString }}
    GROUP BY
        RecordID
) rc ON {{ PrimaryKeyJoin }} = rc.RecordID
WHERE
    ot.{{ UpdatedAtField | sqlIdentifier }} > COALESCE(rc.last_change_time, CAST('1900-01-01 00:00:00.000' AS TIMESTAMPTZ))
ORDER BY
    {{ PrimaryKeyOrderBy }}
