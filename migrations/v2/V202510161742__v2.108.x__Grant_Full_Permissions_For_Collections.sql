-- Migration: Grant full CRUD permissions for Collections entities
-- Description: Updates EntityPermission table to give UI and Developer roles full permissions on MJ: Collections and MJ: Collection Artifacts
-- Author: Generated
-- Date: 2025-10-16

-- Grant full permissions for MJ: Collections to UI role
UPDATE [${flyway:defaultSchema}].[EntityPermission]
SET
    CanRead = 1,
    CanCreate = 1,
    CanUpdate = 1,
    CanDelete = 1
WHERE
    EntityID = 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E' -- MJ: Collections
    AND RoleID = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E'; -- UI role
GO

-- Grant full permissions for MJ: Collections to Developer role
UPDATE [${flyway:defaultSchema}].[EntityPermission]
SET
    CanRead = 1,
    CanCreate = 1,
    CanUpdate = 1,
    CanDelete = 1
WHERE
    EntityID = 'FA0D11D1-4E8D-44D6-8C2B-55EEB3208E3E' -- MJ: Collections
    AND RoleID = 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E'; -- Developer role
GO

-- Grant full permissions for MJ: Collection Artifacts to UI role
UPDATE [${flyway:defaultSchema}].[EntityPermission]
SET
    CanRead = 1,
    CanCreate = 1,
    CanUpdate = 1,
    CanDelete = 1
WHERE
    EntityID = 'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111' -- MJ: Collection Artifacts
    AND RoleID = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E'; -- UI role
GO

-- Grant full permissions for MJ: Collection Artifacts to Developer role
UPDATE [${flyway:defaultSchema}].[EntityPermission]
SET
    CanRead = 1,
    CanCreate = 1,
    CanUpdate = 1,
    CanDelete = 1
WHERE
    EntityID = 'C754B94F-E7BC-4B8E-AD0B-4EC36C9DA111' -- MJ: Collection Artifacts
    AND RoleID = 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E'; -- Developer role
GO
