-- =============================================
-- MemberJunction Demo: Recruiting Pipeline
-- HR Schema - Drop Script
-- =============================================
-- This script drops all HR schema objects
-- Run this to completely remove the recruiting pipeline demo schema
-- =============================================

-- Drop tables in reverse dependency order
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'HR.ApplicationNote') AND type in (N'U'))
BEGIN
    DROP TABLE HR.ApplicationNote
    PRINT 'Dropped table HR.ApplicationNote'
END
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'HR.Interview') AND type in (N'U'))
BEGIN
    DROP TABLE HR.Interview
    PRINT 'Dropped table HR.Interview'
END
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'HR.Application') AND type in (N'U'))
BEGIN
    DROP TABLE HR.Application
    PRINT 'Dropped table HR.Application'
END
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'HR.Candidate') AND type in (N'U'))
BEGIN
    DROP TABLE HR.Candidate
    PRINT 'Dropped table HR.Candidate'
END
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'HR.JobRequisition') AND type in (N'U'))
BEGIN
    DROP TABLE HR.JobRequisition
    PRINT 'Dropped table HR.JobRequisition'
END
GO

-- Optionally drop the schema itself (uncomment if needed)
-- IF EXISTS (SELECT * FROM sys.schemas WHERE name = 'HR')
-- BEGIN
--     DROP SCHEMA HR
--     PRINT 'Dropped schema HR'
-- END
-- GO

PRINT 'HR Schema drop completed'
GO
