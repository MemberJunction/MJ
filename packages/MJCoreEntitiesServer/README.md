# MemberJunction Core Entities Server

Server-side entity subclasses for MemberJunction that provide extended functionality and business logic for core entities when running in a Node.js environment.

## Overview

This package contains server-side implementations of MemberJunction entity subclasses that require server-specific functionality such as:
- Direct database access
- File system operations
- Server-side API integrations
- Complex business logic that should only run on the server
- Automatic creation/management of related entities

## Purpose

While the base `@memberjunction/core-entities` package provides entity classes that work in any JavaScript environment (browser or server), some entity operations require server-specific capabilities. This package provides those extended implementations.

### Key Differences from Core Entities

- **Core Entities**: Work everywhere, basic CRUD operations, suitable for client-side usage
- **Core Entities Server**: Server-only, extended functionality, can directly interact with system resources

## Installation

```bash
npm install @memberjunction/core-entities-server
```

## Usage

### Basic Setup

```typescript
import { LoadCoreEntitiesServerSubClasses } from '@memberjunction/core-entities-server';

// Load all server-side entity subclasses at application startup
LoadCoreEntitiesServerSubClasses();
```

**Important**: Call `LoadCoreEntitiesServerSubClasses()` early in your application initialization to ensure the server-side subclasses are registered with the MemberJunction metadata system before any entities are instantiated.

### Example: AI Prompt Entity

The package includes an extended AI Prompt entity that automatically manages Template and Template Contents records:

```typescript
import { Metadata } from '@memberjunction/core';

// The metadata system will automatically use the server-side subclass
const md = new Metadata();
const aiPrompt = await md.GetEntityObject<AIPromptEntity>('AI Prompts');

// Setting TemplateText will automatically create/update Template records
aiPrompt.TemplateText = `You are a helpful assistant...`;

// Save will handle all the Template management automatically
await aiPrompt.Save();
```

## Available Server-Side Entities

### AIPromptEntityExtendedServer

Extends the base AI Prompt entity with automatic Template management:

- **Virtual Property**: `TemplateText` - A convenient way to get/set the prompt template content
- **Automatic Template Creation**: Creates Template and Template Contents records when saving
- **Automatic Template Updates**: Updates existing templates when content changes
- **Proper Relationship Management**: Maintains proper foreign key relationships

## Architecture

### Entity Registration

The package uses MemberJunction's entity subclassing system:

1. At startup, `LoadCoreEntitiesServerSubClasses()` is called
2. This registers all server-side entity subclasses with the metadata system
3. When code requests an entity (e.g., "AI Prompts"), the metadata system returns the server-side subclass
4. The server-side subclass extends the base entity with additional functionality

### Virtual Properties

Server-side entities can expose virtual properties that don't exist in the database but provide convenient access to complex data:

```typescript
export class AIPromptEntityExtendedServer extends AIPromptEntity {
    private _TemplateText?: string;

    get TemplateText(): string | undefined {
        return this._TemplateText;
    }

    set TemplateText(value: string | undefined) {
        this._TemplateText = value;
    }
}
```

## Development Guidelines

### Creating New Server-Side Entities

1. Create a new file in `src/custom/`
2. Import and extend the base entity class
3. Add server-specific functionality
4. Register the subclass in the loader

Example:

```typescript
import { BaseEntity, RegisterClass } from '@memberjunction/core';
import { UserEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseEntity, 'Users')
export class UserEntityExtendedServer extends UserEntity {
    async BeforeSave(): Promise<boolean> {
        // Server-side validation or processing
        if (this.Email) {
            // Verify email domain against company whitelist
            const validDomain = await this.checkEmailDomain(this.Email);
            if (!validDomain) {
                throw new Error('Invalid email domain');
            }
        }
        return super.BeforeSave();
    }

    private async checkEmailDomain(email: string): Promise<boolean> {
        // Server-side logic to validate email domain
        return true;
    }
}
```

### Best Practices

1. **Keep It Server-Side**: Only include code that must run on the server
2. **Extend, Don't Replace**: Always extend the base entity class, don't replace core functionality
3. **Handle Errors Gracefully**: Server-side operations can fail - handle errors appropriately
4. **Document Virtual Properties**: Clearly document any virtual properties and their behavior
5. **Test Thoroughly**: Server-side logic can be complex - ensure comprehensive testing

## Integration with Other MJ Packages

This package works seamlessly with:

- `@memberjunction/core`: Provides the base entity system
- `@memberjunction/core-entities`: Provides the base entity classes
- `@memberjunction/server`: Can be used in MJ server applications
- `@memberjunction/cli`: Used by CLI tools like MetadataSync

## Common Use Cases

### 1. Automatic Related Entity Management
```typescript
// AI Prompts automatically manage their Template records
const prompt = await md.GetEntityObject<AIPromptEntity>('AI Prompts');
prompt.TemplateText = "New prompt content";
await prompt.Save(); // Template and Template Contents created/updated automatically
```

### 2. Server-Side Validation
```typescript
@RegisterClass(BaseEntity, 'Documents')
export class DocumentEntityServer extends DocumentEntity {
    async BeforeSave(): Promise<boolean> {
        // Scan document for viruses using server-side scanner
        if (this.Content) {
            const isSafe = await virusScanner.scan(this.Content);
            if (!isSafe) {
                throw new Error('Document failed security scan');
            }
        }
        return super.BeforeSave();
    }
}
```

### 3. Complex Business Logic
```typescript
@RegisterClass(BaseEntity, 'Orders')
export class OrderEntityServer extends OrderEntity {
    async AfterSave(): Promise<boolean> {
        // Send order to fulfillment system
        await fulfillmentAPI.submitOrder(this);
        
        // Update inventory
        await inventorySystem.decrementStock(this.OrderItems);
        
        return super.AfterSave();
    }
}
```

## Troubleshooting

### Entity subclass not being used
Ensure `LoadCoreEntitiesServerSubClasses()` is called before any entity instantiation.

### Module loading errors
This package uses CommonJS. Ensure your Node.js application is configured to handle CommonJS modules.

### Virtual properties not persisting
Virtual properties are not saved to the database. Use them as convenient accessors that manage real database fields behind the scenes.

## Future Enhancements

- Additional server-side entity implementations
- Integration with file storage providers
- Advanced caching mechanisms
- Batch processing utilities
- Background job integration

## Contributing

When contributing new server-side entities:

1. Follow the existing patterns
2. Document all virtual properties
3. Include comprehensive tests
4. Ensure no client-side dependencies
5. Update this README with new entities

## License

This package is part of the MemberJunction open-source project.