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
- **Warning Manager** - Smart warning system with debouncing, batching, and session tracking
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

### Warning Manager

The Warning Manager provides intelligent warning batching and deduplication for console messages across your application. It tracks warnings per session, groups them by type, and displays them in clean, formatted output after a configurable debounce period.

#### Features

- **Session-level tracking** - Each warning shown only once per session
- **Debounced output** - Groups warnings and displays after a configurable quiet period (default 10s)
- **Multiple warning types** - Supports deprecation warnings and data integrity warnings
- **Beautiful formatting** - Tree-structured console output with emojis and clear grouping
- **Configurable** - Runtime API and environment variables for customization
- **Backward compatible** - `DeprecationWarningManager` alias provided

#### Basic Usage

```typescript
import { WarningManager } from '@memberjunction/global';

const wm = WarningManager.Instance;

// Record deprecation warnings
wm.RecordEntityDeprecationWarning('LegacyEntity', 'MyComponent::method');
wm.RecordFieldDeprecationWarning('Users', 'OldField', 'DataLoader::process');

// Record field-not-found warnings (data integrity issues)
wm.RecordFieldNotFoundWarning('Users', 'DeletedColumn', 'BaseEntity::SetMany during import');

// Warnings are automatically batched and displayed after debounce period
// Or manually flush immediately:
wm.FlushWarnings();
```

#### Example Output

```
⚠️  DEPRECATION WARNINGS - The following entities/fields are deprecated and may be removed in future versions:

📦 DEPRECATED ENTITIES:
  • "LegacyEntity" (called from: MyComponent::method)

📋 DEPRECATED ENTITY FIELDS:
  └─ "Users"
     └─ OldField (called from: DataLoader::process)

💡 Set ShowAll=true in configuration to see every occurrence.


⚠️  DATA INTEGRITY WARNINGS - The following fields were not found in entity definitions:

📋 MISSING FIELDS:
  └─ "Users"
     └─ DeletedColumn (context: BaseEntity::SetMany during import)

💡 These fields exist in your data but not in the entity schema. This may indicate:
   • Schema is out of sync with database
   • Data contains legacy fields that were removed
   • Field names have been changed
```

#### Configuration

Configure via runtime API:

```typescript
wm.UpdateConfig({
  DebounceMs: 5000,        // Wait 5 seconds after last warning
  ShowAll: false,          // Show each warning once per session (default)
  DisableWarnings: false,  // Enable warnings (default)
  GroupWarnings: true      // Group warnings in tree format (default)
});

// Get current configuration
const config = wm.GetConfig();
```

All configuration is done via the runtime API.

#### Warning Types

**Deprecation Warnings** indicate entities or fields that may be removed in future versions:
- `RecordEntityDeprecationWarning(entityName, callerName)` - Deprecated entity
- `RecordFieldDeprecationWarning(entityName, fieldName, callerName)` - Deprecated field

**Data Integrity Warnings** indicate mismatches between data and schema:
- `RecordFieldNotFoundWarning(entityName, fieldName, context)` - Field exists in data but not in schema

#### Advanced Usage

```typescript
// Reset all tracking (useful for testing)
wm.Reset();

// Backward compatibility - DeprecationWarningManager is an alias
import { DeprecationWarningManager } from '@memberjunction/global';
const dwm = DeprecationWarningManager.Instance; // Same as WarningManager.Instance
```

#### Use Cases

1. **Framework-level warnings** - Alert developers about deprecated APIs
2. **Data migration** - Track fields that don't match current schema
3. **Development debugging** - Identify outdated code patterns
4. **Testing** - Verify no deprecated features are used

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

