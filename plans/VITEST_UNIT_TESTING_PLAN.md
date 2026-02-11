# Vitest Unit Testing Plan for MemberJunction

## Overview

Stand up a consistent, Vitest-based unit testing framework across the entire MemberJunction monorepo, with GitHub Actions CI enforcement that blocks PR merges without passing tests.

**Scope**: Unit and integration tests only. This does NOT replace the existing `@memberjunction/testing-engine` runtime fullstack testing framework — these are complementary layers.

---

## Current State

| Metric | Value |
|--------|-------|
| Total packages | ~165 |
| Packages with tests | 17 (10%) |
| Test files | 36 |
| Frameworks in use | Jest (10 pkgs), Vitest (2 pkgs), ts-node (1 pkg), Karma (1 pkg, no tests) |
| Root `npm test` script | None |
| Turbo test task | None |
| GitHub Actions test gate | None |
| Coverage reporting | None |

---

## Phase 1: Foundation (Infrastructure)

### 1.1 Install Vitest at Root

Add to root `package.json` devDependencies:

```
vitest ^4.x
@vitest/coverage-v8 ^4.x
vite-tsconfig-paths ^5.x
```

Add root scripts:

```json
{
  "test": "turbo run test",
  "test:watch": "turbo run test:watch",
  "test:coverage": "vitest run --coverage"
}
```

### 1.2 Create Shared Vitest Config

**File**: `/vitest.shared.ts`

Shared configuration that all packages import via `mergeConfig`:

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    testTimeout: 30000,
    restoreMocks: true,
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/generated/**'],
  },
});
```

### 1.3 Create Root Vitest Config

**File**: `/vitest.config.ts`

Root config for aggregated coverage runs (used by `npm run test:coverage`):

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    projects: [
      'packages/*',
      'packages/Actions/*',
      'packages/AI/*',
      'packages/AI/Providers/*',
      'packages/AI/Vectors/*',
      'packages/AI/Vectors/Memory/*',
      'packages/AI/AgentManager/*',
      'packages/AI/Recommendations/*',
      'packages/Communication/*',
      'packages/Communication/providers/*',
      'packages/Templates/*',
      'packages/Credentials/*',
      'packages/APIKeys/*',
      'packages/Scheduling/*',
      'packages/TestingFramework/*',
      'packages/React/*',
    ],
    coverage: {
      provider: 'v8',
      enabled: false,
      reportsDirectory: './coverage',
      include: [
        'packages/*/src/**/*.ts',
        'packages/*/*/src/**/*.ts',
        'packages/*/*/*/src/**/*.ts',
      ],
      exclude: [
        '**/__tests__/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/generated/**',
        '**/dist/**',
        '**/node_modules/**',
        '**/*.d.ts',
      ],
      reporter: ['text', 'text-summary', 'json', 'html', 'lcov'],
      thresholds: {
        // Start low, ratchet up as tests are added
        statements: 10,
        branches: 10,
        functions: 10,
        lines: 10,
      },
    },
  },
});
```

**Note**: Angular packages (`packages/Angular/*`) are excluded from the root projects list for now. They require jsdom/browser-mode configuration and will be added in Phase 3.

### 1.4 Add Turbo Test Task

**File**: `/turbo.json` — add `test` and `test:watch` tasks:

```json
{
  "tasks": {
    "build": { ... },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"],
      "inputs": [
        "src/**/*.ts",
        "src/**/*.tsx",
        "src/**/__tests__/**",
        "vitest.config.*",
        "tsconfig.json"
      ],
      "cache": true
    },
    "test:watch": {
      "cache": false,
      "persistent": true
    },
    "start": { ... },
    "watch": { ... }
  }
}
```

### 1.5 Per-Package Config Template

Each package that has tests gets a `vitest.config.ts`:

```ts
import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../vitest.shared';  // adjust relative path

export default mergeConfig(
  sharedConfig,
  defineProject({
    test: {
      environment: 'node',
    },
  })
);
```

And a `test` script in `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

---

## Phase 2: Shared Test Utilities

### 2.1 Create `@memberjunction/test-utils` Package

**Location**: `packages/TestUtils/`

This package provides mock infrastructure for unit testing MJ code without a database connection. It is separate from `@memberjunction/testing-engine` (the runtime fullstack framework).

```
packages/TestUtils/
  src/
    index.ts                    # Public API
    setup.ts                    # Global test setup (imported by vitest.shared.ts)
    singleton-reset.ts          # Reset MJ singletons between tests
    mock-metadata-provider.ts   # Mock Metadata.Provider for tests
    mock-run-view.ts            # Mock RunView for tests
    mock-entity.ts              # Create typed mock BaseEntity instances
    custom-matchers.ts          # MJ-specific Vitest matchers
    vitest.d.ts                 # Type augmentations for custom matchers
  package.json
  vitest.config.ts
  tsconfig.json
```

### 2.2 Singleton Reset

MJ relies heavily on singletons (`ClassFactory`, `Metadata`, `RunView`). Tests must reset them:

```ts
// singleton-reset.ts
import { MJGlobal } from '@memberjunction/global';

export function resetMJSingletons(): void {
  // Clear ClassFactory registrations added during tests
  // Reset Metadata provider
  // Reset any cached state
}
```

Use in `beforeEach`:

```ts
import { resetMJSingletons } from '@memberjunction/test-utils';

beforeEach(() => {
  resetMJSingletons();
});
```

### 2.3 Mock Entity Helper

BaseEntity uses getter/setters, so `{ ...entity }` doesn't work. Provide a utility:

```ts
// mock-entity.ts
export function createMockEntity<T>(entityName: string, data: Partial<T>): T {
  // Creates a proxy-based mock that behaves like a BaseEntity
  // Supports Get/Set, GetAll(), dirty tracking
}
```

### 2.4 Custom Matchers

```ts
// custom-matchers.ts
expect.extend({
  toBeValidEntity(received) { ... },
  toHaveSucceeded(received) { ... },  // RunView result check
  toHaveEntityField(received, fieldName) { ... },
});
```

### 2.5 Mock RunView

A mock RunView that returns canned data without a database:

```ts
// mock-run-view.ts
export function mockRunView(responses: Map<string, unknown[]>): void {
  // Intercepts RunView calls and returns matching test data
  // Keyed by entity name
}
```

---

## Phase 3: Migrate Existing Tests

### 3.1 Migration Steps per Package

For each of the 17 packages with existing tests:

1. Add `vitest` to devDependencies, remove `jest`, `ts-jest`, `@types/jest`
2. Create `vitest.config.ts` using shared config
3. Update `package.json` test scripts to use `vitest run`
4. In test files:
   - Remove `import { jest } from '@jest/globals'` if present
   - Replace `jest.fn()` with `vi.fn()`
   - Replace `jest.spyOn()` with `vi.spyOn()`
   - Replace `jest.mock()` with `vi.mock()`
   - Replace `jest.setTimeout()` with `vi.setConfig({ testTimeout: ... })`
   - Replace `jest.useFakeTimers()` with `vi.useFakeTimers()`
5. Delete `jest.config.js`
6. Delete `.babelrc` if only used for Jest
7. Verify tests pass with `npm run test` in the package directory

### 3.2 Package Migration Order

Migrate in dependency order (leaf packages first):

| Order | Package | Tests | Framework | Notes |
|-------|---------|-------|-----------|-------|
| 1 | AI/MCPClient | 3 | Vitest | Already on Vitest, just update config |
| 2 | React/test-harness | 6 | Vitest | Already on Vitest, just update config |
| 3 | MJCore | 3 | Jest | Core package, migrate carefully |
| 4 | Credentials/Engine | 1 | Jest | Simple migration |
| 5 | APIKeys/Engine | 3 | Jest | Has mock files to migrate |
| 6 | MJStorage | 2 | Jest | Simple migration |
| 7 | AI/Prompts | 2 | Jest | |
| 8 | AI/Providers/Fireworks | 1 | Jest | |
| 9 | AI/Providers/Vertex | 1 | Jest | |
| 10 | TestingFramework/Engine | 1 | Jest | |
| 11 | MJServer | 1 | Jest | ESM config, needs attention |
| 12 | AI/Agents | 6 | ts-node | Needs rewrite as proper test files |
| 13 | SQLServerDataProvider | 0 | Jest | Config exists but no tests — remove config or add tests |
| 14 | MJExplorer | 0 | Karma | Remove Karma config |

### 3.3 Clean Up Root Dependencies

After all packages are migrated, remove from the repo:
- All `jest.config.js` files
- All `ts-jest` dependencies
- All `@types/jest` dependencies
- All `jest` dependencies
- All Karma/Jasmine dependencies from MJExplorer
- Any `.babelrc` files only used for Jest

---

## Phase 4: Write Priority Tests

Packages ranked by blast radius (how many other packages/users break if they have a bug):

### Tier 1 — Critical (must have tests before enforcing CI gate)

| Package | Why | Target Tests |
|---------|-----|-------------|
| `MJGlobal` | ClassFactory used by every package | ClassFactory registration, retrieval, priority ordering, singleton management |
| `MJCore` | Metadata, RunView, BaseEntity used everywhere | Entity field resolution, RunView parameter building, BaseEntity CRUD lifecycle, validation |
| `SQLServerDataProvider` | All database operations | Query building, parameter escaping, transaction handling, connection pool management |

### Tier 2 — High Priority

| Package | Why | Target Tests |
|---------|-----|-------------|
| `MJCoreEntities` | Generated entity classes | Zod schema validation, getter/setter behavior, value list enums |
| `AI/Engine` | All AI operations route through here | Model selection, prompt building, response parsing, error handling |
| `AI/Prompts` | Prompt execution pipeline | Template resolution, variable substitution, model routing |
| `Actions/Engine` | Action execution for agents/workflows | Parameter validation, action resolution, execution lifecycle |
| `CodeGenLib` | Generates all entity code | Template rendering, entity metadata processing, manifest generation |

### Tier 3 — Important

| Package | Why | Target Tests |
|---------|-----|-------------|
| `Config` | Configuration loading | Config file parsing, environment variable resolution, defaults |
| `Communication/Engine` | Email/SMS sending | Template resolution, provider routing |
| `Credentials/Engine` | Secret management | Credential retrieval, caching, access control |
| `APIKeys/Engine` | API key management | Key generation, validation, scoping |
| `Templates/Engine` | Template rendering | Variable substitution, partial resolution, content type handling |
| `MetadataSync` | Schema synchronization | Validation rules, dependency ordering, reference resolution |

### Test Quality Guidelines

Every test file should follow this structure:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('ClassName', () => {
  beforeEach(() => {
    // Reset state
  });

  describe('MethodName', () => {
    it('should handle the normal case', () => { ... });
    it('should handle edge case: empty input', () => { ... });
    it('should handle edge case: null input', () => { ... });
    it('should throw on invalid input', () => { ... });
  });
});
```

Rules:
- Test files live in `src/__tests__/` with `.test.ts` extension
- One test file per source file (e.g., `ClassFactory.test.ts` tests `ClassFactory.ts`)
- Descriptive test names that read as specifications
- No database connections — mock all external dependencies
- No network calls — mock all HTTP/GraphQL clients
- Tests must be deterministic and fast (< 5s per file)

---

## Phase 5: GitHub Actions CI Gate

### 5.1 Add Test Job to `build.yml`

Add a `test` job that runs after `build` and is required for PR merges:

```yaml
name: Build and Test

on:
  workflow_dispatch:
  pull_request:
    branches: [next]
    paths:
      - 'package-lock.json'
      - 'packages/**'
  push:
    branches: [next]
    paths:
      - 'package-lock.json'
      - 'packages/**'

jobs:
  build:
    name: Build packages
    timeout-minutes: 30
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
          fetch-depth: 0

      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: 'npm'
          cache-dependency-path: 'package-lock.json'

      - name: Validate package repository.url for npm provenance
        run: ./.github/scripts/validate-package-repository.sh

      - name: Install dependencies
        run: npm ci

      - name: Build packages
        run: npm run build

  test:
    name: Run unit tests
    needs: build
    timeout-minutes: 15
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false

      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: 'npm'
          cache-dependency-path: 'package-lock.json'

      - name: Install dependencies
        run: npm ci

      - name: Build packages
        run: npm run build

      - name: Run tests
        run: npm test

      - name: Upload coverage
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/
          retention-days: 30
```

**Note**: The build step is duplicated in the test job because Turborepo's `test` task has `dependsOn: ["build"]`. An optimization would be to cache the build artifacts between jobs, but this is simpler to start.

### 5.2 Branch Protection Rule

In GitHub repo settings, add to the `next` branch protection rule:

- **Require status checks to pass before merging**: enabled
- **Required checks**: `Run unit tests`
- **Require branches to be up to date before merging**: enabled

This blocks any PR from merging if tests fail.

### 5.3 PR-Scoped Testing (Future Optimization)

Once the test suite grows large, add Turborepo's `--filter` to only run tests for changed packages:

```yaml
- name: Run affected tests
  run: npx turbo run test --filter=...[origin/next...HEAD]
```

This uses Turborepo's change detection to only test packages whose source files (or dependencies) changed in the PR.

---

## Phase 6: Conventions & Developer Experience

### 6.1 Package Test Scaffold Script

Create a script that sets up Vitest in a package that doesn't have tests yet:

```bash
# Usage: npm run test:scaffold -- --package @memberjunction/core
```

The script would:
1. Add `vitest.config.ts` with shared config
2. Add `test` and `test:watch` scripts to `package.json`
3. Create `src/__tests__/` directory with a starter test file
4. Add `vitest` to devDependencies

### 6.2 Update CLAUDE.md

Add testing conventions:
- All new packages must include at least one test file
- All PRs that change logic must include or update tests
- Test files use `.test.ts` extension in `src/__tests__/` directory
- Use `vi.mock()` for mocking, never mock by hand
- Import from `@memberjunction/test-utils` for shared utilities

### 6.3 Test File Naming Convention

Standardize on:
```
src/
  __tests__/
    ClassName.test.ts        # Unit tests for ClassName
    ClassName.integration.ts # Integration tests (optional, run separately)
    mocks/
      MockServiceName.ts     # Shared mocks for this package
  ClassName.ts
```

---

## Implementation Order

```
Phase 1.1  Install Vitest at root
Phase 1.2  Create vitest.shared.ts
Phase 1.3  Create vitest.config.ts (root)
Phase 1.4  Add Turbo test task
Phase 2.1  Create @memberjunction/test-utils package
Phase 2.2  Implement singleton reset
Phase 2.3  Implement mock entity helper
Phase 2.4  Implement custom matchers
Phase 2.5  Implement mock RunView
Phase 3    Migrate existing 17 packages to Vitest
Phase 4.1  Write Tier 1 tests (MJGlobal, MJCore, SQLServer)
Phase 5.1  Add test job to GitHub Actions
Phase 5.2  Enable branch protection
Phase 4.2  Write Tier 2 tests
Phase 4.3  Write Tier 3 tests
Phase 5.3  PR-scoped testing optimization
Phase 6    Conventions, scaffolding, DX
Phase 7    Release-cycle Docker Compose full-stack CI/CD
```

Note: Phase 5.1/5.2 (CI gate) is deliberately placed after Tier 1 tests exist. We don't want to enforce a test gate before there are meaningful tests to run — otherwise it's just CI overhead for zero value.

---

## Phase 7: Release-Cycle Full-Stack CI/CD

This phase connects Vitest unit testing with the `@memberjunction/testing-engine` browser automation regression suite in a single, automated release validation pipeline. This runs on release cycles (not per-PR) since the full suite takes hours.

### 7.1 Docker Compose Environment

**File**: `docker/docker-compose.test.yml`

Spins up the full MJ stack from the `next` branch:

```yaml
services:
  sqlserver:
    image: mcr.microsoft.com/mssql/server:2022-latest
    environment:
      ACCEPT_EULA: "Y"
      SA_PASSWORD: "${TEST_SA_PASSWORD}"
    ports:
      - "1433:1433"
    volumes:
      - ./init-db:/docker-entrypoint-initdb.d
    healthcheck:
      test: /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -Q "SELECT 1" -C
      interval: 10s
      timeout: 5s
      retries: 10

  mjapi:
    build:
      context: ..
      dockerfile: docker/Dockerfile.api
    depends_on:
      sqlserver:
        condition: service_healthy
    environment:
      DB_HOST: sqlserver
      DB_PORT: 1433
    ports:
      - "4000:4000"
    healthcheck:
      test: curl -f http://localhost:4000/health || exit 1
      interval: 10s
      retries: 10

  mjexplorer:
    build:
      context: ..
      dockerfile: docker/Dockerfile.explorer
    depends_on:
      mjapi:
        condition: service_healthy
    ports:
      - "4200:4200"

  playwright:
    build:
      context: ..
      dockerfile: docker/Dockerfile.playwright
    depends_on:
      mjexplorer:
        condition: service_started
    environment:
      BASE_URL: http://mjexplorer:4200
      API_URL: http://mjapi:4000
    volumes:
      - ./test-results:/app/test-results
```

### 7.2 Release Test Pipeline

**File**: `.github/workflows/release-test.yml`

Triggered manually or on release branch creation:

```yaml
name: Release Validation Suite

on:
  workflow_dispatch:
    inputs:
      branch:
        description: 'Branch to test'
        default: 'next'
  schedule:
    # Run nightly against next (optional)
    - cron: '0 2 * * 1-5'

jobs:
  unit-tests:
    name: Unit Tests (Vitest)
    timeout-minutes: 30
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npm test

  full-stack-regression:
    name: Full-Stack Regression (Playwright + Testing Framework)
    needs: unit-tests   # Only run if unit tests pass
    timeout-minutes: 180  # 3 hours max
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start Docker Compose stack
        run: docker compose -f docker/docker-compose.test.yml up -d --build --wait
        timeout-minutes: 20

      - name: Run database migrations
        run: docker compose -f docker/docker-compose.test.yml exec mjapi npm run mj:migrate

      - name: Run full regression suite
        run: docker compose -f docker/docker-compose.test.yml exec playwright npx mj-test run --suite=regression

      - name: Collect test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: regression-results
          path: docker/test-results/
          retention-days: 90

      - name: Tear down
        if: always()
        run: docker compose -f docker/docker-compose.test.yml down -v
```

### 7.3 Execution Order Within Release Pipeline

```
1. Unit tests via Vitest (fast gate — ~5-10 min)
   └─ If pass →
2. Docker Compose stack spins up (SQL Server + MJAPI + MJExplorer)
   └─ Migrations run →
3. Vitest unit tests run again inside the stack (validates built artifacts)
   └─ If pass →
4. Playwright browser automation regression suite via @memberjunction/testing-engine
   └─ Hours of detailed functional testing
5. Results collected, stack torn down
```

### 7.4 Local Developer Experience

Any developer can run the same pipeline locally:

```bash
# Run just unit tests for a specific package (fast, no Docker needed)
cd packages/MJCore && npm run test:watch

# Run unit tests for all packages
npm test

# Run unit tests for packages you changed
npx turbo run test --filter=...[HEAD~1]

# Spin up full-stack environment locally
docker compose -f docker/docker-compose.test.yml up -d --build --wait

# Run regression suite against local stack
npx mj-test run --suite=regression --base-url=http://localhost:4200

# Tear down when done
docker compose -f docker/docker-compose.test.yml down -v
```

The key principle: **same infrastructure for CI and local**. Docker Compose ensures the environment is identical whether running on a dev laptop or in GitHub Actions.

---

## Success Metrics

| Metric | Current | After Phase 3 | After Phase 4.1 | After Phase 4.3 | After Phase 7 |
|--------|---------|---------------|-----------------|-----------------|---------------|
| Packages with tests | 17 | 17 | 20 | 35+ | 35+ |
| Test files | 36 | 36 | 60+ | 120+ | 120+ |
| Frameworks | 4 | 1 (Vitest) | 1 | 1 | 1 |
| CI unit test gate (per-PR) | No | No | Yes | Yes | Yes |
| CI full-stack gate (release) | No | No | No | No | Yes |
| Root `npm test` | No | Yes | Yes | Yes | Yes |
| Turbo test caching | No | Yes | Yes | Yes | Yes |
| Coverage reporting | No | No | Yes | Yes | Yes |
| Docker Compose test env | No | No | No | No | Yes |
| Local full-stack testing | No | No | No | No | Yes |

---

## Overall Testing Strategy

This plan is one layer of a two-layer automated testing strategy:

| Layer | Tool | Trigger | Duration | What It Tests |
|-------|------|---------|----------|---------------|
| **Unit Tests** | Vitest | Every PR | ~5-10 min | Logic, utilities, services, data transformations — no DB, no network |
| **Full-Stack Regression** | @memberjunction/testing-engine + Playwright | Release cycles / nightly | Hours | Browser automation, end-to-end flows, visual verification, database integration |

Between the two layers, every PR is gated on unit tests, and every release is validated by comprehensive browser-driven regression testing. Both layers use the same infrastructure (Docker Compose) so developers can reproduce any failure locally.
