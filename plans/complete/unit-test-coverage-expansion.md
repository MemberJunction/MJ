# Unit Test Coverage Expansion Plan

## Goal
Add comprehensive unit tests to the 15 packages that currently have zero test coverage.

## Current State
- **92 packages** have tests (passing as of 2026-04-03)
- **15 packages** have no tests at all
- Testing framework: **Vitest** (standardized repo-wide)
- Shared utilities: `@memberjunction/unit-testing` (mock entities, mock RunView, singleton resets, custom matchers)
- Scaffold script: `node scripts/scaffold-tests.mjs packages/YourPackage`

---

## Tiers (Ordered by ROI and Feasibility)

### Tier 1 -- High ROI, Pure Logic, No Angular TestBed Required

These packages have substantial testable pure TypeScript logic. Tests can be written quickly with high value.

---

#### 1. `@memberjunction/computer-use` (packages/AI/ComputerUse)
**LOC:** ~4,669 | **Complexity:** Complex | **Estimated tests:** 80-120

**What to test:**
- **ResponseParser** (static utility, top priority)
  - `ParseControllerResponse()` -- parse messy LLM output into typed BrowserAction objects
  - `parseActions()` -- action array extraction
  - `extractJson()` -- JSON extraction from mixed text
  - Edge cases: malformed JSON, empty responses, partial JSON, multiple JSON blocks
- **HeuristicJudge** (pure comparison logic)
  - `detectStuckState()` -- screenshot similarity detection
  - `detectNavigationLoop()` -- URL cycle detection
  - `detectRepeatedErrors()` -- error pattern detection
  - Boundary cases: empty history, single step, identical screenshots
- **ToolProvider** (registry pattern)
  - `RegisterTools()` -- registration, name collision detection
  - `GetToolDefinitions()` -- definition retrieval
  - `ExecuteToolCall()` -- dispatch with error wrapping (mock tool handlers)
- **RunContext** (state machine)
  - Screenshot ring buffer: `AddScreenshot()`, `CurrentScreenshot`, eviction at capacity
  - `StepHistory` management
  - `LastJudgeFeedback` state tracking
- **Error types** -- ComputerUseError construction, ComputerUseStatus discrimination

**Mocking needed:** None for ResponseParser/HeuristicJudge/ToolProvider. RunContext needs no mocks. Engine-level tests need mocked BaseBrowserAdapter and BaseLLM.

**Files to create:**
```
src/__tests__/ResponseParser.test.ts
src/__tests__/HeuristicJudge.test.ts
src/__tests__/ToolProvider.test.ts
src/__tests__/RunContext.test.ts
src/__tests__/errors.test.ts
```

---

#### 2. `@memberjunction/computer-use-engine` (packages/AI/MJComputerUse)
**LOC:** ~2,716 | **Complexity:** Complex | **Estimated tests:** 40-60

**What to test:**
- **parseJudgeFrequency()** + **parseColonNumber()** (pure string parsing)
  - Inputs: `"EveryStep"`, `"EveryNSteps:3"`, `"OnStagnation:5"`
  - Edge cases: invalid strings, missing colon, non-numeric N
- **Oracle implementations** (pure function evaluation)
  - `GoalCompletionOracle` -- verdict.Done + confidence threshold checks
  - `UrlMatchOracle` -- regex match on final URL
  - `StepCountOracle` -- bounds checking (min/max steps)
  - Edge cases: null verdict, missing URL, zero steps
- **ComputerUseTestDriver.buildActualOutput()** -- result transformation

**Mocking needed:** Oracles need mocked `OracleInput` (simple objects). Engine tests need mocked AIPromptRunner and entities.

**Files to create:**
```
src/__tests__/judge-frequency-parser.test.ts
src/__tests__/GoalCompletionOracle.test.ts
src/__tests__/UrlMatchOracle.test.ts
src/__tests__/StepCountOracle.test.ts
```

---

#### 3. `@memberjunction/ng-pagination` (packages/Angular/Generic/pagination)
**LOC:** Small | **Complexity:** Simple | **Estimated tests:** 15-25

**What to test (all pure math, no TestBed):**
- Computed getters: `TotalPages`, `DisplayFrom`, `DisplayTo`, `CanGoBack`, `CanGoForward`
- Navigation methods: `GoToFirst()`, `GoToPrevious()`, `GoToNext()`, `GoToLast()`
- Event emission: `PageChangeEvent` with correct `StartRow` calculations
- Boundary conditions: first page, last page, single page, empty data (0 total), PageSize=1

**Mocking needed:** None -- instantiate component class directly, test property calculations.

**Files to create:**
```
src/__tests__/pagination.test.ts
```

---

#### 4. `@memberjunction/ng-forms` (packages/Angular/Generic/forms)
**LOC:** Medium | **Complexity:** Medium | **Estimated tests:** 30-50

**What to test (FormResponseUtils is 100% pure static methods):**
- `FormResponseUtils.FormatValue()` -- type-aware formatting for date, datetime, time, daterange, choice types
- `FormResponseUtils.ResolveOptionLabel()` -- label resolution from form option arrays
- `FormResponseUtils.FormatDate()`, `FormatTime()`, `FormatDateRange()` -- date/time formatting
- `FormResponseUtils.HumanizeKey()` -- camelCase/snake_case to human-readable
- `FormResponseUtils.EscapeHtml()` -- XSS prevention (critical correctness test)
- Edge cases: null/undefined values, empty option arrays, malformed dates, special characters in HTML

**Mocking needed:** None for FormResponseUtils.

**Files to create:**
```
src/__tests__/form-response-utils.test.ts
```

---

#### 5. `@memberjunction/ng-ui-components` (packages/Angular/Generic/ui-components)
**LOC:** Medium-Large | **Complexity:** Medium-Complex | **Estimated tests:** 30-45

**What to test (pure utility functions):**
- **Calendar utilities** (`calendar-utils.ts`)
  - `BuildCalendarWeeks()` -- generates 6-week calendar grid from any date
  - `FormatDate()`, `FormatDateTime()` -- date string formatting
  - `GetMonthYearLabel()` -- locale-aware month/year string
  - Edge cases: leap years, month boundaries, DST transitions, Jan 1, Dec 31
- **Button directive logic** -- CSS class computation from variant/size inputs
- **Dialog SIZE_MAP** -- size string to pixel dimension mapping
- **NumericInput** -- value parsing, clamping, currency formatting logic

**Mocking needed:** None for calendar-utils. Button/Dialog tests may need minimal DOM mocking.

**Files to create:**
```
src/__tests__/calendar-utils.test.ts
src/__tests__/button-directive.test.ts
src/__tests__/dialog-sizes.test.ts
src/__tests__/numeric-input-logic.test.ts
```

---

#### 6. `@memberjunction/ng-clustering` (packages/Angular/Generic/clustering)
**LOC:** Large | **Complexity:** Complex | **Estimated tests:** 40-60

**What to test (ClusteringService is pure business logic):**
- `ClusteringService.RunClustering()` -- takes pre-fetched vectors + config, returns visualization result
- `ReduceDimensions()` -- dimensionality reduction helper
- `normalizeAndAssign()` -- dimension normalization
- `pcaFallback()` -- PCA algorithm (math correctness)
- `buildResult()`, `buildEmptyResult()` -- result construction
- `DefaultClusterConfig()` factory -- default values
- Color palette management (`CLUSTER_COLORS`)
- Edge cases: empty vectors, single vector, all-identical vectors, high-dimensional input

**Mocking needed:** `SimpleVectorService` from `@memberjunction/ai-vectors-memory` (for K-Means/DBSCAN). UMAP dynamic import can be mocked.

**Files to create:**
```
src/__tests__/clustering-types.test.ts
src/__tests__/clustering-service.test.ts
src/__tests__/pca-fallback.test.ts
```

---

### Tier 2 -- Medium ROI, Requires Some Mocking

---

#### 7. `@memberjunction/ng-agent-client` (packages/Angular/Generic/agent-client)
**LOC:** Small | **Complexity:** Simple | **Estimated tests:** 15-20

**What to test:**
- Service instantiation and session lifecycle (`StartSession`, `StopSession`)
- Property pass-throughs (`SessionId`, `IsActive`)
- Tool registration delegation (`RegisterTool`, `UnregisterTool`, `GetRegisteredTools`)
- `ngOnDestroy` cleanup (session stop called)
- Observable stream wiring (`ToolRequested$`, `AgentProgress$`, `Error$`)

**Mocking needed:** Mock `AgentClientSession` from `@memberjunction/ai-agent-client`.

**Files to create:**
```
src/__tests__/agent-client-service.test.ts
```

---

#### 8. `@memberjunction/ng-agent-requests` (packages/Angular/Generic/agent-requests)
**LOC:** Medium | **Complexity:** Medium | **Estimated tests:** 20-30

**What to test:**
- Panel width calculation and clamping (MIN/MAX constants)
- Resize drag math
- User search filtering and debounce logic
- Form submission value formatting
- Panel open/close state transitions

**Mocking needed:** Entity operations (RunView), MJNotificationService, ChangeDetectorRef.

**Files to create:**
```
src/__tests__/panel-resize-logic.test.ts
src/__tests__/agent-request-panel.test.ts
```

---

#### 9. `@memberjunction/ng-scheduling` (packages/Angular/Generic/scheduling)
**LOC:** Medium | **Complexity:** Medium | **Estimated tests:** 15-25

**What to test:**
- `ScheduledJobService` cache management (double-check loading, promise deduplication)
- `ClearCache()` method
- Cache state transitions
- Service initialization flow

**Mocking needed:** Metadata, RunView, entity classes (ScheduledJobEntity, etc.).

**Files to create:**
```
src/__tests__/scheduled-job-service.test.ts
```

---

#### 10. `@memberjunction/server` / MJAPI (packages/MJAPI)
**LOC:** ~50 (app code) | **Complexity:** Simple | **Estimated tests:** 5-10

**What to test:**
- Server bootstrap configuration validation
- `initializeAuth()` factory function
- Custom resolver logic in `generated.ts` (if any exists)

**Mocking needed:** Heavy -- `createMJServer`, database providers, all bootstrap dependencies. Low ROI for unit tests; better suited for integration tests.

**Files to create:**
```
src/__tests__/bootstrap.test.ts
```

---

### Tier 3 -- Low ROI / Skip

These packages have minimal or no testable logic. Testing them provides negligible value.

---

#### 11. `@memberjunction/integration-ui-types` (packages/Integration/ui-types)
**LOC:** 79 | **Type definitions only -- ZERO runtime code**

**Recommendation:** **SKIP.** No functions, no classes, no logic. Pure TypeScript interfaces and type aliases. Nothing to test.

---

#### 12. `mj_generatedactions` (packages/GeneratedActions)
**LOC:** ~14 | **CodeGen skeleton -- currently empty**

**Recommendation:** **SKIP.** Auto-generated by CodeGen. No custom logic until actions are generated. Testing generated code is CodeGen's responsibility.

---

#### 13. `mj_generatedentities` (packages/GeneratedEntities)
**LOC:** ~11 | **CodeGen skeleton -- currently empty**

**Recommendation:** **SKIP.** Same as GeneratedActions. Auto-generated, no custom logic.

---

#### 14. `mj-angular-elements-demo` (packages/AngularElements/mj-angular-elements-demo)
**LOC:** ~486 | **Demo application**

**Recommendation:** **SKIP or minimal.** This is a demo/reference app, not a library consumed by other packages. If tested, only basic smoke tests for component instantiation.

---

#### 15. MJExplorer (packages/MJExplorer)
**LOC:** ~259 (app shell) | **Complexity:** Complex (dependency-wise)

**Recommendation:** **SKIP for unit tests.** The app shell has almost no custom logic -- it's configuration and imports. Testing would require mocking 20+ Angular modules. Better served by E2E tests (Playwright).

**If minimal tests desired:**
- `MSALGuardConfigFactory()` -- simple config factory
- `initializeAuth()` -- factory function with mocked MJAuthBase

---

## Execution Plan

### Phase 1: Scaffold All Packages (30 min)
Run the scaffold script for each package that will get tests:
```bash
node scripts/scaffold-tests.mjs packages/AI/ComputerUse
node scripts/scaffold-tests.mjs packages/AI/MJComputerUse
node scripts/scaffold-tests.mjs packages/Angular/Generic/pagination
node scripts/scaffold-tests.mjs packages/Angular/Generic/forms
node scripts/scaffold-tests.mjs packages/Angular/Generic/ui-components
node scripts/scaffold-tests.mjs packages/Angular/Generic/clustering
node scripts/scaffold-tests.mjs packages/Angular/Generic/agent-client
node scripts/scaffold-tests.mjs packages/Angular/Generic/agent-requests
node scripts/scaffold-tests.mjs packages/Angular/Generic/scheduling
node scripts/scaffold-tests.mjs packages/MJAPI
```

### Phase 2: Tier 1 Tests -- Pure Logic (parallelizable)
These are independent and can be worked on in parallel:

| Package | Est. Time | Test Count | Parallel Slot |
|---------|-----------|------------|---------------|
| ComputerUse (ResponseParser, Judge, etc.) | 2-3 hrs | 80-120 | A |
| MJComputerUse (Oracles, parsers) | 1-2 hrs | 40-60 | B |
| ng-pagination | 30 min | 15-25 | C |
| ng-forms (FormResponseUtils) | 1 hr | 30-50 | C |
| ng-ui-components (calendar-utils) | 1 hr | 30-45 | D |
| ng-clustering (service logic) | 2 hrs | 40-60 | D |

**Total Tier 1:** ~250-360 tests

### Phase 3: Tier 2 Tests -- With Mocking
| Package | Est. Time | Test Count |
|---------|-----------|------------|
| ng-agent-client | 45 min | 15-20 |
| ng-agent-requests | 1.5 hrs | 20-30 |
| ng-scheduling | 1 hr | 15-25 |
| MJAPI | 30 min | 5-10 |

**Total Tier 2:** ~55-85 tests

### Phase 4: Verify Full Suite
```bash
npm test  # Should see 0 failures across all packages
```

---

## Test Conventions (must follow)

1. **File location:** `src/__tests__/*.test.ts`
2. **Imports:** `import { describe, it, expect, vi, beforeEach } from 'vitest'`
3. **Singleton reset:** `beforeEach(() => { resetMJSingletons(); })` when testing singleton-dependent code
4. **Entity mocks:** Use `createMockEntity()` from `@memberjunction/unit-testing`
5. **RunView mocks:** Use `mockRunView()` from `@memberjunction/unit-testing`
6. **No TestBed:** Test pure logic by instantiating classes directly; avoid Angular testing utilities
7. **Vitest config:** Extend from `vitest.shared.ts` via `mergeConfig(sharedConfig, defineProject(...))`
8. **No `.spec.ts`:** Only use `.test.ts` extension

---

## Estimated Totals

| Tier | Packages | Tests | Effort |
|------|----------|-------|--------|
| Tier 1 | 6 | 250-360 | ~8-10 hrs |
| Tier 2 | 4 | 55-85 | ~4 hrs |
| Tier 3 (skip) | 5 | 0 | 0 |
| **Total** | **10 active** | **305-445** | **~12-14 hrs** |

## Packages Skipped (with justification)

| Package | Reason |
|---------|--------|
| Integration/ui-types | Pure type definitions, zero runtime code |
| GeneratedActions | CodeGen skeleton, no custom logic |
| GeneratedEntities | CodeGen skeleton, no custom logic |
| AngularElements demo | Reference app, not a consumed library |
| MJExplorer | App shell with no custom logic; needs E2E not unit tests |
