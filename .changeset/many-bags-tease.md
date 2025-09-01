---
"@memberjunction/metadata-sync": patch
"@memberjunction/cli": patch
---

feat(metadata-sync): add deleteRecord feature for removing records via sync

- Added deleteRecord directive to mark records for deletion in JSON files
- Records with deleteRecord.delete=true are deleted during push operations
- After successful deletion, adds deletedAt timestamp to track when deleted
