-- =============================================
-- Events Schema - Drop All Tables
-- Drops all Events schema tables in reverse dependency order
-- Run this before re-running Events Schema
-- =============================================

PRINT 'Dropping all Events Schema tables in dependency order...';
PRINT '';

-- =============================================
-- Drop dependent tables first (junction and child tables)
-- =============================================
PRINT 'Dropping Events Schema dependent tables...';

-- Drop EventReviewTask table (depends on Event, Submission, Contact)
IF OBJECT_ID('Events.EventReviewTask', 'U') IS NOT NULL
BEGIN
    DROP TABLE Events.EventReviewTask;
    PRINT '  - Dropped Events.EventReviewTask';
END

-- Drop SubmissionNotification table (depends on Submission)
IF OBJECT_ID('Events.SubmissionNotification', 'U') IS NOT NULL
BEGIN
    DROP TABLE Events.SubmissionNotification;
    PRINT '  - Dropped Events.SubmissionNotification';
END

-- Drop SubmissionReview table (depends on Submission, Contact)
IF OBJECT_ID('Events.SubmissionReview', 'U') IS NOT NULL
BEGIN
    DROP TABLE Events.SubmissionReview;
    PRINT '  - Dropped Events.SubmissionReview';
END

-- Drop SubmissionSpeaker junction table (depends on Submission and Speaker)
IF OBJECT_ID('Events.SubmissionSpeaker', 'U') IS NOT NULL
BEGIN
    DROP TABLE Events.SubmissionSpeaker;
    PRINT '  - Dropped Events.SubmissionSpeaker';
END

PRINT 'Events Schema dependent tables dropped.';
PRINT '';

-- =============================================
-- Drop core tables
-- =============================================
PRINT 'Dropping Events Schema core tables...';

-- Drop Submission table (depends on Event)
IF OBJECT_ID('Events.Submission', 'U') IS NOT NULL
BEGIN
    DROP TABLE Events.Submission;
    PRINT '  - Dropped Events.Submission';
END

-- Drop Speaker table (depends on Contact from CRM)
IF OBJECT_ID('Events.Speaker', 'U') IS NOT NULL
BEGIN
    DROP TABLE Events.Speaker;
    PRINT '  - Dropped Events.Speaker';
END

-- Drop Event table (depends on Account and Contact from CRM, self-referencing)
IF OBJECT_ID('Events.Event', 'U') IS NOT NULL
BEGIN
    DROP TABLE Events.Event;
    PRINT '  - Dropped Events.Event';
END

PRINT 'Events Schema core tables dropped.';
PRINT '';

-- =============================================
-- Optionally drop the Events schema if empty
-- =============================================
BEGIN TRY
    IF EXISTS (SELECT * FROM sys.schemas WHERE name = 'Events')
    BEGIN
        -- Check if there are any remaining objects in the schema
        IF NOT EXISTS (
            SELECT * FROM sys.objects
            WHERE schema_id = SCHEMA_ID('Events')
        )
        BEGIN
            EXEC('DROP SCHEMA Events');
            PRINT 'Events Schema dropped.';
        END
        ELSE
        BEGIN
            PRINT 'Events Schema not dropped - other objects still exist in schema.';
            PRINT 'Remaining objects:';
            SELECT
                o.type_desc AS ObjectType,
                o.name AS ObjectName
            FROM sys.objects o
            WHERE o.schema_id = SCHEMA_ID('Events')
            ORDER BY o.type_desc, o.name;
        END
    END
END TRY
BEGIN CATCH
    PRINT 'Could not drop Events schema: ' + ERROR_MESSAGE();
END CATCH

PRINT '';
PRINT '=============================================';
PRINT 'Events Schema cleanup complete.';
PRINT '';
PRINT 'You can now run:';
PRINT '  - Events Schema - Abstract Submission Management.sql';
PRINT '';
PRINT 'Note: Events schema requires CRM Schema 1 to be installed';
PRINT '      (foreign keys reference CRM.Account and CRM.Contact)';
PRINT '=============================================';
