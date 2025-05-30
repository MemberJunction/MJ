# @memberjunction/global

Core global utilities and coordination library for MemberJunction applications. This package provides essential singleton management, class factory patterns, event coordination, and utility functions that are used throughout the MemberJunction ecosystem.

## Installation

```bash
npm install @memberjunction/global
```

## Overview

The `@memberjunction/global` library serves as the foundation for cross-component communication and coordination in MemberJunction applications. It provides:

- **Global Singleton Management** - Ensures true singleton instances across module boundaries
- **Class Factory System** - Dynamic class registration and instantiation with inheritance support
- **Event System** - RxJS-based event bus for component communication
- **Object Caching** - In-memory object cache for application lifetime
- **Utility Functions** - Common string manipulation, JSON parsing, and formatting utilities

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

Register and instantiate classes dynamically with support for inheritance and key-based selection.

```typescript
import { RegisterClass, MJGlobal } from '@memberjunction/global';

// Define a base class
class BaseProcessor {
  process(data: any): void {
    console.log('Base processing');
  }
}

// Register a subclass using the decorator
@RegisterClass(BaseProcessor, 'custom', 100)
class CustomProcessor extends BaseProcessor {
  process(data: any): void {
    console.log('Custom processing');
  }
}

// Create instances via the factory
const factory = MJGlobal.Instance.ClassFactory;
const processor = factory.CreateInstance<BaseProcessor>(BaseProcessor, 'custom');
processor.process(data); // Uses CustomProcessor
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
import { CleanJSON, SafeJSONParse } from '@memberjunction/global';

// Clean and extract JSON from markdown or mixed content
const cleaned = CleanJSON('```json\n{"key": "value"}\n```');

// Safe JSON parsing with error handling
const parsed = SafeJSONParse<MyType>('{"key": "value"}', true);
```

### HTML Conversion

```typescript
import { ConvertMarkdownStringToHtmlList } from '@memberjunction/global';

// Convert markdown to HTML list
const html = ConvertMarkdownStringToHtmlList('Unordered', '- Item 1\n- Item 2\n- Item 3');
// Returns: <ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>
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

## Advanced Usage

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

### Global Properties

Store and retrieve global properties:

```typescript
const properties = MJGlobal.Instance.Properties;
properties.push({
  key: 'apiEndpoint',
  value: 'https://api.example.com'
});
```

## Integration with MemberJunction

This package is a core dependency for most MemberJunction packages. It provides the foundation for:

- Entity registration and instantiation
- Cross-component event communication
- Singleton service management
- Global state coordination

When building MemberJunction applications or extensions, use this package to ensure proper integration with the framework's architecture.

## TypeScript Support

This package is written in TypeScript and includes full type definitions. All exports are properly typed for excellent IDE support and compile-time type checking.

## Dependencies

- **rxjs** (^7.8.1) - For reactive event handling

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

