# MJCore Test Suite

## Overview

This test suite validates the thread safety and concurrency behavior of the MemberJunction metadata provider system.

**Related Documentation**: [METADATA_THREAD_SAFETY_IMPLEMENTATION.md](../../../../METADATA_THREAD_SAFETY_IMPLEMENTATION.md)

## Test Files

### `providerBase.refresh.test.ts`
**Purpose**: Baseline tests documenting current Refresh() and Config() behavior

**Test Categories**:
1. **Single Refresh Operations** - Normal single-threaded usage
2. **Metadata Access During Operations** - Reading patterns and stability
3. **Current Behavior - Documenting Issues** - Known bugs before fix

**Key Tests**:
- `Config() loads metadata successfully` - Basic functionality
- `Entities have Fields populated` - Data structure validation
- `Refresh() triggers Config() and reloads metadata` - Refresh mechanism
- `KNOWN ISSUE: Reading metadata during Config() may see empty data` ⚠️
- `KNOWN ISSUE: Multiple concurrent Config() calls race` ⚠️

### `providerBase.concurrency.test.ts`
**Purpose**: Concurrency tests for multi-threaded/async scenarios

**Test Categories**:
1. **Parallel Config() Calls** - Multiple simultaneous refreshes
2. **Reading Metadata During Refresh** - Critical race condition tests
3. **Simulated Production Scenarios** - Real-world usage patterns
4. **Edge Cases** - Unusual but important scenarios

**Key Tests**:
- `Multiple parallel Config() calls complete successfully` - Core concurrency
- `Reading Entities during refresh returns valid data` ⚠️ **CRITICAL**
- `GetEntityObject during refresh does not fail` - QueryEntity scenario
- `Metadata sync scenario: parallel query saves with refreshes` - Hot path
- `High concurrency: 50 parallel operations` - Stress test

⚠️ **Tests marked CRITICAL will FAIL before the atomic update fix**

## Running Tests

### Install Dependencies
```bash
cd packages/MJCore
npm install
```

### Run All Tests
```bash
npm test
```

### Run Specific Test Suites
```bash
# Baseline refresh tests
npm run test:refresh

# Concurrency tests
npm run test:concurrency
```

### Watch Mode (for development)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

## Test Expectations

### Before Atomic Update Fix

**Expected Failures**:
- `KNOWN ISSUE: Reading metadata during Config() may see empty data` ❌
- `KNOWN ISSUE: Multiple concurrent Config() calls race` ❌
- `Reading Entities during refresh returns valid data` ❌
- `GetEntityObject during refresh does not fail` ❌ (intermittent)
- `Metadata sync scenario` ❌ (intermittent)

**Expected Warnings**:
- "WARNING: Saw empty entities during refresh (this is the bug)"
- Entity counts showing 0 or -1 during refresh windows

### After Atomic Update Fix

**Expected Passes**:
- All baseline tests ✅
- All concurrency tests ✅
- No warnings about empty entities ✅

**Performance Expectations**:
- Refresh time: Similar to before (<5% change)
- Memory usage: Temporary 2x during refresh (acceptable)
- No deadlocks or hangs ✅

## Test Data

### Mock Metadata Structure
Tests use a minimal but realistic metadata structure:

```typescript
{
  Entities: [
    {
      ID: '1',
      Name: 'Test Entity 1',
      SchemaName: 'dbo',
      BaseView: 'vwTestEntity1',
      Fields: [
        { ID: 'f1', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
        { ID: 'f2', Name: 'Name', Type: 'nvarchar', IsPrimaryKey: false },
      ]
    }
  ],
  // ... other metadata collections
}
```

### Timing Simulations
- **GetAllMetadata()**: 50-250ms delay (simulates real DB calls)
- **Read operations**: 10-50ms intervals during refresh
- **Parallel operations**: Random delays for realistic interleaving

## Debugging Failed Tests

### Common Issues

**1. Test timeout errors**
```
Timeout - Async callback was not invoked within the 30000 ms timeout
```
**Solution**: Increase timeout in jest.config.js or specific test

**2. Empty entities during refresh**
```
WARNING: Saw empty entities during refresh
```
**Expected**: This is the bug being documented. Will be fixed in Phase 2.

**3. Race condition intermittent failures**
```
Tests pass sometimes, fail other times
```
**Expected**: Nature of race conditions. Run tests multiple times to confirm pattern.

### Diagnostic Logging

Enable verbose logging in tests:
```typescript
console.log('Entity count:', provider.Entities.length);
console.log('Call count:', provider.getCallCount());
```

View detailed output:
```bash
npm test -- --verbose
```

## Test Infrastructure

### TestMetadataProvider
Mock implementation of ProviderBase for testing:

**Features**:
- Configurable metadata responses
- Simulated async delays
- Call counting for diagnostics
- Control over AllowRefresh flag

**Usage**:
```typescript
const provider = new TestMetadataProvider();
provider.setMockMetadata({ ... }); // Custom data
await provider.Config(testConfig);
```

### Jest Configuration
- **Environment**: Node.js
- **Transform**: ts-jest (TypeScript support)
- **Timeout**: 30 seconds (for slow metadata operations)
- **Coverage**: src/**/*.ts (excludes tests and type definitions)

## Adding New Tests

### Test Structure
```typescript
describe('Feature Name', () => {
  let provider: TestMetadataProvider;

  beforeEach(() => {
    provider = new TestMetadataProvider();
    // Setup
  });

  test('specific behavior', async () => {
    // Arrange
    await provider.Config(testConfig);

    // Act
    const result = provider.Entities;

    // Assert
    expect(result).toBeDefined();
  });
});
```

### Best Practices
1. **Use async/await** for all provider operations
2. **Document expected behavior** in comments
3. **Include timing information** for race conditions
4. **Test both success and failure** cases
5. **Validate data structures** (not just existence)

## Continuous Integration

### CI Pipeline Integration
```yaml
# Example .github/workflows/test.yml
- name: Run MJCore Tests
  run: |
    cd packages/MJCore
    npm install
    npm test
```

### Pre-commit Hook
```bash
#!/bin/sh
cd packages/MJCore && npm test
```

## Troubleshooting

### Tests Won't Run
**Check**: Node.js version (requires 18+)
```bash
node --version
```

**Check**: Dependencies installed
```bash
npm list jest ts-jest
```

### Type Errors in Tests
**Solution**: Ensure `@types/jest` is installed
```bash
npm install --save-dev @types/jest
```

### Module Resolution Errors
**Check**: `moduleNameMapper` in jest.config.js
```javascript
moduleNameMapper: {
  '^@memberjunction/(.*)$': '<rootDir>/../$1/src',
}
```

## Maintenance

### Updating Tests After Fix
When implementing the atomic update fix (Phase 2):

1. **Update test expectations** - Remove "KNOWN ISSUE" markers
2. **Verify all tests pass** - Run full suite
3. **Add new tests** - For atomic update specific behavior
4. **Update this README** - Document new expected behavior

### Performance Benchmarks
Track these metrics over time:
- Refresh operation time (should be <2s)
- Concurrent operation time (should scale linearly)
- Memory usage during refresh (acceptable: 2x peak)

## Resources

- [Jest Documentation](https://jestjs.io/)
- [ts-jest Documentation](https://kulshekhar.github.io/ts-jest/)
- [Testing Best Practices](https://testingjavascript.com/)
- [MJ Implementation Plan](../../../../METADATA_THREAD_SAFETY_IMPLEMENTATION.md)

## Contact

**Questions or Issues**: See main implementation plan for contacts

**Test Failures**: Document in GitHub issues with:
- Test name
- Error message
- Reproduction steps
- System information

---

**Last Updated**: 2025-12-05
**Status**: Phase 1, Task 1.3 Complete
