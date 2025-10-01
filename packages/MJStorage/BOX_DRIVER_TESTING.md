# Box File Storage Driver Testing Guide

## Purpose
This document provides step-by-step instructions for testing the BoxFileStorage driver using MJCLI and the File Storage actions. Use this guide after refactoring to ensure all functionality works correctly.

## Prerequisites
- MJCLI installed and configured
- Box.com storage provider configured in the database
- Run all commands from the MJ repository root: `/Users/jordanfanapour/Documents/GitHub/MJ`

## Test Files in Box.com
Based on previous testing, the following files exist in the root directory:
- `test.ts` - 4,226 bytes, can be used for read operations
- Various `rendered-*.mp3`, `rendered-*.mp4`, `rendered-*.pdf`, etc. files
- Directories: `AiForAccounting`, `AIforAirports`, `AIforBuilders`, `LearningContentAutomation`, `render`, `SidecarLearningHub`, `TestSchool`

## Testing Protocol

### Important Rules
1. **Never delete existing files** - Only delete files/directories you create during testing
2. **Use unique names** - Prefix test files with `test-cli-` or similar to identify them
3. **Clean up after testing** - Delete all test files/directories created
4. **Verify counts** - Check object/directory counts before and after testing

### Test Command Pattern
All test commands follow this pattern with a 7-second delay to capture output:

```bash
npx mj ai actions run -n "Action Name" -p "Param=Value" -p "Param2=Value2" 2>&1 &
sleep 7 && pkill -f "mj ai actions run"
```

## Complete Test Suite

### 1. List Objects (Baseline)
**Purpose**: Get baseline counts of objects and directories

```bash
npx mj ai actions run -n "File Storage: List Objects" -p "StorageProvider=Box.com" -p "Path=/" > /tmp/box_list.txt 2>&1 &
sleep 7 && cat /tmp/box_list.txt | tail -40
```

**Expected Output**:
- ObjectCount: 36 (from previous test)
- DirectoryCount: 9 (from previous test)
- List of all files and directories

**What to verify**: Note the counts for comparison at end of testing

---

### 2. Check Object Exists
**Purpose**: Verify file existence checking works

```bash
npx mj ai actions run -n "File Storage: Check Object Exists" -p "StorageProvider=Box.com" -p "ObjectName=test.ts" 2>&1 &
sleep 5 && pkill -f "mj ai actions run"
```

**Expected Output**:
```json
{
  "Name": "Exists",
  "Type": "Output",
  "Value": true
}
```

**What to verify**: Exists should be `true` for `test.ts`

---

### 3. Check Directory Exists
**Purpose**: Verify directory existence checking works

```bash
npx mj ai actions run -n "File Storage: Check Directory Exists" -p "StorageProvider=Box.com" -p "DirectoryPath=TestSchool" 2>&1 &
sleep 5 && pkill -f "mj ai actions run"
```

**Expected Output**:
```json
{
  "Name": "Exists",
  "Type": "Output",
  "Value": true
}
```

**What to verify**: Exists should be `true` for `TestSchool` directory

---

### 4. Get Object Metadata
**Purpose**: Verify metadata retrieval works correctly

```bash
npx mj ai actions run -n "File Storage: Get Object Metadata" -p "StorageProvider=Box.com" -p "ObjectName=test.ts" 2>&1 &
sleep 5 && pkill -f "mj ai actions run"
```

**Expected Output**:
```json
[
  { "Name": "Name", "Type": "Output", "Value": "test.ts" },
  { "Name": "Size", "Type": "Output", "Value": 4226 },
  { "Name": "ContentType", "Type": "Output", "Value": "video/mp2t" },
  { "Name": "LastModified", "Type": "Output", "Value": "2025-05-13T18:05:27.000Z" },
  { "Name": "IsDirectory", "Type": "Output", "Value": false }
]
```

**What to verify**:
- Name should be "test.ts"
- Size should be 4226
- IsDirectory should be false
- Should have valid LastModified date

---

### 5. Get Download URL
**Purpose**: Verify pre-authenticated download URL generation

```bash
npx mj ai actions run -n "File Storage: Get Download URL" -p "StorageProvider=Box.com" -p "ObjectName=test.ts" 2>&1 &
sleep 5 && pkill -f "mj ai actions run"
```

**Expected Output**:
```json
{
  "Name": "DownloadUrl",
  "Type": "Output",
  "Value": "https://dl.boxcloud.com/d/1/..."
}
```

**What to verify**:
- DownloadUrl should start with "https://dl.boxcloud.com"
- URL should be a long pre-authenticated string

---

### 6. Get Object
**Purpose**: Verify file content download works

```bash
npx mj ai actions run -n "File Storage: Get Object" -p "StorageProvider=Box.com" -p "ObjectName=test.ts" 2>&1 &
sleep 7 && pkill -f "mj ai actions run"
```

**Expected Output**:
```json
[
  { "Name": "Content", "Type": "Output", "Value": "base64encodedstring..." },
  { "Name": "Size", "Type": "Output", "Value": 4226 }
]
```

**What to verify**:
- Content should be a base64-encoded string
- Size should match the file size (4226)

---

### 7. Create Directory
**Purpose**: Verify directory creation works

```bash
npx mj ai actions run -n "File Storage: Create Directory" -p "StorageProvider=Box.com" -p "DirectoryPath=test-refactor-dir" 2>&1 &
sleep 5 && pkill -f "mj ai actions run"
```

**Expected Output**:
```json
{
  "Name": "Success",
  "Type": "Output",
  "Value": true
}
```

**Verify creation**:
```bash
npx mj ai actions run -n "File Storage: Check Directory Exists" -p "StorageProvider=Box.com" -p "DirectoryPath=test-refactor-dir" 2>&1 &
sleep 5 && pkill -f "mj ai actions run"
```

**What to verify**:
- Success should be true
- Directory should exist after creation

---

### 8. Copy Object
**Purpose**: Verify file copying works

```bash
npx mj ai actions run -n "File Storage: Copy Object" -p "StorageProvider=Box.com" -p "SourceObjectName=test.ts" -p "DestinationObjectName=test-refactor-copy.ts" 2>&1 &
sleep 5 && pkill -f "mj ai actions run"
```

**Expected Output**:
```json
{
  "Name": "Success",
  "Type": "Output",
  "Value": true
}
```

**Verify copy**:
```bash
npx mj ai actions run -n "File Storage: Check Object Exists" -p "StorageProvider=Box.com" -p "ObjectName=test-refactor-copy.ts" 2>&1 &
sleep 5 && pkill -f "mj ai actions run"
```

**What to verify**:
- Success should be true
- Copied file should exist
- Original file should still exist

---

### 9. Move Object
**Purpose**: Verify file moving/renaming works

```bash
npx mj ai actions run -n "File Storage: Move Object" -p "StorageProvider=Box.com" -p "SourceObjectName=test-refactor-copy.ts" -p "DestinationObjectName=test-refactor-moved.ts" 2>&1 &
sleep 5 && pkill -f "mj ai actions run"
```

**Expected Output**:
```json
{
  "Name": "Success",
  "Type": "Output",
  "Value": true
}
```

**Verify move**:
```bash
# Old file should NOT exist
npx mj ai actions run -n "File Storage: Check Object Exists" -p "StorageProvider=Box.com" -p "ObjectName=test-refactor-copy.ts" 2>&1 &
sleep 5 && pkill -f "mj ai actions run"

# New file should exist
npx mj ai actions run -n "File Storage: Check Object Exists" -p "StorageProvider=Box.com" -p "ObjectName=test-refactor-moved.ts" 2>&1 &
sleep 5 && pkill -f "mj ai actions run"
```

**What to verify**:
- Success should be true
- Old filename should NOT exist (Exists: false)
- New filename should exist (Exists: true)

---

### 10. Delete Object
**Purpose**: Verify file deletion works

```bash
npx mj ai actions run -n "File Storage: Delete Object" -p "StorageProvider=Box.com" -p "ObjectName=test-refactor-moved.ts" 2>&1 &
sleep 5 && pkill -f "mj ai actions run"
```

**Expected Output**:
```json
{
  "Name": "Success",
  "Type": "Output",
  "Value": true
}
```

**Verify deletion**:
```bash
npx mj ai actions run -n "File Storage: Check Object Exists" -p "StorageProvider=Box.com" -p "ObjectName=test-refactor-moved.ts" 2>&1 &
sleep 5 && pkill -f "mj ai actions run"
```

**What to verify**:
- Success should be true
- File should NOT exist after deletion (Exists: false)

---

### 11. Delete Directory
**Purpose**: Verify directory deletion works

```bash
npx mj ai actions run -n "File Storage: Delete Directory" -p "StorageProvider=Box.com" -p "DirectoryPath=test-refactor-dir" -p "Recursive=false" 2>&1 &
sleep 5 && pkill -f "mj ai actions run"
```

**Expected Output**:
```json
{
  "Name": "Success",
  "Type": "Output",
  "Value": true
}
```

**Verify deletion**:
```bash
npx mj ai actions run -n "File Storage: Check Directory Exists" -p "StorageProvider=Box.com" -p "DirectoryPath=test-refactor-dir" 2>&1 &
sleep 5 && pkill -f "mj ai actions run"
```

**What to verify**:
- Success should be true
- Directory should NOT exist after deletion (Exists: false)

---

### 12. Final Verification - List Objects
**Purpose**: Verify no original files were deleted

```bash
npx mj ai actions run -n "File Storage: List Objects" -p "StorageProvider=Box.com" -p "Path=/" > /tmp/box_list_final.txt 2>&1 &
sleep 7 && cat /tmp/box_list_final.txt | tail -40
```

**Expected Output**:
- ObjectCount: 36 (should match baseline)
- DirectoryCount: 9 (should match baseline)

**What to verify**:
- Object count matches the baseline (step 1)
- Directory count matches the baseline (step 1)
- All test files/directories were cleaned up

---

## Success Criteria

All tests pass if:
1. ✅ All actions return Success: true or appropriate results
2. ✅ File existence checks work correctly
3. ✅ Metadata retrieval returns accurate information
4. ✅ Copy creates a new file without deleting the original
5. ✅ Move removes the old file and creates the new one
6. ✅ Delete removes files/directories successfully
7. ✅ Final object/directory counts match the baseline
8. ✅ No original Box.com files were deleted or modified

## Common Issues

### Issue: Actions timeout
**Solution**: The CLI output continues after the process is killed. This is expected. Look for the "Success" or result output before the timeout.

### Issue: "Item not found" errors
**Solution**: Verify the file/directory name is correct and exists in Box.com. Use List Objects to see available items.

### Issue: Box API 405 errors
**Solution**: This indicates the refactor didn't work correctly. The SDK should prevent these errors.

### Issue: Box API 409 conflicts
**Solution**: This is normal when trying to create a file/directory that already exists. The driver should handle this gracefully and return success.

## Refactoring Context

### What was changed:
- Replaced manual REST API calls with Box Node SDK (`box-node-sdk`)
- Removed `_apiRequest` method in favor of SDK client methods
- Updated `_getItemInfoFromPath` to use SDK's `client.files.get()` and `client.folders.get()`
- Updated all CRUD operations to use SDK methods

### Key SDK Methods Used:
- `client.folders.get(folderId)` - Get folder info
- `client.files.get(fileId)` - Get file info
- `client.folders.getItems(folderId, options)` - List directory contents
- `client.files.getReadStream(fileId)` - Download file content
- `client.files.getDownloadUrl(fileId)` - Get download URL
- `client.files.uploadFile(parentId, filename, content)` - Upload file
- `client.files.copy(fileId, parentId)` - Copy file
- `client.files.update(fileId, updates)` - Move/rename file
- `client.files.delete(fileId)` - Delete file
- `client.folders.create(parentId, name)` - Create directory
- `client.folders.delete(folderId)` - Delete directory

### Authentication:
The SDK handles token refresh automatically using client credentials grant type.

## After Testing

Once all tests pass:
1. Delete this testing guide (or keep for future reference)
2. Commit the refactored BoxFileStorage driver
3. Update any documentation that references the Box driver implementation
4. Consider this refactor complete
