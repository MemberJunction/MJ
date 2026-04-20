-- T-SQL variant for External Change Detection - Detect Deletions
-- TECHNICAL DEBT: Joining on dynamically generated PrimaryKeyJoin (a concatenated string) prevents
-- the use of indexes on the organic table (ot). For massive tables, this will result in a table scan.
-- A future schema change to separate RecordID parts into native columns is recommended.
SELECT 
    rc.RecordID, MAX(rc.ChangedAt) ChangedAt
FROM 
    __mj.vwRecordChanges rc
LEFT JOIN 
    [{{ SchemaName }}].[{{ BaseView }}] ot 
    ON 
    rc.RecordID = {{ PrimaryKeyJoin }}
WHERE 
    {{ PrimaryKeyIsNull }}
    AND 
        rc.EntityID = {{ EntityID | sqlString }} 
    AND 
        rc.Type <> 'Delete'
GROUP BY 
    rc.RecordID
HAVING 
    MAX(CASE WHEN rc.Type = 'Delete' THEN 1 ELSE 0 END) = 0;
