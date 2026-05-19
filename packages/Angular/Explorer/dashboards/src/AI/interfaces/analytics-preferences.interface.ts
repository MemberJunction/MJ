/**
 * @fileoverview AI Analytics user preferences and filter state interfaces.
 *
 * These interfaces define the shape of persisted user preferences for
 * each section of the AI Analytics dashboard, as well as the global
 * filter state shared across sections.
 */

export interface AIAnalyticsPreferences {
    ActiveSection: string;
    ExecutiveSummary: ExecutiveSummaryPrefs;
    PromptRuns: PromptRunPrefs;
    AgentRuns: AgentRunPrefs;
    ModelPerformance: ModelPerformancePrefs;
    CostBudget: CostBudgetPrefs;
}

export interface GlobalFilterState {
    Models: string[];
    Agents: string[];
    Prompts: string[];
    Statuses: string[];
}

export interface ExecutiveSummaryPrefs {
    TimeRange: string;
    ComparisonEnabled: boolean;
    Filters: GlobalFilterState;
}

export interface PromptRunPrefs {
    TimeRange: string;
    Filters: GlobalFilterState;
    ChartMetric: string;
    SortField: string;
    SortDirection: 'asc' | 'desc';
}

export interface AgentRunPrefs {
    TimeRange: string;
    Filters: { Agents: string[]; Statuses: string[] };
}

export interface ModelPerformancePrefs {
    TimeRange: string;
    SortBy: string;
    VendorFilter: string[];
}

export interface CostBudgetPrefs {
    TimeRange: string;
    Filters: GlobalFilterState;
}
