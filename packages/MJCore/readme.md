# @memberjunction/core

The `@memberjunction/core` library provides a comprehensive interface for accessing and managing metadata within MemberJunction, along with facilities for working with entities, applications, and various other aspects central to the MemberJunction ecosystem. This library serves as the foundation for all MemberJunction applications and provides essential functionality for data access, manipulation, and metadata management.

## Installation

```bash
npm install @memberjunction/core
```

## Overview

The `@memberjunction/core` library is the central package in the MemberJunction ecosystem, providing:

- **Metadata Management**: Complete access to MemberJunction metadata including entities, fields, relationships, permissions, and more
- **Entity Data Access**: Base classes and utilities for loading, saving, and manipulating entity records
- **View Execution**: Powerful view running capabilities for both stored and dynamic views
- **Query & Report Execution**: Tools for running queries and reports
- **Security & Authorization**: User authentication, role management, and permission handling
- **Transaction Management**: Support for grouped database transactions
- **Provider Architecture**: Flexible provider model supporting different execution environments

## Core Components

### Metadata Class

The `Metadata` class is the primary entry point for accessing MemberJunction metadata and instantiating entity objects.

```typescript
import { Metadata } from '@memberjunction/core';

// Create metadata instance
const md = new Metadata();

// Refresh cached metadata
await md.Refresh();

// Access various metadata collections
const applications = md.Applications;
const entities = md.Entities;
const currentUser = md.CurrentUser;
const roles = md.Roles;
const authorizations = md.Authorizations;
```

#### Key Metadata Properties

- `Applications`: Array of all applications in the system
- `Entities`: Array of all entity definitions
- `CurrentUser`: Current authenticated user (when available)
- `Roles`: System roles
- `AuditLogTypes`: Available audit log types
- `Authorizations`: Authorization definitions
- `Libraries`: Registered libraries
- `Queries`: Query definitions
- `QueryFields`: Query field metadata
- `QueryCategories`: Query categorization
- `QueryPermissions`: Query-level permissions
- `VisibleExplorerNavigationItems`: Navigation items visible to current user
- `AllExplorerNavigationItems`: All navigation items (including hidden)

#### Helper Methods

```typescript
// Get entity ID from name
const entityId = md.EntityIDFromName('Users');

// Get entity name from ID
const entityName = md.EntityNameFromID('12345');

// Find entity by name (case-insensitive)
const userEntity = md.EntityByName('users');

// Find entity by ID
const entity = md.EntityByID('12345');

// Get entity object instance (IMPORTANT: Always use this pattern)
const user = await md.GetEntityObject<UserEntity>('Users');

// NEW in v2.58.0: Load existing records directly with GetEntityObject
const existingUser = await md.GetEntityObject<UserEntity>('Users', CompositeKey.FromID(userId));
```

### GetEntityObject() - Enhanced in v2.58.0

The `GetEntityObject()` method now supports overloaded signatures for both creating new records and loading existing ones in a single call:

#### Creating New Records

```typescript
// Traditional approach - still supported
const user = await md.GetEntityObject<UserEntity>('Users');
user.NewRecord(); // No longer needed - done automatically!

// v2.58.0+ - NewRecord() is called automatically
const newUser = await md.GetEntityObject<UserEntity>('Users');
newUser.FirstName = 'John';
await newUser.Save();
```

#### Loading Existing Records (NEW)

```typescript
// Traditional approach - still supported
const user = await md.GetEntityObject<UserEntity>('Users');
await user.Load(userId);

// v2.58.0+ - Load in a single call using CompositeKey
const existingUser = await md.GetEntityObject<UserEntity>('Users', CompositeKey.FromID(userId));

// Load by custom field
const userByEmail = await md.GetEntityObject<UserEntity>('Users', 
    CompositeKey.FromKeyValuePair('Email', 'user@example.com'));

// Load with composite primary key
const orderItem = await md.GetEntityObject<OrderItemEntity>('OrderItems',
    CompositeKey.FromKeyValuePairs([
        { FieldName: 'OrderID', Value: orderId },
        { FieldName: 'ProductID', Value: productId }
    ]));

// Server-side with context user
const order = await md.GetEntityObject<OrderEntity>('Orders', 
    CompositeKey.FromID(orderId), contextUser);
```

#### Automatic UUID Generation (NEW in v2.58.0)

For entities with non-auto-increment uniqueidentifier primary keys, UUIDs are now automatically generated when calling `NewRecord()`:

```typescript
// UUID is automatically generated for eligible entities
const action = await md.GetEntityObject<ActionEntity>('Actions');
console.log(action.ID); // '550e8400-e29b-41d4-a716-446655440000' (auto-generated)
```

### BaseEntity Class

The `BaseEntity` class is the foundation for all entity record manipulation in MemberJunction. All entity classes generated by the MemberJunction code generator extend this class.

#### Loading Data from Objects (v2.52.0+)

The `LoadFromData()` method is now async to support subclasses that need to perform additional loading operations:

```typescript
// Loading data from a plain object (now async)
const userData = {
    ID: '123',
    FirstName: 'Jane',
    LastName: 'Doe',
    Email: 'jane@example.com'
};

// LoadFromData is now async as of v2.52.0
await user.LoadFromData(userData);

// This change enables subclasses to perform async operations
// Example subclass implementation:
class ExtendedUserEntity extends UserEntity {
    public override async LoadFromData(data: any): Promise<boolean> {
        const result = await super.LoadFromData(data);
        if (result) {
            // Can now perform async operations
            await this.LoadUserPreferences();
            await this.LoadUserRoles();
        }
        return result;
    }
    
    // Important: Also override Load() for consistency
    public override async Load(ID: string): Promise<boolean> {
        const result = await super.Load(ID);
        if (result) {
            await this.LoadUserPreferences();
            await this.LoadUserRoles();
        }
        return result;
    }
}
```

**Important**: Subclasses that perform additional loading should override BOTH `LoadFromData()` and `Load()` methods to ensure consistent behavior regardless of how the entity is populated.

#### Entity Fields

Each entity field is represented by an `EntityField` object that tracks value, dirty state, and metadata:

```typescript
// Access field value
const firstName = user.Get('FirstName');

// Set field value
user.Set('FirstName', 'Jane');

// Check if field is dirty
const isDirty = user.Fields.find(f => f.Name === 'FirstName').Dirty;

// Access field metadata
const field = user.Fields.find(f => f.Name === 'Email');
console.log(field.IsUnique); // true/false
console.log(field.IsPrimaryKey); // true/false
console.log(field.ReadOnly); // true/false
```

#### Working with BaseEntity and Spread Operator

**IMPORTANT**: BaseEntity uses TypeScript getter/setter properties for all entity fields. This means the JavaScript spread operator (`...`) will NOT capture entity field values because getters are not enumerable properties.

```typescript
// ❌ WRONG - Spread operator doesn't capture getter properties
const userData = {
  ...userEntity,  // This will NOT include ID, FirstName, LastName, etc.
  customField: 'value'
};

// ✅ CORRECT - Use GetAll() to get plain object with all field values
const userData = {
  ...userEntity.GetAll(),  // Returns { ID: '...', FirstName: '...', LastName: '...', etc. }
  customField: 'value'
};

// ✅ ALSO CORRECT - Access properties individually
const userData = {
  ID: userEntity.ID,
  FirstName: userEntity.FirstName,
  LastName: userEntity.LastName,
  customField: 'value'
};
```

The `GetAll()` method returns a plain JavaScript object containing all entity field values, which can be safely used with the spread operator. This design choice enables:
- Clean property access syntax (`entity.Name` vs `entity.getName()`)
- Full TypeScript/IntelliSense support
- Easy property overriding in subclasses
- Proper encapsulation with validation and side effects

#### Save Options

```typescript
import { EntitySaveOptions } from '@memberjunction/core';

const options = new EntitySaveOptions();
options.IgnoreDirtyState = true; // Force save even if no changes detected
options.SkipEntityAIActions = true; // Skip AI-related actions
options.SkipEntityActions = true; // Skip entity actions
options.SkipOldValuesCheck = true; // Skip concurrency check (client-side only)

await entity.Save(options);
```

### RunView Class

The `RunView` class provides powerful view execution capabilities for both stored views and dynamic queries.

```typescript
import { RunView, RunViewParams } from '@memberjunction/core';

const rv = new RunView();

// Run a stored view by name
const params: RunViewParams = {
    ViewName: 'Active Users',
    ExtraFilter: 'CreatedDate > \'2024-01-01\'',
    UserSearchString: 'john'
};

const results = await rv.RunView(params);

// Run a dynamic view with entity objects returned
const dynamicResults = await rv.RunView<UserEntity>({
    EntityName: 'Users',
    ExtraFilter: 'IsActive = 1',
    OrderBy: 'LastName ASC, FirstName ASC',
    Fields: ['ID', 'FirstName', 'LastName', 'Email'],
    ResultType: 'entity_object' // Returns actual entity objects
});

// Access typed results
const users = dynamicResults.Results; // Properly typed as UserEntity[]
```

#### RunView Parameters

- `ViewID`: ID of stored view to run
- `ViewName`: Name of stored view to run
- `ViewEntity`: Pre-loaded view entity object (optimal for performance)
- `EntityName`: Entity name for dynamic views
- `ExtraFilter`: Additional SQL WHERE clause
- `OrderBy`: SQL ORDER BY clause (overrides stored view sorting)
- `Fields`: Array of field names to return
- `UserSearchString`: User search term
- `ExcludeUserViewRunID`: Exclude records from specific prior run
- `ExcludeDataFromAllPriorViewRuns`: Exclude all previously returned records
- `SaveViewResults`: Store run results for future exclusion
- `IgnoreMaxRows`: Bypass entity MaxRows setting
- `MaxRows`: Maximum rows to return
- `StartRow`: Row offset for pagination
- `ResultType`: 'simple' (default) or 'entity_object'

### RunQuery Class

Execute stored queries with parameters:

```typescript
import { RunQuery, RunQueryParams } from '@memberjunction/core';

const rq = new RunQuery();

const params: RunQueryParams = {
    QueryID: '12345',
    Parameters: {
        StartDate: '2024-01-01',
        EndDate: '2024-12-31',
        Status: 'Active'
    }
};

const results = await rq.RunQuery(params);
```

### RunReport Class

Execute reports with various output formats:

```typescript
import { RunReport, RunReportParams } from '@memberjunction/core';

const rr = new RunReport();

const params: RunReportParams = {
    ReportID: '12345',
    Parameters: {
        Year: 2024,
        Department: 'Sales'
    }
};

const results = await rr.RunReport(params);
```

### Transaction Management

Group multiple operations in a transaction:

```typescript
import { TransactionGroupBase } from '@memberjunction/core';

// Transaction management is provider-specific
// Consult your provider documentation for implementation details
```

## Entity Relationships

MemberJunction automatically handles entity relationships through the metadata system:

```typescript
// Load an entity with related data
const order = await md.GetEntityObject<OrderEntity>('Orders');
await order.Load(123, ['OrderDetails', 'Customer']);

// Access related entities
const orderDetails = order.OrderDetails; // Array of OrderDetailEntity
const customer = order.Customer; // CustomerEntity
```

## Security & Permissions

The library provides comprehensive security features:

```typescript
const md = new Metadata();

// Check current user
const user = md.CurrentUser;
console.log('Current user:', user.Email);

// Check user roles
const isAdmin = user.RoleName.includes('Admin');

// Entity permissions
const entity = md.EntityByName('Orders');
const canCreate = entity.CanCreate;
const canUpdate = entity.CanUpdate;
const canDelete = entity.CanDelete;
```

## Error Handling

All operations return detailed error information:

```typescript
const entity = await md.GetEntityObject('Users');
const result = await entity.Save();

if (!result) {
    // Access detailed error information
    const error = entity.LatestResult;
    console.error('Error:', error.Message);
    console.error('Details:', error.Details);
    
    // Check validation errors
    if (error.ValidationErrors && error.ValidationErrors.length > 0) {
        error.ValidationErrors.forEach(ve => {
            console.error(`Field ${ve.FieldName}: ${ve.Message}`);
        });
    }
}
```

## Logging

MemberJunction provides enhanced logging capabilities with both simple and advanced APIs:

### Basic Logging

```typescript
import { LogStatus, LogError } from '@memberjunction/core';

// Simple status logging
LogStatus('Operation completed successfully');

// Error logging
LogError('Operation failed', null, additionalData1, additionalData2);

// Logging to file
LogStatus('Writing to file', '/logs/output.log');
```

### Enhanced Logging (v2.59.0+)

The enhanced logging functions provide structured logging with metadata, categories, and conditional verbose output:

#### LogStatusEx - Enhanced Status Logging

```typescript
import { LogStatusEx, IsVerboseLoggingEnabled, SetVerboseLogging } from '@memberjunction/core';

// Simple usage - same as LogStatus
LogStatusEx('Process started');

// Verbose-only logging (respects MJ_VERBOSE environment variable)
LogStatusEx({
    message: 'Detailed trace information',
    verboseOnly: true
});

// With custom verbose check
LogStatusEx({
    message: 'Processing items:',
    verboseOnly: true,
    isVerboseEnabled: () => myConfig.debugMode === true,
    additionalArgs: [item1, item2, item3]
});

// With category and file output
LogStatusEx({
    message: 'Batch job completed',
    category: 'BatchProcessor',
    logToFileName: '/logs/batch.log',
    additionalArgs: [processedCount, errorCount]
});
```

#### LogErrorEx - Enhanced Error Logging

```typescript
import { LogErrorEx } from '@memberjunction/core';

// Simple usage - same as LogError
LogErrorEx('Something went wrong');

// With error object and severity
try {
    await riskyOperation();
} catch (error) {
    LogErrorEx({
        message: 'Failed to complete operation',
        error: error as Error,
        severity: 'critical',
        category: 'DataProcessing'
    });
}

// With metadata and additional arguments
LogErrorEx({
    message: 'Validation failed',
    severity: 'warning',
    category: 'Validation',
    metadata: {
        userId: user.ID,
        attemptCount: 3,
        validationRules: ['email', 'uniqueness']
    },
    additionalArgs: [validationResult, user]
});

// Control stack trace inclusion
LogErrorEx({
    message: 'Network timeout',
    error: timeoutError,
    includeStack: false, // Omit stack trace
    metadata: { url: apiUrl, timeout: 5000 }
});
```

### Verbose Logging Control

Control verbose logging globally across your application:

```typescript
// Check if verbose logging is enabled
if (IsVerboseLoggingEnabled()) {
    // Perform expensive logging operations
    const debugInfo = gatherDetailedDebugInfo();
    LogStatus('Debug info:', debugInfo);
}

// Enable verbose logging in browser environments
SetVerboseLogging(true);

// Verbose logging is controlled by:
// 1. MJ_VERBOSE environment variable (Node.js)
// 2. MJ_VERBOSE global variable (Browser)
// 3. MJ_VERBOSE localStorage item (Browser)
// 4. MJ_VERBOSE URL parameter (Browser)
```

### Logging Features

- **Severity Levels**: `warning`, `error`, `critical` for LogErrorEx
- **Categories**: Organize logs by functional area
- **Metadata**: Attach structured data to logs
- **Varargs Support**: Pass additional arguments that get forwarded to console.log/error
- **File Logging**: Direct logs to files (Node.js environments)
- **Conditional Logging**: Skip verbose logs based on environment settings
- **Error Objects**: Automatic error message and stack trace extraction
- **Cross-Platform**: Works in both Node.js and browser environments

## Provider Architecture

MemberJunction uses a provider model to support different execution environments:

```typescript
import { SetProvider } from '@memberjunction/core';

// Provider setup is typically handled by your application initialization
// The provider determines how data is accessed (direct database, API, etc.)
SetProvider(myProvider);
```

## Breaking Changes

### v2.59.0
- **Enhanced Logging Functions**: New `LogStatusEx` and `LogErrorEx` functions provide structured logging with metadata, categories, and severity levels. The existing `LogStatus` and `LogError` functions now internally use the enhanced versions, maintaining full backward compatibility.
- **Verbose Logging Control**: New global functions `IsVerboseLoggingEnabled()` and `SetVerboseLogging()` provide centralized verbose logging control across environments.

### v2.58.0
- **GetEntityObject() now calls NewRecord() automatically**: When creating new entities, `NewRecord()` is now called automatically. While calling it again is harmless, it's no longer necessary.
- **UUID Generation**: Entities with non-auto-increment uniqueidentifier primary keys now have UUIDs generated automatically in `NewRecord()`.

### v2.52.0
- **LoadFromData() is now async**: The `LoadFromData()` method in BaseEntity is now async to support subclasses that need to perform additional asynchronous operations during data loading. Update any direct calls to this method to use `await`.

## Best Practices

1. **Always use Metadata.GetEntityObject()** to create entity instances - never use `new`
2. **Use generic types** with RunView for type-safe results
3. **Handle errors properly** - check return values and LatestResult
4. **Use transactions** for related operations that must succeed/fail together
5. **Leverage metadata** for dynamic UI generation and validation
6. **Respect permissions** - always check CanCreate/Update/Delete before operations
7. **Use ExtraFilter** carefully - ensure SQL injection protection
8. **Cache metadata instances** when possible to improve performance
9. **Override both Load() and LoadFromData()** in subclasses that need additional loading logic to ensure consistent behavior

## Integration with Other MemberJunction Packages

- **@memberjunction/global**: Global utilities and constants
- **@memberjunction/server**: Server-side provider implementation
- **@memberjunction/client**: Client-side provider implementation
- **@memberjunction/angular**: Angular-specific components and services
- **@memberjunction/react**: React-specific components and hooks
- **@memberjunction/ai**: AI integration features
- **@memberjunction/communication**: Communication and messaging features

## Dependencies

- **@memberjunction/global**: Core global utilities
- **rxjs**: Reactive programming support
- **zod**: Schema validation
- **debug**: Debug logging

## TypeScript Support

This library is written in TypeScript and provides full type definitions. All generated entity classes include proper typing for IntelliSense support.

## License

ISC License - see LICENSE file for details

## Support

For support, documentation, and examples, visit [MemberJunction.com](https://www.memberjunction.com)