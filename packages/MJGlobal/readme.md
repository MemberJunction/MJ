# @memberjunction/global

Core global utilities and coordination library for MemberJunction applications. This package provides essential singleton management, class factory patterns, event coordination, metadata management, entity data access, and utility functions that are used throughout the MemberJunction ecosystem.

**Note:** This package was previously split into `@memberjunction/core` and `@memberjunction/global`. As of v2.111.0, these packages have been merged into a single `@memberjunction/global` package for better maintainability and simpler dependency management.

## Installation

```bash
npm install @memberjunction/global
```

## Overview

The `@memberjunction/global` library is the central package in the MemberJunction ecosystem, providing:

### Metadata & Data Access
- **Metadata Management** - Complete access to MemberJunction metadata including entities, fields, relationships, permissions, and more
- **Entity Data Access** - Base classes and utilities for loading, saving, and manipulating entity records
- **View Execution** - Powerful view running capabilities for both stored and dynamic views
- **Query & Report Execution** - Tools for running queries and reports
- **Security & Authorization** - User authentication, role management, and permission handling
- **Transaction Management** - Support for grouped database transactions
- **Provider Architecture** - Flexible provider model supporting different execution environments
- **Datasets** - Efficient bulk loading of related entity data with caching support

### Global Coordination & Utilities
- **Global Singleton Management** - Ensures true singleton instances across module boundaries
- **Class Factory System** - Dynamic class registration and instantiation with automatic root class detection
- **Event System** - RxJS-based event bus for component communication
- **Object Caching** - In-memory object cache for application lifetime
- **Class Reflection Utilities** - Runtime class hierarchy inspection and analysis
- **Deep Diff Engine** - Comprehensive object comparison and change tracking
- **JSON Validator** - Lightweight JSON validation with flexible rules and special syntax
- **Utility Functions** - Common string manipulation, JSON parsing (including recursive nested JSON parsing), pattern matching, and formatting utilities

## Core Components

### MJGlobal Class

The central singleton class that coordinates events and manages components across your application.

```typescript
import { MJGlobal } from '@memberjunction/global';

// Get the singleton instance
const mjGlobal = MJGlobal.Instance;

// Register a component
mjGlobal.RegisterComponent(myComponent);

// Raise an event
mjGlobal.RaiseEvent({
  component: myComponent,
  event: MJEventType.ComponentEvent,
  eventCode: 'CUSTOM_EVENT',
  args: { data: 'example' }
});

// Listen for events
const subscription = mjGlobal.GetEventListener().subscribe(event => {
  console.log('Event received:', event);
});

// Listen with replay (gets past events too)
const replaySubscription = mjGlobal.GetEventListener(true).subscribe(event => {
  console.log('Event with replay:', event);
});
```

### Class Factory System

Register and instantiate classes dynamically with automatic root class detection and inheritance chain support.

```typescript
import { RegisterClass, MJGlobal } from '@memberjunction/global';

// Define a base class hierarchy
class BaseProcessor {
  process(data: any): void {
    console.log('Base processing');
  }
}

class SpecialProcessor extends BaseProcessor {
  process(data: any): void {
    console.log('Special processing');
  }
}

// Register a subclass - automatically registers with root class (BaseProcessor)
@RegisterClass(SpecialProcessor, 'custom')
class CustomProcessor extends SpecialProcessor {
  process(data: any): void {
    console.log('Custom processing');
  }
}

// Create instances via the factory
const factory = MJGlobal.Instance.ClassFactory;
const processor = factory.CreateInstance<BaseProcessor>(BaseProcessor, 'custom');
processor.process(data); // Uses CustomProcessor

// Key Features:
// 1. Auto-registers with root class by default (BaseProcessor in this case)
// 2. Ensures proper priority ordering in inheritance chains
// 3. Can opt-out with autoRegisterWithRootClass: false
@RegisterClass(SpecialProcessor, 'special', 0, false, false) // Last param disables auto-root registration
class DirectRegistration extends SpecialProcessor {
  // This registers directly to SpecialProcessor, not BaseProcessor
}
```

### Object Cache

In-memory caching system for application-lifetime object storage.

```typescript
const cache = MJGlobal.Instance.ObjectCache;

// Add an object to cache
cache.Add('user:123', { id: 123, name: 'John Doe' });

// Find an object
const user = cache.Find<User>('user:123');

// Replace an existing object
cache.Replace('user:123', { id: 123, name: 'Jane Doe' });

// Remove from cache
cache.Remove('user:123');

// Clear all cached objects
cache.Clear();
```

## Metadata & Data Access Components

### Metadata Class

The `Metadata` class is the primary entry point for accessing MemberJunction metadata and instantiating entity objects.

```typescript
import { Metadata } from '@memberjunction/global';

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
import { EntitySaveOptions } from '@memberjunction/global';

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
import { RunView, RunViewParams } from '@memberjunction/global';

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

The `RunQuery` class provides secure execution of parameterized stored queries with advanced SQL injection protection and type-safe parameter handling.

#### Basic Usage

```typescript
import { RunQuery, RunQueryParams } from '@memberjunction/global';

const rq = new RunQuery();

// Execute by Query ID
const params: RunQueryParams = {
    QueryID: '12345',
    Parameters: {
        StartDate: '2024-01-01',
        EndDate: '2024-12-31',
        Status: 'Active'
    }
};

const results = await rq.RunQuery(params);

// Execute by Query Name and Category Path
const namedParams: RunQueryParams = {
    QueryName: 'Monthly Sales Report',
    CategoryPath: '/Sales/',  // Hierarchical path notation
    Parameters: {
        Month: 12,
        Year: 2024,
        MinAmount: 1000
    }
};

const namedResults = await rq.RunQuery(namedParams);
```

#### Parameterized Queries

RunQuery supports powerful parameterized queries using Nunjucks templates with built-in SQL injection protection:

```sql
-- Example stored query in the database
SELECT
    o.ID,
    o.OrderDate,
    o.TotalAmount,
    c.CustomerName
FROM Orders o
INNER JOIN Customers c ON o.CustomerID = c.ID
WHERE
    o.OrderDate >= {{ startDate | sqlDate }} AND
    o.OrderDate <= {{ endDate | sqlDate }} AND
    o.Status IN {{ statusList | sqlIn }} AND
    o.TotalAmount >= {{ minAmount | sqlNumber }}
{% if includeCustomerInfo %}
    AND c.IsActive = {{ isActive | sqlBoolean }}
{% endif %}
ORDER BY {{ orderClause | sqlNoKeywordsExpression }}
```

#### SQL Security Filters

RunQuery includes comprehensive SQL filters to prevent injection attacks:

##### sqlString Filter
Safely escapes string values by doubling single quotes and wrapping in quotes:

```sql
-- Template
WHERE CustomerName = {{ name | sqlString }}

-- Input: "O'Brien"
-- Output: WHERE CustomerName = 'O''Brien'
```

##### sqlNumber Filter
Validates and formats numeric values:

```sql
-- Template
WHERE Amount >= {{ minAmount | sqlNumber }}

-- Input: "1000.50"
-- Output: WHERE Amount >= 1000.5
```

##### sqlDate Filter
Formats dates in ISO 8601 format:

```sql
-- Template
WHERE CreatedDate >= {{ startDate | sqlDate }}

-- Input: "2024-01-15"
-- Output: WHERE CreatedDate >= '2024-01-15T00:00:00.000Z'
```

##### sqlBoolean Filter
Converts boolean values to SQL bit representation:

```sql
-- Template
WHERE IsActive = {{ active | sqlBoolean }}

-- Input: true
-- Output: WHERE IsActive = 1
```

##### sqlIdentifier Filter
Safely formats SQL identifiers (table/column names):

```sql
-- Template
SELECT * FROM {{ tableName | sqlIdentifier }}

-- Input: "UserAccounts"
-- Output: SELECT * FROM [UserAccounts]
```

##### sqlIn Filter
Formats arrays for SQL IN clauses:

```sql
-- Template
WHERE Status IN {{ statusList | sqlIn }}

-- Input: ['Active', 'Pending', 'Review']
-- Output: WHERE Status IN ('Active', 'Pending', 'Review')
```

##### sqlNoKeywordsExpression Filter (NEW)
Validates SQL expressions by blocking dangerous keywords while allowing safe expressions:

```sql
-- Template
ORDER BY {{ orderClause | sqlNoKeywordsExpression }}

-- ✅ ALLOWED: "Revenue DESC, CreatedDate ASC"
-- ✅ ALLOWED: "SUM(Amount) DESC"
-- ✅ ALLOWED: "CASE WHEN Amount > 1000 THEN 1 ELSE 0 END"
-- ❌ BLOCKED: "Revenue; DROP TABLE Users"
-- ❌ BLOCKED: "Revenue UNION SELECT * FROM Secrets"
```

#### Parameter Types and Validation

Query parameters are defined in the `QueryParameter` entity with automatic validation:

```typescript
// Example parameter definitions
{
    name: 'startDate',
    type: 'date',
    isRequired: true,
    description: 'Start date for filtering records',
    sampleValue: '2024-01-01'
},
{
    name: 'statusList',
    type: 'array',
    isRequired: false,
    defaultValue: '["Active", "Pending"]',
    description: 'List of allowed status values'
},
{
    name: 'minAmount',
    type: 'number',
    isRequired: true,
    description: 'Minimum amount threshold'
}
```

#### Query Permissions

Queries support role-based access control:

```typescript
// Check if user can run a query (server-side or client-side)
const query = md.Provider.Queries.find(q => q.ID === queryId);
const canRun = query.UserCanRun(contextUser);
const hasPermission = query.UserHasRunPermissions(contextUser);

// Queries are only executable if:
// 1. User has required role permissions
// 2. Query status is 'Approved'
```

### RunReport Class

Execute reports with various output formats:

```typescript
import { RunReport, RunReportParams } from '@memberjunction/global';

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
import { TransactionGroupBase } from '@memberjunction/global';

// Transaction groups allow you to execute multiple entity operations atomically
// See your specific provider documentation for implementation details

// Example using SQLServerDataProvider:
const transaction = new TransactionGroupBase('MyTransaction');

// Add entities to the transaction
await transaction.AddTransaction(entity1);
await transaction.AddTransaction(entity2);

// Submit all operations as a single transaction
const results = await transaction.Submit();
```

For instance-level transactions in multi-user environments, each provider instance maintains its own transaction state, providing automatic isolation between concurrent requests.

### Entity Relationships

MemberJunction automatically handles entity relationships through the metadata system:

```typescript
// Load an entity with related data
const order = await md.GetEntityObject<OrderEntity>('Orders');
await order.Load(123, ['OrderDetails', 'Customer']);

// Access related entities
const orderDetails = order.OrderDetails; // Array of OrderDetailEntity
const customer = order.Customer; // CustomerEntity
```

### Security & Permissions

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

### Error Handling

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

### Datasets

Datasets are a powerful performance optimization feature in MemberJunction that allows efficient bulk loading of related entity data. Instead of making multiple individual API calls to load different entities, datasets enable you to load collections of related data in a single operation.

#### What Are Datasets?

Datasets are pre-defined collections of related entity data that can be loaded together. Each dataset contains multiple "dataset items" where each item represents data from a specific entity. This approach dramatically reduces database round trips and improves application performance.

#### How Datasets Work

1. **Dataset Definition**: Datasets are defined in the `Datasets` entity with a unique name and description
2. **Dataset Items**: Each dataset contains multiple items defined in the `Dataset Items` entity, where each item specifies:
   - The entity to load
   - An optional filter to apply
   - A unique code to identify the item within the dataset
3. **Bulk Loading**: When you request a dataset, all items are loaded in parallel in a single database operation
4. **Caching**: Datasets can be cached locally for offline use or improved performance

#### Key Benefits

- **Reduced Database Round Trips**: Load multiple entities in one operation instead of many
- **Better Performance**: Parallel loading and optimized queries
- **Caching Support**: Built-in local caching with automatic cache invalidation
- **Offline Capability**: Cached datasets enable offline functionality
- **Consistency**: All data in a dataset is loaded at the same point in time

#### The MJ_Metadata Dataset

The most important dataset in MemberJunction is `MJ_Metadata`, which loads all system metadata including:
- Entities and their fields
- Applications and settings
- User roles and permissions
- Query definitions
- Navigation items
- And more...

This dataset is used internally by MemberJunction to bootstrap the metadata system efficiently.

#### Dataset API Methods

The Metadata class provides several methods for working with datasets:

##### GetDatasetByName()
Always retrieves fresh data from the server without checking cache:

```typescript
const md = new Metadata();
const dataset = await md.GetDatasetByName('MJ_Metadata');

if (dataset.Success) {
    // Process the dataset results
    for (const item of dataset.Results) {
        console.log(`Loaded ${item.Results.length} records from ${item.EntityName}`);
    }
}
```

##### GetAndCacheDatasetByName()
Retrieves and caches the dataset, using cached version if up-to-date:

```typescript
// This will use cache if available and up-to-date
const dataset = await md.GetAndCacheDatasetByName('ProductCatalog');

// With custom filters for specific items
const filters: DatasetItemFilterType[] = [
    { ItemCode: 'Products', Filter: 'IsActive = 1' },
    { ItemCode: 'Categories', Filter: 'ParentID IS NULL' }
];
const filteredDataset = await md.GetAndCacheDatasetByName('ProductCatalog', filters);
```

##### IsDatasetCacheUpToDate()
Checks if the cached version is current without loading the data:

```typescript
const isUpToDate = await md.IsDatasetCacheUpToDate('ProductCatalog');
if (!isUpToDate) {
    console.log('Cache is stale, refreshing...');
    await md.GetAndCacheDatasetByName('ProductCatalog');
}
```

##### ClearDatasetCache()
Removes a dataset from local cache:

```typescript
// Clear specific dataset
await md.ClearDatasetCache('ProductCatalog');

// Clear dataset with specific filters
await md.ClearDatasetCache('ProductCatalog', filters);
```

#### Dataset Best Practices

1. **Use Datasets for Related Data**: When you need multiple entities that are logically related
2. **Cache Strategically**: Use `GetAndCacheDatasetByName()` for data that doesn't change frequently
3. **Apply Filters Wisely**: Filters reduce data volume but make cache keys more specific
4. **Monitor Cache Size**: Large datasets can consume significant local storage
5. **Refresh When Needed**: Use `IsDatasetCacheUpToDate()` to check before using cached data

### Vector Embeddings Support (v2.90.0+)

MemberJunction now provides built-in support for generating and managing vector embeddings for text fields in entities. This feature enables similarity search, duplicate detection, and AI-powered features across your data.

#### Overview

The BaseEntity class now includes methods for generating vector embeddings from text fields and storing them alongside the original data. This functionality is designed to be used by server-side entity subclasses that have access to AI embedding models.

#### Core Methods

BaseEntity provides four methods for managing vector embeddings:

```typescript
// Generate embeddings for multiple fields by field names
protected async GenerateEmbeddingsByFieldName(fields: Array<{
    fieldName: string,           // Source text field name
    vectorFieldName: string,     // Target vector storage field name
    modelFieldName: string       // Field to store the model ID used
}>): Promise<boolean>

// Generate embedding for a single field by name
protected async GenerateEmbeddingByFieldName(
    fieldName: string,
    vectorFieldName: string,
    modelFieldName: string
): Promise<boolean>

// Generate embeddings for multiple fields using EntityField objects
protected async GenerateEmbeddings(fields: Array<{
    field: EntityField,
    vectorField: EntityField,
    modelField: EntityField
}>): Promise<boolean>

// Generate embedding for a single field
protected async GenerateEmbedding(
    field: EntityField,
    vectorField: EntityField,
    modelField: EntityField
): Promise<boolean>
```

#### Implementation Pattern

To use vector embeddings in your entity:

1. **Add Vector Storage Fields** to your database table:
   - A field to store the vector (typically NVARCHAR(MAX))
   - A field to store the model ID that generated the vector

2. **Implement EmbedTextLocal** in your server-side entity subclass:

```typescript
import { BaseEntity, SimpleEmbeddingResult } from "@memberjunction/global";
import { AIEngine } from "@memberjunction/aiengine";

export class MyEntityServer extends MyEntity {
    protected async EmbedTextLocal(textToEmbed: string): Promise<SimpleEmbeddingResult> {
        await AIEngine.Instance.Config(false, this.ContextCurrentUser);
        const result = await AIEngine.Instance.EmbedTextLocal(textToEmbed);

        if (!result?.result?.vector || !result?.model?.ID) {
            throw new Error('Failed to generate embedding');
        }

        return {
            vector: result.result.vector,
            modelID: result.model.ID
        };
    }
}
```

3. **Call GenerateEmbeddings** in your Save method:

```typescript
public async Save(): Promise<boolean> {
    // Generate embeddings before saving
    await this.GenerateEmbeddingsByFieldName([
        {
            fieldName: "Description",
            vectorFieldName: "DescriptionVector",
            modelFieldName: "DescriptionVectorModelID"
        },
        {
            fieldName: "Content",
            vectorFieldName: "ContentVector",
            modelFieldName: "ContentVectorModelID"
        }
    ]);

    return await super.Save();
}
```

#### Automatic Features

The embedding generation system includes several automatic optimizations:

- **Dirty Detection**: Only generates embeddings for new records or when source text changes
- **Null Handling**: Clears vector fields when source text is empty
- **Parallel Processing**: Multiple embeddings are generated concurrently for performance
- **Error Resilience**: Returns false on failure without throwing exceptions

#### Type Definitions

The `SimpleEmbeddingResult` type is defined in @memberjunction/global:

```typescript
export type SimpleEmbeddingResult = {
    vector: number[];    // The embedding vector
    modelID: string;     // ID of the AI model used
}
```

### BaseSingleton Class

Abstract base class for creating global singleton instances that persist across module boundaries.

```typescript
import { BaseSingleton } from '@memberjunction/global';

export class MyService extends BaseSingleton<MyService> {
  private data: string[] = [];

  public static get Instance(): MyService {
    return super.getInstance<MyService>();
  }

  public addData(item: string): void {
    this.data.push(item);
  }
}

// Usage anywhere in your app
const service = MyService.Instance;
service.addData('example');
```

### Class Reflection Utilities

Runtime utilities for inspecting and analyzing class hierarchies.

```typescript
import { 
  GetSuperclass, 
  GetRootClass, 
  IsSubclassOf,
  IsRootClass,
  IsDescendantClassOf,
  GetClassInheritance,
  GetFullClassHierarchy,
  IsClassConstructor,
  GetClassName
} from '@memberjunction/global';

// Example class hierarchy
class Animal {}
class Mammal extends Animal {}
class Dog extends Mammal {}
class GoldenRetriever extends Dog {}

// Get immediate superclass
const parent = GetSuperclass(GoldenRetriever); // Returns: Dog

// Get root class of hierarchy
const root = GetRootClass(GoldenRetriever); // Returns: Animal

// Check inheritance relationships
IsSubclassOf(GoldenRetriever, Animal); // true (checks entire chain)
IsDescendantClassOf(GoldenRetriever, Animal); // true (alias for IsSubclassOf)
IsRootClass(Animal); // true
IsRootClass(Dog); // false

// Get inheritance chain
const chain = GetClassInheritance(GoldenRetriever);
// Returns: [
//   { name: 'Dog', reference: Dog },
//   { name: 'Mammal', reference: Mammal },
//   { name: 'Animal', reference: Animal }
// ]

// Get full hierarchy including the class itself
const fullChain = GetFullClassHierarchy(GoldenRetriever);
// Returns: [
//   { name: 'GoldenRetriever', reference: GoldenRetriever },
//   { name: 'Dog', reference: Dog },
//   { name: 'Mammal', reference: Mammal },
//   { name: 'Animal', reference: Animal }
// ]

// Utility functions
IsClassConstructor(Dog); // true
IsClassConstructor(() => {}); // false
GetClassName(GoldenRetriever); // "GoldenRetriever"
```

### Deep Diff Engine

Comprehensive object comparison and change tracking with hierarchical diff visualization.

```typescript
import { DeepDiffer, DiffChangeType } from '@memberjunction/global';

// Create a differ instance
const differ = new DeepDiffer({
  includeUnchanged: false,      // Don't track unchanged values
  maxDepth: 10,                 // Maximum recursion depth
  maxStringLength: 100,         // Truncate long strings
  treatNullAsUndefined: false   // Treat null and undefined as distinct (default: false)
});

// Compare two objects
const oldData = {
  user: { name: 'John', age: 30, role: 'admin' },
  settings: { theme: 'dark', notifications: true },
  tags: ['important', 'active']
};

const newData = {
  user: { name: 'John', age: 31, role: 'superadmin' },
  settings: { theme: 'light', notifications: true, language: 'en' },
  tags: ['important', 'active', 'premium']
};

// Get the diff
const result = differ.diff(oldData, newData);

// Access summary
console.log(result.summary);
// { added: 2, removed: 0, modified: 3, unchanged: 3, total: 8 }

// Iterate through changes
result.changes.forEach(change => {
  console.log(`${change.path}: ${change.type} - ${change.description}`);
});
// Output:
// user.age: Modified - Changed from 30 to 31
// user.role: Modified - Changed from "admin" to "superadmin"
// settings.theme: Modified - Changed from "dark" to "light"
// settings.language: Added - Value: "en"
// tags[2]: Added - Value: "premium"

// Filter changes by type
const additions = result.changes.filter(c => c.type === DiffChangeType.Added);
const modifications = result.changes.filter(c => c.type === DiffChangeType.Modified);

// Update configuration on the fly
differ.updateConfig({ includeUnchanged: true });
```

#### Treating null as undefined

When working with APIs or databases where `null` and `undefined` are used interchangeably, you can enable the `treatNullAsUndefined` option:

```typescript
const differ = new DeepDiffer({ treatNullAsUndefined: true });

const oldData = {
  name: null,
  status: 'active',
  oldProp: 'value'
};

const newData = {
  name: 'John',      // Will show as "Added" instead of "Modified"
  status: null,      // Will show as "Removed" instead of "Modified"
  newProp: 'value'
};

const result = differ.diff(oldData, newData);
// With treatNullAsUndefined: true
// - name: Added (not Modified, since null is treated as non-existent)
// - status: Removed (not Modified, since null is treated as non-existent)
// - oldProp: Removed
// - newProp: Added
```

### JSON Validator

Lightweight JSON validation with flexible validation rules and special field suffixes.

```typescript
import { JSONValidator } from '@memberjunction/global';

// Create validator instance
const validator = new JSONValidator();

// Define validation template with rules
const template = {
  name: "John Doe",                    // Required field
  email?: "user@example.com",          // Optional field
  settings*: {},                       // Required, any content allowed
  tags:[1+]: ["tag1"],                // Array with at least 1 item
  age:number: 25,                     // Must be a number
  username:string:!empty: "johndoe",   // Non-empty string
  items:array:[2-5]?: ["A", "B"]      // Optional array with 2-5 items
};

// Validate data against template
const data = {
  name: "Jane Smith",
  tags: ["work", "urgent"],
  age: 30,
  username: "jsmith"
};

const result = validator.validate(data, template);
if (result.Success) {
  console.log('Validation passed!');
} else {
  result.Errors.forEach(error => {
    console.log(`${error.Source}: ${error.Message}`);
  });
}
```

#### Validation Syntax

**Field Suffixes:**
- `?` - Optional field (e.g., `email?`)
- `*` - Required field with any content/structure (e.g., `payload*`)

**Validation Rules (using `:` delimiter):**
- **Array Length:**
  - `[N+]` - At least N elements (e.g., `tags:[1+]`)
  - `[N-M]` - Between N and M elements (e.g., `items:[2-5]`)
  - `[=N]` - Exactly N elements (e.g., `coordinates:[=2]`)

- **Type Checking:**
  - `string` - Must be a string
  - `number` - Must be a number (NaN fails validation)
  - `boolean` - Must be a boolean
  - `object` - Must be an object (not array or null)
  - `array` - Must be an array

- **Value Constraints:**
  - `!empty` - Non-empty string, array, or object

**Combining Rules:**
Multiple validation rules can be combined with `:` delimiter:
```typescript
{
  // Array of strings with 2+ items
  "tags:array:[2+]": ["important", "urgent"],
  
  // Non-empty string
  "username:string:!empty": "johndoe",
  
  // Optional number
  "score:number?": 85,
  
  // Optional array with 1-3 items
  "options:array:[1-3]?": ["A", "B"]
}
```

#### Nested Object Validation

The validator recursively validates nested objects:

```typescript
const template = {
  user: {
    id:number: 123,
    name:string:!empty: "John",
    roles:array:[1+]: ["admin"]
  },
  settings?: {
    theme: "dark",
    notifications:boolean: true
  }
};
```

#### Cleaning Validation Syntax

The validator can clean validation syntax from JSON objects that may have been returned by AI systems:

```typescript
// AI might return JSON with validation syntax in keys
const aiResponse = {
  "name?": "John Doe",
  "email:string": "john@example.com",
  "tags:[2+]": ["work", "urgent"],
  "settings*": { theme: "dark" },
  "score:number:!empty": 85
};

// Clean the validation syntax
const cleaned = validator.cleanValidationSyntax<any>(aiResponse);
// Returns:
// {
//   "name": "John Doe",
//   "email": "john@example.com", 
//   "tags": ["work", "urgent"],
//   "settings": { theme: "dark" },
//   "score": 85
// }
```

The `cleanValidationSyntax` method:
- Recursively processes all object keys
- Removes validation suffixes (`?`, `*`)
- Removes validation rules (`:type`, `:[N+]`, `:!empty`, etc.)
- Preserves the original values unchanged
- Handles nested objects and arrays
- Returns a new object with cleaned keys

#### Convenience Methods

```typescript
// Validate against JSON string
const schemaJson = '{"name": "string", "age:number": 0}';
const result = validator.validateAgainstSchema(data, schemaJson);

// Integration with MemberJunction ValidationResult
// Returns standard ValidationResult with ValidationErrorInfo[]
// Compatible with existing MJ validation patterns
```

#### Use Cases

1. **API Response Validation:**
```typescript
const apiResponseTemplate = {
  status:string: "success",
  data*: {},  // Any data structure allowed
  errors:array?: []
};
```

2. **Configuration Validation:**
```typescript
const configTemplate = {
  apiUrl:string:!empty: "https://api.example.com",
  timeout:number: 5000,
  retries:number: 3,
  features:array:[1+]: ["logging"]
};
```

3. **Form Data Validation:**
```typescript
const formTemplate = {
  username:string:!empty: "user",
  email:string: "user@example.com",
  age:number?: 25,
  preferences:object?: {
    notifications:boolean: true
  }
};
```

## Event Types

The library provides predefined event types for common scenarios:

```typescript
export const MJEventType = {
  ComponentRegistered: 'ComponentRegistered',
  ComponentUnregistered: 'ComponentUnregistered',
  ComponentEvent: 'ComponentEvent',
  LoggedIn: 'LoggedIn',
  LoggedOut: 'LoggedOut',
  LoginFailed: 'LoginFailed',
  LogoutFailed: 'LogoutFailed',
  ManualResizeRequest: 'ManualResizeRequest',
  DisplaySimpleNotificationRequest: 'DisplaySimpleNotificationRequest',
} as const;
```

## Utility Functions

### String Manipulation

```typescript
import { 
  convertCamelCaseToHaveSpaces,
  stripWhitespace,
  generatePluralName,
  adjustCasing,
  stripTrailingChars,
  replaceAllSpaces
} from '@memberjunction/global';

// Convert camel case to spaces
convertCamelCaseToHaveSpaces('AIAgentLearningCycle'); // "AI Agent Learning Cycle"

// Remove all whitespace
stripWhitespace('  Hello   World  '); // "HelloWorld"

// Generate plural forms
generatePluralName('child'); // "children"
generatePluralName('box'); // "boxes"
generatePluralName('party'); // "parties"

// Adjust casing
adjustCasing('hello', { capitalizeFirstLetterOnly: true }); // "Hello"
adjustCasing('world', { capitalizeEntireWord: true }); // "WORLD"

// Strip trailing characters
stripTrailingChars('example.txt', '.txt', false); // "example"

// Remove all spaces
replaceAllSpaces('Hello World'); // "HelloWorld"
```

### JSON Utilities

```typescript
import { CleanJSON, SafeJSONParse, ParseJSONRecursive } from '@memberjunction/global';

// Safe JSON parsing with error handling
const parsed = SafeJSONParse<MyType>('{"key": "value"}', true);

// Recursively parse JSON strings within objects
const input = {
  data: '{"nested": "{\\"deeply\\": \\"nested\\"}"}',
  messages: '[{"content": "{\\"type\\": \\"greeting\\", \\"text\\": \\"Hello\\"}"}]'
};
const output = ParseJSONRecursive(input);
// Returns: {
//   data: { nested: { deeply: "nested" } },
//   messages: [{ content: { type: "greeting", text: "Hello" } }]
// }

// Extract inline JSON from text strings
const textWithJson = {
  result: 'Action completed: {"status": "success", "count": 42}'
};
const extracted = ParseJSONRecursive(textWithJson, { extractInlineJson: true });
// Returns: {
//   result: "Action completed:",
//   result_: { status: "success", count: 42 }
// }

// Control recursion depth and enable debugging
const deeplyNested = ParseJSONRecursive(complexData, {
  maxDepth: 50,        // Default: 100
  extractInlineJson: true,  // Default: false
  debug: true          // Default: false, logs parsing steps
});
```

#### CleanJSON Function

The `CleanJSON` function intelligently extracts and cleans JSON from various input formats, including double-escaped strings, strings with embedded JSON, and markdown code blocks. It's particularly useful when dealing with AI-generated responses or data from external systems that may have inconsistent JSON formatting.

**Processing Order:**
1. First attempts to parse the input as valid JSON (preserving embedded content)
2. If that fails, handles double-escaped characters (`\\n`, `\\"`, etc.)
3. Only extracts from markdown blocks or inline JSON as a last resort

```typescript
import { CleanJSON } from '@memberjunction/global';

// Example 1: Already valid JSON - returns formatted
const valid = CleanJSON('{"name": "test", "value": 123}');
// Returns:
// {
//   "name": "test",
//   "value": 123
// }

// Example 2: Double-escaped JSON string
const escaped = CleanJSON('{\\"name\\": \\"test\\", \\"value\\": 123}');
// Returns:
// {
//   "name": "test",
//   "value": 123
// }

// Example 3: JSON with escaped newlines (common from AI responses)
const withNewlines = CleanJSON('\\n{\\"mode\\": \\"test\\",\\n\\"data\\": [1, 2, 3]}\\n');
// Returns:
// {
//   "mode": "test",
//   "data": [1, 2, 3]
// }

// Example 4: Complex JSON with embedded markdown (preserves the markdown)
const complexJson = CleanJSON(`{
  "taskComplete": false,
  "message": "Processing complete",
  "nextAction": {
    "type": "design",
    "payload": {
      "outputFormat": "\`\`\`json\\n{\\"componentName\\": \\"Example\\"}\\n\`\`\`"
    }
  }
}`);
// Returns the JSON with the markdown code block preserved in the outputFormat field

// Example 5: Extract JSON from markdown (only when input isn't valid JSON)
const markdown = CleanJSON('Some text ```json\n{"extracted": true}\n``` more text');
// Returns:
// {
//   "extracted": true
// }

// Example 6: Extract inline JSON from mixed text
const mixed = CleanJSON('Response: {"status": "success", "code": 200} - Done');
// Returns:
// {
//   "status": "success",
//   "code": 200
// }

// Example 7: Complex real-world example with nested escaped JSON
const aiResponse = CleanJSON(`{
  "analysis": "Complete",
  "data": "{\\"users\\": [{\\"name\\": \\"John\\", \\"active\\": true}]}",
  "metadata": {
    "template": "\`\`\`json\\n{\\"format\\": \\"standard\\"}\\n\`\`\`"
  }
}`);
// Returns properly formatted JSON with all nested structures intact
```

**Key Features:**
- **Preserves embedded content**: When the input is valid JSON, markdown blocks and escaped strings within values are preserved
- **Smart unescaping**: Handles `\\n` → `\n`, `\\"` → `"`, `\\\\` → `\` and other common escape sequences
- **Markdown extraction**: Extracts JSON from ` ```json ` code blocks when needed
- **Inline extraction**: Finds JSON objects/arrays within surrounding text
- **Null safety**: Returns `null` for invalid inputs instead of throwing errors

**Common Use Cases:**
- Processing AI model responses that may contain escaped JSON
- Cleaning data from external APIs with inconsistent formatting
- Extracting JSON from log files or debug output
- Handling JSON strings stored in databases that may be double-escaped
- Processing user input that may contain JSON in various formats

### HTML Conversion

```typescript
import { ConvertMarkdownStringToHtmlList } from '@memberjunction/global';

// Convert markdown to HTML list
const html = ConvertMarkdownStringToHtmlList('Unordered', '- Item 1\n- Item 2\n- Item 3');
// Returns: <ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>
```

### Safe Expression Evaluator

Secure boolean expression evaluation for conditional logic without allowing arbitrary code execution:

```typescript
import { SafeExpressionEvaluator } from '@memberjunction/global';

// Create evaluator instance
const evaluator = new SafeExpressionEvaluator();

// Simple comparisons
const result1 = evaluator.evaluate(
  "status == 'active' && score > 80",
  { status: 'active', score: 95 }
);
console.log(result1.success); // true
console.log(result1.value);   // true

// Nested property access with dot notation
const result2 = evaluator.evaluate(
  "user.role == 'admin' && user.permissions.includes('write')",
  { 
    user: { 
      role: 'admin', 
      permissions: ['read', 'write', 'delete'] 
    } 
  }
);
console.log(result2.value); // true

// Array methods and complex conditions
const result3 = evaluator.evaluate(
  "items.some(item => item.price > 100) && items.length >= 2",
  { 
    items: [
      { name: 'Item 1', price: 50 },
      { name: 'Item 2', price: 150 }
    ] 
  }
);
console.log(result3.value); // true

// Error handling for invalid expressions
const result4 = evaluator.evaluate(
  "eval('malicious code')", // Dangerous patterns are blocked
  { data: 'test' }
);
console.log(result4.success); // false
console.log(result4.error);   // "Expression contains forbidden construct: /\beval\s*\(/i"

// With diagnostics enabled
const result5 = evaluator.evaluate(
  "payload.status == 'complete'",
  { payload: { status: 'complete' } },
  true // Enable diagnostics
);
console.log(result5.diagnostics);
// {
//   expression: "payload.status == 'complete'",
//   context: { payload: { status: 'complete' } },
//   evaluationTime: 2
// }
```

#### Supported Operations

**Comparison Operators:**
- `==`, `===`, `!=`, `!==`
- `<`, `>`, `<=`, `>=`

**Logical Operators:**
- `&&`, `||`, `!`

**Property Access:**
- Dot notation: `object.property.nested`
- Array access: `array[0]`, `array[index]`

**Safe Methods:**
- String: `.length`, `.includes()`, `.startsWith()`, `.endsWith()`, `.toLowerCase()`, `.toUpperCase()`, `.trim()`
- Array: `.length`, `.includes()`, `.some()`, `.every()`, `.find()`, `.filter()`, `.map()`
- Type checking: `typeof`, limited `instanceof`

**Type Coercion:**
- `Boolean(value)`
- String concatenation with `+`

#### Security Features

The evaluator blocks dangerous patterns including:
- `eval()`, `Function()`, `new Function()`
- `require()`, `import` statements
- Access to `global`, `window`, `document`, `process`
- Template literals and string interpolation
- Code blocks with `{}` and `;`
- `this` keyword usage
- `constructor`, `prototype`, `__proto__` access

#### Use Cases

1. **Workflow Conditions:**
```typescript
// Evaluate workflow paths
const canProceed = evaluator.evaluate(
  "order.status == 'approved' && order.total < budget",
  { order: { status: 'approved', total: 500 }, budget: 1000 }
).value;
```

2. **Feature Flags:**
```typescript
// Check feature availability
const featureEnabled = evaluator.evaluate(
  "user.tier == 'premium' || user.roles.includes('beta')",
  { user: { tier: 'standard', roles: ['beta', 'tester'] } }
).value;
```

3. **Validation Rules:**
```typescript
// Dynamic validation
const isValid = evaluator.evaluate(
  "form.password.length >= 8 && form.password != form.username",
  { form: { username: 'john', password: 'secretpass123' } }
).value;
```

4. **Agent Decision Logic:**
```typescript
// AI agent path selection
const shouldDelegate = evaluator.evaluate(
  "confidence < 0.7 || taskComplexity > 8",
  { confidence: 0.6, taskComplexity: 5 }
).value;
```

#### Batch Evaluation

Evaluate multiple expressions at once:

```typescript
const results = evaluator.evaluateMultiple([
  { expression: "status == 'active'", name: 'isActive' },
  { expression: "score > threshold", name: 'passedThreshold' },
  { expression: "tags.includes('priority')", name: 'isPriority' }
], {
  status: 'active',
  score: 85,
  threshold: 80,
  tags: ['urgent', 'priority']
});

// Results:
// {
//   isActive: { success: true, value: true },
//   passedThreshold: { success: true, value: true },
//   isPriority: { success: true, value: true }
// }
```

### Pattern Matching Utilities

Convert string patterns to RegExp objects with support for simple wildcards and full regex syntax:

```typescript
import { 
  parsePattern, 
  parsePatterns, 
  ensureRegExp, 
  ensureRegExps,
  matchesAnyPattern,
  matchesAllPatterns
} from '@memberjunction/global';

// Parse simple wildcard patterns
parsePattern('*AIPrompt*');    // Returns: /AIPrompt/i (case-insensitive)
parsePattern('spCreate*');     // Returns: /^spCreate/i
parsePattern('*Run');          // Returns: /Run$/i
parsePattern('exact');         // Returns: /^exact$/i

// Parse regex string patterns
parsePattern('/spCreate.*Run/i');        // Returns: /spCreate.*Run/i
parsePattern('/^SELECT.*FROM.*vw/');     // Returns: /^SELECT.*FROM.*vw/
parsePattern('/INSERT INTO (Users|Roles)/i'); // Returns: /INSERT INTO (Users|Roles)/i

// Parse multiple patterns at once
const patterns = parsePatterns([
  '*User*',              // Simple wildcard
  '/^EXEC sp_/i',        // Regex string
  '*EntityFieldValue*'   // Simple wildcard
]);

// Convert mixed string/RegExp arrays
const mixed = ['*User*', /^Admin/i, '/DELETE.*WHERE/i'];
const regexps = ensureRegExps(mixed);  // All converted to RegExp objects

// Test if text matches any pattern
const sql = 'SELECT * FROM Users WHERE Active = 1';
matchesAnyPattern(sql, ['*User*', '*Role*', '/^UPDATE/i']);  // true

// Test if text matches all patterns
const filename = 'UserRoleManager.ts';
matchesAllPatterns(filename, ['*User*', '*Role*', '*.ts']);  // true
```

#### Pattern Syntax

**Simple Wildcard Patterns** (Recommended for most users):
- `*` acts as a wildcard matching any characters
- Case-insensitive by default
- Examples:
  - `*pattern*` - Contains "pattern" anywhere
  - `pattern*` - Starts with "pattern"
  - `*pattern` - Ends with "pattern"
  - `pattern` - Exact match only

**Regex String Patterns** (For advanced users):
- Must start with `/` to be recognized as regex
- Optionally end with flags like `/pattern/i`
- Full JavaScript regex syntax supported
- Examples:
  - `/^start/i` - Case-insensitive start match
  - `/end$/` - Case-sensitive end match
  - `/(option1|option2)/` - Match alternatives

#### Common Use Cases

```typescript
// SQL statement filtering
const sqlFilters = [
  '*AIPrompt*',           // Exclude AI prompt operations
  '/^EXEC sp_/i',         // Exclude system stored procedures
  '*EntityFieldValue*'    // Exclude field value operations
];

const shouldLog = !matchesAnyPattern(sqlStatement, sqlFilters);

// File pattern matching
const includePatterns = ['*.ts', '*.js', '/^(?!test)/'];  // TS/JS files not starting with "test"
const shouldProcess = matchesAnyPattern(filename, includePatterns);

// User input validation
const allowedFormats = ['*@*.com', '*@*.org', '*@company.net'];
const isValidEmail = matchesAnyPattern(email, allowedFormats);
```

### Global Object Store

Access the global object store for cross-module state sharing:

```typescript
import { GetGlobalObjectStore } from '@memberjunction/global';

const globalStore = GetGlobalObjectStore();
// Returns window object in browser, global in Node.js
```

### Manual Resize Request

Trigger a manual resize event across components:

```typescript
import { InvokeManualResize } from '@memberjunction/global';

// Request resize after 50ms delay
InvokeManualResize(50, myComponent);
```

## Logging

MemberJunction provides enhanced logging capabilities with both simple and advanced APIs:

### Basic Logging

```typescript
import { LogStatus, LogError } from '@memberjunction/global';

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
import { LogStatusEx, IsVerboseLoggingEnabled, SetVerboseLogging } from '@memberjunction/global';

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
import { LogErrorEx } from '@memberjunction/global';

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
import { SetProvider } from '@memberjunction/global';

// Provider setup is typically handled by your application initialization
// The provider determines how data is accessed (direct database, API, etc.)
SetProvider(myProvider);
```

### Metadata Caching Optimization

Starting in v2.0, providers support intelligent metadata caching for improved performance in multi-user environments:

```typescript
// First provider instance loads metadata from the database
const provider1 = new SQLServerDataProvider(connectionPool);
await provider1.Config(config); // Loads metadata from database

// Subsequent instances can reuse cached metadata
const config2 = new SQLServerProviderConfigData(
  connectionPool,
  '__mj',
  0,
  undefined,
  undefined,
  false // ignoreExistingMetadata = false to reuse cached metadata
);
const provider2 = new SQLServerDataProvider(connectionPool);
await provider2.Config(config2); // Reuses metadata from provider1
```

This optimization is particularly beneficial in server environments where each request gets its own provider instance.

## Advanced Usage

### Class Factory with Root Class Detection

The Class Factory automatically detects and uses root classes for registration, ensuring proper priority ordering in inheritance hierarchies:

```typescript
class BaseEntity {} // Root class

class UserEntity extends BaseEntity {}

// This automatically registers with BaseEntity (the root)
@RegisterClass(UserEntity, 'Admin')
class AdminUserEntity extends UserEntity {}

// Also registers with BaseEntity, gets higher priority
@RegisterClass(AdminUserEntity, 'SuperAdmin')  
class SuperAdminEntity extends AdminUserEntity {}

// All of these create SuperAdminEntity (highest priority)
factory.CreateInstance(BaseEntity, 'SuperAdmin');      // ✓ Works
factory.CreateInstance(UserEntity, 'SuperAdmin');      // ✓ Works  
factory.CreateInstance(AdminUserEntity, 'SuperAdmin'); // ✓ Works
```

### Disabling Auto-Root Registration

Sometimes you want to register at a specific level in the hierarchy:

```typescript
// Register directly to UserEntity, not BaseEntity
@RegisterClass(UserEntity, 'Special', 0, false, false) // Last param = false
class SpecialUserEntity extends UserEntity {
  // This only matches when creating from UserEntity, not BaseEntity
}

// Direct registration queries
factory.CreateInstance(UserEntity, 'Special');   // ✓ Returns SpecialUserEntity
factory.CreateInstance(BaseEntity, 'Special');   // ✗ Returns BaseEntity instance
```

### Class Factory with Parameters

```typescript
// Register a class that requires constructor parameters
@RegisterClass(BaseService, 'api')
class ApiService extends BaseService {
  constructor(private apiUrl: string) {
    super();
  }
}

// Create with parameters
const service = factory.CreateInstance<BaseService>(
  BaseService, 
  'api', 
  'https://api.example.com'
);
```

### Priority-based Registration

```typescript
// Lower priority (registered first)
@RegisterClass(BaseHandler, 'data', 10)
class BasicDataHandler extends BaseHandler {}

// Higher priority (overrides BasicDataHandler)
@RegisterClass(BaseHandler, 'data', 20)
class AdvancedDataHandler extends BaseHandler {}

// Will create AdvancedDataHandler instance
const handler = factory.CreateInstance<BaseHandler>(BaseHandler, 'data');
```

### Inspecting Registrations

```typescript
// Get all registrations for a base class
const registrations = factory.GetAllRegistrations(BaseEntity, 'Users');

// Get registrations by root class
const rootRegistrations = factory.GetRegistrationsByRootClass(BaseEntity);

// Each registration contains:
// - BaseClass: The class it's registered to (usually root)
// - SubClass: The actual implementation class
// - RootClass: The detected root of the hierarchy
// - Key: The registration key
// - Priority: The priority number
```

### Global Properties

Store and retrieve global properties:

```typescript
const properties = MJGlobal.Instance.Properties;
properties.push({
  key: 'apiEndpoint',
  value: 'https://api.example.com'
});
```

## Breaking Changes

### v2.111.0
- **Package Merge**: `@memberjunction/core` has been merged into `@memberjunction/global`. If you were importing from `@memberjunction/core`, update your imports to use `@memberjunction/global` instead:
  ```typescript
  // Old
  import { Metadata, BaseEntity, RunView } from '@memberjunction/global';

  // New
  import { Metadata, BaseEntity, RunView } from '@memberjunction/global';
  ```
  All functionality remains the same; only the package name has changed.

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
10. **Use GetAll()** instead of spread operator on BaseEntity instances to properly capture all field values
11. **Apply SQL security filters** when using RunQuery with parameterized queries
12. **Leverage Datasets** for loading related entity collections efficiently
13. **Use structured logging** with LogStatusEx/LogErrorEx for better debugging and monitoring

## Integration with MemberJunction

This package is the core foundation for all MemberJunction packages. It provides:

### Metadata & Data Access
- Entity metadata and schema information
- Data loading, saving, and manipulation
- Query and report execution
- Transaction management
- Security and permissions

### Global Coordination
- Entity registration and instantiation via Class Factory
- Cross-component event communication via MJGlobal
- Singleton service management via BaseSingleton
- Global state coordination

When building MemberJunction applications or extensions, use this package to ensure proper integration with the framework's architecture.

### Related Packages

- **@memberjunction/server**: Server-side provider implementation (direct database access)
- **@memberjunction/client**: Client-side provider implementation (API-based access)
- **@memberjunction/angular**: Angular-specific components and services
- **@memberjunction/react**: React-specific components and hooks
- **@memberjunction/ai**: AI integration features
- **@memberjunction/communication**: Communication and messaging features

## TypeScript Support

This package is written in TypeScript and includes full type definitions. All exports are properly typed for excellent IDE support and compile-time type checking. All generated entity classes include proper typing for IntelliSense support.

## Dependencies

- **rxjs** (^7.8.1) - For reactive event handling and programming support
- **zod** - Schema validation for entity fields
- **debug** - Debug logging support

## Development

```bash
# Build the package
npm run build

# Start in development mode with hot reload
npm run start

# Run tests (when implemented)
npm test
```

## License

ISC

## Author

MemberJunction.com

