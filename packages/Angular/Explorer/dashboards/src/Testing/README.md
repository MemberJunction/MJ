# MemberJunction Testing Framework UI

Angular components and dashboards for the MemberJunction Testing Framework. Provides rich visualizations, test management interfaces, and interactive analysis tools.

## Overview

The Testing Framework UI integrates with MJExplorer to provide a complete test management and analysis experience. Built on Angular 21, it leverages MJ's existing component library while adding specialized testing views.

## Components (Planned)

### 1. Test Dashboard
Main landing page showing overview and recent activity.

**Features:**
- Test suite success rate trends
- Recent test runs with status
- Cost analysis and budgets
- Quick actions (run suite, view failures)

### 2. Test Explorer
Browse and search available tests and suites.

**Features:**
- Hierarchical tree view of test suites
- Filter by type, tag, status
- Quick run from list
- Test configuration preview

### 3. Test Run Viewer
Detailed view of individual test execution.

**Features:**
- Step-by-step execution timeline
- Oracle results with pass/fail indicators
- **Click-through to trace** (Agent Run → steps → prompts)
- Cost breakdown
- Input/output comparison
- Human feedback form

### 4. Suite Run Dashboard
Overview of suite execution.

**Features:**
- Test execution status (running, passed, failed)
- Progress bar and ETA
- Individual test results
- Aggregate metrics (pass rate, cost, duration)
- Failure analysis

### 5. Test Comparison View
Side-by-side comparison of test runs.

**Features:**
- Compare two runs (any combination)
- Highlight score differences
- Performance delta (duration, cost)
- Oracle result diff
- Git commit/version context

### 6. Cost Analytics Dashboard
Financial tracking and optimization.

**Features:**
- Cost trends over time
- Most expensive tests
- Budget alerts
- Cost per test type
- Optimization recommendations

### 7. Trace Integration
Deep integration with MJ trace viewer.

**Features:**
- Click from test result → agent run
- Inline trace display in test viewer
- Filter traces by test status
- Replay test from trace

### 8. Human Feedback Interface
Collect and manage human validation.

**Features:**
- Rating interface (1-10 scale)
- Override automated results
- Correction notes
- Feedback analytics
- Training data export

### 9. Test Editor
Create and modify test definitions.

**Features:**
- Form-based test creation
- JSON editor for advanced config
- Oracle configuration wizard
- Rubric selector
- Validation preview
- Save to database (synced to Git via MJ Sync)

### 10. Reporting Interface
Generate and export reports.

**Features:**
- Custom date ranges
- Suite/test selection
- Format selection (PDF, Markdown, HTML)
- Email scheduling
- Template customization

## Planned Views

### Main Dashboard (`/testing/dashboard`)
```
┌─────────────────────────────────────────────────────┐
│ Testing Dashboard                                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ┌───────────┐ ┌───────────┐ ┌───────────┐         │
│ │ 42 Tests  │ │ 95.2%     │ │ $5.28     │         │
│ │ Active    │ │ Pass Rate │ │ This Month│         │
│ └───────────┘ └───────────┘ └───────────┘         │
│                                                     │
│ Recent Test Runs:                                  │
│ ┌─────────────────────────────────────────────┐   │
│ │ ✓ Agent Quality Suite    14:30  100%  $0.12 │   │
│ │ ✓ Smoke Tests            13:15   95%  $0.04 │   │
│ │ ✗ Nightly Regression     02:00   87%  $1.20 │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ Success Rate Trend (Last 30 days):                │
│ [Line chart showing pass rate over time]          │
│                                                     │
│ Cost Analysis:                                     │
│ [Bar chart showing cost by test type]             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Test Run Details (`/testing/runs/:runId`)
```
┌─────────────────────────────────────────────────────┐
│ Test Run: Active Members Count                      │
│ Status: PASSED ✓  Score: 1.0000  Duration: 1.8s    │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Execution Timeline:                                │
│ ┌─────────────────────────────────────────────┐   │
│ │ [0s────1.2s─────1.8s]                       │   │
│ │  ↓      ↓       ↓                          │   │
│ │ Start  Agent   Oracles                     │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ Oracle Results:                                    │
│ ✓ trace-no-errors       1.0000   $0.00           │
│ ✓ sql-validate          1.0000   $0.00           │
│ ✓ schema-validate       1.0000   $0.00           │
│                                                     │
│ Target: Agent Run abc-123   [View Trace →]        │
│                                                     │
│ Inputs:                    Outputs:               │
│ ┌────────────────┐        ┌────────────────┐     │
│ │ {              │        │ {              │     │
│ │   prompt: ...  │        │   result: ...  │     │
│ │ }              │        │ }              │     │
│ └────────────────┘        └────────────────┘     │
│                                                     │
│ Human Feedback:                                    │
│ [Rating: __________]  [Override Result: ☐]       │
│ [Comments: ___________________________]           │
│ [Submit Feedback]                                 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Suite Run Dashboard (`/testing/suites/:suiteRunId`)
```
┌─────────────────────────────────────────────────────┐
│ Suite Run: Agent Quality Suite                      │
│ Status: RUNNING  Progress: 8/15  Duration: 12.3s   │
├─────────────────────────────────────────────────────┤
│                                                     │
│ [████████░░░░░░░░] 53% complete                    │
│                                                     │
│ Test Results:                                      │
│ ┌─────────────────────────────────────────────┐   │
│ │ ✓ Active Members Count      1.8s   1.0000   │   │
│ │ ✓ Revenue YTD               2.1s   0.9850   │   │
│ │ ✗ Complex Aggregation       3.2s   0.6000   │   │
│ │ ⟳ Trend Analysis           running...       │   │
│ │ ⋯ Customer Insights        queued          │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ Summary:                                           │
│ Passed: 6   Failed: 2   Running: 1   Queued: 6   │
│                                                     │
│ Current Cost: $0.08  Estimated Total: $0.15       │
│                                                     │
│ [Stop Suite] [View Failed Tests] [Download Report]│
│                                                     │
└─────────────────────────────────────────────────────┘
```

## Integration with MJ Components

### Reusing Existing Components
- **mj-form-field** - For test configuration
- **mj-grid** - For test lists
- **mj-tab-view** - For test run details sections
- **mj-chart** - For analytics and trends
- **mj-dialog** - For feedback forms

### New Custom Components
- **test-status-badge** - Visual status indicator
- **oracle-result-card** - Oracle evaluation display
- **trace-link-button** - Click-through to trace viewer
- **cost-meter** - Visual cost indicator
- **score-gauge** - Circular score display
- **execution-timeline** - Step-by-step timeline

## Routing Structure

```
/testing
  /dashboard                    # Main overview
  /explorer                     # Browse tests
  /suites                       # Browse suites
  /suites/:suiteId              # Suite details
  /suites/:suiteId/run          # Run suite
  /runs                         # Recent runs
  /runs/:runId                  # Run details
  /runs/:runId/trace            # Integrated trace view
  /compare                      # Compare runs
  /compare/:runId1/:runId2      # Comparison view
  /costs                        # Cost analytics
  /feedback                     # Feedback management
  /editor                       # Test editor
  /editor/:testId               # Edit test
  /reports                      # Report generator
```

## Data Services

### TestingService
Main service for test operations:
```typescript
export class TestingService {
  // Test execution
  runTest(testId: string, options?: RunOptions): Observable<TestRunEntity>
  runSuite(suiteId: string, options?: SuiteRunOptions): Observable<TestSuiteRunEntity>

  // Test management
  getTests(filters?: TestFilters): Observable<TestEntity[]>
  getSuites(): Observable<TestSuiteEntity[]>
  getTestRuns(testId: string): Observable<TestRunEntity[]>

  // Analytics
  getPassRateTrend(testId: string, days: number): Observable<TrendData>
  getCostAnalysis(dateRange: DateRange): Observable<CostData>
  getFailureAnalysis(suiteId: string): Observable<FailureData>

  // Human feedback
  submitFeedback(runId: string, feedback: Feedback): Observable<void>
}
```

### TraceNavigationService
Integration with trace viewer:
```typescript
export class TraceNavigationService {
  // Navigate from test run to trace
  navigateToTrace(testRun: TestRunEntity): void

  // Filter traces by test context
  getTestTraces(filters: TraceFilters): Observable<AgentRunEntity[]>

  // Replay test from trace
  replayFromTrace(traceId: string): Observable<TestRunEntity>
}
```

## State Management

Using RxJS for reactive state:
```typescript
export class TestingStateService {
  // Current test runs (real-time updates)
  activeRuns$: Observable<TestRunEntity[]>

  // Recent results
  recentResults$: Observable<TestRunEntity[]>

  // Suite execution state
  suiteRunProgress$: Observable<SuiteProgress>

  // Cost tracking
  currentMonthCost$: Observable<number>
}
```

## Real-Time Updates

WebSocket integration for live test execution updates:
```typescript
export class TestExecutionWebSocketService {
  // Subscribe to test run updates
  subscribeToRun(runId: string): Observable<TestRunUpdate>

  // Subscribe to suite run updates
  subscribeToSuite(suiteRunId: string): Observable<SuiteRunUpdate>

  // Get real-time progress
  getProgress(suiteRunId: string): Observable<ProgressUpdate>
}
```

## Future Features

### Computer Use Agent Integration
When CUA models mature:
- Automated UI validation
- Screenshot comparison
- Interaction testing
- Visual regression detection

### Advanced Analytics
- ML-based failure prediction
- Anomaly detection in test results
- Automated test prioritization
- Smart test selection based on code changes

### Collaboration Features
- Shared test collections
- Team feedback aggregation
- Review workflows
- Discussion threads on failures

## Development Guidelines

1. **Follow MJ Patterns** - Use existing MJ components and conventions
2. **Responsive Design** - Support mobile, tablet, desktop
3. **Accessibility** - WCAG 2.1 AA compliance
4. **Performance** - Lazy load routes, virtual scrolling for large lists
5. **Real-Time** - WebSocket updates for running tests
6. **Error Handling** - Clear error messages with actionable guidance

## Implementation Phases

### Phase 1: Core Views
- [ ] Test Dashboard
- [ ] Test Explorer
- [ ] Test Run Viewer
- [ ] Trace Integration

### Phase 2: Analytics
- [ ] Suite Run Dashboard
- [ ] Cost Analytics
- [ ] Test Comparison

### Phase 3: Interactive Features
- [ ] Human Feedback Interface
- [ ] Test Editor
- [ ] Report Generator

### Phase 4: Advanced Features
- [ ] Real-time updates
- [ ] CUA integration
- [ ] ML-powered insights

## Technology Stack

- **Framework:** Angular 21
- **UI Library:** MemberJunction component library
- **Charts:** D3.js (via MJ chart components)
- **State:** RxJS
- **Forms:** Angular Reactive Forms
- **Real-Time:** WebSockets
- **Styling:** SCSS (following MJ conventions)

---

**Note:** This UI package is currently in planning phase. Implementation will begin after Engine and CLI are functional.
