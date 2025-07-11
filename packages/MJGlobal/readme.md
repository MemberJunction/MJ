# @memberjunction/global

Core global utilities and coordination library for MemberJunction applications. This package provides essential singleton management, class factory patterns, event coordination, and utility functions that are used throughout the MemberJunction ecosystem.

## Installation

```bash
npm install @memberjunction/global
```

## Overview

The `@memberjunction/global` library serves as the foundation for cross-component communication and coordination in MemberJunction applications. It provides:

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

// Clean and extract JSON from markdown or mixed content
const cleaned = CleanJSON('```json\n{"key": "value"}\n```');

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

### HTML Conversion

```typescript
import { ConvertMarkdownStringToHtmlList } from '@memberjunction/global';

// Convert markdown to HTML list
const html = ConvertMarkdownStringToHtmlList('Unordered', '- Item 1\n- Item 2\n- Item 3');
// Returns: <ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>
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

