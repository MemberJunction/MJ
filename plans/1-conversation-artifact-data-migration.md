# Plan 1: Conversation Artifact Data Migration

## Overview

This document outlines the **one-time database migration** for moving from the legacy **ConversationArtifact/ConversationArtifactVersion** system to the new **Artifact/ArtifactVersion** architecture.

**Migration Type**: Database schema + data migration
**Estimated Effort**: 2-3 hours (script development + testing + execution)
**Risk Level**: Medium (large data migration, but old data preserved as safety net)
**Downtime Required**: None (runs as standard Flyway migration)

**Related Plans**:
- [Plan 2: Component Studio Improvements](./2-component-studio-improvements.md) - UI changes (separate implementation)
- [Plan 3: Component Artifact Viewer Improvements](./3-component-artifact-viewer-improvements.md) - Viewer plugin (separate implementation)

---

## Background

### Legacy System (skip-chat)
- **ConversationArtifact** - Artifact metadata tied to conversations
- **ConversationArtifactVersion** - Versioned content
- **ConversationArtifactPermission** - User permissions (Read/Edit/Owner levels)
- **ConversationDetail.ArtifactID** - Direct FK (1:1, deprecated pattern)
- **ConversationDetail.ArtifactVersionID** - Direct FK (1:1, deprecated pattern)

### New System (conversations)
- **Artifact** - Universal artifact storage (environment-scoped, not conversation-specific)
- **ArtifactVersion** - Versioned content with SHA-256 ContentHash
- **ConversationDetailArtifact** - M:M junction table (ConversationDetail ↔ ArtifactVersion)
- **ArtifactPermission** - User permissions (new table, to be created)

---

## Migration Goals

1. ✅ Migrate all ConversationArtifact → Artifact (preserve UUIDs)
2. ✅ Migrate all ConversationArtifactVersion → ArtifactVersion (preserve UUIDs)
3. ✅ Create ConversationDetailArtifact M:M links
4. ✅ Create ArtifactPermission table + migrate permissions
5. ✅ Mark deprecated entities/fields in MJ metadata
6. ✅ Zero data loss, preserve all timestamps

---

## Schema Mappings

### ConversationArtifact → Artifact

| Old Field | New Field | Strategy |
|-----------|-----------|----------|
| `ID` | `ID` | **Preserve UUID** |
| `Name` | `Name` | Direct copy |
| `Description` | `Description` | Direct copy |
| `ArtifactTypeID` | `TypeID` | Direct copy |
| `Comments` | `Comments` | Direct copy |
| `ConversationID` | ❌ | Not stored (use ConversationDetailArtifact junction) |
| `SharingScope` | ❌ | Replaced by ArtifactPermission table |
| `__mj_CreatedAt` | `__mj_CreatedAt` | Preserve |
| `__mj_UpdatedAt` | `__mj_UpdatedAt` | Preserve |
| ❌ | `EnvironmentID` | Set to default environment |
| ❌ | `UserID` | Infer from Conversation.UserID |

### ConversationArtifactVersion → ArtifactVersion

| Old Field | New Field | Strategy |
|-----------|-----------|----------|
| `ID` | `ID` | **Preserve UUID** |
| `ConversationArtifactID` | `ArtifactID` | Direct copy (UUID preserved) |
| `Version` | `VersionNumber` | Direct copy (renamed field) |
| `Configuration` | `Configuration` | Direct copy |
| `Content` | `Content` | Direct copy |
| `Comments` | `Comments` | Direct copy |
| `__mj_CreatedAt` | `__mj_CreatedAt` | Preserve |
| `__mj_UpdatedAt` | `__mj_UpdatedAt` | Preserve |
| ❌ | `UserID` | Infer from Conversation.UserID |
| ❌ | `ContentHash` | Generate SHA-256 from Content |
| ❌ | `Name` | Copy from parent Artifact.Name |
| ❌ | `Description` | Copy from parent Artifact.Description |

### ConversationArtifactPermission → ArtifactPermission

| Old Field | New Field | Strategy |
|-----------|-----------|----------|
| `ConversationArtifactID` | `ArtifactID` | Direct copy (UUID preserved) |
| `UserID` | `UserID` | Direct copy |
| `AccessLevel = 'Read'` | `CanRead=1, CanEdit=0, CanDelete=0, CanShare=0` | Map to granular permissions |
| `AccessLevel = 'Edit'` | `CanRead=1, CanEdit=1, CanDelete=0, CanShare=0` | Map to granular permissions |
| `AccessLevel = 'Owner'` | `CanRead=1, CanEdit=1, CanDelete=1, CanShare=1` | Map to granular permissions |
| ❌ | `SharedByUserID` | NULL (legacy didn't track) |

---

## Pre-Migration Tasks

### 1. Create ArtifactPermission Table

```sql
CREATE TABLE [__mj].[ArtifactPermission] (
    [ID] UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    [ArtifactID] UNIQUEIDENTIFIER NOT NULL,
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [CanRead] BIT NOT NULL DEFAULT 1,
    [CanEdit] BIT NOT NULL DEFAULT 0,
    [CanDelete] BIT NOT NULL DEFAULT 0,
    [CanShare] BIT NOT NULL DEFAULT 0,
    [SharedByUserID] UNIQUEIDENTIFIER NULL,
    [__mj_CreatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT [FK_ArtifactPermission_ArtifactID] FOREIGN KEY ([ArtifactID])
        REFERENCES [__mj].[Artifact]([ID]),
    CONSTRAINT [FK_ArtifactPermission_UserID] FOREIGN KEY ([UserID])
        REFERENCES [__mj].[User]([ID]),
    CONSTRAINT [FK_ArtifactPermission_SharedByUserID] FOREIGN KEY ([SharedByUserID])
        REFERENCES [__mj].[User]([ID])
);

CREATE INDEX [IX_ArtifactPermission_ArtifactID] ON [__mj].[ArtifactPermission]([ArtifactID]);
CREATE INDEX [IX_ArtifactPermission_UserID] ON [__mj].[ArtifactPermission]([UserID]);
```

### 2. Run CodeGen

After creating the table:
```bash
# Run CodeGen to generate ArtifactPermission entity class
npm run codegen
```

This generates:
- `ArtifactPermissionEntity` in entity_subclasses.ts
- Database views and stored procedures
- GraphQL schema

---

## Migration Script

**File**: `migrations/v2/VYYYYMMDDHHMM__v2.x.x_Migrate_Conversation_Artifacts.sql`

```sql
-- ============================================================================
-- MemberJunction Conversation Artifact Data Migration
-- Migrates legacy ConversationArtifact system to new Artifact architecture
-- ============================================================================

SET NOCOUNT ON;
SET XACT_ABORT ON; -- Automatic rollback on error

BEGIN TRANSACTION;

DECLARE @DefaultEnvironmentID UNIQUEIDENTIFIER;
DECLARE @MigrationTimestamp DATETIMEOFFSET = GETUTCDATE();
DECLARE @MigratedCount INT = 0;

-- ============================================================================
-- STEP 1: Get Default Environment ID
-- ============================================================================
SELECT TOP 1 @DefaultEnvironmentID = ID
FROM [__mj].[Environment]
ORDER BY
    CASE WHEN [Name] = 'Default' THEN 0 ELSE 1 END,
    __mj_CreatedAt ASC;

IF @DefaultEnvironmentID IS NULL
BEGIN
    RAISERROR('No default environment found. Migration aborted.', 16, 1);
    ROLLBACK TRANSACTION;
    RETURN;
END

PRINT 'Using Environment ID: ' + CAST(@DefaultEnvironmentID AS NVARCHAR(50));

-- ============================================================================
-- STEP 2: Create Temporary Tracking Table
-- ============================================================================
IF OBJECT_ID('tempdb..#MigratedArtifacts') IS NOT NULL DROP TABLE #MigratedArtifacts;

CREATE TABLE #MigratedArtifacts (
    ArtifactID UNIQUEIDENTIFIER NOT NULL,
    PRIMARY KEY (ArtifactID)
);

-- ============================================================================
-- STEP 3: Migrate ConversationArtifact → Artifact
-- ============================================================================
PRINT 'Migrating ConversationArtifact → Artifact...';

INSERT INTO [__mj].[Artifact] (
    [ID],
    [EnvironmentID],
    [Name],
    [Description],
    [TypeID],
    [Comments],
    [UserID],
    [__mj_CreatedAt],
    [__mj_UpdatedAt]
)
OUTPUT inserted.[ID] INTO #MigratedArtifacts (ArtifactID)
SELECT
    ca.[ID], -- Preserve UUID
    @DefaultEnvironmentID AS [EnvironmentID],
    ca.[Name],
    ca.[Description],
    ca.[ArtifactTypeID] AS [TypeID],
    ca.[Comments],
    COALESCE(c.[UserID], c.[OverrideUserID]) AS [UserID],
    ca.[__mj_CreatedAt],
    ca.[__mj_UpdatedAt]
FROM [__mj].[ConversationArtifact] ca
INNER JOIN [__mj].[Conversation] c ON c.[ID] = ca.[ConversationID];

SET @MigratedCount = @@ROWCOUNT;
PRINT 'Migrated ' + CAST(@MigratedCount AS NVARCHAR(10)) + ' artifacts';

-- ============================================================================
-- STEP 4: Migrate ConversationArtifactVersion → ArtifactVersion
-- ============================================================================
PRINT 'Migrating ConversationArtifactVersion → ArtifactVersion...';

INSERT INTO [__mj].[ArtifactVersion] (
    [ID],
    [ArtifactID],
    [VersionNumber],
    [Content],
    [Configuration],
    [Comments],
    [UserID],
    [ContentHash],
    [Name],
    [Description],
    [__mj_CreatedAt],
    [__mj_UpdatedAt]
)
SELECT
    cav.[ID], -- Preserve UUID
    cav.[ConversationArtifactID] AS [ArtifactID],
    cav.[Version] AS [VersionNumber],
    cav.[Content],
    cav.[Configuration],
    cav.[Comments],
    COALESCE(c.[UserID], c.[OverrideUserID]) AS [UserID],
    -- Generate SHA-256 hash if Content exists
    CASE
        WHEN cav.[Content] IS NOT NULL
        THEN CONVERT(NVARCHAR(500), HASHBYTES('SHA2_256', cav.[Content]), 2)
        ELSE NULL
    END AS [ContentHash],
    ca.[Name],
    ca.[Description],
    cav.[__mj_CreatedAt],
    cav.[__mj_UpdatedAt]
FROM [__mj].[ConversationArtifactVersion] cav
INNER JOIN [__mj].[ConversationArtifact] ca ON ca.[ID] = cav.[ConversationArtifactID]
INNER JOIN [__mj].[Conversation] c ON c.[ID] = ca.[ConversationID];

SET @MigratedCount = @@ROWCOUNT;
PRINT 'Migrated ' + CAST(@MigratedCount AS NVARCHAR(10)) + ' artifact versions';

-- ============================================================================
-- STEP 5: Create ConversationDetailArtifact M:M Links
-- ============================================================================
PRINT 'Creating ConversationDetailArtifact links...';

INSERT INTO [__mj].[ConversationDetailArtifact] (
    [ConversationDetailID],
    [ArtifactVersionID],
    [Direction],
    [__mj_CreatedAt],
    [__mj_UpdatedAt]
)
SELECT DISTINCT
    cd.[ID] AS [ConversationDetailID],
    cd.[ArtifactVersionID], -- UUID preserved
    'Output' AS [Direction], -- All legacy artifacts are outputs
    cd.[__mj_CreatedAt],
    cd.[__mj_UpdatedAt]
FROM [__mj].[ConversationDetail] cd
WHERE cd.[ArtifactVersionID] IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM [__mj].[ConversationDetailArtifact] existing
      WHERE existing.[ConversationDetailID] = cd.[ID]
        AND existing.[ArtifactVersionID] = cd.[ArtifactVersionID]
  );

SET @MigratedCount = @@ROWCOUNT;
PRINT 'Created ' + CAST(@MigratedCount AS NVARCHAR(10)) + ' conversation-artifact links';

-- ============================================================================
-- STEP 6: Migrate ConversationArtifactPermission → ArtifactPermission
-- ============================================================================
PRINT 'Migrating permissions...';

INSERT INTO [__mj].[ArtifactPermission] (
    [ArtifactID],
    [UserID],
    [CanRead],
    [CanEdit],
    [CanDelete],
    [CanShare],
    [SharedByUserID],
    [__mj_CreatedAt],
    [__mj_UpdatedAt]
)
SELECT
    cap.[ConversationArtifactID] AS [ArtifactID],
    cap.[UserID],
    1 AS [CanRead],
    CASE WHEN cap.[AccessLevel] IN ('Edit', 'Owner') THEN 1 ELSE 0 END AS [CanEdit],
    CASE WHEN cap.[AccessLevel] = 'Owner' THEN 1 ELSE 0 END AS [CanDelete],
    CASE WHEN cap.[AccessLevel] = 'Owner' THEN 1 ELSE 0 END AS [CanShare],
    NULL AS [SharedByUserID],
    cap.[__mj_CreatedAt],
    cap.[__mj_UpdatedAt]
FROM [__mj].[ConversationArtifactPermission] cap
WHERE NOT EXISTS (
    SELECT 1 FROM [__mj].[ArtifactPermission] existing
    WHERE existing.[ArtifactID] = cap.[ConversationArtifactID]
      AND existing.[UserID] = cap.[UserID]
);

SET @MigratedCount = @@ROWCOUNT;
PRINT 'Migrated ' + CAST(@MigratedCount AS NVARCHAR(10)) + ' permissions';

-- ============================================================================
-- STEP 7: Mark Deprecated Fields in Metadata
-- ============================================================================
PRINT 'Marking deprecated fields...';

UPDATE [__mj].[EntityField]
SET
    [Status] = 'Deprecated',
    [Description] = COALESCE([Description], '') +
        ' [DEPRECATED: Migrated to ConversationDetailArtifact M:M table. Use ConversationDetailArtifact junction instead.]'
WHERE [EntityID] IN (
    SELECT [ID] FROM [__mj].[Entity] WHERE [Name] = 'Conversation Details'
)
AND [Name] IN ('ArtifactID', 'ArtifactVersionID');

-- ============================================================================
-- STEP 8: Mark Deprecated Entities in Metadata
-- ============================================================================
PRINT 'Marking deprecated entities...';

UPDATE [__mj].[Entity]
SET
    [Status] = 'Deprecated',
    [Description] = COALESCE([Description], '') +
        ' [DEPRECATED: Migrated to Artifact/ArtifactVersion tables. Data preserved in migration.]'
WHERE [Name] IN (
    'MJ: Conversation Artifacts',
    'MJ: Conversation Artifact Versions',
    'MJ: Conversation Artifact Permissions'
);

-- ============================================================================
-- STEP 9: Validation
-- ============================================================================
PRINT '';
PRINT '=== Migration Validation ===';

DECLARE @OldArtifactCount INT, @NewArtifactCount INT;
DECLARE @OldVersionCount INT, @NewVersionCount INT;
DECLARE @OldPermissionCount INT, @NewPermissionCount INT;
DECLARE @ConversationDetailLinkCount INT;

SELECT @OldArtifactCount = COUNT(*) FROM [__mj].[ConversationArtifact];
SELECT @NewArtifactCount = COUNT(*) FROM [__mj].[Artifact]
    WHERE [ID] IN (SELECT [ArtifactID] FROM #MigratedArtifacts);
PRINT 'Artifacts: ' + CAST(@OldArtifactCount AS NVARCHAR(10)) + ' old → ' +
      CAST(@NewArtifactCount AS NVARCHAR(10)) + ' new';

SELECT @OldVersionCount = COUNT(*) FROM [__mj].[ConversationArtifactVersion];
SELECT @NewVersionCount = COUNT(*) FROM [__mj].[ArtifactVersion]
    WHERE [ArtifactID] IN (SELECT [ArtifactID] FROM #MigratedArtifacts);
PRINT 'Versions: ' + CAST(@OldVersionCount AS NVARCHAR(10)) + ' old → ' +
      CAST(@NewVersionCount AS NVARCHAR(10)) + ' new';

SELECT @OldPermissionCount = COUNT(*) FROM [__mj].[ConversationArtifactPermission];
SELECT @NewPermissionCount = COUNT(*) FROM [__mj].[ArtifactPermission]
    WHERE [ArtifactID] IN (SELECT [ArtifactID] FROM #MigratedArtifacts);
PRINT 'Permissions: ' + CAST(@OldPermissionCount AS NVARCHAR(10)) + ' old → ' +
      CAST(@NewPermissionCount AS NVARCHAR(10)) + ' new';

SELECT @ConversationDetailLinkCount = COUNT(*)
FROM [__mj].[ConversationDetailArtifact] cda
INNER JOIN [__mj].[ArtifactVersion] av ON av.[ID] = cda.[ArtifactVersionID]
WHERE av.[ArtifactID] IN (SELECT [ArtifactID] FROM #MigratedArtifacts);
PRINT 'Conversation links: ' + CAST(@ConversationDetailLinkCount AS NVARCHAR(10));

-- Validation checks
IF @OldArtifactCount <> @NewArtifactCount
BEGIN
    RAISERROR('Artifact count mismatch!', 16, 1);
    ROLLBACK TRANSACTION;
    RETURN;
END

IF @OldVersionCount <> @NewVersionCount
BEGIN
    RAISERROR('Version count mismatch!', 16, 1);
    ROLLBACK TRANSACTION;
    RETURN;
END

PRINT '';
PRINT '✓ All validation checks passed';

-- ============================================================================
-- STEP 10: Cleanup
-- ============================================================================
DROP TABLE #MigratedArtifacts;

COMMIT TRANSACTION;

PRINT '';
PRINT '=== Migration Completed Successfully ===';
PRINT 'Timestamp: ' + CONVERT(NVARCHAR(30), @MigrationTimestamp, 120);
```

---

## Post-Migration Steps

### 1. Run CodeGen (Again)
After migration completes, run CodeGen to update entity metadata:
```bash
npm run codegen
```

### 2. Validate Data Integrity

```sql
-- No orphaned old artifacts
SELECT COUNT(*) FROM [__mj].[ConversationArtifact] ca
WHERE NOT EXISTS (
    SELECT 1 FROM [__mj].[Artifact] a WHERE a.[ID] = ca.[ID]
);
-- Expected: 0

-- All conversation links migrated
SELECT COUNT(*) FROM [__mj].[ConversationDetail] cd
WHERE cd.[ArtifactVersionID] IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM [__mj].[ConversationDetailArtifact] cda
      WHERE cda.[ConversationDetailID] = cd.[ID]
        AND cda.[ArtifactVersionID] = cd.[ArtifactVersionID]
  );
-- Expected: 0

-- Permissions preserved
SELECT ca.[Name], COUNT(DISTINCT cap.[UserID]) AS OldPerms, COUNT(DISTINCT ap.[UserID]) AS NewPerms
FROM [__mj].[ConversationArtifact] ca
LEFT JOIN [__mj].[ConversationArtifactPermission] cap ON cap.[ConversationArtifactID] = ca.[ID]
LEFT JOIN [__mj].[ArtifactPermission] ap ON ap.[ArtifactID] = ca.[ID]
GROUP BY ca.[Name]
HAVING COUNT(DISTINCT cap.[UserID]) <> COUNT(DISTINCT ap.[UserID]);
-- Expected: 0 rows
```

### 3. Monitor Application

- Watch error logs for references to deprecated entities
- Verify conversations UI still displays artifacts correctly
- Check permissions are enforced properly

---

## Rollback Strategy

**Before Commit**: Transaction automatically rolls back on error

**After Commit**: Manual rollback (use with caution):

```sql
-- Delete migrated data
DELETE FROM [__mj].[ConversationDetailArtifact]
WHERE ArtifactVersionID IN (
    SELECT ID FROM [__mj].[ArtifactVersion]
    WHERE __mj_CreatedAt >= '<migration_timestamp>'
);

DELETE FROM [__mj].[ArtifactPermission]
WHERE ArtifactID IN (
    SELECT ID FROM [__mj].[Artifact]
    WHERE __mj_CreatedAt >= '<migration_timestamp>'
);

DELETE FROM [__mj].[ArtifactVersion]
WHERE __mj_CreatedAt >= '<migration_timestamp>';

DELETE FROM [__mj].[Artifact]
WHERE __mj_CreatedAt >= '<migration_timestamp>';

-- Restore metadata
UPDATE [__mj].[Entity] SET [Status] = 'Active'
WHERE [Name] IN ('MJ: Conversation Artifacts', 'MJ: Conversation Artifact Versions', 'MJ: Conversation Artifact Permissions');

UPDATE [__mj].[EntityField] SET [Status] = 'Active'
WHERE [EntityID] IN (SELECT ID FROM [__mj].[Entity] WHERE [Name] = 'Conversation Details')
  AND [Name] IN ('ArtifactID', 'ArtifactVersionID');
```

**Note**: Old data is NOT deleted, so rollback is low-risk.

---

## Key Decisions & Rationale

### Why preserve UUIDs?
- **Simpler migration**: No mapping tables
- **Referential integrity**: Foreign keys work immediately
- **Easier debugging**: Can trace records by same ID
- **Less code**: Direct UUID copy vs complex mapping

### Why set Direction='Output' for all?
- **Legacy behavior**: Old skip-chat only created output artifacts
- **No input tracking**: ConversationDetail didn't track direction
- **Safe default**: All artifacts were AI-generated outputs

### Why infer UserID from Conversation?
- **Missing field**: Old entities lack UserID
- **Logical ownership**: Conversation owner created artifacts
- **Required field**: New schema requires UserID

### Why keep old tables?
- **Safety net**: Keep for 1-2 releases as rollback option
- **Validation**: Can compare old vs new data
- **Audit trail**: Historical data remains queryable

---

## Timeline

| Phase | Duration | Description |
|-------|----------|-------------|
| Pre-work | 1 hour | Create ArtifactPermission table + CodeGen |
| Script dev | 1 hour | Write migration SQL |
| Testing | 30 mins | Test in dev environment |
| Code review | 15 mins | Team review |
| Execution | < 1 min | Run in production |
| Validation | 15 mins | Post-migration checks |
| **Total** | **~3 hours** | |

---

## Success Criteria

- ✅ All ConversationArtifacts migrated to Artifacts
- ✅ All versions migrated with preserved UUIDs
- ✅ All M:M links created
- ✅ All permissions migrated
- ✅ Deprecated entities/fields marked
- ✅ Zero data loss (counts match)
- ✅ Conversations UI displays artifacts correctly
- ✅ Permissions enforced correctly

---

**Document Version**: 1.0
**Last Updated**: 2025-01-21
**Implementation Status**: ⏳ Pending Review
