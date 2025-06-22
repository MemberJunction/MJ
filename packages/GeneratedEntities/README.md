# MemberJunction Generated Entities

This package contains automatically generated TypeScript entity classes that provide strongly-typed representations of database tables in the MemberJunction ecosystem.

## Overview

`mj_generatedentities` contains entity subclasses that are generated and maintained by MemberJunction's code generation system. These entities map directly to database tables and views, providing type-safe access to your data while abstracting away the complexity of data access.

Key features:
- **Type-safe data access**: All entity properties are strongly typed to match database columns
- **Generated code**: Automatically maintained by MemberJunction to stay in sync with database schema
- **Schema validation**: Uses Zod for runtime validation of entity data
- **Extensible**: Base classes for extending with custom business logic
- **MemberJunction integration**: Works seamlessly with MemberJunction's data context and API
- **Webpack tree-shaking support**: Includes `LoadGeneratedEntities()` function to ensure proper bundling

## Installation

This package is a private package used internally within MemberJunction applications:

```bash
# Within the MemberJunction monorepo workspace
npm install
```

Note: This package is marked as private (`"private": true`) in package.json and is not published to npm.

## Dependencies

- `@memberjunction/core` (v2.43.0): Core MemberJunction functionality including BaseEntity
- `@memberjunction/global` (v2.43.0): Global utilities and constants
- `zod` (v3.23.8): Schema validation library

## Package Structure

```
mj_generatedentities/
├── src/
│   ├── index.ts                    # Main export file
│   ├── generated/
│   │   └── entity_subclasses.ts    # Auto-generated entity classes
│   └── demo/
│       └── demoContactEntitySubclass.ts  # Example of extending entities
├── dist/                           # Compiled JavaScript output
├── package.json
├── tsconfig.json
└── README.md
```

## Usage

### Important: MemberJunction Entity Creation Pattern

**Never directly instantiate entity classes**. Always use the Metadata system to ensure proper class registration:

```typescript
import { Metadata } from '@memberjunction/core';

// ❌ Wrong - bypasses MJ class system
const entity = new UserEntity();

// ✅ Correct - uses MJ metadata system
const md = new Metadata();
const entity = await md.GetEntityObject<UserEntity>('Users');
```

### Loading Generated Entities for Webpack

To ensure generated entities are included in webpack builds (avoiding tree-shaking issues):

```typescript
import { LoadGeneratedEntities } from 'mj_generatedentities';

// Call this function early in your application initialization
LoadGeneratedEntities();
```

### Working with Entity Classes

```typescript
import { Metadata, RunView } from '@memberjunction/core';

// Load a single entity by ID
async function getUserById(userId: string): Promise<UserEntity | null> {
  const md = new Metadata();
  const user = await md.GetEntityObject<UserEntity>('Users');
  
  if (await user.Load(userId)) {
    return user;
  }
  return null;
}

// Load multiple entities with RunView
async function getActiveUsers(): Promise<UserEntity[]> {
  const rv = new RunView();
  const result = await rv.RunView<UserEntity>({
    EntityName: 'Users',
    ExtraFilter: `IsActive = 1`,
    OrderBy: 'CreatedAt DESC',
    ResultType: 'entity_object'  // Returns entity objects, not raw data
  });
  
  return result.Results;
}

// Update an entity
async function updateUser(userId: string, updates: Partial<UserEntity>): Promise<boolean> {
  const md = new Metadata();
  const user = await md.GetEntityObject<UserEntity>('Users');
  
  if (await user.Load(userId)) {
    // Apply updates
    Object.assign(user, updates);
    
    // Save changes
    const result = await user.Save();
    return result.Success;
  }
  
  return false;
}
```

### Entity Relationships

```typescript
import { Metadata, RunView } from '@memberjunction/core';

async function getUserWithRoles(userId: string) {
  const md = new Metadata();
  const user = await md.GetEntityObject<UserEntity>('Users');
  
  if (await user.Load(userId)) {
    // Load related entities using RunView
    const rv = new RunView();
    const rolesResult = await rv.RunView<RoleEntity>({
      EntityName: 'User Roles',
      ExtraFilter: `UserID = '${userId}'`,
      ResultType: 'entity_object'
    });
    
    return {
      user,
      roles: rolesResult.Results
    };
  }
  
  return null;
}
```

### Extending Generated Entities

You can extend the generated entities with custom business logic. Use the `@RegisterClass` decorator to ensure proper registration:

```typescript
import { RegisterClass } from '@memberjunction/global';
import { BaseEntity } from '@memberjunction/core';

// Example from demo/demoContactEntitySubclass.ts
@RegisterClass(BaseEntity, 'Contacts', 1)
export class ContactEntity extends ContactBaseEntity {
  // Override property getters/setters (must override both)
  get FirstName(): string {
    console.log("Getting FirstName from subclass");
    return super.FirstName;
  }
  
  set FirstName(value: string) {
    super.FirstName = value;
    console.log("Setting FirstName from subclass");
  }
  
  // Add custom methods
  async getFullName(): Promise<string> {
    return `${this.FirstName} ${this.LastName}`;
  }
  
  // Add custom validation
  override async Validate(): Promise<ValidationResult> {
    const result = await super.Validate();
    
    if (this.Email && !this.Email.includes('@')) {
      result.Success = false;
      result.Errors.push({
        Source: 'Email',
        Message: 'Email must contain @ symbol',
        Type: ValidationErrorType.Failure
      });
    }
    
    return result;
  }
}
```

### Important Notes on Extending Entities

1. **Always use `@RegisterClass` decorator** to register your subclass with MemberJunction
2. **When overriding property getters/setters**, you MUST override both getter and setter
3. **Call super methods** when overriding to maintain base functionality
4. **Version parameter** in `@RegisterClass` allows for entity versioning

### Zod Schema Validation

Generated entities use Zod for schema validation:

```typescript
import { z } from 'zod';

// Each generated entity includes a Zod schema
const userSchema = z.object({
  ID: z.string(),
  FirstName: z.string(),
  LastName: z.string(),
  Email: z.string().email(),
  IsActive: z.boolean(),
  CreatedAt: z.date(),
  UpdatedAt: z.date()
});

// Validate data before creating entities
async function createUserFromData(userData: unknown) {
  const result = userSchema.safeParse(userData);
  
  if (result.success) {
    const md = new Metadata();
    const user = await md.GetEntityObject<UserEntity>('Users');
    await user.LoadFromData(result.data);
    
    const saveResult = await user.Save();
    return saveResult.Success;
  } else {
    console.error('Validation errors:', result.error.format());
    return false;
  }
}
```

## Entity Base Class Methods

All generated entities inherit from `BaseEntity` and provide these key methods:

| Method | Description |
|--------|-------------|
| `Load(id: CompositeKey)` | Loads an entity by its primary key |
| `LoadFromData(data: any)` | Populates entity from a data object |
| `Save(options?: EntitySaveOptions)` | Saves changes to the database |
| `Delete()` | Deletes the entity from the database |
| `Validate()` | Validates the entity, returns ValidationResult |
| `GetFieldValue(fieldName: string)` | Gets the value of a specific field |
| `SetFieldValue(fieldName: string, value: any)` | Sets the value of a specific field |
| `TransactionMode` | Property to control transaction behavior |

## Build Scripts

```bash
# Build the package
npm run build

# Development mode with auto-reload
npm run start

# Run tests (not implemented yet)
npm test
```

## Code Generation

This package is automatically maintained by MemberJunction's code generation system. The `entity_subclasses.ts` file is generated based on your database schema.

**Important**: Do not manually edit files in the `generated/` directory as they will be overwritten during the next code generation cycle.

To regenerate entities:
1. Ensure your database schema is up to date
2. Run the MemberJunction code generation tool from the appropriate package
3. The generated files will be automatically updated

## Development Notes

- The package includes TypeScript declaration files (`*.d.ts`) in the dist folder
- Source maps are generated for debugging
- The `loadModule` export in entity_subclasses.ts ensures the module is valid even when empty
- Use the demo file as a reference for creating custom entity subclasses

## License

ISC