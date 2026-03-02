-- T-SQL variant for External Change Detection - Detect Creations
SELECT 
    {{ ColumnList }}, ot.[{{ CreatedAtField }}] AS CreatedAt, ot.[{{ UpdatedAtField }}] AS UpdatedAt
FROM 
    [{{ SchemaName }}].[{{ BaseView }}] ot
LEFT JOIN 
    __mj.vwRecordChanges rc 
    ON 
    ({{ PrimaryKeyJoin }} = rc.RecordID) AND 
    rc.Type = 'Create' AND 
    rc.EntityID = {{ EntityID | sqlString }} 
WHERE 
    rc.RecordID IS NULL;
