# MemberJunction Testing Guidelines

This document establishes testing standards for all MemberJunction packages.

## Current Testing State

As of December 2024, MemberJunction has **minimal automated testing**. The repository includes:
- A few unit tests in MJServer (auth backward compatibility)
- A test in AI/Agents (action changes)
- React test harness with linter validation tests
- MJCore metadata refresh tests

**Goal**: Expand test coverage across all packages using these standardized patterns.

## Running Tests

### Package-Level Testing
```bash
# Navigate to any package
cd packages/[package-name]

# Run all tests in that package
npm test

# Watch mode (auto-rerun on file changes)
npm run test:watch

# Coverage report
npm run test:coverage
```

### Repository-Level Testing
```bash
# From repository root
# Run tests for specific package
npx turbo test --filter=@memberjunction/[package-name]

# Run all tests across all packages
npx turbo test
```

## Test Organization Standards

### ✅ Recommended Pattern: `src/__tests__/` Directory

**Benefits**:
- Tests live close to source code
- Easy to find related tests
- TypeScript imports work naturally
- Standard Jest convention
- Works well with monorepo structure

**Structure**:
```
packages/MJCore/
├── src/
│   ├── __tests__/           # ✅ All tests here
│   │   ├── setup.ts         # Shared test setup
│   │   ├── README.md        # Test documentation
│   │   ├── providerBase.refresh.test.ts
│   │   └── providerBase.concurrency.test.ts
│   ├── generic/             # Source code
│   │   ├── metadata.ts
│   │   └── providerBase.ts
│   └── views/
├── jest.config.js           # Jest configuration
└── package.json             # Test scripts
```

### Alternative Patterns (Not Recommended for MJ)

#### ❌ Separate `test/` or `tests/` Root Directory
```
packages/MJCore/
├── src/           # Source
├── tests/         # Tests (separate)
└── package.json
```
**Why avoid**:
- Harder to locate related tests
- Import paths become more complex
- Less discoverable

#### ❌ Colocated `*.test.ts` Files
```
packages/MJCore/
└── src/
    ├── generic/
    │   ├── metadata.ts
    │   ├── metadata.test.ts      # ❌ Avoid
    │   ├── providerBase.ts
    │   └── providerBase.test.ts  # ❌ Avoid
```
**Why avoid**:
- Pollutes source directories
- Can complicate build configuration
- Makes it harder to exclude tests from dist/

## CI/CD Integration

### Adding Test Task to Turbo

**File**: `/turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "outputs": ["build/**", "dist/**"],
      "cache": true,
      "dependsOn": ["^build"],
      "persistent": false
    },
    "test": {
      "cache": true,
      "dependsOn": ["build"],
      "outputs": ["coverage/**"],
      "inputs": ["src/**/*.ts", "src/**/*.test.ts", "jest.config.js"]
    },
    "start": {
      "cache": false,
      "persistent": true
    },
    "watch": {
      "cache": false,
      "persistent": true
    }
  }
}
```

### GitHub Actions Workflow

**File**: `.github/workflows/test.yml` (create new)

```yaml
name: Tests

on:
  push:
    branches: [main, next, dev]
  pull_request:
    branches: [main, next, dev]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npx turbo test

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        if: always()
        with:
          files: ./packages/*/coverage/lcov.info
          flags: unittests
```

### Individual Package Configuration

**Example**: Any package with tests

**File**: `packages/[package-name]/package.json`

```json
{
  "scripts": {
    "test": "jest",
    "test:ci": "jest --ci --coverage --maxWorkers=2",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

## Recommended Testing Strategy for MemberJunction

### Phase 1: Core Infrastructure Tests
Focus on foundational packages that other packages depend on:
- **MJCore**: Metadata provider, entity loading, RunView functionality
- **MJGlobal**: Utility functions, logging, error handling
- **MJCommunication**: Email, messaging, notification services

### Phase 2: Critical Path Unit Tests
Test business logic and API layers:
- **MJServer**: GraphQL resolvers, authentication, authorization
- **Actions**: Action execution, parameter validation
- **AI/Agents**: Agent lifecycle, prompt execution
- **AI/Prompts**: Prompt rendering, variable substitution

### Phase 3: Integration Tests
Test interactions between components:
- **MetadataSync**: End-to-end sync operations
- **CodeGen**: Generated code validation
- **Database**: Migration validation, stored procedure tests

### Phase 4: E2E Tests (Future)
Test complete user workflows:
- **MJExplorer**: Critical user flows, form interactions
- **React**: Component integration, data flow

## Test Configuration Standards

### Jest Configuration Template

```javascript
// packages/[PackageName]/jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.spec.ts'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**',
    '!src/generated/**'  // Exclude generated code
  ],
  coverageThresholds: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },
  testTimeout: 30000  // For packages with DB operations
};
```

### Package.json Scripts Template

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --maxWorkers=2"
  },
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.2"
  }
}
```

## Test Naming Conventions

### File Naming
- **Unit tests**: `[module-name].test.ts` (e.g., `providerBase.test.ts`)
- **Integration tests**: `[feature-name].integration.test.ts`
- **E2E tests**: `[flow-name].e2e.test.ts`

### Test Suite Organization
```typescript
describe('ProviderBase', () => {
  describe('Config()', () => {
    test('loads metadata successfully', async () => {
      // Arrange, Act, Assert
    });

    test('handles concurrent calls safely', async () => {
      // ...
    });
  });

  describe('Refresh()', () => {
    test('updates metadata when refresh flag is set', async () => {
      // ...
    });
  });
});
```

## Coverage Goals

### Initial Targets (Realistic for MJ)
- **Core packages** (MJCore, MJServer): 60% coverage
- **Business logic** (Actions, AI/Agents): 50% coverage
- **Generated code** (CodeGen output): 0% (excluded)
- **UI components** (Angular, React): 30% coverage

### Long-term Goals (Aspirational)
- **Core packages**: 80% coverage
- **Business logic**: 70% coverage
- **UI components**: 50% coverage

## Mock and Test Utilities

### Shared Test Utilities Location
```
packages/MJCore/src/__tests__/
├── setup.ts              # Global test setup
├── mocks/
│   ├── TestMetadataProvider.ts
│   ├── TestUserInfo.ts
│   └── TestEntityInfo.ts
└── fixtures/
    ├── metadata-samples.ts
    └── entity-samples.ts
```

### Reusable Mocks
```typescript
// packages/MJCore/src/__tests__/mocks/TestMetadataProvider.ts
export class TestMetadataProvider extends ProviderBase {
  // Minimal implementation for testing
  protected async GetAllMetadata(): Promise<AllMetadata> {
    // Return fixture data
  }
}
```

## When to Write Tests

### Always Test
- ✅ Bug fixes (regression prevention)
- ✅ Core infrastructure changes (like metadata provider)
- ✅ Complex business logic
- ✅ Public API methods

### Test When Practical
- ⚠️ New features (at least happy path)
- ⚠️ Refactoring (to prevent breakage)

### Skip Testing (For Now)
- ❌ Generated code (CodeGen output)
- ❌ Simple getters/setters
- ❌ UI layout components (until E2E infrastructure exists)

## Future Enhancements

### Database Testing
- Consider using docker-compose for SQL Server test instances
- Use transactions to isolate test data
- Seed test database with known metadata

### Performance Testing
- Add benchmark tests for critical paths (RunView, metadata loading)
- Track performance over time
- Alert on regressions

### Visual Regression Testing
- For Angular/React components
- Use tools like Playwright or Chromatic
- Catch unintended UI changes

## Questions and Answers

### Q: Should tests be in `src/` or a separate directory?
**A**: Use `src/__tests__/` for unit tests (current MJCore pattern). This is the Jest default and keeps tests close to code.

### Q: How will CI/CD discover and run tests?
**A**:
1. Add `"test"` task to `turbo.json` (see above)
2. Run `npx turbo test` from repo root
3. Turbo will discover all packages with `"test"` script in package.json
4. Tests run in parallel, respecting dependencies

### Q: Do we need to update every package at once?
**A**: No! Add tests incrementally:
1. Start with MJCore (metadata fix)
2. Add to new packages as they're developed
3. Add to existing packages when bugs are fixed or features added

### Q: What about TypeScript compilation?
**A**: Jest with ts-jest handles this automatically:
- No need to build before testing
- Tests run directly from `.ts` files
- Full TypeScript type checking during tests

### Q: How do we handle database-dependent tests?
**A**: Three strategies:
1. **Mock the database** (fastest, for unit tests)
2. **Use test database** (for integration tests)
3. **Use in-memory SQLite** (if possible, for speed)

MJCore tests use strategy #1 (TestMetadataProvider mock).

## Summary

**Current State**: Minimal testing, mostly manual validation

**New Pattern** (this PR):
- Tests in `src/__tests__/` directory
- Jest + ts-jest configuration
- npm scripts for test execution
- Ready for CI/CD via Turbo

**Next Steps**:
1. ✅ Validate MJCore tests work
2. Add `"test"` task to `turbo.json`
3. Create GitHub Actions workflow (optional but recommended)
4. Document test patterns in other packages as they're added
5. Set coverage thresholds after baseline is established

**Long-term Vision**: Comprehensive test coverage for core packages, enabling confident refactoring and preventing regressions.
