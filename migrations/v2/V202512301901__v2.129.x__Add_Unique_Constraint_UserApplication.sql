/*
    Migration: Add unique constraint on UserApplication table

    Purpose:
    --------
    Prevents duplicate records for the same User + Application combination.
    The UserApplication table tracks which applications a user has access to,
    and each user should only have one record per application.

    Process:
    --------
    1. Identify duplicate UserApplication records (keeping the oldest by __mj_CreatedAt)
    2. Delete any UserApplicationEntity records linked to the duplicates
       (UserApplicationEntity has a foreign key to UserApplication)
    3. Delete the duplicate UserApplication records
    4. Add the unique constraint to prevent future duplicates
*/

-- Step 1: Create a temp table to hold the IDs of duplicate UserApplication records
-- We keep the oldest record (RowNum = 1) and mark all others as duplicates (RowNum > 1)
PRINT N'Identifying duplicate UserApplication records...'
GO

CREATE TABLE #DuplicateUserApplications (
    ID UNIQUEIDENTIFIER PRIMARY KEY
);
GO

WITH DuplicateCTE AS (
    SELECT
        ID,
        ROW_NUMBER() OVER (
            PARTITION BY UserID, ApplicationID
            ORDER BY __mj_CreatedAt ASC  -- Keep the oldest record
        ) AS RowNum
    FROM [${flyway:defaultSchema}].[UserApplication]
)
INSERT INTO #DuplicateUserApplications (ID)
SELECT ID FROM DuplicateCTE WHERE RowNum > 1;
GO

-- Log how many duplicates were found
DECLARE @DuplicateCount INT = (SELECT COUNT(*) FROM #DuplicateUserApplications);
PRINT N'Found ' + CAST(@DuplicateCount AS NVARCHAR(10)) + N' duplicate UserApplication record(s) to remove.';
GO

-- Step 2: Delete UserApplicationEntity records that reference the duplicate UserApplication records
-- This must happen BEFORE deleting the parent UserApplication records due to FK constraint
PRINT N'Deleting UserApplicationEntity records linked to duplicate UserApplication records...'
GO

DELETE FROM [${flyway:defaultSchema}].[UserApplicationEntity]
WHERE UserApplicationID IN (SELECT ID FROM #DuplicateUserApplications);
GO

DECLARE @DeletedEntityCount INT = @@ROWCOUNT;
PRINT N'Deleted ' + CAST(@DeletedEntityCount AS NVARCHAR(10)) + N' UserApplicationEntity record(s).';
GO

-- Step 3: Delete the duplicate UserApplication records
PRINT N'Deleting duplicate UserApplication records...'
GO

DELETE FROM [${flyway:defaultSchema}].[UserApplication]
WHERE ID IN (SELECT ID FROM #DuplicateUserApplications);
GO

DECLARE @DeletedAppCount INT = @@ROWCOUNT;
PRINT N'Deleted ' + CAST(@DeletedAppCount AS NVARCHAR(10)) + N' duplicate UserApplication record(s).';
GO

-- Clean up temp table
DROP TABLE #DuplicateUserApplications;
GO

-- Step 4: Add the unique constraint to prevent future duplicates
-- This ensures each user can only have one record per application going forward
PRINT N'Adding unique constraint [UQ_UserApplication_UserID_ApplicationID] on [${flyway:defaultSchema}].[UserApplication]'
GO

ALTER TABLE [${flyway:defaultSchema}].[UserApplication]
ADD CONSTRAINT [UQ_UserApplication_UserID_ApplicationID]
UNIQUE NONCLUSTERED ([UserID], [ApplicationID]);
GO

-- Abort remaining statements if constraint creation failed
IF @@ERROR <> 0 SET NOEXEC ON
GO

PRINT N'Migration completed successfully - unique constraint added.'
GO
