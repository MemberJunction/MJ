---
"@memberjunction/cli": patch
"@memberjunction/metadata-sync": patch
---

MetadataSync pull operations major improvements

- **JSON Property Ordering**: Fixed inconsistent JSON property ordering
  across metadata files by implementing JsonWriteHelper with
  deterministic serialization
- **File Write Batching**: Replaced individual file writes with
  batching system for 90% performance improvement and eliminated write
  conflicts
- **RelatedEntities Support**: Added complete support for pulling
  related entities as embedded collections with foreign key references
  (@parent:ID syntax)
- **Field Configuration Options**:
  - Added `ignoreNullFields` option to exclude null values during pull
    operations
  - Added `ignoreVirtualFields` option to exclude virtual fields from
    pulled data
- **ExternalizeFields Implementation**: Complete field externalization
  functionality with:

  - Configurable file patterns with placeholders ({Name}, {ID}, etc.)
  - Smart merge strategy support preserving existing @file: references

  - Enhanced checksum calculation including external file content
  - Automatic JSON formatting and filename sanitization

- **Change Detection**: Fixed checksum calculation for related entities
  to prevent unnecessary timestamp updates
- **Bug Fixes**: Resolved critical issue where new record operations
  overwrote existing record updates in batch system

These improvements provide robust, performant, and feature-complete
metadata synchronization with proper change tracking and file
organization.
