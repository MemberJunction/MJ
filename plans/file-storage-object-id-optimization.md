# File Storage Object ID Optimization Proposal

## Problem Statement

### Current Issues:

1. **Inefficient Path Resolution**
   - `GetObject` action always converts path → Object ID via `_getIdFromPath()`
   - This requires traversing folder hierarchy for every file access
   - Multiple API calls per file download (expensive, slow)

2. **Path Resolution Failures**
   - Box API failing with "Folder not found: Demo" for valid paths
   - Path resolution is fragile and provider-specific
   - Different providers handle paths differently (some relative to root, some absolute)

3. **Search Results Don't Include Object IDs**
   - Search returns paths but not provider-specific Object IDs
   - Forces subsequent GetObject calls to re-resolve paths
   - Loses efficiency gains from having search results

### Example Flow (Current - Inefficient):

```
Search Action
  ↓ Returns: { path: "Demo/Sub A/file.pdf" }
  ↓
Get Object Action
  ↓ Input: objectName = "Demo/Sub A/file.pdf"
  ↓
Box Driver GetObject()
  ↓ Calls _getIdFromPath("Demo/Sub A/file.pdf")
  ↓   - Split path into segments: ["Demo", "Sub A", "file.pdf"]
  ↓   - Start at root folder (id: "0")
  ↓   - Search for "Demo" in root → API call #1
  ↓   - Search for "Sub A" in Demo → API call #2
  ↓   - Search for "file.pdf" in Sub A → API call #3
  ↓ Finally gets fileId: "347751234567"
  ↓
Download file using fileId → API call #4

Total: 4 API calls
```

### Example Flow (Proposed - Efficient):

```
Search Action
  ↓ Returns: { path: "Demo/Sub A/file.pdf", objectId: "347751234567" }
  ↓
Get Object Action
  ↓ Input: objectName = "Demo/Sub A/file.pdf", objectId = "347751234567"
  ↓
Box Driver GetObject()
  ↓ Checks if objectId provided
  ↓   - Yes! Skip path resolution entirely
  ↓
Download file using objectId → API call #1

Total: 1 API call (4x faster!)
```

---

## Proposed Solution

### Phase 1: Add ObjectID to Search Results (All Providers)

Update all storage drivers to return provider-specific Object IDs in search results.

#### 1.1 Update FileSearchResult Interface

**File:** `packages/MJStorage/src/generic/FileStorageBase.ts`

```typescript
export interface FileSearchResult {
    path: string;
    name: string;
    size: number;
    contentType: string;
    lastModified: Date;
    relevance?: number;
    excerpt?: string;
    matchInFilename?: boolean;
    customMetadata?: Record<string, unknown>;
    providerData?: Record<string, unknown>;

    // NEW: Add provider-specific object ID
    objectId?: string;  // Box: fileId, Google Drive: fileId, SharePoint: itemId, etc.
}
```

#### 1.2 Update Box Search to Return ObjectID

**File:** `packages/MJStorage/src/drivers/BoxFileStorage.ts:1663`

```typescript
// Current (missing objectId):
results.push({
    path,
    name: fileItem.name || '',
    size: fileItem.size || 0,
    contentType: mime.lookup(fileItem.name || '') || 'application/octet-stream',
    lastModified,
    relevance: undefined,
    excerpt: undefined,
    matchInFilename: undefined,
    customMetadata: {
        id: fileItem.id || '',  // This is in customMetadata, not objectId!
        etag: fileItem.etag || ''
    },
    providerData: {
        boxItemId: fileItem.id,
        boxItemType: fileItem.type
    }
});

// Proposed (add objectId at top level):
results.push({
    path,
    name: fileItem.name || '',
    size: fileItem.size || 0,
    contentType: mime.lookup(fileItem.name || '') || 'application/octet-stream',
    lastModified,
    objectId: fileItem.id || '',  // ✅ ADD THIS - direct access to Box file ID
    relevance: undefined,
    excerpt: undefined,
    matchInFilename: undefined,
    customMetadata: {
        id: fileItem.id || '',
        etag: fileItem.etag || ''
    },
    providerData: {
        boxItemId: fileItem.id,
        boxItemType: fileItem.type
    }
});
```

#### 1.3 Update Other Storage Drivers

Apply same pattern to:
- **GoogleDriveFileStorage.ts** - Return Drive `fileId`
- **SharePointFileStorage.ts** - Return SharePoint `itemId`
- **DropboxFileStorage.ts** - Return Dropbox `id`
- **AzureFileStorage.ts** - Return Azure blob name (already path-based)
- **AWSFileStorage.ts** - Return S3 key (already path-based)

---

### Phase 2: Update Search Action to Expose ObjectID

**File:** `packages/Actions/CoreActions/src/custom/files/search-storage-files.action.ts:147`

```typescript
// Current (doesn't expose objectId):
const formattedResults = searchResults.results.map((file: FileSearchResult) => ({
    Path: file.path,
    Name: file.name,
    Size: file.size,
    ContentType: file.contentType,
    LastModified: file.lastModified.toISOString(),
    Relevance: file.relevance,
    Excerpt: file.excerpt,
    MatchInFilename: file.matchInFilename,
    CustomMetadata: file.customMetadata,
    ProviderData: file.providerData
}));

// Proposed (add objectId):
const formattedResults = searchResults.results.map((file: FileSearchResult) => ({
    Path: file.path,
    Name: file.name,
    Size: file.size,
    ContentType: file.contentType,
    LastModified: file.lastModified.toISOString(),
    ObjectID: file.objectId,  // ✅ ADD THIS - expose to agents
    Relevance: file.relevance,
    Excerpt: file.excerpt,
    MatchInFilename: file.matchInFilename,
    CustomMetadata: file.customMetadata,
    ProviderData: file.providerData
}));
```

---

### Phase 3: Update GetObject Action to Accept ObjectID

**File:** `packages/Actions/CoreActions/src/custom/files/get-object.action.ts`

#### 3.1 Add ObjectID Parameter

```typescript
/**
 * Download file content from storage
 *
 * @param params - The action parameters:
 *   - StorageProvider: Required - Name of the storage provider
 *   - ObjectName: Required - Name/path of the object (or ObjectID if provided)
 *   - ObjectID: Optional - Provider-specific object ID (bypasses path resolution)
 *
 * @returns Operation result with:
 *   - Content: Base64-encoded file content
 *   - Size: File size in bytes
 */
protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
        // Get and initialize storage driver
        const { driver, error } = await this.getDriverFromParams(params);
        if (error) return error;

        // Get object identifier (prefer ObjectID if provided)
        const objectId = this.getStringParam(params, 'objectid');
        const objectName = this.getStringParam(params, 'objectname');

        if (!objectId && !objectName) {
            return this.createErrorResult(
                "Either ObjectName or ObjectID parameter is required",
                "MISSING_IDENTIFIER"
            );
        }

        // Use ObjectID if provided (skips path resolution)
        const identifier = objectId || objectName;

        // Execute the get object operation
        const content: Buffer = await driver!.GetObject(identifier!);

        // ... rest of method
    }
}
```

#### 3.2 Update Action Metadata

**File:** `metadata/actions/.file-storage-operations.json`

Add new optional parameter to "File Storage: Get Object" action:

```json
{
  "fields": {
    "ActionID": "@parent:ID",
    "Name": "ObjectID",
    "Type": "Input",
    "ValueType": "Scalar",
    "IsArray": false,
    "Description": "Provider-specific object ID (Box: fileId, Google Drive: fileId, SharePoint: itemId). If provided, bypasses path resolution for faster access. Obtain from search results.",
    "IsRequired": false
  }
}
```

---

### Phase 4: Update Storage Drivers to Accept Object ID

#### 4.1 Box Driver Pattern

**File:** `packages/MJStorage/src/drivers/BoxFileStorage.ts:1143`

```typescript
// Current:
public async GetObject(objectName: string): Promise<Buffer> {
    try {
        // Get file ID using path resolution
        const fileId = await this._getIdFromPath(objectName);
        // ...
    }
}

// Proposed:
public async GetObject(objectName: string): Promise<Buffer> {
    try {
        let fileId: string;

        // Check if objectName is already an Object ID (optimization)
        // Box file IDs are numeric strings, paths contain '/'
        if (this._isObjectId(objectName)) {
            fileId = objectName;
            console.log(`✅ Using provided Object ID: ${fileId}`);
        } else {
            // Get file ID using path resolution
            fileId = await this._getIdFromPath(objectName);
            console.log(`✅ Resolved path to ID: ${fileId}`);
        }

        if (!fileId) {
            throw new Error(`File not found: ${objectName}`);
        }

        // Rest of download logic...
    }
}

/**
 * Checks if a string is a Box Object ID vs a path
 * Box IDs are numeric strings, paths contain '/'
 */
private _isObjectId(identifier: string): boolean {
    // Box file IDs are purely numeric
    return /^\d+$/.test(identifier);
}
```

#### 4.2 Apply Same Pattern to Other Providers

Each provider has different ID formats:
- **Box**: Numeric strings (e.g., "347751234567")
- **Google Drive**: Alphanumeric with underscores (e.g., "1ABC_XYZ-123")
- **SharePoint**: GUIDs or complex paths
- **Dropbox**: Starts with "id:" prefix (e.g., "id:abc123...")
- **S3/Azure**: Already path-based (no separate ID concept)

---

### Phase 5: Fix Box Path Resolution Bug

The "Folder not found: Demo" error suggests the path resolution is failing. Let me analyze the issue:

#### 5.1 Current Path Resolution Logic

**File:** `packages/MJStorage/src/drivers/BoxFileStorage.ts:355`

```typescript
private async _getItemInfoFromPath(path: string): Promise<{id: string, type: string} | null> {
    // Parse the path
    const parsedPath = this._parsePath(path);

    // First, find the parent folder ID
    let parentFolderId = this._rootFolderId;
    if (parsedPath.parent) {
        parentFolderId = await this._findFolderIdByPath(parsedPath.parent);
    }

    // Search for the item in parent folder
    // ...
}
```

**File:** `packages/MJStorage/src/drivers/BoxFileStorage.ts:1475`

```typescript
private async _findFolderIdByPath(path: string): Promise<string> {
    // Split the path into segments
    const pathSegments = path.split('/').filter(segment => segment.length > 0);

    // Handle "All Files" special case
    if (pathSegments.length > 0 && pathSegments[0] === 'All Files') {
        pathSegments.shift(); // Remove "All Files" from the path
    }

    let currentFolderId = this._rootFolderId; // Start from root

    // Traverse each segment
    for (const segment of pathSegments) {
        // Search for folder with this name in current folder
        // Uses pagination to handle large folders
        // ...
    }
}
```

#### 5.2 Potential Issues:

1. **Case Sensitivity**: Box API is case-sensitive, search might be case-insensitive
2. **Root Folder ID**: `this._rootFolderId` defaults to '0', but might be configured differently
3. **Path Format**: Search returns paths like "Demo/Sub A/file.pdf" but GetObject expects what format?
4. **Special Characters**: Paths with spaces, special chars might not match

#### 5.3 Debugging Steps Needed:

```typescript
// Add logging to _findFolderIdByPath
private async _findFolderIdByPath(path: string): Promise<string> {
    console.log(`🔍 Finding folder by path: "${path}"`);
    console.log(`📁 Starting from root folder ID: ${this._rootFolderId}`);

    const pathSegments = path.split('/').filter(segment => segment.length > 0);
    console.log(`📂 Path segments:`, pathSegments);

    // Handle "All Files" special case
    if (pathSegments.length > 0 && pathSegments[0] === 'All Files') {
        console.log(`⚠️  Removing "All Files" prefix`);
        pathSegments.shift();
    }

    let currentFolderId = this._rootFolderId;

    for (const segment of pathSegments) {
        console.log(`🔎 Looking for folder "${segment}" in folder ID: ${currentFolderId}`);

        // List items in current folder
        const items = await this._client.folders.getFolderItems(currentFolderId, {
            queryParams: {
                fields: ['name', 'type', 'id'],
                limit: 1000
            }
        });

        console.log(`📋 Found ${items.entries?.length || 0} items in folder ${currentFolderId}`);

        const folders = items.entries?.filter((item) => item.type === 'folder') || [];
        console.log(`📁 Folders:`, folders.map(f => f.name));

        const folder = folders.find((item) => item.name === segment);

        if (!folder || !folder.id) {
            console.error(`❌ Folder "${segment}" not found in current folder ${currentFolderId}`);
            console.error(`   Available folders:`, folders.map(f => f.name).join(', '));
            throw new Error(`Folder not found: ${segment}`);
        }

        console.log(`✅ Found folder "${segment}" with ID: ${folder.id}`);
        currentFolderId = folder.id;
    }

    console.log(`✅ Final folder ID: ${currentFolderId}`);
    return currentFolderId;
}
```

#### 5.4 Possible Root Causes:

**Issue #1: Root Folder Configuration**
- Your Box app might not have access to the actual root ('0')
- May need to use a specific folder ID as root
- Check `STORAGE_BOX_ROOT_FOLDER_ID` env var

**Issue #2: Path Format Mismatch**
- Search returns: "Demo/Sub A/file.pdf"
- GetObject receives: "Demo/Sub A/file.pdf"
- But Box might expect: "All Files/Demo/Sub A/file.pdf"
- Or permissions might restrict to: "some-shared-folder/Demo/Sub A/file.pdf"

**Issue #3: Case Sensitivity**
- Path from search: "Demo" (capital D)
- Actual folder name: "demo" (lowercase d)
- Box API is case-sensitive for exact matches

---

## Implementation Plan

### Phase 1: Add ObjectID to Search Results ✅

**Priority: HIGH - Enables optimization**

**Changes:**
1. Update `FileSearchResult` interface to include `objectId?: string`
2. Update Box driver search to set `objectId: fileItem.id`
3. Update other storage drivers (Google Drive, SharePoint, Dropbox)
4. Update Search action to expose ObjectID in results

**Files:**
- `packages/MJStorage/src/generic/FileStorageBase.ts`
- `packages/MJStorage/src/drivers/BoxFileStorage.ts`
- `packages/MJStorage/src/drivers/GoogleDriveFileStorage.ts`
- `packages/MJStorage/src/drivers/SharePointFileStorage.ts`
- `packages/MJStorage/src/drivers/DropboxFileStorage.ts`
- `packages/Actions/CoreActions/src/custom/files/search-storage-files.action.ts`

**Testing:**
```typescript
// Search should return:
{
  SearchResults: [{
    Path: "Demo/Sub A/file.pdf",
    Name: "file.pdf",
    ObjectID: "347751234567",  // ✅ NEW
    Size: 12345,
    ...
  }]
}
```

---

### Phase 2: Update GetObject to Accept ObjectID ✅

**Priority: HIGH - Enables fast path**

**Changes:**
1. Add optional `ObjectID` parameter to GetObject action
2. Update action to prefer ObjectID over ObjectName if provided
3. Update action metadata with new parameter
4. Update Get Metadata action similarly

**Files:**
- `packages/Actions/CoreActions/src/custom/files/get-object.action.ts`
- `packages/Actions/CoreActions/src/custom/files/get-metadata.action.ts`
- `metadata/actions/.file-storage-operations.json`

**Action Logic:**
```typescript
protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { driver, error } = await this.getDriverFromParams(params);
    if (error) return error;

    // Prefer ObjectID if provided (fast path)
    const objectId = this.getStringParam(params, 'objectid');
    const objectName = this.getStringParam(params, 'objectname');

    if (!objectId && !objectName) {
        return this.createErrorResult(
            "Either ObjectName or ObjectID parameter is required",
            "MISSING_IDENTIFIER"
        );
    }

    // Use ObjectID if available, otherwise fall back to path
    const identifier = objectId || objectName;

    // Download using identifier
    const content = await driver!.GetObject(identifier!);

    // ...
}
```

---

### Phase 3: Update Storage Drivers to Support Direct ObjectID ✅

**Priority: MEDIUM - Optimization**

**Changes:**
1. Update `GetObject()` method in each driver to detect if input is ObjectID vs path
2. Skip path resolution if ObjectID detected
3. Add helper method `_isObjectId()` to identify ID format

**Pattern for Box:**
```typescript
public async GetObject(objectName: string): Promise<Buffer> {
    try {
        let fileId: string;

        // Fast path: Check if objectName is already a Box file ID
        if (this._isObjectId(objectName)) {
            fileId = objectName;
            console.log(`⚡ Fast path: Using Object ID directly`);
        } else {
            // Slow path: Resolve path to ID
            fileId = await this._getIdFromPath(objectName);
            console.log(`🐌 Slow path: Resolved path to ID`);
        }

        // Download file...
    }
}

private _isObjectId(identifier: string): boolean {
    // Box IDs are purely numeric strings
    return /^\d+$/.test(identifier);
}
```

**Apply to other providers:**
- Google Drive: `/^[a-zA-Z0-9_-]+$/` (alphanumeric with dashes/underscores)
- Dropbox: `/^id:/` (starts with "id:" prefix)
- SharePoint: Complex - might need different detection
- S3/Azure: No separate ID (paths are IDs)

---

### Phase 4: Fix Box Path Resolution Bug 🔧

**Priority: HIGH - Critical for path-based access**

**Root Cause Investigation:**

Based on error "Folder not found: Demo", the issue is likely one of:

1. **Wrong Root Folder**
   - Check: What is `this._rootFolderId`? Should be '0' for account root
   - Fix: Verify `STORAGE_BOX_ROOT_FOLDER_ID` env var
   - Test: List contents of root folder to see what's actually there

2. **Path Format Mismatch**
   - Search returns: "Demo/Sub A/file.pdf"
   - But actual Box path might be: "Shared Folder/Demo/Sub A/file.pdf"
   - Fix: Normalize paths from search results to match Box structure

3. **Case Sensitivity**
   - Box names are case-sensitive
   - Search might return "Demo" but actual folder is "demo"
   - Fix: Use case-insensitive matching or normalize case

**Debugging Steps:**

```typescript
// Step 1: Check what's actually in the root folder
const rootContents = await this._client.folders.getFolderItems('0', {
    queryParams: { fields: ['name', 'type', 'id'] }
});
console.log('Root folder contents:', rootContents.entries?.map(e => e.name));

// Step 2: Compare with search result paths
const searchPath = "Demo/Sub A/file.pdf";
const firstSegment = searchPath.split('/')[0];
console.log('Looking for:', firstSegment);
console.log('Available in root:', rootContents.entries?.map(e => e.name));

// Step 3: Check if case-sensitive issue
const matchingFolder = rootContents.entries?.find(e =>
    e.name.toLowerCase() === firstSegment.toLowerCase()
);
if (matchingFolder && matchingFolder.name !== firstSegment) {
    console.warn(`Case mismatch! Search: "${firstSegment}", Actual: "${matchingFolder.name}"`);
}
```

**Potential Fixes:**

**Option A: Case-Insensitive Matching**
```typescript
// In _findFolderIdByPath, change:
const folder = folders.find((item) => item.name === segment);

// To:
const folder = folders.find((item) =>
    item.name.toLowerCase() === segment.toLowerCase()
);
```

**Option B: Normalize Search Paths**
```typescript
// In SearchFiles, after getting results, normalize paths:
const normalizedPath = this._normalizePath(this._reconstructPath(fileItem));

private _normalizePath(path: string): string {
    // Remove any root folder prefix that's not actually in the hierarchy
    // Handle Box-specific path quirks
    return path;
}
```

**Option C: Use Direct API Path Verification**
```typescript
// Before traversing, verify the first segment exists
private async _findFolderIdByPath(path: string): Promise<string> {
    const pathSegments = path.split('/').filter(s => s.length > 0);

    // First, list root to see what's available
    const rootItems = await this._client.folders.getFolderItems(this._rootFolderId);
    const availableFolders = rootItems.entries?.filter(e => e.type === 'folder').map(e => e.name);

    console.log(`Root folders available:`, availableFolders);
    console.log(`Looking for path starting with: ${pathSegments[0]}`);

    // Continue with traversal...
}
```

---

## Benefits of This Approach

### Performance:
- **4x faster** file access when using Object IDs from search
- Reduces API calls from 4+ down to 1
- Eliminates fragile path resolution

### Reliability:
- Less dependent on path format consistency
- Avoids case sensitivity issues
- Works across provider differences

### User Experience:
- Agents can cache Object IDs between operations
- Faster response times for file operations
- Better error messages (can distinguish ID vs path failures)

### Backward Compatibility:
- `ObjectID` parameter is optional
- Existing path-based calls continue to work
- Gradual migration path

---

## Testing Checklist

### Phase 1: ObjectID in Search Results
- [ ] Search returns ObjectID for Box files
- [ ] Search returns ObjectID for Google Drive files
- [ ] Search returns ObjectID for SharePoint files
- [ ] Search returns ObjectID for Dropbox files
- [ ] ObjectID is exposed in Search action output params

### Phase 2: GetObject with ObjectID
- [ ] GetObject accepts ObjectID parameter
- [ ] GetObject prefers ObjectID over ObjectName
- [ ] GetObject falls back to ObjectName if no ObjectID
- [ ] Action metadata updated with ObjectID parameter
- [ ] Error message clarifies when both are missing

### Phase 3: Driver ObjectID Support
- [ ] Box driver detects numeric ID and skips path resolution
- [ ] Google Drive driver detects alphanumeric ID
- [ ] Dropbox driver detects "id:" prefix
- [ ] SharePoint driver handles complex IDs
- [ ] S3/Azure continue to work (path-based)

### Phase 4: Box Path Resolution
- [ ] Debug logging shows root folder contents
- [ ] Debug logging shows path traversal steps
- [ ] Case-insensitive matching works
- [ ] Paths from search can be resolved
- [ ] Error messages include available folder names

---

## Migration Path

### Step 1: Add ObjectID to Interfaces (Non-Breaking)
- Update FileSearchResult to include optional objectId
- Deploy without changing behavior

### Step 2: Update Drivers to Return ObjectID (Non-Breaking)
- Each driver populates objectId in search results
- Existing code ignores it (backward compatible)

### Step 3: Update Actions to Expose ObjectID (Non-Breaking)
- Search action includes ObjectID in output
- GetObject accepts optional ObjectID parameter
- Existing path-based calls continue working

### Step 4: Agent Prompts Use ObjectID (Optimization)
- Update agent prompts to use ObjectID from search
- Fallback to path if ObjectID not available
- Monitor performance improvements

### Step 5: Fix Path Resolution (Bug Fix)
- Add debug logging
- Identify root cause (case, root folder, format)
- Apply targeted fix
- Validate all providers work

---

## Example Agent Workflow (After Implementation)

```
User: "Download the quarterly report PDF from Box"

Agent calls: Search Storage Files
  Input: { StorageProvider: "Box", Query: "quarterly report", FileTypes: ["pdf"] }
  Output: {
    SearchResults: [{
      Path: "Demo/Sub A/quarterly-report.pdf",
      ObjectID: "347751234567",  // ✅ Box file ID
      Size: 2048576,
      ...
    }]
  }

Agent calls: Get Object
  Input: {
    StorageProvider: "Box",
    ObjectID: "347751234567"  // ✅ Uses ID directly
  }
  Output: {
    Content: "base64-encoded-pdf-data...",
    Size: 2048576
  }

Result: File downloaded with 1 API call instead of 4!
```

---

## Recommended Implementation Order

1. **CRITICAL (Do First)**: Fix Box path resolution bug
   - Add debug logging to see what's happening
   - Identify root cause of "Folder not found: Demo"
   - Apply targeted fix (likely case sensitivity or root folder)

2. **HIGH VALUE (Do Next)**: Add ObjectID to search results
   - Update FileSearchResult interface
   - Update all storage drivers to populate objectId
   - Update Search action to expose ObjectID

3. **OPTIMIZATION (Do After)**: Update GetObject to use ObjectID
   - Add ObjectID parameter to action
   - Update driver methods to detect and use Object IDs
   - Update action metadata

4. **POLISH (Do Last)**: Agent prompt optimization
   - Update agent prompts to use ObjectID when available
   - Monitor performance improvements
   - Document best practices

---

## Files to Modify

### MJStorage Package:
- [ ] `src/generic/FileStorageBase.ts` - Add objectId to FileSearchResult
- [ ] `src/drivers/BoxFileStorage.ts` - Return objectId in search, accept in GetObject
- [ ] `src/drivers/GoogleDriveFileStorage.ts` - Same pattern
- [ ] `src/drivers/SharePointFileStorage.ts` - Same pattern
- [ ] `src/drivers/DropboxFileStorage.ts` - Same pattern

### CoreActions Package:
- [ ] `src/custom/files/search-storage-files.action.ts` - Expose ObjectID in results
- [ ] `src/custom/files/get-object.action.ts` - Accept ObjectID parameter
- [ ] `src/custom/files/get-metadata.action.ts` - Accept ObjectID parameter

### Metadata:
- [ ] `metadata/actions/.file-storage-operations.json` - Add ObjectID parameters

### Migrations:
- None needed (purely code changes)

---

## Success Metrics

- ✅ GetObject with ObjectID: 75% reduction in API calls
- ✅ GetObject with path: Works reliably for all providers
- ✅ Search → GetObject: Seamless workflow with IDs
- ✅ Agent file operations: Faster, more reliable
- ✅ Error messages: Clear distinction between ID vs path failures
