# Primary Key Override Implementation Plan

## Overview

Currently, MemberJunction restricts the ability to set primary key values during record creation when those primary keys have default values (like `NEWID()` or `NEWSEQUENTIALID()`). This limitation prevents important use cases such as data synchronization across environments where maintaining consistent primary keys is essential.

This implementation plan outlines changes to allow optional primary key value specification during record creation, while maintaining the current default behavior and excluding auto-increment/identity columns (which require special database permissions to override).

## Current Behavior

1. **SQL Stored Procedures**: Primary key parameters are excluded from `spCreate` procedures when:
   - The field is auto-increment/identity, OR
   - The field is a uniqueidentifier with a default value

2. **GraphQL Mutations**: Primary key fields are excluded from create mutations when:
   - The field is auto-increment/identity, OR  
   - The field is a uniqueidentifier (regardless of default)

3. **Data Providers**: Filter out primary key values during create operations based on field metadata

## Proposed Changes

### Core Principle
- **Never include** auto-increment/identity columns (requires `IDENTITY_INSERT`)
- **Always include** all other primary keys as optional parameters, even with defaults
- Maintain backward compatibility - when no value provided, use database default

### 1. CodeGen - SQL Stored Procedure Generation
**File**: `packages/CodeGenLib/src/Database/sql_codegen.ts`

#### Update `generateSPCreate` method (line ~975):
```typescript
// Current logic:
const primaryKeyAutomatic: boolean = firstKey.AutoIncrement || 
  (firstKey.Type.toLowerCase().trim() === 'uniqueidentifier') && 
  (!!firstKey.DefaultValue && firstKey.DefaultValue.trim().length > 0);

// New logic:
const primaryKeyAutomatic: boolean = firstKey.AutoIncrement;
```

#### Update stored procedure template to handle optional primary keys:
- Include primary key parameters with default `NULL` for non-identity columns
- Add conditional logic in the INSERT statement:
  ```sql
  IF @ID IS NULL
      INSERT INTO [Table] (Field1, Field2) VALUES (@Field1, @Field2)
  ELSE
      INSERT INTO [Table] (ID, Field1, Field2) VALUES (@ID, @Field1, @Field2)
  ```

### 2. CodeGen - GraphQL Resolver Generation
**File**: `packages/CodeGenLib/src/graphql_server_codegen.ts`

#### Update field filtering logic (line ~414):
```typescript
// Current logic:
const includePrimaryKey = classPrefix === 'Update' || 
  (!f.AutoIncrement && f.Type !== 'uniqueidentifier');

// New logic:
const includePrimaryKey = classPrefix === 'Update' || !f.AutoIncrement;
```

#### Mark primary key fields as optional in GraphQL input types:
- Add nullable: true for primary key fields in create mutations
- Maintain required primary keys for update mutations

### 3. SQLServerDataProvider Updates
**File**: `packages/SQLServerDataProvider/src/SQLDataProvider.ts`

#### Update `generateSPParams` method:
- Remove blanket `SkipValidation = true` for primary keys
- Only skip auto-increment fields
- Include primary key values when provided (not null/undefined)

### 4. GraphQLDataProvider Updates
**File**: `packages/GraphQLDataProvider/src/GraphQLDataProvider.ts`

#### Update field filtering in `getGraphQLDataMutationString`:
- Include primary key fields for create operations unless auto-increment
- Check for null/undefined values before including in mutation

## Implementation Steps

1. **Update SQL CodeGen** (Priority: High)
   - Modify primary key detection logic
   - Update stored procedure templates
   - Test generated procedures

2. **Update GraphQL CodeGen** (Priority: High)
   - Modify field filtering for create mutations
   - Update input type generation
   - Test generated resolvers

3. **Update Data Providers** (Priority: Medium)
   - SQLServerDataProvider: Include PK values when provided
   - GraphQLDataProvider: Include PK fields in mutations
   - Test both providers

4. **Update BaseEntity** (Priority: Low)
   - Ensure NewRecord resets all values including pkey values (it should)
   - Test entity creation flows

5. **Testing** (Priority: Critical)
   - Verify existing functionality (defaults work when no PK provided)
   - Test PK override scenarios (specific IDs work when provided)
   - Test auto-increment exclusion (identity columns still auto-generate)
   - Test Metadata Sync tool with consistent PKs across tiers

## Backward Compatibility

- When no primary key value is provided, the system uses database defaults (current behavior)
- Auto-increment fields continue to auto-generate (current behavior)
- Existing code that doesn't set primary keys continues to work unchanged
- Only new code that explicitly sets primary key values sees different behavior

## Security Considerations

- No changes to permission model - existing entity permissions apply
- No exposure of internal IDs - only allows setting IDs the user provides
- No bypass of database constraints - foreign keys, uniqueness still enforced

## Performance Impact

- Minimal - adds one conditional check in stored procedures
- No additional database round trips
- No changes to query patterns

## Risks and Mitigation

**Risk**: Duplicate primary key errors if users provide existing IDs
- **Mitigation**: Database uniqueness constraints prevent duplicates
- **Mitigation**: Clear error messages when conflicts occur

**Risk**: Breaking existing integrations
- **Mitigation**: Backward compatible - defaults still work
- **Mitigation**: Comprehensive testing before release