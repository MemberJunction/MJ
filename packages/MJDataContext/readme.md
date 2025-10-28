# @memberjunction/data-context

The `@memberjunction/data-context` library provides a comprehensive framework for managing data contexts in MemberJunction applications. It enables developers to define, load, and manipulate collections of related data items across different tiers of an application.

## Overview

A Data Context in MemberJunction represents a collection of data items that can include:
- **Views**: Filtered and customized views of entity data
- **Queries**: Pre-defined SQL queries registered in the system
- **Full Entities**: Complete data sets from an entity
- **Single Records**: Individual entity records with optional related data
- **SQL Statements**: Direct SQL queries (server-side only)

## Installation

```bash
npm install @memberjunction/data-context
```

## Key Features

- **Type-safe data context management**: Full TypeScript support with proper typing
- **Flexible data loading**: Support for various data sources including views, queries, entities, and SQL
- **Metadata-driven**: Automatic loading of metadata from the MemberJunction system
- **Transaction support**: Save multiple data context items in a single transaction
- **Cross-tier compatibility**: Works across server and client tiers with appropriate implementations
- **Data persistence**: Optional saving of loaded data to the database

## Usage

### Basic Example

```typescript
import { DataContext, DataContextItem } from '@memberjunction/data-context';
import { Metadata } from '@memberjunction/core';

// Create a new data context
const context = new DataContext();

// Load metadata and data for an existing data context
const dataContextID = 'your-data-context-id';
const loaded = await context.Load(
  dataContextID,
  dataSource, // Required for SQL type items (server-side only)
  false,      // forceRefresh
  true,       // loadRelatedDataOnSingleRecords
  10,         // maxRecordsPerRelationship
  userInfo    // contextUser
);

if (loaded) {
  // Access the loaded data
  context.Items.forEach(item => {
    console.log(`Item: ${item.Description}`);
    console.log(`Data rows: ${item.Data?.length || 0}`);
  });
}
```

### Creating Data Context Items

#### From a View

```typescript
import { UserViewEntityExtended } from '@memberjunction/core-entities';

// Assuming you have a view entity loaded
const viewEntity: UserViewEntityExtended = await md.GetEntityObject<UserViewEntityExtended>('User Views');
await viewEntity.Load(viewID);

const viewItem = DataContextItem.FromViewEntity(viewEntity);
context.Items.push(viewItem);
```

#### From a Single Record

```typescript
import { BaseEntity } from '@memberjunction/core';

// Assuming you have an entity record loaded
const record: BaseEntity = await md.GetEntityObject('Customers');
await record.Load(recordID);

const recordItem = DataContextItem.FromSingleRecord(record);
context.Items.push(recordItem);
```

#### From a Query

```typescript
import { QueryInfo } from '@memberjunction/core';

// Get query info from metadata
const queryInfo = md.Queries.find(q => q.Name === 'My Query');
if (queryInfo) {
  const queryItem = DataContextItem.FromQuery(queryInfo);
  context.Items.push(queryItem);
}
```

#### From a Full Entity

```typescript
import { EntityInfo } from '@memberjunction/core';

// Get entity info from metadata
const entityInfo = md.Entities.find(e => e.Name === 'Products');
if (entityInfo) {
  const entityItem = DataContextItem.FromFullEntity(entityInfo);
  context.Items.push(entityItem);
}
```

### Loading Data for Items

```typescript
// Load data for all items in the context
const dataLoaded = await context.LoadData(
  dataSource,  // Required for SQL type items
  false,       // forceRefresh
  true,        // loadRelatedDataOnSingleRecords
  10          // maxRecordsPerRelationship
);

// Or load data for a specific item
const itemLoaded = await context.Items[0].LoadData(
  dataSource,
  false,
  true,
  10
);
```

### Saving Data Context Items

```typescript
// Save all items in the context to the database
const saved = await context.SaveItems(
  userInfo,  // contextUser
  true       // persistItemData - saves actual data, not just metadata
);

if (saved) {
  console.log('Data context items saved successfully');
  // Each item now has a DataContextItemID populated
}
```

### Working with Data

```typescript
// Validate that all items have data loaded
if (context.ValidateDataExists()) {
  // Convert to a simple object for easier manipulation
  const simpleData = context.ConvertToSimpleObject('item_', false);
  // Result: { item_0: [...], item_1: [...], ... }
  
  // Get type definition for the data structure
  const typeDef = context.CreateSimpleObjectTypeDefinition('item_');
  console.log(typeDef);
  // Output: {item_0: []; // View: Customer List, From Entity: Customers\n...}
}

// Access individual item data
context.Items.forEach(item => {
  if (item.DataLoaded && item.Data) {
    console.log(`${item.Description}: ${item.Data.length} rows`);
    
    // Process the data
    item.Data.forEach(row => {
      // Work with row data
    });
  } else if (item.DataLoadingError) {
    console.error(`Error loading ${item.Description}: ${item.DataLoadingError}`);
  }
});
```

### Cloning Data Contexts

```typescript
// Clone an existing data context
const clonedContext = await DataContext.Clone(
  originalContext,
  true,      // includeData - copies the data along with metadata
  userInfo   // contextUser
);

if (clonedContext) {
  console.log(`Cloned context ID: ${clonedContext.ID}`);
}
```

## API Reference

### DataContext Class

#### Properties

- `ID: string` - The unique identifier of the data context
- `DataContextEntity: DataContextEntity` - The metadata entity for the data context
- `Items: DataContextItem[]` - Array of data context items

#### Methods

- `async LoadMetadata(DataContextID: string, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<boolean>`
  - Loads only the metadata for the data context and its items

- `async LoadData(dataSource: any, forceRefresh?: boolean, loadRelatedDataOnSingleRecords?: boolean, maxRecordsPerRelationship?: number, contextUser?: UserInfo): Promise<boolean>`
  - Loads data for all items in the context

- `async Load(DataContextID: string, dataSource: any, forceRefresh?: boolean, loadRelatedDataOnSingleRecords?: boolean, maxRecordsPerRelationship?: number, contextUser?: UserInfo): Promise<boolean>`
  - Loads both metadata and data in one operation

- `async SaveItems(contextUser?: UserInfo, persistItemData?: boolean): Promise<boolean>`
  - Saves all data context items to the database

- `AddDataContextItem(): DataContextItem`
  - Creates and adds a new item to the context

- `ValidateDataExists(ignoreFailedLoadItems?: boolean): boolean`
  - Checks if all items have data loaded

- `ConvertToSimpleObject(itemPrefix?: string, includeFailedLoadItems?: boolean): any`
  - Converts the context to a simple object structure

- `CreateSimpleObjectTypeDefinition(itemPrefix?: string, includeFailedLoadItems?: boolean): string`
  - Generates TypeScript type definition for the data structure

- `LoadDataFromObject(data: any[][]): boolean`
  - Loads pre-fetched data into the context

- `static async Clone(context: DataContext, includeData?: boolean, contextUser?: UserInfo): Promise<DataContext>`
  - Creates a deep copy of a data context

- `static async FromRawData(rawData: any): Promise<DataContext>`
  - Creates a context from raw data object

### DataContextItem Class

#### Properties

- `Type: 'view' | 'query' | 'full_entity' | 'sql' | 'single_record'` - The type of data item
- `RecordID: string` - Primary key for single_record types
- `EntityID?: string` - Entity identifier
- `ViewID?: string` - View identifier
- `QueryID?: string` - Query identifier
- `RecordName: string` - Name of the view, query, or entity
- `SQL?: string` - SQL statement for 'sql' type
- `EntityName?: string` - Name of the entity
- `Fields: DataContextFieldInfo[]` - Field metadata
- `Data: any[]` - The loaded data
- `DataLoaded: boolean` - Indicates if data has been loaded
- `DataLoadingError?: string` - Error message if loading failed
- `Description: string` - Auto-generated description
- `AdditionalDescription?: string` - Optional custom description

#### Methods

- `async LoadData(dataSource: any, forceRefresh?: boolean, loadRelatedDataOnSingleRecords?: boolean, maxRecordsPerRelationship?: number, contextUser?: UserInfo): Promise<boolean>`
  - Loads data for this specific item

- `LoadDataFromObject(data: any[]): boolean`
  - Loads pre-fetched data into the item

- `ValidateDataExists(ignoreFailedLoad?: boolean): boolean`
  - Validates that data has been loaded

- `static FromViewEntity(viewEntity: UserViewEntityExtended): DataContextItem`
- `static FromSingleRecord(singleRecord: BaseEntity): DataContextItem`
- `static FromQuery(query: QueryInfo): DataContextItem`
- `static FromFullEntity(entity: EntityInfo): DataContextItem`
- `static FromRawItem(rawItem: any): DataContextItem`

### DataContextFieldInfo Class

```typescript
class DataContextFieldInfo {
  Name: string;
  Type: string;
  Description?: string;
}
```

## Server-Side Considerations

For SQL type data context items, you'll need to use the server-side implementation from `@memberjunction/data-context-server` which properly handles SQL execution with appropriate security and data source management.

## Dependencies

- `@memberjunction/global`: Core global utilities and class factory
- `@memberjunction/core-entities`: Entity definitions for MemberJunction
- `@memberjunction/core`: Core MemberJunction functionality

## Best Practices

1. **Always load metadata before data**: Use `LoadMetadata()` before `LoadData()` or simply use `Load()` which does both
2. **Handle loading errors**: Check `DataLoaded` and `DataLoadingError` properties on items
3. **Use appropriate data sources**: SQL type items require server-side data sources
4. **Consider performance**: Use `maxRecordsPerRelationship` to limit related data loading
5. **Validate before use**: Call `ValidateDataExists()` before processing data
6. **Use transactions**: When saving multiple items, they're automatically wrapped in a transaction

## License

ISC