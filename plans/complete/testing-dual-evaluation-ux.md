# Testing Dashboard Dual Evaluation System - Implementation Plan

## Executive Summary

Transform the MemberJunction testing dashboard to support a three-layer evaluation model:
1. **Execution Status** - Did the test complete? (Completed, Error, Timeout, etc.)
2. **Automated Score** - Oracle/algorithmic evaluation (0-100%)
3. **Human Rating** - User feedback (1-10 scale with correctness override)

Users can toggle which evaluation types to display, with preferences persisted via `MJ: User Settings`.

---

## Current State Analysis

### Schema Capabilities (Already Exists)

**TestRun Entity:**
- `Status` - Execution outcome: Pending, Running, Passed, Failed, Skipped, Error, Timeout
- `Score` - Automated oracle score (0.0000 to 1.0000)
- `PassedChecks`, `FailedChecks`, `TotalChecks` - Detailed check results

**TestRunFeedback Entity:**
- `Rating` - Human quality rating (1-10)
- `IsCorrect` - Boolean override of automated result
- `Comments`, `CorrectionSummary` - Qualitative feedback

### Current UI Problem
- "Pass Rate" everywhere is based on `Status = 'Passed'` (just means completed without error)
- Score field exists but oracles aren't being used
- Human feedback exists but isn't surfaced as primary metric
- No way to see agreement between automated and human evaluation
- No user preference for which metrics matter

---

## UX Design Specifications

### 1. Evaluation Mode Toggle Component

**Location:** Filter bar on Analytics tabs (Test Suite Form, Test Form, Testing Dashboard)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Evaluation Display:                                                          │
│ [✓ Execution Status] [✓ Human Ratings] [○ Auto Scores]                      │
│                                                                              │
│ ℹ️ Toggle which metrics drive pass rates and color coding                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Behavior:**
- Checkboxes for each evaluation type (multi-select)
- At least one must be selected
- Default: Execution Status + Human Ratings (since oracles aren't in use yet)
- Saved to `MJ: User Settings` with key `__mj.Testing.EvaluationMode`
- Settings value: JSON `{ "showExecution": true, "showHuman": true, "showAuto": false }`

### 2. New Visual Components

#### 2.1 Evaluation Badge (`<app-evaluation-badge>`)

**Props:**
```typescript
interface EvaluationBadgeProps {
  executionStatus: 'Completed' | 'Error' | 'Timeout' | 'Running' | 'Pending' | 'Skipped';
  autoScore: number | null;       // 0-1, null if not evaluated
  humanRating: number | null;     // 1-10, null if no feedback
  humanIsCorrect: boolean | null; // null if no feedback
  displayMode: 'compact' | 'expanded' | 'inline';
  showExecution: boolean;         // From user prefs
  showHuman: boolean;             // From user prefs
  showAuto: boolean;              // From user prefs
}
```

**Compact Mode (tables/lists):**
```
[✓] [👤 8] [⚙ 85%]
 │    │      │
 │    │      └─ Auto score (if showAuto && score exists)
 │    └─ Human rating (if showHuman && rating exists)
 └─ Execution icon (if showExecution)
```

**Expanded Mode (run details):**
```
┌──────────────────────────────┐
│ ✓ Completed                  │  ← Execution (if showExecution)
│ 👤 Rating: 8/10 ✓ Correct    │  ← Human (if showHuman && exists)
│ ⚙ Auto: 85% (17/20 checks)  │  ← Auto (if showAuto && exists)
└──────────────────────────────┘
```

**Inline Mode (KPIs, cells):**
```
85% (or 8/10 or ✓ depending on priority)
```

#### 2.2 Review Status Indicator

Shows feedback completion status:
```
[✓ Reviewed] or [⚠ Needs Review] or [— Not Reviewed]
```

### 3. Updated KPI Cards

**Current:**
```
[Total Runs] [Pass Rate] [Avg Duration] [Total Cost] [Pending Review]
```

**Proposed (two-row layout):**

**Row 1 - Volume:**
```
[Total Runs: 45] [Reviewed: 32/45 (71%)] [Avg Duration: 3.2s] [Total Cost: $12.50]
```

**Row 2 - Quality (configurable based on user prefs):**
```
[Exec Success: 91%] [Human Rating: 7.2/10] [Auto Score: 78%] [Agreement: 85%]
     ↑ if showExec      ↑ if showHuman       ↑ if showAuto     ↑ always
```

### 4. Summary Table Updates

**New Columns:**
| Date | Exec | Human Avg | Auto Score | Reviewed | Duration | Cost | Tags |
|------|------|-----------|------------|----------|----------|------|------|
| Today | ✓ 5/5 | ★ 7.5 | 78% | 3/5 ⚠ | 3.2s | $2.50 | [v2.1] |

- Show/hide columns based on evaluation mode preferences
- "Reviewed" column always visible (shows X/Y with warning if incomplete)

### 5. Matrix View Cell Updates

**Current:** Status icon + Score %
**Proposed:** Layered display based on preferences

```
Default:
┌─────┐
│ ✓ 8 │  ← Exec icon + Human rating (if exists)
│ 85% │  ← Auto score (if exists)
└─────┘

Color coding priority:
1. Human rating (if showHuman && exists): green >7, yellow 5-7, red <5
2. Auto score (if showAuto && exists): green >80%, yellow 50-80%, red <50%
3. Execution status (if showExecution): green=completed, red=error, etc.
```

### 6. Needs Review Queue

New section on Test Suite Run Form (Overview tab):

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠ NEEDS REVIEW (13 tests)                          [Review All] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Priority (potential issues):                                    │
│ • #5 Test ABC - [✓ Completed] but [⚙ 45%] ← Low auto score!    │
│ • #8 Test XYZ - [✗ Error] but partial output exists            │
│                                                                 │
│ Awaiting Review (11):                                           │
│ • #1 Test Name [✓] [⚙ 92%]                     [Quick Review]  │
│ • #2 Test Name [✓] [⚙ 88%]                     [Quick Review]  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Model Updates

### New Interfaces

```typescript
// User preferences for evaluation display
interface EvaluationPreferences {
  showExecution: boolean;  // Show execution status
  showHuman: boolean;      // Show human ratings
  showAuto: boolean;       // Show automated scores
}

// Extended test run summary with feedback
interface TestRunWithFeedback {
  id: string;
  testId: string;
  testName: string;
  // Execution
  executionStatus: 'Completed' | 'Error' | 'Timeout' | 'Running' | 'Pending' | 'Skipped';
  // Automated
  autoScore: number | null;
  passedChecks: number | null;
  failedChecks: number | null;
  totalChecks: number | null;
  // Human
  humanRating: number | null;
  humanIsCorrect: boolean | null;
  hasHumanFeedback: boolean;
  feedbackCount: number;
  // Metadata
  duration: number;
  cost: number;
  runDateTime: Date;
  tags: string[];
}

// Aggregated metrics respecting user preferences
interface EvaluationMetrics {
  // Execution-based (when showExecution)
  execSuccessRate: number;      // % completed without error
  execSuccessCount: number;
  execTotalCount: number;
  // Human-based (when showHuman)
  humanAvgRating: number;       // Average 1-10 rating
  humanReviewedCount: number;
  humanCorrectRate: number;     // % marked as correct
  // Auto-based (when showAuto)
  autoAvgScore: number;         // Average 0-100%
  autoEvaluatedCount: number;
  // Agreement
  agreementRate: number;        // % where human agrees with auto
}
```

---

## Implementation Tasks

### Phase 1: Foundation Components

#### 1.1 Create Evaluation Preferences Service
**File:** `packages/Angular/Generic/Testing/src/lib/services/evaluation-preferences.service.ts`

- Load/save preferences to `MJ: User Settings`
- Setting key: `__mj.Testing.EvaluationPreferences`
- Expose BehaviorSubject for reactive updates
- Default: `{ showExecution: true, showHuman: true, showAuto: false }`

#### 1.2 Create Evaluation Badge Component
**File:** `packages/Angular/Generic/Testing/src/lib/components/widgets/evaluation-badge.component.ts`

- Accept all evaluation data + user preferences
- Render appropriate display based on mode and prefs
- Support compact/expanded/inline display modes

#### 1.3 Create Evaluation Mode Toggle Component
**File:** `packages/Angular/Generic/Testing/src/lib/components/widgets/evaluation-mode-toggle.component.ts`

- Three checkboxes for execution/human/auto
- Enforce at least one selected
- Auto-save on change
- Emit changes for parent components

#### 1.4 Update Testing Module Exports
- Export new components and service
- Add to `public-api.ts`

### Phase 2: Data Layer Updates

#### 2.1 Update Testing Instrumentation Service
**File:** `packages/Angular/Explorer/dashboards/src/Testing/services/testing-instrumentation.service.ts`

- Add `loadTestRunsWithFeedback()` method
- Join TestRuns with TestRunFeedback data
- Calculate aggregated metrics respecting preferences
- Add new observables: `testRunsWithFeedback$`, `evaluationMetrics$`

#### 2.2 Create Feedback Aggregation Utilities
- Calculate pass rates based on selected evaluation modes
- Compute agreement rates between human and auto
- Generate "needs review" priority queue

### Phase 3: UI Integration - Test Suite Run Form

#### 3.1 Update Overview Tab
- Add "Needs Review" queue section
- Update metrics display with evaluation badges
- Add evaluation mode toggle to header

#### 3.2 Update Test Runs Tab
- Replace simple status with evaluation badge
- Show human rating prominently when exists
- Add "Reviewed" indicator column
- Integrate inline feedback with evaluation context

#### 3.3 Update Analytics Tab
- Add evaluation mode toggle to filter bar
- Update KPIs with configurable metrics
- Update table columns based on preferences

### Phase 4: UI Integration - Test Suite Form

#### 4.1 Update Analytics Tab
- Add evaluation mode toggle
- Update summary table with new columns
- Update matrix view cells with layered display
- Update chart view with human rating data

#### 4.2 Update Runs Tab
- Add evaluation badges to run list items
- Show feedback status indicators

### Phase 5: UI Integration - Test Form

#### 5.1 Add Feedback Summary Section
- Rating distribution chart
- Average rating over time
- Common feedback themes (future)

#### 5.2 Update Analytics Tab
- Evaluation mode toggle
- Updated KPIs with feedback metrics

### Phase 6: Testing Dashboard Updates

#### 6.1 Update Overview Component
- Add evaluation mode toggle
- Update KPI cards with configurable metrics

#### 6.2 Update Execution Monitor
- Add evaluation badges to execution list
- Show feedback status in detail view

---

## User Settings Schema

**Setting Key:** `__mj.Testing.EvaluationPreferences`

**Value Format (JSON):**
```json
{
  "showExecution": true,
  "showHuman": true,
  "showAuto": false
}
```

**Loading Pattern:**
```typescript
const engine = UserInfoEngine.Instance;
const setting = engine.UserSettings.find(s => s.Setting === EVAL_PREFS_KEY);
if (setting?.Value) {
  return JSON.parse(setting.Value) as EvaluationPreferences;
}
return DEFAULT_EVALUATION_PREFERENCES;
```

**Saving Pattern:**
```typescript
const md = new Metadata();
const engine = UserInfoEngine.Instance;
let setting = engine.UserSettings.find(s => s.Setting === EVAL_PREFS_KEY);

if (!setting) {
  setting = await md.GetEntityObject<UserSettingEntity>('MJ: User Settings');
  setting.UserID = userId;
  setting.Setting = EVAL_PREFS_KEY;
}

setting.Value = JSON.stringify(preferences);
await setting.Save();
```

---

## Visual Design Specifications

### Color Palette

**Execution Status:**
- Completed: `#22c55e` (green-500)
- Error/Failed: `#ef4444` (red-500)
- Timeout: `#f97316` (orange-500)
- Running: `#3b82f6` (blue-500)
- Pending: `#d1d5db` (gray-300)
- Skipped: `#a1a1aa` (gray-400)

**Human Rating (1-10):**
- 8-10: `#22c55e` (green) - Excellent
- 5-7: `#f59e0b` (amber) - Acceptable
- 1-4: `#ef4444` (red) - Poor

**Auto Score (0-100%):**
- 80-100%: `#22c55e` (green)
- 50-79%: `#f59e0b` (amber)
- 0-49%: `#ef4444` (red)

**Review Status:**
- Reviewed: `#22c55e` (green) with checkmark
- Needs Review: `#f59e0b` (amber) with warning
- Not Reviewed: `#9ca3af` (gray) with dash

### Icons

- Execution: `fa-circle-check` (completed), `fa-circle-xmark` (error), `fa-clock` (timeout)
- Human Rating: `fa-user` or `fa-star`
- Auto Score: `fa-robot` or `fa-cog`
- Review Status: `fa-clipboard-check` (reviewed), `fa-clipboard-question` (needs review)

---

## Success Metrics

1. **Clarity**: Users can immediately see which tests have human feedback vs automated scores
2. **Flexibility**: Users can choose which metrics matter for their workflow
3. **Persistence**: Preferences survive across sessions
4. **Performance**: No additional round trips - feedback data loaded with test runs
5. **Discoverability**: "Needs Review" queue surfaces priority items

---

## Future Enhancements (Out of Scope)

1. Feedback theme analysis (NLP on comments)
2. Auto vs Human correlation graphs
3. Bulk review workflow
4. Keyboard navigation for review queue
5. Export evaluation report

---

## Files to Create/Modify

### New Files:
- `packages/Angular/Generic/Testing/src/lib/services/evaluation-preferences.service.ts`
- `packages/Angular/Generic/Testing/src/lib/components/widgets/evaluation-badge.component.ts`
- `packages/Angular/Generic/Testing/src/lib/components/widgets/evaluation-mode-toggle.component.ts`
- `packages/Angular/Generic/Testing/src/lib/components/widgets/review-status-indicator.component.ts`
- `packages/Angular/Generic/Testing/src/lib/models/evaluation.types.ts`

### Modified Files:
- `packages/Angular/Generic/Testing/src/lib/testing.module.ts`
- `packages/Angular/Generic/Testing/src/public-api.ts`
- `packages/Angular/Explorer/dashboards/src/Testing/services/testing-instrumentation.service.ts`
- `packages/Angular/Explorer/dashboards/src/Testing/components/testing-overview.component.ts`
- `packages/Angular/Explorer/dashboards/src/Testing/components/testing-execution.component.ts`
- `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Tests/test-suite-form.component.ts`
- `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Tests/test-suite-form.component.html`
- `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Tests/test-suite-form.component.css`
- `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Tests/test-suite-run-form.component.ts`
- `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Tests/test-suite-run-form.component.html`
- `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Tests/test-suite-run-form.component.css`
- `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Tests/test-form.component.ts` (if exists)
- `packages/Angular/Explorer/core-entity-forms/src/lib/custom/Tests/test-run-form.component.ts` (if exists)
