# MemberJunction Documentation Utilities

A TypeScript library for dynamically retrieving, parsing, and caching MemberJunction library documentation from the official documentation website to support AI models and other documentation-driven features.

## Overview

The `@memberjunction/doc-utils` package provides functionality for accessing the official MemberJunction documentation. It fetches documentation from the MemberJunction documentation site (https://memberjunction.github.io/MJ/), parses the HTML content, and caches library documentation in memory for improved performance. This library is particularly useful when integrating with AI models that need context about the MemberJunction system's libraries and their components.

## Installation

```bash
npm install @memberjunction/doc-utils
```

## Dependencies

This package depends on the following MemberJunction packages:
- `@memberjunction/core` - Core functionality and base classes
- `@memberjunction/core-entities` - Entity definitions
- `@memberjunction/global` - Global utilities and decorators

External dependencies:
- `jsdom` - For HTML parsing
- `axios` - For HTTP requests

## Main Features

- **Library Documentation Retrieval**: Dynamically fetch documentation for MemberJunction libraries and their items
- **HTML Content Parsing**: Extract relevant content from HTML documentation pages
- **Automatic URL Generation**: Constructs documentation URLs based on library and item metadata
- **Extended Entity Classes**: Provides extended functionality for Library and Library Item entities
- **Singleton Pattern**: Easy access to documentation functionality throughout your application
- **Type-aware URL Routing**: Automatically routes to correct documentation sections based on item type (Class, Interface, Function, etc.)

## Usage

### Basic Example

```typescript
import { DocumentationEngine } from '@memberjunction/doc-utils';
import { UserInfo } from '@memberjunction/core';

// Get the singleton instance
const docEngine = DocumentationEngine.Instance;

// Configure the engine (required before using)
const user = new UserInfo(); // Or get from your authentication context
await docEngine.Config(false, user);

// Access libraries and their documentation
const libraries = docEngine.Libraries;
console.log(`Found ${libraries.length} libraries`);

// Access specific library items
const coreLibrary = libraries.find(lib => lib.Name === '@memberjunction/core');
if (coreLibrary) {
    console.log(`Library: ${coreLibrary.Name}`);
    console.log(`Items: ${coreLibrary.Items.length}`);
    
    // Access documentation for specific items
    coreLibrary.Items.forEach(item => {
        console.log(`${item.Type}: ${item.Name}`);
        console.log(`URL: ${item.URL}`);
        console.log(`Content Preview: ${item.HTMLContent.substring(0, 200)}...`);
    });
}
```

### Working with Library Items

```typescript
import { DocumentationEngine } from '@memberjunction/doc-utils';

async function displayLibraryItemInfo(libraryName: string, itemName: string) {
    const docEngine = DocumentationEngine.Instance;
    await docEngine.Config();
    
    // Find all library items
    const libraryItems = docEngine.LibraryItems;
    
    // Find specific item
    const item = libraryItems.find(i => 
        i.Library === libraryName && i.Name === itemName
    );
    
    if (item) {
        console.log(`Item: ${item.Name}`);
        console.log(`Type: ${item.Type}`);
        console.log(`Library: ${item.Library}`);
        console.log(`Documentation URL: ${item.URL}`);
        console.log(`HTML Content Available: ${item.HTMLContent ? 'Yes' : 'No'}`);
    }
}

// Example usage
await displayLibraryItemInfo('@memberjunction/core', 'BaseEntity');
```

### Force Refresh Documentation

```typescript
import { DocumentationEngine } from '@memberjunction/doc-utils';

// Force refresh to reload documentation from the database and website
const docEngine = DocumentationEngine.Instance;
await docEngine.Config(true); // true forces a refresh
```

## API Reference

### DocumentationEngine

The main class that provides access to documentation functionality. Extends `BaseEngine` from `@memberjunction/core`.

#### Properties

- `Instance` (static): Returns the singleton instance of DocumentationEngine
- `Libraries`: Array of `LibraryEntityExtended` objects containing all loaded libraries
- `LibraryItems`: Array of `LibraryItemEntityExtended` objects containing all library items

#### Methods

- `Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void>`
  - Configures the documentation engine and loads metadata
  - Parameters:
    - `forceRefresh`: If true, forces reload of metadata from database
    - `contextUser`: User context for server-side execution
    - `provider`: Optional metadata provider

### LibraryEntityExtended

Extended entity class for libraries with documentation capabilities.

#### Properties

- All properties from `LibraryEntity`
- `Items`: Array of `LibraryItemEntityExtended` objects belonging to this library

### LibraryItemEntityExtended

Extended entity class for library items with documentation capabilities.

#### Properties

- All properties from `LibraryItemEntity`
- `URL`: The generated documentation URL for this item
- `HTMLContent`: The parsed HTML content from the documentation
- `TypeURLSegment`: Returns the URL segment based on item type (classes, interfaces, functions, etc.)

#### Supported Item Types

- Class → `/classes/`
- Interface → `/interfaces/`
- Function → `/functions/`
- Module → `/modules/`
- Type → `/types/`
- Variable → `/variables/`

## Integration with MemberJunction

This package integrates seamlessly with the MemberJunction ecosystem:

1. **Entity System**: Uses MemberJunction's entity system for Library and Library Items metadata
2. **Base Engine Pattern**: Extends BaseEngine for consistent configuration and loading patterns
3. **Global Registration**: Uses `@RegisterClass` decorator for proper entity registration
4. **User Context**: Supports MemberJunction's user context for server-side execution

## Build and Development

```bash
# Build the package
npm run build

# Run in development mode with hot reload
npm start

# Run tests (when implemented)
npm test
```

## Notes

- The documentation engine fetches content from https://memberjunction.github.io/MJ/
- Documentation is cached in memory after initial load for performance
- The engine automatically constructs URLs based on library names and item types
- Library names with special characters (@, ., /, \) are sanitized for URL compatibility

## License

ISC