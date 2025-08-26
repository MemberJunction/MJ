# Ideas for Reusable Components

Based on analysis of 86 components in the MemberJunction metadata/components directory, these are opportunities for creating reusable, generalized components following the pattern established by AIInsightsPanel.

## 📊 1. DataExportPanel Component
**Pattern Found:** 7+ components implement export functionality  
**Current Implementation:** Each component has custom export logic for CSV/Excel  
**Opportunity:** Create a unified export component with:
- Multiple format support (CSV, Excel, JSON, PDF)
- Column selection/customization
- Filtering before export
- Progress indication for large datasets
- Consistent button styling and icons

**Affected Components:** financial-analytics-dashboard, invoice-status-dashboard, sales-pipeline-dashboard, product-revenue-matrix, and others

## 📅 2. DateRangeSelector Component
**Pattern Found:** 39+ components have date/time filtering  
**Current Implementation:** Repetitive select dropdowns and date pickers  
**Opportunity:** Standardized date range component with:
- Preset options (Last Month, Quarter, Year, All Time)
- Custom date range with date pickers
- Relative date options (Last 7/30/90 days)
- Saved date range preferences
- Consistent styling and behavior

**Benefits:** Reduce ~50-100 lines of code per component

## 💰 3. CurrencyFormatter Utility/Component
**Pattern Found:** 20+ components define `formatCurrency` function  
**Current Implementation:** Same function copy-pasted in each component  
**Opportunity:** Create a utility service or formatting component:
```javascript
// Formats: $1.2M, $450K, $12,345.67
// Supports: abbreviations, decimals, currency symbols
// Handles: negative values, null/undefined
```
**Impact:** Remove duplicate code from 20+ components

## 🔍 4. DrillDownPanel Component
**Pattern Found:** 14+ components have drill-down/detail panel functionality  
**Current Implementation:** Custom panels with similar slide-in behavior  
**Opportunity:** Reusable drill-down panel with:
- Slide-in/modal animation options
- Header with title and close button
- Content scrolling
- Breadcrumb navigation
- Consistent width and positioning

**Examples:** sales-pipeline-dashboard-drill-down-panel, product-revenue-detail-panel, deal-velocity-deal-detail

## 📈 5. MetricsCard Component
**Pattern Found:** Many dashboards show KPI cards with similar structure  
**Current Implementation:** Repetitive card layouts  
**Opportunity:** Standardized metrics card with:
- Title, value, and change indicator
- Icon support
- Sparkline/mini-chart option
- Click-to-drill-down capability
- Comparison values (vs last period)
- Loading skeleton state

**Usage:** Dashboard summary cards across all analytics components

## ⚠️ 6. ErrorBoundary Component
**Pattern Found:** 25+ components have error handling  
**Current Implementation:** Basic try-catch with custom error displays  
**Opportunity:** Comprehensive error boundary with:
- Fallback UI
- Error reporting/logging
- Retry mechanism
- User-friendly error messages
- Debug mode with stack traces

## ⏳ 7. LoadingStateManager Component
**Pattern Found:** 18+ components implement loading states  
**Current Implementation:** Various loading indicators  
**Opportunity:** Unified loading component with:
- Skeleton screens
- Spinner options
- Progress bars for long operations
- Shimmer effects
- Content placeholders matching actual layout

## 📊 8. ChartWrapper Component
**Pattern Found:** 36+ components use charting libraries  
**Current Implementation:** Direct ApexCharts/D3 usage with cleanup  
**Opportunity:** Chart wrapper providing:
- Automatic cleanup on unmount
- Responsive sizing
- Theme consistency
- Export chart as image
- Loading/error states
- Chart type switching

**Benefits:** Prevent memory leaks, ensure consistent styling

## 🎨 9. CardContainer Component
**Pattern Found:** Repetitive card styling across components  
**Current Implementation:** Same style objects repeated
```javascript
style={{ 
  backgroundColor: 'white', 
  padding: '20px', 
  borderRadius: '8px', 
  border: '1px solid #E5E7EB' 
}}
```
**Opportunity:** Reusable card container with variants:
- Default, elevated, bordered, colored
- Consistent spacing and shadows
- Header/footer slots
- Collapsible option

## 📱 10. ResponsiveGrid Component
**Pattern Found:** Grid layouts with similar breakpoints  
**Current Implementation:** Inline grid styles repeated  
**Opportunity:** Responsive grid system with:
- Predefined breakpoints
- Column span options
- Gap standardization
- Auto-fit capabilities

## 🔗 11. EntityLink Component
**Pattern Found:** 26+ components call OpenEntityRecord  
**Current Implementation:** Custom buttons/links  
**Opportunity:** Standardized entity link with:
- Consistent link/button styling
- Icon support
- Tooltip with entity preview
- Permission checking
- Batch operations support

## 📋 12. DataTable Component
**Pattern Found:** Multiple list/table components  
**Current Implementation:** Custom table implementations  
**Opportunity:** Feature-rich data table with:
- Sorting
- Filtering
- Pagination
- Column resizing
- Row selection
- Inline editing
- Export capability

## 💡 Estimated Impact
- **Code Reduction:** ~30-40% across all components
- **Consistency:** Unified UX across all dashboards
- **Maintenance:** Single source of truth for common functionality
- **Performance:** Optimized, tested implementations
- **Developer Experience:** Faster component development

## 🎯 Priority Recommendations
1. **High Priority:** DateRangeSelector, CurrencyFormatter, MetricsCard, DataExportPanel
2. **Medium Priority:** DrillDownPanel, ChartWrapper, ErrorBoundary
3. **Low Priority:** Others (implement as needed)

## Implementation Notes
These generalizations should follow the same pattern as AIInsightsPanel:
- Registered in the component registry
- Available to all components via the `components` prop
- Support for customization via props
- Consistent with MemberJunction design patterns
- Include proper TypeScript types (no `any`)