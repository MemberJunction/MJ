# @memberjunction/core-entities

A comprehensive library of strongly-typed entity classes for MemberJunction's core metadata schema. This package provides type-safe access to all MemberJunction system entities with built-in validation, custom business logic, and seamless integration with the MemberJunction framework.

## Overview

The `@memberjunction/core-entities` package contains:
- **178+ Generated Entity Classes**: Strongly-typed TypeScript classes for all core MemberJunction entities
- **Extended Entity Classes**: Custom subclasses with specialized business logic
- **Resource Permission Engine**: Comprehensive permission management system
- **Zod Schema Validation**: Built-in runtime validation for all entity types
- **Type Definitions**: Full TypeScript type definitions for enhanced IDE support

## Installation

```bash
npm install @memberjunction/core-entities
```

## Key Features

### 1. Strongly-Typed Entity Classes
Every MemberJunction core entity has a corresponding TypeScript class with:
- Full type safety for all properties
- Automatic validation using Zod schemas
- Relationship navigation properties
- Built-in CRUD operations

### 2. Extended Entity Classes
Several entities have custom extended classes that provide additional functionality:

- **UserViewEntityExtended**: Enhanced view management with filter and column parsing
- **DashboardEntityExtended**: Dashboard configuration management
- **AIModelEntityExtended**: AI model utilities and helpers
- **AIPromptEntityExtended**: Prompt management functionality
- **ListDetailEntityExtended**: List view enhancements
- **ScheduledActionExtended**: Scheduled task management
- **ResourcePermissionEntity**: Resource access control

### 3. Resource Permission Engine
A sophisticated permission system for managing access to various resources:
- Role-based permissions
- Resource type definitions
- Permission inheritance
- Cached permission lookups

## Usage

### Basic Entity Usage

```typescript
import { Metadata } from '@memberjunction/core';
import { UserEntity, ApplicationEntity } from '@memberjunction/core-entities';

// Always use Metadata to create entity instances
const md = new Metadata();

// Load a user by ID
const user = await md.GetEntityObject<UserEntity>('Users');
await user.Load('user-id-here');

// Access strongly-typed properties
console.log(user.Email);
console.log(user.FirstName);

// Create a new application
const app = await md.GetEntityObject<ApplicationEntity>('Applications');
app.NewRecord();
app.Name = 'My New Application';
app.Description = 'A test application';
await app.Save();
```

### Working with User Views

```typescript
import { UserViewEntityExtended } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';

const md = new Metadata();

// Load user views for an entity
const rv = new RunView();
const views = await rv.RunView<UserViewEntityExtended>({
    EntityName: 'User Views',
    ExtraFilter: `EntityID='${entityId}' AND UserID='${userId}'`,
    ResultType: 'entity_object'
});

// Access parsed view configuration
const view = views.Results[0];
const columns = view.Columns; // Parsed column configuration
const filters = view.Filter;  // Parsed filter configuration
```

### Resource Permissions

```typescript
import { ResourcePermissionEngine } from '@memberjunction/core-entities';

// Get the singleton instance
const permEngine = ResourcePermissionEngine.Instance;

// Initialize the engine
await permEngine.Config();

// Check permissions for a resource
const permissions = permEngine.GetPermissionsForResource(
    resourceTypeId,
    resourceRecordId
);

// Get user's permission level
const userPermission = await permEngine.GetUserPermissionForResource(
    userId,
    resourceTypeId,
    resourceRecordId
);
```

### Dashboard Management

```typescript
import { DashboardEntityExtended } from '@memberjunction/core-entities';
import { Metadata } from '@memberjunction/core';

const md = new Metadata();

// Create a new dashboard
const dashboard = await md.GetEntityObject<DashboardEntityExtended>('Dashboards');
dashboard.NewRecord(); // Automatically sets default configuration

dashboard.Name = 'Sales Dashboard';
dashboard.Description = 'Monthly sales metrics';
await dashboard.Save();

// The UIConfigDetails is automatically initialized with default grid configuration
```

### AI Model Access

```typescript
import { AIModelEntityExtended } from '@memberjunction/core-entities';
import { RunView } from '@memberjunction/core';

const rv = new RunView();

// Load all active AI models
const models = await rv.RunView<AIModelEntityExtended>({
    EntityName: 'AI Models',
    ExtraFilter: "IsActive=1",
    OrderBy: 'Name',
    ResultType: 'entity_object'
});

// Use the extended functionality
models.Results.forEach(model => {
    console.log(model.APINameOrName); // Uses APIName if available, otherwise Name
});
```

## Entity Validation

All entities include Zod schema validation:

```typescript
import { UserSchema, UserEntityType } from '@memberjunction/core-entities';

// Validate data before creating entity
const userData: unknown = { /* user data */ };

try {
    const validatedData = UserSchema.parse(userData);
    // Data is now typed as UserEntityType
} catch (error) {
    // Handle validation errors
}
```

## Type Definitions

Every entity exports both the class and its TypeScript type:

```typescript
import { 
    ApplicationEntity,          // The entity class
    ApplicationEntityType,      // The TypeScript type
    ApplicationSchema          // The Zod schema
} from '@memberjunction/core-entities';

// Use types for function parameters
function processApplication(app: ApplicationEntityType) {
    // Type-safe access to all properties
}
```

## Custom Entity Extensions

To create your own entity extensions:

```typescript
import { RegisterClass } from '@memberjunction/global';
import { BaseEntity } from '@memberjunction/core';
import { YourEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseEntity, 'Your Entity Name')
export class YourEntityExtended extends YourEntity {
    // Add custom methods and properties
    public customMethod(): void {
        // Your business logic
    }
}
```

## Available Entities

This package includes classes for all core MemberJunction entities including:

- **System Entities**: Users, Applications, Entities, Entity Fields, etc.
- **Security**: Roles, Authorizations, User Roles, Resource Permissions
- **Communication**: Conversations, Templates, Communication Providers
- **Workflow**: Actions, Action Categories, Scheduled Actions
- **AI/ML**: AI Models, AI Prompts, Vector Databases
- **Reporting**: Reports, Dashboards, Query Fields
- **Integration**: Company Integrations, API Configurations
- **And 170+ more...**

## Dependencies

- `@memberjunction/core`: Core MemberJunction functionality
- `@memberjunction/global`: Global utilities and decorators
- `zod`: Runtime type validation

## Version Compatibility

This package is released in sync with MemberJunction core releases. Always use matching versions:

```json
{
  "dependencies": {
    "@memberjunction/core": "2.43.0",
    "@memberjunction/core-entities": "2.43.0",
    "@memberjunction/global": "2.43.0"
  }
}
```

## Best Practices

1. **Always use Metadata for entity creation**: Never instantiate entity classes directly
2. **Use RunView for bulk operations**: More efficient than loading entities individually
3. **Leverage TypeScript types**: Use the exported types for function parameters and return types
4. **Handle validation errors**: Always wrap entity operations in try-catch blocks
5. **Use extended classes**: When available, use the extended versions for additional functionality

## Contributing

This package is generated from MemberJunction metadata. To modify:

1. Update the source metadata in MemberJunction
2. Run the code generation process
3. Custom extensions can be added to the `/src/custom` directory

## License

ISC - See LICENSE file for details

## Support

For issues, questions, or contributions, please visit the [MemberJunction GitHub repository](https://github.com/MemberJunction/MJ).