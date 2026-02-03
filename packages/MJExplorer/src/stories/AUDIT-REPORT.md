# UI Component Audit Report

**Date:** February 2, 2026
**Updated:** February 3, 2026
**Purpose:** Audit all UI components and inline patterns in MJExplorer for consolidation and cohesive look/feel.

---

## Executive Summary

- **~170 stories** across **21 components** now documented in Storybook ✅
- **7 components** still need Storybook stories (medium priority)
- **8 inline patterns** found across **200+ files** that should become reusable components
- **Phase 1 Complete**: All 8 high-priority components now have Storybook stories

---

## Documented in Storybook (21 Components) ✅

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
| **ScoreIndicator** | `app-score-indicator` | **8** | **Testing** |
| **ReviewStatusIndicator** | `app-review-status-indicator` | **8** | **Testing** |
| **EvaluationModeToggle** | `app-evaluation-mode-toggle` | **6** | **Testing** |
| **EntityLinkPill** | `mj-entity-link-pill` | **8** | **core-entity-forms** |
| **StepInfoControl** | `mj-step-info-control` | **7** | **core-entity-forms** |
| **ActiveAgentIndicator** | `mj-active-agent-indicator` | **9** | **ng-conversations** |
| **ActionableCommands** | `mj-actionable-commands` | **8** | **ng-conversations** |
| **ArtifactMessageCard** | `mj-artifact-message-card` | **8** | **ng-artifacts** |

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
- `src/stories/score-indicator.stories.ts` *(new)*
- `src/stories/review-status-indicator.stories.ts` *(new)*
- `src/stories/evaluation-mode-toggle.stories.ts` *(new)*
- `src/stories/entity-link-pill.stories.ts` *(new)*
- `src/stories/step-info-control.stories.ts` *(new)*
- `src/stories/active-agent-indicator.stories.ts` *(new)*
- `src/stories/actionable-commands.stories.ts` *(new)*
- `src/stories/artifact-message-card.stories.ts` *(new)*

---

## Components NOT Yet in Storybook

### ~~High Priority (8 components)~~ ✅ COMPLETED

All 8 high-priority components now have Storybook stories. Stories use mock components to replicate visual behavior without requiring actual Angular services/dependencies.

### Medium Priority (5 components) - Remaining

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

### ~~Phase 1: Document Remaining Components~~ ✅ COMPLETED
All 8 high-priority components now have Storybook stories:
- `score-indicator.stories.ts` - 8 stories showing all score tiers, display options, table context
- `review-status-indicator.stories.ts` - 8 stories showing badge/count/progress modes
- `evaluation-mode-toggle.stories.ts` - 6 stories showing toggle behavior and contexts
- `entity-link-pill.stories.ts` - 8 stories showing entity links, truncation, contexts
- `step-info-control.stories.ts` - 7 stories showing all step types and workflow context
- `active-agent-indicator.stories.ts` - 9 stories showing all statuses, animations, expansion
- `actionable-commands.stories.ts` - 8 stories showing command types, disabled state, visibility
- `artifact-message-card.stories.ts` - 8 stories showing loading/error/success states, types

### Phase 1.5: Refactor Stories to Use Real Components ✅ IN PROGRESS
Refactored stories to import real Angular modules instead of mock components:

**Completed:**
- `score-indicator.stories.ts` - Uses `TestingModule` (was already using real component)
- `review-status-indicator.stories.ts` - Uses `TestingModule` (was already using real component)
- `actionable-commands.stories.ts` - Now imports `ConversationsModule` instead of mock component
- `step-info-control.stories.ts` - Now imports `MemberJunctionCoreEntityFormsModule` instead of mock component

**Remaining (Tier 2-3 with complex dependencies):**
- `entity-link-pill.stories.ts` - Uses `Metadata` and `SharedService.Instance` internally
- `evaluation-mode-toggle.stories.ts` - Uses `EvaluationPreferencesService`
- `active-agent-indicator.stories.ts` - Uses `AgentStateService` (Observable-based)
- `artifact-message-card.stories.ts` - Uses `RunView`, `ArtifactIconService`

### Phase 2: Create Consolidated Components
Extract the 3 most impactful inline patterns:
1. `EmptyStateComponent` (40+ files)
2. `StatusBadgeComponent` (30+ files)
3. `StatMetricComponent` (15+ files)

### Phase 3: Migrate Inline Patterns
Replace inline code with new components across the codebase.

### Phase 4: Document Medium Priority Components
Add stories for remaining 5 medium-priority components.

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
