# SQL Query Caching Recommendations

Below is a list of SQL queries that are good candidates for caching in the CodeGenLib package. These queries primarily retrieve metadata or schema information that doesn't change frequently during a single code generation run.

## Recommended Queries for Caching

### 1. Entity Primary Key Index Name Query
**File**: `/packages/CodeGenLib/src/Database/sql_codegen.ts:776-789`
**Method**: `getEntityPrimaryKeyIndexName`
**Query**:
```sql
SELECT
    i.name AS IndexName
FROM
    sys.indexes i
INNER JOIN
    sys.objects o ON i.object_id = o.object_id
INNER JOIN
    sys.key_constraints kc ON i.object_id = kc.parent_object_id AND
    i.index_id = kc.unique_index_id
WHERE
    o.name = '${entity.BaseTable}' AND
    o.schema_id = SCHEMA_ID('${entity.SchemaName}') AND
    kc.type = 'PK';
```
**Reason**: This query retrieves schema metadata that rarely changes during a code generation run. The primary key index of a table is a stable piece of information, and caching it would improve performance when generating SQL for multiple entities.

### 2. Virtual Entity Query
**File**: `/packages/CodeGenLib/src/Database/manage-metadata.ts:149-150`
**Method**: `manageVirtualEntities`
**Query**:
```sql
SELECT * FROM [${mj_core_schema()}].vwEntities WHERE VirtualEntity = 1
```
**Reason**: This query fetches a list of virtual entities, which typically doesn't change during a code generation run. Caching this result would reduce database load when processing virtual entities.

### 3. Virtual Entity Fields Query
**File**: `/packages/CodeGenLib/src/Database/manage-metadata.ts:172-184`
**Method**: `manageSingleVirtualEntity`
**Query**:
```sql
SELECT
   c.name AS FieldName, t.name AS Type, c.max_length AS Length, c.precision Precision, c.scale Scale, c.is_nullable AllowsNull
FROM
   sys.columns c
INNER JOIN
   sys.types t ON c.user_type_id = t.user_type_id
INNER JOIN
   sys.views v ON c.object_id = v.object_id
WHERE
   v.name = '${virtualEntity.BaseView}' AND
   SCHEMA_NAME(v.schema_id) = '${virtualEntity.SchemaName}'
ORDER BY
   c.column_id
```
**Reason**: This query retrieves column metadata for virtual entities, which is static schema information during a code generation run. Caching this would improve performance when generating code for virtual entities.

### 4. Entity Relationship Queries
**File**: `/packages/CodeGenLib/src/Database/manage-metadata.ts`
**Method**: `manageEntityRelationships`
**Queries related to table relationships and foreign keys**

These queries fetch database schema relationship information that rarely changes during a code generation run. Caching these would speed up relationship mapping.

### 5. Table Schema Information Queries
**Queries that retrieve table structure, column definitions, and constraints**

These are fundamental schema metadata queries that remain constant during code generation and are excellent caching candidates.

## Implementation Strategy

To implement caching for these queries:

1. Use the `executeQueryWithCache` method for these specific read-only queries
2. Set appropriate TTL values:
   - For most schema metadata: Use longer TTL (e.g., 5-10 minutes) as schema rarely changes during a run
   - For relationship data: Similar TTL as schema metadata

3. Example implementation for `getEntityPrimaryKeyIndexName`:

```typescript
async getEntityPrimaryKeyIndexName(ds: DataSource, entity: EntityInfo): Promise<string> {
    const sSQL = `SELECT
        i.name AS IndexName
    FROM
        sys.indexes i
    INNER JOIN
        sys.objects o ON i.object_id = o.object_id
    INNER JOIN
        sys.key_constraints kc ON i.object_id = kc.parent_object_id AND
        i.index_id = kc.unique_index_id
    WHERE
        o.name = '${entity.BaseTable}' AND
        o.schema_id = SCHEMA_ID('${entity.SchemaName}') AND
        kc.type = 'PK';`
        
    // Use cache with 5-minute TTL for schema metadata
    const result = await this.SQLUtilityObject.executeQueryWithCache(ds, sSQL, [], 300000);
    if (result && result.length > 0)
        return result[0].IndexName;
    else
        throw new Error(`Could not find primary key index for entity ${entity.Name}`);
}
```

## Important Notes

1. None of the suggested queries are used for data that requires real-time accuracy during code generation
2. All of the queries retrieve schema metadata, not actual table data that could change
3. The cache implementation includes TTL to ensure data eventually refreshes
4. Only read-only SELECT queries are recommended for caching

These recommendations focus on caching metadata and schema information queries, which are called repeatedly but return relatively static data during a code generation run.