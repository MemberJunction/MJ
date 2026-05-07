-- PostgreSQL: Bulk lookup of RecordGeoCode rows for a single entity.
-- Returns lightweight fields needed for staleness checking and existence filtering.
-- Used by ScheduledGeocodingAction to eliminate per-record SQL queries.
SELECT
    rgc."ID",
    rgc."RecordID",
    rgc."LocationType",
    rgc."SourceFieldHash",
    rgc."Status"
FROM
    __mj."vwRecordGeoCodes" rgc
WHERE
    rgc."EntityID" = {{ EntityID | sqlString }}
ORDER BY
    rgc."RecordID"
