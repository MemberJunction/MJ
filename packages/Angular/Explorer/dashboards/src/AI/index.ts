// Services
export * from './services/ai-instrumentation.service';

// Main Components
export * from './components/execution-monitoring.component';
export * from './components/prompts/prompt-management.component';
export * from './components/agents/agent-configuration.component';
export * from './components/models/model-management.component';
export * from './components/system/system-configuration.component';

// Widget Components
export * from './components/widgets/kpi-card.component';
export * from './components/widgets/live-execution-widget.component';
export * from './components/charts/time-series-chart.component';
export * from './components/charts/performance-heatmap.component';

// Agent Requests
export * from './components/requests/agent-requests-resource.component';

// Autotagging Pipeline
export * from './components/autotagging/autotagging-pipeline-resource.component';

// Tags — canonical Knowledge Hub dashboard for everything tag-related
// (Library + Taxonomy moved from Classify, plus Suggestions + Health).
// Re-exported explicitly because the file is a clone of the autotag pipeline
// and shares cron-helper module-level exports we don't want to re-export twice.
export { TagsResourceComponent, LoadTagsResource } from './components/tags/tags-resource.component';

// Vector Management
export * from './components/vectors/vector-management-resource.component';

// Duplicate Detection
export * from './components/duplicates/duplicate-detection-resource.component';

// AI Analytics
export * from './interfaces/analytics-preferences.interface';
export * from './components/analytics/analytics-filter-bar.component';
export * from './components/analytics/ai-analytics-resource.component';
export * from './components/analytics/executive-summary/executive-summary.component';
export * from './components/analytics/prompt-runs/prompt-run-analysis.component';
export * from './components/analytics/agent-runs/agent-run-analysis.component';
export * from './components/analytics/model-performance/model-performance.component';
export * from './components/analytics/cost-budget/cost-budget.component';
export * from './components/analytics/error-analysis/error-analysis.component';
export * from './components/analytics/usage-patterns/usage-patterns.component';

// Realtime Voice (agent sessions)
export * from './components/analytics/realtime/realtime-session-data';
export * from './components/analytics/realtime/realtime-overview.component';
export * from './components/analytics/realtime/realtime-sessions.component';

// Realtime management (bridges, providers, identities, channels, co-agents)
export * from './components/analytics/realtime/realtime-management-data';
export * from './components/analytics/realtime/realtime-management.component';

// Overview Hub
export * from './components/overview/ai-overview-hub.component';