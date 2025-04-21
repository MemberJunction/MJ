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

## Installation

This package is typically used as an internal dependency within MemberJunction applications and is not meant to be installed directly. However, if you need to install it separately:

```bash
npm install mj_generatedentities
```

## Dependencies

- `@memberjunction/core`: Core MemberJunction functionality
- `@memberjunction/global`: Global utilities and constants
- `zod`: Schema validation library

## Usage

### Loading Generated Entities

```typescript
import { UserEntity, EntityEntity, RoleEntity } from 'mj_generatedentities';
import { BaseEntity, EntityInfo } from '@memberjunction/core';

// Get metadata
const metadata = new EntityInfo();
await metadata.init();

// Create a new instance of a generated entity
const user = new UserEntity();
```

### Working with Entity Classes

```typescript
import { UserEntity } from 'mj_generatedentities';
import { LogError } from '@memberjunction/core';

async function getUserById(userId: number): Promise<UserEntity | null> {
  try {
    const user = new UserEntity();
    const loaded = await user.load(userId);
    
    if (loaded) {
      return user;
    } else {
      return null;
    }
  } catch (error) {
    LogError(`Error loading user ${userId}: ${error}`);
    return null;
  }
}

async function updateUser(userId: number, email: string, firstName: string, lastName: string) {
  const user = await getUserById(userId);
  
  if (user) {
    // Type-safe property access
    user.Email = email;
    user.FirstName = firstName;
    user.LastName = lastName;
    
    // Save changes
    const result = await user.save();
    return result.success;
  }
  
  return false;
}
```

### Entity Relationships

```typescript
import { UserEntity, RoleEntity } from 'mj_generatedentities';

async function getUserWithRoles(userId: number) {
  const user = new UserEntity();
  await user.load(userId);
  
  // Load related entity data
  const roles = await user.getRelatedEntities('Role') as RoleEntity[];
  
  return {
    user,
    roles
  };
}
```

### Extending Generated Entities

You can extend the generated entities with custom business logic:

```typescript
import { UserEntity } from 'mj_generatedentities';

class ExtendedUserEntity extends UserEntity {
  // Add custom methods
  async isAdmin(): Promise<boolean> {
    const roles = await this.getRelatedEntities('Role');
    return roles.some(role => role.Name === 'Administrator');
  }
  
  // Add custom validation
  override async validateEntity(): Promise<boolean> {
    // Call base validation first
    const isValid = await super.validateEntity();
    
    if (!isValid) return false;
    
    // Add custom validation
    if (this.Email && !this.Email.includes('@')) {
      this._addValidationError('Email', 'Email must contain @ symbol');
      return false;
    }
    
    return true;
  }
}
```

### Zod Schema Validation

Generated entities use Zod for schema validation:

```typescript
import { UserEntity } from 'mj_generatedentities';

async function validateUserData(userData: unknown) {
  // Get the Zod schema for the User entity
  const userSchema = UserEntity.zodSchema;
  
  // Validate the data
  const result = userSchema.safeParse(userData);
  
  if (result.success) {
    // Data is valid
    const user = new UserEntity();
    user.loadFromData(result.data);
    await user.save();
    return true;
  } else {
    // Data is invalid
    console.error('Validation errors:', result.error.format());
    return false;
  }
}
```

## Entity Base Class Methods

All generated entities inherit from `BaseEntity` and provide these key methods:

| Method | Description |
|--------|-------------|
| `load(id)` | Loads an entity by its primary key |
| `loadFromData(data)` | Populates entity from a data object |
| `save()` | Saves changes to the database |
| `delete()` | Deletes the entity from the database |
| `getRelatedEntities(entityName)` | Gets related entities |
| `validateEntity()` | Validates the entity before saving |
| `getFieldList()` | Gets a list of fields for the entity |
| `getFieldValue(fieldName)` | Gets the value of a specific field |
| `setFieldValue(fieldName, value)` | Sets the value of a specific field |

## Development

This package is intended to be automatically maintained by MemberJunction's code generation tools. Manual changes to the generated files are not recommended as they will be overwritten during the next code generation cycle.

To trigger code generation:

```bash
npm run codegen
```

## License

ISC