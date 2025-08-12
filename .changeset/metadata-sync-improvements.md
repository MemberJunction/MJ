---
"@memberjunction/metadata-sync": patch
---

Improved metadata sync push functionality with better dependency ordering and cleaner logging

## Changes

### Dependency Ordering
- Added RecordDependencyAnalyzer to handle complex nested entity relationships
- Records are now processed in correct dependency order using topological sorting
- Supports @lookup, @parent, @root references and direct foreign keys
- Handles circular dependencies gracefully with warnings

### Logging Improvements  
- Fixed confusing "Error in BaseEntity.Load" messages for missing records
- Now shows clear messages like "Creating missing [Entity] record with primaryKey {...}"
- Provides better visibility into what records are being created vs updated

### Code Cleanup
- Removed 700+ lines of unused legacy code from PushService
- Removed unused template processing methods from SyncEngine
- Fixed parameter ordering in processFileContentWithIncludes method
- Simplified initialize method in SyncEngine

These improvements make the metadata sync tool more reliable when dealing with complex entity relationships and provide clearer feedback during push operations.