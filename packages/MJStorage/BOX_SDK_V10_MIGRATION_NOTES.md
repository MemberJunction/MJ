# Box SDK v10 Migration Notes

## Overview
This document describes an **incomplete migration attempt** from Box REST API to the official Box Node SDK v10. The migration was **NOT completed** due to significant API differences in the v10 SDK.

**Current Status**: Stashed for future reference. The Box driver currently uses the REST API approach and is working correctly.

## Why This Migration Was Attempted

### Original Problem
The Box driver was using direct REST API calls with manual endpoint construction. This caused issues:
- 405 "Method Not Allowed" errors when using invalid `/items/{id}` endpoint
- Inconsistent with other storage providers (AWS, Azure, Google, Dropbox) which all use official SDKs
- Manual token management and refresh logic

### Coworker's Monkey Patch
A coworker had previously created a monkey patch (2 months ago) that used the Box SDK to work around similar issues. This suggested the SDK was the right approach.

## What Was Attempted

### Changes Made
1. **Installed Dependency**: Added `box-node-sdk@^10.0.0` to package.json
2. **Updated Imports**: Changed from manual https imports to SDK imports
3. **Refactored Authentication**:
   - Removed manual token management
   - Implemented `BoxDeveloperTokenAuth` for authentication
   - Created `BoxClient` instance
4. **Refactored All CRUD Methods**:
   - `GetObjectMetadata` → `client.files.get()` / `client.folders.get()`
   - `ListObjects` → `client.folders.getItems()`
   - `GetObject` → `client.files.getReadStream()`
   - `CreateDirectory` → `client.folders.create()`
   - `PutObject` → `client.files.uploadFile()`
   - `CopyObject` → `client.files.copy()`
   - `MoveObject` → `client.files.update()` / `client.folders.update()`
   - `DeleteObject` → `client.files.delete()` / `client.folders.delete()`
   - `DeleteDirectory` → `client.folders.delete()`
5. **Removed Old Methods**: Deleted `_apiRequest`, `_ensureValidToken`, `_makeRequest`

## Why It Failed

### Box SDK v10 Has Different API Structure

The Box SDK v10 uses a **completely different method naming convention** than expected:

**Expected (based on v9 or documentation):**
```typescript
client.files.get(fileId)
client.files.delete(fileId)
client.files.copy(fileId, parentId)
```

**Actual (Box SDK v10):**
```typescript
client.files.getFileById(fileId, options)
client.files.deleteFileById(fileId, options)
client.files.copyFile(fileId, requestBody, options)
```

### TypeScript Compilation Errors

After refactoring, we got **22 compilation errors** like:
```
error TS2339: Property 'get' does not exist on type 'FilesManager'.
error TS2339: Property 'delete' does not exist on type 'FilesManager'.
error TS2339: Property 'copy' does not exist on type 'FilesManager'.
error TS2339: Property 'uploadFile' does not exist on type 'FilesManager'.
error TS2339: Property 'getReadStream' does not exist on type 'FilesManager'.
```

### SDK Method Signature Complexity

The v10 SDK uses complex optional parameter patterns:

```typescript
// From lib/managers/files.d.ts
export declare class GetFileByIdOptionals {
    readonly queryParams: GetFileByIdQueryParams;
    readonly headers: GetFileByIdHeaders;
    readonly cancellationToken?: CancellationToken;
    constructor(fields: Omit<GetFileByIdOptionals, ...>);
}

// Usage would be:
client.files.getFileById(fileId, new GetFileByIdOptionals({
    queryParams: { fields: 'id,name,type' }
}));
```

This is much more complex than the REST API approach.

## Correct Box SDK v10 Method Names

Based on inspection of `/node_modules/box-node-sdk/lib/managers/files.d.ts`:

| Our Attempted Method | Actual SDK v10 Method |
|---------------------|----------------------|
| `client.files.get()` | `client.files.getFileById(fileId, optionals?)` |
| `client.files.delete()` | `client.files.deleteFileById(fileId, optionals?)` |
| `client.files.copy()` | `client.files.copyFile(fileId, requestBody, optionals?)` |
| `client.files.uploadFile()` | Need to investigate - may be `uploadFile()` or different |
| `client.files.getReadStream()` | `client.files.downloadFile(fileId, optionals?)` |
| `client.files.update()` | `client.files.updateFileById(fileId, optionals?)` |
| `client.folders.get()` | `client.folders.getFolderById(folderId, optionals?)` |
| `client.folders.create()` | `client.folders.createFolder(requestBody, optionals?)` |
| `client.folders.delete()` | `client.folders.deleteFolderById(folderId, optionals?)` |
| `client.folders.getItems()` | `client.folders.getFolderItems(folderId, optionals?)` |

## What Would Be Required to Complete This Migration

### 1. Update All Method Calls

Every SDK method call needs to be updated to use the correct v10 naming:

**Before (attempted):**
```typescript
const metadata = await this._client.files.get(fileId, {
    fields: 'id,name,type,size'
});
```

**After (correct for v10):**
```typescript
import { GetFileByIdOptionals } from 'box-node-sdk';

const metadata = await this._client.files.getFileById(
    fileId,
    new GetFileByIdOptionals({
        queryParams: {
            fields: ['id', 'name', 'type', 'size']
        }
    })
);
```

### 2. Handle Request Body Patterns

Many operations need request bodies constructed differently:

**CopyFile Example:**
```typescript
import { CopyFileRequestBody, CopyFileOptionals } from 'box-node-sdk';

await this._client.files.copyFile(
    sourceInfo.id,
    new CopyFileRequestBody({
        parent: { id: destParentId },
        name: destPath.name
    }),
    new CopyFileOptionals({})
);
```

### 3. Handle Streaming Differently

File downloads may need different handling:

```typescript
// Old approach (attempted):
const stream = await this._client.files.getReadStream(fileId);

// New approach (v10):
const downloadedFile = await this._client.files.downloadFile(fileId);
// Then convert to Buffer
```

### 4. Update Error Handling

Error structures may be different in v10:

```typescript
try {
    await this._client.files.deleteFileById(fileId);
} catch (error) {
    // v10 may have different error properties
    if (error.statusCode === 404) {
        return true; // Already deleted
    }
    throw error;
}
```

### 5. Investigate Upload Sessions

Upload sessions API may have changed significantly:

```typescript
// Attempted:
await this._client.files.createUploadSession(parentId, 0, filename);

// v10 likely needs:
// Different method name and parameter structure
```

## Estimated Effort

To complete this migration properly:

1. **Research**: 4-6 hours to read v10 SDK documentation and examples
2. **Update Method Calls**: 8-10 hours to refactor all 15+ methods correctly
3. **Testing**: 4-6 hours to run full test suite (BOX_DRIVER_TESTING.md)
4. **Debugging**: 4-8 hours for edge cases and error handling

**Total**: 20-30 hours of work

## Recommendation

### Option 1: Keep REST API Approach (Current)
**Pros:**
- Already working
- Well understood
- Direct control over requests
- No dependency version issues

**Cons:**
- Inconsistent with other providers
- Manual token management
- Need to track Box API changes

### Option 2: Complete SDK Migration (Future)
**Pros:**
- Consistent with other providers (AWS, Azure, Google, Dropbox)
- SDK handles token refresh automatically
- SDK tracks API changes
- Better TypeScript types

**Cons:**
- Significant development time (20-30 hours)
- Learning curve for v10 SDK patterns
- More complex code due to optionals pattern
- Dependency on SDK updates

### Option 3: Hybrid Approach
Use SDK for some operations (file upload/download with streaming) but keep REST API for simple CRUD:

**Pros:**
- Best of both worlds
- Gradual migration path
- Can use SDK for complex operations

**Cons:**
- Mixed patterns in codebase
- Still need to maintain both approaches
- May be confusing for future developers

## Current Solution (What We Did Instead)

We **kept the REST API approach** but fixed the root cause of the 405 errors:

### The Fix: `_getItemInfoFromPath()` Helper

Created a helper method that returns both the item ID and type:

```typescript
private async _getItemInfoFromPath(path: string): Promise<{id: string, type: string} | null> {
    const parsedPath = this._parsePath(path);

    // Try as file first, then folder
    try {
        const fileInfo = await this._apiRequest(`/files/${parsedPath.id}`, 'GET', null, {
            'fields': 'id,type'
        });
        return { id: fileInfo.id, type: fileInfo.type };
    } catch {
        try {
            const folderInfo = await this._apiRequest(`/folders/${parsedPath.id}`, 'GET', null, {
                'fields': 'id,type'
            });
            return { id: folderInfo.id, type: folderInfo.type };
        } catch {
            return null;
        }
    }
}
```

This eliminated the invalid `/items/{id}` endpoint usage and fixed all 405 errors.

## How to Retrieve This Stashed Work

```bash
# List stashes
git stash list

# Apply the most recent stash (without dropping it)
git stash apply

# Or apply and drop
git stash pop

# View stash contents
git stash show -p
```

## Files Modified in Stash

- `/packages/MJStorage/src/drivers/BoxFileStorage.ts` - Full SDK refactor
- `/packages/MJStorage/package.json` - Added box-node-sdk dependency
- This file: `/packages/MJStorage/BOX_SDK_V10_MIGRATION_NOTES.md`

## References

- **Box SDK v10 Documentation**: https://github.com/box/box-node-sdk
- **Box API Reference**: https://developer.box.com/reference/
- **Testing Guide**: `/packages/MJStorage/BOX_DRIVER_TESTING.md`
- **SDK Type Definitions**: `/node_modules/box-node-sdk/lib/managers/files.d.ts`

## Decision Log

**Date**: 2025-09-30
**Decision**: Abandon SDK v10 migration, keep REST API approach
**Reasoning**:
1. SDK v10 has significantly different API than expected
2. 22 TypeScript compilation errors would require extensive refactoring
3. REST API approach is working correctly after 405 fix
4. ROI doesn't justify 20-30 hours of migration work
5. No immediate business need for SDK migration

**Next Steps**:
- Document this decision for future reference
- Keep stash available if we revisit later
- Monitor Box API for any deprecation notices
- Consider migration if Box deprecates REST API
