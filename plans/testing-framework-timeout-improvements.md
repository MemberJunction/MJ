# Testing Framework Timeout & Cancellation Improvements

## Overview

This plan addresses issues with the testing framework's timeout handling:
1. Timeout doesn't actually kill the test - just stops waiting
2. No way to distinguish timeout from other failures
3. Need detailed execution logging
4. Need proper cancellation support via AbortController

## Tasks

### Phase 1: Database & Schema Changes

- [x] **1.1** Create migration file `V202601031300__v3.1.x_Add_Test_Timeout_And_Log_Fields.sql`
  - Drop and recreate CHECK constraint on `TestRun.Status` to add 'Timeout' value
  - Add `MaxExecutionTimeMS INT NULL` to `Test` table
  - Add `MaxExecutionTimeMS INT NULL` to `TestSuite` table
  - Add `Log NVARCHAR(MAX) NULL` to `TestRun` table
  - Add extended properties for all new columns
  - Update extended property for Status column to document new value

- [x] **1.2** Run migration and CodeGen (manual step - completed by user)

### Phase 2: Type Changes (TestingFramework/Engine)

- [x] **2.1** Update `packages/TestingFramework/Engine/src/types.ts`
  - Add `'Timeout'` to `DriverExecutionResult.status` type
  - Add `'Timeout'` to `TestRunResult.status` type
  - Add `TestLogMessage` interface
  - Add `logCallback` to `TestRunOptions`

### Phase 3: BaseTestDriver Changes

- [x] **3.1** Update `packages/TestingFramework/Engine/src/drivers/BaseTestDriver.ts`
  - Add `DEFAULT_TEST_TIMEOUT_MS` constant (300000ms = 5 minutes)
  - Add `supportsCancellation()` method returning `false` by default
  - Add `getEffectiveTimeout()` helper method
  - Add `createLogMessage()` helper method
  - Add `logToTestRun()` method for logging to both console and test run log

### Phase 4: AgentEvalDriver Changes

- [x] **4.1** Update `packages/TestingFramework/Engine/src/drivers/AgentEvalDriver.ts`
  - Override `supportsCancellation()` to return `true`
  - Implement `AbortController` pattern in `executeAgent()`
  - Pass `cancellationToken` to agent execution via `executeSingleTurn()`
  - Handle timeout and return `'Timeout'` status with partial results
  - Remove old `Promise.race()` timeout pattern
  - Use `logToTestRun()` for execution logging

### Phase 5: TestEngine Changes

- [x] **5.1** Update `packages/TestingFramework/Engine/src/engine/TestEngine.ts`
  - Check `supportsCancellation()` and log warning for drivers that don't support it
  - Set up log accumulation via `logCallback` wrapper
  - Pass accumulated logs to `updateTestRun()`
  - Save logs to `TestRun.Log` field
  - Ensure `ErrorMessage` is populated for timeout and error statuses
  - Add warning to ErrorMessage for non-cancellation drivers

### Phase 6: Build & Test

- [x] **6.1** Build TestingFramework packages
  - `cd packages/TestingFramework/Engine && npm run build`
  - Fixed TypeScript errors

- [ ] **6.2** Manual testing (pending)
  - Test with a test that has short timeout
  - Verify timeout status is recorded
  - Verify log is captured
  - Verify agent is actually cancelled

### Phase 7: UI Improvements (Second Phase - Future)

- [ ] **7.1** Review and update Testing Dashboard
  - `packages/Angular/Explorer/dashboards/src/Testing/`
  - Display timeout status distinctly from failures
  - Show execution log in test run details
  - Add timeout configuration UI
  - Improve real-time status updates for long-running tests

- [ ] **7.2** Review and update Testing Entity Forms
  - `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Tests/`
  - Add MaxExecutionTimeMS field to Test form
  - Add MaxExecutionTimeMS field to TestSuite form
  - Display Log field in TestRun form (collapsible, syntax highlighted)
  - Better timeout status visualization

---

## Technical Details

### Timeout Priority Resolution

| Priority | Source | Description |
|----------|--------|-------------|
| 1 (highest) | `Configuration` JSON `maxExecutionTime` | Backward compatible, per-test override |
| 2 | `Test.MaxExecutionTimeMS` column | New top-level field |
| 3 (default) | `DEFAULT_TEST_TIMEOUT_MS` constant | 300000ms (5 minutes) |

### TestRun Status Values (Updated)

- `Pending` - Queued, not started
- `Running` - In progress
- `Passed` - All checks passed
- `Failed` - At least one check failed
- `Skipped` - Not executed
- `Error` - Execution error before validation
- `Timeout` - **NEW** - Execution exceeded time limit

### Cancellation Behavior

**When timeout fires:**
1. `AbortController.abort()` is called
2. Agent receives signal and attempts graceful cancellation
3. Driver catches the abort and returns `status: 'Timeout'`
4. TestEngine saves with `Status = 'Timeout'`, `ErrorMessage`, and `Log`

**For drivers without cancellation support:**
1. Warning logged to test run
2. Test marked as `Timeout`
3. Underlying execution may continue in background
4. Warning included in `ErrorMessage`

---

## Files to Modify

| File | Changes |
|------|---------|
| `migrations/v2/V202601031200__v2.130.x_Add_Test_Timeout_And_Log_Fields.sql` | New migration |
| `packages/TestingFramework/Engine/src/types.ts` | Add Timeout status, log types |
| `packages/TestingFramework/Engine/src/drivers/BaseTestDriver.ts` | Cancellation support, timeout helpers |
| `packages/TestingFramework/Engine/src/drivers/AgentEvalDriver.ts` | AbortController implementation |
| `packages/TestingFramework/Engine/src/engine/TestEngine.ts` | Log accumulation, error handling |
| `packages/Angular/Explorer/dashboards/src/Testing/*` | UI improvements (Phase 7) |
| `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Tests/*` | Form improvements (Phase 7) |
