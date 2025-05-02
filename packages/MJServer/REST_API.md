# MemberJunction REST API

In addition to the GraphQL API, MemberJunction provides a REST API for applications that prefer a RESTful architecture. This API provides standard CRUD operations on entities along with additional functionality such as views, metadata access, and user operations.

## Enabling the REST API

By default, the REST API is eanbled. 
You can disable it by adding the following to your `mj.config.cjs` file:

```javascript
restApiOptions: {
  enabled: false,
  // Optional entity and schema filtering
}
```

Or by setting the environment variable `REST_API_ENABLED=false`.

## Security Configuration

The REST API uses the same authentication mechanisms as the GraphQL API, but adds an additional layer of security by allowing you to explicitly control which entities are accessible. This is especially important for sensitive data or internal-use-only entities.

### Entity-Level Access Control

You can control which entities are accessible through the REST API using include/exclude lists:

```javascript
restApiOptions: {
  enabled: true,
  // Allow only specific entities
  includeEntities: ['Users', 'Entity*', 'Entity Fields'],
  // Always exclude sensitive entities (takes precedence over includeEntities)
  excludeEntities: ['Password', 'APIKey*', 'Credential'],
}
```

The entity filtering supports wildcards:
- `User*` matches all entities that start with "User" (e.g., "User", "UserRole", "UserFavorite")
- `*Log` matches all entities that end with "Log" (e.g., "ErrorLog", "ActivityLog", "SystemLog")
- `*Change*` matches all entities that contain "Change" (e.g., "ChangeRequest", "RecordChangeLog")

### Schema-Level Access Control

You can also control access at the schema level, which is useful for including or excluding entire categories of entities:

```javascript
restApiOptions: {
  enabled: true,
  // Only allow entities from these schemas
  includeSchemas: ['public', 'CRM'],
  // Always exclude these schemas (takes precedence over includeSchemas)
  excludeSchemas: ['internal', 'security'],
}
```

Access control precedence (from highest to lowest):
1. excludeSchemas: Entities in excluded schemas are never accessible
2. excludeEntities: Explicitly excluded entities are never accessible
3. includeSchemas: If specified, only entities from listed schemas are accessible
4. includeEntities: If specified, only listed entities are accessible
5. Default: If no filters are specified, all entities are accessible

## Configuration via Environment Variables

The REST API can also be configured using environment variables:

| Env variable             | Description                                                  |
| ------------------------ | ------------------------------------------------------------ |
| REST_API_ENABLED         | Enable/disable the REST API (default: true)                  |
| REST_API_INCLUDE_ENTITIES| Comma-separated list of entities to include                  |
| REST_API_EXCLUDE_ENTITIES| Comma-separated list of entities to exclude                  |
| REST_API_INCLUDE_SCHEMAS | Comma-separated list of schemas to include                   |
| REST_API_EXCLUDE_SCHEMAS | Comma-separated list of schemas to exclude                   |

## API Endpoints

The REST API provides the following endpoint groups:

### Entity Operations

- `GET /rest/entities/:entityName` - List entities with optional filtering
- `POST /rest/entities/:entityName` - Create a new entity
- `GET /rest/entities/:entityName/:id` - Get a specific entity by ID
- `PUT /rest/entities/:entityName/:id` - Update an entity
- `DELETE /rest/entities/:entityName/:id` - Delete an entity
- `GET /rest/entities/:entityName/:id/changes` - Get record change history
- `GET /rest/entities/:entityName/:id/dependencies` - Get record dependencies
- `GET /rest/entities/:entityName/:id/name` - Get entity record name

### View Operations

- `POST /rest/views/:entityName` - Run a view for an entity
- `POST /rest/views/batch` - Run multiple views in a batch
- `GET /rest/views/entity` - Get entity for a view
- `GET /rest/views/:entityName/metadata` - Get views metadata for an entity

### Metadata Operations

- `GET /rest/metadata/entities` - Get metadata for all accessible entities
- `GET /rest/metadata/entities/:entityName` - Get field metadata for a specific entity

### User Operations

- `GET /rest/users/current` - Get the current user
- `GET /rest/users/:userId/favorites/:entityName/:id` - Get favorite status for a record
- `PUT /rest/users/:userId/favorites/:entityName/:id` - Set favorite status for a record
- `DELETE /rest/users/:userId/favorites/:entityName/:id` - Remove favorite status for a record

### Transaction Operations

- `POST /rest/transactions` - Execute a transaction

### Reports and Queries

- `GET /rest/reports/:reportId` - Run a report
- `POST /rest/queries/run` - Run a query

## Examples

### List Entities with Filtering

```http
GET /rest/entities/User?filter=IsAdmin=true&orderBy=LastName&maxRows=10
```

### Create a New Entity

```http
POST /rest/entities/Contact
Content-Type: application/json

{
  "FirstName": "John",
  "LastName": "Smith",
  "Email": "john.smith@example.com",
  "Status": "Active"
}
```

### Run a View

```http
POST /rest/views/User
Content-Type: application/json

{
  "ExtraFilter": "LastName LIKE 'S%'",
  "OrderBy": "LastName, FirstName",
  "Fields": ["ID", "FirstName", "LastName", "Email"],
  "MaxRows": 50
}
```

### Get Entity Metadata

```http
GET /rest/metadata/entities/User
```

### Update an Entity

```http
PUT /rest/entities/Contact/12345
Content-Type: application/json

{
  "LastName": "Smith-Jones",
  "JobTitle": "Software Developer"
}
```

### Batch View Execution

```http
POST /rest/views/batch
Content-Type: application/json

{
  "params": [
    {
      "EntityName": "User",
      "ExtraFilter": "IsAdmin=true",
      "MaxRows": 10
    },
    {
      "EntityName": "UserRole",
      "OrderBy": "Name"
    }
  ]
}
```

## Best Practices

1. **Use exclude lists for sensitive entities** to ensure they're never accidentally exposed.
2. **Consider using schema-level filtering** for broad access control.
3. **Use wildcards carefully** as they can accidentally expose more entities than intended.
4. **Regularly audit your REST API configuration** to ensure it adheres to your security requirements.