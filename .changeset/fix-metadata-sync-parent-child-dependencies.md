---
"@memberjunction/metadata-sync": patch
---

Fix critical MetadataSync issues with parent-child dependencies and record processing

**Fixed Issues:**
1. **One Record Per Run Bug**: Fixed issue where only one new related entity was processed per sync run when multiple records were added
2. **Parent-Child Dependencies**: Resolved "@parent:ID reference not found" errors by ensuring parents are saved before children
3. **Complex Lookup Resolution**: Enhanced dependency analyzer to handle compound lookups with @parent references (e.g., `Name=X&AgentID=@parent:AgentID`)
4. **Sync Metadata Regression**: Restored proper behavior where lastModified timestamps only update for actually changed records

**Technical Changes:**
- Use unique record IDs for batch context tracking instead of complex key building
- Parents are now saved and added to batch context before processing children
- Enhanced RecordDependencyAnalyzer to resolve @parent references within lookup criteria
- Restored dirty checking and file content checksum comparison before updating sync metadata
- Preserve original field values with @ references when writing back to files

This ensures MetadataSync correctly handles complex entity hierarchies with proper dependency ordering.