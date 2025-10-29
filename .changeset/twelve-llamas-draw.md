---
"@memberjunction/sqlserver-dataprovider": patch
---

Fix entity deletion to handle CASCADE operations with multiple result sets

**Problem**: Deleting entities with CASCADE operations (e.g., Conversations) failed because the TypeScript code only checked the first result set, which contained CASCADE operation results instead of the actual deleted record's primary key.

**Root Cause**: When delete stored procedures contain CASCADE operations, they return multiple result sets - one for each CASCADE operation plus the final deleted record. The previous code assumed a single result set and checked `d[0]`, which was incorrect when CASCADE operations existed.

**Solution**: Detect multiple result sets by checking if `d[0]` is an array. If multiple result sets exist, use `d[d.length - 1][0]` (last result set, first row). Otherwise, use `d[0]` (first row directly). This works because CodeGen always generates the deleted record's SELECT as the final statement.

**Migration**: Added v2.111.0 migration to temporarily disable Record Changes tracking for Conversations entity until proper CodeGen fix is implemented (generating spUpdate_Core procedures or using direct UPDATE statements in DELETE procedures).
