-- Update User Year Summary card view to display User name instead of TopGenre
-- This changes the NameField for the User Year Summaries entity

USE [MJ_Local];
GO

PRINT '================================================';
PRINT 'Updating User Year Summary Card View Configuration';
PRINT '================================================';
PRINT '';

-- Update the NameField for User Year Summaries entity to use 'User' field
-- The 'User' field comes from the vwUserYearSummaries view which joins to __mj.User table
UPDATE [__mj].[Entity]
SET
    [NameField] = 'User',
    [__mj_UpdatedAt] = GETUTCDATE()
WHERE
    [ID] = '2bcb3c57-c4e4-4ee1-9fda-39f70141e48d'  -- User Year Summaries entity
    AND [Name] = 'User Year Summaries'
    AND [SchemaName] = 'spotify';

PRINT '✅ Updated NameField for User Year Summaries entity to use User name';
PRINT '';

GO
