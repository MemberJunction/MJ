# SQL Logging Feature Usage Examples

The SQLServerDataProvider now includes comprehensive SQL logging capabilities for capturing all SQL operations to files. This is particularly useful for creating migration files from MetadataSync operations.

## Basic Usage

```typescript
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';

// Create a SQL logging session
const provider = new SQLServerDataProvider(/* config */);
const session = await provider.createSqlLogger('./logs/operations.sql');

try {
  // All SQL operations will now be logged to the file
  await provider.ExecuteSQL('INSERT INTO Entity (Name) VALUES (?)', ['Test Entity']);
  await provider.ExecuteSQL('UPDATE Entity SET Status = ? WHERE ID = ?', ['Active', '123']);
  
  console.log(`Logged ${session.statementCount} SQL statements`);
} finally {
  // Always dispose the session to stop logging and close the file
  await session.dispose();
}
```

## Migration-Ready Format

```typescript
// Create a session with migration formatting
const session = await provider.createSqlLogger('./migrations/V001__entity_updates.sql', {
  formatAsMigration: true,
  description: 'Adding new entities and fields from MetadataSync'
});

try {
  // SQL will be formatted with Flyway schema placeholders
  await provider.ExecuteSQL('INSERT INTO [myschema].[Entity] (Name) VALUES (?)', ['New Entity']);
  // Becomes: INSERT INTO [${flyway:defaultSchema}].[Entity] (Name) VALUES ('New Entity');
} finally {
  await session.dispose();
}
```

## MetadataSync Integration

```typescript
// Example of how this would integrate with MetadataSync
export class MetadataSync {
  private provider: SQLServerDataProvider;
  
  async push(entities: EntityInfo[]): Promise<void> {
    // Start logging all SQL operations
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = `./logs/metadata-sync-${timestamp}.sql`;
    
    const session = await this.provider.createSqlLogger(logPath, {
      formatAsMigration: true,
      description: `MetadataSync push operation - ${entities.length} entities`
    });
    
    try {
      console.log(`Starting MetadataSync push, logging SQL to: ${logPath}`);
      
      // All database operations will be automatically logged
      for (const entity of entities) {
        await this.pushEntity(entity);
      }
      
      console.log(`✅ MetadataSync completed. ${session.statementCount} SQL statements logged.`);
      console.log(`📄 Migration file ready: ${logPath}`);
      
    } catch (error) {
      console.error(`❌ MetadataSync failed after ${session.statementCount} statements`);
      throw error;
    } finally {
      await session.dispose();
    }
  }
  
  private async pushEntity(entity: EntityInfo): Promise<void> {
    // These operations will be automatically logged
    await this.provider.ExecuteSQL(
      'INSERT INTO Entity (Name, Description) VALUES (?, ?)',
      [entity.Name, entity.Description],
      { description: `Creating entity: ${entity.Name}` }
    );
    
    for (const field of entity.Fields) {
      await this.provider.ExecuteSQL(
        'INSERT INTO EntityField (EntityID, Name, Type) VALUES (?, ?, ?)',
        [entity.ID, field.Name, field.Type],
        { description: `Adding field ${field.Name} to ${entity.Name}` }
      );
    }
  }
}
```

## Advanced Features

### Record Change Metadata Filtering

```typescript
// Log only core stored procedure calls, filtering out record change metadata wrapper
const session = await provider.createSqlLogger('./logs/core-operations.sql', {
  logRecordChangeMetadata: false // Default is false
});

// Create another session that logs everything
const fullSession = await provider.createSqlLogger('./logs/full-operations.sql', {
  logRecordChangeMetadata: true // Log complete SQL with metadata
});

// When an entity has TrackRecordChanges=true, the full SQL includes wrapper transactions
// Each logger independently decides what to log based on its settings
try {
  // session logs: EXEC [myschema].[spCreateCustomer] @Name='John', @Email='john@example.com'
  // fullSession logs: Full SQL with DECLARE @ResultTable, INSERT INTO @ResultTable, etc.
  await customer.Save();
  
  // Delete operations are also filtered per logger
  await customer.Delete(); 
  // session logs: EXEC [myschema].[spDeleteCustomer] @ID='123'
  // fullSession logs: Full SQL with record change tracking
} finally {
  await session.dispose();
  await fullSession.dispose();
}
```

### Empty File Handling

```typescript
// By default, empty log files are automatically deleted
const session = await provider.createSqlLogger('./logs/operations.sql', {
  statementTypes: 'mutations' // Only log data changes
});

// If no mutations occur, the file will be deleted on dispose
await session.dispose(); // File deleted if no statements were logged

// To retain empty log files, set retainEmptyLogFiles to true
const persistentSession = await provider.createSqlLogger('./logs/audit.sql', {
  retainEmptyLogFiles: true // Keep file even if empty
});
```

### Multiple Concurrent Sessions

```typescript
// Multiple developers can log simultaneously
const session1 = await provider.createSqlLogger('./logs/user1-operations.sql');
const session2 = await provider.createSqlLogger('./logs/user2-operations.sql');

// Each session captures only the operations from its thread
// Operations will be logged to both files appropriately
```

### Ignoring Sensitive Operations

```typescript
// Some operations can be excluded from logging
await provider.ExecuteSQL(
  'SELECT * FROM UserSecrets WHERE UserID = ?',
  [userId],
  { ignoreLogging: true } // This won't be logged to any session
);
```

### Monitoring Active Sessions

```typescript
// Check what logging sessions are currently active
const activeSessions = provider.getActiveSqlLoggingSessions();
console.log(`Active logging sessions: ${activeSessions.length}`);

activeSessions.forEach(session => {
  console.log(`- ${session.id}: ${session.statementCount} statements -> ${session.filePath}`);
});

// Cleanup all sessions (useful for shutdown)
await provider.disposeAllSqlLoggingSessions();
```

## Generated Log File Format

### Basic Format
```sql
-- SQL Logging Session
-- Session ID: 550e8400-e29b-41d4-a716-446655440000
-- Started: 2024-06-13T15:30:00.000Z
-- File: ./logs/operations.sql
-- Description: MetadataSync push operation
-- Generated by MemberJunction SQLServerDataProvider

-- Creating entity: Customer
INSERT INTO Entity (Name, Description) VALUES ('Customer', 'Customer entity');
-- Parameters: @p0='Customer', @p1='Customer entity'

-- Adding field Name to Customer  
INSERT INTO EntityField (EntityID, Name, Type) VALUES ('123', 'Name', 'string');
-- Parameters: @p0='123', @p1='Name', @p2='string'

-- End of SQL Logging Session
-- Session ID: 550e8400-e29b-41d4-a716-446655440000  
-- Completed: 2024-06-13T15:30:05.234Z
-- Duration: 5234ms
-- Total Statements: 2
```

### Migration-Ready Format
```sql
-- SQL Logging Session
-- Session ID: 550e8400-e29b-41d4-a716-446655440000
-- Started: 2024-06-13T15:30:00.000Z
-- File: ./migrations/V001__customer_entity.sql
-- Description: MetadataSync push operation
-- Format: Migration-ready with Flyway schema placeholders
-- Generated by MemberJunction SQLServerDataProvider

-- Creating entity: Customer
INSERT INTO [${flyway:defaultSchema}].[Entity] (Name, Description) VALUES ('Customer', 'Customer entity');

-- Adding field Name to Customer
INSERT INTO [${flyway:defaultSchema}].[EntityField] (EntityID, Name, Type) VALUES ('123', 'Name', 'string');

-- End of SQL Logging Session
-- Session ID: 550e8400-e29b-41d4-a716-446655440000
-- Completed: 2024-06-13T15:30:05.234Z  
-- Duration: 5234ms
-- Total Statements: 2
```

### Record Change Metadata Filtering Example

When `logRecordChangeMetadata: false` (default), complex Save and Delete operations are simplified:

**Full SQL (logRecordChangeMetadata: true):**
```sql
-- Creating customer record (full transaction wrapper)
DECLARE @ResultTable TABLE (
    ID uniqueidentifier,
    Name nvarchar(100),
    Email nvarchar(255),
    CreatedAt datetime2
);

INSERT INTO @ResultTable
EXEC [myschema].[spCreateCustomer] @Name='John Doe', @Email='john@example.com';

DECLARE @ID NVARCHAR(MAX);
SELECT @ID = ID FROM @ResultTable;

IF @ID IS NOT NULL
BEGIN
    DECLARE @ResultChangesTable TABLE (
        ID uniqueidentifier,
        Entity nvarchar(255),
        RecordID nvarchar(max),
        -- ... more fields
    );
    
    INSERT INTO @ResultChangesTable
    -- Record change tracking SQL...
END;

SELECT * FROM @ResultTable;
```

**Filtered SQL (logRecordChangeMetadata: false):**
```sql
-- Creating customer record (core SP call only)
EXEC [myschema].[spCreateCustomer] @Name='John Doe', @Email='john@example.com';

-- Deleting customer record (core SP call only)
EXEC [myschema].[spDeleteCustomer] @ID='123-456-789';
```

The filtering is handled transparently per logger:
- The full SQL always executes normally for record change tracking
- Each active logging session independently decides what to log based on its `logRecordChangeMetadata` setting
- Multiple loggers can be active simultaneously with different settings

## Performance Characteristics

- **Parallel Execution**: SQL logging runs in parallel with database execution - no performance impact
- **Ordered Output**: Despite parallel execution, log entries maintain execution order
- **Memory Efficient**: Uses file streams, not in-memory buffering
- **Multiple Sessions**: Supports multiple concurrent logging sessions without interference
- **Automatic Cleanup**: Session disposal automatically closes files and cleans up resources
- **Accurate Counts**: `session.statementCount` reflects actual emitted statements after filtering
- **Empty File Cleanup**: Empty log files are automatically deleted unless `retainEmptyLogFiles: true`

## Error Handling

```typescript
const session = await provider.createSqlLogger('./logs/operations.sql');

try {
  // If SQL execution fails, the statement is still logged (helps with debugging)
  await provider.ExecuteSQL('INVALID SQL SYNTAX');
} catch (error) {
  // Session still contains the failed statement for debugging
  console.log(`Error after ${session.statementCount} statements: ${error.message}`);
} finally {
  // Always dispose, even on errors
  await session.dispose();
}
```

This feature enables developers to easily capture the exact SQL operations performed by any MemberJunction operation and convert them into migration files for deployment.