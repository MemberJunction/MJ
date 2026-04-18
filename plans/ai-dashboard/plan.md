# AI Analytics Redesign — Detailed Implementation Plan

## Selected Design Options
- **Overview Hub**: Option A — Card Grid with Stats Badges
- **Analytics Shell + Executive Summary**: Option A — Classic 6-KPI Dashboard
- **Prompt Run Analysis**: Option B — Charts-First + Table
- **Agent Run Analysis**: Option B — Cost Attribution Focus
- **Model Performance + Cost**: Option B — Cost & Budget

---

## PART 1: Overview Hub (replaces current ExecutionMonitoringComponent as default)

### Component: `AIOverviewHubComponent`
- **Registration**: `@RegisterClass(BaseResourceComponent, 'AIMonitorResource')` — takes over the existing driver class
- **File**: `packages/Angular/Explorer/dashboards/src/AI/components/overview/ai-overview-hub.component.ts`
- **Data Source**: `AIEngineBase.Instance` (zero queries, in-memory only)
- **Standalone**: `false` (declared in `AIDashboardsModule`)

### Layout Specification

#### Hero Section
- Title: "AI Administration" with `fa-solid fa-robot` icon (brand-primary color)
- Subtitle: "Manage your AI agents, models, prompts, and monitor performance"
- **Quick Stats Strip**: Horizontal row of pill badges, each showing:
  - Active Agents count (from `AIEngineBase.Instance.Agents.filter(a => a.Status === 'Active').length`)
  - Models count (from `AIEngineBase.Instance.Models.length`)
  - Prompts count (from `AIEngineBase.Instance.Prompts.length`)
  - Vendors count (from `AIEngineBase.Instance.Vendors.length`)

#### Navigation Cards Grid (2x3)
Each card has: colored top border, icon in colored circle, title, description, 2 stat badges, arrow icon.

| Card | Icon | Color | Top Border | Badge 1 | Badge 2 | Click Action |
|------|------|-------|------------|---------|---------|-------------|
| Analytics | fa-chart-line | brand-primary | brand-primary | "View insights" (static) | — | Navigate to Analytics tab |
| Agents | fa-robot | status-success | status-success | Active count | Types count | Navigate to Agents tab |
| Prompts | fa-comment-dots | brand-accent | brand-accent | Total count | Categories count | Navigate to Prompts tab |
| Models | fa-microchip | color-violet-500 | color-violet-500 | Total count | Vendors count | Navigate to Models tab |
| Agent Requests | fa-inbox | status-warning | status-warning | — | — | Navigate to Agent Requests tab |
| Configuration | fa-cogs | text-muted | text-muted | Configs count | Params count | Navigate to Configuration tab |

#### Card Hover Behavior
- `translateY(-4px)` with `box-shadow: 0 12px 32px color-mix(in srgb, var(--mj-brand-primary) 15%, transparent)`
- Arrow icon slides right 4px and turns brand-primary

#### Navigation Mechanism
Cards navigate to other tabs within the AI app. Use the resource data to find the application, then use `NavigationService` to navigate to the target tab. The recommended approach is:
```typescript
// Use NavigationService to navigate to a specific tab label within the current app
this.navigationService.NavigateToTabByLabel(tabLabel);
```
If `NavigateToTabByLabel` doesn't exist, use the pattern from existing dashboard code to find the target resource and navigate to it.

#### Lifecycle
- `ngOnInit()`: Call `super.ngOnInit()`, read data from `AIEngineBase.Instance`, call `NotifyLoadComplete()`
- No subscriptions needed — data is static from memory
- No `ngOnDestroy` cleanup needed beyond `super.ngOnDestroy()`

---

## PART 2: Analytics Resource Component (Shell)

### Component: `AIAnalyticsResourceComponent`
- **Registration**: `@RegisterClass(BaseResourceComponent, 'AIAnalyticsResource')`
- **File**: `packages/Angular/Explorer/dashboards/src/AI/components/analytics/ai-analytics-resource.component.ts`
- **Standalone**: `false`

### Layout
- **Left nav sidebar** (220px fixed width, scrollable)
- **Content area** (flex: 1, scrollable, 24px padding)

### Left Nav Items
| Label | Icon | Section Key |
|-------|------|-------------|
| Executive Summary | fa-gauge-high | `executive-summary` |
| Prompt Runs | fa-comment-dots | `prompt-runs` |
| Agent Runs | fa-robot | `agent-runs` |
| Model Performance | fa-microchip | `model-performance` |
| *(divider)* | | |
| Cost & Budget | fa-coins | `cost-budget` |
| Error Analysis | fa-triangle-exclamation | `error-analysis` |
| Usage Patterns | fa-clock | `usage-patterns` |

### Nav Item Behavior
- Click sets `ActiveSection` property
- Active item: left border 3px brand-primary, background `color-mix(in srgb, var(--mj-brand-primary) 8%, var(--mj-bg-surface))`
- Hover: background `var(--mj-bg-surface-hover)`
- Content area renders the matching child component via `@switch (ActiveSection)`

### User Preferences
- **Settings Key**: `AI.Analytics.UserPreferences`
- **Interface**: `AIAnalyticsPreferences`
- **Saved on change** with 500ms debounce via RxJS Subject
- **Loaded on init** from `UserInfoEngine.Instance.GetSetting()`

```typescript
interface AIAnalyticsPreferences {
  ActiveSection: string;
  ExecutiveSummary: {
    TimeRange: string;
    ComparisonEnabled: boolean;
    Filters: GlobalFilterState;
  };
  PromptRuns: {
    TimeRange: string;
    Filters: GlobalFilterState;
    ChartMetric: string; // 'volume' | 'cost' | 'tokens'
    SortField: string;
    SortDirection: 'asc' | 'desc';
  };
  AgentRuns: {
    TimeRange: string;
    Filters: { Agents: string[]; Statuses: string[] };
    ExpandedRunIds: string[];
  };
  ModelPerformance: {
    TimeRange: string;
    SortBy: string;
    VendorFilter: string[];
  };
  CostBudget: {
    TimeRange: string;
    Filters: GlobalFilterState;
  };
}

interface GlobalFilterState {
  Models: string[];
  Agents: string[];
  Prompts: string[];
  Statuses: string[];
}
```

### Lifecycle
- `ngOnInit()`: `super.ngOnInit()`, load preferences, set `ActiveSection` from prefs or default to `'executive-summary'`, call `NotifyLoadComplete()`
- `ngOnDestroy()`: `super.ngOnDestroy()`, flush pending settings

### Query Param Support
- `OnQueryParamsChanged`: reads `?section=` param to set `ActiveSection`
- On section change: `this.UpdateQueryParams({ section: this.ActiveSection })`

---

## PART 3: Executive Summary Section

### Component: `AnalyticsExecutiveSummaryComponent`
- **File**: `packages/Angular/Explorer/dashboards/src/AI/components/analytics/executive-summary/executive-summary.component.ts`
- **Standalone**: `false`
- **Inputs**: `TimeRange`, `Filters` (from parent analytics shell)
- **Outputs**: `TimeRangeChange`, `FiltersChange`

### Global Filter Bar
Located at top of content area. Shared across all sections.

| Element | Type | Options | Behavior |
|---------|------|---------|----------|
| "Filters:" label | Static text | — | — |
| Model dropdown | `<select>` | "All Models" + list from `AIEngineBase.Instance.Models` | Filters all data. Emits `FiltersChange`. |
| Agent dropdown | `<select>` | "All Agents" + list from `AIEngineBase.Instance.Agents` | Same. |
| Prompt dropdown | `<select>` | "All Prompts" + list from `AIEngineBase.Instance.Prompts` | Same. |
| Status dropdown | `<select>` | All Statuses, Success, Failed, Running | Same. |
| Compare toggle | `<button>` | — | Toggles comparison mode. Shows delta badges from prev period. |
| Time chips | Button group | 1H, 6H, 24H (default), 7D, 30D | Sets time range. Active chip gets brand-primary style. Emits `TimeRangeChange`. |

### KPI Row (6 cards in grid: `repeat(6, 1fr)`)
Each card has: label, value, sparkline (7-bar SVG), and period-over-period delta.

| KPI | Value Source | Sparkline | Delta |
|-----|-------------|-----------|-------|
| Total Executions | `promptRuns.length + agentRuns.length` | 7 bars from hourly buckets | % vs previous equivalent period |
| Total Cost | Sum of all costs | 7 bars cost trend | % change |
| Success Rate | `successCount / totalCount * 100` | — | % point change |
| Avg Latency | Avg of `ExecutionTimeMS` | — | % change (down=green) |
| Token Usage | Sum of all tokens | — | % change |
| Errors | Count of failed runs | — | Count change |

**KPI Card Click Behavior**: Clicking a KPI card scrolls to the relevant section.

**Sparkline**: 7 bars, each representing 1/7 of the time range. Height proportional to max value. Color: `color-mix(in srgb, var(--mj-brand-primary) 30%, transparent)`.

**Delta Badge**: Green arrow-up for improvement, red arrow-up for degradation. Shows "vs prev {period}" text.

### Execution Trends Chart (Full Width Panel)
- **Header**: "Execution Trends" with `fa-chart-line` icon, "View Details" link on right
- **Chart**: D3.js time series (reuse existing `TimeSeriesChartComponent`)
- **Data**: Hourly/4-hourly/daily buckets based on time range
- **Lines**: Executions (solid, brand-primary), Cost (dashed, status-warning)
- **Legend**: Bottom-right corner
- **Click behavior**: Clicking a data point opens a drill-down showing all executions in that time bucket

### Top Consumers Panel (Left, 50% width)
- **Header**: "Top Consumers" with `fa-ranking-star` icon, "See All" link
- **Content**: Ranked list of top 5 agents + prompts by cost
- Each row: Rank badge (1-3 get brand-primary bg), type pill (agent=green, prompt=accent), name, cost value, proportional bar
- **Click behavior**: Clicking a consumer row navigates to the Prompt Runs or Agent Runs section with that item pre-filtered

### Error Hotspots Panel (Right, 50% width)
- **Header**: "Error Hotspots" with `fa-triangle-exclamation` icon, "View All Errors" link
- **Content**: Top 4 error sources grouped by agent+model or prompt+model
- Each row: Error icon (red bg), source name, truncated error message, occurrence count
- **Click behavior**: Clicking "View All Errors" switches to the Error Analysis section.

### Data Loading
- Uses enhanced `AIInstrumentationService`
- Single batch load via `RunViews` for prompt runs + agent runs
- All metrics computed client-side from the raw data
- Comparison data: second batch load for the previous period (same duration, shifted back)

---

## PART 4: Prompt Run Analysis Section

### Component: `AnalyticsPromptRunsComponent`
- **File**: `packages/Angular/Explorer/dashboards/src/AI/components/analytics/prompt-runs/prompt-run-analysis.component.ts`
- **Standalone**: `false`

### Filter Bar
| Element | Behavior |
|---------|----------|
| Model dropdown | Populated from `AIEngineBase.Instance.Models` |
| Vendor dropdown | Populated from `AIEngineBase.Instance.Vendors` |
| Agent dropdown | Populated from `AIEngineBase.Instance.Agents` |
| Prompt dropdown | Populated from `AIEngineBase.Instance.Prompts` |
| Status dropdown | All / Success / Failed |
| Export CSV button | Downloads current filtered table data as CSV |
| Time chips | 24H (default), 7D, 30D, Custom |

### Stats Summary Bar (7 cards in horizontal grid)
| Stat | Computation | Color |
|------|-------------|-------|
| Total Runs | filtered count | brand-primary |
| Avg Cost | sum(cost) / count | default |
| Avg Tokens | sum(tokens) / count | default |
| Avg Latency | avg(ExecutionTimeMS) / 1000 | default |
| Success Rate | successCount / total * 100 | status-success |
| P95 Latency | 95th percentile of ExecutionTimeMS | status-warning if > 5s |
| Total Cost | sum(cost) | default |

### Chart Panel — Runs Over Time
- **Header**: "Runs Over Time" with toggle buttons: `By Volume` (default), `By Cost`, `By Tokens`
- **Chart**: Area chart with SVG gradient fill, line on top
- **X-axis**: Time buckets (hourly for 24H, 4-hourly for 7D, daily for 30D)
- **Y-axis**: Metric value
- **Toggle behavior**: Clicking a toggle button changes the chart metric. Active button gets brand-primary chip style.
- **Click/drill-down**: Clicking a time bucket on the chart filters the table below to show only runs from that bucket.

### Breakdown Cards Row (3 cards side by side)
| Card | Title | Content | Click Behavior |
|------|-------|---------|---------------|
| By Model | `fa-microchip` | Top 4 models with run count + proportional bar | Click model name filters table to that model |
| By Prompt | `fa-comment-dots` | Top 4 prompts with run count + proportional bar | Click prompt name filters table |
| By Status | `fa-check-circle` | Success/Failed/Running with count, percentage, color dot | Click status filters table |

### Run Details Table
- **Header**: "Run Details" with total run count
- **Columns**: Timestamp, Prompt (bold), Model (tag pill), Status (color pill), Duration, Tokens, Cost
- **Sorting**: Click column header to sort. Shows sort arrow icon. Default: Timestamp DESC.
- **Pagination**: Shows "Showing 1-25 of N runs". Page buttons.
- **Row click**: Opens drill-down modal with execution details and "Open Full Record" button.

---

## PART 5: Agent Run Analysis Section

### Component: `AnalyticsAgentRunsComponent`
- **File**: `packages/Angular/Explorer/dashboards/src/AI/components/analytics/agent-runs/agent-run-analysis.component.ts`

### Filter Bar
| Element | Behavior |
|---------|----------|
| Agent dropdown | From `AIEngineBase.Instance.Agents` |
| Status dropdown | All / Success / Failed / Running |
| Time chips | 24H (default), 7D, 30D |

### Stats Summary Bar (6 cards)
| Stat | Computation |
|------|-------------|
| Total Runs | filtered agent run count |
| Total Cost | sum(TotalCost) |
| Prompt Runs | count of child prompt runs |
| Avg Cost/Run | sum(cost) / count |
| Success Rate | successCount / total * 100 |
| Avg Duration | avg(duration) |

### Cost Attribution Panel
- **Header**: "Cost Attribution by Agent" with export button
- **Content**: Horizontal stacked bar per agent showing cost breakdown by prompt type
- Each row: Agent name (120px label), stacked bar with colored segments, total cost value
- **Segment colors**: brand-primary (Analysis), brand-accent (Generation), color-violet-500 (Summarize), status-error (Retries)
- **Legend**: Below the bars with color swatches
- **Click behavior**: Clicking an agent row expands to show child prompt runs
- **Hover behavior**: Hovering a segment shows tooltip with name, cost, percentage

### Recent Agent Runs Table
- **Columns**: Agent (bold), Status (pill), Steps, Duration, Cost (bold), Time
- **Row click**: Expands row inline showing child prompt runs as nested sub-table

---

## PART 6: Model Performance Section

### Component: `AnalyticsModelPerformanceComponent`
- **File**: `packages/Angular/Explorer/dashboards/src/AI/components/analytics/model-performance/model-performance.component.ts`

### Filter Bar
| Element | Behavior |
|---------|----------|
| Sort by dropdown | Cost Efficiency (default), Speed, Reliability, Usage Volume |
| Vendor dropdown | All Vendors / specific |
| Time chips | 7D (default), 30D, 90D |

### Model Leaderboard Table
- **Columns**: Rank (#), Model (icon + name + API ID), Vendor, Runs, Avg Latency, P95 Latency, Success Rate (with mini bar), $/1K Tokens, Total Cost
- **Rank badges**: Gold (#1), Silver (#2), Bronze (#3), neutral (#4+)
- **Color coding**: Green for best, red for worst metrics
- **Row click**: Opens model detail panel below with usage time series

---

## PART 7: Cost & Budget Section

### Component: `AnalyticsCostBudgetComponent`
- **File**: `packages/Angular/Explorer/dashboards/src/AI/components/analytics/cost-budget/cost-budget.component.ts`

### Filter Bar
| Element | Behavior |
|---------|----------|
| Model dropdown | All Models / specific |
| Vendor dropdown | All Vendors / specific |
| Time chips | Today, 7D (default), 30D, MTD |

### Cost KPI Row (4 cards)
| KPI | Value | Sub-text |
|-----|-------|----------|
| Today's Spend | Sum today's costs | % change vs yesterday |
| This Week | Sum last 7 days | % change vs prev week |
| This Month | Sum MTD | "X% through month" |
| Projected Monthly | dailyAvg * daysInMonth | "Based on 7-day trend" |

### Daily Cost Trend Chart (left, 60% width)
- Bar chart, one bar per day
- **Anomaly highlighting**: Bars > 2 std devs from mean get red fill
- **Average line**: Horizontal dashed line
- **Click behavior**: Clicking a bar filters cost table to that day

### Cost Breakdown Treemap (right, 40% width)
- CSS grid treemap showing vendors by cost proportion
- **Click behavior**: Clicking a vendor filters table to that vendor

### Cost by Model Table
- **Columns**: Model, Vendor, Runs, Input Tokens, Output Tokens, Input Cost, Output Cost, Total Cost, % of Total
- **Export CSV** button

---

## PART 8: Error Analysis Section (Basic)

### Component: `AnalyticsErrorAnalysisComponent`
- Basic error listing from existing prompt/agent run data
- Groups errors by source, shows count and last message
- Click to expand individual errors

---

## PART 9: Usage Patterns Section (Stub)

### Component: `AnalyticsUsagePatternsComponent`
- "Coming Soon" placeholder

---

## Module Registration

### Updates to `ai-dashboards.module.ts`
Add all new components to declarations and exports. Add tree-shaking prevention load functions.

### Updates to `lazy-feature-config.ts`
Add: `'BaseResourceComponent::AIAnalyticsResource': loadAiDashboardsModule`

### ExecutionMonitoringComponent
- Remove its `@RegisterClass` decorator (Overview Hub takes over `AIMonitorResource`)
- Keep the class — Executive Summary reuses its data service

---

## File Structure

```
packages/Angular/Explorer/dashboards/src/AI/
├── components/
│   ├── overview/
│   │   └── ai-overview-hub.component.ts            ← NEW
│   ├── analytics/
│   │   ├── ai-analytics-resource.component.ts       ← NEW (shell)
│   │   ├── analytics-filter-bar.component.ts        ← NEW (shared filter)
│   │   ├── executive-summary/
│   │   │   └── executive-summary.component.ts       ← NEW
│   │   ├── prompt-runs/
│   │   │   └── prompt-run-analysis.component.ts     ← NEW
│   │   ├── agent-runs/
│   │   │   └── agent-run-analysis.component.ts      ← NEW
│   │   ├── model-performance/
│   │   │   └── model-performance.component.ts       ← NEW
│   │   ├── cost-budget/
│   │   │   └── cost-budget.component.ts             ← NEW
│   │   ├── error-analysis/
│   │   │   └── error-analysis.component.ts          ← NEW
│   │   └── usage-patterns/
│   │       └── usage-patterns.component.ts          ← NEW (stub)
│   ├── execution-monitoring.component.ts            ← MODIFY: remove @RegisterClass
│   └── ...existing components unchanged...
├── services/
│   ├── ai-instrumentation.service.ts                ← ENHANCE
│   └── ai-analytics-preferences.service.ts          ← NEW
└── interfaces/
    └── analytics-preferences.interface.ts           ← NEW
```

---

## CSS Rules (ALL components)
- Zero hardcoded hex colors — every color uses `--mj-*` semantic tokens
- Responsive: `@media (max-width: 1200px)` and `@media (max-width: 768px)` breakpoints
- Transitions: `0.2s-0.3s cubic-bezier(0.4, 0, 0.2, 1)` for interactive elements
