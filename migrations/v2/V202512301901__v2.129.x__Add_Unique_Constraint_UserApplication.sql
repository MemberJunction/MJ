/*
    Migration: Add unique constraint on UserApplication table

    Prevents duplicate records for the same User + Application combination.
    The UserApplication table tracks which applications a user has access to,
    and each user should only have one record per application.
*/

-- First, remove any existing duplicates (keep the oldest record based on __mj_CreatedAt)
WITH DuplicateCTE AS (
    SELECT
        ID,
        ROW_NUMBER() OVER (
            PARTITION BY UserID, ApplicationID
            ORDER BY __mj_CreatedAt ASC
        ) AS RowNum
    FROM [${flyway:defaultSchema}].[UserApplication]
)
DELETE FROM [${flyway:defaultSchema}].[UserApplication]
WHERE ID IN (
    SELECT ID FROM DuplicateCTE WHERE RowNum > 1
);
GO

-- Add unique constraint on UserID + ApplicationID
PRINT N'Adding unique constraint [UQ_UserApplication_UserID_ApplicationID] on [${flyway:defaultSchema}].[UserApplication]'
GO
ALTER TABLE [${flyway:defaultSchema}].[UserApplication]
ADD CONSTRAINT [UQ_UserApplication_UserID_ApplicationID]
UNIQUE NONCLUSTERED ([UserID], [ApplicationID]);
GO
IF @@ERROR <> 0 SET NOEXEC ON
GO

PRINT N'Unique constraint added successfully'
GO
