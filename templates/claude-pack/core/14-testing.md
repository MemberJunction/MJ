# Testing — vitest, no database, fast

MJ standardizes on **Vitest** for unit tests across every package. Jest is
deprecated and no longer in the workspace. Tests are unit-level by default:
**no database connections**, **no network**, **no real filesystem** beyond
temp dirs.

## File layout

```
packages/YourPackage/
├── src/
│   ├── module.ts
│   ├── service.ts
│   └── __tests__/
│       ├── module.test.ts        ← one test file per source file
│       └── service.test.ts
├── package.json                  ← "test": "vitest run"
└── vitest.config.ts              ← extends root vitest.shared
```

One test file per source file is the default convention. For very small
source files you can group multiple in one test file; for very large ones,
split per-method or per-feature.

## Naming

- Test files end in `.test.ts` (not `.spec.ts`)
- Tests live in `src/__tests__/` (mirrors the source's folder)
- Test names read as specifications:

```typescript
describe('OrderService.calculateTotal', () => {
    it('returns 0 for an empty order', () => { … });
    it('sums line-item totals correctly', () => { … });
    it('applies discount when promo code is valid', () => { … });
    it('throws when negative quantities are present', () => { … });
});
```

Good test names tell you what the code *guarantees* without reading the
test body. "should work" is not a good name.

## Imports

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
```

All vitest helpers come from the `vitest` package. No `jest.*`, no `chai`,
no `sinon` — the imports above plus standard node modules cover ~95% of
what you need.

## Running tests

| Command | What it does |
|---|---|
| `npm test` (from repo root) | Runs every package's tests via Turbo |
| `cd packages/Foo && npm run test` | Runs one package's tests |
| `npm run test:watch` (per-package) | Watch mode |
| `npm run test:coverage` (root) | Generates coverage reports |
| `npx turbo run test --filter=...[HEAD~1]` | Tests packages changed since last commit |

Turbo caches test results: unchanged packages skip test execution on
re-runs, so the test suite stays fast even as it grows.

## Adding tests to a new package

There's a scaffold script:

```bash
node scripts/scaffold-tests.mjs packages/YourPackage
```

It creates `vitest.config.ts`, the `src/__tests__/` folder, a starter test,
and wires `"test": "vitest run"` into `package.json`.

## What unit tests must NOT do

- **No database connections.** Mock metadata, mock entity providers, mock
  RunView. `@memberjunction/test-utils` provides helpers — see below.
- **No real network.** Mock `fetch` / `https.get` / Axios. Vitest's
  `vi.fn()` is your friend.
- **No real filesystem outside temp dirs.** Use `os.tmpdir()` + `mkdtempSync`
  for cases that genuinely need FS; clean up in `afterEach`.
- **No timing dependencies.** Don't `setTimeout(..., 100)` then expect
  something. Use `vi.useFakeTimers()` and `vi.advanceTimersByTime(100)`.
- **No environment-coupling.** `process.env` writes must restore in
  `afterEach`.

Unit tests must be **deterministic** and **fast** (target: < 5 seconds
per file).

## `@memberjunction/test-utils`

Shared mocking helpers used across MJ packages:

- **Singleton reset** — clear singleton state between tests
- **Mock entity** — quick `BaseEntity`-shaped fakes
- **Mock RunView** — returns canned `RunView` results without touching a
  real provider

```typescript
import { createMockEntity, mockRunView } from '@memberjunction/test-utils';

beforeEach(() => {
    mockRunView({
        'Orders': { Results: [createMockEntity({ ID: '1', Status: 'Open' })] }
    });
});
```

Reach for these instead of building one-off mocks. Consistency across the
test suite makes mocks predictable.

## Test structure

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('OrderService', () => {
    let service: OrderService;

    beforeEach(() => {
        // Reset state between tests — singletons especially
        service = new OrderService();
    });

    describe('calculateTotal', () => {
        it('handles the normal case', () => {
            const order = makeOrder([
                { sku: 'A', price: 10, qty: 2 },
                { sku: 'B', price: 5,  qty: 1 },
            ]);
            expect(service.calculateTotal(order)).toBe(25);
        });

        it('handles edge case: empty order returns 0', () => {
            expect(service.calculateTotal(makeOrder([]))).toBe(0);
        });

        it('throws on invalid input', () => {
            expect(() => service.calculateTotal(null)).toThrow();
        });
    });
});
```

Common patterns:

- **Group related tests in nested `describe`**, named after the method
- **Use a fresh instance in `beforeEach`** — don't share state across tests
- **Each `it`** asserts ONE thing, not five

## When tests fail after your change

**Tests are part of the source code.** If you change a function's signature,
return shape, or behavior, **you also update its tests** in the same
commit. The same applies if a refactor renames things or moves them.

The CLAUDE.md project rule:

> When modifying ANY package's source code, you MUST run that package's
> unit tests before considering the work complete.

```bash
cd packages/YourPackage
npm run test
```

If tests fail because of your changes, **update them to match the new
behavior**. If tests fail for unrelated reasons, **fix them** — never
leave a broken test for someone else.

Common things that drift if you don't watch for them:

- Renamed functions tests still reference by old name
- Changed return shapes test assertions still expect
- New required parameters test mocks don't provide
- Removed exports tests still import

All YOUR responsibility when you make the change.

## CI integration

- **Every PR** must pass unit tests before merging (GitHub Actions
  enforces this).
- **Every release** runs the full-stack regression suite via Docker
  Compose.
- Turbo caches test results between PRs — unchanged packages skip
  execution.

## Mocking node modules

When a test needs to mock a module:

```typescript
import { vi } from 'vitest';

// Module-level mock — affects all imports in this test file
vi.mock('node:https', () => ({
    get: vi.fn((url, cb) => { /* … */ }),
}));

// Or pass a mock as a dependency parameter — usually cleaner
function fetchSomething(httpGet: HttpGetter = realHttpGet) { … }
// Test: fetchSomething(myFakeGetter)
```

**Prefer dependency injection over `vi.mock`** for new code. It's clearer
to read, doesn't require module hoisting, and the production code path
documents the seam.

## The day-1 checklist

- [ ] Test file lives in `src/__tests__/`, ends in `.test.ts`
- [ ] Uses `import { describe, it, expect, vi } from 'vitest'`
- [ ] Names read as specifications, not "should work"
- [ ] No real database, network, or non-temp filesystem
- [ ] `beforeEach` creates fresh state; `afterEach` cleans up
- [ ] After modifying source, ran `npm run test` and the tests still pass
- [ ] If tests now fail because of your changes, you updated them in the
      same commit
