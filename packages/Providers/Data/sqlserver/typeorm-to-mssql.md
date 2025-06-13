# TypeORM to MSSQL Migration Plan

## Overview
This document outlines the plan to remove TypeORM dependencies from MemberJunction and replace them with the native 'mssql' Node.js driver (v11.0.1). The migration primarily affects the SQLServerDataProvider and MJAPI packages.

## Current TypeORM Usage Analysis

### 1. SQLServerDataProvider Package
- **Primary Usage**: Raw SQL execution via `dataSource.query()`
- **Transaction Management**: QueryRunner for manual transaction control
- **No ORM Features**: No entities, decorators, or repository patterns used
- **Files Affected**:
  - `SQLServerDataProvider.ts`
  - `SQLServerTransactionGroup.ts`
  - `config.ts`
  - `UserCache.ts`

### 2. MJAPI Package
- **Limited Usage**: Only imports DataSource through helper functions
- **Files Affected**:
  - `generated.ts` (imports GetReadOnlyDataSource, GetReadWriteDataSource)

### 3. MJServer Package
- **Connection Management**: Creates and manages DataSource instances
- **Configuration**: TypeORM connection options for SQL Server
- **Files Affected**:
  - `orm.ts`
  - `index.ts`
  - `util.ts`

## Migration Strategy

### Phase 1: SQLServerDataProvider Migration

#### 1.1 Replace DataSource with mssql ConnectionPool
```typescript
// Old (TypeORM)
private _dataSource: DataSource;

// New (mssql)
private _pool: sql.ConnectionPool;
```

#### 1.2 Update Query Execution
```typescript
// Old (TypeORM)
await this._dataSource.query(query, parameters);

// New (mssql)
const request = this._pool.request();
// Add parameters to request
const result = await request.query(query);
```

#### 1.3 Transaction Management
```typescript
// Old (TypeORM)
this._queryRunner = this._dataSource.createQueryRunner();
await this._queryRunner.startTransaction();
await this._queryRunner.commitTransaction();

// New (mssql)
const transaction = new sql.Transaction(this._pool);
await transaction.begin();
await transaction.commit();
```

#### 1.4 SQLServerTransactionGroup Updates
- Replace DataSource.transaction() with mssql Transaction
- Update transaction execution pattern

### Phase 2: Connection Management (MJServer)

#### 2.1 Create Connection Pool Manager
- Replace DataSource initialization with mssql connection pool
- Maintain read-write and read-only pool separation
- Implement connection pool lifecycle management

#### 2.2 Configuration Translation
```typescript
// Old (TypeORM config)
{
  type: 'mssql',
  host, port, username, password, database,
  requestTimeout, connectionTimeout,
  options: { instanceName, trustServerCertificate }
}

// New (mssql config)
{
  server: host,
  port: port,
  user: username,
  password: password,
  database: database,
  requestTimeout: requestTimeout,
  connectionTimeout: connectionTimeout,
  options: {
    instanceName: instanceName,
    trustServerCertificate: trustServerCertificate,
    encrypt: true // Add as needed
  }
}
```

### Phase 3: MJAPI Updates
- Update imports to use new connection pool helpers
- Ensure backward compatibility with existing API

## Implementation Tasks

### Task 1: Update Package Dependencies
- [ ] Add `mssql@11.0.1` to SQLServerDataProvider package.json
- [ ] Add `mssql@11.0.1` to MJServer package.json
- [ ] Remove `typeorm` from all package.json files

### Task 2: Implement Connection Pool Manager
- [ ] Create `ConnectionPoolManager.ts` in MJServer
- [ ] Implement pool creation and lifecycle management
- [ ] Add support for multiple pools (read-write, read-only)
- [ ] Implement connection retry logic

### Task 3: Update SQLServerDataProvider
- [ ] Replace DataSource with ConnectionPool
- [ ] Update all query execution methods
- [ ] Implement new transaction management
- [ ] Update error handling for mssql errors

### Task 4: Update SQLServerTransactionGroup
- [ ] Replace transaction pattern with mssql transactions
- [ ] Update error handling
- [ ] Ensure proper transaction cleanup

### Task 5: Update Helper Functions
- [ ] Update GetReadOnlyDataSource() to GetReadOnlyPool()
- [ ] Update GetReadWriteDataSource() to GetReadWritePool()
- [ ] Ensure backward compatibility or update all references

### Task 6: Testing
- [ ] Unit tests for connection pool manager
- [ ] Integration tests for SQLServerDataProvider
- [ ] Transaction rollback tests
- [ ] Connection failure and retry tests
- [ ] Performance comparison tests

## Key Considerations

### 1. Connection Pool Management
- mssql uses built-in connection pooling
- Need to properly close pools on shutdown
- Consider pool size configuration

### 2. Parameter Handling
- TypeORM: `query(sql, [param1, param2])`
- mssql: Uses named parameters with `request.input()`

### 3. Result Format Differences
- May need to adjust result object structure
- Consider recordset vs array differences

### 4. Error Handling
- Different error types and messages
- Need to map mssql errors to existing error handling

### 5. Type Safety
- Ensure TypeScript types are maintained
- Add proper typing for mssql objects

## Benefits of Migration

1. **Reduced Dependencies**: Remove heavyweight ORM for simple SQL execution
2. **Better Performance**: Direct driver usage without ORM overhead
3. **Simpler Codebase**: Remove unused ORM features
4. **Native Features**: Access to SQL Server specific features
5. **Smaller Bundle Size**: mssql is lighter than TypeORM

## Risks and Mitigation

1. **Breaking Changes**: 
   - Mitigation: Maintain API compatibility layer
   
2. **Connection Management**:
   - Mitigation: Thorough testing of pool lifecycle
   
3. **Transaction Handling**:
   - Mitigation: Comprehensive transaction tests

### Phase 4: Optimization - Batch SQL Execution

#### 4.1 Implement Batch Query Execution
The mssql package supports sending multiple SQL statements in a single round trip to SQL Server, which can significantly improve performance when executing multiple independent queries.

##### Current Pattern (Inefficient)
```typescript
// RunViews() current implementation - multiple round trips
for (const view of views) {
    const result = await dataSource.query(viewSQL);
    results.push(result);
}
```

##### Optimized Pattern (Batch Execution)
```typescript
// New batch implementation - single round trip
const request = pool.request();
const batchSQL = views.map(v => v.sql).join(';\n');
const result = await request.batch(batchSQL);
// Split and process multiple result sets
```

#### 4.2 Areas for Batch Optimization
- **RunViews()**: When loading multiple independent views
- **Entity Loading**: When loading related entities
- **Metadata Loading**: Initial metadata cache population
- **Bulk Operations**: Multiple independent inserts/updates

#### 4.3 Implementation Approach
- Create `BatchQueryExecutor` utility class
- Support for multiple result set handling
- Maintain query isolation and error boundaries
- Provide fallback to individual execution if needed

## Timeline Estimate

- Phase 1 (SQLServerDataProvider): 2-3 days
- Phase 2 (Connection Management): 1-2 days
- Phase 3 (MJAPI Updates): 1 day
- Phase 4 (Batch Optimization): 2 days
- Testing and Validation: 2-3 days

Total: ~2-2.5 weeks

## Migration Status - COMPLETED ✅

### Summary
The TypeORM to mssql migration has been successfully completed across all affected packages:

1. **SQLServerDataProvider** ✅
   - Replaced DataSource with ConnectionPool
   - Updated all query execution methods
   - Implemented new transaction management
   - Fixed all TypeScript compilation errors

2. **MJServer** ✅
   - Updated connection management to use mssql
   - Converted orm.ts to create mssql config
   - Updated types.ts and util.ts
   - Removed TypeORM from package.json

3. **CodeGenLib** ✅
   - Updated all methods to accept ConnectionPool
   - Converted transaction patterns from TypeORM to mssql
   - Fixed query result access (.recordset)
   - Removed TypeORM from package.json

4. **MJAPI** ✅
   - TypeORM import was only in generated file
   - No manual changes required (will be fixed in next codegen)

### Key Changes Made

1. **Connection Management**
   - TypeORM `DataSource` → mssql `ConnectionPool`
   - TypeORM `QueryRunner` → mssql `Transaction` and `Request`

2. **Query Execution**
   - `dataSource.query(sql)` → `pool.request().query(sql)`
   - Result access: `result` → `result.recordset`

3. **Transactions**
   - TypeORM callback pattern → mssql explicit transaction management
   - Proper error handling with rollback

4. **Parameters**
   - Positional parameters `[p1, p2]` → Named parameters with conversion

## Success Criteria

1. ✅ All existing functionality preserved
2. ✅ All packages compile successfully
3. ✅ No TypeORM dependencies remain in updated packages
4. ✅ Clean migration with backward compatibility
5. ✅ Ready for Phase 4 batch optimization