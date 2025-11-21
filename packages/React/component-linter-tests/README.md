# Component Linter Tests

**🚨 NOT FOR PUBLISHING - This is a local testing package only**

This package contains the test suite for the MemberJunction React component linter with full database connectivity.

## Purpose

- Test linter rules against real database connections
- Validate linter catches bugs like `result?.records` instead of `result?.Results`
- Provide infrastructure for testing across component spec fixtures
- **NOT** part of the @memberjunction npm namespace
- **NEVER** published to NPM registry

## Setup

### 1. Configure Environment

Edit `.env` in this directory:

```env
DB_HOST=sqlserver.local
DB_DATABASE=test
DB_USERNAME=MJ_Connect
DB_PASSWORD=YourStrong@Passw0rd123
TEST_USER_EMAIL=not.set@nowhere.com
```

### 2. Install Dependencies

From MJ repo root:

```bash
npm install
```

## Running Tests

### Basic Tests (Inline Code)

From this directory:

```bash
npm test
```

Or directly:

```bash
npx ts-node run-tests.ts
```

### Fixture-Based Tests (Real Components)

```bash
npm run test:fixtures
```

Or directly:

```bash
npx ts-node run-fixture-tests.ts
```

### Run All Tests

```bash
npm run test:all
```

## What Gets Tested

The test suite validates:

✅ **Optional Chaining Invalid Properties**
- `result?.records` (should fail)
- `result?.Rows` (should fail)
- `result?.data` (should fail)

✅ **Weak Fallback Chains**
- `result?.records ?? result?.Rows ?? []` (the actual bug pattern)

✅ **Correct Patterns** (should pass)
- `result?.Results ?? []`

✅ **Regression Tests**
- `result.records` (non-optional chaining still caught)

## Test Infrastructure

### `src/infrastructure/database-setup.ts`
- Loads `.env` configuration
- Initializes metadata connection
- Retrieves SYSTEM_USER as context user

### `src/infrastructure/test-runner.ts`
- Simple Jest/Mocha-like API
- Provides `describe`, `it`, `expect`, `beforeEach`
- Synchronous test execution with readable output

### `run-tests.ts`
- Main test runner
- Contains all test cases
- Uses `Component Linter` from `@memberjunction/react-test-harness`

## Expected Output

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                    Linter Test Suite Runner                                  ║
╚══════════════════════════════════════════════════════════════════════════════╝

🔄 Initializing database connection...
✅ Database connection configured
   Host: sqlserver.local
   Database: test
   Entities available: 250

🔄 Loading context user...
✅ Context user loaded: System User (not.set@nowhere.com)

================================================================================
📦 OptionalMemberExpression - Basic Invalid Properties
================================================================================
  ✅ should detect result?.records (lowercase) - invalid property (245ms)
  ✅ should detect result?.Rows (capitalized) - invalid property (198ms)
  ✅ should NOT flag result?.Results - correct property (187ms)

  Passed: 3, Failed: 0, Total: 3

📊 TEST SUMMARY
  Total Tests:  5
  Passed:       5 ✅
  Failed:       0
  Duration:     1022ms

  🎉 All tests passed!
```

## Adding New Tests

Edit `run-tests.ts` and add new describe/it blocks:

```typescript
describe('My New Test Suite', () => {
  it('should test something', async () => {
    const code = `
      function TestComponent({ utilities }) {
        // Your test code
      }
    `;

    const lintResult = await ComponentLinter.lintComponent(
      code,
      'TestComponent',
      baseQuerySpec,
      true,
      contextUser
    );

    // Assertions
    expect(lintResult.violations).toHaveLength(0);
  });
});
```

## Package Structure

```
component-linter-tests/
├── .env                    # Database credentials (gitignored)
├── .npmignore              # Prevents accidental publishing
├── package.json            # private: true, no @memberjunction namespace
├── tsconfig.json          # TypeScript configuration
├── run-tests.ts           # Basic test runner (inline code)
├── run-fixture-tests.ts   # Fixture test runner (real components)
├── fixtures/              # Test fixture components
│   ├── broken-components/   # Components with bugs
│   ├── fixed-components/    # Corrected versions
│   └── valid-components/    # Good examples
├── src/
│   ├── fixtures/
│   │   └── fixture-loader.ts    # Fixture loading utilities
│   ├── infrastructure/
│   │   ├── database-setup.ts    # DB connection & context user
│   │   └── test-runner.ts       # Test framework
│   └── tests/
│       └── fixture-tests.ts     # Fixture-based test suite
└── README.md              # This file
```

## Troubleshooting

### "Failed to load test user"
Verify SYSTEM_USER exists: `SELECT * FROM __mj.vwUsers WHERE Email = 'not.set@nowhere.com'`

### "Cannot connect to database"
1. Check SQL Server is running
2. Verify `.env` credentials
3. Test connection with SQL tools first

### Tests hang or timeout
1. Check database performance
2. Verify network connectivity
3. Check firewall rules

## Fixture-Based Testing

### Fixture Directory Structure

Component specs are organized into three categories:

```
fixtures/
├── broken-components/    # Components with known bugs
│   ├── broken-10.json    # Original bug: result?.records ?? result?.Rows
│   └── ...
├── fixed-components/     # Corrected versions
│   ├── fix-10.json       # Fixed: result?.Results
│   └── ...
└── valid-components/     # Components that should pass linting
    └── ...
```

### Adding New Fixtures

1. **Add a broken component**:
   - Save component spec as `fixtures/broken-components/my-bug.json`
   - Run tests to verify linter catches it

2. **Add the fixed version**:
   - Save corrected version as `fixtures/fixed-components/my-bug.json`
   - Run tests to verify no violations

3. **Add valid examples**:
   - Save good examples as `fixtures/valid-components/example.json`
   - Use for regression testing

### Fixture Loader API

```typescript
import { loadFixture, loadFixturesByCategory, loadAllFixtures } from './src/fixtures/fixture-loader';

// Load single fixture
const fixture = await loadFixture('broken', 'broken-10');
// fixture.spec contains the ComponentSpec
// fixture.metadata contains name, category, description

// Load all fixtures from a category
const brokenFixtures = await loadFixturesByCategory('broken');

// Load everything
const all = await loadAllFixtures();
// all.broken, all.fixed, all.valid
```

### Bulk Testing

The fixture test runner automatically:
- Tests all broken components (should detect violations)
- Tests all fixed components (should have NO violations)
- Reports statistics and violations per component

### Example Test Output

```
╔══════════════════════════════════════════════════════════════════════════════╗
║              Fixture-Based Linter Test Suite Runner                         ║
╚══════════════════════════════════════════════════════════════════════════════╝

📊 Fixture Statistics:
   Total Fixtures: 2
   Broken:  1
   Fixed:   1
   Valid:   0

================================================================================
📦 Broken Components - Should Detect Violations
================================================================================
  ✅ broken-10.json - should detect result?.records ?? result?.Rows pattern (15ms)
      Found 2 violation(s) as expected:
        1. Line 1283: RunQuery results don't have a ".records" property...
        2. Line 1283: RunQuery results don't have a ".Rows" property...

================================================================================
📦 Fixed Components - Should Have No Violations
================================================================================
  ✅ fix-10.json - should NOT detect violations (uses correct .Results) (12ms)

================================================================================
📦 Bulk Test - All Broken Components
================================================================================
  ✅ should detect violations in ALL broken component fixtures (15ms)
      Testing 1 broken component(s)...
      Results: 1/1 components have violations
      Total violations detected: 2

📊 TEST SUMMARY
  Total Tests:  4
  Passed:       4 ✅
  Failed:       0
  Duration:     42ms

  🎉 All fixture tests passed!
```

## Next Steps

To expand the test suite:

1. ✅ **Fixtures directory created** - broken/fixed/valid categories
2. ✅ **Bulk test runner** - iterates through all fixtures
3. **Add more fixtures** - copy production components with bugs
4. **Add performance benchmarks** for large codebases

## Notes

- This package is **intentionally excluded** from the @memberjunction namespace
- `.npmignore` configured to prevent accidental publishing
- `package.json` has `"private": true` to block npm publish
- Uses the linter from `@memberjunction/react-test-harness` (built separately)
- Database connection required for contextUser parameter
