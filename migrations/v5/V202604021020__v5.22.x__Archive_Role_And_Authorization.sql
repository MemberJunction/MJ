-- Migration: Create Archivist Role and Archive Authorization
-- Description: Seeds the Authorization, Role, and AuthorizationRole tables
--              with the Archive authorization and Archivist role. Also grants
--              the Archive authorization to the existing Developer role (admin equivalent).

-- 1. Insert the Archive authorization
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[Authorization] WHERE [ID] = 'D3A7F1B2-4C8E-4E6A-9B2D-1F3A5C7E9D0B')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[Authorization]
        ([ID], [ParentID], [Name], [IsActive], [UseAuditLog], [Description])
    VALUES
        ('D3A7F1B2-4C8E-4E6A-9B2D-1F3A5C7E9D0B', NULL, N'Archive', 1, 1, N'Grants access to archive and restore entity records');
END

-- 2. Insert the Archivist role
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[Role] WHERE [ID] = 'E4B8F2C3-5D9F-4F7B-AC3E-2A4B6D8F0E1C')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[Role]
        ([ID], [Name], [Description], [DirectoryID], [SQLName])
    VALUES
        ('E4B8F2C3-5D9F-4F7B-AC3E-2A4B6D8F0E1C', N'Archivist', N'Role for users who can manage and execute archive operations', NULL, NULL);
END

-- 3. Link Archivist role to Archive authorization
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[AuthorizationRole] WHERE [ID] = 'F5C9A3D4-6E0A-4A8C-BD4F-3B5C7E9A1F2D')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[AuthorizationRole]
        ([ID], [AuthorizationID], [RoleID], [Type])
    VALUES
        ('F5C9A3D4-6E0A-4A8C-BD4F-3B5C7E9A1F2D',
         'D3A7F1B2-4C8E-4E6A-9B2D-1F3A5C7E9D0B', -- Archive authorization
         'E4B8F2C3-5D9F-4F7B-AC3E-2A4B6D8F0E1C', -- Archivist role
         N'grant');
END

-- 4. Link Developer role (admin equivalent) to Archive authorization
--    Developer role ID: deafccec-6a37-ef11-86d4-000d3a4e707e (from baseline)
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[AuthorizationRole] WHERE [ID] = 'A6D0B4E5-7F1B-4B9D-CE5A-4C6D8F0B2A3E')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[AuthorizationRole]
        ([ID], [AuthorizationID], [RoleID], [Type])
    VALUES
        ('A6D0B4E5-7F1B-4B9D-CE5A-4C6D8F0B2A3E',
         'D3A7F1B2-4C8E-4E6A-9B2D-1F3A5C7E9D0B', -- Archive authorization
         'deafccec-6a37-ef11-86d4-000d3a4e707e',   -- Developer role (admin equivalent)
         N'grant');
END
