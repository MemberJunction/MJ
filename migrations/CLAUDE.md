# MemberJunction Database Migrations Guide

## Overview

This directory contains SQL migration scripts for MemberJunction database schema changes. We use Flyway for migration management.

## Migration File Naming Convention

**CRITICAL**: Migration files must follow this exact format:
```
V[YYYYMMDDHHMM]__v[VERSION].x_[DESCRIPTION].sql
```

- Use `date +"%Y%m%d%H%M"` to get the current timestamp in 24-hour format
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

### 1. Use Hardcoded UUIDs
**IMPORTANT**: Always use hardcoded UUIDs in migration files (not NEWID()) to ensure consistent IDs across all environments.

```sql
-- ✅ CORRECT - Hardcoded UUID
DECLARE @VendorID UNIQUEIDENTIFIER = 'C2E2D782-1BDA-4F37-AF4B-953155FF6CF6';

-- ❌ WRONG - Dynamic UUID
DECLARE @VendorID UNIQUEIDENTIFIER = NEWID();
```

Generate UUIDs using: `uuidgen | tr '[:lower:]' '[:upper:]'`

### 2. Never Insert Timestamp Columns
**NEVER** insert values into `__mj_CreatedAt` or `__mj_UpdatedAt` columns - MemberJunction handles these automatically.

```sql
-- ✅ CORRECT
INSERT INTO ${flyway:defaultSchema}.AIVendor (ID, Name, Description)
VALUES (@VendorID, 'Vendor Name', 'Description');

-- ❌ WRONG
INSERT INTO ${flyway:defaultSchema}.AIVendor (ID, Name, Description, __mj_CreatedAt, __mj_UpdatedAt)
VALUES (@VendorID, 'Vendor Name', 'Description', GETUTCDATE(), GETUTCDATE());
```

### 3. Use Correct Schema Placeholder
Always use Flyway's schema placeholder:

```sql
-- ✅ CORRECT
INSERT INTO ${flyway:defaultSchema}.TableName

-- ❌ WRONG
INSERT INTO ${mjCoreSchema}.TableName
INSERT INTO __mj.TableName
```

### 4. AI Model Configuration Guidelines

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

### 5. Testing Migrations

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