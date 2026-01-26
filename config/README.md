# Database Metadata Configuration

## Overview

MemberJunction supports defining primary keys and foreign keys for tables that don't have database constraints. This is useful for:

- **Legacy databases** without proper PK/FK constraints
- **Imported data** from systems with different schemas
- **Gradual migration** where constraints will be added later
- **External databases** you don't control

## How It Works

1. **Configuration via mj.config.cjs**: Specify the path to your JSON config file using the `additionalSchemaInfo` property
2. **Constraint-Based Fallback**: If not configured, CodeGen uses standard database constraint detection
3. **Discovered Metadata**: Configuration values set `IsPrimaryKey=1` + `IsSoftPrimaryKey=1` for PKs, and `RelatedEntityID` + `IsSoftForeignKey=1` for FKs
4. **CI/CD Integration**: All UPDATE statements are logged to migration files (`migrations/v3/CodeGen_Run_*.sql`)
5. **Transparent Integration**: Throughout MemberJunction (GraphQL, BaseEntity, UI), soft PKs/FKs work exactly like constraint-based ones

## Setup

### Step 1: Configure mj.config.cjs

Add the `additionalSchemaInfo` property to your `mj.config.cjs` file:

```javascript
module.exports = {
  // ... other config properties ...

  // Path to your soft PK/FK configuration file (relative to mj.config.cjs)
  additionalSchemaInfo: './config/database-metadata-config.json',
};
```

### Step 2: Create the JSON Config File

Copy `database-metadata-config.template.json` to `database-metadata-config.json` and edit it:

```bash
cp config/database-metadata-config.template.json config/database-metadata-config.json
```

### Step 3: Run CodeGen

```bash
npm run mj:migrate    # Apply schema changes (adds soft PK/FK columns)
npm run mj:codegen    # Applies config + generates code
```

## Configuration Format

```json
{
  "description": "Database metadata configuration",
  "version": "1.0",
  "tables": [
    {
      "schemaName": "dbo",
      "tableName": "Orders",
      "primaryKeys": [
        {
          "fieldName": "OrderID",
          "comment": "Primary key field (no database constraint)"
        }
      ],
      "foreignKeys": [
        {
          "fieldName": "CustomerID",
          "relatedSchema": "dbo",
          "relatedTable": "Customers",
          "relatedField": "ID",
          "comment": "Foreign key to Customers table (no database constraint)"
        }
      ]
    }
  ]
}
```

## Field Definitions

### Primary Keys
- `fieldName`: Name of the field that acts as a primary key
- `comment`: Optional explanation

### Foreign Keys
- `fieldName`: Name of the field that acts as a foreign key
- `relatedSchema`: Schema of the related table (e.g., "dbo", "__mj")
- `relatedTable`: Name of the related table
- `relatedField`: Field in the related table (usually its primary key)
- `comment`: Optional explanation

## Composite Primary Keys

For tables with composite primary keys, list multiple fields in the `primaryKeys` array:

```json
{
  "schemaName": "dbo",
  "tableName": "OrderDetails",
  "primaryKeys": [
    {
      "fieldName": "OrderID",
      "comment": "Part 1 of composite key"
    },
    {
      "fieldName": "ProductID",
      "comment": "Part 2 of composite key"
    }
  ]
}
```

## How Metadata Flows Through the System

Once configured, soft PKs/FKs work identically to constraint-based ones:

### TypeScript (BaseEntity)
```typescript
const entity = md.Entities.find(e => e.Name === 'Orders');
entity.PrimaryKeys; // Includes both constraint-based AND soft PKs

const field = entity.Fields.find(f => f.Name === 'CustomerID');
field.RelatedEntityID; // Contains soft FK value (same field used for hard FKs)
field.IsSoftForeignKey; // true if this is a soft FK (no database constraint)
```

### GraphQL
```graphql
query {
  Orders(filter: {CustomerID: "123"}) {
    Customer {  # Works with soft FK
      Name
    }
  }
}
```

### Angular UI
- Form dropdowns automatically populated using soft FKs
- Relationship navigation works with soft relationships
- Grid displays foreign key values using soft metadata

## CI/CD Integration

All soft PK/FK UPDATE statements are logged to the migration file (`migrations/v3/CodeGen_Run_*.sql`). This ensures:

- **Traceability**: Every metadata change is recorded
- **Reproducibility**: Changes can be replayed in CI/CD pipelines
- **Auditability**: Full history of what CodeGen modified

## SQL Updates (Alternative Approach)

Instead of using the configuration file, you can manually update the metadata directly in SQL:

```sql
-- Mark a field as a soft primary key
UPDATE [__mj].[EntityField]
SET [IsPrimaryKey] = 1, [IsSoftPrimaryKey] = 1
WHERE [Name] = 'OrderID'
  AND [EntityID] = (SELECT ID FROM [__mj].[Entity] WHERE Name = 'Orders');

-- Mark a field as a soft foreign key
-- Note: IsSoftForeignKey flag protects these values from being overwritten by CodeGen
UPDATE [__mj].[EntityField]
SET [RelatedEntityID] = (SELECT ID FROM [__mj].[Entity] WHERE Name = 'Customers'),
    [RelatedEntityFieldName] = 'ID',
    [IsSoftForeignKey] = 1
WHERE [Name] = 'CustomerID'
  AND [EntityID] = (SELECT ID FROM [__mj].[Entity] WHERE Name = 'Orders');

-- Then run CodeGen to generate code based on the updated metadata
npm run mj:codegen
```

## Troubleshooting

### Tables skipped with "No primary key found"
- Verify `additionalSchemaInfo` is set in `mj.config.cjs`
- Verify `schemaName` in your JSON config matches your database exactly (case-insensitive)
- Check CodeGen output for: `[Soft PK Check] No config found for <schema>.<table>`

### Config file not found
- Ensure path in `additionalSchemaInfo` is relative to the `mj.config.cjs` location
- Check CodeGen output for the actual path being searched

## Notes

- **One FK per field**: Each field can only have one foreign key
- **IsPrimaryKey is source of truth**: The `IsSoftPrimaryKey` flag just protects from schema sync overwriting
- **RelatedEntityID is source of truth**: The `IsSoftForeignKey` flag just protects from schema sync overwriting
- **No constraint changes**: This doesn't modify your actual database schema
- **Backward compatible**: Existing databases with proper constraints work as before
