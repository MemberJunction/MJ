# MemberJunction Unit Testing Analytics

This directory contains tools for running unit tests across all packages and generating comprehensive analytics reports with beautiful visualizations.

## Directory Structure

```
unit-testing/
├── runs/                          # Timestamped test run results
│   ├── 2026_02_10_0709/          # Example run directory
│   │   ├── summary.json          # Aggregated results from all packages
│   │   ├── summary.md            # Beautiful Markdown report with Mermaid charts
│   │   ├── metadata.json         # Run metadata (timestamp, git info, duration)
│   │   └── by-package/           # Individual package results
│   │       ├── core/
│   │       │   └── results.json  # Vitest JSON output for @memberjunction/core
│   │       ├── actions-engine/
│   │       │   └── results.json
│   │       └── ...
│   └── latest -> 2026_02_10_1430 # Symlink to most recent run
└── tools/                         # Orchestration scripts
    ├── create-run.js             # Creates new timestamped run directory
    ├── run-all-tests.js          # Runs all tests and generates reports
    ├── aggregate-results.js      # Aggregates package results into summary
    └── generate-markdown.js      # Generates beautiful Markdown with Mermaid
```

## Usage

### Run All Tests with Analytics

```bash
npm run test:analytics
```

This will:
1. Create a new timestamped run directory
2. Run all unit tests across all packages
3. Collect results in JSON format
4. Aggregate results into a summary
5. Generate a beautiful Markdown report with Mermaid charts

### View Latest Results

```bash
# View JSON summary
cat unit-testing/runs/latest/summary.json

# View Markdown report (use a Markdown viewer with Mermaid support)
open unit-testing/runs/latest/summary.md
```

### Manual Steps

If you want to run steps individually:

```bash
# 1. Create a new run directory
node unit-testing/tools/create-run.js

# 2. Run tests normally
npm test

# 3. Aggregate results (from latest run)
npm run test:aggregate

# 4. Generate markdown report
npm run test:markdown
```

## Report Features

The generated `summary.md` includes:

### 📊 Visualizations
- **Pie Chart**: Pass/Fail/Skip distribution
- **Bar Chart**: Top 10 slowest packages
- **Performance Metrics**: Execution time per package

### 📈 Statistics
- Total packages, tests, pass/fail/skip counts
- Overall pass rate percentage
- Total duration and per-package timing

### 📦 Package Details
- Sortable table with results for each package
- Status indicators (✅❌⏭️)
- Execution time per package

### ❌ Failure Details
- Expandable section with all test failures
- Full error messages and stack traces
- Grouped by package

## Git Integration

Each run captures:
- Git branch name
- Git commit hash (short)
- Timestamp of test execution
- Total duration

This makes it easy to track test results across different commits and branches.

## Historical Analysis

All test runs are preserved in timestamped directories, enabling:
- Trend analysis over time
- Performance regression detection
- Comparison between branches
- Historical failure tracking

## CI/CD Integration

Add to your CI pipeline:

```yaml
- name: Run Unit Tests with Analytics
  run: npm run test:analytics

- name: Upload Test Reports
  uses: actions/upload-artifact@v3
  with:
    name: test-reports
    path: unit-testing/runs/latest/
```

---

# 🧪 MemberJunction Unit Testing Strategy

This section outlines the testing philosophy, practices, and guidelines for the MemberJunction monorepo.

## Testing Philosophy

### Unit Testing vs Integration Testing

MemberJunction uses a **layered testing approach**:

- **Unit Tests** (this system): Test individual components, classes, and functions in isolation
- **Integration Tests** (MJ Testing Framework): Test complete workflows with real database connections

**Unit tests are fast, focused, and deterministic.** They verify logic correctness without external dependencies.

### What Unit Tests Cover

✅ **We unit test:**
- Pure business logic and algorithms
- Data transformations and calculations
- Validation rules and edge cases
- Class behavior and state management
- Error handling and boundary conditions
- Helper functions and utilities

❌ **We don't unit test:**
- Database queries (mocked or integration tests)
- External API calls (mocked or integration tests)
- File system operations (mocked when needed)
- Full end-to-end workflows (integration tests)

### Current State

- **3,400+ unit tests** across 78 packages
- **~99% pass rate** (indicating good stability for logic)
- **Zero to minimal integration testing** in unit tests (by design)
- **Comprehensive integration testing** via MJ Testing Framework (separate system)

## Mocking Strategy

### When to Mock

Mock external dependencies that:
- Make network calls (APIs, databases)
- Access file systems
- Have non-deterministic behavior (random, timestamps)
- Are slow or resource-intensive

### When NOT to Mock

Don't mock:
- **Pure logic classes** - Test them directly
- **Data structures** - Test real implementations
- **MJ core utilities** - Use real ones when possible
- **Value objects** - Test actual behavior

### Avoiding Mock Drift

**Mock drift** occurs when mocks no longer match real implementations. To prevent this:

1. **Keep mocks simple** - Only mock what's necessary
2. **Update mocks with code changes** - Treat mocks as first-class code
3. **Use real classes where safe** - Prefer real implementations for pure logic
4. **Integration tests catch drift** - Full-stack tests verify real behavior

### Mock Configuration Pattern

When mocking modules with default exports:

```typescript
// ✅ CORRECT - Wrap in default object for default imports
vi.mock('some-library', () => ({
  default: {
    SomeClass: class MockSomeClass { /* ... */ }
  }
}));

// ❌ WRONG - Named export when code uses default import
vi.mock('some-library', () => ({
  SomeClass: class MockSomeClass { /* ... */ }
}));
```

## Writing Good Tests

### Test File Organization

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ClassName', () => {
  beforeEach(() => {
    // Reset state between tests
  });

  describe('MethodName', () => {
    it('should handle the normal case', () => { /* ... */ });
    it('should handle edge case: empty input', () => { /* ... */ });
    it('should throw on invalid input', () => { /* ... */ });
  });
});
```

### Test Naming Convention

Use descriptive names that read as specifications:

```typescript
// ✅ GOOD - Clear, specific, readable
it('should return null when field name does not exist', () => { /* ... */ });
it('should format composite key as "Field=Value AND Field=Value"', () => { /* ... */ });

// ❌ BAD - Vague, unclear intent
it('should work', () => { /* ... */ });
it('test getValue', () => { /* ... */ });
```

### Assertion Quality

Use specific assertions that clearly express intent:

```typescript
// ✅ GOOD - Multiple specific assertions
expect(result.Success).toBe(true);
expect(result.Results).toHaveLength(5);
expect(result.Results[0].Name).toBe('Expected Name');

// ❌ BAD - Single vague assertion
expect(result).toBeTruthy();
```

### Testing Edge Cases

Always test:
- **Null/undefined inputs**
- **Empty collections**
- **Boundary values** (0, -1, max values)
- **Invalid input types**
- **Error conditions**

### Test Independence

Each test should be independent:

```typescript
// ✅ GOOD - Each test creates its own data
describe('Calculator', () => {
  it('should add two numbers', () => {
    const calc = new Calculator();
    expect(calc.add(2, 3)).toBe(5);
  });

  it('should multiply two numbers', () => {
    const calc = new Calculator();  // Fresh instance
    expect(calc.multiply(4, 5)).toBe(20);
  });
});

// ❌ BAD - Shared state between tests
let calc: Calculator;
beforeEach(() => {
  calc = new Calculator();
  calc.add(2, 3);  // Side effect!
});
```

## Coverage Goals

### Current Coverage

- **Not yet measured** - No coverage metrics currently tracked
- **Estimated ~60-70%** based on test distribution

### Target Coverage (Future)

- **80% line coverage** minimum for new code
- **80% branch coverage** for critical paths
- **Priority packages** should reach 90%+ coverage

### Adding Coverage Reporting

To add coverage metrics:

```bash
npm install --save-dev @vitest/coverage-v8
```

Update `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80
      }
    }
  }
});
```

## Priority Packages for Testing

### High Priority (Core Functionality)
- `@memberjunction/core` - 245 tests ✅
- `@memberjunction/global` - 227 tests ✅
- `@memberjunction/core-entities` - 213 tests ✅
- `@memberjunction/encryption` - 186 tests ✅

### Medium Priority (Well-Covered)
- `@memberjunction/db-auto-doc` - 174 tests ✅
- `@memberjunction/ai` - 140 tests ✅
- `@memberjunction/export-engine` - 135 tests ✅

### Needs Attention (Minimal/No Tests)
- `communication-gmail` - 0 tests ⚠️
- `communication-twilio` - 0 tests ⚠️
- `component-registry-server` - 5 tests ⚠️
- `ai-provider-bundle` - 2 tests ⚠️

## Best Practices Summary

### ✅ DO:
- Test pure business logic thoroughly
- Use descriptive test names
- Test edge cases and error conditions
- Keep tests independent and deterministic
- Mock only external dependencies
- Write tests for new code
- Fix failing tests immediately

### ❌ DON'T:
- Mock everything (test real logic)
- Write tests that depend on execution order
- Test implementation details (test behavior)
- Commit failing tests
- Skip tests without good reason
- Test database queries in unit tests (use integration tests)

## Resources

- **Vitest Documentation**: https://vitest.dev
- **MJ Testing Framework**: `/packages/TestingFramework/` (integration tests)
- **Test Utilities Package**: `/packages/UnitTesting/` (mocks and helpers)
- **Example Tests**: Look at `packages/MJCore/src/__tests__/` for patterns

---

## Output Example

```
🧪 MemberJunction Unit Testing Suite

════════════════════════════════════════════════════════════════════════════════

📁 Step 1: Creating test run directory...
✅ Created test run: 2026_02_10_0709
   Directory: /Users/.../unit-testing/runs/2026_02_10_0709
   Git: claude/analyze-codebase-4.0-1NHpy (da6254fc5)

🔍 Step 2: Discovering packages with tests...
   Found 150 packages

🚀 Step 3: Running tests...

📦 Testing @memberjunction/core...
   ✅ Passed
📦 Testing @memberjunction/actions-engine...
   ✅ Passed
...

📊 Step 4: Aggregating results...
✅ Aggregated results from 150 packages
   Total tests: 4971
   Passed: 4968
   Failed: 3
   Skipped: 0
   Duration: 2m 43s

📝 Step 5: Generating Markdown report...
✅ Generated Markdown report: .../summary.md

════════════════════════════════════════════════════════════════════════════════
✅ Test Run Complete!

📁 Run: unit-testing/runs/2026_02_10_0709
📊 JSON: summary.json
📝 Report: summary.md

Packages: 150
Tests: 4971
✅ Passed: 4968
❌ Failed: 3
⏭️  Skipped: 0
⏱️  Duration: 2m 43s

🎉 All tests passed!
```
