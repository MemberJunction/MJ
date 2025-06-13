# AI Instrumentation Dashboard Integration Guide

## Overview

This comprehensive AI instrumentation dashboard provides real-time monitoring, analytics, and detailed insights into AI execution performance. It leverages the existing AIPromptRun and AIAgentRun data to create a world-class operations dashboard.

## What's Included

### 🚀 **Core Components Built**

1. **AIInstrumentationService** - Reactive data access layer with real-time streams
2. **ExecutionMonitoringComponent** - Main dashboard with 6 sections
3. **KPICardComponent** - Reusable metric display cards  
4. **LiveExecutionWidgetComponent** - Real-time execution tracking
5. **TimeSeriesChartComponent** - D3.js powered trend visualization
6. **PerformanceHeatmapComponent** - Agent vs Model performance matrix

### 📊 **Dashboard Features**

- **Real-time KPI Cards**: Total executions, costs, success rates, token usage
- **Live Execution Monitoring**: Active processes with progress indicators
- **Interactive Time Series**: Execution trends with zoom/pan capabilities
- **Performance Heatmap**: Agent-Model performance comparison matrix
- **Cost Analysis**: Model cost breakdown with visual bars
- **Token Efficiency**: Input/output ratio analysis
- **System Health**: Success rates, error tracking, response times
- **Detailed Drill-down**: Modal views with hierarchical execution details

## Integration Steps

### 1. Update AI Dashboard Module

Add the new instrumentation module to your AI dashboard:

```typescript
// In packages/Angular/Explorer/dashboards/src/AI/ai-dashboard.module.ts
import { AIInstrumentationModule } from './ai-instrumentation.module';

@NgModule({
  imports: [
    // ... existing imports
    AIInstrumentationModule
  ],
  // ... rest of module
})
```

### 2. Replace ExecutionMonitoringComponent

Update the AI dashboard component to use the new monitoring:

```typescript
// In packages/Angular/Explorer/dashboards/src/AI/ai-dashboard.component.ts

// Replace the existing placeholder with:
import { ExecutionMonitoringComponent } from './components/execution-monitoring.component';

// In the template, replace the Monitor tab content:
<div class="tab-content" *ngIf="activeTab === 'monitor'">
  <app-execution-monitoring></app-execution-monitoring>
</div>
```

### 3. Add Required Dependencies

Ensure these are in your package.json:

```json
{
  "dependencies": {
    "d3": "^7.8.5",
    "@types/d3": "^7.4.0",
    "rxjs": "^7.5.0"
  }
}
```

### 4. Import D3 Styles (Optional)

If you want additional D3 styling, add to your global styles:

```scss
// In styles.scss
@import '~d3/dist/d3.min.css'; // If available
```

## Usage Examples

### Basic Integration

```html
<!-- Standalone usage -->
<app-execution-monitoring></app-execution-monitoring>

<!-- With custom refresh interval -->
<app-execution-monitoring 
  [refreshInterval]="60000"
  [selectedTimeRange]="'6h'">
</app-execution-monitoring>
```

### Individual Components

```html
<!-- Use KPI cards elsewhere -->
<app-kpi-card [data]="kpiData"></app-kpi-card>

<!-- Use charts in other dashboards -->
<app-time-series-chart 
  [data]="trendData" 
  title="Custom Metrics"
  [config]="chartConfig">
</app-time-series-chart>

<!-- Use performance heatmap -->
<app-performance-heatmap 
  [data]="performanceData"
  title="Model Comparison">
</app-performance-heatmap>
```

### Service Usage

```typescript
import { AIInstrumentationService } from './services/ai-instrumentation.service';

constructor(private instrumentation: AIInstrumentationService) {
  // Access real-time data streams
  this.instrumentation.kpis$.subscribe(kpis => {
    console.log('Current KPIs:', kpis);
  });
  
  // Configure refresh rate
  this.instrumentation.setRefreshInterval(30000); // 30 seconds
  
  // Set custom date range
  const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
  const end = new Date();
  this.instrumentation.setDateRange(start, end);
}
```

## Key Features Explained

### 🔄 **Real-time Data Streaming**

- Uses RxJS observables for reactive data updates
- Configurable refresh intervals (10s to 5m)
- Efficient data loading with RunView pattern
- Automatic error handling and retry logic

### 📈 **Advanced Visualizations**

- **D3.js Integration**: Professional-grade charts with animations
- **Interactive Elements**: Hover tooltips, zoom/pan, clickable elements
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Performance Optimized**: Efficient rendering with data throttling

### 🎯 **Smart Analytics**

- **Performance Scoring**: Composite metrics combining speed and success
- **Cost Intelligence**: Multi-currency support, burn rate analysis
- **Token Efficiency**: Input/output ratio tracking
- **Hierarchical Tracking**: Parent-child execution relationships

### 🔍 **Detailed Drill-down**

- **Execution Details**: Full context including child processes
- **Error Analysis**: Detailed error messages and stack traces
- **Resource Tracking**: Cost and token usage by execution
- **Timeline Visualization**: Start/end times with duration calculations

## Performance Considerations

### Data Loading Optimization

- **Parallel Queries**: Simultaneous data loading for different time periods
- **Efficient Filtering**: Server-side filtering with proper indexes
- **Pagination**: Automatic handling of large datasets
- **Caching Strategy**: Built-in observable caching with shareReplay

### Memory Management

- **Subscription Cleanup**: Automatic unsubscription on component destroy
- **Data Throttling**: Configurable refresh rates to prevent overload
- **Efficient Rendering**: Virtual scrolling for large lists
- **Lazy Loading**: Components load data only when visible

## Customization Options

### Theming

```scss
// Override default colors
:root {
  --ai-primary-color: #your-primary-color;
  --ai-success-color: #your-success-color;
  --ai-warning-color: #your-warning-color;
  --ai-danger-color: #your-danger-color;
}
```

### Chart Configuration

```typescript
const customChartConfig = {
  height: 400,
  margin: { top: 20, right: 30, bottom: 40, left: 60 },
  colors: ['#custom1', '#custom2', '#custom3'],
  animationDuration: 750,
  showGrid: true,
  showTooltip: true
};
```

### Data Refresh Settings

```typescript
// Custom refresh intervals
enum RefreshInterval {
  MANUAL = 0,
  FAST = 5000,      // 5 seconds
  NORMAL = 30000,   // 30 seconds  
  SLOW = 300000     // 5 minutes
}
```

## Troubleshooting

### Common Issues

1. **No Data Appearing**
   - Check that AIPromptRun and AIAgentRun entities have data
   - Verify date range includes recent executions
   - Check browser console for data loading errors

2. **Charts Not Rendering**
   - Ensure D3.js is properly imported
   - Check for TypeScript compilation errors
   - Verify chart container has proper dimensions

3. **Performance Issues**
   - Reduce refresh interval for large datasets
   - Implement server-side filtering for date ranges
   - Consider data pagination for historical views

### Debug Mode

Enable detailed logging:

```typescript
// In AIInstrumentationService
constructor() {
  // Add debug logging
  this.kpis$.subscribe(data => console.log('KPIs:', data));
  this.trends$.subscribe(data => console.log('Trends:', data));
}
```

## Future Enhancements

### Planned Features

- **Real-time WebSocket Support**: Live streaming for active executions
- **Advanced Filtering**: Multi-dimensional data slicing
- **Export Functionality**: PDF/CSV report generation
- **Alerting System**: Configurable thresholds and notifications
- **Comparative Analysis**: A/B testing for prompts and models
- **Predictive Analytics**: Cost and performance forecasting

### Extension Points

- **Custom Widgets**: Plugin architecture for new KPI cards
- **Custom Charts**: Additional D3.js visualization types
- **Data Sources**: Integration with external monitoring systems
- **Notification Channels**: Slack, email, webhooks integration

## Support

For questions or issues:
1. Check the browser console for errors
2. Verify all dependencies are installed
3. Ensure proper MJ entity loading patterns are followed
4. Review the integration steps above

This dashboard provides a comprehensive foundation for AI operations monitoring and can be extended to meet specific organizational needs.