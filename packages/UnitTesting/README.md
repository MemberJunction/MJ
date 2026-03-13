# @memberjunction/unit-testing

Utilities and mocks for writing unit tests in the MemberJunction monorepo using Vitest.

## Installation

```bash
npm install --save-dev @memberjunction/unit-testing
```

This package is typically already included as a dev dependency in MemberJunction projects.

## Overview

This package provides helper functions and mock utilities to simplify unit testing of MemberJunction components. It handles common testing challenges like:

- **Singleton reset** - Clean state between tests
- **Entity mocking** - Mock BaseEntity behavior without database
- **RunView mocking** - Mock data loading operations
- **Custom matchers** - Additional Vitest assertions

## Utilities

### Singleton Reset

MemberJunction uses singletons for engines and global state. Reset them between tests to ensure isolation.

#### `resetMJSingletons()`

Clears ALL MJ singleton instances from the global store.

```typescript
import { describe, it, beforeEach } from 'vitest';
import { resetMJSingletons } from '@memberjunction/unit-testing';

describe('MyEngine', () => {
  beforeEach(() => {
    resetMJSingletons(); // Clean slate for each test
  });

  it('should create fresh engine instance', () => {
    const engine = MyEngine.Instance; // Gets new instance
    // ... test
  });
});
```

#### `resetClassFactory()`

Resets only the ClassFactory registrations. Lighter weight than `resetMJSingletons`.

```typescript
import { resetClassFactory } from '@memberjunction/unit-testing';

beforeEach(() => {
  resetClassFactory(); // Only reset class registrations
});
```

#### `resetObjectCache()`

Clears the global object cache used by MJ for caching data.

```typescript
import { resetObjectCache } from '@memberjunction/unit-testing';

beforeEach(() => {
  resetObjectCache(); // Clear cached objects
});
```

### Entity Mocking

#### `createMockEntity<T>(data, options?)`

Creates a Proxy-based mock that behaves like a BaseEntity with getter/setter properties.

**Why needed:** BaseEntity uses getters/setters, so the spread operator (`...entity`) doesn't work. This mock provides the same interface without requiring a real database.

```typescript
import { createMockEntity } from '@memberjunction/unit-testing';

// Create a mock user entity
const mockUser = createMockEntity({
  ID: 'user-123',
  Name: 'Test User',
  Email: 'test@example.com',
  Status: 'Active'
});

// Use like a real entity
console.log(mockUser.Name); // 'Test User'
mockUser.Status = 'Inactive'; // Setter works
console.log(mockUser.Get('Email')); // 'test@example.com'
console.log(mockUser.GetAll()); // { ID: '...', Name: '...', ... }

await mockUser.Save(); // Mock save (always succeeds)
console.log(mockUser.Dirty); // false after save
```

**Options:**

```typescript
interface MockEntityOptions {
  isSaved?: boolean;  // Default: true - Entity appears saved to DB
  isDirty?: boolean;  // Default: false - Entity appears clean
}

// Create unsaved entity
const newEntity = createMockEntity(
  { ID: '', Name: 'New User' },
  { isSaved: false, isDirty: true }
);
```

**Mock Entity Methods:**

- `Get(fieldName)` - Get field value (case-insensitive)
- `Set(fieldName, value)` - Set field value (marks dirty)
- `GetAll()` - Returns all fields as plain object
- `Save()` - Mock save operation (always succeeds, clears dirty flag)
- `Delete()` - Mock delete operation (always succeeds)
- `Dirty` - Boolean indicating if entity has unsaved changes
- `IsSaved` - Boolean indicating if entity exists in DB
- `PrimaryKey` - Mock primary key object

### RunView Mocking

#### `mockRunView(entityName, mockResults)`

Mocks a single `RunView` operation to return specific results.

```typescript
import { mockRunView } from '@memberjunction/unit-testing';
import { vi } from 'vitest';

// Mock RunView for 'Users' entity
const mockUsers = [
  createMockEntity({ ID: '1', Name: 'Alice' }),
  createMockEntity({ ID: '2', Name: 'Bob' })
];

const runViewSpy = mockRunView('Users', mockUsers);

// Now when code calls RunView:
const rv = new RunView();
const result = await rv.RunView({ EntityName: 'Users' });
// result.Results === mockUsers

// Verify it was called
expect(runViewSpy).toHaveBeenCalledWith(
  expect.objectContaining({ EntityName: 'Users' })
);
```

#### `mockRunViews(mocks)`

Mocks multiple `RunView` operations at once.

```typescript
import { mockRunViews } from '@memberjunction/unit-testing';

mockRunViews({
  'Users': mockUsers,
  'Actions': mockActions,
  'AI Models': mockModels
});

// All three entities will return mock data
```

#### `resetRunViewMocks()`

Clears all RunView mocks.

```typescript
import { resetRunViewMocks } from '@memberjunction/unit-testing';

afterEach(() => {
  resetRunViewMocks(); // Clean up mocks
});
```

### Custom Matchers

#### `installCustomMatchers()`

Installs additional Vitest matchers for MemberJunction-specific assertions.

```typescript
import { installCustomMatchers } from '@memberjunction/unit-testing';
import { beforeAll } from 'vitest';

beforeAll(() => {
  installCustomMatchers();
});

// Now use custom matchers in your tests
// (See vitest.d.ts for available custom matchers)
```

## Common Patterns

### Test Structure with Full Setup

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetMJSingletons,
  createMockEntity,
  mockRunView
} from '@memberjunction/unit-testing';

describe('MyService', () => {
  beforeEach(() => {
    // Reset singletons for clean state
    resetMJSingletons();
  });

  it('should process users correctly', async () => {
    // Setup mock data
    const mockUsers = [
      createMockEntity({ ID: '1', Name: 'Alice', Status: 'Active' }),
      createMockEntity({ ID: '2', Name: 'Bob', Status: 'Inactive' })
    ];

    // Mock RunView to return mock data
    mockRunView('Users', mockUsers);

    // Test your service
    const service = new MyService();
    const result = await service.getActiveUsers();

    // Assertions
    expect(result).toHaveLength(1);
    expect(result[0].Name).toBe('Alice');
  });
});
```

### Mocking Entity Creation

When testing code that creates entities via `Metadata.GetEntityObject()`:

```typescript
import { vi } from 'vitest';
import { createMockEntity } from '@memberjunction/unit-testing';

// Mock the Metadata class
vi.mock('@memberjunction/core', () => ({
  Metadata: vi.fn(function() {
    return {
      GetEntityObject: vi.fn(async (entityName) => {
        return createMockEntity({ ID: '', Name: '' }, { isSaved: false });
      })
    };
  })
}));
```

### Testing Singleton Engines

```typescript
import { resetMJSingletons } from '@memberjunction/unit-testing';

describe('ActionEngine', () => {
  beforeEach(() => {
    resetMJSingletons(); // Ensures fresh instance
  });

  it('should load actions', async () => {
    const engine = ActionEngine.Instance;
    await engine.Load();
    expect(engine.Actions.length).toBeGreaterThan(0);
  });

  it('should get separate instance after reset', async () => {
    const engine1 = ActionEngine.Instance;
    resetMJSingletons();
    const engine2 = ActionEngine.Instance;

    expect(engine1).not.toBe(engine2); // Different instances
  });
});
```

## TypeScript Support

This package includes TypeScript definitions for all utilities. Import types as needed:

```typescript
import type { MockEntityOptions, MockEntityMethods } from '@memberjunction/unit-testing';
```

## Best Practices

### DO:
- ✅ Always reset singletons in `beforeEach()` for test isolation
- ✅ Use `createMockEntity()` instead of plain objects for BaseEntity mocks
- ✅ Use `mockRunView()` to avoid database dependencies in unit tests
- ✅ Keep mocks simple and focused on the test case

### DON'T:
- ❌ Share mock data between tests (creates hidden dependencies)
- ❌ Forget to reset singletons (causes test interference)
- ❌ Over-mock (test real logic where possible)
- ❌ Use real database connections in unit tests (use integration tests instead)

## Related Documentation

- **Testing Strategy**: See `/unit-testing/README.md` for comprehensive testing guidelines
- **Analytics**: See `/unit-testing/README.md` for test reporting and analytics
- **Integration Tests**: See `/packages/TestingFramework/` for full-stack testing

## Examples

Look at existing tests for usage examples:
- `/packages/MJCore/src/__tests__/` - Core functionality tests
- `/packages/Actions/Engine/src/__tests__/` - Action engine tests
- `/packages/AI/*/src/__tests__/` - AI provider tests

## Contributing

When adding new test utilities:
1. Add the utility function to appropriate file (`singleton-reset.ts`, `mock-entity.ts`, etc.)
2. Export from `index.ts`
3. Update this README with usage examples
4. Add TypeScript definitions to `vitest.d.ts` if adding custom matchers

## License

See repository root LICENSE file.
