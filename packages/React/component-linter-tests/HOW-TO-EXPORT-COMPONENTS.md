# How to Export Valid Components from Database

## Overview

To populate the `fixtures/valid-components/` directory with real production components from your database, follow these steps.

## Method 1: SQL Query (Recommended)

### 1. Run SQL Query

Connect to your MemberJunction database and run:

```sql
SELECT
    ID,
    Name,
    Type,
    Title,
    Description,
    Code,
    Location,
    FunctionalRequirements,
    TechnicalDesign,
    ExampleUsage,
    Namespace,
    Version,
    Registry,
    Status,
    DataRequirementsJSON,
    ParentComponentID
FROM
    [__mj].[vwComponents]
WHERE
    Status = 'Active'
    AND ParentComponentID IS NULL  -- Root level components only
    AND Code IS NOT NULL
    AND Code != ''
ORDER BY
    Name;
```

This will return all active root-level components that have code.

### 2. Export Results to JSON

Use your SQL client to export the results:

**SQL Server Management Studio:**
- Right-click results → Save Results As → JSON file

**Azure Data Studio:**
- Results pane → Export As → JSON

**Command Line (sqlcmd):**
```bash
sqlcmd -S your-server -d your-database -U your-user -P your-password \
  -Q "SELECT * FROM [__mj].[vwComponents] WHERE Status='Active' AND ParentComponentID IS NULL FOR JSON AUTO" \
  -o components.json
```

### 3. Convert to Fixture Format

For each component in the results, create a file `fixtures/valid-components/{component-name}.json` with this format:

```json
{
  "name": "ComponentName",
  "type": "chart",
  "title": "Component Title",
  "description": "Component description",
  "code": "function ComponentName() { ... }",
  "location": "embedded",
  "functionalRequirements": "...",
  "technicalDesign": "...",
  "exampleUsage": "<ComponentName />",
  "namespace": "namespace/path",
  "version": "1.0.0",
  "registry": "Skip",
  "status": "Active"
}
```

## Method 2: Programmatic Export (Advanced)

### Prerequisites

You need a working database connection with proper provider initialization. This is complex and requires:
- SQL Server connection pool setup
- Data provider configuration
- Metadata provider registration

### Script Location

A starter script is available at:
- `scripts/export-valid-components.ts`

**Note**: This script currently has database initialization issues and is provided as a reference only. To use it, you would need to:

1. Set up proper SQL Server connection pool
2. Configure SQLServerDataProvider with the pool
3. Set Metadata.Provider = your configured provider
4. Handle authentication and connection management

This is the same initialization that MJServer does, which is quite involved.

## Method 3: Copy from Existing Source

If you already have component JSON files from your application:

```bash
# Copy all component JSONs
cp /path/to/your/components/*.json fixtures/valid-components/

# Or copy specific ones
cp /path/to/your/components/my-component.json fixtures/valid-components/
```

## After Exporting

### Run Tests

```bash
npm run test:fixtures
```

This will:
- Load all fixtures from `broken-components/`, `fixed-components/`, and `valid-components/`
- Run the linter against each component
- Report any violations found

### Expected Output

```
📊 Fixture Statistics:
   Total Fixtures: 25
   Broken:  3
   Fixed:   2
   Valid:   20  ← Your exported components

================================================================================
📦 Bulk Test - All Valid Components
================================================================================
   Testing 20 valid component(s)...
   Results: 0/20 components have violations  ← All should pass!

   ✅ All valid components passed linting!
```

### If Violations Are Found

If any valid components have violations:

1. **Review the violation** - Is it a real bug or a false positive?
2. **Fix the source component** - Update the component in your database/codebase
3. **Re-export** - Update the fixture file
4. **Re-test** - Run `npm run test:fixtures` again

## Component Naming

Fixture filenames should be:
- Lowercase
- Hyphen-separated
- Descriptive

Examples:
- `user-dashboard.json`
- `sales-report-chart.json`
- `member-list-view.json`

The script will auto-sanitize component names:
```typescript
const filename = componentName
  .replace(/[^a-zA-Z0-9-]/g, '-')  // Replace special chars with hyphens
  .replace(/-+/g, '-')              // Collapse multiple hyphens
  .toLowerCase();                   // Convert to lowercase
```

## Tips

### Start Small
Don't export all components at once. Start with 5-10 important ones:

```sql
SELECT TOP 10 *
FROM [__mj].[vwComponents]
WHERE Status = 'Active'
  AND ParentComponentID IS NULL
  AND Code IS NOT NULL
ORDER BY __mj_UpdatedAt DESC;  -- Most recently updated
```

### Focus on Recent Components
Test the latest components first - they're more likely to have the patterns you're validating:

```sql
WHERE Status = 'Active'
  AND ParentComponentID IS NULL
  AND __mj_UpdatedAt >= DATEADD(month, -3, GETDATE())  -- Last 3 months
```

### Skip Complex Library-Dependent Components
Components with complex library dependencies may fail to parse during individual tests (though they work fine in bulk tests). Consider:
- Simpler components first
- Components without custom library dependencies
- Self-contained components

## Troubleshooting

### "No components found"
- Check that you have active components in the database
- Verify the `Status` field is `'Active'`
- Ensure `ParentComponentID IS NULL` (root level only)
- Check that `Code` field is not empty

### "Parse error" during linting
- Component may have complex library dependencies
- May need real contextUser (not mock)
- Component may reference unavailable global variables

**Solution**: These components will still be tested in bulk tests, which handle parse errors gracefully.

### "Cannot connect to database"
- Verify `.env` file has correct credentials
- Check SQL Server is running and accessible
- Test connection with SQL client first

## Summary

**Quickest Method**:
1. Run SQL query (Method 1)
2. Export to JSON
3. Manually create 5-10 fixture files
4. Run `npm run test:fixtures`

**For Large Scale**:
- Export all components to JSON
- Write a simple Node script to convert JSON to fixture format
- Batch process all components

The infrastructure is ready - just need to populate `fixtures/valid-components/` with your component JSON files!
