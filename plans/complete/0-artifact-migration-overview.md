# Artifact Migration & Improvements - Overview

## Summary

This overview document ties together three separate implementation plans for migrating from the legacy ConversationArtifact system to the new Artifact/ArtifactVersion/Collections architecture.

**Created**: 2025-01-21
**Status**: ⏳ Pending Review & Approval

---

## The Three Plans

### [Plan 1: Conversation Artifact Data Migration](./1-conversation-artifact-data-migration.md)
**Type**: Database migration
**Effort**: 2-3 hours
**Risk**: Medium
**Dependencies**: None

**What it does**:
- Migrates all ConversationArtifact → Artifact (preserves UUIDs)
- Migrates all ConversationArtifactVersion → ArtifactVersion (preserves UUIDs)
- Creates ConversationDetailArtifact M:M links
- Creates new ArtifactPermission table + migrates permissions
- Marks old entities/fields as deprecated
- **Zero code changes** - pure SQL migration

**Deliverables**:
- SQL migration script
- ArtifactPermission table schema
- Validation queries
- Rollback procedure

---

### [Plan 2: Component Studio Improvements](./2-component-studio-improvements.md)
**Type**: Angular UI/UX enhancements
**Effort**: 7-8 days
**Risk**: Low
**Dependencies**: Plan 1 must complete first

**What it does**:
- Updates Component Studio to use new Artifact schema
- Adds Collections support (save artifacts to collections)
- Adds "Load from Artifact" feature (browse DB artifacts)
- Improves deprecated filter UI (checkbox instead of toggle)

**Key Features**:
- **Enhanced Save Dialog**: 3 tabs (Existing Artifacts, Collections, Create New)
- **Load from Artifact**: Import components from database
- **Collections Integration**: Organize components into collections
- **Better UX**: Modern filter UI, smart defaults, remember preferences

**Deliverables**:
- Updated artifact-selection-dialog component
- New artifact-load-dialog component
- Improved filter UI
- Collections support throughout

---

### [Plan 3: Component Artifact Viewer Improvements](./3-component-artifact-viewer-improvements.md)
**Type**: Plugin component enhancement
**Effort**: 2-3 days
**Risk**: Low
**Dependencies**: None (independent)

**What it does**:
- Adds metadata access to component artifact viewer
- No more nested tabs - uses gear menu + slide-out panel
- Progressive disclosure (clean default, detailed on-demand)

**Key Features**:
- **Gear Menu**: One-click access to all metadata
- **Side Panel**: 60/40 split (component + metadata)
- **5 Metadata Panels**:
  - Code (TypeScript with syntax highlighting)
  - Functional Requirements (rendered markdown)
  - Technical Design (rendered markdown)
  - Data Requirements (structured display)
  - Full Spec (formatted JSON)
- **Keyboard Shortcuts**: C, F, T, D, S, Esc, G
- **Responsive**: Bottom sheet on mobile

**Deliverables**:
- Enhanced component-artifact-viewer plugin
- Gear menu + slide-out panel UI
- Markdown rendering for requirements/design
- Copy functionality for code/spec

---

## Execution Strategy

### Option 1: Sequential (Recommended)
Execute in order, each as separate Claude process:

1. **Week 1**: Plan 1 (Data Migration) - Run in production
2. **Week 2**: Plan 2 (Component Studio) - Frontend team
3. **Week 3**: Plan 3 (Artifact Viewer) - Frontend team

**Pros**: Clean dependencies, clear handoff points
**Cons**: Takes 3 weeks total

### Option 2: Parallel
Run Plan 2 and Plan 3 simultaneously (they're independent):

1. **Day 1**: Plan 1 (Data Migration) - Run immediately
2. **Day 2+**: Plan 2 + Plan 3 in parallel (2 separate Claude processes)

**Pros**: Faster completion (~10 days vs 3 weeks)
**Cons**: More coordination, two parallel changes

---

## Shared Concepts

All three plans work with these entities:

### Old Schema (Deprecated)
```typescript
ConversationArtifact
ConversationArtifactVersion
ConversationArtifactPermission
ConversationDetail.ArtifactID          // Direct FK
ConversationDetail.ArtifactVersionID   // Direct FK
```

### New Schema (Current)
```typescript
Artifact                    // Universal, environment-scoped
ArtifactVersion            // Versioned content with ContentHash
ArtifactPermission         // NEW - granular permissions
ConversationDetailArtifact // M:M junction table
CollectionArtifact         // Links artifacts to collections
```

### Key Changes
- **UUIDs preserved**: Old IDs = New IDs (simplifies migration)
- **M:M relationship**: No more direct FKs, use junction table
- **Granular permissions**: CanRead, CanEdit, CanDelete, CanShare
- **Collections support**: Artifacts can belong to multiple collections
- **Content vs Configuration**: Use `Content` for actual data, `Configuration` for metadata

---

## Testing Strategy

### Plan 1 (Migration)
- [ ] Test in dev environment first
- [ ] Validate all counts match (artifacts, versions, permissions)
- [ ] Verify conversations UI still works
- [ ] Check permissions enforced correctly
- [ ] Run rollback script to verify it works

### Plan 2 (Component Studio)
- [ ] Test save to standalone artifact
- [ ] Test save to artifact in collection
- [ ] Test load from database
- [ ] Test filters and search
- [ ] Test on different browsers
- [ ] Verify no regressions in component testing

### Plan 3 (Artifact Viewer)
- [ ] Test all metadata panels
- [ ] Test keyboard shortcuts
- [ ] Test on mobile/tablet
- [ ] Test with missing metadata
- [ ] Verify component still renders correctly

---

## Success Criteria

### Overall Goals
- ✅ All legacy data migrated successfully
- ✅ Component Studio uses new schema
- ✅ Collections fully integrated
- ✅ Artifact viewer shows rich metadata
- ✅ Zero data loss
- ✅ No regressions in existing functionality
- ✅ Better UX than before

### Metrics
- Migration completes in < 1 minute
- Component Studio save/load workflows are intuitive
- Users can find and access component metadata easily
- Deprecated components filter looks professional
- Mobile experience is good (bottom sheet)

---

## Timeline Summary

| Plan | Duration | Calendar |
|------|----------|----------|
| Plan 1: Data Migration | 2-3 hours | Week 1, Day 1 |
| Plan 2: Component Studio | 7-8 days | Week 2 |
| Plan 3: Artifact Viewer | 2-3 days | Week 3 (or parallel) |
| **Total (Sequential)** | **~11 days** | **~3 weeks** |
| **Total (Parallel)** | **~8 days** | **~2 weeks** |

---

## Risks & Mitigations

### Plan 1 Risks
- **Risk**: Migration fails partway through
- **Mitigation**: Transaction rollback, old data preserved

- **Risk**: UUID collision (if UUIDs generated instead of preserved)
- **Mitigation**: We preserve UUIDs, so no risk

- **Risk**: Missing Environment or user data
- **Mitigation**: Script checks and aborts if missing

### Plan 2 Risks
- **Risk**: Breaking existing Component Studio functionality
- **Mitigation**: Comprehensive testing, feature flags if needed

- **Risk**: Collection permissions not checked
- **Mitigation**: Add permission checks before save

### Plan 3 Risks
- **Risk**: Breaking component rendering
- **Mitigation**: Isolated plugin, doesn't touch core rendering logic

- **Risk**: Performance with large component specs
- **Mitigation**: Lazy-load metadata panels, only process when opened

---

## Open Questions

### All Plans
1. **Default Environment**: Which EnvironmentID to use for migrated artifacts?
   - **Recommendation**: Use first environment found, or add config setting

2. **User Preferences**: Where to store "default collection for components"?
   - **Options**: DashboardUserState, UserPreference table, local storage
   - **Recommendation**: DashboardUserState (per-dashboard persistence)

3. **Content vs Configuration**: Standardize field usage?
   - **Recommendation**: `Content` = actual component JSON, `Configuration` = metadata

### Plan-Specific
None currently - all questions are cross-cutting

---

## Next Steps

1. **Review all three plans** with team
2. **Answer open questions** (especially Environment and user preferences)
3. **Choose execution strategy** (Sequential or Parallel)
4. **Approve plans** for implementation
5. **Create tasks** in project tracker
6. **Assign Claude processes** to each plan

---

## Document Index

- [Plan 0: Overview](./0-artifact-migration-overview.md) ← You are here
- [Plan 1: Data Migration](./1-conversation-artifact-data-migration.md)
- [Plan 2: Component Studio](./2-component-studio-improvements.md)
- [Plan 3: Artifact Viewer](./3-component-artifact-viewer-improvements.md)

---

## Appendix: Manual Rollback Script (For Testing)

If you need to roll back the migration during testing to re-run it, use this SQL script:

```sql
-- ============================================================================
-- MANUAL ROLLBACK SCRIPT FOR TESTING
-- ============================================================================
-- Purpose: Remove migrated data to allow re-testing the migration script
-- WARNING: This is for TESTING ONLY - use before re-running migration
-- ============================================================================

SET NOCOUNT ON;
PRINT '=== Manual Rollback for Testing ===';
PRINT '';

DECLARE @DeletedCount INT;

-- ============================================================================
-- STEP 1: Restore ConversationDetail.Message (if JSON was replaced)
-- ============================================================================
PRINT 'Step 1: Restoring ConversationDetail.Message...';
PRINT 'NOTE: Cannot restore original JSON - messages were replaced with artifact names';
PRINT '      If you need original messages, restore from backup before re-testing';
PRINT '';

-- ============================================================================
-- STEP 2: Delete ConversationDetailArtifact M:M links
-- ============================================================================
PRINT 'Step 2: Deleting ConversationDetailArtifact links...';

DELETE cda
FROM [__mj].[ConversationDetailArtifact] cda
WHERE cda.[ArtifactVersionID] IN (
    -- Find artifact versions that came from ConversationArtifactVersion
    SELECT cav.[ID]
    FROM [__mj].[ConversationArtifactVersion] cav
);

SET @DeletedCount = @@ROWCOUNT;
PRINT '✓ Deleted ' + CAST(@DeletedCount AS NVARCHAR(10)) + ' ConversationDetailArtifact links';

-- ============================================================================
-- STEP 3: Delete ArtifactPermission records
-- ============================================================================
PRINT '';
PRINT 'Step 3: Deleting ArtifactPermission records...';

DELETE ap
FROM [__mj].[ArtifactPermission] ap
WHERE ap.[ArtifactID] IN (
    -- Find artifacts that came from ConversationArtifact
    SELECT ca.[ID]
    FROM [__mj].[ConversationArtifact] ca
);

SET @DeletedCount = @@ROWCOUNT;
PRINT '✓ Deleted ' + CAST(@DeletedCount AS NVARCHAR(10)) + ' ArtifactPermission records';

-- ============================================================================
-- STEP 4: Delete ArtifactVersion records
-- ============================================================================
PRINT '';
PRINT 'Step 4: Deleting ArtifactVersion records...';

DELETE av
FROM [__mj].[ArtifactVersion] av
WHERE av.[ID] IN (
    -- Find versions that came from ConversationArtifactVersion
    SELECT cav.[ID]
    FROM [__mj].[ConversationArtifactVersion] cav
);

SET @DeletedCount = @@ROWCOUNT;
PRINT '✓ Deleted ' + CAST(@DeletedCount AS NVARCHAR(10)) + ' ArtifactVersion records';

-- ============================================================================
-- STEP 5: Delete Artifact records
-- ============================================================================
PRINT '';
PRINT 'Step 5: Deleting Artifact records...';

DELETE a
FROM [__mj].[Artifact] a
WHERE a.[ID] IN (
    -- Find artifacts that came from ConversationArtifact
    SELECT ca.[ID]
    FROM [__mj].[ConversationArtifact] ca
);

SET @DeletedCount = @@ROWCOUNT;
PRINT '✓ Deleted ' + CAST(@DeletedCount AS NVARCHAR(10)) + ' Artifact records';

-- ============================================================================
-- STEP 6: Un-deprecate metadata (optional - only if you ran full migration)
-- ============================================================================
PRINT '';
PRINT 'Step 6: Un-deprecating old entity metadata...';
PRINT 'NOTE: Only needed if the migration marked entities as deprecated';

-- Restore ConversationArtifact entity
UPDATE [__mj].[Entity]
SET [Description] = REPLACE([Description], ' [DEPRECATED: Migrated to Artifact table. Use Artifact entity instead.]', '')
WHERE [Name] = 'Conversation Artifacts'
  AND [Description] LIKE '%[DEPRECATED:%';

-- Restore ConversationArtifactVersion entity
UPDATE [__mj].[Entity]
SET [Description] = REPLACE([Description], ' [DEPRECATED: Migrated to ArtifactVersion table. Use ArtifactVersion entity instead.]', '')
WHERE [Name] = 'Conversation Artifact Versions'
  AND [Description] LIKE '%[DEPRECATED:%';

-- Restore ConversationArtifactPermission entity
UPDATE [__mj].[Entity]
SET [Description] = REPLACE([Description], ' [DEPRECATED: Migrated to ArtifactPermission table. Use ArtifactPermission entity instead.]', '')
WHERE [Name] = 'Conversation Artifact Permissions'
  AND [Description] LIKE '%[DEPRECATED:%';

-- Restore ConversationDetail.ArtifactVersionID field
UPDATE [__mj].[EntityField]
SET [Description] = REPLACE([Description], ' [DEPRECATED: Migrated to ConversationDetailArtifact M:M table. Use ConversationDetailArtifact junction instead.]', '')
WHERE [EntityID] = (SELECT [ID] FROM [__mj].[Entity] WHERE [Name] = 'Conversation Details')
  AND [Name] = 'ArtifactVersionID'
  AND [Description] LIKE '%[DEPRECATED:%';

PRINT '✓ Un-deprecated metadata (if applicable)';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
PRINT '';
PRINT '=== Verification ===';

DECLARE @RemainingArtifacts INT, @RemainingVersions INT, @RemainingPermissions INT, @RemainingLinks INT;

SELECT @RemainingArtifacts = COUNT(*)
FROM [__mj].[Artifact] a
WHERE a.[ID] IN (SELECT [ID] FROM [__mj].[ConversationArtifact]);

SELECT @RemainingVersions = COUNT(*)
FROM [__mj].[ArtifactVersion] av
WHERE av.[ID] IN (SELECT [ID] FROM [__mj].[ConversationArtifactVersion]);

SELECT @RemainingPermissions = COUNT(*)
FROM [__mj].[ArtifactPermission] ap
WHERE ap.[ArtifactID] IN (SELECT [ID] FROM [__mj].[ConversationArtifact]);

SELECT @RemainingLinks = COUNT(*)
FROM [__mj].[ConversationDetailArtifact] cda
WHERE cda.[ArtifactVersionID] IN (SELECT [ID] FROM [__mj].[ConversationArtifactVersion]);

PRINT 'Remaining migrated Artifacts: ' + CAST(@RemainingArtifacts AS NVARCHAR(10)) + ' (should be 0)';
PRINT 'Remaining migrated Versions: ' + CAST(@RemainingVersions AS NVARCHAR(10)) + ' (should be 0)';
PRINT 'Remaining migrated Permissions: ' + CAST(@RemainingPermissions AS NVARCHAR(10)) + ' (should be 0)';
PRINT 'Remaining migrated Links: ' + CAST(@RemainingLinks AS NVARCHAR(10)) + ' (should be 0)';

IF @RemainingArtifacts = 0 AND @RemainingVersions = 0 AND @RemainingPermissions = 0 AND @RemainingLinks = 0
BEGIN
    PRINT '';
    PRINT '✓ Rollback completed successfully - ready to re-test migration';
END
ELSE
BEGIN
    PRINT '';
    PRINT '⚠ WARNING: Some migrated data still remains';
    PRINT '  Check foreign key constraints or run additional cleanup';
END

PRINT '';
PRINT '=== Done ===';
```

---

**Document Version**: 1.1
**Last Updated**: 2025-01-21
**Status**: ✅ Plan 1 Complete - Ready for Plans 2 & 3
