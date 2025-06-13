# AI Instrumentation Dashboard

A comprehensive, real-time AI operations monitoring dashboard built for MemberJunction's AI framework. This dashboard provides deep insights into AI prompt runs, agent executions, cost analysis, and system performance metrics.

## 🚀 Overview

The AI Instrumentation Dashboard transforms raw execution data from `AIPromptRun`, `AIAgentRun`, and related entities into actionable insights through interactive visualizations, real-time monitoring, and detailed analytics.

### Key Features

- **Real-time Monitoring**: Live execution tracking with automatic refresh
- **Interactive Visualizations**: D3.js powered charts with zoom, pan, and drill-down
- **Performance Analytics**: Agent vs Model performance comparison matrix
- **Cost Intelligence**: Multi-model cost analysis with token efficiency metrics
- **System Health**: Success rates, error tracking, and response time monitoring
- **Hierarchical Execution Tracking**: Parent-child execution relationships with full context

## 📊 Dashboard Components

### 1. KPI Dashboard
Six animated metric cards providing at-a-glance system overview:
- **Total Executions**: Count with active execution indicator
- **Total Cost**: Spending with daily burn rate
- **Success Rate**: Performance with error rate breakdown
- **Average Response Time**: System performance across all models
- **Token Usage**: Total consumption with cost-per-token metrics
- **Top Model**: Most frequently used AI model

### 2. Live Execution Widget
Real-time execution monitoring with:
- Active execution counter with pulsing animation
- Progress rings for running executions
- Execution type indicators (Agent/Prompt)
- Duration tracking and cost metrics
- Clickable items for detailed drill-down

### 3. Time Series Chart
Interactive trend visualization featuring:
- Multi-metric overlays (executions, cost, tokens, errors)
- Configurable time ranges (1h to 30d)
- Zoom and pan functionality
- Interactive tooltips with detailed breakdowns
- Metric toggle controls for focused analysis

### 4. Performance Heatmap
Agent vs Model performance comparison with:
- Color-coded performance scoring
- Success rate and execution time metrics
- Interactive hover details
- Metric switching (performance, time, success rate)
- Visual performance optimization insights

### 5. Cost Analysis
Model cost breakdown featuring:
- Horizontal bar charts showing relative costs
- Token usage correlation
- Cost-per-model rankings
- Real-time cost tracking

### 6. Token Efficiency Analysis
Input/output token analysis with:
- Visual ratio breakdowns
- Cost-per-1K token calculations
- Model efficiency comparisons
- Color-coded efficiency indicators

### 7. System Health Monitor
Operational status dashboard showing:
- Success rate indicators
- Error rate tracking
- Average response times
- Active execution counts

## 🏗️ Architecture

### Service Layer
**AIInstrumentationService** provides reactive data streams using:
- RxJS observables for real-time updates
- Configurable refresh intervals (10s to 5m)
- Efficient data loading with MJ's RunView pattern
- Automatic error handling and retry logic

### Component Hierarchy
```
ExecutionMonitoringComponent (Main Dashboard)
├── KPICardComponent (Reusable metric cards)
├── LiveExecutionWidgetComponent (Real-time tracking)
├── TimeSeriesChartComponent (D3.js trend charts)
├── PerformanceHeatmapComponent (Performance matrix)
└── Modal Components (Detailed execution views)
```

### Data Flow
1. **Data Sources**: AIPromptRun, AIAgentRun, AIAgentRunStep entities
2. **Service Layer**: Reactive streams with caching and error handling
3. **Component Layer**: Typed observables with automatic subscription management
4. **Visualization Layer**: D3.js charts with smooth animations

## 🔧 Installation & Setup

### 1. Dependencies
Ensure these packages are installed:
```json
{
  "dependencies": {
    "d3": "^7.8.5",
    "@types/d3": "^7.4.0",
    "rxjs": "^7.5.0"
  }
}
```

### 2. Module Import
Add to your AI dashboard module:
```typescript
import { AIInstrumentationModule } from './ai-instrumentation.module';

@NgModule({
  imports: [
    // ... existing imports
    AIInstrumentationModule
  ]
})
```

### 3. Component Integration
Replace the existing monitoring component:
```html
<div class="tab-content" *ngIf="activeTab === 'monitor'">
  <app-execution-monitoring></app-execution-monitoring>
</div>
```

## 📱 Responsive Design

The dashboard is fully responsive with:
- **Desktop**: 12-column grid layout with optimal space utilization
- **Tablet**: 8-column adaptive layout with reorganized sections
- **Mobile**: Single-column stack with touch-optimized interactions

## ⚡ Performance Optimizations

### Data Loading
- **Parallel Queries**: Simultaneous loading of different data types
- **Server-side Filtering**: Efficient date range and entity filtering
- **Pagination**: Automatic handling of large datasets
- **Caching**: Observable caching with `shareReplay` for efficiency

### Rendering
- **Virtual Scrolling**: Efficient handling of large execution lists
- **Animation Throttling**: Smooth animations without performance impact
- **Lazy Loading**: Components load data only when visible
- **Memory Management**: Automatic subscription cleanup

### Real-time Updates
- **Configurable Intervals**: Adjustable refresh rates based on system load
- **Smart Debouncing**: Prevents excessive API calls
- **Error Recovery**: Automatic retry logic for failed requests

## 🎨 Customization

### Theme Configuration
Override default colors:
```scss
:root {
  --ai-primary-color: #2196f3;
  --ai-success-color: #4caf50;
  --ai-warning-color: #ff9800;
  --ai-danger-color: #f44336;
}
```

### Chart Configuration
Customize chart appearance:
```typescript
const chartConfig = {
  height: 400,
  margin: { top: 20, right: 30, bottom: 40, left: 60 },
  colors: ['#2196f3', '#4caf50', '#ff9800'],
  animationDuration: 500,
  showGrid: true,
  showTooltip: true
};
```

### Refresh Intervals
Configure update frequencies:
```typescript
enum RefreshInterval {
  MANUAL = 0,
  FAST = 10000,     // 10 seconds
  NORMAL = 30000,   // 30 seconds
  SLOW = 300000     // 5 minutes
}
```

## 📈 Usage Examples

### Basic Implementation
```html
<!-- Full dashboard -->
<app-execution-monitoring></app-execution-monitoring>

<!-- Individual components -->
<app-kpi-card [data]="kpiData"></app-kpi-card>
<app-time-series-chart [data]="trends" title="Custom Metrics"></app-time-series-chart>
<app-performance-heatmap [data]="performance"></app-performance-heatmap>
```

### Service Usage
```typescript
import { AIInstrumentationService } from './services/ai-instrumentation.service';

constructor(private instrumentation: AIInstrumentationService) {
  // Subscribe to real-time KPIs
  this.instrumentation.kpis$.subscribe(kpis => {
    console.log('Current metrics:', kpis);
  });
  
  // Configure refresh rate
  this.instrumentation.setRefreshInterval(30000);
  
  // Set custom date range
  const start = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const end = new Date();
  this.instrumentation.setDateRange(start, end);
}
```

## 🔍 Data Sources

### Primary Entities
- **AIPromptRun**: Individual prompt execution records
- **AIAgentRun**: Agent execution sessions
- **AIAgentRunStep**: Detailed step-by-step execution tracking
- **AIModel**: Model information and capabilities
- **AIAgent**: Agent definitions and configurations
- **AIPrompt**: Prompt templates and metadata

### Key Metrics Calculated
- **Performance Score**: Composite metric combining speed and success rate
- **Cost Efficiency**: Cost per token and model comparison
- **Token Ratios**: Input vs output token analysis
- **Success Rates**: Execution success percentages
- **Response Times**: Average execution durations
- **Error Patterns**: Failure analysis and trending

## 🚨 Monitoring Capabilities

### Real-time Alerts
- Active execution count monitoring
- Cost burn rate tracking
- Error rate threshold detection
- Performance degradation alerts

### Historical Analysis
- Trend identification over time
- Performance regression detection
- Cost optimization opportunities
- Usage pattern analysis

### Operational Insights
- Model performance comparison
- Agent efficiency tracking
- Resource utilization optimization
- Capacity planning metrics

## 🔧 Troubleshooting

### Common Issues

**No Data Appearing**
- Verify AIPromptRun/AIAgentRun entities contain data
- Check date range includes recent executions
- Review browser console for loading errors

**Charts Not Rendering**
- Ensure D3.js is properly imported
- Check TypeScript compilation errors
- Verify chart containers have dimensions

**Performance Issues**
- Reduce refresh interval for large datasets
- Implement server-side filtering
- Consider data pagination for historical views

### Debug Mode
Enable detailed logging:
```typescript
// Add to service constructor
this.kpis$.subscribe(data => console.log('KPIs:', data));
this.trends$.subscribe(data => console.log('Trends:', data));
```

## 🚀 Future Enhancements

### Planned Features
- **WebSocket Integration**: Real-time streaming for active executions
- **Advanced Filtering**: Multi-dimensional data slicing
- **Export Functionality**: PDF/CSV report generation
- **Alert System**: Configurable thresholds and notifications
- **Predictive Analytics**: Cost and performance forecasting
- **A/B Testing**: Comparative prompt and model analysis

### Extension Points
- **Custom Widgets**: Plugin architecture for new metrics
- **Additional Charts**: More D3.js visualization types
- **External Integrations**: Third-party monitoring systems
- **Notification Channels**: Slack, email, webhook support

## 📝 API Reference

### AIInstrumentationService Methods

```typescript
// Data stream access
kpis$: Observable<DashboardKPIs>
trends$: Observable<TrendData[]>
liveExecutions$: Observable<LiveExecution[]>
chartData$: Observable<ChartData>

// Configuration
setRefreshInterval(intervalMs: number): void
setDateRange(start: Date, end: Date): void

// Data loading
getExecutionDetails(id: string, type: 'prompt' | 'agent'): Promise<ExecutionDetails>
```

### Component Inputs

```typescript
// KPICardComponent
@Input() data: KPICardData

// TimeSeriesChartComponent
@Input() data: TrendData[]
@Input() title?: string
@Input() config?: TimeSeriesConfig

// PerformanceHeatmapComponent
@Input() data: HeatmapData[]
@Input() config?: HeatmapConfig
```

## 🤝 Contributing

This dashboard follows MemberJunction's development patterns:
- Use proper MJ entity loading with RunView
- Follow existing TypeScript and Angular conventions
- Maintain responsive design principles
- Include comprehensive error handling
- Document any new features or modifications

## 📄 License

This AI Instrumentation Dashboard is part of the MemberJunction framework and follows the same licensing terms.