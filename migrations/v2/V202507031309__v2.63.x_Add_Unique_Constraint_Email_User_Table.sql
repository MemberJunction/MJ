/*
 * Migration: Add unique constraint on Email field in __mj.[User] table
 * Version: 2.63.x
 * 
 * This migration adds a unique constraint to ensure email addresses are unique across all users.
 * Before adding the constraint, it checks for duplicate emails and fails with instructions if any are found.
 */

-- First, check for duplicate emails in the User table
DECLARE @DuplicateCount INT;
DECLARE @DuplicateEmails TABLE (
    Email NVARCHAR(255),
    UserCount INT
);

-- Find all duplicate emails
INSERT INTO @DuplicateEmails (Email, UserCount)
SELECT Email, COUNT(*) AS UserCount
FROM [${flyway:defaultSchema}].[User]
WHERE Email IS NOT NULL
GROUP BY Email
HAVING COUNT(*) > 1;

-- Get the count of duplicate emails
SELECT @DuplicateCount = COUNT(*) FROM @DuplicateEmails;

-- If duplicates exist, display them and fail the migration
IF @DuplicateCount > 0
BEGIN
    PRINT '';
    PRINT '========================================================================================================';
    PRINT 'ERROR: DUPLICATE EMAILS FOUND IN USER TABLE';
    PRINT '========================================================================================================';
    PRINT '';
    PRINT 'This migration cannot proceed because duplicate email addresses were found in the [User] table.';
    PRINT 'A unique constraint cannot be added until these duplicates are resolved.';
    PRINT '';
    PRINT 'DUPLICATE EMAILS FOUND:';
    PRINT '-----------------------';
    
    -- Display the duplicate emails with their counts
    DECLARE @Email NVARCHAR(255);
    DECLARE @Count INT;
    DECLARE duplicate_cursor CURSOR FOR 
        SELECT Email, UserCount FROM @DuplicateEmails ORDER BY UserCount DESC, Email;
    
    OPEN duplicate_cursor;
    FETCH NEXT FROM duplicate_cursor INTO @Email, @Count;
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        PRINT 'Email: ' + @Email + ' - Found ' + CAST(@Count AS NVARCHAR(10)) + ' times';
        FETCH NEXT FROM duplicate_cursor INTO @Email, @Count;
    END;
    
    CLOSE duplicate_cursor;
    DEALLOCATE duplicate_cursor;
    
    PRINT '';
    PRINT 'DETAILED USER RECORDS WITH DUPLICATE EMAILS:';
    PRINT '--------------------------------------------';
    
    -- Show all user records with duplicate emails
    SELECT 
        u.ID,
        u.Name,
        u.Email,
        u.Type,
        u.IsActive,
        u.__mj_CreatedAt,
        u.__mj_UpdatedAt
    FROM [${flyway:defaultSchema}].[User] u
    INNER JOIN @DuplicateEmails d ON u.Email = d.Email
    ORDER BY u.Email, u.__mj_CreatedAt;
    
    PRINT '';
    PRINT 'INSTRUCTIONS TO RESOLVE:';
    PRINT '------------------------';
    PRINT '1. Review the duplicate user records shown above';
    PRINT '2. Determine which user record(s) should be kept for each duplicate email';
    PRINT '3. Options for resolution:';
    PRINT '   a) Update the email addresses of duplicate users to make them unique';
    PRINT '   b) Merge the duplicate user records (ensure all related data is properly reassigned)';
    PRINT '   c) Delete the duplicate user records (only if they have no related data)';
    PRINT '4. After resolving all duplicates, run this migration again';
    PRINT '';
    PRINT 'Example SQL to update a duplicate email:';
    PRINT '  UPDATE [__mj].[User] SET Email = ''user.surname@domain.com'' WHERE ID = ''[user-id-here]'';';
    PRINT '';
    PRINT 'Example SQL to check for related data before deletion:';
    PRINT '  SELECT * FROM [__mj].[UserApplication] WHERE UserID = ''[user-id-here]'';';
    PRINT '  SELECT * FROM [__mj].[UserRole] WHERE UserID = ''[user-id-here]'';';
    PRINT '';
    PRINT '========================================================================================================';
    
    -- Fail the migration
    RAISERROR('Migration failed due to duplicate email addresses in the User table. See detailed instructions above.', 16, 1);
    RETURN;
END;

-- If no duplicates found, proceed with adding the unique constraint
PRINT 'No duplicate emails found. Adding unique constraint...';

-- Add the unique constraint on the Email column
IF NOT EXISTS (
    SELECT 1 
    FROM sys.indexes 
    WHERE name = 'UQ_User_Email' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[User]')
)
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[User]
    ADD CONSTRAINT UQ_User_Email UNIQUE (Email);
    
    PRINT 'Successfully added unique constraint UQ_User_Email on [User].[Email]';
END
ELSE
BEGIN
    PRINT 'Unique constraint UQ_User_Email already exists on [User].[Email]';
END;

-- Add extended property to document the constraint
IF NOT EXISTS (
    SELECT 1 
    FROM sys.extended_properties ep
    WHERE ep.major_id = OBJECT_ID('[${flyway:defaultSchema}].[User]')
    AND ep.minor_id = (
        SELECT column_id 
        FROM sys.columns 
        WHERE object_id = OBJECT_ID('[${flyway:defaultSchema}].[User]') 
        AND name = 'Email'
    )
    AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_addextendedproperty 
        @name = N'MS_Description', 
        @value = N'Unique email address for the user. This field must be unique across all users in the system.', 
        @level0type = N'SCHEMA', @level0name = N'__mj',
        @level1type = N'TABLE',  @level1name = N'User',
        @level2type = N'COLUMN', @level2name = N'Email';
END
ELSE
BEGIN
    EXEC sp_updateextendedproperty 
        @name = N'MS_Description', 
        @value = N'Unique email address for the user. This field must be unique across all users in the system.', 
        @level0type = N'SCHEMA', @level0name = N'__mj',
        @level1type = N'TABLE',  @level1name = N'User',
        @level2type = N'COLUMN', @level2name = N'Email';
END;

PRINT '';
PRINT 'Migration completed successfully!';