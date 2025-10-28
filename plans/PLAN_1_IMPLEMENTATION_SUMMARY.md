# Plan 1: Data Migration - Implementation Complete

## Status: ✅ Ready for Testing

All migration scripts have been created and are ready for execution.

---

## Files Created

### Migration Scripts (Auto-Execute via Flyway)
1. **`V202510211511__v2.110.x__Create_ArtifactPermission_Table.sql`**
   - Creates ArtifactPermission table
   - Adds indexes and metadata
   - Runs automatically when API starts

2. **`V202510211512__v2.110.x__Migrate_Conversation_Artifacts.sql`**
   - Migrates all ConversationArtifact data
   - Preserves UUIDs
   - Creates M:M links
   - Marks old entities as deprecated
   - **Includes built-in validation with error throwing**
   - **Flyway handles transaction rollback automatically**
   - Runs automatically after schema migration

### Documentation
3. **`README_Artifact_Migration.md`**
   - Complete execution guide
   - Troubleshooting steps
   - Success criteria

---

## Migration Workflow

```
┌─────────────────────────────────────────────┐
│ 1. Start API Server (npm run start:api)    │
│    ↓                                        │
│    Flyway runs V202510211511 (schema)       │
│    → Creates ArtifactPermission table       │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 2. Run CodeGen (npm run codegen)           │
│    → Generates ArtifactPermissionEntity     │
│    → Creates views and stored procedures    │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 3. Start API Server Again                  │
│    ↓                                        │
│    Flyway runs V202510211512 (data)         │
│    → Migrates all artifacts                 │
│    → Migrates all versions                  │
│    → Migrates all permissions               │
│    → Creates M:M links                      │
│    → Validates data integrity               │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 4. Check Migration Success                 │
│    → Review API logs for validation results│
│    → If failed: Flyway auto-rollback       │
│    → If succeeded: All counts matched      │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ 5. Test Application                        │
│    → Open conversations with artifacts      │
│    → Verify permissions work               │
│    → Check for errors in logs              │
└─────────────────────────────────────────────┘
```

---

## Quick Start (Dev Environment)

```bash
# Step 1: Start API (runs schema migration)
npm run start:api

# Step 2: Wait for migration to complete, then stop server (Ctrl+C)

# Step 3: Run CodeGen
npm run codegen

# Step 4: Start API again (runs data migration)
npm run start:api

# Step 5: Check API logs for migration success
# Look for: "✅ Migration validation passed"
# If failed: error message will show which validation failed

# Step 6: Test in UI
# Open http://localhost:4200
# Navigate to conversations with artifacts
```

---

## Key Features

### ✅ Idempotent
- Can run multiple times safely
- Checks for existing data before inserting
- Won't create duplicates

### ✅ UUID Preservation
- Old artifact IDs = New artifact IDs
- No mapping tables needed
- Foreign keys work immediately

### ✅ Transaction Safety
- All-or-nothing execution via Flyway transactions
- Automatic rollback on validation failure
- No partial data states possible

### ✅ Built-in Validation
- Comprehensive validation checks at end of migration
- Throws detailed errors if validation fails
- Verifies all counts match (artifacts, versions, permissions, links)

### ✅ Zero Data Loss
- Old tables preserved (not deleted)
- All data migrated with timestamps
- Flyway transaction ensures safe rollback

---

## What Gets Migrated

| Old Entity | New Entity | Count Check |
|------------|------------|-------------|
| ConversationArtifact | Artifact | Must match 100% |
| ConversationArtifactVersion | ArtifactVersion | Must match 100% |
| ConversationArtifactPermission | ArtifactPermission | Must match 100% |
| ConversationDetail.ArtifactVersionID | ConversationDetailArtifact | Links created |

---

## Validation Checklist

After migration completes, verify:

- [ ] No validation errors in API server logs (migration passed built-in checks)
- [ ] API log shows: "✅ Migration validation passed"
- [ ] Conversations UI displays artifacts correctly
- [ ] Users can view artifacts they have permission for
- [ ] Users cannot view artifacts they don't have permission for
- [ ] Old entities marked as deprecated in metadata
- [ ] No application errors in normal operation

**Note**: The migration script automatically validates:
- Old artifact count = New artifact count
- Old version count = New version count
- Old permission count = New permission count
- Conversation links created for all non-null ArtifactVersionIDs

If any of these fail, the migration throws an error and Flyway rolls back.

---

## Troubleshooting Quick Reference

### "ArtifactPermission table does not exist"
**Fix**: Run CodeGen after schema migration
```bash
npm run codegen
```

### "0 artifacts migrated"
**Check**: Migration may have already run
```sql
SELECT COUNT(*) FROM [__mj].[Artifact]
WHERE ID IN (SELECT ID FROM [__mj].[ConversationArtifact]);
```

### Migration fails with validation error
**What happens**:
- Migration detects count mismatch
- Throws detailed error with specific counts
- Flyway automatically rolls back entire transaction
- Database is unchanged

**Action**:
1. Review error message in API log
2. Check source data integrity
3. Fix underlying issue (orphaned records, missing references, etc.)
4. Restart API to retry migration

**Note**: No manual rollback needed - Flyway handles it automatically.

---

## Next Steps After Migration

Once migration is successful:

1. ✅ **Plan 1 Complete** - Data migrated
2. ⏳ **Plan 2** - Update Component Studio UI (separate Claude process)
3. ⏳ **Plan 3** - Enhance artifact viewer plugin (separate Claude process)

Plans 2 and 3 can run in parallel since they're independent.

---

## Files Location

All files are in: `/Users/amith/Dropbox/develop/Mac/MJ/migrations/v2/`

- `V202510211511__v2.110.x__Create_ArtifactPermission_Table.sql` (6.8 KB)
- `V202510211512__v2.110.x__Migrate_Conversation_Artifacts.sql` (16 KB with built-in validation)
- `README_Artifact_Migration.md` (8+ KB)

**Total**: ~31 KB of migration code and documentation

---

## Estimated Execution Time

| Environment | Data Volume | Est. Time |
|-------------|-------------|-----------|
| Dev (empty) | 0 artifacts | < 1 second |
| Dev (sample) | 10 artifacts | < 1 second |
| Staging | 100 artifacts | ~1 second |
| Production | 1,000 artifacts | ~5 seconds |
| Production (large) | 10,000 artifacts | ~30 seconds |

---

## Success Criteria

Migration is successful when:
- ✅ All Flyway migrations run without errors
- ✅ Built-in validation passes (API log shows success)
- ✅ Conversations UI works correctly
- ✅ Permissions are enforced
- ✅ No application errors in logs
- ✅ Old entities marked as deprecated in metadata

---

**Status**: ✅ Ready for Testing
**Last Updated**: 2025-01-21
**Implementation Time**: ~2 hours
**Next Action**: Test in dev environment
