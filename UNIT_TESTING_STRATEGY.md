# MemberJunction Unit Testing Strategy

**Date:** February 7, 2026
**Scope:** Comprehensive unit testing strategy for the MJ monorepo
**Status:** Proposal for post-4.0 implementation
**Focus:** Unit testing with mock data (no live systems). Automated regression/suite/live system testing is a separate future initiative.

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Framework Recommendation: Vitest](#2-framework-recommendation-vitest)
3. [Architecture: Shared Test Infrastructure](#3-architecture-shared-test-infrastructure)
4. [Testability Challenges & Solutions](#4-testability-challenges--solutions)
5. [Monorepo Integration with Turborepo](#5-monorepo-integration-with-turborepo)
6. [CI/CD Integration](#6-cicd-integration)
7. [Developer Workflow](#7-developer-workflow)
8. [Coverage Strategy & Targets](#8-coverage-strategy--targets)
9. [Package Prioritization](#9-package-prioritization)
10. [Migration Plan](#10-migration-plan)
11. [Appendix: Existing Test Quality Matrix](#appendix-existing-test-quality-matrix)

---

## 1. Current State Assessment

### By the Numbers

| Metric | Value | Assessment |
|--------|-------|-----------|
| Total test files | 36 | Very low for 165 packages |
| Packages with real test runners | 12 | 7% of all packages |
| Packages with zero tests | ~153 | 93% untested |
| Test framework configs | 12 (11 Jest + 1 Vitest) | Fragmented |
| Mock infrastructure dirs | 2 (MJCore, APIKeys) | Minimal |
| Coverage thresholds enforced | 0 | No quality gates |
| Root `npm test` script | None | No unified runner |
| CI test workflow | None | Tests don't run in CI |
| Angular packages with tests | 0 of 61 | Complete gap |
| Actions packages with tests | 0 of 10 | Complete gap |

### What Tests Exist Today

Tests cluster in 8 areas, mostly newer packages:

| Package | Test Files | Quality | Pattern |
|---------|-----------|---------|---------|
| **MJCore** (3 files) | providerBase.concurrency, providerBase.refresh, localCacheManager.differential | Excellent | Class-based mocks, concurrency testing, edge cases |
| **MJServer** (1 file) | auth backward-compatibility | Good | `jest.fn()` mocks for auth providers |
| **APIKeys/Engine** (3 files) | APIKeyEngine, PatternMatcher, ScopeEvaluator | Excellent | Full mock infrastructure with `setMockRunViewResult()` |
| **AI/Agents** (5 files) | action-changes, memory, prompts, chat, payload-manager | Mixed | 2 use custom framework (not Jest), 3 are `.test.js` |
| **AI/MCPClient** (3 files) | AgentToolAdapter, RateLimiter, types | Good | Vitest with `vi.mock()` singleton mocking |
| **AI/Prompts** (1 file) | AIPromptRunner.failover | Poor | Tests reimplementation, not actual code |
| **MJStorage** (2 files) | FileStorageBase, util | Good | `jest.mock()` for `@memberjunction/*` packages |
| **Credentials** (1 file) | credential-validation | OK | Tests Ajv library behavior, not engine |
| **TestingFramework** (1 file) | variable-resolver | Excellent | Pure unit tests, no mocks needed |

### What's NOT Tested (Critical Gaps)

| Package | Risk Level | Why It Matters |
|---------|-----------|---------------|
| **MJGlobal** (ClassFactory, RegisterClass) | **Critical** | Underpins every other package |
| **MJCore** (BaseEntity, EntityInfo, RunView) | **Critical** | Entity lifecycle, dirty tracking, validation |
| **SQLServerDataProvider** (query building) | **Critical** | All server data access, SQL injection surface |
| **CodeGenLib** (code generation) | **Critical** | Bugs amplify into 145K lines of generated code |
| **GraphQLDataProvider** | **High** | All client data access |
| **Actions/Engine** | **High** | Action execution pipeline |
| **AI/Engine** | **High** | AI model orchestration |
| **AI/Agents** (base-agent.ts core logic) | **High** | 8,229-line file, agent orchestration |
| **All 61 Angular packages** | **Medium** | 675 components, zero coverage |
| **MetadataSync** | **Medium** | Metadata push/pull operations |

### Existing Config Inconsistencies

- **11 Jest configs, 1 Vitest config** -- no standardization
- Each config has different `moduleNameMapper` patterns with fragile relative paths
- MJServer uses ESM mode; all others use CJS
- Credentials/Engine uses deprecated `globals['ts-jest']`
- No shared base configuration
- 2 test files use a custom test framework (not Jest/Vitest at all)
- 1 test file tests a reimplementation instead of actual code

---

## 2. Framework Recommendation: Vitest

### Decision: Standardize on Vitest

After analyzing the MJ stack, ecosystem direction, and current state, **Vitest is the recommended framework** for all new and migrated tests.

### Rationale

| Factor | Jest | Vitest | MJ Impact |
|--------|------|--------|-----------|
| **Angular 21 alignment** | Jest builder being removed in Angular 22 | Default test runner in Angular 21 | MJ is on Angular 21; Jest investment creates debt |
| **ESM support** | Experimental, requires `ts-jest` + complex config | Native, zero config | MJServer already struggles with ESM in Jest |
| **TypeScript** | Requires `ts-jest` transform | Native TypeScript support via Vite | Eliminates 11 `ts-jest` configs |
| **Performance** | Baseline | 10-20x faster watch, 30-70% faster CI | 165 packages = major time savings |
| **Monorepo coverage** | Manual `istanbul-merge` for aggregation | Built-in with `projects` config | Coverage aggregation is free |
| **Vite/ESBuild alignment** | No synergy | Shares Vite toolchain with MJExplorer | Consistent build/test toolchain |
| **API compatibility** | N/A | `describe`, `it`, `expect` are identical | Migration is mechanical find-and-replace |
| **Migration cost** | N/A (status quo) | Low -- API-compatible, 11 configs to convert | Only 36 test files to touch |

### What Doesn't Change

- `describe` / `it` / `expect` / `beforeEach` / `afterEach` -- identical API
- Mock patterns -- `vi.fn()` replaces `jest.fn()`, `vi.mock()` replaces `jest.mock()`, `vi.spyOn()` replaces `jest.spyOn()`
- Test file naming -- `*.test.ts` and `*.spec.ts` both supported
- Test structure and assertion patterns -- all existing test logic is reusable

### What the Migration Looks Like

For each existing Jest test file, the changes are:

```diff
// Import change (only if explicitly importing jest globals)
- import { jest } from '@jest/globals';
+ import { vi } from 'vitest';

// Mock function replacement
- jest.fn()
+ vi.fn()

// Module mock replacement
- jest.mock('@memberjunction/global', () => ({ ... }))
+ vi.mock('@memberjunction/global', () => ({ ... }))

// Spy replacement
- jest.spyOn(obj, 'method')
+ vi.spyOn(obj, 'method')

// Timer replacement
- jest.useFakeTimers()
+ vi.useFakeTimers()

// Config file replacement
- jest.config.js (CommonJS, ts-jest)
+ vitest.config.ts (ESM, native TypeScript)
```

---

## 3. Architecture: Shared Test Infrastructure

### New Package: `@memberjunction/test-utils`

The single most impactful investment is creating a shared test utilities package. This eliminates the biggest barrier to writing tests: the boilerplate needed to mock MJ's global state.

```
packages/
  TestUtils/                              # NEW PACKAGE
    src/
      index.ts                            # Public API exports
      setup/
        global-state.ts                   # Reset singletons, ClassFactory, global store
        metadata-provider.ts              # Mock MetadataProvider (evolved from MJCore's TestMetadataProvider)
        run-view-provider.ts              # Mock RunViewProvider with configurable results
      mocks/
        mock-entity-factory.ts            # Create typed mock entities without DB
        mock-user.ts                      # Standard test user(s)
        mock-run-view-results.ts          # setMockRunViewResult() registry (from APIKeys pattern)
      fixtures/
        entity-metadata.ts                # Common entity metadata fixtures
        field-metadata.ts                 # Field metadata fixtures
      helpers/
        async.ts                          # Async test utilities (waitFor, flushPromises)
        type-safe-mock.ts                 # Type-safe mock helpers (no `as any` needed)
    vitest.config.ts
    package.json
    tsconfig.json
```

### Key Utilities

#### 1. `setupTestEnvironment()` -- The Bootstrap Function

Every test file that touches MJ infrastructure calls this once:

```typescript
import { setupTestEnvironment, teardownTestEnvironment } from '@memberjunction/test-utils';

beforeEach(() => {
    setupTestEnvironment();  // Resets singletons, installs mock providers
});

afterEach(() => {
    teardownTestEnvironment();  // Cleans up global state
});
```

What it does:
- Clears all `___SINGLETON__*` keys from `global` (resets all singletons)
- Installs `MockMetadataProvider` as `Metadata.Provider`
- Installs `MockRunViewProvider` as `RunView.Provider`
- Resets ClassFactory registrations to a known baseline
- Suppresses `console.log` noise (configurable)

#### 2. `mockRunView()` -- Configurable View Results

The pattern already proven in APIKeys/Engine, made generic and type-safe:

```typescript
import { mockRunView, clearMockRunViews } from '@memberjunction/test-utils';

// Configure mock results for specific entity queries
mockRunView('AI Models', [
    { ID: 'model-1', Name: 'GPT-4', VendorID: 'vendor-openai', MaxInputTokens: 128000 },
    { ID: 'model-2', Name: 'Claude 3.5', VendorID: 'vendor-anthropic', MaxInputTokens: 200000 },
]);

// RunView calls for 'AI Models' now return this mock data
const rv = new RunView();
const result = await rv.RunView({ EntityName: 'AI Models', ResultType: 'simple' });
// result.Results = the mock data above
```

#### 3. `createMockEntity<T>()` -- Type-Safe Entity Mocking

```typescript
import { createMockEntity } from '@memberjunction/test-utils';

// Creates a mock entity with getter/setter behavior matching BaseEntity
const agent = createMockEntity<AIAgentEntity>('AI Agents', {
    ID: 'agent-1',
    Name: 'Test Agent',
    Status: 'Active',
    AgentTypeID: 'type-loop',
});

// agent.Name returns 'Test Agent'
// agent.Set('Name', 'Updated') works with dirty tracking
// agent.Save() returns a configurable mock result
```

#### 4. `createMockUser()` -- Standard Test Users

```typescript
import { createMockUser } from '@memberjunction/test-utils';

const user = createMockUser();           // Standard test user
const admin = createMockUser('admin');   // Admin user with elevated permissions
const readonly = createMockUser('readonly'); // Read-only user
```

### Why This Matters

Without shared test utils, every developer writing a test for any MJ package must:
1. Figure out how to mock `Metadata.Provider` (257 lines of TestMetadataProvider)
2. Figure out how to mock `RunView.Provider`
3. Figure out how to reset singletons between tests
4. Figure out how to create mock entities that behave like BaseEntity
5. Figure out how to prevent ClassFactory registration leakage

With `@memberjunction/test-utils`, the bootstrap is one function call. The barrier drops from "hours of reverse-engineering" to "one import statement."

---

## 4. Testability Challenges & Solutions

### Challenge 1: Singleton-Heavy Architecture (~17 singletons)

MJ uses `BaseSingleton<T>` for engines, managers, and global state. Singletons store instances in Node's `global` object using `___SINGLETON__<ClassName>` keys.

**Solution:**
```typescript
// In @memberjunction/test-utils/src/setup/global-state.ts
export function resetAllSingletons(): void {
    const g = global as Record<string, unknown>;
    for (const key of Object.keys(g)) {
        if (key.startsWith('___SINGLETON__')) {
            delete g[key];
        }
    }
}
```

This runs in `beforeEach` and gives each test a clean slate.

**Future improvement (post-4.0.x):** Add a `resetInstance()` static method to `BaseSingleton`:

```typescript
// In BaseSingleton.ts
protected static resetInstance(className?: string): void {
    const key = BaseSingleton._globalKeyPrefix + (className || this.name);
    const g = GetGlobalObjectStore();
    if (g) delete g[key];
}
```

### Challenge 2: `Metadata.Provider` / `RunView.Provider` Global Statics

Both use the MJGlobal object store pattern. Any code that instantiates entities or runs views needs these set.

**Solution:** `setupTestEnvironment()` installs lightweight mock providers:

```typescript
export function setupTestEnvironment(options?: TestEnvironmentOptions): void {
    resetAllSingletons();

    // Install mock metadata provider
    const mockMetadata = new MockMetadataProvider(options?.entities);
    Metadata.Provider = mockMetadata;

    // Install mock run view provider
    const mockRunView = new MockRunViewProvider();
    RunView.Provider = mockRunView;

    // Register mock provider for the global object store
    const g = MJGlobal.Instance.GetGlobalObjectStore();
    g['MJ_MetadataProvider'] = mockMetadata;
    g['MJ_RunViewProvider'] = mockRunView;
}
```

### Challenge 3: ClassFactory Registration Side Effects

Importing any file with `@RegisterClass` triggers registration as a side effect. This means test isolation is hard -- importing one module can register dozens of classes.

**Solution:** Two-pronged approach:
1. **Accept registrations from direct imports** -- these are part of the test scope
2. **Reset between tests** by saving/restoring the ClassFactory state:

```typescript
let savedRegistrations: ClassRegistration[];

beforeEach(() => {
    savedRegistrations = [...MJGlobal.Instance.ClassFactory.Registrations];
});

afterEach(() => {
    MJGlobal.Instance.ClassFactory.Registrations = savedRegistrations;
});
```

**Future improvement:** Add `ClassFactory.snapshot()` / `ClassFactory.restore()` methods.

### Challenge 4: Cross-Singleton Dependencies

AIEngine depends on AIEngineBase.Instance which depends on Metadata.Provider. Testing any engine requires the entire chain.

**Solution:** `setupTestEnvironment()` handles the chain. For targeted engine testing, register mock engine subclasses:

```typescript
// Register a mock AI engine that doesn't need real data
@RegisterClass(AIEngineBase, undefined, 999) // High priority = overrides real
class MockAIEngineBase extends AIEngineBase {
    public override async Config(forceRefresh?: boolean): Promise<void> {
        // No-op -- doesn't load from database
    }
}
```

### Challenge 5: Entity Getter/Setter Behavior

BaseEntity uses getter/setter methods for all fields. Simple objects `{ Name: 'foo' }` don't match the entity interface. Tests need entities that behave correctly.

**Solution:** `createMockEntity<T>()` creates a Proxy-based mock that:
- Implements getter/setter pairs from entity metadata
- Tracks dirty state
- Supports `GetAll()`, `Set()`, `Get()` methods
- Returns configurable results from `Save()` / `Delete()`

---

## 5. Monorepo Integration with Turborepo

### turbo.json Changes

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
            "outputs": ["coverage/**"],
            "dependsOn": ["build"],
            "cache": true
        },
        "test:watch": {
            "cache": false,
            "persistent": true
        },
        "start": { "cache": false, "persistent": true },
        "watch": { "cache": false, "persistent": true }
    }
}
```

Key decisions:
- `"test"` depends on `"build"` -- tests run against compiled output, not source (consistent with how packages are consumed)
- `"test"` is **cached** -- unchanged packages skip test runs (massive time savings)
- Coverage output is a cached artifact
- `"test:watch"` is uncached and persistent for development

### Root package.json Scripts

```json
{
    "scripts": {
        "test": "turbo test",
        "test:watch": "turbo test:watch",
        "test:coverage": "turbo test -- --coverage",
        "test:ci": "turbo test -- --coverage --reporter=default --reporter=junit"
    }
}
```

### Per-Package Configuration

Two options, both valid:

**Option A: Per-package `vitest.config.ts`** (simpler, per Turbo docs)
```typescript
// packages/MJCore/vitest.config.ts
import { defineConfig } from 'vitest/config';
import { sharedConfig } from '@memberjunction/test-utils/vitest-preset';

export default defineConfig({
    ...sharedConfig,
    test: {
        ...sharedConfig.test,
        include: ['src/__tests__/**/*.test.ts'],
    },
});
```

**Option B: Root `vitest.workspace.ts`** (better coverage aggregation)
```typescript
// vitest.workspace.ts
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
    'packages/MJGlobal',
    'packages/MJCore',
    'packages/MJServer',
    'packages/AI/*',
    'packages/Actions/*',
    // ... all packages with tests
]);
```

**Recommendation: Start with Option A** (per-package configs run by Turbo). This integrates naturally with Turbo's caching and incremental runs. Switch to Option B later if coverage aggregation becomes a pain point.

### Filtering

```bash
# Run tests for one package
npx turbo test --filter=@memberjunction/core

# Run tests for changed packages only
npx turbo test --filter=...[HEAD~1]

# Run tests for a package and its dependents
npx turbo test --filter=...@memberjunction/global
```

---

## 6. CI/CD Integration

### New GitHub Workflow: `.github/workflows/test.yml`

```yaml
name: Unit Tests

on:
  pull_request:
    branches: [next]
    paths:
      - 'packages/**'
      - 'vitest.workspace.ts'
  push:
    branches: [next]
    paths:
      - 'packages/**'

jobs:
  test:
    name: Run unit tests
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: 'npm'

      - run: npm ci

      - run: npm run build

      - name: Run tests with coverage
        run: npx turbo test -- --coverage --reporter=default --reporter=junit
        env:
          FORCE_COLOR: 1

      - name: Upload coverage
        if: always()
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          flags: unit-tests
          fail_ci_if_error: false

      - name: Comment coverage on PR
        if: github.event_name == 'pull_request'
        uses: davelosert/vitest-coverage-report-action@v2
        with:
          vite-config-path: vitest.workspace.ts
```

### Coverage Gates (Progressive)

Phase 1 (no enforcement):
```yaml
# Just report, don't fail
fail_ci_if_error: false
```

Phase 2 (soft enforcement):
```yaml
# Fail if coverage DECREASES from baseline
- name: Check coverage regression
  run: npx vitest --coverage --coverage.thresholds.100=false
```

Phase 3 (hard enforcement):
```yaml
# Enforce minimums per critical package
# Configured in each package's vitest.config.ts
coverage:
  thresholds:
    statements: 60
    branches: 50
    functions: 60
    lines: 60
```

---

## 7. Developer Workflow

### Writing a New Test (The Happy Path)

A developer wants to add tests for a new feature in `@memberjunction/actions`:

**Step 1:** Add vitest config (if not present)
```typescript
// packages/Actions/Engine/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/__tests__/**/*.test.ts'],
        testTimeout: 30000,
    },
});
```

**Step 2:** Update package.json
```json
{
    "scripts": {
        "test": "vitest run",
        "test:watch": "vitest"
    },
    "devDependencies": {
        "vitest": "^3.0.0",
        "@memberjunction/test-utils": "4.0.0"
    }
}
```

**Step 3:** Write the test
```typescript
// packages/Actions/Engine/src/__tests__/ActionEngine.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestEnvironment, teardownTestEnvironment, mockRunView } from '@memberjunction/test-utils';
import { ActionEngineServer } from '../generic/ActionEngine';

describe('ActionEngineServer', () => {
    beforeEach(() => {
        setupTestEnvironment();

        // Configure mock data for this test suite
        mockRunView('Actions', [
            { ID: 'action-1', Name: 'Send Email', Status: 'Active', CategoryID: 'cat-1' },
            { ID: 'action-2', Name: 'Create Record', Status: 'Active', CategoryID: 'cat-2' },
        ]);

        mockRunView('Action Params', [
            { ID: 'p1', ActionID: 'action-1', Name: 'To', ValueType: 'Scalar', IsRequired: true },
            { ID: 'p2', ActionID: 'action-1', Name: 'Subject', ValueType: 'Scalar', IsRequired: true },
        ]);
    });

    afterEach(() => {
        teardownTestEnvironment();
    });

    it('should resolve action by name', async () => {
        const engine = ActionEngineServer.Instance;
        await engine.Config(false);
        const action = engine.Actions.find(a => a.Name === 'Send Email');
        expect(action).toBeDefined();
        expect(action!.ID).toBe('action-1');
    });

    it('should validate required params', async () => {
        const engine = ActionEngineServer.Instance;
        await engine.Config(false);
        // ... test validation logic
    });
});
```

**Step 4:** Run tests
```bash
# Single package
cd packages/Actions/Engine && npm test

# Watch mode for active development
cd packages/Actions/Engine && npm run test:watch

# All tests via Turbo (from root)
npm test

# Only changed packages
npx turbo test --filter=...[HEAD~1]
```

### Test File Conventions

| Convention | Standard |
|-----------|----------|
| **File location** | `src/__tests__/` directory |
| **File naming** | `<module-name>.test.ts` |
| **Test structure** | `describe('ClassName')` → `describe('methodName')` → `it('should ...')` |
| **Setup/teardown** | `beforeEach` / `afterEach` with `setupTestEnvironment()` / `teardownTestEnvironment()` |
| **Mock data** | Via `@memberjunction/test-utils` helpers, never `as any` |
| **Assertions** | Meaningful (`expect(result.Name).toBe('Test')` not `expect(result).toBeDefined()`) |
| **Negative tests** | Every positive test has a corresponding negative test |

---

## 8. Coverage Strategy & Targets

### Coverage Metrics Tracked

| Metric | What It Measures |
|--------|-----------------|
| **Statement coverage** | % of statements executed |
| **Branch coverage** | % of if/else/switch branches taken |
| **Function coverage** | % of functions called |
| **Line coverage** | % of lines executed |

### Progressive Targets

| Phase | Timeline | Target | Enforcement |
|-------|----------|--------|-------------|
| **Phase 1** | 4.0.x | Establish baselines | Report only |
| **Phase 2** | 4.1 | No regressions from baseline | CI fails if coverage drops |
| **Phase 3** | 4.2 | Critical packages ≥ 60% | Per-package thresholds |
| **Phase 4** | 4.3+ | Overall ≥ 50%, critical ≥ 80% | Repo-wide thresholds |

### What Counts as "Critical"

Packages where bugs have outsized blast radius:

| Tier | Packages | Target (Phase 3) |
|------|----------|-----------------|
| **Tier 1** (foundation) | MJGlobal, MJCore | 80% |
| **Tier 2** (data access) | SQLServerDataProvider, GraphQLDataProvider | 70% |
| **Tier 3** (server) | MJServer (auth, resolvers) | 60% |
| **Tier 4** (AI core) | AI/Core, AI/Engine, AI/Agents | 60% |
| **Tier 5** (tooling) | CodeGenLib | 60% |

---

## 9. Package Prioritization

### Priority 1: Foundation (Immediate -- 4.0.x)

These packages should be tested first because every other package depends on them:

| Package | Key Modules to Test | Estimated Tests | Why First |
|---------|-------------------|-----------------|-----------|
| **@memberjunction/test-utils** | (The new package itself) | 20 | Everything else depends on it |
| **MJGlobal** | ClassFactory, RegisterClass, ObjectCache, SQLExpressionValidator | 40 | Foundation of the class system |
| **MJCore** (expand) | BaseEntity (dirty tracking, validation, Save logic), EntityInfo, CompositeKey, RunView | 60 | Entity lifecycle is the core abstraction |

**Estimated effort:** 2-3 weeks for one developer. The test-utils package is the enabler for everything else.

### Priority 2: Data & Security (4.1)

| Package | Key Modules to Test | Estimated Tests | Why |
|---------|-------------------|-----------------|-----|
| **SQLServerDataProvider** | Query building (ExtraFilter, OrderBy), SQL expression validation, transaction management | 50 | SQL injection surface, all server data flows through here |
| **MJServer** (expand) | Context function (auth flow), ResolverBase (permissions, field mapping), REST endpoints | 30 | Security critical |
| **GraphQLDataProvider** | Query construction, response parsing, cache behavior | 30 | All client data access |

**Estimated effort:** 3-4 weeks.

### Priority 3: AI & Actions (4.1-4.2)

| Package | Key Modules to Test | Estimated Tests | Why |
|---------|-------------------|-----------------|-----|
| **AI/Core** | BaseLLM (routing, streaming detection), BaseModel, ErrorAnalyzer | 25 | AI provider abstraction |
| **AI/Agents** | BaseAgent (loop constructs, action discovery, sub-agent dispatch), PayloadManager | 40 | Largest file in codebase, complex orchestration |
| **AI/Engine** | AIEngine (model selection, failover) | 20 | Model orchestration |
| **Actions/Engine** | ActionEngine (execution pipeline, filters, param handling) | 25 | Business logic execution |
| **CodeGenLib** | Entity class generation, SQL generation, manifest generation | 35 | Bugs here amplify into 145K lines |

**Estimated effort:** 4-5 weeks.

### Priority 4: Supporting Packages (4.2)

| Package | Key Modules to Test | Estimated Tests |
|---------|-------------------|-----------------|
| **MetadataSync** | Validation, push/pull, reference resolution | 30 |
| **Templates** | Template resolution, rendering | 15 |
| **Communication** | Email construction, message formatting | 15 |
| **Credentials** (expand) | CredentialEngine (not just Ajv) | 15 |
| **MJExportEngine** | Export format handling | 10 |

### Priority 5: Angular Components (4.2-4.3)

Angular testing is the largest effort and should start after the core is solid:

| Priority | Components | Approach |
|----------|-----------|----------|
| First | Utility services (SharedService, NavigationService) | Vitest (no DOM needed) |
| Second | Engine-wrapper components (dashboards, data grids) | Vitest + Angular TestBed |
| Third | Form components (base-forms, entity forms) | Vitest + Angular TestBed |
| Fourth | Complex UI components (flow-editor, conversations, skip-chat) | Vitest + browser mode |

**Note:** Angular 21's Vitest integration handles TestBed setup. Use `provideExperimentalZonelessChangeDetection()` for signal-based components.

---

## 10. Migration Plan

### Phase 0: Prerequisites (Week 1)

- [ ] Create `packages/TestUtils/` package structure
- [ ] Implement `setupTestEnvironment()` / `teardownTestEnvironment()`
- [ ] Implement `mockRunView()` / `createMockEntity()` / `createMockUser()`
- [ ] Export a shared `vitest-preset` config
- [ ] Add `"test"` task to `turbo.json`
- [ ] Add `"test": "turbo test"` to root `package.json`
- [ ] Write tests for the test-utils package itself

### Phase 1: Migrate Existing Tests (Week 2-3)

Convert all 36 existing test files from Jest to Vitest:

- [ ] MJCore (3 files): Replace `jest.` → `vi.`, update config
- [ ] MJServer (1 file): Replace `jest.` → `vi.`, switch from ESM Jest to Vitest native
- [ ] APIKeys/Engine (3 files): Replace mocks, update config
- [ ] AI/Agents: Convert custom framework tests to Vitest `describe`/`it`
- [ ] AI/MCPClient (3 files): Already Vitest -- update to use shared preset
- [ ] AI/Prompts (1 file): Refactor to test actual `AIPromptRunner`, not reimplementation
- [ ] MJStorage (2 files): Replace `jest.` → `vi.`, update config
- [ ] Credentials (1 file): Replace config, add tests for `CredentialEngine` (not just Ajv)
- [ ] TestingFramework (1 file): Replace config
- [ ] AI/Providers (2 files): Replace configs
- [ ] Remove all 11 `jest.config.js` files
- [ ] Remove `ts-jest` dependency from all packages

### Phase 2: Foundation Tests (Week 3-5)

Write new tests for Tier 1 packages:

- [ ] MJGlobal: ClassFactory (register, create, priority, key lookup, reset)
- [ ] MJGlobal: RegisterClass decorator
- [ ] MJGlobal: ObjectCache (set, get, clear, expiry)
- [ ] MJGlobal: SQLExpressionValidator (allowlist, blocklist, injection attempts)
- [ ] MJCore: BaseEntity (create, load, set, dirty tracking, save validation)
- [ ] MJCore: EntityInfo (field lookup, relationship traversal, status assertions)
- [ ] MJCore: CompositeKey (equality, parsing, serialization)
- [ ] MJCore: RunView (simple results, entity objects, batch, error handling)
- [ ] MJCore: Metadata facade (provider delegation, caching)

### Phase 3: CI Integration (Week 4)

- [ ] Create `.github/workflows/test.yml`
- [ ] Configure Codecov (or alternative) for coverage tracking
- [ ] Add coverage PR comments via `vitest-coverage-report-action`
- [ ] Set up coverage baseline (no regression enforcement)

### Phase 4: Expand Coverage (Week 5+)

Follow the priority order from Section 9, adding tests for each package group incrementally.

---

## Appendix: Existing Test Quality Matrix

| Test File | Quality (1-5) | Mocking | Edge Cases | Negative Tests | Issue |
|-----------|--------------|---------|-----------|---------------|-------|
| providerBase.concurrency | 5 | Class-based | Excellent | Yes | `console.log` noise |
| providerBase.refresh | 4 | Class-based | Good | Yes | Known issue test doesn't assert |
| localCacheManager.differential | 5 | Mock storage | Excellent | Yes | Minor `as` casts |
| backward-compatibility | 4 | `jest.fn()` | Good | Yes | Env var leakage |
| APIKeyEngine | 5 | Mock module files | Excellent | Yes | `as any` for user info |
| PatternMatcher | 5 | None (pure) | Excellent | Yes | None |
| ScopeEvaluator | 4 | Mock module files | Good | Yes | Heavy boilerplate |
| AgentToolAdapter | 4 | `vi.mock()` | Good | Yes | Type safety gap |
| RateLimiter | 5 | Fake timers | Excellent | Yes | None |
| action-changes | 3 | Custom functions | Good | Yes | **Custom framework, not Jest** |
| AIPromptRunner.failover | 2 | Reimplementation | Good | Yes | **Tests mock, not real code** |
| util (MJStorage) | 3 | `jest.mock()` | OK | Yes | 6x `as any` casts |
| FileStorageBase | 4 | Subclass mock | Good | Yes | Boilerplate |
| credential-validation | 3 | None | Good | Yes | Tests Ajv, not engine |
| variable-resolver | 5 | None (pure) | Excellent | Yes | None |

### Patterns to Standardize

1. **Best pattern for data access mocking:** APIKeys/Engine `setMockRunViewResult()` → promote to `@memberjunction/test-utils`
2. **Best pattern for provider mocking:** MJCore `TestMetadataProvider` → promote to `@memberjunction/test-utils`
3. **Best pattern for singleton mocking:** MCPClient `vi.mock()` with factory → document as standard pattern
4. **Best pattern for time-based testing:** MCPClient RateLimiter `vi.useFakeTimers()` → document as standard pattern
5. **Best pattern for pure logic testing:** PatternMatcher, VariableResolver → no setup needed, just import and test
