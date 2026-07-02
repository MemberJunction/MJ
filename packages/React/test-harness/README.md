# @memberjunction/react-test-harness

Automated test harness for MemberJunction interactive React components. Provides static analysis (linting) with 57 extensible rules, type inference, constraint validation, browser-based rendering via Playwright, and a CLI for running test suites.

## Quick Start

### Linting a Component

```typescript
import { ComponentLinter } from '@memberjunction/react-test-harness';

const result = await ComponentLinter.lintComponent(
  code,           // JavaScript/JSX source
  'MyComponent',  // Component name
  componentSpec,  // ComponentSpec with metadata
  true,           // isRootComponent
);

if (!result.success) {
  for (const v of result.violations) {
    console.log(`[${v.severity}] ${v.rule}: ${v.message} (line ${v.line})`);
  }
}
```

### Browser-Based Testing

```typescript
import { ComponentRunner } from '@memberjunction/react-test-harness';

const runner = new ComponentRunner();
const result = await runner.executeComponent(componentSpec, {
  contextUser,
  props: { data: testData },
});

console.log('Rendered:', result.success);
console.log('Errors:', result.errors);
```

### Connecting to an existing browser

By default the harness launches its own throwaway Chromium. You can instead attach
to an already-running browser — useful for watching component runs in a browser you
control, or for reusing a warm/remote browser (pool, Docker) instead of paying a
cold launch each run.

```typescript
// Attach to a real Chrome started with --remote-debugging-port=9222 (CDP)
const harness = new ReactTestHarness({ connect: 'http://localhost:9222' });

// Attach to a Playwright server started via chromium.launchServer() (ws endpoint)
const harness = new ReactTestHarness({ connect: 'ws://localhost:55001/<id>' });
```

- **Auto-detect:** `http(s)://` endpoints use CDP (`connectOverCDP`); `ws(s)://`
  endpoints use a Playwright server (`connect`). A raw CDP websocket also starts
  with `ws://` — pass `connectType: 'cdp'` to force CDP in that case.
- **Env-var fallback:** set `MJ_REACT_TEST_HARNESS_CONNECT` to the endpoint instead
  of passing `connect` (so the `mj-react-test` CLI can attach without a new flag).
- **Session reuse:** by default a fresh isolated context is created inside the
  attached browser. Set `reuseExistingContext: true` (or
  `MJ_REACT_TEST_HARNESS_REUSE_CONTEXT=true`) to reuse the browser's existing
  default context and share its cookies/auth/session. This breaks per-test
  isolation, so keep the default for parallel runs.
- **Lifecycle safety:** when attached, `harness.close()` only closes the pages and
  contexts the harness created — it never closes a browser it did not launch, nor a
  reused/shared context. The external browser's lifecycle is the caller's.
- `headless` is ignored when attaching (the external browser already decided).

### Writing Custom Rules

Rules extend `BaseLintRule` and auto-register via `@RegisterClass`:

```typescript
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '@memberjunction/react-test-harness';

@RegisterClass(BaseLintRule, 'my-custom-rule')
export class MyCustomRule extends BaseLintRule {
  get Name() { return 'my-custom-rule'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast, componentName, componentSpec, options, typeContext) {
    const violations = [];
    // Babel AST traversal and validation logic
    return violations;
  }
}
```

External packages (e.g., Skip-Brain) can define custom rules — the linter discovers them automatically via MJGlobal's ClassFactory.

## Testing

```bash
cd packages/React/test-harness

# Build (required before testing)
npm run build

# Run all 425 tests
npx vitest run

# Run with verbose output (see individual fixture results)
npx vitest run --reporter=verbose

# Watch mode
npx vitest
```

### Database Connection (Optional)

Some rules validate against entity metadata from the database. Create `.env`:

```
DB_HOST=your-host
DB_DATABASE=your-db
DB_USERNAME=your-user
DB_PASSWORD=your-password
DB_PORT=1433
DB_TRUST_SERVER_CERTIFICATE=1
```

Without a database, DB-dependent fixtures still run but rules that need entity metadata emit low-severity warnings instead of violations.

## Architecture

See [LINTER-ARCHITECTURE.md](LINTER-ARCHITECTURE.md) for comprehensive documentation including:
- How rules work and how to add new ones
- Rule categories and what each validates
- Type inference engine capabilities
- Metadata fallback strategy
- SQL dialect configuration
- Test fixture organization

## Lint Rules (57)

### Data Access (5 rules)
- `runview-call-validation` — RunView/RunViews call-site validation
- `runquery-call-validation` — RunQuery call-site validation with parameter type checking
- `data-result-validation` — RunView/RunQuery/Search result usage patterns
- `search-availability-check` — `utilities.search` null guard
- `search-call-validation` — Search/PreviewSearch parameter validation

### Entity & Query Fields (4 rules)
- `entity-field-access-validation` — Field access on RunView results (typos, case, type coercion)
- `query-result-field-access-validation` — Field access on RunQuery results
- `chart-field-validation` — Chart prop field references
- `datagrid-field-validation` — Grid column field references

### Runtime Constraints (8 rules)
- `no-import-statements`, `no-export-statements`, `no-require-statements`
- `no-iife-wrapper`, `no-return-component`, `no-window-access`
- `use-function-declaration`, `single-function-only`

### Component Structure (9 rules)
- `react-component-naming`, `component-name-mismatch`, `pass-standard-props`
- `no-react-destructuring`, `no-data-prop`, `no-child-implementation`
- `component-props-validation`, `child-component-prop-validation`
- `component-usage-without-destructuring`

### Dependencies (7 rules)
- `component-not-in-dependencies`, `undefined-component-usage`
- `unused-libraries`, `unused-component-dependencies`
- `library-variable-names`, `dependency-shadowing`, `validate-component-references`

### Callbacks & Events (1 consolidated rule)
- `callback-event-validation` — Method usage, parameter signatures, passthrough, event null-checks

### Best Practices (8 rules)
- `prefer-async-await`, `prefer-jsx-syntax`, `react-hooks-rules`
- `useeffect-unstable-dependencies`, `unsafe-array-operations`, `unsafe-formatting-methods`
- `string-replace-all-occurrences`, `string-template-validation`

### Type Safety (2 rules)
- `type-inference-errors`, `type-mismatch-operation`

### Styles (1 consolidated rule)
- `styles-validation` — Invalid path access, unsafe patterns

### Utilities (3 rules)
- `utilities-api-validation`, `utilities-no-direct-instantiation`, `ai-tools-availability-check`

### State & Settings (5 rules)
- `saved-user-settings-pattern`, `noisy-settings-updates`, `prop-state-sync`
- `property-name-consistency`, `server-reload-on-client-operation`

### Other (4 rules)
- `no-use-reducer`, `required-queries-not-called`
- `undefined-jsx-component`, `no-child-implementation`

## Exports

```typescript
// Core linting
export { ComponentLinter, LintResult, Violation } from './lib/component-linter';
export { BaseLintRule } from './lib/lint-rule';

// Test harness
export { ReactTestHarness, TestHarnessOptions } from './lib/test-harness';
export { ComponentRunner, ComponentExecutionOptions, ComponentExecutionResult } from './lib/component-runner';
export { BrowserManager, BrowserContextOptions } from './lib/browser-context';

// Utilities
export { LibraryLintCache, CompiledLibraryRules, CompiledValidator } from './lib/library-lint-cache';
export { ComponentSpec } from '@memberjunction/interactive-component-types';
```

## License

ISC
