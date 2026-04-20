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

### Phase 7: UI Improvements

- [x] **7.0** Fix AI Agent Run form timeline tab height issue
  - `packages/Angular/Explorer/core-entity-forms/src/lib/custom/ai-agent-run/ai-agent-run.component.css`
  - Changed `.content-area` from `height: calc(100vh - 390px)` to `flex: 1; min-height: 0;`
  - Added flexbox layout to parent containers for proper height distribution
  - Added `flex-shrink: 0` to header and tabs to prevent them from shrinking

- [ ] **7.1** Add Cancel Button to Run Test Dialog
  - `packages/Angular/Generic/Testing/src/lib/components/test-run-dialog.component.ts`
  - Currently during execution, dialog shows disabled "Running..." button - need active Cancel button
  - **Required Changes:**
    1. Add `CancelTest` mutation to `RunTestResolver.ts`
    2. Track running test IDs with associated AbortController on server
    3. Add `CancelTest(testId: string)` method to `GraphQLTestingClient`
    4. Add cancel button UI during `isRunning` state
    5. Wire cancel button to call client's CancelTest method
    6. Handle cancellation confirmation and status update

- [ ] **7.2** Stream Detailed Updates from Agent to Dialog
  - Current progress updates are minimal (step, percentage, message)
  - **Enhancements needed:**
    1. Include agent conversation messages in progress stream
    2. Add tool calls/results to progress updates
    3. Display structured execution log with collapsible sections
    4. Add oracle evaluation details as they complete
    5. Show partial results during long-running tests
    6. Display cost/token accumulation in real-time

- [ ] **7.3** Review and Update Testing Dashboard
  - `packages/Angular/Explorer/dashboards/src/Testing/`
  - Display timeout status distinctly from failures (orange badge)
  - Show execution log in test run details panel
  - Add timeout configuration UI in test/suite editing
  - Add cancel running test button in execution list

- [ ] **7.4** Review and Update Testing Entity Forms
  - `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Tests/`
  - Add MaxExecutionTimeMS field to Test form
  - Add MaxExecutionTimeMS field to TestSuite form
  - Display Log field in TestRun form (collapsible, syntax highlighted)
  - Better timeout status visualization with distinct color

### Phase 8: Additional UX Improvements (Future)

Based on comprehensive UX review, these improvements should be prioritized:

#### 8.1 Critical Fixes
- [ ] **Complete action implementations** - `cancelExecution()` and `rerunTest()` in testing-execution.component.ts currently just log to console
- [ ] **Add toast notifications** - No feedback after operations (save, cancel, refresh)
- [ ] **Error state handling** - Silent failures when RunView fails; need user-visible error messages with retry

#### 8.2 High Priority
- [ ] **Simplify execution list** - 7-column layout too dense; reduce to Name, Status, Score, Duration with details on click
- [ ] **Add pending review reasons** - Show why feedback is needed (no-feedback, high-score-failed, low-score-passed)
- [ ] **Breadcrumb navigation** - Users lose context when drilling into test runs
- [ ] **Empty state CTAs** - "No test executions found" needs guidance on how to create/run tests
- [ ] **Actionable stat cards** - Clicking "Failed Today: 5" should filter list to show those failures

#### 8.3 Medium Priority
- [ ] **Unify feedback UI** - Both embedded form section and separate dialog exist; pick one pattern
- [ ] **Performance trending** - Add pass rate and cost graphs over time in Analytics tab
- [ ] **JSON syntax highlighting** - Use mj-code-editor for InputData, ExpectedOutputData, ActualOutputData fields
- [ ] **Virtual scrolling** - Large test lists render all DOM nodes; implement CDK virtual scroll
- [ ] **Last updated timestamp** - Show "Updated 2 minutes ago" so users know data freshness

#### 8.4 Feature Additions
- [ ] **Test scheduling** - Schedule tests to run at specific times/intervals
- [ ] **Flakiness detection** - Identify tests that fail intermittently
- [ ] **Cost forecasting** - Show projected costs based on current patterns
- [ ] **Export functionality** - Download results as CSV/PDF
- [ ] **Bulk operations** - Checkboxes for multi-select with bulk rerun/cancel/feedback
- [ ] **Keyboard shortcuts** - F5=refresh, Ctrl+R=run test, Escape=close dialog

---

## Cancel Button Architecture

### Server-Side Changes Required

1. **RunTestResolver.ts** - Add test and suite cancellation support:
   ```typescript
   // Track running tests with their abort controllers
   private static runningTests: Map<string, AbortController> = new Map();

   // Track running suites with their test run IDs and master abort controller
   private static runningSuites: Map<string, {
       controller: AbortController;
       testRunIds: string[];
   }> = new Map();

   @Mutation(() => Boolean)
   async CancelTest(
       @Arg('testRunId') testRunId: string,
       @PubSub() pubSub?: PubSubEngine,
       @Ctx() { userPayload }: AppContext = {} as AppContext
   ): Promise<boolean> {
       const controller = RunTestResolver.runningTests.get(testRunId);
       if (controller) {
           controller.abort();
           RunTestResolver.runningTests.delete(testRunId);
           if (pubSub) {
               this.publishCancelled(pubSub, userPayload, testRunId);
           }
           return true;
       }
       return false;
   }

   @Mutation(() => Boolean)
   async CancelTestSuite(
       @Arg('suiteRunId') suiteRunId: string,
       @PubSub() pubSub?: PubSubEngine,
       @Ctx() { userPayload }: AppContext = {} as AppContext
   ): Promise<boolean> {
       const suiteInfo = RunTestResolver.runningSuites.get(suiteRunId);
       if (suiteInfo) {
           // Abort master controller (stops new tests from starting)
           suiteInfo.controller.abort();

           // Abort all running tests in the suite
           for (const testRunId of suiteInfo.testRunIds) {
               const testController = RunTestResolver.runningTests.get(testRunId);
               if (testController) {
                   testController.abort();
                   RunTestResolver.runningTests.delete(testRunId);
               }
           }

           RunTestResolver.runningSuites.delete(suiteRunId);

           if (pubSub) {
               this.publishSuiteCancelled(pubSub, userPayload, suiteRunId);
           }
           return true;
       }
       return false;
   }
   ```

2. **Modify RunTest** to:
   - Create AbortController and store in `runningTests` map by testRunId
   - Pass AbortSignal to engine's `RunTest` method via options
   - Clean up from map on completion/error

3. **Modify RunTestSuite** to:
   - Create master AbortController for the suite
   - Store in `runningSuites` map with empty testRunIds array
   - Before each test runs, check if master controller is aborted
   - Register each test's AbortController in both `runningTests` and suite's testRunIds
   - Support both sequential and parallel execution cancellation
   - Clean up suite from map on completion/error

### Client-Side Changes Required

1. **GraphQLTestingClient** - Add cancel methods for both test and suite:
   ```typescript
   public async CancelTest(testRunId: string): Promise<boolean> {
       const mutation = gql`
           mutation CancelTest($testRunId: String!) {
               CancelTest(testRunId: $testRunId)
           }
       `;
       const result = await this._dataProvider.ExecuteGQL(mutation, { testRunId });
       return result.CancelTest;
   }

   public async CancelTestSuite(suiteRunId: string): Promise<boolean> {
       const mutation = gql`
           mutation CancelTestSuite($suiteRunId: String!) {
               CancelTestSuite(suiteRunId: $suiteRunId)
           }
       `;
       const result = await this._dataProvider.ExecuteGQL(mutation, { suiteRunId });
       return result.CancelTestSuite;
   }
   ```

2. **test-run-dialog.component.ts** - Add cancel UI for both modes:
   ```typescript
   // Track current execution for cancellation
   currentTestRunId: string | null = null;
   currentSuiteRunId: string | null = null;

   async cancelExecution(): Promise<void> {
       if (this.runMode === 'suite' && this.currentSuiteRunId) {
           await this.testingClient.CancelTestSuite(this.currentSuiteRunId);
           this.addLogEntry('Suite cancelled by user', 'info');
       } else if (this.currentTestRunId) {
           await this.testingClient.CancelTest(this.currentTestRunId);
           this.addLogEntry('Test cancelled by user', 'info');
       }
       this.executionStatus = 'Cancelled';
       this.isRunning = false;
       this.hasCompleted = true;
   }
   ```

3. **Update dialog template** - Replace disabled Running button with Cancel:
   ```html
   @if (isRunning) {
       <button class="action-btn cancel-btn" (click)="cancelExecution()">
           <i class="fa-solid fa-stop"></i>
           Cancel
       </button>
   }
   ```

4. **Capture run IDs from progress updates** - The server needs to publish the testRunId/suiteRunId early so the client can track them for cancellation

### Flow Diagram

```
User clicks Cancel
       ↓
Dialog calls testingClient.CancelTest(testRunId)
       ↓
GraphQL mutation CancelTest
       ↓
RunTestResolver finds AbortController in map
       ↓
controller.abort() called
       ↓
TestEngine's AbortSignal triggers
       ↓
AgentEvalDriver catches abort, returns Timeout status
       ↓
TestRun saved with Status='Cancelled' (or 'Timeout')
       ↓
PubSub publishes TestExecutionCancelled event
       ↓
Dialog receives event, updates UI
```

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
