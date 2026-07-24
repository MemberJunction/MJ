---
paths:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "**/__tests__/**"
---

# MemberJunction Unit Testing

MemberJunction uses **Vitest** as the standard unit testing framework across all packages. Jest is
deprecated and all packages have been migrated to Vitest.

> The *gate* — "no change is done until the package's unit tests AND the deterministic integration
> tier pass" — lives in the root [`CLAUDE.md`](../../CLAUDE.md). This file is the how.

## Running tests

```bash
npm test                                   # all tests from repo root (Turborepo)
cd packages/PackageName && npm run test    # one package
cd packages/PackageName && npm run test:watch
npx turbo run test --filter=...[HEAD~1]    # only changed packages
npm run test:coverage                      # with coverage
```

## Writing tests

- Test files live in `src/__tests__/` with a `.test.ts` extension
- One test file per source file (e.g. `ClassFactory.test.ts` tests `ClassFactory.ts`)
- Use descriptive test names that read as specifications
- Import from `vitest`: `import { describe, it, expect, vi, beforeEach } from 'vitest'`
- Use `@memberjunction/test-utils` for shared mocking utilities (singleton reset, mock entities, mock `RunView`)
- **No database connections in unit tests** — mock all external dependencies
- Tests must be deterministic and fast (< 5s per file)

## Test structure

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ClassName', () => {
  beforeEach(() => {
    // Reset state between tests
  });

  describe('MethodName', () => {
    it('should handle the normal case', () => { ... });
    it('should handle edge case: empty input', () => { ... });
    it('should throw on invalid input', () => { ... });
  });
});
```

## Adding tests to a new package

Use the scaffold script — it creates the vitest config, test directory, a starter test, and
updates `package.json` scripts:

```bash
node scripts/scaffold-tests.mjs packages/YourPackage
```

## Keeping tests green is your job

When you change a package's source, **run its tests and fix whatever your change broke**. If tests
fail because the new behavior is correct, update the tests. If they fail for another reason, fix
them. Never leave broken tests behind — a broken test is as bad as a broken build.

Common causes of test drift, all of which you must fix:

- Renamed functions/methods that tests still reference by the old name
- Changed return values or formats that test assertions still expect
- New required parameters that test mocks don't provide
- Removed exports that tests still import

Never assume tests still pass after changing a function signature, renaming a method, changing a
return value, or modifying behavior.

## CI/CD integration

- **Every PR** must pass unit tests before merging (GitHub Actions gate)
- **Every release** runs the full-stack regression suite via Docker Compose
- Tests are cached by Turborepo — unchanged packages skip test execution

## Related

- **Integration tests** (real DB + GraphQL, the deterministic tier) — [`guides/INTEGRATION_TESTING_QUICKSTART.md`](../../guides/INTEGRATION_TESTING_QUICKSTART.md)
- **Angular component tests** (class-level vs DOM-level, `TestBed`) — [`guides/ANGULAR_TESTING_GUIDE.md`](../../guides/ANGULAR_TESTING_GUIDE.md)
