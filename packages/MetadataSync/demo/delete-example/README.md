# deleteRecord Feature Example

This directory demonstrates the new `deleteRecord` feature for removing records from the database through the metadata sync tool.

## How to Test

1. **Review the test file**: Look at `test-delete.json` to see how a record is marked for deletion

2. **Dry run first** (recommended):
   ```bash
   mj sync push --dir ./demo/delete-example --dry-run
   ```
   This will show you what would be deleted without actually performing the deletion.

3. **Execute the deletion**:
   ```bash
   mj sync push --dir ./demo/delete-example
   ```
   This will delete the record from the database and update the JSON file with a `deletedAt` timestamp.

## What Happens

When you run the push command:

1. The tool detects the `deleteRecord` directive with `delete: true`
2. It verifies the record exists using the `primaryKey`
3. Deletes the record from the database
4. Updates the JSON file to add `deletedAt` timestamp
5. Logs the deletion in SQL logs (if enabled)

## After Deletion

The JSON file will be updated to look like:
```json
{
  "fields": { ... },
  "primaryKey": { ... },
  "deleteRecord": {
    "delete": true,
    "deletedAt": "2024-01-15T14:30:00.000Z"
  },
  "sync": { ... }
}
```

## Important Notes

- The `primaryKey` must exist and be valid
- If the record doesn't exist, the tool will warn you but still mark it as deleted
- If there are foreign key constraints, the deletion will fail with an error
- Once `deletedAt` is set, subsequent push operations won't attempt deletion again

## Use Cases

- Removing deprecated prompts
- Cleaning up test data
- Synchronizing deletions across environments
- Maintaining clean metadata through version control