# Database Metadata Configuration

## Overview

The `database-metadata-config.json` file allows you to define primary keys and foreign keys for tables that may not have database constraints. This is useful for:

- **Legacy databases** without proper PK/FK constraints
- **Imported data** from systems with different schemas
- **Gradual migration** where constraints will be added later
- **External databases** you don't control

## How It Works

1. **Optional Configuration**: If `database-metadata-config.json` exists in the `/config/` directory, CodeGen reads it and applies the metadata
2. **Constraint-Based Fallback**: If the file doesn't exist, CodeGen uses standard database constraint detection
3. **Discovered Metadata**: Configuration values populate the `IsSoftPrimaryKey` and `IsSoftForeignKey` fields, with soft FK values stored directly in `RelatedEntityID` and `RelatedEntityFieldName`
4. **Transparent Integration**: Throughout MemberJunction (GraphQL, BaseEntity, UI), soft PKs/FKs work exactly like constraint-based ones

## Setup

1. Copy `database-metadata-config.template.json` to `database-metadata-config.json`
2. Edit the file to define your table metadata:
   - Specify primary key fields for tables without PK constraints
   - Define foreign key relationships for tables without FK constraints
3. Run the workflow:
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

## SQL Updates (Alternative Approach)

Instead of using the configuration file, you can manually update the metadata directly in SQL:

```sql
-- Mark a field as a soft primary key
UPDATE [__mj].[EntityField]
SET [IsSoftPrimaryKey] = 1
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

## Notes

- **One FK per field**: Each field can only have one foreign key (database constraint)
- **CodeGen once**: With this configuration, you only need to run CodeGen once
- **No constraint changes**: This doesn't modify your actual database schema
- **Backward compatible**: Existing databases with proper constraints work as before
