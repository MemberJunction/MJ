# MemberJunction Database Migrations Guide

## Overview

This directory contains SQL migration scripts for MemberJunction database schema changes. We use Flyway for migration management.

## 🚨 IMPORTANT: Where to Create New Migrations

**All new migrations MUST be created in the `migrations/v3/` directory.**

The `migrations/v2/` directory is **frozen** and should not receive new migrations. It contains historical migrations up to v2.133.0.

```
migrations/
├── v2/                    # ❌ FROZEN - Do NOT add new migrations here
│   └── V202407171600...   # Historical migrations through v2.133.0
├── v3/                    # ✅ CREATE NEW MIGRATIONS HERE
│   ├── B202601122300...   # v3.0 Baseline (complete schema)
│   └── V202601200000...   # All new v3.x migrations
└── R__RefreshMetadata.sql # Repeatable migration (runs after all versioned)
```

## Version 3.0 Baseline Migration

Starting with v3.0, MemberJunction uses a **baseline migration** approach to streamline fresh installations:

### Migration Paths

1. **Fresh Installation (Blank Database)**:
   - Flyway detects blank database and baselines at version `202601122300`
   - Runs `B202601122300__v3.0_Baseline.sql` from v3 (complete v3.0 schema based on v2.133.0)
   - Runs `R__RefreshMetadata.sql` from root (repeatable migration, always runs after versioned migrations)
   - Skips all v2 versioned migrations (V202407171600... through V202601121038)
   - Runs any future v3 migrations with versions > 202601122300

2. **Existing Installation (< v2.133.0)**:
   - Continues running remaining v2 migrations incrementally
   - Skips baseline script (already has migration history)
   - Runs v3 migrations when they arrive
   - Repeatable scripts run as normal

3. **Existing Installation (at v2.133.0)**:
   - Skips baseline script (already at that schema state)
   - Runs v3 migrations with versions > 202601122300
   - Repeatable scripts run as normal

### Configuration

The baseline is configured in Flyway settings:
```javascript
{
  migrationsLocation: 'filesystem:./migrations',  // Flyway recursively scans v2/ and v3/ subdirectories
  baselineVersion: '202602151200',                // Baseline version (v5.0.x based on v4.4.x + 2 migration scripts that would have been in v4.5.0, unreleased)
  baselineOnMigrate: true                         // Auto-baseline blank databases
}
```

### Version Numbering for v3+

**IMPORTANT**: All v3+ migrations must use **timestamp-based versions** (not semantic versions like 3.0.1):

```
V[YYYYMMDDHHMM]__v[VERSION].x_[DESCRIPTION].sql
```

Examples:
- ✅ `V202601130900__v3.0.1_Add_NewFeature.sql`
- ✅ `V202601141400__v3.1.0_Major_Update.sql`
- ❌ `V3.0.1__Add_NewFeature.sql` (would be interpreted as 3.0001, less than 202601122300!)

This ensures v3 migrations run **after** all v2 migrations (including v2.133.0) in Flyway's version ordering.

## Migration File Naming Convention

**CRITICAL**: Migration files must follow this exact format:
```
V[YYYYMMDDHHMM]__v[VERSION].x_[DESCRIPTION].sql
```

- Use `date +"%Y%m%d%H%M"` to get the current timestamp in 24-hour format
- **Version Number**: Find the most recent file in the migrations folder and increment the minor version number by 1
  - Example: If latest is v2.60.x, next should be v2.61.x
- Example: `V202506130552__v2.49.x_Add_AIAgent_Status_And_DriverClass_Columns.sql`
- This ensures Flyway executes migrations in the correct order

## CRITICAL: Migration Content Rules

**MIGRATIONS MUST ONLY CONTAIN:**
1. **DDL Operations** (CREATE, ALTER, DROP for tables, columns, indexes, constraints)
2. **sp_addextendedproperty** calls for column/table descriptions
3. **Schema changes only** - NO data manipulation beyond what's required for the schema change

**NEVER INCLUDE IN MIGRATIONS:**
- View creation/updates (handled by CodeGen)
- EntityField inserts/updates (handled by CodeGen)
- Entity metadata changes (handled by CodeGen)
- Stored procedure creation/updates (handled by CodeGen)
- Any MemberJunction metadata updates (handled by CodeGen)

**The MemberJunction CodeGen system automatically handles:**
- Creating/updating all views based on schema changes
- Updating EntityField records for new columns
- Generating stored procedures
- Updating all metadata based on schema and extended properties
- Synchronizing everything with the database schema

## Best Practices

### 1. Migration Structure and Organization

**Group ALTER TABLE statements** to minimize the number of operations:
```sql
-- ✅ CORRECT - Single ALTER TABLE with multiple columns
ALTER TABLE ${flyway:defaultSchema}.TableName 
ADD Column1 INT NULL,
    Column2 NVARCHAR(50) NULL,
    Column3 UNIQUEIDENTIFIER NULL;

-- ❌ WRONG - Multiple ALTER TABLE statements
ALTER TABLE ${flyway:defaultSchema}.TableName ADD Column1 INT NULL;
ALTER TABLE ${flyway:defaultSchema}.TableName ADD Column2 NVARCHAR(50) NULL;
ALTER TABLE ${flyway:defaultSchema}.TableName ADD Column3 UNIQUEIDENTIFIER NULL;
```

**Organize migration files** with this structure:
1. All ALTER TABLE and DDL operations at the top
2. All sp_addextendedproperty calls at the bottom
3. Group related operations together

**DO NOT create indexes** unless specifically requested - MemberJunction handles index creation automatically.

### 2. Modifying Existing Fields

When modifying existing fields, **always drop existing extended properties first**:
```sql
-- Drop existing extended property if it exists
IF EXISTS (SELECT * FROM sys.extended_properties 
           WHERE major_id = OBJECT_ID('${flyway:defaultSchema}.TableName') 
           AND minor_id = (SELECT column_id FROM sys.columns 
                          WHERE object_id = OBJECT_ID('${flyway:defaultSchema}.TableName') 
                          AND name = 'ColumnName')
           AND name = 'MS_Description')
BEGIN
    EXEC sp_dropextendedproperty 
        @name = N'MS_Description',
        @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = 'TableName',
        @level2type = N'COLUMN', @level2name = 'ColumnName';
END

-- Then add the new extended property
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'New description',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TableName',
    @level2type = N'COLUMN', @level2name = 'ColumnName';
```

### 3. Use Hardcoded UUIDs
**IMPORTANT**: Always use hardcoded UUIDs in migration files (not NEWID()) to ensure consistent IDs across all environments.

```sql
-- ✅ CORRECT - Hardcoded UUID
DECLARE @VendorID UNIQUEIDENTIFIER = 'C2E2D782-1BDA-4F37-AF4B-953155FF6CF6';

-- ❌ WRONG - Dynamic UUID
DECLARE @VendorID UNIQUEIDENTIFIER = NEWID();
```

Generate UUIDs using: `uuidgen | tr '[:lower:]' '[:upper:]'`

### 4. Never Insert Timestamp Columns
**NEVER** insert values into `__mj_CreatedAt` or `__mj_UpdatedAt` columns - MemberJunction handles these automatically.

```sql
-- ✅ CORRECT
INSERT INTO ${flyway:defaultSchema}.AIVendor (ID, Name, Description)
VALUES (@VendorID, 'Vendor Name', 'Description');

-- ❌ WRONG
INSERT INTO ${flyway:defaultSchema}.AIVendor (ID, Name, Description, __mj_CreatedAt, __mj_UpdatedAt)
VALUES (@VendorID, 'Vendor Name', 'Description', GETUTCDATE(), GETUTCDATE());
```

### 5. Use Correct Schema Placeholder
Always use Flyway's schema placeholder without adding the schema prefix:

```sql
-- ✅ CORRECT
ALTER TABLE ${flyway:defaultSchema}.TableName
INSERT INTO ${flyway:defaultSchema}.TableName

-- ❌ WRONG
ALTER TABLE ${flyway:defaultSchema}.__mj.TableName  -- Don't add __mj after placeholder
INSERT INTO ${mjCoreSchema}.TableName
INSERT INTO __mj.TableName
```

**Note**: The `${flyway:defaultSchema}` placeholder already includes the schema name (e.g., `__mj`), so don't add it again.

### 6. CHECK Constraint Guidelines

When creating CHECK constraints for nullable columns:
- **DO NOT** add `OR ColumnName IS NULL` to simple list lookup constraints
- SQL Server automatically allows NULL values for nullable columns
- The MemberJunction CodeGen parser expects simple CHECK constraint syntax

```sql
-- ✅ CORRECT - Simple list constraint for nullable column
CHECK (CancellationReason IN ('User Request', 'Timeout', 'System'))

-- ❌ WRONG - Redundant NULL check breaks CodeGen parser
CHECK (CancellationReason IN ('User Request', 'Timeout', 'System') OR CancellationReason IS NULL)
```

### 7. AI Model Configuration Guidelines

When adding AI models and vendors:

1. **Token Limits**: Use actual provider limits, not theoretical model capabilities
   - Check provider documentation for real MaxInputTokens and MaxOutputTokens
   - Example: Groq's Qwen 3 32B supports 128k input, 16k output (not 32k/32k)

2. **Vendor Types**: Distinguish between model developers and inference providers
   - Model Developer: The company that created/trained the model
   - Inference Provider: The service offering API access to run the model

3. **Priority Field**: Lower numbers = higher priority (0 is highest)

4. **Response Formats**: Comma-delimited list (e.g., "Any", "Any, JSON", "JSON")

5. **Driver Class Names**: Follow existing conventions
   - Examples: "OpenAILLM", "AnthropicLLM", "GroqLLM"
   - Not: "OpenAIAPIService", "AnthropicService", etc.

### 8. Testing Migrations

Before committing:
1. Verify all foreign key references exist
   - Check entity schemas in `packages/MJCoreEntities/src/generated/entity_subclasses.ts`
   - This file contains all entity definitions with exact field names, types, and constraints
   - Look for the entity class (e.g., `AIModelEntity`, `AIVendorEntity`) to see all fields
2. Check that TypeIDs match existing definitions
3. Ensure all required fields are populated (non-nullable fields in entity definitions)
4. Test rollback scenarios if applicable

## Common Entity IDs

For reference, here are commonly used IDs:

### AI Model Types
- LLM: `E8A5CCEC-6A37-EF11-86D4-000D3A4E707E`

### AI Vendor Type Definitions
- Model Developer: `10DB468E-F2CE-475D-9F39-2DF2DE75D257`
- Inference Provider: `5B043EC3-1FF2-4730-B5D2-7CFDA50979B3`

### Existing Vendors (examples)
- OpenAI: `E0A5CCEC-6A37-EF11-86D4-000D3A4E707E`
- Anthropic: `E1A5CCEC-6A37-EF11-86D4-000D3A4E707E`
- Google: `E2A5CCEC-6A37-EF11-86D4-000D3A4E707E`
- Groq: `E3A5CCEC-6A37-EF11-86D4-000D3A4E707E`

## Migration Checklist

Before creating a migration:
- [ ] Generate timestamp with `date +"%Y%m%d%H%M"`
- [ ] Generate any needed UUIDs with `uuidgen | tr '[:lower:]' '[:upper:]'`
- [ ] Use `${flyway:defaultSchema}` for schema references
- [ ] Exclude __mj timestamp columns from INSERTs
- [ ] Verify all foreign key references
- [ ] Add appropriate comments explaining the migration
- [ ] Test the migration in a development environment