-- T-SQL variant for External Change Detection - Detect Updates
SELECT
    ot.*, ot.[{{ UpdatedAtField }}] AS __ecd_UpdatedAt, rc.last_change_time __ecd_LatestRecordChangeAt
FROM
    [{{ SchemaName }}].[{{ BaseView }}] ot
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
    ot.[{{ UpdatedAtField }}] > COALESCE(rc.last_change_time, '1900-01-01 00:00:00.000')
ORDER BY
    {{ PrimaryKeyOrderBy }}
