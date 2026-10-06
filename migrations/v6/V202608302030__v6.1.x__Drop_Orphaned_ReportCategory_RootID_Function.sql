/*
    Drop fnReportCategoryParentID_GetRootID — an orphan of the removed ReportCategory table.

    The ReportCategory table was dropped in an earlier version, but this inline
    table-valued function, which depends on it, was left behind. A function whose
    referenced table no longer exists breaks Azure SQL's database export (bacpac)
    process: the export validates every module and fails on the dangling reference,
    so any installation carrying this orphan cannot be exported.

    Guarded so installations where it was already removed by hand (or never existed)
    are unaffected — applying this migration to a clean database is a no-op.
*/
IF OBJECT_ID('[${flyway:defaultSchema}].[fnReportCategoryParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnReportCategoryParentID_GetRootID];
