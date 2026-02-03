# UI Component Audit Report

**Date:** February 2, 2026
**Purpose:** Audit all UI components and inline patterns in MJExplorer for consolidation and cohesive look/feel.

---

## Executive Summary

- **106 stories** across **13 components** already documented in Storybook
- **15 components** identified that need Storybook stories (8 high priority)
- **8 inline patterns** found across **200+ files** that should become reusable components

---

## Already Documented in Storybook (13 Components)

| Component | Selector | Stories | Package |
|-----------|----------|---------|---------|
| Loading | `mj-loading` | 14 | `@memberjunction/ng-shared-generic` |
| NotificationBadge | `mj-notification-badge` | 9 | `@memberjunction/ng-conversations` |
| ActivityIndicator | `mj-activity-indicator` | 9 | `@memberjunction/ng-conversations` |
| CollapsiblePanel | `mj-collapsible-panel` | 8 | `@memberjunction/ng-base-forms` |
| Pill | `mj-pill` | 10 | `@memberjunction/ng-entity-viewer` |
| Toast | `mj-toast` | 5 | `@memberjunction/ng-conversations` |
| TestStatusBadge | `app-test-status-badge` | 7 | Testing |
| EvaluationBadge | `app-evaluation-badge` | 8 | Testing |
| KPICard | `app-kpi-card` | 8 | `@memberjunction/ng-dashboards` |
| SettingsCard | `mj-settings-card` | 6 | `@memberjunction/ng-explorer-settings` |
| ActionCard | `mj-action-card` | 8 | `@memberjunction/ng-dashboards` |
| ActionListItem | `mj-action-list-item` | 8 | `@memberjunction/ng-dashboards` |
| ActionItemSimple | (inline pattern) | 6 | N/A |

**Story Files:**
- `src/stories/loading.stories.ts`
- `src/stories/notification-badge.stories.ts`
- `src/stories/activity-indicator.stories.ts`
- `src/stories/collapsible-panel.stories.ts`
- `src/stories/pill.stories.ts`
- `src/stories/toast.stories.ts`
- `src/stories/test-status-badge.stories.ts`
- `src/stories/evaluation-badge.stories.ts`
- `src/stories/kpi-card.stories.ts`
- `src/stories/settings-card.stories.ts`
- `src/stories/action-card.stories.ts`
- `src/stories/action-list-item.stories.ts`
- `src/stories/action-item-simple.stories.ts`

---

## Components NOT Yet in Storybook

### High Priority (8 components)

| Component | Selector | Package | Description |
|-----------|----------|---------|-------------|
| ActiveAgentIndicator | `mj-active-agent-indicator` | `ng-conversations` | AI agent processing indicator |
| EntityLinkPill | `mj-entity-link-pill` | `core-entity-forms` | Entity navigation pill/link |
| ScoreIndicator | `app-score-indicator` | Testing | Numerical score with color coding |
| ReviewStatusIndicator | `app-review-status-indicator` | Testing | Review state display |
| StepInfoControl | `mj-step-info-control` | `core-entity-forms` | Workflow step display |
| ArtifactMessageCard | `mj-artifact-message-card` | `ng-artifacts` | Artifact messages in conversations |
| EvaluationModeToggle | `app-evaluation-mode-toggle` | Testing | Testing mode selection |
| ActionableCommands | `mj-actionable-commands` | `ng-conversations` | Message action buttons |

**Source Files:**
- `/packages/Angular/Generic/conversations/src/lib/components/agent/active-agent-indicator.component.ts`
- `/packages/Angular/Explorer/core-entity-forms/src/lib/custom/Tests/entity-link-pill.component.ts`
- `/packages/Angular/Generic/Testing/src/lib/components/widgets/score-indicator.component.ts`
- `/packages/Angular/Generic/Testing/src/lib/components/widgets/review-status-indicator.component.ts`
- `/packages/Angular/Explorer/core-entity-forms/src/lib/custom/AIAgents/FlowAgentType/step-info-control.component.ts`
- `/packages/Angular/Generic/artifacts/src/lib/components/artifact-message-card.component.ts`
- `/packages/Angular/Generic/Testing/src/lib/components/widgets/evaluation-mode-toggle.component.ts`
- `/packages/Angular/Generic/conversations/src/lib/components/message/actionable-commands.component.ts`

### Medium Priority (5 components)

| Component | Selector | Package | Description |
|-----------|----------|---------|-------------|
| TestResultsMatrix | `mj-test-results-matrix` | Testing | Test suite results visualization |
| ExecutionContext | `mj-execution-context` | Testing | Test execution information |
| CollectionArtifactCard | `mj-collection-artifact-card` | `ng-conversations` | Artifact collections display |
| Task | `mj-task` | `ng-tasks` | Task list item display |
| TreeDropdown | `mj-tree-dropdown` | `ng-trees` | Hierarchical selection |

---

## Inline Patterns to Consolidate

These are **repeated inline code patterns** found across 200+ files that should be extracted into reusable components.

### 1. Status Badges (30+ files)
**Current State:** Mix of `kendo-chip`, `span.status-badge`, inline styles
**Inconsistencies:**
- Some use `kendo-chip` with `themeColor`, others use custom spans with `ngClass`
- Size attributes vary (`'small'`, `'medium'`)
- Some use inline `[style.backgroundColor]`, others use CSS classes

**Example locations:**
- `dashboards/src/Actions/components/explorer/action-card.component.html`
- `dashboards/src/Actions/components/explorer/action-list-item.component.html`

**Recommendation:** Create `StatusBadgeComponent`

### 2. Empty States (40+ files) - HIGHEST IMPACT
**Current State:** Inconsistent icon, message, and action button patterns
**Inconsistencies:**
- Some have icon in `<div class="empty-icon">`, others inline
- Message styling varies (`<p>` vs `<div>`)
- Some include action buttons, others don't
- Icon types and font sizes vary

**Example locations:**
- `skip-chat/src/lib/artifacts/skip-artifact-viewer.component.html`
- `file-storage/src/lib/file-browser/file-grid.component.html`
- `conversations/src/lib/components/conversation/conversation-empty-state.component.html`
- `conversations/src/lib/components/search/search-panel.component.html`

**Recommendation:** Create `EmptyStateComponent` with inputs:
- `icon: string` (Font Awesome class)
- `message: string`
- `actionLabel?: string`
- `actionIcon?: string`

### 3. Stat/Metric Cards (15+ files)
**Current State:** `stat-item`, `stat-badge`, varying layouts
**Inconsistencies:**
- Structure varies: `stat-item` with nested `stat-value`/`stat-label` vs inline
- Conditional styling applied differently (class vs style bindings)
- Color coding inconsistent

**Example locations:**
- `dashboards/src/Actions/components/explorer/action-card.component.html`
- `dashboards/src/VersionHistory/components/graph-resource.component.html`
- `explorer-settings/src/lib/sql-logging/sql-logging.component.html`

**Recommendation:** Create `StatMetricComponent` with inputs:
- `value: string | number`
- `label: string`
- `icon?: string`
- `trend?: 'up' | 'down' | 'neutral'`
- `thresholds?: { warning: number, danger: number }`

### 4. Icon + Label Headers (20+ files)
**Current State:** `section-title`, `section-header` variations
**Inconsistencies:**
- Some use `<h3 class="section-title">` with nested icon
- Others use `<div class="section-header">`
- Icon color and styling varies

**Example locations:**
- `credentials/src/lib/panels/credential-edit-panel/credential-edit-panel.component.html`
- `credentials/src/lib/panels/credential-category-edit-panel/credential-category-edit-panel.component.html`

**Recommendation:** Create `IconLabelComponent`

### 5. Action Button Groups (15+ files)
**Current State:** Run/Edit/Delete with varying button styles
**Inconsistencies:**
- Button sizing varies (`'small'`, no size)
- Fill modes differ (`'flat'`, default)
- Titles/tooltips sometimes missing

**Example locations:**
- `dashboards/src/Actions/components/explorer/action-card.component.html`
- `file-storage/src/lib/files-grid/files-grid.html`

**Recommendation:** Create `ActionButtonGroupComponent`

### 6. Parameter Tag Lists (10+ files)
**Current State:** Required indicators styled differently
**Inconsistencies:**
- Some use `<span class="param-tag">`, others `<div class="param-item">`
- Required indicator varies: `required-marker` vs `required-indicator` vs `required-badge`

**Example locations:**
- `dashboards/src/Actions/components/explorer/action-card.component.html`
- `action-gallery/src/lib/action-gallery.component.html`

**Recommendation:** Create `ParameterTagListComponent`

### 7. Timestamp Display (25+ files)
**Current State:** Mixed date formats and icon usage
**Inconsistencies:**
- Formats vary: `date:'short'`, `date:'medium'`, `date:'mediumDate'`, `date:'full'`
- Some have clock icon, others plain
- Different wrapping elements

**Recommendation:** Create `TimestampDisplayComponent`

### 8. Colored Icon Headers (10+ files)
**Current State:** Panel headers with colored icon blocks
**Inconsistencies:**
- Color calculation differs
- Background opacity calculation varies
- Icon fallback handling differs

**Example locations:**
- `credentials/src/lib/panels/credential-edit-panel/credential-edit-panel.component.html`
- `credentials/src/lib/panels/credential-type-edit-panel/credential-type-edit-panel.component.html`

**Recommendation:** Create `HeaderWithIconComponent`

---

## Next Steps

### Phase 1: Document Remaining Components
Add Storybook stories for the 8 high-priority undocumented components.

### Phase 2: Create Consolidated Components
Extract the 3 most impactful inline patterns:
1. `EmptyStateComponent` (40+ files)
2. `StatusBadgeComponent` (30+ files)
3. `StatMetricComponent` (15+ files)

### Phase 3: Migrate Inline Patterns
Replace inline code with new components across the codebase.

---

## Running Storybook

```bash
cd packages/MJExplorer
npm run storybook
```

Open http://localhost:6006 to view all documented components.

---

## Configuration Notes

- Storybook 8.4.7 is configured
- `storybook-overrides.scss` fixes scrolling in docs pages
- Stories use mock data patterns (see `action-card.stories.ts` for complex example)
